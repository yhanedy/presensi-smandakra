/* =========================================================
   NAV.JS — Bottom navigation universal
   ========================================================= */
(function renderBottomNav() {
  const menu = [
    { id: 'presensi',      label: 'Presensi', icon: 'fa-fingerprint', href: 'https://yhanedy.github.io/presensi-smandakra/siswa.html' },
    { id: 'perpustakaan',  label: 'Mandala',  icon: 'fa-book-open',   href: 'https://yhanedy.github.io/perpus-smanda/' },
    { id: 'salat',         label: 'Sholat',   icon: 'fa-mosque',      href: 'https://yhanedy.github.io/sholat.html' }
  ];

  let activeId = 'presensi'; // Default
  const url = window.location.href;

  // Deteksi halaman aktif berdasarkan URL
  if (url.includes('perpus-smanda')) {
    activeId = 'perpustakaan';
  } else if (url.includes('salat.html')) {
    activeId = 'salat';
  } else if (url.includes('presensi-smandakra') || url.includes('siswa.html')) {
    activeId = 'presensi';
  }

  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.setAttribute('aria-label', 'Navigasi utama');

  nav.innerHTML = menu.map(m => `
    <a href="${m.href}"
       class="nav-item ${m.id === activeId ? 'active' : ''}"
       data-page="${m.id}">
      <i class="fa-solid ${m.icon}"></i>
      <span>${m.label}</span>
    </a>
  `).join('');

  const root = document.getElementById('bottom-nav-root');
  if (root) {
    root.replaceWith(nav);
  } else {
    document.body.appendChild(nav);
  }
})();
