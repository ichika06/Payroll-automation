import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  setDoc,
} from "firebase/firestore"
import { getFirebaseDb } from "./firebase"

// Employee functions
export async function addEmployee(employeeData) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  const docRef = await addDoc(collection(db, "employees"), {
    ...employeeData,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return docRef.id
}

export async function getEmployees() {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  try {
    // Fetch users with role "employee" from "users" collection
    const usersQuery = query(collection(db, "users"), where("role", "==", "employee"))
    const usersSnapshot = await getDocs(usersQuery)

    // Get detailed employee data from "employees" collection
    const employeesSnapshot = await getDocs(collection(db, "employees"))

    console.log("Users found:", usersSnapshot.docs.length)
    console.log("Employee details found:", employeesSnapshot.docs.length)

    // Create a map of employee details by ID
    const employeeDetailsMap = {}
    employeesSnapshot.docs.forEach((doc) => {
      console.log("Employee doc ID:", doc.id, "Data:", doc.data())
      employeeDetailsMap[doc.id] = { id: doc.id, ...doc.data() }
    })

    // Merge user data with employee details
    const employees = []
    usersSnapshot.docs.forEach((userDoc) => {
      const userData = userDoc.data()
      let employeeDetails = null

      // Try to match by employeeId first
      if (userData.employeeId) {
        employeeDetails = employeeDetailsMap[userData.employeeId]
      }

      // If not found by employeeId, try to match by email
      if (!employeeDetails) {
        employeeDetails = Object.values(employeeDetailsMap).find(emp => emp.email === userData.email)
      }

      console.log("User data:", userData)
      console.log("Employee details found:", !!employeeDetails)
      if (employeeDetails) {
        console.log("Employee details:", employeeDetails)
      }

      if (employeeDetails) {
        employees.push({
          id: userDoc.id,
          uid: userData.uid,
          email: userData.email,
          role: userData.role,
          employeeId: userData.employeeId,
          // Merge with detailed employee data
          ...employeeDetails,
          createdAt: userData.createdAt,
        })
      } else {
        // If no detailed data found, create basic employee object
        employees.push({
          id: userDoc.id,
          uid: userData.uid,
          email: userData.email,
          role: userData.role,
          employeeId: userData.employeeId,
          name: userData.email, // fallback to email as name
          createdAt: userData.createdAt,
        })
      }
    })

    console.log("Final employees array:", employees)
    return employees
  } catch (error) {
    console.error("Error fetching employees:", error)
    throw error
  }
}

export async function getEmployee(id) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  const docRef = doc(db, "employees", id)
  const docSnap = await getDoc(docRef)

  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() }
  }
  return null
}

export async function updateEmployee(id, employeeData) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  const docRef = doc(db, "employees", id)
  await updateDoc(docRef, {
    ...employeeData,
    updatedAt: Timestamp.now(),
  })
}

export async function deleteEmployee(id) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  await deleteDoc(doc(db, "employees", id))
}

export async function getEmployeeByEmail(email) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  const q = query(collection(db, "employees"), where("email", "==", email))
  const querySnapshot = await getDocs(q)

  if (!querySnapshot.empty) {
    const doc = querySnapshot.docs[0]
    return { id: doc.id, ...doc.data() }
  }
  return null
}

// Time log functions
export async function addTimeLog(timeLogData) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  const docRef = await addDoc(collection(db, "timeLogs"), {
    ...timeLogData,
    createdAt: Timestamp.now(),
  })
  return docRef.id
}

export async function getTimeLogs(employeeId = null) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  let q = collection(db, "timeLogs")

  if (employeeId) {
    q = query(q, where("employeeId", "==", employeeId))
  }

  q = query(q, orderBy("timeIn", "desc"))

  const querySnapshot = await getDocs(q)
  return querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }))
}

export async function getApprovedLeavesInRange(employeeId, startDate, endDate) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  if (!employeeId) {
    return []
  }

  try {
    const leavesCollection = collection(db, "leaveRequests")
    const q = query(leavesCollection, where("employeeId", "==", employeeId))
    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      return []
    }

    const rangeStart = convertToDate(startDate)
    const rangeEnd = convertToDate(endDate)

    if (!rangeStart || !rangeEnd) {
      return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    }

    const startTime = rangeStart.getTime()
    const endTime = rangeEnd.getTime()

    return snapshot.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .filter((leave) => {
        if (leave.status && leave.status !== "approved") {
          return false
        }

        const leaveStart = convertToDate(leave.startDate || leave.date || leave.fromDate)
        const leaveEnd = convertToDate(leave.endDate || leave.date || leave.toDate || leave.startDate)

        if (!leaveStart) {
          return false
        }

        const leaveStartTime = leaveStart.getTime()
        const leaveEndTime = leaveEnd ? leaveEnd.getTime() : leaveStartTime

        return leaveEndTime >= startTime && leaveStartTime <= endTime
      })
  } catch (error) {
    console.error("Error fetching leave requests:", error)
    return []
  }
}

export async function updateTimeLog(id, timeLogData) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  const docRef = doc(db, "timeLogs", id)
  await updateDoc(docRef, timeLogData)
}

export async function getActiveTimeLog(employeeId) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  const q = query(collection(db, "timeLogs"), where("employeeId", "==", employeeId), where("timeOut", "==", null))

  const querySnapshot = await getDocs(q)
  if (!querySnapshot.empty) {
    const doc = querySnapshot.docs[0]
    return { id: doc.id, ...doc.data() }
  }
  return null
}

// Payroll functions
export async function addPayroll(payrollData) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  const docRef = await addDoc(collection(db, "payroll"), {
    ...payrollData,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return docRef.id
}

export async function getPayrolls() {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  const q = query(collection(db, "payroll"), orderBy("createdAt", "desc"))
  const querySnapshot = await getDocs(q)
  return querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }))
}

export async function updatePayroll(id, payrollData) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  const docRef = doc(db, "payroll", id)
  await updateDoc(docRef, {
    ...payrollData,
    updatedAt: Timestamp.now(),
  })
}

export async function getPayrollsByEmployee(employeeId) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  const q = query(collection(db, "payroll"), where("employeeId", "==", employeeId), orderBy("createdAt", "desc"))
  const querySnapshot = await getDocs(q)
  return querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }))
}

// Cashout request functions
export async function addCashoutRequest(cashoutData) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  const docRef = await addDoc(collection(db, "cashoutRequests"), {
    ...cashoutData,
    status: "pending",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return docRef.id
}

export async function getCashoutRequests(employeeId = null) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  let q = collection(db, "cashoutRequests")

  if (employeeId) {
    q = query(q, where("employeeId", "==", employeeId))
  }

  q = query(q, orderBy("createdAt", "desc"))

  const querySnapshot = await getDocs(q)
  return querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }))
}

export async function updateCashoutRequest(id, cashoutData) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  const docRef = doc(db, "cashoutRequests", id)
  await updateDoc(docRef, {
    ...cashoutData,
    updatedAt: Timestamp.now(),
  })
}

export async function getCashoutRequestByPaymentLinkId(paymentLinkId) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  const q = query(
    collection(db, "cashoutRequests"),
    where("paymentLinkId", "==", paymentLinkId)
  )

  const querySnapshot = await getDocs(q)
  if (querySnapshot.empty) {
    return null
  }

  const doc = querySnapshot.docs[0]
  return {
    id: doc.id,
    ...doc.data(),
  }
}

export async function getCashoutRequestByPaymentIntentId(paymentIntentId) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  const q = query(
    collection(db, "cashoutRequests"),
    where("paymentIntentId", "==", paymentIntentId)
  )

  const querySnapshot = await getDocs(q)
  if (querySnapshot.empty) {
    return null
  }

  const doc = querySnapshot.docs[0]
  return {
    id: doc.id,
    ...doc.data(),
  }
}

// Settings functions
export async function getPayrollSettings() {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  const settingsRef = doc(db, "settings", "payroll")
  const settingsSnap = await getDoc(settingsRef)

  if (!settingsSnap.exists()) {
    return {
      minHoursPerShift: 8,
    }
  }

  const data = settingsSnap.data() || {}
  return {
    minHoursPerShift: data.minHoursPerShift ?? 8,
    ...data,
  }
}

export async function updatePayrollSettings(settingsData) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  const settingsRef = doc(db, "settings", "payroll")
  await setDoc(
    settingsRef,
    {
      ...settingsData,
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  )
}

// Notification functions
export async function addNotification(notificationData) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  const docRef = await addDoc(collection(db, "notifications"), {
    ...notificationData,
    read: notificationData.read ?? false,
    createdAt: Timestamp.now(),
  })

  return docRef.id
}

export async function getNotifications({ recipientType, employeeId } = {}) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  const snapshot = await getDocs(collection(db, "notifications"))

  const notifications = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))

  const filtered = notifications.filter((notification) => {
    if (recipientType === "admin") {
      return notification.recipientType === "admin"
    }

    if (recipientType === "employee" && employeeId) {
      return notification.recipientType === "employee" && notification.employeeId === employeeId
    }

    if (employeeId) {
      return notification.employeeId === employeeId
    }

    return true
  })

  return filtered.sort((a, b) => {
    const aDate = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0)
    const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0)
    return bDate - aDate
  })
}

export async function markNotificationRead(notificationId) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  const notificationRef = doc(db, "notifications", notificationId)
  await updateDoc(notificationRef, {
    read: true,
    readAt: Timestamp.now(),
  })
}

function convertToDate(value) {
  if (!value) {
    return null
  }

  if (typeof value.toDate === "function") {
    return value.toDate()
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  if (typeof value === "number") {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  if (typeof value === "string") {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  return null
}
