// order.js — Full Features: List, Expandable Summary, Track, Reorder

(function () {
    'use strict';
    const q = (s) => document.querySelector(s);
    const fmt = (n) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Number(n) || 0);
    const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','':'&quot;','\'':'&#39;' }[c]));

    document.addEventListener('DOMContentLoaded', async () => {
        const supabase = window.supabase;
        if (!supabase) return;

        // 1. Cek Login
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            // Jika tidak login, jangan render apa-apa / redirect
            q('#loading').textContent = "Silakan login.";
            return;
        }

        // 2. Fetch Orders
        const { data: orders, error } = await supabase
            .from('orders')
            .select('*, order_items(*)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        q('#loading').style.display = 'none'; // Sembunyikan loading

        if (error || !orders || orders.length === 0) {
            renderEmpty();
            return;
        }

        renderTabs(orders);
    });

    function renderEmpty() {
        q('#tab-active').innerHTML = '<div style="text-align:center;padding:40px;color:#999">Belum ada pesanan.</div>';
    }

    // --- TAB LOGIC ---
    function renderTabs(orders) {
        const active = [], scheduled = [], history = [];

        orders.forEach(o => {
            const s = (o.status || '').toLowerCase();
            const isFinal = ['delivered', 'completed', 'cancelled', 'rejected'].includes(s);
            const isSched = !!o.scheduled_at && !isFinal;

            if (isFinal) history.push(o);
            else if (isSched) scheduled.push(o);
            else active.push(o);
        });

        renderList('#tab-active', active, 'active');
        renderList('#tab-scheduled', scheduled, 'scheduled');
        renderList('#tab-history', history, 'history');
    }

    // --- RENDER CARD ---
    function renderList(targetId, list, type) {
        const container = q(targetId);
        container.innerHTML = ""; // Bersihkan

        if (list.length === 0) {
            container.innerHTML = '<div style="padding:40px;text-align:center;color:#999;font-size:13px">Kosong.</div>';
            return;
        }

        list.forEach(order => {
            // Info Dasar
            const item = order.order_items?.[0] || {};
            const title = item.title || "Pesanan";
            const img = item.image_url || 'assets/placeholder.png';
            const count = order.order_items?.length || 0;
            const moreLabel = count > 1 ? `<span class="more-badge">+${count - 1} lainnya</span>` : "";
            
            // Unique ID untuk Toggle
            const uniqueId = `details-${order.id}`;
            const trackLink = `ditel.html?id=${order.client_order_id}`;

            // Warna Status
            let color = '#007bff';
            if (['completed','delivered'].includes(order.status)) color = '#22c55e';
            if (['cancelled','rejected'].includes(order.status)) color = '#ef4444';

            // --- TOMBOL ---
            let buttons = '';
            
            // 1. View Details (Expand)
            const btnView = `<button class="btn-light toggle-btn" data-target="${uniqueId}">View Details</button>`;

            if (type === 'history') {
                // History: Reorder
                // Simpan items di atribut data agar mudah diambil
                const itemsJson = encodeURIComponent(JSON.stringify(order.order_items));
                buttons = `${btnView} <button class="btn-light btn-reorder" data-items="${itemsJson}">Reorder</button>`;
            } else {
                // Active: Track Order (Pindah Halaman)
                buttons = `${btnView} <button class="btn-track" onclick="window.location.href='${trackLink}'">Track Order</button>`;
            }

            // --- HTML DETAIL ITEM (Hidden) ---
            const itemsHtml = (order.order_items || []).map(it => `
                <div class="detail-row">
                    <span style="flex:1">${it.qty}x ${escapeHtml(it.title)}</span>
                    <span>${fmt(it.unit_price * it.qty)}</span>
                </div>
            `).join('');

            // --- KARTU LENGKAP ---
            const html = `
                <article class="order-card">
                    <div class="card-main">
                        <div class="thumb"><img src="${img}" onerror="this.src='assets/placeholder.png'"></div>
                        <div class="order-info">
                            <div class="order-top">
                                <h3 class="product-title">${escapeHtml(title)}</h3>
                                ${moreLabel}
                            </div>
                            <div class="status-row" style="color:${color}">● ${order.status}</div>
                            <div class="eta">${fmt(order.total)}</div>
                            <div class="order-actions">${buttons}</div>
                        </div>
                    </div>

                    <div id="${uniqueId}" class="card-details">
                        <div class="status-box">
                            Order ID: <strong>${order.client_order_id}</strong><br>
                            Status: ${order.status}
                        </div>
                        <div style="font-weight:700;margin-bottom:8px;font-size:13px">Ringkasan Item:</div>
                        ${itemsHtml}
                        <div class="detail-row" style="margin-top:10px;border-top:1px dashed #eee;padding-top:8px">
                            <span>Ongkir</span><span>${fmt(order.shipping_fee || 0)}</span>
                        </div>
                        <div class="detail-row detail-total">
                            <span>Total</span><span>${fmt(order.total + (order.shipping_fee || 0))}</span>
                        </div>
                        <div style="text-align:center;margin-top:15px">
                            <button class="btn-light toggle-btn" data-target="${uniqueId}" style="width:100%">Tutup</button>
                        </div>
                    </div>
                </article>
            `;
            container.insertAdjacentHTML('beforeend', html);
        });

        attachEvents(container);
    }

    function attachEvents(container) {
        // Toggle View Details
        container.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const target = document.getElementById(btn.dataset.target);
                
                if (target.classList.contains('open')) {
                    target.classList.remove('open');
                } else {
                    // Tutup yang lain (opsional)
                    document.querySelectorAll('.card-details.open').forEach(el => el.classList.remove('open'));
                    target.classList.add('open');
                }
            });
        });

        // Reorder Logic
        container.querySelectorAll('.btn-reorder').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                try {
                    const items = JSON.parse(decodeURIComponent(btn.dataset.items));
                    const uid = localStorage.getItem("maziUID") || "guest";
                    const cartKey = `cart_${uid}`;
                    let cart = JSON.parse(localStorage.getItem(cartKey) || "[]");

                    items.forEach(it => {
                        cart.push({
                            id: it.product_id, title: it.title,
                            unitPrice: it.unit_price, qty: 1, image: it.image_url,
                            subtotal: it.unit_price
                        });
                    });

                    localStorage.setItem(cartKey, JSON.stringify(cart));
                    if(confirm("Item masuk keranjang. Ke Bag?")) window.location.href = "bagfr.html";
                } catch(err) { console.error(err); }
            });
        });
    }

    // Tab Switcher
    document.querySelectorAll('.tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('tab-active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
            
            btn.classList.add('tab-active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
        });
    });

})();