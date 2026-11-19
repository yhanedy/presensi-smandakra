// js/siswa-ijin.js — Modul Izin Bersih & Anti-Error
let fotoIzinBase64 = null;
let fileDispenBase64 = null;
let fileDispenMime = 'image/jpeg';
let fileDispenExt = 'jpg';

function bukaModalIzinDispen() {
  fotoIzinBase64 = null;
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

  lockButton('btnKirimIjinHarian', true);
  lockButton('btnKirimDispenDokter', true);
  
  const boxPreview = document.getElementById('ijinPreviewBox');
  if (boxPreview) boxPreview.classList.add('hidden');
  
  const fileNama = document.getElementById('dispenFileNama');
  if (fileNama) fileNama.classList.add('hidden');
  
  const imgDispen = document.getElementById('dispenFotoPreview');
  if (imgDispen) { imgDispen.src = '#'; imgDispen.classList.add('hidden'); }

  const inputIzin = document.getElementById('ijinFotoInput');
  const inputDispen = document.getElementById('dispenFileInput');
  if (inputIzin) inputIzin.value = '';
  if (inputDispen) inputDispen.value = '';

  switchTabIzinDispen('tab-ijin-harian');
  
  const modal = document.getElementById('modal-permohonan-ijin');
  if (modal) modal.classList.remove('hidden');
  else alert("Error: Elemen modal-permohonan-ijin tidak ditemukan di HTML!");
}

function tutupModalIzinDispen() {
  const modal = document.getElementById('modal-permohonan-ijin');
  if (modal) modal.classList.add('hidden');
  fotoIzinBase64 = null;
  fileDispenBase64 = null;
}

function lockButton(id, locked) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = locked;
  btn.classList.toggle('opacity-50', locked);
}

function switchTabIzinDispen(tabId) {
  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
  const target = document.getElementById(tabId);
  if (target) target.classList.remove('hidden');
  
  const btnHarian = document.getElementById('btn-tab-ijin-harian');
  const btnDispen = document.getElementById('btn-tab-dispen');
  if (btnHarian) btnHarian.classList.toggle('active', tabId === 'tab-ijin-harian');
  if (btnDispen) btnDispen.classList.toggle('active', tabId === 'tab-dispen');
}

async function previewFotoIzin(event) {
  const file = event.target.files[0];
  if (!file) {
    fotoIzinBase64 = null;
    lockButton('btnKirimIjinHarian', true);
    return;
  }
  try {
    fotoIzinBase64 = await kompresGambar(file, 800, 0.7);
    const img = document.getElementById('ijinFotoPreview');
    const box = document.getElementById('ijinPreviewBox');
    if (img) img.src = fotoIzinBase64;
    if (box) box.classList.remove('hidden');
    lockButton('btnKirimIjinHarian', false);
  } catch (e) {
    alert(e.message);
    event.target.value = '';
    lockButton('btnKirimIjinHarian', true);
  }
}

async function previewFileDispen(event) {
  const file = event.target.files[0];
  if (!file) {
    fileDispenBase64 = null;
    lockButton('btnKirimDispenDokter', true);
    return;
  }
  const nama = document.getElementById('dispenFileNama');
  const img = document.getElementById('dispenFotoPreview');

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
    reader.readAsDataURL(file);
    return;
  }

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
    lockButton('btnKirimDispenDokter', true);
  }
}

async function kirimPermohonanIzinHarian() {
  const alasan = document.getElementById('ijin-alasan')?.value.trim() || '';
  const btn = document.getElementById('btnKirimIjinHarian');

  if (!alasan) { alert("Tuliskan alasan izin secara jelas!"); return; }
  if (!fotoIzinBase64) { alert("Wajib mefoto Surat Izin Tulis Tangan!"); return; }

  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Mengunggah...`;

  try {
    const driveUrl = await uploadKeDriveGAS(fotoIzinBase64, "izin_tangan", "image/jpeg", "jpg");
    if (!driveUrl) return;

    const nisnVal = String(currentActiveUser.nisn || currentActiveUser.username).trim();
    const ket = `Izin Harian (1 Hari): ${alasan} - Link: ${driveUrl}`;

    await queryTurso(
      'INSERT INTO presensi (nisn, tanggal, jam_masuk, status, keterangan, foto) VALUES (?, ?, ?, ?, ?, ?)',
      [nisnVal, getTanggalWIB(), getJamWIB(), 'Izin', ket, driveUrl]
    );

    alert(`Permohonan Izin berhasil dikirim ke Guru Piket!`);
    tutupModalIzinDispen();
    muatPresensiSiswaHariIni();
    muatRiwayatSiswa();
  } catch (err) {
    alert("Gagal mengirim izin: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Kirim ke Piket`;
  }
}

async function kirimPermohonanDispenDokter() {
  const jenisKategori = document.getElementById('dispenKategori')?.value || 'Dispensasi';
  const tglMulai = document.getElementById('dispenTglMulai')?.value;
  const tglSelesai = document.getElementById('dispenTglSelesai')?.value;
  const keterangan = document.getElementById('dispenKeterangan')?.value.trim() || '';
  const btn = document.getElementById('btnKirimDispenDokter');

  if (!keterangan) { alert("Tuliskan keterangan!"); return; }
  if (!tglMulai || !tglSelesai) { alert("Pilih rentang tanggal!"); return; }
  if (tglSelesai < tglMulai) { alert("Tanggal selesai tidak boleh sebelum tanggal mulai!"); return; }
  if (!fileDispenBase64) { alert("Wajib lampirkan Surat Dokter / Tugas!"); return; }

  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Mengunggah...`;

  try {
    const driveUrl = await uploadKeDriveGAS(fileDispenBase64, "dispen_dokter", fileDispenMime, fileDispenExt);
    if (!driveUrl) return;

    const nisnVal = String(currentActiveUser.nisn || currentActiveUser.username).trim();
    const statusFinal = jenisKategori.includes('Sakit') ? 'Sakit' : 'Dispensasi';
    const ketLengkap = `${jenisKategori} (${tglMulai} s.d ${tglSelesai}): ${keterangan} - Link: ${driveUrl}`;

    await queryTurso(
      'INSERT INTO presensi (nisn, tanggal, jam_masuk, status, keterangan, foto) VALUES (?, ?, ?, ?, ?, ?)',
      [nisnVal, tglMulai, getJamWIB(), statusFinal, ketLengkap, driveUrl]
    );

    alert(`Permohonan ${jenisKategori} berhasil diteruskan ke Guru Piket!`);
    tutupModalIzinDispen();
    muatPresensiSiswaHariIni();
    muatRiwayatSiswa();
  } catch (err) {
    alert("Gagal mengirim pengajuan: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Kirim ke Piket`;
  }
}
