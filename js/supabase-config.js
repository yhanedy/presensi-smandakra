// Memuat data jadwal dari database
async function muatSettingSekolah() {
    try {
        const { data } = await supabaseClient.from('setting_sekolah').select('*').eq('id', 1).single();
        if (data) {
            if (data.latitude) document.getElementById('gps-lat').value = data.latitude;
            if (data.longitude) document.getElementById('gps-long').value = data.longitude;
            if (data.radius_meter) document.getElementById('gps-radius').value = data.radius_meter;
            
            // Set Jam Presensi Default
            if (data.jam_masuk) document.getElementById('jam-masuk').value = data.jam_masuk;
            if (data.jam_pulang_senin_kamis) document.getElementById('jam-pulang-senin-kamis').value = data.jam_pulang_senin_kamis;
            if (data.jam_pulang_jumat) document.getElementById('jam-pulang-jumat').value = data.jam_pulang_jumat;
        }
    } catch (e) {
        console.log("Menggunakan setting default.");
    }
}

// Menyimpan jadwal ke database
async function simpanSettingJadwalHarian() {
    const jamMasuk = document.getElementById('jam-masuk').value;
    const jamSeninKamis = document.getElementById('jam-pulang-senin-kamis').value;
    const jamJumat = document.getElementById('jam-pulang-jumat').value;

    const { error } = await supabaseClient.from('setting_sekolah').upsert([
        { 
            id: 1, 
            jam_masuk: jamMasuk,
            jam_pulang_senin_kamis: jamSeninKamis, 
            jam_pulang_jumat: jamJumat 
        }
    ]);

    if (error) {
        alert("Gagal menyimpan jadwal: " + error.message);
    } else {
        alert("Jadwal Presensi Berhasil Disimpan!\n\n• Jam Masuk: " + jamMasuk + "\n• Pulang Senin-Kamis: " + jamSeninKamis + "\n• Pulang Jumat: " + jamJumat);
    }
}

// HELPER FUNGSI: Cek Jam Pulang Otomatis Berdasarkan Hari Ini (Digunakan di halaman siswa)
function getJamPulangHariIni(setting) {
    const hariIni = new Date().getDay(); // 5 = Jumat
    if (hariIni === 5) {
        return setting.jam_pulang_jumat || '14:00';
    } else {
        return setting.jam_pulang_senin_kamis || '15:31';
    }
}
