/* ==========================================================================
   SMAN 2 KARANGANYAR - MANAJEMEN SIKLUS SISWA, GURU & TAHUN AJARAN
   ========================================================================== */

let currentUserSession = null;
const PORTAL_SSO_URL = "index.html";
let tahunAjaranAktif = "2026/2027";
let jumlahKelasXiiAktif = 0;

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
    await pastikanKolomTabelSiswa();
    await muatTahunAjaranAktif();
    await Promise.all([
        muatOpsiKelasDropdown(),
        muatSiswaTab1(),
        muatSiswaKelasXII(),
        muatSiswaTab3(),
        muatDataGuruTab4(),
        muatSiswaMutasiKeluar()
    ]);
};

// ============================================================================
// AUTO-MIGRASI SKEMA DATABASE (PENGATURAN SISTEM & KOLOM TABEL SISWA)
// ============================================================================
async function pastikanTabelPengaturanSistem() {
    try {
        await queryTurso("CREATE TABLE IF NOT EXISTS pengaturan_sistem (kunci TEXT PRIMARY KEY, nilai TEXT NOT NULL)", []);
        await queryTurso("INSERT INTO pengaturan_sistem (kunci, nilai) VALUES ('tahun_ajaran', '2026/2027') ON CONFLICT (kunci) DO NOTHING", []);
    } catch (_) {}
}

async function pastikanKolomTabelSiswa() {
    try {
        await queryTurso("ALTER TABLE siswa ADD COLUMN status_siswa TEXT DEFAULT 'Aktif'", []);
    } catch (_) {}
    try {
        await queryTurso("ALTER TABLE siswa ADD COLUMN status_presensi TEXT DEFAULT 'Normal'", []);
    } catch (_) {}
}

// ============================================================================
// PENGELOLAAN TAHUN AJARAN DINAMIS (2026/2027 -> 2027/2028)
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
        const rows = await queryTurso("SELECT nilai FROM pengaturan_sistem WHERE kunci = 'tahun_ajaran' LIMIT 1", []);
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
        `INSERT INTO pengaturan_sistem (kunci, nilai)
         VALUES ('tahun_ajaran', ?)
         ON CONFLICT (kunci) DO UPDATE SET nilai = excluded.nilai`,
        [taBaru]
    );
    tahunAjaranAktif = taBaru;
    renderTahunAjaranUI();
}

async function naikkanTahunAjaranBerikutnya() {
    const nextTa = hitungTahunAjaranBerikutnya(tahunAjaranAktif);
    if (jumlahKelasXiiAktif > 0) {
        const lanjut = confirm(
            `Perhatian: Masih terdapat ${jumlahKelasXiiAktif} siswa Kelas XII yang berstatus Aktif (belum diluluskan).\n\nTetap naikkan Tahun Pelajaran dari ${tahunAjaranAktif} ke ${nextTa}?`
        );
        if (!lanjut) return;
    } else {
        if (!confirm(`Naikkan Tahun Pelajaran aktif dari ${tahunAjaranAktif} menjadi ${nextTa}?`)) return;
    }

    try {
        await simpanTahunAjaranKeDb(nextTa);
        alert(`Tahun Pelajaran berhasil diperbarui menjadi ${nextTa}!`);
    } catch (err) {
        alert("Gagal memperbarui tahun pelajaran: " + err.message);
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
        alert("Format Tahun Pelajaran tidak valid. Gunakan format YYYY/YYYY (contoh: 2026/2027).");
        return;
    }
    try {
        await simpanTahunAjaranKeDb(val);
        tutupModalEditTahunAjaran();
        alert(`Tahun Pelajaran aktif berhasil diatur ke ${val}.`);
    } catch (err) {
        alert("Gagal menyimpan tahun pelajaran: " + err.message);
    }
}

async function cekDanTawarkanPergeseranTahunAjaran() {
    try {
        const siswaXiiAktif = await queryTurso(
            "SELECT nisn FROM siswa WHERE (kelas LIKE '%XII%' OR kelas LIKE '%12%') AND (status_siswa = 'Aktif' OR status_siswa IS NULL)",
            []
        );
        jumlahKelasXiiAktif = (siswaXiiAktif || []).length;
        updateBannerStatusSiklus();

        if (jumlahKelasXiiAktif === 0) {
            const nextTa = hitungTahunAjaranBerikutnya(tahunAjaranAktif);
            if (confirm(`Seluruh siswa Kelas XII telah diluluskan dan proses kenaikan kelas selesai.\n\nApakah Anda ingin menggeser Tahun Pelajaran aktif dari ${tahunAjaranAktif} ke ${nextTa} sekarang?`)) {
                await simpanTahunAjaranKeDb(nextTa);
                alert(`Tahun Pelajaran resmi berganti menjadi ${nextTa}!`);
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
        teks.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-amber-600 mr-1.5"></i>Masih ada <b>${jumlahKelasXiiAktif} siswa Kelas XII</b> berstatus Aktif di TA <b>${tahunAjaranAktif}</b>. Luluskan Kelas XII terlebih dahulu sebelum menaikkan kelas & pindah ke TA <b>${nextTa}</b>.`;
    } else {
        banner.className = "bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-between gap-2";
        teks.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-600 mr-1.5"></i>Seluruh siswa Kelas XII TA <b>${tahunAjaranAktif}</b> sudah diproses lulus. Kenaikan kelas siap dijalankan untuk beralih ke TA <b>${nextTa}</b>.`;
    }
}

// ============================================================================
// NAVIGASI & HELPER
// ============================================================================
function setTombolBackDinamis() {
    const labelBtn = document.getElementById('label-btn-back');
    const r = String(currentUserSession?.role || '').toLowerCase();
    if (labelBtn) {
        labelBtn.textContent = (r.includes('superadmin') || r.includes('super_admin'))
            ? 'Kembali ke Super Admin'
            : 'Kembali ke Admin';
    }
}

function kembaliKePanelUtama() {
    const r = String(currentUserSession?.role || '').toLowerCase();
    if (r.includes('superadmin') || r.includes('super_admin')) {
        window.location.href = 'super-admin.html';
    } else {
        window.location.href = 'admin.html';
    }
}

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
        tab.classList.remove('block');
    });

    const selectedTab = document.getElementById(tabId);
    if (selectedTab) {
        selectedTab.classList.remove('hidden');
        selectedTab.classList.add('block');
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.className = "tab-btn px-3.5 py-2.5 rounded-lg text-slate-600 hover:bg-slate-100 transition flex items-center space-x-2 cursor-pointer";
    });

    const activeBtn = document.getElementById('btn-' + tabId);
    if (activeBtn) {
        activeBtn.className = "tab-btn px-3.5 py-2.5 rounded-lg bg-blue-900 text-white transition flex items-center space-x-2 cursor-pointer";
    }
}

function cleanKelasFormat(str) {
    return String(str || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function getAuthHeaders() {
    const token = currentUserSession?.token || localStorage.getItem('smada_token') || '';
    return {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
}

async function muatOpsiKelasDropdown() {
    try {
        const data = await queryTurso("SELECT DISTINCT kelas FROM siswa ORDER BY kelas ASC", []);
        const uniqueKelas = [...new Set((data || []).map(item => cleanKelasFormat(item.kelas)).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));

        const selectTab1 = document.getElementById('filter-kelas-tab1');
        if (selectTab1) {
            selectTab1.innerHTML = '<option value="semua">Semua Kelas</option>' +
                uniqueKelas.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('');
        }

        const selectNaikAsal = document.getElementById('naik-kelas-asal');
        if (selectNaikAsal) {
            selectNaikAsal.innerHTML = '<option value="">Pilih Kelas Asal...</option>' +
                uniqueKelas.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('');
        }
    } catch (err) {
        console.error("Gagal muat opsi kelas:", err);
    }
}

// ============================================================================
// TAB 1: PENJURUSAN & KENAIKAN KELAS
// ============================================================================
async function prosesExcelPenjurusan() {
    const fileInput = document.getElementById('input-excel-penjurusan');
    const btn = document.getElementById('btn-proses-penjurusan');

    if (!fileInput.files.length) { alert("Pilih file Excel (.xlsx) terlebih dahulu!"); return; }

    const file = fileInput.files[0];
    const reader = new FileReader();

    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Memproses Data...</span>`;

    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            if (!jsonData.length) { alert("File Excel kosong!"); return; }

            let updatedCount = 0;
            for (const item of jsonData) {
                const nisn = String(item.nisn || '').trim();
                const kelasBaru = cleanKelasFormat(item.kelas_baru || item.kelas);

                if (nisn && kelasBaru) {
                    await queryTurso("UPDATE siswa SET kelas = ?, status_siswa = 'Aktif' WHERE nisn = ?", [kelasBaru, nisn]);
                    updatedCount++;
                }
            }

            alert(`Berhasil memproses penjurusan / kenaikan kelas untuk ${updatedCount} siswa!`);
            fileInput.value = '';
            await muatOpsiKelasDropdown();
            await muatSiswaTab1();
            await cekDanTawarkanPergeseranTahunAjaran();
        } catch (err) {
            alert("Error Excel: " + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-rotate"></i><span>Proses Penjurusan & Kenaikan Kelas</span>`;
        }
    };
    reader.readAsArrayBuffer(file);
}

async function prosesKenaikanRombelMasal() {
    const kelasAsal = cleanKelasFormat(document.getElementById('naik-kelas-asal').value);
    const kelasTujuan = cleanKelasFormat(document.getElementById('naik-kelas-tujuan').value);

    if (!kelasAsal || !kelasTujuan) { alert("Kelas Asal dan Kelas Tujuan Baru wajib diisi!"); return; }
    if (!confirm(`Pindahkan seluruh siswa aktif kelas "${kelasAsal}" ke kelas baru "${kelasTujuan}"?`)) return;

    try {
        await queryTurso(
            "UPDATE siswa SET kelas = ? WHERE UPPER(TRIM(kelas)) = ? AND (status_siswa != 'Lulus' OR status_siswa IS NULL)",
            [kelasTujuan, kelasAsal]
        );
        alert(`Seluruh siswa kelas ${kelasAsal} berhasil dipindahkan ke ${kelasTujuan}!`);
        document.getElementById('naik-kelas-tujuan').value = '';
        await muatOpsiKelasDropdown();
        await muatSiswaTab1();
        await cekDanTawarkanPergeseranTahunAjaran();
    } catch (err) {
        alert("Gagal memindahkan: " + err.message);
    }
}

async function muatSiswaTab1() {
    const tbody = document.getElementById('tabel-tab1-body');
    const kelasVal = document.getElementById('filter-kelas-tab1').value;
    const searchVal = document.getElementById('search-tab1').value.toLowerCase().trim();

    tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Memuat data...</td></tr>';

    try {
        let sql = "SELECT * FROM siswa WHERE (status_siswa != 'Lulus' OR status_siswa IS NULL) ORDER BY kelas ASC, nama ASC";
        let params = [];
        if (kelasVal !== 'semua') {
            sql = "SELECT * FROM siswa WHERE (status_siswa != 'Lulus' OR status_siswa IS NULL) AND UPPER(TRIM(kelas)) = ? ORDER BY nama ASC";
            params = [kelasVal];
        }

        const data = await queryTurso(sql, params);
        let filtered = Array.isArray(data) ? data : [];
        if (searchVal) {
            filtered = filtered.filter(s =>
                (s.nisn && String(s.nisn).toLowerCase().includes(searchVal)) ||
                (s.nama && String(s.nama).toLowerCase().includes(searchVal))
            );
        }

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Tidak ada data siswa ditemukan.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(s => `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="p-3 font-mono font-medium">${escapeHtml(s.nisn)}</td>
                <td class="p-3 font-semibold text-slate-800">${escapeHtml(s.nama)}</td>
                <td class="p-3 text-slate-600 font-mono font-bold">${escapeHtml(s.kelas)}</td>
                <td class="p-3">
                    <input type="text" id="edit-kelas-${escapeHtml(s.nisn)}" value="${escapeHtml(s.kelas)}" class="border px-2 py-1 rounded text-xs w-28 font-mono font-bold">
                    <button onclick="simpanUbahKelasIndividu('${escapeHtml(s.nisn)}')" class="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-[11px] ml-1 cursor-pointer">Simpan</button>
                </td>
                <td class="p-3 text-center">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold ${s.status_siswa === 'Tinggal Kelas' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}">
                        ${escapeHtml(s.status_siswa || 'Aktif')}
                    </span>
                </td>
                <td class="p-3 text-center">
                    <button onclick="toggleTinggalKelas('${escapeHtml(s.nisn)}', '${escapeHtml(s.status_siswa || 'Aktif')}')" class="bg-amber-100 hover:bg-amber-200 text-amber-800 px-2 py-1 rounded text-[11px] transition cursor-pointer">
                        ${s.status_siswa === 'Tinggal Kelas' ? 'Set Aktif Kembali' : 'Set Tinggal Kelas'}
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
}

async function simpanUbahKelasIndividu(nisn) {
    const kelasBaru = cleanKelasFormat(document.getElementById(`edit-kelas-${nisn}`).value);
    if (!kelasBaru) return;
    try {
        await queryTurso("UPDATE siswa SET kelas = ? WHERE nisn = ?", [kelasBaru, nisn]);
        alert("Kelas siswa berhasil diperbarui!");
        muatSiswaTab1();
    } catch (err) {
        alert("Gagal update kelas: " + err.message);
    }
}

async function toggleTinggalKelas(nisn, currentStatus) {
    const nextStatus = currentStatus === 'Tinggal Kelas' ? 'Aktif' : 'Tinggal Kelas';
    try {
        await queryTurso("UPDATE siswa SET status_siswa = ? WHERE nisn = ?", [nextStatus, nisn]);
        muatSiswaTab1();
    } catch (err) {
        alert("Gagal memperbarui status: " + err.message);
    }
}

// ============================================================================
// TAB 2: KELULUSAN (KELAS XII)
// ============================================================================
async function muatSiswaKelasXII() {
    const tbody = document.getElementById('tabel-lulus-body');
    try {
        const data = await queryTurso("SELECT * FROM siswa WHERE kelas LIKE '%XII%' OR kelas LIKE '%12%' ORDER BY kelas ASC, nama ASC", []);
        const rows = Array.isArray(data) ? data : [];

        jumlahKelasXiiAktif = rows.filter(s => (s.status_siswa || 'Aktif') === 'Aktif').length;
        updateBannerStatusSiklus();

        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Tidak ada data siswa Kelas XII.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(s => `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="p-3 text-center"><input type="checkbox" class="check-lulus-item" value="${escapeHtml(s.nisn)}"></td>
                <td class="p-3 font-mono font-medium">${escapeHtml(s.nisn)}</td>
                <td class="p-3 font-semibold text-slate-800">${escapeHtml(s.nama)}</td>
                <td class="p-3 font-mono font-bold">${escapeHtml(s.kelas)}</td>
                <td class="p-3 text-center">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold ${s.status_siswa === 'Lulus' ? 'bg-emerald-100 text-emerald-800' : (s.status_siswa === 'Tinggal Kelas' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800')}">
                        ${s.status_siswa === 'Lulus' ? 'Lulus (Alumni)' : (s.status_siswa === 'Tinggal Kelas' ? 'Tidak Lulus' : 'Aktif XII')}
                    </span>
                </td>
                <td class="p-3 text-center space-x-1">
                    <button onclick="setLulusIndividu('${escapeHtml(s.nisn)}', '${escapeHtml(s.status_siswa || '')}')" class="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-2.5 py-1 rounded text-xs transition font-bold cursor-pointer">
                        ${s.status_siswa === 'Lulus' ? 'Batal Lulus' : 'Set Lulus'}
                    </button>
                    <button onclick="setTidakLulusIndividu('${escapeHtml(s.nisn)}', '${escapeHtml(s.status_siswa || '')}')" class="bg-amber-100 hover:bg-amber-200 text-amber-800 px-2.5 py-1 rounded text-xs transition cursor-pointer">
                        ${s.status_siswa === 'Tinggal Kelas' ? 'Set Aktif Kembali' : 'Set Tidak Lulus'}
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
}

function toggleCheckAllLulus(master) {
    document.querySelectorAll('.check-lulus-item').forEach(c => c.checked = master.checked);
}

async function luluskanMasalSelected() {
    const checkedBoxes = document.querySelectorAll('.check-lulus-item:checked');
    if (!checkedBoxes.length) { alert("Pilih / centang siswa yang akan diluluskan!"); return; }

    const nisnList = Array.from(checkedBoxes).map(c => c.value);
    if (!confirm(`Luluskan ${nisnList.length} siswa terpilih untuk Tahun Pelajaran ${tahunAjaranAktif}?`)) return;

    try {
        for (const nisn of nisnList) {
            await queryTurso("UPDATE siswa SET status_siswa = 'Lulus' WHERE nisn = ?", [nisn]);
        }
        alert(`Berhasil meluluskan ${nisnList.length} siswa! Silakan lanjutkan ke Tab 1 (Penjurusan & Kenaikan Kelas) untuk memproses kenaikan kelas.`);
        await muatSiswaKelasXII();
        await muatSiswaTab1();
    } catch (err) {
        alert("Gagal meluluskan masal: " + err.message);
    }
}

async function setLulusIndividu(nisn, currentStatus) {
    const nextStatus = currentStatus === 'Lulus' ? 'Aktif' : 'Lulus';
    await queryTurso("UPDATE siswa SET status_siswa = ? WHERE nisn = ?", [nextStatus, nisn]);
    await muatSiswaKelasXII();
    await muatSiswaTab1();
}

async function setTidakLulusIndividu(nisn, currentStatus) {
    const nextStatus = currentStatus === 'Tinggal Kelas' ? 'Aktif' : 'Tinggal Kelas';
    await queryTurso("UPDATE siswa SET status_siswa = ? WHERE nisn = ?", [nextStatus, nisn]);
    await muatSiswaKelasXII();
    await muatSiswaTab1();
}

// ============================================================================
// TAB 3: KELOLA DATA SISWA
// ============================================================================
async function simpanSiswaManual() {
    const nisn = document.getElementById('manual-siswa-nisn').value.trim();
    const nama = document.getElementById('manual-siswa-nama').value.trim();
    const kelas = cleanKelasFormat(document.getElementById('manual-siswa-kelas').value);

    if (!nisn || !nama || !kelas) { alert("NISN, Nama, dan Kelas wajib diisi!"); return; }

    try {
        await queryTurso(
            "INSERT INTO siswa (nisn, nama, kelas, password, status_siswa) VALUES (?, ?, ?, ?, 'Aktif') ON CONFLICT(nisn) DO UPDATE SET nama=excluded.nama, kelas=excluded.kelas",
            [nisn, nama, kelas, 'yhan123']
        );

        await fetch('https://smada-api-gateway.yhanedy.workers.dev/api/admin/reset-password', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ nisn: nisn, defaultPassword: 'yhan123' })
        }).catch(() => {});

        alert(`Siswa ${nama} berhasil disimpan!`);
        document.getElementById('manual-siswa-nisn').value = '';
        document.getElementById('manual-siswa-nama').value = '';
        document.getElementById('manual-siswa-kelas').value = '';
        muatSiswaTab3();
        muatOpsiKelasDropdown();
    } catch (err) {
        alert("Gagal menyimpan: " + err.message);
    }
}

async function prosesImportSiswaBaru() {
    const fileInput = document.getElementById('excel-siswa-baru');
    if (!fileInput.files.length) { alert("Silakan pilih file Excel terlebih dahulu!"); return; }

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            let imported = 0;
            for (const item of jsonData) {
                const nisn = String(item.nisn || '').trim();
                const nama = String(item.nama || '').trim();
                const kelas = cleanKelasFormat(item.kelas);

                if (nisn && nama) {
                    await queryTurso(
                        "INSERT INTO siswa (nisn, nama, kelas, password, status_siswa) VALUES (?, ?, ?, ?, 'Aktif') ON CONFLICT(nisn) DO UPDATE SET nama=excluded.nama, kelas=excluded.kelas",
                        [nisn, nama, kelas, 'yhan123']
                    );

                    await fetch('https://smada-api-gateway.yhanedy.workers.dev/api/admin/reset-password', {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ nisn: nisn, defaultPassword: 'yhan123' })
                    }).catch(() => {});

                    imported++;
                }
            }

            alert(`Berhasil mengimpor ${imported} data siswa!`);
            fileInput.value = '';
            muatSiswaTab3();
            muatOpsiKelasDropdown();
        } catch (err) {
            alert("Error Excel: " + err.message);
        }
    };
    reader.readAsArrayBuffer(fileInput.files[0]);
}

async function muatSiswaTab3() {
    const tbody = document.getElementById('tabel-tab3-body');
    const searchVal = document.getElementById('search-tab3').value.toLowerCase().trim();

    tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Memuat data siswa...</td></tr>';

    try {
        const data = await queryTurso("SELECT * FROM siswa ORDER BY kelas ASC, nama ASC LIMIT 300", []);
        let filtered = Array.isArray(data) ? data : [];
        if (searchVal) {
            filtered = filtered.filter(s =>
                (s.nisn && String(s.nisn).toLowerCase().includes(searchVal)) ||
                (s.nama && String(s.nama).toLowerCase().includes(searchVal)) ||
                (s.kelas && String(s.kelas).toLowerCase().includes(searchVal))
            );
        }

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Tidak ada data siswa.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(s => `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="p-3 font-mono font-medium">${escapeHtml(s.nisn)}</td>
                <td class="p-3 font-semibold text-slate-800">${escapeHtml(s.nama)}</td>
                <td class="p-3 font-mono font-bold">${escapeHtml(s.kelas)}</td>
                <td class="p-3 text-center">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold ${s.status_siswa === 'Lulus' ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-800'}">
                        ${escapeHtml(s.status_siswa || 'Aktif')}
                    </span>
                </td>
                <td class="p-3 text-center">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold ${s.status_presensi === 'Bebas Presensi' ? 'bg-purple-100 text-purple-800 border border-purple-300' : 'bg-blue-50 text-blue-800'}">
                        ${s.status_presensi === 'Bebas Presensi' ? 'Bebas Presensi' : 'Wajib Presensi GPS'}
                    </span>
                </td>
                <td class="p-3 text-center">
                    <button onclick="toggleStatusBebasPresensi('${escapeHtml(s.nisn)}', '${escapeHtml(s.status_presensi || '')}')" class="bg-purple-100 hover:bg-purple-200 text-purple-800 px-2.5 py-1 rounded text-[11px] font-bold border border-purple-200 transition cursor-pointer">
                        ${s.status_presensi === 'Bebas Presensi' ? 'Set Wajib Presensi' : 'Set Bebas Presensi / Disabilitas'}
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
}

async function toggleStatusBebasPresensi(nisn, currentStatus) {
    const nextStatus = currentStatus === 'Bebas Presensi' ? 'Normal' : 'Bebas Presensi';
    try {
        await queryTurso("UPDATE siswa SET status_presensi = ? WHERE nisn = ?", [nextStatus, nisn]);
        muatSiswaTab3();
    } catch (err) {
        alert("Gagal mengubah status: " + err.message);
    }
}

// ============================================================================
// TAB 4: KELOLA DATA GURU
// ============================================================================
async function simpanGuruManual(btnEl) {
    const card = (btnEl && btnEl.closest('.bg-white')) || document.getElementById('tab4') || document;
    const allInputs = Array.from(card.querySelectorAll('input'));

    // Cari input Username/NIP (bukan password, bukan checkbox, bukan file)
    const elUser = document.getElementById('manual-guru-user')
        || allInputs.find(inp => inp.type === 'text' && (inp.id.includes('user') || inp.id.includes('nip') || inp.placeholder.toLowerCase().includes('nip') || inp.placeholder.toLowerCase().includes('user')))
        || allInputs.find(inp => inp.type === 'text');

    // Cari input Nama Guru
    const elNama = document.getElementById('manual-guru-nama')
        || allInputs.find(inp => inp.type === 'text' && inp !== elUser);

    // Cari input Password
    const elPass = document.getElementById('manual-guru-pass')
        || allInputs.find(inp => inp.type === 'password');

    const user = String(elUser ? elUser.value : '').trim();
    const nama = String(elNama ? elNama.value : '').trim();
    const pass = String(elPass ? elPass.value : '').trim() || 'guru123';

    const roleChecked = Array.from(
        card.querySelectorAll('input[type="checkbox"]:checked')
    ).map(cb => String(cb.value || '').trim().toLowerCase()).filter(Boolean);

    if (!user) {
        alert("Username / NIP wajib diisi! (Input terbaca kosong)");
        return;
    }
    if (!nama) {
        alert("Nama Lengkap Guru wajib diisi!");
        return;
    }
    if (roleChecked.length === 0) {
        alert("Pilih minimal 1 Peran / Hak Akses untuk Guru!");
        return;
    }

    const roleString = roleChecked.join(',');

    try {
        const existing = await queryTurso(
            "SELECT username FROM users WHERE LOWER(TRIM(username)) = LOWER(?) LIMIT 1",
            [user]
        );

        if (existing && existing.length > 0) {
            await queryTurso(
                "UPDATE users SET nama = ?, password_hash = ?, role = ? WHERE LOWER(TRIM(username)) = LOWER(?)",
                [nama, pass, roleString, user]
            );
        } else {
            await queryTurso(
                "INSERT INTO users (username, nama, password_hash, role) VALUES (?, ?, ?, ?)",
                [user, nama, pass, roleString]
            );
        }

        alert(`Guru "${nama}" (${user}) berhasil disimpan dengan role: ${roleString}`);
        if (elUser) elUser.value = '';
        if (elNama) elNama.value = '';
        if (elPass) elPass.value = '';
        card.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        muatDataGuruTab4();
    } catch (err) {
        alert("Gagal menyimpan guru: " + err.message);
    }
}
async function prosesImportGuruExcel() {
    const fileInput = document.getElementById('excel-guru-file');
    if (!fileInput.files.length) { alert("Pilih file Excel guru terlebih dahulu!"); return; }

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            let imported = 0;
            for (const item of jsonData) {
                const username = String(item.username || item.nip || '').trim();
                const nama = String(item.nama || '').trim();
                const pass = String(item.password || 'guru123').trim();
                const role = String(item.role || 'mapel').trim().toLowerCase();

                if (username && nama) {
                    await queryTurso(
                        "INSERT INTO users (username, nama, password_hash, role) VALUES (?, ?, ?, ?) ON CONFLICT(username) DO UPDATE SET nama=excluded.nama, role=excluded.role",
                        [username, nama, pass, role]
                    );
                    imported++;
                }
            }

            alert(`Berhasil mengimpor ${imported} akun guru!`);
            fileInput.value = '';
            muatDataGuruTab4();
        } catch (err) {
            alert("Error Excel Guru: " + err.message);
        }
    };
    reader.readAsArrayBuffer(fileInput.files[0]);
}

async function muatDataGuruTab4() {
    const tbody = document.getElementById('tabel-tab4-body');
    tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Memuat data guru...</td></tr>';

    try {
        const data = await queryTurso("SELECT * FROM users ORDER BY nama ASC", []);
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Tidak ada data akun guru.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(g => {
            const rolesList = (g.role || '').split(',').map(r => r.trim().toLowerCase()).filter(Boolean);
            const badgesHtml = rolesList.map(r => {
                if (r === 'mapel') return `<span class="bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded text-[10px] font-bold">MAPEL</span>`;
                if (r === 'piket') return `<span class="bg-blue-100 text-blue-800 border border-blue-300 px-1.5 py-0.5 rounded text-[10px] font-bold">PIKET</span>`;
                if (r === 'bk' || r === 'stp2k') return `<span class="bg-purple-100 text-purple-800 border border-purple-300 px-1.5 py-0.5 rounded text-[10px] font-bold">BK</span>`;
                if (r === 'admin' || r === 'superadmin' || r === 'super_admin') return `<span class="bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded text-[10px] font-bold">ADMIN</span>`;
                return `<span class="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px] font-bold">${escapeHtml(r.toUpperCase())}</span>`;
            }).join(' ');

            return `
                <tr class="hover:bg-slate-50 border-b border-slate-100">
                    <td class="p-3 font-mono font-medium">${escapeHtml(g.username)}</td>
                    <td class="p-3 font-bold text-slate-800">${escapeHtml(g.nama)}</td>
                    <td class="p-3 text-center space-x-1">${badgesHtml || '-'}</td>
                    <td class="p-3 text-center">
                        <button onclick="bukaModalEditRole('${escapeHtml(g.username)}', '${escapeHtml(g.nama)}', '${escapeHtml(g.role || '')}')" class="bg-indigo-100 hover:bg-indigo-200 text-indigo-800 px-2.5 py-1 rounded text-xs font-bold border border-indigo-300 transition cursor-pointer">
                            <i class="fa-solid fa-user-pen"></i> Edit Role
                        </button>
                    </td>
                    <td class="p-3 text-center">
                        <button onclick="resetPasswordGuru('${escapeHtml(g.username)}', '${escapeHtml(g.nama)}')" class="bg-amber-100 hover:bg-amber-200 text-amber-800 px-2.5 py-1 rounded text-xs font-bold border border-amber-300 transition cursor-pointer">
                            <i class="fa-solid fa-key"></i> Reset Pass
                        </button>
                    </td>
                    <td class="p-3 text-center">
                        <button onclick="hapusGuru('${escapeHtml(g.username)}', '${escapeHtml(g.nama)}')" class="bg-red-100 hover:bg-red-200 text-red-700 px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer">
                            <i class="fa-solid fa-trash"></i> Hapus
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
}

function bukaModalEditRole(username, nama, currentRoles) {
    document.getElementById('edit-role-guru-user').value = username;
    document.getElementById('edit-role-guru-nama').textContent = `${nama} (${username})`;
    const rolesArr = currentRoles.split(',').map(r => r.trim().toLowerCase());
    document.querySelectorAll('.cb-edit-role-item').forEach(cb => {
        cb.checked = rolesArr.includes(cb.value);
    });
    document.getElementById('modal-edit-role-guru').classList.remove('hidden');
}

function tutupModalEditRole() {
    document.getElementById('modal-edit-role-guru').classList.add('hidden');
}

async function simpanEditRoleGuru() {
    const username = document.getElementById('edit-role-guru-user').value;
    const checkedRoles = Array.from(document.querySelectorAll('.cb-edit-role-item:checked')).map(cb => cb.value);
    if (checkedRoles.length === 0) {
        alert("Pilih minimal 1 Peran (Role)!");
        return;
    }
    const newRoleString = checkedRoles.join(',');
    try {
        await queryTurso("UPDATE users SET role = ? WHERE username = ?", [newRoleString, username]);
        alert("Role guru berhasil diperbarui menjadi: " + newRoleString);
        tutupModalEditRole();
        muatDataGuruTab4();
    } catch (err) {
        alert("Gagal update role: " + err.message);
    }
}

async function resetPasswordGuru(username, nama) {
    if (!confirm(`Reset password guru "${nama}" kembali ke "guru123"?`)) return;
    try {
        await queryTurso("UPDATE users SET password_hash = 'guru123' WHERE username = ?", [username]);
        alert(`Password untuk "${nama}" berhasil direset ke "guru123".`);
    } catch (err) {
        alert("Gagal reset: " + err.message);
    }
}

async function hapusGuru(username, nama) {
    if (!confirm(`Hapus akun guru "${nama}" (${username})?`)) return;
    try {
        await queryTurso("DELETE FROM users WHERE username = ?", [username]);
        alert(`Akun "${nama}" dihapus.`);
        muatDataGuruTab4();
    } catch (err) {
        alert("Gagal hapus: " + err.message);
    }
}

// ============================================================================
// TAB 5: MUTASI SISWA
// ============================================================================
async function simpanMutasiMasuk() {
    const nisn = document.getElementById('mutasi-masuk-nisn').value.trim();
    const nama = document.getElementById('mutasi-masuk-nama').value.trim();
    const kelas = cleanKelasFormat(document.getElementById('mutasi-masuk-kelas').value);

    if (!nisn || !nama || !kelas) { alert("Semua kolom wajib diisi!"); return; }

    try {
        await queryTurso(
            "INSERT INTO siswa (nisn, nama, kelas, password, status_siswa) VALUES (?, ?, ?, ?, 'Aktif') ON CONFLICT(nisn) DO UPDATE SET nama=excluded.nama, kelas=excluded.kelas, status_siswa='Aktif'",
            [nisn, nama, kelas, 'yhan123']
        );

        await fetch('https://smada-api-gateway.yhanedy.workers.dev/api/admin/reset-password', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ nisn: nisn, defaultPassword: 'yhan123' })
        }).catch(() => {});

        alert(`Siswa mutasi masuk "${nama}" berhasil ditambahkan!`);
        document.getElementById('mutasi-masuk-nisn').value = '';
        document.getElementById('mutasi-masuk-nama').value = '';
        document.getElementById('mutasi-masuk-kelas').value = '';
        muatOpsiKelasDropdown();
        muatSiswaTab1();
    } catch (err) {
        alert("Gagal menambah mutasi masuk: " + err.message);
    }
}

async function muatSiswaMutasiKeluar() {
    const tbody = document.getElementById('tabel-mutasi-keluar-body');
    try {
        const data = await queryTurso("SELECT * FROM siswa WHERE status_siswa = 'Mutasi Keluar' ORDER BY nama ASC", []);
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-400">Tidak ada data siswa mutasi keluar.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(s => `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="p-2.5 font-mono">${escapeHtml(s.nisn)}</td>
                <td class="p-2.5 font-semibold text-slate-800">${escapeHtml(s.nama)}</td>
                <td class="p-2.5 font-mono font-bold">${escapeHtml(s.kelas)}</td>
                <td class="p-2.5 text-center"><span class="bg-red-100 text-red-800 px-2 py-0.5 rounded text-[10px] font-bold">Mutasi Keluar</span></td>
                <td class="p-2.5 text-center">
                    <button onclick="aktifkanSiswaKembali('${escapeHtml(s.nisn)}')" class="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-2 py-1 rounded text-[11px] cursor-pointer">Aktifkan Kembali</button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-500">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
}

async function aktifkanSiswaKembali(nisn) {
    try {
        await queryTurso("UPDATE siswa SET status_siswa = 'Aktif' WHERE nisn = ?", [nisn]);
        muatSiswaMutasiKeluar();
        muatSiswaTab1();
    } catch (err) {
        alert("Gagal mengaktifkan kembali: " + err.message);
    }
}
