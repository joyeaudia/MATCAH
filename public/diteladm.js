// diteladm.js — Admin Delivery Tracking untuk satu order (pakai orders_<uid> seperti ordadm.js)
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

  function getOrderIdFromURL() {
    const sp = new URLSearchParams(window.location.search);
    return sp.get('id');
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
        // pastikan punya userId supaya bisa disimpan balik
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

  // ===== ADDRESS PER USER UNTUK ADMIN (sama konsep ordadm.js) =====
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

  // ===== SUMMARY DI ATAS FORM =====
  function fillSummary(order) {
    const idEl         = document.getElementById('adm-order-id');
    const dateEl       = document.getElementById('adm-order-date');
    const statusText   = document.getElementById('adm-status-text');
    const paymentBadge = document.getElementById('adm-payment-badge');
    const totalBadge   = document.getElementById('adm-total-badge');
    const itemsEl      = document.getElementById('adm-items');
    const addrBlock    = document.getElementById('adm-address-block');

    if (idEl) idEl.textContent = order.id || '(no id)';

    if (dateEl) {
      const d = order.createdAt ? new Date(order.createdAt) : new Date();
      dateEl.textContent = d.toLocaleString();
    }

    const st = (order.status || 'active').toLowerCase();
    if (statusText) statusText.textContent = st;

    const paySt = (order.paymentStatus || 'pending').toLowerCase();
    if (paymentBadge) {
      paymentBadge.textContent = 'Payment: ' + paySt;
      paymentBadge.classList.remove('paid', 'rejected');
      if (paySt === 'paid') paymentBadge.classList.add('paid');
      if (paySt === 'rejected') paymentBadge.classList.add('rejected');
    }

    if (totalBadge) {
      totalBadge.textContent = 'Total: ' + fmt(order.total || 0);
    }

    if (itemsEl) {
      const first = order.items && order.items[0];
      const moreCount = Math.max(0, (order.items || []).length - 1);
      itemsEl.innerHTML = first
        ? `<div>${escapeHtml(first.title || 'No title')}${moreCount > 0 ? ' +' + moreCount + ' more' : ''}</div>`
        : '<div>No items</div>';
    }

    // ===== ADDRESS: pakai alamat user ini (savedAddresses_v1_<uid>) =====
    const savedAddrs = loadAddressesForUser(order.userId);
    let chosenAddr = null;
    if (Array.isArray(savedAddrs) && savedAddrs.length) {
      chosenAddr = savedAddrs.find(a => a && a.isDefault) || savedAddrs[0];
    }

    if (addrBlock && chosenAddr) {
      const label   = escapeHtml(chosenAddr.label || '');
      const name    = escapeHtml(chosenAddr.name || '');
      const phone   = escapeHtml(chosenAddr.phone || '');
      const addrHtml= escapeHtml(chosenAddr.address || '').replace(/\n/g, '<br>');
      const combined= `${label ? label : ''}${label && name ? ' - ' : ''}${name ? name : ''}`;

      addrBlock.innerHTML = `
        <div class="admin-address-title">Address</div>
        <div class="admin-address-main">
          <div>${combined}</div>
          ${phone ? `<div>${phone}</div>` : ''}
          <div>${addrHtml}</div>
        </div>
      `;
    }
  }

  // ===== INIT FORM TRACKING =====
  function initForm(order) {
    const scheduledInput = document.getElementById('adm-scheduled');
    const shipFeeInput   = document.getElementById('adm-ship-fee');

    const tPlaced     = document.getElementById('t-placed');
    const tPayment    = document.getElementById('t-payment');
    const tWait       = document.getElementById('t-wait');
    const tPrep       = document.getElementById('t-prep');
    const tOutActive  = document.getElementById('t-out-active');
    const tOutInfo    = document.getElementById('t-out-info');

    const tr    = order.tracking || {};
    const paySt = (order.paymentStatus || 'pending').toLowerCase();

    // scheduled delivery
    if (scheduledInput) {
      if (order.scheduledDelivery) {
        // kalau string format YYYY-MM-DD, langsung pakai
        scheduledInput.value = order.scheduledDelivery;
      } else if (order.scheduledAt) {
        try {
          const d = new Date(order.scheduledAt);
          scheduledInput.value = d.toISOString().slice(0, 10);
        } catch (e) {}
      }
    }

    // shipping fee
    if (shipFeeInput) {
      shipFeeInput.value = order.shippingFee != null ? order.shippingFee : '';
    }

    // toggles
    if (tPlaced)  tPlaced.checked  = tr.placed != null ? !!tr.placed : true;
    if (tPayment) tPayment.checked = tr.paymentConfirmed != null ? !!tr.paymentConfirmed : (paySt === 'paid');
    if (tWait)    tWait.checked    = !!tr.waitingForSchedule;
    if (tPrep)    tPrep.checked    = !!tr.preparingOrder;

    const out = tr.outForDelivery || {};
    if (tOutActive) tOutActive.checked = !!out.active;
    if (tOutInfo)   tOutInfo.value     = out.info || '';
  }

  // ===== ACTION BUTTONS =====
  function bindActions(order, allOrders) {
    const scheduledInput = document.getElementById('adm-scheduled');
    const shipFeeInput   = document.getElementById('adm-ship-fee');

    const tPlaced     = document.getElementById('t-placed');
    const tPayment    = document.getElementById('t-payment');
    const tWait       = document.getElementById('t-wait');
    const tPrep       = document.getElementById('t-prep');
    const tOutActive  = document.getElementById('t-out-active');
    const tOutInfo    = document.getElementById('t-out-info');

    const btnSave      = document.getElementById('btn-save-tracking');
    const btnDelivered = document.getElementById('btn-mark-delivered');
    const btnBack      = document.getElementById('btn-back-list');

    // ==== SAVE TRACKING ====
    if (btnSave) {
      btnSave.addEventListener('click', function () {
        // update basic fields
        if (scheduledInput && scheduledInput.value) {
          order.scheduledDelivery = scheduledInput.value;
        } else {
          delete order.scheduledDelivery;
        }

        if (shipFeeInput) {
          const fee = Number(shipFeeInput.value || 0);
          if (!isNaN(fee)) {
            order.shippingFee = fee;
            // kalau punya subtotal, update total
            if (typeof order.subtotal === 'number') {
              order.total = order.subtotal + fee;
            } else if (Array.isArray(order.items)) {
              const productSubtotal = order.items.reduce((sum, it) => {
                const q   = Number(it.qty || 1);
                const up  = Number(it.unitPrice || it.price || 0);
                const sub = it.subtotal != null ? Number(it.subtotal) : (q * up);
                return sum + (isNaN(sub) ? 0 : sub);
              }, 0);
              order.total = productSubtotal + fee;
            }
          }
        }

        // update tracking object
        order.tracking = {
          placed: tPlaced ? !!tPlaced.checked : true,
          paymentConfirmed: tPayment ? !!tPayment.checked : false,
          waitingForSchedule: tWait ? !!tWait.checked : false,
          preparingOrder: tPrep ? !!tPrep.checked : false,
          outForDelivery: {
            active: tOutActive ? !!tOutActive.checked : false,
            info: tOutInfo ? tOutInfo.value.trim() : ''
          },
          // kalau sebelumnya sudah delivered, jangan dihapus di sini
          delivered: order.tracking && order.tracking.delivered ? true : false
        };

        // update juga array yang lagi dipegang (opsional, lebih ke konsistensi in-memory)
        const idx = allOrders.findIndex(o => String(o.id) === String(order.id));
        if (idx !== -1) {
          allOrders[idx] = order;
        }

        // SIMPAN KE BUCKET USER YANG BENAR
        saveSingleOrderForUser(order);

        alert('Perubahan tracking & delivery berhasil disimpan.');
      });
    }

    // ==== MARK AS DELIVERED ====
    if (btnDelivered) {
      btnDelivered.addEventListener('click', function () {
        const ok = confirm('Tandai order ini sebagai DELIVERED dan pindahkan ke History user?');
        if (!ok) return;

        order.status = 'delivered';
        order.tracking = Object.assign({}, order.tracking || {}, {
          delivered: true,
          deliveredAt: Date.now()
        });

        const idx = allOrders.findIndex(o => String(o.id) === String(order.id));
        if (idx !== -1) {
          allOrders[idx] = order;
        }

        // SIMPAN KE BUCKET USER
        saveSingleOrderForUser(order);

        alert('Order telah ditandai sebagai DELIVERED.');
        window.location.href = 'ordadm.html';
      });
    }

    if (btnBack) {
      btnBack.addEventListener('click', function () {
        window.location.href = 'ordadm.html';
      });
    }
  }

  // ===== INIT =====
  document.addEventListener('DOMContentLoaded', function () {
    const id   = getOrderIdFromURL();
    const all  = loadAllOrders();
    const order= (all || []).find(o => String(o.id) === String(id));

    if (!order) {
      alert('Order tidak ditemukan.');
      window.location.href = 'ordadm.html';
      return;
    }

    fillSummary(order);
    initForm(order);
    bindActions(order, all);
  });

})();
