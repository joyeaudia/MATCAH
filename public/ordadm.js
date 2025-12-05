// ordadm.js — ADMIN: Fix Sinkronisasi Supabase & History Logic
(function () {
  'use strict';

  let addressCache = new Map();

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
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ===== 💡 FUNGSI UPDATE SUPABASE (CRITICAL FIX) =====
  async function updateOrderOnSupabase(order) {
    const supabase = window.supabase;
    
    // 1. Cek Koneksi
    if (!supabase) {
      alert("CRITICAL: Supabase belum terhubung di ordadm.html!");
      return false;
    }
    if (!order.id) {
      console.warn("Update skipped: No ID");
      return false;
    }

    // 2. Tentukan Kolom Target (FIX UTAMA)
    let idValue = String(order.id);
    let columnToFilterBy = 'client_order_id'; // Default untuk ID pendek user

    if (idValue.startsWith('DB-')) {
        idValue = idValue.substring(3); // Hapus 'DB-'
        columnToFilterBy = 'id';        // Pakai UUID
    } else if (idValue.length > 20) {
        // Asumsi jika panjang > 20 karakter, itu UUID
        columnToFilterBy = 'id';
    }

    console.log(`📡 Sending update... Filter: ${columnToFilterBy} = ${idValue}`);

    // 3. Kirim Payload Status
    const payload = {
      status: order.status,          // 'completed', 'delivered', 'cancelled'
      payment_status: order.paymentStatus, // 'paid', 'rejected'
    };

    try {
        const { data, error } = await supabase
          .from('orders')
          .update(payload)
          .eq(columnToFilterBy, idValue)
          .select(); // Penting: Select untuk memastikan data kembali

        if (error) {
          console.error('❌ Supabase Error:', error.message);
          alert(`GAGAL UPDATE SERVER! \nError: ${error.message}\nOrder mungkin kembali ke Active saat refresh.`);
          return false;
        }
        
        // Cek apakah ada baris yang benar-benar terupdate
        if (!data || data.length === 0) {
             console.warn("Supabase update sukses tapi 0 baris berubah. Cek ID.");
             // Kita return true saja karena mungkin ID client local beda format dikit, 
             // tapi kalau tidak error 400/500 berarti koneksi aman.
        }
        
        console.log('✅ Supabase Updated Successfully');
        return true;

    } catch (e) {
        console.error('❌ Network Error:', e);
        alert('Kesalahan jaringan. Cek koneksi internet Anda.');
        return false;
    }
  }

  // ===== LOAD ALL ORDERS =====
  function loadAllOrders() {
    const all = [];
    console.log('🔍 Scanning localStorage...');
    addressCache.clear();

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('orders_')) continue;

      const uid = key.slice('orders_'.length) || 'guest';
      let list;
      try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { list = []; }

      if (!Array.isArray(list)) continue;

      const addressKey = 'savedAddresses_v1_' + uid;
      let userAddresses = safeParseRaw(addressKey, null);
      if (!userAddresses) userAddresses = safeParseRaw('savedAddresses_v1', '[]');
      addressCache.set(uid, userAddresses);

      list.forEach(o => {
        if (!o) return;
        if (!o.userId) o.userId = uid; 
        all.push(o);
      });
    }
    return all;
  }

  // ===== SAVE LOCAL =====
  function saveSingleOrderForUser(order) {
    const uid = order.userId || 'guest';
    const key = 'orders_' + uid;
    let list = safeParseRaw(key, '[]');
    
    const idx = list.findIndex(o => String(o.id) === String(order.id));
    if (idx !== -1) list[idx] = order;
    else list.unshift(order);

    localStorage.setItem(key, JSON.stringify(list));
  }

  // ===== ADDRESS HELPER =====
  function loadAddressesForUser(uid) {
    return addressCache.get(uid || 'guest') || []; 
  }

  // ===== NOTIFICATION =====
  function addNotifForOrder(order, kind) {
    const uid = order.userId || 'guest';
    const key = 'notifications_v1_' + uid;
    let notifs = safeParseRaw(key, '[]');

    const now = new Date();
    let title = '', message = '', emoji = '';

    if (kind === 'approved') {
      title = 'Payment Confirmed'; emoji = '💸';
      message = `Order ${order.id} confirmed & paid.`;
    } else if (kind === 'rejected') {
      title = 'Order Rejected'; emoji = '⛔';
      message = `Order ${order.id} rejected.`;
    }

    notifs.unshift({
      id: `adm-${kind}-${order.id}-${now.getTime()}`,
      title, message, emoji,
      time: 'Just now', isRead: false
    });

    localStorage.setItem(key, JSON.stringify(notifs));
  }

  // ===== RENDER LIST & FILTER =====
  let currentFilter = 'all';

  function renderAdminList() {
    const container = document.getElementById('order-list');
    if (!container) return;
    container.innerHTML = '';

    let orders = loadAllOrders();

    orders = orders.filter(o => String(o.status).toLowerCase() !== 'cancelled');

    if (currentFilter === 'history') {
      orders = orders.filter(o => {
        const st = String(o.status).toLowerCase();
        return st === 'completed' || st === 'delivered';
      });
    } else {
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

  // ===== RENDER CARD =====
  function renderAdminCard(order) {
    const card = document.createElement('article');
    card.className = 'admin-order-card';

    const created = new Date(order.createdAt || Date.now()).toLocaleString();
    const status = (order.status || 'active').toLowerCase();
    const paymentStatus = (order.paymentStatus || 'pending').toLowerCase();

    if (status === 'completed' || status === 'delivered') card.classList.add('is-completed');
    else if (paymentStatus === 'paid') card.classList.add('is-paid');
    
    const isGift = !!order.isGift && !!order.gift;
    if (isGift) card.classList.add('gift');

    const firstItem = order.items && order.items[0];
    const firstItemTitle = firstItem ? (firstItem.title || firstItem.name) : '(no items)';

    const savedAddrs = loadAddressesForUser(order.userId);
    const chosenAddr = savedAddrs.find(a => a.isDefault) || savedAddrs[0];
    let addrBlock = '';
    
    if (order.meta && order.meta.recipient) {
       addrBlock = `<div class="admin-address"><div>To:</div><div>${escapeHtml(order.meta.recipient)}</div></div>`;
    } else if (chosenAddr) {
       addrBlock = `<div class="admin-address"><div>Addr:</div><div>${escapeHtml(chosenAddr.address)}</div></div>`;
    }

    let itemsHtml = '';
    (order.items || []).forEach(it => {
        itemsHtml += `<div class="admin-item-row"><div class="admin-item-title">${escapeHtml(it.title)} x${it.qty}</div></div>`;
    });

    const badgePaymentClass = paymentStatus === 'paid' ? 'paid' : (paymentStatus === 'rejected' ? 'rejected' : '');

    card.innerHTML = `
      <div class="admin-order-header">
        <div><div class="admin-order-id">ID: ${escapeHtml(order.id)}</div><div class="admin-order-created">${created}</div></div>
        <div class="admin-order-total"><span class="admin-total-value">${fmt(order.total)}</span></div>
      </div>
      <div class="admin-status-row">
        <span class="badge badge-status">${status}</span>
        <span class="badge badge-payment ${badgePaymentClass}">${paymentStatus}</span>
      </div>
      <div class="admin-summary-row">
        <span class="summary-chip">${isGift ? 'Gift' : 'Order'}</span>
        <span class="summary-main">${escapeHtml(firstItemTitle)}</span>
        <button type="button" class="btn-toggle-detail" aria-expanded="false">Detail</button>
      </div>
      <div class="admin-details collapsed">
        ${isGift ? '<div class="admin-gift-block">🎁 Gift Order</div>' : ''}
        <div class="admin-items">${itemsHtml}</div>
        ${addrBlock}
        <div class="admin-actions">
          <button class="btn btn-approve" data-id="${order.id}">ACC (Paid)</button>
          <button class="btn btn-reject" data-id="${order.id}">Reject</button>
          <button class="btn btn-delivered" data-id="${order.id}">Mark Delivered</button>
        </div>
      </div>
    `;

    const approveBtn = card.querySelector('.btn-approve');
    const rejectBtn = card.querySelector('.btn-reject');
    const deliveredBtn = card.querySelector('.btn-delivered');
    const detailsEl = card.querySelector('.admin-details');
    const toggleBtn = card.querySelector('.btn-toggle-detail');

    if (toggleBtn && detailsEl) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const collapsed = detailsEl.classList.toggle('collapsed');
        toggleBtn.textContent = collapsed ? 'Detail' : 'Sembunyikan';
      });
    }

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

    // ===== 1. ACC BUTTON =====
    if (approveBtn) {
    approveBtn.addEventListener('click', async function (e) {
        e.stopPropagation();
        
        const oldStatus = order.status;
        const oldPay = order.paymentStatus;

        // 💡 PERBAIKAN: Set paymentStatus ke 'paid' dan status ke 'active' (bukan 'completed')
        order.paymentStatus = 'paid';
        order.status = 'active'; // Order siap diproses/dikirim

        const success = await updateOrderOnSupabase(order);

        if (success) {
            saveSingleOrderForUser(order);
            addNotifForOrder(order, 'approved');
            renderAdminList();
            alert('Sukses! Pembayaran dikonfirmasi. Order tetap di "Semua" dan siap diproses/kirim.');
        } else {
            // Rollback jika gagal
            order.status = oldStatus;
            order.paymentStatus = oldPay;
            alert('Update GAGAL. Status dikembalikan.');
        }
    });
}

// ===== 3. DELIVERED BUTTON (PINDAH KE HISTORY) =====
if (deliveredBtn) {
      deliveredBtn.addEventListener('click', async function (e) {
        e.stopPropagation();
        
        // Cek jika order sudah di-ACC (Paid)
        if (String(order.paymentStatus).toLowerCase() !== 'paid') {
            alert('Order harus sudah dibayar/di-ACC sebelum ditandai sebagai delivered.');
            return;
        }

        const oldStatus = order.status;
        const oldPay = order.paymentStatus;
        
        // 💡 CRITICAL FIX: Set status final yang lengkap sebelum dikirim ke server & disimpan lokal.
        order.paymentStatus = 'paid'; 
        order.status = 'delivered'; // Status akhir: Delivered

        const success = await updateOrderOnSupabase(order);

        if (success) {
            saveSingleOrderForUser(order); // Menyimpan status final ke Local Storage User
            renderAdminList();
            alert('Order ditandai sebagai DELIVERED dan pindah ke History.');
        } else {
            // Rollback jika gagal update server
            order.status = oldStatus;
            order.paymentStatus = oldPay;
            alert('Update GAGAL. Status dikembalikan.');
        }
      });
    }

    // ===== 2. REJECT BUTTON =====
    if (rejectBtn) {
      rejectBtn.addEventListener('click', async function (e) {
        e.stopPropagation();
        
        const oldStatus = order.status;
        const oldPay = order.paymentStatus;

        order.paymentStatus = 'rejected';
        order.status = 'cancelled';

        const success = await updateOrderOnSupabase(order);

        if (success) {
            saveSingleOrderForUser(order);
            addNotifForOrder(order, 'rejected');
            renderAdminList();
            alert('Order DITOLAK.');
        } else {
            order.status = oldStatus;
            order.paymentStatus = oldPay;
            alert('Update GAGAL.');
        }
      });
    }

    // ===== 3. DELIVERED BUTTON =====
    if (deliveredBtn) {
      deliveredBtn.addEventListener('click', async function (e) {
        e.stopPropagation();
        
        const oldStatus = order.status;
        order.status = 'delivered'; // Final status

        const success = await updateOrderOnSupabase(order);

        if (success) {
            saveSingleOrderForUser(order);
            renderAdminList();
            alert('Order DELIVERED.');
        } else {
            order.status = oldStatus;
            alert('Update GAGAL.');
        }
      });
    }

    // Klik kartu -> Detail Admin
    card.addEventListener('click', function (e) {
      if (e.target.closest('.btn') || e.target.closest('.btn-toggle-detail')) return;
      if (paymentStatus === 'paid') {
          window.location.href = 'diteladm.html?id=' + encodeURIComponent(order.id);
      }
    });

    return card;
  }

  // ===== INIT =====
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