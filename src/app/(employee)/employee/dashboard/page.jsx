"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { getEmployee, getTimeLogs, getActiveTimeLog, addTimeLog, updateTimeLog, getPayrollsByEmployee, getCashoutRequests } from "@/lib/firebase-service"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Clock, PhilippinePeso, Calendar, TrendingUp, Wallet } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { Timestamp } from "firebase/firestore"
import { toast } from "sonner"

function toDate(value) {
  if (!value) return null
  if (typeof value.toDate === "function") {
    return value.toDate()
  }
  if (value instanceof Date) {
    return value
  }
  if (typeof value === "number") {
    return new Date(value)
  }
  if (typeof value === "string") {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

function formatShortDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export default function EmployeeDashboard() {
  const { userData } = useAuth()
  const [employee, setEmployee] = useState(null)
  const [timeLogs, setTimeLogs] = useState([])
  const [activeLog, setActiveLog] = useState(null)
  const [payrolls, setPayrolls] = useState([])
  const [cashoutRequests, setCashoutRequests] = useState([])
  const [loading, setLoading] = useState(true)

  const getInitials = (name = "") =>
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "?"

  useEffect(() => {
    loadData()

    // Refresh data every 5 seconds to show cashout status updates
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [userData])

  const loadData = async () => {
    if (!userData?.employeeId) return

    try {
      const [empData, logs, active, payrollData, cashoutData] = await Promise.all([
        getEmployee(userData.employeeId),
        getTimeLogs(userData.employeeId),
        getActiveTimeLog(userData.employeeId),
        getPayrollsByEmployee(userData.employeeId),
        getCashoutRequests(userData.employeeId),
      ])

      setEmployee(empData)
      setTimeLogs(logs)
      setActiveLog(active)
      setPayrolls(payrollData)
      setCashoutRequests(cashoutData)
    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleClockIn = async () => {
    try {
      await addTimeLog({
        employeeId: userData.employeeId,
        employeeName: employee?.name || "Employee",
        timeIn: Timestamp.now(),
        timeOut: null,
      })
      await loadData()
    } catch (error) {
      console.error("Error clocking in:", error)
    }
  }

  const handleClockOut = async () => {
    if (!activeLog) return

    try {
      await updateTimeLog(activeLog.id, {
        timeOut: Timestamp.now(),
      })
      await loadData()
    } catch (error) {
      console.error("Error clocking out:", error)
    }
  }

  const handleCashout = async () => {
    // Find the most recent processed payroll
    const processedPayroll = payrolls.find((p) => p.status === "paid")
    if (!processedPayroll) {
      toast.info("No approved payroll yet", {
        description: "Once your next payroll is auto-approved you can request a cashout here.",
      })
      return
    }

    try {
      const response = await fetch("/api/cashout/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: userData.employeeId,
          employeeName: employee?.name || "Employee",
          amount: processedPayroll.netPay,
          method: "paymongo",
          accountDetails: {
            paymentIntentId: processedPayroll.paymentIntentId,
          },
        }),
      })

      if (response.ok) {
        toast.success("Cashout request submitted", {
          description: "We will process this within a few seconds.",
        })
        await loadData()
      } else {
        toast.error("Failed to submit cashout request")
      }
    } catch (error) {
      console.error("Error submitting cashout:", error)
      toast.error("Failed to submit cashout request")
    }
  }

  const viewReceipt = (cashout) => {
    // For testing, show a mock PayMongo receipt
    const receiptUrl = `https://pm.link/test-receipt-${cashout.transactionId || cashout.id}`
    window.open(receiptUrl, "_blank")
  }

  const calculateTotalHours = () => {
    return timeLogs.reduce((total, log) => {
      if (log.timeOut) {
        const hours = (log.timeOut.toDate() - log.timeIn.toDate()) / (1000 * 60 * 60)
        return total + hours
      }
      return total
    }, 0)
  }

  const getNextPaymentLabel = () => {
    if (!Array.isArray(payrolls) || payrolls.length === 0) {
      return "No payment schedule yet"
    }

    const now = new Date()

    const upcoming = payrolls
      .map((payroll) => toDate(payroll.autoApprovalScheduledAt))
      .filter((date) => date instanceof Date && !Number.isNaN(date.getTime()) && date > now)
      .sort((a, b) => a - b)

    if (upcoming.length > 0) {
      const formatted = formatShortDate(upcoming[0])
      return formatted ? `Next payment ${formatted}` : "Next payment scheduled"
    }

    const pending = payrolls
      .filter((payroll) => payroll.status !== "paid")
      .map((payroll) => toDate(payroll.autoApprovalScheduledAt) || toDate(payroll.createdAt))
      .filter((date) => date instanceof Date && !Number.isNaN(date.getTime()))
      .sort((a, b) => a - b)

    if (pending.length > 0) {
      const standby = formatShortDate(pending[0])
      return standby ? `Awaiting approval since ${standby}` : "Awaiting approval"
    }

    const lastPaid = payrolls
      .map((payroll) => toDate(payroll.autoApprovedAt) || toDate(payroll.paidAt))
      .filter((date) => date instanceof Date && !Number.isNaN(date.getTime()))
      .sort((a, b) => b - a)

    if (lastPaid.length > 0) {
      const paidLabel = formatShortDate(lastPaid[0])
      if (paidLabel) {
        return `Last paid ${paidLabel}`
      }
    }

    return "No payment schedule yet"
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Spinner className="mx-auto mb-4" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center gap-4">
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
      </div>

      {employee && (
        <div className="mb-8 p-4 rounded-lg border border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">{employee.name}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {employee.position && (
              <div className="rounded-full bg-slate-900 px-3 py-1 text-sm text-white">
                {employee.position}
              </div>
            )}
            {employee.startingShift && (
              <div className="rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-700">
                Start: {employee.startingShift}
              </div>
            )}
            {employee.endingShift && (
              <div className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-700">
                End: {employee.endingShift}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Hourly Rate</CardTitle>
            <PhilippinePeso className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱{employee?.hourlyRate || 0}/hr</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Hours (Month)</CardTitle>
            <Clock className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{calculateTotalHours().toFixed(2)} hrs</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Next Payment</CardTitle>
            <Calendar className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold leading-snug">{getNextPaymentLabel()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Estimated Earnings</CardTitle>
            <TrendingUp className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₱{(calculateTotalHours() * (employee?.hourlyRate || 0)).toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Time Clock</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {activeLog ? (
              <>
                <div className="flex-1">
                  <p className="text-sm text-slate-600 mb-1">Timed in at</p>
                  <p className="text-lg font-semibold">{activeLog.timeIn.toDate().toLocaleTimeString()}</p>
                </div>
                <Button onClick={handleClockOut} size="lg" variant="destructive">
                  Time Out
                </Button>
              </>
            ) : (
              <>
                <div className="flex-1">
                  <p className="text-sm text-slate-600 mb-1">Ready to start your shift?</p>
                  <p className="text-lg font-semibold">Click to time In</p>
                </div>
                <Button onClick={handleClockIn} size="lg">
                  Time In
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Time Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {timeLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                <div>
                  <p className="font-medium">{log.timeIn.toDate().toLocaleDateString()}</p>
                  <p className="text-sm text-slate-600">
                    {log.timeIn.toDate().toLocaleTimeString()} -{" "}
                    {log.timeOut ? log.timeOut.toDate().toLocaleTimeString() : "Active"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    {log.timeOut
                      ? `${((log.timeOut.toDate() - log.timeIn.toDate()) / (1000 * 60 * 60)).toFixed(2)} hrs`
                      : "In Progress"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
