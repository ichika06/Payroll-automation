"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { LogOut, Settings, Inbox } from "lucide-react"
import { LayoutDashboard as AnimatedLayoutDashboard } from "@/components/animate-ui/icons/layout-dashboard"
import { Clock as AnimatedClock } from "@/components/animate-ui/icons/clock"
import { CircleCheckBig as AnimatedCircleCheckBig } from "@/components/animate-ui/icons/circle-check-big"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { signOutUser } from "@/lib/auth-service"
import { useAuth } from "./auth-provider"
import { Button } from "./ui/button"
import { getEmployee } from "@/lib/firebase-service"

const navigation = [
  { name: "Dashboard", href: "/employee/dashboard", icon: AnimatedLayoutDashboard, animated: true },
  { name: "Time Logs", href: "/employee/time-logs", icon: AnimatedClock, animated: true },
  { name: "Payroll", href: "/employee/payroll", icon: AnimatedCircleCheckBig, animated: true },
  { name: "Inbox", href: "/employee/inbox", icon: Inbox, animated: false },
  { name: "Settings", href: "/employee/settings", icon: Settings, animated: false },
]

const initials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?"

export function EmployeeSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, userData } = useAuth()
  const [employee, setEmployee] = useState(null)
  const [completedCashouts, setCompletedCashouts] = useState(0)
  const [hoveredNav, setHoveredNav] = useState(null)

  useEffect(() => {
    if (!userData?.employeeId) return

    async function loadProfile() {
      try {
        const profile = await getEmployee(userData.employeeId)
        setEmployee(profile)

        const count = Array.isArray(profile?.cashoutRequests)
          ? profile.cashoutRequests.filter((c) => c.status === "completed").length
          : 0
        setCompletedCashouts(count)
      } catch (error) {
        console.error("Error loading employee profile:", error)
      }
    }

    loadProfile()
  }, [userData])

  const handleSignOut = async () => {
    try {
      await signOutUser()
      router.push("/login")
    } catch (error) {
      console.error("Sign out error:", error)
    }
  }

  return (
    <div className="flex h-full w-64 flex-col bg-slate-200 text-gray-800 border-r-4 border-slate-500">

      <div className="flex flex-col items-center gap-3 px-4 py-6">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
          {employee?.profilePhoto ? (
            <img src={employee.profilePhoto} alt={employee?.name} className="h-full w-full object-cover" />
          ) : (
            <span className="text-lg font-semibold text-slate-600">{initials(employee?.name)}</span>
          )}
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-800">{employee?.name ?? "Employee"}</p>
          <p className="text-xs text-slate-800">{employee?.position ?? user?.email}</p>
          <Badge className="mb-1">{employee?.department ?? "No Department"}</Badge>
        </div>
        <div className="flex justify-between gap-2">
          {employee.startingShift && (
            <Badge className="rounded-full bg-indigo-200 px-3 py-1 text-sm text-indigo-600">
              Start: {employee.startingShift}
            </Badge>
          )}
          {employee.endingShift && (
            <Badge className="rounded-full bg-emerald-200 px-3 py-1 text-sm text-green-700">
              End: {employee.endingShift}
            </Badge>
          )}
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors relative",
                isActive ? "bg-violet-600 text-white" : "text-slate-800 hover:bg-violet-500 hover:text-white",
              )}
              onMouseEnter={() => setHoveredNav(item.href)}
              onMouseLeave={() => setHoveredNav(null)}
            >
              <Icon
                className="h-5 w-5"
                size={20}
                {...(item.animated
                  ? {
                      animateOnHover: true,
                      animate: hoveredNav === item.href,
                    }
                  : {})}
              />
              {item.name}
              {item.name === "Inbox" && completedCashouts > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-teal-500 text-xs text-white">
                  {completedCashouts}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="p-4">
        <div className="mb-3 text-sm text-slate-400">
          <p className="font-medium text-gray-800">{user?.email}</p>
          <p className="text-xs">Employee</p>
        </div>
        <Button
          onClick={handleSignOut}
          variant="outline"
          className="w-full justify-start gap-2 bg-slate-800 text-white hover:bg-slate-700 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  )
}
