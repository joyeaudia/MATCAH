// cari.js / script.js
const recentGrid = document.getElementById('recent-grid');
const resultsGrid = document.getElementById('results');
const q = document.getElementById('q');
const clearBtn = document.getElementById('clear-recent');

const JSON_PATHS = [
  '../drsi.json', // PATH MODIFIED: Naik satu level ke root
  '../dsri.json'  // PATH MODIFIED: Naik satu level ke root
];

let catalog = []; // merged JSON
const RECENT_KEY = 'recently_viewed_v1';
const MAX_RECENT = 8;

async function loadCatalog() {
  const promises = JSON_PATHS.map(p =>
    fetch(p)
      .then(r => r.json())
      .catch(e => {
        console.error('Gagal load', p, e);
        return [];
      })
  );

  const arrays = await Promise.all(promises);

  // ⬇️ kita bangun catalog + inject "source" berdasarkan file asal
  catalog = [];
  arrays.forEach((arr, idx) => {
    // idx 0 = drsi.json (drinks), idx 1 = dsri.json (desserts)
    const inferredSource =
      idx === 0 ? 'drsi' :
      idx === 1 ? 'dsri' :
      '';

    (arr || []).forEach(it => {
      catalog.push({
        id: it.id || '',
        title: it.title || '',
        price: it.price || 0,
        images: Array.isArray(it.images)
          ? it.images
          : (it.images ? [it.images] : []),

        // kalau di JSON sudah ada source, pakai itu.
        // kalau tidak, pakai inferredSource dari file.
        source: it.source || inferredSource,

        ...it
      });
    });
  });
}


function getRecent() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function setRecent(arr) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, MAX_RECENT)));
}

// Helper untuk path gambar (Tambahan agar path aman)
function fixImgPath(src) {
  if (!src) return '../assets/placeholder.png';
  if (src.startsWith('http')) return src;
  if (src.startsWith('../')) return src;
  return '../' + src; 
}

// === buka detail produk (dipakai Recent + Results) ===
function openProductDetail(item) {
  if (!item) return;

  const id = String(item.id || '').trim();
  if (!id) {
    alert('Produk tidak punya ID, tidak bisa dibuka.');
    return;
  }

  const source = String(item.source || '').toLowerCase();

  let page = './drsi.html'; // default: drinks
  if (source === 'dsri') {
    page = './dsri.html';
  } else if (source === 'bsri') {
    page = './bsri.html';
  } else {
    // fallback berdasarkan prefix id (sama seperti di bagfr.js)
    if (id.startsWith('dsri-')) page = './dsri.html';
    else if (id.startsWith('drsi-')) page = './drsi.html';
  }

  // update "recently viewed" sebelum pindah
  pushToRecent(item);

  // langsung pindah ke halaman produk dengan query ?id=
  window.location.href = `${page}?id=${encodeURIComponent(id)}`;
}

function renderRecent() {
  const rec = getRecent();
  recentGrid.innerHTML = '';

  if (rec.length === 0) {
    // show empty placeholders (same as earlier design)
    for (let i = 0; i < 4; i++) {
      const d = document.createElement('div');
      d.className = 'recent-card';
      recentGrid.appendChild(d);
    }
    return;
  }

  rec.forEach(item => {
    const el = document.createElement('div');
    el.className = 'recent-card';

    // image
    const img = document.createElement('img');
    // PATH MODIFIED: Gunakan fixImgPath
    img.src = item.images && item.images.length
        ? fixImgPath(item.images[0])
        : '../assets/placeholder.png';
    img.alt = item.title;

    // price tag
    const p = document.createElement('div');
    p.className = 'price-tag';
    p.textContent = formatRp(item.price);

    el.appendChild(img);
    el.appendChild(p);

    // click: langsung buka produk
    el.addEventListener('click', () => {
      openProductDetail(item);
    });

    recentGrid.appendChild(el);
  });
}

function formatRp(n) {
  const num = Number(n) || 0;
  return 'Rp ' + num.toLocaleString('id-ID');
}

function pushToRecent(item) {
  const cur = getRecent();
  // remove if exists
  const filtered = cur.filter(i => i.id !== item.id);
  filtered.unshift({
    id: item.id,
    title: item.title,
    price: item.price,
    images: item.images,
    source: item.source || '' // simpan source juga kalau ada
  });
  setRecent(filtered);
}

// Render search results
function renderResults(items) {
  resultsGrid.innerHTML = '';
  if (!items || items.length === 0) {
    resultsGrid.innerHTML =
      '<div style="color:#8b8b92;padding:8px">No results</div>';
    return;
  }

  items.forEach(it => {
    const card = document.createElement('div');
    card.className = 'result-card';

    const img = document.createElement('img');
    // PATH MODIFIED: Gunakan fixImgPath
    img.src = it.images && it.images.length
        ? fixImgPath(it.images[0])
        : '../assets/placeholder.png';
    img.alt = it.title;

    const meta = document.createElement('div');
    meta.className = 'meta';

    const t = document.createElement('div');
    t.className = 'result-title';
    t.textContent = it.title;

    const p = document.createElement('div');
    p.className = 'result-price';
    p.textContent = formatRp(it.price);

    meta.appendChild(t);
    meta.appendChild(p);

    card.appendChild(img);
    card.appendChild(meta);

    // click: langsung ke produk
    card.addEventListener('click', () => {
      openProductDetail(it);
    });

    resultsGrid.appendChild(card);
  });
}

// perform search by title contains term
function performSearch(term) {
  const qVal = (term || '').trim().toLowerCase();
  if (!qVal) {
    renderResults([]);
    return [];
  }

  const matches = catalog.filter(it =>
    it.title.toLowerCase().includes(qVal)
  );

  // set recent ke hasil-hasil ini (tanpa duplikat)
  if (matches.length) {
    const toStore = matches.map(it => ({
      id: it.id,
      title: it.title,
      price: it.price,
      images: it.images,
      source: it.source || ''
    }));

    const cur = getRecent().filter(
      r => !toStore.find(t => t.id === r.id)
    );

    // ✅ perbaiki typo di sini
    const merged = [...toStore, ...cur].slice(0, MAX_RECENT);
    setRecent(merged);
    renderRecent();
  }

  renderResults(matches);
  return matches;
}

q.addEventListener('keyup', e => {
  const val = e.target.value;
  // search on Enter or after small debounce for live search
  if (e.key === 'Enter') {
    performSearch(val);
  } else {
    // optional: live search after 300ms
    debounceLive(val);
  }
});

// simple debounce
let _debounceTimer = null;
function debounceLive(val) {
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => performSearch(val), 300);
}

clearBtn.addEventListener('click', () => {
  localStorage.removeItem(RECENT_KEY);
  renderRecent();
});

// init
(async function init() {
  await loadCatalog();
  renderRecent();
  // optional: bisa prepopulate suggestions/results kalau mau
})();