"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getEmployees, getTimeLogs, addPayroll, getPayrolls, updatePayroll, getPayrollSettings, updateTimeLog } from "@/lib/firebase-service"
import { toast } from "sonner"
import { Timestamp } from "firebase/firestore"
import { Spinner } from "@/components/ui/spinner"

function computePayrollMetrics(timeLogs, period, minHoursThreshold = 8) {
  if (!Array.isArray(timeLogs)) {
    return {
      totalHours: 0,
      overtimeHours: 0,
      regularHours: 0,
      relevantLogs: [],
    }
  }

  const shouldFilterByPeriod = typeof period === "string" && period.length > 0
  const periodFilter = shouldFilterByPeriod ? period : new Date().toISOString().slice(0, 7)

  const relevantLogs = timeLogs.filter((log) => {
    if (!log.timeIn || !log.timeOut) return false
    const timeInDate = log.timeIn.toDate ? log.timeIn.toDate() : new Date(log.timeIn)
    if (!(timeInDate instanceof Date) || Number.isNaN(timeInDate.getTime())) {
      return false
    }

    if (!shouldFilterByPeriod) {
      return true
    }

    const logPeriod = `${timeInDate.getFullYear()}-${String(timeInDate.getMonth() + 1).padStart(2, "0")}`
    return logPeriod === periodFilter
  })

  let totalHours = 0
  let overtimeHours = 0

  relevantLogs.forEach((log) => {
    let hoursValue = 0
    if (typeof log.hoursWorked === "number") {
      hoursValue = log.hoursWorked
    } else if (log.timeIn && log.timeOut) {
      const timeInDate = log.timeIn.toDate ? log.timeIn.toDate() : new Date(log.timeIn)
      const timeOutDate = log.timeOut.toDate ? log.timeOut.toDate() : new Date(log.timeOut)
      if (
        timeInDate instanceof Date &&
        timeOutDate instanceof Date &&
        !Number.isNaN(timeInDate.getTime()) &&
        !Number.isNaN(timeOutDate.getTime())
      ) {
        const durationMs = timeOutDate - timeInDate
        hoursValue = durationMs / (1000 * 60 * 60)
      }
    }

    const roundedHours = Number.parseFloat((hoursValue || 0).toFixed(2))
    totalHours += roundedHours

    let overtimeForLog = 0
    if (typeof log.overtimeHours === "number") {
      overtimeForLog = log.overtimeHours
    } else {
      overtimeForLog = Math.max(0, roundedHours - (minHoursThreshold || 8))
    }

    overtimeHours += Number.parseFloat(overtimeForLog.toFixed(2))
  })

  totalHours = Number.parseFloat(totalHours.toFixed(2))
  overtimeHours = Number.parseFloat(overtimeHours.toFixed(2))

  const regularHours = Number.parseFloat(Math.max(0, totalHours - overtimeHours).toFixed(2))

  return {
    totalHours,
    overtimeHours,
    regularHours,
    relevantLogs,
  }
}

function buildTimeLogSummaries(logs, defaultHourlyRate = 0) {
  if (!Array.isArray(logs)) return []

  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  })

  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  })

  return logs
    .filter((log) => log?.timeIn && log?.timeOut)
    .map((log) => {
      const timeInDate = log.timeIn.toDate ? log.timeIn.toDate() : new Date(log.timeIn)
      const timeOutDate = log.timeOut.toDate ? log.timeOut.toDate() : new Date(log.timeOut)

      if (
        !(timeInDate instanceof Date) ||
        !(timeOutDate instanceof Date) ||
        Number.isNaN(timeInDate.getTime()) ||
        Number.isNaN(timeOutDate.getTime())
      ) {
        return null
      }

      const hourlyRate = log.hourlyRate || defaultHourlyRate
      const datePart = dateFormatter.format(timeInDate)
      const startTime = timeFormatter.format(timeInDate)
      const endTime = timeFormatter.format(timeOutDate)
      const ratePart = hourlyRate ? `${hourlyRate}/hr` : ""

      return `${datePart}\n${startTime} - ${endTime}${ratePart ? ` ${ratePart}` : ""}`
    })
    .filter(Boolean)
}

async function linkTimeLogsToPayroll(logs, payrollId) {
  if (!Array.isArray(logs) || logs.length === 0) return

  const timestamp = Timestamp.now()
  const updates = logs
    .filter((log) => log?.id)
    .map((log) =>
      updateTimeLog(log.id, {
        payrollId,
        payrollLinkedAt: timestamp,
      }),
    )

  await Promise.all(updates)
}

function getEndOfMonthDate(period) {
  if (typeof period === "string") {
    const matches = /^([0-9]{4})-([0-9]{2})$/.exec(period.trim())
    if (matches) {
      const year = Number.parseInt(matches[1], 10)
      const month = Number.parseInt(matches[2], 10)
      if (!Number.isNaN(year) && !Number.isNaN(month) && month >= 1 && month <= 12) {
        return new Date(year, month, 0, 23, 59, 59, 999)
      }
    }
  }

  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
}

function getAutoApprovalTimestamp(period) {
  const targetDate = getEndOfMonthDate(period)
  return Timestamp.fromDate(targetDate)
}

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

function formatAutoApprovalLabel(value) {
  const date = toDate(value)
  if (!date) {
    return "the scheduled time"
  }
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export default function PayrollPage() {
  const [employees, setEmployees] = useState([])
  const [payrolls, setPayrolls] = useState([])
  const [selectedEmployee, setSelectedEmployee] = useState("")
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [creditingPayrollId, setCreditingPayrollId] = useState(null)
  const [minHours, setMinHours] = useState(8)

  useEffect(() => {
    fetchData()
  }, [])

  async function autoApproveDuePayrolls(candidatePayrolls, employeesSnapshot) {
    if (!Array.isArray(candidatePayrolls) || candidatePayrolls.length === 0) {
      return false
    }

    let anyUpdated = false
    const now = new Date()

    for (const payroll of candidatePayrolls) {
      if (!payroll || payroll.status === "paid") {
        continue
      }

      const scheduledAt = toDate(payroll.autoApprovalScheduledAt)
      if (!scheduledAt || scheduledAt > now) {
        continue
      }

      const success = await settlePayroll(payroll, { auto: true, employeesSnapshot })
      if (success) {
        anyUpdated = true
      }
    }

    return anyUpdated
  }

  async function fetchData() {
    try {
      const [employeesData, payrollsData, payrollSettings] = await Promise.all([
        getEmployees(),
        getPayrolls(),
        getPayrollSettings(),
      ])
      setEmployees(employeesData)

      let finalPayrolls = payrollsData
      const autoUpdated = await autoApproveDuePayrolls(payrollsData, employeesData)
      if (autoUpdated) {
        finalPayrolls = await getPayrolls()
      }

      setPayrolls(finalPayrolls)
      const configuredMinHours = payrollSettings?.minHoursPerShift
      if (typeof configuredMinHours === "number" && configuredMinHours > 0) {
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

  async function handleGeneratePayroll() {
    if (!selectedEmployee) return

    setProcessing(true)
    try {
      const employee = employees.find((e) => e.id === selectedEmployee)
      if (!employee) {
        toast.error("Employee not found")
        return
      }

      console.log("Selected employee:", employee)
      console.log("Employee fields:", Object.keys(employee))
      console.log("Employee name:", employee.name)
      console.log("Employee email:", employee.email)

      // Get time logs for this employee
      const period = new Date().toISOString().slice(0, 7)
      const canonicalEmployeeId = employee.employeeId || employee.id
      const timeLogs = await getTimeLogs(canonicalEmployeeId)
      console.log("Time logs:", timeLogs)

      const unprocessedLogs = timeLogs.filter((log) => !log.payrollId)
      const { totalHours, overtimeHours, regularHours, relevantLogs } = computePayrollMetrics(
        unprocessedLogs,
        period,
        minHours,
      )

      console.log("Calculated hours:", { totalHours, overtimeHours, regularHours, minHours })
      const timeLogSummaries = buildTimeLogSummaries(relevantLogs, employee.hourlyRate || 0)
      const payrollLabel = timeLogSummaries.length > 0 ? timeLogSummaries.join("\n\n") : period

      if (totalHours === 0) {
        if (unprocessedLogs.length === 0 && timeLogs.length > 0) {
          toast.info(
            "No new time logs",
            {
              description:
                "All completed logs for this employee are already included in a previous payroll.",
            },
          )
          return
        }

        const manualHours = prompt(
          `No completed time logs found for ${employee.name || employee.email}. Enter hours worked this period:`,
          "40",
        )
        if (!manualHours || manualHours.trim() === "") {
          toast.warning("Payroll generation cancelled")
          return
        }
        const parsedManualHours = Number.parseFloat(manualHours)
        if (Number.isNaN(parsedManualHours) || parsedManualHours <= 0) {
          toast.error("Invalid hours entered")
          return
        }
        // Use manual entry, treat as regular hours
        const adjustedHours = Number.parseFloat(parsedManualHours.toFixed(2))
        const computedOvertime = Math.max(0, adjustedHours - (minHours || 8))
        const adjustedOvertime = Number.parseFloat(computedOvertime.toFixed(2))
        const adjustedRegular = Number.parseFloat(Math.max(0, adjustedHours - adjustedOvertime).toFixed(2))
        const payrollPeriod = period

        const overtimeRateMultiplier = 1.5
        const regularPay = adjustedRegular * (employee.hourlyRate || 0)
        const overtimePay = adjustedOvertime * (employee.hourlyRate || 0) * overtimeRateMultiplier
        const grossPay = regularPay + overtimePay
        const tax = grossPay * 0.1
        const deductions = grossPay * 0.05
        const netPay = grossPay - tax - deductions

        const manualLabel = `Manual entry ${payrollPeriod}`
        const autoApprovalScheduledAt = getAutoApprovalTimestamp(payrollPeriod)

        const payrollId = await addPayroll({
          employeeId: canonicalEmployeeId,
          employeeName: employee.name || employee.email,
          period: payrollPeriod,
          periodLabel: manualLabel,
          totalHours: adjustedHours,
          regularHours: adjustedRegular,
          overtimeHours: adjustedOvertime,
          hourlyRate: employee.hourlyRate || 0,
          grossPay,
          overtimePay,
          tax,
          deductions,
          netPay,
          status: "pending",
          generatedAt: Timestamp.now(),
          calculationBasis: "manual",
          timeLogIds: [],
          timeLogSummaries: [],
          autoApprovalScheduledAt,
          autoApproved: false,
          autoApprovedAt: null,
        })

        await linkTimeLogsToPayroll(relevantLogs, payrollId)

        const paymentInitiated = await initiatePayrollPayment({
          payrollId,
          amount: netPay,
          employeeName: employee.name || employee.email,
          periodLabel: manualLabel,
        })

        await fetchData()
        setSelectedEmployee("")
        const autoLabel = formatAutoApprovalLabel(autoApprovalScheduledAt)
        if (paymentInitiated) {
          toast.success("Payroll generated", {
            description: `Auto approval scheduled for ${autoLabel}.`,
          })
        } else {
          toast.warning("Payroll generated without payment link", {
            description: `Auto approval remains scheduled for ${autoLabel}.`,
          })
        }
        return
      }

      // Check if employee has hourly rate
      const hourlyRate = employee.hourlyRate || 0
      if (hourlyRate === 0) {
        toast.error("Hourly rate missing", {
          description: "Please update the employee details before generating payroll.",
        })
        return
      }

      const overtimeRateMultiplier = 1.5
      const regularPay = regularHours * hourlyRate
      const overtimePay = overtimeHours * hourlyRate * overtimeRateMultiplier
      const grossPay = regularPay + overtimePay
      const tax = grossPay * 0.1 // 10% tax placeholder
      const deductions = grossPay * 0.05 // 5% deductions placeholder
      const netPay = grossPay - tax - deductions

      console.log("Payroll calculation:", {
        totalHours,
        regularHours,
        overtimeHours,
        hourlyRate,
        grossPay,
        overtimePay,
        tax,
        deductions,
        netPay,
      })

      const autoApprovalScheduledAt = getAutoApprovalTimestamp(period)

      const payrollId = await addPayroll({
        employeeId: canonicalEmployeeId,
        employeeName: employee.name || employee.email,
        period,
        periodLabel: payrollLabel,
        totalHours,
        regularHours,
        overtimeHours,
        hourlyRate,
        grossPay,
        overtimePay,
        tax,
        deductions,
        netPay,
        status: "pending",
        generatedAt: Timestamp.now(),
        calculationBasis: "time_logs",
        timeLogIds: relevantLogs.map((log) => log.id),
        timeLogSummaries,
        autoApprovalScheduledAt,
        autoApproved: false,
        autoApprovedAt: null,
      })

      await linkTimeLogsToPayroll(relevantLogs, payrollId)

      const paymentInitiated = await initiatePayrollPayment({
        payrollId,
        amount: netPay,
        employeeName: employee.name || employee.email,
        periodLabel: payrollLabel,
      })

      await fetchData()
      setSelectedEmployee("")
      const autoLabel = formatAutoApprovalLabel(autoApprovalScheduledAt)
      if (paymentInitiated) {
        toast.success("Payroll generated", {
          description: `Auto approval scheduled for ${autoLabel}.`,
        })
      } else {
        toast.warning("Payroll generated without payment link", {
          description: `Auto approval remains scheduled for ${autoLabel}.`,
        })
      }
    } catch (error) {
      console.error("Error generating payroll:", error)
      toast.error("Failed to generate payroll", {
        description: error.message,
      })
    } finally {
      setProcessing(false)
    }
  }

  async function initiatePayrollPayment({ payrollId, amount, employeeName, periodLabel }) {
    try {
      const descriptorRaw = periodLabel && periodLabel.length > 0 ? periodLabel : "current period"
      const descriptor = descriptorRaw.replace(/\s+/g, " ").trim()
      const response = await fetch("/api/paymongo/process-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          description: `Payroll for ${employeeName} - ${descriptor}`,
          payrollId,
        }),
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}))
        console.error("Failed to initiate payroll payment:", errorPayload)
        return false
      }

      const data = await response.json()
      console.log("Automatic payroll payment link created:", data)
      return true
    } catch (error) {
      console.error("Error initiating payroll payment:", error)
      return false
    }
  }

  async function settlePayroll(payroll, { auto = false, employeesSnapshot = null } = {}) {
    if (!payroll) return false

    try {
      const roster = Array.isArray(employeesSnapshot) && employeesSnapshot.length > 0 ? employeesSnapshot : employees
      const employee = roster.find(
        (candidate) => candidate.employeeId === payroll.employeeId || candidate.id === payroll.employeeId,
      )

      if (!employee) {
        if (!auto) {
          toast.error("Employee not found", {
            description: "Please refresh and try again.",
          })
        } else {
          console.warn("Skipping auto-approval; employee record missing for payroll", payroll.id)
        }
        return false
      }

      const timeLogs = await getTimeLogs(payroll.employeeId)
      const linkedLogs = timeLogs.filter((log) => log.payrollId === payroll.id)

      let totalHours = typeof payroll.totalHours === "number" ? payroll.totalHours : 0
      let overtimeHours = typeof payroll.overtimeHours === "number" ? payroll.overtimeHours : 0
      let regularHours = typeof payroll.regularHours === "number" ? payroll.regularHours : 0
      let hourlyRate = payroll.hourlyRate || employee.hourlyRate || 0
      let grossPay = typeof payroll.grossPay === "number" ? payroll.grossPay : 0
      let overtimePay = typeof payroll.overtimePay === "number" ? payroll.overtimePay : 0
      let tax = typeof payroll.tax === "number" ? payroll.tax : 0
      let deductions = typeof payroll.deductions === "number" ? payroll.deductions : 0
      let netPay = typeof payroll.netPay === "number" ? payroll.netPay : 0
      let calculationBasis = payroll.calculationBasis || "time_logs"
      let periodLabel = payroll.periodLabel || payroll.period
      let timeLogSummaries = Array.isArray(payroll.timeLogSummaries) ? payroll.timeLogSummaries : []

      if (linkedLogs.length > 0) {
        const metrics = computePayrollMetrics(linkedLogs, null, minHours)

        if (metrics.totalHours <= 0) {
          if (!auto) {
            toast.warning("No completed time logs", {
              description: "Unable to approve payroll without completed entries.",
            })
          } else {
            console.warn("Skipping auto-approval; no completed time logs for payroll", payroll.id)
          }
          return false
        }

        totalHours = metrics.totalHours
        overtimeHours = metrics.overtimeHours
        regularHours = metrics.regularHours
        calculationBasis = "time_logs"

        if (!hourlyRate) {
          hourlyRate = employee.hourlyRate || 0
        }

        if (!hourlyRate) {
          if (!auto) {
            toast.error("Hourly rate missing", {
              description: "Please update the employee record before approving payroll.",
            })
          } else {
            console.warn("Skipping auto-approval; hourly rate missing for payroll", payroll.id)
          }
          return false
        }

        const overtimeRateMultiplier = 1.5
        const regularPay = regularHours * hourlyRate
        const overtimeComponent = overtimeHours * hourlyRate * overtimeRateMultiplier
        grossPay = regularPay + overtimeComponent
        overtimePay = overtimeComponent
        tax = grossPay * 0.1
        deductions = grossPay * 0.05
        netPay = grossPay - tax - deductions
        timeLogSummaries = buildTimeLogSummaries(linkedLogs, hourlyRate)
        if (timeLogSummaries.length > 0) {
          periodLabel = timeLogSummaries.join("\n\n")
        }
      } else if (calculationBasis !== "manual" && hourlyRate === 0 && netPay === 0) {
        if (!auto) {
          toast.error("Payroll data incomplete", {
            description: "Verify hourly rate and time logs before approving.",
          })
        } else {
          console.warn("Skipping auto-approval; insufficient payroll data", payroll.id)
        }
        return false
      }

      const nowTs = Timestamp.now()

      await updatePayroll(payroll.id, {
        totalHours,
        regularHours,
        overtimeHours,
        hourlyRate,
        grossPay,
        overtimePay,
        tax,
        deductions,
        netPay,
        status: "paid",
        paidAt: nowTs,
        calculationBasis,
        periodLabel,
        timeLogSummaries,
        autoApproved: auto,
        autoApprovedAt: auto ? nowTs : (payroll.autoApprovedAt ?? null),
      })

      return true
    } catch (error) {
      if (!auto) {
        console.error("Error crediting payroll:", error)
        toast.error("Failed to credit payroll", {
          description: error.message,
        })
      } else {
        console.error("Auto-approval failed for payroll", payroll?.id, error)
      }
      return false
    }
  }

  async function handleCreditPayroll(payroll) {
    if (!payroll) return

    if (!confirm(`Mark payroll for ${payroll.employeeName} as paid using latest time logs?`)) {
      return
    }

    setCreditingPayrollId(payroll.id)

    try {
      const success = await settlePayroll(payroll)
      if (success) {
        await fetchData()
        toast.success("Payroll approved", {
          description: `${payroll.employeeName} can now cash out.`,
        })
      }
    } catch (error) {
      console.error("Error crediting payroll:", error)
      toast.error("Failed to credit payroll", {
        description: error.message,
      })
    } finally {
      setCreditingPayrollId(null)
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
      <h1 className="mb-8 text-3xl font-bold text-slate-900">Payroll</h1>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Generate Payroll</CardTitle>
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
                      {employee.name || employee.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleGeneratePayroll} disabled={!selectedEmployee || processing}>
              {processing ? "Generating..." : "Generate Payroll"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payroll History</CardTitle>
        </CardHeader>
        <CardContent>
          {payrolls.length === 0 ? (
            <p className="text-slate-500">No payroll records yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="pb-3 text-left font-medium text-slate-600">Employee</th>
                    <th className="pb-3 text-left font-medium text-slate-600">Period / Time Logs</th>
                    <th className="pb-3 text-left font-medium text-slate-600">Regular Hours</th>
                    <th className="pb-3 text-left font-medium text-slate-600">OT Hours</th>
                    <th className="pb-3 text-left font-medium text-slate-600">Total Hours</th>
                    <th className="pb-3 text-left font-medium text-slate-600">Gross Pay</th>
                    <th className="pb-3 text-left font-medium text-slate-600">Net Pay</th>
                    <th className="pb-3 text-left font-medium text-slate-600">Status</th>
                    <th className="pb-3 text-right font-medium text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payrolls.map((payroll) => (
                    <tr key={payroll.id} className="border-b last:border-0">
                      <td className="py-4">{payroll.employeeName}</td>
                      <td className="py-4 whitespace-pre-line">{payroll.periodLabel || payroll.period}</td>
                      <td className="py-4">{typeof payroll.regularHours === "number" ? `${payroll.regularHours.toFixed(2)}h` : "-"}</td>
                      <td className="py-4">{typeof payroll.overtimeHours === "number" ? `${payroll.overtimeHours.toFixed(2)}h` : "-"}</td>
                      <td className="py-4">{typeof payroll.totalHours === "number" ? `${payroll.totalHours.toFixed(2)}h` : "-"}</td>
                      <td className="py-4">₱{payroll.grossPay?.toLocaleString()}</td>
                      <td className="py-4">₱{payroll.netPay?.toLocaleString()}</td>
                      <td className="py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-sm ${
                            payroll.status === "paid"
                              ? "bg-green-100 text-green-700"
                              : payroll.status === "processing"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {payroll.status}
                        </span>
                      </td>
                      <td className="py-4 text-right">
                        {payroll.status !== "paid" && (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCreditPayroll(payroll)}
                              disabled={creditingPayrollId === payroll.id}
                            >
                              {creditingPayrollId === payroll.id ? "Approving..." : "Approve Payout"}
                            </Button>
                          </div>
                        )}
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
