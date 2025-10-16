import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  onAuthStateChanged,
} from "firebase/auth"
import { getFirebaseAuth } from "./firebase"
import { addDoc, collection, query, where, getDocs, updateDoc, doc } from "firebase/firestore"
import { getFirebaseDb, getSecondaryFirebaseAuth, resetSecondaryAuth } from "./firebase"

// Generate random password
export function generateRandomPassword(length = 12) {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
  let password = ""
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length))
  }
  return password
}

// Create user account for employee
export async function createEmployeeAccount(email, password, employeeData) {
  const db = getFirebaseDb()
  const secondaryAuth = getSecondaryFirebaseAuth()

  if (!secondaryAuth || !db) throw new Error("Firebase not initialized")

  try {
    // Create Firebase Auth user
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password)
    const user = userCredential.user

    // Store user data in Firestore
    await addDoc(collection(db, "users"), {
      uid: user.uid,
      email: email,
      role: employeeData.role || "employee",
      employeeId: employeeData.employeeId,
      createdAt: new Date(),
    })

    await signOut(secondaryAuth)
    resetSecondaryAuth()

    return { uid: user.uid, email: email }
  } catch (error) {
    if (secondaryAuth?.currentUser) {
      await signOut(secondaryAuth).catch(() => {})
    }
    resetSecondaryAuth()
    if (error?.code === "auth/email-already-in-use") {
      const emailError = new Error("Email already in use")
      emailError.code = error.code
      throw emailError
    }
    throw new Error(`Failed to create account: ${error.message}`)
  }
}

// Sign in
export async function signIn(email, password) {
  const auth = getFirebaseAuth()
  if (!auth) throw new Error("Firebase not initialized")

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    return userCredential.user
  } catch (error) {
    throw new Error(`Failed to sign in: ${error.message}`)
  }
}

// Sign out
export async function signOutUser() {
  const auth = getFirebaseAuth()
  if (!auth) throw new Error("Firebase not initialized")

  await signOut(auth)
}

// Change password
export async function changePassword(newPassword) {
  const auth = getFirebaseAuth()
  if (!auth) throw new Error("Firebase not initialized")

  const user = auth.currentUser
  if (!user) throw new Error("No user logged in")

  await updatePassword(user, newPassword)
}

// Get current user
export function getCurrentUser() {
  const auth = getFirebaseAuth()
  if (!auth) return null
  return auth.currentUser
}

// Listen to auth state changes
export function onAuthChange(callback) {
  const auth = getFirebaseAuth()
  if (!auth) return () => {}

  return onAuthStateChanged(auth, callback)
}

// Get user data from Firestore
export async function getUserData(uid) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  const q = query(collection(db, "users"), where("uid", "==", uid))
  const querySnapshot = await getDocs(q)

  if (!querySnapshot.empty) {
    const doc = querySnapshot.docs[0]
    return { id: doc.id, ...doc.data() }
  }
  return null
}

// Update user role
export async function updateUserRole(userId, role) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  const docRef = doc(db, "users", userId)
  await updateDoc(docRef, { role })
}
