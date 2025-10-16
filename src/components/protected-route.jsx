"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "./auth-provider"

export function ProtectedRoute({ children, allowedRoles = [] }) {
  const { user, userData, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push("/login")
      } else if (allowedRoles.length > 0 && userData && !allowedRoles.includes(userData.role)) {
        // Redirect based on role
        if (userData.role === "admin") {
          router.push("/dashboard")
        } else {
          router.push("/employee/dashboard")
        }
      }
    }
  }, [user, userData, loading, router, allowedRoles])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  if (allowedRoles.length > 0 && userData && !allowedRoles.includes(userData.role)) {
    return null
  }

  return <>{children}</>
}
