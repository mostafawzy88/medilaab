'use client'

import { useState } from 'react'

type Appointment = {
  id: string
  patient_id: string | null
  manual_patient_id?: string | null
  scheduled_time: string
  status: string
  patient: { full_name: string } | null
  manual_patient?: { full_name: string } | null
  appointment_type?: string
  doctor_id?: string
}

export default function ClinicSchedule({ doctorId, appointments, onNewAppointment }: { doctorId: string, appointments: Appointment[], onNewAppointment?: () => void }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewState, setViewState] = useState<'Day' | 'Week'>('Day')
  const [viewMonth, setViewMonth] = useState(new Date()) // Month shown in mini calendar

  // Generate hours from 8 AM to 8 PM
  const hours = Array.from({ length: 13 }, (_, i) => i + 8)

  // Map appointments to slots
  const getApptForSlot = (date: Date, hour: number, isHalfHour: boolean) => {
    const slotString = new Date(date)
    slotString.setHours(hour, isHalfHour ? 30 : 0, 0, 0)
    
    return appointments.find(a => {
       const aptDate = new Date(a.scheduled_time)
       return aptDate.getFullYear() === slotString.getFullYear() &&
              aptDate.getMonth() === slotString.getMonth() &&
              aptDate.getDate() === slotString.getDate() &&
              aptDate.getHours() === slotString.getHours() &&
              aptDate.getMinutes() === slotString.getMinutes()
    })
  }

  const getDayLabel = (date: Date) => {
     return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  // Mini Calendar Helpers
  const daysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const firstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay()

  const changeMonth = (offset: number) => {
    const d = new Date(viewMonth)
    d.setMonth(d.getMonth() + offset)
    setViewMonth(d)
  }

  // Get days to render based on viewState
  const getDaysToRender = () => {
    if (viewState === 'Day') return [currentDate]
    const current = new Date(currentDate)
    const first = current.getDate() - current.getDay() // Start from Sunday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(current)
      d.setDate(first + i)
      return d
    })
  }

  const daysToRender = getDaysToRender()

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-emerald-600 border-emerald-400'
      case 'cancelled': return 'bg-gray-400 border-gray-300'
      case 'in_progress': return 'bg-blue-600 border-blue-400'
      default: return 'bg-[var(--color-cp-purple)] border-[var(--color-cp-purple-light)]' // scheduled, waiting, etc.
    }
  }

  const moveDate = (offset: number) => {
    const d = new Date(currentDate)
    d.setDate(d.getDate() + (viewState === 'Week' ? offset * 7 : offset))
    setCurrentDate(d)
    setViewMonth(d)
  }

  return (
    <div className="flex h-[800px] border border-gray-200 dark:border-[#2A214D] rounded-[24px] overflow-hidden bg-white dark:bg-[#150F2A] shadow-sm">
       {/* Left side panel (Mini Calendar & Team) */}
       <div className="w-64 border-r border-gray-200 dark:border-[#2A214D] bg-gray-50/50 dark:bg-[#0A0614] hidden md:flex flex-col p-4">
          <div className="mb-6">
             <h3 className="font-bold text-gray-900 dark:text-white flex justify-between items-center text-sm">
                {viewMonth.toLocaleDateString('default', { month: 'long', year: 'numeric' })}
                <div className="flex gap-2">
                   <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded text-gray-400 hover:text-gray-900 transition-colors">&lt;</button>
                   <button onClick={() => changeMonth(1)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded text-gray-400 hover:text-gray-900 transition-colors">&gt;</button>
                </div>
             </h3>
             <div className="grid grid-cols-7 gap-1 mt-4 text-[10px] text-center text-gray-400 font-black uppercase tracking-widest">
                <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
             </div>
             <div className="grid grid-cols-7 gap-y-1 mt-2">
                {/* Empty slots for first week offset */}
                {Array.from({length: firstDayOfMonth(viewMonth)}).map((_, i) => (
                   <div key={`empty-${i}`} className="w-7 h-7"></div>
                ))}
                {/* Days of month */}
                {Array.from({length: daysInMonth(viewMonth)}, (_, i) => {
                   const day = i + 1
                   const isSelected = currentDate.getDate() === day && currentDate.getMonth() === viewMonth.getMonth() && currentDate.getFullYear() === viewMonth.getFullYear()
                   const isToday = new Date().getDate() === day && new Date().getMonth() === viewMonth.getMonth() && new Date().getFullYear() === new Date().getFullYear()
                   
                   return (
                    <button 
                      key={day} 
                      onClick={() => {
                        const newDate = new Date(viewMonth)
                        newDate.setDate(day)
                        setCurrentDate(newDate)
                      }}
                      className={`w-7 h-7 rounded-lg mx-auto flex items-center justify-center text-[11px] font-bold transition-all ${
                        isSelected 
                          ? 'bg-[var(--color-cp-purple)] text-white shadow-md' 
                          : isToday 
                            ? 'text-[var(--color-cp-purple)] border border-[var(--color-cp-purple)]' 
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'
                      }`}
                    >
                       {day}
                    </button>
                   )
                })}
             </div>
          </div>

          <div className="mt-8">
             <p className="text-[10px] font-black text-gray-400 uppercase tracking-[2px] mb-4">TEAM MEMBERS</p>
             <div className="space-y-3">
                <div className="flex items-center gap-3">
                   <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--color-cp-purple)] to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">Dr</div>
                   <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Active Doctor</span>
                </div>
             </div>
          </div>
       </div>

       {/* Main Grid */}
       <div className="flex-1 flex flex-col min-w-0">
          {/* Header Controls */}
          <div className="h-16 border-b border-gray-200 dark:border-[#2A214D] px-6 flex justify-between items-center bg-white dark:bg-[#150F2A]">
             <div className="flex items-center gap-4">
                <button 
                   onClick={() => {
                     const now = new Date()
                     setCurrentDate(now)
                     setViewMonth(now)
                   }}
                   className="px-4 py-1.5 border border-gray-200 dark:border-[#2A214D] rounded-xl text-sm font-bold text-[var(--color-cp-purple)] hover:bg-gray-50 dark:hover:bg-[#1D1438] transition-colors"
                >Today</button>
                <div className="flex items-center gap-1 border border-gray-200 dark:border-[#2A214D] rounded-xl p-1 bg-gray-50 dark:bg-[#0A0614]">
                   <button onClick={() => moveDate(-1)} className="p-1 px-3 hover:bg-white dark:hover:bg-[#1D1438] hover:shadow-sm rounded-lg transition-all text-gray-500 font-bold">&lt;</button>
                   <span className="text-xs px-2 font-bold text-gray-400">📅</span>
                   <button onClick={() => moveDate(1)} className="p-1 px-3 hover:bg-white dark:hover:bg-[#1D1438] hover:shadow-sm rounded-lg transition-all text-gray-500 font-bold">&gt;</button>
                </div>
                <select 
                   value={viewState} 
                   onChange={(e) => setViewState(e.target.value as any)}
                   className="text-sm font-bold border border-gray-200 dark:border-[#2A214D] rounded-xl px-4 py-1.5 bg-white dark:bg-[#1D1438] text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-purple-500"
                >
                   <option value="Day" className="bg-white dark:bg-[#1D1438] text-gray-900 dark:text-white">Day View</option>
                   <option value="Week" className="bg-white dark:bg-[#1D1438] text-gray-900 dark:text-white">Week View</option>
                </select>
             </div>
             
             <div className="flex items-center gap-2">
                <button 
                  onClick={onNewAppointment}
                  className="px-5 py-2 bg-[var(--color-cp-purple)] text-white rounded-xl text-sm font-black shadow-lg shadow-purple-500/20 hover:bg-[var(--color-cp-purple-light)] hover:-translate-y-0.5 transition-all"
                >
                  + New Appointment
                </button>
             </div>
          </div>

          {/* Grid Area */}
          <div className="flex-1 overflow-y-auto">
             <div className="flex">
                {/* Time Axis */}
                <div className="w-20 border-r border-gray-100 dark:border-[#2A214D] text-xs text-gray-400 font-semibold sticky left-0 bg-white dark:bg-[#150F2A] z-10 pt-10 flex-shrink-0">
                   {hours.map(h => (
                     <div key={h} className="h-24 relative flex justify-end pr-2 -top-2">
                        {h % 12 === 0 ? 12 : h % 12} {h >= 12 ? 'PM' : 'AM'}
                     </div>
                   ))}
                </div>

                {/* Day Columns Container */}
                <div className="flex-1 flex pt-10 min-w-[600px] overflow-x-auto relative">
                   {daysToRender.map((day, idx) => (
                     <div key={idx} className="flex-1 relative border-r border-gray-100 dark:border-[#2A214D] last:border-r-0 min-w-[150px]">
                        <div className="absolute top-0 transform -translate-y-full left-0 right-0 h-10 border-b border-gray-100 dark:border-[#2A214D] bg-gray-50 dark:bg-[#0A0614] flex items-center justify-center font-bold text-blue-600 dark:text-blue-400 z-10">
                           {getDayLabel(day)}
                        </div>
                        
                        {/* Horizontal Grid Lines & Appointments */}
                        <div className="relative">
                          {hours.map(h => {
                             const topAppt = getApptForSlot(day, h, false)
                             const bottomAppt = getApptForSlot(day, h, true)
                             
                             return (
                               <div key={h} className="h-24 border-b border-gray-100 dark:border-[#2A214D] relative">
                                  {/* Half-hour dashed line visually */}
                                  <div className="absolute top-1/2 left-0 right-0 h-px border-b border-dashed border-gray-100 dark:border-[#2A214D]/50"></div>
                                  
                                  {/* Render 00 min slot block */}
                                  {topAppt && (
                                     <div className={`absolute top-0 left-1 right-1 h-11 ${getStatusColor(topAppt.status)} bg-opacity-90 rounded-md p-2 shadow-sm text-white border-l-4 hover:-translate-y-0.5 transition-transform cursor-pointer overflow-hidden z-20`}>
                                       <p className="text-xs font-black truncate leading-tight">{topAppt.patient?.full_name || topAppt.manual_patient?.full_name}</p>
                                       <p className="text-[10px] opacity-80 mt-0.5">{h % 12 === 0 ? 12 : h % 12}:00 {h >= 12 ? 'PM' : 'AM'} • {topAppt.status}</p>
                                     </div>
                                  )}

                                  {/* Render 30 min slot block */}
                                  {bottomAppt && (
                                     <div className={`absolute top-12 left-1 right-1 h-11 mb-1 ${getStatusColor(bottomAppt.status)} bg-opacity-90 rounded-md p-2 shadow-sm text-white border-l-4 hover:-translate-y-0.5 transition-transform cursor-pointer overflow-hidden z-20`}>
                                       <p className="text-xs font-black truncate leading-tight">{bottomAppt.patient?.full_name || bottomAppt.manual_patient?.full_name}</p>
                                       <p className="text-[10px] opacity-80 mt-0.5">{h % 12 === 0 ? 12 : h % 12}:30 {h >= 12 ? 'PM' : 'AM'} • {bottomAppt.status}</p>
                                     </div>
                                  )}
                               </div>
                             )
                          })}
                        </div>
                     </div>
                   ))}
                </div>
             </div>
          </div>
       </div>
    </div>
  )
}
