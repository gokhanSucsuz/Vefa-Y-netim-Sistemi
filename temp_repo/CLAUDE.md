# Asevi Yönetim Sistemi — AI Kural Dosyası

> Bu dosyayı OKUDUĞUNDA: `.agent/rules/GEMINI.md` ve `.agent/ARCHITECTURE.md` dosyalarını da oku.
> Tüm kurallar `.agent/` klasöründe tanımlanmıştır.

---

## 🔴 ZORUNLU: İlk Okuma Listesi

Herhangi bir kod yazmadan veya öneri sunmadan önce şu dosyaları oku:

1. **`.agent/rules/GEMINI.md`** — Tüm evrensel kurallar (öncelik P0)
2. **`.agent/ARCHITECTURE.md`** — Ajan/Beceri/Script haritası
3. **`.agent/AGENT-INDEX.md`** — Tam referans kılavuzu (Türkçe özet)

---

## ⚡ Kritik Kurallar (Özet)

### Ajan Seçimi
- Her kodlama öncesi uygun ajanı seç ve duyur: `🤖 Applying knowledge of @[agent]...`
- Web → `frontend-specialist` | Mobil → `mobile-developer` | API → `backend-specialist`
- **Mobil projede frontend-specialist KULLANMA**

### Tasarım Yasakları
- 🚫 **MOR/VIOLET/INDIGO** renk — Hiçbir zaman (sormadan)
- 🚫 Standard Hero Split (Sol metin / Sağ görsel)
- 🚫 Bento Grid (landing page varsayılanı)
- 🚫 Glassmorphism (varsayılan)
- 🚫 shadcn/Radix — Kullanıcıya sormadan

### Sokratik Kapı
- Yeni özellik/inşa → En az 3 soru sor
- Belirsiz istek → Amaç, Kullanıcılar, Kapsam sor
- Asla varsayımda bulunma

### Kod Kalitesi
- Her dosya düzenlemesi sonrası: `npm run lint && npx tsc --noEmit`
- Sırları hardcode etme — `.env` kullan
- SQL injection yok — parameterize sorgular

### Plan Dosyaları
- Karmaşık görev → `{task-slug}.md` oluştur (proje kökünde)
- `plan.md` gibi genel isimler yasak

---

## 📁 Proje Teknoloji Yığını

```
Framework:    Next.js 15+ (App Router) + React 19
Veritabanı:   MongoDB (Mongoose)
Güvenlik:     AES-256 GCM, HMAC-SHA256
Stil:         Tailwind CSS
Dil:          TypeScript (strict mode)
OS:           Windows (PowerShell komutları kullan)
```

---

## 🏁 Son Kontrol Komutu

Kullanıcı "son kontrolleri yap" veya "final checks" dediğinde:

```bash
python .agent/scripts/checklist.py .
```

Deploy öncesi:
```bash
python .agent/scripts/verify_all.py . --url http://localhost:3000
```

---

> Tam kural seti: `.agent/AGENT-INDEX.md`
