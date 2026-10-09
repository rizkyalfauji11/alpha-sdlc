---
expected: pass
rules: []
language: id
context: sdlc
source: d0b331c — the fixed planning summary, with the Selanjutnya paragraph rule 10 now needs
---
run-terminal · Planning (web) · Langkah 1 dari 5: ringkasan cakupan · ⏸ butuh review

**Intinya:** Pekerjaan web-nya adalah satu layar — tombol melayang di setiap halaman dan panel yang dibukanya — ditambah dua perbaikan bug lama yang harus selesai lebih dulu. Semuanya terbagi jadi delapan bagian pekerjaan dengan 85 kriteria penerimaan (syarat fitur dianggap selesai). Saya butuh konfirmasi bahwa ringkasan ini benar, dan keputusan soal satu prasyarat backend yang belum selesai.

**Kenapa penting:** Tombol melayang butuh jam mulai run dari backend. Tanpa data itu, tombol tidak bisa berhenti menanyai server untuk run yang tidak pernah melapor.

**Pilihan:**
- ★ (a) Rencanakan lengkap, lalu catat pekerjaan backend itu sebagai syarat mulai tahap tombol melayang.
- (b) Rencanakan tanpa aturan berhenti itu. Akibatnya satu kriteria penerimaan tidak dibangun di tahap mana pun. Aturan cakupan dibuat justru untuk mencegah hal seperti ini.
- (c) Hentikan planning sampai pekerjaan backend selesai.

**Konteks:** Dua perbaikan bug itu bukan tambahan opsional. Panel ini yang membuat keduanya berbahaya, karena panel tidak pernah dilepas dari halaman.

**Detail untuk engineer:** BE3 `SetupRunView.startedAt` uncommitted in the backend repo (`openapi.yaml:3498`); `pnpm api:gen` reads the working tree.

**Selanjutnya:** Saya menunggu konfirmasi ringkasan dan jawaban Anda soal pilihan di atas.
