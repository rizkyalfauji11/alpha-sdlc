# Panduan bahasa sederhana — Bahasa Indonesia

Panduan ini mengikat lapisan bahasa sederhana di setiap ringkasan tahap, di semua fase: setup,
grooming, planning, slicing, uploading, development, testing, dan fixing. Bagian *Detail untuk
engineer* boleh tetap teknis.

## Judul bagian

Pakai judul ini, dalam urutan ini: **Intinya** · **Kenapa penting** · **Pilihan** · **Konteks** ·
**Detail untuk engineer**. Judul yang tidak dipakai boleh dilewati.

## Cara menulis

- Kalimat pertama menyebut apa yang terjadi dan apa yang dibutuhkan dari pembaca.
- Satu ide per kalimat. Kalimat yang disambung tanda pisah panjang, titik koma, atau kurung
  bertingkat dipecah menjadi beberapa kalimat.
- Pakai susunan kalimat bahasa Indonesia. Ungkapan bahasa Inggris tidak diterjemahkan kata per
  kata; tulis maksudnya langsung.
- Waktu dinyatakan dengan kata: masih, sudah, belum, tidak lagi, nanti.
- Sebut nama bendanya. Jangan pakai "ia" untuk dokumen, file, atau sistem.
- Nama kode (fungsi, package, interface, perintah) tidak masuk ke Intinya dan Kenapa penting.
  Ceritakan gunanya; nama kodenya masuk ke Detail.
- Rujukan (file dan baris, nomor bagian, ID) selalu disertai isinya dalam kalimat yang sama.
- Kutipan bahasa Inggris diceritakan ulang dalam bahasa Indonesia. Kutipan aslinya masuk ke Detail.
- Kalau pembaca diminta memilih, tulis pilihannya dan tandai rekomendasi dengan ★.
- **Laporan yang tidak meminta keputusan itu pendek:** Intinya ditambah satu paragraf pendek, paling
  banyak sekitar enam kalimat untuk seluruh lapisan bahasa sederhana. Sisanya masuk ke Detail.
  Panjang tulisan tidak menambah kejujuran; yang dibutuhkan pembaca adalah apa yang terjadi, dan
  apakah ada yang menunggu mereka.

## Istilah baku

Boleh dipakai apa adanya: commit, branch, push, merge, deploy, build, test, bug, endpoint, API,
server, database, review, PR.

Pakai istilah di tabel ini **persis seperti tertulis**, dan jangan mengarang padanan lain (misalnya
"syarat kelulusan" untuk kriteria penerimaan). Kalau kolom kanan memberi penjelasan untuk kemunculan
pertama, tulis penjelasan itu sekali di ringkasan, lalu cukup istilahnya.

| Jangan tulis (salah) | Tulis (benar) |
|---|---|
| hijau / merah (hasil test) | lolos / gagal |
| mendarat (dari *lands*) | selesai, masuk |
| stage | tahap |
| gate, checkpoint | titik persetujuan |
| scope | cakupan pekerjaan |
| AC, acceptance criteria | kriteria penerimaan — saat pertama muncul: *kriteria penerimaan (syarat fitur dianggap selesai)* |
| hub | dokumen induk (TRD bersama semua platform) |
| spoke | dokumen platform (TRD satu platform) |
| delta | file perubahan kontrak API |
| Open Decision | keputusan terbuka (belum diputuskan) |
| stamp, stempel | tanda persetujuan (tanggal dan commit) |
| test double, mock | objek tiruan untuk test |
| repo-wide | di seluruh repo |
| artefak otoritatif | dokumen acuan yang sudah disetujui |
| merge maknanya | menggabungkan isinya |
| slice, work slice | bagian pekerjaan |
| fresh eyes, fresh-eyes review | review independen |
| reviewer subagent | reviewer independen |
| resisted the temptation | saya sengaja tidak … |
| overclaim, klaim berlebih | mengklaim lebih dari yang sudah dicek |
| round (review) | putaran review |
| *"persis X yang Y ada untuk mencegah(nya)"* (dari *"exactly the X that Y exists to prevent"*) | *"Y dibuat justru untuk mencegah X"* |
| *"bukan tambahan sopan santun"* (dari *"not a courtesy"*) | *"bukan tambahan opsional"* |

## Contoh

**Sebelum:**

> Tapi hub §5:338 sekarang salah: ia berbunyi "openapi.yaml:1216 reads: …which is why no list
> route exists" — kalimat sekarang, tentang klausa yang baru saja saya hapus.

**Sesudah:**

> **Intinya:** dokumen induk sekarang memuat keterangan yang sudah tidak benar. Boleh saya perbaiki
> di tahap ini?
>
> **Kenapa penting:** di tahap ini saya menghapus satu kalimat dari spesifikasi API. Kalimat itu
> menjelaskan kenapa belum ada endpoint untuk mengambil daftar data. Dokumen induk (bagian 5,
> kontrak API) masih mengutip kalimat itu seolah-olah masih berlaku.

**Sebelum:**

> Menambah satu method ke port RunStore langsung membuat store.SetupStore tidak lagi memenuhi
> interface itu. Akibatnya make test merah repo-wide sampai Stage 3 mendarat.

**Sesudah:**

> **Kenapa penting:** rencana menyebut tahap ini aman untuk berhenti. Kalau tim benar-benar berhenti
> di sini, server tidak bisa di-build sampai tahap 3 (penyimpanan data) selesai.
>
> **Detail untuk engineer:** method baru di port `RunStore` membuat `store.SetupStore` tidak lagi
> memenuhi interface itu; hanya `cmd/server` yang gagal compile (`main.go:106`).
