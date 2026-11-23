/* =========================================================
   SISWA-UTILS.JS — Helper, API Gateway & fungsi bersama
   ========================================================= */

const API_URL = "https://smada-api-gateway.yhanedy.workers.dev";
const WORKER_URL = API_URL;
const GAS_UPLOAD_IJIN_URL = "https://script.google.com/macros/s/AKfycbyU7HbAA_LBirKOAmkMWLqmuPYcEJa4W6rHMQ0nHRv09J-Fj2qMGM6YPArf538oJPuo6w/exec";
const DRIVE_FOLDER_ID = "1Bvm7R0noUG_x8zYEOtneOQIQw-1o9_-v";

let currentActiveUser = null;
let siswaDistanceMeters = null;
let latSekolah = -7.6005890;
let longSekolah = 110.9783970;
let maxRadius = 65;
let isSudahPresensiMasuk = false;
let modePresensiKameraDipilih = null;
let videoStream = null;

let fotoIzinBase64 = null;
let fileDispenBase64 = null;
let fileDispenMime = 'image/jpeg';
let fileDispenExt = 'jpg';
let activeAnnouncementId = null;

/* ---------- HELPER SESI & NISN AKTIF ---------- */
function getSiswaSession() {
  if (currentActiveUser && (currentActiveUser.nisn || currentActiveUser.username)) {
    return currentActiveUser;
  }
  const raw = localStorage.getItem('smada_siswa') || localStorage.getItem('smada_user');
  if (!raw || raw === 'null' || raw === 'undefined') return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.nisn || parsed.username)) {
      currentActiveUser = parsed;
      return parsed;
    }
  } catch (_) {}
  return null;
}

function getActiveNisn() {
  const u = getSiswaSession();
  if (!u) return '';
  return String(u.nisn || u.username || '').trim();
}

/* ---------- FUNGSI QUERY TURSO TERPADU ---------- */
async function queryTurso(sql, params = []) {
  const token = localStorage.getItem('smada_token') || '';
  const res = await fetch(`${API_URL}/api/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ sql, params })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data && data.success === false && data.error)) {
    throw new Error(data.error || `HTTP Error ${res.status}`);
  }

  if (Array.isArray(data)) return data;
  if (data.rows && Array.isArray(data.rows)) return data.rows;
  if (data.results && Array.isArray(data.results)) return data.results;
  if (data.data && Array.isArray(data.data)) return data.data;
  return [];
}

/* ---------- WAKTU ---------- */
function getTanggalWIB(d = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(d);
}
function getJamWIB(d = new Date()) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  }).format(d).replace(/\./g, ':');
}
function isTerlambat(jamStr) {
  const [h, m, s] = jamStr.split(':').map(Number);
  return (h * 3600 + m * 60 + s) > (7 * 3600 + 1 * 60);
}

/* ---------- JARAK ---------- */
function hitungJarakHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/* ---------- LOGOUT ---------- */
function handleLogoutSiswa() {
  if (videoStream) {
    videoStream.getTracks().forEach(t => t.stop());
    videoStream = null;
  }
  localStorage.removeItem('smada_siswa');
  localStorage.removeItem('smada_user');
  localStorage.removeItem('smada_token');
  localStorage.removeItem('smada_role');
  window.location.replace('index.html');
}

/* ---------- KOMPRES GAMBAR ---------- */
function kompresGambar(file, maxSize = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round(height * maxSize / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round(width * maxSize / height);
          height = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('File bukan gambar valid'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsDataURL(file);
  });
}

/* ---------- UPLOAD DRIVE ---------- */
async function uploadKeDriveGAS(base64Data, prefix, mimeType = 'image/jpeg', ext = 'jpg') {
  if (!base64Data) {
    alert("Berkas/foto tidak ditemukan. Silakan ambil foto ulang!");
    return "";
  }
  try {
    const clean = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const nisnVal = getActiveNisn() || 'siswa';

    const res = await fetch(GAS_UPLOAD_IJIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        image: clean,
        mimeType,
        fileName: `${prefix}_${nisnVal}_${Date.now()}.${ext}`,
        folderId: DRIVE_FOLDER_ID
      })
    });

    const text = await res.text();
    let json;
    try { json = JSON.parse(text); }
    catch {
      alert("Gagal Upload: GAS mengembalikan respon non-JSON. Pastikan deployment 'Anyone'.");
      return "";
    }
    if (json && json.status === 'success') return json.url;
    alert("Gagal Simpan Drive: " + (json.message || "Drive menolak berkas."));
    return "";
  } catch (e) {
    alert("Gagal koneksi ke server upload: " + e.message);
    return "";
  }
}
