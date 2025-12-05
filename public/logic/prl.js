// prl.js — Profile + default address per user (berdasarkan email)
(function () {
  const DEFAULT_PROFILE = {
    firstName: 'Veren',
    lastName: 'Florensa',
    email: 'verentflorensa@gmail.com',
    phone: '08118281416',
    address: 'Green Lake City cluster Europe,\nKetapang, Cipondoh.\nTangerang, Banten 15147',
    memberSince: '2024'
  };

  const PROFILE_KEY = 'profile';
  const GLOBAL_ADDR_KEY = 'savedAddresses_v1'; // key lama (global, sebelum per-user)

  function safeParseJSON(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function getProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return DEFAULT_PROFILE;
      const parsed = JSON.parse(raw);
      return Object.assign({}, DEFAULT_PROFILE, parsed);
    } catch (e) {
      return DEFAULT_PROFILE;
    }
  }

  // 🔹 Ambil daftar alamat:
  // - Kalau ada email login → pakai key per-user: savedAddresses_v1_<email>
  // - Kalau kosong → coba key lama global, dan migrasi ke key per-user
  function getSavedAddresses() {
    const emailRaw = (localStorage.getItem('maziEmail') || '').toLowerCase().trim();

    // Tidak ada info email → pakai key global saja (behaviour lama)
    if (!emailRaw) {
      const globalArr = safeParseJSON(localStorage.getItem(GLOBAL_ADDR_KEY), null);
      return Array.isArray(globalArr) ? globalArr : [];
    }

    const USER_KEY = GLOBAL_ADDR_KEY + '_' + emailRaw;

    // 1) coba key per-user
    let perUserArr = safeParseJSON(localStorage.getItem(USER_KEY), null);
    if (Array.isArray(perUserArr) && perUserArr.length) {
      return perUserArr;
    }

    // 2) kalau belum ada, coba key global lama → migrasi ke per-user
    const globalArr = safeParseJSON(localStorage.getItem(GLOBAL_ADDR_KEY), null);
    if (Array.isArray(globalArr) && globalArr.length) {
      try {
        localStorage.setItem(USER_KEY, JSON.stringify(globalArr));
        // optional: hapus key global supaya ke depan semua pakai per-user
        // localStorage.removeItem(GLOBAL_ADDR_KEY);
      } catch (e) {
        console.warn('Failed to migrate addresses to per-user key', e);
      }
      return globalArr;
    }

    return [];
  }

  function chooseAddress(arr) {
    if (!arr || !arr.length) return null;
    const def = arr.find(a => a && a.isDefault);
    return def || arr[0] || null;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function nl2br_escaped(s) {
    return escapeHtml(s).replace(/\n/g, '<br>');
  }

  function setText(id, text, options = {}) {
    const el = document.getElementById(id);
    if (!el) return;
    if (options.allowHtml) {
      el.innerHTML = text || '';
    } else {
      el.textContent = text || '';
    }
  }

  function render() {
    // 🔹 isi basic profile
    const p = getProfile();
    setText('name-first', p.firstName || '');
    setText('name-last', p.lastName || '');
    setText('email-val', p.email || '');
    setText('phone-val', p.phone || '');
    setText('member-since', p.memberSince || '');

    // 🔹 ambil alamat dari savedAddresses (per-user)
    const addrs = getSavedAddresses();
    const chosen = chooseAddress(addrs);

    if (chosen) {
      const label = escapeHtml(chosen.label || '');
      const name = escapeHtml(chosen.name || '');
      const phone = escapeHtml(chosen.phone || '');
      const addr = nl2br_escaped(chosen.address || '');

      const combined = `${label ? label : ''}${label && name ? ' - ' : ''}${name ? name : ''}`;

      const html = `
        <div class="prl-address-line-combined">${combined}</div>
        ${phone ? `<div class="prl-address-phone">${phone}</div>` : ''}
        <div class="prl-address-body">${addr}</div>
      `;
      setText('address-text', html, { allowHtml: true });
    } else {
      // fallback ke alamat default di profile kalau belum ada savedAddresses
      const addr = nl2br_escaped(p.address || '');
      setText('address-text', addr, { allowHtml: true });
    }
  }

  document.addEventListener('DOMContentLoaded', render);
})();
