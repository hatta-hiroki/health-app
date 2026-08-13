'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

type QuestionAnswer = {
  question: string
  answer: string
}

type WarningLevel =
  | '低'
  | '中'
  | '高'
  | '緊急'

type YouTubeVideo = {
  title: string
  url: string
  thumbnail: string
}

type ResultType = {
  summary: string
  causes: string[]
  care: string[]
  warning_level: WarningLevel
  emergency_action: string
  recommended_department: string
  red_flags: string[]
  youtube_url: string
  youtube_videos: YouTubeVideo[]
  disclaimer: string
}

type History = {
  id: number
  symptom: string
  summary: string
  causes: string[]
  care: string[]
  warning_level: WarningLevel
  emergency_action: string
  recommended_department: string
  red_flags: string[]
  created_at: string
}

export default function Home() {
  const [session, setSession] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [symptom, setSymptom] = useState('')
  const [questions, setQuestions] = useState<string[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [result, setResult] = useState<ResultType | null>(null)
  const [loading, setLoading] = useState(false)
  const [histories, setHistories] = useState<History[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [selectedHistory, setSelectedHistory] = useState<History | null>(null)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState<{ prefecture: string; city: string; plan: string } | null>(null)
  const [weather, setWeather] = useState<{
    weather: string
    temperature: number
    humidity: number
    pressure: number
    wind_speed: number
    feels_like: number
    alerts: { event: string; description: string }[]
    location: string
  } | null>(null)

  const resetForm = () => {
    setSymptom('')
    setQuestions([])
    setAnswers([])
    setResult(null)
    setError('')
    setHistories([])
    setSelectedHistory(null)
  }

  const warningStyle = {
    低: 'bg-green-50 border-green-400 text-green-800',
    中: 'bg-yellow-50 border-yellow-400 text-yellow-800',
    高: 'bg-orange-50 border-orange-400 text-orange-800',
    緊急: 'bg-red-50 border-red-400 text-red-800',
  }

  useEffect(() => {
    const getSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      setSession(session)
      setAuthLoading(false)

      // セッションがあればプロフィールと天気を取得
      if (session) {
        const token = session.access_token
        try {
          const profileRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/profile`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (profileRes.ok) {
            const profileData = await profileRes.json()
            if (profileData) {
              setProfile(profileData)

              // プレミアムプランのみ天気情報を取得
              if (profileData.plan === 'premium') {
                const weatherRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/weather`, {
                  headers: { Authorization: `Bearer ${token}` },
                })
                if (weatherRes.ok) {
                  const weatherData = await weatherRes.json()
                  setWeather(weatherData)
                }
              }
            }
          }
        } catch (e) {
          console.error(e)
        }
      }
    }

    getSession()

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
      }
    )

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  const createQuestions = async () => {
    if (!symptom.trim()) {
      setError('症状を入力してください')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)
    setHistories([])
    setSelectedHistory(null)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const token = session?.access_token

      if (!token) {
        setError('セッションが切れています。再ログインしてください。')
        setLoading(false)
        return
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/questions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ symptom }),
        }
      )

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.detail)
      }

      const data = await response.json()
      setQuestions(data.questions)
      setAnswers(new Array(data.questions.length).fill(''))
      setResult(null)
    } catch (error) {
      console.error(error)
      if (error instanceof Error) {
        setError(error.message)
      } else {
        setError('問診生成に失敗しました')
      }
    } finally {
      setLoading(false)
    }
  }

  const analyzeSymptom = async () => {
    setLoading(true)
    setError('')

    try {
      const payloadAnswers: QuestionAnswer[] = questions.map((q, i) => ({
        question: q,
        answer: answers[i],
      }))

      const {
        data: { session },
      } = await supabase.auth.getSession()

      const token = session?.access_token

      if (!token) {
        setError('セッションが切れています。再ログインしてください。')
        setLoading(false)
        return
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/analyze`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            symptom,
            answers: payloadAnswers,
          }),
        }
      )

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.detail)
      }

      const data = await response.json()
      setResult(data)
      setQuestions([])
      setAnswers([])
    } catch (error) {
      console.error(error)
      if (error instanceof Error) {
        setError(error.message)
      } else {
        setError('分析に失敗しました。しばらくしてから再度お試しください。')
      }
    } finally {
      setLoading(false)
    }
  }

  const loadHistory = async () => {
    setHistoryLoading(true)

    try {
      setError('')
      setResult(null)
      setQuestions([])
      setAnswers([])
      setSelectedHistory(null)

      const {
        data: { session },
      } = await supabase.auth.getSession()

      const token = session?.access_token

      if (!token) {
        setError('セッションが切れています。再ログインしてください。')
        setHistoryLoading(false)
        return
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/history`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.detail)
      }

      const data = await response.json()
      setHistories(data)
    } catch (error) {
      console.error(error)
      if (error instanceof Error) {
        setError(error.message)
      } else {
        setError('履歴の取得に失敗しました')
      }
    } finally {
      setHistoryLoading(false)
    }
  }

  const deleteHistory = async (historyId: number) => {
    const ok = confirm('この履歴を削除しますか？')
    if (!ok) return

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const token = session?.access_token

      if (!token) {
        setError('セッションが切れています。再ログインしてください。')
        return
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/history/${historyId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.detail)
      }

      setHistories((prev) => prev.filter((history) => history.id !== historyId))
      setSelectedHistory(null)
    } catch (error) {
      console.error(error)
      if (error instanceof Error) {
        setError(error.message)
      } else {
        setError('履歴の削除に失敗しました')
      }
    }
  }

  const updateAnswer = (index: number, value: string) => {
    const newAnswers = [...answers]
    newAnswers[index] = value
    setAnswers(newAnswers)
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setWeather(null)
  }

  // ローディング画面
  if (authLoading) {
    return (
      <main className="min-h-screen flex justify-center items-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">読み込み中...</p>
        </div>
      </main>
    )
  }

  // 未ログイン画面
  if (!session) {
    return (
      <main className="min-h-screen flex justify-center items-center px-4 py-8">
        <div className="w-full max-w-md bg-white p-8 sm:p-10 rounded-2xl shadow-lg text-center">
          <h1 className="text-2xl sm:text-3xl font-bold mb-3">
            AI体調相談アプリ
          </h1>

          <p className="text-gray-500 mb-8">
            AIがあなたの体調について<br className="sm:hidden" />アドバイスします
          </p>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
            <Link
              href="/login"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition text-center"
            >
              ログイン
            </Link>

            <Link
              href="/signup"
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition text-center"
            >
              新規登録
            </Link>
          </div>
        </div>
      </main>
    )
  }

  // メイン画面
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6 sm:p-10">
      <div className="max-w-3xl mx-auto bg-white p-5 sm:p-8 rounded-2xl shadow-lg">
        {/* ヘッダー */}
        <h1 className="text-xl sm:text-3xl font-bold mb-4 sm:mb-6">
          AI体調相談アプリ
        </h1>

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6 pb-4 border-b border-gray-200">
          <div className="text-sm sm:text-base text-gray-600">
            <span className="hidden sm:inline">ログイン中：</span>
            <span className="font-medium text-gray-900">
              {session.user.email}
            </span>
          </div>

          <button
            onClick={logout}
            className="self-start sm:self-auto bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            ログアウト
          </button>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* プラン・プロフィール情報セクション */}
        {(!profile || profile.plan === 'free') ? (
          <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-medium">
                    無料プラン
                  </span>
                  <span className="text-xs text-gray-500">1日1回まで</span>
                </div>
                <p className="text-sm text-purple-800 font-medium">
                  プレミアムプランにアップグレード
                </p>
                <ul className="text-xs text-purple-600 mt-1 space-y-0.5">
                  <li>✓ 1日20回まで利用可能</li>
                  <li>✓ 天気・気圧を考慮した詳細診断</li>
                  <li>✓ YouTube関連動画の表示</li>
                  <li>✓ 診断履歴の保存・閲覧</li>
                </ul>
              </div>
              <div className="shrink-0 bg-purple-100 text-purple-700 px-4 py-2 rounded-lg text-sm font-medium text-center">
                管理者にお問い合わせください
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded-full font-medium">
                    プレミアム
                  </span>
                  <span className="text-sm font-medium text-blue-900">
                    📍 {profile.prefecture}{profile.city}
                  </span>
                  <Link
                    href="/profile"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    編集
                  </Link>
                </div>
                {weather ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-blue-800">
                    <span>🌤 {weather.weather}</span>
                    <span>🌡 {weather.temperature}℃</span>
                    <span>💧 {weather.humidity}%</span>
                    <span>📊 {weather.pressure}hPa</span>
                    <span>💨 {weather.wind_speed}m/s</span>
                  </div>
                ) : (
                  <p className="text-xs text-blue-600">天気情報を取得中...</p>
                )}
                {weather?.alerts && weather.alerts.length > 0 && (
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                    ⚠ 気象警報: {weather.alerts.map(a => a.event).join(', ')}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 症状入力 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            気になる症状を入力してください
          </label>
          <textarea
            value={symptom}
            maxLength={300}
            onChange={(e) => setSymptom(e.target.value)}
            placeholder="例：肩が痛い、頭がぼーっとする"
            disabled={questions.length > 0}
            className="w-full border border-gray-300 rounded-lg p-3 h-32 sm:h-40 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-100 disabled:text-gray-500"
          />
          <div className="text-xs text-gray-400 mt-1 text-right">
            {symptom.length} / 300文字
          </div>
        </div>

        {/* ボタン */}
        {questions.length === 0 && !result && (
          <div className="flex flex-col sm:flex-row gap-3 mt-2">
            <button
              onClick={createQuestions}
              disabled={loading || !symptom.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? '問診生成中...' : '問診を開始'}
            </button>

            {profile?.plan === 'premium' && (
              <button
                onClick={loadHistory}
                disabled={historyLoading}
                className="flex-1 bg-gray-700 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-medium transition disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {historyLoading ? '履歴取得中...' : '履歴を見る'}
              </button>
            )}
          </div>
        )}

        {/* 問診セクション */}
        {questions.length > 0 && (
          <div className="mt-6 sm:mt-8 bg-blue-50 rounded-xl p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-bold mb-4 text-blue-900">
              問診
            </h2>

            {questions.map((question, index) => (
              <div key={index} className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {index + 1}. {question}
                </label>
                <input
                  type="text"
                  value={answers[index] || ''}
                  onChange={(e) => updateAnswer(index, e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="回答を入力"
                />
              </div>
            ))}

            <button
              onClick={analyzeSymptom}
              disabled={loading || answers.some((answer) => !answer.trim())}
              className="w-full sm:w-auto mt-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? '分析中...' : '分析する'}
            </button>
          </div>
        )}

        {/* 分析結果 */}
        {result && (
          <div className="mt-8 space-y-6">
            {/* 要約 */}
            <section>
              <h2 className="text-lg sm:text-xl font-bold mb-2">要約</h2>
              <p className="text-gray-700 leading-relaxed">{result.summary}</p>
            </section>

            {/* 原因候補 */}
            <section>
              <h2 className="text-lg sm:text-xl font-bold mb-2">原因候補</h2>
              <ul className="list-disc ml-5 space-y-1 text-gray-700">
                {result.causes.map((cause, index) => (
                  <li key={index}>{cause}</li>
                ))}
              </ul>
            </section>

            {/* おすすめ対策 */}
            <section>
              <h2 className="text-lg sm:text-xl font-bold mb-2">おすすめ対策</h2>
              <ul className="list-disc ml-5 space-y-1 text-gray-700">
                {result.care.map((care, index) => (
                  <li key={index}>{care}</li>
                ))}
              </ul>
            </section>

            {/* 危険度 */}
            <section>
              <h2 className="text-lg sm:text-xl font-bold mb-2">危険度</h2>
              <div
                className={`p-4 border-l-4 rounded-lg ${
                  warningStyle[result.warning_level as keyof typeof warningStyle]
                }`}
              >
                <p className="font-bold text-lg">{result.warning_level}</p>
                <p className="mt-1 text-sm">{result.emergency_action}</p>
              </div>
            </section>

            {/* 緊急警告 */}
            {result.warning_level === '緊急' && (
              <div className="bg-red-600 text-white p-4 sm:p-5 rounded-xl">
                <h3 className="font-bold text-lg sm:text-xl">⚠ 緊急受診推奨</h3>
                <p className="mt-2 text-sm sm:text-base">
                  呼吸困難・意識障害・強い胸痛などの危険な症状が疑われます。
                </p>
                <p className="mt-1 text-sm sm:text-base">
                  救急相談または医療機関へ速やかに連絡してください。
                </p>
              </div>
            )}

            {/* 推奨診療科 */}
            <section>
              <h2 className="text-lg sm:text-xl font-bold mb-2">推奨診療科</h2>
              <div className="p-4 bg-blue-50 rounded-lg font-medium text-blue-900">
                {result.recommended_department}
              </div>
            </section>

            {/* 注意すべき症状 */}
            <section>
              <h2 className="text-lg sm:text-xl font-bold mb-2">注意すべき症状</h2>
              <ul className="space-y-1 ml-1">
                {result.red_flags.map((flag, index) => (
                  <li key={index} className="text-red-700 text-sm sm:text-base">
                    ⚠ {flag}
                  </li>
                ))}
              </ul>
            </section>

            {/* 関連動画 */}
            <section>
              <h2 className="text-lg sm:text-xl font-bold mb-3">関連動画</h2>

              {result.youtube_videos && result.youtube_videos.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {result.youtube_videos.map((video, index) => (
                    <a
                      key={index}
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition group"
                    >
                      <div className="relative aspect-video bg-gray-100">
                        <img
                          src={video.thumbnail}
                          alt={video.title}
                          className="w-full h-full object-cover group-hover:opacity-90 transition"
                        />
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-medium text-gray-800 line-clamp-2 group-hover:text-blue-600 transition">
                          {video.title}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <a
                  href={result.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-blue-600 hover:text-blue-800 hover:underline font-medium transition"
                >
                  YouTubeで関連動画を検索 →
                </a>
              )}
            </section>

            {/* 免責事項 */}
            <div className="p-4 bg-gray-100 border border-gray-200 rounded-lg text-xs sm:text-sm text-gray-600">
              <p className="font-bold mb-1">免責事項</p>
              <p>
                本サービスはAIによる一般的な健康情報の提供を目的としており、医療診断や治療の代替ではありません。
                症状が続く場合や不安がある場合は、必ず医療機関を受診してください。
              </p>
            </div>

            {/* 新しい相談ボタン */}
            <div className="flex justify-center sm:justify-end pt-2">
              <button
                onClick={resetForm}
                className="w-full sm:w-auto bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium transition"
              >
                新しい相談を開始
              </button>
            </div>
          </div>
        )}

        {/* 履歴一覧 */}
        {histories.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl sm:text-2xl font-bold mb-4">診断履歴</h2>

            <div className="space-y-3">
              {histories.map((history) => (
                <div
                  key={history.id}
                  onClick={() => setSelectedHistory(history)}
                  className="border border-gray-200 rounded-xl p-4 bg-gray-50 cursor-pointer hover:bg-gray-100 hover:shadow-sm transition"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm sm:text-base truncate">
                        {history.symptom}
                      </p>
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                        {history.summary}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteHistory(history.id)
                      }}
                      className="shrink-0 bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-xs font-medium transition"
                    >
                      削除
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">
                      危険度: {history.warning_level}
                    </span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                      {history.recommended_department}
                    </span>
                  </div>

                  <div className="flex justify-between items-center mt-3">
                    <span className="text-xs text-gray-400">
                      {new Date(history.created_at).toLocaleString('ja-JP')}
                    </span>
                    <span className="text-xs text-blue-600">
                      詳細を見る →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 履歴詳細モーダル */}
        {selectedHistory && (
          <div
            className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
            onClick={() => setSelectedHistory(null)}
          >
            <div
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto p-5 sm:p-8"
              onClick={(e) => e.stopPropagation()}
            >
              {/* モーダルヘッダー */}
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl sm:text-2xl font-bold">診断履歴詳細</h2>
                <button
                  onClick={() => setSelectedHistory(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition"
                >
                  ✕
                </button>
              </div>

              {/* スマホ用スクロールインジケーター */}
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4 sm:hidden" />

              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-gray-500 mb-1">症状</h3>
                  <p className="text-gray-900">{selectedHistory.symptom}</p>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-gray-500 mb-1">要約</h3>
                  <p className="text-gray-700 leading-relaxed">{selectedHistory.summary}</p>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-gray-500 mb-1">相談日時</h3>
                  <p className="text-gray-700">
                    {new Date(selectedHistory.created_at).toLocaleString('ja-JP')}
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-gray-500 mb-1">危険度</h3>
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-sm font-medium border ${
                      warningStyle[selectedHistory.warning_level as keyof typeof warningStyle]
                    }`}
                  >
                    {selectedHistory.warning_level}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-gray-500 mb-1">推奨診療科</h3>
                  <p className="text-gray-700">{selectedHistory.recommended_department}</p>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-gray-500 mb-1">原因候補</h3>
                  <ul className="list-disc ml-5 space-y-1 text-gray-700">
                    {selectedHistory.causes.map((cause, index) => (
                      <li key={index}>{cause}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-gray-500 mb-1">おすすめ対策</h3>
                  <ul className="list-disc ml-5 space-y-1 text-gray-700">
                    {selectedHistory.care.map((care, index) => (
                      <li key={index}>{care}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-red-600 mb-1">注意すべき症状</h3>
                  <ul className="space-y-1 ml-1">
                    {selectedHistory.red_flags.map((flag, index) => (
                      <li key={index} className="text-red-700 text-sm">
                        ⚠ {flag}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
