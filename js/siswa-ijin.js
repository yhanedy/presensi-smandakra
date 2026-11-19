// js/siswa-ijin.js — Modul Permohonan ijin, Surat Dokter & Dispensasi SMADA
// Versi: selaras dengan siswa.css futuristik & siswa-utils.js

/* =========================================================
   STATE LOKAL
   ========================================================= */
let fotoijinBase64 = null;
let fileDispenBase64 = null;
let fileDispenMime = 'image/jpeg';
let fileDispenExt = 'jpg';

/* =========================================================
   BUKA / TUTUP MODAL
   ========================================================= */
function bukaModalijinDispen() {
  // Reset state agar tidak ada data lama terkirim
  fotoijinBase64 = null;
  fileDispenBase64 = null;
  fileDispenMime = 'image/jpeg';
  fileDispenExt = 'jpg';

  const tglStr = getTanggalWIB();
  const elTgl = document.getElementById('ijinTanggalToday');
  const elMulai = document.getElementById('dispenTglMulai');
  const elSelesai = document.getElementById('dispenTglSelesai');
  if (elTgl) elTgl.innerText = tglStr;
  if (elMulai) elMulai.value = tglStr;
  if (elSelesai) elSelesai.value = tglStr;

  // Reset tombol & preview
  lockButton('btnKirimIjinHarian', true);
  lockButton('btnKirimDispenDokter', true);
  document.getElementById('ijinPreviewBox')?.classList.add('hidden');
  document.getElementById('dispenFileNama')?.classList.add('hidden');
  const imgDispen = document.getElementById('dispenFotoPreview');
  if (imgDispen) { imgDispen.src = '#'; imgDispen.classList.add('hidden'); }

  // Reset input file (agar bisa pilih file yang sama lagi)
  const inputijin = document.getElementById('ijinFotoInput');
  const inputDispen = document.getElementById('dispenFileInput');
  if (inputijin) inputijin.value = '';
  if (inputDispen) inputDispen.value = '';

  switchTabijinDispen('tab-ijin-harian');
  document.getElementById('modal-permohonan-ijin')?.classList.remove('hidden');
}

function tutupModalijinDispen() {
  document.getElementById('modal-permohonan-ijin')?.classList.add('hidden');
  fotoijinBase64 = null;
  fileDispenBase64 = null;
}

/* =========================================================
   HELPER: LOCK / UNLOCK TOMBOL
   ========================================================= */
function lockButton(id, locked) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = locked;
  btn.classList.toggle('opacity-50', locked);
}

/* =========================================================
   TAB SWITCH — pakai class CSS baru (.tab-btn.active)
   ========================================================= */
function switchTabijinDispen(tabId) {
  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

  const target = document.getElementById(tabId);
  if (target) target.classList.remove('hidden');

  const btnHarian = document.getElementById('btn-tab-ijin-harian');
  const btnDispen = document.getElementById('btn-tab-dispen');
  if (btnHarian) btnHarian.classList.toggle('active', tabId === 'tab-ijin-harian');
  if (btnDispen) btnDispen.classList.toggle('active', tabId === 'tab-dispen');
}

/* =========================================================
   PREVIEW FOTO ijin (dengan kompresi)
   ========================================================= */
async function previewFotoijin(event) {
  const file = event.target.files[0];
  if (!file) {
    fotoijinBase64 = null;
    lockButton('btnKirimIjinHarian', true);
    return;
  }

  try {
    fotoijinBase64 = await kompresGambar(file, 800, 0.7);
    const img = document.getElementById('ijinFotoPreview');
    const box = document.getElementById('ijinPreviewBox');
    if (img) img.src = fotoijinBase64;
    if (box) box.classList.remove('hidden');
    lockButton('btnKirimIjinHarian', false);
  } catch (e) {
    alert(e.message);
    event.target.value = '';
    fotoijinBase64 = null;
    lockButton('btnKirimIjinHarian', true);
  }
}

/* =========================================================
   PREVIEW FILE DISPEN (PDF / Gambar)
   ========================================================= */
async function previewFileDispen(event) {
  const file = event.target.files[0];
  if (!file) {
    fileDispenBase64 = null;
    lockButton('btnKirimDispenDokter', true);
    return;
  }

  const nama = document.getElementById('dispenFileNama');
  const img = document.getElementById('dispenFotoPreview');

  // --- Kasus PDF ---
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const reader = new FileReader();
    reader.onload = e => {
      fileDispenBase64 = e.target.result;
      fileDispenMime = 'application/pdf';
      fileDispenExt = 'pdf';
      if (nama) { nama.innerText = `📄 PDF: ${file.name}`; nama.classList.remove('hidden'); }
      if (img) { img.src = '#'; img.classList.add('hidden'); }
      lockButton('btnKirimDispenDokter', false);
    };
    reader.onerror = () => {
      alert("Gagal membaca file PDF.");
      lockButton('btnKirimDispenDokter', true);
    };
    reader.readAsDataURL(file);
    return;
  }

  // --- Kasus Gambar ---
  try {
    fileDispenBase64 = await kompresGambar(file, 800, 0.7);
    fileDispenMime = 'image/jpeg';
    fileDispenExt = 'jpg';
    if (nama) { nama.innerText = `🖼️ Foto: ${file.name}`; nama.classList.remove('hidden'); }
    if (img) { img.src = fileDispenBase64; img.classList.remove('hidden'); }
    lockButton('btnKirimDispenDokter', false);
  } catch (e) {
    alert(e.message);
    event.target.value = '';
    fileDispenBase64 = null;
    lockButton('btnKirimDispenDokter', true);
  }
}

/* =========================================================
   1. KIRIM ijin HARIAN (dengan upload Drive)
   ========================================================= */
async function kirimPermohonanijinHarian() {
  const alasan = document.getElementById('ijin-alasan')?.value.trim() || '';
  const btn = document.getElementById('btnKirimIjinHarian');

  if (!alasan) { alert("Tuliskan alasan ijin secara jelas!"); return; }
  if (!fotoijinBase64) { alert("Wajib mefoto Surat ijin Tulis Tangan bertanda tangan Orang Tua!"); return; }

  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Mengunggah Surat...`;

  try {
    const tglWIB = getTanggalWIB();
    const nisnVal = String(currentActiveUser.nisn || currentActiveUser.username).trim();

    // Upload ke Google Drive via GAS
    const driveUrl = await uploadKeDriveGAS(fotoijinBase64, "ijin_tangan", "image/jpeg", "jpg");
    if (!driveUrl) {
      // uploadKeDriveGAS sudah menampilkan alert
      return;
    }

    const ket = `ijin Harian (1 Hari): ${alasan} - Link: ${driveUrl}`;

    await queryTurso(
      'INSERT INTO presensi (nisn, tanggal, jam_masuk, status, keterangan, foto) VALUES (?, ?, ?, ?, ?, ?)',
      [nisnVal, tglWIB, getJamWIB(), 'ijin', ket, driveUrl]
    );

    alert(`Permohonan ijin Harian berhasil dikirim ke Guru Piket!`);
    tutupModalijinDispen();
    muatPresensiSiswaHariIni();
    muatRiwayatSiswa();
  } catch (err) {
    alert("Gagal mengirim ijin: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}

/* =========================================================
   2. KIRIM DISPEN / SURAT DOKTER (dengan upload Drive)
   ========================================================= */
async function kirimPermohonanDispenDokter() {
  const jenisKategori = document.getElementById('dispenKategori')?.value || 'Dispensasi';
  const tglMulai = document.getElementById('dispenTglMulai')?.value;
  const tglSelesai = document.getElementById('dispenTglSelesai')?.value;
  const keterangan = document.getElementById('dispenKeterangan')?.value.trim() || '';
  const btn = document.getElementById('btnKirimDispenDokter');

  if (!keterangan) { alert("Tuliskan keterangan surat dokter / kegiatan dispen!"); return; }
  if (!tglMulai || !tglSelesai) { alert("Pilih rentang tanggal pelaksanaan!"); return; }
  if (tglSelesai < tglMulai) { alert("Tanggal selesai tidak boleh sebelum tanggal mulai!"); return; }
  if (!fileDispenBase64) { alert("Wajib lampirkan Surat Dokter / Surat Tugas!"); return; }

  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Mengunggah Berkas...`;

  try {
    const nisnVal = String(currentActiveUser.nisn || currentActiveUser.username).trim();

    // Upload ke Google Drive via GAS
    const driveUrl = await uploadKeDriveGAS(fileDispenBase64, "dispen_dokter", fileDispenMime, fileDispenExt);
    if (!driveUrl) return;

    const statusFinal = jenisKategori.includes('Sakit') ? 'Sakit' : 'Dispensasi';
    const ketLengkap = `${jenisKategori} (${tglMulai} s.d ${tglSelesai}): ${keterangan} - Link: ${driveUrl}`;

    await queryTurso(
      'INSERT INTO presensi (nisn, tanggal, jam_masuk, status, keterangan, foto) VALUES (?, ?, ?, ?, ?, ?)',
      [nisnVal, tglMulai, getJamWIB(), statusFinal, ketLengkap, driveUrl]
    );

    alert(`Permohonan ${jenisKategori} (${tglMulai} s.d ${tglSelesai}) berhasil diteruskan ke Guru Piket!`);
    tutupModalijinDispen();
    muatPresensiSiswaHariIni();
    muatRiwayatSiswa();
  } catch (err) {
    alert("Gagal mengirim pengajuan: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}
