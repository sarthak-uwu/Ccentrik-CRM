import { createClient } from '@supabase/supabase-js'

// 1. URL bilkul sahi hai
const supabaseUrl = 'https://uljlkctbyglaixbhdfft.supabase.co' 

// 2. Key ko niche wale format mein dhyan se paste karein
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsamxrY3RieWdsYWl4YmhkZmZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyODYwMjcsImV4cCI6MjA5Mjg2MjAyN30.RtzwkY5_V3v2wMVQxjSncLGsjkHpmKZ_Z-8-NnHqGiw'

export const supabase = createClient(supabaseUrl, supabaseKey)