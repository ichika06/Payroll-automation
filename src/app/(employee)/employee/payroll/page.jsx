"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { getPayrollsByEmployee, getEmployee, getCashoutRequests } from "@/lib/firebase-service"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PhilippinePeso, Calendar, TrendingUp, Wallet } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import PaymentModal from "@/components/payment-modal"
import { toast } from "sonner"

export default function EmployeePayroll() {
  const { userData } = useAuth()
  const [payrolls, setPayrolls] = useState([])
  const [employee, setEmployee] = useState(null)
  const [cashoutRequests, setCashoutRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState({ type: "", text: "" })
  const [processingCashout, setProcessingCashout] = useState(null)
  const [lastPaymentLinkId, setLastPaymentLinkId] = useState(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const storedLinkId = window.localStorage.getItem("lastPaymentLinkId")
    if (storedLinkId) {
      setLastPaymentLinkId(storedLinkId)
    }
  }, [])
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState(0)

  useEffect(() => {
    if (typeof window === "undefined") return

    // Check for PayMongo redirect parameters
    const urlParams = new URLSearchParams(window.location.search)
    const linkIdFromUrl = urlParams.get("paymentLinkId")

    if (urlParams.get("success") === "true") {
      const linkId = linkIdFromUrl || lastPaymentLinkId
      if (linkId) {
        handlePaymentSuccess({ paymentLinkId: linkId })
      } else {
        setMessage({ type: "info", text: "Payment completed. Syncing your cashout status..." })
      }
      if (linkIdFromUrl || lastPaymentLinkId) {
        window.localStorage.removeItem("lastPaymentLinkId")
        setLastPaymentLinkId(null)
      }
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname)
    } else if (urlParams.get("failed") === "true") {
      setMessage({ type: "error", text: "Payment was cancelled or failed. Please try again." })
      if (linkIdFromUrl || lastPaymentLinkId) {
        window.localStorage.removeItem("lastPaymentLinkId")
        setLastPaymentLinkId(null)
      }
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }

    loadData()

    // Set up polling to check for cashout status updates every 5 seconds
    const pollInterval = setInterval(() => {
      loadData()
    }, 5000) // Check every 5 seconds

    // Also refresh when page becomes visible (user returns from PayMongo)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadData()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(pollInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [userData, lastPaymentLinkId])

  const loadData = async () => {
    if (!userData?.employeeId) return

    try {
      const [payrollData, empData, cashouts] = await Promise.all([
        getPayrollsByEmployee(userData.employeeId),
        getEmployee(userData.employeeId),
        getCashoutRequests(userData.employeeId),
      ])
      setPayrolls(payrollData)
      setEmployee(empData)
      setCashoutRequests(cashouts)
    } catch (error) {
      console.error("Error loading payroll:", error)
    } finally {
      setLoading(false)
    }
  }

  const getTotalEarnings = () => {
    return payrolls.filter((p) => p.status === "paid").reduce((total, p) => total + (p.netPay || 0), 0)
  }

  const getAvailableBalance = () => {
    const totalEarnings = getTotalEarnings()
    const totalCashedOut = cashoutRequests
      .filter((c) => c.status === "completed")
      .reduce((total, c) => total + (c.amount || 0), 0)
    return totalEarnings - totalCashedOut
  }

  const handleQuickCashout = async () => {
    const available = getAvailableBalance()
    if (available < 100) {
      setMessage({ type: "error", text: "Insufficient balance. Minimum cashout is ₱100." })
      return
    }

    // Ask for the cashout amount
    const amountInput = prompt(`Enter cashout amount (Available: ₱${available.toFixed(2)}, Min: ₱100):`)
    if (!amountInput) return // User cancelled

    const amount = parseFloat(amountInput)
    if (isNaN(amount) || amount < 100) {
      setMessage({ type: "error", text: "Please enter a valid amount of at least ₱100." })
      return
    }

    if (amount > available) {
      setMessage({ type: "error", text: "Amount exceeds available balance." })
      return
    }

    // Open payment modal instead of redirecting
    setPaymentAmount(amount)
    setPaymentModalOpen(true)
  }

  const handlePaymentSuccess = async (payload = {}) => {
    const paymentLinkId = payload.paymentLinkId || payload?.cashoutRequest?.paymentLinkId || lastPaymentLinkId

    if (!paymentLinkId) {
      console.warn("Payment success triggered without a payment link ID")
      setMessage({ type: "error", text: "Unable to verify payment without a payment link reference." })
      return
    }

    try {
      const response = await fetch("/api/cashout/complete-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentLinkId }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data?.error || "Failed to complete payment")
      }

      setMessage({ type: "success", text: data?.message || "Payment completed successfully! Your cashout has been processed." })
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("lastPaymentLinkId")
      }
      setLastPaymentLinkId(null)
      // Refresh data to show updated balance
      loadData()
    } catch (error) {
      console.error("Payment completion error:", error)
      setMessage({ type: "error", text: error.message || "Payment completed but there was an issue updating your cashout status. Please contact support if the issue persists." })
    }
  }

  const handleMarkAsPaid = async (cashoutId) => {
    if (!confirm("Have you completed the payment on PayMongo? This will mark your cashout as completed.")) {
      return
    }

    try {
      const response = await fetch("/api/cashout/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cashoutId }),
      })

      if (!response.ok) {
        throw new Error("Failed to mark as paid")
      }

      setMessage({ type: "success", text: "Cashout marked as completed!" })
      loadData()
    } catch (error) {
      setMessage({ type: "error", text: error.message })
    }
  }

  const handleInstantCashout = async (payroll) => {
    if (!confirm(`Are you sure you want to cash out ₱${payroll.netPay?.toFixed(2)}?`)) {
      return
    }

    setProcessingCashout(payroll.id)

    try {
      const response = await fetch("/api/cashout/instant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payrollId: payroll.id,
          employeeId: userData.employeeId,
          employeeName: employee.name,
          amount: payroll.netPay,
          description: `Instant cashout for ${(payroll.periodLabel || payroll.period || "current").replace(/\s+/g, " ")} payroll`,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to process cashout")
      }

      const data = await response.json()

      // Show receipt dialog
      toast.success("Cashout successful", {
        description: `Reference ${data.cashoutId} • ₱${payroll.netPay?.toFixed(2)} now on the way.`,
      })

      // Reload data to update status
      await loadData()

    } catch (error) {
      console.error("Cashout error:", error)
      toast.error("Cashout failed", {
        description: error.message,
      })
    } finally {
      setProcessingCashout(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="mx-auto" />
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Payroll</h1>
          <p className="text-slate-600 mt-1">View your payment history and request cashouts</p>
        </div>
        <Button size="lg" onClick={handleQuickCashout} disabled={getAvailableBalance() < 100}>
          <Wallet className="mr-2 h-4 w-4" />
          Request Cashout
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-4 mb-8">
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
            <CardTitle className="text-sm font-medium text-slate-600">Total Earnings</CardTitle>
            <TrendingUp className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱{getTotalEarnings().toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Available Balance</CardTitle>
            <Wallet className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">₱{getAvailableBalance().toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Payment Records</CardTitle>
            <Calendar className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{payrolls.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Cashout Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {cashoutRequests.length === 0 ? (
                <p className="text-center text-slate-500 py-4">No cashout requests yet</p>
              ) : (
                cashoutRequests.map((request) => (
                  <div key={request.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                    <div>
                      <p className="font-medium">₱{request.amount?.toFixed(2)}</p>
                      <p className="text-sm text-slate-600">
                        {request.method} - {request.createdAt?.toDate().toLocaleDateString()}
                      </p>
                      {request.transactionId && (
                        <p className="text-xs text-slate-500">Ref: {request.transactionId}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          request.status === "completed"
                            ? "default"
                            : request.status === "pending_payment"
                              ? "secondary"
                              : request.status === "processing"
                                ? "outline"
                                : "destructive"
                        }
                      >
                        {request.status === "pending_payment" ? "Pending Payment" : request.status}
                      </Badge>
                      {request.status === "pending_payment" && request.paymentLinkUrl && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => window.open(request.paymentLinkUrl, '_blank')}
                          >
                            Pay Now
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMarkAsPaid(request.id)}
                          >
                            Mark as Paid
                          </Button>
                        </div>
                      )}
                      {request.status === "completed" && request.transactionId && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(`/receipt/${request.transactionId}`, '_blank')}
                        >
                          Receipt
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {payrolls.length === 0 ? (
                <p className="text-center text-slate-500 py-4">No payroll records found</p>
              ) : (
                payrolls.slice(0, 5).map((payroll) => (
                  <div key={payroll.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                    <div>
                      <p className="font-medium whitespace-pre-line">
                        {payroll.periodLabel || payroll.period || "Not scheduled"}
                      </p>
                      <p className="text-sm text-slate-600">
                        {typeof payroll.totalHours === "number" ? `${payroll.totalHours.toFixed(2)} hours` : "Hours pending"}
                      </p>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <div>
                        <p className="font-bold text-green-600">₱{payroll.netPay?.toFixed(2) || 0}</p>
                        <Badge variant={payroll.status === "paid" ? "default" : "secondary"}>{payroll.status}</Badge>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <PaymentModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        amount={paymentAmount}
        employeeName={employee?.name || ""}
        employeeId={userData?.employeeId}
        onPaymentSuccess={handlePaymentSuccess}
        onPaymentError={(error) => setMessage({ type: "error", text: error })}
        onPaymentLinkCreated={(linkId) => setLastPaymentLinkId(linkId)}
      />
    </div>
  )
}
