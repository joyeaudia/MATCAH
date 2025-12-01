(function () {
  'use strict';

  // ====== CHOICE BUTTONS (reveal/surprise) - tetap seperti awal ======
  const choices = Array.from(document.querySelectorAll('.choice-btn'));
  choices.forEach(btn => {
    btn.addEventListener('click', () => {
      choices.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
    });
  });

  // ====== THEME SWATCHES ======
  const swatches   = Array.from(document.querySelectorAll('.theme-swatch'));
  const previewImg = document.getElementById('theme-preview-img');
  const previewWrap = document.getElementById('theme-preview-wrap');
  const giftFormEl = document.querySelector('.gift-form');

  // mapping theme -> gambar besar
  const themePreviewMap = {
    theme1: 'gif/pic11.png',
    theme2: 'gif/pic22.png',
    theme3: 'gif/pic33.png',
    theme4: 'gif/pic44.png',
    theme5: 'gif/pic55.png'
  };

  function selectSwatch(el) {
    if (!el || !previewImg) return;

    // reset state semua swatch
    swatches.forEach(s => {
      s.classList.remove('active');
      s.setAttribute('aria-pressed', 'false');
    });

    el.classList.add('active');
    el.setAttribute('aria-pressed', 'true');

    const themeKey = el.dataset.theme;
    const img = el.querySelector('img');

    // default: pakai src gambar kecil
    let newSrc = img ? img.getAttribute('src') : previewImg.getAttribute('src');

    // kalau ada di map, pakai gambar besar yang di-mapping
    if (themeKey && themePreviewMap[themeKey]) {
      newSrc = themePreviewMap[themeKey];
    }

    previewImg.src = newSrc;
    if (img) {
      previewImg.alt = img.alt || 'Selected theme';
    }

    // simpan pilihan theme ke form (buat dipakai di checkout)
    if (giftFormEl) {
      giftFormEl.dataset.selectedTheme = themeKey || '';
    }

    // animasi kecil biar kerasa berubah
    if (previewWrap && previewWrap.animate) {
      try {
        previewWrap.animate(
          [{ opacity: 0.85 }, { opacity: 1 }],
          { duration: 220 }
        );
      } catch (e) {}
    }
  }

  // pasang event listener ke tiap swatch + pilih awal
  swatches.forEach((s, idx) => {
    const inner = s.querySelector('img');
    if (!inner) s.classList.add('empty');

    s.addEventListener('click', () => selectSwatch(s));

    // set pertama sebagai default kalau belum ada yang aktif
    if (idx === 0 && !document.querySelector('.theme-swatch.active')) {
      selectSwatch(s);
    }
  });

  // debug helper kalau mau cek dari console
  window.getSelectedGiftTheme = () =>
    document.querySelector('.gift-form')?.dataset.selectedTheme || null;

  // ====== GIFT CONFIG -> simpan ke localStorage ======
  const msgInput  = document.getElementById('message');
  const fromInput = document.getElementById('from');
  const giftNext  = document.getElementById('gift-next');

  function getCurrentRevealMode() {
    const activeChoice = document.querySelector('.choice-btn.active');
    return activeChoice ? (activeChoice.dataset.choice || 'reveal') : 'reveal';
  }

  function saveGiftConfig() {
    const cfg = {
      type: 'gift',
      message: msgInput?.value?.trim() || '',
      fromName: fromInput?.value?.trim() || '',
      revealMode: getCurrentRevealMode(),               // 'reveal' / 'surprise'
      theme: giftFormEl?.dataset.selectedTheme || null  // ex: 'theme3'
    };

    try {
      localStorage.setItem('giftConfig_v1', JSON.stringify(cfg));
    } catch (e) {
      console.warn('Failed to save giftConfig_v1', e);
    }
  }

  if (giftNext) {
    giftNext.addEventListener('click', function () {
      // sebelum pindah ke cekout.html, simpan dulu semua pilihan gift
      saveGiftConfig();
      // biarkan link jalan normal
    });
  }
})();
