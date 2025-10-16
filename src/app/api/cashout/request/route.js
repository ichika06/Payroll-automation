import { NextResponse } from "next/server"
import { addCashoutRequest, updateCashoutRequest } from "@/lib/firebase-service"
import { createPaymentLink } from "@/lib/paymongo"

export async function POST(request) {
  try {
    const body = await request.json()
    const { employeeId, employeeName, amount, method, accountDetails } = body

    if (!employeeId || !amount || !method) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Create PayMongo payment link for cashout
    console.log("Creating PayMongo PAYMENT LINK for cashout - NEW CODE VERSION...")
    const paymentLink = await createPaymentLink(
      amount,
      `Cashout for ${employeeName}`
    )
    console.log("Payment LINK created:", paymentLink)

    const cashoutId = await addCashoutRequest({
      employeeId,
      employeeName,
      amount,
      method,
      accountDetails,
      paymentLinkId: paymentLink.id,
      paymentLinkReference: paymentLink.attributes.reference_number,
      status: "pending_payment",
      createdAt: new Date(),
    })

    return NextResponse.json({
      success: true,
      cashoutId,
      paymentIntent: {
        id: paymentLink.id,
        client_key: paymentLink.attributes.reference_number,
        checkout_url: paymentLink.attributes.checkout_url,
      },
    })
  } catch (error) {
    console.error("Cashout request error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
