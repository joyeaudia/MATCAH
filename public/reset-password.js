const supabase = window.supabase;

document.addEventListener("DOMContentLoaded", async () => {
  const resetBtn = document.getElementById("resetBtn");

  resetBtn.addEventListener("click", async () => {
    const newPass = document.getElementById("new-password")?.value || "";
    const confirm = document.getElementById("confirm-password")?.value || "";

    if (!newPass || !confirm) {
      alert("Isi kedua kolom password dulu ya 🙂");
      return;
    }
    if (newPass !== confirm) {
      alert("Password dan konfirmasi tidak sama.");
      return;
    }

    try {
      // Supabase sudah memberi session khusus di URL ketika user datang dari email reset
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        console.error("No reset session:", sessionError);
        alert(
          "Link reset sudah tidak berlaku atau session tidak ditemukan.\nCoba klik ulang link dari email."
        );
        return;
      }

      const { data, error } = await supabase.auth.updateUser({
        password: newPass,
      });

      if (error) {
        console.error("Update password error:", error);
        alert("Gagal mengubah password: " + error.message);
        return;
      }

      alert("Password berhasil diubah! Silakan login dengan password baru.");
      window.location.href = "singin.html";
    } catch (err) {
      console.error("Unexpected reset error:", err);
      alert("Terjadi error saat reset password.");
    }
  });
});
