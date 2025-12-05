// prl.js — Sync Profile & Default Address

(function () {
    const q = (id) => document.getElementById(id);

    window.loadProfileData = async function() {
        const supabase = window.supabase;
        if (!supabase) return;

        // 1. Cek Auth
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = 'singin.html';
            return;
        }

        // 2. AMBIL NAMA (Dari Tabel Profiles)
        let displayName = "User";
        let displayEmail = user.email;
        let displayPhone = "-";

        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            
            if (profile) {
                displayName = profile.full_name || displayName;
                // Jika tabel profiles punya kolom phone, ambil disini
                if(profile.phone) displayPhone = profile.phone;
            }
        } catch(e) {
            // Fallback ke metadata jika tabel profiles gagal/kosong
            if (user.user_metadata?.full_name) displayName = user.user_metadata.full_name;
        }

        q("full-name").textContent = displayName;
        q("email-val").textContent = displayEmail;
        q("phone-val").textContent = displayPhone;

        // 3. AMBIL ALAMAT DEFAULT (Dari Tabel User Addresses)
        q("address-text").innerHTML = "<span style='color:#999'>Loading...</span>";

        try {
            // Cari yang default
            const { data: addr } = await supabase
                .from("user_addresses")
                .select("*")
                .eq("user_id", user.id)
                .eq("is_default", true)
                .maybeSingle();

            if (addr) {
                renderAddress(addr);
            } else {
                // Jika tidak ada default, ambil sembarang satu
                const { data: anyAddr } = await supabase
                    .from("user_addresses")
                    .select("*")
                    .eq("user_id", user.id)
                    .limit(1)
                    .maybeSingle();
                
                if (anyAddr) renderAddress(anyAddr);
                else q("address-text").innerHTML = "<span style='color:#888;font-style:italic'>Belum ada alamat tersimpan.</span>";
            }
        } catch (e) {
            console.error(e);
            q("address-text").textContent = "Gagal memuat alamat.";
        }
    };

    function renderAddress(data) {
        const name = escapeHtml(data.name);
        const phone = escapeHtml(data.phone);
        const addr = escapeHtml(data.address).replace(/\n/g, "<br>");

        const html = `
            <div style="font-weight:700;color:#000;margin-bottom:4px">${name}</div>
            <div style="font-size:13px;color:#666;margin-bottom:6px">${phone}</div>
            <div style="font-size:14px;color:#333;line-height:1.5">${addr}</div>
        `;
        q("address-text").innerHTML = html;
    }

    function escapeHtml(s) {
        return String(s || "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
    }
})();