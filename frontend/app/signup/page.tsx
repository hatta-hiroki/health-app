'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

function translateAuthError(message: string): string {
  const map: Record<string, string> = {
    'User already registered': 'このメールアドレスは既に登録されています',
    'Password should be at least 6 characters': 'パスワードは6文字以上で入力してください',
    'Unable to validate email address': 'メールアドレスの形式が正しくありません',
    'Signup requires a valid password': 'パスワードを入力してください',
    'Email rate limit exceeded': 'リクエスト回数の上限に達しました。しばらくしてから再度お試しください',
    'Too many requests': 'リクエスト回数の上限に達しました。しばらくしてから再度お試しください',
    'Network request failed': 'ネットワークエラーが発生しました。通信環境をご確認ください',
  }

  for (const [key, value] of Object.entries(map)) {
    if (message.includes(key)) {
      return value
    }
  }

  return '登録に失敗しました。入力内容をご確認ください'
}

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const validatePassword = (password: string): string[] => {
    const errors: string[] = []
    if (password.length < 8) {
      errors.push('8文字以上で入力してください')
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('大文字を1文字以上含めてください')
    }
    if (!/[a-z]/.test(password)) {
      errors.push('小文字を1文字以上含めてください')
    }
    if (!/[0-9]/.test(password)) {
      errors.push('数字を1文字以上含めてください')
    }
    return errors
  }

  const signup = async () => {
    setError('')
    setMessage('')

    const passwordErrors = validatePassword(password)
    if (passwordErrors.length > 0) {
      setError(passwordErrors.join('\n'))
      return
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      })

      if (error) {
        setError(translateAuthError(error.message))
        return
      }

      setMessage('登録が完了しました！ログインしてご利用ください。')
    } catch (e) {
      setError('ネットワークエラーが発生しました。通信環境をご確認ください')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      signup()
    }
  }

  return (
    <main className="min-h-screen flex justify-center items-center px-4 py-8">
      <div className="w-full max-w-md bg-white shadow-lg rounded-2xl p-6 sm:p-8">
        <h1 className="text-3xl font-bold mb-2 text-center text-gray-900">
          新規登録
        </h1>

        <p className="text-base text-gray-600 text-center mb-6">
          アカウントを作成して利用を開始
        </p>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-base whitespace-pre-line">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-base">
            {message}
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
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg mb-4 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
          />

          <label className="block text-base font-medium text-gray-900 mb-1">
            パスワード
          </label>
          <input
            type="password"
            placeholder="パスワードを入力"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg mb-2 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
          />
          <p className="text-sm text-gray-600 mb-6">
            8文字以上、大文字・小文字・数字をそれぞれ1文字以上含めてください
          </p>
        </div>

        <button
          onClick={signup}
          disabled={!email.trim() || !password.trim()}
          className="w-full bg-green-600 hover:bg-green-700 text-white p-3 rounded-lg text-base font-bold transition disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          新規登録
        </button>

        <p className="mt-6 text-center text-base text-gray-600">
          既にアカウントをお持ちの方は{' '}
          <Link href="/login" className="text-blue-600 hover:underline font-bold">
            ログイン
          </Link>
        </p>
      </div>
    </main>
  )
}
