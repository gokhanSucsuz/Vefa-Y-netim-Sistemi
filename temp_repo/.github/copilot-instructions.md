# GitHub Copilot — Asevi Yönetim Sistemi Kuralları

> Bu proje **Antigravity Kit** kural sistemi kullanır.
> Tam kural seti: `.agent/AGENT-INDEX.md` | Evrensel kurallar: `.agent/rules/GEMINI.md`

## Proje Bağlamı

T.C. Edirne SYDV Aşevi Yönetim Sistemi — Next.js 15+ / MongoDB / TypeScript

## Kritik Geliştirme Kuralları

### Güvenlik (P0)
- AES-256 GCM şifreleme — TC Kimlik No ve kişisel veriler ASLA düz metin
- `.env` dosyasını kullan — sırları hardcode etme
- Tüm input'u validate et

### Kod Kalitesi
- TypeScript strict mode — `any` kullanma
- Layered mimari: Controller → Service → Repository
- Hata yönetimi merkezi olmalı

### Tasarım
- Mor/violet renk KULLANMA
- shadcn veya UI kütüphanesi kullanmadan önce sor
- Animasyon zorunlu: scroll-trigger, micro-interaction

### Planlama
- Karmaşık değişiklik → önce plan dosyası oluştur
- Belirsiz istek → önce soru sor

## Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Framework | Next.js 15+ App Router |
| Veritabanı | MongoDB (Mongoose) |
| Stil | Tailwind CSS |
| Dil | TypeScript |
| İkon | Lucide React |
| PDF | jsPDF |

## Kısıtlamalar

- Windows ortamı (PowerShell komutları)
- KVKK uyumluluğu zorunlu
- Türkçe arayüz
