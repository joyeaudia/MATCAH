// edt.js / edit-profile.js
document.addEventListener('DOMContentLoaded', () => {
  const KEY = 'profile';

  // form elements
  const firstEl = document.getElementById('first-name');
  const lastEl  = document.getElementById('last-name');
  const phoneEl = document.getElementById('phone');
  const saveBtn = document.getElementById('save-btn');

  function safeParse(raw) {
    try {
      return JSON.parse(raw || '{}');
    } catch {
      return {};
    }
  }

  // 🔹 load existing profile dari localStorage
  const stored = safeParse(localStorage.getItem(KEY));
  firstEl.value = stored.firstName || '';
  lastEl.value  = stored.lastName || '';
  emailEl.value = stored.email || '';   // cuma ditampilkan, input disabled di HTML
  phoneEl.value = stored.phone || '';

  // 🔹 save handler (tanpa mengubah email)
  function saveProfile() {
    const updated = {
      ...stored, // supaya email, memberSince, dsb tetap
      firstName: firstEl.value.trim(),
      lastName:  lastEl.value.trim(),
      phone:     phoneEl.value.trim()
    };

    // basic validation: cukup nama depan
    if (!updated.firstName) {
      alert('Isi minimal nama depan dulu ya 🙂');
      return;
    }

    localStorage.setItem(KEY, JSON.stringify(updated));

    // kembali ke halaman profile
    window.location.href = 'prl.html';
  }

  // wire save button dan submit form (Enter)
  saveBtn.addEventListener('click', saveProfile);
  document.getElementById('profile-form').addEventListener('submit', function (e) {
    e.preventDefault();
    saveProfile();
  });
});
