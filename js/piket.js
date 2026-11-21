/* ==========================================================================
   PORTAL GURU PIKET — OPTIMIZED FOR TURSO (Hemat Kuota)
   ========================================================================== */

let currentUserSession = null;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Cek Sesi Login
    const rawUser = localStorage.getItem('smada_user');
    if (rawUser && rawUser !== "null" && rawUser !== "undefined") {
        try { 
            currentUserSession = JSON.parse(rawUser); 
            const nameEl = document.getElementById('display-user-name');
            if (nameEl) nameEl.textContent = currentUserSession.nama || currentUserSession.username;
        } catch (e) {}
    } else {
        alert("Akses Ditolak! Silakan login terlebih dahulu.");
        window.location.replace('index.html');
        return;
    }

    // 2. Muat Data Awal
    muatPresensiHariIni();
});

// =====================================================================
// 1. MEMUAT DAFTAR PRESENSI & PENGAJUAN IZIN HARI INI
// =====================================================================
async function muatPresensiHariIni() {
    const tbody = document.getElementById('tabel-presensi-body'); // Sesuaikan ID tabel di HTML piket
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="text-center p-4"><i class="fa-solid fa-spinner fa-spin"></i> Memuat data...</td></tr>';
    
    // Ambil tanggal hari ini (WIB)
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());

    try {
        // OPTIMASI HEMAT KUOTA:
        // 1. JANGAN SELECT * (karena kolom foto base64 bisa sangat besar)
        // 2. Hapus TRIM() pada tanggal
        // 3. Hanya ambil kolom yang dibutuhkan
        const data = await queryTurso(
            'SELECT id, nisn, jam_masuk, jam_pulang, status, keterangan FROM presensi WHERE tanggal = ? ORDER BY jam_masuk DESC', 
            [today]
        );

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-slate-500 p-4">Belum ada data presensi hari ini.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map((p, index) => {
            // Cek apakah ada link bukti surat di dalam keterangan
            let linkBukti = '-';
            if (p.keterangan && p.keterangan.includes('Link: ')) {
                const urlMatch = p.keterangan.match(/Link:\s*(https?:\/\/[^\s]+)/);
                if (urlMatch) {
                    linkBukti = `<a href="${urlMatch[1]}" target="_blank" class="text-blue-600 underline text-xs font-bold">Lihat Bukti</a>`;
                }
            }

            return `
            <tr class="hover:bg-slate-50 border-b">
                <td class="p-3 text-center">${index + 1}</td>
                <td class="p-3 font-mono font-bold">${p.nisn}</td>
                <td class="p-3">${p.jam_masuk || '-'}</td>
                <td class="p-3">${p.jam_pulang || '-'}</td>
                <td class="p-3">
                    <span class="px-2 py-1 rounded text-xs font-bold ${p.status === 'Hadir' ? 'bg-green-100 text-green-700' : (p.status === 'Izin' || p.status === 'Sakit' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700')}">
                        ${p.status}
                    </span>
                </td>
                <td class="p-3 text-xs text-slate-600 max-w-xs truncate" title="${p.keterangan || '-'}">
                    ${p.keterangan || '-'} <br> ${linkBukti}
                </td>
            </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Gagal memuat presensi:", err);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-red-500 p-4">Gagal memuat data: ${err.message}</td></tr>`;
    }
}

// =====================================================================
// 2. MENGUBAH STATUS IZIN (Verifikasi Piket)
// =====================================================================
async function ubahStatusIzin(idPresensi, statusBaru) {
    if (!confirm(`Yakin ingin mengubah status menjadi ${statusBaru}?`)) return;

    try {
        // OPTIMASI: Langsung update berdasarkan ID (Primary Key)
        await queryTurso(
            'UPDATE presensi SET status = ? WHERE id = ?',
            [statusBaru, idPresensi]
        );
        
        alert('Status berhasil diperbarui!');
        muatPresensiHariIni(); // Refresh tabel
    } catch (err) {
        alert('Gagal memperbarui status: ' + err.message);
    }
}

// =====================================================================
// 3. PENCARIAN SISWA (Untuk Piket)
// =====================================================================
async function cariDataSiswa() {
    const keyword = document.getElementById('input-cari-piket')?.value.trim();
    const tbody = document.getElementById('tabel-hasil-cari');

    if (!keyword) {
        alert("Masukkan NISN atau Nama untuk mencari!");
        return;
    }

    tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4">Mencari...</td></tr>';

    try {
        // OPTIMASI: 
        // 1. Hapus TRIM()
        // 2. Batasi hasil pencarian (LIMIT 20) agar tidak menarik seluruh database
        const data = await queryTurso(
            'SELECT nisn, nama, kelas FROM siswa WHERE nisn LIKE ? OR LOWER(nama) LIKE LOWER(?) LIMIT 20',
            [`%${keyword}%`, `%${keyword}%`]
        );

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-slate-500">Siswa tidak ditemukan.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(s => `
            <tr class="hover:bg-slate-50 border-b">
                <td class="p-3 font-mono font-bold">${s.nisn}</td>
                <td class="p-3 font-bold text-slate-800">${s.nama}</td>
                <td class="p-3 font-mono text-blue-700">${s.kelas}</td>
                <td class="p-3 text-center">
                    <button onclick="lihatDetailSiswa('${s.nisn}')" class="bg-blue-600 text-white px-2 py-1 rounded text-xs">Detail</button>
                </td>
            </tr>
        `).join('');
        
    } catch (err) {
        console.error("Gagal mencari siswa:", err);
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-red-500 p-4">Gagal mencari: ${err.message}</td></tr>`;
    }
}
