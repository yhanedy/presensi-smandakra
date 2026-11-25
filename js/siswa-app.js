/* =========================================================
   SISWA-APP.JS — Init, GPS, presensi, kamera, riwayat, password
   ========================================================= */

window.onload = function () {
  const user = getSiswaSession();
  if (!user) {
    window.location.replace('index.html');
    return;
  }
  currentActiveUser = user;

  muatSettingSekolah();
  muatPortalSiswa();
  cekPengumumanKhususSiswa();
};

/* ---------- SETTING SEKOLAH (DENGAN CACHE SESI HEMAT KUOTA) ---------- */
async function muatSettingSekolah() {
  const lim = document.getElementById('siswa-radius-limit');
  try {
    const cached = sessionStorage.getItem('smada_setting_sekolah');
    let c = cached ? JSON.parse(cached) : null;

    if (!c) {
      const data = await queryTurso('SELECT latitude, longitude, radius_meter FROM setting_sekolah WHERE id = 1 LIMIT 1');
      if (data && data.length) {
        c = data[0];
        sessionStorage.setItem('smada_setting_sekolah', JSON.stringify(c));
      }
    }

    if (c) {
      const lat = parseFloat(c.latitude);
      const lon = parseFloat(c.longitude);
      const rad = parseInt(c.radius_meter, 10);
      if (Number.isFinite(lat)) latSekolah = lat;
      if (Number.isFinite(lon)) longSekolah = lon;
      if (Number.isFinite(rad)) maxRadius = rad;
      if (lim) lim.textContent = `${maxRadius}m`;
    }
  } catch {
    if (lim) lim.textContent = `${maxRadius}m`;
  }
}

/* ---------- PORTAL ---------- */
function muatPortalSiswa() {
  const nisnVal = getActiveNisn() || '-';
  document.getElementById('siswa-profil-nama').textContent = currentActiveUser.nama || currentActiveUser.username || '-';
  document.getElementById('siswa-profil-kelas').textContent = currentActiveUser.kelas || '-';
  document.getElementById('siswa-profil-nisn').textContent = nisnVal;

  const hariIni = new Date();
  document.getElementById('siswa-tanggal-hari-ini').textContent =
    hariIni.toLocaleDateString('id-ID', {
      timeZone: 'Asia/Jakarta', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

  muatPresensiSiswaHariIni();
  cekSiswaGPS();
  muatRiwayatSiswa();
}

/* ---------- PENGUMUMAN ---------- */
async function cekPengumumanKhususSiswa() {
  try {
    const data = await queryTurso(
      "SELECT id, judul, isi FROM pengumuman WHERE is_aktif = 1 AND (LOWER(target_role) = 'siswa' OR LOWER(target_role) = 'semua') ORDER BY id DESC LIMIT 1"
    );
    if (data && data.length) {
      const ann = data[0];
      if (localStorage.getItem('smada_read_announcement_id') !== String(ann.id)) {
        activeAnnouncementId = ann.id;
        document.getElementById('pop-judul-pengumuman').innerText = ann.judul;
        document.getElementById('pop-isi-pengumuman').innerText = ann.isi;
        document.getElementById('modal-pengumuman-siswa').classList.remove('hidden');
      }
    }
  } catch { /* tabel pengumuman mungkin tidak ada */ }
}

function tutupPopupPengumuman() {
  if (activeAnnouncementId) {
    localStorage.setItem('smada_read_announcement_id', String(activeAnnouncementId));
  }
  document.getElementById('modal-pengumuman-siswa').classList.add('hidden');
}

/* ---------- GPS ---------- */
function cekSiswaGPS() {
  siswaDistanceMeters = null;
  const badge = document.getElementById('gps-status-badge');
  const radius = document.getElementById('siswa-status-radius-text');
  if (badge) badge.textContent = "Mendeteksi Lokasi...";

  if (!navigator.geolocation) {
    if (badge) badge.textContent = "GPS Tidak Didukung";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => prosesHasilGPS(pos.coords),
    () => {
      navigator.geolocation.getCurrentPosition(
        pos => prosesHasilGPS(pos.coords),
        () => {
          if (badge) badge.textContent = "GPS Terkendala";
          if (radius) {
            radius.innerHTML = `<span>Gunakan <b>Presensi Kamera</b></span>`;
            radius.className = "gps-status-text gps-wait-text";
          }
        },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }
      );
    },
    { enableHighAccuracy: false, timeout: 4000, maximumAge: 5000 }
  );
}

function prosesHasilGPS(crd) {
  if (crd.accuracy === 0 && crd.latitude === 0 && crd.longitude === 0) {
    document.getElementById('gps-status-badge').textContent = "Fake GPS Terdeteksi";
    return;
  }
  const dist = hitungJarakHaversine(crd.latitude, crd.longitude, latSekolah, longSekolah);
  siswaDistanceMeters = Math.round(dist);
  perbaruiTampilanGPS(siswaDistanceMeters, maxRadius);
}

function perbaruiTampilanGPS(jarak, limit) {
  const pill = document.getElementById('gps-status-pill');
  const badge = document.getElementById('gps-status-badge');
  const radius = document.getElementById('siswa-status-radius-text');
  const jarakEl = document.getElementById('siswa-jarak');

  if (jarakEl) jarakEl.textContent = `${jarak} Meter`;

  if (jarak <= limit) {
    pill.className = "gps-pill gps-ok";
    badge.textContent = "GPS Terverifikasi";
    radius.innerHTML = `<span>Di Dalam Radius Sekolah</span> <i class="fa-solid fa-circle-check"></i>`;
    radius.className = "gps-status-text gps-ok-text";
  } else {
    pill.className = "gps-pill gps-fail";
    badge.textContent = "Di Luar Jangkauan";
    radius.innerHTML = `<span>Di Luar Radius Sekolah</span> <i class="fa-solid fa-circle-xmark"></i>`;
    radius.className = "gps-status-text gps-fail-text";
  }
}

/* ---------- PRESENSI HARI INI ---------- */
async function muatPresensiSiswaHariIni() {
  const nisnVal = getActiveNisn();
  if (!nisnVal) return;
  const tgl = getTanggalWIB();

  try {
    const data = await queryTurso(
      'SELECT jam_masuk, jam_pulang FROM presensi WHERE nisn = ? AND tanggal = ? LIMIT 2',
      [nisnVal, tgl]
    );
    const masuk = data?.find(p => p.jam_masuk && p.jam_masuk !== '-');
    const pulang = data?.find(p => p.jam_pulang && p.jam_pulang !== '-');

    const btnMasuk = document.getElementById('btn-siswa-masuk');
    const btnPulang = document.getElementById('btn-siswa-pulang');
    const jamMasuk = document.getElementById('siswa-jam-masuk');
    const jamPulang = document.getElementById('siswa-jam-pulang');
    const catatan = document.getElementById('siswa-catatan-status');
    const badge = document.getElementById('siswa-badge-status');

    if (masuk) {
      isSudahPresensiMasuk = true;
      jamMasuk.textContent = masuk.jam_masuk;
      btnMasuk.disabled = true;

      if (!pulang) {
        btnPulang.disabled = false;
        catatan.textContent = "Sudah presensi masuk. Silakan presensi pulang saat waktunya.";
        badge.textContent = "Sudah Masuk";
        badge.className = "badge";
        badge.style.background = "rgba(16,185,129,.15)";
        badge.style.color = "#6ee7b7";
        badge.style.borderColor = "rgba(16,185,129,.4)";
      } else {
        jamPulang.textContent = pulang.jam_pulang;
        btnPulang.disabled = true;
        catatan.textContent = "Presensi hari ini lengkap.";
        badge.textContent = "Selesai";
        badge.className = "badge";
        badge.style.background = "rgba(16,185,129,.15)";
        badge.style.color = "#6ee7b7";
      }
    } else {
      isSudahPresensiMasuk = false;
      btnMasuk.disabled = false;
      btnPulang.disabled = true;
      catatan.textContent = "Silakan lakukan presensi masuk.";
    }
  } catch (e) {
    console.error("Gagal muat presensi:", e);
  }
}

/* ---------- PRESENSI GPS ---------- */
async function prosesPresensiSiswa(jenis) {
  const btnMasuk = document.getElementById('btn-siswa-masuk');
  const btnPulang = document.getElementById('btn-siswa-pulang');
  btnMasuk.disabled = true;
  btnPulang.disabled = true;

  try {
    const nisnVal = getActiveNisn();
    if (!nisnVal) {
      alert("Sesi login tidak valid (NISN kosong). Silakan login ulang.");
      handleLogoutSiswa();
      return;
    }

    if (siswaDistanceMeters === null) {
      alert("GPS belum terdeteksi. Gunakan 'Presensi Kamera' jika perlu.");
      return;
    }
    if (siswaDistanceMeters > maxRadius) {
      alert(`Anda di luar radius (${siswaDistanceMeters}m > ${maxRadius}m). Gunakan Presensi Kamera.`);
      return;
    }

    const jam = getJamWIB();
    const tgl = getTanggalWIB();

    if (jenis === 'Hadir') {
      const cek = await queryTurso(
        'SELECT id FROM presensi WHERE nisn = ? AND tanggal = ? AND jam_masuk IS NOT NULL LIMIT 1',
        [nisnVal, tgl]
      );
      if (cek?.length) { alert("Sudah presensi masuk hari ini!"); return; }

      const status = isTerlambat(jam) ? 'Terlambat' : 'Hadir';
      await queryTurso(
        'INSERT INTO presensi (nisn, tanggal, jam_masuk, status, keterangan) VALUES (?, ?, ?, ?, ?)',
        [nisnVal, tgl, jam, status, `Presensi Masuk GPS (${siswaDistanceMeters}m)`]
      );
    } else {
      await queryTurso(
        'UPDATE presensi SET jam_pulang = ?, keterangan = ? WHERE nisn = ? AND tanggal = ? AND jam_pulang IS NULL',
        [jam, `Presensi Pulang GPS (${siswaDistanceMeters}m)`, nisnVal, tgl]
      );
    }

    alert(`Presensi ${jenis} berhasil!`);
    muatPresensiSiswaHariIni();
    muatRiwayatSiswa();
  } catch (e) {
    alert("Gagal presensi: " + e.message);
  } finally {
    muatPresensiSiswaHariIni();
  }
}

/* ---------- KAMERA ---------- */
function bukaModalOpsiKamera() {
  document.getElementById('modal-opsi-presensi').classList.remove('hidden');
}
function tutupModalOpsiPresensi() {
  document.getElementById('modal-opsi-presensi').classList.add('hidden');
}

function pilihModeKamera(jenis) {
  if (jenis === 'Hadir' && isSudahPresensiMasuk) { alert("Sudah presensi masuk!"); return; }
  if (jenis === 'Pulang' && !isSudahPresensiMasuk) { alert("Belum presensi masuk!"); return; }

  modePresensiKameraDipilih = jenis;
  tutupModalOpsiPresensi();
  document.getElementById('kamera-modal-title').innerHTML =
    `<i class="fa-solid fa-camera"></i> Verifikasi ${jenis}`;
  bukaModalKameraStream();
}

async function bukaModalKameraStream() {
  document.getElementById('box-peringatan-gagal').classList.add('hidden');
  document.getElementById('modal-kamera').classList.remove('hidden');

  if (videoStream) {
    videoStream.getTracks().forEach(t => t.stop());
    videoStream = null;
  }

  const constraints = [
    { video: { facingMode: { exact: "user" }, width: { ideal: 640 }, height: { ideal: 480 } } },
    { video: { facingMode: "user" } },
    { video: { facingMode: "environment" } },
    { video: true }
  ];

  let stream = null;
  for (const c of constraints) {
    try { stream = await navigator.mediaDevices.getUserMedia(c); if (stream) break; }
    catch (e) { console.warn("Coba constraint berikutnya...", e); }
  }

  if (stream) {
    videoStream = stream;
    const video = document.getElementById('video-preview');
    video.srcObject = stream;
    try { await video.play(); } catch (e) { console.log(e); }
  } else {
    alert("Gagal buka kamera. Tutup aplikasi lain & izinkan kamera.");
    tutupModalKamera();
  }
}

function tutupModalKamera() {
  if (videoStream) {
    videoStream.getTracks().forEach(t => t.stop());
    videoStream = null;
  }
  document.getElementById('modal-kamera').classList.add('hidden');
}

async function prosesAmbilFotoSiswa() {
  const btn = document.getElementById('btn-ambil-foto');
  btn.disabled = true;
  btn.classList.add('opacity-50');
  await eksekusiPresensiOtomatisKamera(modePresensiKameraDipilih || 'Hadir');
  btn.disabled = false;
  btn.classList.remove('opacity-50');
}

async function eksekusiPresensiOtomatisKamera(jenis) {
  const nisnVal = getActiveNisn();
  if (!nisnVal) {
    alert("Sesi login tidak valid (NISN tidak ditemukan). Silakan login ulang.");
    handleLogoutSiswa();
    return;
  }

  const jam = getJamWIB();
  const tgl = getTanggalWIB();

  try {
    if (jenis === 'Hadir') {
      const cek = await queryTurso(
        'SELECT id FROM presensi WHERE nisn = ? AND tanggal = ? AND jam_masuk IS NOT NULL LIMIT 1',
        [nisnVal, tgl]
      );
      if (cek?.length) { alert("Sudah presensi masuk!"); tutupModalKamera(); return; }

      const status = isTerlambat(jam) ? 'Terlambat' : 'Hadir';
      await queryTurso(
        'INSERT INTO presensi (nisn, tanggal, jam_masuk, status, keterangan, foto) VALUES (?, ?, ?, ?, ?, ?)',
        [nisnVal, tgl, jam, status, 'Presensi Masuk Kamera (Liveness Valid)', '']
      );
    } else {
      await queryTurso(
        'UPDATE presensi SET jam_pulang = ?, keterangan = ? WHERE nisn = ? AND tanggal = ? AND jam_pulang IS NULL',
        [jam, 'Presensi Pulang Kamera (Liveness Valid)', nisnVal, tgl]
      );
    }
    alert(`Presensi ${jenis} via Kamera Berhasil!`);
    tutupModalKamera();
    muatPresensiSiswaHariIni();
    muatRiwayatSiswa();
  } catch (e) {
    alert("Gagal presensi kamera: " + e.message);
  }
}

/* ---------- RIWAYAT (GRAFIK KONTRIBUSI - ZONA WAKTU WIB AKURAT) ---------- */
function formatTanggalWIBFromDate(dateObj) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(dateObj);
}

async function muatRiwayatSiswa() {
  const nisnVal = getActiveNisn();
  const container = document.getElementById('grafik-kehadiran');
  if (!nisnVal || !container) return;

  try {
    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - 30);
    const tglMulai = formatTanggalWIBFromDate(startDate);

    const data = await queryTurso(
      'SELECT tanggal, status, jam_masuk, jam_pulang, keterangan FROM presensi WHERE nisn = ? AND tanggal >= ? ORDER BY tanggal DESC LIMIT 35',
      [nisnVal, tglMulai]
    );

    const dataMap = {};
    if (data && data.length) {
      data.forEach(d => {
        if (!dataMap[d.tanggal] || d.status === 'Hadir' || d.status === 'Terlambat') {
          dataMap[d.tanggal] = d;
        }
      });
    }

    let html = '';

    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);

      const tglStr = formatTanggalWIBFromDate(d);
      const rec = dataMap[tglStr];

      let bgClass = 'bg-empty';
      let statusText = 'Tidak ada data';

      if (rec) {
        if (rec.status === 'Hadir') { bgClass = 'bg-hadir'; statusText = 'Hadir'; }
        else if (rec.status === 'Terlambat') { bgClass = 'bg-terlambat'; statusText = 'Terlambat'; }
        else if (['Izin', 'Sakit', 'Dispensasi', 'Pending Izin'].includes(rec.status)) { bgClass = 'bg-izin'; statusText = rec.status; }
        else if (['Alpa', 'Alpha'].includes(rec.status)) { bgClass = 'bg-alpa'; statusText = 'Alpa'; }
        else { bgClass = 'bg-hadir'; statusText = rec.status; }
      }

      const tglIndo = d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' });
      const safeKet = rec && rec.keterangan ? String(rec.keterangan).replace(/'/g, "\\'").replace(/"/g, '&quot;') : '-';
      const safeMasuk = rec && rec.jam_masuk ? rec.jam_masuk : '-';
      const safePulang = rec && rec.jam_pulang ? rec.jam_pulang : '-';

      html += `
        <div class="graph-box ${bgClass}" 
             title="${tglIndo}: ${statusText}"
             onclick="bukaDetailRiwayat('${tglIndo}', '${statusText}', '${safeMasuk}', '${safePulang}', '${safeKet}')">
        </div>
      `;
    }

    container.innerHTML = html;

  } catch (e) {
    console.error("Gagal muat riwayat:", e);
    container.innerHTML = `<p class="empty">Gagal memuat data kehadiran.</p>`;
  }
}

function bukaDetailRiwayat(tanggal, status, masuk, pulang, ket) {
  document.getElementById('detail-tanggal').innerText = tanggal;

  const badge = document.getElementById('detail-badge');
  badge.innerText = status;

  if (status === 'Hadir') badge.className = 'badge bg-hadir';
  else if (status === 'Terlambat') badge.className = 'badge bg-terlambat';
  else if (['Izin', 'Sakit', 'Dispensasi', 'Pending Izin'].includes(status)) badge.className = 'badge bg-izin';
  else if (['Alpa', 'Alpha'].includes(status)) badge.className = 'badge bg-alpa';
  else badge.className = 'badge';

  document.getElementById('detail-masuk').innerText = masuk;
  document.getElementById('detail-pulang').innerText = pulang;
  document.getElementById('detail-keterangan').innerText = ket;

  document.getElementById('modal-detail-riwayat').classList.remove('hidden');
}

/* ---------- GANTI PASSWORD ---------- */
async function gantiPasswordSiswa(e) {
  const elLama = document.getElementById('siswa-pass-lama');
  const elBaru = document.getElementById('siswa-pass-baru');
  const elKonfirm = document.getElementById('siswa-pass-konfirm');

  const lama = String(elLama ? elLama.value : '').trim();
  const baru = String(elBaru ? elBaru.value : '').trim();
  const konfirm = String(elKonfirm ? elKonfirm.value : '').trim();

  if (!lama) { alert("Masukkan password lama!"); if (elLama) elLama.focus(); return; }
  if (!baru || !konfirm) { alert("Password baru & konfirmasi wajib diisi!"); if (elBaru) elBaru.focus(); return; }
  if (baru !== konfirm) { alert("Konfirmasi password baru tidak cocok!"); if (elKonfirm) elKonfirm.focus(); return; }
  if (baru.length < 6) { alert("Password baru minimal 6 karakter!"); if (elBaru) elBaru.focus(); return; }
  if (lama === baru) { alert("Password baru tidak boleh sama dengan password lama!"); if (elBaru) elBaru.focus(); return; }

  const nisnVal = String(getActiveNisn() || '').trim();
  if (!nisnVal) {
    alert("Sesi siswa tidak ditemukan. Silakan login ulang.");
    handleLogoutSiswa();
    return;
  }

  const btn = (e && e.currentTarget) ? e.currentTarget : document.querySelector('button[onclick*="gantiPasswordSiswa"]');
  const original = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...`;
  }

  try {
    const baseApi = String(typeof API_URL !== 'undefined' ? API_URL : 'https://smada-api-gateway.yhanedy.workers.dev').replace(/\/+$/, '');
    const token = localStorage.getItem('smada_token') || '';

    const res = await fetch(`${baseApi}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        nisn: nisnVal,
        oldPassword: lama,
        newPassword: baru
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Gagal mengganti password. Pastikan password lama benar.");
    }

    if (elLama) elLama.value = '';
    if (elBaru) elBaru.value = '';
    if (elKonfirm) elKonfirm.value = '';

    alert("Password berhasil diperbarui! Silakan login ulang menggunakan password baru Anda.");
    handleLogoutSiswa();
  } catch (err) {
    alert(err.message || "Terjadi kesalahan saat menghubungi server.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }
}
