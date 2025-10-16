import { NextResponse } from "next/server"
import { updateCashoutRequest } from "@/lib/firebase-service"

export async function POST(request) {
  try {
    const body = await request.json()
    const { cashoutId } = body

    if (!cashoutId) {
      return NextResponse.json({ error: "Cashout ID is required" }, { status: 400 })
    }

    // Update cashout status to completed
    await updateCashoutRequest(cashoutId, {
      status: "completed",
      completedAt: new Date(),
      transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    })

    console.log(`Cashout ${cashoutId} marked as completed`)

    return NextResponse.json({
      success: true,
      message: "Cashout marked as completed"
    })

  } catch (error) {
    console.error("Mark as paid error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}