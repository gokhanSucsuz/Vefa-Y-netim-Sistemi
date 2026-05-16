# 🔄 AI Kural Kalıcılığı — Kurulum Kılavuzu

> Herhangi bir AI aracı, herhangi bir proje, herhangi bir oturum — kurallar her zaman aktif.

---

## Sorun

Her yeni AI oturumu "boş sayfa" ile başlar. Aşağıdaki strateji bunu çözer.

---

## Katman 1 — Proje Düzeyi (Bu Projeye Özel)

Bu dosyalar proje klasöründe olduğunda, ilgili AI aracı otomatik okur:

| Dosya | Okuyan AI | Durum |
|-------|-----------|-------|
| `.agent/rules/GEMINI.md` (`trigger: always_on`) | Antigravity/Gemini | ✅ Mevcut |
| `CLAUDE.md` | Claude Code, Claude.ai | ✅ Oluşturuldu |
| `.cursorrules` | Cursor IDE | ✅ Oluşturuldu |
| `.github/copilot-instructions.md` | GitHub Copilot | ✅ Oluşturuldu |

**Bu dosyalar ne yapar:** AI proje klasörünü her açtığında bu dosyaları otomatik okur ve kurallar aktif hale gelir.

---

## Katman 2 — Yeni Proje Kurulumu

Yeni bir projeye bu kural sistemini taşımak için:

### Adım 1: `.agent/` Klasörünü Kopyala

```powershell
# Kaynak projeden hedef projeye kopyala
Copy-Item -Path "C:\Projeler\mevcut-proje\.agent" `
          -Destination "C:\Projeler\yeni-proje\.agent" `
          -Recurse
```

### Adım 2: Şablon Dosyaları Oluştur

Aşağıdaki dosyaları yeni projeye kopyala ve proje bilgilerini güncelle:

```powershell
# Proje kökündeki kural dosyaları
Copy-Item ".\CLAUDE.md" "C:\Projeler\yeni-proje\CLAUDE.md"
Copy-Item ".\.cursorrules" "C:\Projeler\yeni-proje\.cursorrules"
Copy-Item ".\.github\copilot-instructions.md" `
          "C:\Projeler\yeni-proje\.github\copilot-instructions.md"
```

### Adım 3: Proje Bilgilerini Güncelle

`CLAUDE.md` dosyasındaki **Proje Teknoloji Yığını** bölümünü yeni projeye göre düzenle.

---

## Katman 3 — Sistem Genelinde (Tüm Projeler)

Bazı AI araçları kullanıcı düzeyinde global kurallar destekler:

### Claude.ai / Anthropic
**Ayarlar → Custom Instructions** bölümüne yapıştır:

```
Bu workspace'de .agent/rules/GEMINI.md dosyası varsa onu oku.
CLAUDE.md varsa onu oku. Bu dosyalar olmasa da şu kurallar geçerli:
1. Mor/violet renk kullanma (sormadan)
2. Kod yazmadan önce hangi ajan rolünü kullandığını belirt
3. Karmaşık istek → önce soru sor
4. TypeScript strict, 'any' yok
5. Sırları .env'de tut
```

### Cursor IDE
**Cursor → Settings → Rules for AI** bölümüne şunu yaz:

```
Proje kökünde .cursorrules dosyası varsa önce oku ve uygula.
```

### VS Code + Copilot
`.github/copilot-instructions.md` dosyası her projede otomatik okunur.
Globali yok — proje bazlı çalışır.

---

## Katman 4 — AI Kotası Dolduğunda El Değiştirme

Bir AI'ın kotası dolduğunda yeni AI'a bağlamı aktarmak için:

### Yöntem A: Bağlam Aktarım Mesajı (Manuel)

Yeni AI oturumunu şu mesajla başlat:

```
Bu proje Antigravity Kit kural sistemi kullanıyor.
Lütfen şu dosyaları bu sırayla oku:
1. .agent/rules/GEMINI.md
2. .agent/ARCHITECTURE.md  
3. .agent/AGENT-INDEX.md
4. CLAUDE.md

Sonra mevcut görevle devam et: [GÖREV AÇIKLAMASI]
```

### Yöntem B: Görev Dosyası Oluştur (Otomatik)

Karmaşık görevler için `{task-slug}.md` dosyası proje kökünde oluştur.
Yeni AI bu dosyayı okuyarak tam bağlamı anlar.

### Yöntem C: CODEBASE.md (En İyi Yöntem)

Proje kökünde `CODEBASE.md` dosyası oluştur:

```markdown
# CODEBASE.md
OS: Windows
Framework: Next.js 15+
DB: MongoDB
Rules: .agent/rules/GEMINI.md
Agent Index: .agent/AGENT-INDEX.md
```

Bu dosyayı her okuyan AI hemen bağlamı anlar.

---

## Kontrol Listesi — Yeni Proje için

```
[ ] .agent/ klasörünü kopyala
[ ] CLAUDE.md oluştur (proje bilgileriyle güncelle)
[ ] .cursorrules oluştur
[ ] .github/copilot-instructions.md oluştur
[ ] CODEBASE.md oluştur (opsiyonel ama önerilir)
[ ] .gitignore içinde .agent/ klasörünü DIŞARIDA BIRAK
    (kurallar git'e dahil olsun, her makinede çalışsın)
```

---

## .gitignore Uyarısı

`.agent/` klasörünü `.gitignore`'a EKLEME. Git'te olsun ki:
- Başka geliştiriciler aynı kuralları otomatik alsın
- CI/CD sistemleri kuralları okuyabilsin
- Ekip genelinde tutarlı AI davranışı sağlansın

---

## Özet

| Senaryo | Çözüm |
|---------|-------|
| Aynı projede yeni AI oturumu | Proje dosyaları otomatik okunur ✅ |
| Farklı AI aracı (Claude → Cursor) | `.cursorrules` + `CLAUDE.md` + Copilot dosyası ✅ |
| Farklı proje | `.agent/` klasörünü kopyala + şablon dosyaları güncelle |
| AI kotası doldu | Bağlam aktarım mesajı veya `{task-slug}.md` dosyası |
| Takım çalışması | Git'te `.agent/` dahil → herkes aynı kuralları alır |
