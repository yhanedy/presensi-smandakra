/**
 * SMADA SECURITY GUARD - LAPIS 2
 * Deteksi DevTools Terbuka & Peringatan Visual
 */
(function() {
    // Konfigurasi
    const CONFIG = {
        checkInterval: 1000, // Cek setiap 1 detik
        threshold: 160, // Selisih pixel untuk deteksi
        redirectUrl: 'https://presensi-smandakra.github.io/tutup-devtools.html' // Opsional: Halaman peringatan
    };

    let isDevToolsOpen = false;

    // ======================================================
    // TEKNIK 1: Deteksi Perubahan Ukuran Jendela (Docked DevTools)
    // ======================================================
    function checkWindowSize() {
        const widthThreshold = window.outerWidth - window.innerWidth > CONFIG.threshold;
        const heightThreshold = window.outerHeight - window.innerHeight > CONFIG.threshold;
        
        // Jika ukuran mengecil drastis, kemungkinan DevTools terbuka
        if (widthThreshold || heightThreshold) {
            return true;
        }
        return false;
    }

    // ======================================================
    // TEKNIK 2: Deteksi Melalui Timing Debugger (Anti-Bypass)
    // ======================================================
    function checkDebuggerTiming() {
        const startTime = performance.now();
        // Perintah ini akan diabaikan browser biasa, 
        // tapi akan berhenti jika DevTools sedang terbuka
        debugger; 
        const endTime = performance.now();
        
        // Jika eksekusi tertahan lebih dari 100ms, DevTools terbuka
        if (endTime - startTime > 100) {
            return true;
        }
        return false;
    }

    // ======================================================
    // TEKNIK 3: Deteksi Melalui console.log (Custom Getter)
    // ======================================================
    function checkConsoleGetter() {
        let detected = false;
        const element = new Image();
        Object.defineProperty(element, 'id', {
            get: function() {
                detected = true;
                return 'devtools-detected';
            }
        });
        // Mencetak objek ke console akan memicu getter di atas jika console terbuka
        console.log('%c', element);
        return detected;
    }

    // ======================================================
    // AKSI JIKA DEVTOOLS TERDETEKSI
    // ======================================================
    function triggerSecurityLockdown() {
        if (isDevToolsOpen) return; // Hindari eksekusi berulang
        isDevToolsOpen = true;

        // 1. Blokir seluruh interaksi halaman
        document.body.style.pointerEvents = 'none';
        document.body.style.userSelect = 'none';

        // 2. Buat Overlay Peringatan
        const overlay = document.createElement('div');
        overlay.id = 'devtools-warning-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(15, 23, 42, 0.95);
            backdrop-filter: blur(5px);
            z-index: 999999;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            color: white;
            font-family: sans-serif;
            text-align: center;
            padding: 20px;
            pointer-events: auto;
        `;

        overlay.innerHTML = `
            <div style="background: #ef4444; padding: 20px; border-radius: 50%; margin-bottom: 20px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            </div>
            <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 10px;">Akses Ditolak</h1>
            <p style="font-size: 16px; color: #cbd5e1; max-width: 400px; line-height: 1.5;">
                Sistem mendeteksi Anda membuka <b>Developer Tools</b> ORA ANEH-ANEH CAH BAGUS.<br>
                Demi keamanan data sekolah, silakan tutup Developer Tools dan muat ulang halaman ini.<BR>
                <b>7 DETIK DARI SEKARANG, KAMERA AKAN MEMFOTO WAJAHMU DIKIRIM KE GdriveNYA PAK DADANG<b>
            </p>
        `;

        document.body.appendChild(overlay);

        // 3. (Opsional) Muat ulang halaman jika DevTools ditutup
        // Kita cek terus-menerus, jika sudah tertutup, hilangkan overlay
        const recoveryInterval = setInterval(() => {
            if (!checkWindowSize() && !checkDebuggerTiming()) {
                clearInterval(recoveryInterval);
                overlay.remove();
                document.body.style.pointerEvents = 'auto';
                document.body.style.userSelect = 'auto';
                isDevToolsOpen = false;
            }
        }, 2000);
    }

    // ======================================================
    // LOOP MONITORING
    // ======================================================
    setInterval(() => {
        if (isDevToolsOpen) return; // Jika sudah terkunci, diamkan

        const detectedSize = checkWindowSize();
        const detectedTiming = checkDebuggerTiming();
        const detectedConsole = checkConsoleGetter();

        if (detectedSize || detectedTiming || detectedConsole) {
            triggerSecurityLockdown();
        }
    }, CONFIG.checkInterval);

})();
