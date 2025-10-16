"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Pencil, Trash2, Search } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { getEmployees, deleteEmployee } from "@/lib/firebase-service"

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([])
  const [filteredEmployees, setFilteredEmployees] = useState([])
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchEmployees()
  }, [])

  useEffect(() => {
    const filtered = employees.filter(
      (emp) =>
        emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.position?.toLowerCase().includes(searchTerm.toLowerCase()),
    )
    setFilteredEmployees(filtered)
  }, [searchTerm, employees])

  async function fetchEmployees() {
    try {
      const data = await getEmployees()
      setEmployees(data)
      setFilteredEmployees(data)
    } catch (error) {
      console.error("Error fetching employees:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id) {
    if (confirm("Are you sure you want to delete this employee?")) {
      try {
        await deleteEmployee(id)
        fetchEmployees()
      } catch (error) {
        console.error("Error deleting employee:", error)
      }
    }
  }

  const getInitials = (name = "") => {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("")
      .trim() || "?"
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="mx-auto" />
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-900">Employees</h1>
        <Link href="/employees/add">
          <Button>Add Employee</Button>
        </Link>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search employees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Employee List</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredEmployees.length === 0 ? (
            <p className="text-slate-500">No employees found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="pb-3 text-left font-medium text-slate-600">Name</th>
                    <th className="pb-3 text-left font-medium text-slate-600">Email</th>
                    <th className="pb-3 text-left font-medium text-slate-600">Position</th>
                    <th className="pb-3 text-left font-medium text-slate-600">Department</th>
                    <th className="pb-3 text-left font-medium text-slate-600">Hourly Rate</th>
                    <th className="pb-3 text-right font-medium text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((employee) => (
                    <tr key={employee.id} className="border-b last:border-0">
                      <td className="py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 overflow-hidden rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center">
                            {employee.profilePhoto ? (
                              <img src={employee.profilePhoto} alt={employee.name} className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-xs font-semibold text-slate-600">{getInitials(employee.name)}</span>
                            )}
                          </div>
                          <span>{employee.name}</span>
                        </div>
                      </td>
                      <td className="py-4">{employee.email}</td>
                      <td className="py-4">{employee.position}</td>
                      <td className="py-4">{employee.department}</td>
                      <td className="py-4">₱{employee.hourlyRate}</td>
                      <td className="py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Link href={`/employees/edit/${employee.id}`}>
                            <Button variant="outline" size="sm">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button variant="outline" size="sm" onClick={() => handleDelete(employee.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
