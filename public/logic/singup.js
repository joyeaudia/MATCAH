const supabase = window.supabase;

document.addEventListener("DOMContentLoaded", () => {
  const submitBtn = document.getElementById("createAccountBtn");
  if (!submitBtn) return;

  submitBtn.addEventListener("click", async (ev) => {
    ev.preventDefault();

    const fullName = document.getElementById("fullname")?.value.trim();
    const email = document.getElementById("email")?.value.trim();
    const phone = document.getElementById("phone")?.value.trim();
    const pass = document.getElementById("password")?.value;
    const confirm = document.getElementById("confirm-password")?.value;

    if (!fullName || !email || !phone || !pass || !confirm) {
      alert("Semua kolom wajib diisi!");
      return;
    }
    if (pass !== confirm) {
      alert("Password & konfirmasi tidak sama.");
      return;
    }

    // 1️⃣ Daftarkan user di Auth
    const { data: signupData, error: signupError } = await supabase.auth.signUp({
      email,
      password: pass,
    });

    if (signupError) {
      console.error("Signup error:", signupError);
      alert("Signup error: " + signupError.message);
      return;
    }

    const user = signupData.user;
    if (!user) {
      alert("Sign Up gagal, user tidak terbaca.");
      return;
    }

    // 2️⃣ Simpan ke profiles
    const { error: profileError } = await supabase.from("profiles").insert({
      id: user.id,
      full_name: fullName,
      is_admin: false,
      // kalau mau simpan no hp di tempat lain nanti kita buat tabel sendiri
    });

    if (profileError) {
      console.error("Profile insert error:", profileError);
      alert("Profile error: " + profileError.message);
      return;
    }

    alert("Akun berhasil dibuat 🎉 Silakan login!");
    window.location.href = "singin.html";
  });
});
