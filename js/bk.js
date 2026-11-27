/* ==========================================================================
   SMAN 2 KARANGANYAR - PORTAL BIMBINGAN KONSELING & STP2K (js/bk.js)
   - Deteksi Dropdown Siswa Berbasis Kartu/Container (Anti Salah ID)
   - Perbaikan Otomatis Header Responsif Mobile HP
   - Dynamic Schema Insert (Anti Gagal Kolom DB)
   ========================================================================== */

let daftarSiswaBK = [];
let daftarKelasBK = [];
let kolomTabelCache = {};

document.addEventListener('DOMContentLoaded', async () => {
    perbaikiTampilanHeaderMobile();

    const userSession = cekSesiBK();
    if (!userSession) return;

    await inisialisasiPortalBK();
});

// ==========================================================================
// 0. PERBAIKAN TAMPILAN HEADER AGAR TIDAK TERPOTONG DI LAYAR HP
// ==========================================================================
function perbaikiTampilanHeaderMobile() {
    if (document.getElementById('bk-mobile-fix-style')) return;
    const style = document.createElement('style');
    style.id = 'bk-mobile-fix-style';
    style.textContent = `
        @media (max-width: 640px) {
            header, nav, .navbar, .topbar, header > div {
                flex-wrap: wrap !important;
                gap: 8px !important;
                padding-left: 12px !important;
                padding-right: 12px !important;
                overflow-x: hidden !important;
            }
            header h1, header h2, .header-title {
                font-size: 1rem !important;
                line-height: 1.2 !important;
                word-break: break-word !important;
            }
            header button, header a.btn, nav button {
                font-size: 11px !important;
                padding: 6px 10px !important;
                white-space: nowrap !important;
            }
        }
    `;
    document.head.appendChild(style);
}

function cekSesiBK() {
    const rawUser = localStorage.getItem('smada_user');
    const token = localStorage.getItem('smada_token');
    if (!rawUser || !token) {
        window.location.replace('index.html');
        return null;
    }

    try {
        const user = JSON.parse(rawUser);
        const roleStr = String(user.role || '').toLowerCase();
        const isAllowed = roleStr.includes('bk') || roleStr.includes('stp2k') || roleStr.includes('admin') || roleStr.includes('super');
        if (!isAllowed) {
            alert("Anda tidak memiliki hak akses ke Portal BK & STP2K.");
            window.location.replace('index.html');
            return null;
        }
        return user;
    } catch (e) {
        window.location.replace('index.html');
        return null;
    }
}

function getTanggalHariIniWIB() {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

function getWaktuSekarangWIB() {
    return new Date().toLocaleTimeString('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).replace(/\./g, ':');
}

async function getKolomTabel(namaTabel) {
    if (kolomTabelCache[namaTabel]) return kolomTabelCache[namaTabel];
    try {
        const info = await queryTurso(`PRAGMA table_info(${namaTabel})`);
        const cols = (info || []).map(c => String(c.name || '').toLowerCase()).filter(Boolean);
        if (cols.length > 0) kolomTabelCache[namaTabel] = cols;
        return cols;
    } catch (e) {
        console.warn(`Gagal baca skema ${namaTabel}:`, e.message);
        return [];
    }
}

async function insertDinamis(namaTabel, kandidatData) {
    const cols = await getKolomTabel(namaTabel);
    const kolomInsert = [];
    const nilaiInsert = [];

    for (const [key, val] of Object.entries(kandidatData)) {
        if (cols.length === 0 || cols.includes(key.toLowerCase())) {
            kolomInsert.push(key);
            nilaiInsert.push(val);
        }
    }

    if (kolomInsert.length === 0) {
        throw new Error(`Tidak ada kolom yang cocok pada tabel ${namaTabel}.`);
    }

    const placeholders = kolomInsert.map(() => '?').join(', ');
    await queryTurso(
        `INSERT INTO ${namaTabel} (${kolomInsert.join(', ')}) VALUES (${placeholders})`,
        nilaiInsert
    );
}

async function inisialisasiPortalBK() {
    try {
        await pastikanTabelKedisiplinan();
        await muatDaftarKelasDanSiswaBK();
        pasangEventDropdownOtomatis();
        await muatRiwayatPelanggaranHariIni();
    } catch (err) {
        console.error("Gagal inisialisasi Portal BK:", err);
    }
}

async function pastikanTabelKedisiplinan() {
    try {
        await queryTurso(`
            CREATE TABLE IF NOT EXISTS kedisiplinan (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tanggal TEXT NOT NULL,
                nisn TEXT NOT NULL,
                nama_siswa TEXT,
                kelas TEXT,
                jenis_pelanggaran TEXT,
                catatan_pelanggaran TEXT,
                keterangan TEXT,
                poin INTEGER DEFAULT 0,
                dicatat_oleh TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await getKolomTabel('kedisiplinan');
        await getKolomTabel('presensi');
    } catch (e) {
        console.warn("Cek struktur tabel kedisiplinan:", e.message);
    }
}

async function muatDaftarKelasDanSiswaBK() {
    try {
        const cached = sessionStorage.getItem('smada_bk_siswa_cache');
        let rows = cached ? JSON.parse(cached) : null;

        if (!Array.isArray(rows) || rows.length === 0) {
            rows = await queryTurso("SELECT nisn, nama, kelas FROM siswa ORDER BY kelas ASC, nama ASC");
            if (Array.isArray(rows) && rows.length > 0) {
                sessionStorage.setItem('smada_bk_siswa_cache', JSON.stringify(rows));
            }
        }

        daftarSiswaBK = (rows || [])
            .filter(r => !r.status_siswa || String(r.status_siswa).toUpperCase() === 'AKTIF')
            .map(r => ({
                nisn: String(r.nisn || '').trim(),
                nama: String(r.nama || '').trim(),
                kelas: String(r.kelas || '').trim()
            }))
            .filter(s => s.nisn && s.nama && s.kelas);

        daftarKelasBK = [...new Set(daftarSiswaBK.map(s => s.kelas))].sort((a, b) =>
            a.localeCompare(b, 'id', { numeric: true })
        );

        // Isi semua <select> yang merupakan dropdown kelas (baik dari ID maupun teks option pertamanya)
        document.querySelectorAll('select').forEach(el => {
            const firstOptText = (el.options[0]?.textContent || '').toLowerCase();
            const isKelasSelect = el.id.toLowerCase().includes('kelas') || firstOptText.includes('pilih kelas');
            const isSiswaSelect = el.id.toLowerCase().includes('siswa') || firstOptText.includes('kelas dahulu') || firstOptText.includes('nama siswa');

            if (isKelasSelect && !isSiswaSelect) {
                el.innerHTML = '<option value="">-- Pilih Kelas --</option>';
                daftarKelasBK.forEach(kelas => {
                    const opt = document.createElement('option');
                    opt.value = kelas;
                    opt.textContent = kelas;
                    el.appendChild(opt);
                });
            }
        });
    } catch (err) {
        console.error("Gagal memuat data siswa BK:", err);
    }
}

// ==========================================================================
// DETEKSI OTOMATIS PASANGAN DROPDOWN KELAS -> SISWA DI SETIAP FORM/KARTU
// ==========================================================================
function cariDropdownSiswaPasangan(elKelas) {
    // 1. Coba tebak dari pola ID (misal pelanggaran-kelas -> pelanggaran-siswa)
    if (elKelas.id) {
        const guessId = elKelas.id.replace(/kelas/i, 'siswa');
        if (guessId !== elKelas.id) {
            const byId = document.getElementById(guessId);
            if (byId && byId !== elKelas) return byId;
        }
    }

    // 2. Cari <select> berikutnya di dalam wadah/kartu terdekat yang mengandung "Siswa" atau "Pilih Kelas Dahulu"
    let parent = elKelas.parentElement;
    for (let depth = 0; depth < 4 && parent; depth++) {
        const selects = Array.from(parent.querySelectorAll('select'));
        const idx = selects.indexOf(elKelas);
        if (idx !== -1 && selects[idx + 1]) {
            return selects[idx + 1];
        }
        parent = parent.parentElement;
    }
    return null;
}

function isiDropdownSiswaKeElemen(kelas, elSiswa) {
    if (!elSiswa) return;
    const targetKelas = String(kelas || '').trim().toUpperCase();

    if (!targetKelas) {
        elSiswa.innerHTML = '<option value="">-- Pilih Kelas Dahulu --</option>';
        return;
    }

    const siswaKelas = daftarSiswaBK.filter(
        s => String(s.kelas || '').trim().toUpperCase() === targetKelas
    );

    elSiswa.innerHTML = `<option value="">-- Pilih Nama Siswa (${siswaKelas.length} siswa) --</option>`;
    siswaKelas.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.nisn;
        opt.dataset.nisn = s.nisn;
        opt.dataset.nama = s.nama;
        opt.textContent = `${s.nama} (${s.nisn})`;
        elSiswa.appendChild(opt);
    });
}

function pasangEventDropdownOtomatis() {
    document.querySelectorAll('select').forEach(elKelas => {
        const firstOptText = (elKelas.options[0]?.textContent || '').toLowerCase();
        const isKelasSelect = elKelas.id.toLowerCase().includes('kelas') || firstOptText.includes('pilih kelas');
        const isSiswaSelect = elKelas.id.toLowerCase().includes('siswa') || firstOptText.includes('kelas dahulu');

        if (isKelasSelect && !isSiswaSelect) {
            const handler = () => {
                const elSiswaTarget = cariDropdownSiswaPasangan(elKelas);
                isiDropdownSiswaKeElemen(elKelas.value, elSiswaTarget);
            };
            elKelas.addEventListener('change', handler);

            // Jika sudah ada kelas terpilih saat halaman dimuat
            if (elKelas.value) handler();
        }
    });
}

// Fungsi global cadangan jika bk.html memakai inline onchange="..."
window.pilihKelasBK = function (kelas) {
    const activeEl = document.activeElement;
    if (activeEl && activeEl.tagName === 'SELECT') {
        const target = cariDropdownSiswaPasangan(activeEl);
        if (target) {
            isiDropdownSiswaKeElemen(kelas, target);
            return;
        }
    }
    const fallback = document.getElementById('pelanggaran-siswa') || document.querySelector('select[id*="siswa"]');
    isiDropdownSiswaKeElemen(kelas, fallback);
};
window.loadSiswaByKelas = window.pilihKelasBK;

function ambilPasanganSelectDariTombol(triggerEl, fallbackKelasId, fallbackSiswaId) {
    let container = triggerEl && triggerEl.closest ? triggerEl.closest('form, section, .card, div') : null;
    while (container && container.querySelectorAll('select').length < 2 && container.parentElement) {
        container = container.parentElement;
    }

    if (container && container.querySelectorAll('select').length >= 2) {
        const selects = container.querySelectorAll('select');
        return { elKelas: selects[0], elSiswa: selects[1], container };
    }

    return {
        elKelas: document.getElementById(fallbackKelasId),
        elSiswa: document.getElementById(fallbackSiswaId),
        container: document
    };
}

async function ekstrakDataSiswaTerpilih(kelas, elSiswa) {
    const rawVal = String(elSiswa ? elSiswa.value : '').trim();
    const opt = elSiswa && elSiswa.selectedIndex >= 0 ? elSiswa.options[elSiswa.selectedIndex] : null;

    let nisn = '';
    let namaSiswa = '';

    if (opt) {
        namaSiswa = (opt.dataset.nama || opt.text || '')
            .replace(/\s*[\(\-]\s*\d{6,}\s*\)?$/, '')
            .trim();

        if (opt.dataset.nisn && /^\d{6,}$/.test(opt.dataset.nisn.trim())) {
            nisn = opt.dataset.nisn.trim();
        } else if (/^\d{6,}$/.test(rawVal)) {
            nisn = rawVal;
        }
    }

    if (!nisn && (namaSiswa || rawVal)) {
        const targetNama = (namaSiswa || rawVal).toLowerCase();
        const cocokCache = daftarSiswaBK.find(
            s => s.kelas.toUpperCase() === kelas.toUpperCase() && s.nama.toLowerCase() === targetNama
        );
        if (cocokCache) {
            nisn = cocokCache.nisn;
            namaSiswa = cocokCache.nama;
        }
    }

    if (!nisn && (namaSiswa || rawVal)) {
        const rows = await queryTurso(
            "SELECT nisn, nama FROM siswa WHERE TRIM(kelas) = ? AND LOWER(TRIM(nama)) LIKE LOWER(?) LIMIT 1",
            [kelas, `%${namaSiswa || rawVal}%`]
        );
        if (rows && rows.length > 0) {
            nisn = String(rows[0].nisn || '').trim();
            namaSiswa = String(rows[0].nama || namaSiswa).trim();
        }
    }

    return { nisn, namaSiswa };
}

// ==========================================================================
// 1. SIMPAN CATATAN KEDISIPLINAN / PELANGGARAN
// ==========================================================================
async function simpanCatatanPelanggaran(e) {
    const trigger = (e && e.currentTarget) || document.activeElement;
    const { elKelas, elSiswa, container } = ambilPasanganSelectDariTombol(trigger, 'pelanggaran-kelas', 'pelanggaran-siswa');

    const elJenis = document.getElementById('pelanggaran-jenis') || document.getElementById('bk-jenis') || container.querySelector('input[type="text"]');
    const elKet = document.getElementById('pelanggaran-keterangan') || document.getElementById('bk-keterangan') || container.querySelector('textarea');
    const elPoin = document.getElementById('pelanggaran-poin') || document.getElementById('bk-poin') || container.querySelector('input[type="number"]');

    const kelas = String(elKelas ? elKelas.value : '').trim();
    const rawSiswa = String(elSiswa ? elSiswa.value : '').trim();
    const jenis = String(elJenis ? elJenis.value : '').trim() || 'Pelanggaran Tata Tertib';
    const keterangan = String(elKet ? elKet.value : '').trim();
    const poin = parseInt(elPoin ? elPoin.value : '0', 10) || 0;

    if (!kelas || !rawSiswa) {
        alert("Silakan pilih Kelas dan Nama Siswa terlebih dahulu!");
        return;
    }

    try {
        const { nisn, namaSiswa } = await ekstrakDataSiswaTerpilih(kelas, elSiswa);
        if (!nisn) {
            alert(`Gagal menyimpan: NISN untuk siswa "${namaSiswa || rawSiswa}" di kelas ${kelas} tidak ditemukan.`);
            return;
        }

        const userLogin = JSON.parse(localStorage.getItem('smada_user') || '{}');
        const pencatat = userLogin.nama || userLogin.username || 'Guru BK';
        const tanggalHariIni = getTanggalHariIniWIB();
        const catatanGabungan = keterangan ? `${jenis}: ${keterangan}` : jenis;

        await insertDinamis('kedisiplinan', {
            tanggal: tanggalHariIni,
            nisn: nisn,
            nama_siswa: namaSiswa,
            nama: namaSiswa,
            kelas: kelas,
            jenis_pelanggaran: jenis,
            pelanggaran: jenis,
            catatan_pelanggaran: catatanGabungan,
            keterangan: catatanGabungan,
            poin: poin,
            dicatat_oleh: pencatat,
            petugas: pencatat,
            created_at: `${tanggalHariIni} ${getWaktuSekarangWIB()}`
        });

        alert(`Catatan kedisiplinan untuk ${namaSiswa} (${kelas}) berhasil disimpan!`);
        if (elKet) elKet.value = '';
        if (elPoin) elPoin.value = '';
        await muatRiwayatPelanggaranHariIni();
    } catch (err) {
        alert("Gagal menyimpan catatan pelanggaran: " + err.message);
    }
}

// ==========================================================================
// 2. SIMPAN STATUS SAKIT / IZIN / ALPA
// ==========================================================================
async function simpanStatusKetidakhadiranBK(e) {
    const trigger = (e && e.currentTarget) || document.activeElement;
    const { elKelas, elSiswa, container } = ambilPasanganSelectDariTombol(trigger, 'absen-kelas', 'absen-siswa');

    const selects = container.querySelectorAll('select');
    const elStatus = document.getElementById('absen-status') || (selects.length >= 3 ? selects[2] : null);
    const elKet = document.getElementById('absen-keterangan') || container.querySelector('textarea, input[type="text"]');

    const kelas = String(elKelas ? elKelas.value : '').trim();
    const rawSiswa = String(elSiswa ? elSiswa.value : '').trim();
    const status = String(elStatus ? elStatus.value : '').trim();
    const keterangan = String(elKet ? elKet.value : '').trim();

    if (!kelas || !rawSiswa || !status) {
        alert("Lengkapi Kelas, Nama Siswa, dan Status Kehadiran!");
        return;
    }

    try {
        const { nisn, namaSiswa } = await ekstrakDataSiswaTerpilih(kelas, elSiswa);
        if (!nisn) {
            alert("NISN siswa tidak ditemukan!");
            return;
        }

        const userLogin = JSON.parse(localStorage.getItem('smada_user') || '{}');
        const pencatat = userLogin.nama || userLogin.username || 'Guru BK';
        const tanggal = getTanggalHariIniWIB();
        const jam = getWaktuSekarangWIB();
        const ketLengkap = `${keterangan || status} [Input BK: ${pencatat}]`;

        const cek = await queryTurso(
            "SELECT id FROM presensi WHERE tanggal = ? AND nisn = ? LIMIT 1",
            [tanggal, nisn]
        );

        if (cek && cek.length > 0) {
            await queryTurso(
                "UPDATE presensi SET status = ?, keterangan = ? WHERE id = ?",
                [status, ketLengkap, cek[0].id]
            );
        } else {
            await insertDinamis('presensi', {
                tanggal: tanggal,
                nisn: nisn,
                nama: namaSiswa,
                kelas: kelas,
                jam_masuk: jam,
                status: status,
                keterangan: ketLengkap,
                petugas: pencatat
            });
        }

        alert(`Status ${status} untuk ${namaSiswa} (${kelas}) berhasil disimpan!`);
        if (elKet) elKet.value = '';
    } catch (err) {
        alert("Gagal menyimpan status kehadiran: " + err.message);
    }
}

// ==========================================================================
// 3. PULANG MENDAHULUI (IZIN PULANG)
// ==========================================================================
async function simpanPulangMendahului(e) {
    const trigger = (e && e.currentTarget) || document.activeElement;
    const { elKelas, elSiswa, container } = ambilPasanganSelectDariTombol(trigger, 'pulang-kelas', 'pulang-siswa');
    const elAlasan = document.getElementById('pulang-alasan') || container.querySelector('textarea, input[type="text"]');

    const kelas = String(elKelas ? elKelas.value : '').trim();
    const rawSiswa = String(elSiswa ? elSiswa.value : '').trim();
    const alasan = String(elAlasan ? elAlasan.value : '').trim();

    if (!kelas || !rawSiswa || !alasan) {
        alert("Pilih Kelas, Siswa, dan isi Alasan Pulang Mendahului!");
        return;
    }

    try {
        const { nisn, namaSiswa } = await ekstrakDataSiswaTerpilih(kelas, elSiswa);
        if (!nisn) {
            alert("NISN siswa tidak ditemukan!");
            return;
        }

        const userLogin = JSON.parse(localStorage.getItem('smada_user') || '{}');
        const pencatat = userLogin.nama || userLogin.username || 'Guru BK';
        const tanggal = getTanggalHariIniWIB();
        const jamPulang = getWaktuSekarangWIB();
        const ketBaru = `Pulang Mendahului (${jamPulang}): ${alasan} [oleh ${pencatat}]`;

        const cek = await queryTurso(
            "SELECT id FROM presensi WHERE tanggal = ? AND nisn = ? LIMIT 1",
            [tanggal, nisn]
        );

        if (cek && cek.length > 0) {
            await queryTurso(
                "UPDATE presensi SET jam_pulang = ?, keterangan = ? WHERE id = ?",
                [jamPulang, ketBaru, cek[0].id]
            );
        } else {
            await insertDinamis('presensi', {
                tanggal: tanggal,
                nisn: nisn,
                nama: namaSiswa,
                kelas: kelas,
                jam_masuk: jamPulang,
                jam_pulang: jamPulang,
                status: 'Izin',
                keterangan: ketBaru,
                petugas: pencatat
            });
        }

        alert(`Izin pulang mendahului untuk ${namaSiswa} (${kelas}) berhasil dicatat!`);
        if (elAlasan) elAlasan.value = '';
        const modal = document.getElementById('modalPulangMendahului');
        if (modal) modal.classList.add('hidden');
    } catch (err) {
        alert("Gagal menyimpan izin pulang: " + err.message);
    }
}

// ==========================================================================
// 4. RIWAYAT PELANGGARAN HARI INI & PENCARIAN SISWA
// ==========================================================================
async function muatRiwayatPelanggaranHariIni() {
    const container = document.getElementById('list-riwayat-pelanggaran') || document.getElementById('tabel-riwayat-bk');
    if (!container) return;

    try {
        const tanggal = getTanggalHariIniWIB();
        const rows = await queryTurso(
            "SELECT * FROM kedisiplinan WHERE tanggal = ? ORDER BY id DESC LIMIT 30",
            [tanggal]
        );

        if (!rows || rows.length === 0) {
            container.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Belum ada catatan kedisiplinan hari ini.</p>`;
            return;
        }

        container.innerHTML = rows.map(r => {
            const nama = r.nama_siswa || r.nama || '-';
            const jenis = r.jenis_pelanggaran || r.pelanggaran || 'Catatan Kedisiplinan';
            const ket = r.keterangan || r.catatan_pelanggaran || '-';
            const oleh = r.dicatat_oleh || r.petugas || 'BK';
            return `
                <div class="p-3 bg-rose-50/70 border border-rose-200 rounded-xl flex items-start justify-between gap-3 text-xs">
                    <div>
                        <div class="font-bold text-slate-800">${nama} <span class="text-rose-700 font-semibold">(${r.kelas || '-'})</span></div>
                        <div class="text-rose-800 font-semibold mt-0.5">${jenis}</div>
                        <div class="text-slate-600 mt-0.5">${ket}</div>
                        <div class="text-[10px] text-slate-400 mt-1">NISN: ${r.nisn} • Dicatat: ${oleh}</div>
                    </div>
                    <button type="button" onclick="hapusCatatanPelanggaran(${r.id})"
                        class="text-rose-600 hover:text-rose-800 px-2 py-1 rounded bg-white border border-rose-200 text-[11px] font-semibold">
                        Hapus
                    </button>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error("Gagal memuat riwayat pelanggaran:", err);
    }
}

async function hapusCatatanPelanggaran(id) {
    if (!confirm("Hapus catatan kedisiplinan ini?")) return;
    try {
        await queryTurso("DELETE FROM kedisiplinan WHERE id = ?", [id]);
        await muatRiwayatPelanggaranHariIni();
    } catch (err) {
        alert("Gagal menghapus catatan: " + err.message);
    }
}

async function cariRekamJejakSiswaBK(keyword) {
    const q = String(keyword || '').trim();
    const hasilEl = document.getElementById('hasil-cari-siswa-bk');
    if (!hasilEl) return;

    if (q.length < 2) {
        hasilEl.innerHTML = '<p class="text-xs text-slate-400 text-center py-3">Ketik minimal 2 huruf nama siswa, NISN, atau kelas...</p>';
        return;
    }

    const qLower = q.toLowerCase();
    const siswaList = daftarSiswaBK
        .filter(s => s.nama.toLowerCase().includes(qLower) || s.nisn.includes(q) || s.kelas.toLowerCase().includes(qLower))
        .slice(0, 20);

    if (siswaList.length === 0) {
        hasilEl.innerHTML = '<p class="text-xs text-slate-400 text-center py-3">Siswa tidak ditemukan.</p>';
        return;
    }

    hasilEl.innerHTML = siswaList.map(s => `
        <div class="p-2.5 border border-slate-200 rounded-xl flex items-center justify-between text-xs bg-white">
            <div>
                <div class="font-bold text-slate-800">${s.nama}</div>
                <div class="text-[11px] text-slate-500">Kelas ${s.kelas} • NISN: ${s.nisn}</div>
            </div>
            <button type="button" onclick="pilihSiswaDariPencarianBK('${s.kelas}', '${s.nisn}')"
                class="px-2.5 py-1 bg-rose-700 hover:bg-rose-800 text-white rounded-lg font-semibold text-[11px]">
                Pilih
            </button>
        </div>
    `).join('');
}

function pilihSiswaDariPencarianBK(kelas, nisn) {
    const firstKelasSelect = Array.from(document.querySelectorAll('select')).find(el => {
        const t = (el.options[0]?.textContent || '').toLowerCase();
        return el.id.toLowerCase().includes('kelas') || t.includes('pilih kelas');
    });

    if (firstKelasSelect) {
        firstKelasSelect.value = kelas;
        const targetSiswa = cariDropdownSiswaPasangan(firstKelasSelect);
        isiDropdownSiswaKeElemen(kelas, targetSiswa);
        if (targetSiswa) targetSiswa.value = nisn;
    }

    const modalCari = document.getElementById('modalCariSiswaBK');
    if (modalCari) modalCari.classList.add('hidden');
}

function logoutBK() {
    sessionStorage.removeItem('smada_bk_siswa_cache');
    localStorage.removeItem('smada_token');
    localStorage.removeItem('smada_user');
    localStorage.removeItem('smada_role');
    window.location.replace('index.html');
}
