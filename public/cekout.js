// cekout.js — Create Order to Supabase

(function () {
    const id = (s) => document.getElementById(s);
    const q = (s) => document.querySelector(s);

    // Helper Rupiah
    const fmt = (n) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n);

    // 1. INIT: Load Alamat & Cart
    async function init() {
        const supabase = window.supabase;
        if (!supabase) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = "singin.html";
            return;
        }

        // A. Load Alamat Default dari Supabase
        const textArea = id('recipient');
        if (textArea) {
            textArea.value = "Memuat alamat...";
            const { data: addr } = await supabase
                .from('user_addresses')
                .select('*')
                .eq('user_id', user.id)
                .eq('is_default', true)
                .maybeSingle();

            if (addr) {
                textArea.value = `${addr.name}\n${addr.phone}\n${addr.address}`;
            } else {
                // Ambil sembarang jika tidak ada default
                const { data: any } = await supabase.from('user_addresses').select('*').eq('user_id', user.id).limit(1).maybeSingle();
                textArea.value = any ? `${any.name}\n${any.phone}\n${any.address}` : "";
                if (!any) textArea.placeholder = "Belum ada alamat. Klik Saved Address.";
            }
        }

        // B. Render Cart (Dari LocalStorage sementara, karena cart bersifat client-side session)
        renderCartSummary(user.id);
    }

    function renderCartSummary(uid) {
        // Cart diambil dari local storage spesifik user
        const cart = JSON.parse(localStorage.getItem(`cart_${uid}`) || '[]');
        let subtotal = 0;
        cart.forEach(c => subtotal += (c.unitPrice * c.qty));

        if (id('subtotalRp')) id('subtotalRp').textContent = fmt(subtotal);
        if (id('totalRp')) id('totalRp').textContent = fmt(subtotal);
        
        // Simpan cart di memori untuk proses checkout
        window.currentCart = cart;
    }

    // 2. TOMBOL SAVED ADDRESS
    const btnSaved = id('btnUseSavedAddress');
    if (btnSaved) {
        btnSaved.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = "drafamt.html?from=checkout";
        });
    }

    // 3. TOMBOL PLACE ORDER (Action Utama)
    const btnOrder = id('placeOrder');
    if (btnOrder) {
        btnOrder.addEventListener('click', async (e) => {
            e.preventDefault();

            // Validasi Input
            const addressRaw = id('recipient').value.trim();
            const notes = id('notes')?.value.trim() || "";
            const deliveryMethod = q('.delivery-item.active')?.dataset.method || "Regular";

            if (!addressRaw) {
                alert("Alamat pengiriman wajib diisi.");
                return;
            }

            const cart = window.currentCart || [];
            if (cart.length === 0) {
                alert("Keranjang kosong.");
                return;
            }

            // UI Loading
            btnOrder.textContent = "Memproses...";
            btnOrder.disabled = true;

            try {
                const supabase = window.supabase;
                const { data: { user } } = await supabase.auth.getUser();
                
                if (!user) {
                    alert("Sesi habis.");
                    window.location.href = "singin.html";
                    return;
                }

                // Hitung Total & Siapkan Items
                let total = 0;
                const itemsPayload = cart.map(it => {
                    const sub = it.unitPrice * it.qty;
                    total += sub;
                    return {
                        title: it.title,
                        product_id: it.id,
                        qty: it.qty,
                        unit_price: it.unitPrice,
                        subtotal: sub,
                        image_url: it.image
                    };
                });

                // Generate ID Unik (ORD-...)
                const clientOrderId = `ORD-${Date.now()}`;

                // Parse Nama & HP dari Textarea (Baris 1 = Nama, Regex HP)
                const lines = addressRaw.split('\n');
                const pName = lines[0] || "User";
                const phoneMatch = addressRaw.match(/(\+62|08)\d{8,13}/);
                const pPhone = phoneMatch ? phoneMatch[0] : "-";

                // A. Insert Order
                const { data: newOrder, error: errOrder } = await supabase
                    .from('orders')
                    .insert({
                        user_id: user.id,
                        client_order_id: clientOrderId, // INI KUNCI PENCARIAN NANTI
                        status: 'active',
                        payment_status: 'pending',
                        total: total,
                        shipping_fee: 0,
                        recipient_address: addressRaw,
                        recipient_name: pName,
                        recipient_phone: pPhone,
                        notes: notes,
                        delivery_method: deliveryMethod
                    })
                    .select()
                    .single();

                if (errOrder) throw errOrder;

                // B. Insert Items
                const dbItems = itemsPayload.map(i => ({ ...i, order_id: newOrder.id }));
                const { error: errItems } = await supabase.from('order_items').insert(dbItems);
                
                if (errItems) throw errItems;

                // C. Sukses -> Hapus Cart & Redirect
                localStorage.removeItem(`cart_${user.id}`);
                
                // Redirect ke Halaman Detail menggunakan client_order_id
                window.location.href = `ditel.html?id=${clientOrderId}`;

            } catch (err) {
                console.error(err);
                alert("Gagal order: " + err.message);
                btnOrder.textContent = "Place Order";
                btnOrder.disabled = false;
            }
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();