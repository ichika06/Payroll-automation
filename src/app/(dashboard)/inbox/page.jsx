"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Bell, Clock } from "lucide-react"
import { getNotifications, markNotificationRead } from "@/lib/firebase-service"

export default function AdminInboxPage() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [markingNotificationId, setMarkingNotificationId] = useState(null)

  useEffect(() => {
    loadNotifications()
  }, [])

  const loadNotifications = async () => {
    setLoading(true)
    try {
      const data = await getNotifications({ recipientType: "admin" })
      setNotifications(data)
    } catch (error) {
      console.error("Failed to fetch notifications:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleMarkRead = async (notificationId) => {
    if (!notificationId) return
    setMarkingNotificationId(notificationId)

    try {
      await markNotificationRead(notificationId)
      await loadNotifications()
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
        <h1 className="text-3xl font-bold text-slate-900">Admin Inbox</h1>
        <p className="mt-1 text-slate-600">Track overtime alerts and system notifications.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <div className="py-12 text-center text-slate-500">No notifications yet</div>
          ) : (
            <div className="space-y-4">
              {notifications.map((notification) => {
                const createdAt = notification.createdAt?.toDate?.()
                const overtimeValue = typeof notification.overtimeHours === "number"
                  ? notification.overtimeHours
                  : Number(notification.overtimeHours)
                const showOvertime = !Number.isNaN(overtimeValue) && overtimeValue > 0
                return (
                  <div key={notification.id} className="flex items-start justify-between gap-4 border-b pb-4 last:border-0">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                        {notification.type === "overtime" ? <Clock className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{notification.title || "Notification"}</p>
                        <p className="mt-1 text-sm text-slate-600">{notification.message}</p>
                        {notification.employeeName && (
                          <p className="mt-1 text-xs text-slate-500">Employee: {notification.employeeName}</p>
                        )}
                        {showOvertime && (
                          <p className="mt-1 text-xs text-orange-600">
                            Overtime recorded: {overtimeValue.toFixed(2)} hrs
                          </p>
                        )}
                        {createdAt && (
                          <p className="mt-1 text-xs text-slate-400">{createdAt.toLocaleString()}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={notification.read ? "secondary" : "default"}>
                        {notification.read ? "Read" : "New"}
                      </Badge>
                      {!notification.read && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMarkRead(notification.id)}
                          disabled={markingNotificationId === notification.id}
                        >
                          {markingNotificationId === notification.id ? "Marking..." : "Mark as Read"}
                        </Button>
                      )}
                      {notification.read && notification.readAt?.toDate?.() && (
                        <span className="text-xs text-slate-400">
                          Read {notification.readAt.toDate().toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
