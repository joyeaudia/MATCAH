// bagfr.js — cart renderer + likes + checkout (localStorage per user, mirror orders ke Supabase)

(function () {
  "use strict";

  // ----- helpers -----
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));

  function formatRupiah(num) {
    num = Math.round(Number(num) || 0);
    return (
      "Rp " + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    );
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c])
    );
  }

  // 🔑 ambil UID user yang sedang login
  function getCurrentUID() {
    return localStorage.getItem("maziUID") || "guest";
  }

  // 🔑 bikin key per user, misalnya cart_local-123, orders_admin-fixed, likes_guest
  function userKey(base) {
    const uid = getCurrentUID();
    return `${base}_${uid}`;
  }

  // ----- storage: CART (per user) -----
  function loadCart() {
    try {
      const key = userKey("cart");
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch (e) {
      return [];
    }
  }
  function saveCart(cart) {
    const key = userKey("cart");
    localStorage.setItem(key, JSON.stringify(cart || []));
  }

  // ----- render cart -----
  function renderCart() {
    const items = loadCart();
    const container =
      document.getElementById("bag-items") ||
      document.querySelector(".cart-list") ||
      document.querySelector(".bag-items");
    if (!container) return;

    container.innerHTML = "";

    if (!items.length) {
      container.innerHTML = `
        <div class="empty-bag">
          <img src="acs/bag1.png" alt="Keranjang kosong">
        </div>
      `;
      updateSummaryTotal();
      return;
    }

    let total = 0;
    items.forEach((it, idx) => {
      const unit = Number(it.unitPrice || it.price || 0);
      const qty = Number(it.qty || 1);
      const subtotal = Number(
        it.subtotal || unit * qty || unit * qty
      );
      total += subtotal;

      const addonsHtml =
        it.addons && it.addons.length
          ? it.addons
              .map((a) => {
                const rawLabel = String(a.label || "").trim();
                const hasPriceToken = /\(\s*\+\s*\d+|Rp\b|K\)/i.test(
                  rawLabel
                );
                const labelEscaped = escapeHtml(rawLabel);
                if (hasPriceToken) {
                  return `<div class="addon">${labelEscaped}</div>`;
                } else {
                  return `<div class="addon">${labelEscaped}${
                    a.price ? ` (+${formatRupiah(a.price)})` : ""
                  }</div>`;
                }
              })
              .join("")
          : "";

      const imgSrc = escapeHtml(
        it.image ||
          (it.images && it.images[0]) ||
          "assets/placeholder.png"
      );

      const html = `
        <article class="cart-item" data-idx="${idx}" data-price="${unit}">
          <div class="thumb">
            <img src="${imgSrc}" alt="${escapeHtml(it.title || "Product")}"
                 onerror="this.onerror=null;this.src='assets/placeholder.png'">
          </div>
          <div class="item-body">
            <div class="item-head">
              <div>
                <div class="item-title">${escapeHtml(
                  it.title || "Untitled"
                )}</div>
                <div class="item-meta">${addonsHtml}</div>
              </div>
              <button class="remove" title="Hapus item" aria-label="Hapus item" data-idx="${idx}">
                <img src="acs/smph.png" alt="Hapus">
              </button>
            </div>

            <div class="item-controls">
              <div class="qty-control">
                <button class="qty-btn qty-decr" aria-label="Kurangi">-</button>
                <span class="qty">${qty}</span>
                <button class="qty-btn qty-incr" aria-label="Tambah">+</button>
              </div>

              <div class="right-col">
                <div class="item-sub-value">${formatRupiah(
                  subtotal
                )}</div>
              </div>
            </div>
          </div>
        </article>
      `;
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html.trim();
      container.appendChild(wrapper.firstElementChild);
    });

    updateSummaryTotal(total);
  }

  // ----- update totals -----
  function updateSummaryTotal(precalculated) {
    let total = Number(precalculated || 0);
    if (!precalculated) {
      const items = loadCart();
      total = items.reduce(
        (s, it) =>
          s +
          (Number(it.subtotal) ||
            Number(it.unitPrice || it.price || 0) *
              Number(it.qty || 1)),
        0
      );
    }
    const summaryEl =
      document.querySelector(".summary-value") ||
      document.getElementById("bag-total") ||
      document.querySelector(".bag-total");
    if (summaryEl) summaryEl.textContent = formatRupiah(total);
  }

  // ----- event delegation: qty, remove (cart) -----
  document.addEventListener("click", function (e) {
    const itemEl = e.target.closest(".cart-item");
    if (!itemEl) return;

    const idx = Number(itemEl.dataset.idx);
    let cart = loadCart();

    if (e.target.closest(".qty-incr")) {
      cart[idx].qty =
        Number(cart[idx].qty || 1) + 1;
      cart[idx].subtotal =
        Number(cart[idx].unitPrice || cart[idx].price || 0) *
        cart[idx].qty;
      saveCart(cart);
      renderCart();
      return;
    }

    if (e.target.closest(".qty-decr")) {
      cart[idx].qty = Math.max(
        1,
        Number(cart[idx].qty || 1) - 1
      );
      cart[idx].subtotal =
        Number(cart[idx].unitPrice || cart[idx].price || 0) *
        cart[idx].qty;
      saveCart(cart);
      renderCart();
      return;
    }

    if (e.target.closest(".remove")) {
      cart.splice(idx, 1);
      saveCart(cart);
      renderCart();
      return;
    }
  });

  // ----- public helper to add item to cart (call this from product page) -----
  function addToBag(productObj) {
    if (!productObj || !productObj.id)
      throw new Error("productObj.id required");
    const cart = loadCart();
    const sameIdx = cart.findIndex(
      (i) =>
        i.id === productObj.id &&
        JSON.stringify(i.addons || []) ===
          JSON.stringify(productObj.addons || [])
    );
    if (sameIdx >= 0) {
      cart[sameIdx].qty =
        Number(cart[sameIdx].qty || 1) +
        (Number(productObj.qty) || 1);
      cart[sameIdx].subtotal =
        Number(
          cart[sameIdx].unitPrice || cart[sameIdx].price || 0
        ) * cart[sameIdx].qty;
    } else {
      const qty = Number(productObj.qty || 1);
      const unit = Number(
        productObj.unitPrice || productObj.price || 0
      );
      const item = {
        id: productObj.id,
        title: productObj.title || "",
        unitPrice: unit,
        qty: qty,
        subtotal: Number(
          productObj.subtotal || unit * qty
        ),
        image:
          productObj.image ||
          (productObj.images && productObj.images[0]) ||
          "assets/placeholder.png",
        addons: productObj.addons || [], // array
        source: productObj.source || "",
      };
      cart.push(item);
    }
    saveCart(cart);
    renderCart();
  }

  window.addToBag = addToBag;
  window.renderCart = renderCart;

  /* -------------------------
     LIKES (per user)
     ------------------------- */

  // === Likes per user ===
  function getCurrentUID_likes() {
    return localStorage.getItem("maziUID") || "guest";
  }
  function likesKey() {
    return "likes_" + getCurrentUID_likes();
  }

  function loadLikes() {
    try {
      return JSON.parse(localStorage.getItem(likesKey()) || "[]");
    } catch (e) {
      return [];
    }
  }
  function saveLikes(arr) {
    localStorage.setItem(
      likesKey(),
      JSON.stringify(arr || [])
    );
  }

  function renderLikedCards() {
    const likes = loadLikes();
    const container =
      document.querySelector(".liked-row") ||
      document.getElementById("liked-row");
    if (!container) return;
    container.innerHTML = "";

    if (!likes.length) {
      container.innerHTML =
        '<div style="color:#888;padding:12px">You have no liked items yet.</div>';
      return;
    }

    likes.forEach((it) => {
      const id = String(it.id || "");
      const title = String(it.title || "");
      const image = String(
        it.image || "assets/placeholder.png"
      );
      const price = Number(it.price || 0);
      const priceText = price
        ? "Rp " +
          new Intl.NumberFormat("id-ID").format(price)
        : "";

      const article = document.createElement("article");
      article.className = "like-card";
      article.setAttribute("role", "listitem");
      article.setAttribute("data-id", id);
      article.setAttribute(
        "data-source",
        it.source ||
          (id.includes("dsri-")
            ? "dsri"
            : id.includes("drsi-")
            ? "drsi"
            : "")
      );
      article.innerHTML = `
        <div class="like-thumb">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(
        title
      )}"
               onerror="this.onerror=null;this.src='assets/placeholder.png'">
        </div>

        <div class="like-body">
          <div class="like-title">${escapeHtml(
            title
          )}</div>
        </div>

        <div class="like-footer">
          ${
            priceText
              ? `<div class="like-price footer-price">${escapeHtml(
                  priceText
                )}</div>`
              : ""
          }
          <button class="like-heart" aria-label="Unlike" title="Unlike"
                  data-id="${escapeHtml(
                    id
                  )}" aria-pressed="false">❤</button>
        </div>
      `;
      container.appendChild(article);
    });
  }

  document.addEventListener("click", function (e) {
    const heart = e.target.closest(".like-heart");
    if (heart) {
      heart.setAttribute("aria-pressed", "true");
      heart.classList.add("like-heart-pressed");

      const id = heart.dataset.id;
      if (id) {
        setTimeout(() => {
          let likes = loadLikes();
          likes = likes.filter(
            (x) => String(x.id) !== String(id)
          );
          saveLikes(likes);
          renderLikedCards();
          window.dispatchEvent(
            new CustomEvent("likes:updated", {
              detail: { likes },
            })
          );
        }, 180);
      } else {
        setTimeout(renderLikedCards, 180);
      }
      e.stopPropagation();
      return;
    }

    const card = e.target.closest(".like-card");
    if (card) {
      let id =
        card.getAttribute("data-id") ||
        card.dataset.id ||
        null;
      const source = (
        card.getAttribute("data-source") ||
        card.dataset.source ||
        ""
      )
        .toLowerCase()
        .trim() || null;

      if (!id) {
        try {
          const likes = loadLikes();
          const title =
            card
              .querySelector(".like-title")
              ?.textContent?.trim() || "";
          const img =
            card.querySelector(".like-thumb img")?.src;
          const found = likes.find(
            (x) =>
              (x.title && x.title === title) ||
              (x.image && x.image === img)
          );
          if (found && found.id) id = found.id;
        } catch (err) {}
      }

      if (!id) {
        alert(
          "Tidak dapat menemukan id produk untuk kartu ini."
        );
        return;
      }

      let page = "./drsi.html";
      if (source === "dsri") page = "./dsri.html";
      else if (source === "bsri") page = "./bsri.html";
      else {
        if (id.startsWith("dsri-")) page = "./dsri.html";
        else if (id.startsWith("drsi-"))
          page = "./drsi.html";
      }

      window.location.assign(
        `${page}?id=${encodeURIComponent(String(id))}`
      );
    }
  });

  document.addEventListener("DOMContentLoaded", function () {
    renderCart();
    renderLikedCards();
  });

  window.addEventListener(
    "likes:updated",
    renderLikedCards
  );
})(); // end first IIFE

// ===== Checkout -> create order & redirect to order.html + WhatsApp (localStorage per user + Supabase mirror) =====
(function () {
  "use strict";

  // ⬅️ Supabase client (dibuat di HTML, misalnya Home/bagfr page)
  const supabase = window.supabase || null;

  // 🔑 helper UID lagi (scope IIFE kedua)
  function getCurrentUID() {
    return localStorage.getItem("maziUID") || "guest";
  }
  function userKey(base) {
    const uid = getCurrentUID();
    return `${base}_${uid}`;
  }

  // ID random: 5 huruf (A-Z,a-z) + 4 angka
  function genOrderId() {
    const letters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    let part1 = "";
    for (let i = 0; i < 5; i++) {
      part1 +=
        letters[Math.floor(Math.random() * letters.length)];
    }
    let part2 = "";
    for (let i = 0; i < 4; i++) {
      part2 += Math.floor(Math.random() * 10);
    }
    return part1 + part2; // contoh: aZkRt4932
  }

  function loadCartSafe() {
    try {
      const key = userKey("cart");
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch (e) {
      return [];
    }
  }
  function saveOrdersLocally(arr) {
    try {
      const key = userKey("orders");
      localStorage.setItem(
        key,
        JSON.stringify(arr || [])
      );
    } catch (e) {}
  }
  function loadOrdersLocal() {
    try {
      const key = userKey("orders");
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch (e) {
      return [];
    }
  }

  // build a minimal order object from cart
  function buildOrderFromCart() {
    const cart = loadCartSafe();
    if (!cart.length) return null;

    let total = 0;
    const items = cart.map((it) => {
      const unit = Number(it.unitPrice || it.price || 0);
      const qty = Number(it.qty || 1);
      const subtotal = Number(
        it.subtotal || unit * qty || unit * qty
      );
      total += subtotal;
      return {
        id: it.id,
        title: it.title,
        qty: qty,
        unitPrice: unit,
        subtotal: subtotal,
        addons: it.addons || [],
        image:
          it.image || (it.images && it.images[0]) || "",
      };
    });

    return {
      id: genOrderId(),
      createdAt: Date.now(),
      status: "active",
      paymentStatus: "pending", // dibaca user & admin
      total: total,
      items: items,
    };
  }

  // CHECKOUT: simpan order ke localStorage per user + mirror ke Supabase + buka WA + redirect ke Orders
  document.addEventListener("click", async function (e) {
    const btn =
      e.target.closest && e.target.closest(".checkout");
    if (!btn) return;
    e.preventDefault();

    const order = buildOrderFromCart();
    if (!order) {
      alert(
        "Keranjang kosong. Tambahkan item dulu sebelum checkout."
      );
      return;
    }

    // tempel info user lokal
    const uid = localStorage.getItem("maziUID") || null;
    const email =
      localStorage.getItem("maziEmail") || "";
    const name =
      localStorage.getItem("maziName") || "";

    order.userId = uid;
    order.userEmail = email;
    order.userName = name;

    // 🟢 1) Supabase mirror (jika client tersedia & user login)
    if (supabase) {
      try {
        const { data: userData, error: userErr } =
          await supabase.auth.getUser();
        if (!userErr && userData?.user) {
          const supaUser = userData.user;

          const { data: insertedOrder, error: orderError } =
            await supabase
              .from("orders")
              .insert({
                user_id: supaUser.id,
                client_order_id: order.id,
                status: "active",
                is_gift: false,
                scheduled_at: null,
                total: order.total,
                shipping_fee: 0,
                payment_status: order.paymentStatus,
                delivery_method: null,
                notes: null,
                recipient_name: null,
                recipient_phone: null,
                recipient_address: null,
              })
              .select("id")
              .single();

          if (orderError) {
            console.warn(
              "Supabase orders insert error (bagfr):",
              orderError
            );
          } else if (insertedOrder) {
            const itemsPayload = order.items.map(
              (item) => ({
                order_id: insertedOrder.id,
                product_id: item.id
                  ? String(item.id)
                  : null,
                title: item.title,
                qty: item.qty,
                unit_price: item.unitPrice,
                subtotal: item.subtotal,
                image_url: item.image || null,
                addons_json:
                  item.addons && item.addons.length
                    ? item.addons
                    : null,
              })
            );
            const { error: itemsError } = await supabase
              .from("order_items")
              .insert(itemsPayload);
            if (itemsError) {
              console.warn(
                "Supabase order_items insert error (bagfr):",
                itemsError
              );
            }
          }
        } else {
          console.warn(
            "Supabase getUser error / no user (bagfr), skip remote order save",
            userErr
          );
        }
      } catch (err) {
        console.warn(
          "Unexpected Supabase error during bag checkout:",
          err
        );
      }
    }

    // 🟡 2) save local copy (per user) — ini yang dibaca order.js kita sekarang
    const localOrders = loadOrdersLocal();
    localOrders.unshift(order);
    saveOrdersLocally(localOrders);

    // clear cart (per user)
    const cartKey = userKey("cart");
    localStorage.removeItem(cartKey);
    if (typeof window.renderCart === "function")
      window.renderCart();

    // WhatsApp
    const waNumber = "628118281416";
    const waText = `Halo mimin Mazi, tolong cek ongkir untuk pesanan ku dengan ID ${order.id}.`;
    const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(
      waText
    )}`;
    window.open(waUrl, "_blank");

    // redirect ke orders page
    window.location.href =
      "./order.html?order=" +
      encodeURIComponent(order.id);
  });

  // GIFT-TOGGLE: hanya boleh kalau cart tidak kosong
  document.addEventListener("click", function (e) {
    const tg =
      e.target.closest && e.target.closest(".gift-toggle");
    if (!tg) return;

    const cart = loadCartSafe();
    if (!cart.length) {
      try {
        tg.animate(
          [
            { transform: "scale(1)" },
            { transform: "scale(1.04)" },
            { transform: "scale(1)" },
          ],
          { duration: 180 }
        );
      } catch (err) {}
      alert(
        "Tambahkan dulu minimal 1 item ke Bag sebelum menjadikan pesanan sebagai hadiah 💝"
      );
      return;
    }

    const pressed =
      tg.getAttribute("aria-pressed") === "true";
    tg.setAttribute(
      "aria-pressed",
      pressed ? "false" : "true"
    );
    try {
      tg.animate(
        [
          { transform: "scale(1)" },
          { transform: "scale(1.06)" },
          { transform: "scale(1)" },
        ],
        { duration: 180 }
      );
    } catch (err) {}
    window.location.href = "gif.html";
  });
})(); // end checkout IIFE
