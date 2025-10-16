"use client"

import { EmployeeSidebar } from "@/components/employee-sidebar"
import { ProtectedRoute } from "@/components/protected-route"

export default function EmployeeLayout({ children }) {
  return (
    <ProtectedRoute allowedRoles={["employee"]}>
      <div className="flex h-screen">
        <EmployeeSidebar />
        <main className="flex-1 overflow-y-auto bg-slate-50">{children}</main>
      </div>
    </ProtectedRoute>
  )
}
