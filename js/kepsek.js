/* ==========================================================================
   SMAN 2 KARANGANYAR - EXECUTIVE PRINCIPAL DASHBOARD ENGINE (js/kepsek.js)
   ========================================================================== */

const API_LAPORAN_PUBLIK = 'https://smada-api-gateway.yhanedy.workers.dev/api/public/laporan';
const BATAS_MASUK = '07:01:00';
const BATAS_ALPHA = '08:30:00';
const BATAS_PULANG = '17:30:00';

let stateSiswa = [];
let statePresensi = [];
let stateJurnalHariIni = [];
let stateJurnalAllTime = [];
let statePelanggaran = [];
let stateLaporanAnonim = [];
let stateDaftarGuru = [];
let stateGuruBelumJurnal = [];

let chartPresensiInstance = null;
let chartPelanggaranInstance = null;
let chartTopGuruInstance = null;

let modalCacheItems = [];
let modalRendererFn = null;

// ============================================================================
// UTILITAS TANGGAL & WAKTU WIB
// ============================================================================
function getTanggalWIB(d = new Date()) {
    try {
        return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(d);
    } catch (_) {
        const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
        return `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, '0')}-${String(wib.getUTCDate()).padStart(2, '0')}`;
    }
}

function getJamWIB(d = new Date()) {
    try {
        return new Intl.DateTimeFormat('id-ID', {
            timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        }).format(d).replace(/\./g, ':');
    } catch (_) {
        const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
        return `${String(wib.getUTCHours()).padStart(2, '0')}:${String(wib.getUTCMinutes()).padStart(2, '0')}:${String(wib.getUTCSeconds()).padStart(2, '0')}`;
    }
}

function formatTanggalIndo(tglStr) {
    try {
        const [y, m, d] = tglStr.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        return dateObj.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch (_) {
        return tglStr;
    }
}

function isWaktuLewat(tanggalLaporan, batasJam) {
    const hariIni = getTanggalWIB();
    if (tanggalLaporan < hariIni) return true;
    if (tanggalLaporan > hariIni) return false;
    return getJamWIB() >= batasJam;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function normalizeKelas(k) {
    return String(k || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

// ============================================================================
// INISIALISASI HALAMAN
// ============================================================================
window.addEventListener('load', async () => {
    if (currentUserSession) {
        const elNama = document.getElementById('kepsek-nama-user');
        if (elNama) elNama.textContent = currentUserSession.nama || currentUserSession.username;

        const r = String(currentUserSession.role || '').toLowerCase();
        if (r.includes('superadmin') || r.includes('super_admin')) {
            const btnSa = document.getElementById('btn-back-superadmin');
            if (btnSa) {
                btnSa.classList.remove('hidden');
                btnSa.classList.add('flex');
            }
        }
    }

    const inputTgl = document.getElementById('kepsek-filter-tanggal');
    if (inputTgl) inputTgl.value = getTanggalWIB();

    await muatTahunAjaranKepsek();
    await muatSemuaDataKepsek();
});

async function muatTahunAjaranKepsek() {
    try {
        const rows = await queryTurso("SELECT nilai FROM pengaturan_sistem WHERE kunci = 'tahun_ajaran' LIMIT 1", []);
        if (rows && rows.length > 0 && rows[0].nilai) {
            document.getElementById('kepsek-ta-aktif').textContent = rows[0].nilai;
        }
    } catch (_) {}
}

function setTanggalHariIniKepsek() {
    document.getElementById('kepsek-filter-tanggal').value = getTanggalWIB();
    muatSemuaDataKepsek();
}

function geserTanggalKepsek(deltaHari) {
    const input = document.getElementById('kepsek-filter-tanggal');
    const cur = input.value || getTanggalWIB();
    const [y, m, d] = cur.split('-').map(Number);
    const dt = new Date(y, m - 1, d + deltaHari);
    const nextStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    input.value = nextStr;
    muatSemuaDataKepsek();
}

function logoutKepsek() {
    localStorage.removeItem('smada_user');
    localStorage.removeItem('smada_role');
    localStorage.removeItem('smada_token');
    window.location.replace(PORTAL_SSO_URL);
}

function scrollKeMonitoringGuru() {
    const el = document.getElementById('section-monitoring-kelas-guru');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
}

// ============================================================================
// PENGAMBILAN DATA TERPADU DARI SELURUH TABEL
// ============================================================================
async function muatSemuaDataKepsek() {
    const iconRefresh = document.getElementById('icon-refresh-kepsek');
    if (iconRefresh) iconRefresh.classList.add('fa-spin');

    const tglPilihan = document.getElementById('kepsek-filter-tanggal').value || getTanggalWIB();
    document.getElementById('display-tanggal-kepsek').textContent = formatTanggalIndo(tglPilihan);

    try {
        const [
            rekapRes,
            jurnalHariRows,
            jurnalAllRows,
            pelanggaranRows,
            laporanAnonimRows,
            guruRows
        ] = await Promise.all([
            fetch(API_LAPORAN_PUBLIK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'rekap', tanggal: tglPilihan })
            }).then(r => r.json()).catch(() => ({ siswa: [], presensi: [] })),

            queryTurso(
                "SELECT * FROM jurnal_kbm WHERE SUBSTRING(created_at, 1, 10) = ? ORDER BY id DESC",
                [tglPilihan]
            ).catch(() => []),

            queryTurso(
                "SELECT id, username_guru, nama_guru, mapel, kelas, jam_ke, created_at FROM jurnal_kbm ORDER BY id DESC LIMIT 1500",
                []
            ).catch(() => []),

            queryTurso(
                "SELECT * FROM pelanggaran_bk ORDER BY id DESC LIMIT 300",
                []
            ).catch(() => []),

            queryTurso(
                "SELECT * FROM laporan_anonim ORDER BY id DESC LIMIT 200",
                []
            ).catch(() => queryTurso("SELECT * FROM laporan_bk ORDER BY id DESC LIMIT 200", []).catch(() => [])),

            queryTurso(
                "SELECT username, nama, role, mapel FROM users ORDER BY nama ASC",
                []
            ).catch(() => [])
        ]);

        stateSiswa = Array.isArray(rekapRes.siswa) ? rekapRes.siswa : [];
        statePresensi = Array.isArray(rekapRes.presensi) ? rekapRes.presensi : [];
        stateJurnalHariIni = Array.isArray(jurnalHariRows) ? jurnalHariRows : [];
        stateJurnalAllTime = Array.isArray(jurnalAllRows) ? jurnalAllRows : [];
        statePelanggaran = Array.isArray(pelanggaranRows) ? pelanggaranRows : [];
        stateLaporanAnonim = Array.isArray(laporanAnonimRows) ? laporanAnonimRows : [];
        stateDaftarGuru = Array.isArray(guruRows) ? guruRows : [];

        olahDanRenderSemuaVisual(tglPilihan);
    } catch (err) {
        console.error("Gagal memuat data dashboard kepsek:", err);
    } finally {
        if (iconRefresh) iconRefresh.classList.remove('fa-spin');
    }
}

// ============================================================================
// KALKULASI PRESENSI SISWA (SELARAS DENGAN LAPORAN PUBLIK)
// ============================================================================
function hitungStatusSiswaKepsek(nisn, tanggalLaporan) {
    const pList = statePresensi.filter(p => String(p.nisn || '').trim() === String(nisn || '').trim());

    const pSakit = pList.find(p => p.status === 'Sakit');
    if (pSakit) return { kategori: 'SI', statusText: 'Sakit', jamMasuk: '-', catatan: pSakit.keterangan || 'Sakit' };

    const pIzin = pList.find(p => p.status === 'Izin');
    if (pIzin) return { kategori: 'SI', statusText: 'Izin', jamMasuk: '-', catatan: pIzin.keterangan || 'Izin Resmi' };

    const pDispen = pList.find(p => p.status === 'Dispensasi');
    if (pDispen) return { kategori: 'SI', statusText: 'Dispensasi', jamMasuk: '-', catatan: pDispen.keterangan || 'Dispensasi' };

    const pAlpa = pList.find(p => p.status === 'Alpa' || p.status === 'Alpha');
    if (pAlpa) return { kategori: 'ALPHA', statusText: 'Alpha', jamMasuk: '-', catatan: pAlpa.keterangan || 'Alpha (Input Piket/BK)' };

    const pPulangAwal = pList.find(p => p.status === 'Pulang Mendahului');
    if (pPulangAwal) {
        const pMasuk = pList.find(p => p.jam_masuk);
        return { kategori: 'HADIR', statusText: 'Pulang Awal', jamMasuk: pMasuk ? pMasuk.jam_masuk : '-', catatan: pPulangAwal.keterangan || 'Izin Pulang' };
    }

    const pMasuk = pList.find(p => p.jam_masuk);
    if (!pMasuk) {
        if (isWaktuLewat(tanggalLaporan, BATAS_ALPHA)) {
            return { kategori: 'ALPHA', statusText: 'Alpha', jamMasuk: '-', catatan: 'Tidak presensi masuk s.d 08:30 WIB' };
        }
        return { kategori: 'BELUM', statusText: 'Belum Presensi', jamMasuk: '-', catatan: 'Belum melakukan presensi' };
    }

    const jamMasukVal = pMasuk.jam_masuk;
    const isTerlambat = pMasuk.status !== 'Hadir' && (jamMasukVal > BATAS_MASUK || pMasuk.status === 'Terlambat');
    if (isTerlambat) {
        return { kategori: 'TERLAMBAT', statusText: 'Terlambat', jamMasuk: jamMasukVal, catatan: `Terlambat pukul ${jamMasukVal}` };
    }
    return { kategori: 'HADIR', statusText: 'Hadir', jamMasuk: jamMasukVal, catatan: pMasuk.keterangan || `Hadir pukul ${jamMasukVal}` };
}

// ============================================================================
// RENDER KPI, 3 GRAFIK INTERAKTIF & MONITORING KELAS/GURU
// ============================================================================
function olahDanRenderSemuaVisual(tglPilihan) {
    let cntHadir = 0, cntTerlambat = 0, cntAlpha = 0, cntSI = 0, cntBelum = 0;

    stateSiswa.forEach(s => {
        const st = hitungStatusSiswaKepsek(s.nisn, tglPilihan);
        s._statusObj = st;
        if (st.kategori === 'HADIR') cntHadir++;
        else if (st.kategori === 'TERLAMBAT') cntTerlambat++;
        else if (st.kategori === 'ALPHA') cntAlpha++;
        else if (st.kategori === 'SI') cntSI++;
        else cntBelum++;
    });

    const totalSiswa = stateSiswa.length;
    const totalMasukSekolah = cntHadir + cntTerlambat;
    const persenHadir = totalSiswa > 0 ? Math.round((totalMasukSekolah / totalSiswa) * 100) : 0;

    // Filter pelanggaran & aduan anonim pada tanggal terpilih (dan hitung total aktif)
    const pelanggaranHariIni = statePelanggaran.filter(p => {
        const t = String(p.tanggal || p.created_at || '');
        return t.startsWith(tglPilihan);
    });
    const aduanHariIni = stateLaporanAnonim.filter(a => {
        const t = String(a.created_at || a.waktu || '');
        return t.startsWith(tglPilihan);
    });

    // Hitung Guru Mapel yang sudah vs belum mengisi jurnal pada tanggal terpilih
    const guruMapelList = stateDaftarGuru.filter(g => {
        const r = String(g.role || '').toLowerCase();
        return r.includes('mapel') || r.includes('guru') || (!r.includes('admin') && !r.includes('superadmin'));
    });

    const userSudahJurnalSet = new Set(
        stateJurnalHariIni.map(j => String(j.username_guru || '').trim().toLowerCase()).filter(Boolean)
    );
    const namaSudahJurnalSet = new Set(
        stateJurnalHariIni.map(j => String(j.nama_guru || '').trim().toLowerCase()).filter(Boolean)
    );

    stateGuruBelumJurnal = guruMapelList.filter(g => {
        const u = String(g.username || '').trim().toLowerCase();
        const n = String(g.nama || '').trim().toLowerCase();
        return !userSudahJurnalSet.has(u) && !namaSudahJurnalSet.has(n);
    });

    // Update 4 Kartu KPI
    document.getElementById('kpi-hadir-angka').textContent = totalMasukSekolah;
    document.getElementById('kpi-hadir-persen').textContent = `${persenHadir}%`;
    document.getElementById('kpi-total-siswa').textContent = totalSiswa;

    document.getElementById('kpi-terlambat-angka').textContent = cntTerlambat;
    document.getElementById('kpi-alpha-angka').textContent = cntAlpha;

    document.getElementById('kpi-pelanggaran-angka').textContent = pelanggaranHariIni.length;
    document.getElementById('kpi-anonim-badge').textContent = `${stateLaporanAnonim.length} Total Aduan`;

    document.getElementById('kpi-jurnal-terisi').textContent = stateJurnalHariIni.length;
    document.getElementById('kpi-guru-belum').textContent = `${stateGuruBelumJurnal.length} Blm Isi`;
    document.getElementById('badge-count-guru-belum').textContent = stateGuruBelumJurnal.length;

    // Render 3 Grafik
    renderChartPresensi(cntHadir, cntTerlambat, cntAlpha, cntSI, cntBelum);
    renderChartPelanggaranDanAnonim(pelanggaranHariIni.length, statePelanggaran.length, aduanHariIni.length, stateLaporanAnonim.length);
    renderChartTopGuruJurnal();

    // Render Monitoring Kelas & Daftar Guru Belum Isi Jurnal
    renderGridMonitoringKelas(tglPilihan);
    filterDaftarGuruBelum();
}

function renderChartPresensi(hadir, terlambat, alpha, si, belum) {
    const ctx = document.getElementById('chartPresensiSiswa');
    if (!ctx) return;
    if (chartPresensiInstance) chartPresensiInstance.destroy();

    const labels = ['Hadir Tepat Waktu', 'Terlambat', 'Alpha', 'Sakit / Izin / Dispen', 'Belum Presensi'];
    const kategoriKeys = ['HADIR', 'TERLAMBAT', 'ALPHA', 'SI', 'BELUM'];

    chartPresensiInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: [hadir, terlambat, alpha, si, belum],
                backgroundColor: ['#10b981', '#f59e0b', '#f43f5e', '#38bdf8', '#475569'],
                borderColor: '#071538',
                borderWidth: 3,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#cbd5e1', font: { size: 10, weight: 'bold' }, boxWidth: 10, padding: 10 }
                }
            },
            onClick: (_, elements) => {
                if (elements && elements.length > 0) {
                    const idx = elements[0].index;
                    bukaDetailPresensiKategori(kategoriKeys[idx]);
                }
            }
        }
    });
}

function renderChartPelanggaranDanAnonim(pelanggaranHari, pelanggaranTotal, aduanHari, aduanTotal) {
    const ctx = document.getElementById('chartPelanggaranAnonim');
    if (!ctx) return;
    if (chartPelanggaranInstance) chartPelanggaranInstance.destroy();

    chartPelanggaranInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Pelanggaran (Tgl Ini)', 'Total Pelanggaran BK', 'Aduan Anonim (Tgl Ini)', 'Total Aduan Masuk'],
            datasets: [{
                label: 'Jumlah Laporan',
                data: [pelanggaranHari, pelanggaranTotal, aduanHari, aduanTotal],
                backgroundColor: ['#fb7185', '#e11d48', '#c084fc', '#9333ea'],
                borderRadius: 10,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    ticks: { color: '#cbd5e1', font: { size: 9, weight: 'bold' } },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: '#94a3b8', precision: 0, font: { size: 10 } },
                    grid: { color: 'rgba(148, 163, 184, 0.15)' }
                }
            },
            onClick: (_, elements) => {
                if (elements && elements.length > 0) {
                    const idx = elements[0].index;
                    bukaDetailPelanggaranDanAnonim(idx <= 1 ? 'PELANGGARAN' : 'ANONIM');
                }
            }
        }
    });
}

function renderChartTopGuruJurnal() {
    const ctx = document.getElementById('chartTopGuruJurnal');
    if (!ctx) return;
    if (chartTopGuruInstance) chartTopGuruInstance.destroy();

    const counterMap = {};
    stateJurnalAllTime.forEach(j => {
        const nama = String(j.nama_guru || j.username_guru || 'Guru').trim();
        if (!nama) return;
        counterMap[nama] = (counterMap[nama] || 0) + 1;
    });

    const sortedTop = Object.entries(counterMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

    const labels = sortedTop.map(([nama]) => nama.length > 18 ? nama.slice(0, 18) + '…' : nama);
    const fullNames = sortedTop.map(([nama]) => nama);
    const counts = sortedTop.map(([, total]) => total);

    chartTopGuruInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.length ? labels : ['Belum ada data'],
            datasets: [{
                label: 'Jumlah Jurnal Diisi',
                data: counts.length ? counts : [0],
                backgroundColor: '#38bdf8',
                hoverBackgroundColor: '#22d3ee',
                borderRadius: 8
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { color: '#94a3b8', precision: 0, font: { size: 10 } },
                    grid: { color: 'rgba(148, 163, 184, 0.15)' }
                },
                y: {
                    ticks: { color: '#e2e8f0', font: { size: 10, weight: 'bold' } },
                    grid: { display: false }
                }
            },
            onClick: (_, elements) => {
                if (elements && elements.length > 0 && fullNames[elements[0].index]) {
                    bukaDetailJurnalGuru(fullNames[elements[0].index]);
                }
            }
        }
    });
}

// ============================================================================
// GRID MONITORING KELAS & GURU BELUM MENGISI JURNAL
// ============================================================================
function renderGridMonitoringKelas(tglPilihan) {
    const container = document.getElementById('grid-monitoring-kelas');
    if (!container) return;

    const kelasMap = {};
    stateSiswa.forEach(s => {
        const k = normalizeKelas(s.kelas || 'TANPA KELAS');
        if (!kelasMap[k]) kelasMap[k] = [];
        kelasMap[k].push(s);
    });

    const sortedKelas = Object.keys(kelasMap).sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
    if (sortedKelas.length === 0) {
        container.innerHTML = '<div class="col-span-full text-center text-blue-200/70 text-xs py-6">Data kelas belum tersedia.</div>';
        return;
    }

    container.innerHTML = sortedKelas.map(namaKelas => {
        const listSiswa = kelasMap[namaKelas];
        const jurnalKelas = stateJurnalHariIni.filter(j => normalizeKelas(j.kelas) === namaKelas);

        let hadir = 0, telat = 0, alpha = 0;
        listSiswa.forEach(s => {
            const st = s._statusObj || hitungStatusSiswaKepsek(s.nisn, tglPilihan);
            if (st.kategori === 'HADIR') hadir++;
            else if (st.kategori === 'TERLAMBAT') telat++;
            else if (st.kategori === 'ALPHA') alpha++;
        });

        const adaJurnal = jurnalKelas.length > 0;
        const cardBorder = adaJurnal
            ? 'border-emerald-400/40 bg-emerald-950/35 hover:border-emerald-300'
            : 'border-rose-400/45 bg-rose-950/35 hover:border-rose-300';
        const statusDot = adaJurnal
            ? '<span class="w-2 h-2 rounded-full bg-emerald-400"></span>'
            : '<span class="w-2 h-2 rounded-full bg-rose-400 animate-ping"></span>';

        return `
            <div onclick="bukaDetailKelasKepsek('${escapeHtml(namaKelas)}')" class="rounded-2xl border ${cardBorder} p-3 cursor-pointer transition hover:-translate-y-0.5 space-y-2">
                <div class="flex items-center justify-between gap-1">
                    <span class="font-black text-xs sm:text-sm text-white font-mono">${escapeHtml(namaKelas)}</span>
                    <div class="flex items-center gap-1.5">
                        ${statusDot}
                        <span class="text-[10px] font-bold text-blue-200">${listSiswa.length} Ssw</span>
                    </div>
                </div>
                <div class="flex items-center justify-between text-[10px] font-bold">
                    <span class="text-emerald-300">H: ${hadir + telat}</span>
                    <span class="text-amber-300">T: ${telat}</span>
                    <span class="text-rose-300">A: ${alpha}</span>
                </div>
                <div class="pt-1.5 border-t border-white/10 text-[10px] font-semibold truncate ${adaJurnal ? 'text-emerald-200' : 'text-rose-200'}">
                    ${adaJurnal ? `<i class="fa-solid fa-check-circle mr-1"></i>${jurnalKelas.length} Jurnal Terisi` : `<i class="fa-solid fa-circle-xmark mr-1"></i>Belum Ada Jurnal`}
                </div>
            </div>
        `;
    }).join('');
}

function filterDaftarGuruBelum() {
    const container = document.getElementById('list-guru-belum-jurnal');
    if (!container) return;

    const kw = (document.getElementById('search-guru-belum')?.value || '').toLowerCase().trim();
    const list = kw
        ? stateGuruBelumJurnal.filter(g =>
            String(g.nama || '').toLowerCase().includes(kw) ||
            String(g.mapel || '').toLowerCase().includes(kw)
        )
        : stateGuruBelumJurnal;

    if (list.length === 0) {
        container.innerHTML = `<div class="text-center text-emerald-300 text-xs font-bold py-6 bg-emerald-500/10 rounded-2xl border border-emerald-400/25">Semua guru sudah mengisi jurnal atau tidak ditemukan.</div>`;
        return;
    }

    container.innerHTML = list.map((g, idx) => `
        <div onclick="bukaDetailJurnalGuru('${escapeHtml(g.nama || g.username)}')" class="bg-[#040e29]/80 hover:bg-blue-900/50 border border-blue-400/20 rounded-2xl p-3 flex items-center justify-between gap-2 cursor-pointer transition">
            <div class="min-w-0">
                <p class="font-bold text-xs text-white truncate">${idx + 1}. ${escapeHtml(g.nama || g.username)}</p>
                <p class="text-[10px] text-cyan-300 truncate">${escapeHtml(g.mapel || 'Guru Mata Pelajaran')}</p>
            </div>
            <span class="bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px] font-bold px-2 py-0.5 rounded-lg shrink-0">Belum Isi</span>
        </div>
    `).join('');
}

// ============================================================================
// MODAL DRILL-DOWN INTERAKTIF (DETAIL DARI KLIK GRAFIK & KOTAK)
// ============================================================================
function bukaModalDetail(subtitle, title, items, rendererFn) {
    document.getElementById('modal-detail-subtitle').textContent = subtitle;
    document.getElementById('modal-detail-title').textContent = title;
    document.getElementById('modal-search-input').value = '';
    modalCacheItems = items;
    modalRendererFn = rendererFn;
    renderIsiModal(items);
    document.getElementById('modalDetailKepsek').classList.remove('hidden');
}

function tutupModalDetailKepsek() {
    document.getElementById('modalDetailKepsek').classList.add('hidden');
}

function filterIsiModalDetail() {
    const kw = document.getElementById('modal-search-input').value.toLowerCase().trim();
    if (!kw) {
        renderIsiModal(modalCacheItems);
        return;
    }
    const filtered = modalCacheItems.filter(item => JSON.stringify(item).toLowerCase().includes(kw));
    renderIsiModal(filtered);
}

function renderIsiModal(items) {
    const body = document.getElementById('modal-detail-body');
    document.getElementById('modal-detail-count').textContent = `${items.length} Data`;
    if (!items || items.length === 0) {
        body.innerHTML = '<p class="text-center text-blue-200/70 py-8">Tidak ada rincian data pada kategori ini.</p>';
        return;
    }
    body.innerHTML = items.map((item, idx) => modalRendererFn(item, idx)).join('');
}

// 1. Detail Presensi Siswa (dari KPI & Grafik Doughnut)
function bukaDetailPresensiKategori(kategori) {
    const tglPilihan = document.getElementById('kepsek-filter-tanggal').value || getTanggalWIB();
    let title = 'Daftar Kehadiran Siswa';
    let filtered = [];

    if (kategori === 'TERLAMBAT_ALPHA') {
        title = 'Siswa Terlambat & Alpha';
        filtered = stateSiswa.filter(s => ['TERLAMBAT', 'ALPHA'].includes((s._statusObj || {}).kategori));
    } else {
        const labelMap = {
            HADIR: 'Siswa Hadir Tepat Waktu',
            TERLAMBAT: 'Siswa Terlambat (> 07:01 WIB)',
            ALPHA: 'Siswa Alpha (> 08:30 WIB)',
            SI: 'Siswa Sakit / Izin / Dispensasi',
            BELUM: 'Siswa Belum Melakukan Presensi'
        };
        title = labelMap[kategori] || title;
        filtered = stateSiswa.filter(s => (s._statusObj || {}).kategori === kategori);
    }

    bukaModalDetail(`Tanggal: ${formatTanggalIndo(tglPilihan)}`, title, filtered, (s, idx) => {
        const st = s._statusObj || {};
        return `
            <div class="bg-[#051133] border border-blue-400/20 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <p class="font-bold text-white">${idx + 1}. ${escapeHtml(s.nama)} <span class="text-cyan-300 font-mono text-[11px]">(${escapeHtml(s.kelas)})</span></p>
                    <p class="text-[11px] text-blue-200/75">${escapeHtml(st.catatan || '-')}</p>
                </div>
                <span class="px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-500/25 text-cyan-200 border border-cyan-400/30">${escapeHtml(st.statusText || '-')}</span>
            </div>
        `;
    });
}

// 2. Detail Pelanggaran BK & Aduan Anonim (dari KPI & Grafik Bar)
function bukaDetailPelanggaranDanAnonim(mode) {
    if (mode === 'ANONIM') {
        bukaModalDetail('Transparansi Pengaduan Siswa', 'Daftar Laporan Anonim & Terbuka', stateLaporanAnonim, (l, idx) => `
            <div class="bg-[#051133] border border-purple-400/30 rounded-2xl p-3.5 space-y-1.5">
                <div class="flex items-center justify-between gap-2">
                    <span class="font-bold text-purple-300">${idx + 1}. ${escapeHtml(l.kategori || 'Laporan Masuk')} (${escapeHtml(l.pelapor || 'Anonim')})</span>
                    <span class="text-[10px] font-mono text-slate-400">${escapeHtml(l.created_at || l.waktu || '-')}</span>
                </div>
                <p class="text-slate-200 leading-relaxed">${escapeHtml(l.isi_laporan || l.isi || l.deskripsi || '-')}</p>
                <p class="text-[11px] text-cyan-300">Status: <b>${escapeHtml(l.status || 'Pending')}</b> ${l.tindak_lanjut ? `&bull; Tindak Lanjut: ${escapeHtml(l.tindak_lanjut)}` : ''}</p>
            </div>
        `);
        return;
    }

    bukaModalDetail('Catatan Kedisiplinan STP2K / BK', 'Daftar Pelanggaran & Penanganan BK', statePelanggaran, (p, idx) => `
        <div class="bg-[#051133] border border-rose-400/30 rounded-2xl p-3.5 space-y-1">
            <div class="flex items-center justify-between gap-2">
                <p class="font-bold text-white">${idx + 1}. ${escapeHtml(p.nama_siswa || p.nama || '-')} <span class="text-rose-300 font-mono">(${escapeHtml(p.kelas || '-')})</span></p>
                <span class="text-[10px] font-mono text-slate-400">${escapeHtml(p.tanggal || p.created_at || '-')}</span>
            </div>
            <p class="text-rose-200 font-semibold">${escapeHtml(p.catatan_pelanggaran || '-')}</p>
            <p class="text-[11px] text-emerald-300">Penanganan BK: ${escapeHtml(p.penanganan_bk || 'Belum ada catatan penanganan')}</p>
        </div>
    `);
}

// 3. Detail Jurnal Guru (dari Grafik Top Guru & Daftar Guru Belum Isi)
function bukaDetailJurnalGuru(namaGuru) {
    const riwayat = stateJurnalAllTime.filter(
        j => String(j.nama_guru || j.username_guru || '').trim().toLowerCase() === String(namaGuru || '').trim().toLowerCase()
    );
    bukaModalDetail('Riwayat Aktivitas Mengajar Guru', `Jurnal KBM: ${namaGuru}`, riwayat, (j, idx) => `
        <div class="bg-[#051133] border border-cyan-400/25 rounded-2xl p-3.5 space-y-1">
            <div class="flex items-center justify-between gap-2">
                <span class="font-bold text-cyan-300">${idx + 1}. Kelas ${escapeHtml(j.kelas)} &bull; ${escapeHtml(j.mapel)}</span>
                <span class="text-[10px] font-mono text-amber-300">Jam ke-${escapeHtml(j.jam_ke)} (${escapeHtml(j.created_at || '-')})</span>
            </div>
            <p class="text-slate-200">${escapeHtml(j.materi || '-')}</p>
        </div>
    `);
}

function bukaDetailSemuaJurnalHariIni() {
    const tglPilihan = document.getElementById('kepsek-filter-tanggal').value || getTanggalWIB();
    bukaModalDetail(`Tanggal: ${formatTanggalIndo(tglPilihan)}`, 'Seluruh Jurnal KBM Terisi', stateJurnalHariIni, (j, idx) => `
        <div class="bg-[#051133] border border-cyan-400/25 rounded-2xl p-3.5 space-y-1">
            <div class="flex items-center justify-between gap-2">
                <span class="font-bold text-white">${idx + 1}. ${escapeHtml(j.nama_guru)} &mdash; <span class="text-cyan-300">${escapeHtml(j.kelas)}</span></span>
                <span class="text-[10px] font-mono text-amber-300">Jam ke-${escapeHtml(j.jam_ke)}</span>
            </div>
            <p class="text-[11px] text-blue-200 font-semibold">${escapeHtml(j.mapel)}: <span class="font-normal text-slate-200">${escapeHtml(j.materi || '-')}</span></p>
        </div>
    `);
}

// 4. Detail Per Kelas (dari Kotak Monitoring Kelas)
function bukaDetailKelasKepsek(namaKelas) {
    const tglPilihan = document.getElementById('kepsek-filter-tanggal').value || getTanggalWIB();
    const siswaKelas = stateSiswa.filter(s => normalizeKelas(s.kelas) === namaKelas);
    const jurnalKelas = stateJurnalHariIni.filter(j => normalizeKelas(j.kelas) === namaKelas);

    const gabunganItems = [
        ...jurnalKelas.map(j => ({ _tipe: 'JURNAL', ...j })),
        ...siswaKelas.map(s => ({ _tipe: 'SISWA', ...s }))
    ];

    bukaModalDetail(`Monitoring Kelas ${namaKelas} (${formatTanggalIndo(tglPilihan)})`, `Jurnal KBM (${jurnalKelas.length}) & Kehadiran Siswa (${siswaKelas.length})`, gabunganItems, (item, idx) => {
        if (item._tipe === 'JURNAL') {
            return `
                <div class="bg-emerald-950/50 border border-emerald-400/40 rounded-2xl p-3.5 space-y-1">
                    <div class="flex items-center justify-between gap-2">
                        <span class="font-black text-emerald-300"><i class="fa-solid fa-book-open mr-1"></i>JURNAL GURU: ${escapeHtml(item.nama_guru)}</span>
                        <span class="text-[10px] font-mono text-amber-300">Jam ke-${escapeHtml(item.jam_ke)}</span>
                    </div>
                    <p class="text-white font-semibold">${escapeHtml(item.mapel)} &mdash; <span class="font-normal text-slate-200">${escapeHtml(item.materi || '-')}</span></p>
                </div>
            `;
        }
        const st = item._statusObj || {};
        return `
            <div class="bg-[#051133] border border-blue-400/20 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2">
                <div>
                    <p class="font-bold text-white">${escapeHtml(item.nama)} <span class="text-slate-400 font-mono text-[10px]">(${escapeHtml(item.nisn)})</span></p>
                    <p class="text-[10px] text-blue-200/75">${escapeHtml(st.catatan || '-')}</p>
                </div>
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-cyan-200">${escapeHtml(st.statusText || '-')}</span>
            </div>
        `;
    });
}
