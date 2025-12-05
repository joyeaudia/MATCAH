// admin-orders.js - untuk admin melihat semua orders dari semua user
(function () {
  'use strict';

  // 🔥 FUNGSI UTAMA: Load orders dari SEMUA user
  function loadAllUserOrders() {
    const allOrders = [];
    const seenIds = new Set();

    // 1️⃣ Loop semua key di localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      
      // 2️⃣ Cari key yang match pattern: orders_*
      if (key && key.startsWith('orders_')) {
        try {
          const orders = JSON.parse(localStorage.getItem(key) || '[]');
          
          if (Array.isArray(orders)) {
            orders.forEach(order => {
              // Hindari duplikat
              if (!seenIds.has(order.id)) {
                seenIds.add(order.id);
                
                // Tambahkan info user untuk tracking
                order._storageKey = key;
                order._userId = key.replace('orders_', '');
                
                allOrders.push(order);
              }
            });
          }
        } catch (e) {
          console.error(`Error parsing ${key}:`, e);
        }
      }
    }

    // 3️⃣ Juga cek key global lama 'orders' (backward compatibility)
    try {
      const legacy = JSON.parse(localStorage.getItem('orders') || '[]');
      if (Array.isArray(legacy)) {
        legacy.forEach(order => {
          if (!seenIds.has(order.id)) {
            seenIds.add(order.id);
            order._storageKey = 'orders';
            order._userId = 'legacy';
            allOrders.push(order);
          }
        });
      }
    } catch (e) {
      console.error('Error parsing legacy orders:', e);
    }

    // 4️⃣ Sort berdasarkan waktu (terbaru di atas)
    allOrders.sort((a, b) => {
      const timeA = a.createdAt || 0;
      const timeB = b.createdAt || 0;
      return timeB - timeA;
    });

    console.log('📦 Total orders found:', allOrders.length);
    return allOrders;
  }

  // 💾 Save order kembali ke storage user yang benar
  function saveOrderToUser(order) {
    if (!order._storageKey) {
      console.error('Order tidak punya _storageKey, tidak bisa save');
      return false;
    }

    try {
      const key = order._storageKey;
      const orders = JSON.parse(localStorage.getItem(key) || '[]');
      
      const idx = orders.findIndex(o => String(o.id) === String(order.id));
      
      if (idx !== -1) {
        // Update order yang sudah ada
        orders[idx] = order;
      } else {
        // Tambah order baru
        orders.push(order);
      }
      
      localStorage.setItem(key, JSON.stringify(orders));
      console.log('✅ Order saved:', order.id);
      return true;
    } catch (e) {
      console.error('Error saving order:', e);
      return false;
    }
  }

  // 🎨 Render tabel orders di admin
  function renderAdminOrders() {
    const container = document.getElementById('admin-orders-list');
    if (!container) {
      console.error('Element #admin-orders-list tidak ditemukan!');
      return;
    }

    const orders = loadAllUserOrders();

    if (!orders.length) {
      container.innerHTML = '<p style="padding:20px;text-align:center;color:#999">Belum ada order sama sekali.</p>';
      return;
    }

    let html = '<table class="admin-table"><thead><tr>';
    html += '<th>Order ID</th>';
    html += '<th>User</th>';
    html += '<th>Items</th>';
    html += '<th>Total</th>';
    html += '<th>Status</th>';
    html += '<th>Payment</th>';
    html += '<th>Created</th>';
    html += '<th>Actions</th>';
    html += '</tr></thead><tbody>';

    orders.forEach(order => {
      const itemCount = (order.items || []).length;
      const firstItem = order.items?.[0]?.title || 'N/A';
      const total = formatRupiah(order.total || 0);
      const created = new Date(order.createdAt || Date.now()).toLocaleString('id-ID');
      
      html += '<tr>';
      html += `<td>${escapeHtml(order.id)}</td>`;
      html += `<td><small>${escapeHtml(order._userId)}</small></td>`;
      html += `<td>${escapeHtml(firstItem)} ${itemCount > 1 ? `+${itemCount-1}` : ''}</td>`;
      html += `<td>${total}</td>`;
      html += `<td><span class="status-badge status-${order.status}">${escapeHtml(order.status || 'active')}</span></td>`;
      html += `<td><span class="payment-badge payment-${order.paymentStatus}">${escapeHtml(order.paymentStatus || 'pending')}</span></td>`;
      html += `<td><small>${created}</small></td>`;
      html += `<td>
        <button class="btn-small btn-view" data-id="${escapeHtml(order.id)}">View</button>
        <button class="btn-small btn-edit" data-id="${escapeHtml(order.id)}">Edit</button>
      </td>`;
      html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // Attach event listeners
    attachAdminActions();
  }

  // 🎯 Handle button clicks
  function attachAdminActions() {
    document.querySelectorAll('.btn-view').forEach(btn => {
      btn.addEventListener('click', function() {
        const id = this.dataset.id;
        viewOrderDetails(id);
      });
    });

    document.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', function() {
        const id = this.dataset.id;
        editOrderStatus(id);
      });
    });
  }

  // 👁️ View order details
  function viewOrderDetails(orderId) {
    const orders = loadAllUserOrders();
    const order = orders.find(o => String(o.id) === String(orderId));
    
    if (!order) {
      alert('Order tidak ditemukan!');
      return;
    }

    // Tampilkan di modal atau panel
    console.log('Order details:', order);
    alert(`Order: ${order.id}\nTotal: ${formatRupiah(order.total)}\nStatus: ${order.status}`);
  }

  // ✏️ Edit order status
  function editOrderStatus(orderId) {
    const orders = loadAllUserOrders();
    const order = orders.find(o => String(o.id) === String(orderId));
    
    if (!order) {
      alert('Order tidak ditemukan!');
      return;
    }

    const newStatus = prompt(
      `Update status untuk order ${order.id}:\n\n` +
      `Status sekarang: ${order.status}\n` +
      `Payment: ${order.paymentStatus}\n\n` +
      `Pilihan status:\n` +
      `- active\n` +
      `- scheduled\n` +
      `- delivered\n` +
      `- cancelled\n\n` +
      `Masukkan status baru:`,
      order.status
    );

    if (!newStatus) return;

    order.status = newStatus.toLowerCase();

    // Update payment status jika perlu
    if (newStatus === 'cancelled') {
      order.paymentStatus = 'rejected';
    }

    if (saveOrderToUser(order)) {
      alert('✅ Status berhasil diupdate!');
      renderAdminOrders(); // Refresh tampilan
    } else {
      alert('❌ Gagal update status!');
    }
  }

  // Utility functions
  function formatRupiah(n) {
    return 'Rp ' + new Intl.NumberFormat('id-ID').format(Number(n || 0));
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // 🚀 Init saat DOM ready
  document.addEventListener('DOMContentLoaded', function() {
    console.log('🔧 Admin Orders loaded');
    renderAdminOrders();

    // Refresh button
    const refreshBtn = document.getElementById('btn-refresh-orders');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', renderAdminOrders);
    }
  });

  // Expose untuk debugging
  window.loadAllUserOrders = loadAllUserOrders;
  window.renderAdminOrders = renderAdminOrders;

})();