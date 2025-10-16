"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { getEmployees, getTimeLogs, getPayrolls } from "@/lib/firebase-service"
import { Spinner } from "@/components/ui/spinner"

const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"]

export default function AnalyticsPage() {
  const [data, setData] = useState({
    dailyHours: [],
    departmentData: [],
    topEmployees: [],
    payrollStatus: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [employees, timeLogs, payrolls] = await Promise.all([getEmployees(), getTimeLogs(), getPayrolls()])

        // Calculate daily hours
        const dailyHoursMap = {}
        timeLogs.forEach((log) => {
          if (log.timeIn && log.hoursWorked) {
            const date = log.timeIn.toDate().toLocaleDateString()
            dailyHoursMap[date] = (dailyHoursMap[date] || 0) + log.hoursWorked
          }
        })
        const dailyHours = Object.entries(dailyHoursMap)
          .map(([date, hours]) => ({ date, hours: Number.parseFloat(hours.toFixed(2)) }))
          .slice(-7)

        // Calculate department distribution
        const deptMap = {}
        employees.forEach((emp) => {
          deptMap[emp.department] = (deptMap[emp.department] || 0) + 1
        })
        const departmentData = Object.entries(deptMap).map(([name, value]) => ({
          name,
          value,
        }))

        // Calculate top employees by hours
        const empHoursMap = {}
        timeLogs.forEach((log) => {
          if (log.hoursWorked) {
            empHoursMap[log.employeeName] = (empHoursMap[log.employeeName] || 0) + log.hoursWorked
          }
        })
        const topEmployees = Object.entries(empHoursMap)
          .map(([name, hours]) => ({ name, hours: Number.parseFloat(hours.toFixed(2)) }))
          .sort((a, b) => b.hours - a.hours)
          .slice(0, 5)

        // Calculate payroll status
        const statusMap = { paid: 0, pending: 0, processing: 0 }
        payrolls.forEach((p) => {
          statusMap[p.status] = (statusMap[p.status] || 0) + 1
        })
        const payrollStatus = Object.entries(statusMap).map(([name, value]) => ({
          name,
          value,
        }))

        setData({ dailyHours, departmentData, topEmployees, payrollStatus })
      } catch (error) {
        console.error("Error fetching analytics:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="mx-auto" />
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="mb-8 text-3xl font-bold text-slate-900">Analytics</h1>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Daily Hours Worked</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.dailyHours}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="hours" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Department Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.departmentData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => entry.name}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {data.departmentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Employees by Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.topEmployees} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="hours" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payroll Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.payrollStatus}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => entry.name}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {data.payrollStatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
