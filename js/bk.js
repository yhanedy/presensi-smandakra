/* ==========================================================================
   SMAN 2 KARANGANYAR - PORTAL BK & STP2K (FIXED VERSION)
   ========================================================================== */
let daftarSiswaBK = [];
let daftarKelasBK = [];
let siswaMapByNisn = {};
let semuaPelanggaranBK = [];
let skemaKedisiplinanCache = null;
let halamanPelanggaran = 1;
const PER_HALAMAN_PELANGGARAN = 15;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Tampilkan nama user
    try {
        const rawUser = localStorage.getItem('smada_user');
        if (rawUser) {
            const user = JSON.parse(rawUser);
            const elUser = document.getElementById('display-user-name');
            if (elUser) elUser.textContent = user.nama || user.username || 'Guru BK';
        }
    } catch (_) {}

    // 2. Set tanggal hari ini
    const elTgl = document.getElementById('pelanggaran-tanggal');
    if (elTgl && !elTgl.value) {
        elTgl.value = getTanggalHariIniWIB();
    }

    // 3. Muat data awal
    await muatDaftarKelasDanSiswaBK();
    await muatDataPelanggaranDariDB();
});

function getTanggalHariIniWIB() {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

function getWaktuSekarangWIB() {
    return new Date().toLocaleTimeString('id-ID', {
        timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).replace(/\./g, ':');
}

function escapeHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Murni menggunakan queryTurso untuk skema
async function getKolomKedisiplinan() {
    if (Array.isArray(skemaKedisiplinanCache) && skemaKedisiplinanCache.length > 0) return skemaKedisiplinanCache;
    try {
        const infoCols = await queryTurso("PRAGMA table_info(kedisiplinan)");
        const cols = (infoCols || []).map(c => String(c.name || '').toLowerCase()).filter(Boolean);
        if (cols.length > 0) skemaKedisiplinanCache = cols;
        return cols;
    } catch (e) {
        console.warn("Gagal baca skema kedisiplinan:", e.message);
        return [];
    }
}

async function muatDaftarKelasDanSiswaBK() {
    try {
        // Gunakan forcePrimary agar jika Supabase kosong, Worker otomatis mengambil dari Turso
        const rows = await queryTurso("SELECT nisn, nama, kelas FROM siswa ORDER BY kelas ASC, nama ASC", [], true);

        daftarSiswaBK = (rows || []).map(r => {
            let rawNisn = String(r.nisn ?? '').trim();
            return {
                nisn: rawNisn,
                nama: String(r.nama ?? '').trim(),
                kelas: String(r.kelas ?? '').trim()
            };
        }).filter(s => s.nisn && s.nama && s.kelas);

        siswaMapByNisn = {};
        daftarSiswaBK.forEach(s => {
            siswaMapByNisn[s.nisn] = s;
            siswaMapByNisn[s.nisn.replace(/^0+/, '')] = s;
        });

        daftarKelasBK = [...new Set(daftarSiswaBK.map(s => s.kelas))].sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));

        // Isi dropdown kelas
        ['pelanggaran-kelas', 'bk-kelas', 'pulang-kelas', 'cari-kelas-siswa'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.innerHTML = id === 'cari-kelas-siswa' ? '<option value="">-- Semua Kelas --</option>' : '<option value="">-- Pilih Kelas --</option>';
            daftarKelasBK.forEach(k => {
                const opt = document.createElement('option');
                opt.value = k;
                opt.textContent = k;
                el.appendChild(opt);
            });
        });
    } catch (err) {
        console.error("Gagal memuat daftar siswa:", err);
    }
}

window.muatSiswaBerdasarkanKelas = function (idSelectKelas, idSelectNisn) {
    const elKelas = document.getElementById(idSelectKelas);
    const elNisn = document.getElementById(idSelectNisn);
    if (!elKelas || !elNisn) return;

    const targetKelas = String(elKelas.value || '').trim().toUpperCase();
    if (!targetKelas) {
        elNisn.innerHTML = '<option value="">-- Pilih Kelas Dahulu --</option>';
        return;
    }

    const siswaKelas = daftarSiswaBK.filter(s => s.kelas.toUpperCase() === targetKelas);
    elNisn.innerHTML = `<option value="">-- Pilih Nama Siswa (${siswaKelas.length}) --</option>`;

    siswaKelas.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.nisn;
        opt.dataset.nisn = s.nisn;
        opt.dataset.nama = s.nama;
        opt.textContent = `${s.nama} (${s.nisn})`;
        elNisn.appendChild(opt);
    });
};

function ambilInfoSiswaDariSelect(elKelas, elNisn) {
    const kelas = String(elKelas ? elKelas.value : '').trim();
    const rawVal = String(elNisn ? elNisn.value : '').trim();
    const opt = (elNisn && elNisn.selectedIndex >= 0) ? elNisn.options[elNisn.selectedIndex] : null;

    let nisn = rawVal || (opt ? String(opt.dataset.nisn || '').trim() : '');
    let nama = opt ? String(opt.dataset.nama || '').trim() : '';

    return { nisn: nisn, nama: nama || '-', kelas: kelas || '-' };
}

// ==========================================================================
// SIMPAN PELANGGARAN (Sudah dibersihkan & disesuaikan dengan Worker)
// ==========================================================================
window.simpanPelanggaranBK = async function () {
    const elKelas = document.getElementById('pelanggaran-kelas');
    const elNisn = document.getElementById('pelanggaran-nisn');
    const elTgl = document.getElementById('pelanggaran-tanggal');
    const elCatatan = document.getElementById('pelanggaran-catatan');

    const kelas = String(elKelas ? elKelas.value : '').trim();
    const tanggal = String(elTgl ? elTgl.value : '').trim() || getTanggalHariIniWIB();
    const catatan = String(elCatatan ? elCatatan.value : '').trim();
    const siswa = ambilInfoSiswaDariSelect(elKelas, elNisn);

    if (!kelas || !siswa.nisn || siswa.nisn === '-' || !catatan) {
        alert("Lengkapi Kelas, Nama Siswa, dan Catatan Pelanggaran!");
        return;
    }

    const userLogin = JSON.parse(localStorage.getItem('smada_user') || '{}');
    const pencatat = userLogin.nama || userLogin.username || 'Guru BK';
    const waktuLengkap = `${getTanggalHariIniWIB()} ${getWaktuSekarangWIB()}`;

    try {
        const cols = await getKolomKedisiplinan();
        if (cols.length === 0) {
            alert("Gagal membaca struktur tabel kedisiplinan.");
            return;
        }

        const payload = {
            tanggal: tanggal,
            waktu_input: waktuLengkap,
            nisn: siswa.nisn,
            nama_siswa: siswa.nama,
            kelas: siswa.kelas,
            catatan_pelanggaran: catatan,
            tindak_lanjut: '-',
            diinput_oleh: pencatat
        };

        // Filter payload hanya untuk kolom yang ada di database
        const validCols = Object.keys(payload).filter(k => cols.includes(k));
        const placeholders = validCols.map(() => '?').join(', ');
        const values = validCols.map(k => payload[k]);

        const sql = `INSERT INTO kedisiplinan (${validCols.join(', ')}) VALUES (${placeholders})`;
        console.log("QUERY INSERT:", sql, values);

        // Gunakan parameterized query yang didukung Worker Anda!
        await queryTurso(sql, values, true);

        alert(`Catatan kedisiplinan untuk ${siswa.nama} berhasil disimpan!`);
        if (elCatatan) elCatatan.value = '';
        halamanPelanggaran = 1;
        await muatDataPelanggaranDariDB(true);
    } catch (err) {
        console.error("Error Insert:", err);
        alert("Gagal menyimpan:\n" + err.message);
    }
};

// (Fungsi muatDataPelanggaranDariDB, renderTabelPelanggaran, dll. biarkan sama seperti aslinya)
// Karena error utamanya sudah diperbaiki, fungsi-fungsi ini akan berjalan normal.
