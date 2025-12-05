// alamat.js — save address per user (per email) + max 5 alamat
document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");

  // 🔑 ambil email user yang lagi login
  const rawEmail = (localStorage.getItem("maziEmail") || "").toLowerCase().trim();
  if (!rawEmail) {
    // kalau ga ada email berarti belum login → lempar ke sign in
    // PATH OK: sesama folder page/
    window.location.href = "singin.html";
    return;
  }

  const BASE_KEY   = "savedAddresses_v1";
  const USER_KEY   = BASE_KEY + "_" + rawEmail;  // key per user
  const LEGACY_KEY = BASE_KEY;                   // key lama global
  const MAX_ADDR   = 5; // max alamat per akun

  function safeParse(raw) {
    try {
      return JSON.parse(raw || "[]");
    } catch (err) {
      return [];
    }
  }

  // 🔹 baca daftar alamat untuk user saat ini
  function readStore() {
    // 1) coba key per user
    let arr = safeParse(localStorage.getItem(USER_KEY));
    if (Array.isArray(arr) && arr.length) return arr;

    // 2) kalau kosong, coba key lama global → migrasi
    const legacy = safeParse(localStorage.getItem(LEGACY_KEY));
    if (Array.isArray(legacy) && legacy.length) {
      try {
        localStorage.setItem(USER_KEY, JSON.stringify(legacy));
        // optional: hapus key lama biar ga dipakai lagi
        localStorage.removeItem(LEGACY_KEY);
      } catch (e) {
        console.warn("Failed migrating legacy addresses", e);
      }
      return legacy;
    }

    // 3) bener2 ga ada data
    return [];
  }

  function writeStore(arr) {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(arr || []));
    } catch (e) {
      console.error("Failed to write addresses to localStorage", e);
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    // read inputs (ID sesuai alamat.html kamu)
    const label = (document.getElementById("address-label")?.value || "").trim() || "Other";
    const name = (document.getElementById("recipient-name")?.value || "").trim();
    const phone = (document.getElementById("phone-number")?.value || "").trim();
    const street = (document.getElementById("street-address")?.value || "").trim();
    const city = (document.getElementById("city")?.value || "").trim();
    const province = (document.getElementById("province")?.value || "").trim();
    const postal = (document.getElementById("postal-code")?.value || "").trim();

    // safe read of checkbox (may be missing in markup)
    const defaultEl = document.getElementById("default-address");
    let isDefault = !!(defaultEl && defaultEl.checked);

    // basic validation (name + phone + street)
    if (!name || !phone || !street) {
      alert("Isi Nama, No. Telepon, dan Alamat jalan minimal.");
      return;
    }

    const addressText = `${street}\n${city}${city && province ? ", " : ""}${province}\n${postal}`;

    const list = readStore();

    // enforce max count
    if (list.length >= MAX_ADDR) {
      alert(`Maksimum ${MAX_ADDR} alamat saja. Hapus salah satu jika ingin menambah lagi.`);
      return;
    }

    // kalau belum ada sama sekali, paksa alamat pertama jadi default
    if (list.length === 0) {
      isDefault = true;
    }

    const newAddress = {
      label,
      name,
      phone,
      address: addressText,
      isDefault: !!isDefault
    };

    // kalau set default, unset default alamat lain
    if (newAddress.isDefault) {
      list.forEach(a => { a.isDefault = false; });
    }

    list.push(newAddress);
    writeStore(list);

    // bentuk teks siap tempel ke Recipient (nama + telp + alamat lengkap)
    const recipientText = `${name}\n${phone}\n${addressText}`;

    // cek parameter ?from=
    const params = new URLSearchParams(window.location.search);
    const from = params.get("from");
    const fromCheckout = from === "checkout";
    const fromSignup   = from === "signup";

    // PATH OK: Semua redirect ke halaman yang ada di folder yang sama (page/)
    if (fromCheckout) {
      // dipanggil dari halaman checkout → balik ke checkout
      try {
        localStorage.setItem("checkoutRecipientDraft_v1", recipientText);
      } catch (e) {}
      window.location.href = "cekout.html";

    } else if (fromSignup) {
      // user baru selesai isi alamat pertama → ke Home
      window.location.href = "Home.html";

    } else {
      // flow biasa (misal dari drafamt / profile) → balik ke list alamat
      window.location.href = "drafamt.html";
    }
  });
});