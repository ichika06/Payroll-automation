"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  getEmployees,
  getTimeLogs,
  addPayroll,
  getPayrolls,
  updatePayroll,
  getPayrollSettings,
  updateTimeLog,
  getApprovedLeavesInRange,
  addLeavePayment,
  getLeavePaymentsByEmployeeAndPayroll,
  deleteLeavePayment,
} from "@/lib/firebase-service"
import { generatePayslipPDF } from "@/lib/payslip-export"
import { toast } from "sonner"
import { Timestamp } from "firebase/firestore"
import { Spinner } from "@/components/ui/spinner"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

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

function toMoney(value) {
  if (value == null) {
    return 0
  }

  const numeric = typeof value === "number" ? value : Number.parseFloat(value)
  if (!Number.isFinite(numeric)) {
    return 0
  }

  return Number.parseFloat(numeric.toFixed(2))
}

function formatCurrency(value) {
  const formatter = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  })

  return formatter.format(value ?? 0)
}

function getPeriodDateRange(period) {
  if (typeof period === "string") {
    const trimmed = period.trim()
    const matches = /^([0-9]{4})-([0-9]{2})$/.exec(trimmed)
    if (matches) {
      const year = Number.parseInt(matches[1], 10)
      const monthIndex = Number.parseInt(matches[2], 10) - 1
      if (Number.isInteger(year) && Number.isInteger(monthIndex) && monthIndex >= 0 && monthIndex <= 11) {
        const startDate = new Date(year, monthIndex, 1)
        const endDate = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999)
        return { startDate, endDate }
      }
    }
  }

  const now = new Date()
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1)
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  return { startDate, endDate }
}

function enumerateDateRange(startDate, endDate) {
  const dates = []
  if (!(startDate instanceof Date) || !(endDate instanceof Date) || startDate > endDate) {
    return dates
  }

  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
  const last = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())

  while (cursor <= last) {
    dates.push(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()))
    cursor.setDate(cursor.getDate() + 1)
  }

  return dates
}

function isWeekend(date) {
  const day = date.getDay()
  return day === 0 || day === 6
}

function formatDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function listBusinessDayKeys(startDate, endDate) {
  return enumerateDateRange(startDate, endDate)
    .filter((date) => !isWeekend(date))
    .map((date) => formatDateKey(date))
}

function deriveLeaveDayKeys(leave, rangeStart, rangeEnd) {
  if (!leave) {
    return []
  }

  const rawStart = toDate(leave.startDate || leave.date || leave.fromDate)
  const rawEnd = toDate(leave.endDate || leave.date || leave.toDate || leave.startDate)

  if (!rawStart) {
    return []
  }

  const effectiveStart = rawStart > rangeStart ? rawStart : new Date(rangeStart)
  const effectiveEnd = rawEnd && rawEnd < rangeEnd ? rawEnd : new Date(rangeEnd)

  if (effectiveEnd < effectiveStart) {
    return []
  }

  return listBusinessDayKeys(effectiveStart, effectiveEnd)
}

function isLeavePaid(leave) {
  if (!leave) {
    return false
  }

  if (typeof leave.isPaid === "boolean") {
    return leave.isPaid
  }

  if (typeof leave.withPay === "boolean") {
    return leave.withPay
  }

  if (typeof leave.paid === "boolean") {
    return leave.paid
  }

  if (typeof leave.payStatus === "string") {
    const normalized = leave.payStatus.toLowerCase()
    if (normalized.includes("paid")) {
      return true
    }
    if (normalized.includes("unpaid") || normalized.includes("without")) {
      return false
    }
  }

  const typeLabel = String(leave.leaveType || leave.type || leave.category || "").toLowerCase()
  if (!typeLabel) {
    return false
  }

  if (typeLabel.includes("unpaid") || typeLabel.includes("lwop") || typeLabel.includes("without pay")) {
    return false
  }

  if (typeLabel.includes("paid")) {
    return true
  }

  if (
    typeLabel.includes("vacation") ||
    typeLabel.includes("sick") ||
    typeLabel.includes("maternity") ||
    typeLabel.includes("paternity") ||
    typeLabel.includes("bereavement") ||
    typeLabel.includes("emergency")
  ) {
    return true
  }

  return false
}

async function deriveAttendanceAdjustments({
  employeeId,
  period,
  minHours,
  hourlyRate,
  relevantLogs,
  treatUnworkedDaysAsAbsence = true,
}) {
  const { startDate, endDate } = getPeriodDateRange(period)
  const periodRange = {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  }

  const businessDayKeys = listBusinessDayKeys(startDate, endDate)
  const businessDaySet = new Set(businessDayKeys)

  const shiftHours = typeof minHours === "number" && minHours > 0 ? minHours : 8
  const hourly = typeof hourlyRate === "number" ? hourlyRate : Number.parseFloat(hourlyRate)
  const hourlyValue = Number.isFinite(hourly) ? hourly : 0
  const dailyRate = toMoney(hourlyValue * shiftHours)

  const defaults = {
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    absenceDays: 0,
    paidLeaveDates: [],
    unpaidLeaveDates: [],
    absenceDates: [],
    workingDays: businessDayKeys.length,
    workedDays: 0,
    dailyRate,
    absenceDeduction: 0,
    leaveDeduction: 0,
    totalAttendanceDeduction: 0,
    periodRange,
  }

  if (businessDayKeys.length === 0 || hourlyValue <= 0) {
    return defaults
  }

  const logDaySet = new Set()
  const absentDaySet = new Set()
  const logsArray = Array.isArray(relevantLogs) ? relevantLogs : []

  logsArray.forEach((log) => {
    if (!log || !log.timeIn) {
      return
    }

    const timeInDate = toDate(log.timeIn)
    if (!timeInDate) {
      return
    }

    if (timeInDate < startDate || timeInDate > endDate) {
      return
    }

    const key = formatDateKey(timeInDate)
    
    // Check if marked as absent
    if (log.isAbsent) {
      absentDaySet.add(key)
    } else {
      logDaySet.add(key)
    }
  })

  const workedDayKeys = new Set()
  logDaySet.forEach((key) => {
    if (businessDaySet.has(key)) {
      workedDayKeys.add(key)
    }
  })

  const leaves = await getApprovedLeavesInRange(employeeId, startDate, endDate)
  const paidLeaveSet = new Set()
  const unpaidLeaveSet = new Set()

  leaves.forEach((leave) => {
    const leaveDayKeys = deriveLeaveDayKeys(leave, startDate, endDate)
    if (leaveDayKeys.length === 0) {
      return
    }

    const paid = isLeavePaid(leave)
    leaveDayKeys.forEach((dayKey) => {
      if (!businessDaySet.has(dayKey) || workedDayKeys.has(dayKey)) {
        return
      }

      if (paid) {
        paidLeaveSet.add(dayKey)
      } else {
        unpaidLeaveSet.add(dayKey)
      }
    })
  })

  const absenceDateList = treatUnworkedDaysAsAbsence
    ? businessDayKeys.filter(
        (dayKey) => !workedDayKeys.has(dayKey) && !paidLeaveSet.has(dayKey) && !unpaidLeaveSet.has(dayKey),
      )
    : []

  // Only use manually marked absences, ignore automatic unworked days
  const allAbsenceDates = Array.from(absentDaySet)
  const absenceDeduction = toMoney(allAbsenceDates.length * dailyRate)
  const leaveDeduction = toMoney(unpaidLeaveSet.size * dailyRate)
  const totalAttendanceDeduction = toMoney(absenceDeduction + leaveDeduction)

  return {
    paidLeaveDays: paidLeaveSet.size,
    unpaidLeaveDays: unpaidLeaveSet.size,
    absenceDays: allAbsenceDates.length,
    paidLeaveDates: Array.from(paidLeaveSet),
    unpaidLeaveDates: Array.from(unpaidLeaveSet),
    absenceDates: allAbsenceDates,
    workingDays: businessDayKeys.length,
    workedDays: workedDayKeys.size,
    dailyRate,
    absenceDeduction,
    leaveDeduction,
    totalAttendanceDeduction,
    periodRange,
  }
}

function formatDateList(dates) {
  if (!Array.isArray(dates) || dates.length === 0) {
    return "None"
  }

  return dates
    .map((dateString) => {
      const parsed = new Date(dateString)
      if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
        return dateString
      }
      return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    })
    .join(", ")
}

export default function PayrollPage() {
  const [employees, setEmployees] = useState([])
  const [payrolls, setPayrolls] = useState([])
  const [selectedEmployee, setSelectedEmployee] = useState("")
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [creditingPayrollId, setCreditingPayrollId] = useState(null)
  const [minHours, setMinHours] = useState(8)
  const [payslipPayroll, setPayslipPayroll] = useState(null)
  const [downloadingPayslip, setDownloadingPayslip] = useState(false)
  const [leavePaymentRecords, setLeavePaymentRecords] = useState([])
  const [leavePaymentDialogOpen, setLeavePaymentDialogOpen] = useState(false)
  const [deletingLeavePaymentId, setDeletingLeavePaymentId] = useState(null)
  const [leavePaymentForm, setLeavePaymentForm] = useState({
    leaveType: "",
    numberOfDays: "",
    ratePerDay: "",
  })
  const [processingLeavePayment, setProcessingLeavePayment] = useState(false)

  const activePayslip = payslipPayroll
  let payslipData = null
  if (activePayslip) {
    const attendanceSummary = activePayslip.attendanceSummary || {}

    const regularPay = toMoney(
      activePayslip.regularPay ??
        (typeof activePayslip.regularHours === "number" && typeof activePayslip.hourlyRate === "number"
          ? activePayslip.regularHours * activePayslip.hourlyRate
          : 0),
    )
    const overtimePay = toMoney(activePayslip.overtimePay ?? 0)
    const grossPay = toMoney(activePayslip.grossPay ?? regularPay + overtimePay)

    let statutory = toMoney(activePayslip.statutoryDeductions ?? 0)
    if (!statutory && grossPay) {
      statutory = toMoney(grossPay * 0.05)
    }

    const absenceDeduction = toMoney(
      activePayslip.absenceDeduction ?? attendanceSummary.absenceDeduction ?? 0,
    )
    const leaveDeduction = toMoney(activePayslip.leaveDeduction ?? attendanceSummary.leaveDeduction ?? 0)

    let attendanceDeduction = toMoney(
      activePayslip.attendanceDeduction ??
        attendanceSummary.totalAttendanceDeduction ??
        absenceDeduction + leaveDeduction,
    )
    if (!attendanceDeduction && (absenceDeduction || leaveDeduction)) {
      attendanceDeduction = toMoney(absenceDeduction + leaveDeduction)
    }

    let nonTaxDeductions = toMoney(activePayslip.deductions ?? 0)
    if (!nonTaxDeductions) {
      nonTaxDeductions = toMoney(statutory + attendanceDeduction)
    }

    const taxAmount = toMoney(activePayslip.tax ?? 0)
    const totalDeductions = toMoney(taxAmount + nonTaxDeductions)
    const netPay = toMoney(activePayslip.netPay ?? grossPay - totalDeductions)

    const periodLabel =
      activePayslip.periodLabel && activePayslip.periodLabel.length > 0
        ? activePayslip.periodLabel
        : activePayslip.period || "Current Period"

    payslipData = {
      employeeName: activePayslip.employeeName,
      periodLabel,
      hourlyRate: activePayslip.hourlyRate ?? 0,
      regularPay,
      overtimePay,
      grossPay,
      tax: taxAmount,
      statutoryDeductions: statutory,
      attendanceDeduction,
      absenceDeduction,
      leaveDeduction,
      nonTaxDeductions,
      totalDeductions,
      netPay,
      attendanceSummary,
      workingDays: attendanceSummary.workingDays ?? null,
      workedDays: attendanceSummary.workedDays ?? null,
      paidLeaveDays: attendanceSummary.paidLeaveDays ?? 0,
      unpaidLeaveDays: attendanceSummary.unpaidLeaveDays ?? 0,
      absenceDays: attendanceSummary.absenceDays ?? 0,
      paidLeaveDates: attendanceSummary.paidLeaveDates || [],
      unpaidLeaveDates: attendanceSummary.unpaidLeaveDates || [],
      absenceDates: attendanceSummary.absenceDates || [],
      dailyRate:
        attendanceSummary.dailyRate ??
        toMoney((activePayslip.hourlyRate || 0) * (typeof minHours === "number" ? minHours : 8)),
      coverage: attendanceSummary.periodRange || null,
      leavePaymentRecords,
    }
  }

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
        const hourlyRateValue = employee.hourlyRate || 0
        const regularPay = toMoney(adjustedRegular * hourlyRateValue)
        const overtimePay = toMoney(adjustedOvertime * hourlyRateValue * overtimeRateMultiplier)
        const grossPay = toMoney(regularPay + overtimePay)
        const tax = toMoney(grossPay * 0.1)
        const attendanceAdjustments = await deriveAttendanceAdjustments({
          employeeId: canonicalEmployeeId,
          period: payrollPeriod,
          minHours,
          hourlyRate: hourlyRateValue,
          relevantLogs: relevantLogs,
          treatUnworkedDaysAsAbsence: false,
        })
        const statutoryDeductions = toMoney(grossPay * 0.05)
        const attendanceDeduction = attendanceAdjustments.totalAttendanceDeduction
        const combinedDeductions = toMoney(statutoryDeductions + attendanceDeduction)
        const netPay = Math.max(toMoney(grossPay - tax - combinedDeductions), 0)

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
          regularPay,
          overtimePay,
          grossPay,
          tax,
          statutoryDeductions,
          attendanceDeduction,
          absenceDeduction: attendanceAdjustments.absenceDeduction,
          leaveDeduction: attendanceAdjustments.leaveDeduction,
          deductions: combinedDeductions,
          netPay,
          status: "pending",
          generatedAt: Timestamp.now(),
          calculationBasis: "manual",
          timeLogIds: [],
          timeLogSummaries: [],
          autoApprovalScheduledAt,
          autoApproved: false,
          autoApprovedAt: null,
          attendanceSummary: attendanceAdjustments,
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
        
        // Fetch the newly created payroll and open payslip dialog
        const updatedPayrolls = await getPayrolls()
        const newPayroll = updatedPayrolls.find((p) => p.id === payrollId)
        if (newPayroll) {
          setPayslipPayroll(newPayroll)
          await loadLeavePayments(newPayroll)
        }
        
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
      const regularPay = toMoney(regularHours * hourlyRate)
      const overtimePay = toMoney(overtimeHours * hourlyRate * overtimeRateMultiplier)
      const grossPay = toMoney(regularPay + overtimePay)
      const tax = toMoney(grossPay * 0.1) // 10% tax placeholder
      const attendanceAdjustments = await deriveAttendanceAdjustments({
        employeeId: canonicalEmployeeId,
        period,
        minHours,
        hourlyRate,
        relevantLogs,
        treatUnworkedDaysAsAbsence: true,
      })
      const statutoryDeductions = toMoney(grossPay * 0.05) // 5% deductions placeholder
      const attendanceDeduction = attendanceAdjustments.totalAttendanceDeduction
      const combinedDeductions = toMoney(statutoryDeductions + attendanceDeduction)
      const netPay = Math.max(toMoney(grossPay - tax - combinedDeductions), 0)

      console.log("Payroll calculation:", {
        totalHours,
        regularHours,
        overtimeHours,
        hourlyRate,
        grossPay,
        overtimePay,
        tax,
        statutoryDeductions,
        attendanceDeduction,
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
        regularPay,
        overtimePay,
  grossPay,
        tax,
        statutoryDeductions,
        attendanceDeduction,
        absenceDeduction: attendanceAdjustments.absenceDeduction,
        leaveDeduction: attendanceAdjustments.leaveDeduction,
        deductions: combinedDeductions,
        netPay,
        status: "pending",
        generatedAt: Timestamp.now(),
        calculationBasis: "time_logs",
        timeLogIds: relevantLogs.map((log) => log.id),
        timeLogSummaries,
        autoApprovalScheduledAt,
        autoApproved: false,
        autoApprovedAt: null,
        attendanceSummary: attendanceAdjustments,
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
      
      // Fetch the newly created payroll and open payslip dialog
      const updatedPayrolls = await getPayrolls()
      const newPayroll = updatedPayrolls.find((p) => p.id === payrollId)
      if (newPayroll) {
        setPayslipPayroll(newPayroll)
        await loadLeavePayments(newPayroll)
      }
      
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

  async function handleManualEntry() {
    if (!selectedEmployee) return

    setProcessing(true)
    try {
      const employee = employees.find((e) => e.id === selectedEmployee)
      if (!employee) {
        toast.error("Employee not found")
        return
      }

      const hoursInput = prompt(
        `Enter hours worked for ${employee.name || employee.email} this period:`,
        "40",
      )
      if (!hoursInput || hoursInput.trim() === "") {
        toast.warning("Manual entry cancelled")
        return
      }

      const parsedHours = Number.parseFloat(hoursInput)
      if (Number.isNaN(parsedHours) || parsedHours <= 0) {
        toast.error("Invalid hours entered")
        return
      }

      const period = new Date().toISOString().slice(0, 7)
      const canonicalEmployeeId = employee.employeeId || employee.id
      const timeLogs = await getTimeLogs(canonicalEmployeeId)

      const adjustedHours = Number.parseFloat(parsedHours.toFixed(2))
      const computedOvertime = Math.max(0, adjustedHours - (minHours || 8))
      const adjustedOvertime = Number.parseFloat(computedOvertime.toFixed(2))
      const adjustedRegular = Number.parseFloat(Math.max(0, adjustedHours - adjustedOvertime).toFixed(2))
      const payrollPeriod = period

      const overtimeRateMultiplier = 1.5
      const hourlyRateValue = employee.hourlyRate || 0
      const regularPay = toMoney(adjustedRegular * hourlyRateValue)
      const overtimePay = toMoney(adjustedOvertime * hourlyRateValue * overtimeRateMultiplier)
      const grossPay = toMoney(regularPay + overtimePay)
      const tax = toMoney(grossPay * 0.1)
      const attendanceAdjustments = await deriveAttendanceAdjustments({
        employeeId: canonicalEmployeeId,
        period: payrollPeriod,
        minHours,
        hourlyRate: hourlyRateValue,
        relevantLogs: [],
        treatUnworkedDaysAsAbsence: false,
      })
      const statutoryDeductions = toMoney(grossPay * 0.05)
      const attendanceDeduction = attendanceAdjustments.totalAttendanceDeduction
      const combinedDeductions = toMoney(statutoryDeductions + attendanceDeduction)
      const netPay = Math.max(toMoney(grossPay - tax - combinedDeductions), 0)

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
        regularPay,
        overtimePay,
        grossPay,
        tax,
        statutoryDeductions,
        attendanceDeduction,
        absenceDeduction: attendanceAdjustments.absenceDeduction,
        leaveDeduction: attendanceAdjustments.leaveDeduction,
        deductions: combinedDeductions,
        netPay,
        status: "pending",
        generatedAt: Timestamp.now(),
        calculationBasis: "manual",
        timeLogIds: [],
        timeLogSummaries: [],
        autoApprovalScheduledAt,
        autoApproved: false,
        autoApprovedAt: null,
        attendanceSummary: attendanceAdjustments,
      })

      await fetchData()
      setSelectedEmployee("")

      // Fetch the newly created payroll and open payslip dialog
      const updatedPayrolls = await getPayrolls()
      const newPayroll = updatedPayrolls.find((p) => p.id === payrollId)
      if (newPayroll) {
        setPayslipPayroll(newPayroll)
        await loadLeavePayments(newPayroll)
      }

      const autoLabel = formatAutoApprovalLabel(autoApprovalScheduledAt)
      toast.success("Payroll generated manually", {
        description: `${adjustedHours}h recorded. Auto approval scheduled for ${autoLabel}.`,
      })
    } catch (error) {
      console.error("Error generating manual payroll:", error)
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
      let regularPay = typeof payroll.regularPay === "number" ? payroll.regularPay : 0
      let overtimePay = typeof payroll.overtimePay === "number" ? payroll.overtimePay : 0
      let tax = typeof payroll.tax === "number" ? payroll.tax : 0
      let deductions = typeof payroll.deductions === "number" ? payroll.deductions : 0
      let statutoryDeductions = typeof payroll.statutoryDeductions === "number" ? payroll.statutoryDeductions : 0
      let attendanceDeduction = typeof payroll.attendanceDeduction === "number" ? payroll.attendanceDeduction : 0
      let absenceDeduction = typeof payroll.absenceDeduction === "number" ? payroll.absenceDeduction : 0
      let leaveDeduction = typeof payroll.leaveDeduction === "number" ? payroll.leaveDeduction : 0
      let netPay = typeof payroll.netPay === "number" ? payroll.netPay : 0
      let attendanceSummary = payroll.attendanceSummary || null
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
        regularPay = toMoney(regularHours * hourlyRate)
        const overtimeComponent = toMoney(overtimeHours * hourlyRate * overtimeRateMultiplier)
        grossPay = toMoney(regularPay + overtimeComponent)
        overtimePay = overtimeComponent
        tax = toMoney(grossPay * 0.1)
        statutoryDeductions = toMoney(grossPay * 0.05)
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

      const attendancePeriod = payroll.period || new Date().toISOString().slice(0, 7)
      const attendanceAdjustments = await deriveAttendanceAdjustments({
        employeeId: payroll.employeeId,
        period: attendancePeriod,
        minHours,
        hourlyRate,
        relevantLogs: linkedLogs,
        treatUnworkedDaysAsAbsence: calculationBasis !== "manual",
      })

      absenceDeduction = attendanceAdjustments.absenceDeduction
      leaveDeduction = attendanceAdjustments.leaveDeduction
      attendanceDeduction = attendanceAdjustments.totalAttendanceDeduction
      attendanceSummary = attendanceAdjustments

      if (!statutoryDeductions) {
        statutoryDeductions = toMoney(grossPay * 0.05)
      }

      const combinedDeductions = toMoney(statutoryDeductions + attendanceDeduction)
      deductions = combinedDeductions
      if (!tax) {
        tax = toMoney(grossPay * 0.1)
      }

      netPay = Math.max(toMoney(grossPay - tax - combinedDeductions), 0)

      // Add leave payments to net pay
      try {
        const leavePayments = await getLeavePaymentsByEmployeeAndPayroll(payroll.employeeId, payroll.id)
        if (leavePayments && Array.isArray(leavePayments) && leavePayments.length > 0) {
          const totalLeavePayments = toMoney(leavePayments.reduce((sum, payment) => sum + (payment.amount || 0), 0))
          netPay = toMoney(netPay + totalLeavePayments)
        }
      } catch (error) {
        console.warn("Could not fetch leave payments for payroll settlement:", error)
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
        statutoryDeductions,
        attendanceDeduction,
        absenceDeduction,
        leaveDeduction,
        netPay,
        regularPay,
        status: "paid",
        paidAt: nowTs,
        calculationBasis,
        periodLabel,
        timeLogSummaries,
        attendanceSummary,
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

  function handleOpenPayslip(payroll) {
    setPayslipPayroll(payroll)
    loadLeavePayments(payroll)
  }

  async function loadLeavePayments(payroll) {
    if (!payroll) return
    try {
      const payments = await getLeavePaymentsByEmployeeAndPayroll(payroll.employeeId, payroll.id)
      setLeavePaymentRecords(payments)
    } catch (error) {
      console.error("Error loading leave payments:", error)
      setLeavePaymentRecords([])
    }
  }

  function handleClosePayslip() {
    setPayslipPayroll(null)
    setDownloadingPayslip(false)
  }

  async function handleDownloadPayslip() {
    if (!payslipData) {
      return
    }

    setDownloadingPayslip(true)
    try {
      await generatePayslipPDF(payslipData)
      toast.success("Payslip exported", {
        description: "PDF downloaded successfully.",
      })
    } catch (error) {
      console.error("Error generating payslip PDF:", error)
      toast.error("Failed to export payslip", {
        description: error?.message || "Please try again.",
      })
    } finally {
      setDownloadingPayslip(false)
    }
  }

  function handleOpenLeavePaymentDialog() {
    if (!payslipPayroll) return
    setLeavePaymentForm({
      leaveType: "",
      numberOfDays: "",
      ratePerDay: payslipPayroll.attendanceSummary?.dailyRate || payslipPayroll.hourlyRate * 8 || 0,
    })
    setLeavePaymentDialogOpen(true)
  }

  function handleCloseLeavePaymentDialog() {
    setLeavePaymentDialogOpen(false)
    setLeavePaymentForm({
      leaveType: "",
      numberOfDays: "",
      ratePerDay: "",
    })
  }

  async function handleSubmitLeavePayment() {
    if (!payslipPayroll) return

    const numberOfDays = Number.parseFloat(leavePaymentForm.numberOfDays)
    const ratePerDay = Number.parseFloat(leavePaymentForm.ratePerDay)
    const leaveType = leavePaymentForm.leaveType.trim()

    if (!leaveType) {
      toast.error("Leave type is required")
      return
    }

    if (!Number.isFinite(numberOfDays) || numberOfDays <= 0) {
      toast.error("Number of days must be a positive number")
      return
    }

    if (!Number.isFinite(ratePerDay) || ratePerDay <= 0) {
      toast.error("Rate per day must be a positive number")
      return
    }

    setProcessingLeavePayment(true)
    try {
      const amount = Number.parseFloat((numberOfDays * ratePerDay).toFixed(2))

      // Add leave payment record
      const paymentId = await addLeavePayment({
        employeeId: payslipPayroll.employeeId,
        payrollId: payslipPayroll.id,
        leaveType,
        numberOfDays,
        ratePerDay,
        amount,
        date: Timestamp.now(),
      })

      toast.success("Leave payment recorded", {
        description: `₱${amount.toFixed(2)} for ${numberOfDays} days of ${leaveType}`,
      })

      // Reload leave payments
      const payments = await getLeavePaymentsByEmployeeAndPayroll(payslipPayroll.employeeId, payslipPayroll.id)
      setLeavePaymentRecords(payments)

      handleCloseLeavePaymentDialog()
    } catch (error) {
      console.error("Error recording leave payment:", error)
      toast.error("Failed to record leave payment", {
        description: error?.message || "Please try again.",
      })
    } finally {
      setProcessingLeavePayment(false)
    }
  }

  async function handleDeleteLeavePayment(paymentId) {
    if (!confirm("Are you sure you want to delete this leave payment?")) {
      return
    }

    setDeletingLeavePaymentId(paymentId)
    try {
      await deleteLeavePayment(paymentId)
      toast.success("Leave payment deleted", {
        description: "The leave payment has been removed.",
      })

      // Reload leave payments
      if (payslipPayroll) {
        const payments = await getLeavePaymentsByEmployeeAndPayroll(payslipPayroll.employeeId, payslipPayroll.id)
        setLeavePaymentRecords(payments)
      }
    } catch (error) {
      console.error("Error deleting leave payment:", error)
      toast.error("Failed to delete leave payment", {
        description: error?.message || "Please try again.",
      })
    } finally {
      setDeletingLeavePaymentId(null)
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
            <Button onClick={handleManualEntry} variant="outline" disabled={!selectedEmployee || processing}>
              {processing ? "Processing..." : "Manual Entry"}
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
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => handleOpenPayslip(payroll)}>
                            View Payslip
                          </Button>
                          {payroll.status !== "paid" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCreditPayroll(payroll)}
                              disabled={creditingPayrollId === payroll.id}
                            >
                              {creditingPayrollId === payroll.id ? "Approving..." : "Approve Payout"}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(payslipPayroll)} onOpenChange={(open) => (open ? null : handleClosePayslip())}>
        <DialogContent className="max-w-2xl h-screen flex flex-col">
          <DialogHeader>
            <DialogTitle>Payslip</DialogTitle>
            {payslipData && (
              <DialogDescription>
                {payslipData.employeeName} · {payslipData.periodLabel.replace(/\n+/g, " ")}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {payslipData ? (
              <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Earnings</h3>
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <div className="flex items-center justify-between">
                      <span>Regular Pay</span>
                      <span>{formatCurrency(payslipData.regularPay)}</span>
                    </div>
                    {payslipData.overtimePay > 0 && (
                      <div className="flex items-center justify-between">
                        <span>Overtime Pay</span>
                        <span>{formatCurrency(payslipData.overtimePay)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between font-semibold">
                      <span>Gross Pay</span>
                      <span>{formatCurrency(payslipData.grossPay)}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Deductions</h3>
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <div className="flex items-center justify-between">
                      <span>Tax (10%)</span>
                      <span>{formatCurrency(payslipData.tax)}</span>
                    </div>
                    {payslipData.statutoryDeductions > 0 && (
                      <div className="flex items-center justify-between">
                        <span>Statutory</span>
                        <span>{formatCurrency(payslipData.statutoryDeductions)}</span>
                      </div>
                    )}
                    {payslipData.absenceDeduction > 0 && (
                      <div className="flex items-center justify-between">
                        <span>Absences</span>
                        <span>{formatCurrency(payslipData.absenceDeduction)}</span>
                      </div>
                    )}
                    {payslipData.leaveDeduction > 0 && (
                      <div className="flex items-center justify-between">
                        <span>Unpaid Leave</span>
                        <span>{formatCurrency(payslipData.leaveDeduction)}</span>
                      </div>
                    )}
                    {payslipData.attendanceDeduction > 0 && (
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Attendance Total</span>
                        <span>{formatCurrency(payslipData.attendanceDeduction)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between font-semibold">
                      <span>Total Deductions</span>
                      <span>{formatCurrency(payslipData.totalDeductions)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-slate-900 px-4 py-3 text-slate-50">
                <span className="text-sm uppercase tracking-wider">Net Pay</span>
                <span className="text-lg font-semibold">{formatCurrency(payslipData.netPay)}</span>
              </div>

              <div className="rounded-lg border border-slate-200 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Attendance Summary</h3>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  {payslipData.coverage && payslipData.coverage.start && payslipData.coverage.end && (
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Coverage</span>
                      <span>
                        {new Date(payslipData.coverage.start).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                        {" – "}
                        {new Date(payslipData.coverage.end).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  )}
                  {typeof payslipData.dailyRate === "number" && payslipData.dailyRate > 0 && (
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Daily Rate</span>
                      <span>{formatCurrency(payslipData.dailyRate)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span>Working Days</span>
                    <span>{payslipData.workingDays ?? "–"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Worked Days</span>
                    <span>{payslipData.workedDays ?? "–"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Paid Leave Days</span>
                    <span>
                      {payslipData.paidLeaveDays + 
                        (leavePaymentRecords.length > 0 
                          ? leavePaymentRecords.reduce((sum, r) => sum + (r.numberOfDays || 0), 0)
                          : 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Unpaid Leave Days</span>
                    <span>{payslipData.unpaidLeaveDays}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Absence Days</span>
                    <span>{payslipData.absenceDays}</span>
                  </div>
                  {payslipData.paidLeaveDates.length > 0 && (
                    <div className="pt-2 text-xs text-slate-500">
                      <span className="font-medium text-slate-600">Paid Leave Dates:</span> {formatDateList(payslipData.paidLeaveDates)}
                    </div>
                  )}
                  {payslipData.unpaidLeaveDates.length > 0 && (
                    <div className="text-xs text-slate-500">
                      <span className="font-medium text-slate-600">Unpaid Leave Dates:</span> {formatDateList(payslipData.unpaidLeaveDates)}
                    </div>
                  )}
                  {payslipData.absenceDates.length > 0 && (
                    <div className="text-xs text-slate-500">
                      <span className="font-medium text-slate-600">Absence Dates:</span> {formatDateList(payslipData.absenceDates)}
                    </div>
                  )}
                </div>
              </div>

              {leavePaymentRecords.length > 0 && (
                <div className="rounded-lg border border-slate-200  p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Leave Payments</h3>
                  <div className="mt-3 space-y-3">
                    {leavePaymentRecords.map((record, index) => (
                      <div key={record.id} className="border-t border-slate-200 pt-2 first:border-t-0 first:pt-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-900">{record.leaveType}</p>
                            <p className="text-xs text-slate-700">
                              {record.numberOfDays} day{record.numberOfDays !== 1 ? "s" : ""} | ₱{record.ratePerDay?.toFixed(2) || "0.00"}/day
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">₱{record.amount?.toFixed(2) || "0.00"}</span>
                            {payslipPayroll?.status !== "paid" && (
                              <button
                                onClick={() => handleDeleteLeavePayment(record.id)}
                                disabled={deletingLeavePaymentId === record.id}
                                className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="Cancel"
                              >
                                {deletingLeavePaymentId === record.id ? (
                                  <span className="text-xs">...</span>
                                ) : (
                                  <span className="text-lg font-bold">×</span>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-slate-200 pt-2 mt-3">
                    <div className="flex items-center justify-between font-semibold text-slate-900">
                      <span>Total Leave Payments</span>
                      <span>
                        ₱{leavePaymentRecords.reduce((sum, r) => sum + (r.amount || 0), 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-600">Unable to load payslip details.</p>
          )}
          </div>

          <DialogFooter>
            {payslipPayroll?.status !== "paid" && (
              <Button
                onClick={handleOpenLeavePaymentDialog}
                variant="secondary"
              >
                Add Leave Payment
              </Button>
            )}
            {payslipPayroll?.status === "paid" && (
              <Button onClick={handleDownloadPayslip} disabled={downloadingPayslip || !payslipData}>
                {downloadingPayslip ? "Preparing PDF..." : "Download PDF"}
              </Button>
            )}
            <Button variant="outline" onClick={handleClosePayslip}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={leavePaymentDialogOpen} onOpenChange={setLeavePaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Leave Payment</DialogTitle>
            {payslipPayroll && (
              <DialogDescription>
                Leave payment for {payslipPayroll.employeeName}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="leaveType">Leave Type *</Label>
              <Input
                id="leaveType"
                placeholder="e.g., Vacation Leave, Sick Leave, Paternity Leave"
                value={leavePaymentForm.leaveType}
                onChange={(e) =>
                  setLeavePaymentForm({ ...leavePaymentForm, leaveType: e.target.value })
                }
                disabled={processingLeavePayment}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="numberOfDays">Number of Days *</Label>
                <Input
                  id="numberOfDays"
                  type="number"
                  placeholder="e.g., 2.5"
                  step="0.5"
                  min="0"
                  value={leavePaymentForm.numberOfDays}
                  onChange={(e) =>
                    setLeavePaymentForm({
                      ...leavePaymentForm,
                      numberOfDays: e.target.value,
                    })
                  }
                  disabled={processingLeavePayment}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ratePerDay">Rate per Day (₱) *</Label>
                <Input
                  id="ratePerDay"
                  type="number"
                  placeholder="Daily rate"
                  step="0.01"
                  min="0"
                  value={leavePaymentForm.ratePerDay}
                  onChange={(e) =>
                    setLeavePaymentForm({
                      ...leavePaymentForm,
                      ratePerDay: e.target.value,
                    })
                  }
                  disabled={processingLeavePayment}
                />
              </div>
            </div>

            {leavePaymentForm.numberOfDays && leavePaymentForm.ratePerDay && (
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-sm text-slate-600">
                  Total Amount: <span className="font-semibold text-slate-900">
                    ₱{(parseFloat(leavePaymentForm.numberOfDays || 0) * parseFloat(leavePaymentForm.ratePerDay || 0)).toFixed(2)}
                  </span>
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCloseLeavePaymentDialog}
              disabled={processingLeavePayment}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmitLeavePayment} disabled={processingLeavePayment}>
              {processingLeavePayment ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

