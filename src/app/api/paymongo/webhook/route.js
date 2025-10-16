import { NextResponse } from "next/server"
import { updateCashoutRequest, getCashoutRequestByPaymentLinkId } from "@/lib/firebase-service"

export async function POST(request) {
  try {
    const body = await request.json()
    console.log("PayMongo webhook received:", JSON.stringify(body, null, 2))

    const { data } = body

    if (!data) {
      return NextResponse.json({ error: "No data in webhook" }, { status: 400 })
    }

    const { attributes } = data

    // Check if this is a payment link payment completion
    if (attributes.type === "link.payment.succeeded") {
      const paymentLinkId = data.id

      console.log(`Payment link ${paymentLinkId} was successful. Looking for corresponding cashout request...`)

      // Find the cashout request with this payment link ID
      const cashoutRequest = await getCashoutRequestByPaymentLinkId(paymentLinkId)

      if (cashoutRequest) {
        console.log(`Found cashout request ${cashoutRequest.id}. Updating status to completed.`)

        // Update the cashout request to completed
        await updateCashoutRequest(cashoutRequest.id, {
          status: "completed",
          completedAt: new Date(),
          transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          paymentDetails: {
            paymentLinkId,
            paidAt: attributes.created_at,
            amount: attributes.amount,
            currency: attributes.currency,
            paymentMethod: attributes.payments?.[0]?.attributes?.source?.type || "unknown",
          }
        })

        console.log(`Cashout ${cashoutRequest.id} marked as completed`)

        return NextResponse.json({
          success: true,
          message: `Cashout ${cashoutRequest.id} payment completed and status updated`
        })
      } else {
        console.log(`No cashout request found for payment link ${paymentLinkId}`)
        return NextResponse.json({
          success: false,
          message: `No cashout request found for payment link ${paymentLinkId}`
        })
      }
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error("Webhook error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}