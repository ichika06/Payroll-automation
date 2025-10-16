"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Users, Clock, PhilippinePeso, TrendingUp } from "lucide-react"
import { getEmployees, getTimeLogs, getPayrolls, getPayrollSettings, updatePayrollSettings } from "@/lib/firebase-service"
import { toast } from "sonner"

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalEmployees: 0,
    activeLogs: 0,
    totalPayroll: 0,
    recentLogs: [],
    teamMembers: [],
  })
  const [loading, setLoading] = useState(true)
  const [minHours, setMinHours] = useState(8)
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsUpdatedAt, setSettingsUpdatedAt] = useState(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const [employees, timeLogs, payrolls, payrollSettings] = await Promise.all([
          getEmployees(),
          getTimeLogs(),
          getPayrolls(),
          getPayrollSettings(),
        ])

    const activeLogs = timeLogs.filter((log) => !log.timeOut).length
    const totalPayroll = payrolls.reduce((sum, p) => sum + (p.netPay || 0), 0)
    const recentLogs = timeLogs.slice(0, 5)

    const configuredMinHours = payrollSettings?.minHoursPerShift
    setMinHours(typeof configuredMinHours === "number" ? configuredMinHours : 8)
    const updatedAtValue = payrollSettings?.updatedAt
    setSettingsUpdatedAt(updatedAtValue?.toDate ? updatedAtValue.toDate() : null)

        setStats({
          totalEmployees: employees.length,
          activeLogs,
          totalPayroll,
          recentLogs,
          teamMembers: employees.slice(0, 5),
        })
      } catch (error) {
        console.error("Error fetching dashboard data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const handleSaveSettings = async () => {
    const numericMinHours = Number(minHours)
    if (Number.isNaN(numericMinHours) || numericMinHours <= 0) {
      toast.error("Invalid minimum hours", {
        description: "Please enter a value greater than zero.",
      })
      return
    }

    setSavingSettings(true)
    try {
      await updatePayrollSettings({ minHoursPerShift: numericMinHours })
      setMinHours(numericMinHours)
      setSettingsUpdatedAt(new Date())
      toast.success("Minimum hours updated")
    } catch (error) {
      console.error("Failed to update payroll settings:", error)
      toast.error("Failed to save minimum hours setting")
    } finally {
      setSavingSettings(false)
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
      <h1 className="mb-8 text-3xl font-bold text-slate-900">Dashboard</h1>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Payroll Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <Label htmlFor="min-hours-input">Minimum hours per shift before overtime</Label>
              <Input
                id="min-hours-input"
                type="number"
                min={1}
                step="0.25"
                value={minHours}
                onChange={(event) => setMinHours(event.target.value)}
                className="mt-2"
              />
              <p className="mt-2 text-xs text-slate-500">
                Employees will be flagged for overtime when they exceed this threshold on a single shift.
                {settingsUpdatedAt && (
                  <span className="ml-2 italic">
                    Last updated {settingsUpdatedAt.toLocaleString()}
                  </span>
                )}
              </p>
            </div>
            <Button onClick={handleSaveSettings} disabled={savingSettings} className="md:w-auto">
              {savingSettings ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEmployees}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Active Clock-ins</CardTitle>
            <Clock className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeLogs}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Payroll</CardTitle>
            <PhilippinePeso className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱{stats.totalPayroll.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Growth</CardTitle>
            <TrendingUp className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+12%</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Time Logs</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recentLogs.length === 0 ? (
            <p className="text-slate-500">No time logs yet</p>
          ) : (
            <div className="space-y-4">
              {stats.recentLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                  <div>
                    <p className="font-medium">{log.employeeName}</p>
                    <p className="text-sm text-slate-500">{log.timeIn?.toDate().toLocaleString()}</p>
                  </div>
                  <div
                    className={`rounded-full px-3 py-1 text-sm ${
                      log.timeOut ? "bg-slate-100 text-slate-700" : "bg-green-100 text-green-700"
                    }`}
                  >
                    {log.timeOut ? "Completed" : "Active"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Team Snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.teamMembers.length === 0 ? (
            <p className="text-slate-500">No employees registered yet</p>
          ) : (
            <div className="space-y-3">
              {stats.teamMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 overflow-hidden rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center">
                      {member.profilePhoto ? (
                        <img src={member.profilePhoto} alt={member.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs font-semibold text-slate-600">
                          {member.name
                            ?.split(" ")
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((part) => part[0]?.toUpperCase() || "")
                            .join("") || "?"}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{member.name}</p>
                      <p className="text-xs text-slate-500">{member.position || "No position"}</p>
                    </div>
                  </div>
                  <span className="text-xs text-slate-500">{member.department || "Unassigned"}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
