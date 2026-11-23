async function kirimPermohonanIzinHarian() {
  const alasan = document.getElementById('ijin-alasan')?.value.trim() || '';
  const btn = document.getElementById('btnKirimIjinHarian');

  if (!alasan) { alert("Tuliskan alasan izin secara jelas!"); return; }
  if (!fotoIzinBase64) { alert("Wajib mefoto Surat Izin Tulis Tangan!"); return; }

  const nisnVal = getActiveNisn();
  if (!nisnVal) { alert("Sesi siswa tidak ditemukan, silakan login ulang."); return; }

  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Mengunggah...`;

  try {
    const driveUrl = await uploadKeDriveGAS(fotoIzinBase64, "izin_tangan", "image/jpeg", "jpg");
    if (!driveUrl) return;

    const ket = `Izin Harian (1 Hari): ${alasan} - Link: ${driveUrl}`;

    await queryTurso(
      'INSERT INTO presensi (nisn, tanggal, jam_masuk, status, keterangan, foto) VALUES (?, ?, ?, ?, ?, ?)',
      [nisnVal, getTanggalWIB(), getJamWIB(), 'Pending Izin', ket, driveUrl]
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

  const nisnVal = getActiveNisn();
  if (!nisnVal) { alert("Sesi siswa tidak ditemukan, silakan login ulang."); return; }

  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Mengunggah...`;

  try {
    const driveUrl = await uploadKeDriveGAS(fileDispenBase64, "dispen_dokter", fileDispenMime, fileDispenExt);
    if (!driveUrl) return;

    const ketLengkap = `${jenisKategori} (${tglMulai} s.d ${tglSelesai}): ${keterangan} - Link: ${driveUrl}`;

    await queryTurso(
      'INSERT INTO presensi (nisn, tanggal, jam_masuk, status, keterangan, foto) VALUES (?, ?, ?, ?, ?, ?)',
      [nisnVal, tglMulai, getJamWIB(), 'Pending Izin', ketLengkap, driveUrl]
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
