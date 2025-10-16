"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { getTimeLogs, getPayrollSettings } from "@/lib/firebase-service"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export default function EmployeeTimeLogs() {
  const { userData } = useAuth()
  const [timeLogs, setTimeLogs] = useState([])
  const [filteredLogs, setFilteredLogs] = useState([])
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(true)
  const [minHours, setMinHours] = useState(8)

  useEffect(() => {
    loadTimeLogs()
  }, [userData])

  useEffect(() => {
    if (searchTerm) {
      const filtered = timeLogs.filter((log) => {
        const date = log.timeIn.toDate().toLocaleDateString().toLowerCase()
        return date.includes(searchTerm.toLowerCase())
      })
      setFilteredLogs(filtered)
    } else {
      setFilteredLogs(timeLogs)
    }
  }, [searchTerm, timeLogs])

  const loadTimeLogs = async () => {
    if (!userData?.employeeId) return

    try {
      const [logs, payrollSettings] = await Promise.all([
        getTimeLogs(userData.employeeId),
        getPayrollSettings(),
      ])
      setTimeLogs(logs)
      setFilteredLogs(logs)
      const configuredMinHours = payrollSettings?.minHoursPerShift
      if (typeof configuredMinHours === "number") {
        setMinHours(configuredMinHours)
      }
    } catch (error) {
      console.error("Error loading time logs:", error)
    } finally {
      setLoading(false)
    }
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Time Logs</h1>
        <p className="text-slate-600 mt-1">View your complete time tracking history</p>
        <p className="text-xs text-slate-500 mt-1">Overtime is recorded for any shift exceeding {minHours} hours.</p>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by date..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Time Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredLogs.map((log) => {
              const rawHours = log.timeOut
                ? (log.timeOut.toDate() - log.timeIn.toDate()) / (1000 * 60 * 60)
                : null
              const hours = rawHours !== null ? rawHours.toFixed(2) : null
              const overtime = typeof log.overtimeHours === "number"
                ? log.overtimeHours.toFixed(2)
                : rawHours !== null
                  ? Math.max(0, rawHours - (minHours || 8)).toFixed(2)
                  : null

              return (
                <div key={log.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                  <div>
                    <p className="font-medium text-lg">
                      {log.timeIn.toDate().toLocaleDateString("en-US", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                    <p className="text-sm text-slate-600 mt-1">Time In: {log.timeIn.toDate().toLocaleTimeString()}</p>
                    <p className="text-sm text-slate-600">
                      Time Out: {log.timeOut ? log.timeOut.toDate().toLocaleTimeString() : "Still active"}
                    </p>
                    {overtime && Number(overtime) > 0 && (
                      <p className="text-xs text-orange-600 mt-1">Overtime credited: {overtime} hrs</p>
                    )}
                  </div>
                  <div className="text-right">
                    <Badge className="font-bold text-slate-100">{hours ? `${hours} hrs` : "Active"}</Badge>
                  </div>
                </div>
              )
            })}

            {filteredLogs.length === 0 && <p className="text-center text-slate-500 py-8">No time logs found</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
