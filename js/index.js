/* ==========================================================================
   SMAN 2 KARANGANYAR - SSO LOGIN PORTAL ENGINE (js/index.js)
   ========================================================================== */

const SSO_WORKER_URL = 'https://smada-api-gateway.yhanedy.workers.dev';

document.addEventListener('DOMContentLoaded', () => {
    const formLogin = document.getElementById('formLogin');
    if (formLogin) {
        formLogin.addEventListener('submit', handleLogin);
    }
});

function toggleTampilPassword() {
    const passInput = document.getElementById('input-password');
    const passIcon = document.getElementById('icon-toggle-password');
    if (!passInput || !passIcon) return;

    if (passInput.type === 'password') {
        passInput.type = 'text';
        passIcon.classList.remove('fa-eye');
        passIcon.classList.add('fa-eye-slash');
    } else {
        passInput.type = 'password';
        passIcon.classList.remove('fa-eye-slash');
        passIcon.classList.add('fa-eye');
    }
}

async function handleLogin(e) {
    e.preventDefault();

    const usernameInput = document.getElementById('input-username').value.trim();
    const passwordInput = document.getElementById('input-password').value;
    const errorBox = document.getElementById('error-msg');
    const btnLogin = document.getElementById('btn-login');

    if (!usernameInput || !passwordInput) {
        tampilkanErrorLogin("Username/NIP/NISN dan Password wajib diisi!");
        return;
    }

    if (errorBox) errorBox.classList.add('hidden');
    btnLogin.disabled = true;
    btnLogin.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Memeriksa Akun...</span>`;

    try {
        // Satu pintu endpoint /api/auth/login untuk Siswa, Guru, Piket, BK, Kepsek, Admin & Super Admin
        const response = await fetch(`${SSO_WORKER_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                identifier: usernameInput,
                username: usernameInput,
                nisn: usernameInput,
                password: passwordInput
            })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
            throw new Error(data.error || "Username/NISN atau Kata Sandi salah!");
        }

        if (!data.token || !data.user) {
            throw new Error("Respons server tidak lengkap. Silakan coba lagi.");
        }

        const roleStr = String(data.role || data.user.role || '').toLowerCase();
        const roleTokens = roleStr.split(',').map(r => r.trim()).filter(Boolean);

        // Simpan token & sesi standar ke localStorage
        localStorage.setItem('smada_token', data.token);
        localStorage.setItem('smada_role', roleStr);

        // A. JIKA AKUN SISWA
        if (roleTokens.includes('siswa')) {
            const siswaSession = {
                nisn: data.user.nisn,
                nama: data.user.nama || 'Siswa SMADA',
                kelas: data.user.kelas || '-',
                role: 'siswa',
                token: data.token
            };
            localStorage.setItem('smada_siswa', JSON.stringify(siswaSession));
            localStorage.setItem('smada_user', JSON.stringify(siswaSession));
            window.location.replace('siswa.html');
            return;
        }

        // B. JIKA AKUN STAFF / GURU / KEPSEK / ADMIN / SUPER ADMIN
        const userSession = {
            id: data.user.id,
            username: data.user.username,
            nama: data.user.nama || data.user.username,
            role: data.user.role,
            token: data.token
        };
        localStorage.setItem('smada_user', JSON.stringify(userSession));

        const ssoPayload = {
            u: userSession.username,
            n: userSession.nama,
            r: userSession.role || 'guru',
            token: userSession.token,
            t: Date.now()
        };
        const ssoToken = encodeURIComponent(btoa(JSON.stringify(ssoPayload)));

        // Pemisahan role berbasis token agar 'admin_jurnal' tidak tertukar dengan 'admin'
        const hasSuperAdmin = roleTokens.includes('superadmin') || roleTokens.includes('super_admin');
        const hasAdmin = hasSuperAdmin || roleTokens.includes('admin');
        const hasAdminJurnal = hasAdmin || roleTokens.includes('admin_jurnal');
        const hasKepsek = roleTokens.includes('kepsek') || roleTokens.includes('kepala');
        const hasPiket = roleTokens.includes('piket');
        const hasBK = roleTokens.includes('bk') || roleTokens.includes('stp2k');
        const hasMapel = roleTokens.includes('mapel') || roleTokens.includes('guru') || roleTokens.includes('jurnal');

        // Hitung peran unik untuk menentukan langsung redirect atau tampilkan modal
        const activeRoles = [
            hasSuperAdmin,
            roleTokens.includes('admin'),
            roleTokens.includes('admin_jurnal'),
            hasKepsek,
            hasPiket,
            hasBK,
            hasMapel
        ].filter(Boolean);

        // Jika punya lebih dari 1 peran atau Admin penuh / Super Admin, tampilkan modal pilihan modul
        if (activeRoles.length > 1 || hasAdmin || hasSuperAdmin) {
            tampilkanModalPilihPeran(userSession, {
                hasSuperAdmin,
                hasAdmin,
                hasAdminJurnal,
                hasKepsek,
                hasPiket,
                hasBK,
                hasMapel
            });
            return;
        }

        // Routing tunggal (Single Role) langsung menuju halamannya masing-masing
        if (hasAdminJurnal) {
            window.location.replace(`https://yhanedy.github.io/jurnalmengajar/admin-jurnal.html?sso_token=${ssoToken}`);
        } else if (hasKepsek) {
            window.location.replace('kepsek.html');
        } else if (hasBK) {
            window.location.replace('bk.html');
        } else if (hasPiket) {
            window.location.replace('piket.html');
        } else {
            window.location.replace(`https://yhanedy.github.io/jurnalmengajar/jurnal.html?sso_token=${ssoToken}`);
        }

    } catch (err) {
        console.error("Login error:", err);
        tampilkanErrorLogin(err.message || "Gagal terhubung ke server autentikasi.");
    } finally {
        btnLogin.disabled = false;
        btnLogin.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> <span>Masuk Ke Portal</span>`;
    }
}

function tampilkanErrorLogin(pesan) {
    const errorBox = document.getElementById('error-msg');
    const errorText = document.getElementById('error-text');
    if (errorText && errorBox) {
        errorText.textContent = pesan;
        errorBox.classList.remove('hidden');
    } else {
        alert(pesan);
    }
}

function tampilkanModalPilihPeran(user, roles) {
    let modal = document.getElementById('modalPilihPeranMulti');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalPilihPeranMulti';
        modal.className = 'fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4';
        document.body.appendChild(modal);
    }

    const ssoPayload = {
        u: user.username,
        n: user.nama,
        r: user.role,
        token: user.token || localStorage.getItem('smada_token') || '',
        t: Date.now()
    };
    const ssoToken = encodeURIComponent(btoa(JSON.stringify(ssoPayload)));

    modal.innerHTML = `
        <div class="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border-2 border-blue-200 text-left">
            <div class="text-center border-b pb-3 space-y-1">
                <span class="bg-blue-100 text-blue-900 font-black text-[10px] px-2.5 py-0.5 rounded-full uppercase">Beberapa Peran Terdeteksi</span>
                <h3 class="font-black text-slate-900 text-base">Pilih Modul Akses Anda</h3>
                <p class="text-xs text-slate-500 font-bold">${user.nama} (${user.username})</p>
            </div>

            <div class="space-y-2.5 text-xs font-black">
                ${roles.hasSuperAdmin ? `
                    <button onclick="window.location.href='super-admin.html'" class="w-full bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 p-3.5 rounded-2xl flex items-center justify-between shadow-lg transition border-2 border-amber-300 cursor-pointer">
                        <span class="flex items-center gap-2.5"><i class="fa-solid fa-crown text-base text-slate-950"></i> Control Panel Super Admin</span>
                        <i class="fa-solid fa-arrow-right"></i>
                    </button>
                ` : ''}

                ${roles.hasAdmin ? `
                    <button onclick="window.location.href='admin.html'" class="w-full bg-slate-950 hover:bg-slate-900 text-yellow-300 p-3.5 rounded-2xl flex items-center justify-between shadow transition border-2 border-yellow-400 cursor-pointer">
                        <span class="flex items-center gap-2.5"><i class="fa-solid fa-shield-halved text-base text-yellow-400"></i> Panel Administrator Presensi</span>
                        <i class="fa-solid fa-arrow-right"></i>
                    </button>
                ` : ''}

                ${roles.hasAdminJurnal ? `
                    <button onclick="window.location.href='https://yhanedy.github.io/jurnalmengajar/admin-jurnal.html?sso_token=${ssoToken}'" class="w-full bg-amber-700 hover:bg-amber-800 text-white p-3.5 rounded-2xl flex items-center justify-between shadow transition border border-amber-600 cursor-pointer">
                        <span class="flex items-center gap-2.5"><i class="fa-solid fa-user-shield text-base text-yellow-300"></i> Admin Control Jurnal KBM</span>
                        <i class="fa-solid fa-arrow-right"></i>
                    </button>
                ` : ''}

                ${roles.hasKepsek || roles.hasSuperAdmin ? `
                    <button onclick="window.location.href='kepsek.html'" class="w-full bg-gradient-to-r from-blue-900 to-indigo-900 hover:from-blue-800 hover:to-indigo-800 text-cyan-200 p-3.5 rounded-2xl flex items-center justify-between shadow transition border-2 border-cyan-400 cursor-pointer">
                        <span class="flex items-center gap-2.5"><i class="fa-solid fa-chart-line text-base text-cyan-300"></i> Dashboard Kepala Sekolah</span>
                        <i class="fa-solid fa-arrow-right"></i>
                    </button>
                ` : ''}

                ${roles.hasMapel || (!roles.hasPiket && !roles.hasBK && !roles.hasAdmin && !roles.hasAdminJurnal && !roles.hasKepsek) ? `
                    <button onclick="window.location.href='https://yhanedy.github.io/jurnalmengajar/jurnal.html?sso_token=${ssoToken}'" class="w-full bg-blue-900 hover:bg-blue-950 text-white p-3.5 rounded-2xl flex items-center justify-between shadow transition border border-blue-700 cursor-pointer">
                        <span class="flex items-center gap-2.5"><i class="fa-solid fa-book-bookmark text-yellow-300 text-base"></i> Portal Jurnal Mengajar Guru</span>
                        <i class="fa-solid fa-arrow-right"></i>
                    </button>
                ` : ''}

                ${roles.hasPiket ? `
                    <button onclick="window.location.href='piket.html'" class="w-full bg-teal-700 hover:bg-teal-800 text-white p-3.5 rounded-2xl flex items-center justify-between shadow transition cursor-pointer">
                        <span class="flex items-center gap-2.5"><i class="fa-solid fa-clipboard-user text-base"></i> Menu Guru Piket</span>
                        <i class="fa-solid fa-arrow-right"></i>
                    </button>
                ` : ''}

                ${roles.hasBK ? `
                    <button onclick="window.location.href='bk.html'" class="w-full bg-rose-700 hover:bg-rose-800 text-white p-3.5 rounded-2xl flex items-center justify-between shadow transition cursor-pointer">
                        <span class="flex items-center gap-2.5"><i class="fa-solid fa-triangle-exclamation text-base"></i> Menu BK & STP2K</span>
                        <i class="fa-solid fa-arrow-right"></i>
                    </button>
                ` : ''}

                <button onclick="window.location.href='laporan-publik.html'" class="w-full bg-indigo-900 hover:bg-indigo-950 text-yellow-300 p-3.5 rounded-2xl flex items-center justify-between shadow transition border border-indigo-700 cursor-pointer">
                    <span class="flex items-center gap-2.5"><i class="fa-solid fa-chart-pie text-base text-yellow-400"></i> Laporan & Rekapitulasi Publik</span>
                    <i class="fa-solid fa-arrow-right"></i>
                </button>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
}
