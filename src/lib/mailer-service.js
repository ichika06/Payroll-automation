"use server"

import nodemailer from "nodemailer"

const SMTP_HOST = process.env.MAILERSEND_SMTP_HOST
const SMTP_PORT = Number(process.env.MAILERSEND_SMTP_PORT || 587)
const SMTP_USERNAME = process.env.MAILERSEND_SMTP_USERNAME
const SMTP_PASSWORD = process.env.MAILERSEND_SMTP_PASSWORD
const FROM_EMAIL = process.env.MAILERSEND_FROM_EMAIL
const FROM_NAME = process.env.MAILERSEND_FROM_NAME || "Payroll Automation"

let transporter

function getTransporter() {
  if (!transporter) {
    if (!SMTP_HOST || !SMTP_USERNAME || !SMTP_PASSWORD || !FROM_EMAIL) {
      throw new Error("MailerSend SMTP configuration is incomplete")
    }

    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USERNAME,
        pass: SMTP_PASSWORD,
      },
    })
  }

  return transporter
}

export async function sendEmployeeCredentialsEmail({ email, password, firstName, lastName }) {
  const recipientName = [firstName, lastName].filter(Boolean).join(" ") || email
  const subject = "Your payroll account credentials"
  const text = `Hello ${recipientName},\n\nAn administrator has created an account for you in the payroll automation system.\n\nEmail: ${email}\nTemporary password: ${password}\n\nPlease sign in and change your password after your first login.\n\nThank you.`
  const html = `<p>Hello ${recipientName},</p><p>An administrator has created an account for you in the payroll automation system.</p><p><strong>Email:</strong> ${email}<br/><strong>Temporary password:</strong> ${password}</p><p>Please sign in and change your password after your first login.</p><p>Thank you.</p>`

  const mailTransporter = getTransporter()

  await mailTransporter.sendMail({
    from: {
      name: FROM_NAME,
      address: FROM_EMAIL,
    },
    to: [{ name: recipientName, address: email }],
    subject,
    text,
    html,
  })
}
