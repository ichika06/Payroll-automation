"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { getCashoutRequests, getNotifications, markNotificationRead } from "@/lib/firebase-service"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Inbox, Receipt, CheckCircle, Clock } from "lucide-react"

export default function EmployeeInbox() {
  const { userData } = useAuth()
  const [cashouts, setCashouts] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [markingNotificationId, setMarkingNotificationId] = useState(null)

  useEffect(() => {
    loadData()
  }, [userData])

  const loadData = async () => {
    if (!userData?.employeeId) return

    try {
      setLoading(true)
      const [cashoutData, notificationData] = await Promise.all([
        getCashoutRequests(userData.employeeId),
        getNotifications({ recipientType: "employee", employeeId: userData.employeeId }),
      ])
      // Filter only completed cashouts for the inbox
      const completedCashouts = cashoutData.filter(c => c.status === "completed")
      setCashouts(completedCashouts)
      setNotifications(notificationData)
    } catch (error) {
      console.error("Error loading inbox:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleNotificationRead = async (notificationId) => {
    if (!notificationId) return
    setMarkingNotificationId(notificationId)
    try {
      await markNotificationRead(notificationId)
      await loadData()
    } catch (error) {
      console.error("Failed to mark notification as read:", error)
    } finally {
      setMarkingNotificationId(null)
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Inbox</h1>
        <p className="text-slate-600 mt-1">Your payment receipts and notifications</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {notifications.length === 0 ? (
                <div className="text-center py-8 text-slate-500">No new notifications</div>
              ) : (
                notifications.map((notification) => {
                  const overtimeValue = typeof notification.overtimeHours === "number"
                    ? notification.overtimeHours
                    : Number(notification.overtimeHours)
                  const showOvertime = !Number.isNaN(overtimeValue) && overtimeValue > 0

                  return (
                    <div key={notification.id} className="flex items-start justify-between gap-4 border-b pb-4 last:border-0">
                      <div>
                        <p className="font-medium text-slate-900">{notification.title || "Notification"}</p>
                        <p className="text-sm text-slate-600 mt-1">{notification.message}</p>
                        {showOvertime && (
                          <p className="text-xs text-orange-600 mt-1">
                            Overtime credited: {overtimeValue.toFixed(2)} hrs
                          </p>
                        )}
                        <Badge variant={notification.read ? "secondary" : "default"} className="mt-2">
                          {notification.read ? "Read" : "New"}
                        </Badge>
                        <p className="text-xs text-slate-400 mt-1">
                          {notification.createdAt?.toDate?.() ? notification.createdAt.toDate().toLocaleString() : ""}
                        </p>
                      </div>
                      {!notification.read && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleNotificationRead(notification.id)}
                          disabled={markingNotificationId === notification.id}
                        >
                          {markingNotificationId === notification.id ? "Marking..." : "Mark as Read"}
                        </Button>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Payment Receipts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {cashouts.length === 0 ? (
                <div className="text-center py-8">
                  <Inbox className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                  <p className="text-slate-500">No payment receipts yet</p>
                  <p className="text-sm text-slate-400 mt-1">Completed cashouts will appear here</p>
                </div>
              ) : (
                cashouts.map((cashout) => (
                  <div key={cashout.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0">
                        <CheckCircle className="h-8 w-8 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">Payment Successful</p>
                        <p className="text-sm text-slate-600">
                          ₱{cashout.amount?.toFixed(2)} - {cashout.method}
                        </p>
                        <p className="text-xs text-slate-500">
                          {cashout.completedAt?.toDate().toLocaleString()}
                        </p>
                        {cashout.transactionId && (
                          <p className="text-xs text-slate-400">Ref: {cashout.transactionId}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        Completed
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(`/receipt/${cashout.transactionId}`, '_blank')}
                      >
                        <Receipt className="h-4 w-4 mr-1" />
                        Receipt
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Future: Add other notification types */}
      </div>
    </div>
  )
}