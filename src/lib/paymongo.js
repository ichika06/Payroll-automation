const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY
const PAYMONGO_API_URL = "https://api.paymongo.com/v1"

export async function createPaymentIntent(amount, description) {
  console.log("PayMongo: Creating payment intent", { amount, description })

  if (!PAYMONGO_SECRET_KEY) {
    throw new Error("PayMongo secret key not configured")
  }

  // Validate amount (PayMongo minimum is 100 centavos = 1 PHP)
  const centavosAmount = Math.round(amount * 100)
  if (centavosAmount < 100) {
    throw new Error(`Amount too small: ${amount} PHP (${centavosAmount} centavos). Minimum is 1 PHP.`)
  }

  console.log("PayMongo: Amount in centavos:", centavosAmount)

  const requestBody = {
    data: {
      attributes: {
        amount: centavosAmount,
        payment_method_allowed: ["gcash", "paymaya", "card"],
        payment_method_options: {
          card: { request_three_d_secure: "any" },
        },
        currency: "PHP",
        description: description || "Payroll Payment",
        statement_descriptor: "Payroll Payment",
      },
    },
  }

  console.log("PayMongo: Request body:", JSON.stringify(requestBody, null, 2))

  const response = await fetch(`${PAYMONGO_API_URL}/payment_intents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ":").toString("base64")}`,
    },
    body: JSON.stringify(requestBody),
  })

  console.log("PayMongo response status:", response.status)
  console.log("PayMongo response headers:", Object.fromEntries(response.headers.entries()))

  let responseText
  try {
    responseText = await response.text()
    console.log("PayMongo raw response:", responseText)
  } catch (textError) {
    console.error("Failed to read response text:", textError)
    throw new Error(`PayMongo API error: ${response.status} - Failed to read response`)
  }

  if (!response.ok) {
    console.error("PayMongo error response:", responseText)
    throw new Error(`PayMongo API error: ${response.status} - ${responseText}`)
  }

  let data
  try {
    data = JSON.parse(responseText)
  } catch (jsonError) {
    console.error("Failed to parse PayMongo response JSON:", jsonError)
    throw new Error(`PayMongo API error: ${response.status} - Invalid JSON response: ${responseText}`)
  }

  console.log("PayMongo success response:", data)
  return data.data
}

export async function createPaymentMethod(details) {
  const response = await fetch(`${PAYMONGO_API_URL}/payment_methods`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ":").toString("base64")}`,
    },
    body: JSON.stringify({
      data: {
        attributes: details,
      },
    }),
  })

  if (!response.ok) {
    throw new Error("Failed to create payment method")
  }

  const data = await response.json()
  return data.data
}

export async function createPaymentLink(amount, description, successUrl = null, failureUrl = null) {
  console.log("PayMongo: Creating payment link", { amount, description })

  if (!PAYMONGO_SECRET_KEY) {
    throw new Error("PayMongo secret key not configured")
  }

  // Validate amount (PayMongo minimum is 100 centavos = 1 PHP)
  const centavosAmount = Math.round(amount * 100)
  if (centavosAmount < 100) {
    throw new Error(`Amount too small: ${amount} PHP (${centavosAmount} centavos). Minimum is 1 PHP.`)
  }

  const requestBody = {
    data: {
      attributes: {
        amount: centavosAmount,
        currency: "PHP",
        description: description || "Cashout Payment",
        remarks: "Employee Cashout",
        payment_method_types: ["gcash", "paymaya", "card"],
      },
    },
  }

  // Add redirect URLs if provided
  if (successUrl || failureUrl) {
    requestBody.data.attributes.redirect_urls = {}
    if (successUrl) requestBody.data.attributes.redirect_urls.success = successUrl
    if (failureUrl) requestBody.data.attributes.redirect_urls.failed = failureUrl
  }

  console.log("PayMongo: Payment link request body:", JSON.stringify(requestBody, null, 2))

  const response = await fetch(`${PAYMONGO_API_URL}/links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ":").toString("base64")}`,
    },
    body: JSON.stringify(requestBody),
  })

  console.log("PayMongo payment link response status:", response.status)

  if (!response.ok) {
    const errorText = await response.text()
    console.error("PayMongo payment link error response:", errorText)
    throw new Error(`PayMongo API error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  console.log("PayMongo payment link success response:", data)
  return data.data
}

export async function fetchPaymentLink(linkId) {
  if (!linkId) {
    throw new Error("Payment link ID is required")
  }

  if (!PAYMONGO_SECRET_KEY) {
    throw new Error("PayMongo secret key not configured")
  }

  const response = await fetch(`${PAYMONGO_API_URL}/links/${linkId}`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ":").toString("base64")}`,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error("PayMongo fetch payment link error:", errorText)
    throw new Error(`PayMongo API error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  return data.data
}

export async function createPayout(amount, destination) {
  const response = await fetch(`${PAYMONGO_API_URL}/payouts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ":").toString("base64")}`,
    },
    body: JSON.stringify({
      data: {
        attributes: {
          amount: amount * 100,
          currency: "PHP",
          destination,
          description: "Employee Cashout",
        },
      },
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.errors?.[0]?.detail || "Failed to create payout")
  }

  const data = await response.json()
  return data.data
}
