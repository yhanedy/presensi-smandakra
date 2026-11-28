/* ==========================================================================
   SMAN 2 KARANGANYAR - PORTAL GURU PIKET (FULL FIXED VERSION)
   ========================================================================== */

let allSiswaPiket = [];
let siswaMapPiket = {};

// ============================================================================
// HELPER WAKTU & NORMALISASI
// ============================================================================
function getTodayWIB() {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

function getNowTimeWIB() {
    return new Date().toLocaleTimeString('id-ID', {
        timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).replace(/\./g, ':');
}

function getPetugasPiketName() {
    try {
        const rawUser = localStorage.getItem('smada_user');
        if (rawUser && rawUser !== 'null') {
            const u = JSON.parse(rawUser);
            return u.nama || u.username || 'Piket';
        }
    } catch (_) {}
    return 'Piket';
}

function normalizeKelas(val) {
    return String(val || '').replace(/\s+/g, ' ').trim();
}

function escapeHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeSqlStr(str) {
    return "'" + String(str ?? '').replace(/'/g, "''") + "'";
}

// ============================================================================
// INISIALISASI HALAMAN PIKET
// ============================================================================
async function initHalamanPiket() {
    const filterTanggal = document.getElementById('filter-piket-tanggal');
    if (filterTanggal && !filterTanggal.value) {
        filterTanggal.value = getTodayWIB();
    }

    await muatDaftarKelasPiket();
    await muatRekapPiketHarian();
    await muatAntreanIzinSiswa();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHalamanPiket);
} else {
    initHalamanPiket();
}

// ============================================================================
// 1. MEMUAT DATA MASTER SISWA & DROPDOWN KELAS
// ============================================================================
async function muatDaftarKelasPiket() {
    const kelasSelectIds = ['piket-masuk-kelas', 'piket-sakit-kelas', 'pulang-kelas'];
    try {
        // Ambil data langsung dari Turso (forcePrimary)
        const rows = await queryTurso('SELECT nisn, nama, kelas FROM siswa ORDER BY kelas ASC, nama ASC', [], true);
        
        allSiswaPiket = (Array.isArray(rows) ? rows : []).map(s => ({
            nisn: String(s.nisn || '').trim(),
            nama: String(s.nama || '').trim(),
            kelas: normalizeKelas(s.kelas)
        })).filter(s => s.nisn && s.nama && s.kelas);

        siswaMapPiket = {};
        allSiswaPiket.forEach(s => { siswaMapPiket[s.nisn] = s; });

        let daftarKelas = [...new Set(allSiswaPiket.map(s => s.kelas))].sort((a, b) =>
            a.localeCompare(b, 'id', { numeric: true })
        );

        const optionsHtml = '<option value="">-- Pilih Kelas --</option>' +
            daftarKelas.map(k => `<option value="${k}">${k}</option>`).join('');

        kelasSelectIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = optionsHtml;
        });
    } catch (err) {
        console.error('Gagal memuat daftar kelas piket:', err);
    }
}

window.muatSiswaBerdasarkanKelas = async function(kelasSelectId, siswaSelectId) {
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
        siswaEl.innerHTML = '<option value="">-- Tidak ada siswa --</option>';
        return;
    }

    siswaEl.innerHTML = '<option value="">-- Pilih Nama Siswa --</option>' +
        siswaKelas.map(s => `<option value="${s.nisn}">${s.nama} (${s.nisn})</option>`).join('');
}

// ============================================================================
// 2. SIMPAN PRESENSI SUSULAN & PULANG MENDAHULUI
// ============================================================================
window.simpanPresensiPiket = async function(status) {
    const isPulangMendahului = status === 'Pulang Mendahului';
    const nisn = String(document.getElementById(isPulangMendahului ? 'pulang-nisn' : 'piket-masuk-nisn')?.value || '').trim();
    const ketRaw = document.getElementById(isPulangMendahului ? 'pulang-alasan' : 'piket-masuk-ket')?.value.trim() || '';

    if (!nisn) { alert('Silakan pilih kelas dan nama siswa terlebih dahulu!'); return; }
    if (isPulangMendahului && !ketRaw) { alert('Alasan pulang mendahului wajib diisi!'); return; }

    const tanggal = getTodayWIB();
    const jamSekarang = getNowTimeWIB();
    const petugas = getPetugasPiketName();

    try {
        if (isPulangMendahului) {
            const ketFinal = `[Piket: ${petugas}] Pulang Mendahului: ${ketRaw}`;
            const existing = await queryTurso(`SELECT id FROM presensi WHERE nisn = ${escapeSqlStr(nisn)} AND tanggal = ${escapeSqlStr(tanggal)} LIMIT 1`, [], true);

            if (existing && existing.length > 0) {
                await queryTurso(`UPDATE presensi SET jam_pulang = ${escapeSqlStr(jamSekarang)}, status = 'Pulang Mendahului', keterangan = ${escapeSqlStr(ketFinal)} WHERE id = ${existing[0].id}`, [], true);
            } else {
                await queryTurso(`INSERT INTO presensi (nisn, tanggal, jam_masuk, jam_pulang, status, keterangan) VALUES (${escapeSqlStr(nisn)}, ${escapeSqlStr(tanggal)}, '-', ${escapeSqlStr(jamSekarang)}, 'Pulang Mendahului', ${escapeSqlStr(ketFinal)})`, [], true);
            }
            document.getElementById('pulang-alasan').value = '';
        } else {
            const ketFinal = ketRaw ? `[Piket: ${petugas}] ${ketRaw}` : `[Piket: ${petugas}] Presensi masuk susulan`;
            const existing = await queryTurso(`SELECT id FROM presensi WHERE nisn = ${escapeSqlStr(nisn)} AND tanggal = ${escapeSqlStr(tanggal)} LIMIT 1`, [], true);

            if (existing && existing.length > 0) {
                await queryTurso(`UPDATE presensi SET jam_masuk = ${escapeSqlStr(jamSekarang)}, status = ${escapeSqlStr(status)}, keterangan = ${escapeSqlStr(ketFinal)} WHERE id = ${existing[0].id}`, [], true);
            } else {
                await queryTurso(`INSERT INTO presensi (nisn, tanggal, jam_masuk, status, keterangan) VALUES (${escapeSqlStr(nisn)}, ${escapeSqlStr(tanggal)}, ${escapeSqlStr(jamSekarang)}, ${escapeSqlStr(status)}, ${escapeSqlStr(ketFinal)})`, [], true);
            }
            document.getElementById('piket-masuk-ket').value = '';
        }

        alert(`Berhasil mencatat ${status} untuk siswa terpilih!`);
        await muatRekapPiketHarian();
    } catch (err) {
        alert('Gagal menyimpan data: ' + err.message);
    }
};

window.simpanPulangSusulanPiket = async function() {
    const nisn = String(document.getElementById('piket-masuk-nisn')?.value || '').trim();
    const ketRaw = document.getElementById('piket-masuk-ket')?.value.trim() || '';

    if (!nisn) { alert('Silakan pilih kelas dan nama siswa pada kartu Presensi Masuk & Pulang Susulan!'); return; }

    const tanggal = getTodayWIB();
    const jamSekarang = getNowTimeWIB();
    const petugas = getPetugasPiketName();

    try {
        const existing = await queryTurso(`SELECT id, keterangan FROM presensi WHERE nisn = ${escapeSqlStr(nisn)} AND tanggal = ${escapeSqlStr(tanggal)} LIMIT 1`, [], true);
        const catatanPulang = ketRaw ? `[Piket: ${petugas}] Pulang susulan: ${ketRaw}` : `[Piket: ${petugas}] Presensi pulang susulan`;

        if (existing && existing.length > 0) {
            const ketGabung = existing[0].keterangan ? `${existing[0].keterangan} | ${catatanPulang}` : catatanPulang;
            await queryTurso(`UPDATE presensi SET jam_pulang = ${escapeSqlStr(jamSekarang)}, keterangan = ${escapeSqlStr(ketGabung)} WHERE id = ${existing[0].id}`, [], true);
        } else {
            await queryTurso(`INSERT INTO presensi (nisn, tanggal, jam_masuk, jam_pulang, status, keterangan) VALUES (${escapeSqlStr(nisn)}, ${escapeSqlStr(tanggal)}, '-', ${escapeSqlStr(jamSekarang)}, 'Hadir', ${escapeSqlStr(catatanPulang)})`, [], true);
        }

        document.getElementById('piket-masuk-ket').value = '';
        alert('Jam pulang susulan berhasil dicatat!');
        await muatRekapPiketHarian();
    } catch (err) {
        alert('Gagal menyimpan jam pulang susulan: ' + err.message);
    }
};

// ============================================================================
// 3. SIMPAN KETIDAKHADIRAN (SAKIT / IZIN / ALPA / DISPENSASI)
// ============================================================================
window.simpanKetidakhadiranPiket = async function() {
    const nisn = String(document.getElementById('piket-sakit-nisn')?.value || '').trim();
    const status = document.getElementById('piket-sakit-status')?.value || 'Sakit';
    const ketRaw = document.getElementById('piket-sakit-ket')?.value.trim() || '';

    if (!nisn) { alert('Silakan pilih kelas dan nama siswa terlebih dahulu!'); return; }

    const tanggal = getTodayWIB();
    const petugas = getPetugasPiketName();
    const ketFinal = ketRaw ? `[Piket: ${petugas}] ${ketRaw}` : `[Piket: ${petugas}] Dicatat ${status} oleh Piket`;

    try {
        const existing = await queryTurso(`SELECT id FROM presensi WHERE nisn = ${escapeSqlStr(nisn)} AND tanggal = ${escapeSqlStr(tanggal)} LIMIT 1`, [], true);

        if (existing && existing.length > 0) {
            await queryTurso(`UPDATE presensi SET jam_masuk = '-', jam_pulang = '-', status = ${escapeSqlStr(status)}, keterangan = ${escapeSqlStr(ketFinal)} WHERE id = ${existing[0].id}`, [], true);
        } else {
            await queryTurso(`INSERT INTO presensi (nisn, tanggal, jam_masuk, jam_pulang, status, keterangan) VALUES (${escapeSqlStr(nisn)}, ${escapeSqlStr(tanggal)}, '-', '-', ${escapeSqlStr(status)}, ${escapeSqlStr(ketFinal)})`, [], true);
        }

        document.getElementById('piket-sakit-ket').value = '';
        alert(`Status ${status} berhasil disimpan!`);
        await muatRekapPiketHarian();
    } catch (err) {
        alert('Gagal menyimpan ketidakhadiran: ' + err.message);
    }
};

// ============================================================================
// 4. MEMUAT REKAP PRESENSI MANUAL HARIAN
// ============================================================================
window.muatRekapPiketHarian = async function() {
    const tbody = document.getElementById('tabel-piket-rekap-body');
    if (!tbody) return;

    const tanggal = document.getElementById('filter-piket-tanggal')?.value || getTodayWIB();
    tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Memuat data...</td></tr>';

    try {
        const rows = await queryTurso(
            `SELECT id, nisn, tanggal, jam_masuk, jam_pulang, status, keterangan FROM presensi 
             WHERE tanggal = ${escapeSqlStr(tanggal)} 
             AND (status IN ('Sakit', 'Izin', 'Alpa', 'Dispensasi', 'Terlambat', 'Pulang Mendahului', 'Pending Izin') OR COALESCE(keterangan, '') LIKE '%Piket%') 
             ORDER BY id DESC`, [], true
        );

        if (!rows || rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400">Belum ada catatan pada tanggal ${tanggal}.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(r => {
            const siswa = siswaMapPiket[String(r.nisn).trim()] || {};
            const jamInfo = r.jam_pulang && r.jam_pulang !== '-' ? `${r.tanggal} (${r.jam_masuk || '-'} - ${r.jam_pulang})` : `${r.tanggal} (${r.jam_masuk || '-'})`;
            let badgeClass = 'bg-slate-100 text-slate-700';
            if (r.status === 'Hadir') badgeClass = 'bg-emerald-100 text-emerald-800';
            else if (r.status === 'Terlambat' || r.status === 'Pulang Mendahului') badgeClass = 'bg-amber-100 text-amber-800';
            else if (r.status === 'Sakit' || r.status === 'Izin' || r.status === 'Dispensasi') badgeClass = 'bg-blue-100 text-blue-800';
            else if (r.status === 'Alpa') badgeClass = 'bg-red-100 text-red-800';

            return `
                <tr class="hover:bg-slate-50 border-b border-slate-200">
                    <td class="p-3 font-mono text-[11px] whitespace-nowrap">${jamInfo}</td>
                    <td class="p-3 font-mono font-bold text-slate-700">${r.nisn}</td>
                    <td class="p-3 font-bold text-slate-800">${siswa.nama || '-'}</td>
                    <td class="p-3 text-center font-bold text-blue-900">${siswa.kelas || '-'}</td>
                    <td class="p-3 text-center"><span class="px-2.5 py-1 rounded-full text-[11px] font-bold ${badgeClass}">${r.status}</span></td>
                    <td class="p-3 text-xs text-slate-600">${r.keterangan || '-'}</td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Gagal memuat data: ${err.message}</td></tr>`;
    }
};

// ============================================================================
// 5. ANTREAN VERIFIKASI PENGAJUAN IZIN MANDIRI SISWA
// ============================================================================
window.muatAntreanIzinSiswa = async function() {
    const tbody = document.getElementById('tabel-antrean-izin-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-400">Memuat antrean izin...</td></tr>';

    try {
        const rows = await queryTurso(
            `SELECT id, nisn, tanggal, jam_masuk, status, keterangan FROM presensi 
             WHERE status = 'Pending Izin' OR LOWER(status) LIKE '%pending%' 
             ORDER BY tanggal DESC, id DESC`, [], true
        );

        if (!rows || rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-400">Tidak ada pengajuan izin.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(r => {
            const siswa = siswaMapPiket[String(r.nisn).trim()] || {};
            const ketRaw = String(r.keterangan || '');
            const urlMatch = ketRaw.match(/(https?:\/\/[^\s]+)/);
            const linkFotoHtml = urlMatch
                ? `<a href="${urlMatch[1]}" target="_blank" class="bg-indigo-100 text-indigo-800 px-2 py-1 rounded font-bold">Lihat Bukti</a>`
                : '<span class="text-slate-400 italic">Tidak ada</span>';
            const alasanBersih = ketRaw.replace(/\|?\s*Link:\s*https?:\/\/[^\s]+/gi, '').trim() || '-';

            return `
                <tr class="hover:bg-purple-50/40 border-b border-slate-200">
                    <td class="p-3 font-mono text-[11px] whitespace-nowrap">${r.tanggal}<br><span class="text-slate-400">${r.jam_masuk || '-'}</span></td>
                    <td class="p-3 font-mono font-bold">${r.nisn}</td>
                    <td class="p-3 font-bold text-slate-800">${siswa.nama || '-'}</td>
                    <td class="p-3 text-center font-bold text-blue-900">${siswa.kelas || '-'}</td>
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
                        <button onclick="verifikasiPengajuanIzin(${r.id})" class="bg-purple-700 hover:bg-purple-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer">
                            Verifikasi
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-red-500">Gagal memuat antrean: ${err.message}</td></tr>`;
    }
};

window.verifikasiPengajuanIzin = async function(idPresensi) {
    const selectEl = document.getElementById(`status-verif-${idPresensi}`);
    const statusBaru = selectEl ? selectEl.value : 'Izin';
    
    if (!confirm(`Verifikasi pengajuan ini dengan status "${statusBaru}"?`)) return;

    const petugas = getPetugasPiketName();

    try {
        // 1. Ambil data keterangan yang ada saat ini
        const currentData = await queryTurso(`SELECT keterangan FROM presensi WHERE id = ${idPresensi}`, [], true);
        const ketLama = currentData && currentData.length > 0 ? String(currentData[0].keterangan || '') : '';
        
        // 2. Gabungkan dengan catatan verifikasi piket (Menggunakan JavaScript, bukan SQL)
        const ketBaru = ketLama 
            ? `${ketLama} [Diverifikasi Piket: ${petugas}]` 
            : `[Diverifikasi Piket: ${petugas}]`;

        // 3. Jalankan UPDATE dengan format string yang sudah diamankan
        const sql = `UPDATE presensi SET status = ${escapeSqlStr(statusBaru)}, keterangan = ${escapeSqlStr(ketBaru)} WHERE id = ${idPresensi}`;
        
        await queryTurso(sql, [], true);
        
        alert(`Pengajuan izin berhasil diverifikasi menjadi ${statusBaru}!`);
        await Promise.all([muatAntreanIzinSiswa(), muatRekapPiketHarian()]);
    } catch (err) {
        console.error("Detail Error:", err);
        alert('Gagal memverifikasi pengajuan: ' + err.message);
    }
};

window.logout = function () {
    if (!confirm('Keluar dari Pos Pelayanan Guru Piket?')) return;
    localStorage.removeItem('smada_user');
    localStorage.removeItem('smada_token');
    localStorage.removeItem('smada_role');
    window.location.replace('index.html');
};
