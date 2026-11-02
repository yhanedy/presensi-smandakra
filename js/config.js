const API_WORKER_URL = "https://smada-api-gateway.yhanedy.workers.dev/api/query";

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
            // TAMPILKAN DETAIL QUERY KETIKA ERROR 400 TERJADI
            console.error("SQL Error Detail:", { sql, params, error: resData.error });
            throw new Error(resData.error || `HTTP ${response.status}`);
        }

        return resData;
    } catch (err) {
        console.error("Gagal Query Turso:", err);
        throw err;
    }
}
