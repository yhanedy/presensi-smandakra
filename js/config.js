const API_WORKER_URL = "https://smada-api-gateway.yhanedy.workers.dev/api/query";

async function queryTurso(sql, params = []) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    // Ambil token dari localStorage (mendukung smada_token, smada_user, maupun smada_siswa)
    let token = localStorage.getItem('smada_token') || '';
    if (!token) {
        const rawSession = localStorage.getItem('smada_user') || localStorage.getItem('smada_siswa');
        if (rawSession) {
            try {
                const parsed = JSON.parse(rawSession);
                token = parsed.token || '';
            } catch (e) {}
        }
    }

    try {
        const response = await fetch(API_WORKER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : ''
            },
            body: JSON.stringify({ sql: sql, params: params }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            if (response.status === 401) {
                alert("Sesi Anda telah berakhir. Silakan login ulang.");
                localStorage.removeItem('smada_user');
                localStorage.removeItem('smada_siswa');
                localStorage.removeItem('smada_token');
                window.location.replace('index.html');
                return;
            }
            const errJson = await response.json().catch(() => ({}));
            throw new Error(errJson.error || `Server Error (${response.status})`);
        }

        return await response.json();

    } catch (err) {
        clearTimeout(timeoutId);
        console.error("Gagal terhubung ke API Backend:", err);
        if (err.name === 'AbortError') throw new Error("Koneksi terputus (Timeout). Sinyal internet lemah.");
        if (err.message.includes('Failed to fetch')) throw new Error("Gagal terhubung ke server.");
        throw err;
    }
}
