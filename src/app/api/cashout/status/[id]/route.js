import { NextResponse } from "next/server"
import { getCashoutRequestByPaymentLinkId, updateCashoutRequest } from "@/lib/firebase-service"
import { fetchPaymentLink } from "@/lib/paymongo"

export async function GET(request, { params }) {
  try {
    const { id: paymentLinkId } = await params

    if (!paymentLinkId) {
      return NextResponse.json({ error: "Payment link ID is required" }, { status: 400 })
    }

    // Find the cashout request with this payment link ID
    const cashoutRequest = await getCashoutRequestByPaymentLinkId(paymentLinkId)

    if (!cashoutRequest) {
      return NextResponse.json({ error: "Cashout request not found" }, { status: 404 })
    }

    // Attempt to sync status with PayMongo if not yet completed
    if (cashoutRequest.status !== "completed") {
      try {
        const linkData = await fetchPaymentLink(paymentLinkId)
        const linkStatus = linkData?.attributes?.status

        if (linkStatus === "paid") {
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

          await updateCashoutRequest(cashoutRequest.id, paymentUpdate)

          cashoutRequest.status = "completed"
          cashoutRequest.completedAt = paymentUpdate.completedAt
          cashoutRequest.paymentDetails = paymentUpdate.paymentDetails
        }
      } catch (syncError) {
        console.error("Failed to sync payment link status:", syncError)
      }
    }

    return NextResponse.json({
      status: cashoutRequest.status,
      cashoutRequest
    })
  } catch (error) {
    console.error("Payment status check error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}