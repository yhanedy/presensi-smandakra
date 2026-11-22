/* ==========================================================================
   SMAN 2 KARANGANYAR - PORTAL BK & STP2K ENGINE (SYNCHRONIZED)
   ========================================================================== */

// PROTEKSI HALAMAN
(function proteksiHalamanBK() {
    const rawUser = localStorage.getItem('smada_user');
    if (!rawUser || rawUser === "null" || rawUser === "undefined") {
        alert("Akses Ditolak! Silakan login terlebih dahulu.");
        window.location.replace('index.html');
        return;
    }
    try {
        const user = JSON.parse(rawUser);
        const role = String(user.role || '').toLowerCase();
        const isAllowed = role.includes('bk') || role.includes('stp2k') || role.includes('admin') || role.includes('superadmin') || role.includes('super_admin');
        if (!isAllowed) {
            alert("Akses Ditolak! Anda bukan Guru BK / STP2K.");
            window.location.replace('index.html');
        }
    } catch (e) {
        localStorage.removeItem('smada_user');
        window.location.replace('index.html');
    }
})();

let currentPage = 1;
const LIMIT = 10;
let totalPages = 1;
let activeUser = null;
const WORKER_URL = 'https://smada-api-gateway.yhanedy.workers.dev';

document.addEventListener('DOMContentLoaded', async () => {
    const rawUser = localStorage.getItem('smada_user');
    if (rawUser) {
        try { activeUser = JSON.parse(rawUser); } catch (e) {}
    }
    if (activeUser) {
        const nameEl = document.getElementById('display-user-name');
        if (nameEl) nameEl.textContent = activeUser.nama || activeUser.username;
    }

    const tglPelanggaranElem = document.getElementById('pelanggaran-tanggal');
    if (tglPelanggaranElem) {
        const hariIni = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());
        tglPelanggaranElem.value = hariIni;
    }

    await muatDaftarKelasSiswaBK();
    muatPelanggaranBK(1);
});

function logout() {
    localStorage.removeItem('smada_user');
    localStorage.removeItem('smada_role');
    localStorage.removeItem('smada_token');
    window.location.href = 'index.html';
}

async function muatDaftarKelasSiswaBK() {
    const idsKelas = ['pelanggaran-kelas', 'bk-kelas', 'pulang-kelas', 'cari-kelas-siswa'];
    try {
        const res = await queryTurso("SELECT DISTINCT kelas FROM siswa WHERE kelas IS NOT NULL AND kelas != '' ORDER BY kelas ASC");
        let options = '<option value="">-- Pilih Kelas --</option>';
        if (res && res.length > 0) {
            options += res.map(k => `<option value="${k.kelas}">${k.kelas}</option>`).join('');
        } else {
            options = '<option value="">-- Data Kelas Kosong --</option>';
        }
        idsKelas.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (id === 'cari-kelas-siswa') {
                    el.innerHTML = '<option value="">-- Semua Kelas --</option>' + options.split('>').slice(1).join('>');
                } else {
                    el.innerHTML = options;
                }
            }
        });
    } catch (e) {
        console.error("Gagal muat daftar kelas BK:", e);
    }
}

async function muatSiswaBerdasarkanKelas(idSelectKelas, idSelectSiswa) {
    const elKelas = document.getElementById(idSelectKelas);
    const selectSiswa = document.getElementById(idSelectSiswa);
    if (!elKelas || !selectSiswa) return;

    const kelasSelected = elKelas.value;
    if (!kelasSelected) {
        selectSiswa.innerHTML = '<option value="">-- Pilih Kelas Terlebih Dahulu --</option>';
        return;
    }
    selectSiswa.innerHTML = '<option value="">Memuat nama siswa...</option>';

    try {
        const res = await queryTurso(
            'SELECT nisn, nama FROM siswa WHERE kelas = ? ORDER BY nama ASC',
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

async function simpanPelanggaranBK() {
    const nisn = document.getElementById('pelanggaran-nisn').value;
    const tglInput = document.getElementById('pelanggaran-tanggal').value;
    const catatan = document.getElementById('pelanggaran-catatan').value.trim();

    if (!nisn) { alert("Silakan pilih Nama Siswa terlebih dahulu!"); return; }
    if (!tglInput) { alert("Tanggal kejadian wajib diisi!"); return; }
    if (!catatan) { alert("Catatan Pelanggaran Wajib diisi!"); return; }

    try {
        const sCheck = await queryTurso('SELECT nama FROM siswa WHERE nisn = ?', [nisn]);
        const namaSiswa = (sCheck && sCheck.length > 0) ? sCheck[0].nama : 'Siswa';
        const diinputOleh = activeUser ? (activeUser.nama || activeUser.username) : 'Guru BK';

        await queryTurso(
            'INSERT INTO kedisiplinan (nisn, catatan_pelanggaran, diinput_oleh, created_at) VALUES (?, ?, ?, ?)',
            [nisn, catatan, diinputOleh, tglInput]
        );

        alert(`Catatan kedisiplinan untuk SISWA (${namaSiswa}) berhasil disimpan!`);

        document.getElementById('pelanggaran-kelas').value = '';
        document.getElementById('pelanggaran-nisn').innerHTML = '<option value="">-- Pilih Kelas Terlebih Dahulu --</option>';
        document.getElementById('pelanggaran-catatan').value = '';

        const hariIni = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());
        document.getElementById('pelanggaran-tanggal').value = hariIni;

        muatPelanggaranBK(1);
    } catch (err) {
        alert("Gagal menyimpan catatan pelanggaran: " + err.message);
    }
}

async function simpanPresensiBK() {
    const nisn = document.getElementById('bk-nisn').value;
    const status = document.getElementById('bk-status').value;
    const ket = document.getElementById('bk-keterangan').value.trim();
    if (!nisn) { alert("Silakan pilih Nama Siswa terlebih dahulu!"); return; }
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());
    try {
        const sCheck = await queryTurso('SELECT nama FROM siswa WHERE nisn = ?', [nisn]);
        if (!sCheck || sCheck.length === 0) {
            alert(`Data siswa tidak ditemukan!`);
            return;
        }
        await queryTurso(
            'INSERT INTO presensi (nisn, tanggal, status, keterangan) VALUES (?, ?, ?, ?)',
            [nisn, today, status, ket || `Input BK (${status})`]
        );
        alert(`Status ketidakhadiran (${status}) untuk SISWA (${sCheck[0].nama}) berhasil dicatat!`);
        document.getElementById('bk-kelas').value = '';
        document.getElementById('bk-nisn').innerHTML = '<option value="">-- Pilih Kelas Terlebih Dahulu --</option>';
        document.getElementById('bk-keterangan').value = '';
    } catch (err) {
        alert("Gagal mencatat status ketidakhadiran: " + err.message);
    }
}

function bukaModalPulangMendahului() {
    const el = document.getElementById('modal-pulang-mendahului');
    if (el) el.classList.remove('hidden');
}

function tutupModalPulangMendahului() {
    const el = document.getElementById('modal-pulang-mendahului');
    if (el) el.classList.add('hidden');
}

async function simpanPulangMendahului() {
    const nisn = document.getElementById('pulang-nisn').value;
    const alasan = document.getElementById('pulang-alasan').value.trim();
    if (!nisn) { alert("Silakan pilih Nama Siswa terlebih dahulu!"); return; }
    if (!alasan) { alert("Alasan pulang mendahului wajib diisi!"); return; }
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());
    const jamNow = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date()).replace(/\./g, ':');
    try {
        const sCheck = await queryTurso('SELECT nama FROM siswa WHERE nisn = ?', [nisn]);
        const namaSiswa = (sCheck && sCheck.length > 0) ? sCheck[0].nama : 'Siswa';

        const pCek = await queryTurso('SELECT id FROM presensi WHERE nisn = ? AND tanggal = ? LIMIT 1', [nisn, today]);
        if (pCek && pCek.length > 0) {
            await queryTurso(
                'UPDATE presensi SET jam_pulang = ?, status = ?, keterangan = ? WHERE id = ?',
                [jamNow, 'Izin', `Pulang Mendahului: ${alasan}`, pCek[0].id]
            );
        } else {
            await queryTurso(
                'INSERT INTO presensi (nisn, tanggal, jam_pulang, status, keterangan) VALUES (?, ?, ?, ?, ?)',
                [nisn, today, jamNow, 'Izin', `Pulang Mendahului: ${alasan}`]
            );
        }
        alert(`Izin Pulang Mendahului untuk SISWA (${namaSiswa}) berhasil dicatat pada jam ${jamNow}!`);
        document.getElementById('pulang-kelas').value = '';
        document.getElementById('pulang-nisn').innerHTML = '<option value="">-- Pilih Kelas Terlebih Dahulu --</option>';
        document.getElementById('pulang-alasan').value = '';
        tutupModalPulangMendahului();
    } catch (err) {
        alert("Gagal mencatat izin pulang mendahului: " + err.message);
    }
}

async function muatPelanggaranBK(page) {
    if (page < 1) page = 1;
    currentPage = page;

    const tbody = document.getElementById('tabel-pelanggaran-body');
    const btnPrev = document.getElementById('btn-prev-pelanggaran');
    const btnNext = document.getElementById('btn-next-pelanggaran');
    const pageInfo = document.getElementById('page-info-pelanggaran');

    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9" class="p-4 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin"></i> Memuat catatan...</td></tr>';

    try {
        const countRes = await queryTurso("SELECT COUNT(*) as total FROM kedisiplinan");
        const totalData = countRes[0] ? countRes[0].total : 0;
        totalPages = Math.ceil(totalData / LIMIT) || 1;

        if (currentPage > totalPages) currentPage = totalPages;
        const offset = (currentPage - 1) * LIMIT;

        const sqlStr = `
            SELECT k.id, k.created_at, k.nisn, k.catatan_pelanggaran, k.penanganan_bk, k.diinput_oleh, 
                   COALESCE(s.nama, 'Siswa') as nama, 
                   COALESCE(s.kelas, '-') as kelas 
            FROM kedisiplinan k 
            LEFT JOIN siswa s ON k.nisn = s.nisn 
            ORDER BY k.id DESC 
            LIMIT ${LIMIT} OFFSET ${offset}
        `;
        const data = await queryTurso(sqlStr);

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="p-4 text-center text-slate-400">Belum ada catatan kedisiplinan tersimpan.</td></tr>';
        } else {
            tbody.innerHTML = data.map(p => `
                <tr class="hover:bg-slate-50 border-b border-slate-100">
                    <td class="p-3 font-mono text-slate-500">${p.created_at || '-'}</td>
                    <td class="p-3 font-mono font-bold text-slate-700">${p.nisn}</td>
                    <td class="p-3 font-bold text-slate-900">${p.nama}</td>
                    <td class="p-3 font-mono font-bold text-blue-900">${p.kelas}</td>
                    <td class="p-3 text-red-700 font-medium">${p.catatan_pelanggaran}</td>
                    <td class="p-3 text-emerald-800 font-medium bg-emerald-50/50 rounded-lg">
                        ${p.penanganan_bk ? `<i class="fa-solid fa-check text-emerald-600 mr-1"></i>${p.penanganan_bk}` : '<span class="text-slate-400 italic">Belum ada penanganan</span>'}
                    </td>
                    <td class="p-3 text-center font-semibold text-slate-600">${p.diinput_oleh || 'BK'}</td>
                    <td class="p-3 text-center">
                        <button onclick="bukaModalPenanganan(${p.id}, '${(p.nama || '').replace(/'/g, "\\'")}', '${(p.catatan_pelanggaran || '').replace(/'/g, "\\'")}', '${(p.penanganan_bk || '').replace(/'/g, "\\'")}')" class="bg-blue-900 hover:bg-blue-950 text-white px-2.5 py-1.5 rounded-lg text-[11px] font-bold shadow transition cursor-pointer flex items-center justify-center gap-1 mx-auto">
                            <i class="fa-solid fa-pen-to-square text-yellow-400"></i> Penanganan
                        </button>
                    </td>
                </tr>
            `).join('');
        }

        if (pageInfo) pageInfo.textContent = `Halaman ${currentPage} dari ${totalPages} (Total: ${totalData} data)`;
        if (btnPrev) btnPrev.disabled = (currentPage <= 1);
        if (btnNext) btnNext.disabled = (currentPage >= totalPages);

    } catch (err) {
        console.error("Gagal muat kedisiplinan:", err);
        tbody.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-red-500 font-bold">Gagal memuat data kedisiplinan: ${err.message}</td></tr>`;
    }
}

function bukaModalPenanganan(id, nama, pelanggaran, penangananExisting) {
    document.getElementById('modal-pelanggaran-id').value = id;
    document.getElementById('modal-nama-siswa').textContent = nama;
    document.getElementById('modal-catatan-pelanggaran').textContent = pelanggaran;
    document.getElementById('modal-catatan-penanganan').value = penangananExisting;
    document.getElementById('modal-penanganan').classList.remove('hidden');
}

function tutupModalPenanganan() {
    document.getElementById('modal-penanganan').classList.add('hidden');
}

async function simpanPenangananBK() {
    const id = document.getElementById('modal-pelanggaran-id').value;
    const penangananTxt = document.getElementById('modal-catatan-penanganan').value.trim();
    if (!penangananTxt) { alert("Catatan penanganan wajib diisi!"); return; }
    try {
        await queryTurso(
            'UPDATE kedisiplinan SET penanganan_bk = ? WHERE id = ?',
            [penangananTxt, id]
        );
        alert("Catatan penanganan BK berhasil diperbarui!");
        tutupModalPenanganan();
        muatPelanggaranBK(currentPage);
        if (!document.getElementById('modal-cari-siswa').classList.contains('hidden')) {
            eksekusiCariSiswaBK();
        }
    } catch (err) {
        alert("Gagal menyimpan penanganan BK: " + err.message);
    }
}

function bukaModalCariSiswa() {
    document.getElementById('modal-cari-siswa').classList.remove('hidden');
}

function tutupModalCariSiswa() {
    document.getElementById('modal-cari-siswa').classList.add('hidden');
}

async function eksekusiCariSiswaBK() {
    const keyword = document.getElementById('cari-keyword-siswa').value.trim();
    const kelas = document.getElementById('cari-kelas-siswa').value.trim();
    const tbody = document.getElementById('tabel-hasil-cari-body');
    if (!keyword && !kelas) {
        alert("Silakan isi nama, NISN, atau kelas untuk mencari!");
        return;
    }
    tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin"></i> Mencari data...</td></tr>';
    try {
        let whereClause = [];
        let params = [];
        if (keyword) {
            whereClause.push("(LOWER(s.nama) LIKE LOWER(?) OR k.nisn LIKE ?)");
            params.push(`%${keyword}%`, `%${keyword}%`);
        }
        if (kelas) {
            whereClause.push("LOWER(s.kelas) LIKE LOWER(?)");
            params.push(`%${kelas}%`);
        }
        const sqlStr = `
            SELECT k.id, k.created_at, k.nisn, k.catatan_pelanggaran, k.penanganan_bk, k.diinput_oleh, 
                   COALESCE(s.nama, 'Siswa') as nama, 
                   COALESCE(s.kelas, '-') as kelas 
            FROM kedisiplinan k 
            LEFT JOIN siswa s ON k.nisn = s.nisn 
            WHERE ${whereClause.join(' AND ')} 
            ORDER BY k.id DESC
        `;
        const data = await queryTurso(sqlStr, params);
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center
