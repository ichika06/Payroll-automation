"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LogIn, LogOut } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import {
  getEmployees,
  getTimeLogs,
  addTimeLog,
  updateTimeLog,
  getActiveTimeLog,
  getPayrollSettings,
  addNotification,
} from "@/lib/firebase-service"
import { Timestamp } from "firebase/firestore"
import { toast } from "sonner"

export default function LogsPage() {
  const [employees, setEmployees] = useState([])
  const [timeLogs, setTimeLogs] = useState([])
  const [selectedEmployee, setSelectedEmployee] = useState("")
  const [activeLog, setActiveLog] = useState(null)
  const [loading, setLoading] = useState(true)
  const [minHours, setMinHours] = useState(8)

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (selectedEmployee) {
      checkActiveLog()
    }
  }, [selectedEmployee])

  async function fetchData() {
    try {
      const [employeesData, logsData, settingsData] = await Promise.all([
        getEmployees(),
        getTimeLogs(),
        getPayrollSettings(),
      ])
      setEmployees(employeesData)
      setTimeLogs(logsData)
      const configuredMinHours = settingsData?.minHoursPerShift
      if (configuredMinHours && typeof configuredMinHours === "number") {
        setMinHours(configuredMinHours)
      } else {
        setMinHours(8)
      }
    } catch (error) {
      console.error("Error fetching data:", error)
    } finally {
      setLoading(false)
    }
  }

  async function checkActiveLog() {
    try {
      const employee = employees.find((candidate) => candidate.id === selectedEmployee)
      const canonicalEmployeeId = employee?.employeeId || selectedEmployee
      if (!canonicalEmployeeId) {
        setActiveLog(null)
        return
      }
      const active = await getActiveTimeLog(canonicalEmployeeId)
      setActiveLog(active)
    } catch (error) {
      console.error("Error checking active log:", error)
    }
  }

  async function handleClockIn() {
    if (!selectedEmployee) return

    try {
      const employee = employees.find((e) => e.id === selectedEmployee)
      if (!employee) {
        toast.error("Employee record not found", {
          description: "Please refresh and try again.",
        })
        return
      }
      const employeeDisplayName = employee
        ? [employee.firstName, employee.lastName].filter(Boolean).join(" ") || employee.name || employee.email
        : "Employee"

      await addTimeLog({
        employeeId: employee.employeeId || selectedEmployee, // Use employeeId if available, otherwise use selectedEmployee
        employeeName: employeeDisplayName, // Use name field or email as fallback
        timeIn: Timestamp.now(),
        timeOut: null,
      })
      await fetchData()
      await checkActiveLog()
    } catch (error) {
      console.error("Error clocking in:", error)
      toast.error("Failed to time in")
    }
  }

  async function handleClockOut() {
    if (!activeLog) return

    try {
      const timeOut = Timestamp.now()
      const timeIn = activeLog.timeIn.toDate()
      const hoursWorked = (timeOut.toDate() - timeIn) / (1000 * 60 * 60)
      const roundedHours = Number.parseFloat(hoursWorked.toFixed(2))
      const overtime = Math.max(0, roundedHours - (minHours || 8))
      const roundedOvertime = Number.parseFloat(overtime.toFixed(2))

      await updateTimeLog(activeLog.id, {
        timeOut,
        hoursWorked: roundedHours,
        overtimeHours: roundedOvertime,
      })

      if (roundedOvertime > 0) {
        const employee = employees.find((e) => e.id === selectedEmployee)
        const employeeDisplayName = employee
          ? [employee.firstName, employee.lastName].filter(Boolean).join(" ") || employee.name || employee.email
          : activeLog.employeeName
        const canonicalEmployeeId = employee?.employeeId || activeLog.employeeId || selectedEmployee

        const baseNotification = {
          type: "overtime",
          employeeId: canonicalEmployeeId,
          employeeName: employeeDisplayName,
          hoursWorked: roundedHours,
          overtimeHours: roundedOvertime,
          timeLogId: activeLog.id,
          shiftDate: activeLog.timeIn,
        }

        try {
          await Promise.all([
            addNotification({
              ...baseNotification,
              recipientType: "admin",
              title: "Overtime detected",
              message: `${employeeDisplayName} logged ${roundedOvertime.toFixed(2)} overtime hours.`,
            }),
            addNotification({
              ...baseNotification,
              recipientType: "employee",
              title: "Overtime recorded",
              message: `You recorded ${roundedOvertime.toFixed(2)} overtime hours.`,
            }),
          ])
        } catch (notificationError) {
          console.error("Failed to record overtime notification:", notificationError)
        }
      }
      await fetchData()
      setActiveLog(null)
    } catch (error) {
      console.error("Error clocking out:", error)
      toast.error("Failed to time out")
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
      <h1 className="mb-8 text-3xl font-bold text-slate-900">Time Logs</h1>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Time In/Out</CardTitle>
          <p className="text-sm text-slate-500">Current overtime threshold: {minHours} hours per shift.</p>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {[employee.firstName, employee.lastName].filter(Boolean).join(" ") || employee.name || employee.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {activeLog ? (
              <Button onClick={handleClockOut} variant="destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Time Out
              </Button>
            ) : (
              <Button onClick={handleClockIn} disabled={!selectedEmployee}>
                <LogIn className="mr-2 h-4 w-4" />
                Time In
              </Button>
            )}
          </div>
          {activeLog && (
            <div className="mt-4 rounded-lg bg-green-50 p-4">
              <p className="text-sm font-medium text-green-900">
                Currently clocked in since {activeLog.timeIn.toDate().toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-green-700">
                Overtime applies after {minHours} hours worked for a shift.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Time Log History</CardTitle>
          <p className="text-sm text-slate-500">Overtime triggers after {minHours} hours on a single shift.</p>
        </CardHeader>
        <CardContent>
          {timeLogs.length === 0 ? (
            <p className="text-slate-500">No time logs yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="pb-3 text-left font-medium text-slate-600">Employee</th>
                    <th className="pb-3 text-left font-medium text-slate-600">Time In</th>
                    <th className="pb-3 text-left font-medium text-slate-600">Time Out</th>
                    <th className="pb-3 text-left font-medium text-slate-600">Hours</th>
                    <th className="pb-3 text-left font-medium text-slate-600">OT Hours</th>
                    <th className="pb-3 text-left font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {timeLogs.map((log) => (
                    <tr key={log.id} className="border-b last:border-0">
                      <td className="py-4">{log.employeeName}</td>
                      <td className="py-4">{log.timeIn?.toDate().toLocaleString()}</td>
                      <td className="py-4">{log.timeOut ? log.timeOut.toDate().toLocaleString() : "-"}</td>
                      <td className="py-4">{log.hoursWorked ? `${log.hoursWorked.toFixed(2)}h` : "-"}</td>
                      <td className="py-4">{log.overtimeHours ? `${log.overtimeHours.toFixed(2)}h` : "-"}</td>
                      <td className="py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-sm ${
                            log.timeOut ? "bg-slate-100 text-slate-700" : "bg-green-100 text-green-700"
                          }`}
                        >
                          {log.timeOut ? "Completed" : "Active"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
