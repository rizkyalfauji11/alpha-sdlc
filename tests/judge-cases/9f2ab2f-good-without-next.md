---
expected: fail
rules: [10]
language: id
context: sdlc
source: c6defc0 good rewrite (plain-language/id.md, Sesudah 2 in full); since 9f2ab2f it lacks the closing Selanjutnya
---
`setup-runs` · Development (backend) · Tahap 2 dari 4 · ⏸ perlu keputusan Anda

**Intinya:** aturan tentang siapa boleh melihat daftar proses penyiapan milik siapa sudah selesai dibuat, dan semua test-nya lolos. Belum ada layar atau endpoint yang memakainya. Ada satu masalah: menurut rencana, seluruh kode tetap bisa di-build setelah tahap ini, padahal tidak bisa. Sebelum lanjut ke tahap 3 (penyimpanan data), saya butuh Anda memilih salah satu jalan keluar di bawah.

**Kenapa penting:** rencana menyebut tahap ini aman untuk berhenti. Kalau tim benar-benar berhenti di sini, server tidak bisa di-build.

**Pilihan:**
- ★ Tambahkan versi sementara di penyimpanan data sekarang, supaya server tetap bisa di-build. Alasannya: tahap ini tetap aman untuk berhenti.
- Gabungkan tahap 2 dan 3. Alasannya: tidak ada kode sementara, tapi perubahan yang direview jadi lebih besar.

**Detail untuk engineer:** method baru di port `RunStore` membuat `store.SetupStore` tidak lagi memenuhi interface itu; hanya `cmd/server` yang gagal compile (`main.go:106`).
