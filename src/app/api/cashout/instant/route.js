import { NextResponse } from "next/server"
import { createPaymentIntent } from "@/lib/paymongo"
import { updatePayroll, addCashoutRequest } from "@/lib/firebase-service"

export async function POST(request) {
  try {
    const { payrollId, employeeId, employeeName, amount, description } = await request.json()

    console.log("Processing instant cashout:", { payrollId, employeeId, amount })

    // Validate required fields
    if (!payrollId || !employeeId || !amount || !description) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Validate amount
    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 })
    }

    // Create payment intent with PayMongo for cashout
    console.log("Creating PayMongo payment intent for cashout...")
    const paymentIntent = await createPaymentIntent(amount, description)
    console.log("Payment intent created:", paymentIntent)

    // Update payroll status to paid
    console.log("Updating payroll status to paid...")
    await updatePayroll(payrollId, {
      status: "paid",
      paymentIntentId: paymentIntent.id,
      cashedOutAt: new Date(),
      cashoutAmount: amount,
    })

    // Record the cashout transaction
    const cashoutId = await addCashoutRequest({
      employeeId,
      employeeName,
      amount,
      method: "instant_paymongo",
      status: "completed",
      paymentIntentId: paymentIntent.id,
      description,
      completedAt: new Date(),
    })

    console.log("Cashout completed successfully")

    return NextResponse.json({
      success: true,
      cashoutId,
      paymentIntent,
      message: "Cashout processed successfully"
    })
  } catch (error) {
    console.error("Instant cashout error:", error)
    console.error("Error stack:", error.stack)
    return NextResponse.json({
      error: "Failed to process instant cashout",
      details: error.message
    }, { status: 500 })
  }
}