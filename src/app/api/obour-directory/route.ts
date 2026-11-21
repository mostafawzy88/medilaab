import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { OBOUR_MEDICAL_DIRECTORY, MedicalFacility } from '@/data/obourMedicalDirectory'

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    let communityFacilities: MedicalFacility[] = []

    if (supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey)
      const { data, error } = await supabase
        .from('doctor_reviews')
        .select('*')
        .contains('tags', ['obour_directory'])
        .order('created_at', { ascending: false })

      if (!error && Array.isArray(data)) {
        communityFacilities = data.map((item: any) => {
          try {
            const parsed = typeof item.review_text === 'string' ? JSON.parse(item.review_text) : item.review_text
            return {
              id: item.id,
              ...parsed,
              isCommunityContributed: true,
              rating: item.rating || parsed.rating || 4.5,
              createdAt: item.created_at
            } as MedicalFacility
          } catch {
            return null
          }
        }).filter(Boolean) as MedicalFacility[]
      }
    }

    // Merge baseline real Obour facilities with community submissions (avoiding duplicates)
    const baseIds = new Set(OBOUR_MEDICAL_DIRECTORY.map(f => f.id))
    const consolidated = [
      ...OBOUR_MEDICAL_DIRECTORY,
      ...communityFacilities.filter(cf => !baseIds.has(cf.id))
    ]

    return NextResponse.json({
      success: true,
      count: consolidated.length,
      facilities: consolidated
    })
  } catch (err: any) {
    console.error('Error in /api/obour-directory GET:', err)
    return NextResponse.json({
      success: true,
      count: OBOUR_MEDICAL_DIRECTORY.length,
      facilities: OBOUR_MEDICAL_DIRECTORY
    })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      nameEn,
      nameAr,
      category = 'lab',
      district = 'الحي الأول',
      addressEn,
      addressAr,
      landmarkAr = '',
      landmarkEn = '',
      hotline,
      phone,
      phoneDisplay,
      whatsapp,
      workingHoursAr = 'يومياً',
      workingHoursEn = 'Daily',
      isOpen24Hours = false,
      hasHomeSampleService = false,
      rating = 5,
      notesAr = '',
      notesEn = '',
      contributedBy = 'MediLab User'
    } = body

    if (!nameAr && !nameEn) {
      return NextResponse.json({ error: 'Facility name is required' }, { status: 400 })
    }

    const facilityPayload: Partial<MedicalFacility> = {
      nameEn: nameEn || nameAr,
      nameAr: nameAr || nameEn,
      category,
      district,
      addressEn: addressEn || addressAr || 'Obour City',
      addressAr: addressAr || addressEn || 'مدينة العبور',
      landmarkAr,
      landmarkEn,
      hotline: hotline || '',
      phone: phone || '',
      phoneDisplay: phoneDisplay || phone || hotline || '',
      whatsapp: whatsapp || phone || '',
      workingHoursAr,
      workingHoursEn,
      isOpen24Hours: Boolean(isOpen24Hours),
      hasHomeSampleService: Boolean(hasHomeSampleService),
      rating: Number(rating) || 4.8,
      reviewsCount: 1,
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((nameAr || nameEn) + ' مدينة العبور')}`,
      availableServices: ['Diagnostics & Consultations'],
      availableServicesAr: ['خدمات تشخيصية واستشارات'],
      notesAr,
      notesEn,
      isCommunityContributed: true,
      contributedBy
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    let savedId = `obour-${Date.now()}`

    if (supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey)
      
      // Look up a valid doctor_id or patient_id if needed, or insert with system actor
      const { data: anyDoc } = await supabase.from('profiles').select('id').eq('role', 'doctor').limit(1).single()
      const doctorId = anyDoc?.id || '2ba3deb0-aea1-4a06-82ee-cfee055afd08'

      const { data, error } = await supabase
        .from('doctor_reviews')
        .insert({
          doctor_id: doctorId,
          patient_id: null,
          appointment_id: null,
          rating: Number(rating) || 5,
          review_text: JSON.stringify(facilityPayload),
          tags: ['obour_directory']
        })
        .select()
        .single()

      if (!error && data) {
        savedId = data.id
      } else if (error) {
        console.warn('Could not persist to doctor_reviews, returning local payload:', error.message)
      }
    }

    const fullFacility: MedicalFacility = {
      id: savedId,
      ...(facilityPayload as any),
      createdAt: new Date().toISOString()
    }

    return NextResponse.json({
      success: true,
      facility: fullFacility
    })
  } catch (err: any) {
    console.error('Error in /api/obour-directory POST:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
