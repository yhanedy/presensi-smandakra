// KONFIGURASI API GATEWAY CLOUDFLARE WORKER
const API_WORKER_URL = "https://smada-api-gateway.yhanedy.workers.dev/api/query";

// KUNCI RAHASIA: Harus SAMA PERSIS dengan API_SECRET_KEY di Cloudflare Worker
const API_SECRET_KEY = "KunciRahasiaBaruSMADA2026!@#PanjangSekali"; 

async function queryTurso(sql, params = []) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); 

    try {
        const response = await fetch(API_WORKER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_SECRET_KEY}` // <-- Mengirim Kunci Rahasia
            },
            body: JSON.stringify({ sql: sql, args: params }),
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
        
        if (err.name === 'AbortError') {
            throw new Error("Koneksi terputus (Timeout 30 Detik). Sinyal internet Anda terlalu lemah.");
        } 
        
        if (err.message === 'Failed to fetch' || err.message.includes('NetworkError')) {
            throw new Error("Gagal terhubung ke server. Pastikan internet Anda lancar atau WiFi sekolah tidak memblokir akses.");
        }

        throw err; 
    }
}
