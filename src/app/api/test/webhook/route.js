import { NextResponse } from "next/server"

// Test endpoint to simulate PayMongo webhook for testing
export async function POST(request) {
  try {
    const { paymentLinkId } = await request.json()

    if (!paymentLinkId) {
      return NextResponse.json({ error: "paymentLinkId is required" }, { status: 400 })
    }

    // Simulate PayMongo webhook payload
    const webhookPayload = {
      data: {
        id: paymentLinkId,
        type: "link",
        attributes: {
          type: "payment_link",
          status: "paid",
          paid_at: Math.floor(Date.now() / 1000),
          amount: 100000, // ₱1000.00 in centavos
          currency: "PHP"
        }
      }
    }

    // Call the webhook endpoint
    const webhookResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/paymongo/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookPayload)
    })

    const webhookResult = await webhookResponse.json()

    return NextResponse.json({
      success: true,
      message: "Webhook simulation completed",
      webhookResult
    })

  } catch (error) {
    console.error("Test webhook error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}