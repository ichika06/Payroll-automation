"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { Spinner } from "@/components/ui/spinner"

export default function Home() {
  const router = useRouter()
  const { user, userData, loading } = useAuth()

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push("/login")
      } else if (userData) {
        // Redirect based on role
        if (userData.role === "admin") {
          router.push("/dashboard")
        } else {
          router.push("/employee/dashboard")
        }
      }
    }
  }, [user, userData, loading, router])

  return (
    <div className="flex h-screen items-center justify-center">
      <Spinner className="mx-auto" />
    </div>
  )
}
