// notif.js — notification center (per user, sinkron dengan ordadm + order.js)
(function () {
  'use strict';

  // 🔑 ambil UID user yang sedang login (sama pattern dengan order.js / bagfr.js / ordadm.js)
  function getCurrentUID() {
    return localStorage.getItem('maziUID') || 'guest';
  }

  // key notifikasi per user, misal: notifications_v1_guest, notifications_v1_abcd123
  function storageKey() {
    return 'notifications_v1_' + getCurrentUID();
  }

  // optional: fallback ke key lama "notifications_v1" (global) kalau masih ada
  function loadNotifs() {
    try {
      const perUser = JSON.parse(localStorage.getItem(storageKey()) || '[]');
      const legacy  = JSON.parse(localStorage.getItem('notifications_v1') || '[]');

      if (!Array.isArray(legacy) || !legacy.length) {
        return Array.isArray(perUser) ? perUser : [];
      }

      const base = Array.isArray(perUser) ? perUser.slice() : [];
      const ids = new Set(base.map(n => String(n.id || '')));

      legacy.forEach(n => {
        if (!n) return;
        const id = String(n.id || '');
        if (!ids.has(id)) {
          ids.add(id);
          base.push(n);
        }
      });

      return base;
    } catch (e) {
      return [];
    }
  }

  function saveNotifs(list) {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(list || []));
    } catch (e) {
      console.error('Failed to save notifications', e);
    }
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  function renderList() {
    const listEl  = document.getElementById('notif-list');
    const emptyEl = document.getElementById('notif-empty');
    if (!listEl || !emptyEl) return;

    const notifs = loadNotifs();
    listEl.innerHTML = '';

    if (!Array.isArray(notifs) || !notifs.length) {
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;

    notifs.forEach(n => {
      const card = document.createElement('article');
      card.className = 'notif-card';
      card.dataset.id = n.id;

      card.innerHTML = `
        <div class="notif-card-header">
          <div class="notif-card-title">
            <span class="notif-card-emoji">${n.emoji || ''}</span>
            ${escapeHtml(n.title || '')}
          </div>
          <div class="notif-card-time">${escapeHtml(n.time || '')}</div>
        </div>
        <div class="notif-card-body">
          ${escapeHtml(n.message || '')}
        </div>
      `;
      listEl.appendChild(card);
    });
  }

  function clearAll() {
    saveNotifs([]);
    renderList();
  }

  // ✅ tandai semua notif sebagai sudah dibaca (isRead = true)
  function markAllAsRead() {
    const list = loadNotifs();
    if (!Array.isArray(list) || !list.length) return;

    let changed = false;
    const updated = list.map(n => {
      if (!n.isRead) {
        changed = true;
        return Object.assign({}, n, { isRead: true });
      }
      return n;
    });

    if (changed) {
      saveNotifs(updated);
      // biar badge notif di halaman lain ikut update (order.js dengar event "storage")
      try {
        window.dispatchEvent(new StorageEvent('storage', {
          key: storageKey(),
          newValue: JSON.stringify(updated)
        }));
      } catch (e) {
        // ga wajib, cuma bonus
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    // tampilkan notif
    renderList();
    // dan langsung anggap sudah dibaca
    markAllAsRead();

    const btnBack  = document.getElementById('btn-back');
    const btnClear = document.getElementById('btn-clear');

    if (btnBack) {
      btnBack.addEventListener('click', function () {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.location.href = 'order.html';
        }
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', function () {
        if (confirm('Clear all notifications?')) {
          clearAll();
        }
      });
    }
  });

})();
