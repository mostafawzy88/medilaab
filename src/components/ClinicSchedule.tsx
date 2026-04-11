'use client'

import { useState } from 'react'

type Appointment = {
  id: string
  patient_id: string
  scheduled_time: string
  status: string
  patient: { full_name: string }
  appointment_type?: string
}

export default function ClinicSchedule({ doctorId, appointments }: { doctorId: string, appointments: Appointment[] }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewState, setViewState] = useState<'Day' | 'Week'>('Day')

  // Generate hours from 8 AM to 8 PM
  const hours = Array.from({ length: 13 }, (_, i) => i + 8)

  // Map appointments to slots
  const getApptForSlot = (date: Date, hour: number, isHalfHour: boolean) => {
    const slotString = new Date(date)
    slotString.setHours(hour, isHalfHour ? 30 : 0, 0, 0)
    
    // Normalize to timezone offset to compare with DB string
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
     return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })
  }

  return (
    <div className="flex h-[800px] border border-gray-200 dark:border-[#2A214D] rounded-[24px] overflow-hidden bg-white dark:bg-[#150F2A] shadow-sm">
       {/* Left side panel (Mini Calendar & Team) */}
       <div className="w-64 border-r border-gray-200 dark:border-[#2A214D] bg-gray-50/50 dark:bg-[#0A0614] hidden md:flex flex-col p-4">
          <div className="mb-6">
             <h3 className="font-bold text-gray-900 dark:text-white flex justify-between items-center">
               {currentDate.toLocaleDateString('default', { month: 'long', year: 'numeric' })}
               <div className="flex gap-1 text-gray-400">
                  <span className="cursor-pointer hover:text-gray-900">&lt;</span>
                  <span className="cursor-pointer hover:text-gray-900">&gt;</span>
               </div>
             </h3>
             <div className="grid grid-cols-7 gap-1 mt-4 text-xs text-center text-gray-500 font-bold">
                <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
             </div>
             {/* Simple visual placeholder for mini calendar to match design */}
             <div className="grid grid-cols-7 gap-y-2 mt-2">
                {Array.from({length: 31}, (_, i) => (
                   <div key={i} className={`w-6 h-6 rounded-full mx-auto flex items-center justify-center text-xs ${i+1 === currentDate.getDate() ? 'bg-[var(--color-cp-purple)] text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'}`}>
                      {i+1}
                   </div>
                ))}
             </div>
          </div>

          <div className="mt-8">
             <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Team members</p>
             <div className="space-y-3">
                <div className="flex items-center gap-3">
                   <div className="w-6 h-6 rounded-full bg-[var(--color-cp-purple)] flex items-center justify-center text-white text-[10px]">Me</div>
                   <span className="text-sm font-bold dark:text-white">Active Doctor</span>
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
                   onClick={() => setCurrentDate(new Date())}
                   className="px-4 py-1.5 border border-gray-200 dark:border-[#2A214D] rounded-lg text-sm font-bold text-[var(--color-cp-purple)] hover:bg-gray-50 dark:hover:bg-[#1D1438]"
                >Today</button>
                <div className="flex items-center gap-1 border border-gray-200 dark:border-[#2A214D] rounded-lg p-1">
                   <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() - 1); setCurrentDate(d) }} className="px-2 hover:bg-gray-100 dark:hover:bg-[#1D1438] rounded">&lt;</button>
                   <span className="text-sm px-2">📅</span>
                   <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() + 1); setCurrentDate(d) }} className="px-2 hover:bg-gray-100 dark:hover:bg-[#1D1438] rounded">&gt;</button>
                </div>
                <select 
                   value={viewState} 
                   onChange={(e) => setViewState(e.target.value as any)}
                   className="text-sm font-bold border border-gray-200 dark:border-[#2A214D] rounded-lg px-3 py-1.5 bg-transparent dark:text-white"
                >
                   <option value="Day">Day</option>
                   <option value="Week" disabled>Week (Coming Soon)</option>
                </select>
             </div>
             
             <div className="flex items-center gap-2">
                <button className="px-4 py-1.5 bg-[var(--color-cp-purple)] text-white rounded-lg text-sm font-bold hover:bg-[var(--color-cp-purple-light)]">+ New</button>
             </div>
          </div>

          {/* Grid Area */}
          <div className="flex-1 overflow-y-auto">
             <div className="flex">
                {/* Time Axis */}
                <div className="w-20 border-r border-gray-100 dark:border-[#2A214D] text-xs text-gray-400 font-semibold sticky left-0 bg-white dark:bg-[#150F2A] z-10 pt-10">
                   {hours.map(h => (
                     <div key={h} className="h-24 relative flex justify-end pr-2 -top-2">
                        {h % 12 === 0 ? 12 : h % 12} {h >= 12 ? 'PM' : 'AM'}
                     </div>
                   ))}
                </div>

                {/* Day Column */}
                <div className="flex-1 relative pt-10">
                   <div className="absolute top-0 left-0 right-0 h-10 border-b border-gray-100 dark:border-[#2A214D] flex items-center justify-center font-bold text-gray-700 dark:text-gray-300">
                      {getDayLabel(currentDate)}
                   </div>
                   
                   {/* Horizontal Grid Lines & Appointments */}
                   <div className="relative">
                     {hours.map(h => {
                        const topAppt = getApptForSlot(currentDate, h, false)
                        const bottomAppt = getApptForSlot(currentDate, h, true)
                        
                        return (
                          <div key={h} className="h-24 border-b border-gray-100 dark:border-[#2A214D] relative">
                             {/* Half-hour dashed line visually */}
                             <div className="absolute top-1/2 left-0 right-0 h-px border-b border-dashed border-gray-100 dark:border-[#2A214D]/50"></div>
                             
                             {/* Render 00 min slot block */}
                             {topAppt && (
                                <div className="absolute top-0 left-2 right-4 h-11 bg-[var(--color-cp-purple)] bg-opacity-90 rounded-md p-2 shadow-sm text-white border-l-4 border-[var(--color-cp-purple-light)] hover:-translate-y-0.5 transition-transform cursor-pointer">
                                  <p className="text-xs font-black truncate">{topAppt.patient.full_name} - 30 min</p>
                                  <p className="text-[10px] opacity-80">{h % 12 === 0 ? 12 : h % 12}:00 {h >= 12 ? 'PM' : 'AM'}</p>
                                </div>
                             )}

                             {/* Render 30 min slot block */}
                             {bottomAppt && (
                                <div className="absolute top-12 left-2 right-4 h-11 mb-1 bg-[#3A2292] bg-opacity-90 rounded-md p-2 shadow-sm text-white border-l-4 border-purple-400 hover:-translate-y-0.5 transition-transform cursor-pointer">
                                  <p className="text-xs font-black truncate">{bottomAppt.patient.full_name} - 30 min</p>
                                  <p className="text-[10px] opacity-80">{h % 12 === 0 ? 12 : h % 12}:30 {h >= 12 ? 'PM' : 'AM'}</p>
                                </div>
                             )}
                          </div>
                        )
                     })}
                   </div>
                </div>
             </div>
          </div>
       </div>
    </div>
  )
}
