import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      patient_id,
      prescription_id,
      medication_name,
      slot,
      taken_at,
      scheduled_date,
      confirmed_by = 'patient',
      notes = null
    } = body

    if (!patient_id || !medication_name) {
      return NextResponse.json(
        { error: 'patient_id and medication_name are required' },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Supabase credentials not configured' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const insertPayload = {
      patient_id,
      prescription_id: prescription_id || null,
      medication_name,
      slot: slot || 'morning',
      taken_at: taken_at || new Date().toISOString(),
      scheduled_date: scheduled_date || new Date().toISOString().slice(0, 10),
      confirmed_by,
      notes
    }

    const { data, error } = await supabase
      .from('medication_adherence_logs')
      .insert(insertPayload)
      .select()
      .single()

    if (error) {
      console.error('Error inserting adherence log via admin client:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, log: data })
  } catch (err: any) {
    console.error('Adherence API exception:', err)
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
