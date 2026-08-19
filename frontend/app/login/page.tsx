'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isLocked, setIsLocked] = useState(false)

  const login = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const err = await response.json()
        if (response.status === 423) {
          setIsLocked(true)
        }
        setError(err.detail)
        setLoading(false)
        return
      }

      const { error: supabaseError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (supabaseError) {
        setError('ログイン処理に失敗しました。再度お試しください。')
        setLoading(false)
        return
      }

      router.push('/')
    } catch (e) {
      setError('ネットワークエラーが発生しました。通信環境をご確認ください')
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      login()
    }
  }

  return (
    <main className="min-h-screen flex justify-center items-center px-4 py-8">
      <div className="w-full max-w-md bg-white shadow-lg rounded-2xl p-6 sm:p-8">
        <h1 className="text-3xl font-bold mb-2 text-center text-gray-900">
          ログイン
        </h1>

        <p className="text-base text-gray-600 text-center mb-6">
          AI体調相談アプリにログイン
        </p>

        {error && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-base ${
            isLocked
              ? 'bg-orange-50 border border-orange-200 text-orange-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {isLocked && (
              <p className="font-bold mb-1">アカウントロック</p>
            )}
            {error}
          </div>
        )}

        <div onKeyDown={handleKeyDown}>
          <label className="block text-base font-medium text-gray-900 mb-1">
            メールアドレス
          </label>
          <input
            type="email"
            placeholder="example@mail.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setIsLocked(false) }}
            disabled={isLocked}
            className="w-full border border-gray-300 p-3 rounded-lg mb-4 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-100 disabled:text-gray-500"
          />

          <label className="block text-base font-medium text-gray-900 mb-1">
            パスワード
          </label>
          <input
            type="password"
            placeholder="パスワードを入力"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLocked}
            className="w-full border border-gray-300 p-3 rounded-lg mb-6 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-100 disabled:text-gray-500"
          />
        </div>

        <button
          onClick={login}
          disabled={loading || !email.trim() || !password.trim() || isLocked}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg text-base font-bold transition disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? 'ログイン中...' : 'ログイン'}
        </button>

        <p className="mt-6 text-center text-base text-gray-600">
          アカウントをお持ちでない方は{' '}
          <Link href="/signup" className="text-blue-600 hover:underline font-bold">
            新規登録
          </Link>
        </p>
      </div>
    </main>
  )
}
