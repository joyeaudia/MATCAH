// ditel.js — Order detail (user view) TERHUBUNG ke data admin (orders_<uid> + fallback 'orders')
(function () {
  'use strict';

  // helper parse lokal
  function safeParse(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
      return [];
    }
  }

  // 🔑 ambil UID user yang sedang login (sama pattern dengan file lain)
  function getCurrentUID() {
    return localStorage.getItem('maziUID') || 'guest';
  }

  // key orders per user
  function userOrdersKey() {
    return 'orders_' + getCurrentUID();
  }

  /**
   * Baca orders dengan urutan:
   * 1) Ambil dari bucket per user: orders_<uid>
   * 2) Merge data lama dari key global "orders" (kalau masih ada), tanpa duplikat id
   */
  function loadOrders() {
    const perUser = safeParse(userOrdersKey());
    const legacy  = safeParse('orders'); // data lama sebelum migrasi

    if (Array.isArray(legacy) && legacy.length) {
      const ids = new Set(perUser.map(o => String(o.id)));
      legacy.forEach(o => {
        if (!o) return;
        const id = String(o.id || '');
        if (!ids.has(id)) {
          ids.add(id);
          perUser.push(o);
        }
      });
    }
    return perUser;
  }

  // Simpan hanya ke bucket per user (orders_<uid>)
  function saveOrders(list) {
    localStorage.setItem(userOrdersKey(), JSON.stringify(list || []));
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

  function getOrderIdFromURL() {
    const sp = new URLSearchParams(window.location.search);
    return sp.get('id');
  }

  // ====== HEADER & META ======
  function renderHeader(order) {
    const pill    = document.getElementById('detail-status-pill');
    const idEl    = document.getElementById('detail-order-id');
    const dateEl  = document.getElementById('detail-order-date');
    const schedEl = document.getElementById('detail-scheduled');
    const payEl   = document.getElementById('detail-payment-method');

    if (idEl) idEl.textContent = order.id || '-';

    if (dateEl) {
      const d = order.createdAt ? new Date(order.createdAt) : new Date();
      dateEl.textContent = d.toLocaleString();
    }

    if (schedEl) {
      if (order.scheduledDelivery) {
        // admin simpan value "YYYY-MM-DD"
        try {
          const d = new Date(order.scheduledDelivery);
          schedEl.textContent = isNaN(d.getTime())
            ? order.scheduledDelivery
            : d.toLocaleDateString();
        } catch (e) {
          schedEl.textContent = order.scheduledDelivery;
        }
      } else if (order.scheduledAt) {
        const d = new Date(order.scheduledAt);
        schedEl.textContent = d.toLocaleString();
      } else {
        schedEl.textContent = '-';
      }
    }

    if (payEl) {
      payEl.textContent = order.paymentMethod || 'QRIS';
    }

    if (pill) {
      const st = (order.status || 'active').toLowerCase();
      let label = 'Active';
      if (st === 'scheduled') label = 'Scheduled';
      else if (st === 'delivered') label = 'Delivered';
      else if (st === 'cancelled') label = 'Cancelled';

      pill.textContent = label;

      pill.classList.remove('shipped');
      if (st === 'delivered') {
        pill.style.background = '#10b981';
      } else if (st === 'cancelled') {
        pill.style.background = '#ef4444';
      } else {
        pill.style.background = '#0B84FF';
      }
    }
  }

  // ====== ITEMS (dengan gambar & font lebih kecil) ======
  function renderItems(order) {
    const wrap = document.getElementById('detail-items');
    if (!wrap) return;
    wrap.innerHTML = '';

    (order.items || []).forEach(it => {
      const row = document.createElement('div');
      row.className = 'product';

      const hasImg = !!it.image;
      const thumbHtml = hasImg
        ? `
          <div class="thumb">
            <img src="${escapeHtml(it.image)}"
                 alt="${escapeHtml(it.title || '')}"
                 style="width:100%;height:100%;object-fit:cover;border-radius:16px;">
          </div>
        `
        : `<div class="thumb"></div>`;

      row.innerHTML = `
        ${thumbHtml}
        <div class="pinfo">
          <div class="pname" style="font-size:13px;line-height:1.3;">
            ${escapeHtml(it.title || '')}
          </div>
          <div class="psub" style="font-size:11px;color:#888;">
            ${escapeHtml(it.brand || '')}
          </div>
          <div class="price" style="font-size:13px;margin-top:4px;">
            ${fmt(it.unitPrice || it.subtotal || 0)}
          </div>
        </div>
        <div class="qty">${it.qty || 1}</div>
      `;

      wrap.appendChild(row);
    });
  }

  // ====== SUMMARY (subtotal dari items, total = subtotal + shipping) ======
  function renderSummary(order) {
    const box = document.getElementById('detail-summary');
    if (!box) return;

    // hitung subtotal dari semua item
    const productSubtotal = (order.items || []).reduce((sum, it) => {
      const qty  = Number(it.qty || 1);
      const unit = it.unitPrice != null ? Number(it.unitPrice) : Number(it.subtotal || 0);
      if (!isNaN(qty) && !isNaN(unit)) {
        // kalau subtotal per item sudah ada, pakai itu, kalau tidak qty * unitPrice
        const sub = it.subtotal != null ? Number(it.subtotal) : qty * unit;
        return sum + (isNaN(sub) ? 0 : sub);
      }
      return sum;
    }, 0);

    const shippingFee = !isNaN(Number(order.shippingFee))
      ? Number(order.shippingFee)
      : 0;

    const total = productSubtotal + shippingFee;

    box.innerHTML = `
      <div class="summary-row">
        <div class="left">Product Subtotal</div>
        <div class="right">${fmt(productSubtotal)}</div>
      </div>
      <div class="summary-row">
        <div class="left">Shipping Fee</div>
        <div class="right">${fmt(shippingFee)}</div>
      </div>
      <div class="summary-row total">
        <div class="left">Order Total</div>
        <div class="right">${fmt(total)}</div>
      </div>
    `;
  }

  // ====== TRACKING ======
  function setTrackCell(id, stateText, stateType) {
    const el = document.getElementById(id);
    if (!el) return;

    el.textContent = stateText || '';
    el.classList.remove('done', 'upcoming', 'not');

    if (!stateType) return;

    if (stateType === 'done') el.classList.add('done');
    else if (stateType === 'upcoming') el.classList.add('upcoming');
    else el.classList.add('not');
  }

  function renderTracking(order) {
    const t   = order.tracking || {};
    const st  = (order.status || '').toLowerCase();
    const pay = (order.paymentStatus || '').toLowerCase();

    const isPlaced    = t.placed != null ? !!t.placed : true;
    const isPaid      = t.paymentConfirmed != null ? !!t.paymentConfirmed : (pay === 'paid');
    const isWaiting   = !!t.waitingForSchedule;
    const isPreparing = !!t.preparingOrder;

    const out      = t.outForDelivery || {};
    const outActive= !!out.active;
    const outInfo  = out.info || '';

    const isDelivered = !!t.delivered || st === 'delivered';

    setTrackCell('track-placed', isPlaced ? 'Completed' : '', isPlaced ? 'done' : '');

    if (isPaid) {
      setTrackCell('track-payment', 'Completed', 'done');
    } else {
      setTrackCell('track-payment', 'Pending', 'not');
    }

    setTrackCell(
      'track-wait',
      isWaiting ? 'Completed' : '',
      isWaiting ? 'done' : ''
    );

    setTrackCell(
      'track-prep',
      isPreparing ? 'Completed' : '',
      isPreparing ? 'done' : ''
    );

    let outText  = '';
    let outState = '';
    if (outActive || outInfo) {
      outText  = outInfo ? outInfo : 'On the way';
      outState = 'done';
    }
    setTrackCell('track-out', outText, outState);

    setTrackCell(
      'track-delivered',
      isDelivered ? 'Completed' : '',
      isDelivered ? 'done' : ''
    );
  }

  // ====== CANCEL BUTTON (user) ======
  function setupCancel(order) {
    const btn = document.getElementById('detail-cancel-btn');
    if (!btn) return;

    const rawPaymentStatus = (order.paymentStatus || 'pending').toLowerCase();
    const rawStatus        = (order.status || '').toLowerCase();
    const isPaid      = rawPaymentStatus === 'paid';
    const isRejected  = rawPaymentStatus === 'rejected' || rawStatus === 'cancelled';
    const isDelivered = rawStatus === 'delivered';

    // kalau sudah dibayar / dibatalkan / delivered → user tidak boleh cancel
    if (isPaid || isRejected || isDelivered) {
      btn.style.display = 'none';
      return;
    }

    btn.addEventListener('click', function () {
      const ok = confirm('Yakin ingin membatalkan order ini?');
      if (!ok) return;

      const all = loadOrders() || [];
      const idx = all.findIndex(o => String(o.id) === String(order.id));
      if (idx !== -1) {
        all[idx].status = 'cancelled';
        all[idx].paymentStatus = 'rejected';
        saveOrders(all); // simpan ke orders_<uid>
      }

      alert('Order telah dibatalkan. Status: cancelled');
      window.location.href = 'order.html';
    });
  }

  // ====== INIT ======
  document.addEventListener('DOMContentLoaded', function () {
    const orderId = getOrderIdFromURL();
    const orders  = loadOrders();
    const order   = (orders || []).find(o => String(o.id) === String(orderId));

    if (!order) {
      alert('Order tidak ditemukan.');
      window.location.href = 'order.html';
      return;
    }

    renderHeader(order);
    renderItems(order);
    renderSummary(order);
    renderTracking(order);
    setupCancel(order);

    // back button: balik ke tab terakhir yang dibuka di order.html
    document.getElementById('back-btn')?.addEventListener('click', function () {
      const last = localStorage.getItem('lastOrderTab') || 'active';
      window.location.href = `order.html?tab=${last}`;
    });
  });

})();
