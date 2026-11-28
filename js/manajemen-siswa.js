/* ==========================================================================
   SMAN 2 KARANGANYAR - MANAJEMEN SIKLUS SISWA, GURU & TAHUN AJARAN
   (FULL FIXED VERSION - RAW QUERY & MISSING FUNCTIONS ADDED)
   ========================================================================== */

let currentUserSession = null;
const PORTAL_SSO_URL = "index.html";
let tahunAjaranAktif = "2026/2027";
let jumlahKelasXiiAktif = 0;

// Helper Escape untuk mencegah SQL Injection di Raw Query
function escapeSqlStr(str) {
    return "'" + String(str ?? '').replace(/'/g, "''") + "'";
}

(function verifikasiSuperAdmin() {
    const rawUser = localStorage.getItem('smada_user');
    if (rawUser && rawUser !== "null" && rawUser !== "undefined") {
        try {
            currentUserSession = JSON.parse(rawUser);
            const r = String(currentUserSession.role || '').toLowerCase().trim();
            const isAllowed = r.includes('admin') || r.includes('superadmin') || r.includes('super_admin');
            if (!currentUserSession.username || !isAllowed) {
                alert("Akses Ditolak! Halaman ini khusus Super Admin / Admin.");
                window.location.replace(PORTAL_SSO_URL);
                return;
            }
            return;
        } catch (e) {
            localStorage.removeItem('smada_user');
        }
    }
    alert("Akses Terbatas! Silakan login melalui Portal SSO.");
    window.location.replace(PORTAL_SSO_URL);
})();

window.onload = async function() {
    setTombolBackDinamis();
    await pastikanTabelPengaturanSistem();
    await pastikanKolomTabelSiswa(); // Cukup panggil satu kali (sudah digabung)
    await muatTahunAjaranAktif();
    await Promise.all([
        muatOpsiKelasDropdown(),
        muatSiswaTab1(),
        muatSiswaKelasXII(),
        muatSiswaTab3(),
        muatDataGuruTab4(), // Fungsi yang tadinya hilang
        muatSiswaMutasiKeluar()
    ]);
};

// ============================================================================
// AUTO-MIGRASI SKEMA DATABASE
// ============================================================================
async function pastikanTabelPengaturanSistem() {
    try {
        await queryTurso("CREATE TABLE IF NOT EXISTS pengaturan_sistem (kunci TEXT PRIMARY KEY, nilai TEXT NOT NULL)", [], true);
        await queryTurso("INSERT INTO pengaturan_sistem (kunci, nilai) VALUES ('tahun_ajaran', '2026/2027') ON CONFLICT (kunci) DO NOTHING", [], true);
    } catch (_) {}
}

async function pastikanKolomTabelSiswa() {
    try {
        const info = await queryTurso("PRAGMA table_info(siswa)", [], true);
        const kolomAda = (info || []).map(c => String(c.name || '').toLowerCase());

        if (!kolomAda.includes('status_siswa')) {
            await queryTurso("ALTER TABLE siswa ADD COLUMN status_siswa TEXT DEFAULT 'Aktif'", [], true);
        }
        if (!kolomAda.includes('status_presensi')) {
            await queryTurso("ALTER TABLE siswa ADD COLUMN status_presensi TEXT DEFAULT 'Normal'", [], true);
        }
    } catch (e) {
        console.warn("Info kolom siswa:", e.message);
    }
}

// ============================================================================
// PENGELOLAAN TAHUN AJARAN
// ============================================================================
function hitungTahunAjaranBerikutnya(taStr) {
    const match = String(taStr || '').trim().match(/^(\d{4})\s*\/\s*(\d{4})$/);
    if (match) {
        const y1 = Number(match[1]) + 1;
        const y2 = Number(match[2]) + 1;
        return `${y1}/${y2}`;
    }
    return "2027/2028";
}

async function muatTahunAjaranAktif() {
    try {
        const rows = await queryTurso("SELECT nilai FROM pengaturan_sistem WHERE kunci = 'tahun_ajaran' LIMIT 1", [], true);
        if (rows && rows.length > 0 && rows[0].nilai) {
            tahunAjaranAktif = String(rows[0].nilai).trim();
        }
    } catch (_) {}
    renderTahunAjaranUI();
}

function renderTahunAjaranUI() {
    const nextTa = hitungTahunAjaranBerikutnya(tahunAjaranAktif);
    const elDisplay = document.getElementById('display-tahun-ajaran');
    const elNext = document.getElementById('label-next-ta');
    const elLulus = document.getElementById('lulus-ta-label');
    if (elDisplay) elDisplay.textContent = tahunAjaranAktif;
    if (elNext) elNext.textContent = nextTa;
    if (elLulus) elLulus.textContent = tahunAjaranAktif;
}

async function simpanTahunAjaranKeDb(taBaru) {
    await queryTurso(
        `INSERT INTO pengaturan_sistem (kunci, nilai) VALUES ('tahun_ajaran', ${escapeSqlStr(taBaru)}) ON CONFLICT (kunci) DO UPDATE SET nilai = excluded.nilai`,
        [], true
    );
    tahunAjaranAktif = taBaru;
    renderTahunAjaranUI();
}

async function naikkanTahunAjaranBerikutnya() {
    const nextTa = hitungTahunAjaranBerikutnya(tahunAjaranAktif);
    if (jumlahKelasXiiAktif > 0) {
        if (!confirm(`Perhatian: Masih terdapat ${jumlahKelasXiiAktif} siswa Kelas XII Aktif.\n\nTetap naikkan Tahun Pelajaran dari ${tahunAjaranAktif} ke ${nextTa}?`)) return;
    } else {
        if (!confirm(`Naikkan Tahun Pelajaran aktif dari ${tahunAjaranAktif} menjadi ${nextTa}?`)) return;
    }
    try {
        await simpanTahunAjaranKeDb(nextTa);
        alert(`Tahun Pelajaran berhasil diperbarui menjadi ${nextTa}!`);
    } catch (err) {
        alert("Gagal: " + err.message);
    }
}

function bukaModalEditTahunAjaran() {
    document.getElementById('input-manual-ta').value = tahunAjaranAktif;
    document.getElementById('modal-edit-ta').classList.remove('hidden');
}
function tutupModalEditTahunAjaran() {
    document.getElementById('modal-edit-ta').classList.add('hidden');
}

async function simpanManualTahunAjaran() {
    const val = document.getElementById('input-manual-ta').value.trim();
    if (!/^\d{4}\/\d{4}$/.test(val)) {
        alert("Format tidak valid. Gunakan YYYY/YYYY.");
        return;
    }
    try {
        await simpanTahunAjaranKeDb(val);
        tutupModalEditTahunAjaran();
        alert(`Tahun Pelajaran aktif diatur ke ${val}.`);
    } catch (err) {
        alert("Gagal: " + err.message);
    }
}

async function cekDanTawarkanPergeseranTahunAjaran() {
    try {
        const siswaXiiAktif = await queryTurso("SELECT nisn FROM siswa WHERE (kelas LIKE '%XII%' OR kelas LIKE '%12%') AND (status_siswa = 'Aktif' OR status_siswa IS NULL)", [], true);
        jumlahKelasXiiAktif = (siswaXiiAktif || []).length;
        updateBannerStatusSiklus();

        if (jumlahKelasXiiAktif === 0) {
            const nextTa = hitungTahunAjaranBerikutnya(tahunAjaranAktif);
            if (confirm(`Seluruh siswa Kelas XII telah diproses.\n\nGeser Tahun Pelajaran ke ${nextTa}?`)) {
                await simpanTahunAjaranKeDb(nextTa);
            }
        }
    } catch (_) {}
}

function updateBannerStatusSiklus() {
    const banner = document.getElementById('banner-status-siklus');
    const teks = document.getElementById('teks-status-siklus');
    if (!banner || !teks) return;

    const nextTa = hitungTahunAjaranBerikutnya(tahunAjaranAktif);
    if (jumlahKelasXiiAktif > 0) {
        banner.className = "bg-amber-50 border border-amber-300 text-amber-900 px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-between gap-2";
        teks.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-amber-600 mr-1.5"></i>Masih ada <b>${jumlahKelasXiiAktif} siswa XII</b> Aktif. Luluskan dulu sebelum naik ke TA <b>${nextTa}</b>.`;
    } else {
        banner.className = "bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-between gap-2";
        teks.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-600 mr-1.5"></i>Seluruh siswa XII TA <b>${tahunAjaranAktif}</b> sudah lulus. Siap naik ke TA <b>${nextTa}</b>.`;
    }
}

// ============================================================================
// NAVIGASI & HELPER
// ============================================================================
function setTombolBackDinamis() {
    const labelBtn = document.getElementById('label-btn-back');
    const r = String(currentUserSession?.role || '').toLowerCase();
    if (labelBtn) labelBtn.textContent = (r.includes('superadmin') || r.includes('super_admin')) ? 'Kembali ke Super Admin' : 'Kembali ke Admin';
}
function kembaliKePanelUtama() {
    const r = String(currentUserSession?.role || '').toLowerCase();
    window.location.href = (r.includes('superadmin') || r.includes('super_admin')) ? 'super-admin.html' : 'admin.html';
}
function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => { tab.classList.add('hidden'); tab.classList.remove('block'); });
    const selectedTab = document.getElementById(tabId);
    if (selectedTab) { selectedTab.classList.remove('hidden'); selectedTab.classList.add('block'); }
    document.querySelectorAll('.tab-btn').forEach(btn => { btn.className = "tab-btn px-3.5 py-2.5 rounded-lg text-slate-600 hover:bg-slate-100 transition flex items-center space-x-2 cursor-pointer"; });
    const activeBtn = document.getElementById('btn-' + tabId);
    if (activeBtn) activeBtn.className = "tab-btn px-3.5 py-2.5 rounded-lg bg-blue-900 text-white transition flex items-center space-x-2 cursor-pointer";
}
function cleanKelasFormat(str) { return String(str || '').replace(/\s+/g, ' ').trim().toUpperCase(); }
function escapeHtml(str) { return String(str || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
function getAuthHeaders() {
    const token = currentUserSession?.token || localStorage.getItem('smada_token') || '';
    return { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };
}

async function muatOpsiKelasDropdown() {
    try {
        const data = await queryTurso("SELECT DISTINCT kelas FROM siswa ORDER BY kelas ASC", [], true);
        const uniqueKelas = [...new Set((data || []).map(item => cleanKelasFormat(item.kelas)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));

        const selectTab1 = document.getElementById('filter-kelas-tab1');
        if (selectTab1) selectTab1.innerHTML = '<option value="semua">Semua Kelas</option>' + uniqueKelas.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('');
        const selectNaikAsal = document.getElementById('naik-kelas-asal');
        if (selectNaikAsal) selectNaikAsal.innerHTML = '<option value="">Pilih Kelas Asal...</option>' + uniqueKelas.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('');
    } catch (err) { console.error(err); }
}

// ============================================================================
// TAB 1: PENJURUSAN & KENAIKAN KELAS
// ============================================================================
async function prosesExcelPenjurusan() {
    const fileInput = document.getElementById('input-excel-penjurusan');
    const btn = document.getElementById('btn-proses-penjurusan');
    if (!fileInput.files.length) return alert("Pilih file Excel terlebih dahulu!");

    const file = fileInput.files[0];
    const reader = new FileReader();
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Memproses...</span>`;

    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

            if (!jsonData.length) return alert("File Excel kosong!");
            let updatedCount = 0;
            for (const item of jsonData) {
                const nisn = String(item.nisn || '').trim();
                const kelasBaru = cleanKelasFormat(item.kelas_baru || item.kelas);
                if (nisn && kelasBaru) {
                    await queryTurso(`UPDATE siswa SET kelas = ${escapeSqlStr(kelasBaru)}, status_siswa = 'Aktif' WHERE nisn = ${escapeSqlStr(nisn)}`, [], true);
                    updatedCount++;
                }
            }
            alert(`Berhasil memproses ${updatedCount} siswa!`);
            fileInput.value = '';
            await muatOpsiKelasDropdown();
            await muatSiswaTab1();
            await cekDanTawarkanPergeseranTahunAjaran();
        } catch (err) {
            alert("Error Excel: " + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-rotate"></i><span>Proses Penjurusan</span>`;
        }
    };
    reader.readAsArrayBuffer(file);
}

async function prosesKenaikanRombelMasal() {
    const kelasAsal = cleanKelasFormat(document.getElementById('naik-kelas-asal').value);
    const kelasTujuan = cleanKelasFormat(document.getElementById('naik-kelas-tujuan').value);
    if (!kelasAsal || !kelasTujuan) return alert("Kelas Asal dan Tujuan wajib diisi!");
    if (!confirm(`Pindahkan seluruh siswa kelas "${kelasAsal}" ke "${kelasTujuan}"?`)) return;

    try {
        await queryTurso(`UPDATE siswa SET kelas = ${escapeSqlStr(kelasTujuan)} WHERE UPPER(TRIM(kelas)) = ${escapeSqlStr(kelasAsal)} AND (status_siswa != 'Lulus' OR status_siswa IS NULL)`, [], true);
        alert(`Siswa ${kelasAsal} berhasil dipindahkan ke ${kelasTujuan}!`);
        document.getElementById('naik-kelas-tujuan').value = '';
        await muatOpsiKelasDropdown();
        await muatSiswaTab1();
        await cekDanTawarkanPergeseranTahunAjaran();
    } catch (err) { alert("Gagal: " + err.message); }
}

async function muatSiswaTab1() {
    const tbody = document.getElementById('tabel-tab1-body');
    const kelasVal = document.getElementById('filter-kelas-tab1').value;
    const searchVal = document.getElementById('search-tab1').value.toLowerCase().trim();
    tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Memuat data...</td></tr>';

    try {
        let sql = "SELECT * FROM siswa WHERE (status_siswa != 'Lulus' OR status_siswa IS NULL) ORDER BY kelas ASC, nama ASC";
        if (kelasVal !== 'semua') sql = `SELECT * FROM siswa WHERE (status_siswa != 'Lulus' OR status_siswa IS NULL) AND UPPER(TRIM(kelas)) = ${escapeSqlStr(kelasVal)} ORDER BY nama ASC`;
        
        const data = await queryTurso(sql, [], true);
        let filtered = Array.isArray(data) ? data : [];
        if (searchVal) {
            filtered = filtered.filter(s => String(s.nisn || '').toLowerCase().includes(searchVal) || String(s.nama || '').toLowerCase().includes(searchVal));
        }

        if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Tidak ada data.</td></tr>'; return; }
        tbody.innerHTML = filtered.map(s => `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="p-3 font-mono font-medium">${escapeHtml(s.nisn)}</td>
                <td class="p-3 font-semibold text-slate-800">${escapeHtml(s.nama)}</td>
                <td class="p-3 text-slate-600 font-mono font-bold">${escapeHtml(s.kelas)}</td>
                <td class="p-3">
                    <input type="text" id="edit-kelas-${escapeHtml(s.nisn)}" value="${escapeHtml(s.kelas)}" class="border px-2 py-1 rounded text-xs w-28 font-mono font-bold">
                    <button onclick="simpanUbahKelasIndividu('${escapeHtml(s.nisn)}')" class="bg-blue-600 text-white px-2 py-1 rounded text-[11px] ml-1">Simpan</button>
                </td>
                <td class="p-3 text-center"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${s.status_siswa === 'Tinggal Kelas' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}">${escapeHtml(s.status_siswa || 'Aktif')}</span></td>
                <td class="p-3 text-center">
                    <button onclick="toggleTinggalKelas('${escapeHtml(s.nisn)}', '${escapeHtml(s.status_siswa || 'Aktif')}')" class="bg-amber-100 text-amber-800 px-2 py-1 rounded text-[11px]">
                        ${s.status_siswa === 'Tinggal Kelas' ? 'Set Aktif' : 'Set Tinggal Kelas'}
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (err) { tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Error: ${escapeHtml(err.message)}</td></tr>`; }
}

async function simpanUbahKelasIndividu(nisn) {
    const kelasBaru = cleanKelasFormat(document.getElementById(`edit-kelas-${nisn}`).value);
    if (!kelasBaru) return;
    try {
        await queryTurso(`UPDATE siswa SET kelas = ${escapeSqlStr(kelasBaru)} WHERE nisn = ${escapeSqlStr(nisn)}`, [], true);
        alert("Kelas berhasil diperbarui!"); muatSiswaTab1();
    } catch (err) { alert("Gagal: " + err.message); }
}

async function toggleTinggalKelas(nisn, currentStatus) {
    const nextStatus = currentStatus === 'Tinggal Kelas' ? 'Aktif' : 'Tinggal Kelas';
    try {
        await queryTurso(`UPDATE siswa SET status_siswa = ${escapeSqlStr(nextStatus)} WHERE nisn = ${escapeSqlStr(nisn)}`, [], true);
        muatSiswaTab1();
    } catch (err) { alert("Gagal: " + err.message); }
}

// ============================================================================
// TAB 2: KELULUSAN (KELAS XII)
// ============================================================================
async function muatSiswaKelasXII() {
    const tbody = document.getElementById('tabel-lulus-body');
    try {
        const data = await queryTurso("SELECT * FROM siswa WHERE kelas LIKE '%XII%' OR kelas LIKE '%12%' ORDER BY kelas ASC, nama ASC", [], true);
        const rows = Array.isArray(data) ? data : [];
        jumlahKelasXiiAktif = rows.filter(s => (s.status_siswa || 'Aktif') === 'Aktif').length;
        updateBannerStatusSiklus();

        if (rows.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Tidak ada data siswa Kelas XII.</td></tr>'; return; }
        tbody.innerHTML = rows.map(s => `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="p-3 text-center"><input type="checkbox" class="check-lulus-item" value="${escapeHtml(s.nisn)}"></td>
                <td class="p-3 font-mono font-medium">${escapeHtml(s.nisn)}</td>
                <td class="p-3 font-semibold text-slate-800">${escapeHtml(s.nama)}</td>
                <td class="p-3 font-mono font-bold">${escapeHtml(s.kelas)}</td>
                <td class="p-3 text-center"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${s.status_siswa === 'Lulus' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}">${s.status_siswa === 'Lulus' ? 'Lulus' : 'Aktif XII'}</span></td>
                <td class="p-3 text-center space-x-1">
                    <button onclick="setLulusIndividu('${escapeHtml(s.nisn)}', '${escapeHtml(s.status_siswa || '')}')" class="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded text-xs font-bold">${s.status_siswa === 'Lulus' ? 'Batal Lulus' : 'Set Lulus'}</button>
                </td>
            </tr>
        `).join('');
    } catch (err) { tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Error: ${escapeHtml(err.message)}</td></tr>`; }
}

function toggleCheckAllLulus(master) { document.querySelectorAll('.check-lulus-item').forEach(c => c.checked = master.checked); }

async function luluskanMasalSelected() {
    const checkedBoxes = document.querySelectorAll('.check-lulus-item:checked');
    if (!checkedBoxes.length) return alert("Pilih siswa yang akan diluluskan!");
    const nisnList = Array.from(checkedBoxes).map(c => c.value);
    if (!confirm(`Luluskan ${nisnList.length} siswa terpilih?`)) return;
    try {
        for (const nisn of nisnList) {
            await queryTurso(`UPDATE siswa SET status_siswa = 'Lulus' WHERE nisn = ${escapeSqlStr(nisn)}`, [], true);
        }
        alert(`Berhasil meluluskan ${nisnList.length} siswa!`);
        await muatSiswaKelasXII(); await muatSiswaTab1();
    } catch (err) { alert("Gagal: " + err.message); }
}

async function setLulusIndividu(nisn, currentStatus) {
    const nextStatus = currentStatus === 'Lulus' ? 'Aktif' : 'Lulus';
    await queryTurso(`UPDATE siswa SET status_siswa = ${escapeSqlStr(nextStatus)} WHERE nisn = ${escapeSqlStr(nisn)}`, [], true);
    await muatSiswaKelasXII(); await muatSiswaTab1();
}

// ============================================================================
// TAB 3: KELOLA DATA SISWA
// ============================================================================
async function simpanSiswaManual() {
    const nisn = document.getElementById('manual-siswa-nisn').value.trim();
    const nama = document.getElementById('manual-siswa-nama').value.trim();
    const kelas = cleanKelasFormat(document.getElementById('manual-siswa-kelas').value);
    if (!nisn || !nama || !kelas) return alert("NISN, Nama, dan Kelas wajib diisi!");

    try {
        const sql = `INSERT INTO siswa (nisn, nama, kelas, password, status_siswa) VALUES (${escapeSqlStr(nisn)}, ${escapeSqlStr(nama)}, ${escapeSqlStr(kelas)}, 'yhan123', 'Aktif') ON CONFLICT(nisn) DO UPDATE SET nama=excluded.nama, kelas=excluded.kelas`;
        await queryTurso(sql, [], true);
        await fetch('https://smada-api-gateway.yhanedy.workers.dev/api/admin/reset-password', {
            method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ nisn: nisn, defaultPassword: 'yhan123' })
        }).catch(() => {});
        alert(`Siswa ${nama} berhasil disimpan!`);
        document.getElementById('manual-siswa-nisn').value = ''; document.getElementById('manual-siswa-nama').value = ''; document.getElementById('manual-siswa-kelas').value = '';
        muatSiswaTab3(); muatOpsiKelasDropdown();
    } catch (err) { alert("Gagal: " + err.message); }
}

async function prosesImportSiswaBaru() {
    const fileInput = document.getElementById('excel-siswa-baru');
    if (!fileInput.files.length) return alert("Pilih file Excel!");
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            let imported = 0;
            for (const item of jsonData) {
                const nisn = String(item.nisn || '').trim(); const nama = String(item.nama || '').trim(); const kelas = cleanKelasFormat(item.kelas);
                if (nisn && nama) {
                    await queryTurso(`INSERT INTO siswa (nisn, nama, kelas, password, status_siswa) VALUES (${escapeSqlStr(nisn)}, ${escapeSqlStr(nama)}, ${escapeSqlStr(kelas)}, 'yhan123', 'Aktif') ON CONFLICT(nisn) DO UPDATE SET nama=excluded.nama, kelas=excluded.kelas`, [], true);
                    await fetch('https://smada-api-gateway.yhanedy.workers.dev/api/admin/reset-password', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ nisn: nisn, defaultPassword: 'yhan123' }) }).catch(() => {});
                    imported++;
                }
            }
            alert(`Berhasil mengimpor ${imported} data siswa!`);
            fileInput.value = ''; muatSiswaTab3(); muatOpsiKelasDropdown();
        } catch (err) { alert("Error Excel: " + err.message); }
    };
    reader.readAsArrayBuffer(fileInput.files[0]);
}

async function muatSiswaTab3() {
    const tbody = document.getElementById('tabel-tab3-body');
    const searchVal = document.getElementById('search-tab3').value.toLowerCase().trim();
    tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Memuat...</td></tr>';
    try {
        const data = await queryTurso("SELECT * FROM siswa ORDER BY kelas ASC, nama ASC LIMIT 300", [], true);
        let filtered = Array.isArray(data) ? data : [];
        if (searchVal) filtered = filtered.filter(s => String(s.nisn || '').toLowerCase().includes(searchVal) || String(s.nama || '').toLowerCase().includes(searchVal) || String(s.kelas || '').toLowerCase().includes(searchVal));
        if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Tidak ada data.</td></tr>'; return; }
        tbody.innerHTML = filtered.map(s => `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="p-3 font-mono font-medium">${escapeHtml(s.nisn)}</td>
                <td class="p-3 font-semibold text-slate-800">${escapeHtml(s.nama)}</td>
                <td class="p-3 font-mono font-bold">${escapeHtml(s.kelas)}</td>
                <td class="p-3 text-center"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${s.status_siswa === 'Lulus' ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-800'}">${escapeHtml(s.status_siswa || 'Aktif')}</span></td>
                <td class="p-3 text-center"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${s.status_presensi === 'Bebas Presensi' ? 'bg-purple-100 text-purple-800' : 'bg-blue-50 text-blue-800'}">${s.status_presensi === 'Bebas Presensi' ? 'Bebas Presensi' : 'Wajib GPS'}</span></td>
                <td class="p-3 text-center">
                    <button onclick="toggleStatusBebasPresensi('${escapeHtml(s.nisn)}', '${escapeHtml(s.status_presensi || '')}')" class="bg-purple-100 text-purple-800 px-2.5 py-1 rounded text-[11px] font-bold">
                        ${s.status_presensi === 'Bebas Presensi' ? 'Set Wajib GPS' : 'Set Bebas Presensi'}
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (err) { tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Error: ${escapeHtml(err.message)}</td></tr>`; }
}

async function toggleStatusBebasPresensi(nisn, currentStatus) {
    const nextStatus = currentStatus === 'Bebas Presensi' ? 'Normal' : 'Bebas Presensi';
    try {
        await queryTurso(`UPDATE siswa SET status_presensi = ${escapeSqlStr(nextStatus)} WHERE nisn = ${escapeSqlStr(nisn)}`, [], true);
        muatSiswaTab3();
    } catch (err) { alert("Gagal: " + err.message); }
}

// ============================================================================
// TAB 4: KELOLA DATA GURU & PETUGAS (FUNGSI YANG TADINYA HILANG)
// ============================================================================
async function simpanGuruManual() {
    const elUser = document.getElementById('manual-guru-user');
    const elNama = document.getElementById('manual-guru-nama');
    const elPass = document.getElementById('manual-guru-pass');
    const user = String(elUser ? elUser.value : '').trim();
    const nama = String(elNama ? elNama.value : '').trim();
    const pass = String(elPass ? elPass.value : '').trim() || 'guru123';
    const roleChecked = Array.from(document.querySelectorAll('.cb-manual-guru-role:checked')).map(cb => cb.value.trim().toLowerCase());
    if (!user || !nama || roleChecked.length === 0) return alert("Lengkapi Username, Nama, dan minimal 1 Role!");
    const roleString = roleChecked.join(',');
    try {
        await queryTurso(`INSERT INTO users (username, nama, password_hash, role) VALUES (${escapeSqlStr(user)}, ${escapeSqlStr(nama)}, ${escapeSqlStr(pass)}, ${escapeSqlStr(roleString)}) ON CONFLICT(username) DO UPDATE SET nama=excluded.nama, password_hash=excluded.password_hash, role=excluded.role`, [], true);
        alert(`Akun "${nama}" berhasil disimpan!`);
        elUser.value = ''; elNama.value = ''; elPass.value = 'guru123';
        document.querySelectorAll('.cb-manual-guru-role').forEach(cb => cb.checked = false);
        muatDataGuruTab4();
    } catch (err) { alert("Gagal: " + err.message); }
}

async function muatDataGuruTab4() {
    const tbody = document.getElementById('tabel-tab4-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Memuat data guru...</td></tr>';
    try {
        const data = await queryTurso("SELECT id, username, nama, role FROM users ORDER BY nama ASC", [], true);
        if (!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Belum ada data guru.</td></tr>'; return; }
        tbody.innerHTML = data.map(g => `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="p-3 font-mono font-bold">${escapeHtml(g.username)}</td>
                <td class="p-3 font-semibold text-slate-800">${escapeHtml(g.nama)}</td>
                <td class="p-3 text-center">${formatBadgeRole(g.role)}</td>
                <td class="p-3 text-center"><button onclick="bukaModalEditRole('${escapeHtml(g.username)}', '${escapeHtml(g.nama)}', '${escapeHtml(g.role)}')" class="bg-blue-100 text-blue-800 px-2 py-1 rounded text-[11px] font-bold">Edit Role</button></td>
                <td class="p-3 text-center"><button onclick="resetPasswordGuru('${escapeHtml(g.username)}')" class="bg-amber-100 text-amber-800 px-2 py-1 rounded text-[11px] font-bold">Reset Pass</button></td>
                <td class="p-3 text-center"><button onclick="hapusGuru('${escapeHtml(g.username)}')" class="bg-red-100 text-red-800 px-2 py-1 rounded text-[11px] font-bold">Hapus</button></td>
            </tr>
        `).join('');
    } catch (err) { tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Error: ${escapeHtml(err.message)}</td></tr>`; }
}

function formatBadgeRole(roleStr) {
    const roles = String(roleStr || '').split(',').map(r => r.trim().toLowerCase()).filter(Boolean);
    const badgeMap = {
        admin: '<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">ADMIN</span>',
        admin_jurnal: '<span class="px-2 py-0.5 rounded bg-teal-100 text-teal-800 font-bold text-[10px]">ADMIN JURNAL</span>',
        kepsek: '<span class="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[10px]">KEPSEK</span>',
        mapel: '<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">MAPEL</span>',
        piket: '<span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px]">PIKET</span>',
        bk: '<span class="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-bold text-[10px]">BK</span>'
    };
    return roles.map(r => badgeMap[r] || `<span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px]">${r.toUpperCase()}</span>`).join(' ');
}

function bukaModalEditRole(username, nama, currentRoles) {
    document.getElementById('edit-role-guru-user').value = username;
    document.getElementById('edit-role-guru-nama').textContent = `${nama} (${username})`;
    const rolesArr = String(currentRoles || '').split(',').map(r => r.trim().toLowerCase());
    document.querySelectorAll('.cb-edit-role-item').forEach(cb => { cb.checked = rolesArr.includes(cb.value); });
    document.getElementById('modal-edit-role-guru').classList.remove('hidden');
}

function tutupModalEditRole() { document.getElementById('modal-edit-role-guru').classList.add('hidden'); }

async function simpanEditRoleGuru() {
    const user = document.getElementById('edit-role-guru-user').value.trim();
    const roleChecked = Array.from(document.querySelectorAll('.cb-edit-role-item:checked')).map(cb => cb.value.trim().toLowerCase());
    if (!user || roleChecked.length === 0) return alert("Pilih minimal 1 Role!");
    try {
        await queryTurso(`UPDATE users SET role = ${escapeSqlStr(roleChecked.join(','))} WHERE LOWER(TRIM(username)) = LOWER(${escapeSqlStr(user)})`, [], true);
        alert("Role berhasil diperbarui!"); tutupModalEditRole(); muatDataGuruTab4();
    } catch (err) { alert("Gagal: " + err.message); }
}

async function resetPasswordGuru(username) {
    if (!confirm(`Reset password "${username}" ke "smada123"?`)) return;
    try {
        await queryTurso(`UPDATE users SET password_hash = 'smada123', password_salt = NULL WHERE LOWER(TRIM(username)) = LOWER(${escapeSqlStr(username)})`, [], true);
        alert(`Password "${username}" berhasil direset!`);
    } catch (err) { alert("Gagal: " + err.message); }
}

async function hapusGuru(username) {
    if (!confirm(`Hapus user "${username}"?`)) return;
    try {
        await queryTurso(`DELETE FROM users WHERE LOWER(TRIM(username)) = LOWER(${escapeSqlStr(username)})`, [], true);
        alert(`User "${username}" berhasil dihapus.`); muatDataGuruTab4();
    } catch (err) { alert("Gagal: " + err.message); }
}

// FUNGSI IMPORT EXCEL GURU (Tadinya Hilang di JS)
async function prosesImportGuruExcel() {
    const fileInput = document.getElementById('excel-guru-file');
    if (!fileInput.files.length) return alert("Pilih file Excel terlebih dahulu!");
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            let imported = 0;
            for (const item of jsonData) {
                const username = String(item.username || '').trim();
                const nama = String(item.nama || '').trim();
                const password = String(item.password || 'guru123').trim();
                const role = String(item.role || 'mapel').trim().toLowerCase();
                if (username && nama) {
                    await queryTurso(`INSERT INTO users (username, nama, password_hash, role) VALUES (${escapeSqlStr(username)}, ${escapeSqlStr(nama)}, ${escapeSqlStr(password)}, ${escapeSqlStr(role)}) ON CONFLICT(username) DO UPDATE SET nama=excluded.nama, password_hash=excluded.password_hash, role=excluded.role`, [], true);
                    imported++;
                }
            }
            alert(`Berhasil mengimpor ${imported} data guru!`);
            fileInput.value = ''; muatDataGuruTab4();
        } catch (err) { alert("Error Excel: " + err.message); }
    };
    reader.readAsArrayBuffer(fileInput.files[0]);
}

// ============================================================================
// TAB 5: MUTASI SISWA
// ============================================================================
async function simpanMutasiMasuk() {
    const nisn = document.getElementById('mutasi-masuk-nisn').value.trim();
    const nama = document.getElementById('mutasi-masuk-nama').value.trim();
    const kelas = cleanKelasFormat(document.getElementById('mutasi-masuk-kelas').value);
    if (!nisn || !nama || !kelas) return alert("Semua kolom wajib diisi!");
    try {
        await queryTurso(`INSERT INTO siswa (nisn, nama, kelas, password, status_siswa) VALUES (${escapeSqlStr(nisn)}, ${escapeSqlStr(nama)}, ${escapeSqlStr(kelas)}, 'yhan123', 'Aktif') ON CONFLICT(nisn) DO UPDATE SET nama=excluded.nama, kelas=excluded.kelas, status_siswa='Aktif'`, [], true);
        await fetch('https://smada-api-gateway.yhanedy.workers.dev/api/admin/reset-password', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ nisn: nisn, defaultPassword: 'yhan123' }) }).catch(() => {});
        alert(`Siswa "${nama}" berhasil ditambahkan!`);
        document.getElementById('mutasi-masuk-nisn').value = ''; document.getElementById('mutasi-masuk-nama').value = ''; document.getElementById('mutasi-masuk-kelas').value = '';
        muatOpsiKelasDropdown(); muatSiswaTab1();
    } catch (err) { alert("Gagal: " + err.message); }
}

async function muatSiswaMutasiKeluar() {
    const tbody = document.getElementById('tabel-mutasi-keluar-body');
    try {
        const data = await queryTurso("SELECT * FROM siswa WHERE status_siswa = 'Mutasi Keluar' ORDER BY nama ASC", [], true);
        if (!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-400">Tidak ada siswa mutasi keluar.</td></tr>'; return; }
        tbody.innerHTML = data.map(s => `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="p-2.5 font-mono">${escapeHtml(s.nisn)}</td>
                <td class="p-2.5 font-semibold text-slate-800">${escapeHtml(s.nama)}</td>
                <td class="p-2.5 font-mono font-bold">${escapeHtml(s.kelas)}</td>
                <td class="p-2.5 text-center"><span class="bg-red-100 text-red-800 px-2 py-0.5 rounded text-[10px] font-bold">Mutasi Keluar</span></td>
                <td class="p-2.5 text-center"><button onclick="aktifkanSiswaKembali('${escapeHtml(s.nisn)}')" class="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-[11px]">Aktifkan Kembali</button></td>
            </tr>
        `).join('');
    } catch (err) { tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-500">Error: ${escapeHtml(err.message)}</td></tr>`; }
}

async function aktifkanSiswaKembali(nisn) {
    try {
        await queryTurso(`UPDATE siswa SET status_siswa = 'Aktif' WHERE nisn = ${escapeSqlStr(nisn)}`, [], true);
        muatSiswaMutasiKeluar(); muatSiswaTab1();
    } catch (err) { alert("Gagal: " + err.message); }
}
