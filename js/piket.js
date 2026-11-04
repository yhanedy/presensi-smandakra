/* ==========================================================================
   SMAN 2 KARANGANYAR - POS GURU PIKET ENGINE (TURSO DB)
   ========================================================================== */

let currentUserSession = null;
const PORTAL_SSO_URL = "index.html";

// Auto-run saat dokumen siap
document.addEventListener('DOMContentLoaded', async () => {
    verifikasiGuruPiket();
    const filterTgl = document.getElementById('filter-piket-tanggal');
    if (filterTgl) filterTgl.value = getTanggalWIB();
    
    await muatDaftarKelasSiswaPiket();
    muatRekapPiketHarian();
    muatAntreanIzinSiswa();
});

/* --------------------------------------------------------------------------
   1. UTILITY WAKTU & SESI USER
   -------------------------------------------------------------------------- */
function getTanggalWIB(d = new Date()) {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(d);
}

function getJamWIB(d = new Date()) {
    return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d).replace(/\./g, ':');
}

function verifikasiGuruPiket() {
    const rawUser = localStorage.getItem('smada_user');
    if (rawUser && rawUser !== "null" && rawUser !== "undefined") {
        try {
            currentUserSession = JSON.parse(rawUser);
            const r = String(currentUserSession.role || '').toLowerCase().trim();
            const isAllowed = r.includes('piket') || r.includes('admin') || r.includes('superadmin') || r.includes('super_admin');

            if (!currentUserSession.username || !isAllowed) {
                alert("Akses Ditolak! Akun Anda tidak memiliki otoritas Guru Piket.");
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
}

function logout() {
    localStorage.removeItem('smada_user');
    window.location.href = PORTAL_SSO_URL;
}

/* --------------------------------------------------------------------------
   2. HELPER DROPDOWN KELAS & SISWA (TRIM SAFE)
   -------------------------------------------------------------------------- */
async function muatDaftarKelasSiswaPiket() {
    const idsKelas = ['piket-masuk-kelas', 'piket-sakit-kelas', 'pulang-kelas'];
    try {
        const res = await queryTurso('SELECT DISTINCT TRIM(kelas) AS kelas FROM siswa WHERE kelas IS NOT NULL AND TRIM(kelas) != "" ORDER BY kelas ASC');
        let options = '<option value="">-- Pilih Kelas --</option>';
        if (res && res.length > 0) {
            options += res.map(k => `<option value="${k.kelas}">${k.kelas}</option>`).join('');
        } else {
            options = '<option value="">-- Data Kelas Kosong --</option>';
        }

        idsKelas.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = options;
        });
    } catch (e) {
        console.error("Gagal muat daftar kelas Piket:", e);
    }
}

async function muatSiswaBerdasarkanKelas(idSelectKelas, idSelectSiswa) {
    const elKelas = document.getElementById(idSelectKelas);
    const selectSiswa = document.getElementById(idSelectSiswa);

    if (!elKelas || !selectSiswa) return;
    const kelasSelected = elKelas.value.trim();

    if (!kelasSelected) {
        selectSiswa.innerHTML = '<option value="">-- Pilih Kelas Dahulu --</option>';
        return;
    }

    selectSiswa.innerHTML = '<option value="">Memuat nama siswa...</option>';

    try {
        const res = await queryTurso(
            'SELECT TRIM(nisn) AS nisn, nama FROM siswa WHERE TRIM(kelas) = TRIM(?) ORDER BY nama ASC', 
            [kelasSelected]
        );

        if (res && res.length > 0) {
            selectSiswa.innerHTML = '<option value="">-- Pilih Nama Siswa --</option>' + 
                res.map(s => `<option value="${s.nisn}">${s.nama} (${s.nisn})</option>`).join('');
        } else {
            selectSiswa.innerHTML = '<option value="">-- Tidak ada siswa di kelas ini --</option>';
        }
    } catch (e) {
        console.error("Gagal muat siswa:", e);
        selectSiswa.innerHTML = '<option value="">Gagal memuat daftar siswa</option>';
    }
}

/* --------------------------------------------------------------------------
   3. PROSES SIMPAN PRESENSI PIKET
   -------------------------------------------------------------------------- */
async function simpanPresensiPiket(status) {
    const nisnInput = status === 'Pulang Mendahului' 
        ? document.getElementById('pulang-nisn').value.trim() 
        : document.getElementById('piket-masuk-nisn').value.trim();
        
    const alasan = status === 'Pulang Mendahului' 
        ? document.getElementById('pulang-alasan').value.trim() 
        : document.getElementById('piket-masuk-ket').value.trim();

    if (!nisnInput) { alert("Silakan pilih Nama Siswa terlebih dahulu!"); return; }

    const tglWIB = getTanggalWIB();
    const jamWIB = getJamWIB();

    try {
        if (status === 'Pulang Mendahului') {
            await queryTurso(
                "INSERT INTO presensi (nisn, tanggal, jam_pulang, status, keterangan) VALUES (?, ?, ?, ?, ?)",
                [nisnInput, tglWIB, jamWIB, 'Pulang Mendahului', alasan || 'Izin Pulang Mendahului via Piket']
            );
        } else {
            await queryTurso(
                "INSERT INTO presensi (nisn, tanggal, jam_masuk, status, keterangan) VALUES (?, ?, ?, ?, ?)",
                [nisnInput, tglWIB, jamWIB, status, alasan || `Presensi Manual Piket (${status})`]
            );
        }

        alert("Presensi berhasil disimpan!");
        document.getElementById('piket-masuk-kelas').value = '';
        document.getElementById('piket-masuk-nisn').innerHTML = '<option value="">-- Pilih Kelas Dahulu --</option>';
        document.getElementById('piket-masuk-ket').value = '';
        
        document.getElementById('pulang-kelas').value = '';
        document.getElementById('pulang-nisn').innerHTML = '<option value="">-- Pilih Kelas Dahulu --</option>';
        document.getElementById('pulang-alasan').value = '';
        
        muatRekapPiketHarian();
    } catch (err) {
        alert("Gagal menyimpan presensi: " + err.message);
    }
}

async function simpanPulangSusulanPiket() {
    const nisn = document.getElementById('piket-masuk-nisn').value.trim();
    const ket = document.getElementById('piket-masuk-ket').value.trim();

    if (!nisn) { alert("Silakan pilih Nama Siswa terlebih dahulu!"); return; }

    const tglWIB = getTanggalWIB();
    const jamWIB = getJamWIB();

    try {
        const cekExist = await queryTurso(
            "SELECT id FROM presensi WHERE TRIM(nisn) = TRIM(?) AND tanggal = ? LIMIT 1",
            [nisn, tglWIB]
        );

        if (cekExist && cekExist.length > 0) {
            await queryTurso(
                "UPDATE presensi SET jam_pulang = ?, keterangan = keterangan || ? WHERE id = ?",
                [jamWIB, ` | Pulang Susulan via Piket (${ket || 'Lupa Absen'})`, cekExist[0].id]
            );
        } else {
            await queryTurso(
                "INSERT INTO presensi (nisn, tanggal, jam_pulang, status, keterangan) VALUES (?, ?, ?, ?, ?)",
                [nisn, tglWIB, jamWIB, 'Hadir', `Presensi Pulang Susulan Piket (${ket || 'Lupa Absen'})`]
            );
        }

        alert("Jam pulang susulan berhasil disimpan!");
        document.getElementById('piket-masuk-kelas').value = '';
        document.getElementById('piket-masuk-nisn').innerHTML = '<option value="">-- Pilih Kelas Dahulu --</option>';
        document.getElementById('piket-masuk-ket').value = '';
        muatRekapPiketHarian();
    } catch (err) {
        alert("Gagal menyimpan jam pulang susulan: " + err.message);
    }
}

async function simpanKetidakhadiranPiket() {
    const nisn = document.getElementById('piket-sakit-nisn').value.trim();
    const status = document.getElementById('piket-sakit-status').value;
    const ket = document.getElementById('piket-sakit-ket').value.trim();

    if (!nisn) { alert("Silakan pilih Nama Siswa terlebih dahulu!"); return; }

    try {
        await queryTurso(
            "INSERT INTO presensi (nisn, tanggal, jam_masuk, status, keterangan) VALUES (?, ?, ?, ?, ?)",
            [nisn, getTanggalWIB(), getJamWIB(), status, ket || `Pencatatan Piket (${status})`]
        );

        alert("Ketidakhadiran berhasil disimpan!");
        document.getElementById('piket-sakit-kelas').value = '';
        document.getElementById('piket-sakit-nisn').innerHTML = '<option value="">-- Pilih Kelas Dahulu --</option>';
        document.getElementById('piket-sakit-ket').value = '';
        muatRekapPiketHarian();
    } catch (err) {
        alert("Gagal menyimpan ketidakhadiran: " + err.message);
    }
}

/* --------------------------------------------------------------------------
   4. REKAP HARIAN & VERIFIKASI IZIN ANTREAN
   -------------------------------------------------------------------------- */
async function muatRekapPiketHarian() {
    const tglEl = document.getElementById('filter-piket-tanggal');
    if (!tglEl) return;
    const tgl = tglEl.value;
    const tbody = document.getElementById('tabel-piket-rekap-body');

    if (!tgl || !tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Memuat data rekap...</td></tr>';

    try {
        const sqlStr = "SELECT p.*, COALESCE(s.nama, 'Siswa') as nama_siswa, COALESCE(s.kelas, '-') as kelas_siswa FROM presensi p LEFT JOIN siswa s ON TRIM(p.nisn) = TRIM(s.nisn) WHERE p.tanggal = ? ORDER BY p.id DESC";
        const data = await queryTurso(sqlStr, [tgl]);

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Tidak ada catatan presensi/izin pada tanggal ini.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(p => `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="p-3 font-mono text-slate-500">${p.tanggal} <span class="font-bold text-blue-900">${p.jam_masuk || p.jam_pulang || ''}</span></td>
                <td class="p-3 font-mono font-bold">${p.nisn}</td>
                <td class="p-3 font-bold text-slate-900">${p.nama_siswa}</td>
                <td class="p-3 font-bold text-blue-900 font-mono text-center">${p.kelas_siswa}</td>
                <td class="p-3 text-center">
                    <span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                        p.status === 'Pulang Mendahului' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                        p.status === 'Sakit' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                        p.status === 'Izin' ? 'bg-purple-100 text-purple-800 border border-purple-300' :
                        p.status === 'Dispensasi' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                        p.status === 'Hadir' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                        'bg-red-100 text-red-800 border border-red-300'
                    }">
                        ${p.status}
                    </span>
                </td>
                <td class="p-3 text-slate-600">${p.keterangan || '-'}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error("Gagal muat rekap piket:", err);
        tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-rose-500 font-bold">Error DB: ${err.message}</td></tr>`;
    }
}

async function muatAntreanIzinSiswa() {
    const tbody = document.getElementById('tabel-antrean-izin-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Memuat antrean permohonan...</td></tr>';

    try {
        const sqlStr = `
            SELECT p.*, 
                   COALESCE(s.nama, 'Siswa') as nama_siswa, 
                   COALESCE(s.kelas, '-') as kelas_siswa 
            FROM presensi p 
            LEFT JOIN siswa s ON TRIM(p.nisn) = TRIM(s.nisn) 
            WHERE p.status IN ('Izin', 'Sakit', 'Dispensasi') 
            ORDER BY p.id DESC LIMIT 25
        `;
        const data = await queryTurso(sqlStr);

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-400 font-bold">Tidak ada antrean permohonan izin siswa saat ini.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(p => {
            let driveUrl = p.foto || p.file_surat || p.url_bukti || null;

            if (!driveUrl && p.keterangan) {
                const urlMatch = p.keterangan.match(/(https?:\/\/[^\s\)\>]+)/i);
                if (urlMatch) driveUrl = urlMatch[0];
            }

            const adaFotoValid = driveUrl && (driveUrl.startsWith('http://') || driveUrl.startsWith('https://') || driveUrl.startsWith('data:image'));

            return `
                <tr class="hover:bg-purple-50/50 border-b border-slate-100" id="row-antrean-${p.id}">
                    <td class="p-3 font-mono text-slate-500 text-[11px]">${p.tanggal}<br><span class="text-blue-600 font-bold">${p.jam_masuk || ''}</span></td>
                    <td class="p-3 font-mono font-bold text-slate-800">${p.nisn}</td>
                    <td class="p-3 font-black text-slate-900">${p.nama_siswa}</td>
                    <td class="p-3 text-center font-black text-blue-900 font-mono">${p.kelas_siswa}</td>
                    <td class="p-3 text-slate-700 font-medium">${p.keterangan || '-'}</td>
                    
                    <td class="p-3 text-center">
                        ${adaFotoValid ? `
                            <a href="${driveUrl}" target="_blank" class="inline-flex items-center gap-1 bg-blue-100 hover:bg-blue-200 text-blue-900 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-blue-300 transition shadow-sm">
                                <i class="fa-solid fa-image text-blue-600"></i> Lihat Surat
                            </a>
                        ` : `
                            <div class="space-y-1">
                                <span class="text-[10px] text-amber-600 font-bold block">Tanpa Foto</span>
                                <input type="text" id="manual-link-${p.id}" placeholder="Tempel Link Foto..." class="w-28 p-1 border border-slate-300 rounded text-[10px] outline-none bg-slate-50 focus:bg-white">
                            </div>
                        `}
                    </td>

                    <td class="p-3 space-y-1.5">
                        <select id="verifikasi-status-${p.id}" class="w-full p-1.5 border border-slate-300 rounded-lg text-xs font-bold bg-white outline-none">
                            <option value="Izin" ${p.status === 'Izin' ? 'selected' : ''}>Izin</option>
                            <option value="Sakit" ${p.status === 'Sakit' ? 'selected' : ''}>Sakit</option>
                            <option value="Alpa">Alpa</option>
                            <option value="Dispensasi" ${p.status === 'Dispensasi' ? 'selected' : ''}>Dispensasi</option>
                        </select>
                    </td>

                    <td class="p-3 text-center">
                        <button onclick="eksekusiVerifikasiIzin(${p.id}, '${p.nisn}')" class="bg-purple-900 hover:bg-purple-950 text-yellow-300 font-black px-3 py-2 rounded-xl text-xs shadow transition border border-yellow-400 cursor-pointer flex items-center justify-center gap-1 mx-auto">
                            <i class="fa-solid fa-circle-check"></i> Verifikasi
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error("Gagal muat antrean izin:", err);
        tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-rose-500 font-bold">Gagal memuat antrean: ${err.message}</td></tr>`;
    }
}

async function eksekusiVerifikasiIzin(id, nisn) {
    const statusFinal = document.getElementById(`verifikasi-status-${id}`).value;
    const manualLinkInput = document.getElementById(`manual-link-${id}`);
    const linkManual = manualLinkInput ? manualLinkInput.value.trim() : "";

    let keteranganBaru = `Diverifikasi Piket (${statusFinal})`;

    if (linkManual) {
        keteranganBaru += ` - Link Surat: ${linkManual}`;
    }

    try {
        if (linkManual) {
            await queryTurso(
                "UPDATE presensi SET status = ?, keterangan = ?, foto = ? WHERE id = ?",
                [statusFinal, keteranganBaru, linkManual, id]
            );
        } else {
            await queryTurso(
                "UPDATE presensi SET status = ?, keterangan = ? WHERE id = ?",
                [statusFinal, keteranganBaru, id]
            );
        }

        alert(`Permohonan NISN ${nisn} berhasil diverifikasi sebagai [${statusFinal}]!`);

        const row = document.getElementById(`row-antrean-${id}`);
        if (row) row.remove();

        muatRekapPiketHarian();
    } catch (err) {
        alert("Gagal memverifikasi permohonan: " + err.message);
    }
}
