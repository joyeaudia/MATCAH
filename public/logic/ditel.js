/**
 * @file ditel.js - Skrip Halaman Detail Pesanan (User View)
 * Integrasi dengan Supabase Sync dan Smart Merge lokal.
 * FIX: Menambahkan timeout pada inisialisasi untuk mengatasi Supabase AuthSessionMissingError (Timing Issue).
 */
(function () {
  'use strict';

  // --- Konfigurasi ---
  const SUPABASE_ORDERS_TABLE = 'orders';
  const SUPABASE_ORDER_ITEMS_TABLE = 'order_items';
  const SYNC_WAIT_MS = 300; // Waktu tunggu untuk pemulihan sesi Supabase

  // --- 🛠️ HELPER FUNCTIONS ---

  /**
   * Mengambil ID Pengguna (UID) saat ini dari localStorage.
   * @returns {string} UID atau 'guest' jika tidak ditemukan.
   */
  function getCurrentUID() {
    return localStorage.getItem('maziUID') || 'guest';
  }

  /**
   * Membuat kunci unik untuk pesanan berdasarkan UID.
   * @returns {string} Kunci localStorage.
   */
  function userOrdersKey() {
    return 'orders_' + getCurrentUID();
  }

  /**
   * Memformat angka menjadi format Rupiah (Rp).
   * @param {number|string} n Angka yang akan diformat.
   * @returns {string} String format Rupiah.
   */
  function fmt(n) {
    // Menggunakan locale 'id-ID' untuk format Rupiah yang benar
    return 'Rp ' + new Intl.NumberFormat('id-ID').format(Number(n || 0));
  }

  /**
   * Melakukan HTML escaping untuk mencegah XSS.
   * @param {string} s String input.
   * @returns {string} String yang sudah di-escape.
   */
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /**
   * Mengurai JSON dari localStorage dengan penanganan error.
   * @param {string} key Kunci localStorage.
   * @param {string} [fallbackJson='[]'] String JSON default.
   * @returns {any} Data yang diurai.
   */
  function safeParseRaw(key, fallbackJson = '[]') {
    try {
      const item = localStorage.getItem(key);
      return JSON.parse(item || fallbackJson);
    } catch (e) {
      console.warn(`Error parsing localStorage key: ${key}`, e);
      return JSON.parse(fallbackJson);
    }
  }

  /**
   * Mengambil ID pesanan dari URL parameter.
   * @returns {string|null} ID pesanan.
   */
  function getOrderIdFromURL() {
    const sp = new URLSearchParams(window.location.search);
    return sp.get('id');
  }

  // --- 📦 LOCAL STORAGE DATA MANAGEMENT ---

  /**
   * Memuat pesanan dari localStorage, termasuk migrasi dari kunci 'orders' lama.
   * @returns {Array<Object>} Daftar pesanan yang valid.
   */
  function loadOrders() {
    const perUser = safeParseRaw(userOrdersKey(), '[]');
    const legacy = safeParseRaw('orders', '[]');

    if (Array.isArray(legacy) && legacy.length) {
      const ids = new Set(perUser.map(o => String(o?.id || '')));
      legacy.forEach(o => {
        const id = String(o?.id || '');
        if (id && !ids.has(id)) {
          ids.add(id);
          perUser.push(o);
        }
      });
      localStorage.removeItem('orders');
    }
    return perUser.filter(o => o && o.id);
  }

  /**
   * Menyimpan daftar pesanan ke localStorage untuk UID saat ini.
   * @param {Array<Object>} list Daftar pesanan.
   */
  function saveOrders(list) {
    localStorage.setItem(userOrdersKey(), JSON.stringify(list || []));
  }

  /**
   * Memuat alamat yang tersimpan.
   * @returns {Array<Object>} Daftar alamat.
   */
  function loadSavedAddresses() {
    const key = 'savedAddresses_v1_' + getCurrentUID();
    return safeParseRaw(key, '[]');
  }

  // --- 🔄 SUPABASE SYNC (SMART MERGE) ---

  /**
   * Mentransformasi data pesanan dari format Supabase/DB ke format lokal/UI.
   * @param {Object} row Baris data pesanan dari Supabase.
   * @returns {Object} Objek pesanan dalam format lokal.
   */
  function transformRemoteOrder(row) {
    const items = Array.isArray(row.order_items)
      ? row.order_items.map((it) => ({
          id: it.product_id || null,
          title: it.title,
          qty: it.qty,
          unitPrice: it.unit_price,
          subtotal: it.subtotal,
          image: it.image_url || '',
          addons: it.addons_json || [],
        })) : [];

    return {
      id: row.client_order_id || `DB-${row.id}`,
      createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
      status: row.status || 'active',
      scheduledAt: row.scheduled_at || null,
      total: row.total || 0,
      shippingFee: row.shipping_fee || 0,
      paymentStatus: row.payment_status || 'pending',
      paymentMethod: row.payment_method || 'QRIS',
      isGift: !!row.is_gift,
      items,
      meta: {
        notes: row.notes || '',
        recipient: row.recipient_name || '',
        deliveryMethod: row.delivery_method || null,
      },
      gift: row.is_gift ? {
        message: row.gift_message || '',
        fromName: row.gift_from_name || '',
        revealMode: row.gift_reveal_mode || 'reveal',
        theme: row.gift_theme || null,
      } : null,
    };
  }

  /**
   * Sinkronisasi pesanan dari Supabase ke localStorage dengan Smart Merge Agresif.
   * @returns {boolean} True jika sinkronisasi berhasil mendapatkan data user dan orders.
   */
  async function syncOrdersFromSupabase() {
    const supabase = window.supabase;
    if (!supabase) {
      console.warn('Supabase client not found on window, skip sync.');
      return false;
    }

    try {
      // Tunggu hingga sesi pengguna terpulihkan
      const { data: userData, error: userErr } = await supabase.auth.getUser();

      if (userErr || !userData?.user) {
        // Ini adalah peringatan yang muncul jika sesi tidak ada/belum pulih
        console.warn('No Supabase user for orders, skip sync (Auth status: Not Ready or Missing)', userErr);
        return false;
      }
      
      // 1. Ambil data dari Supabase
      const { data, error } = await supabase
        .from(SUPABASE_ORDERS_TABLE)
        .select(`*, ${SUPABASE_ORDER_ITEMS_TABLE}(*)`)
        .eq('user_id', userData.user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase orders fetch error:', error.message);
        return false;
      }

      const remoteOrders = (data || []).map(transformRemoteOrder);
      const localOrders = loadOrders() || [];
      const map = new Map();

      // A. Masukkan data lokal dulu (Prioritas Awal)
      localOrders.forEach((o) => {
        if (o && o.id) map.set(String(o.id), o);
      });

      // B. Smart Merge Agresif
      remoteOrders.forEach((remoteO) => {
        if (!remoteO || !remoteO.id) return;
        const orderId = String(remoteO.id);
        const localO = map.get(orderId);

        if (localO) {
          const localStatusLower = String(localO.status || '').toLowerCase();
          const isLocalFinal = ['delivered', 'completed', 'cancelled'].includes(localStatusLower);

          if (isLocalFinal) {
            // Jaga status final lokal, hanya update detail lain
            const { status: remoteStatus, paymentStatus: remotePayStatus, ...remoteData } = remoteO;
            Object.assign(localO, remoteData);
            return;
          }

          // Jaga status pembayaran PAID lokal
          if ((localO.paymentStatus || '').toLowerCase() === 'paid') {
            remoteO.paymentStatus = 'paid';
          }
        }
        // Timpa/Masukkan remoteO
        map.set(orderId, remoteO);
      });

      // C. Simpan hasil merge
      saveOrders(Array.from(map.values()));
      return true;
    } catch (e) {
      console.error('syncOrdersFromSupabase error:', e);
      return false;
    }
  }

  // --- 🎨 RENDERING UI FUNCTIONS ---

  /**
   * Mengatur tampilan satu sel di tracking progress.
   */
  function setTrackCell(id, stateText, stateType) {
    const el = document.getElementById(id);
    if (!el) return;

    el.textContent = stateText || '';
    el.classList.remove('done', 'upcoming', 'not');

    if (stateType === 'done') el.classList.add('done');
    else if (stateType === 'upcoming') el.classList.add('upcoming');
    else el.classList.add('not');
  }

  /**
   * Merender status tracking pesanan.
   */
  function renderTracking(order) {
    const rawStatus = (order.status || 'active').toLowerCase();
    const payStatus = (order.paymentStatus || 'pending').toLowerCase();

    const isPaid = payStatus === 'paid';
    const isScheduled = rawStatus === 'scheduled';
    const isPreparing = rawStatus === 'preparing order';
    const isOut = rawStatus === 'out for delivery';
    const isDelivered = rawStatus === 'delivered' || rawStatus === 'completed';
    const isCancelled = rawStatus === 'cancelled' || rawStatus === 'rejected';

    // Logika Status Pembatalan
    if (isCancelled) {
      setTrackCell('track-placed', 'Completed', 'done');
      setTrackCell('track-payment', isPaid ? 'Completed' : 'Pending', isPaid ? 'done' : 'not');
      ['track-wait', 'track-prep', 'track-out', 'track-delivered'].forEach(id => {
        setTrackCell(id, 'Cancelled', 'not');
      });
      return;
    }

    // 1. Order Placed
    setTrackCell('track-placed', 'Completed', 'done');

    // 2. Payment Confirmed
    setTrackCell(
      'track-payment',
      isPaid ? 'Completed' : 'Pending',
      isPaid ? 'done' : 'not'
    );

    // 3. Waiting for Schedule
    let waitStatus = 'not', waitText = '';
    if (isScheduled || isPreparing || isOut || isDelivered) {
      waitStatus = 'done'; waitText = 'Completed';
    } else if (isPaid) {
      waitStatus = 'upcoming'; waitText = 'Upcoming';
    }
    setTrackCell('track-wait', waitText, waitStatus);

    // 4. Preparing Order
    let prepStatus = 'not', prepText = '';
    if (isPreparing || isOut || isDelivered) {
      prepStatus = 'done'; prepText = 'Completed';
    } else if (isScheduled) {
      prepStatus = 'upcoming'; prepText = 'Upcoming';
    }
    setTrackCell('track-prep', prepText, prepStatus);

    // 5. Out for Delivery
    let outStatus = 'not', outText = '';
    if (isOut || isDelivered) {
      outStatus = 'done'; outText = 'Completed';
    } else if (isPreparing) {
      outStatus = 'upcoming'; outText = 'Upcoming';
    }
    setTrackCell('track-out', outText, outStatus);

    // 6. Delivered
    setTrackCell(
      'track-delivered',
      isDelivered ? 'Completed' : (isOut ? 'Upcoming' : ''),
      isDelivered ? 'done' : (isOut ? 'upcoming' : 'not')
    );
  }

  /**
   * Merender header dan meta-data pesanan.
   */
  function renderHeader(order) {
    const pill = document.getElementById('detail-status-pill');
    const idEl = document.getElementById('detail-order-id');
    const dateEl = document.getElementById('detail-order-date');
    const schedEl = document.getElementById('detail-scheduled');
    const payEl = document.getElementById('detail-payment-method');
    const orderIdDisplayEl = document.getElementById('order-id-display');

    // Order ID
    const orderId = getOrderIdFromURL() || order.id || '-';
    if (orderIdDisplayEl) {
      orderIdDisplayEl.textContent = orderId;
    } else if (idEl) {
      idEl.textContent = orderId;
    }

    // Tanggal Pesanan
    if (dateEl) {
      const d = order.createdAt ? new Date(order.createdAt) : new Date();
      dateEl.textContent = d.toLocaleString('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    }

    // Jadwal Pengiriman
    let scheduledDisplay = '-';
    if (order.scheduledDelivery) {
      scheduledDisplay = order.scheduledDelivery;
    } else if (order.scheduledAt) {
      const d = new Date(order.scheduledAt);
      scheduledDisplay = d.toLocaleString('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    }
    if (schedEl) schedEl.textContent = scheduledDisplay;

    // Metode Pembayaran
    if (payEl) {
      payEl.textContent = order.paymentMethod || 'QRIS';
    }

    // Status Pill Logic
    if (pill) {
      const st = (order.status || 'active').toLowerCase();
      let label = 'Active';
      let bgColor = '#0B84FF'; // Biru

      if (st === 'scheduled') label = 'Scheduled';
      else if (st === 'preparing order' || st === 'out for delivery') label = 'On Progress';
      else if (st === 'delivered' || st === 'completed') {
        label = 'Delivered';
        bgColor = '#10b981'; // Hijau
      } else if (st === 'cancelled' || st === 'rejected') {
        label = 'Cancelled';
        bgColor = '#ef4444'; // Merah
      }

      pill.textContent = label;
      pill.style.background = bgColor;
      pill.classList.remove('shipped');
    }
  }

  /**
   * Merender daftar item pesanan.
   */
  function renderItems(order) {
    const wrap = document.getElementById('detail-items');
    if (!wrap) return;

    wrap.innerHTML = '';
    const items = order.items || [];

    if (items.length === 0) {
      wrap.innerHTML = '<p style="text-align:center;color:#888;">Tidak ada item dalam pesanan ini.</p>';
      return;
    }

    items.forEach(it => {
      const row = document.createElement('div');
      row.className = 'product';

      const thumbUrl = escapeHtml(it.image || '');
      const thumbHtml = it.image
        ? `<div class="thumb"><img src="${thumbUrl}" alt="${escapeHtml(it.title || '')}" style="width:100%;height:100%;object-fit:cover;border-radius:16px;"></div>`
        : `<div class="thumb no-image"></div>`;

      row.innerHTML = `
        ${thumbHtml}
        <div class="pinfo">
          <div class="pname" style="font-size:13px;line-height:1.3;">${escapeHtml(it.title || '')}</div>
          <div class="psub" style="font-size:11px;color:#888;">${escapeHtml(it.brand || '')}</div>
          <div class="price" style="font-size:13px;margin-top:4px;">${fmt(it.unitPrice || it.subtotal || 0)}</div>
        </div>
        <div class="qty">x${it.qty || 1}</div>`;

      wrap.appendChild(row);
    });
  }

  /**
   * Merender ringkasan total pesanan.
   */
  function renderSummary(order) {
    const box = document.getElementById('detail-summary');
    if (!box) return;

    // Hitung Product Subtotal
    const productSubtotal = (order.items || []).reduce((sum, it) => {
      const qty = Number(it.qty || 1);
      const unit = it.unitPrice != null ? Number(it.unitPrice) : Number(it.subtotal || 0);
      let sub = 0;

      if (it.subtotal != null && !isNaN(Number(it.subtotal))) {
        sub = Number(it.subtotal);
      } else if (!isNaN(qty) && !isNaN(unit)) {
        sub = qty * unit;
      }

      return sum + sub;
    }, 0);

    const shippingFee = !isNaN(Number(order.shippingFee)) ? Number(order.shippingFee) : 0;
    const total = productSubtotal + shippingFee;

    box.innerHTML = `
      <div class="summary-row"><div class="left">Product Subtotal</div><div class="right">${fmt(productSubtotal)}</div></div>
      <div class="summary-row"><div class="left">Shipping Fee</div><div class="right">${fmt(shippingFee)}</div></div>
      <div class="summary-row total"><div class="left">Order Total</div><div class="right">${fmt(total)}</div></div>`;
  }

  // --- 🛎️ EVENT HANDLERS ---

  /**
   * Menyiapkan fungsionalitas tombol pembatalan pesanan.
   */
  function setupCancel(order) {
    const btn = document.getElementById('detail-cancel-btn');
    if (!btn) return;

    const rawPaymentStatus = (order.paymentStatus || 'pending').toLowerCase();
    const rawStatus = (order.status || '').toLowerCase();
    const isPaid = rawPaymentStatus === 'paid';
    const isFinal = ['delivered', 'completed', 'cancelled', 'rejected'].includes(rawStatus);

    if (isPaid || isFinal) {
      btn.style.display = 'none';
      return;
    }

    btn.style.display = 'block';
    btn.addEventListener('click', function () {
      if (!confirm('Yakin ingin membatalkan order ini? Aksi ini tidak dapat dibatalkan.')) {
        return;
      }

      const all = loadOrders() || [];
      const idx = all.findIndex(o => String(o.id) === String(order.id));

      if (idx !== -1) {
        all[idx].status = 'cancelled';
        all[idx].paymentStatus = 'rejected';
        saveOrders(all);
      }

      alert('Order telah dibatalkan. Status: cancelled. Silakan refresh halaman.');
      window.location.href = 'order.html?tab=cancelled';
    });
  }

  // --- 🚀 INITIALIZATION ---

  /**
   * Fungsi inisialisasi yang dipanggil setelah DOM dimuat.
   */
  document.addEventListener('DOMContentLoaded', async function () {
    const orderId = getOrderIdFromURL();
    
    // 1. Validasi ID Pesanan
    if (!orderId) {
      alert('Order ID tidak ditemukan di URL. Kembali ke halaman list.');
      window.location.href = 'order.html';
      return;
    }

    // 2. 🔥 FIX TIMING ISSUE: Tunggu sebentar agar Supabase bisa memulihkan sesi
    console.log(`Waiting ${SYNC_WAIT_MS}ms for Supabase session recovery...`);
    await new Promise(resolve => setTimeout(resolve, SYNC_WAIT_MS));

    // 3. Sync data dari server (Menggunakan versi yang diperbaiki)
    const isSyncSuccessful = await syncOrdersFromSupabase(); 
    
    if (!isSyncSuccessful) {
        console.warn("Supabase sync failed or user not logged in, rendering data from local storage only.");
    }

    // 4. Muat dan Cari Pesanan
    const orders = loadOrders();
    const order = (orders || []).find(o => String(o.id) === String(orderId));

    if (!order) {
      alert('Order tidak ditemukan. Mencoba kembali ke halaman list.');
      window.location.href = 'order.html';
      return;
    }

    // 5. Render UI
    renderHeader(order);
    renderItems(order);
    renderSummary(order);
    renderTracking(order);
    setupCancel(order);

    // 6. Setup Back Button
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        const last = localStorage.getItem('lastOrderTab') || 'active';
        window.location.href = `order.html?tab=${last}`;
      });
    }
  });
})();