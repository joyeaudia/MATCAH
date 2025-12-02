(function () {
  'use strict';

  // ===== helpers umum =====
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

  // 🔑 ambil UID user yang sedang login
  function getCurrentUID() {
    return localStorage.getItem('maziUID') || 'guest';
  }

  // 🔑 bikin key per user: base_uid  → misal: orders_local-12345
  function userKey(base) {
    const uid = getCurrentUID();
    return `${base}_${uid}`;
  }

  // helper parse
  function safeParseRaw(key, fallbackJson) {
    try {
      return JSON.parse(localStorage.getItem(key) || (fallbackJson ?? '[]'));
    } catch (e) {
      return fallbackJson ? JSON.parse(fallbackJson) : [];
    }
  }

  // ===== BAG (keranjang) per user =====
  function loadBag() {
    try {
      const key = userKey('cart');
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
      return [];
    }
  }
  function saveBag(list) {
    try {
      const key = userKey('cart');
      localStorage.setItem(key, JSON.stringify(list || []));
    } catch (e) {
      console.error('Failed to save bag items', e);
    }
  }

  // ===== ORDERS per user (LOCAL) =====
  function loadOrders() {
    const key = userKey('orders');
    return safeParseRaw(key, '[]');
  }
  function saveOrders(list) {
    try {
      const key = userKey('orders');
      localStorage.setItem(key, JSON.stringify(list || []));
    } catch (e) {
      console.error('Failed to save orders', e);
    }
  }

  // ===== ADDRESS per user =====
  function loadSavedAddresses() {
    const key = userKey('savedAddresses_v1');
    return safeParseRaw(key, '[]');
  }

  // === 🟢 SUPABASE SYNC → LOCALSTORAGE ===
  async function syncOrdersFromSupabase() {
    const supabase = window.supabase;
    if (!supabase) {
      console.warn('Supabase client not found on window, skip sync');
      return;
    }

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user) {
        console.warn('No Supabase user for orders, skip sync', userErr);
        return;
      }

      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('user_id', userData.user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Supabase orders fetch error:', error);
        return;
      }

      const remoteOrders = (data || []).map((row) => {
        const items = Array.isArray(row.order_items)
          ? row.order_items.map((it) => ({
              id: it.product_id || null,
              title: it.title,
              qty: it.qty,
              unitPrice: it.unit_price,
              subtotal: it.subtotal,
              image: it.image_url || '',
              addons: it.addons_json || [],
            }))
          : [];

        return {
          id: row.client_order_id || `DB-${row.id}`,
          createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
          status: row.status || 'active',
          scheduledAt: row.scheduled_at || null,
          total: row.total || 0,
          shippingFee: row.shipping_fee || 0,
          paymentStatus: row.payment_status || 'pending',
          isGift: !!row.is_gift,
          items,
          meta: {
            notes: row.notes || '',
            recipient: row.recipient_name || '',
            deliveryMethod: row.delivery_method || null,
          },
          // kalau suatu saat kamu mau simpan detail gift di DB, ini tinggal diisi
          gift: row.is_gift
            ? {
                message: row.gift_message || '',
                fromName: row.gift_from_name || '',
                revealMode: row.gift_reveal_mode || 'reveal',
                theme: row.gift_theme || null,
              }
            : null,
        };
      });

      const localOrders = loadOrders() || [];

      // gabung & dedupe berdasarkan id (Supabase override local kalau id sama)
      const map = new Map();
      localOrders.forEach((o) => {
        if (o && o.id) map.set(String(o.id), o);
      });
      remoteOrders.forEach((o) => {
        if (o && o.id) map.set(String(o.id), o);
      });

      const merged = Array.from(map.values());
      saveOrders(merged);
      console.log('Orders synced from Supabase:', merged.length);
    } catch (e) {
      console.warn('syncOrdersFromSupabase error:', e);
    }
  }

  // ===== small utils =====
  function guessBrand(item) {
    const idLower = String(item?.id || '').toLowerCase();
    const titleLower = String(item?.title || '').toLowerCase();
    if (idLower.startsWith('dsri') || idLower.startsWith('dessert') || titleLower.includes('dessert')) return 'Desserts';
    if (idLower.startsWith('drsi') || idLower.startsWith('drink') || titleLower.includes('latte') || titleLower.includes('drink')) return 'Drinks';
    return 'Products';
  }

  // ===== card summary renderer (dipakai di semua tab) =====
  function renderOrderCardSummary(order, opts) {
    const ctx = (opts && opts.context) || '';   // 'active' / 'scheduled' / 'history'
    const isHistory = ctx === 'history';

    const first = order.items && order.items[0];
    const moreCount = Math.max(0, (order.items || []).length - 1);
    const brand = first ? guessBrand(first) : 'Products';

    // 🔹 thumbnail dengan fallback
    const thumbSrc = first
      ? (first.image ||
         (first.images && first.images[0]) ||
         'assets/placeholder.png')
      : 'assets/placeholder.png';

    const imgHtml =
      '<img src="' + escapeHtml(thumbSrc) + '" ' +
      'alt="' + escapeHtml(first ? first.title : 'Product') + '" ' +
      'style="width:68px;height:68px;object-fit:cover;border-radius:8px">';

    const status = order.status || 'active';
    const statusLower = String(status).toLowerCase();
    const created = new Date(order.createdAt || Date.now()).toLocaleString();

    // 👇 ACTION BUTTONS: beda-beda tergantung context + status
    let actionsHtml = '';

    if (isHistory && statusLower === 'cancelled') {
      // 🔴 HISTORY + CANCELLED: Reorder + View Details (TANPA Track Order)
      actionsHtml =
        '  <div class="order-actions">' +
        '    <button class="btn-outline reorder-btn" data-order-id="' + escapeHtml(order.id) + '">Reorder</button>' +
        '    <button class="btn-light view-details" data-order-id="' + escapeHtml(order.id) + '">View Details</button>' +
        '  </div>';
    } else {
      // ACTIVE / SCHEDULED / HISTORY (delivered/completed):
      const secondLabel = isHistory ? 'Reorder' : 'View Details';
      const secondClass = isHistory ? 'reorder-btn' : 'view-details';

      actionsHtml =
        '  <div class="order-actions">' +
        '    <button class="btn-outline track-btn" data-order-id="' + escapeHtml(order.id) + '">Track Order</button>' +
        '    <button class="btn-light ' + secondClass + '" data-order-id="' + escapeHtml(order.id) + '">' + secondLabel + '</button>' +
        '  </div>';
    }

    const article = document.createElement('article');
    article.className = 'order-card';
    article.innerHTML =
      '<div class="thumb">' + imgHtml + '</div>' +
      '<div class="order-info">' +
      '  <div class="order-top">' +
      '    <h3 class="product-title">' + escapeHtml(first ? first.title : 'No title') + '</h3>' +
      '    <span class="more">' + (moreCount > 0 ? '+' + moreCount + ' More' : '') + '</span>' +
      '  </div>' +
      '  <p class="brand">' + escapeHtml(brand) + '</p>' +
      '  <div class="status-row">' +
      '    <span class="status">Status : <strong>' + escapeHtml(status) + '</strong></span>' +
      '    <span class="eta">Created : <em>' + escapeHtml(created) + '</em></span>' +
      '  </div>' +
           actionsHtml +
      '</div>';

    // 🔹 VIEW DETAILS
    article.querySelectorAll('.view-details').forEach(btn => {
      btn.addEventListener('click', function () {
        renderOrderDetails(this.dataset.orderId);
      });
    });

    // 🔹 REORDER (History)
    article.querySelectorAll('.reorder-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const id = this.dataset.orderId;
        if (!id) return;
        reorderFromHistory(id);
      });
    });

    // 🔹 TRACK ORDER
    article.querySelectorAll('.track-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const id = this.dataset.orderId;
        if (!id) return;
        window.location.href = 'ditel.html?id=' + encodeURIComponent(id);
      });
    });

    return article;
  }

  // ===== ACTIVE tab =====
  function renderActive() {
    const panel = document.getElementById('tab-active');
    if (!panel) return;
    panel.innerHTML = '';

    const orders = loadOrders() || [];
    if (!orders.length) {
      panel.innerHTML = '<div style="padding:16px;color:#666">Belum ada pesanan.</div>';
      return;
    }

    let activeOrders = orders.filter(o =>
      String(o.status || '').toLowerCase() === 'active'
    );

    // kalau belum ada status sama sekali, anggap active
    if (!activeOrders.length) {
      activeOrders = orders.filter(o => !o.status);
    }

    if (!activeOrders.length) {
      panel.innerHTML = '<div style="padding:16px;color:#666">Tidak ada pesanan aktif saat ini.</div>';
      return;
    }

    activeOrders.forEach(o => {
      panel.appendChild(renderOrderCardSummary(o, { context: 'active' }));
    });
  }

  // ===== SCHEDULED tab =====
  function renderSchedule() {
    const panel =
      document.getElementById('tab-schedule') ||
      document.getElementById('tab-scheduled');
    if (!panel) return;
    panel.innerHTML = '';

    const orders = loadOrders();

    const scheduled = (orders || []).filter(o => {
      const st = String(o.status || '').toLowerCase();

      // 🚫 JANGAN tampilkan kalau sudah final
      if (['delivered', 'completed', 'cancelled'].includes(st)) {
        return false;
      }

      // ✅ Scheduled = status scheduled ATAU punya jadwal
      return st === 'scheduled' || o.scheduledAt;
    });

    if (!scheduled.length) {
      panel.innerHTML = '<div style="padding:16px;color:#666">No scheduled orders.</div>';
      return;
    }

    scheduled.forEach(o => {
      panel.appendChild(renderOrderCardSummary(o, { context: 'scheduled' }));
    });
  }

  // ===== HISTORY tab =====
  function renderHistory() {
    const panel = document.getElementById('tab-history');
    if (!panel) return;
    panel.innerHTML = '';

    const orders = loadOrders() || [];

    // hanya order yang sudah selesai / batal
    const historyOrders = orders.filter(o => {
      const st = String(o.status || '').toLowerCase();
      return ['delivered', 'completed', 'cancelled'].includes(st);
    });

    if (!historyOrders.length) {
      panel.innerHTML = '<div style="padding:16px;color:#666">History kosong.</div>';
      return;
    }

    historyOrders.forEach(o => {
      panel.appendChild(renderOrderCardSummary(o, { context: 'history' }));
    });
  }

  // ===== REORDER (History → Bag) =====
  function reorderFromHistory(orderId) {
    const orders = loadOrders() || [];
    const order = orders.find(o => String(o.id) === String(orderId));
    if (!order) {
      alert('Order tidak ditemukan.');
      return;
    }

    let cart = loadBag() || [];

    (order.items || []).forEach((it, idx) => {
      if (!it) return;

      const qty = Number(it.qty || 1);
      const unit = Number(it.unitPrice || it.price || 0);
      const subtotal = Number(it.subtotal || (unit * qty));

      const item = {
        id: it.id || (`reorder-${order.id}-${idx}`),  // kalau ga ada id, bikin dummy
        title: it.title || '',
        unitPrice: unit,
        qty: qty,
        subtotal: subtotal,
        image: it.image || (it.images && it.images[0]) || 'assets/placeholder.png',
        addons: it.addons || [],
        source: 'reorder'
      };

      cart.push(item);
    });

    saveBag(cart);

    alert('Barang dari order ini sudah dimasukkan ke Bag ✔');
    window.location.href = 'bagfr.html';
  }

  // ===== DETAIL VIEW =====
  function renderOrderDetails(orderId) {
    const orders = loadOrders();
    const order = (orders || []).find(o => String(o.id) === String(orderId));

    // PILIH PANEL YANG SEDANG AKTIF / KELIHATAN
    const panelIds = ['tab-active', 'tab-schedule', 'tab-scheduled', 'tab-history'];
    let panel = null;

    for (const id of panelIds) {
      const el = document.getElementById(id);
      if (!el) continue;

      const hiddenByDisplay = el.style.display === 'none';
      const hiddenByClass = el.classList.contains('hidden');

      if (!hiddenByDisplay && !hiddenByClass) {
        panel = el;
        break;
      }
    }

    // fallback
    if (!panel) {
      panel =
        document.getElementById('tab-history') ||
        document.getElementById('tab-active');
    }
    if (!panel) return;

    panel.innerHTML = '';

    if (!order) {
      panel.innerHTML = '<div style="padding:12px;color:#c33">Order tidak ditemukan.</div>';
      return;
    }

    const h = document.createElement('h2');
    h.textContent = 'Order Details';
    panel.appendChild(h);

    // ===== list item =====
    const list = document.createElement('div');
    list.style.marginTop = '12px';

    (order.items || []).forEach(it => {
      const itEl = document.createElement('div');
      itEl.style.padding = '10px 0';
      itEl.innerHTML =
        '<div style="display:flex;gap:12px;align-items:center">' +
        '  <div style="width:56px;height:56px;border-radius:8px;overflow:hidden;background:#f5f5f7;flex:0 0 56px">' +
        (it.image
          ? '<img src="' + escapeHtml(it.image) + '" style="width:100%;height:100%;object-fit:cover">'
          : '') +
        '  </div>' +
        '  <div style="flex:1">' +
        '    <div style="font-weight:700">' + escapeHtml(it.title) + '</div>' +
        (it.addons && it.addons.length
          ? '<div style="color:#666;margin-top:6px">' +
            it.addons.map(a => escapeHtml(a.label)).join(', ') +
            '</div>'
          : '') +
        '    <div style="color:#666;margin-top:6px">' +
        (it.qty || 0) + ' × ' + fmt(it.unitPrice) +
        ' = ' + fmt(it.subtotal) +
        '</div>' +
        '  </div>' +
        '</div>';

      list.appendChild(itEl);
    });

    panel.appendChild(list);

    // ===== GIFT DETAILS (kalau ini gift order) =====
    if (order.isGift && order.gift) {
      const giftBox = document.createElement('div');
      giftBox.className = 'order-gift-block';
      giftBox.style.marginTop = '12px';
      giftBox.style.padding = '12px';
      giftBox.style.borderRadius = '10px';
      giftBox.style.background = '#fff6fb';

      const revealLabel =
        String(order.gift.revealMode || 'reveal') === 'surprise'
          ? 'Keep it a surprise'
          : 'Reveal it now';

      let scheduleHtml = '';
      if (order.scheduledAt) {
        try {
          const dt = new Date(order.scheduledAt);
          scheduleHtml =
            '<div><strong>Schedule:</strong> ' +
            escapeHtml(dt.toLocaleString('id-ID')) +
            '</div>';
        } catch (e) {}
      }

      const messageHtml = order.gift.message
        ? '<div><strong>Message:</strong> ' + escapeHtml(order.gift.message) + '</div>'
        : '';
      const fromHtml = order.gift.fromName
        ? '<div><strong>From:</strong> ' + escapeHtml(order.gift.fromName) + '</div>'
        : '';
      const themeHtml = order.gift.theme
        ? '<div><strong>Card theme:</strong> ' + escapeHtml(order.gift.theme) + '</div>'
        : '';

      giftBox.innerHTML =
        '<div style="font-weight:600;margin-bottom:4px">🎁 Gift details</div>' +
        messageHtml +
        fromHtml +
        '<div><strong>Reveal:</strong> ' + escapeHtml(revealLabel) + '</div>' +
        themeHtml +
        scheduleHtml;

      panel.appendChild(giftBox);
    }

    // ===== RECIPIENT / ADDRESS BLOCK =====
    const rawRecipient =
      order.meta && typeof order.meta.recipient === 'string'
        ? order.meta.recipient.trim()
        : '';

    if (rawRecipient) {
      const addrBlock = document.createElement('div');
      addrBlock.className = 'order-address-block';

      const addrHtml = escapeHtml(rawRecipient).replace(/\n/g, '<br>');

      addrBlock.innerHTML = `
        <div class="order-address-head">
          <span class="title">Recipient</span>
        </div>
        <div class="order-address-body">
          <div class="line-address">${addrHtml}</div>
        </div>
      `;
      panel.appendChild(addrBlock);
    } else {
      const savedAddrs = loadSavedAddresses();
      let chosenAddr = null;
      if (Array.isArray(savedAddrs) && savedAddrs.length) {
        chosenAddr = savedAddrs.find(a => a && a.isDefault) || savedAddrs[0];
      }

      if (chosenAddr) {
        const addrBlock = document.createElement('div');
        addrBlock.className = 'order-address-block';

        const label = escapeHtml(chosenAddr.label || '');
        const name = escapeHtml(chosenAddr.name || '');
        const phone = escapeHtml(chosenAddr.phone || '');
        const addrHtml = escapeHtml(chosenAddr.address || '').replace(/\n/g, '<br>');

        const combined = `${label ? label : ''}${label && name ? ' - ' : ''}${name ? name : ''}`;

        addrBlock.innerHTML = `
          <div class="order-address-head">
            <span class="title">Address</span>
            <a href="drafamt.html" class="edit-link small">Edit</a>
          </div>
          <div class="order-address-body">
            <div class="line-combined">${combined}</div>
            ${phone ? `<div class="line-phone">${phone}</div>` : ''}
            <div class="line-address">${addrHtml}</div>
          </div>
        `;
        panel.appendChild(addrBlock);
      }
    }

    // ===== NOTE PEMBAYARAN (DINAMIS) =====
    const rawPaymentStatus = (order.paymentStatus || 'pending').toLowerCase();
    const rawStatus = (order.status || '').toLowerCase();
    const isPaid = rawPaymentStatus === 'paid';
    const isRejected = rawPaymentStatus === 'rejected' || rawStatus === 'cancelled';

    const note = document.createElement('div');
    let noteClass = 'pending';
    let noteHtml = '';

    if (isPaid) {
      noteClass = 'paid';
      noteHtml =
        '<div>Status pesanan: <strong>Pesanan ' + escapeHtml(order.id || '') + ' sudah dibayar.</strong></div>' +
        '<div class="status">Pembayaran sudah diterima admin ✅</div>' +
        '<div class="track-hint">Anda dapat men-track order Anda dari halaman Orders / Active.</div>';
    } else if (isRejected) {
      note.innerHTML =
        '<div style="font-weight:600">⛔ Orderan ini dicancel oleh admin</div>' +
        '<div class="status">Status pembayaran: <strong style="color:#c00">Ditolak admin</strong></div>' +
        '<div class="track-hint" style="color:#c00">Silakan hubungi admin jika ada kesalahan.</div>';
    } else {
      noteClass = 'pending';
      noteHtml =
        '<div>Segera melakukan pembayaran melalui WhatsApp kepada toko agar orderan Anda dapat di-ACC.</div>' +
        '<div class="status">Status pembayaran: <strong>Pembayaran belum diterima admin</strong></div>';
    }

    if (!isRejected) {
      note.className = 'order-payment-note ' + noteClass;
      note.innerHTML = noteHtml;
    }
    panel.appendChild(note);

    const tot = document.createElement('div');
    tot.style.marginTop = '12px';
    tot.style.fontWeight = '700';
    tot.textContent = 'Total: ' + fmt(order.total);
    panel.appendChild(tot);

    const back = document.createElement('div');
    back.style.marginTop = '12px';
    back.innerHTML =
      '<button class="btn-light" id="back-to-summary">Back to summary</button>';
    panel.appendChild(back);

    const backBtn = back.querySelector('#back-to-summary');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        renderAllLists();
      });
    }
  }

  // ===== BADGE NOTIF DI LONCENG (per user) =====
  function updateNotifBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;

    const key = userKey('notifications_v1');
    const notifs = safeParseRaw(key, '[]');

    const hasUnread = Array.isArray(notifs) && notifs.some(n => !n.isRead);

    if (hasUnread) {
      badge.classList.add('show');
    } else {
      badge.classList.remove('show');
    }
  }

  // ===== RENDER SEMUA TAB =====
  function renderAllLists() {
    renderActive();
    renderSchedule();
    renderHistory();
  }

  // ===== TAB SWITCHING =====
  function attachTabHandlers() {
    document.querySelectorAll('[data-order-tab],[data-tab]').forEach(btn => {
      btn.addEventListener('click', function () {
        const targetName = this.dataset.orderTab || this.dataset.tab;
        if (!targetName) return;

        localStorage.setItem('lastOrderTab', targetName);

        const nameToId = {
          active: 'tab-active',
          scheduled: 'tab-scheduled',
          schedule: 'tab-schedule',
          history: 'tab-history'
        };
        const targetId = nameToId[targetName] || targetName;

        const panels = ['tab-active', 'tab-scheduled', 'tab-schedule', 'tab-history'];
        panels.forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;

          const isActive = id === targetId;

          el.style.display = isActive ? '' : 'none';
          el.classList.toggle('hidden', !isActive);
        });

        document.querySelectorAll('[data-order-tab],[data-tab]').forEach(tb => {
          const name = tb.dataset.orderTab || tb.dataset.tab;
          const isActive = name === targetName;
          tb.classList.toggle('tab-active', isActive);
          tb.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
      });
    });
  }

  // ===== init =====
  document.addEventListener('DOMContentLoaded', function () {
    try {
      // Render dulu dari localStorage (biar cepat)
      renderAllLists();
      attachTabHandlers();

      const sp = new URLSearchParams(window.location.search);
      const tabFromUrl = sp.get('tab');
      const lastTab = localStorage.getItem('lastOrderTab');
      const tabToOpen = tabFromUrl || lastTab || 'active';

      const btn = document.querySelector(
        `[data-order-tab="${tabToOpen}"], [data-tab="${tabToOpen}"]`
      );
      if (btn) {
        btn.click();
      }

      updateNotifBadge();

      window.addEventListener('storage', function (e) {
        if (e.key && e.key.startsWith('notifications_v1_')) {
          updateNotifBadge();
        }
      });

      // 🟢 Setelah itu sync ke Supabase → merge → render ulang
      syncOrdersFromSupabase().then(() => {
        renderAllLists();
      });
    } catch (e) {
      console.error('order render error', e);
    }
  });

  // expose for debugging
  window.renderAllOrders = renderAllLists;
  window.renderOrderDetails = renderOrderDetails;
  window.updateNotifBadge = updateNotifBadge;
})();
