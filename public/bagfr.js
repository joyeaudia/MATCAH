// bagfr.js — Cart Renderer + Likes + Gift Toggle + Checkout Bridge

(function () {
  "use strict";

  // =========================================
  // 1. HELPER FUNCTIONS
  // =========================================
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));

  function formatRupiah(num) {
    return "Rp " + Math.round(Number(num) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function getCurrentUID() {
    return localStorage.getItem("maziUID") || "guest";
  }

  function userKey(base) {
    return `${base}_${getCurrentUID()}`;
  }

  // =========================================
  // 2. CART LOGIC (Load, Save, Render)
  // =========================================
  function loadCart() {
    try {
      return JSON.parse(localStorage.getItem(userKey("cart")) || "[]");
    } catch { return []; }
  }

  function saveCart(cart) {
    localStorage.setItem(userKey("cart"), JSON.stringify(cart || []));
  }

  function renderCart() {
    const items = loadCart();
    const container = document.getElementById("bag-items") || document.querySelector(".cart-list");
    if (!container) return;

    container.innerHTML = "";

    // State Kosong
    if (!items.length) {
      container.innerHTML = `
        <div class="empty-bag" style="text-align:center; padding:40px;">
          <img src="acs/bag1.png" alt="Keranjang kosong" style="width:120px; opacity:0.6; margin-bottom:15px;">
          <p style="color:#999; font-size:14px;">Keranjang Anda kosong.<br>Yuk tambah sesuatu yang manis!</p>
        </div>
      `;
      updateSummaryTotal(0);
      return;
    }

    let total = 0;

    items.forEach((it, idx) => {
      const unit = Number(it.unitPrice || 0);
      const qty = Number(it.qty || 1);
      const subtotal = unit * qty;
      total += subtotal;

      // Render Addons (Gula, Topping, dll)
      const addonsHtml = (it.addons || [])
        .map((a) => `<div class="addon" style="font-size:11px; color:#777; margin-top:2px;">• ${escapeHtml(a.label)}</div>`)
        .join("");

      const imgSrc = it.image || "assets/placeholder.png";

      const html = `
        <article class="cart-item" data-idx="${idx}">
          <div class="thumb">
            <img src="${imgSrc}" onerror="this.src='assets/placeholder.png'" alt="Product">
          </div>
          <div class="item-body">
            <div class="item-head">
              <div>
                <div class="item-title">${escapeHtml(it.title)}</div>
                <div class="item-meta">${addonsHtml}</div>
              </div>
              <button class="remove" data-idx="${idx}" aria-label="Hapus Item">
                <img src="acs/smph.png" alt="Hapus">
              </button>
            </div>

            <div class="item-controls">
              <div class="qty-control">
                <button class="qty-btn qty-decr">-</button>
                <span class="qty">${qty}</span>
                <button class="qty-btn qty-incr">+</button>
              </div>

              <div class="right-col">
                <div class="item-sub-value">${formatRupiah(subtotal)}</div>
              </div>
            </div>
          </div>
        </article>
      `;
      
      container.insertAdjacentHTML('beforeend', html);
    });

    updateSummaryTotal(total);
  }

  function updateSummaryTotal(val) {
    const el = document.querySelector(".summary-value") || document.getElementById("bag-total");
    if (el) el.textContent = formatRupiah(val || 0);
  }

  // --- Event Listener Cart (Qty & Remove) ---
  document.addEventListener("click", function (e) {
    const itemEl = e.target.closest(".cart-item");
    if (!itemEl) return;

    const idx = Number(itemEl.dataset.idx);
    let cart = loadCart();

    // Tambah Qty
    if (e.target.closest(".qty-incr")) {
      cart[idx].qty++;
      saveCart(cart); renderCart();
    } 
    // Kurang Qty
    else if (e.target.closest(".qty-decr")) {
      cart[idx].qty = Math.max(1, cart[idx].qty - 1);
      saveCart(cart); renderCart();
    } 
    // Hapus Item
    else if (e.target.closest(".remove")) {
      if(confirm("Hapus item ini dari keranjang?")) {
          cart.splice(idx, 1);
          saveCart(cart); renderCart();
      }
    }
  });

  // =========================================
  // 3. GIFT TOGGLE FEATURE (Restored)
  // =========================================
  document.addEventListener("click", function (e) {
    const tg = e.target.closest(".gift-toggle");
    if (!tg) return;

    const cart = loadCart();
    if (!cart.length) {
      alert("Tambahkan item ke keranjang dulu sebelum memilih Gift.");
      return;
    }

    // Toggle Status UI
    const isPressed = tg.getAttribute("aria-pressed") === "true";
    tg.setAttribute("aria-pressed", !isPressed);
    
    // Simpan status Gift ke LocalStorage agar cekout.js bisa membacanya nanti
    // (Fitur ini penting agar data gift terbawa ke checkout)
    localStorage.setItem("isGiftOrder", !isPressed);

    // Animasi Kecil
    tg.animate([
      { transform: "scale(1)" },
      { transform: "scale(1.1)" },
      { transform: "scale(1)" }
    ], { duration: 200 });
  });

  // =========================================
  // 4. LIKES LOGIC (FIX ERROR 400)
  // =========================================
  window.renderLikedCards = async function() {
      const supabase = window.supabase;
      if (!supabase) return;
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return; // Belum login, diam saja

      // FIX: Jangan minta 'created_at' agar tidak error 400
      const { data, error } = await supabase
          .from('user_likes')
          .select('product_id, title, image, price') 
          .eq('user_id', session.user.id);

      if (error) {
          console.error("Gagal load likes:", error);
          return;
      }

      const container = document.getElementById("liked-row");
      if (!container) return;
      
      container.innerHTML = "";
      
      if (!data || !data.length) {
          container.innerHTML = '<div style="color:#999;padding:10px;font-size:13px;width:100%;text-align:center;">Belum ada item yang disukai.</div>';
          return;
      }

      data.forEach(it => {
          const priceTxt = it.price ? formatRupiah(it.price) : "";
          const html = `
            <article class="like-card" data-id="${it.product_id}">
                <div class="like-thumb">
                    <img src="${it.image || 'assets/placeholder.png'}" onerror="this.src='assets/placeholder.png'">
                </div>
                <div class="like-body">
                    <div class="like-title">${escapeHtml(it.title)}</div>
                </div>
                <div class="like-footer">
                    <div class="like-price footer-price">${priceTxt}</div>
                    <button class="like-heart" data-id="${it.product_id}" aria-pressed="true">❤</button>
                </div>
            </article>`;
          container.insertAdjacentHTML('beforeend', html);
      });
  };

  // --- UNLIKE (Hapus Like) ---
  document.addEventListener("click", async function(e) {
      const btn = e.target.closest(".like-heart");
      if (!btn) return;
      e.stopPropagation();

      const productId = btn.dataset.id;
      const supabase = window.supabase;
      
      // Hapus visual langsung (Optimistic UI)
      const card = btn.closest(".like-card");
      if(card) {
          card.style.opacity = "0";
          setTimeout(() => card.remove(), 300);
      }

      // Hapus di Database
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
          await supabase
            .from('user_likes')
            .delete()
            .eq('user_id', user.id)
            .eq('product_id', productId);
      }
  });

  // =========================================
  // 5. CHECKOUT BRIDGE (Pindah ke cekout.html)
  // =========================================
  document.addEventListener("click", async function (e) {
    const btn = e.target.closest(".checkout"); // Tombol biru "Checkout"
    if (!btn) return;
    e.preventDefault();

    const cart = loadCart();
    if (!cart.length) { 
        alert("Keranjang Anda kosong."); 
        return; 
    }

    // Cek Login Sebelum Pindah
    const supabase = window.supabase;
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
        alert("Silakan login atau daftar akun untuk melanjutkan.");
        window.location.href = "singin.html";
        return;
    }

    // Logic Address Bridge (Sama seperti sebelumnya)
    // Cek apakah user punya alamat default di DB?
    let addressToUse = localStorage.getItem('checkoutRecipientDraft_v1');
    if (!addressToUse) {
        const { data: addr } = await supabase
            .from('user_addresses')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_default', true)
            .maybeSingle();
        
        if (addr) {
            addressToUse = `${addr.name}\n${addr.phone}\n${addr.address}`;
            localStorage.setItem('checkoutRecipientDraft_v1', addressToUse);
        }
    }

    // Redirect ke Halaman Checkout (Di sana cekout.js yang akan kerja)
    window.location.href = "cekout.html";
  });

  // =========================================
  // 6. INITIALIZATION
  // =========================================
  document.addEventListener("DOMContentLoaded", () => {
      // 1. Render Keranjang dari Local Storage
      renderCart();
      
      // 2. Render Likes (Dipanggil via HTML restoreSession agar token siap)
      // Tapi kita panggil juga disini sebagai cadangan
      if(window.supabase) window.renderLikedCards();
  });

})();