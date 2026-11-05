// KONFIGURASI API GATEWAY CLOUDFLARE WORKER
const API_WORKER_URL = "https://smada-api-gateway.yhanedy.workers.dev/api/query";

/**
 * Fungsi pembantu eksekusi SQL kueri ke Turso via Cloudflare Worker Proxy
 * @param {string} sql - Perintah SQL (SELECT, INSERT, UPDATE, DELETE)
 * @param {Array} params - Parameter array untuk query
 */
async function queryTurso(sql, params = []) {
    // 1. Setup Timeout (Mencegah loading menggantung -> Failed to fetch)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 Detik batas waktu

    try {
        const response = await fetch(API_WORKER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sql: sql,
                args: params
            }),
            signal: controller.signal // <-- Kunci anti-gagal
        });

        clearTimeout(timeoutId); // Hentikan timer jika berhasil

        if (!response.ok) {
            // Tangkap error dari Worker (misal: SQL Error / Token Turso Expired)
            const errJson = await response.json().catch(() => ({}));
            throw new Error(errJson.error || `Server Error (${response.status}): ${response.statusText}`);
        }

        // Pastikan response benar-benar JSON
        const textData = await response.text();
        try {
            return JSON.parse(textData);
        } catch (e) {
            throw new Error("Server mengembalikan format data yang salah (Bukan JSON).");
        }

    } catch (err) {
        clearTimeout(timeoutId);
        console.error("Gagal terhubung ke API Backend Serverless:", err);
        
        // 2. Petakan pesan error agar ramah pengguna (siswa tidak bingung)
        if (err.name === 'AbortError') {
            throw new Error("Koneksi ke server terputus (Timeout). Sinyal internet Anda terlalu lemah.");
        } 
        
        if (err.message === 'Failed to fetch' || err.message.includes('NetworkError')) {
            throw new Error("Gagal terhubung ke server (Failed to fetch). Kemungkinan WiFi sekolah memblokir akses atau kuota internet habis.");
        }

        throw err; // Lempar error asli jika dari Turso/SQL
    }
}
