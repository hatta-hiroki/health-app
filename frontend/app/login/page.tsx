'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

/**
 * Supabaseの英語エラーメッセージを日本語に変換する
 */
function translateAuthError(message: string): string {
  const map: Record<string, string> = {
    'Invalid login credentials': 'メールアドレスまたはパスワードが正しくありません',
    'Email not confirmed': 'メールアドレスが確認されていません。確認メールをご確認ください',
    'Invalid email or password': 'メールアドレスまたはパスワードが正しくありません',
    'User not found': 'ユーザーが見つかりません',
    'Email rate limit exceeded': 'リクエスト回数の上限に達しました。しばらくしてから再度お試しください',
    'Too many requests': 'リクエスト回数の上限に達しました。しばらくしてから再度お試しください',
    'Network request failed': 'ネットワークエラーが発生しました。通信環境をご確認ください',
  }

  for (const [key, value] of Object.entries(map)) {
    if (message.includes(key)) {
      return value
    }
  }

  // マッチしない場合は汎用メッセージ
  return 'ログインに失敗しました。入力内容をご確認ください'
}

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const login = async () => {
    setLoading(true)
    setError('')

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setError(translateAuthError(error.message))
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
        <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-center">
          ログイン
        </h1>

        <p className="text-sm text-gray-500 text-center mb-6">
          AI体調相談アプリにログイン
        </p>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div onKeyDown={handleKeyDown}>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            メールアドレス
          </label>
          <input
            type="email"
            placeholder="example@mail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />

          <label className="block text-sm font-medium text-gray-700 mb-1">
            パスワード
          </label>
          <input
            type="password"
            placeholder="パスワードを入力"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg mb-6 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
        </div>

        <button
          onClick={login}
          disabled={loading || !email.trim() || !password.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg font-medium transition disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? 'ログイン中...' : 'ログイン'}
        </button>

        <p className="mt-6 text-center text-sm text-gray-500">
          アカウントをお持ちでない方は{' '}
          <Link href="/signup" className="text-blue-600 hover:underline font-medium">
            新規登録
          </Link>
        </p>
      </div>
    </main>
  )
}
