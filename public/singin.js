// singin.js — pakai Supabase + tetap support admin lokal

// 🔐 akun admin fix (hardcoded)
const ADMIN_EMAIL = "byverent@gmail.com";
const ADMIN_PASSWORD = "5Bisnis2021";

// ambil client supabase yang sudah dibuat di HTML
const supabase = window.supabase;

// toggle show/hide password
document.querySelectorAll(".toggle").forEach((icon) => {
  icon.addEventListener("click", () => {
    const input = icon.previousElementSibling;
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
    icon.textContent = input.type === "password" ? "👁️" : "🙈";
  });
});

const signInBtn = document.getElementById("signInBtn");
const forgotLink = document.querySelector(".forgot-password-link");

// 👉 3️⃣ LUPA PASSWORD: kirim email reset
if (forgotLink) {
  forgotLink.addEventListener("click", async (e) => {
    e.preventDefault();

    // pakai email yang sudah diisi di input
    const emailInput = document.getElementById("email");
    const email = (emailInput?.value || "").trim();

    if (!email) {
      alert("Isi dulu email yang mau di-reset, ya 🙂");
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: "https://matcah.netlify.app/reset-password.html",
      });

      if (error) {
        console.error("Reset password error:", error);
        alert("Gagal mengirim email reset: " + error.message);
        return;
      }

      alert(
        "Link reset password sudah dikirim ke email.\nSilakan cek inbox atau folder spam, ya 😊"
      );
    } catch (err) {
      console.error("Unexpected reset error:", err);
      alert("Terjadi error saat mengirim reset password.");
    }
  });
}


if (signInBtn) {
  signInBtn.addEventListener("click", async () => {
    const emailEl = document.getElementById("email");
    const passwordEl = document.getElementById("password");

    const userEmailValue = (emailEl?.value || "").trim();
    const userPasswordValue = passwordEl?.value || "";

    if (!userEmailValue || !userPasswordValue) {
      alert("Isi email dan password dulu ya 🙂");
      return;
    }

    // 💼 1) CEK AKUN ADMIN TETAP DULU (hardcoded, lokal)
    if (
      userEmailValue.toLowerCase() === ADMIN_EMAIL.toLowerCase() &&
      userPasswordValue === ADMIN_PASSWORD
    ) {
      const name = "Admin Verent";

      // simpan session admin
      localStorage.setItem("maziRole", "admin");
      localStorage.setItem("maziEmail", ADMIN_EMAIL);
      localStorage.setItem("maziName", name);
      localStorage.setItem("maziPhone", "");
      localStorage.setItem("maziUID", "admin-fixed"); // UID khusus admin

      const profile = {
        firstName: "Admin",
        lastName: "Verent",
        email: ADMIN_EMAIL,
        phone: "",
        memberSince: new Date().getFullYear(),
      };
      localStorage.setItem("profile", JSON.stringify(profile));

      window.location.href = "frsadm.html";
      return;
    }

    // 👤 2) LOGIN USER BIASA KE SUPABASE
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: userEmailValue,
        password: userPasswordValue,
      });

      if (error) {
        console.error("Supabase login error:", error);
        alert("Login error: " + error.message); // Biar kelihatan pesan asli
        return;
      }

      const user = data.user;
      if (!user) {
        alert("Login gagal. Coba lagi nanti ya.");
        return;
      }

      // ambil profile dari tabel profiles
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.warn("Profile fetch error:", profileError);
      }

      const fullName = profileData?.full_name || "";
      const isAdmin = profileData?.is_admin === true;

      // pecah nama depan / belakang
      const parts = fullName.split(/\s+/);
      const firstName = parts[0] || "";
      const lastName = parts.slice(1).join(" ");

      const role = isAdmin ? "admin" : "user";

      // simpan session user ke localStorage (biar app lain tetap jalan)
      localStorage.setItem("maziRole", role);
      localStorage.setItem("maziEmail", userEmailValue);
      localStorage.setItem("maziName", fullName || userEmailValue);
      localStorage.setItem("maziPhone", "");
      localStorage.setItem("maziUID", user.id); // 🔑 kunci data per user

      const profileLS = {
        firstName,
        lastName,
        email: userEmailValue,
        phone: "",
        memberSince: new Date().getFullYear(),
      };
      localStorage.setItem("profile", JSON.stringify(profileLS));

      // restore draft checkout kalau ada (tetap sama)
      try {
        if (typeof window.flushOrderQueue === "function") {
          await window.flushOrderQueue();
        }
      } catch (e) {
        console.warn("flushOrderQueue throw", e);
      }

      const sp = new URLSearchParams(window.location.search);
      const from = sp.get("from");
      if (from === "bag" || from === "checkout") {
        try {
          const draft = JSON.parse(
            localStorage.getItem("checkoutDraft_cart") || "null"
          );
          if (draft) {
            localStorage.setItem("cart", JSON.stringify(draft));
            localStorage.removeItem("checkoutDraft_cart");
          }
        } catch (e) {
          console.warn("failed restore draft", e);
        }

        window.location.href = from === "bag" ? "bagfr.html" : "cekout.html";
        return;
      }

      // redirect sesuai role
      if (role === "admin") {
        window.location.href = "frsadm.html";
      } else {
        window.location.href = "Home.html";
      }
    } catch (err) {
      console.error("Unexpected login error:", err);
      alert("Terjadi error saat login. Coba lagi nanti ya.");
    }
  });
}
