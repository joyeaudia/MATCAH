// singup.js — Logic Pendaftaran User

// 1. Konfigurasi Supabase (ANON KEY - Aman untuk Client Side)
const SUPABASE_URL = 'https://ebbdaxprudznktnfvcbo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViYmRheHBydWR6bmt0bmZ2Y2JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NzI0NDQsImV4cCI6MjA4MDE0ODQ0NH0.U0AhNyTzU5nht8iMk7cYs2nSwApY1IssN4oMW1EChZg';

// Inisialisasi Client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener("DOMContentLoaded", () => {
  const submitBtn = document.getElementById("createAccountBtn");
  
  // Debug: Cek apakah tombol ditemukan
  if (!submitBtn) {
    console.error("Tombol createAccountBtn tidak ditemukan!");
    return;
  }

  submitBtn.addEventListener("click", async (ev) => {
    ev.preventDefault();

    // Ambil Value
    const fullName = document.getElementById("fullname")?.value.trim();
    const email = document.getElementById("email")?.value.trim();
    const phone = document.getElementById("phone")?.value.trim();
    const pass = document.getElementById("password")?.value;
    const confirm = document.getElementById("confirm-password")?.value;

    // Validasi Dasar
    if (!fullName || !email || !phone || !pass || !confirm) {
      alert("Semua kolom wajib diisi!");
      return;
    }
    if (pass !== confirm) {
      alert("Password & konfirmasi tidak sama.");
      return;
    }

    // Ubah tombol jadi Loading agar user tidak klik 2x
    const originalText = submitBtn.innerText;
    submitBtn.innerText = "Processing...";
    submitBtn.disabled = true;

    try {
      // 1️⃣ Daftarkan user di Auth Supabase
      const { data: signupData, error: signupError } = await supabase.auth.signUp({
        email: email,
        password: pass,
        options: {
          data: {
            full_name: fullName,
            phone: phone
          }
        }
      });

      if (signupError) {
        throw new Error(signupError.message);
      }

      const user = signupData.user;
      if (!user) {
        throw new Error("Gagal mendaftar (User object null).");
      }

      // 2️⃣ Simpan ke tabel 'profiles' (Pastikan tabel ini ada di Supabase Anda)
      // Jika RLS aktif, insert ini mungkin butuh policy yang mengizinkan user insert profilenya sendiri
      const { error: profileError } = await supabase.from("profiles").insert({
        id: user.id,
        full_name: fullName,
        is_admin: false,
        // phone: phone // Uncomment jika kolom phone ada di tabel profiles
      });

      if (profileError) {
        console.warn("Profile error (tapi auth sukses):", profileError);
        // Kita tidak throw error di sini agar user tetap bisa login, 
        // tapi idealnya profile harus sukses tersimpan.
      }

      alert("Akun berhasil dibuat 🎉 Silakan login!");
      window.location.href = "singin.html";

    } catch (err) {
      console.error("Signup Error:", err);
      // Pesan error user friendly
      let msg = err.message;
      if (msg.includes("Password should be at least")) {
        msg = "Password terlalu lemah (min 6-8 karakter).";
      } else if (msg.includes("User already registered")) {
        msg = "Email sudah terdaftar. Silakan login.";
      }
      alert("Gagal: " + msg);
      
      // Kembalikan tombol
      submitBtn.innerText = originalText;
      submitBtn.disabled = false;
    }
  });
});