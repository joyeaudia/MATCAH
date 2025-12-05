// dsri.js — dynamic loader + options + price logic + like + addToBag (per user, source='dsri')
(async function () {
  'use strict';

  /* =========== Helpers umum =========== */
  const q = s => document.querySelector(s);
  const qa = s => Array.from(document.querySelectorAll(s));
  const formatPrice = n => 'Rp ' + new Intl.NumberFormat('id-ID').format(Number(n) || 0);
  const intVal = v => Number(String(v || '').replace(/[^\d]/g, '')) || 0;
  const getIdFromUrl = () => new URLSearchParams(location.search).get('id');

  // element creator helper
  function el(tag, attrs = {}) {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'class') e.className = v;
      else e.setAttribute(k, String(v));
    });
    return e;
  }

  // 🔑 helper identitas user (dipakai cart, orders, likes)
  const getCurrentUID = () => localStorage.getItem('maziUID') || 'guest';
  const userKey = base => `${base}_${getCurrentUID()}`;
  const likesKey = () => userKey('likes');

  /* ========================= Load products JSON (dsri) ========================= */
  async function loadProducts() {
    const urls = ['dsri.json', 'products.json', '/dsri.json', '/products.json'];
    for (const u of urls) {
      try {
        const res = await fetch(u, { cache: 'no-store' });
        if (!res.ok) continue;
        const json = await res.json();
        if (Array.isArray(json)) return json;
      } catch (e) { /* ignore and try next */ }
    }
    throw new Error('products file not found (tried dsri.json/products.json)');
  }

  /* ====================== Render product into DOM ====================== */
  function renderProduct(product) {
    const nameEl = q('.product-name');
    const subEl = q('.product-subtitle');
    const priceEl = q('#product-price');
    const imgEl = q('.product-image');
    const descEl = q('#detail-desc');
    const qtyEl = q('#quantity');

    if (nameEl) {
      nameEl.textContent = product.title || '';
      // ensure dataset contains normalized id and source
      nameEl.dataset.id = product.id || '';
      nameEl.dataset.source = product.source || 'dsri';
    }
    if (subEl) subEl.textContent = product.subtitle || '';

    window.productBasePrice = Number(product.price || 0);

    if (priceEl) {
      priceEl.dataset.base = window.productBasePrice;
      priceEl.textContent = formatPrice(window.productBasePrice);
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

    if (descEl) descEl.innerHTML = product.description || '';

    // Render Tips (if any)
    const tipsList = document.getElementById('tips-list');
    if (tipsList) {
      if (Array.isArray(product.tips) && product.tips.length > 0) {
        tipsList.innerHTML = '';
        product.tips.forEach(t => {
          const li = document.createElement('li');
          li.textContent = t;
          tipsList.appendChild(li);
        });
      } else {
        // default tips if none in JSON
        tipsList.innerHTML = `
          <li>Serve chilled for best taste.</li>
          <li>Consume within 4 hours for optimal freshness.</li>
        `;
      }
    }

    if (qtyEl && (!qtyEl.value || Number(qtyEl.value) <= 0)) qtyEl.value = 1;
  }

  /* ========================= Render options UI (pills, selects) ========================= */
  function renderOptions(options = []) {
    const container = document.getElementById('product-options');
    if (!container) return;
    container.innerHTML = '';

    if (!Array.isArray(options) || options.length === 0) {
      container.style.display = 'none';
      return;
    }
    container.style.display = '';

    options.forEach(group => {
      const fieldset = el('fieldset', { class: 'opt-group' });
      const legend = el('legend', { text: group.title || '' });
      fieldset.appendChild(legend);

      if (group.note) fieldset.appendChild(el('p', { class: 'opt-note', text: group.note }));

      const inputName = group.key || ('opt_' + Math.random().toString(36).slice(2,7));

      if (group.type === 'select') {
        const select = el('select', { name: inputName });
        select.addEventListener('change', () => updatePriceFromUI());
        group.choices.forEach(choice => {
          const opt = el('option', { value: choice.id, text: choice.label || choice.id });
          opt.dataset.price = choice.price || 0;
          if (choice.enabled === false) opt.disabled = true;
          if (choice.default) opt.selected = true;
          select.appendChild(opt);
        });
        fieldset.appendChild(select);
        container.appendChild(fieldset);
        return;
      }

      const groupWrap = el('div', { class: 'choices' });
      group.choices.forEach(choice => {
        const isCheckbox = (group.type === 'checkbox') && (group.key !== 'sauce');
        const btnClass = isCheckbox ? 'addon-btn' : 'opt-btn';
        const btn = el('button', {
          class: btnClass,
          type: 'button',
          'data-price': choice.price || 0,
          'data-choice-id': choice.id,
          'aria-pressed': choice.default ? 'true' : 'false',
          'aria-label': choice.label || choice.id,
          text: choice.label || choice.id
        });

        if (choice.enabled === false) {
          btn.disabled = true;
          btn.classList.add('disabled');
        }

        if (choice.price) {
          const hint = el('small', { class: 'opt-price', text: ' (+' + new Intl.NumberFormat('id-ID').format(choice.price) + ')' });
          btn.appendChild(hint);
        }

        btn.addEventListener('click', () => {
          if (choice.enabled === false) return;
          if (isCheckbox) {
            const cur = btn.getAttribute('aria-pressed') === 'true';
            btn.setAttribute('aria-pressed', (!cur).toString());
          } else {
            groupWrap.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', 'false'));
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

        groupWrap.appendChild(btn);
      });

      fieldset.appendChild(groupWrap);
      container.appendChild(fieldset);
    });

    updatePriceFromUI();
  }

  /* ========================= Compute options delta ========================= */
  function computeOptionsDelta() {
    const container = document.getElementById('product-options');
    if (!container) return 0;
    let delta = 0;

    container.querySelectorAll('input').forEach(i => {
      if (i.disabled) return;
      if (i.type === 'checkbox' && i.checked) delta += Number(i.dataset.price || 0);
      if (i.type === 'radio' && i.checked) delta += Number(i.dataset.price || 0);
    });
    container.querySelectorAll('select').forEach(s => {
      if (s.disabled) return;
      const opt = s.options[s.selectedIndex];
      if (opt && !opt.disabled) delta += Number(opt.dataset.price || 0);
    });
    container.querySelectorAll('button[data-choice-id]').forEach(b => {
      if (b.disabled) return;
      if (b.getAttribute('aria-pressed') === 'true') delta += Number(b.dataset.price || 0);
    });
    return delta;
  }

  /* ========================= Update price displayed ========================= */
  function updatePriceFromUI() {
    try {
      const base = Number(window.productBasePrice || 0);
      const optionsDelta = computeOptionsDelta();
      const qty = Number(document.getElementById('quantity')?.value || 1);
      const total = (base + optionsDelta) * Math.max(1, qty);

      const baseEl = document.getElementById('product-price');
      if (baseEl) baseEl.textContent = formatPrice(base + optionsDelta);
      const priceEl = document.getElementById('price-display') || document.getElementById('product-price');
      if (priceEl) priceEl.textContent = formatPrice(total);
    } catch (e) {
      console.error('updatePriceFromUI error', e);
    }
  }

  /* ========================= Attach option logic untuk markup statis ========================= */
  function attachOptionLogicForButtons() {
    document.querySelectorAll('.option-group').forEach(group => {
      const buttons = Array.from(group.querySelectorAll('button'));
      if (!buttons.length) return;
      const isAddon = group.dataset.key === 'addons';
      buttons.forEach(btn => {
        if (btn.dataset.price === undefined) btn.dataset.price = btn.getAttribute('data-price') || 0;
        btn.setAttribute('role', 'button');
        btn.setAttribute('tabindex', '0');
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
          if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') { ev.preventDefault(); btn.click(); }
        });
      });
    });
  }

  /* ========================= Initialization (load product + normalize ids) ========================= */
  try {
    const rawId = getIdFromUrl();
    const source = 'dsri';

    if (!rawId) {
      console.error('No product id in URL (use ?id=product-id). Keeping static/default content if present.');
      attachOptionLogicForButtons();
      document.getElementById('quantity')?.addEventListener('change', updatePriceFromUI);
    } else {
      const products = await loadProducts();
      // normalize product ids: prefix with source if not already prefixed
      const normalizedProducts = (products || []).map(p => {
        const idRaw = String(p.id || p._id || p.code || '');
        const fullId = idRaw && !idRaw.startsWith(source + '-') ? (source + '-' + idRaw) : idRaw;
        return Object.assign({}, p, { id: fullId, source });
      });

      // search: make searchId include prefix if necessary
      const searchId = rawId && !rawId.startsWith(source + '-') ? (source + '-' + rawId) : rawId;

      const product = normalizedProducts.find(p => p.id === searchId);
      if (!product) {
        console.error('Product not found for id:', rawId);
        attachOptionLogicForButtons();
      } else {
        renderProduct(product);
        const opts = product.options || product.optionGroups || [];
        renderOptions(opts);
        attachOptionLogicForButtons();
        const qty = document.getElementById('quantity');
        if (qty) qty.addEventListener('change', updatePriceFromUI);
      }
    }
  } catch (err) {
    console.error('Error loading product:', err);
  }

  // expose convenience functions
  window.renderOptions = renderOptions;
  window.updatePriceFromUI = updatePriceFromUI;
  window.computeOptionsDelta = computeOptionsDelta;

  /* ========================= Like / Heart handler (per user, disimpan ke likes_<UID>) ========================= */
  (function(){
    const heartBtn =
      document.querySelector('.heart') ||
      document.querySelector('.like-toggle') ||
      document.querySelector('[data-like-button]');
    if (!heartBtn) return;

    const loadLikes = () => {
      try {
        return JSON.parse(localStorage.getItem(likesKey()) || '[]');
      } catch(e){
        return [];
      }
    };
    const saveLikes = arr => {
      localStorage.setItem(likesKey(), JSON.stringify(arr || []));
    };

    function miniToast(msg) {
      let t = document.querySelector('.mini-toast');
      if (!t) {
        t = document.createElement('div');
        t.className = 'mini-toast';
        Object.assign(t.style, {
          position:'fixed', left:'50%', transform:'translateX(-50%)', bottom:'28px',
          background:'#111', color:'#fff', padding:'8px 12px', borderRadius:'8px',
          zIndex:1600, opacity:0, transition:'opacity .18s'
        });
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.style.opacity = '1';
      setTimeout(()=> t.style.opacity = '0', 1300);
    }

    function makeLikeObj() {
      const idEl = document.querySelector('.product-name');
      const idRaw =
        idEl?.dataset?.id ||
        new URLSearchParams(location.search).get('id') ||
        '';
      const source = idEl?.dataset?.source || 'dsri';
      const id = idRaw && !idRaw.startsWith(source + '-') ? (source + '-' + idRaw) : String(idRaw);
      const title = idEl?.textContent?.trim() || document.title || '';

      // cari image dengan beberapa fallback
      let imgEl =
        document.querySelector('.product-image img') ||
        document.querySelector('.product-image') ||
        document.querySelector('.product-thumb img') ||
        document.querySelector('.product-thumb') ||
        null;

      let imgSrc = '';
      if (imgEl) {
        if (imgEl.tagName && imgEl.tagName.toLowerCase() === 'img') {
          imgSrc = imgEl.src || imgEl.getAttribute('src') || '';
        } else if (imgEl.querySelector) {
          const nested = imgEl.querySelector('img');
          if (nested) imgSrc = nested.src || nested.getAttribute('src') || '';
        }
      }

      // normalize ke absolute URL
      try {
        if (imgSrc) {
          const abs = new URL(imgSrc, location.href);
          imgSrc = abs.href;
        }
      } catch(e){}

      const price = Number(document.getElementById('product-price')?.dataset?.base || 0);
      return { id: String(id), source, title, image: imgSrc || '', price };
    }

    heartBtn.addEventListener('click', function (ev) {
      ev.preventDefault();
      const obj = makeLikeObj();
      if (!obj.id) {
        miniToast('Tidak dapat menyukai item ini (id produk tidak ditemukan)');
        return;
      }

      let likes = loadLikes();
      const idx = likes.findIndex(x => String(x.id) === String(obj.id));

      const pressed = heartBtn.getAttribute('aria-pressed') === 'true';
      heartBtn.setAttribute('aria-pressed', pressed ? 'false' : 'true');

      if (!pressed) {
        if (idx === -1) likes.unshift(obj);
        saveLikes(likes);
        miniToast('Ditambahkan ke Liked');
      } else {
        if (idx > -1) likes.splice(idx, 1);
        saveLikes(likes);
        miniToast('Dihapus dari Liked');
      }

      window.dispatchEvent(new CustomEvent('likes:updated', { detail: { likes } }));
    });
  })();

  /* ========================= ADD TO BAG (product page, per user) ========================= */
  (function(){
    const num = v => Number(String(v||0).replace(/[^\d]/g,'')) || 0;

    function readOptions() {
      const addons = [];
      const container = document.getElementById('product-options');

      if (container) {
        // 1) tombol/button based choices
        container.querySelectorAll('button[data-choice-id]').forEach(btn => {
          try {
            if (btn.disabled) return;
            const pressed = btn.getAttribute('aria-pressed') === 'true';
            if (pressed) {
              const id = btn.dataset.choiceId || btn.dataset.id || btn.getAttribute('data-id') || btn.textContent.trim();
              const label = btn.dataset.label || btn.textContent.trim();
              const price = Number(String(
                btn.dataset.price ||
                btn.getAttribute('data-price') ||
                btn.dataset.priceDelta ||
                0
              ).replace(/[^\d\-]/g, '')) || 0;
              addons.push({ id: String(id).replace(/_/g,'-'), label: label.trim(), price });
            }
          } catch (e) {}
        });

        // 2) inputs (checkbox / radio)
        container.querySelectorAll('input').forEach(inp => {
          try {
            if (inp.disabled) return;
            if ((inp.type === 'checkbox' && inp.checked) ||
                (inp.type === 'radio' && inp.checked)) {
              const id = inp.dataset.choiceId || inp.id || (inp.name + '_' + inp.value);
              const label =
                inp.dataset.label ||
                (container.querySelector(`label[for="${inp.id}"]`)?.textContent?.trim()) ||
                id;
              const price = Number(String(
                inp.dataset.price ||
                inp.getAttribute('data-price') ||
                0
              ).replace(/[^\d\-]/g, '')) || 0;
              addons.push({ id: String(id).replace(/_/g,'-'), label: label.trim(), price });
            }
          } catch(e){}
        });

        // 3) selects
        container.querySelectorAll('select').forEach(sel => {
          try {
            if (sel.disabled) return;
            const opt = sel.options[sel.selectedIndex];
            if (opt && !opt.disabled) {
              const price = Number(String(
                opt.dataset.price ||
                opt.getAttribute('data-price') ||
                0
              ).replace(/[^\d\-]/g, '')) || 0;
              const lab = opt.text || opt.value;
              addons.push({
                id: (sel.name || sel.id) + '_' + (opt.value || opt.text),
                label: (sel.dataset.label || lab).trim(),
                price
              });
            }
          } catch(e){}
        });
      } else {
        // fallback: global buttons
        document.querySelectorAll('button[data-choice-id]').forEach(btn=>{
          const pressed = btn.getAttribute('aria-pressed') === 'true';
          if (!pressed) return;
          const id = btn.dataset.choiceId || btn.dataset.id || btn.getAttribute('data-id') || btn.textContent.trim();
          const label = btn.dataset.label || btn.textContent.trim();
          const price = Number(String(
            btn.dataset.price ||
            btn.getAttribute('data-price') ||
            0
          ).replace(/[^\d\-]/g, '')) || 0;
          addons.push({ id: String(id).replace(/_/g,'-'), label: label.trim(), price });
        });
      }

      return addons;
    }

    function compute(base, qty, addons){
      const addTotal = (addons||[]).reduce((s,a)=>s + Number(a.price||0), 0);
      const unit = Number(base||0) + addTotal;
      return {
        unit,
        subtotal: unit * Math.max(1, Number(qty||1)),
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

    function merge(cart, item){
      const sig = it => (it.addons||[]).map(a=>a.id).sort().join('|');
      const s = sig(item);
      for (let i=0;i<cart.length;i++){
        if (cart[i].id === item.id && sig(cart[i]) === s) {
          cart[i].qty = Number(cart[i].qty || 1) + Number(item.qty || 1);
          cart[i].subtotal = Number(cart[i].subtotal || 0) + Number(item.subtotal || 0);
          return cart;
        }
      }
      cart.push(item);
      return cart;
    }

    function toast(msg='Added to bag') {
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
      setTimeout(()=> t.style.opacity = '0', 1200);
    }

    function addToBag(goToBag = true) {
      const nameEl = q('.product-name');
      const idRaw =
        nameEl?.dataset?.id ||
        new URLSearchParams(location.search).get('id');
      const source = nameEl?.dataset?.source || 'dsri';
      const id = idRaw && !idRaw.startsWith(source + '-') ? (source + '-' + idRaw) : idRaw;
      const title =
        (nameEl?.textContent ||
         q('.product-title')?.textContent ||
         '').trim();
      const base = num(q('#product-price')?.dataset?.base || q('#product-price')?.textContent);
      const qty = Number(q('#quantity')?.value || 1);

      if (!id) {
        console.warn('no product id');
        return false;
      }

      const addons = readOptions();
      const pricing = compute(base, qty, addons);

      const productImageEl = q('.product-image');
      const imageSrc =
        (productImageEl && productImageEl.tagName &&
         productImageEl.tagName.toLowerCase() === 'img')
          ? productImageEl.src
          : (q('.product-image img')?.src || '');

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
        setTimeout(() => window.location.href = 'bagfr.html', 450);
      }
      return true;
    }

    document.addEventListener('click', e=>{
      const btn = e.target.closest && e.target.closest('.add-btn, [data-add-to-bag]');
      if (!btn) return;
      e.preventDefault();
      const noRedirect = btn.hasAttribute('data-no-redirect');
      addToBag(!noRedirect);
    });

    // expose addToBag
    window.addToBagFromPage = addToBag;
    window.addToBag = addToBag;
  })();

  /* ========================= Checkout/order IIFE (per user, opsional) ========================= */
  (function(){
    const fmt = n => 'Rp ' + new Intl.NumberFormat('id-ID').format(Number(n||0));

    function loadCart(){
      try {
        const key = userKey('cart');
        return JSON.parse(localStorage.getItem(key) || '[]');
      } catch(e) {
        return [];
      }
    }
    function saveOrders(arr){
      const key = userKey('orders');
      localStorage.setItem(key, JSON.stringify(arr || []));
    }
    function loadOrders(){
      try {
        const key = userKey('orders');
        return JSON.parse(localStorage.getItem(key) || '[]');
      } catch(e) {
        return [];
      }
    }

    function genId(){
      return 'ORD-' + new Date().toISOString().slice(0,10) + '-' +
             Math.random().toString(36).slice(2,6);
    }

    function buildMsg(order){
      const lines = [];
      lines.push(`📦 New Order — ${order.id}`);
      lines.push(`Waktu: ${new Date(order.createdAt).toLocaleString('id-ID')}`);
      lines.push('');
      order.items.forEach(it=>{
        const addon = (it.addons || []).map(a=>`${a.label} (+${fmt(a.price)})`).join(', ');
        lines.push(
          `• ${it.title} x${it.qty} — ${fmt(it.unitPrice)} ` +
          `${addon? ' | '+addon : ''} = ${fmt(it.subtotal)}`
        );
      });
      lines.push('');
      lines.push(`Total: ${fmt(order.total)}`);
      lines.push('');
      lines.push('Nama:');
      lines.push('No. HP:');
      lines.push('Alamat / Catatan:');
      lines.push('');
      lines.push('Mohon konfirmasi ketersediaan & instruksi pembayaran via chat. Terima kasih!');
      return lines.join('\n');
    }

    document.addEventListener('click', function(e){
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
      const items = cart.map(it=>{
        total += Number(it.subtotal||0);
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

      window.location.href = 'order.html?order=' + encodeURIComponent(order.id);
    });
  })();

})(); // end dsri.js
