"use client"

import { use, useEffect, useState } from "react"
import { getCashoutRequests } from "@/lib/firebase-service"

export default function ReceiptPage({ params }) {
  const { id } = use(params)
  const [cashout, setCashout] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReceipt()
  }, [id])

  const loadReceipt = async () => {
    try {
      // Find the cashout by transaction ID
      const cashouts = await getCashoutRequests()
      const foundCashout = cashouts.find(c => c.transactionId === id)

      if (foundCashout && foundCashout.status === "completed") {
        setCashout(foundCashout)
      } else {
        setCashout(null)
      }
    } catch (error) {
      console.error("Error loading receipt:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Redirecting to PayMongo receipt...</p>
        </div>
      </div>
    )
  }

  if (!cashout) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Receipt Not Available</h1>
          <p className="text-gray-600">The PayMongo receipt could not be loaded.</p>
          <p className="text-sm text-gray-500 mt-2">Transaction ID: {id}</p>
          <p className="text-xs text-gray-400 mt-4">Receipts are provided by PayMongo payment system</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-md mx-auto bg-white shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-violet-500 text-white p-6 text-center">
          <h1 className="text-xl font-bold">Payment Successful</h1>
          <p className="text-blue-100">PayMongo Test Receipt</p>
        </div>

        {/* Receipt Details */}
        <div className="p-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Transaction ID:</span>
              <span className="font-mono text-sm">{cashout.transactionId}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600">Amount:</span>
              <span className="font-bold text-lg">₱{cashout.amount?.toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600">Payment Method:</span>
              <span className="capitalize">{cashout.method}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600">Date:</span>
              <span>{cashout.completedAt?.toDate().toLocaleString()}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600">Recipient:</span>
              <span>{cashout.employeeName}</span>
            </div>

            {cashout.accountDetails && (
              <div className="border-t pt-4">
                <h3 className="font-medium text-gray-900 mb-2">Account Details</h3>

                {cashout.accountDetails.accountName && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Account Name:</span>
                    <span>{cashout.accountDetails.accountName}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Status */}
          <div className="mt-6 p-4 bg-green-50 rounded-lg">
            <div className="flex items-center">
              <div className="text-green-600 mr-2">✓</div>
              <span className="text-green-800 font-medium">Payment Completed Successfully</span>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t text-center text-sm text-gray-500">
            <p>Test receipt for educational purposes.</p>
            <p className="mt-1">PayMongo Test Environment</p>
          </div>
        </div>
      </div>
    </div>
  )
}