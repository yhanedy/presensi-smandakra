/* =========================================================
   NAV.JS — Bottom navigation universal untuk semua halaman
   ========================================================= */

(function renderBottomNav() {
  // Daftar menu navigasi
  const menu = [
    { id: 'presensi',      label: 'Presensi',      icon: 'fa-fingerprint', href: 'siswa.html' },
    { id: 'perpustakaan',  label: 'Perpustakaan',  icon: 'fa-book-open',   href: 'perpustakaan.html' },
    { id: 'salat',         label: 'Salat',         icon: 'fa-mosque',      href: 'salat.html' }
  ];

  // Deteksi halaman aktif dari nama file di URL
  // Jika URL berakhiran '/' (root), kita anggap sedang di siswa.html
  let currentPath = window.location.pathname.split('/').pop();
  if (currentPath === '' || currentPath === 'index.html') {
    currentPath = 'siswa.html'; 
  }

  // Cari ID menu yang cocok dengan nama file saat ini
  const activeId = menu.find(m => m.href === currentPath)?.id || 'presensi';

  // Buat elemen <nav>
  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.setAttribute('aria-label', 'Navigasi utama');

  // Isi dengan link (<a>) bukan tombol (<button>)
  nav.innerHTML = menu.map(m => `
    <a href="${m.href}"
       class="nav-item ${m.id === activeId ? 'active' : ''}"
       data-page="${m.id}"
       aria-current="${m.id === activeId ? 'page' : 'false'}">
      <i class="fa-solid ${m.icon}"></i>
      <span>${m.label}</span>
    </a>
  `).join('');

  // Cari tempat penampungan (id="bottom-nav-root") dan ganti dengan nav yang baru dibuat
  const root = document.getElementById('bottom-nav-root');
  if (root) {
    root.replaceWith(nav);
  } else {
    // Jika id="bottom-nav-root" tidak ditemukan, tempelkan di akhir body
    document.body.appendChild(nav);
  }
})();
