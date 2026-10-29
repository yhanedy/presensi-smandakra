// js/supabase-config.js
const SUPABASE_URL = 'https://fmhdrcpnaydvvaiwexni.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtaGRyY3BuYXlkdnZhaXdleG5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NTYzMzIsImV4cCI6MjEwODEzMjMzMn0.0F23xR3NfKHkXMGkx4F1bdFXXuroRHD8-rQ7YMHc-lU';

const supabaseClient = (window.supabase && window.supabase.createClient) 
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) 
    : null;

function getTanggalWIB(d = new Date()) {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(d);
}

function getJamWIB(d = new Date()) {
    return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d).replace(/\./g, ':');
}

function getISOTimestampWIB(d = new Date()) {
    const tgl = getTanggalWIB(d);
    const jam = getJamWIB(d);
    return `${tgl}T${jam}+07:00`;
}
