// js/siswa-ijin.js - Modul Permohonan Izin, Surat Dokter & Dispensasi SMADA

let fotoIzinBase64 = null;
let fileDispenBase64 = null;

// Buka Modal & Set Tanggal Default
function bukaModalIzinDispen() {
    const tglStr = getTanggalWIB();
    document.getElementById('ijinTanggalToday').innerText = tglStr;
    document.getElementById('dispenTglMulai').value = tglStr;
    document.getElementById('dispenTglSelesai').value = tglStr;
    document.getElementById('modal-permohonan-ijin').classList.remove('hidden');
}

function tutupModalIzinDispen() {
    document.getElementById('modal-permohonan-ijin').classList.add('hidden');
}

// Beralih Tab (Tab 1: Izin Tulis Tangan vs Tab 2: Surat Dokter & Dispen)
function switchTabIzinDispen(tabId) {
    // Sembunyikan semua konten tab
    document.querySelectorAll('.tab-ijin-content').forEach(c => c.classList.add('hidden'));
    
    // Tampilkan tab yang dipilih
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.remove('hidden');

    // Reset semua tombol tab ke class pasif
    const btnTabHarian = document.getElementById('btn-tab-ijin-harian');
    const btnTabDispen = document.getElementById('btn-tab-dispen');
    const classPasif = "tab-ijin-btn py-2.5 px-4 rounded-xl text-slate-600 hover:bg-slate-200 font-black transition cursor-pointer";
    if (btnTabHarian) btnTabHarian.className = classPasif;
    if (btnTabDispen) btnTabDispen.className = classPasif;

    // Set tombol aktif sesuai tab yang dipilih
    if (tabId === 'tab-ijin-harian' && btnTabHarian) {
        btnTabHarian.className = "tab-ijin-btn py-2.5 px-4 rounded-xl bg-purple-900 text-white font-black shadow transition cursor-pointer";
    } else if (tabId === 'tab-dispen' && btnTabDispen) {
        btnTabDispen.className = "tab-ijin-btn py-2.5 px-4 rounded-xl bg-blue-900 text-white font-black shadow transition cursor-pointer";
    }
}

// Preview Kamera Surat Izin Tulis Tangan
function previewFotoIzin(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            fotoIzinBase64 = e.target.result;
            document.getElementById('ijinFotoPreview').src = fotoIzinBase64;
            document.getElementById('ijinPreviewBox').classList.remove('hidden');
            
            // Aktifkan tombol kirim jika sudah ada foto
            const btn = document.getElementById('btnKirimIjinHarian');
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        };
        reader.readAsDataURL(file);
    }
}

// Preview File Surat Dokter / Dispen
function previewFileDispen(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            fileDispenBase64 = e.target.result;
            const namaEl = document.getElementById('dispenFileNama');
            namaEl.innerText = `File Terpilih: ${file.name}`;
            namaEl.classList.remove('hidden');
            
            const btn = document.getElementById('btnKirimDispenDokter');
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        };
        reader.readAsDataURL(file);
    }
}

// 1. Kirim Izin Tulis Tangan (Khusus 1 Hari)
async function kirimPermohonanIzinHarian() {
    const alasan = document.getElementById('ijin-alasan').value.trim();
    const btn = document.getElementById('btnKirimIjinHarian');

    if (!alasan) { alert("Tuliskan alasan izin secara jelas!"); return; }
    if (!fotoIzinBase64) { alert("Wajib mefoto Surat Izin Tulis Tangan bertanda tangan Orang Tua!"); return; }

    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Mengirim Permohonan...`;

    try {
        const tglWIB = getTanggalWIB();
        const nisnVal = String(currentActiveUser.nisn || currentActiveUser.username);

        await queryTurso(
            'INSERT INTO presensi (nisn, tanggal, jam_masuk, status, keterangan) VALUES (?, ?, ?, ?, ?)',
            [nisnVal, tglWIB, getJamWIB(), 'Izin', `Izin Harian (1 Hari): ${alasan} [Surat Tulis Tangan]`]
        );

        alert(`Permohonan Izin Harian berhasil dikirim ke Guru Piket!`);
        tutupModalIzinDispen();
        muatPresensiSiswaHariIni();
        muatRiwayatSiswa();
    } catch (err) {
        alert("Gagal mengirim izin: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Kirim Surat Izin Ke Piket`;
    }
}

// 2. Kirim Surat Dokter / Dispensasi (Rentang Tanggal)
async function kirimPermohonanDispenDokter() {
    const jenisKategori = document.getElementById('dispenKategori').value;
    const tglMulai = document.getElementById('dispenTglMulai').value;
    const tglSelesai = document.getElementById('dispenTglSelesai').value;
    const keterangan = document.getElementById('dispenKeterangan').value.trim();
    const btn = document.getElementById('btnKirimDispenDokter');

    if (!keterangan) { alert("Tuliskan keterangan surat dokter / kegiatan dispen!"); return; }
    if (!tglMulai || !tglSelesai) { alert("Pilih rentang tanggal pelaksanaan!"); return; }

    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Memproses...`;

    try {
        const nisnVal = String(currentActiveUser.nisn || currentActiveUser.username);

        await queryTurso(
            'INSERT INTO presensi (nisn, tanggal, jam_masuk, status, keterangan) VALUES (?, ?, ?, ?, ?)',
            [
                nisnVal, 
                tglMulai, 
                getJamWIB(), 
                jenisKategori.includes('Sakit') ? 'Sakit' : 'Dispensasi', 
                `${jenisKategori} (${tglMulai} s.d ${tglSelesai}): ${keterangan}`
            ]
        );

        alert(`Permohonan ${jenisKategori} (${tglMulai} s.d ${tglSelesai}) berhasil diteruskan ke Guru Piket!`);
        tutupModalIzinDispen();
        muatPresensiSiswaHariIni();
        muatRiwayatSiswa();
    } catch (err) {
        alert("Gagal mengirim pengajuan: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Kirim Pengajuan Ke Piket`;
    }
}
