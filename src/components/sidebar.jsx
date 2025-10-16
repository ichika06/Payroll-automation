"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { Inbox, LogOut } from "lucide-react"
import { LayoutDashboard as AnimatedLayoutDashboard } from "@/components/animate-ui/icons/layout-dashboard"
import { Users as AnimatedUsers } from "@/components/animate-ui/icons/users"
import { UserRound as AnimatedUserRound } from "@/components/animate-ui/icons/user-round"
import { Clock as AnimatedClock } from "@/components/animate-ui/icons/clock"
import { CircleCheckBig as AnimatedCircleCheckBig } from "@/components/animate-ui/icons/circle-check-big"
import { ChartSpline as AnimatedChartSpline } from "@/components/animate-ui/icons/chart-spline"
import { cn } from "@/lib/utils"
import { signOutUser } from "@/lib/auth-service"
import { useAuth } from "./auth-provider"
import { Button } from "@/components/ui/button"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: AnimatedLayoutDashboard, animated: true },
  { name: "Employees", href: "/employees", icon: AnimatedUsers, animated: true },
  { name: "Add Employee", href: "/employees/add", icon: AnimatedUserRound, animated: true },
  { name: "Time Logs", href: "/logs", icon: AnimatedClock, animated: true },
  { name: "Payroll", href: "/payroll", icon: AnimatedCircleCheckBig, animated: true },
  { name: "Analytics", href: "/analytics", icon: AnimatedChartSpline, animated: true },
  { name: "Inbox", href: "/inbox", icon: Inbox, animated: false },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useAuth()
  const [hoveredNav, setHoveredNav] = useState(null)

  const handleSignOut = async () => {
    try {
      await signOutUser()
      router.push("/login")
    } catch (error) {
      console.error("Sign out error:", error)
    }
  }

  return (
    <div className="flex h-full w-64 flex-col bg-slate-200 border-r-2 border-slate-500 text-gray-800">
      <div className="flex h-16 items-center justify-center border-b border-slate-500">
        <h1 className="text-xl font-bold">Administrator</h1>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          const IconComponent = item.icon
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-violet-600 text-white" : "text-slate-800 hover:bg-violet-500 hover:text-white",
              )}
              onMouseEnter={() => setHoveredNav(item.href)}
              onMouseLeave={() => setHoveredNav(null)}
            >
              <IconComponent
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
            </Link>
          )
        })}
      </nav>

      <div className=" p-4">
        <div className="mb-3 text-sm text-slate-800">
          <p className="font-medium text-gray-800">{user?.email}</p>
          <p className="text-xs">Admin</p>
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
