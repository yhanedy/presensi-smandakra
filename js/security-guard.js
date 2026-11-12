/**
 * SMADA SECURITY GUARD - LAPIS 2 (MOBILE-SAFE)
 * Mendeteksi DevTools Terbuka & Peringatan Visual.
 * Versi ini secara otomatis menonaktifkan deteksi pada perangkat mobile
 * untuk menghindari false positive (pemblokiran tidak wajar).
 */
(function() {
    // ======================================================
    // 1. DETEKSI PERANGKAT MOBILE
    // ======================================================
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // Jika pengguna berada di perangkat mobile (HP), hentikan eksekusi skrip ini.
    // Keamanan data untuk siswa di HP sepenuhnya mengandalkan validasi di Worker (Backend).
    if (isMobile) {
        console.log("Security Guard: Mode Mobile terdeteksi. Deteksi DevTools dinonaktifkan.");
        return; 
    }

    // ======================================================
    // 2. KONFIGURASI (Hanya berjalan di Desktop/Laptop)
    // ======================================================
    const CONFIG = {
        checkInterval: 1000, // Cek setiap 1 detik
        threshold: 160,      // Selisih pixel untuk mendeteksi docked DevTools
    };

    let isDevToolsOpen = false;

    // ======================================================
    // 3. METODE DETEKSI
    // ======================================================
    function checkWindowSize() {
        const widthThreshold = window.outerWidth - window.innerWidth > CONFIG.threshold;
        const heightThreshold = window.outerHeight - window.innerHeight > CONFIG.threshold;
        return (widthThreshold || heightThreshold);
    }

    function checkDebuggerTiming() {
        const startTime = performance.now();
        debugger; 
        const endTime = performance.now();
        return (endTime - startTime > 100);
    }

    function checkConsoleGetter() {
        let detected = false;
        const element = new Image();
        Object.defineProperty(element, 'id', {
            get: function() {
                detected = true;
                return 'devtools-detected';
            }
        });
        console.log('%c', element);
        return detected;
    }

    // ======================================================
    // 4. AKSI JIKA DEVTOOLS TERDETEKSI
    // ======================================================
    function triggerSecurityLockdown() {
        if (isDevToolsOpen) return; 
        isDevToolsOpen = true;

        // Blokir interaksi halaman
        document.body.style.pointerEvents = 'none';
        document.body.style.userSelect = 'none';

        // Buat Overlay Peringatan
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
            <div style="background: #ef4444; padding: 20px; border-radius: 50%; margin-bottom: 20px; box-shadow: 0 0 20px rgba(239, 68, 68, 0.5);">
                <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            </div>
            <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 10px;">Akses Ditolak</h1>
            <p style="font-size: 16px; color: #cbd5e1; max-width: 450px; line-height: 1.5;">
                Sistem mendeteksi Anda membuka <b>Developer Tools</b>.<br>
                <span style="display: block; margin-top: 10px; color: #fca5a5; font-weight: bold;">ORA ANEH-ANEH CAH BAGUS.</span><br>
                Demi keamanan data sekolah, silakan tutup Developer Tools dan muat ulang halaman ini.<br><br>
                <b>7 DETIK DARI SEKARANG, KAMERA AKAN MEMFOTO WAJAHMU DIKIRIM KE GdriveNYA PAK DADANG</b>
            </p>
        `;

        document.body.appendChild(overlay);

        // Pemantauan: Jika DevTools ditutup, hilangkan overlay
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
    // 5. LOOP MONITORING (JALAN TERUS MENERUS)
    // ======================================================
    setInterval(() => {
        if (isDevToolsOpen) return; 

        const detectedSize = checkWindowSize();
        const detectedTiming = checkDebuggerTiming();
        const detectedConsole = checkConsoleGetter();

        if (detectedSize || detectedTiming || detectedConsole) {
            triggerSecurityLockdown();
        }
    }, CONFIG.checkInterval);

})();
