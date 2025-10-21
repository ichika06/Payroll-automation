"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { addEmployee } from "@/lib/firebase-service"
import { createEmployeeAccount, generateRandomPassword } from "@/lib/auth-service"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"

export default function AddEmployeePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ type: "", text: "" })
  const [generatedPassword, setGeneratedPassword] = useState("")
  const [createAccount, setCreateAccount] = useState(true)
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    position: "",
    department: "",
    hourlyRate: "",
    employmentType: "full-time",
    profilePhoto: "",
    startingShift: "08:00",
    endingShift: "17:00",
  })
  const [previewPhoto, setPreviewPhoto] = useState("")
  const [photoInputKey, setPhotoInputKey] = useState(() => Date.now())

  function handleChange(e) {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  function handleSelectChange(name, value) {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  function handlePhotoUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      event.target.value = ""
      setMessage({ type: "error", text: "Please upload a valid image file." })
      setPhotoInputKey(Date.now())
      return
    }

    const maxSizeMb = 2
    if (file.size > maxSizeMb * 1024 * 1024) {
      event.target.value = ""
      setMessage({ type: "error", text: `Image must be smaller than ${maxSizeMb}MB.` })
      setPhotoInputKey(Date.now())
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      setFormData((prev) => ({ ...prev, profilePhoto: result }))
      setPreviewPhoto(result)
    }
    reader.readAsDataURL(file)
  }

  function handleRemovePhoto() {
    setFormData((prev) => ({ ...prev, profilePhoto: "" }))
    setPreviewPhoto("")
    setPhotoInputKey(Date.now())
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage({ type: "", text: "" })

    try {
      const employeeId = await addEmployee({
        name: `${formData.firstName} ${formData.lastName}`,
        email: formData.email,
        phone: formData.phone,
        position: formData.position,
        department: formData.department,
        hourlyRate: Number.parseFloat(formData.hourlyRate),
        employmentType: formData.employmentType,
        profilePhoto: formData.profilePhoto || null,
        startingShift: formData.startingShift,
        endingShift: formData.endingShift,
      })

      if (createAccount) {
        const password = generateRandomPassword()
        setGeneratedPassword(password)

        // Create employee account
        await createEmployeeAccount(formData.email, password, {
          role: "employee",
          employeeId: employeeId,
        })

        setMessage({
          type: "success",
          text: "Employee added successfully! Login credentials have been generated below. Please share these credentials with the employee securely.",
        })
      } else {
        setMessage({
          type: "success",
          text: "Employee added successfully without login account!",
        })
        setTimeout(() => router.push("/employees"), 2000)
      }
    } catch (error) {
      console.error("Error adding employee:", error)
      const errorText = error?.message === "Email already in use" ? error.message : `Failed to add employee: ${error.message}`
      setMessage({ type: "error", text: errorText })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      <h1 className="mb-8 text-3xl font-bold text-slate-900">Add Employee</h1>

      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>Employee Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {message.text && (
              <Alert variant={message.type === "error" ? "destructive" : "default"}>
                <AlertDescription className="whitespace-pre-line">{message.text}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="profilePhoto">Profile Photo</Label>
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <div className="h-20 w-20 overflow-hidden rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center">
                    {previewPhoto ? (
                      <img src={previewPhoto} alt="Profile preview" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-sm text-slate-500">No photo</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Input
                      key={photoInputKey}
                      id="profilePhoto"
                      name="profilePhoto"
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                    />
                    {previewPhoto && (
                      <Button type="button" variant="outline" className="w-max" onClick={handleRemovePhoto}>
                        Remove Photo
                      </Button>
                    )}
                    <p className="text-xs text-slate-500">Supported formats: JPG, PNG. Max size 2MB.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input id="firstName" name="firstName" value={formData.firstName} onChange={handleChange} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" name="lastName" value={formData.lastName} onChange={handleChange} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" name="phone" value={formData.phone} onChange={handleChange} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="position">Position</Label>
                <Input id="position" name="position" value={formData.position} onChange={handleChange} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input id="department" name="department" value={formData.department} onChange={handleChange} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hourlyRate">Hourly Rate (₱)</Label>
                <Input
                  id="hourlyRate"
                  name="hourlyRate"
                  type="number"
                  step="0.01"
                  value={formData.hourlyRate}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="employmentType">Employment Type</Label>
                <Select
                  value={formData.employmentType}
                  onValueChange={(value) => handleSelectChange("employmentType", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full-time">Full-time</SelectItem>
                    <SelectItem value="part-time">Part-time</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="startingShift">Starting Shift</Label>
                <Input
                  id="startingShift"
                  name="startingShift"
                  type="time"
                  value={formData.startingShift}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endingShift">Ending Shift</Label>
                <Input
                  id="endingShift"
                  name="endingShift"
                  type="time"
                  value={formData.endingShift}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 rounded-lg border p-4">
              <Checkbox id="createAccount" checked={createAccount} onCheckedChange={setCreateAccount} />
              <div className="flex-1">
                <Label htmlFor="createAccount" className="cursor-pointer font-medium">
                  Create login account for employee
                </Label>
                <p className="text-sm text-slate-600">
                  A random password will be generated and displayed after creation
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Spinner className="h-4 w-4 text-white" />
                    Adding...
                  </span>
                ) : (
                  "Add Employee"
                )}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push("/employees")}>
                Cancel
              </Button>
            </div>

            {generatedPassword && (
              <div className="rounded-lg bg-blue-50 p-4 border border-blue-200">
                <p className="font-semibold text-blue-900 mb-2">Account Created Successfully!</p>
                <p className="text-sm text-blue-800 mb-2">Please share these credentials with the employee securely:</p>
                <div className="bg-white p-3 rounded border border-blue-300 font-mono text-sm">
                  <p>
                    <strong>Email:</strong> {formData.email}
                  </p>
                  <p>
                    <strong>Password:</strong> {generatedPassword}
                  </p>
                </div>
                <p className="text-xs text-blue-700 mt-2">
                  The employee can change their password after first login in Settings.
                </p>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
