/* ==========================================================================
   SMAN 2 KARANGANYAR - PORTAL GURU PIKET (SPLIT READ/WRITE EDITION)
   ========================================================================== */

const PIKET_WORKER_URL = 'https://smada-api-gateway.yhanedy.workers.dev';

let allSiswaPiket = [];
let siswaMapPiket = {};

function getTodayWIB() {
    try {
        return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());
    } catch (e) {
        const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
        return `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, '0')}-${String(wib.getUTCDate()).padStart(2, '0')}`;
    }
}

function getNowTimeWIB() {
    try {
        return new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Jakarta',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).format(new Date());
    } catch (e) {
        const now = new Date();
        return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    }
}

function getPetugasPiketName() {
    if (typeof currentUserSession !== 'undefined' && currentUserSession) {
        return currentUserSession.nama || currentUserSession.username || 'Piket';
    }
    try {
        const rawUser = localStorage.getItem('smada_user');
        if (rawUser) {
            const u = JSON.parse(rawUser);
            return u.nama || u.username || 'Piket';
        }
    } catch (_) {}
    return 'Piket';
}

function normalizeKelas(val) {
    return String(val || '').replace(/\s+/g, ' ').trim();
}

// ============================================================================
// FUNGSI API TERPADU (MENGIRIM PAYLOAD { sql, params } KE WORKER)
// ============================================================================
async function execPiketQuery(sql, params = []) {
    const baseUrl = (typeof WORKER_URL !== 'undefined' ? WORKER_URL : PIKET_WORKER_URL).replace(/\/$/, '');
    const token = localStorage.getItem('smada_token') || (typeof currentUserSession !== 'undefined' && currentUserSession?.token) || '';

    const res = await fetch(`${baseUrl}/api/query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ sql, params })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data && data.success === false && data.error)) {
        throw new Error(data.error || `HTTP Error ${res.status}`);
    }

    if (Array.isArray(data)) return data;
    if (data.rows && Array.isArray(data.rows)) return data.rows;
    if (data.results && Array.isArray(data.results)) return data.results;
    if (data.data && Array.isArray(data.data)) return data.data;
    return [];
}

// Alias kompatibilitas jika ada skrip luar memanggil queryTurso / tursoQuery
const queryTurso = execPiketQuery;
const tursoQuery = execPiketQuery;

document.addEventListener('DOMContentLoaded', async () => {
    // Tampilkan nama petugas jika elemen tersedia
    const nameEl = document.getElementById('display-piket-name') || document.getElementById('display-user-name');
    if (nameEl) nameEl.textContent = getPetugasPiketName();

    // Set tanggal hari ini WIB pada filter rekap
    const filterTanggal = document.getElementById('filter-piket-tanggal');
    if (filterTanggal && !filterTanggal.value) {
        filterTanggal.value = getTodayWIB();
    }

    // Muat data master siswa untuk semua dropdown kelas
    await muatDaftarKelasPiket();

    // Muat tabel rekap harian & antrean verifikasi izin siswa secara paralel
    await Promise.all([
        muatRekapPiketHarian(),
        muatAntreanIzinSiswa()
    ]);
});

// ============================================================================
// 1. MEMUAT DATA MASTER SISWA & DROPDOWN KELAS
// ============================================================================
async function muatDaftarKelasPiket() {
    const kelasSelectIds = ['piket-masuk-kelas', 'piket-sakit-kelas', 'pulang-kelas'];
    try {
        const rows = await execPiketQuery('SELECT nisn, nama, kelas FROM siswa ORDER BY kelas ASC, nama ASC', []);
        allSiswaPiket = (Array.isArray(rows) ? rows : []).map(s => ({
            ...s,
            nisn: String(s.nisn || '').trim(),
            nama: String(s.nama || '').trim(),
            kelas: normalizeKelas(s.kelas)
        }));

        siswaMapPiket = {};
        allSiswaPiket.forEach(s => {
            siswaMapPiket[s.nisn] = s;
        });

        const daftarKelas = [...new Set(allSiswaPiket.map(s => s.kelas).filter(Boolean))].sort((a, b) =>
            a.localeCompare(b, 'id', { numeric: true })
        );

        const optionsHtml = '<option value="">-- Pilih Kelas --</option>' +
            daftarKelas.map(k => `<option value="${k}">${k}</option>`).join('');

        kelasSelectIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = optionsHtml;
        });
    } catch (err) {
        console.error('Gagal memuat daftar kelas:', err);
        kelasSelectIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = `<option value="">Gagal memuat kelas</option>`;
        });
    }
}

function muatSiswaBerdasarkanKelas(kelasSelectId, siswaSelectId) {
    const kelasEl = document.getElementById(kelasSelectId);
    const siswaEl = document.getElementById(siswaSelectId);
    if (!kelasEl || !siswaEl) return;

    const kelasDipilih = normalizeKelas(kelasEl.value);
    if (!kelasDipilih) {
        siswaEl.innerHTML = '<option value="">-- Pilih Kelas Dahulu --</option>';
        return;
    }

    const siswaKelas = allSiswaPiket.filter(s => s.kelas === kelasDipilih);
    if (siswaKelas.length === 0) {
        siswaEl.innerHTML = '<option value="">-- Tidak ada siswa di kelas ini --</option>';
        return;
    }

    siswaEl.innerHTML = '<option value="">-- Pilih Nama Siswa --</option>' +
        siswaKelas.map(s => `<option value="${s.nisn}">${s.nama} (${s.nisn})</option>`).join('');
}

// ============================================================================
// 2. SIMPAN PRESENSI SUSULAN & PULANG MENDAHULUI
// ============================================================================
async function simpanPresensiPiket(status) {
    const isPulangMendahului = status === 'Pulang Mendahului';
    const nisn = String(document.getElementById(isPulangMendahului ? 'pulang-nisn' : 'piket-masuk-nisn')?.value || '').trim();
    const ketRaw = document.getElementById(isPulangMendahului ? 'pulang-alasan' : 'piket-masuk-ket')?.value.trim() || '';

    if (!nisn) {
        alert('Silakan pilih kelas dan nama siswa terlebih dahulu!');
        return;
    }

    if (isPulangMendahului && !ketRaw) {
        alert('Alasan pulang mendahului wajib diisi!');
        return;
    }

    const tanggal = getTodayWIB();
    const jamSekarang = getNowTimeWIB();
    const petugas = getPetugasPiketName();

    try {
        if (isPulangMendahului) {
            const existing = await execPiketQuery(
                'SELECT id, jam_masuk FROM presensi WHERE nisn = ? AND tanggal = ? LIMIT 1',
                [nisn, tanggal]
            );
            const ketFinal = `[Piket: ${petugas}] Pulang Mendahului: ${ketRaw}`;

            if (existing.length > 0) {
                await execPiketQuery(
                    'UPDATE presensi SET jam_pulang = ?, status = ?, keterangan = ? WHERE nisn = ? AND tanggal = ?',
                    [jamSekarang, 'Pulang Mendahului', ketFinal, nisn, tanggal]
                );
            } else {
                await execPiketQuery(
                    'INSERT INTO presensi (nisn, tanggal, jam_masuk, jam_pulang, status, keterangan) VALUES (?, ?, ?, ?, ?, ?)',
                    [nisn, tanggal, '-', jamSekarang, 'Pulang Mendahului', ketFinal]
                );
            }
            const alasanEl = document.getElementById('pulang-alasan');
            if (alasanEl) alasanEl.value = '';
        } else {
            const ketFinal = ketRaw
                ? `[Piket: ${petugas}] ${ketRaw}`
                : `[Piket: ${petugas}] Presensi masuk susulan`;

            await execPiketQuery(
                `INSERT INTO presensi (nisn, tanggal, jam_masuk, status, keterangan)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT (nisn, tanggal) DO UPDATE SET
                 jam_masuk = excluded.jam_masuk,
                 status = excluded.status,
                 keterangan = excluded.keterangan`,
                [nisn, tanggal, jamSekarang, status, ketFinal]
            );
            const ketEl = document.getElementById('piket-masuk-ket');
            if (ketEl) ketEl.value = '';
        }

        alert(`Berhasil mencatat ${status} untuk siswa terpilih!`);
        await muatRekapPiketHarian();
    } catch (err) {
        console.error('Gagal simpan presensi piket:', err);
        alert('Gagal menyimpan data: ' + err.message);
    }
}

async function simpanPulangSusulanPiket() {
    const nisn = String(document.getElementById('piket-masuk-nisn')?.value || '').trim();
    const ketRaw = document.getElementById('piket-masuk-ket')?.value.trim() || '';

    if (!nisn) {
        alert('Silakan pilih kelas dan nama siswa pada kartu Presensi Masuk & Pulang Susulan!');
        return;
    }

    const tanggal = getTodayWIB();
    const jamSekarang = getNowTimeWIB();
    const petugas = getPetugasPiketName();

    try {
        const existing = await execPiketQuery(
            'SELECT id, status, keterangan FROM presensi WHERE nisn = ? AND tanggal = ? LIMIT 1',
            [nisn, tanggal]
        );

        const catatanPulang = ketRaw
            ? `[Piket: ${petugas}] Pulang susulan: ${ketRaw}`
            : `[Piket: ${petugas}] Presensi pulang susulan`;

        if (existing.length > 0) {
            const ketGabung = existing[0].keterangan ? `${existing[0].keterangan} | ${catatanPulang}` : catatanPulang;
            await execPiketQuery(
                'UPDATE presensi SET jam_pulang = ?, keterangan = ? WHERE nisn = ? AND tanggal = ?',
                [jamSekarang, ketGabung, nisn, tanggal]
            );
        } else {
            await execPiketQuery(
                'INSERT INTO presensi (nisn, tanggal, jam_masuk, jam_pulang, status, keterangan) VALUES (?, ?, ?, ?, ?, ?)',
                [nisn, tanggal, '-', jamSekarang, 'Hadir', catatanPulang]
            );
        }

        const ketEl = document.getElementById('piket-masuk-ket');
        if (ketEl) ketEl.value = '';
        alert('Jam pulang susulan berhasil dicatat!');
        await muatRekapPiketHarian();
    } catch (err) {
        console.error('Gagal simpan pulang susulan:', err);
        alert('Gagal menyimpan jam pulang susulan: ' + err.message);
    }
}

// ============================================================================
// 3. SIMPAN KETIDAKHADIRAN (SAKIT / IZIN / ALPA / DISPENSASI)
// ============================================================================
async function simpanKetidakhadiranPiket() {
    const nisn = String(document.getElementById('piket-sakit-nisn')?.value || '').trim();
    const status = document.getElementById('piket-sakit-status')?.value || 'Sakit';
    const ketRaw = document.getElementById('piket-sakit-ket')?.value.trim() || '';

    if (!nisn) {
        alert('Silakan pilih kelas dan nama siswa terlebih dahulu!');
        return;
    }

    const tanggal = getTodayWIB();
    const petugas = getPetugasPiketName();
    const ketFinal = ketRaw
        ? `[Piket: ${petugas}] ${ketRaw}`
        : `[Piket: ${petugas}] Dicatat ${status} oleh Piket`;

    try {
        await execPiketQuery(
            `INSERT INTO presensi (nisn, tanggal, jam_masuk, jam_pulang, status, keterangan)
             VALUES (?, ?, '-', '-', ?, ?)
             ON CONFLICT (nisn, tanggal) DO UPDATE SET
             status = excluded.status,
             keterangan = excluded.keterangan`,
            [nisn, tanggal, status, ketFinal]
        );

        const ketEl = document.getElementById('piket-sakit-ket');
        if (ketEl) ketEl.value = '';
        alert(`Status ${status} berhasil disimpan!`);
        await muatRekapPiketHarian();
    } catch (err) {
        console.error('Gagal simpan ketidakhadiran:', err);
        alert('Gagal menyimpan ketidakhadiran: ' + err.message);
    }
}

// ============================================================================
// 4. MEMUAT REKAP PRESENSI MANUAL & KETIDAKHADIRAN HARIAN
// ============================================================================
async function muatRekapPiketHarian() {
    const tbody = document.getElementById('tabel-piket-rekap-body');
    if (!tbody) return;

    const tanggal = document.getElementById('filter-piket-tanggal')?.value || getTodayWIB();
    tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Memuat data...</td></tr>';

    try {
        const rows = await execPiketQuery(
            `SELECT id, nisn, tanggal, jam_masuk, jam_pulang, status, keterangan
             FROM presensi
             WHERE tanggal = ?
               AND (
                 status IN ('Sakit', 'Izin', 'Alpa', 'Dispensasi', 'Terlambat', 'Pulang Mendahului', 'Pending Izin')
                 OR COALESCE(keterangan, '') LIKE '%Piket%'
               )
             ORDER BY id DESC`,
            [tanggal]
        );

        if (!rows || rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400">Belum ada catatan ketidakhadiran / input piket pada tanggal ${tanggal}.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(r => {
            const siswa = siswaMapPiket[String(r.nisn).trim()] || {};
            const namaSiswa = siswa.nama || '-';
            const kelasSiswa = siswa.kelas || '-';
            const jamInfo = r.jam_pulang && r.jam_pulang !== '-'
                ? `${r.tanggal} (${r.jam_masuk || '-'} - ${r.jam_pulang})`
                : `${r.tanggal} (${r.jam_masuk || '-'})`;

            let badgeClass = 'bg-slate-100 text-slate-700';
            if (r.status === 'Hadir') badgeClass = 'bg-emerald-100 text-emerald-800';
            else if (r.status === 'Terlambat' || r.status === 'Pulang Mendahului') badgeClass = 'bg-amber-100 text-amber-800';
            else if (r.status === 'Sakit' || r.status === 'Izin' || r.status === 'Dispensasi') badgeClass = 'bg-blue-100 text-blue-800';
            else if (r.status === 'Alpa') badgeClass = 'bg-red-100 text-red-800';
            else if (r.status === 'Pending Izin') badgeClass = 'bg-purple-100 text-purple-800';

            return `
                <tr class="hover:bg-slate-50">
                    <td class="p-3 font-mono text-[11px] whitespace-nowrap">${jamInfo}</td>
                    <td class="p-3 font-mono font-bold text-slate-700">${r.nisn}</td>
                    <td class="p-3 font-bold text-slate-800">${namaSiswa}</td>
                    <td class="p-3 text-center font-bold text-blue-900">${kelasSiswa}</td>
                    <td class="p-3 text-center">
                        <span class="px-2.5 py-1 rounded-full text-[11px] font-bold ${badgeClass}">${r.status}</span>
                    </td>
                    <td class="p-3 text-xs text-slate-600">${r.keterangan || '-'}</td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Gagal memuat rekap piket:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Gagal memuat data: ${err.message}</td></tr>`;
    }
}

// ============================================================================
// 5. ANTREAN VERIFIKASI PENGAJUAN IZIN MANDIRI SISWA
// ============================================================================
async function muatAntreanIzinSiswa() {
    const tbody = document.getElementById('tabel-antrean-izin-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Memuat antrean izin...</td></tr>';

    try {
        const rows = await execPiketQuery(
            `SELECT id, nisn, tanggal, jam_masuk, status, keterangan
             FROM presensi
             WHERE status = 'Pending Izin' OR LOWER(status) LIKE '%pending%'
             ORDER BY tanggal DESC, id DESC`,
            []
        );

        if (!rows || rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-400">Tidak ada pengajuan izin siswa yang menunggu verifikasi.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(r => {
            const siswa = siswaMapPiket[String(r.nisn).trim()] || {};
            const namaSiswa = siswa.nama || '-';
            const kelasSiswa = siswa.kelas || '-';
            const ketRaw = String(r.keterangan || '');

            const urlMatch = ketRaw.match(/(https?:\/\/[^\s]+)/);
            const linkFotoHtml = urlMatch
                ? `<a href="${urlMatch[1]}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 px-2.5 py-1 rounded-lg font-bold text-[11px]"><i class="fa-solid fa-image"></i> Lihat Bukti</a>`
                : '<span class="text-slate-400 italic">Tidak ada lampiran</span>';

            const alasanBersih = ketRaw.replace(/\|?\s*Link:\s*https?:\/\/[^\s]+/gi, '').trim() || '-';

            return `
                <tr class="hover:bg-purple-50/40">
                    <td class="p-3 font-mono text-[11px] whitespace-nowrap">${r.tanggal}<br><span class="text-slate-400">${r.jam_masuk || '-'}</span></td>
                    <td class="p-3 font-mono font-bold">${r.nisn}</td>
                    <td class="p-3 font-bold text-slate-800">${namaSiswa}</td>
                    <td class="p-3 text-center font-bold text-blue-900">${kelasSiswa}</td>
                    <td class="p-3 text-xs text-slate-700 max-w-xs">${alasanBersih}</td>
                    <td class="p-3 text-center">${linkFotoHtml}</td>
                    <td class="p-3">
                        <select id="status-verif-${r.id}" class="border border-purple-300 rounded-lg px-2 py-1.5 text-xs font-bold bg-white text-purple-950 outline-none">
                            <option value="Sakit">Sakit</option>
                            <option value="Izin">Izin</option>
                            <option value="Dispensasi">Dispensasi</option>
                            <option value="Alpa">Tolak (Set Alpa)</option>
                        </select>
                    </td>
                    <td class="p-3 text-center">
                        <button onclick="verifikasiPengajuanIzin(${r.id})" class="bg-purple-700 hover:bg-purple-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow cursor-pointer">
                            <i class="fa-solid fa-check mr-1"></i> Verifikasi
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Gagal memuat antrean izin:', err);
        tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-red-500">Gagal memuat antrean: ${err.message}</td></tr>`;
    }
}

async function verifikasiPengajuanIzin(idPresensi) {
    const selectEl = document.getElementById(`status-verif-${idPresensi}`);
    const statusBaru = selectEl ? selectEl.value : 'Izin';

    if (!confirm(`Verifikasi pengajuan ini dengan status "${statusBaru}"?`)) return;

    const petugas = getPetugasPiketName();

    try {
        await execPiketQuery(
            `UPDATE presensi
             SET status = ?,
                 keterangan = COALESCE(keterangan, '') || ' [Diverifikasi Piket: ' || ? || ']'
             WHERE id = ?`,
            [statusBaru, petugas, idPresensi]
        );

        alert(`Pengajuan izin berhasil diverifikasi menjadi ${statusBaru}!`);
        await Promise.all([
            muatAntreanIzinSiswa(),
            muatRekapPiketHarian()
        ]);
    } catch (err) {
        console.error('Gagal verifikasi izin:', err);
        alert('Gagal memverifikasi pengajuan: ' + err.message);
    }
}

// ============================================================================
// 6. LOGOUT
// ============================================================================
function logout() {
    if (!confirm('Keluar dari Pos Pelayanan Guru Piket?')) return;
    localStorage.removeItem('smada_user');
    localStorage.removeItem('smada_token');
    localStorage.removeItem('smada_role');
    window.location.replace('index.html');
}
