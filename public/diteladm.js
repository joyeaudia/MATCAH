// diteladm.js — Admin Detail Logic (Final)

(function () {
  'use strict';

  const id = (s) => document.getElementById(s);
  const fmt = (n) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Number(n) || 0);
  
  // Ambil ID dari URL
  const getOrderId = () => new URLSearchParams(window.location.search).get('id');

  // --- 1. LOAD ORDER DARI SUPABASE ---
  async function initAdminDetail() {
    const orderId = getOrderId();
    if (!orderId) {
        alert("Order ID missing");
        window.location.href = "ordadm.html";
        return;
    }

    const supabase = window.supabase;
    if (!supabase) return; 

    // Cek format ID (UUID vs Client ID)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
    
    let query = supabase.from('orders').select('*, order_items(*)');

    if (isUUID) {
        query = query.eq('id', orderId);
    } else {
        query = query.eq('client_order_id', orderId);
    }

    const { data: order, error } = await query.maybeSingle();

    if (error || !order) {
        alert("Order tidak ditemukan.");
        window.location.href = "ordadm.html";
        return;
    }

    renderForm(order);
  }

  // --- 2. RENDER FORM ---
  function renderForm(order) {
    id('adm-order-id').textContent = order.client_order_id || order.id.substr(0,8);
    id('adm-order-date').textContent = new Date(order.created_at).toLocaleString('id-ID');
    id('adm-status-text').textContent = order.status;
    id('adm-payment-badge').textContent = order.payment_status;
    id('adm-total-badge').textContent = fmt(order.total);

    // Items
    const itemsContainer = id('adm-items');
    itemsContainer.innerHTML = '';
    (order.order_items || []).forEach(it => {
        itemsContainer.innerHTML += `
            <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px;">
                <span>${it.qty}x ${it.title || it.name}</span>
                <span>${fmt((it.unit_price || 0) * it.qty)}</span>
            </div>`;
    });

    // Address / Meta Recipient
    const addrBlock = id('adm-address-block');
    const recName = order.recipient_name || (order.meta?.recipient_name) || '-';
    const recAddr = order.recipient_address || (order.meta?.recipient_address) || (order.meta?.recipient) || '-';

    addrBlock.innerHTML = `
        <div style="font-weight:bold; margin-bottom:4px">Penerima: ${recName}</div>
        <div style="font-size:13px; color:#555;">${recAddr.replace(/\n/g, '<br>')}</div>
    `;

    // Form inputs
    if (order.scheduled_at) {
        try {
            id('adm-scheduled').value = new Date(order.scheduled_at).toISOString().split('T')[0];
        } catch(e) {}
    }
    id('adm-ship-fee').value = order.shipping_fee || 0;
    id('status-select').value = order.status || 'active';
    id('payment-select').value = order.payment_status || 'pending';

    // Simpan ID untuk update
    window.currentDbId = order.id;
  }

  // --- 3. SAVE BIASA (Tombol Abu) ---
  const btnSave = id('btn-save');
  if (btnSave) {
      btnSave.addEventListener('click', async () => {
          const dbId = window.currentDbId;
          const supabase = window.supabase;
          
          btnSave.textContent = "Saving...";
          const { error } = await supabase.from('orders').update({
                status: id('status-select').value,
                payment_status: id('payment-select').value,
                shipping_fee: Number(id('adm-ship-fee').value),
                scheduled_at: id('adm-scheduled').value || null
            }).eq('id', dbId);

          btnSave.textContent = "Save Changes";

          if (error) alert("Gagal: " + error.message);
          else {
              alert("Berhasil update!");
              location.reload();
          }
      });
  }

  // --- 4. MARK COMPLETE (Tombol Hijau - FIX REDIRECT) ---
  const btnDone = id('btn-mark-done');
  if (btnDone) {
      btnDone.addEventListener('click', async () => {
          if (!confirm("Tandai Delivered & Paid? Order akan pindah ke History.")) return;
          
          const dbId = window.currentDbId;
          const supabase = window.supabase;

          btnDone.textContent = "Processing...";
          btnDone.disabled = true;

          const { error } = await supabase.from('orders').update({
                status: 'delivered', 
                payment_status: 'paid'
            }).eq('id', dbId);

          if (error) {
              alert("Error: " + error.message);
              btnDone.textContent = "Mark Complete & Paid";
              btnDone.disabled = false;
          } else {
              alert("Order selesai! Kembali ke list...");
              // REDIRECT KE LIST (KARENA ORDADM.JS SUDAH FIX, DIA AKAN MUNCUL DI HISTORY)
              window.location.href = 'ordadm.html';
          }
      });
  }

  setTimeout(initAdminDetail, 500); // Delay dikit biar script supabase load
})();