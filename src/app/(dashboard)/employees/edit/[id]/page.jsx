"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { getEmployee as fetchEmployee, updateEmployee as updateEmployeeRecord } from "@/lib/firebase-service"
import { toast } from "sonner"

function splitName(fullName = "") {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return { firstName: "", lastName: "" }
  }

  const [firstName, ...rest] = parts
  return {
    firstName,
    lastName: rest.join(" "),
  }
}

export default function EditEmployeePage({ params }) {
  const router = useRouter()
  const unwrappedParams = use(params)
  const id = unwrappedParams?.id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [employee, setEmployee] = useState(null)
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    position: "",
    department: "",
    hourlyRate: "",
    employmentType: "full-time",
    profilePhoto: "",
  })
  const [previewPhoto, setPreviewPhoto] = useState("")
  const [photoInputKey, setPhotoInputKey] = useState(() => Date.now())

  useEffect(() => {
    if (!id) return
    loadEmployee(id)
  }, [id])

  async function loadEmployee(employeeId) {
    try {
      const data = await fetchEmployee(employeeId)
      if (!data) {
        setEmployee(null)
        return
      }

      setEmployee(data)
      const { firstName, lastName } = splitName(data.name ?? "")

      setFormData({
        firstName,
        lastName,
        email: data.email ?? "",
        phone: data.phone ?? "",
        position: data.position ?? "",
        department: data.department ?? "",
        hourlyRate: data.hourlyRate != null ? String(data.hourlyRate) : "",
        employmentType: data.employmentType ?? "full-time",
        profilePhoto: data.profilePhoto ?? "",
      })
      setPreviewPhoto(data.profilePhoto ?? "")
      setPhotoInputKey(Date.now())
    } catch (error) {
      console.error("Error loading employee:", error)
      toast.error("Failed to load employee", {
        description: error?.message || "Please try again later.",
      })
      setEmployee(null)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSelectChange = (name, value) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handlePhotoUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload a valid image file.")
      event.target.value = ""
      setPhotoInputKey(Date.now())
      return
    }

    const maxSizeMb = 2
    if (file.size > maxSizeMb * 1024 * 1024) {
      toast.error(`Image must be smaller than ${maxSizeMb}MB.`)
      event.target.value = ""
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

  const handleRemovePhoto = () => {
    setFormData((prev) => ({ ...prev, profilePhoto: "" }))
    setPreviewPhoto("")
    setPhotoInputKey(Date.now())
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!id) return

    const hourlyRateValue = Number.parseFloat(formData.hourlyRate)
    if (Number.isNaN(hourlyRateValue)) {
      toast.error("Please enter a valid hourly rate.")
      return
    }

    setSaving(true)

    try {
      const payload = {
        name: `${formData.firstName} ${formData.lastName}`.trim(),
        email: formData.email,
        phone: formData.phone,
        position: formData.position,
        department: formData.department,
        hourlyRate: hourlyRateValue,
        employmentType: formData.employmentType,
        profilePhoto: formData.profilePhoto || null,
      }

      await updateEmployeeRecord(id, payload)
      toast.success("Employee updated", {
        description: "Changes saved successfully.",
      })
      router.push("/employees")
    } catch (error) {
      console.error("Error updating employee:", error)
      toast.error("Failed to update employee", {
        description: error?.message || "Something went wrong while saving.",
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!employee) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-slate-600">Employee not found</p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="mb-8 text-3xl font-bold text-slate-900">Edit Employee</h1>

      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>Employee Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="profilePhoto">Profile Photo</Label>
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
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
                <Input id="lastName" name="lastName" value={formData.lastName} onChange={handleChange} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} disabled />
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
                <Select value={formData.employmentType} onValueChange={(value) => handleSelectChange("employmentType", value)}>
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
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <span className="flex items-center gap-2">
                    <Spinner className="h-4 w-4 text-white" />
                    Saving...
                  </span>
                ) : (
                  "Save Changes"
                )}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push("/employees")}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
