// ==========================================================
// ordadm.js — Admin List (Connects Directly to Supabase)
// ==========================================================
(function () {
  'use strict';

  let currentFilter = 'all';
  let allOrdersData = []; // Menyimpan data mentah dari Supabase

  // Format Rupiah
  const fmt = (n) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Number(n) || 0);

  // Escape HTML
  const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  // --- 1. FETCH DATA FROM SUPABASE ---
  async function fetchOrders() {
    const supabase = window.supabase;
    const loadingEl = document.getElementById('loading');
    
    if (!supabase) {
        if(loadingEl) loadingEl.textContent = "Supabase Error: Client not found.";
        return;
    }

    try {
        // Ambil orders beserta item-nya
        const { data, error } = await supabase
            .from('orders')
            .select('*, order_items(*)')
            .order('created_at', { ascending: false });

        if (error) throw error;

        allOrdersData = data || [];
        
        if(loadingEl) loadingEl.style.display = 'none';
        renderAdminList();

    } catch (err) {
        console.error("Fetch error:", err);
        if(loadingEl) loadingEl.textContent = "Gagal memuat data. Cek koneksi.";
    }
  }

  // --- 2. RENDER LIST ---
  function renderAdminList() {
    const container = document.getElementById('order-list');
    if (!container) return;
    container.innerHTML = '';

    // Filter Logic
    let orders = allOrdersData.filter(o => {
        const s = (o.status || '').toLowerCase();
        
        // Tab History: Hanya yang Completed / Delivered / Cancelled
        const isHistory = ['delivered', 'completed', 'cancelled', 'rejected'].includes(s);
        
        // Tab Gift: Cek kolom is_gift (sesuaikan dengan nama kolom di DB Anda)
        // Asumsi di DB kolomnya boolean 'is_gift' atau check meta
        const isGift = o.is_gift === true || (o.meta && o.meta.isGift === true);

        if (currentFilter === 'history') {
            return isHistory;
        } else if (currentFilter === 'gift') {
            return !isHistory && isGift;
        } else {
            // Tab 'Semua': Hanya yang AKTIF (Belum selesai)
            return !isHistory;
        }
    });

    if (orders.length === 0) {
      container.innerHTML = '<div style="color:#777;font-size:13px;padding:20px;text-align:center">Tidak ada pesanan di tab ini.</div>';
      return;
    }

    orders.forEach(order => {
      container.appendChild(createOrderCard(order));
    });
  }

  // --- 3. CREATE CARD DOM ---
  function createOrderCard(order) {
    const card = document.createElement('article');
    
    // Setup Data
    const created = new Date(order.created_at).toLocaleString('id-ID');
    const status = (order.status || 'active').toLowerCase();
    const payStatus = (order.payment_status || 'pending').toLowerCase();
    
    // Cek Gift
    const isGift = order.is_gift === true || (order.meta && order.meta.isGift);

    // Styling Class
    card.className = 'admin-order-card';
    if (['delivered', 'completed'].includes(status)) card.classList.add('is-completed');
    else if (payStatus === 'paid') card.classList.add('is-paid');
    if (isGift) card.classList.add('gift');

    // Item Summary
    const items = order.order_items || [];
    const firstItemTitle = items.length > 0 ? items[0].title : 'No items';
    const moreCount = items.length > 1 ? `+${items.length - 1} more` : '';

    // Render Items HTML
    const itemsHtml = items.map(it => `
        <div class="admin-item-row">
            <div class="admin-item-main">
                <div class="admin-item-title">${escapeHtml(it.title)} <small>x${it.qty}</small></div>
                <div class="admin-item-price">${fmt(it.unit_price * it.qty)}</div>
            </div>
        </div>
    `).join('');

    // Render Address (Fallback ke recipient_name kalau kolom address user_id ribet)
    let addrHtml = '';
    const recName = order.recipient_name || (order.meta && order.meta.recipient_name) || '-';
    const recAddr = order.recipient_address || (order.meta && order.meta.recipient_address) || '';
    
    if (recName !== '-') {
        addrHtml = `
        <div class="admin-address">
            <div class="admin-address-title">Penerima</div>
            <div class="admin-address-main">
                <strong>${escapeHtml(recName)}</strong><br>
                ${escapeHtml(recAddr)}
            </div>
        </div>`;
    }

    // Action Buttons Logic
    let buttonsHtml = '';
    // Jika belum selesai, tampilkan tombol update cepat
    if (!['delivered','completed','cancelled','rejected'].includes(status)) {
        buttonsHtml = `
            <div class="admin-actions">
                <button class="btn btn-details" onclick="window.location.href='diteladm.html?id=${order.id}'">Buka Detail / Update Status</button>
            </div>
        `;
    } else {
        buttonsHtml = `
            <div class="admin-actions">
                <button class="btn btn-details" onclick="window.location.href='diteladm.html?id=${order.id}'">Lihat History</button>
            </div>
        `;
    }

    card.innerHTML = `
      <div class="admin-order-header">
        <div>
          <div class="admin-order-id">ID: ${escapeHtml(order.client_order_id || order.id.substr(0,8))}</div>
          <div class="admin-order-created">${created}</div>
        </div>
        <div class="admin-order-total">
          <span class="admin-total-label">Total</span>
          <span class="admin-total-value">${fmt(order.total)}</span>
        </div>
      </div>

      <div class="admin-status-row">
        <span class="badge badge-status">${escapeHtml(status)}</span>
        <span class="badge badge-payment ${payStatus}">${escapeHtml(payStatus)}</span>
      </div>

      <div class="admin-summary-row">
        <span class="summary-chip">${isGift ? '🎁 Gift' : 'Order'}</span>
        <span class="summary-main">${escapeHtml(firstItemTitle)} ${moreCount}</span>
        <button type="button" class="btn-toggle-detail">Detail ▼</button>
      </div>

      <div class="admin-details collapsed">
        <div class="admin-items">${itemsHtml}</div>
        ${addrHtml}
        ${buttonsHtml}
      </div>
    `;

    // Event Toggle Detail
    const toggleBtn = card.querySelector('.btn-toggle-detail');
    const detailsEl = card.querySelector('.admin-details');
    
    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCollapsed = detailsEl.classList.toggle('collapsed');
        toggleBtn.textContent = isCollapsed ? 'Detail ▼' : 'Tutup ▲';
    });

    return card;
  }

  // --- 4. INIT ---
  document.addEventListener('DOMContentLoaded', function () {
    // Filter click listeners
    const pills = document.querySelectorAll('.admin-pill');
    pills.forEach(btn => {
      btn.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('is-active'));
        btn.classList.add('is-active');
        currentFilter = btn.dataset.filter;
        renderAdminList();
      });
    });

    // Start Fetch
    fetchOrders();
  });

})();