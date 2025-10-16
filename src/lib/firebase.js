import { initializeApp, getApps, getApp } from "firebase/app"
import { getFirestore } from "firebase/firestore"
import { getAuth } from "firebase/auth"

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

let app
let db
let auth
let secondaryApp
let secondaryAuth

export function initializeFirebase() {
  // Allow initialization on both client and server
  if (!app) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()
  }

  if (!db) {
    db = getFirestore(app)
  }

  if (!auth && typeof window !== "undefined") {
    auth = getAuth(app)
  }

  return db
}

export function getFirebaseDb() {
  if (!db) {
    return initializeFirebase()
  }
  return db
}

export function getFirebaseAuth() {
  if (typeof window === "undefined") {
    return null // Auth not available on server
  }

  if (!auth) {
    initializeFirebase()
  }
  return auth
}

export function getSecondaryFirebaseAuth() {
  if (typeof window === "undefined") {
    return null
  }

  if (!secondaryApp) {
    const apps = getApps()
    secondaryApp = apps.find((existingApp) => existingApp.name === "Secondary")
    if (!secondaryApp) {
      secondaryApp = initializeApp(firebaseConfig, "Secondary")
    }
  }

  if (!secondaryAuth) {
    secondaryAuth = getAuth(secondaryApp)
  }

  return secondaryAuth
}

export function resetSecondaryAuth() {
  secondaryAuth = null
}
