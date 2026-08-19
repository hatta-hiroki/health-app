'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
  '岐阜県', '静岡県', '愛知県', '三重県',
  '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県',
  '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
]

export default function ProfilePage() {
  const router = useRouter()
  const [prefecture, setPrefecture] = useState('')
  const [city, setCity] = useState('')
  const [gender, setGender] = useState('')
  const [age, setAge] = useState('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [medicalConditions, setMedicalConditions] = useState('')
  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isEdit, setIsEdit] = useState(false)
  const [plan, setPlan] = useState('free')

  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
        return
      }

      const token = session.access_token

      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/profile`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (response.ok) {
          const data = await response.json()
          if (data) {
            setPrefecture(data.prefecture || '')
            setCity(data.city || '')
            setGender(data.gender || '')
            setAge(data.age ? String(data.age) : '')
            setHeight(data.height ? String(data.height) : '')
            setWeight(data.weight ? String(data.weight) : '')
            setMedicalConditions(data.medical_conditions || '')
            setPlan(data.plan || 'free')
            if (data.prefecture && data.city) {
              setIsEdit(true)
            }
          }
        }
      } catch (e) {
        console.error(e)
      } finally {
        setPageLoading(false)
      }
    }

    loadProfile()
  }, [router])

  const saveProfile = async () => {
    if (!prefecture) {
      setError('都道府県を選択してください')
      return
    }
    if (!city.trim()) {
      setError('市区町村を入力してください')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

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

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prefecture,
          city,
          gender: gender || null,
          age: age ? parseInt(age) : null,
          height: height ? parseFloat(height) : null,
          weight: weight ? parseFloat(weight) : null,
          medical_conditions: medicalConditions || null,
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.detail)
      }

      setSuccess('プロフィールを保存しました！')
      setIsEdit(true)
    } catch (e) {
      console.error(e)
      if (e instanceof Error) {
        setError(e.message)
      } else {
        setError('保存に失敗しました')
      }
    } finally {
      setLoading(false)
    }
  }

  if (pageLoading) {
    return (
      <main className="min-h-screen flex justify-center items-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">読み込み中...</p>
        </div>
      </main>
    )
  }

  if (plan !== 'premium') {
    return (
      <main className="min-h-screen flex justify-center items-center px-4 py-8">
        <div className="w-full max-w-md bg-white shadow-lg rounded-2xl p-6 sm:p-8 text-center">
          <h1 className="text-2xl font-bold mb-4">プレミアム機能</h1>
          <p className="text-gray-600 mb-6">
            住所登録と天気連携診断はプレミアムプランの機能です。<br />
            アップグレードについては管理者にお問い合わせください。
          </p>
          <Link href="/" className="text-blue-600 hover:underline font-medium">
            ← ホームに戻る
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex justify-center items-start px-4 py-8">
      <div className="w-full max-w-lg bg-white shadow-lg rounded-2xl p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-center">
          {isEdit ? 'プロフィール編集' : 'プロフィール登録'}
        </h1>

        <p className="text-sm text-gray-500 text-center mb-6">
          登録情報をもとに、より精度の高い分析を行います
        </p>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
            {success}
          </div>
        )}

        {/* 住所セクション */}
        <div className="mb-6">
          <h2 className="text-sm font-bold text-gray-800 mb-3 pb-2 border-b border-gray-200">
            📍 住所情報
          </h2>

          <label className="block text-sm font-medium text-gray-700 mb-1">
            都道府県 <span className="text-red-500">*</span>
          </label>
          <select
            value={prefecture}
            onChange={(e) => setPrefecture(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white"
          >
            <option value="">選択してください</option>
            {PREFECTURES.map((pref) => (
              <option key={pref} value={pref}>
                {pref}
              </option>
            ))}
          </select>

          <label className="block text-sm font-medium text-gray-700 mb-1">
            市区町村 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="例：新宿区、横浜市中区"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
        </div>

        {/* 基本情報セクション */}
        <div className="mb-6">
          <h2 className="text-sm font-bold text-gray-800 mb-3 pb-2 border-b border-gray-200">
            👤 基本情報
          </h2>

          <label className="block text-sm font-medium text-gray-700 mb-1">
            性別
          </label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white"
          >
            <option value="">選択してください</option>
            <option value="男性">男性</option>
            <option value="女性">女性</option>
            <option value="その他">その他</option>
            <option value="回答しない">回答しない</option>
          </select>

          <label className="block text-sm font-medium text-gray-700 mb-1">
            年齢
          </label>
          <input
            type="number"
            placeholder="例：35"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            min="0"
            max="150"
            className="w-full border border-gray-300 p-3 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                身長 (cm)
              </label>
              <input
                type="number"
                placeholder="例：170"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                min="0"
                max="300"
                step="0.1"
                className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                体重 (kg)
              </label>
              <input
                type="number"
                placeholder="例：65"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                min="0"
                max="500"
                step="0.1"
                className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>
          </div>

          {height && weight && (
            <p className="text-xs text-gray-500 mt-2">
              BMI: {(parseFloat(weight) / ((parseFloat(height) / 100) ** 2)).toFixed(1)}
            </p>
          )}
        </div>

        {/* 持病セクション */}
        <div className="mb-6">
          <h2 className="text-sm font-bold text-gray-800 mb-3 pb-2 border-b border-gray-200">
            🏥 既往歴・持病
          </h2>

          <label className="block text-sm font-medium text-gray-700 mb-1">
            持病や過去の病歴があれば入力してください
          </label>
          <textarea
            placeholder="例：高血圧、糖尿病、花粉症、腰椎ヘルニア（2020年手術済み）"
            value={medicalConditions}
            onChange={(e) => setMedicalConditions(e.target.value)}
            maxLength={500}
            className="w-full border border-gray-300 p-3 rounded-lg h-24 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
          <p className="text-xs text-gray-400 mt-1 text-right">
            {medicalConditions.length} / 500文字
          </p>
          <p className="text-xs text-gray-500 mt-1">
            ※ 相談時にAIが持病との関連性を考慮して分析します
          </p>
        </div>

        <button
          onClick={saveProfile}
          disabled={loading || !prefecture || !city.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg font-medium transition disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? '保存中...' : isEdit ? '更新する' : '登録する'}
        </button>

        <p className="mt-6 text-center">
          <Link href="/" className="text-blue-600 hover:underline font-medium text-sm">
            ← ホームに戻る
          </Link>
        </p>
      </div>
    </main>
  )
}
