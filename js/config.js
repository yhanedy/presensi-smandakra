// =========================================================================
// KONFIGURASI API GATEWAY CLOUDFLARE WORKER (VERSI FINAL)
// =========================================================================
const API_WORKER_URL = "https://smada-api-gateway.yhanedy.workers.dev/api/query";

/**
 * Fungsi pembantu eksekusi SQL kueri ke Turso via Cloudflare Worker Proxy
 * @param {string} sql - Perintah SQL
 * @param {Array} params - Parameter array untuk query
 */
async function queryTurso(sql, params = []) {
    // Timeout 30 detik untuk mengantisipasi sinyal lemah
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); 

    try {
        const response = await fetch(API_WORKER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // TIDAK ADA Authorization header di sini. Validasi dilakukan oleh Worker berdasarkan domain.
            },
            body: JSON.stringify({
                sql: sql,
                args: params
            }),
            signal: controller.signal 
        });

        clearTimeout(timeoutId); 

        if (!response.ok) {
            const errJson = await response.json().catch(() => ({}));
            throw new Error(errJson.error || `Server Error (${response.status})`);
        }

        return await response.json();
        
    } catch (err) {
        clearTimeout(timeoutId);
        console.error("Gagal terhubung ke API Backend:", err);
        
        // Menerjemahkan error agar ramah pengguna
        if (err.name === 'AbortError') {
            throw new Error("Koneksi terputus (Timeout 30 Detik). Sinyal internet Anda terlalu lemah.");
        } 
        
        if (err.message === 'Failed to fetch' || err.message.includes('NetworkError')) {
            throw new Error("Gagal terhubung ke server. Pastikan internet Anda lancar atau WiFi sekolah tidak memblokir akses.");
        }

        throw err; 
    }
}
