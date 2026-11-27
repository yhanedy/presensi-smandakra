/* ==========================================================================
   SMAN 2 KARANGANYAR - PORTAL BIMBINGAN KONSELING & STP2K (js/bk.js)
   - Proteksi Anti NULL pada NISN (Mencegah NOT NULL constraint failed)
   - Auto-Create Tabel laporan_bk (Mencegah no such table: laporan_bk)
   - 100% Sinkron dengan seluruh ID & Event Onclick di bk.html
   ========================================================================== */

let daftarSiswaBK = [];
let daftarKelasBK = [];
let siswaMapByNisn = {};
let kolomTabelCache = {};
let semuaPelanggaranBK = [];
let halamanPelanggaran = 1;
const PER_HALAMAN_PELANGGARAN = 15;

document.addEventListener('DOMContentLoaded', async () => {
    perbaikiTampilanHeaderMobile();

    const rawUser = localStorage.getItem('smada_user');
    if (!rawUser) return;

    try {
        const user = JSON.parse(rawUser);
        const elUser = document.getElementById('display-user-name');
        if (elUser) elUser.textContent = user.nama || user.username || 'Guru BK';
    } catch (_) {}

    const elTgl = document.getElementById('pelanggaran-tanggal');
    if (elTgl && !elTgl.value) {
        elTgl.value = getTanggalHariIniWIB();
    }

    await inisialisasiPortalBK();
});

// ==========================================================================
// 0. HELPER TANGGAL, LAYOUT HP & DINAMIS SCHEMA DB
// ==========================================================================
function perbaikiTampilanHeaderMobile() {
    if (document.getElementById('bk-mobile-fix-style')) return;
    const style = document.createElement('style');
    style.id = 'bk-mobile-fix-style';
    style.textContent = `
        @media (max-width: 640px) {
            header > div, header div[class*="flex"] {
                flex-wrap: wrap !important;
                gap: 6px !important;
            }
            header button, header span {
                font-size: 11px !important;
                padding: 6px 9px !important;
            }
        }
        @media print {
            .no-print { display: none !important; }
        }
    `;
    document.head.appendChild(style);
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

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
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
        if (val === undefined || val === null) continue;
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

async function updateDinamis(namaTabel, id, kandidatData) {
    const cols = await getKolomTabel(namaTabel);
    const setClauses = [];
    const nilaiUpdate = [];

    for (const [key, val] of Object.entries(kandidatData)) {
        if (val === undefined) continue;
        if (cols.length === 0 || cols.includes(key.toLowerCase())) {
            setClauses.push(`${key} = ?`);
            nilaiUpdate.push(val);
        }
    }

    if (setClauses.length === 0) {
        throw new Error(`Kolom update tidak ditemukan di tabel ${namaTabel}.`);
    }

    nilaiUpdate.push(id);
    await queryTurso(
        `UPDATE ${namaTabel} SET ${setClauses.join(', ')} WHERE id = ?`,
        nilaiUpdate
    );
}

// ==========================================================================
// 1. INISIALISASI & DROPDOWN KELAS / SISWA
// ==========================================================================
async function inisialisasiPortalBK() {
    try {
        await getKolomTabel('kedisiplinan');
        await getKolomTabel('presensi');
        await muatDaftarKelasDanSiswaBK();
        await muatDataPelanggaranDariDB();
    } catch (err) {
        console.error("Gagal inisialisasi Portal BK:", err);
    }
}

async function muatDaftarKelasDanSiswaBK() {
    try {
        // Hapus cache lama jika formatnya tidak lengkap
        const cached = sessionStorage.getItem('smada_bk_siswa_cache_v2');
        let rows = cached ? JSON.parse(cached) : null;

        if (!Array.isArray(rows) || rows.length === 0) {
            rows = await queryTurso("SELECT nisn, nama, kelas FROM siswa ORDER BY kelas ASC, nama ASC");
            if (Array.isArray(rows) && rows.length > 0) {
                sessionStorage.setItem('smada_bk_siswa_cache_v2', JSON.stringify(rows));
            }
        }

        daftarSiswaBK = (rows || [])
            .filter(r => !r.status_siswa || String(r.status_siswa).toUpperCase() === 'AKTIF')
            .map(r => {
                // Pastikan NISN selalu string valid 10 digit jika asalnya angka tanpa leading zero
                let rawNisn = String(r.nisn ?? r.NISN ?? '').trim();
                if (/^\d{8,9}$/.test(rawNisn)) {
                    rawNisn = rawNisn.padStart(10, '0');
                }
                return {
                    nisn: rawNisn,
                    nama: String(r.nama ?? r.NAMA ?? '').trim(),
                    kelas: String(r.kelas ?? r.KELAS ?? '').trim()
                };
            })
            .filter(s => s.nisn && s.nama && s.kelas);

        siswaMapByNisn = {};
        daftarSiswaBK.forEach(s => {
            siswaMapByNisn[s.nisn] = s;
            siswaMapByNisn[s.nisn.replace(/^0+/, '')] = s;
        });

        daftarKelasBK = [...new Set(daftarSiswaBK.map(s => s.kelas))].sort((a, b) =>
            a.localeCompare(b, 'id', { numeric: true })
        );

        ['pelanggaran-kelas', 'bk-kelas', 'pulang-kelas'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.innerHTML = '<option value="">-- Pilih Kelas --</option>';
            daftarKelasBK.forEach(k => {
                const opt = document.createElement('option');
                opt.value = k;
                opt.textContent = k;
                el.appendChild(opt);
            });
        });

        const elCariKelas = document.getElementById('cari-kelas-siswa');
        if (elCariKelas) {
            elCariKelas.innerHTML = '<option value="">-- Semua Kelas --</option>';
            daftarKelasBK.forEach(k => {
                const opt = document.createElement('option');
                opt.value = k;
                opt.textContent = k;
                elCariKelas.appendChild(opt);
            });
        }
    } catch (err) {
        console.error("Gagal memuat daftar siswa BK:", err);
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

    // Cadangan 1: Ekstrak NISN dari teks option "NAMA SISWA (0096525239)" jika value kosong
    if (!nisn && opt && opt.textContent) {
        const m = opt.textContent.match(/\((\d{6,})\)/);
        if (m) nisn = m[1];
        if (!nama) nama = opt.textContent.replace(/\s*\(\d{6,}\)\s*$/, '').trim();
    }

    // Cadangan 2: Cari di memori daftarSiswaBK berdasarkan kelas & nama
    if (!nisn && kelas && nama) {
        const found = daftarSiswaBK.find(
            s => s.kelas.toUpperCase() === kelas.toUpperCase() && s.nama.toLowerCase() === nama.toLowerCase()
        );
        if (found) {
            nisn = found.nisn;
            nama = found.nama;
        }
    }

    const mapped = siswaMapByNisn[nisn] || siswaMapByNisn[nisn.replace(/^0+/, '')];
    if (mapped) {
        if (!nama) nama = mapped.nama;
        if (!nisn) nisn = mapped.nisn;
    }

    return {
        nisn: String(nisn || '').trim(),
        nama: nama || '-',
        kelas: kelas || (mapped ? mapped.kelas : '-')
    };
}

function ambilInfoSiswaByNisn(kelas, nisn) {
    const cleanNisn = String(nisn || '').trim();
    const s = siswaMapByNisn[cleanNisn] || siswaMapByNisn[cleanNisn.replace(/^0+/, '')];
    return {
        nisn: cleanNisn,
        nama: s ? s.nama : '-',
        kelas: kelas || (s ? s.kelas : '-')
    };
}

// ==========================================================================
// 2. SIMPAN CATATAN KEDISIPLINAN / PELANGGARAN (simpanPelanggaranBK)
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

    if (!kelas || !siswa.nisn) {
        alert("Silakan pilih Kelas dan Nama Siswa terlebih dahulu!");
        return;
    }
    if (!catatan) {
        alert("Silakan isi Catatan Pelanggaran terlebih dahulu!");
        return;
    }

    try {
        const userLogin = JSON.parse(localStorage.getItem('smada_user') || '{}');
        const pencatat = userLogin.nama || userLogin.username || 'Guru BK';
        const waktuLengkap = `${getTanggalHariIniWIB()} ${getWaktuSekarangWIB()}`;

        await insertDinamis('kedisiplinan', {
            tanggal: tanggal,
            waktu_input: waktuLengkap,
            nisn: siswa.nisn,
            nama_siswa: siswa.nama,
            nama: siswa.nama,
            kelas: siswa.kelas,
            catatan_pelanggaran: catatan,
            keterangan: catatan,
            tindak_lanjut: '-',
            penanganan: '-',
            diinput_oleh: pencatat,
            dicatat_oleh: pencatat,
            petugas: pencatat,
            created_at: waktuLengkap
        });

        alert(`Catatan kedisiplinan untuk ${siswa.nama} (${siswa.kelas}) berhasil disimpan!`);
        if (elCatatan) elCatatan.value = '';
        halamanPelanggaran = 1;
        await muatDataPelanggaranDariDB(true);
    } catch (err) {
        console.error("Gagal simpanPelanggaranBK:", err);
        alert("Gagal menyimpan catatan kedisiplinan:\n" + err.message);
    }
};

// ==========================================================================
// 3. SIMPAN STATUS SAKIT / IZIN / ALPA (simpanPresensiBK)
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

    if (!kelas || !siswa.nisn || !status) {
        alert("Silakan pilih Kelas, Nama Siswa, dan Status Kehadiran!");
        return;
    }

    try {
        const userLogin = JSON.parse(localStorage.getItem('smada_user') || '{}');
        const pencatat = userLogin.nama || userLogin.username || 'Guru BK';
        const tanggal = getTanggalHariIniWIB();
        const jam = getWaktuSekarangWIB();
        const ketLengkap = `${keterangan || status} [Input BK: ${pencatat}]`;

        const cek = await queryTurso(
            "SELECT id FROM presensi WHERE tanggal = ? AND TRIM(CAST(nisn AS TEXT)) IN (?, ?) LIMIT 1",
            [tanggal, siswa.nisn, siswa.nisn.replace(/^0+/, '')]
        );

        if (cek && cek.length > 0) {
            await queryTurso(
                "UPDATE presensi SET status = ?, keterangan = ? WHERE id = ?",
                [status, ketLengkap, cek[0].id]
            );
        } else {
            await insertDinamis('presensi', {
                tanggal: tanggal,
                nisn: siswa.nisn,
                nama: siswa.nama,
                kelas: siswa.kelas,
                jam_masuk: jam,
                status: status,
                keterangan: ketLengkap,
                petugas: pencatat
            });
        }

        alert(`Status ${status} untuk ${siswa.nama} (${siswa.kelas}) berhasil disimpan!`);
        if (elKet) elKet.value = '';
    } catch (err) {
        console.error("Gagal simpanPresensiBK:", err);
        alert("Gagal menyimpan status ketidakhadiran:\n" + err.message);
    }
};

// ==========================================================================
// 4. MODAL & SIMPAN IZIN PULANG MENDAHULUI
// ==========================================================================
window.bukaModalPulangMendahului = function () {
    const modal = document.getElementById('modal-pulang-mendahului');
    if (modal) modal.classList.remove('hidden');
};

window.tutupModalPulangMendahului = function () {
    const modal = document.getElementById('modal-pulang-mendahului');
    if (modal) modal.classList.add('hidden');
};

window.simpanPulangMendahului = async function () {
    const elKelas = document.getElementById('pulang-kelas');
    const elNisn = document.getElementById('pulang-nisn');
    const elAlasan = document.getElementById('pulang-alasan');

    const kelas = String(elKelas ? elKelas.value : '').trim();
    const alasan = String(elAlasan ? elAlasan.value : '').trim();
    const siswa = ambilInfoSiswaDariSelect(elKelas, elNisn);

    if (!kelas || !siswa.nisn || !alasan) {
        alert("Silakan pilih Kelas, Nama Siswa, dan isi Alasan Pulang!");
        return;
    }

    try {
        const userLogin = JSON.parse(localStorage.getItem('smada_user') || '{}');
        const pencatat = userLogin.nama || userLogin.username || 'Guru BK';
        const tanggal = getTanggalHariIniWIB();
        const jamPulang = getWaktuSekarangWIB();
        const ketBaru = `Pulang Mendahului (${jamPulang}): ${alasan} [oleh ${pencatat}]`;

        const cek = await queryTurso(
            "SELECT id FROM presensi WHERE tanggal = ? AND TRIM(CAST(nisn AS TEXT)) IN (?, ?) LIMIT 1",
            [tanggal, siswa.nisn, siswa.nisn.replace(/^0+/, '')]
        );

        if (cek && cek.length > 0) {
            await queryTurso(
                "UPDATE presensi SET jam_pulang = ?, keterangan = ? WHERE id = ?",
                [jamPulang, ketBaru, cek[0].id]
            );
        } else {
            await insertDinamis('presensi', {
                tanggal: tanggal,
                nisn: siswa.nisn,
                nama: siswa.nama,
                kelas: siswa.kelas,
                jam_masuk: jamPulang,
                jam_pulang: jamPulang,
                status: 'Izin',
                keterangan: ketBaru,
                petugas: pencatat
            });
        }

        alert(`Izin pulang mendahului untuk ${siswa.nama} (${siswa.kelas}) berhasil disimpan!`);
        if (elAlasan) elAlasan.value = '';
        tutupModalPulangMendahului();
    } catch (err) {
        alert("Gagal menyimpan izin pulang:\n" + err.message);
    }
};

// ==========================================================================
// 5. TABEL KEDISIPLINAN, PAGINATION, PENANGANAN BK & EKSPOR EXCEL
// ==========================================================================
async function muatDataPelanggaranDariDB(forcePrimary = false) {
    const tbody = document.getElementById('tabel-pelanggaran-body');
    try {
        const rows = await queryTurso(
            "SELECT * FROM kedisiplinan ORDER BY id DESC LIMIT 300",
            [],
            forcePrimary
        );
        semuaPelanggaranBK = rows || [];
        renderTabelPelanggaran();
    } catch (err) {
        console.error("Gagal memuat tabel kedisiplinan:", err);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-red-500">Gagal memuat data: ${escapeHtml(err.message)}</td></tr>`;
        }
    }
}

window.muatPelanggaranBK = function (isNext) {
    const totalHalaman = Math.max(1, Math.ceil(semuaPelanggaranBK.length / PER_HALAMAN_PELANGGARAN));
    if (isNext && halamanPelanggaran < totalHalaman) {
        halamanPelanggaran++;
    } else if (!isNext && halamanPelanggaran > 1) {
        halamanPelanggaran--;
    }
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
        const info = ambilInfoSiswaByNisn(r.kelas, r.nisn);
        const tanggal = r.tanggal || (r.created_at ? String(r.created_at).slice(0, 10) : '-');
        const waktu = r.waktu_input || r.created_at || '-';
        const nama = r.nama_siswa || r.nama || info.nama;
        const kelas = r.kelas || info.kelas;
        const catatan = r.catatan_pelanggaran || r.keterangan || '-';
        const penanganan = r.tindak_lanjut || r.penanganan || '-';
        const oleh = r.diinput_oleh || r.dicatat_oleh || r.petugas || 'BK';

        return `
            <tr class="hover:bg-slate-50">
                <td class="p-3 whitespace-nowrap">${escapeHtml(tanggal)}</td>
                <td class="p-3 whitespace-nowrap text-slate-500">${escapeHtml(waktu)}</td>
                <td class="p-3 whitespace-nowrap font-mono">${escapeHtml(info.nisn)}</td>
                <td class="p-3 font-bold text-slate-800 whitespace-nowrap">${escapeHtml(nama)}</td>
                <td class="p-3 whitespace-nowrap">${escapeHtml(kelas)}</td>
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

window.bukaModalPenanganan = function (id) {
    const item = semuaPelanggaranBK.find(r => Number(r.id) === Number(id));
    if (!item) return;

    const info = ambilInfoSiswaByNisn(item.kelas, item.nisn);
    document.getElementById('modal-pelanggaran-id').value = item.id;
    document.getElementById('modal-nama-siswa').textContent = `${item.nama_siswa || item.nama || info.nama} (${item.kelas || info.kelas})`;
    document.getElementById('modal-catatan-pelanggaran').textContent = item.catatan_pelanggaran || item.keterangan || '-';

    const existingPenanganan = item.tindak_lanjut || item.penanganan || '';
    document.getElementById('modal-catatan-penanganan').value = existingPenanganan === '-' ? '' : existingPenanganan;

    document.getElementById('modal-penanganan').classList.remove('hidden');
};

window.tutupModalPenanganan = function () {
    document.getElementById('modal-penanganan').classList.add('hidden');
};

window.simpanPenangananBK = async function () {
    const id = document.getElementById('modal-pelanggaran-id').value;
    const catatanPenanganan = String(document.getElementById('modal-catatan-penanganan').value || '').trim();

    if (!id || !catatanPenanganan) {
        alert("Tuliskan catatan tindak lanjut / penanganan BK terlebih dahulu!");
        return;
    }

    try {
        await updateDinamis('kedisiplinan', id, {
            tindak_lanjut: catatanPenanganan,
            penanganan: catatanPenanganan
        });
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
        await queryTurso("DELETE FROM kedisiplinan WHERE id = ?", [id]);
        await muatDataPelanggaranDariDB(true);
    } catch (err) {
        alert("Gagal menghapus catatan:\n" + err.message);
    }
};

window.eksporExcelPelanggaranBK = function () {
    if (!semuaPelanggaranBK || semuaPelanggaranBK.length === 0) {
        alert("Belum ada data pelanggaran untuk diekspor.");
        return;
    }
    const dataExport = semuaPelanggaranBK.map((r, idx) => {
        const info = ambilInfoSiswaByNisn(r.kelas, r.nisn);
        return {
            No: idx + 1,
            Tanggal: r.tanggal || '-',
            Waktu_Input: r.waktu_input || r.created_at || '-',
            NISN: info.nisn,
            Nama_Siswa: r.nama_siswa || r.nama || info.nama,
            Kelas: r.kelas || info.kelas,
            Catatan_Pelanggaran: r.catatan_pelanggaran || r.keterangan || '-',
            Penanganan_BK: r.tindak_lanjut || r.penanganan || '-',
            Diinput_Oleh: r.diinput_oleh || r.dicatat_oleh || r.petugas || 'BK'
        };
    });

    const ws = XLSX.utils.json_to_sheet(dataExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kedisiplinan_BK");
    XLSX.writeFile(wb, `Laporan_Kedisiplinan_BK_${getTanggalHariIniWIB()}.xlsx`);
};

// ==========================================================================
// 6. MODAL LAPORAN ANONIM & TINDAK LANJUT (AUTO-CREATE TABEL JIKA BELUM ADA)
// ==========================================================================
let daftarLaporanMasuk = [];
let tabelLaporanAktif = 'laporan_bk';

window.bukaModalLaporanBK = async function () {
    const modal = document.getElementById('modal-laporan-bk');
    if (modal) modal.classList.remove('hidden');
    await muatDaftarLaporanAnonim();
};

window.tutupModalLaporanBK = function () {
    const modal = document.getElementById('modal-laporan-bk');
    if (modal) modal.classList.add('hidden');
};

async function muatDaftarLaporanAnonim() {
    const tbody = document.getElementById('tabel-laporan-body');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400">Memuat laporan masuk...</td></tr>`;

    try {
        const tblCheck = await queryTurso("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('laporan_bk', 'pengaduan', 'laporan') LIMIT 1");
        if (tblCheck && tblCheck.length > 0) {
            tabelLaporanAktif = tblCheck[0].name;
        } else {
            tabelLaporanAktif = 'laporan_bk';
            await queryTurso(`
                CREATE TABLE IF NOT EXISTS laporan_bk (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tanggal TEXT,
                    waktu_input TEXT,
                    nisn TEXT,
                    nama TEXT,
                    kelas TEXT,
                    kategori TEXT,
                    tempat TEXT,
                    kronologi TEXT,
                    status TEXT DEFAULT 'pending',
                    tindak_lanjut TEXT
                )
            `);
        }

        const rows = await queryTurso(`SELECT * FROM ${tabelLaporanAktif} ORDER BY id DESC LIMIT 100`);
        daftarLaporanMasuk = rows || [];

        if (daftarLaporanMasuk.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400">Belum ada laporan masuk.</td></tr>`;
            return;
        }

        tbody.innerHTML = daftarLaporanMasuk.map(r => {
            const waktu = r.waktu_input || r.created_at || r.tanggal || '-';
            const pelapor = (r.is_anonim === 1 || r.anonim === 1 || r.nisn === 'ANONIM')
                ? '<span class="px-2 py-0.5 bg-purple-100 text-purple-800 rounded font-bold">Anonim</span>'
                : `${escapeHtml(r.nama || r.nama_pelapor || '-')} (${escapeHtml(r.kelas || '-')})`;
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
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Gagal memuat laporan: ${escapeHtml(err.message)}</td></tr>`;
    }
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
    const id = document.getElementById('tl-laporan-id').value;
    const status = document.getElementById('tl-status').value;
    const catatan = String(document.getElementById('tl-catatan').value || '').trim();

    try {
        await updateDinamis(tabelLaporanAktif, id, {
            status: status,
            tindak_lanjut: catatan
        });
        alert("Tindak lanjut laporan berhasil diperbarui!");
        tutupModalTindakLanjut();
        await muatDaftarLaporanAnonim();
    } catch (err) {
        alert("Gagal menyimpan tindak lanjut:\n" + err.message);
    }
};

// ==========================================================================
// 7. MODAL CARI RIWAYAT SISWA & CETAK PDF
// ==========================================================================
window.bukaModalCariSiswa = function () {
    const modal = document.getElementById('modal-cari-siswa');
    if (modal) modal.classList.remove('hidden');
    eksekusiCariSiswaBK();
};

window.tutupModalCariSiswa = function () {
    const modal = document.getElementById('modal-cari-siswa');
    if (modal) modal.classList.add('hidden');
};

window.eksekusiCariSiswaBK = function () {
    const tbody = document.getElementById('tabel-hasil-cari-body');
    if (!tbody) return;

    const kw = String(document.getElementById('cari-keyword-siswa')?.value || '').trim().toLowerCase();
    const filterKelas = String(document.getElementById('cari-kelas-siswa')?.value || '').trim().toUpperCase();

    const hasil = semuaPelanggaranBK.filter(r => {
        const info = ambilInfoSiswaByNisn(r.kelas, r.nisn);
        const nama = String(r.nama_siswa || r.nama || info.nama).toLowerCase();
        const kelas = String(r.kelas || info.kelas).toUpperCase();
        const nisn = String(info.nisn).toLowerCase();

        const cocokKelas = !filterKelas || kelas === filterKelas;
        const cocokKw = !kw || nama.includes(kw) || nisn.includes(kw);
        return cocokKelas && cocokKw;
    });

    if (hasil.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-400">Tidak ada riwayat kedisiplinan yang cocok.</td></tr>`;
        return;
    }

    tbody.innerHTML = hasil.map(r => {
        const info = ambilInfoSiswaByNisn(r.kelas, r.nisn);
        const waktu = r.waktu_input || r.created_at || r.tanggal || '-';
        const nama = r.nama_siswa || r.nama || info.nama;
        const kelas = r.kelas || info.kelas;
        const catatan = r.catatan_pelanggaran || r.keterangan || '-';
        const penanganan = r.tindak_lanjut || r.penanganan || '-';

        return `
            <tr class="border-b border-slate-200">
                <td class="p-2 border border-slate-200 whitespace-nowrap">${escapeHtml(waktu)}</td>
                <td class="p-2 border border-slate-200 font-mono">${escapeHtml(info.nisn)}</td>
                <td class="p-2 border border-slate-200 font-bold">${escapeHtml(nama)}</td>
                <td class="p-2 border border-slate-200">${escapeHtml(kelas)}</td>
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
// 8. LOGOUT
// ==========================================================================
window.logout = function () {
    sessionStorage.removeItem('smada_bk_siswa_cache');
    sessionStorage.removeItem('smada_bk_siswa_cache_v2');
    localStorage.removeItem('smada_token');
    localStorage.removeItem('smada_user');
    localStorage.removeItem('smada_role');
    window.location.replace('index.html');
};
