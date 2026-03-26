const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const supabaseUrl = 'https://xnojldnxiykyxcxnofmh.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhub2psZG54aXlreXhjeG5vZm1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MDY5NDYsImV4cCI6MjA4NjI4Mjk0Nn0.UAMRBTc6wuEfgH8LqIcXgis0jIM2PRqEDSeU6v8OaAc'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, has_completed_onboarding, is_authorized')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    fs.writeFileSync('profile_results.txt', JSON.stringify(error))
  } else {
    let output = ''
    data.forEach(p => {
      output += `ID: ${p.id} | Name: ${p.full_name} | Role: ${p.role} | Onboard: ${p.has_completed_onboarding} | Auth: ${p.is_authorized}\n`
    })
    fs.writeFileSync('profile_results.txt', output)
  }
}

checkProfiles()
