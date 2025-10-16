import { getFirebaseDb } from "./firebase"
import { collection, query, where, getDocs, doc, updateDoc, getDoc, addDoc } from "firebase/firestore"

// Get employee by ID
export async function getEmployeeById(employeeId) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  try {
    // First try to find by employeeId field
    const q = query(collection(db, "users"), where("employeeId", "==", employeeId))
    const querySnapshot = await getDocs(q)

    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0]
      return { id: doc.id, ...doc.data() }
    }

    // If not found by employeeId, try direct document ID
    const docRef = doc(db, "users", employeeId)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() }
    }

    return null
  } catch (error) {
    console.error("Error getting employee:", error)
    throw new Error(`Failed to get employee: ${error.message}`)
  }
}

// Update employee data
export async function updateEmployee(employeeId, employeeData) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  try {
    // First find the document by employeeId
    const q = query(collection(db, "users"), where("employeeId", "==", employeeId))
    const querySnapshot = await getDocs(q)

    if (!querySnapshot.empty) {
      const docRef = doc(db, "users", querySnapshot.docs[0].id)
      await updateDoc(docRef, {
        ...employeeData,
        updatedAt: new Date(),
      })
      return true
    }

    // If not found by employeeId, try direct document ID
    const docRef = doc(db, "users", employeeId)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      await updateDoc(docRef, {
        ...employeeData,
        updatedAt: new Date(),
      })
      return true
    }

    throw new Error("Employee not found")
  } catch (error) {
    console.error("Error updating employee:", error)
    throw new Error(`Failed to update employee: ${error.message}`)
  }
}

// Get all employees
export async function getAllEmployees() {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  try {
    const q = query(collection(db, "users"), where("role", "==", "employee"))
    const querySnapshot = await getDocs(q)

    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
  } catch (error) {
    console.error("Error getting employees:", error)
    throw new Error(`Failed to get employees: ${error.message}`)
  }
}

// Create new employee
export async function createEmployee(employeeData) {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase not initialized")

  try {
    const docRef = await addDoc(collection(db, "users"), {
      ...employeeData,
      role: "employee",
      createdAt: new Date(),
      isActive: true,
    })

    return { id: docRef.id, ...employeeData }
  } catch (error) {
    console.error("Error creating employee:", error)
    throw new Error(`Failed to create employee: ${error.message}`)
  }
}