// ordadm.js — ADMIN: lihat semua order (dari semua user) + ACC / Reject / Delivered
(function () {
  'use strict';

  // ===== HELPER DASAR =====
  function safeParseRaw(key, fallbackJson) {
    try {
      return JSON.parse(localStorage.getItem(key) || (fallbackJson ?? '[]'));
    } catch (e) {
      return fallbackJson ? JSON.parse(fallbackJson) : [];
    }
  }

  function fmt(n) {
    return 'Rp ' + new Intl.NumberFormat('id-ID').format(Number(n || 0));
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

  // ===== AMBIL SEMUA ORDERS_... (SEMUA USER) =====
  function loadAllOrders() {
    const all = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('orders_')) continue; // cuma bucket orders_<uid>

      const uid = key.slice('orders_'.length) || 'guest';

      let list;
      try {
        list = JSON.parse(localStorage.getItem(key) || '[]');
      } catch (e) {
        list = [];
      }

      if (!Array.isArray(list)) continue;

      list.forEach(o => {
        if (!o) return;
        // pastikan punya userId supaya nanti bisa disimpan balik
        if (!o.userId) o.userId = uid;
        all.push(o);
      });
    }

    return all;
  }

  // simpan 1 order balik ke bucket user yg benar
  function saveSingleOrderForUser(order) {
    const uid = order.userId || 'guest';
    const key = 'orders_' + uid;

    let list;
    try {
      list = JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
      list = [];
    }
    if (!Array.isArray(list)) list = [];

    const idx = list.findIndex(o => String(o.id) === String(order.id));
    if (idx !== -1) {
      list[idx] = order;
    } else {
      list.unshift(order);
    }

    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch (e) {
      console.error('Failed to save order bucket for user', uid, e);
    }
  }

  // ===== ADDRESS PER USER UNTUK ADMIN =====
  function loadAddressesForUser(uid) {
    const keyUser = 'savedAddresses_v1_' + (uid || 'guest');
    let arr = [];
    try {
      arr = JSON.parse(localStorage.getItem(keyUser) || '[]');
      if (!Array.isArray(arr)) arr = [];
    } catch (e) {
      arr = [];
    }

    // fallback ke key lama kalau kosong
    if (!arr.length) {
      arr = safeParseRaw('savedAddresses_v1', '[]');
    }
    return arr;
  }

  // ===== HELPER NOTIFIKASI (ADMIN ACC / REJECT) PER USER =====
  function addNotifForOrder(order, kind) {
    const uid = order.userId || 'guest';
    const key = 'notifications_v1_' + uid;

    let notifs;
    try {
      notifs = JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
      notifs = [];
    }
    if (!Array.isArray(notifs)) notifs = [];

    const now = new Date();
    let title = '';
    let message = '';
    let emoji = '';

    if (kind === 'approved') {
      title = 'Payment Confirmed';
      emoji = '💸';
      message =
        'Order ' +
        (order.id || '') +
        ' telah dikonfirmasi dan pembayaran sudah diterima admin.';
    } else if (kind === 'rejected') {
      title = 'Order Rejected';
      emoji = '⛔';
      message =
        'Order ' +
        (order.id || '') +
        ' telah ditolak / dibatalkan oleh admin.';
    }

    const newNotif = {
      id: 'adm-' + kind + '-' + (order.id || '') + '-' + now.getTime(),
      title,
      message,
      emoji,
      time: 'Just now',
      isRead: false
    };

    notifs.unshift(newNotif);

    try {
      localStorage.setItem(key, JSON.stringify(notifs));
    } catch (e) {
      console.error('Failed to save notifications for user', uid, e);
    }
  }

  // ===== STATE FILTER =====
  // 'all' | 'gift' | 'history'
  let currentFilter = 'all';

  // ===== LIST DI HALAMAN ADMIN =====
  function renderAdminList() {
    const container = document.getElementById('order-list');
    if (!container) return;

    container.innerHTML = '';

    let orders = loadAllOrders(); // <-- semua bucket user

    // jangan tampilkan yg sudah dibatalkan
    orders = orders.filter(
      o => String(o.status || '').toLowerCase() !== 'cancelled'
    );

    // pisah history vs non-history
    if (currentFilter === 'history') {
      // hanya order yang sudah selesai (completed)
      orders = orders.filter(o => {
        const st = String(o.status || '').toLowerCase();
        return st === 'completed';
      });
    } else {
      // filter utama: jangan tampilkan completed di "Semua" dan "Gift saja"
      orders = orders.filter(o => {
        const st = String(o.status || '').toLowerCase();
        return st !== 'completed';
      });

      if (currentFilter === 'gift') {
        orders = orders.filter(o => !!o.isGift && !!o.gift);
      }
    }

    if (!orders.length) {
      container.innerHTML =
        '<div style="color:#777;font-size:13px;">Belum ada order.</div>';
      return;
    }

    orders.forEach(order => {
      container.appendChild(renderAdminCard(order));
    });
  }

  // ===== SATU KARTU ADMIN =====
  function renderAdminCard(order) {
    const card = document.createElement('article');
    card.className = 'admin-order-card';

    const created = new Date(order.createdAt || Date.now()).toLocaleString();
    const status = (order.status || 'active').toLowerCase();
    const paymentStatus = (order.paymentStatus || 'pending').toLowerCase();

    if (status === 'completed') {
      card.classList.add('is-completed');
    } else if (paymentStatus === 'paid') {
      card.classList.add('is-paid');
    }

    const isGift = !!order.isGift && !!order.gift;
    if (isGift) {
      card.classList.add('gift');
    }

    let scheduleText = '';
    if (order.scheduledAt) {
      try {
        scheduleText = new Date(order.scheduledAt).toLocaleString('id-ID');
      } catch (e) {}
    }

    const firstItem =
      order.items && order.items[0] ? order.items[0] : null;
    const firstItemTitle = firstItem
      ? firstItem.title || firstItem.name || ''
      : '(no items)';

    // ===== address / recipient untuk admin =====
    const rawRecipient =
      order.meta && typeof order.meta.recipient === 'string'
        ? order.meta.recipient.trim()
        : '';

    const savedAddrs = loadAddressesForUser(order.userId);
    let chosenAddr = null;
    if (Array.isArray(savedAddrs) && savedAddrs.length) {
      chosenAddr =
        savedAddrs.find(a => a && a.isDefault) || savedAddrs[0];
    }

    let addrBlock = '';

    if (rawRecipient) {
      const addrHtml = escapeHtml(rawRecipient).replace(/\n/g, '<br>');
      addrBlock = `
        <div class="admin-address">
          <div class="admin-address-title">Recipient</div>
          <div class="admin-address-main">
            <div>${addrHtml}</div>
          </div>
        </div>
      `;
    } else if (chosenAddr) {
      const label = escapeHtml(chosenAddr.label || '');
      const name = escapeHtml(chosenAddr.name || '');
      const phone = escapeHtml(chosenAddr.phone || '');
      const addrHtml = escapeHtml(chosenAddr.address || '').replace(
        /\n/g,
        '<br>'
      );
      const combined = `${label ? label : ''}${
        label && name ? ' - ' : ''
      }${name ? name : ''}`;

      addrBlock = `
        <div class="admin-address">
          <div class="admin-address-title">Address</div>
          <div class="admin-address-main">
            <div>${combined}</div>
            ${phone ? `<div>${phone}</div>` : ''}
            <div>${addrHtml}</div>
          </div>
        </div>
      `;
    }

    // ===== GIFT INFO DETAIL =====
    let giftInfoHtml = '';

    if (isGift) {
      const revealLabel =
        String(order.gift.revealMode || 'reveal') === 'surprise'
          ? 'Keep it a surprise'
          : 'Reveal it now';

      giftInfoHtml = `
        <div class="admin-gift-block">
          <div class="admin-gift-title">🎁 Gift order</div>
          ${
            order.gift.message
              ? `<div class="admin-gift-line"><strong>Message:</strong> ${escapeHtml(
                  order.gift.message
                )}</div>`
              : ''
          }
          ${
            order.gift.fromName
              ? `<div class="admin-gift-line"><strong>From:</strong> ${escapeHtml(
                  order.gift.fromName
                )}</div>`
              : ''
          }
          <div class="admin-gift-line"><strong>Reveal:</strong> ${escapeHtml(
            revealLabel
          )}</div>
          ${
            scheduleText
              ? `<div class="admin-gift-line"><strong>Schedule:</strong> ${escapeHtml(
                  scheduleText
                )}</div>`
              : ''
          }
        </div>
      `;
    }

    // ===== ITEMS DETAIL =====
    let itemsHtml = '';

    (order.items || []).forEach(it => {
      if (!it) return;

      const title = escapeHtml(it.title || it.name || '');

      const addonsHtml =
        it.addons && it.addons.length
          ? '<div class="admin-item-addons">' +
            it.addons.map(a => escapeHtml(a.label || '')).join(', ') +
            '</div>'
          : '';

      const qty = Number(it.qty || 0);
      const unit = Number(it.unitPrice || it.price || 0);
      const lineTotal = Number(it.subtotal || unit * qty);
      const priceLine =
        qty + ' × ' + fmt(unit) + ' = ' + fmt(lineTotal);

      itemsHtml += `
        <div class="admin-item-row">
          <div class="admin-item-main">
            <div class="admin-item-title">${title}</div>
            ${addonsHtml}
            <div class="admin-item-price">${escapeHtml(priceLine)}</div>
          </div>
        </div>
      `;
    });

    const badgePaymentClass =
      paymentStatus === 'paid'
        ? 'badge-payment paid'
        : paymentStatus === 'rejected'
        ? 'badge-payment rejected'
        : 'badge-payment';

    // ========== MARKUP UTAMA CARD ==========
    card.innerHTML = `
      <div class="admin-order-header">
        <div>
          <div class="admin-order-id">Order ID: ${escapeHtml(
            order.id || '(no id)'
          )}</div>
          <div class="admin-order-created">${escapeHtml(created)}</div>
        </div>
        <div class="admin-order-total">
          <span class="admin-total-label">Total</span>
          <span class="admin-total-value">${fmt(order.total)}</span>
        </div>
      </div>

      <div class="admin-status-row">
        <span class="badge badge-status">${escapeHtml(status)}</span>
        <span class="badge ${badgePaymentClass}">${escapeHtml(
          paymentStatus
        )}</span>
      </div>

      <div class="admin-summary-row">
        <span class="summary-chip">${isGift ? '🎁 Gift' : 'Order'}</span>
        <span class="summary-main">${escapeHtml(firstItemTitle)}</span>
        ${
          scheduleText && isGift
            ? `<span class="summary-schedule"> · ${escapeHtml(
                scheduleText
              )}</span>`
            : ''
        }
        <button type="button" class="btn-toggle-detail" aria-expanded="false">
          Detail
        </button>
      </div>

      <div class="admin-details">
        ${giftInfoHtml}
        <div class="admin-items">
          ${itemsHtml}
        </div>
        ${addrBlock}
        <div class="admin-actions">
          <button class="btn btn-approve" data-id="${escapeHtml(
            order.id
          )}">ACC (sudah dibayar)</button>
          <button class="btn btn-reject" data-id="${escapeHtml(
            order.id
          )}">Tolak order</button>
          <button class="btn btn-delivered" data-id="${escapeHtml(
            order.id
          )}">Mark as delivered</button>
        </div>
      </div>
    `;

    const approveBtn = card.querySelector('.btn-approve');
    const rejectBtn = card.querySelector('.btn-reject');
    const deliveredBtn = card.querySelector('.btn-delivered');
    const detailsEl = card.querySelector('.admin-details');
    const toggleBtn = card.querySelector('.btn-toggle-detail');

    if (detailsEl) {
      if (window.innerWidth < 600) {
        detailsEl.classList.add('collapsed');
        if (toggleBtn) {
          toggleBtn.setAttribute('aria-expanded', 'false');
          toggleBtn.textContent = 'Detail';
        }
      } else {
        detailsEl.classList.remove('collapsed');
        if (toggleBtn) {
          toggleBtn.setAttribute('aria-expanded', 'true');
          toggleBtn.textContent = 'Sembunyikan';
        }
      }
    }

    if (toggleBtn && detailsEl) {
      toggleBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const isCollapsed = detailsEl.classList.toggle('collapsed');
        this.setAttribute('aria-expanded', String(!isCollapsed));
        this.textContent = isCollapsed ? 'Detail' : 'Sembunyikan';
      });
    }

    const isFinal =
      status === 'completed' || status === 'cancelled';

    // ===== ATUR VISIBILITAS TOMBOL =====
    if (isFinal) {
      if (approveBtn) approveBtn.style.display = 'none';
      if (rejectBtn) rejectBtn.style.display = 'none';
      if (deliveredBtn) deliveredBtn.style.display = 'none';
    } else if (paymentStatus === 'paid') {
      if (approveBtn) approveBtn.style.display = 'none';
      if (rejectBtn) rejectBtn.style.display = 'none';
    } else {
      if (deliveredBtn) deliveredBtn.style.display = 'none';
    }

    // ===== EVENT BUTTON ACC =====
    if (approveBtn) {
      approveBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const id = this.dataset.id;
        const all = loadAllOrders();
        const target = all.find(o => String(o.id) === String(id));
        if (target) {
          target.paymentStatus = 'paid';
          if (!target.status) target.status = 'active';

          saveSingleOrderForUser(target);
          addNotifForOrder(target, 'approved');

          renderAdminList();
          alert('Order di-set sebagai SUDAH DIBAYAR.');
        }
      });
    }

    // ===== EVENT BUTTON REJECT =====
    if (rejectBtn) {
      rejectBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const id = this.dataset.id;
        const all = loadAllOrders();
        const target = all.find(o => String(o.id) === String(id));
        if (target) {
          target.paymentStatus = 'rejected';
          target.status = 'cancelled';

          saveSingleOrderForUser(target);
          addNotifForOrder(target, 'rejected');

          renderAdminList();
          alert('Order telah DITOLAK / dibatalkan oleh admin.');
        }
      });
    }

    // ===== EVENT BUTTON DELIVERED =====
    if (deliveredBtn) {
      deliveredBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const id = this.dataset.id;
        const all = loadAllOrders();
        const target = all.find(o => String(o.id) === String(id));
        if (target) {
          if (
            String(target.paymentStatus || '').toLowerCase() !== 'paid'
          ) {
            alert(
              'Order harus sudah dibayar sebelum ditandai sebagai delivered.'
            );
            return;
          }

          target.status = 'completed';
          saveSingleOrderForUser(target);
          renderAdminList();
          alert('Order ditandai sebagai DELIVERED dan pindah ke History.');
        }
      });
    }

    // ===== KLIK KARTU -> DETAIL ADMIN (optional) =====
    card.addEventListener('click', function (e) {
      if (
        e.target.closest('.admin-actions') ||
        e.target.closest('.btn-toggle-detail')
      )
        return;

      if (paymentStatus !== 'paid') return;

      const oid = order.id || '';
      if (!oid) return;
      window.location.href =
        'diteladm.html?id=' + encodeURIComponent(oid);
    });

    return card;
  }

  // ===== INIT: FILTER BUTTON + RENDER =====
  document.addEventListener('DOMContentLoaded', function () {
    const btns = document.querySelectorAll('.admin-pill');
    if (btns.length) {
      btns.forEach(btn => {
        btn.addEventListener('click', () => {
          const filter = btn.dataset.filter || 'all';
          currentFilter = filter;

          btns.forEach(b => b.classList.remove('is-active'));
          btn.classList.add('is-active');

          renderAdminList();
        });
      });
    }

    renderAdminList();
  });
})();
