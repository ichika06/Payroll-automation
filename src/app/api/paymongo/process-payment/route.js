import { NextResponse } from "next/server"
import { createPaymentLink } from "@/lib/paymongo"
import { updatePayroll } from "@/lib/firebase-service"

export async function POST(request) {
  try {
    const { amount, description, payrollId } = await request.json()

    console.log("Processing payment:", { amount, description, payrollId })

    // Validate required fields
    if (!amount || !description || !payrollId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Validate amount
    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 })
    }

    // Create PayMongo payment link for payroll
    console.log("Creating PayMongo payment link for payroll...")
    const paymentLink = await createPaymentLink(
      amount,
      description,
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/payroll/success`,
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/payroll/failed`
    )
    console.log("Payment link created:", paymentLink)

    // Update payroll status
    console.log("Updating payroll status...")
    await updatePayroll(payrollId, {
      status: "processing",
      paymentLinkId: paymentLink.id,
      paymentLinkUrl: paymentLink.attributes.checkout_url,
    })
    console.log("Payroll updated successfully")

    return NextResponse.json({
      success: true,
      paymentLink: paymentLink.attributes.checkout_url,
      paymentLinkId: paymentLink.id,
    })
  } catch (error) {
    console.error("Error processing payment:", error)
    console.error("Error stack:", error.stack)
    return NextResponse.json({
      error: "Failed to process payment",
      details: error.message
    }, { status: 500 })
  }
}
