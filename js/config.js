// KONFIGURASI BARU AMAN (API GATEWAY CLOUDFLARE WORKER)
const API_WORKER_URL = "https://smada-api-gateway.yhanedy.workers.dev/api/query";

async function queryTurso(sql, args = []) {
    try {
        const response = await fetch(API_WORKER_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({ sql, args })
        });

        if (!response.ok) {
            throw new Error(`API Backend Error: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    } catch (err) {
        console.error("Gagal terhubung ke API Backend Serverless:", err);
        throw err;
    }
}
