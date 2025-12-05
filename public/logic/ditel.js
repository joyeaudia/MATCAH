/**
 * @file ditel.js - Skrip Halaman Detail Pesanan (User View)
 * Integrasi dengan Supabase Sync dan Smart Merge lokal.
 * FIX: Menambahkan render alamat ke elemen #detail-address
 */
(function () {
  'use strict';

  // --- Konfigurasi ---
  const SUPABASE_ORDERS_TABLE = 'orders';
  const SUPABASE_ORDER_ITEMS_TABLE = 'order_items';
  const SYNC_WAIT_MS = 500; // Waktu tunggu sesi (diperpanjang sedikit)

  // --- 🛠️ HELPER FUNCTIONS ---

  function getCurrentUID() {
    return localStorage.getItem('maziUID') || 'guest';
  }

  function userOrdersKey() {
    return 'orders_' + getCurrentUID();
  }

  function fmt(n) {
    return 'Rp ' + new Intl.NumberFormat('id-ID').format(Number(n || 0));
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function safeParseRaw(key, fallbackJson = '[]') {
    try {
      const item = localStorage.getItem(key);
      return JSON.parse(item || fallbackJson);
    } catch (e) {
      console.warn(`Error parsing localStorage key: ${key}`, e);
      return JSON.parse(fallbackJson);
    }
  }

  function getOrderIdFromURL() {
    const sp = new URLSearchParams(window.location.search);
    return sp.get('id');
  }

  // --- 📦 LOCAL STORAGE DATA MANAGEMENT ---

  function loadOrders() {
    const perUser = safeParseRaw(userOrdersKey(), '[]');
    // Migrasi legacy orders jika ada
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

  function saveOrders(list) {
    localStorage.setItem(userOrdersKey(), JSON.stringify(list || []));
  }

  // --- 🔄 SUPABASE SYNC ---

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
        recipient: row.recipient_name || '', // Ini yang menyimpan alamat gabungan
        deliveryMethod: row.delivery_method || null,
      },
      gift: row.is_gift ? {
        message: row.gift_message || '',
        fromName: row.gift_from_name || '',
      } : null,
    };
  }

  async function syncOrdersFromSupabase() {
    const supabase = window.supabase;
    if (!supabase) return false;

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user) return false;
      
      const { data, error } = await supabase
        .from(SUPABASE_ORDERS_TABLE)
        .select(`*, ${SUPABASE_ORDER_ITEMS_TABLE}(*)`)
        .eq('user_id', userData.user.id)
        .order('created_at', { ascending: false });

      if (error) return false;

      const remoteOrders = (data || []).map(transformRemoteOrder);
      const localOrders = loadOrders() || [];
      const map = new Map();

      localOrders.forEach(o => { if (o && o.id) map.set(String(o.id), o); });

      remoteOrders.forEach((remoteO) => {
        if (!remoteO || !remoteO.id) return;
        const orderId = String(remoteO.id);
        const localO = map.get(orderId);

        if (localO) {
          const localStatus = String(localO.status || '').toLowerCase();
          const isFinal = ['delivered', 'completed', 'cancelled'].includes(localStatus);
          
          if (isFinal) {
             // Pertahankan status final lokal
             return;
          }
        }
        map.set(orderId, remoteO);
      });

      saveOrders(Array.from(map.values()));
      return true;
    } catch (e) {
      console.error('Sync error:', e);
      return false;
    }
  }

  // --- 🎨 RENDERING UI FUNCTIONS ---

  function setTrackCell(id, text, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status'; // reset
    if (type === 'done') el.classList.add('done');
    else if (type === 'upcoming') el.classList.add('upcoming');
    else el.classList.add('not');
  }

  function renderTracking(order) {
    const st = (order.status || 'active').toLowerCase();
    const ps = (order.paymentStatus || 'pending').toLowerCase();
    const isPaid = ps === 'paid';
    const isScheduled = st === 'scheduled';
    const isPrep = st === 'preparing order';
    const isOut = st === 'out for delivery';
    const isDelivered = st === 'delivered' || st === 'completed';
    const isCancelled = st === 'cancelled' || st === 'rejected';

    if (isCancelled) {
        setTrackCell('track-placed', 'Completed', 'done');
        setTrackCell('track-payment', 'Cancelled', 'not');
        setTrackCell('track-prep', 'Cancelled', 'not');
        setTrackCell('track-out', 'Cancelled', 'not');
        setTrackCell('track-delivered', 'Cancelled', 'not');
        return;
    }

    setTrackCell('track-placed', 'Completed', 'done');
    setTrackCell('track-payment', isPaid ? 'Completed' : 'Pending', isPaid ? 'done' : 'not');

    let waitSt = 'not', waitTx = 'Pending';
    if (isScheduled || isPrep || isOut || isDelivered) { waitSt='done'; waitTx='Completed'; }
    else if (isPaid) { waitSt='upcoming'; waitTx='Upcoming'; }
    setTrackCell('track-prep', waitTx, waitSt); // Using track-prep as 'Processing' general step

    let outSt = 'not', outTx = 'Pending';
    if (isOut || isDelivered) { outSt='done'; outTx='Completed'; }
    else if (isPrep) { outSt='upcoming'; outTx='Upcoming'; }
    setTrackCell('track-out', outTx, outSt);

    let delSt = 'not', delTx = 'Pending';
    if (isDelivered) { delSt='done'; delTx='Completed'; }
    else if (isOut) { delSt='upcoming'; delTx='Upcoming'; }
    setTrackCell('track-delivered', delTx, delSt);
  }

  function renderHeader(order) {
    const els = {
        pill: document.getElementById('detail-status-pill'),
        id: document.getElementById('detail-order-id'),
        date: document.getElementById('detail-order-date'),
        sched: document.getElementById('detail-scheduled'),
        pay: document.getElementById('detail-payment-method'),
        address: document.getElementById('detail-address') // 🔥 TARGET BARU
    };

    if (els.id) els.id.textContent = order.id || '-';
    
    if (els.date) {
        const d = order.createdAt ? new Date(order.createdAt) : new Date();
        els.date.textContent = d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    }

    if (els.sched) {
        let txt = '-';
        if (order.scheduledAt) {
            txt = new Date(order.scheduledAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
        }
        els.sched.textContent = txt;
    }

    if (els.pay) els.pay.textContent = order.paymentMethod || 'QRIS';

    // 🔥 LOGIKA RENDER ALAMAT
    if (els.address) {
        // Data di meta.recipient biasanya gabungan (Nama\nNoHP\nAlamat)
        // Kita ganti \n jadi <br> agar rapi di HTML
        const rawAddr = order.meta && order.meta.recipient ? order.meta.recipient : 'Alamat tidak tersedia.';
        els.address.innerHTML = escapeHtml(rawAddr).replace(/\n/g, '<br>');
    }

    if (els.pill) {
        const s = (order.status || '').toLowerCase();
        let lb = 'Active', bg = '#0B84FF';
        if (s === 'scheduled') lb = 'Scheduled';
        else if (s === 'delivered' || s === 'completed') { lb = 'Delivered'; bg = '#10b981'; }
        else if (s === 'cancelled' || s === 'rejected') { lb = 'Cancelled'; bg = '#ef4444'; }
        
        els.pill.textContent = lb;
        els.pill.style.background = bg;
    }
  }

  function renderItems(order) {
    const wrap = document.getElementById('detail-items');
    if (!wrap) return;
    wrap.innerHTML = '';
    const items = order.items || [];

    if (!items.length) {
        wrap.innerHTML = '<p class="muted">No items.</p>';
        return;
    }

    items.forEach(it => {
        const row = document.createElement('div');
        row.className = 'product';
        const img = it.image 
            ? `<img src="${escapeHtml(it.image)}" style="width:50px;height:50px;object-fit:cover;border-radius:8px;margin-right:10px;">`
            : '';
        
        row.innerHTML = `
            <div style="display:flex; align-items:center; margin-bottom:10px;">
                ${img}
                <div>
                    <div style="font-weight:600; font-size:14px;">${escapeHtml(it.title)}</div>
                    <div style="font-size:12px; color:#666;">${fmt(it.unitPrice)} x ${it.qty}</div>
                </div>
                <div style="margin-left:auto; font-weight:bold;">${fmt(it.subtotal || (it.unitPrice * it.qty))}</div>
            </div>
        `;
        wrap.appendChild(row);
    });
  }

  function renderSummary(order) {
    const box = document.getElementById('detail-summary');
    if (!box) return;

    let sub = 0;
    (order.items||[]).forEach(i => {
        sub += Number(i.subtotal || (i.unitPrice * i.qty) || 0);
    });
    const ship = Number(order.shippingFee || 0);
    const tot = sub + ship;

    box.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span style="color:#666;">Subtotal</span><span>${fmt(sub)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span style="color:#666;">Shipping</span><span>${fmt(ship)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:16px;border-top:1px solid #eee;padding-top:8px;">
            <span>Total</span><span>${fmt(tot)}</span>
        </div>
    `;
  }

  function setupCancel(order) {
    const btn = document.getElementById('detail-cancel-btn');
    if (!btn) return;
    
    const s = (order.status||'').toLowerCase();
    const p = (order.paymentStatus||'').toLowerCase();
    // Hide cancel if paid or final state
    if (p === 'paid' || ['delivered','completed','cancelled','rejected'].includes(s)) {
        btn.style.display = 'none';
        return;
    }

    btn.style.display = 'block';
    btn.onclick = function() {
        if(!confirm('Batalkan pesanan ini?')) return;
        const all = loadOrders();
        const idx = all.findIndex(x => String(x.id) === String(order.id));
        if(idx >= 0) {
            all[idx].status = 'cancelled';
            all[idx].paymentStatus = 'rejected';
            saveOrders(all);
            alert('Order cancelled.');
            window.location.reload();
        }
    };
  }

  // --- 🚀 MAIN INIT ---
  document.addEventListener('DOMContentLoaded', async function () {
    const orderId = getOrderIdFromURL();
    if (!orderId) {
        alert('No Order ID.');
        window.location.href = 'order.html';
        return;
    }

    // Tunggu sesi supabase sebentar
    await new Promise(r => setTimeout(r, SYNC_WAIT_MS));
    await syncOrdersFromSupabase();

    const orders = loadOrders();
    const order = orders.find(o => String(o.id) === String(orderId));

    if (!order) {
        alert('Order not found.');
        window.location.href = 'order.html';
        return;
    }

    renderHeader(order);
    renderItems(order);
    renderSummary(order);
    renderTracking(order);
    setupCancel(order);
    
    // WA Button Logic
    const waBtn = document.getElementById('wa-btn');
    if(waBtn) {
        const phone = '628118281416';
        const txt = `Halo, saya butuh bantuan untuk Order ID: ${order.id}`;
        waBtn.href = `https://wa.me/${phone}?text=${encodeURIComponent(txt)}`;
    }

    const back = document.getElementById('back-btn');
    if(back) back.onclick = () => window.location.href = 'order.html';
  });

})();