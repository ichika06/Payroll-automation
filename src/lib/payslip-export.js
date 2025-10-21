

function formatCurrency(amount) {
  if (typeof amount !== "number") {
    return "N/A"
  }
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `PHP ${formatted}`
}

export async function generatePayslipPDF(payslipData) {
  if (!payslipData) {
    throw new Error("Payslip data is required")
  }

  try {
    const [{ default: PDFDocument }, { default: blobStream }] = await Promise.all([
      import("pdfkit/js/pdfkit.standalone.js"),
      import("blob-stream"),
    ])

    const doc = new PDFDocument({ size: "A4", margin: 48 })
    const stream = doc.pipe(blobStream())

    const primaryColor = "#111827"
    const mutedColor = "#6b7280"
    const dividerColor = "#d1d5db"

    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
    const valueColumnStart = doc.page.margins.left + contentWidth * 0.55
    const valueColumnWidth = contentWidth - contentWidth * 0.55

    function addDivider() {
      const currentY = doc.y
      doc
        .moveTo(doc.page.margins.left, currentY)
        .lineTo(doc.page.width - doc.page.margins.right, currentY)
        .strokeColor(dividerColor)
        .stroke()
      doc.moveDown(0.6)
    }

    function addKeyValue(label, value, { bold = false } = {}) {
      const initialY = doc.y
      const baseFont = bold ? "Helvetica-Bold" : "Helvetica"
      doc.font(baseFont).fontSize(11).fillColor(primaryColor).text(label, doc.page.margins.left, initialY, {
        width: valueColumnStart - doc.page.margins.left,
      })

      const afterLabelY = doc.y
      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor(primaryColor)
        .text(String(value), valueColumnStart, initialY, {
          width: valueColumnWidth,
          align: "right",
        })

      const afterValueY = doc.y
      doc.y = Math.max(afterLabelY, afterValueY)
      doc.moveDown(0.2)
    }

    function addSectionTitle(title) {
      doc.font("Helvetica-Bold").fontSize(12).fillColor(primaryColor).text(title)
      doc.moveDown(0.4)
    }

    function writeDateList(title, dates) {
      if (!Array.isArray(dates) || dates.length === 0) {
        return
      }
      doc.moveDown(0.4)
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(mutedColor)
        .text(title, doc.page.margins.left, doc.y, { width: contentWidth })
      doc.font("Helvetica").fontSize(10).fillColor(primaryColor)
      dates
        .map((dateString) => {
          const parsed = new Date(dateString)
          if (Number.isNaN(parsed.getTime())) {
            return dateString
          }
          return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        })
        .forEach((entry) => {
          doc.text(`• ${entry}`, doc.page.margins.left + 10, doc.y, { width: contentWidth - 10 })
        })
    }

    // Header
    doc.font("Helvetica-BoldOblique").fontSize(18).fillColor(primaryColor).text("Payslip", {
      align: "center",
    })
    doc.moveDown(0.5)
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(mutedColor)
      .text(new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }), {
        align: "center",
      })
    doc.moveDown(1)

    // Employee Info
    addSectionTitle("Employee")
    doc.font("Helvetica").fontSize(11).fillColor(primaryColor).text(payslipData.employeeName || "N/A")
    doc
      .fontSize(11)
      .fillColor(mutedColor)
      .text(payslipData.periodLabel.replace(/\n+/g, " ") || "Current Period")
    doc.moveDown(0.8)
    addDivider()

    // Earnings
    addSectionTitle("Earnings")
    addKeyValue("Regular Pay", formatCurrency(payslipData.regularPay))
    if (payslipData.overtimePay > 0) {
      addKeyValue("Overtime Pay", formatCurrency(payslipData.overtimePay))
    }
    doc.moveDown(0.3)
    addKeyValue("Gross Pay", formatCurrency(payslipData.grossPay), { bold: true })
    doc.moveDown(0.8)
    addDivider()

    // Deductions
    addSectionTitle("Deductions")
    addKeyValue("Tax", formatCurrency(payslipData.tax))
    if (payslipData.statutoryDeductions > 0) {
      addKeyValue("Statutory", formatCurrency(payslipData.statutoryDeductions))
    }
    if (payslipData.absenceDeduction > 0) {
      addKeyValue("Absences", formatCurrency(payslipData.absenceDeduction))
    }
    if (payslipData.leaveDeduction > 0) {
      addKeyValue("Unpaid Leave", formatCurrency(payslipData.leaveDeduction))
    }
    if (payslipData.attendanceDeduction > 0) {
      addKeyValue("Attendance Total", formatCurrency(payslipData.attendanceDeduction))
    }
    doc.moveDown(0.3)
    addKeyValue("Total Deductions", formatCurrency(payslipData.totalDeductions), { bold: true })
    doc.moveDown(0.8)
    addDivider()

    // Net Pay
    addSectionTitle("Net Pay")
    doc.font("Helvetica-Bold").fontSize(16).fillColor(primaryColor).text(formatCurrency(payslipData.netPay))
    doc.moveDown(0.6)
    addDivider()

    // Attendance
    addSectionTitle("Attendance")
    const attendanceLines = [
      ["Working Days", payslipData.workingDays ?? "–"],
      ["Worked Days", payslipData.workedDays ?? "–"],
      [
        "Paid Leave Days",
        (payslipData.paidLeaveDays || 0) +
          (payslipData.leavePaymentRecords && Array.isArray(payslipData.leavePaymentRecords)
            ? payslipData.leavePaymentRecords.reduce((sum, r) => sum + (r.numberOfDays || 0), 0)
            : 0),
      ],
      ["Unpaid Leave Days", payslipData.unpaidLeaveDays],
      ["Absence Days", payslipData.absenceDays],
    ]
    if (typeof payslipData.dailyRate === "number" && payslipData.dailyRate > 0) {
      attendanceLines.unshift(["Daily Rate", formatCurrency(payslipData.dailyRate)])
    }
    if (payslipData.coverage && payslipData.coverage.start && payslipData.coverage.end) {
      attendanceLines.unshift([
        "Coverage",
        `${new Date(payslipData.coverage.start).toLocaleDateString()} — ${new Date(payslipData.coverage.end).toLocaleDateString()}`,
      ])
    }
    attendanceLines.forEach(([label, value]) => {
      addKeyValue(label, String(value))
    })

    // Date lists
    writeDateList("Paid Leave Dates", payslipData.paidLeaveDates)
    writeDateList("Unpaid Leave Dates", payslipData.unpaidLeaveDates)
    writeDateList("Absence Dates", payslipData.absenceDates)

    // Leave Payment Records (if any)
    if (
      payslipData.leavePaymentRecords &&
      Array.isArray(payslipData.leavePaymentRecords) &&
      payslipData.leavePaymentRecords.length > 0
    ) {
      doc.moveDown(0.8)
      addDivider()
      addSectionTitle("Leave Payments")

      payslipData.leavePaymentRecords.forEach((record, index) => {
        doc.font("Helvetica").fontSize(10).fillColor(primaryColor)
        doc.text(`${index + 1}. ${record.leaveType || "Leave Payment"}`, doc.page.margins.left)
        doc.font("Helvetica").fontSize(9).fillColor(mutedColor)

        if (record.numberOfDays) {
          doc.text(`   Days: ${record.numberOfDays}`, doc.page.margins.left)
        }
        if (record.ratePerDay) {
          doc.text(`   Rate: ${formatCurrency(record.ratePerDay)}/day`, doc.page.margins.left)
        }
        if (record.amount !== undefined) {
          doc
            .font("Helvetica-Bold")
            .fontSize(10)
            .fillColor(primaryColor)
            .text(`   Amount: ${formatCurrency(record.amount)}`, doc.page.margins.left)
        }
        if (record.date) {
          const paymentDate = new Date(record.date)
          if (!Number.isNaN(paymentDate.getTime())) {
            doc
              .font("Helvetica")
              .fontSize(9)
              .fillColor(mutedColor)
              .text(
                `   Paid: ${paymentDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`,
                doc.page.margins.left,
              )
          }
        }
        doc.moveDown(0.3)
      })

      doc.moveDown(0.3)
      addKeyValue(
        "Total Leave Payments",
        formatCurrency(
          payslipData.leavePaymentRecords.reduce((sum, record) => sum + (record.amount || 0), 0),
        ),
        { bold: true },
      )
    }

    // End PDF
    doc.end()

    // Wait for stream to finish and convert to blob
    const blob = await new Promise((resolve, reject) => {
      stream.on("finish", () => {
        try {
          const generatedBlob = stream.toBlob("application/pdf")
          resolve(generatedBlob)
        } catch (error) {
          reject(error)
        }
      })
      stream.on("error", reject)
    })

    // Download file
    const url = URL.createObjectURL(blob)
    const cleanName = payslipData.employeeName
      ? payslipData.employeeName.toLowerCase().replace(/[^a-z0-9]+/g, "-")
      : "employee"
    const cleanPeriod = payslipData.periodLabel
      ? payslipData.periodLabel.toLowerCase().split("\n")[0].replace(/[^a-z0-9]+/g, "-")
      : "period"
    const timestamp = new Date().toISOString().slice(0, 10)
    const fileName = `payslip-${cleanName}-${cleanPeriod}-${timestamp}.pdf`

    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)

    // Clean up
    setTimeout(() => URL.revokeObjectURL(url), 1000)

    return { fileName, success: true }
  } catch (error) {
    console.error("Error generating payslip PDF:", error)
    throw error
  }
}
