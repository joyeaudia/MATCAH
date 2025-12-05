// alamat.js — Fix Save Logic & Redirect

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("address-form");
    const btnSave = document.getElementById("btn-save");

    // Helper: Ambil parameter URL
    const getQueryParam = (param) => new URLSearchParams(window.location.search).get(param);

    form.addEventListener("submit", async function (e) {
        e.preventDefault();

        // 1. Ambil Data
        const label = document.getElementById("address-label").value.trim() || "Alamat";
        const name = document.getElementById("recipient-name").value.trim();
        const phone = document.getElementById("phone-number").value.trim();
        const street = document.getElementById("street-address").value.trim();
        const city = document.getElementById("city").value.trim();
        const province = document.getElementById("province").value;
        const postal = document.getElementById("postal-code").value.trim();
        const isDefault = document.getElementById("default-address").checked;

        if (!name || !phone || !street) {
            alert("Mohon lengkapi Nama, Telepon, dan Alamat Jalan.");
            return;
        }

        const fullAddress = `${street}\n${city}, ${province} ${postal}`;

        // UI Loading
        const originalText = btnSave.textContent;
        btnSave.textContent = "Menyimpan ke Cloud...";
        btnSave.disabled = true;

        try {
            const supabase = window.supabase;
            if (!supabase) throw new Error("Supabase error. Refresh halaman.");

            // 2. Cek User
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                alert("Sesi habis. Silakan login kembali.");
                window.location.href = "singin.html";
                return;
            }

            // 3. Cek Limit 5 Alamat
            const { count, error: countErr } = await supabase
                .from('user_addresses')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id);

            if (!countErr && count >= 5) {
                alert("Kuota penuh (Max 5). Hapus alamat lama di halaman Saved Address.");
                btnSave.textContent = originalText;
                btnSave.disabled = false;
                return;
            }

            // 4. Logic Default
            // Kalau ini alamat pertama, otomatis jadi default
            const finalDefault = isDefault || (count === 0);

            if (finalDefault && count > 0) {
                // Reset default lain jika user memilih default baru
                await supabase
                    .from('user_addresses')
                    .update({ is_default: false })
                    .eq('user_id', user.id);
            }

            // 5. INSERT
            const { error: insertErr } = await supabase
                .from('user_addresses')
                .insert({
                    user_id: user.id,
                    label: label,
                    name: name,
                    phone: phone,
                    address: fullAddress,
                    is_default: finalDefault
                });

            if (insertErr) throw insertErr;

            // 6. SUKSES -> REDIRECT
            // Kita beri delay dikit biar database sync
            setTimeout(() => {
                const from = getQueryParam("from");
                if (from === "checkout") {
                    window.location.href = "drafamt.html?from=checkout";
                } else {
                    window.location.href = "drafamt.html";
                }
            }, 500);

        } catch (err) {
            console.error("Save Error:", err);
            alert("Gagal menyimpan: " + err.message);
            btnSave.textContent = originalText;
            btnSave.disabled = false;
        }
    });
});