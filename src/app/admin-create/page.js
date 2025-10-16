"use client"

import { useState } from "react"
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase"
import { createUserWithEmailAndPassword } from "firebase/auth"
import { collection, doc, setDoc } from "firebase/firestore"

export default function CreateAdminPage() {
  const [status, setStatus] = useState("")
  const [loading, setLoading] = useState(false)

  const createAdmin = async () => {
    setLoading(true)
    setStatus("Creating admin account...")

    try {
      const auth = getFirebaseAuth()
      const db = getFirebaseDb()

      const adminEmail = "payroll2025@admin.com"
      const adminPassword = "payrollpayroll2025admin!!"

      // Create admin user
      const userCredential = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword)
      const user = userCredential.user

      // Add admin data to Firestore
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: adminEmail,
        role: "admin",
        name: "System Administrator",
        createdAt: new Date().toISOString(),
        isActive: true
      })

      setStatus(`
        ✅ Admin account created successfully!
        
        Email: ${adminEmail}
        Password: ${adminPassword}
        UID: ${user.uid}
        
        Please save these credentials and delete this page!
      `)
    } catch (error) {
      setStatus(`❌ Error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
        <h1 className="mb-6 text-2xl font-bold text-slate-900">Create Admin Account</h1>

        <button
          onClick={createAdmin}
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-slate-400"
        >
          {loading ? "Creating..." : "Create Admin"}
        </button>

        {status && (
          <div className="mt-4 whitespace-pre-line rounded-lg bg-slate-100 p-4 text-sm">
            {status}
          </div>
        )}

        <div className="mt-6 rounded-lg bg-yellow-50 border border-yellow-200 p-4">
          <p className="text-sm text-yellow-800">
            ⚠️ <strong>Security Warning:</strong> Delete this page after creating the admin account!
          </p>
        </div>
      </div>
    </div>
  )
}