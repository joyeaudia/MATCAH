// drsi.js — drinks detail: per-user cart + orders + likes + share + options
(async function () {
  'use strict';

  /* ========== Helpers umum ========== */
  const q  = s => document.querySelector(s);
  const qa = s => Array.from(document.querySelectorAll(s));

  const formatPrice = n =>
    'Rp ' + new Intl.NumberFormat('id-ID').format(Number(n) || 0);

  const intVal = v =>
    Number(String(v || '').replace(/[^\d]/g, '')) || 0;

  const getIdFromUrl = () =>
    new URLSearchParams(location.search).get('id');

  // 🔑 identitas user (dipakai cart, orders, likes)
  const getCurrentUID = () => localStorage.getItem('maziUID') || 'guest';
  const userKey       = base => `${base}_${getCurrentUID()}`;
  const likesKey      = () => userKey('likes');

  /* ========== Load products (drsi.json/dsri.json/products.json) ========== */
  async function loadProducts() {
    const urls = [
      'drsi.json', 'dsri.json', 'products.json',
      '/drsi.json', '/products.json', '/dsri.json'
    ];
    for (const u of urls) {
      try {
        const res = await fetch(u, { cache: 'no-store' });
        if (!res.ok) continue;
        const json = await res.json();
        if (Array.isArray(json)) return json;
      } catch (e) {
        // coba url berikutnya
      }
    }
    throw new Error('products file not found (drsi.json/products.json)');
  }

  /* ========== Render produk minuman ke DOM ========== */
  function renderProduct(product) {
    const nameEl  = q('.product-name');
    const subEl   = q('.product-subtitle');
    const priceEl = q('#product-price');
    const imgEl   = q('.product-image');
    const descEl  = q('#detail-desc');
    const qtyEl   = q('#quantity');

    if (nameEl) {
      nameEl.textContent   = product.title || '';
      nameEl.dataset.id    = product.id || '';
      nameEl.dataset.source = product.source || 'drsi';
    }
    if (subEl) subEl.textContent = product.subtitle || '';

    const basePrice = Number(product.price || 0);
    window.productBasePrice = basePrice;

    if (priceEl) {
      priceEl.dataset.base = basePrice;
      priceEl.textContent  = formatPrice(basePrice);
      priceEl.setAttribute('aria-live', 'polite');
    }

    if (imgEl) {
      const src = (product.images && product.images[0]) || '';
      const alt = product.title || '';
      if (imgEl.tagName && imgEl.tagName.toLowerCase() === 'img') {
        imgEl.src = src;
        imgEl.alt = alt;
      } else {
        imgEl.innerHTML = `<img src="${src}" alt="${alt}" />`;
      }
    }

    if (descEl) {
      if (Array.isArray(product.description)) {
        descEl.innerHTML = product.description.join('<br><br>');
      } else {
        descEl.innerHTML = product.description || '';
      }
    }

    if (qtyEl && (!qtyEl.value || Number(qtyEl.value) <= 0)) {
      qtyEl.value = 1;
    }
  }

  /* ========== Option / price logic (milk + addons) ========== */
  function attachOptionLogic() {
    const priceEl = q('#product-price');

    function readButtonPrice(btn) {
      const p = btn.dataset.price ??
                btn.dataset.priceDelta ??
                btn.getAttribute('data-price-delta') ??
                btn.getAttribute('data-price');
      return intVal(p);
    }

    function updatePriceFromUI() {
      const base =
        intVal(priceEl?.dataset.base || window.productBasePrice || 0);
      let total = base;

      // grup milk => satu yang aktif
      const milkSel = document.querySelector(
        '.option-group[data-key="milk"] button[aria-pressed="true"]'
      );
      if (milkSel) total += readButtonPrice(milkSel);

      // addons => bisa banyak
      document
        .querySelectorAll('.option-group[data-key="addons"] button[aria-pressed="true"]')
        .forEach(b => {
          total += readButtonPrice(b);
        });

      if (priceEl) priceEl.textContent = formatPrice(total);
      const priceDisplay = document.getElementById('price-display');
      if (priceDisplay) priceDisplay.textContent = formatPrice(total);
    }

    // inisialisasi tombol
    document.querySelectorAll('.option-group').forEach(group => {
      const buttons = Array.from(group.querySelectorAll('button'));
      const isAddon = (group.dataset.key === 'addons');

      buttons.forEach(btn => {
        if (!btn.hasAttribute('aria-pressed')) {
          btn.setAttribute('aria-pressed', 'false');
        }

        btn.addEventListener('click', () => {
          if (isAddon) {
            const cur = btn.getAttribute('aria-pressed') === 'true';
            btn.setAttribute('aria-pressed', (!cur).toString());
          } else {
            buttons.forEach(b => b.setAttribute('aria-pressed', 'false'));
            btn.setAttribute('aria-pressed', 'true');
          }
          updatePriceFromUI();
        });

        btn.addEventListener('keydown', ev => {
          if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
            ev.preventDefault();
            btn.click();
          }
        });
      });
    });

    window.updatePriceFromUI = updatePriceFromUI;
    setTimeout(updatePriceFromUI, 40);
  }

  /* ========== Init: load product drinks + normalize id (drsi-xxxx) ========== */
  try {
    const rawId  = getIdFromUrl();
    const source = 'drsi';

    if (!rawId) {
      console.error('No product id in URL (?id=...)');
    } else {
      const products = await loadProducts();

      const normalizedProducts = (products || []).map(p => {
        const raw = String(p.id || p._id || p.code || '');
        const fullId = raw && !raw.startsWith(source + '-')
          ? `${source}-${raw}`
          : raw;
        return { ...p, id: fullId, source };
      });

      const searchId = rawId && !rawId.startsWith(source + '-')
        ? `${source}-${rawId}`
        : rawId;

      const product = normalizedProducts.find(p => p.id === searchId);
      if (!product) {
        console.error('Product not found for id:', rawId);
      } else {
        renderProduct(product);
      }
    }
  } catch (err) {
    console.error('Error loading product:', err);
  }

  // option logic jalan setelah DOM siap
  attachOptionLogic();




  /* ========== Likes (❤) per user: disimpan ke likes_<UID> ========== */
 // ===== Heart (Like) handler: per-user likes_<UID> =====
(function () {
  const heartBtn = document.querySelector('.heart');
  if (!heartBtn) return;

  // --- helper per user ---
  const getCurrentUID = () => localStorage.getItem('maziUID') || 'guest';
  const likesKey = () => 'likes_' + getCurrentUID();

  function loadLikes() {
    try {
      return JSON.parse(localStorage.getItem(likesKey()) || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveLikes(arr) {
    localStorage.setItem(likesKey(), JSON.stringify(arr || []));
  }

  // mini toast
  function miniToast(msg) {
    let t = document.querySelector('.mini-toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'mini-toast';
      Object.assign(t.style, {
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: '28px',
        background: '#111',
        color: '#fff',
        padding: '8px 12px',
        borderRadius: '8px',
        zIndex: 1600,
        opacity: 0,
        transition: 'opacity .18s'
      });
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    setTimeout(() => (t.style.opacity = '0'), 1300);
  }

  // build object yang disimpan ke likes
  function makeLikeObj() {
    const idRaw =
      document.querySelector('.product-name')?.dataset?.id ||
      new URLSearchParams(location.search).get('id') ||
      '';

    const source = 'drsi';
    const id =
      idRaw && !String(idRaw).startsWith(source + '-')
        ? source + '-' + idRaw
        : String(idRaw);

    const title =
      document.querySelector('.product-name')?.textContent?.trim() ||
      document.title ||
      '';

    // cari gambar dengan beberapa kemungkinan selector
    let imgEl =
      document.querySelector('.product-image img') ||
      document.querySelector('.product-image') ||
      null;

    let imgSrc = '';
    if (imgEl) {
      if (
        imgEl.tagName &&
        imgEl.tagName.toLowerCase() === 'img'
      ) {
        imgSrc = imgEl.src || imgEl.getAttribute('src') || '';
      } else if (imgEl.querySelector) {
        const inner = imgEl.querySelector('img');
        if (inner)
          imgSrc = inner.src || inner.getAttribute('src') || '';
      }
    }

    try {
      if (imgSrc) {
        imgSrc = new URL(imgSrc, location.href).href;
      }
    } catch (e) {}

    const price = Number(
      document.getElementById('product-price')?.dataset?.base || 0
    );

    return {
      id,
      source,
      title,
      image: imgSrc || '',
      price
    };
  }

  heartBtn.addEventListener('click', function (e) {
    e.preventDefault();

    const pressed = heartBtn.getAttribute('aria-pressed') === 'true';
    heartBtn.setAttribute('aria-pressed', String(!pressed));

    // animasi kecil
    try {
      heartBtn.animate(
        [
          { transform: 'scale(1)' },
          { transform: 'scale(1.12)' },
          { transform: 'scale(1)' }
        ],
        { duration: 220 }
      );
    } catch (e) {}

    let likes = loadLikes();
    const obj = makeLikeObj();
    if (!obj.id) {
      miniToast('Tidak dapat menyukai item ini');
      return;
    }

    const idx = likes.findIndex(x => String(x.id) === String(obj.id));

    if (!pressed) {
      // tambah
      if (idx === -1) likes.unshift(obj);
      saveLikes(likes);
      miniToast('Ditambahkan ke Liked');
    } else {
      // hapus
      if (idx > -1) likes.splice(idx, 1);
      saveLikes(likes);
      miniToast('Dihapus dari Liked');
    }

    window.dispatchEvent(
      new CustomEvent('likes:updated', { detail: { likes } })
    );
  });
})();



  /* ========== ADD TO BAG (per user, cart_<UID>) ========== */
  (function () {
    const num = v =>
      Number(String(v || 0).replace(/[^\d]/g, '')) || 0;

    function readOptions() {
      const addons = [];

      // button-style (milk & addons, dll)
      qa('.option-group button[aria-pressed="true"]').forEach(btn => {
        const id =
          btn.dataset.choiceId ||
          btn.dataset.id ||
          btn.getAttribute('data-id') ||
          btn.textContent.trim();
        const label = btn.dataset.label || btn.textContent.trim();
        const price = num(
          btn.dataset.price ??
          btn.dataset.priceDelta ??
          btn.getAttribute('data-price-delta')
        );
        addons.push({
          id: String(id).replace(/_/g, '-'),
          label: label.trim(),
          price
        });
      });

      // inputs/selects di dalam #product-options (kalau ada)
      const cont = document.getElementById('product-options');
      if (cont) {
        cont.querySelectorAll('input').forEach(inp => {
          if (inp.disabled) return;
          if (
            (inp.type === 'checkbox' && inp.checked) ||
            (inp.type === 'radio' && inp.checked)
          ) {
            const id =
              inp.dataset.choiceId ||
              inp.id ||
              (inp.name + '_' + inp.value);
            const label =
              inp.dataset.label ||
              cont
                .querySelector(`label[for="${inp.id}"]`)
                ?.textContent?.trim() ||
              id;
            const price = num(
              inp.dataset.price || inp.getAttribute('data-price') || 0
            );
            addons.push({
              id: String(id).replace(/_/g, '-'),
              label: label.trim(),
              price
            });
          }
        });

        cont.querySelectorAll('select').forEach(sel => {
          const opt = sel.options[sel.selectedIndex];
          if (opt && !opt.disabled) {
            const price = num(
              opt.dataset.price || opt.getAttribute('data-price') || 0
            );
            addons.push({
              id: (sel.name || sel.id) + '_' + (opt.value || opt.text),
              label: opt.text || opt.value,
              price
            });
          }
        });
      }

      return addons;
    }

    function compute(base, qty, addons) {
      const addTotal = (addons || []).reduce(
        (s, a) => s + Number(a.price || 0),
        0
      );
      const unit = Number(base || 0) + addTotal;
      return {
        unit,
        subtotal: unit * Math.max(1, Number(qty || 1)),
        addTotal
      };
    }

    function loadCart() {
      try {
        const key = userKey('cart');
        return JSON.parse(localStorage.getItem(key) || '[]');
      } catch (e) {
        return [];
      }
    }

    function saveCart(c) {
      const key = userKey('cart');
      localStorage.setItem(key, JSON.stringify(c || []));
    }

    function merge(cart, item) {
      const sig = it =>
        (it.addons || [])
          .map(a => a.id)
          .sort()
          .join('|');
      const s = sig(item);
      for (let i = 0; i < cart.length; i++) {
        if (cart[i].id === item.id && sig(cart[i]) === s) {
          cart[i].qty =
            Number(cart[i].qty || 1) + Number(item.qty || 1);
          cart[i].subtotal =
            Number(cart[i].subtotal || 0) +
            Number(item.subtotal || 0);
          return cart;
        }
      }
      cart.push(item);
      return cart;
    }

    function toast(msg = 'Added to bag') {
      let t = document.querySelector('.mini-toast');
      if (!t) {
        t = document.createElement('div');
        t.className = 'mini-toast';
        t.style.cssText =
          'position:fixed;left:50%;transform:translateX(-50%);bottom:28px;' +
          'background:#111;color:#fff;padding:8px 12px;border-radius:8px;' +
          'z-index:1600;opacity:0;transition:opacity .18s';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.style.opacity = '1';
      setTimeout(() => (t.style.opacity = '0'), 1200);
    }

    function addToBag(goToBag = true) {
      const nameEl = q('.product-name');
      const idRaw =
        nameEl?.dataset?.id ||
        new URLSearchParams(location.search).get('id');
      const source = nameEl?.dataset?.source || 'drsi';
      const id = idRaw && !idRaw.startsWith(source + '-')
        ? `${source}-${idRaw}`
        : idRaw;

      const title =
        (nameEl?.textContent ||
          q('.product-title')?.textContent ||
          '').trim();

      const base = num(
        q('#product-price')?.dataset?.base ||
        q('#product-price')?.textContent
      );
      const qty = Number(q('#quantity')?.value || 1);

      if (!id) {
        console.warn('no product id');
        return false;
      }

      const addons  = readOptions();
      const pricing = compute(base, qty, addons);

      const productImageEl = q('.product-image');
      const imageSrc =
        productImageEl &&
        productImageEl.tagName &&
        productImageEl.tagName.toLowerCase() === 'img'
          ? productImageEl.src
          : q('.product-image img')?.src || '';

      const item = {
        id: String(id),
        source,
        title,
        unitPrice: Number(pricing.unit || 0),
        qty: Number(qty || 1),
        addons: Array.isArray(addons) ? addons : [],
        subtotal: Number(pricing.subtotal || 0),
        image: imageSrc || ''
      };

      let cart = loadCart();
      cart = merge(cart, item);
      saveCart(cart);

      toast('Item added to bag');

      if (goToBag) {
        setTimeout(() => (window.location.href = 'bagfr.html'), 450);
      }
      return true;
    }

    document.addEventListener('click', e => {
      const btn =
        e.target.closest &&
        e.target.closest('.add-btn, [data-add-to-bag]');
      if (!btn) return;
      e.preventDefault();
      const noRedirect = btn.hasAttribute('data-no-redirect');
      addToBag(!noRedirect);
    });

    window.addToBagFromPage = addToBag;
    window.addToBag         = addToBag;
  })();

  /* ========== Checkout langsung dari drinks page (opsional, per user) ========== */
  (function () {
    const fmt = n =>
      'Rp ' + new Intl.NumberFormat('id-ID').format(Number(n || 0));

    function loadCart() {
      try {
        const key = userKey('cart');
        return JSON.parse(localStorage.getItem(key) || '[]');
      } catch (e) {
        return [];
      }
    }

    function saveOrders(arr) {
      const key = userKey('orders');
      localStorage.setItem(key, JSON.stringify(arr || []));
    }

    function loadOrders() {
      try {
        const key = userKey('orders');
        return JSON.parse(localStorage.getItem(key) || '[]');
      } catch (e) {
        return [];
      }
    }

    function genId() {
      return (
        'ORD-' +
        new Date().toISOString().slice(0, 10) +
        '-' +
        Math.random().toString(36).slice(2, 6)
      );
    }

    function buildMsg(order) {
      const lines = [];
      lines.push(`📦 New Order — ${order.id}`);
      lines.push(
        `Waktu: ${new Date(order.createdAt).toLocaleString('id-ID')}`
      );
      lines.push('');
      order.items.forEach(it => {
        const addon = (it.addons || [])
          .map(a => `${a.label} (+${fmt(a.price)})`)
          .join(', ');
        lines.push(
          `• ${it.title} x${it.qty} — ${fmt(it.unitPrice)} ${
            addon ? ' | ' + addon : ''
          } = ${fmt(it.subtotal)}`
        );
      });
      lines.push('');
      lines.push(`Total: ${fmt(order.total)}`);
      lines.push('');
      lines.push('Nama:');
      lines.push('No. HP:');
      lines.push('Alamat / Catatan:');
      lines.push('');
      lines.push(
        'Mohon konfirmasi ketersediaan & instruksi pembayaran via chat. Terima kasih!'
      );
      return lines.join('\n');
    }

    document.addEventListener('click', e => {
      if (!e.target.closest) return;
      const btn = e.target.closest('.checkout, [data-checkout]');
      if (!btn) return;
      e.preventDefault();

      const cart = loadCart();
      if (!cart.length) {
        alert('Keranjang kosong');
        return;
      }

      let total = 0;
      const items = cart.map(it => {
        total += Number(it.subtotal || 0);
        return {
          id: it.id,
          title: it.title,
          qty: it.qty,
          unitPrice: it.unitPrice,
          addons: it.addons || [],
          subtotal: it.subtotal
        };
      });

      const order = {
        id: genId(),
        createdAt: Date.now(),
        status: 'active',
        items,
        total
      };

      const orders = loadOrders();
      orders.unshift(order);
      saveOrders(orders);

      const waUrl =
        'https://api.whatsapp.com/send?text=' +
        encodeURIComponent(buildMsg(order));
      window.open(waUrl, '_blank');

      window.location.href =
        'order.html?order=' + encodeURIComponent(order.id);
    });
  })();

  /* ========== Share menu (copy link / native share) ========== */
  (function () {
    const shareBtn   = document.getElementById('share-btn');
    const shareMenu  = document.getElementById('share-menu');
    const shareToast = document.getElementById('share-toast');
    const shareClose = document.getElementById('share-close');

    if (!shareBtn || !shareMenu) return;

    const shareUrl = window.location.href;

    function showMenu() {
      shareMenu.style.display = 'block';
      shareMenu.setAttribute('aria-hidden', 'false');
    }
    function hideMenu() {
      shareMenu.style.display = 'none';
      shareMenu.setAttribute('aria-hidden', 'true');
    }
    function showToast(msg = 'Link copied!') {
      if (!shareToast) return;
      shareToast.textContent = msg;
      shareToast.hidden = false;
      setTimeout(() => (shareToast.hidden = true), 1600);
    }

    async function copyLink() {
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Link disalin ke clipboard');
      } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = shareUrl;
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          showToast('Link disalin ke clipboard');
        } catch (err) {
          alert('Copy failed. Link: ' + shareUrl);
        }
        document.body.removeChild(ta);
      }
      hideMenu();
    }

    async function nativeShare() {
      if (navigator.share) {
        try {
          await navigator.share({
            title: document.title || 'Check this product',
            text: 'Lihat produk ini:',
            url: shareUrl
          });
        } catch (err) {}
      } else {
        const wa =
          'https://api.whatsapp.com/send?text=' +
          encodeURIComponent(shareUrl);
        window.open(wa, '_blank');
      }
      hideMenu();
    }

    shareBtn.addEventListener('click', e => {
      e.stopPropagation();
      showMenu();
    });
    shareClose?.addEventListener('click', hideMenu);

    shareMenu.addEventListener('click', e => {
      const act = e.target.getAttribute('data-action');
      if (!act) return;
      if (act === 'copy') copyLink();
      if (act === 'native') nativeShare();
    });

    document.addEventListener('click', ev => {
      if (!shareMenu.contains(ev.target) && ev.target !== shareBtn) {
        hideMenu();
      }
    });
  })();
})(); // end drsi.js
