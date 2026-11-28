/* ==========================================================================
   SMAN 2 KARANGANYAR - PORTAL BK & STP2K (COMPLETE FIXED VERSION)
   ========================================================================== */
let daftarSiswaBK = [];
let daftarKelasBK = [];
let siswaMapByNisn = {};
let semuaPelanggaranBK = [];
let skemaKedisiplinanCache = null;
let halamanPelanggaran = 1;
const PER_HALAMAN_PELANGGARAN = 15;
let daftarLaporanMasuk = [];
let tabelLaporanAktif = 'laporan_bk';

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

function escapeSqlStr(str) {
    return "'" + String(str ?? '').replace(/'/g, "''") + "'";
}

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
        daftarSiswaBK = (rows || []).map(r => ({
            nisn: String(r.nisn ?? '').trim(),
            nama: String(r.nama ?? '').trim(),
            kelas: String(r.kelas ?? '').trim()
        })).filter(s => s.nisn && s.nama && s.kelas);

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
                opt.value = k; opt.textContent = k;
                el.appendChild(opt);
            });
        });
    } catch (err) { console.error("Gagal memuat daftar siswa:", err); }
}

window.muatSiswaBerdasarkanKelas = function (idSelectKelas, idSelectNisn) {
    const elKelas = document.getElementById(idSelectKelas);
    const elNisn = document.getElementById(idSelectNisn);
    if (!elKelas || !elNisn) return;

    const targetKelas = String(elKelas.value || '').trim().toUpperCase();
    if (!targetKelas) { elNisn.innerHTML = '<option value="">-- Pilih Kelas Dahulu --</option>'; return; }

    const siswaKelas = daftarSiswaBK.filter(s => s.kelas.toUpperCase() === targetKelas);
    elNisn.innerHTML = `<option value="">-- Pilih Nama Siswa (${siswaKelas.length}) --</option>`;

    siswaKelas.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.nisn; opt.dataset.nisn = s.nisn; opt.dataset.nama = s.nama;
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
// SIMPAN PELANGGARAN
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
        alert("Lengkapi Kelas, Nama Siswa, dan Catatan Pelanggaran!"); return;
    }

    const userLogin = JSON.parse(localStorage.getItem('smada_user') || '{}');
    const pencatat = userLogin.nama || userLogin.username || 'Guru BK';
    const waktuLengkap = `${getTanggalHariIniWIB()} ${getWaktuSekarangWIB()}`;

    try {
        const cols = await getKolomKedisiplinan();
        if (cols.length === 0) { alert("Gagal membaca struktur tabel kedisiplinan."); return; }

        const payload = {
            tanggal: tanggal, waktu_input: waktuLengkap, nisn: siswa.nisn,
            nama_siswa: siswa.nama, kelas: siswa.kelas, catatan_pelanggaran: catatan,
            tindak_lanjut: '-', diinput_oleh: pencatat
        };

        const validCols = Object.keys(payload).filter(k => cols.includes(k));
        const colNames = validCols.join(', ');
        const colValues = validCols.map(k => escapeSqlStr(payload[k])).join(', ');

        const sql = `INSERT INTO kedisiplinan (${colNames}) VALUES (${colValues})`;
        await queryTurso(sql, [], true);

        alert(`Catatan kedisiplinan untuk ${siswa.nama} berhasil disimpan!`);
        if (elCatatan) elCatatan.value = '';
        halamanPelanggaran = 1;
        await muatDataPelanggaranDariDB(true);
    } catch (err) { alert("Gagal menyimpan:\n" + err.message); }
};

// ==========================================================================
// SIMPAN SAKIT / IZIN / ALPA
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
        alert("Silakan pilih Kelas, Nama Siswa, dan Status Kehadiran!"); return;
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
            await queryTurso(`UPDATE presensi SET status = ${escapeSqlStr(status)}, keterangan = ${escapeSqlStr(ketLengkap)} WHERE id = ${Number(cek[0].id)}`, [], true);
        } else {
            await queryTurso(`INSERT INTO presensi (tanggal, nisn, jam_masuk, status, keterangan) VALUES (${escapeSqlStr(tanggal)}, ${escapeSqlStr(siswa.nisn)}, ${escapeSqlStr(jam)}, ${escapeSqlStr(status)}, ${escapeSqlStr(ketLengkap)})`, [], true);
        }
        alert(`Status ${status} untuk ${siswa.nama} berhasil disimpan!`);
        if (elKet) elKet.value = '';
    } catch (err) { alert("Gagal menyimpan status ketidakhadiran:\n" + err.message); }
};

// ==========================================================================
// MODAL & SIMPAN PULANG MENDAHULUI
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
        alert("Silakan pilih Kelas, Nama Siswa, dan isi Alasan Pulang!"); return;
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
            await queryTurso(`UPDATE presensi SET jam_pulang = ${escapeSqlStr(jamPulang)}, keterangan = ${escapeSqlStr(ketBaru)} WHERE id = ${Number(cek[0].id)}`, [], true);
        } else {
            await queryTurso(`INSERT INTO presensi (tanggal, nisn, jam_masuk, jam_pulang, status, keterangan) VALUES (${escapeSqlStr(tanggal)}, ${escapeSqlStr(siswa.nisn)}, ${escapeSqlStr(jamPulang)}, ${escapeSqlStr(jamPulang)}, 'Izin', ${escapeSqlStr(ketBaru)})`, [], true);
        }

        alert(`Izin pulang mendahului untuk ${siswa.nama} berhasil disimpan!`);
        if (elAlasan) elAlasan.value = '';
        tutupModalPulangMendahului();
    } catch (err) { alert("Gagal menyimpan izin pulang:\n" + err.message); }
};

// ==========================================================================
// TABEL KEDISIPLINAN & PAGINATION
// ==========================================================================
async function muatDataPelanggaranDariDB(forceTurso = false) {
    const tbody = document.getElementById('tabel-pelanggaran-body');
    if (!tbody) return;
    try {
        const rows = await queryTurso("SELECT * FROM kedisiplinan ORDER BY id DESC LIMIT 300", [], true);
        semuaPelanggaranBK = rows || [];
        renderTabelPelanggaran();
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-red-500">Gagal memuat data: ${escapeHtml(err.message)}</td></tr>`;
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
// PENANGANAN BK & HAPUS
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
    if (!id || !catatanPenanganan) { alert("Tuliskan catatan tindak lanjut / penanganan BK terlebih dahulu!"); return; }
    try {
        const sql = `UPDATE kedisiplinan SET tindak_lanjut = ${escapeSqlStr(catatanPenanganan)} WHERE id = ${id}`;
        await queryTurso(sql, [], true);
        alert("Catatan penanganan BK berhasil disimpan!");
        tutupModalPenanganan();
        await muatDataPelanggaranDariDB(true);
    } catch (err) { alert("Gagal menyimpan penanganan BK:\n" + err.message); }
};

window.hapusPelanggaranBK = async function (id) {
    if (!confirm("Hapus catatan kedisiplinan ini secara permanen?")) return;
    try {
        await queryTurso(`DELETE FROM kedisiplinan WHERE id = ${Number(id)}`, [], true);
        await muatDataPelanggaranDariDB(true);
    } catch (err) { alert("Gagal menghapus catatan:\n" + err.message); }
};

// ==========================================================================
// LAPORAN ANONIM
// ==========================================================================
window.bukaModalLaporanBK = async function () {
    document.getElementById('modal-laporan-bk')?.classList.remove('hidden');
    await muatDaftarLaporanAnonim();
};
window.tutupModalLaporanBK = function () {
    document.getElementById('modal-laporan-bk')?.classList.add('hidden');
};

async function muatDaftarLaporanAnonim() {
    const tbody = document.getElementById('tabel-laporan-body');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400">Memuat laporan masuk...</td></tr>`;
    try {
        const rows = await queryTurso(`SELECT * FROM ${tabelLaporanAktif} ORDER BY id DESC LIMIT 100`, [], true);
        daftarLaporanMasuk = rows || [];
        if (daftarLaporanMasuk.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400">Belum ada laporan masuk.</td></tr>`; return;
        }
        tbody.innerHTML = daftarLaporanMasuk.map(r => {
            const waktu = r.waktu_input || r.created_at || r.tanggal || '-';
            const pelapor = (r.is_anonim === 1 || r.anonim === 1 || r.nisn === 'ANONIM') ? '<span class="px-2 py-0.5 bg-purple-100 text-purple-800 rounded font-bold">Anonim</span>' : `${escapeHtml(r.nama || r.nama_pelapor || '-')} (${escapeHtml(r.kelas || '-')})`;
            const kategori = r.kategori || r.jenis_laporan || 'Pengaduan';
            const isi = r.kronologi || r.isi_laporan || r.isi || r.deskripsi || '-';
            const status = r.status || 'pending';
            const tl = r.tindak_lanjut ? `<div class="mt-1 text-[11px] text-blue-800 bg-blue-50 p-1.5 rounded"><strong>TL:</strong> ${escapeHtml(r.tindak_lanjut)}</div>` : '';

            return `
                <tr class="border-b border-slate-200 hover:bg-slate-50">
                    <td class="p-2 border border-slate-200 whitespace-nowrap">${escapeHtml(waktu)}</td>
                    <td class="p-2 border border-slate-200">${pelapor}</td>
                    <td class="p-2 border border-slate-200 font-semibold">${escapeHtml(kategori)}</td>
                    <td class="p-2 border border-slate-200">${escapeHtml(isi)}${tl}</td>
                    <td class="p-2 border border-slate-200 text-center uppercase font-bold">${escapeHtml(status)}</td>
                    <td class="p-2 border border-slate-200 text-center">
                        <button onclick="bukaModalTindakLanjut(${r.id})" class="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-[11px] cursor-pointer">
                            Proses
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) { tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Gagal memuat laporan: ${escapeHtml(err.message)}</td></tr>`; }
}

window.bukaModalTindakLanjut = function (id) {
    const item = daftarLaporanMasuk.find(r => Number(r.id) === Number(id));
    if (!item) return;
    document.getElementById('tl-laporan-id').value = item.id;
    document.getElementById('tl-status').value = String(item.status || 'pending').toLowerCase();
    document.getElementById('tl-catatan').value = item.tindak_lanjut || '';
    document.getElementById('modal-tindak-lanjut').classList.remove('hidden');
};

window.tutupModalTindakLanjut = function () {
    document.getElementById('modal-tindak-lanjut').classList.add('hidden');
};

window.simpanTindakLanjut = async function () {
    const id = Number(document.getElementById('tl-laporan-id').value);
    const status = document.getElementById('tl-status').value;
    const catatan = String(document.getElementById('tl-catatan').value || '').trim();
    try {
        await queryTurso(`UPDATE ${tabelLaporanAktif} SET status = ${escapeSqlStr(status)}, tindak_lanjut = ${escapeSqlStr(catatan)} WHERE id = ${id}`, [], true);
        alert("Tindak lanjut laporan berhasil diperbarui!");
        tutupModalTindakLanjut();
        await muatDaftarLaporanAnonim();
    } catch (err) { alert("Gagal menyimpan tindak lanjut:\n" + err.message); }
};

// ==========================================================================
// MODAL CARI SISWA
// ==========================================================================
window.bukaModalCariSiswa = function () {
    document.getElementById('modal-cari-siswa')?.classList.remove('hidden');
    eksekusiCariSiswaBK();
};
window.tutupModalCariSiswa = function () {
    document.getElementById('modal-cari-siswa')?.classList.add('hidden');
};

window.eksekusiCariSiswaBK = function () {
    const tbody = document.getElementById('tabel-hasil-cari-body');
    if (!tbody) return;
    const kw = String(document.getElementById('cari-keyword-siswa')?.value || '').trim().toLowerCase();
    const filterKelas = String(document.getElementById('cari-kelas-siswa')?.value || '').trim().toUpperCase();

    const hasil = semuaPelanggaranBK.filter(r => {
        const info = siswaMapByNisn[r.nisn] || { nisn: r.nisn, nama: r.nama_siswa || r.nama || '-', kelas: r.kelas || '-' };
        const nama = String(info.nama).toLowerCase();
        const kelas = String(info.kelas).toUpperCase();
        const nisn = String(info.nisn).toLowerCase();
        const cocokKelas = !filterKelas || kelas === filterKelas;
        const cocokKw = !kw || nama.includes(kw) || nisn.includes(kw);
        return cocokKelas && cocokKw;
    });

    if (hasil.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-400">Tidak ada riwayat kedisiplinan yang cocok.</td></tr>`; return;
    }

    tbody.innerHTML = hasil.map(r => {
        const info = siswaMapByNisn[r.nisn] || { nisn: r.nisn, nama: r.nama_siswa || r.nama || '-', kelas: r.kelas || '-' };
        const waktu = r.waktu_input || r.created_at || r.tanggal || '-';
        const catatan = r.catatan_pelanggaran || r.keterangan || '-';
        const penanganan = r.tindak_lanjut || r.penanganan || '-';
        return `
            <tr class="border-b border-slate-200">
                <td class="p-2 border border-slate-200 whitespace-nowrap">${escapeHtml(waktu)}</td>
                <td class="p-2 border border-slate-200 font-mono">${escapeHtml(info.nisn)}</td>
                <td class="p-2 border border-slate-200 font-bold">${escapeHtml(info.nama)}</td>
                <td class="p-2 border border-slate-200">${escapeHtml(info.kelas)}</td>
                <td class="p-2 border border-slate-200">${escapeHtml(catatan)}</td>
                <td class="p-2 border border-slate-200">${escapeHtml(penanganan)}</td>
                <td class="p-2 border border-slate-200 text-center no-print">
                    <button onclick="tutupModalCariSiswa(); bukaModalPenanganan(${r.id});" class="px-2 py-1 bg-blue-600 text-white rounded font-bold text-[11px] cursor-pointer">
                        Tangani
                    </button>
                </td>
            </tr>
        `;
    }).join('');
};

window.cetakPDFLaporanBK = function () {
    window.print();
};

// ==========================================================================
// LOGOUT & EXCEL
// ==========================================================================
window.logout = function () {
    localStorage.removeItem('smada_token');
    localStorage.removeItem('smada_user');
    localStorage.removeItem('smada_role');
    window.location.replace('index.html');
};

window.eksporExcelPelanggaranBK = function () {
    if (!semuaPelanggaranBK || semuaPelanggaranBK.length === 0) { alert("Belum ada data pelanggaran untuk diekspor."); return; }
    const dataExport = semuaPelanggaranBK.map((r, idx) => {
        const info = siswaMapByNisn[r.nisn] || { nisn: r.nisn, nama: r.nama_siswa || r.nama || '-', kelas: r.kelas || '-' };
        return {
            No: idx + 1, Tanggal: r.tanggal || '-', Waktu_Input: r.waktu_input || '-',
            NISN: info.nisn, Nama_Siswa: info.nama, Kelas: info.kelas,
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
