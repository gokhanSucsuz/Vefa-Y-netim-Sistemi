# 🤖 Antigravity Kit — Tam Referans Kılavuzu

> `.agent/` klasörünün kapsamlı indeksi. Tüm kurallar, ajanlar, beceriler ve iş akışları bir arada.

---

## 📋 İçindekiler

1. [Genel Bakış](#genel-bakış)
2. [Kural Hiyerarşisi](#kural-hiyerarşisi)
3. [Temel Davranış Kuralları (GEMINI.md)](#temel-davranış-kuralları)
4. [Ajanlar (20 Ajan)](#ajanlar)
5. [Beceriler (36+ Beceri)](#beceriler)
6. [İş Akışları / Slash Komutları (11)](#iş-akışları)
7. [Doğrulama Scriptleri](#doğrulama-scriptleri)
8. [Hızlı Başvuru Kartları](#hızlı-başvuru-kartları)

---

## Genel Bakış

**Antigravity Kit**, modüler bir AI ajan sistemidir. Aşağıdaki bileşenlerden oluşur:

| Bileşen | Sayı | Klasör |
|---------|------|--------|
| Specialist Ajan | 20 | `.agent/agents/` |
| Beceri (Skill) | 36+ | `.agent/skills/` |
| İş Akışı (Workflow) | 11 | `.agent/workflows/` |
| Doğrulama Scripti | 4 (master) | `.agent/scripts/` |
| Global Kural | 1 | `.agent/rules/GEMINI.md` |

---

## Kural Hiyerarşisi

```
P0: GEMINI.md (rules/)     → Her zaman aktif, tüm kuralları ezer
P1: Agent .md (agents/)    → Ajan aktif olduğunda geçerli
P2: SKILL.md (skills/)     → İlgili beceri yüklendiğinde geçerli
```

> 🔴 **Kural:** P0 > P1 > P2. Daha yüksek öncelikli kural her zaman kazanır.

---

## Temel Davranış Kuralları

> Kaynak: `.agent/rules/GEMINI.md` — Her zaman aktif.

### 1. İstek Sınıflandırıcı (İlk Adım)

Her istekte önce türü belirle:

| İstek Türü | Tetikleyiciler | Sonuç |
|-----------|----------------|-------|
| **SORU** | "nedir", "nasıl çalışır", "açıkla" | Sadece metin yanıt |
| **TARAMA** | "analiz et", "dosyaları listele" | Keşif raporu |
| **BASİT KOD** | "düzelt", "ekle", "değiştir" | Tek dosya düzenleme |
| **KARMAŞIK KOD** | "inşa et", "oluştur", "refactor" | `{task-slug}.md` zorunlu |
| **TASARIM/UI** | "tasarla", "UI", "sayfa", "dashboard" | `{task-slug}.md` zorunlu |
| **SLASH KOMUT** | /create, /debug, /orchestrate | Komuta özel akış |

### 2. Ajan Seçimi (Otomatik)

Her kod/tasarım yanıtından önce bu kontrol listesini tamamla:

| Adım | Kontrol |
|------|---------|
| 1 | Bu domain için doğru ajan seçildi mi? |
| 2 | Ajanın `.md` dosyası okundu mu? |
| 3 | `🤖 Applying knowledge of @[agent]...` duyurusu yapıldı mı? |
| 4 | Ajanın `skills:` frontmatter'ından gerekli beceriler yüklendi mi? |

### 3. Dil Kuralı

- Kullanıcı Türkçe yazıyorsa → Türkçe yanıt ver
- Kod yorumları ve değişken isimleri → İngilizce kal

### 4. Proje Tipi Yönlendirmesi

| Proje Tipi | Birincil Ajan | Yasak |
|------------|---------------|-------|
| **MOBİL** (iOS, Android, RN, Flutter) | `mobile-developer` | ❌ frontend-specialist |
| **WEB** (Next.js, React) | `frontend-specialist` | ❌ mobile-developer |
| **BACKEND** (API, sunucu, DB) | `backend-specialist` | — |

> 🔴 **Mobil proje + frontend-specialist = YANLIŞ.** Mobil = yalnızca mobile-developer.

### 5. Sokratik Kapı (Zorunlu)

Karmaşık isteklerde **önce sor, sonra yaz**:

| İstek Türü | Strateji | Gerekli Eylem |
|-----------|----------|---------------|
| Yeni Özellik / İnşa | Derin Keşif | En az 3 stratejik soru sor |
| Kod Düzenleme / Bug Fix | Bağlam Kontrolü | Anlayışı onayla + etki soruları sor |
| Belirsiz / Basit | Açıklama | Amaç, Kullanıcılar ve Kapsam sor |
| Tam Orkestrasyon | Kapı Bekçisi | Kullanıcı planı onaylayana kadar DUR |

### 6. Son Kontrol Komutu

Kullanıcı "son kontrolleri yap", "final checks", "çalıştır tüm testleri" dediğinde:

```bash
# Hızlı geliştirme denetimi
python .agent/scripts/checklist.py .

# Deploy öncesi tam doğrulama
python .agent/scripts/checklist.py . --url <URL>
```

**Öncelik sırası:** Security → Lint → Schema → Tests → UX → SEO → Lighthouse/E2E

### 7. Temiz Kod Kuralları

- Öz, doğrudan, aşırı mühendislik yok
- Test zorunlu: Piramit (Birim > Entegrasyon > E2E) + AAA Deseni
- Performans: Önce ölç, sonra optimize et
- Sırlar: `.env` dosyasında, kesinlikle hardcode yok

---

## Ajanlar

> Klasör: `.agent/agents/` — 20 Specialist Ajan

### Ana Ajan Tablosu

| Ajan | Odak Alanı | Kullandığı Beceriler | Ne Zaman Kullanılır |
|------|------------|---------------------|---------------------|
| `orchestrator` | Çoklu ajan koordinasyonu | parallel-agents, behavioral-modes, plan-writing | Karmaşık çok-katmanlı görevler |
| `project-planner` | Keşif, görev planlaması | brainstorming, plan-writing, architecture | Yeni proje başlangıcı, büyük özellik planlaması |
| `frontend-specialist` | Web UI/UX | frontend-design, react-best-practices, tailwind-patterns | React/Next.js bileşenleri, UI tasarımı |
| `backend-specialist` | API, iş mantığı | api-patterns, nodejs-best-practices, database-design | API geliştirme, sunucu mantığı, DB entegrasyonu |
| `database-architect` | Şema, SQL | database-design | Veritabanı tasarımı, migrasyon |
| `mobile-developer` | iOS, Android, RN | mobile-design | Mobil uygulama geliştirme |
| `game-developer` | Oyun mantığı | game-development | Oyun geliştirme (Unity, Godot, Phaser) |
| `devops-engineer` | CI/CD, Docker | deployment-procedures | Deployment, altyapı kurulumu |
| `security-auditor` | Güvenlik uyumu | vulnerability-scanner, red-team-tactics | Auth, güvenlik açıkları, OWASP |
| `penetration-tester` | Saldırgan güvenlik | red-team-tactics | Aktif güvenlik testi |
| `test-engineer` | Test stratejileri | testing-patterns, tdd-workflow, webapp-testing | Birim/E2E test, kapsam |
| `debugger` | Kök neden analizi | systematic-debugging | Karmaşık hatalar, üretim sorunları |
| `performance-optimizer` | Hız, Web Vitals | performance-profiling | Performans optimizasyonu |
| `seo-specialist` | Sıralama, görünürlük | seo-fundamentals, geo-fundamentals | SEO optimizasyonu |
| `documentation-writer` | Belgeler, kılavuzlar | documentation-templates | **Yalnızca kullanıcı açıkça istediğinde** |
| `product-manager` | Gereksinimler, user stories | plan-writing, brainstorming | Ürün gereksinimleri |
| `product-owner` | Strateji, backlog, MVP | plan-writing, brainstorming | Ürün stratejisi |
| `qa-automation-engineer` | E2E test, CI pipeline | webapp-testing, testing-patterns | Test otomasyonu |
| `code-archaeologist` | Legacy kod, refactoring | clean-code, code-review-checklist | Eski kod analizi |
| `explorer-agent` | Kod tabanı analizi | — | Keşif, bağımlılık haritası |

---

### Kritik Ajan Kuralları

#### Orchestrator Kuralları
1. **Plan dosyası olmadan ajan çağırma** → `{task-slug}.md` önce oluşturulmalı
2. **Ajan sınırlarına uy** — Her ajan kendi alanında kalır:
   - `frontend-specialist` → Test dosyası yazamaz
   - `backend-specialist` → UI bileşeni yazamaz
   - `test-engineer` → Production kod yazamaz
3. Pre-flight kontrol: Plan var mı? Proje tipi belirlendi mi? Ajan ataması doğru mu?

#### Frontend Specialist Tasarım Kuralları
- 🚫 **MOR YASAK** — Hiçbir zaman violet/purple/indigo renk kullanma (sormadan)
- 🚫 **Şablon Yasak** — Standart/klişe tasarımlar yasak
- 🚫 **Yasak Elementler:**
  - Standard Hero Split (Sol içerik / Sağ görsel) → KLIŞE
  - Bento Grid (landing page'de varsayılan) → KLIŞE
  - Mesh/Aurora Gradient → KLIŞE
  - Glassmorphism → KLIŞE
  - Fintech Mavi → KLIŞE
- ✅ **Deep Design Thinking** → Her tasarımdan önce zorunlu
- ✅ **Animasyon Zorunlu** → Scroll-trigger, micro-interaction, spring physics
- ✅ **UI Kütüphanesi** → shadcn, Radix kullanmadan önce MUTLAKA sor

#### Backend Specialist Kuralları
- Her input'u validate et, asla güvenme
- Parameterize sorgular kullan, SQL injection'a izin verme
- Sırları hardcode etme, `.env` kullan
- Controller → Service → Repository katmanlı mimari

#### Debugger Kuralları (4 Faz)
1. **REPRODUCE** — Önce tekrar üret
2. **ISOLATE** — Sorumlu bileşeni bul
3. **UNDERSTAND** — 5 Neden tekniği ile kök neden
4. **FIX & VERIFY** — Düzelt + test ekle + benzer kodu kontrol et

#### Project Planner Kuralları
- Plan modu: **KOD YAZMA** — Sadece `{task-slug}.md` dosyası yaz
- 4 Faz: ANALYSIS → PLANNING → SOLUTIONING → IMPLEMENTATION
- Plan dosya adı: `{task-slug}.md` (proje kökünde), `plan.md` gibi genel isimler yasak
- Klasör adından proje tipini çıkarma → Yalnızca sağlanan bağlamı kullan

---

## Beceriler

> Klasör: `.agent/skills/` — Ajan isteğe bağlı yükler

### Frontend & UI

| Beceri | Açıklama |
|--------|----------|
| `react-best-practices` | React & Next.js performans optimizasyonu (57 kural) |
| `web-design-guidelines` | Web UI denetimi — 100+ erişilebilirlik, UX, performans kuralı |
| `tailwind-patterns` | Tailwind CSS v4 utilities |
| `frontend-design` | UI/UX desenleri, tasarım sistemleri |

### Backend & API

| Beceri | Açıklama |
|--------|----------|
| `api-patterns` | REST, GraphQL, tRPC seçimi ve tasarımı |
| `nodejs-best-practices` | Node.js async desenleri, güvenlik, mimari |
| `python-patterns` | Python standartları, FastAPI |

### Veritabanı

| Beceri | Açıklama |
|--------|----------|
| `database-design` | Şema tasarımı, indeksleme, ORM seçimi |

### Test & Kalite

| Beceri | Açıklama |
|--------|----------|
| `testing-patterns` | Jest, Vitest, test stratejileri |
| `webapp-testing` | E2E, Playwright |
| `tdd-workflow` | Test-driven development |
| `code-review-checklist` | Kod inceleme standartları |
| `lint-and-validate` | Linting, doğrulama |

### Güvenlik

| Beceri | Açıklama |
|--------|----------|
| `vulnerability-scanner` | Güvenlik denetimi, OWASP 2025 |
| `red-team-tactics` | Saldırgan güvenlik, MITRE ATT&CK |

### Mimari & Planlama

| Beceri | Açıklama |
|--------|----------|
| `app-builder` | Full-stack uygulama iskeleti |
| `architecture` | Sistem tasarımı desenleri |
| `plan-writing` | Görev planlaması, bölümleme |
| `brainstorming` | Sokratik sorgulama |
| `intelligent-routing` | Otomatik ajan seçimi |
| `behavioral-modes` | Ajan persona modları |
| `parallel-agents` | Çoklu ajan desenleri |

### Mobil

| Beceri | Açıklama |
|--------|----------|
| `mobile-design` | Mobil UI/UX desenleri, dokunmatik etkileşim |

### SEO & Büyüme

| Beceri | Açıklama |
|--------|----------|
| `seo-fundamentals` | SEO, E-E-A-T, Core Web Vitals |
| `geo-fundamentals` | AI arama motoru optimizasyonu |

### Shell/CLI

| Beceri | Açıklama |
|--------|----------|
| `bash-linux` | Linux komutları, scripting |
| `powershell-windows` | Windows PowerShell (bu proje için kritik!) |

### Diğer

| Beceri | Açıklama |
|--------|----------|
| `clean-code` | Global kodlama standartları |
| `deployment-procedures` | CI/CD, deploy iş akışları |
| `server-management` | Altyapı yönetimi |
| `performance-profiling` | Web Vitals, optimizasyon |
| `systematic-debugging` | Hata ayıklama metodolojisi |
| `documentation-templates` | Belge formatları |
| `i18n-localization` | Uluslararasılaştırma |
| `mcp-builder` | Model Context Protocol |

### Beceri Yükleme Protokolü

```
Kullanıcı İsteği → Beceri Açıklaması Eşleşmesi → SKILL.md Yükle
                                                          ↓
                                                  references/ Oku
                                                          ↓
                                                  scripts/ Çalıştır
```

---

## İş Akışları

> Klasör: `.agent/workflows/` — Slash komutları ile çağrılır

| Komut | Açıklama | Ne Zaman Kullanılır |
|-------|----------|---------------------|
| `/brainstorm` | Sokratik keşif | Fikirler netleştirilmeden önce |
| `/create` | Yeni özellik/uygulama oluştur | Sıfırdan başlarken |
| `/debug` | Sistematik hata ayıklama | Hata var, neden bilinmiyor |
| `/deploy` | Üretim deployment | Canlıya almadan önce |
| `/enhance` | Mevcut kodu geliştir | İteratif geliştirme |
| `/orchestrate` | Çoklu ajan koordinasyonu | Çok-alanlı karmaşık görev |
| `/plan` | Proje planı oluştur | Büyük özellik planlaması |
| `/preview` | Preview sunucusu | Lokal test |
| `/status` | Proje durumu | İlerleme takibi |
| `/test` | Test oluştur/çalıştır | Test coverage ekle |
| `/ui-ux-pro-max` | UI tasarımı (50 stil) | Premium UI geliştirme |

---

## Doğrulama Scriptleri

> Klasör: `.agent/scripts/`

### Master Scriptler

| Script | Amaç | Ne Zaman |
|--------|------|----------|
| `checklist.py` | Öncelikli doğrulama (temel kontroller) | Her geliştirme döngüsünde |
| `verify_all.py` | Kapsamlı doğrulama (tüm kontroller) | Deploy öncesi |
| `auto_preview.py` | Otomatik preview sunucusu | Test sırasında |
| `session_manager.py` | Oturum yönetimi | — |

### Kullanım

```bash
# Hızlı geliştirme denetimi
python .agent/scripts/checklist.py .

# Deploy öncesi tam doğrulama
python .agent/scripts/verify_all.py . --url http://localhost:3000
```

### checklist.py Kontrol Sırası

1. **Güvenlik** (P0) — Açıklar, sırlar
2. **Lint** (P1) — Kod kalitesi
3. **Şema** (P2) — Veritabanı şeması
4. **Testler** (P3) — Test paketi
5. **UX** (P4) — Kullanıcı deneyimi denetimi
6. **SEO** (P5) — SEO kontrolü
7. **Lighthouse/E2E** (P6) — Performans + Playwright

### Beceri Düzeyi Scriptler (12 adet)

| Script | Beceri | Ne Zaman |
|--------|--------|----------|
| `security_scan.py` | vulnerability-scanner | Her deploy'da |
| `dependency_analyzer.py` | vulnerability-scanner | Haftalık / Deploy |
| `lint_runner.py` | lint-and-validate | Her kod değişikliğinde |
| `test_runner.py` | testing-patterns | Mantık değişikliğinden sonra |
| `schema_validator.py` | database-design | DB değişikliğinden sonra |
| `ux_audit.py` | frontend-design | UI değişikliğinden sonra |
| `accessibility_checker.py` | frontend-design | UI değişikliğinden sonra |
| `seo_checker.py` | seo-fundamentals | Sayfa değişikliğinden sonra |
| `bundle_analyzer.py` | performance-profiling | Deploy öncesi |
| `mobile_audit.py` | mobile-design | Mobil değişiklikten sonra |
| `lighthouse_audit.py` | performance-profiling | Deploy öncesi |
| `playwright_runner.py` | webapp-testing | Deploy öncesi |

---

## Hızlı Başvuru Kartları

### 📌 Kart 1 — Domain'e Göre Ajan

| İhtiyaç | Ajan | Beceriler |
|---------|------|-----------|
| Web Uygulaması | `frontend-specialist` | react-best-practices, frontend-design |
| API / Backend | `backend-specialist` | api-patterns, nodejs-best-practices |
| Mobil Uygulama | `mobile-developer` | mobile-design |
| Veritabanı | `database-architect` | database-design |
| Güvenlik | `security-auditor` | vulnerability-scanner |
| Test | `test-engineer` | testing-patterns, webapp-testing |
| Hata Ayıklama | `debugger` | systematic-debugging |
| Planlama | `project-planner` | brainstorming, plan-writing |
| Çok Alanlı | `orchestrator` | parallel-agents |

---

### 📌 Kart 2 — Tasarım Kırmızı Çizgiler

```
🚫 MOR YASAK      → violet, purple, indigo, magenta
🚫 BENTO TUZAĞI  → Landing page'de varsayılan ızgara
🚫 HERO SPLIT     → Sol metin / Sağ görsel (klişe)
🚫 GLASSMORPHISM  → Varsayılan blur+sınır combo
🚫 MESH GRADIENT  → Yüzen renkli blob'lar
🚫 VARSAYILAN BLUE → Fintech mavi kaçış paleti
🚫 SHADCN/RADIX   → Sormadan kullanma
```

**Bunun yerine:**
- Parlak, cesur renkler (kırmızı, turuncu, neon yeşil, siyah-altın)
- Asimetrik düzenler (90/10 bölünme)
- Tipografik brutalismus
- Scroll-tetikli animasyonlar + spring physics
- Micro-interaction geri bildirimi

---

### 📌 Kart 3 — Yasaklar Özeti

| Kategori | Yasak |
|---------|-------|
| Ajan seçimi | Ajanı okumadan kod yazmak |
| Tasarım | Mor/violet renk (sormadan) |
| Tasarım | Standart şablon düzeni |
| Tasarım | shadcn/Radix (sormadan) |
| Güvenlik | Hardcoded sırlar |
| Plan | `plan.md` gibi genel isimler |
| Plan | Plan dosyası olmadan ajan çağırmak |
| Mobil | Mobil projede frontend-specialist kullanmak |
| Orkestrasyon | Sokratik gate'i atlamak |

---

### 📌 Kart 4 — Plan Dosyası Adlandırma

```
"e-ticaret sitesi"         → ecommerce-site.md
"dark mode ekle"           → dark-mode.md
"giriş hatası düzelt"      → login-fix.md
"auth sistemi refactor"    → auth-refactor.md
```

Kurallar:
- Küçük harf, tire ile ayrılmış (kebab-case)
- 2-3 anahtar kelime
- Maks 30 karakter
- Proje kökünde (not: `docs/` klasöründe değil)

---

### 📌 Kart 5 — Kalite Kontrol Döngüsü

Her dosyayı düzenledikten sonra:

```bash
# 1. Linting çalıştır
npm run lint && npx tsc --noEmit

# 2. Tüm hataları düzelt

# 3. Fonksiyonelliği doğrula

# 4. Yalnızca kontroller geçtikten sonra tamamlandı olarak raporla
```

---

### 📌 Kart 6 — Orchestrator Pre-Flight Kontrol

```
1. Plan dosyası var mı?     → YOK ise: project-planner çağır
2. Proje tipi belirlendi mi? → WEB/MOBİL/BACKEND
3. Ajan ataması doğru mu?    → Mobil → mobile-developer ONLY
4. Sokratik gate geçildi mi? → 3 soru soruldu mu?
```

---

*Bu belge `.agent/` klasöründeki tüm kılavuz ve kural dosyalarından sentezlenmiştir.*
*Son güncelleme: 2026-04-30*
