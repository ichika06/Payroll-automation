import { NextResponse } from "next/server"
import { getCashoutRequestByPaymentLinkId, updateCashoutRequest } from "@/lib/firebase-service"
import { fetchPaymentLink } from "@/lib/paymongo"

export async function POST(request) {
  try {
    const body = await request.json()
    const { paymentLinkId } = body

    if (!paymentLinkId) {
      return NextResponse.json({ error: "Payment link ID is required" }, { status: 400 })
    }
    const cashout = await getCashoutRequestByPaymentLinkId(paymentLinkId)

    if (!cashout) {
      return NextResponse.json({ error: "Cashout not found for payment link" }, { status: 404 })
    }

    if (cashout.status === "completed") {
      return NextResponse.json({
        success: true,
        message: "Cashout already completed",
        cashoutId: cashout.id
      })
    }

    let linkData
    try {
      linkData = await fetchPaymentLink(paymentLinkId)
    } catch (linkError) {
      console.error("Failed to fetch payment link for completion:", linkError)
      return NextResponse.json({ error: "Unable to verify payment with PayMongo" }, { status: 502 })
    }

    const linkStatus = linkData?.attributes?.status

    if (linkStatus !== "paid") {
      return NextResponse.json({
        error: "Payment link not yet paid",
        status: linkStatus,
      }, { status: 409 })
    }

    const payments = linkData?.attributes?.payments || []
    const firstPaymentEntry = payments[0] || {}
    const firstPaymentAttributes = firstPaymentEntry.attributes || firstPaymentEntry

    const paymentUpdate = {
      status: "completed",
      completedAt: new Date(),
      transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      paymentDetails: {
        paymentLinkId,
        status: linkStatus,
        amount: linkData?.attributes?.amount,
        currency: linkData?.attributes?.currency,
        paidAt: linkData?.attributes?.updated_at,
        paymentMethod: firstPaymentAttributes?.source?.type || firstPaymentAttributes?.billing?.type || "unknown",
        payments,
      },
    }

    await updateCashoutRequest(cashout.id, paymentUpdate)

    return NextResponse.json({
      success: true,
      message: "Cashout marked as completed",
      cashoutId: cashout.id,
      paymentDetails: paymentUpdate.paymentDetails
    })

  } catch (error) {
    console.error("Complete payment error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}