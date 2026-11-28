/* ==========================================================================
   SMAN 2 KARANGANYAR - PANEL ADMINISTRATOR (FULL FIXED VERSION)
   ========================================================================== */

// PROTEKSI HALAMAN ADMIN
(function proteksiHalamanAdmin() {
    const rawUser = localStorage.getItem('smada_user');
    if (!rawUser || rawUser === "null" || rawUser === "undefined") {
        alert("Akses Ditolak! Silakan login terlebih dahulu.");
        window.location.replace('index.html');
        return;
    }
    try {
        const user = JSON.parse(rawUser);
        const role = String(user.role || '').toLowerCase();
        const isAllowed = role.includes('admin') || role.includes('superadmin') || role.includes('super_admin');
        if (!isAllowed) {
            alert("Akses Ditolak! Anda tidak berhak mengakses halaman ini.");
            localStorage.removeItem('smada_user');
            localStorage.removeItem('smada_role');
            localStorage.removeItem('smada_token');
            window.location.replace('index.html');
        }
    } catch (e) {
        localStorage.removeItem('smada_user');
        localStorage.removeItem('smada_role');
        localStorage.removeItem('smada_token');
        window.location.replace('index.html');
    }
})();

// ============================================================================
// FUNGSI API TERPADU & HELPER ESCAPE
// ============================================================================
const ADMIN_WORKER_URL = 'https://smada-api-gateway.yhanedy.workers.dev';

function escapeSqlStr(str) {
    return "'" + String(str ?? '').replace(/'/g, "''") + "'";
}

async function apiQuery(sql, params = []) {
    const token = localStorage.getItem('smada_token');
    // Pastikan parameter ketiga (forcePrimary) selalu true untuk Admin agar baca/tulis langsung ke Turso
    const response = await fetch(`${ADMIN_WORKER_URL}/api/query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ sql, params, forcePrimary: true })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || (data && data.success === false && data.error)) {
        throw new Error(data.error || `HTTP Error ${response.status}`);
    }

    if (Array.isArray(data)) return data;
    if (data.rows && Array.isArray(data.rows)) return data.rows;
    if (data.results && Array.isArray(data.results)) return data.results;
    return [];
}

// ============================================================================
// STATE & INIT
// ============================================================================
let searchTimeout = null;
let currentPageSiswa = 1;
let currentPageGuru = 1;
const itemsPerPage = 5;

document.addEventListener('DOMContentLoaded', () => {
    const rawUser = localStorage.getItem('smada_user');
    if (rawUser) {
        try {
            const user = JSON.parse(rawUser);
            const nameEl = document.getElementById('display-admin-name');
            if (nameEl) nameEl.textContent = user.nama || user.username;
        } catch (e) {}
    }

    const tipeSelect = document.getElementById('penyesuaian-tipe');
    if (tipeSelect) {
        tipeSelect.addEventListener('change', (e) => {
            const wrapSiswa = document.getElementById('wrapper-penyesuaian-siswa');
            if (wrapSiswa) {
                wrapSiswa.style.display = e.target.value === 'kelas' ? 'none' : 'block';
            }
        });
    }

    muatSettingSekolah();
    muatSemuaDataMaster();
    muatLogPerangkatHP();
    muatDropdownKelasPenyesuaian();
});

function logout() {
    localStorage.removeItem('smada_user');
    localStorage.removeItem('smada_role');
    localStorage.removeItem('smada_token');
    window.location.href = 'index.html';
}

function switchMasterTab(type) {
    const wrapSiswa = document.getElementById('wrapper-tabel-siswa');
    const wrapGuru = document.getElementById('wrapper-tabel-guru');
    const btnSiswa = document.getElementById('btn-tab-siswa');
    const btnGuru = document.getElementById('btn-tab-guru');
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';

    if (type === 'siswa') {
        wrapSiswa.classList.remove('hidden');
        wrapGuru.classList.add('hidden');
        btnSiswa.className = 'px-3 py-1 text-xs font-bold rounded-md bg-blue-900 text-white shadow transition cursor-pointer';
        btnGuru.className = 'px-3 py-1 text-xs font-bold rounded-md text-slate-600 hover:text-slate-900 transition cursor-pointer';
        currentPageSiswa = 1;
        muatDaftarSiswa(1, '');
    } else {
        wrapGuru.classList.remove('hidden');
        wrapSiswa.classList.add('hidden');
        btnGuru.className = 'px-3 py-1 text-xs font-bold rounded-md bg-blue-900 text-white shadow transition cursor-pointer';
        btnSiswa.className = 'px-3 py-1 text-xs font-bold rounded-md text-slate-600 hover:text-slate-900 transition cursor-pointer';
        currentPageGuru = 1;
        muatDaftarGuru(1, '');
    }
}

function filterMasterTable() {
    const input = document.getElementById('search-input').value.toLowerCase();
    if (searchTimeout) clearTimeout(searchTimeout);

    searchTimeout = setTimeout(() => {
        const isSiswaActive = !document.getElementById('wrapper-tabel-siswa').classList.contains('hidden');
        if (isSiswaActive) {
            muatDaftarSiswa(1, input);
        } else {
            muatDaftarGuru(1, input);
        }
    }, 500);
}

// ============================================================================
// 1. PENGATURAN LOKASI GPS & JADWAL PRESENSI
// ============================================================================
async function muatSettingSekolah() {
    try {
        const rows = await apiQuery('SELECT * FROM setting_sekolah WHERE id = 1');
        if (rows && rows.length > 0) {
            const data = rows[0];
            if (data.latitude && document.getElementById('gps-lat')) {
                document.getElementById('gps-lat').value = String(data.latitude);
            }
            if (data.longitude && document.getElementById('gps-long')) {
                document.getElementById('gps-long').value = String(data.longitude);
            }
            if (data.radius_meter && document.getElementById('gps-radius')) {
                document.getElementById('gps-radius').value = String(data.radius_meter);
            }
            if (data.jam_masuk && document.getElementById('jam-masuk')) {
                document.getElementById('jam-masuk').value = String(data.jam_masuk).substring(0, 5);
            }
            if (data.jam_pulang_senin_kamis && document.getElementById('jam-pulang-senin-kamis')) {
                document.getElementById('jam-pulang-senin-kamis').value = String(data.jam_pulang_senin_kamis).substring(0, 5);
            }
            if (data.jam_pulang_jumat && document.getElementById('jam-pulang-jumat')) {
                document.getElementById('jam-pulang-jumat').value = String(data.jam_pulang_jumat).substring(0, 5);
            }
        }
    } catch (e) {
        console.log("Setting sekolah default digunakan.");
    }
}

async function simpanSettingLokasi() {
    const lat = String(document.getElementById('gps-lat').value.trim());
    const long = String(document.getElementById('gps-long').value.trim());
    const radius = parseInt(document.getElementById('gps-radius').value) || 100;

    if (!lat || !long) { alert("Koordinat GPS Lintang & Bujur wajib diisi!"); return; }

    try {
        const sql = `INSERT INTO setting_sekolah (id, latitude, longitude, radius_meter) VALUES (1, ${escapeSqlStr(lat)}, ${escapeSqlStr(long)}, ${radius}) ON CONFLICT(id) DO UPDATE SET latitude = excluded.latitude, longitude = excluded.longitude, radius_meter = excluded.radius_meter`;
        await apiQuery(sql);
        alert("Pengaturan Lokasi GPS & Radius Berhasil Disimpan!");
    } catch (err) {
        alert("Gagal menyimpan lokasi: " + err.message);
    }
}

async function simpanSettingJadwalLengkap() {
    const jamMasuk = document.getElementById('jam-masuk')?.value || '07:00';
    const jamPulangSK = document.getElementById('jam-pulang-senin-kamis')?.value || '15:01';
    const jamPulangJumat = document.getElementById('jam-pulang-jumat')?.value || '14:00';

    try {
        const sql = `UPDATE setting_sekolah SET jam_masuk = ${escapeSqlStr(jamMasuk)}, jam_pulang_senin_kamis = ${escapeSqlStr(jamPulangSK)}, jam_pulang_jumat = ${escapeSqlStr(jamPulangJumat)} WHERE id = 1`;
        await apiQuery(sql);
        alert(`Pengaturan Jadwal Berhasil Disimpan!\nMasuk: ${jamMasuk} | Pulang S-K: ${jamPulangSK} | Jumat: ${jamPulangJumat}`);
    } catch (err) {
        alert("Gagal menyimpan pengaturan jadwal: " + err.message);
    }
}

// ============================================================================
// 2. KOREKSI PULANG & TAMBAH AKUN MANUAL
// ============================================================================
async function batalkanStatusPulangSiswa() {
    const nisn = document.getElementById('reset-pulang-nisn').value.trim();
    if (!nisn) { alert("Masukkan NISN Siswa!"); return; }

    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());

    if (!confirm(`Batalkan status pulang NISN: ${nisn} untuk hari ini (${today})?`)) return;

    try {
        const sql = `UPDATE presensi SET jam_pulang = NULL, status = 'Hadir' WHERE nisn = ${escapeSqlStr(nisn)} AND tanggal = ${escapeSqlStr(today)}`;
        const updated = await apiQuery(sql);
        if (!updated || updated.length === 0) {
            alert(`Tidak ditemukan data presensi hari ini (${today}) untuk NISN: ${nisn}`);
            return;
        }
        alert(`Status pulang NISN ${nisn} berhasil dibatalkan.`);
        document.getElementById('reset-pulang-nisn').value = '';
    } catch (err) {
        alert("Gagal membatalkan status pulang: " + err.message);
    }
}

async function tambahSiswaManual() {
    const nisn = document.getElementById('admin-siswa-nisn').value.trim();
    const nama = document.getElementById('admin-siswa-nama').value.trim();
    const kelas = document.getElementById('admin-siswa-kelas').value.trim();
    const pass = document.getElementById('admin-siswa-pass').value.trim() || 'yhan123';

    if (!nisn || !nama || !kelas) { alert("NISN, Nama, dan Kelas wajib diisi!"); return; }

    try {
        const sql = `INSERT INTO siswa (nisn, nama, kelas, password, password_hash, password_salt) VALUES (${escapeSqlStr(nisn)}, ${escapeSqlStr(nama)}, ${escapeSqlStr(kelas)}, ${escapeSqlStr(pass)}, NULL, NULL) ON CONFLICT(nisn) DO UPDATE SET nama = excluded.nama, kelas = excluded.kelas, password = excluded.password, password_hash = NULL, password_salt = NULL`;
        await apiQuery(sql);

        alert(`Siswa ${nama} (NISN: ${nisn}) berhasil ditambahkan & disinkronkan!`);
        document.getElementById('admin-siswa-nisn').value = '';
        document.getElementById('admin-siswa-nama').value = '';
        document.getElementById('admin-siswa-kelas').value = '';
        document.getElementById('admin-siswa-pass').value = '';
        muatDaftarSiswa(1, '');
        muatDropdownKelasPenyesuaian();
    } catch (err) {
        alert("Gagal menambahkan siswa: " + err.message);
    }
}

async function tambahUserBaru() {
    const username = document.getElementById('admin-new-username').value.trim();
    const nama = document.getElementById('admin-new-nama').value.trim();
    const pass = document.getElementById('admin-new-password').value.trim();
    const role = document.getElementById('admin-new-role').value;

    if (!username || !nama || !pass) { alert("Semua kolom wajib diisi!"); return; }

    try {
        const sql = `INSERT INTO users (username, nama, password, role) VALUES (${escapeSqlStr(username)}, ${escapeSqlStr(nama)}, ${escapeSqlStr(pass)}, ${escapeSqlStr(role)})`;
        await apiQuery(sql);
        alert("User petugas baru berhasil ditambahkan!");
        document.getElementById('admin-new-username').value = '';
        document.getElementById('admin-new-nama').value = '';
        document.getElementById('admin-new-password').value = '';
        muatDaftarGuru(1, '');
    } catch (err) {
        alert("Gagal menambah user petugas: " + err.message);
    }
}

// ============================================================================
// 3. LOG PERANGKAT HP MULTI-AKUN
// ============================================================================
async function muatLogPerangkatHP() {
    const tbody = document.getElementById('tabel-log-hp-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="2" class="p-3 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin"></i> Memindai database...</td></tr>';

    try {
        const logs = await apiQuery('SELECT nisn, device_info FROM log_perangkat ORDER BY waktu_login DESC LIMIT 100');
        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" class="p-3 text-center text-slate-400">Belum ada riwayat HP terdeteksi.</td></tr>';
            return;
        }

        const deviceMap = {};
        logs.forEach(log => {
            if (!deviceMap[log.device_info]) deviceMap[log.device_info] = new Set();
            deviceMap[log.device_info].add(log.nisn);
        });

        let html = '';
        let foundMulti = false;
        Object.keys(deviceMap).forEach(dev => {
            const listNisn = Array.from(deviceMap[dev]);
            if (listNisn.length > 1) {
                foundMulti = true;
                html += `
                    <tr class="bg-red-50 text-red-900 font-semibold border-b border-amber-100">
                        <td class="p-2 truncate max-w-[120px]" title="${dev}">${dev.substring(0, 20)}...</td>
                        <td class="p-2 text-center font-bold">${listNisn.length} <span class="bg-red-200 text-red-800 text-[9px] px-1 rounded">Multi</span></td>
                    </tr>
                `;
            }
        });

        if (!foundMulti) {
            tbody.innerHTML = '<tr><td colspan="2" class="p-3 text-center text-emerald-600 font-bold">Aman. Tidak ada HP yang dipakai multi-akun.</td></tr>';
        } else {
            tbody.innerHTML = html;
        }

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="2" class="p-3 text-center text-red-500">Gagal memindai: ${err.message}</td></tr>`;
    }
}

// ============================================================================
// 4. KELOLA DATA MASTER SISWA & GURU/PETUGAS
// ============================================================================
function muatSemuaDataMaster() {
    currentPageSiswa = 1;
    currentPageGuru = 1;
    muatDaftarSiswa(1, '');
    muatDaftarGuru(1, '');
}

async function muatDaftarSiswa(page = 1, keyword = '') {
    const tbody = document.getElementById('tabel-siswa-body');
    const btnPrev = document.getElementById('btn-prev-siswa');
    const btnNext = document.getElementById('btn-next-siswa');
    const pageInfo = document.getElementById('page-info-siswa');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin"></i> Memuat...</td></tr>';

    try {
        let countSql = 'SELECT COUNT(*) as total FROM siswa';
        if (keyword) {
            const escKw = escapeSqlStr(`%${keyword}%`);
            countSql += ` WHERE LOWER(nama) LIKE LOWER(${escKw}) OR nisn LIKE ${escKw} OR LOWER(kelas) LIKE LOWER(${escKw})`;
        }
        const countRes = await apiQuery(countSql);
        const totalData = countRes[0] ? countRes[0].total : 0;
        const totalPages = Math.ceil(totalData / itemsPerPage) || 1;

        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;
        currentPageSiswa = page;

        let sql = 'SELECT nisn, nama, kelas FROM siswa';
        if (keyword) {
            const escKw = escapeSqlStr(`%${keyword}%`);
            sql += ` WHERE LOWER(nama) LIKE LOWER(${escKw}) OR nisn LIKE ${escKw} OR LOWER(kelas) LIKE LOWER(${escKw})`;
        }
        sql += ` ORDER BY kelas ASC, nama ASC LIMIT ${itemsPerPage} OFFSET ${(page - 1) * itemsPerPage}`;

        const data = await apiQuery(sql);

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-400">Tidak ada data ditemukan.</td></tr>';
        } else {
            tbody.innerHTML = data.map(s => `
                <tr class="hover:bg-slate-50 border-b border-slate-100">
                    <td class="p-3 font-mono font-medium text-slate-700">${s.nisn}</td>
                    <td class="p-3 font-bold text-slate-800">${s.nama}</td>
                    <td class="p-3 font-mono text-slate-600">${s.kelas}</td>
                    <td class="p-3 text-center">
                        <button onclick="resetPasswordSiswaDefault('${s.nisn}', '${s.nama.replace(/'/g, "\\'")}')" class="bg-amber-100 hover:bg-amber-200 text-amber-800 px-2.5 py-1 rounded text-xs font-bold border border-amber-300 transition cursor-pointer">
                            <i class="fa-solid fa-key"></i> Reset Pass
                        </button>
                    </td>
                    <td class="p-3 text-center">
                        <button onclick="hapusSiswa('${s.nisn}', '${s.nama.replace(/'/g, "\\'")}')" class="bg-red-100 hover:bg-red-200 text-red-700 px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer">
                            <i class="fa-solid fa-trash"></i> Hapus
                        </button>
                    </td>
                </tr>
            `).join('');
        }

        if (pageInfo) pageInfo.textContent = `Halaman ${currentPageSiswa} dari ${totalPages} (Total: ${totalData} data)`;
        if (btnPrev) btnPrev.disabled = (currentPageSiswa <= 1);
        if (btnNext) btnNext.disabled = (currentPageSiswa >= totalPages);

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-500 font-bold">Gagal memuat: ${err.message}</td></tr>`;
    }
}

async function muatDaftarGuru(page = 1, keyword = '') {
    const tbody = document.getElementById('tabel-guru-body');
    const btnPrev = document.getElementById('btn-prev-guru');
    const btnNext = document.getElementById('btn-next-guru');
    const pageInfo = document.getElementById('page-info-guru');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin"></i> Memuat...</td></tr>';

    try {
        let countSql = 'SELECT COUNT(*) as total FROM users';
        if (keyword) {
            const escKw = escapeSqlStr(`%${keyword}%`);
            countSql += ` WHERE LOWER(nama) LIKE LOWER(${escKw}) OR LOWER(username) LIKE LOWER(${escKw}) OR LOWER(role) LIKE LOWER(${escKw})`;
        }
        const countRes = await apiQuery(countSql);
        const totalData = countRes[0] ? countRes[0].total : 0;
        const totalPages = Math.ceil(totalData / itemsPerPage) || 1;

        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;
        currentPageGuru = page;

        let sql = 'SELECT id, username, nama, role FROM users';
        if (keyword) {
            const escKw = escapeSqlStr(`%${keyword}%`);
            sql += ` WHERE LOWER(nama) LIKE LOWER(${escKw}) OR LOWER(username) LIKE LOWER(${escKw}) OR LOWER(role) LIKE LOWER(${escKw})`;
        }
        sql += ` ORDER BY nama ASC LIMIT ${itemsPerPage} OFFSET ${(page - 1) * itemsPerPage}`;

        const data = await apiQuery(sql);

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Tidak ada data petugas ditemukan.</td></tr>';
        } else {
            tbody.innerHTML = data.map(g => `
                <tr class="hover:bg-slate-50 border-b border-slate-100">
                    <td class="p-3 text-slate-400 font-mono">${g.id}</td>
                    <td class="p-3 font-mono font-bold text-slate-700">${g.username}</td>
                    <td class="p-3 font-semibold text-slate-800">${g.nama}</td>
                    <td class="p-3">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${g.role === 'admin' ? 'bg-purple-100 text-purple-800' : g.role === 'bk' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}">
                            ${g.role}
                        </span>
                    </td>
                    <td class="p-3 text-center">
                        <button onclick="resetPasswordGuruDefault(${g.id}, '${g.username.replace(/'/g, "\\'")}')" class="bg-amber-100 hover:bg-amber-200 text-amber-800 px-2.5 py-1 rounded text-xs font-bold border border-amber-300 transition cursor-pointer">
                            <i class="fa-solid fa-key"></i> Reset Pass
                        </button>
                    </td>
                    <td class="p-3 text-center">
                        <button onclick="hapusGuru(${g.id}, '${g.username.replace(/'/g, "\\'")}')" class="bg-red-100 hover:bg-red-200 text-red-700 px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer">
                            <i class="fa-solid fa-trash"></i> Hapus
                        </button>
                    </td>
                </tr>
            `).join('');
        }

        if (pageInfo) pageInfo.textContent = `Halaman ${currentPageGuru} dari ${totalPages} (Total: ${totalData} data)`;
        if (btnPrev) btnPrev.disabled = (currentPageGuru <= 1);
        if (btnNext) btnNext.disabled = (currentPageGuru >= totalPages);

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500 font-bold">Gagal memuat: ${err.message}</td></tr>`;
    }
}

async function resetPasswordSiswaDefault(nisn, nama) {
    if (!confirm(`Reset password "${nama}" (NISN: ${nisn}) kembali ke default "yhan123"?`)) return;

    try {
        const res = await fetch(`${ADMIN_WORKER_URL}/api/admin/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nisn: nisn, defaultPassword: 'yhan123' })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        alert(`Password "${nama}" berhasil direset ke "yhan123".`);
    } catch (err) {
        alert("Gagal reset password: " + err.message);
    }
}

async function hapusSiswa(nisn, nama) {
    if (!confirm(`Apakah Anda yakin ingin menghapus siswa "${nama}" (NISN: ${nisn})?`)) return;
    try {
        await apiQuery(`DELETE FROM siswa WHERE nisn = ${escapeSqlStr(nisn)}`);
        alert(`Siswa "${nama}" berhasil dihapus.`);
        muatDaftarSiswa(currentPageSiswa, document.getElementById('search-input').value);
    } catch (err) {
        alert("Gagal menghapus: " + err.message);
    }
}

async function resetPasswordGuruDefault(id, username) {
    if (!confirm(`Reset password user petugas "${username}" kembali ke default "smada123"?`)) return;
    try {
        await apiQuery(`UPDATE users SET password = 'smada123', password_hash = NULL, password_salt = NULL WHERE id = ${Number(id)}`);
        alert(`Password "${username}" berhasil direset ke "smada123".`);
    } catch (err) {
        alert("Gagal reset password: " + err.message);
    }
}

async function hapusGuru(id, username) {
    if (!confirm(`Apakah Anda yakin ingin menghapus user petugas "${username}"?`)) return;
    try {
        await apiQuery(`DELETE FROM users WHERE id = ${Number(id)}`);
        alert(`User petugas "${username}" berhasil dihapus.`);
        muatDaftarGuru(currentPageGuru, document.getElementById('search-input').value);
    } catch (err) {
        alert("Gagal menghapus: " + err.message);
    }
}

// ============================================================================
// 5. BACKUP DATABASE KE GOOGLE DRIVE
// ============================================================================
async function backupDatabaseKeDrive() {
    if (!confirm("Apakah Anda yakin ingin membackup seluruh data ke Google Drive?\n\nData: Presensi, Kedisiplinan, Jurnal KBM.")) return;

    const btn = document.getElementById('btn-backup');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Memproses...`;
    }

    try {
        const presensi = await apiQuery('SELECT * FROM presensi ORDER BY id DESC');
        const kedisiplinan = await apiQuery('SELECT * FROM kedisiplinan ORDER BY id DESC');
        const jurnal = await apiQuery('SELECT * FROM jurnal_kbm ORDER BY id DESC');

        const wb = XLSX.utils.book_new();

        if (presensi && presensi.length > 0) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(presensi), "Presensi");
        } else {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Info: "Tidak ada data presensi" }]), "Presensi");
        }

        if (kedisiplinan && kedisiplinan.length > 0) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kedisiplinan), "Kedisiplinan");
        } else {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Info: "Tidak ada data kedisiplinan" }]), "Kedisiplinan");
        }

        if (jurnal && jurnal.length > 0) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(jurnal), "Jurnal_KBM");
        } else {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Info: "Tidak ada data jurnal KBM" }]), "Jurnal_KBM");
        }

        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());
        const fileName = `Backup_SMADA_${today}.xlsx`;

        const response = await fetch('https://script.google.com/macros/s/AKfycbyhWmrZugkeEOt8uS-6aVC-ZyeZCt85RxSV3Er0ko6u01C-j95sM70L1CVNwzjSvqqr6A/exec', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                type: 'backup',
                fileBase64: excelBuffer,
                fileName: fileName,
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                folderId: '1gnTFajgWvcwrOk5TIY8Hh5HtlvpNkr8b'
            })
        });

        const result = await response.json();

        if (result.status === 'success') {
            alert(`Backup berhasil!\n\nFile: ${fileName}\n\nLink: ${result.url}`);
        } else {
            alert("Gagal backup: " + (result.message || "Terjadi kesalahan."));
        }
    } catch (err) {
        alert("Gagal backup: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> <span>Backup ke Drive</span>`;
        }
    }
}

// ============================================================================
// 6. PENYESUAIAN PRESENSI KHUSUS (TUGAS LOMBA / PULANG AWAL)
// ============================================================================
async function muatDropdownKelasPenyesuaian() {
    try {
        const dataKelas = await apiQuery('SELECT DISTINCT kelas FROM siswa ORDER BY kelas ASC');
        const selectKelas = document.getElementById('penyesuaian-kelas');
        if (selectKelas && dataKelas) {
            selectKelas.innerHTML = '<option value="">-- Pilih Kelas --</option>' +
                dataKelas.map(k => `<option value="${k.kelas}">${k.kelas}</option>`).join('');

            selectKelas.onchange = async (e) => {
                const kls = e.target.value;
                const selectSiswa = document.getElementById('penyesuaian-nisn');
                if (!kls) {
                    if (selectSiswa) selectSiswa.innerHTML = '<option value="">-- Pilih Kelas Dahulu --</option>';
                    return;
                }
                if (selectSiswa) selectSiswa.innerHTML = '<option value="">Memuat siswa...</option>';
                const dataSiswa = await apiQuery(`SELECT nisn, nama FROM siswa WHERE kelas = ${escapeSqlStr(kls)} ORDER BY nama ASC`);
                if (selectSiswa) {
                    selectSiswa.innerHTML = '<option value="">-- Pilih Siswa --</option>' +
                        (dataSiswa && dataSiswa.length > 0
                            ? dataSiswa.map(s => `<option value="${s.nisn}">${s.nama}</option>`).join('')
                            : '<option value="">-- Tidak ada siswa --</option>');
                }
            };
        }
    } catch (e) {
        console.log("Gagal memuat dropdown kelas", e);
    }
}

async function prosesPenyesuaianPresensi(e) {
    const tipe = document.getElementById('penyesuaian-tipe').value;
    const kelas = document.getElementById('penyesuaian-kelas').value;
    const nisn = document.getElementById('penyesuaian-nisn').value;
    const jenis = document.getElementById('penyesuaian-jenis').value;
    const jamRaw = document.getElementById('penyesuaian-jam').value;
    const ket = document.getElementById('penyesuaian-ket').value.trim();

    if (!kelas) { alert("Pilih kelas terlebih dahulu!"); return; }
    if (tipe === 'siswa' && !nisn) { alert("Pilih siswa terlebih dahulu!"); return; }
    if (!jamRaw) { alert("Tentukan jam khusus!"); return; }

    const jam = jamRaw.length === 5 ? `${jamRaw}:00` : jamRaw;
    const tglHariIni = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());
    const ketFinal = ket ? `Penyesuaian: ${ket}` : 'Penyesuaian Khusus';

    const labelJenis = jenis === 'masuk' ? 'Masuk Telat (Tugas)' : 'Pulang Lebih Awal';
    if (!confirm(`Proses penyesuaian?\nTarget: ${tipe === 'kelas' ? 'Kelas ' + kelas : 'Siswa terpilih'}\nJenis: ${labelJenis}\nJam: ${jam}\nKet: ${ketFinal}`)) return;

    const btn = (e && e.currentTarget) ? e.currentTarget : document.querySelector('button[onclick*="prosesPenyesuaianPresensi"]');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Memproses...`;
    }

    try {
        let targetNisnList = [];
        if (tipe === 'kelas') {
            const resSiswa = await apiQuery(`SELECT nisn FROM siswa WHERE kelas = ${escapeSqlStr(kelas)}`);
            if (resSiswa && resSiswa.length > 0) targetNisnList = resSiswa.map(s => s.nisn);
        } else {
            targetNisnList = [nisn];
        }

        if (targetNisnList.length === 0) throw new Error("Tidak ada siswa ditemukan.");

        let sukses = 0;
        for (const n of targetNisnList) {
            if (jenis === 'masuk') {
                const sql = `INSERT INTO presensi (nisn, tanggal, jam_masuk, status, keterangan) VALUES (${escapeSqlStr(n)}, ${escapeSqlStr(tglHariIni)}, ${escapeSqlStr(jam)}, 'Hadir', ${escapeSqlStr(ketFinal)}) ON CONFLICT (nisn, tanggal) DO UPDATE SET jam_masuk = excluded.jam_masuk, status = 'Hadir', keterangan = excluded.keterangan`;
                await apiQuery(sql);
            } else {
                const sql = `INSERT INTO presensi (nisn, tanggal, jam_masuk, jam_pulang, status, keterangan) VALUES (${escapeSqlStr(n)}, ${escapeSqlStr(tglHariIni)}, '07:00:00', ${escapeSqlStr(jam)}, 'Hadir', ${escapeSqlStr(ketFinal)}) ON CONFLICT (nisn, tanggal) DO UPDATE SET jam_pulang = excluded.jam_pulang, keterangan = excluded.keterangan`;
                await apiQuery(sql);
            }
            sukses++;
        }

        alert(`Penyesuaian berhasil diproses untuk ${sukses} siswa!`);
        document.getElementById('penyesuaian-ket').value = '';
    } catch (err) {
        alert("Gagal memproses penyesuaian: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-check"></i> <span>Simpan Penyesuaian</span>`;
        }
    }
}
