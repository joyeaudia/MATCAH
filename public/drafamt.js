// drafamt.js — Load & Manage from Supabase

(function () {
  "use strict";

  const listEl = document.getElementById("address-list");
  const doneBtn = document.getElementById("done-btn");
  const addLink = document.querySelector(".add-new");
  
  const params = new URLSearchParams(window.location.search);
  const fromCheckout = params.get("from") === "checkout";

  // --- INIT ---
  async function initPage() {
    const supabase = window.supabase;
    if (!supabase) return;

    // Cek User
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = "singin.html";
        return;
    }

    fetchAddresses(user.id);
  }

  // --- FETCH DATA ---
  async function fetchAddresses(userId) {
    const supabase = window.supabase;
    listEl.innerHTML = '<div style="padding:40px;text-align:center;color:#999">Memuat alamat...</div>';

    const { data, error } = await supabase
        .from("user_addresses")
        .select("*")
        .eq("user_id", userId)
        .order("is_default", { ascending: false }) // Default paling atas
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Fetch error:", error);
        listEl.innerHTML = '<div class="empty">Gagal memuat data.</div>';
        return;
    }

    renderList(data || []);
  }

  // --- RENDER UI ---
  function renderList(addresses) {
    listEl.innerHTML = "";

    // Atur tombol Add New
    if (addLink) {
        if (addresses.length >= 5) {
            addLink.classList.add("disabled");
            addLink.style.opacity = "0.5";
            addLink.onclick = (e) => { e.preventDefault(); alert("Maksimal 5 alamat."); };
        } else {
            addLink.classList.remove("disabled");
            addLink.style.opacity = "1";
            addLink.onclick = null;
        }
    }

    if (addresses.length === 0) {
        listEl.innerHTML = '<div class="empty" style="text-align:center;padding:40px;color:#777">Belum ada alamat.<br>Tap "Add New Address".</div>';
        return;
    }

    addresses.forEach((addr) => {
        const card = document.createElement("div");
        card.className = "address-card";
        const checked = addr.is_default ? "checked" : "";
        
        card.innerHTML = `
            <button class="addr-delete" data-id="${addr.id}">✕</button>
            <div class="address-label" style="color:#007bff;font-weight:700;margin-bottom:4px">${escapeHtml(addr.label)}</div>
            
            <input class="address-radio" type="radio" name="addrSelect" 
                   data-id="${addr.id}" ${checked} 
                   style="position:absolute; right:15px; top:20px; transform:scale(1.2);">

            <div class="addr-name" style="font-weight:600">${escapeHtml(addr.name)}</div>
            <div class="addr-phone" style="font-size:13px;color:#666">${escapeHtml(addr.phone)}</div>
            <div class="address-divider" style="height:1px;background:#eee;margin:8px 0"></div>
            <div class="addr-full" style="font-size:14px;line-height:1.4">${escapeHtml(addr.address).replace(/\n/g, "<br>")}</div>
        `;
        listEl.appendChild(card);
    });

    attachEvents();
  }

  function attachEvents() {
    // Delete
    document.querySelectorAll(".addr-delete").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            if (!confirm("Hapus alamat ini?")) return;
            const id = e.target.dataset.id;
            
            const { error } = await window.supabase
                .from("user_addresses")
                .delete().eq("id", id);
            
            if (!error) {
                // Reload list
                const { data: { user } } = await window.supabase.auth.getUser();
                if(user) fetchAddresses(user.id);
            } else {
                alert("Gagal menghapus.");
            }
        });
    });

    // Klik card = pilih radio
    document.querySelectorAll(".address-card").forEach(card => {
        card.addEventListener("click", (e) => {
            if(e.target.classList.contains("addr-delete")) return;
            const rad = card.querySelector("input[type=radio]");
            if(rad) rad.checked = true;
        });
    });
  }

  // --- SAVE SELECTION ---
  doneBtn.addEventListener("click", async () => {
    const selected = document.querySelector('input[name="addrSelect"]:checked');
    if (!selected) {
        goBack(); 
        return;
    }

    const id = selected.dataset.id;
    const supabase = window.supabase;
    const { data: { user } } = await supabase.auth.getUser();

    // Set Default Logic
    doneBtn.textContent = "Saving...";
    
    // 1. Reset semua
    await supabase.from("user_addresses").update({ is_default: false }).eq("user_id", user.id);
    // 2. Set yang dipilih
    await supabase.from("user_addresses").update({ is_default: true }).eq("id", id);

    // Simpan ke LocalStorage DRAFT untuk Checkout Cepat (Bridge)
    // Supaya pas pindah ke cekout.html, datanya langsung ada tanpa loading lama
    try {
        const card = selected.closest('.address-card');
        const name = card.querySelector('.addr-name').innerText;
        const phone = card.querySelector('.addr-phone').innerText;
        const addr = card.querySelector('.addr-full').innerText;
        const fullTxt = `${name}\n${phone}\n${addr}`;
        localStorage.setItem('checkoutRecipientDraft_v1', fullTxt);
    } catch(e) {}

    goBack();
  });

  function goBack() {
      window.location.href = fromCheckout ? "cekout.html" : "prl.html";
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  document.addEventListener("DOMContentLoaded", initPage);
})();