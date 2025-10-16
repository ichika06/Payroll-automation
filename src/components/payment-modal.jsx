"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, CreditCard, Smartphone, CheckCircle, XCircle } from "lucide-react"

export default function PaymentModal({
  isOpen,
  onClose,
  amount,
  employeeName,
  employeeId,
  onPaymentSuccess,
  onPaymentError,
  onPaymentLinkCreated,
}) {
  const [paymentStatus, setPaymentStatus] = useState('idle') // idle, processing, ready, waiting_payment, success, error
  const [paymentIntent, setPaymentIntent] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (isOpen && amount && employeeName) {
      initializePayment()
    }
  }, [isOpen, amount, employeeName])

  useEffect(() => {
    let pollInterval

    if (paymentStatus === 'waiting_payment' && paymentIntent) {
      // Poll for payment status updates
      pollInterval = setInterval(async () => {
        try {
          // Check if payment was completed by looking for updated cashout requests
          const response = await fetch(`/api/cashout/status/${paymentIntent.id}`)
          if (response.ok) {
            const statusData = await response.json()
            if (statusData.status === 'completed') {
              setPaymentStatus('success')
              onPaymentSuccess?.({ paymentLinkId: paymentIntent.id, ...statusData })
              clearInterval(pollInterval)
              setTimeout(() => {
                onClose()
              }, 2000)
            }
          }
        } catch (error) {
          console.error('Error polling payment status:', error)
        }
      }, 3000) // Check every 3 seconds

      // Stop polling after 10 minutes
      setTimeout(() => {
        if (pollInterval) clearInterval(pollInterval)
      }, 600000)
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval)
    }
  }, [paymentStatus, paymentIntent])

  const initializePayment = async () => {
    try {
      setPaymentStatus('processing')
      setErrorMessage('')

      // Create payment intent via API
      const response = await fetch("/api/cashout/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          employeeName,
          amount,
          method: "embedded",
          accountDetails: {
            accountNumber: "N/A",
            accountName: employeeName,
          },
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to create payment request")
      }

      const responseData = await response.json()

      if (responseData.paymentIntent?.checkout_url) {
        const paymentLink = responseData.paymentIntent
        setPaymentIntent(paymentLink)

        const linkId = paymentLink.id
        onPaymentLinkCreated?.(linkId)
        if (typeof window !== "undefined") {
          window.localStorage.setItem("lastPaymentLinkId", linkId)
        }

        setPaymentStatus('ready')
        // The checkout link will open in a new tab
      } else {
        throw new Error("Failed to get payment link")
      }
    } catch (error) {
      console.error("Payment initialization error:", error)
      setErrorMessage(error.message)
      setPaymentStatus('error')
      onPaymentError?.(error.message)
    }
  }

  const initializePayMongoPayment = (paymentIntent) => {
    // For embedded payments, we'll use an iframe with the payment link
    // The webhook will handle payment completion
    setPaymentStatus('ready')
  }

  const handleClose = () => {
    if (paymentStatus === 'processing' || paymentStatus === 'waiting_payment') {
      return // Don't allow closing while processing or waiting for payment
    }
    setPaymentStatus('idle')
    setPaymentIntent(null)
    setErrorMessage('')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Cash Out Payment
          </DialogTitle>
          <DialogDescription>
            Complete your ₱{amount?.toFixed(2)} cashout using PayMongo
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Amount Display */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Payment Amount</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-teal-600">
                ₱{amount?.toFixed(2)}
              </div>
              <p className="text-sm text-gray-600">For {employeeName}</p>
            </CardContent>
          </Card>

          {/* Payment Status */}
          {paymentStatus === 'processing' && (
            <div className="flex items-center justify-center p-8">
              <div className="text-center space-y-2">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-teal-600" />
                <p className="text-sm text-gray-600">Initializing payment...</p>
              </div>
            </div>
          )}

          {paymentStatus === 'ready' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 text-center">
                <div className="text-blue-600">
                  <CreditCard className="mx-auto mb-3 h-12 w-12" />
                  <h3 className="text-lg font-semibold">Pay on PayMongo</h3>
                </div>
                <p className="text-sm text-gray-600">
                  We generated a secure PayMongo checkout link for you. Open the checkout page in a new tab to complete the payment, then return here to see the confirmation.
                </p>
                <Button
                  className="mt-4 w-full bg-violet-500 hover:bg-violet-700"
                  onClick={() => {
                    if (!paymentIntent?.checkout_url) return
                    window.open(paymentIntent.checkout_url, '_blank')
                    setPaymentStatus('waiting_payment')
                  }}
                >
                  Open PayMongo Checkout
                </Button>
              </div>

              <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-left text-sm text-gray-600">
                <p className="font-medium text-gray-700">Payment Link</p>
                <p className="mt-1 break-all text-xs text-gray-500">{paymentIntent?.checkout_url}</p>
                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    const link = paymentIntent?.checkout_url
                    if (!link) return
                    if (navigator?.clipboard?.writeText) {
                      navigator.clipboard.writeText(link).catch((error) => {
                        console.error("Failed to copy payment link:", error)
                      })
                    } else {
                      console.warn("Clipboard API not available")
                    }
                  }}
                >
                  Copy Link
                </Button>
              </div>
            </div>
          )}

          {paymentStatus === 'waiting_payment' && (
            <div className="text-center p-8 space-y-4">
              <div className="text-blue-600">
                <Loader2 className="h-12 w-12 animate-spin mx-auto mb-2" />
                <h3 className="text-lg font-semibold">Waiting for Payment</h3>
              </div>
              <p className="text-sm text-gray-600">
                Complete your cashout in the new tab. This window will automatically update when payment is confirmed.
              </p>
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  onClick={() => window.open(paymentIntent?.checkout_url, '_blank')}
                >
                  Reopen Payment Page
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPaymentStatus('ready')
                  }}
                >
                  Back
                </Button>
              </div>
            </div>
          )}

          {paymentStatus === 'success' && (
            <div className="text-center p-8 space-y-4">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto" />
              <div>
                <h3 className="text-lg font-semibold text-green-600">Payment Successful!</h3>
                <p className="text-sm text-gray-600">Your cashout has been processed.</p>
              </div>
            </div>
          )}

          {paymentStatus === 'error' && (
            <div className="text-center p-8 space-y-4">
              <XCircle className="h-12 w-12 text-red-600 mx-auto" />
              <div>
                <h3 className="text-lg font-semibold text-red-600">Payment Failed</h3>
                <p className="text-sm text-gray-600">{errorMessage}</p>
              </div>
              <Button onClick={initializePayment} variant="outline">
                Try Again
              </Button>
            </div>
          )}
        </div>

        {paymentStatus !== 'processing' && paymentStatus !== 'success' && paymentStatus !== 'waiting_payment' && (
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}