import os
import logging
import urllib.parse
import requests

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from openai import RateLimitError
from enum import Enum
from supabase import create_client
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field
from enum import Enum
from fastapi import Header, HTTPException
from fastapi import Depends
from collections import defaultdict
import time

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# .env 読み込み
load_dotenv()

# OpenAI Client
client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)

# Supabase Client
# データ操作用（service_role key、RLSバイパス）
supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY")
)

# 認証検証用（anon key）
supabase_auth = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_ANON_KEY")
)

# FastAPI
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# レートリミット設定
FREE_DAILY_LIMIT = 1
PREMIUM_DAILY_LIMIT = int(os.getenv("DAILY_RATE_LIMIT", "20"))

# インメモリレートリミッター
rate_limit_store: dict[str, list[float]] = defaultdict(list)

def check_rate_limit(user_id: str, plan: str = "free"):
    """ユーザーのプランに応じた1日あたりのリクエスト数を制限する"""
    limit = PREMIUM_DAILY_LIMIT if plan == "premium" else FREE_DAILY_LIMIT
    now = time.time()
    one_day_ago = now - 86400

    rate_limit_store[user_id] = [
        t for t in rate_limit_store[user_id]
        if t > one_day_ago
    ]

    if len(rate_limit_store[user_id]) >= limit:
        if plan == "free":
            raise HTTPException(
                status_code=429,
                detail="無料プランの1日の利用上限（1回）に達しました。プレミアムプランにアップグレードすると1日20回まで利用できます。"
            )
        else:
            raise HTTPException(
                status_code=429,
                detail=f"1日の利用上限（{limit}回）に達しました。24時間後に再度お試しください。"
            )

    rate_limit_store[user_id].append(now)


def get_user_plan(user_id: str) -> str:
    """ユーザーのプランを取得する"""
    try:
        response = (
            supabase
            .table("user_profiles")
            .select("plan")
            .eq("user_id", user_id)
            .execute()
        )
        if response.data:
            return response.data[0].get("plan", "free")
    except Exception as e:
        logger.warning("プラン取得エラー: %s", e)
    return "free"

def search_youtube_videos(keyword: str, max_results: int = 3) -> list[dict]:
    """YouTube Data APIで動画を検索し、タイトル・サムネイル・URLを返す"""
    api_key = os.getenv("YOUTUBE_API_KEY")
    if not api_key:
        logger.warning("YOUTUBE_API_KEY が設定されていません")
        return []

    try:
        response = requests.get(
            "https://www.googleapis.com/youtube/v3/search",
            params={
                "part": "snippet",
                "q": keyword,
                "type": "video",
                "maxResults": max_results,
                "key": api_key,
                "relevanceLanguage": "ja",
            },
            timeout=10,
        )

        if response.status_code != 200:
            logger.error("YouTube API Error: status=%s", response.status_code)
            return []

        data = response.json()
        videos = []
        for item in data.get("items", []):
            video_id = item["id"]["videoId"]
            snippet = item["snippet"]
            videos.append({
                "title": snippet["title"],
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "thumbnail": snippet["thumbnails"]["medium"]["url"],
            })

        return videos

    except Exception as e:
        logger.error("YouTube API Error: %s", e)
        return []


def get_weather_info(prefecture: str, city: str) -> Optional[dict]:
    """OpenWeatherMap APIで天気情報を取得する"""
    api_key = os.getenv("OPENWEATHER_API_KEY")
    if not api_key or api_key == "your_openweather_api_key_here":
        logger.warning("OPENWEATHER_API_KEY が設定されていません")
        return None

    location = f"{city},{prefecture},JP"

    try:
        # ジオコーディング（住所→緯度経度）
        geo_response = requests.get(
            "http://api.openweathermap.org/geo/1.0/direct",
            params={
                "q": location,
                "limit": 1,
                "appid": api_key,
            },
            timeout=10,
        )

        if geo_response.status_code != 200 or not geo_response.json():
            geo_response = requests.get(
                "http://api.openweathermap.org/geo/1.0/direct",
                params={
                    "q": f"{prefecture},JP",
                    "limit": 1,
                    "appid": api_key,
                },
                timeout=10,
            )

        geo_data = geo_response.json()
        if not geo_data:
            logger.warning("ジオコーディング失敗: %s", location)
            return None

        lat = geo_data[0]["lat"]
        lon = geo_data[0]["lon"]

        # 現在の天気情報を取得
        weather_response = requests.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={
                "lat": lat,
                "lon": lon,
                "appid": api_key,
                "units": "metric",
                "lang": "ja",
            },
            timeout=10,
        )

        if weather_response.status_code != 200:
            logger.error("Weather API Error: status=%s", weather_response.status_code)
            return None

        weather_data = weather_response.json()

        # 気象警報（台風など）を取得
        alerts = []
        try:
            alert_response = requests.get(
                "https://api.openweathermap.org/data/3.0/onecall",
                params={
                    "lat": lat,
                    "lon": lon,
                    "appid": api_key,
                    "exclude": "minutely,hourly,daily",
                    "lang": "ja",
                },
                timeout=10,
            )
            if alert_response.status_code == 200:
                alert_data = alert_response.json()
                alerts = [
                    {"event": a.get("event", ""), "description": a.get("description", "")}
                    for a in alert_data.get("alerts", [])
                ]
        except Exception:
            pass

        result = {
            "weather": weather_data["weather"][0]["description"],
            "temperature": weather_data["main"]["temp"],
            "humidity": weather_data["main"]["humidity"],
            "pressure": weather_data["main"]["pressure"],
            "wind_speed": weather_data["wind"]["speed"],
            "feels_like": weather_data["main"]["feels_like"],
            "alerts": alerts,
            "location": f"{prefecture}{city}",
        }

        return result

    except Exception as e:
        logger.error("Weather API Error: %s", e)
        return None


# Request
class ProfileRequest(BaseModel):
    prefecture: str = Field(..., min_length=2, max_length=10)
    city: str = Field(..., min_length=1, max_length=50)

class ProfileResponse(BaseModel):
    id: int
    user_id: str
    prefecture: str
    city: str
    plan: str = "free"

class WeatherResponse(BaseModel):
    weather: str
    temperature: float
    humidity: int
    pressure: int
    wind_speed: float
    feels_like: float
    alerts: list[dict]
    location: str

class SymptomRequest(BaseModel):
    symptom: str = Field(..., min_length=1, max_length=500)

class QuestionAnswer(BaseModel):
    question: str = Field(..., min_length=1, max_length=300)
    answer: str = Field(..., min_length=1, max_length=1000)

class AnalyzeRequest(BaseModel):
    symptom: str = Field(..., min_length=1, max_length=500)
    answers: list[QuestionAnswer] = Field(..., min_length=1, max_length=10)

class QuestionResult(BaseModel):
    questions: list[str] = Field(..., min_length=3, max_length=3)

class WarningLevel(str, Enum):
    LOW = "低"
    MEDIUM = "中"
    HIGH = "高"
    EMERGENCY = "緊急"

class Department(str, Enum):
    INTERNAL = "内科"
    ORTHOPEDICS = "整形外科"
    NEUROLOGY = "神経内科"
    ENT = "耳鼻咽喉科"
    DERMATOLOGY = "皮膚科"
    GASTROENTEROLOGY = "消化器内科"
    RESPIRATORY = "呼吸器内科"
    EMERGENCY = "救急科"
    OTHER = "その他"

class AnalysisResult(BaseModel):
    summary: str
    causes: list[str]
    care: list[str]
    warning_level: WarningLevel
    emergency_action: str
    recommended_department: Department
    red_flags: list[str]
    youtube_search_keyword: str
    disclaimer: str

class HistoryResponse(BaseModel):
    id: int
    symptom: str
    summary: str
    causes: list[str]
    care: list[str]
    warning_level: str
    emergency_action: str
    recommended_department: Department
    red_flags: list[str]
    created_at: datetime

class YouTubeVideo(BaseModel):
    title: str
    url: str
    thumbnail: str

class AnalysisResponse(BaseModel):
    summary: str
    causes: list[str]
    care: list[str]
    warning_level: WarningLevel
    emergency_action: str
    recommended_department: Department
    red_flags: list[str]
    youtube_search_keyword: str
    youtube_url: str
    youtube_videos: list[YouTubeVideo]
    disclaimer: str

@app.get("/")
def root():
    return {
        "message": "Health App API Running"
    }

def get_current_user(
    authorization: str = Header(...)
):

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="認証エラー"
        )

    token = authorization.replace(
        "Bearer ",
        ""
    )

    try:

        user = supabase_auth.auth.get_user(token)

        return user.user

    except Exception:

        raise HTTPException(
            status_code=401,
            detail="ログインしてください"
        )

@app.get(
    "/history",
    response_model=list[HistoryResponse]
)
def get_history(user=Depends(get_current_user)):
    plan = get_user_plan(user.id)
    if plan != "premium":
        raise HTTPException(
            status_code=403,
            detail="履歴機能はプレミアムプランの機能です。"
        )

    try:

        response = (
            supabase
            .table("symptom_history")
            .select("*")
            .eq("user_id", user.id)
            .order(
                "created_at",
                desc=True
            )
            .execute()
        )

        return response.data

    except Exception as e:

        logger.error("History Error: %s", e)

        raise HTTPException(
            status_code=500,
            detail="履歴取得に失敗しました"
        )

@app.delete("/history/{history_id}")
def delete_history(history_id: int,user=Depends(get_current_user)):

    response = (
        supabase
        .table("symptom_history")
        .delete()
        .eq("id", history_id)
        .eq("user_id", user.id)
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=404,
            detail="履歴が見つかりません"
        )

    return {
        "message": "削除しました"
    }

# プロフィール取得
@app.get("/profile", response_model=Optional[ProfileResponse])
def get_profile(user=Depends(get_current_user)):
    try:
        response = (
            supabase
            .table("user_profiles")
            .select("*")
            .eq("user_id", user.id)
            .execute()
        )

        if response.data:
            return response.data[0]
        return None

    except Exception as e:
        logger.error("Profile Error: %s", e)
        raise HTTPException(
            status_code=500,
            detail="プロフィール取得に失敗しました"
        )

# プロフィール登録/更新（プレミアムプラン限定）
@app.post("/profile", response_model=ProfileResponse)
def upsert_profile(req: ProfileRequest, user=Depends(get_current_user)):
    plan = get_user_plan(user.id)
    if plan != "premium":
        raise HTTPException(
            status_code=403,
            detail="住所登録はプレミアムプランの機能です。"
        )

    try:
        # 既存プロフィールを確認
        existing = (
            supabase
            .table("user_profiles")
            .select("*")
            .eq("user_id", user.id)
            .execute()
        )

        if existing.data:
            # 更新
            response = (
                supabase
                .table("user_profiles")
                .update({
                    "prefecture": req.prefecture,
                    "city": req.city,
                })
                .eq("user_id", user.id)
                .execute()
            )
        else:
            # 新規作成
            response = (
                supabase
                .table("user_profiles")
                .insert({
                    "user_id": user.id,
                    "prefecture": req.prefecture,
                    "city": req.city,
                })
                .execute()
            )

        return response.data[0]

    except Exception as e:
        logger.error("Profile Upsert Error: %s", e)
        raise HTTPException(
            status_code=500,
            detail="プロフィール保存に失敗しました"
        )

# 天気情報取得（プレミアムプラン限定）
@app.get("/weather")
def get_weather(user=Depends(get_current_user)):
    plan = get_user_plan(user.id)
    if plan != "premium":
        raise HTTPException(
            status_code=403,
            detail="天気情報の取得はプレミアムプランの機能です。"
        )

    try:
        # ユーザーのプロフィールを取得
        profile_response = (
            supabase
            .table("user_profiles")
            .select("*")
            .eq("user_id", user.id)
            .execute()
        )

        if not profile_response.data:
            raise HTTPException(
                status_code=404,
                detail="プロフィールが登録されていません。住所を登録してください。"
            )

        profile = profile_response.data[0]
        weather = get_weather_info(profile["prefecture"], profile["city"])

        if not weather:
            raise HTTPException(
                status_code=503,
                detail="天気情報の取得に失敗しました"
            )

        return weather

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Weather Endpoint Error: %s", e)
        raise HTTPException(
            status_code=500,
            detail="天気情報の取得に失敗しました"
        )

# 問診生成
@app.post("/questions")
def create_questions(req: SymptomRequest,user=Depends(get_current_user)):

    if not req.symptom.strip():
        raise HTTPException(
            status_code=400,
            detail="症状を入力してください"
        )

    plan = get_user_plan(user.id)
    check_rate_limit(user.id, plan)

    logger.info("問診リクエスト受信: user=%s, plan=%s", user.id, plan)

    try:

        response = client.responses.parse(
            model="gpt-4.1-mini",
            input=[
                {
                    "role": "system",
                    "content": """
                    あなたは健康相談の問診担当です。

                    入力された症状について、
                    状況を詳しく把握するための質問を
                    3個作成してください。

                    質問のみ返してください。
                    """
                },
                {
                    "role": "user",
                    "content": req.symptom
                }
            ],
            text_format=QuestionResult
        )

        result = response.output_parsed

    except Exception as e:

        logger.error("OpenAI Error: %s", e)

        raise HTTPException(
            status_code=500,
            detail="問診生成に失敗しました"
        )

    logger.info("問診生成完了: user=%s", user.id)

    return result

@app.post("/analyze",response_model=AnalysisResponse)
def analyze(req: AnalyzeRequest,user=Depends(get_current_user)):

    if not req.symptom.strip():
        raise HTTPException(
            status_code=400,
            detail="症状を入力してください"
        )

    if not req.answers:
        raise HTTPException(
            status_code=400,
            detail="問診回答がありません"
        )

    if any(
        not qa.answer.strip()
        for qa in req.answers
    ):
        raise HTTPException(
            status_code=400,
            detail="すべての問診に回答してください"
        )

    check_rate_limit(user.id, get_user_plan(user.id))

    plan = get_user_plan(user.id)

    answer_text = "\n".join(
        f"{qa.question}: {qa.answer}"
        for qa in req.answers
    )

    logger.info("分析リクエスト受信: user=%s, plan=%s", user.id, plan)

    # プレミアムプランのみ天気情報を取得
    weather_context = ""
    if plan == "premium":
        try:
            profile_response = (
                supabase
                .table("user_profiles")
                .select("*")
                .eq("user_id", user.id)
                .execute()
            )

            if profile_response.data:
                profile = profile_response.data[0]
                weather = get_weather_info(profile["prefecture"], profile["city"])
                if weather:
                    weather_context = f"""
    現在の気象情報（{weather['location']}）:
    - 天候: {weather['weather']}
    - 気温: {weather['temperature']}℃（体感: {weather['feels_like']}℃）
    - 湿度: {weather['humidity']}%
    - 気圧: {weather['pressure']}hPa
    - 風速: {weather['wind_speed']}m/s"""

                    if weather.get("alerts"):
                        alert_texts = [a["event"] for a in weather["alerts"]]
                        weather_context += f"\n    - 気象警報: {', '.join(alert_texts)}"

        except Exception as e:
            logger.warning("天気情報取得スキップ: %s", e)

    user_input = f"""
    症状:
    {req.symptom}

    問診結果:
    {answer_text}
    {weather_context}
    """

    # プランに応じたシステムプロンプト
    if plan == "premium":
        system_prompt = """
                    あなたは健康相談アシスタントです。

                    医療診断は行わないでください。

                    症状を分析し、
                    指定されたスキーマに従って回答してください。

                    気象情報が提供されている場合は、
                    気圧の変化、台風の接近、気温差、湿度など
                    気象条件が症状に影響している可能性も
                    分析に含めてください。

                    例：
                    - 低気圧や台風接近時の頭痛は「気象病」の可能性
                    - 高温多湿による倦怠感や熱中症リスク
                    - 寒暖差による自律神経の乱れ
                    - 乾燥による喉や肌の不調

                    warning_level は必ず

                    - 低
                    - 中
                    - 高
                    - 緊急

                    のいずれかです。

                    recommended_department は
                    以下のような診療科を返してください。

                    - 内科
                    - 整形外科
                    - 神経内科
                    - 耳鼻咽喉科
                    - 皮膚科
                    - 消化器内科
                    - 呼吸器内科

                    red_flags には
                    危険な兆候を配列で返してください。

                    youtube_search_keyword は
                    症状改善に役立つ検索キーワードを
                    20文字以内で返してください。
                    """
    else:
        system_prompt = """
                    あなたは健康相談アシスタントです。

                    医療診断は行わないでください。

                    症状を簡潔に分析し、
                    指定されたスキーマに従って回答してください。

                    簡易診断のため、要約と原因候補と推奨診療科を
                    重点的に回答してください。

                    warning_level は必ず

                    - 低
                    - 中
                    - 高
                    - 緊急

                    のいずれかです。

                    recommended_department は
                    以下のような診療科を返してください。

                    - 内科
                    - 整形外科
                    - 神経内科
                    - 耳鼻咽喉科
                    - 皮膚科
                    - 消化器内科
                    - 呼吸器内科

                    red_flags には
                    危険な兆候を配列で返してください。

                    youtube_search_keyword は
                    症状改善に役立つ検索キーワードを
                    20文字以内で返してください。
                    """

    # OpenAI呼び出し
    try:
        response = client.responses.parse(
            model="gpt-4.1-mini",
            input=[
                {
                    "role": "system",
                    "content": system_prompt
                },
                {
                    "role": "user",
                    "content": user_input
                }
            ],
            text_format=AnalysisResult
        )

        result = response.output_parsed
    
    except RateLimitError:

        raise HTTPException(
            status_code=429,
            detail="AI利用回数の上限に達しました。しばらくしてから再度お試しください。"
        )
        
    except Exception as e:

        logger.error("OpenAI Error: %s", e)

        raise HTTPException(
            status_code=500,
            detail="AI分析に失敗しました"
        )

    logger.info("分析完了: user=%s, plan=%s", user.id, plan)
    
    # プレミアムプランのみ履歴保存
    if plan == "premium":
        try:
            supabase.table("symptom_history").insert({
                "user_id": user.id,
                "symptom": req.symptom,
                "summary": result.summary,
                "causes": result.causes,
                "care": result.care,
                "warning_level": result.warning_level.value,
                "emergency_action":result.emergency_action,
                "recommended_department":result.recommended_department,
                "red_flags":result.red_flags
                }).execute()
        
        except Exception as e:
            logger.error("Supabase Error: %s", e)

    youtube_url = (
        "https://www.youtube.com/results?search_query="
        + urllib.parse.quote(
            result.youtube_search_keyword
        )
    )

    # プレミアムプランのみYouTube動画を検索
    youtube_videos = []
    if plan == "premium":
        youtube_videos = search_youtube_videos(result.youtube_search_keyword)

    return {
        "summary": result.summary,
        "causes": result.causes,
        "care": result.care,
        "warning_level": result.warning_level,
        "emergency_action":result.emergency_action,
        "recommended_department":result.recommended_department,
        "red_flags":result.red_flags,
        "youtube_search_keyword":result.youtube_search_keyword,
        "youtube_url": youtube_url,
        "youtube_videos": youtube_videos,
        "disclaimer": "本サービスはAIによる一般的な健康情報の提供を目的としており、医療診断や治療の代替ではありません。症状が続く場合や不安がある場合は、必ず医療機関を受診してください。"
    }
