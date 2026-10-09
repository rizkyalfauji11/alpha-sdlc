---
expected: fail
rules: [2, 3, 5, 6, 8, 10]
language: id
context: sdlc
source: c6defc0 — real bad output 2 (holds plain-language/id.md, Sebelum 2)
---
Bottom line. Lapisan domain untuk daftar run sudah jadi dan seluruh testnya hijau. Secara awam: aplikasi sekarang punya "aturan siapa boleh melihat run siapa", tapi belum ada layar atau alamat web yang memakainya. Satu masalah muncul: plan menjanjikan go build ./... hijau di checkpoint ini, dan itu tidak mungkin tercapai. Saya butuh Anda memilih jalan keluarnya sebelum Stage 3.

Kenapa ini penting. Menambah satu method ke port RunStore langsung membuat store.SetupStore tidak lagi memenuhi interface itu. Store baru mengimplementasikannya di Stage 3. Jadi persis satu package gagal build sekarang, yaitu cmd/server (composition root, tempat store disuntikkan ke service di main.go:106). Akibatnya make test merah repo-wide sampai Stage 3 mendarat.
