// cekout.js — checkout page: localStorage + mirror ke Supabase (orders & order_items)

document.addEventListener("DOMContentLoaded", function () {
  "use strict";


  // ---- helpers ----
  const formatRp = (n) => {
    const num = Math.round(Number(n) || 0);
    const s = Math.abs(num).toString();
    const parts = [];
    for (let i = s.length - 1, cnt = 0; i >= 0; i--, cnt++) {
      parts.push(s[i]);
      if (cnt % 3 === 2 && i !== 0) parts.push(".");
    }
    const sign = num < 0 ? "-" : "";
    return sign + "Rp " + parts.reverse().join("") + ",00";
  };

  // 🔑 UID per user (sama konsep dengan bagfr.js & order.js)
  function getCurrentUID() {
    return localStorage.getItem("maziUID") || "guest";
  }
  function userKey(base) {
    const uid = getCurrentUID();
    return `${base}_${uid}`;
  }

  // Safe localStorage JSON helpers
  function safeParse(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch (e) {
      return [];
    }
  }
  function saveJSON(key, v) {
    localStorage.setItem(key, JSON.stringify(v || []));
  }

  // ⬇⬇⬇ PENTING: pakai key per user (cart_<uid>, orders_<uid>)
  function loadCart() {
    return safeParse(userKey("cart"));
  }
  function saveCart(c) {
    saveJSON(userKey("cart"), c);
  }
  function loadOrders() {
    return safeParse(userKey("orders"));
  }
  function saveOrders(arr) {
    saveJSON(userKey("orders"), arr);
  }

  function genOrderId() {
    return (
      "ORD-" +
      new Date().toISOString().slice(0, 10) +
      "-" +
      Math.random().toString(36).slice(2, 6).toUpperCase()
    );
  }

  // ---- safe html escape ----
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  // --- populate Schedule selects (Date / Month / Year) ---
  function populateScheduleSelectors({ yearsAhead = 5 } = {}) {
    const dateSel = document.querySelector('select[aria-label="Date"]');
    const monthSel = document.querySelector('select[aria-label="Month"]');
    const yearSel = document.querySelector('select[aria-label="Year"]');
    if (!dateSel || !monthSel || !yearSel) return;

    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    // clear
    dateSel.innerHTML = "";
    monthSel.innerHTML = "";
    yearSel.innerHTML = "";

    function opt(val, text) {
      const o = document.createElement("option");
      o.value = String(val);
      o.textContent = String(text);
      return o;
    }

    const now = new Date();
    const curYear = now.getFullYear();

    // months
    monthSel.appendChild(opt("", "Month"));
    months.forEach((m, i) => monthSel.appendChild(opt(i + 1, m)));

    // years
    yearSel.appendChild(opt("", "Year"));
    for (let y = curYear; y <= curYear + (Number(yearsAhead) || 5); y++) {
      yearSel.appendChild(opt(y, y));
    }

    function daysInMonth(y, mIndex) {
      return new Date(y, mIndex + 1, 0).getDate();
    }

    function refillDates() {
      const selMonth = Number(monthSel.value) || now.getMonth() + 1;
      const selYear = Number(yearSel.value) || curYear;
      const mIndex = selMonth - 1;
      const days = daysInMonth(selYear, mIndex);
      const prevValue = Number(dateSel.value) || now.getDate();

      dateSel.innerHTML = "";
      dateSel.appendChild(opt("", "Date"));
      for (let d = 1; d <= days; d++) dateSel.appendChild(opt(d, d));

      if (prevValue >= 1 && prevValue <= days) {
        dateSel.value = String(prevValue);
      } else if (
        selYear === curYear &&
        selMonth === now.getMonth() + 1
      ) {
        dateSel.value = String(now.getDate());
      } else {
        dateSel.value = "1";
      }
    }

    monthSel.value = String(now.getMonth() + 1);
    yearSel.value = String(curYear);
    refillDates();

    monthSel.addEventListener("change", refillDates);
    yearSel.addEventListener("change", refillDates);
  }

  // ---- DOM refs ----
  const productList = document.querySelector(".product-list");
  const subtotalEl = document.getElementById("subtotalRp");
  const shippingEl = document.getElementById("shippingFee");
  const totalEl = document.getElementById("totalRp");
  const deliveryBtns = Array.from(
    document.querySelectorAll(".delivery-item")
  );
  const deliveryRow = document.getElementById("deliveryRow");

  const useSavedBtn = document.getElementById("btnUseSavedAddress");
  if (useSavedBtn) {
    useSavedBtn.addEventListener("click", function () {
      window.location.href = "drafamt.html?from=checkout";
    });
  }

  const recipientInput = document.getElementById("recipient");
  try {
    const draft = localStorage.getItem("checkoutRecipientDraft_v1");
    if (recipientInput && draft) {
      recipientInput.value = draft;
      localStorage.removeItem("checkoutRecipientDraft_v1");
    }
  } catch (e) {}

  if (!productList || !subtotalEl || !shippingEl || !totalEl) {
    console.warn("cekout: required elements not found");
    return;
  }

  // ---- render product summary from cart ----
  function renderProductsFromCart() {
    const cart = loadCart();
    productList.innerHTML = "";

    if (!cart || !cart.length) {
      const li = document.createElement("li");
      li.className = "product-item";
      li.innerHTML = `<div class="product-info"><div class="product-title">Keranjang kosong</div><div class="product-meta muted">Tambahkan produk dari keranjang</div></div>`;
      productList.appendChild(li);
      calcSubtotal();
      return;
    }

    cart.forEach((it, index) => {
      const unit = Number(it.unitPrice || it.price || 0);
      const qty = Math.max(0, Number(it.qty || 1));

      const li = document.createElement("li");
      li.className = "product-item";
      li.dataset.cartIdx = index;

      const source = it.source ? `${it.source} • ` : "";
      const metaPrice = formatRp(unit);

      li.innerHTML = `
        <div class="product-info">
          <div class="product-title">${escapeHtml(
            it.title || "Untitled"
          )}</div>
          <div class="product-meta">${escapeHtml(
            source
          )}${metaPrice}</div>
        </div>
        <div class="qty-control" data-price="${unit}">
          <button class="qty-btn dec" aria-label="Decrease">−</button>
          <input class="qty-input" type="text" inputmode="numeric" value="${qty}" aria-label="Quantity">
          <button class="qty-btn inc" aria-label="Increase">+</button>
        </div>
      `;
      productList.appendChild(li);

      const dec = li.querySelector(".dec");
      const inc = li.querySelector(".inc");
      const input = li.querySelector(".qty-input");

      dec.addEventListener("click", () => {
        let v = Number(input.value) || 0;
        v = Math.max(0, v - 1);
        input.value = String(v);
        updateCartQtyFromUI(index, v);
      });

      inc.addEventListener("click", () => {
        let v = Number(input.value) || 0;
        v = v + 1;
        input.value = String(v);
        updateCartQtyFromUI(index, v);
      });

      input.addEventListener("input", () => {
        input.value = input.value.replace(/[^\d]/g, "");
        if (input.value === "") input.value = "0";
        const v = Number(input.value);
        updateCartQtyFromUI(index, v);
      });
    });
  }

  function updateCartQtyFromUI(idx, qty) {
    const cart = loadCart();
    if (!cart || !cart[idx]) {
      calcSubtotal();
      return;
    }

    cart[idx].qty = Number(qty || 0);
    cart[idx].subtotal =
      Number(cart[idx].unitPrice || cart[idx].price || 0) *
      Number(cart[idx].qty || 0);

    if (cart[idx].qty <= 0) {
      cart.splice(idx, 1);
    }

    saveCart(cart);
    renderProductsFromCart();
    calcSubtotal();
  }

  deliveryBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      deliveryBtns.forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      if (typeof btn.scrollIntoView === "function")
        btn.scrollIntoView({
          behavior: "smooth",
          inline: "center",
          block: "nearest",
        });
      calcSubtotal();
    });
  });

  function calcSubtotal() {
    const cart = loadCart();
    let totalItems = 0;
    let totalPrice = 0;

    if (Array.isArray(cart)) {
      cart.forEach((it) => {
        const price = Number(it.unitPrice || it.price || 0);
        const qty = Math.max(0, Number(it.qty || 0));
        totalPrice += price * qty;
        totalItems += qty;
      });
    }

    const activeMethod =
      document.querySelector(".delivery-item.active")?.dataset.method ||
      "regular";
    let baseOngkir = 15000;
    switch (activeMethod) {
      case "regular":
        baseOngkir = 15000;
        break;
      case "nextday":
        baseOngkir = 20000;
        break;
      case "sameday":
        baseOngkir = 30000;
        break;
      case "instant":
        baseOngkir = 50000;
        break;
      case "self":
        baseOngkir = 5000;
        break;
      default:
        baseOngkir = 15000;
        break;
    }

    const kelipatan =
      totalItems > 0 ? Math.max(1, Math.ceil(totalItems / 5)) : 1;
    const shippingFee = baseOngkir * kelipatan;
    const grandTotal = totalPrice + shippingFee;

    if (subtotalEl) subtotalEl.textContent = formatRp(totalPrice);
    if (shippingEl) shippingEl.textContent = formatRp(shippingFee);
    if (totalEl) totalEl.textContent = formatRp(grandTotal);
  }






  // ---- Place Order: create scheduled order and redirect ----
  // ---- Place Order: create scheduled order and redirect ----
  const placeOrderBtn = document.getElementById('placeOrder');
  if (placeOrderBtn) {
    placeOrderBtn.addEventListener('click', async function () {
      const cart = loadCart();
      if (!cart || !cart.length) {
        alert('Keranjang kosong — tidak ada yang dipesan.');
        return;
      }

      // jadwal (optional)
      let scheduledAt = null;
      try {
        const dateSel  = document.querySelector('select[aria-label="Date"]');
        const monthSel = document.querySelector('select[aria-label="Month"]');
        const yearSel  = document.querySelector('select[aria-label="Year"]');
        const dateVal  = dateSel?.value || '';
        const monthVal = monthSel?.value || '';
        const yearVal  = yearSel?.value || '';

        const d = Number(dateVal);
        const y = Number(yearVal);

        if (!isNaN(d) && !isNaN(y) && monthVal) {
          const monthMap = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
          let mIndex = Number(monthVal);
          if (isNaN(mIndex)) {
            const mm = String(monthVal).trim().slice(0,3).toLowerCase();
            mIndex = monthMap[mm] || NaN;
          }
          if (!isNaN(mIndex)) {
            const isoDate = new Date(y, mIndex - 1, d, 9, 0, 0);
            if (!isNaN(isoDate.getTime())) scheduledAt = isoDate.toISOString();
          }
        }
      } catch (e) {}

      const notes     = document.getElementById('notes')?.value?.trim()     || '';
      const recipient = document.getElementById('recipient')?.value?.trim() || '';

      // compute totals again
      let totalPrice = 0;
      cart.forEach(it => {
        totalPrice += Number(
          it.subtotal ||
          (Number(it.unitPrice || it.price || 0) * Number(it.qty || 0)) ||
          0
        );
      });

      const selectedDelivery = document.querySelector('.delivery-item.active')?.dataset.method || 'regular';
      let baseOngkir = 15000;
      switch (selectedDelivery) {
        case 'regular': baseOngkir = 15000; break;
        case 'nextday': baseOngkir = 20000; break;
        case 'sameday': baseOngkir = 30000; break;
        case 'instant': baseOngkir = 50000; break;
        case 'self':    baseOngkir = 5000;  break;
      }
      const totalItems = cart.reduce((s, it) => s + (Number(it.qty || 0)), 0);
      const kelipatan  = Math.max(1, Math.ceil(totalItems / 5));
      const shippingFee= baseOngkir * kelipatan;
      const grandTotal = Number(totalPrice) + Number(shippingFee);

      // gift config (optional)
      let giftConfig = null;
      try {
        giftConfig = JSON.parse(localStorage.getItem('giftConfig_v1') || 'null');
      } catch (e) {
        giftConfig = null;
      }
      const isGift = !!(giftConfig && giftConfig.type === 'gift');

      const order = {
        id: genOrderId(),
        createdAt: Date.now(),
        status: 'scheduled',
        scheduledAt: scheduledAt,
        total: grandTotal,
        shippingFee: shippingFee,
        items: cart.map(it => ({
          id: it.id,
          title: it.title,
          qty: Number(it.qty || 1),
          unitPrice: Number(it.unitPrice || it.price || 0),
          subtotal: Number(
            it.subtotal ||
            (Number(it.unitPrice || it.price || 0) * Number(it.qty || 1))
          ),
          addons: it.addons || [],
          image: it.image || (it.images && it.images[0]) || ''
        })),
        meta: {
          notes: notes,
          recipient: recipient,
          deliveryMethod: selectedDelivery
        },
        paymentStatus: 'pending'
      };

      if (isGift) {
        order.isGift = true;
        order.gift = {
          message:   giftConfig.message   || '',
          fromName:  giftConfig.fromName  || '',
          revealMode:giftConfig.revealMode|| 'reveal',
          theme:     giftConfig.theme     || null
        };
      }

      // 🟢 Mirror ke Supabase
      try {
        const supabase = window.supabase;
        if (supabase) {
          const { data: userData, error: userErr } = await supabase.auth.getUser();
          if (!userErr && userData?.user) {
            const supaUser = userData.user;
            const { data: insertedOrder, error: orderError } = await supabase
              .from('orders')
              .insert({
                user_id: supaUser.id,
                client_order_id: order.id,
                status: 'scheduled',
                is_gift: isGift,
                scheduled_at: scheduledAt,
                total: order.total,
                shipping_fee: order.shippingFee,
                payment_status: order.paymentStatus,
                delivery_method: selectedDelivery,
                notes: notes || null,
                recipient_name: recipient || null,
                recipient_phone: null,
                recipient_address: null,
              })
              .select('id')
              .single();

            if (orderError) {
              console.warn('Supabase orders insert error (cekout):', orderError);
            } else if (insertedOrder) {
              const itemsPayload = order.items.map(item => ({
                order_id: insertedOrder.id,
                product_id: item.id ? String(item.id) : null,
                title: item.title,
                qty: item.qty,
                unit_price: item.unitPrice,
                subtotal: item.subtotal,
                image_url: item.image || null,
                addons_json: item.addons && item.addons.length ? item.addons : null,
              }));
              const { error: itemsError } = await supabase
                .from('order_items')
                .insert(itemsPayload);
              if (itemsError) {
                console.warn('Supabase order_items insert error (cekout):', itemsError);
              }
            }
          } else {
            console.warn('Supabase getUser error / no user (cekout), skip remote order save', userErr);
          }
        }
      } catch (err) {
        console.warn('Unexpected Supabase error during scheduled checkout:', err);
      }

      // 🟡 SIMPAN KE LOCAL (tetap sama seperti dulu)
      // 🟡 SIMPAN KE LOCAL (tetap sama seperti dulu)
      const orders = loadOrders();
      orders.unshift(order);
      saveOrders(orders);

      // 👇 TAMBAHKAN LOGGING INI
      const uid = getCurrentUID();
      const key = userKey('orders');
      console.log('✅ ORDER SAVED!');
      console.log('UID:', uid);
      console.log('Key:', key);
      console.log('Order ID:', order.id);
      console.log('Total orders:', orders.length);

      // clear cart & gift config (per user)
      try { localStorage.removeItem(userKey('cart')); } catch (e) {}
      try { localStorage.removeItem('giftConfig_v1'); } catch (e) {}

      // WhatsApp + redirect (tetap sama)
      try {
        const waNumber = '628118281416';
        let waText = '';

        if (isGift) {
          const tgl = scheduledAt
            ? new Date(scheduledAt).toLocaleString('id-ID')
            : '(tanpa jadwal)';
          waText =
            `Halo mimin Mazi, ini pesanan GIFT terjadwal dengan ID ${order.id}. ` +
            `Mohon dibantu proses untuk jadwal ${tgl}.`;
        } else {
          waText =
            `Halo mimin Mazi, tolong proses pesanan terjadwal saya dengan ID ${order.id}.`;
        }

        const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`;

        const overlay = document.getElementById('ddno-overlay');
        const logo    = document.getElementById('ddno-logo');

        if (overlay) {
          overlay.classList.add('show');
        }
        if (logo) {
          logo.classList.remove('show');
          setTimeout(() => {
            logo.classList.add('show');
          }, 50);
        }

        setTimeout(() => {
          try {
            window.open(waUrl, '_blank');
          } catch (err) {
            console.warn('Failed to open WhatsApp', err);
          }

          window.location.href =
            './order.html?order=' + encodeURIComponent(order.id);
        }, 1500);
      } catch (e) {
        console.warn('Failed to prepare WhatsApp redirect', e);
        window.location.href =
          './order.html?order=' + encodeURIComponent(order.id);
      }
    });
  }


  // init
  populateScheduleSelectors({ yearsAhead: 5 });
  renderProductsFromCart();
  calcSubtotal();
});
