// ===== Checkout -> create order & redirect to order.html + WhatsApp (localStorage per user + Supabase mirror) =====
(function () {
  "use strict";

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
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    let part1 = "";
    for (let i = 0; i < 5; i++) {
      part1 += letters[Math.floor(Math.random() * letters.length)];
    }
    let part2 = "";
    for (let i = 0; i < 4; i++) {
      part2 += Math.floor(Math.random() * 10);
    }
    return part1 + part2;
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
      localStorage.setItem(key, JSON.stringify(arr || []));
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
      const subtotal = Number(it.subtotal || unit * qty || unit * qty);
      total += subtotal;
      return {
        id: it.id,
        title: it.title,
        qty: qty,
        unitPrice: unit,
        subtotal: subtotal,
        addons: it.addons || [],
        image: it.image || (it.images && it.images[0]) || "",
      };
    });

    return {
      id: genOrderId(),
      createdAt: Date.now(),
      status: "active",
      paymentStatus: "pending",
      total: total,
      items: items,
    };
  }

  // CHECKOUT: simpan order ke localStorage per user + mirror ke Supabase + buka WA + redirect ke Orders
  document.addEventListener("click", async function (e) {
    const btn = e.target.closest && e.target.closest(".checkout");
    if (!btn) return;
    e.preventDefault();

    const order = buildOrderFromCart();
    if (!order) {
      alert("Keranjang kosong. Tambahkan item dulu sebelum checkout.");
      return;
    }

    // tempel info user lokal
    const uid = localStorage.getItem("maziUID") || null;
    const email = localStorage.getItem("maziEmail") || "";
    const name = localStorage.getItem("maziName") || "";

    order.userId = uid;
    order.userEmail = email;
    order.userName = name;

    // 🟢 1) Supabase mirror (jika client tersedia & user login)
    try {
      const supabase = window.supabase;
      if (supabase) {
        const { data: userData, error: userErr } = await supabase.auth.getUser();

        if (!userErr && userData?.user) {
          const supaUser = userData.user;

          const { data: insertedOrder, error: orderError } = await supabase
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
            console.warn("Supabase orders insert error (bagfr):", orderError);
          } else if (insertedOrder) {
            const itemsPayload = order.items.map((item) => ({
              order_id: insertedOrder.id,
              product_id: item.id ? String(item.id) : null,
              title: item.title,
              qty: item.qty,
              unit_price: item.unitPrice,
              subtotal: item.subtotal,
              image_url: item.image || null,
              addons_json:
                item.addons && item.addons.length ? item.addons : null,
            }));
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
      }
    } catch (err) {
      console.warn("Unexpected Supabase error during bag checkout:", err);
    }

    // 🟡 2) save local copy (per user) — ini yang dibaca order.js kita sekarang
    const localOrders = loadOrdersLocal();
    localOrders.unshift(order);
    saveOrdersLocally(localOrders);

    // clear cart (per user)
    const cartKey = userKey("cart");
    localStorage.removeItem(cartKey);
    if (typeof window.renderCart === "function") window.renderCart();

    // WhatsApp
    const waNumber = "628118281416";
    const waText = `Halo mimin Mazi, tolong cek ongkir untuk pesanan ku dengan ID ${order.id}.`;
    const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(
      waText
    )}`;
    window.open(waUrl, "_blank");

    // redirect ke orders page
    window.location.href =
      "./order.html?order=" + encodeURIComponent(order.id);
  });

  // GIFT-TOGGLE: hanya boleh kalau cart tidak kosong
  document.addEventListener("click", function (e) {
    const tg = e.target.closest && e.target.closest(".gift-toggle");
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

    const pressed = tg.getAttribute("aria-pressed") === "true";
    tg.setAttribute("aria-pressed", pressed ? "false" : "true");
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
