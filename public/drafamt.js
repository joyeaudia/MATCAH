// drafamt.js — multi-address per user (per email) + delete per card + migrasi dari key lama
(function () {
  const currentEmail = (localStorage.getItem('maziEmail') || '').toLowerCase();

  // kalau belum login, lempar ke sign in
  if (!currentEmail) {
    window.location.href = 'singin.html';
    return;
  }

  const KEY_USER = 'savedAddresses_v1_' + currentEmail; // key baru per user
  const KEY_OLD  = 'savedAddresses_v1';                 // key lama global

  const listEl = document.getElementById('address-list');
  const doneBtn = document.getElementById('done-btn');
  const addLink = document.querySelector('.add-new');
  let blockAddNew = false;

  const params = new URLSearchParams(window.location.search);
  const fromCheckout = params.get('from') === 'checkout';

  // SAMPLE opsional untuk user baru (boleh dihapus kalau mau mulai benar2 kosong)
  const SAMPLE = [];

  function safeParse(raw) {
    try {
      return JSON.parse(raw || '[]');
    } catch {
      return [];
    }
  }

  function readUserRaw() {
    return safeParse(localStorage.getItem(KEY_USER));
  }

  function readOldRaw() {
    return safeParse(localStorage.getItem(KEY_OLD));
  }

  // 🔹 Baca daftar alamat user:
  // 1) coba key user baru
  // 2) kalau kosong → coba key lama, lalu MIGRASI
  // 3) kalau masih kosong → pakai SAMPLE
  function read() {
    let arr = readUserRaw();
    if (Array.isArray(arr) && arr.length > 0) {
      return arr;
    }

    // coba migrasi dari key lama
    const old = readOldRaw();
    if (Array.isArray(old) && old.length > 0) {
      // tulis ke key user + hapus key lama (biar nggak dipakai lagi)
      localStorage.setItem(KEY_USER, JSON.stringify(old));
      localStorage.removeItem(KEY_OLD);
      return old;
    }

    // kalau benar2 belum ada data
    return SAMPLE.slice();
  }

  function write(arr) {
    localStorage.setItem(KEY_USER, JSON.stringify(arr || []));
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function updateAddNewState(count) {
    if (!addLink) return;
    blockAddNew = count >= 5;
    if (blockAddNew) {
      addLink.classList.add('disabled');
      addLink.setAttribute('aria-disabled', 'true');
    } else {
      addLink.classList.remove('disabled');
      addLink.removeAttribute('aria-disabled');
    }
  }

  if (addLink) {
    addLink.addEventListener('click', function (e) {
      if (blockAddNew) {
        e.preventDefault();
        alert('Maksimal 5 alamat. Hapus salah satu dulu ya 😊');
      }
    });
  }

  // 🔴 Hapus alamat index tertentu + jaga default
  function deleteAddress(idx) {
    const arr = read();
    if (idx < 0 || idx >= arr.length) return;

    arr.splice(idx, 1);

    // kalau masih ada alamat tapi tidak ada default → jadikan index 0 default
    if (arr.length) {
      const hasDefault = arr.some(a => a && a.isDefault);
      if (!hasDefault) arr[0].isDefault = true;
    }

    write(arr);
    render();
  }

  function render() {
    const arr = read();
    listEl.innerHTML = '';

    updateAddNewState(arr.length);

    if (!arr.length) {
      listEl.innerHTML = '<div class="empty">Belum ada alamat tersimpan. Tap "Add New Address".</div>';
      return;
    }

    arr.forEach((it, idx) => {
      const card = document.createElement('div');
      card.className = 'address-card';
      card.innerHTML = `
        <button class="addr-delete" data-idx="${idx}" aria-label="Delete address">✕</button>

        <div class="address-label">${escapeHtml(it.label || '')}</div>
        <input class="address-radio" type="radio" name="addrSelect"
               data-idx="${idx}" ${it.isDefault ? 'checked' : ''}
               aria-label="Select ${escapeHtml(it.label || 'address')}">

        <div class="addr-name">${escapeHtml(it.name || '')}</div>
        <div class="addr-phone">${escapeHtml(it.phone || '')}</div>
        <div class="address-divider"></div>
        <div class="addr-full">
          ${(escapeHtml(it.address || '')).replace(/\n/g, '<br>')}
        </div>
      `;
      listEl.appendChild(card);
    });

    // radio → set default
    listEl.querySelectorAll('.address-radio').forEach(r => {
      r.addEventListener('change', function () {
        const idx = Number(this.dataset.idx);
        const arr = read();
        arr.forEach((x, i) => x.isDefault = (i === idx));
        write(arr);
      });
    });

    // tombol X merah → hapus alamat
    listEl.querySelectorAll('.addr-delete').forEach(btn => {
      btn.addEventListener('click', function () {
        const idx = Number(this.dataset.idx);
        const ok = confirm('Hapus alamat ini?');
        if (!ok) return;
        deleteAddress(idx);
      });
    });
  }

  // Done button
  doneBtn.addEventListener('click', function () {
    const arr = read();
    if (!arr.length) {
      // tidak ada alamat, fallback saja
      if (fromCheckout) {
        window.location.href = 'cekout.html';
      } else {
        window.location.href = 'prl.html';
      }
      return;
    }

    // pilih alamat: yang isDefault dulu, kalau tidak ada pakai pertama
    const chosen = arr.find(a => a && a.isDefault) || arr[0];

    if (fromCheckout && chosen) {
      const recipientText =
        (chosen.name || '') + '\n' +
        (chosen.phone || '') + '\n' +
        (chosen.address || '');

      try {
        localStorage.setItem('checkoutRecipientDraft_v1', recipientText);
      } catch (e) {
        console.warn('Failed to save checkoutRecipientDraft_v1', e);
      }

      window.location.href = 'cekout.html';
    } else {
      window.location.href = 'prl.html';
    }
  });

  document.addEventListener('DOMContentLoaded', render);
})();
