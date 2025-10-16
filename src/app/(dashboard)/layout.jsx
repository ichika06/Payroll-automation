"use client"

import { Sidebar } from "@/components/sidebar"
import { ProtectedRoute } from "@/components/protected-route"

export default function DashboardLayout({ children }) {
  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-slate-300">{children}</main>
      </div>
    </ProtectedRoute>
  )
}
