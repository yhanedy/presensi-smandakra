// KONFIGURASI API GATEWAY CLOUDFLARE WORKER (SMAN 2 KARANGANYAR)
const API_WORKER_URL = "https://smada-api-gateway.yhanedy.workers.dev/api/query";

/**
 * Fungsi pembantu eksekusi SQL kueri ke Turso via Cloudflare Worker Proxy
 * @param {string} sql - Perintah SQL
 * @param {Array} params - Parameter array untuk query
 */
async function queryTurso(sql, params = []) {
    try {
        const response = await fetch(API_WORKER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sql: sql,
                args: params
            })
        });

        const resData = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error("SQL Error Detail:", { sql, params, error: resData.error });
            throw new Error(resData.error || `HTTP ${response.status}`);
        }

        return resData;
    } catch (err) {
        console.error("Gagal Query Turso:", err);
        throw err;
    }
}
