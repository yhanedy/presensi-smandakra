/* ==========================================================================
   SMAN 2 KARANGANYAR - PORTAL BK & STP2K (FULL VERSION)
   ========================================================================== */
let daftarSiswaBK = [];
let daftarKelasBK = [];
let siswaMapByNisn = {};
let semuaPelanggaranBK = [];
let skemaKedisiplinanCache = null;
let halamanPelanggaran = 1;
const PER_HALAMAN_PELANGGARAN = 15;

document.addEventListener('DOMContentLoaded', async () => {
    perbaikiTampilanHeaderMobile();

    try {
        const rawUser = localStorage.getItem('smada_user');
        if (rawUser) {
            const user = JSON.parse(rawUser);
            const elUser = document.getElementById('display-user-name');
            if (elUser) elUser.textContent = user.nama || user.username || 'Guru BK';
        }
    } catch (_) {}

    const elTgl = document.getElementById('pelanggaran-tanggal');
    if (elTgl && !elTgl.value) {
        elTgl.value = getTanggalHariIniWIB();
    }

    await muatDaftarKelasDanSiswaBK();
    await muatDataPelanggaranDariDB();
});

function perbaikiTampilanHeaderMobile() {
    if (document.getElementById('bk-mobile-fix-style')) return;
    const style = document.createElement('style');
    style.id = 'bk-mobile-fix-style';
    style.textContent = `
        @media (max-width: 640px) {
            header > div, header div[class*="flex"] { flex-wrap: wrap !important; gap: 6px !important; }
            header button, header span { font-size: 11px !important; padding: 6px 9px !important; }
        }
        @media print { .no-print { display: none !important; } }
    `;
    document.head.appendChild(style);
}

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

// Helper khusus untuk mencegah SQL Injection di Raw Query
function escapeSqlStr(str) {
    return "'" + String(str ?? '').replace(/'/g, "''") + "'";
}

async function getKolomKedisiplinan() {
    if (Array.isArray(skemaKedisiplinanCache) && skemaKedisiplinanCache.length > 0) return skemaKedisiplinanCache;
    try {
        const infoCols = await queryTurso("PRAGMA table_info(kedisiplinan)", [], true);
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
// 1. SIMPAN CATATAN KEDISIPLINAN (RAW QUERY)
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

        const validCols = Object.keys(payload).filter(k => cols.includes(k));
        const colNames = validCols.join(', ');
        const colValues = validCols.map(k => escapeSqlStr(payload[k])).join(', ');

        const sql = `INSERT INTO kedisiplinan (${colNames}) VALUES (${colValues})`;
        console.log("QUERY RAW INSERT:", sql);

        await queryTurso(sql, [], true);

        alert(`Catatan kedisiplinan untuk ${siswa.nama} berhasil disimpan!`);
        if (elCatatan) elCatatan.value = '';
        halamanPelanggaran = 1;
        await muatDataPelanggaranDariDB(true);
    } catch (err) {
        console.error("Error Insert:", err);
        alert("Gagal menyimpan:\n" + err.message);
    }
};

// ==========================================================================
// 2. SIMPAN STATUS SAKIT / IZIN / ALPA
// ==========================================================================
window.simpanPresensiBK = async function () {
    const elKelas = document.getElementById('bk-kelas');
    const elNisn = document.getElementById('bk-nisn');
    const elStatus = document.getElementById('bk-status');
    const elKet = document.getElementById('bk-keterangan');

    const kelas = String(elKelas ? elKelas.value : '').trim();
    const status = String(elStatus ? elStatus.value : '').trim();
    const keterangan = String(elKet ? elKet.value : '').trim();
    const siswa = ambilInfoSiswaDariSelect(elKelas, elNisn);

    if (!kelas || !siswa.nisn || siswa.nisn === '-' || !status) {
        alert("Silakan pilih Kelas, Nama Siswa, dan Status Kehadiran!");
        return;
    }

    try {
        const userLogin = JSON.parse(localStorage.getItem('smada_user') || '{}');
        const pencatat = userLogin.nama || userLogin.username || 'Guru BK';
        const tanggal = getTanggalHariIniWIB();
        const jam = getWaktuSekarangWIB();
        const ketLengkap = `${keterangan || status} [Input BK: ${pencatat}]`;
        const nisnNoZero = siswa.nisn.replace(/^0+/, '');

        const cek = await queryTurso(
            `SELECT id FROM presensi WHERE tanggal = ${escapeSqlStr(tanggal)} AND TRIM(CAST(nisn AS TEXT)) IN (${escapeSqlStr(siswa.nisn)}, ${escapeSqlStr(nisnNoZero)}) LIMIT 1`,
            [], true
        );

        if (cek && cek.length > 0) {
            await queryTurso(
                `UPDATE presensi SET status = ${escapeSqlStr(status)}, keterangan = ${escapeSqlStr(ketLengkap)} WHERE id = ${Number(cek[0].id)}`,
                [], true
            );
        } else {
            await queryTurso(
                `INSERT INTO presensi (tanggal, nisn, jam_masuk, status, keterangan) VALUES (${escapeSqlStr(tanggal)}, ${escapeSqlStr(siswa.nisn)}, ${escapeSqlStr(jam)}, ${escapeSqlStr(status)}, ${escapeSqlStr(ketLengkap)})`,
                [], true
            );
        }

        alert(`Status ${status} untuk ${siswa.nama} berhasil disimpan!`);
        if (elKet) elKet.value = '';
    } catch (err) {
        alert("Gagal menyimpan status ketidakhadiran:\n" + err.message);
    }
};

// ==========================================================================
// 3. MODAL & SIMPAN IZIN PULANG MENDAHULUI
// ==========================================================================
window.bukaModalPulangMendahului = function () {
    document.getElementById('modal-pulang-mendahului')?.classList.remove('hidden');
};
window.tutupModalPulangMendahului = function () {
    document.getElementById('modal-pulang-mendahului')?.classList.add('hidden');
};

window.simpanPulangMendahului = async function () {
    const elKelas = document.getElementById('pulang-kelas');
    const elNisn = document.getElementById('pulang-nisn');
    const elAlasan = document.getElementById('pulang-alasan');

    const kelas = String(elKelas ? elKelas.value : '').trim();
    const alasan = String(elAlasan ? elAlasan.value : '').trim();
    const siswa = ambilInfoSiswaDariSelect(elKelas, elNisn);

    if (!kelas || !siswa.nisn || siswa.nisn === '-' || !alasan) {
        alert("Silakan pilih Kelas, Nama Siswa, dan isi Alasan Pulang!");
        return;
    }

    try {
        const userLogin = JSON.parse(localStorage.getItem('smada_user') || '{}');
        const pencatat = userLogin.nama || userLogin.username || 'Guru BK';
        const tanggal = getTanggalHariIniWIB();
        const jamPulang = getWaktuSekarangWIB();
        const ketBaru = `Pulang Mendahului (${jamPulang}): ${alasan} [oleh ${pencatat}]`;
        const nisnNoZero = siswa.nisn.replace(/^0+/, '');

        const cek = await queryTurso(
            `SELECT id FROM presensi WHERE tanggal = ${escapeSqlStr(tanggal)} AND TRIM(CAST(nisn AS TEXT)) IN (${escapeSqlStr(siswa.nisn)}, ${escapeSqlStr(nisnNoZero)}) LIMIT 1`,
            [], true
        );

        if (cek && cek.length > 0) {
            await queryTurso(
                `UPDATE presensi SET jam_pulang = ${escapeSqlStr(jamPulang)}, keterangan = ${escapeSqlStr(ketBaru)} WHERE id = ${Number(cek[0].id)}`,
                [], true
            );
        } else {
            await queryTurso(
                `INSERT INTO presensi (tanggal, nisn, jam_masuk, jam_pulang, status, keterangan) VALUES (${escapeSqlStr(tanggal)}, ${escapeSqlStr(siswa.nisn)}, ${escapeSqlStr(jamPulang)}, ${escapeSqlStr(jamPulang)}, 'Izin', ${escapeSqlStr(ketBaru)})`,
                [], true
            );
        }

        alert(`Izin pulang mendahului untuk ${siswa.nama} berhasil disimpan!`);
        if (elAlasan) elAlasan.value = '';
        tutupModalPulangMendahului();
    } catch (err) {
        alert("Gagal menyimpan izin pulang:\n" + err.message);
    }
};

// ==========================================================================
// 4. TABEL KEDISIPLINAN & PAGINATION
// ==========================================================================
async function muatDataPelanggaranDariDB(forceTurso = false) {
    const tbody = document.getElementById('tabel-pelanggaran-body');
    if (!tbody) return;
    
    try {
        const rows = await queryTurso("SELECT * FROM kedisiplinan ORDER BY id DESC LIMIT 300", [], true);
        semuaPelanggaranBK = rows || [];
        renderTabelPelanggaran();
    } catch (err) {
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-red-500">Gagal memuat data: ${escapeHtml(err.message)}</td></tr>`;
        }
    }
}

window.muatPelanggaranBK = function (isNext) {
    const totalHalaman = Math.max(1, Math.ceil(semuaPelanggaranBK.length / PER_HALAMAN_PELANGGARAN));
    if (isNext && halamanPelanggaran < totalHalaman) halamanPelanggaran++;
    else if (!isNext && halamanPelanggaran > 1) halamanPelanggaran--;
    renderTabelPelanggaran();
};

function renderTabelPelanggaran() {
    const tbody = document.getElementById('tabel-pelanggaran-body');
    const pageInfo = document.getElementById('page-info-pelanggaran');
    const btnPrev = document.getElementById('btn-prev-pelanggaran');
    const btnNext = document.getElementById('btn-next-pelanggaran');
    if (!tbody) return;

    const totalHalaman = Math.max(1, Math.ceil(semuaPelanggaranBK.length / PER_HALAMAN_PELANGGARAN));
    if (halamanPelanggaran > totalHalaman) halamanPelanggaran = totalHalaman;

    if (pageInfo) pageInfo.textContent = `Halaman ${halamanPelanggaran} dari ${totalHalaman}`;
    if (btnPrev) btnPrev.disabled = halamanPelanggaran <= 1;
    if (btnNext) btnNext.disabled = halamanPelanggaran >= totalHalaman;

    if (semuaPelanggaranBK.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-slate-400">Belum ada catatan kedisiplinan tersimpan.</td></tr>`;
        return;
    }

    const start = (halamanPelanggaran - 1) * PER_HALAMAN_PELANGGARAN;
    const slice = semuaPelanggaranBK.slice(start, start + PER_HALAMAN_PELANGGARAN);

    tbody.innerHTML = slice.map(r => {
        const info = siswaMapByNisn[r.nisn] || { nisn: r.nisn, nama: r.nama_siswa || r.nama || '-', kelas: r.kelas || '-' };
        const tanggal = r.tanggal || '-';
        const waktu = r.waktu_input || '-';
        const catatan = r.catatan_pelanggaran || r.keterangan || '-';
        const penanganan = r.tindak_lanjut || r.penanganan || '-';
        const oleh = r.diinput_oleh || r.dicatat_oleh || 'BK';

        return `
            <tr class="hover:bg-slate-50 border-b border-slate-200">
                <td class="p-3 whitespace-nowrap">${escapeHtml(tanggal)}</td>
                <td class="p-3 whitespace-nowrap text-slate-500">${escapeHtml(waktu)}</td>
                <td class="p-3 whitespace-nowrap font-mono">${escapeHtml(info.nisn)}</td>
                <td class="p-3 font-bold text-slate-800 whitespace-nowrap">${escapeHtml(info.nama)}</td>
                <td class="p-3 whitespace-nowrap">${escapeHtml(info.kelas)}</td>
                <td class="p-3 min-w-[180px]">${escapeHtml(catatan)}</td>
                <td class="p-3 min-w-[160px] text-blue-900 font-medium">${escapeHtml(penanganan)}</td>
                <td class="p-3 text-center whitespace-nowrap">${escapeHtml(oleh)}</td>
                <td class="p-3 text-center whitespace-nowrap space-x-1">
                    <button onclick="bukaModalPenanganan(${r.id})" class="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-[11px] cursor-pointer">
                        Tangani
                    </button>
                    <button onclick="hapusPelanggaranBK(${r.id})" class="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded font-bold text-[11px] cursor-pointer">
                        Hapus
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ==========================================================================
// 5. MODAL & SIMPAN PENANGANAN BK
// ==========================================================================
window.bukaModalPenanganan = function (id) {
    const item = semuaPelanggaranBK.find(r => Number(r.id) === Number(id));
    if (!item) return;

    const info = siswaMapByNisn[item.nisn] || { nama: item.nama_siswa || '-', kelas: item.kelas || '-' };
    
    document.getElementById('modal-pelanggaran-id').value = item.id;
    document.getElementById('modal-nama-siswa').textContent = `${info.nama} (${info.kelas})`;
    document.getElementById('modal-catatan-pelanggaran').textContent = item.catatan_pelanggaran || item.keterangan || '-';

    const existingPenanganan = item.tindak_lanjut || item.penanganan || '';
    document.getElementById('modal-catatan-penanganan').value = existingPenanganan === '-' ? '' : existingPenanganan;
    
    document.getElementById('modal-penanganan').classList.remove('hidden');
};

window.tutupModalPenanganan = function () {
    document.getElementById('modal-penanganan').classList.add('hidden');
};

window.simpanPenangananBK = async function () {
    const id = Number(document.getElementById('modal-pelanggaran-id').value);
    const catatanPenanganan = String(document.getElementById('modal-catatan-penanganan').value || '').trim();

    if (!id || !catatanPenanganan) {
        alert("Tuliskan catatan tindak lanjut / penanganan BK terlebih dahulu!");
        return;
    }

    try {
        const sql = `UPDATE kedisiplinan SET tindak_lanjut = ${escapeSqlStr(catatanPenanganan)} WHERE id = ${id}`;
        console.log("QUERY UPDATE:", sql);

        await queryTurso(sql, [], true);
        
        alert("Catatan penanganan BK berhasil disimpan!");
        tutupModalPenanganan();
        await muatDataPelanggaranDariDB(true);
    } catch (err) {
        alert("Gagal menyimpan penanganan BK:\n" + err.message);
    }
};

window.hapusPelanggaranBK = async function (id) {
    if (!confirm("Hapus catatan kedisiplinan ini secara permanen?")) return;
    try {
        await queryTurso(`DELETE FROM kedisiplinan WHERE id = ${Number(id)}`, [], true);
        await muatDataPelanggaranDariDB(true);
    } catch (err) {
        alert("Gagal menghapus catatan:\n" + err.message);
    }
};

// ==========================================================================
// 6. EKSPOR EXCEL
// ==========================================================================
window.eksporExcelPelanggaranBK = function () {
    if (!semuaPelanggaranBK || semuaPelanggaranBK.length === 0) {
        alert("Belum ada data pelanggaran untuk diekspor.");
        return;
    }
    const dataExport = semuaPelanggaranBK.map((r, idx) => {
        const info = siswaMapByNisn[r.nisn] || { nisn: r.nisn, nama: r.nama_siswa || r.nama || '-', kelas: r.kelas || '-' };
        return {
            No: idx + 1,
            Tanggal: r.tanggal || '-',
            Waktu_Input: r.waktu_input || '-',
            NISN: info.nisn,
            Nama_Siswa: info.nama,
            Kelas: info.kelas,
            Catatan_Pelanggaran: r.catatan_pelanggaran || r.keterangan || '-',
            Penanganan_BK: r.tindak_lanjut || r.penanganan || '-',
            Diinput_Oleh: r.diinput_oleh || r.dicatat_oleh || 'BK'
        };
    });

    const ws = XLSX.utils.json_to_sheet(dataExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kedisiplinan_BK");
    XLSX.writeFile(wb, `Laporan_Kedisiplinan_BK_${getTanggalHariIniWIB()}.xlsx`);
};

window.logout = function () {
    localStorage.removeItem('smada_token');
    localStorage.removeItem('smada_user');
    localStorage.removeItem('smada_role');
    window.location.replace('index.html');
};
