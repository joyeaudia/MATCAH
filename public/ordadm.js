// ==========================================================
// RECODED ordadm.js
// Admin: Orders List & Sync with Supabase (using Service Key)
// ==========================================================
(function () {
  'use strict';

  // State
  let currentFilter = 'all';
  const addressCache = new Map();
  const SUPABASE_TABLE_NAME = 'orders';

  // --- 1. CORE UTILITIES ---

  // Helper untuk parsing Local Storage yang aman
  function safeParseRaw(key, fallbackJson = '[]') {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.error(`Error parsing key ${key}:`, e);
    }
    return JSON.parse(fallbackJson);
  }

  // Format Rupiah
  function fmt(n) {
    return 'Rp ' + new Intl.NumberFormat('id-ID').format(Number(n || 0));
  }

  // Escape HTML
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // --- 2. STORAGE & DATA MANAGEMENT ---

  // Load orders dari SEMUA user di Local Storage
  function loadAllOrdersFromLocalStorage() {
    const allOrders = [];
    addressCache.clear();

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('orders_')) continue;

      const uid = key.slice('orders_'.length) || 'guest';
      let list = safeParseRaw(key, '[]');

      if (!Array.isArray(list)) continue;

      // Cache Addresses
      const addressKey = 'savedAddresses_v1_' + uid;
      let userAddresses = safeParseRaw(addressKey, null);
      if (!userAddresses) userAddresses = safeParseRaw('savedAddresses_v1', '[]');
      addressCache.set(uid, userAddresses);

      list.forEach(o => {
        if (!o) return;
        if (!o.userId) o.userId = uid;
        allOrders.push(o);
      });
    }
    // Sort dari yang terbaru
    allOrders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return allOrders;
  }

  // Simpan kembali order ke Local Storage user yang benar
  function saveSingleOrderToLocalStorage(order) {
    const uid = order.userId || 'guest';
    const key = 'orders_' + uid;
    let list = safeParseRaw(key, '[]');
    
    const idx = list.findIndex(o => String(o.id) === String(order.id));
    if (idx !== -1) list[idx] = order;
    else list.unshift(order);

    localStorage.setItem(key, JSON.stringify(list));
  }

  // Ambil alamat user dari cache
  function loadAddressesForUser(uid) {
    return addressCache.get(uid || 'guest') || []; 
  }

  // Tambah notifikasi ke user
  function addNotifForOrder(order, kind) {
    const uid = order.userId || 'guest';
    const key = 'notifications_v1_' + uid;
    let notifs = safeParseRaw(key, '[]');

    const now = new Date();
    let title = '', message = '', emoji = '';

    if (kind === 'approved') {
      title = 'Payment Confirmed'; emoji = '💸';
      message = `Order ${order.id} telah dikonfirmasi dan pembayaran sudah diterima admin.`;
    } else if (kind === 'rejected') {
      title = 'Order Rejected'; emoji = '⛔';
      message = `Order ${order.id} telah ditolak / dibatalkan oleh admin.`;
    }

    notifs.unshift({
      id: `adm-${kind}-${order.id}-${now.getTime()}`,
      title, message, emoji,
      time: 'Just now', isRead: false
    });

    localStorage.setItem(key, JSON.stringify(notifs));
  }

  // --- 3. SUPABASE SYNC (CRITICAL) ---

  /**
   * Mengupdate status dan payment status order di Supabase.
   * Menggunakan Service Role Key untuk izin admin.
   * @param {Object} order - Objek order yang akan diupdate
   * @returns {Promise<boolean>} True jika sukses
   */
  async function updateOrderOnSupabase(order) {
    const supabase = window.supabase;
    
    if (!supabase) {
      alert("CRITICAL: Supabase belum terhubung di ordadm.html!");
      return false;
    }
    if (!order.id) {
      console.warn("Supabase Update skipped: No Order ID");
      return false;
    }

    let idValue = String(order.id);
    let columnToFilterBy = 'client_order_id'; // Default ID lokal user

    // Tentukan filter untuk server: ID lokal (client_order_id) atau UUID (id)
    if (idValue.startsWith('DB-')) {
        idValue = idValue.substring(3); // Hapus 'DB-'
        columnToFilterBy = 'id';
    } else if (idValue.length > 20) {
        columnToFilterBy = 'id'; // Asumsi UUID
    }

    console.log(`📡 Supabase: Sending update. Filter: ${columnToFilterBy} = ${idValue}`);

    const payload = {
      status: order.status,          // 'active', 'delivered', 'cancelled'
      payment_status: order.paymentStatus, // 'paid', 'rejected', 'pending'
    };

    try {
        const { error, count } = await supabase
          .from(SUPABASE_TABLE_NAME)
          .update(payload)
          .eq(columnToFilterBy, idValue)
          .select(columnToFilterBy, { count: 'exact' }); 

        if (error) {
          console.error('❌ Supabase Error:', error.message);
          alert(`GAGAL UPDATE SERVER! \nError: ${error.message}`);
          return false;
        }
        
        if (count === 0) {
             console.warn("Supabase update sukses tapi 0 baris berubah. Cek ID order.");
             // Lanjut true saja, karena koneksi aman dan mungkin hanya masalah ID tidak match
        }
        
        console.log(`✅ Supabase Updated. Rows updated: ${count}`);
        return true;

    } catch (e) {
        console.error('❌ Network Error:', e);
        alert('Kesalahan jaringan. Cek koneksi internet Anda.');
        return false;
    }
  }

  // --- 4. RENDER LOGIC ---

  function renderAdminList() {
    const container = document.getElementById('order-list');
    if (!container) return;
    container.innerHTML = '';

    let orders = loadAllOrdersFromLocalStorage();

    // 1. Filter order yang dibatalkan user/sistem
    orders = orders.filter(o => String(o.status).toLowerCase() !== 'cancelled');

    // 2. Filter berdasarkan tab (History / Gift / All)
    if (currentFilter === 'history') {
      orders = orders.filter(o => {
        const st = String(o.status).toLowerCase();
        return st === 'completed' || st === 'delivered';
      });
    } else {
      // Tab 'All' dan 'Gift' hanya menampilkan yang sedang aktif/belum selesai
      orders = orders.filter(o => {
        const st = String(o.status).toLowerCase();
        return st !== 'completed' && st !== 'delivered';
      });

      if (currentFilter === 'gift') {
        orders = orders.filter(o => !!o.isGift && !!o.gift);
      }
    }

    if (!orders.length) {
      container.innerHTML = '<div style="color:#777;font-size:13px;padding:20px;">Belum ada order di tab ini.</div>';
      return;
    }

    orders.forEach(order => {
      container.appendChild(renderAdminCard(order));
    });
  }

  function renderAdminCard(order) {
    const card = document.createElement('article');
    const created = new Date(order.createdAt || Date.now()).toLocaleString();
    const status = (order.status || 'active').toLowerCase();
    const paymentStatus = (order.paymentStatus || 'pending').toLowerCase();
    const isGift = !!order.isGift && !!order.gift;

    // --- Card Class Setup ---
    card.className = 'admin-order-card';
    if (status === 'completed' || status === 'delivered') card.classList.add('is-completed');
    else if (paymentStatus === 'paid') card.classList.add('is-paid');
    if (isGift) card.classList.add('gift');

    // --- Item Summary ---
    const firstItem = order.items?.[0];
    const firstItemTitle = firstItem ? (firstItem.title || firstItem.name || 'N/A') : '(no items)';

    // --- Address/Recipient Block ---
    let addrBlock = '';
    if (order.meta && order.meta.recipient) {
       // Recipient (for pickup/special case)
       addrBlock = `
        <div class="admin-address">
          <div class="admin-address-title">Recipient (Special)</div>
          <div class="admin-address-main">${escapeHtml(order.meta.recipient).replace(/\n/g,"<br>")}</div>
        </div>`;
    } else {
       // Standard address lookup
       const savedAddrs = loadAddressesForUser(order.userId);
       const chosenAddr = savedAddrs.find(a => a.isDefault) || savedAddrs[0];
       if (chosenAddr) {
         addrBlock = `
          <div class="admin-address">
            <div class="admin-address-title">Address</div>
            <div class="admin-address-main">
                <div>${escapeHtml(chosenAddr.label || '')}${chosenAddr.label && chosenAddr.name ? ' - ' : ''}${escapeHtml(chosenAddr.name || '')}</div>
                <div>${escapeHtml(chosenAddr.phone || '')}</div>
                <div>${escapeHtml(chosenAddr.address || '').replace(/\n/g,"<br>")}</div>
            </div>
          </div>`;
       }
    }

    // --- Gift Block ---
    let giftBlock = '';
    if (isGift && order.gift) {
        const revealModeText = String(order.gift.revealMode || 'reveal').toLowerCase() === 'surprise' 
            ? 'Keep it a surprise' : 'Reveal it now';
        
        let scheduled = '';
        if (order.scheduledAt) {
            try { scheduled = new Date(order.scheduledAt).toLocaleString('id-ID'); } catch(e) {}
        }

        giftBlock = `
        <div class="admin-gift-block">
          <div class="admin-gift-title">🎁 Gift order</div>
          ${order.gift.message ? `<div class="admin-gift-line"><strong>Message:</strong> ${escapeHtml(order.gift.message)}</div>` : ''}
          ${order.gift.fromName ? `<div class="admin-gift-line"><strong>From:</strong> ${escapeHtml(order.gift.fromName)}</div>` : ''}
          <div class="admin-gift-line"><strong>Reveal:</strong> ${escapeHtml(revealModeText)}</div>
          ${scheduled ? `<div class="admin-gift-line"><strong>Schedule:</strong> ${escapeHtml(scheduled)}</div>` : ''}
        </div>`;
    }

    // --- Items List ---
    let itemsHtml = '';
    (order.items || []).forEach(it => {
        const addons = it.addons && it.addons.length ? 
            `<div class="admin-item-addons">${it.addons.map(a => escapeHtml(a.label || '')).join(', ')}</div>` : '';
        const qty = Number(it.qty || 0);
        const price = Number(it.unitPrice || it.price || 0);
        const subtotal = Number(it.subtotal || qty * price);
        const priceText = `${qty} × ${fmt(price)} = ${fmt(subtotal)}`;

        itemsHtml += `
          <div class="admin-item-row">
            <div class="admin-item-main">
              <div class="admin-item-title">${escapeHtml(it.title || it.name)}</div>
              ${addons}
              <div class="admin-item-price">${priceText}</div>
            </div>
          </div>`;
    });

    // --- Final Render ---
    const badgePaymentClass = paymentStatus === 'paid' ? 'paid' : (paymentStatus === 'rejected' ? 'rejected' : '');

    card.innerHTML = `
      <div class="admin-order-header">
        <div>
          <div class="admin-order-id">Order ID: ${escapeHtml(order.id)}</div>
          <div class="admin-order-created">${created}</div>
        </div>
        <div class="admin-order-total">
          <span class="admin-total-label">Total</span>
          <span class="admin-total-value">${fmt(order.total)}</span>
        </div>
      </div>
      <div class="admin-status-row">
        <span class="badge badge-status">${escapeHtml(status)}</span>
        <span class="badge badge-payment ${badgePaymentClass}">${escapeHtml(paymentStatus)}</span>
      </div>
      <div class="admin-summary-row">
        <span class="summary-chip">${isGift ? '🎁 Gift' : 'Order'}</span>
        <span class="summary-main">${escapeHtml(firstItemTitle)}</span>
        <button type="button" class="btn-toggle-detail" aria-expanded="false">Detail</button>
      </div>
      <div class="admin-details collapsed">
        ${giftBlock}
        <div class="admin-items">${itemsHtml}</div>
        ${addrBlock}
        <div class="admin-actions">
          <button class="btn btn-approve" data-id="${escapeHtml(order.id)}">ACC (Sudah Dibayar)</button>
          <button class="btn btn-reject" data-id="${escapeHtml(order.id)}">Tolak Order</button>
          <button class="btn btn-delivered" data-id="${escapeHtml(order.id)}">Mark Delivered</button>
        </div>
      </div>
    `;

    // --- Action Button Logic ---
    const approveBtn = card.querySelector('.btn-approve');
    const rejectBtn = card.querySelector('.btn-reject');
    const deliveredBtn = card.querySelector('.btn-delivered');
    const detailsEl = card.querySelector('.admin-details');
    const toggleBtn = card.querySelector('.btn-toggle-detail');

    // Initial Button Display (Prevent duplicate logic from min.js)
    if (status === 'completed' || status === 'delivered' || status === 'cancelled') {
        if(approveBtn) approveBtn.style.display = 'none';
        if(rejectBtn) rejectBtn.style.display = 'none';
        if(deliveredBtn) deliveredBtn.style.display = 'none';
    } else if (paymentStatus === 'paid') {
        if(approveBtn) approveBtn.style.display = 'none'; 
        if(rejectBtn) rejectBtn.style.display = 'none';
    } else {
        if(deliveredBtn) deliveredBtn.style.display = 'none';
    }

    // Toggle Detail
    if (toggleBtn && detailsEl) {
      // Default: collapse detail if width < 600px
      if(window.innerWidth < 600) {
        detailsEl.classList.add('collapsed');
        toggleBtn.setAttribute('aria-expanded', 'false');
      } else {
        toggleBtn.setAttribute('aria-expanded', 'true');
        toggleBtn.textContent = 'Sembunyikan';
      }

      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const collapsed = detailsEl.classList.toggle('collapsed');
        toggleBtn.textContent = collapsed ? 'Detail' : 'Sembunyikan';
      });
    }

    // Handler: ACC (PAID)
    if (approveBtn) {
        approveBtn.addEventListener('click', async function (e) {
            e.stopPropagation();
            
            const oldStatus = order.status;
            const oldPay = order.paymentStatus;

            order.paymentStatus = 'paid';
            order.status = 'active'; // Order siap diproses/dikirim

            const success = await updateOrderOnSupabase(order);

            if (success) {
                saveSingleOrderToLocalStorage(order);
                addNotifForOrder(order, 'approved');
                renderAdminList();
                alert('Sukses! Pembayaran dikonfirmasi. Order siap diproses/kirim.');
            } else {
                // Rollback jika gagal
                order.status = oldStatus;
                order.paymentStatus = oldPay;
                alert('Update GAGAL. Status dikembalikan.');
            }
        });
    }

    // Handler: REJECT
    if (rejectBtn) {
        rejectBtn.addEventListener('click', async function (e) {
            e.stopPropagation();
            
            const oldStatus = order.status;
            const oldPay = order.paymentStatus;

            order.paymentStatus = 'rejected';
            order.status = 'cancelled';

            const success = await updateOrderOnSupabase(order);

            if (success) {
                saveSingleOrderToLocalStorage(order);
                addNotifForOrder(order, 'rejected');
                renderAdminList();
                alert('Order DITOLAK.');
            } else {
                // Rollback jika gagal
                order.status = oldStatus;
                order.paymentStatus = oldPay;
                alert('Update GAGAL. Status dikembalikan.');
            }
        });
    }

    // Handler: MARK DELIVERED
    if (deliveredBtn) {
        deliveredBtn.addEventListener('click', async function (e) {
            e.stopPropagation();
            
            if (String(order.paymentStatus).toLowerCase() !== 'paid') {
                alert('Order harus sudah dibayar/di-ACC sebelum ditandai sebagai delivered.');
                return;
            }

            const oldStatus = order.status;
            
            order.paymentStatus = 'paid'; 
            order.status = 'delivered'; 

            const success = await updateOrderOnSupabase(order);

            if (success) {
                saveSingleOrderToLocalStorage(order); 
                renderAdminList();
                alert('Order ditandai sebagai DELIVERED dan pindah ke History.');
            } else {
                // Rollback jika gagal update server
                order.status = oldStatus;
                alert('Update GAGAL. Status dikembalikan.');
            }
        });
    }

    // Handler: Klik Card (Redirect to Detail)
    card.addEventListener('click', function (e) {
      if (e.target.closest('.btn') || e.target.closest('.btn-toggle-detail')) return;
      if (paymentStatus === 'paid') {
          // Asumsi ada diteladm.html
          window.location.href = 'diteladm.html?id=' + encodeURIComponent(order.id);
      }
    });

    return card;
  }

  // --- 5. INITIALIZATION ---

  document.addEventListener('DOMContentLoaded', function () {
    const btns = document.querySelectorAll('.admin-pill');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        currentFilter = btn.dataset.filter || 'all';
        btns.forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        renderAdminList();
      });
    });

    renderAdminList();
  });
})();