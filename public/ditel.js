// ditel.js — Final Fix Safe Address

(function () {
    'use strict';
  
    const getIdFromUrl = () => new URLSearchParams(window.location.search).get('id');
    const fmt = n => 'Rp ' + new Intl.NumberFormat('id-ID').format(Number(n) || 0);
    const q = s => document.querySelector(s);
  
    window.startDetailPage = async function() {
      const orderId = getIdFromUrl();
      if (!orderId) return alert("ID Order tidak ditemukan.");
  
      const supabase = window.supabase;
      if (!supabase) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
          window.location.href = 'singin.html';
          return;
      }

      // 1. AMBIL ORDER
      let { data: order, error } = await supabase
          .from('orders')
          .select('*, order_items(*)')
          .eq('user_id', user.id)
          .eq('client_order_id', orderId) 
          .maybeSingle();

      if (error) console.error("DB Error:", error);

      if (!order) {
          q('.detail-container').innerHTML = `<p style='text-align:center;margin-top:50px'>Order tidak ditemukan.</p>`;
          return;
      }

      // 2. FALLBACK ALAMAT AMAN
      // Jika di order kosong, coba ambil profil default
      if (!order.recipient_address) {
          const { data: userAddr } = await supabase
              .from('user_addresses')
              .select('*')
              .eq('user_id', user.id)
              .eq('is_default', true)
              .maybeSingle();
          
          if (userAddr) {
              order.recipient_address = userAddr.address;
              order.recipient_name = userAddr.name;
              order.recipient_phone = userAddr.phone;
          }
      }

      renderUI(order);
    };
  
    function renderUI(order) {
      // Header
      const st = (order.status || 'Active').toUpperCase();
      q('#status-pill').textContent = st;
      q('#status-pill').className = `status-pill ${st.toLowerCase()}`; // class untuk warna
      q('#order-id').textContent = order.client_order_id;
      
      // Tanggal Aman
      try {
          const dateObj = new Date(order.created_at || Date.now());
          q('#order-date').textContent = dateObj.toLocaleString('id-ID', {
             day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'
          });
      } catch(e) { q('#order-date').textContent = "-"; }
  
      // Jadwal Aman
      if (order.scheduled_at) {
        try {
            const sched = new Date(order.scheduled_at);
            q('#order-sched').textContent = sched.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
        } catch(e) { q('#order-sched').textContent = "Secepatnya"; }
      } else {
        q('#order-sched').textContent = "Secepatnya";
      }
      
      // Payment Method
      const payMethod = order.delivery_method || "Regular"; 
      if(document.getElementById('payment-method')) {
          document.getElementById('payment-method').textContent = payMethod;
      }
  
      // --- ALAMAT (CRASH PROOF) ---
      // Pastikan variabel string, bukan null/undefined
      const rawAddr = String(order.recipient_address || "");
      const rawName = String(order.recipient_name || "Penerima");
      const rawPhone = String(order.recipient_phone || "-");

      const addrBox = q('.address-box');
      if (addrBox) {
          // Hanya render jika ada alamat, atau tampilkan pesan kosong
          if (rawAddr.length > 5) { // Validasi minimal
              const cleanAddr = rawAddr.replace(/\n/g, '<br>');
              addrBox.innerHTML = `
                <div class="addr-label">Shipping Address</div>
                <div class="addr-text">
                    <div style="font-weight:700;color:#000;margin-bottom:4px;font-size:15px;">${rawName}</div>
                    <div style="font-size:13px;color:#666;margin-bottom:6px;">${rawPhone}</div>
                    <div style="font-size:14px;color:#333;line-height:1.5;">${cleanAddr}</div>
                </div>
              `;
          } else {
              addrBox.innerHTML = `
                <div class="addr-label">Shipping Address</div>
                <div class="addr-text" style="color:#999;font-style:italic">
                    Alamat tidak tercatat pada order ini.
                </div>
              `;
          }
      }
  
      // --- ITEMS ---
      const listEl = q('#order-items-list');
      if (listEl) {
          listEl.innerHTML = '';
          const items = order.order_items || [];
          
          items.forEach(it => {
            const title = it.title || "Product";
            const price = it.unit_price || 0;
            const qty = it.qty || 1;
            const img = it.image_url || 'assets/placeholder.png';
      
            const row = document.createElement('div');
            row.className = 'item-card';
            row.innerHTML = `
              <img src="${img}" class="item-thumb" onerror="this.src='assets/placeholder.png'">
              <div class="item-info">
                <div class="item-name">${title}</div>
                <div class="item-price">${fmt(price)}</div>
              </div>
              <div class="item-qty">x${qty}</div>
            `;
            listEl.appendChild(row);
          });
      }
  
      // --- SUMMARY ---
      const subtotal = order.total || 0; 
      const ship = order.shipping_fee || 0;
      if(q('#summ-subtotal')) q('#summ-subtotal').textContent = fmt(subtotal);
      if(q('#summ-ship')) q('#summ-ship').textContent = fmt(ship);
      if(q('#summ-total')) q('#summ-total').textContent = fmt(subtotal + ship);
  
      // --- TRACKING ---
      updateTrackingSteps(order.status, order.payment_status);
    }
  
    function updateTrackingSteps(status, payStatus) {
      const s = (status || '').toLowerCase();
      const p = (payStatus || '').toLowerCase();
  
      document.querySelectorAll('.step').forEach(el => {
          el.classList.remove('completed');
          el.querySelector('.step-status').textContent = 'Pending';
          el.querySelector('.step-status').className = 'step-status'; 
      });
  
      const markDone = (id, text) => {
          const el = document.querySelector(id);
          if (el) {
              el.classList.add('completed');
              const st = el.querySelector('.step-status');
              st.textContent = text || 'Completed';
              st.classList.add('done-text');
          }
      }

      markDone('#step-placed', 'Completed');
      if (p === 'paid') markDone('#step-payment', 'Confirmed');
      if (['processing', 'delivery', 'delivered', 'completed'].includes(s)) 
         markDone('#step-process', 'Completed');
      if (['delivery', 'delivered', 'completed'].includes(s)) 
         markDone('#step-delivery', 'Driver Assigned');
      if (['delivered', 'completed'].includes(s)) 
         markDone('#step-done', 'Received');
    }
})();