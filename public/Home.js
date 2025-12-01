// HOME.JS – Product cards, cart, dan booth dari admin (dengan link)

document.addEventListener('DOMContentLoaded', function () {

  // =============================
  // 1) Buka halaman detail produk kalau card di-klik
  // =============================
  document.querySelectorAll('.product').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      if (!id) return;

      // contoh routing: minuman (id mulai "drink-") -> drsi.html, lainnya -> dsri.html
      const isDrink = /^drink-/i.test(id);
      const target = isDrink ? 'drsi.html' : 'dsri.html';

      window.location.href = `${target}?id=${encodeURIComponent(id)}`;
    });
  });

  // =============================
  // 2) Tombol Buy -> tambah ke cart + mini toast
  // =============================
  function loadCart() {
    try {
      return JSON.parse(localStorage.getItem('cart') || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveCart(c) {
    localStorage.setItem('cart', JSON.stringify(c || []));
  }

  function showMiniToast(message = '🛍️', anchorEl = null) {
    let t = document.querySelector('.mini-toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'mini-toast';
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      document.body.appendChild(t);
    }
    t.textContent = message;

    if (anchorEl && anchorEl.getBoundingClientRect) {
      const r = anchorEl.getBoundingClientRect();
      t.style.position = 'fixed';
      t.style.left = (r.left + r.width / 2) + 'px';
      t.style.top = (r.top - 36) + 'px';
      t.style.transform = 'translateX(-50%)';
    } else {
      t.style.position = 'fixed';
      t.style.left = '50%';
      t.style.bottom = '72px';
      t.style.transform = 'translateX(-50%)';
      t.style.top = '';
    }

    t.style.opacity = '1';
    t.style.pointerEvents = 'none';

    if (t._hideTimeout) clearTimeout(t._hideTimeout);
    t._hideTimeout = setTimeout(() => {
      t.style.opacity = '0';
      t._hideTimeout2 = setTimeout(() => {
        if (t && t.parentNode) {
          t.style.left = '';
          t.style.top = '';
          t.style.bottom = '';
        }
      }, 220);
    }, 900);
  }

  document.querySelectorAll('.product .buy-pill').forEach(btn => {
    btn.addEventListener('click', function (e) {
      e.stopPropagation(); // jangan buka halaman detail

      const card = btn.closest('.product');
      if (!card) return;

      const id = card.dataset.id || card.querySelector('.title')?.textContent?.trim() || '';
      const title = card.querySelector('.title')?.textContent?.trim() || '';
      const img = card.querySelector('img')?.getAttribute('src') || '';
      const priceText = card.querySelector('.price-row')?.textContent || '';
      const price = Number((priceText || '').replace(/[^\d]/g, '')) || 0;

      const cart = loadCart();

      const existing = cart.find(i => i.id === id && (!i.addons || i.addons.length === 0));
      if (existing) {
        existing.qty = Number(existing.qty || 1) + 1;
        existing.subtotal = Number(existing.subtotal || 0) + price;
      } else {
        cart.push({
          id: id,
          title: title,
          image: img,
          qty: 1,
          addons: [],
          unitPrice: price,
          subtotal: price
        });
      }
      saveCart(cart);

      showMiniToast('Added to bag 🛍️', btn);
    });
  });

  // =============================
  // 3) Visit Our Booth – pakai data dari admin + link
  // =============================
  const chipsContainer = document.querySelector('.visit .grid');
  const STORAGE_KEY = 'verent_booths_v1';

  if (chipsContainer) {

    const defaultBooths = [
      { title: "IPEKA Puri", small: "20 — 24 Oct | 8 AM — 6 PM", link: "" },
      { title: "Emporium Pluit Mall", small: "22 Oct — 2 Nov | 10 AM — 10 PM", link: "" },
      { title: "Big Bad Wolf, PIK", small: "Date / time", link: "" },
      { title: "UPH", small: "Date / time", link: "" }
    ];

    const monthsShort = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    function formatDate(dateStr) {
      if (!dateStr) return "";
      const [y, m, d] = dateStr.split("-");
      if (!y || !m || !d) return dateStr;
      return `${parseInt(d, 10)} ${monthsShort[parseInt(m, 10) - 1]}`;
    }

    function formatTime(timeStr) {
      if (!timeStr) return "";
      return timeStr;
    }

    function buildDisplayText(b) {
      // Kalau punya field structured dari admin.js, pakai itu.
      if (b.startDate || b.endDate || b.startTime || b.endTime) {
        const startD = formatDate(b.startDate);
        const endD   = formatDate(b.endDate);
        const startT = formatTime(b.startTime);
        const endT   = formatTime(b.endTime);

        let datePart = "";
        if (startD && endD) datePart = `${startD} — ${endD}`;
        else if (startD)     datePart = startD;
        else if (endD)       datePart = endD;

        let timePart = "";
        if (startT && endT) timePart = `${startT} — ${endT}`;
        else if (startT)     timePart = startT;
        else if (endT)       timePart = endT;

        if (datePart && timePart) return `${datePart} | ${timePart}`;
        if (datePart)             return datePart;
        if (timePart)             return timePart;
      }

      // fallback: pakai small kalau ada (data lama)
      return b.small || "";
    }

    function loadBooths() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultBooths;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr) || !arr.length) return defaultBooths;
        return arr;
      } catch (e) {
        console.warn('Failed to read booths from storage', e);
        return defaultBooths;
      }
    }

    function renderBooths() {
      const booths = loadBooths();
      chipsContainer.innerHTML = "";

      booths.slice(0, 4).forEach(b => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.innerHTML = `
          <div class="chip-title">${b.title || ""}</div>
          <div class="small">${buildDisplayText(b)}</div>
        `;

        const link = (b.link || "").trim();
        if (link) {
          chip.style.cursor = 'pointer';
          chip.setAttribute('role', 'button');
          chip.setAttribute('tabindex', '0');

          const openLink = () => {
            let url = link;
            if (!/^https?:\/\//i.test(url)) {
              url = 'https://' + url;
            }
            window.open(url, '_blank');
          };

          chip.addEventListener('click', openLink);
          chip.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              openLink();
            }
          });
        }

        chipsContainer.appendChild(chip);
      });
    }

    renderBooths();

    // kalau admin save di tab lain, Home akan auto-update
    window.addEventListener('storage', (ev) => {
      if (ev.key === STORAGE_KEY) renderBooths();
    });
  }

});
