# Takipçi Paneli

Instagram takip ve otomasyon paneli. Express API + SQLite + React (Vite) + Python stealth köprüsü. Replit'te bulut üzerinde ya da kendi bilgisayarınızda çalışır.

---

## İçindekiler

1. [Hızlı başlangıç — Replit](#1-hızlı-başlangıç--replit)
2. [Kendi bilgisayarınızda kurulum](#2-kendi-bilgisayarınızda-kurulum)
   - [Gereksinimler](#gereksinimler)
   - [Adım adım kurulum](#adım-adım-kurulum)
   - [Windows'a özel notlar](#windowsa-özel-notlar)
3. [Python köprüsü (Instagram girişi için)](#3-python-köprüsü-instagram-girişi-için)
4. [Tarayıcı eklentisi](#4-tarayıcı-eklentisi)
5. [Varsayılan giriş bilgileri](#5-varsayılan-giriş-bilgileri)
6. [Ortam değişkenleri](#6-ortam-değişkenleri)
7. [Veritabanı yönetimi](#7-veritabanı-yönetimi)
8. [Prodüksiyon build](#8-prodüksiyon-build)
9. [Proje yapısı](#9-proje-yapısı)
10. [Sık karşılaşılan sorunlar](#10-sık-karşılaşılan-sorunlar)

---

## 1. Hızlı başlangıç — Replit

Replit üzerinde tüm altyapı zaten kurulu gelir.

```
Workflows → "artifacts/api-server: API Server"   → Başlat
Workflows → "artifacts/takipci-paneli: web"       → Başlat
```

İlk açılışta veritabanı boşsa aşağıdaki komutu Shell'de bir kez çalıştırın:

```bash
pnpm --filter @workspace/db run push && pnpm --filter @workspace/scripts run db:seed-admin
```

Panel `admin` / `admin123` ile açılır.

---

## 2. Kendi bilgisayarınızda kurulum

### Gereksinimler

| Araç | Minimum sürüm | İndirme |
|---|---|---|
| Node.js | 20 LTS | [nodejs.org](https://nodejs.org) |
| pnpm | herhangi | `npm install -g pnpm` |
| Python | 3.10+ (opsiyonel*) | [python.org](https://python.org) |

> \* Python yalnızca Instagram şifre girişi ve funcaptcha çözücü için gereklidir. Cookie ile giriş yapıyorsanız (tarayıcı eklentisiyle) Python olmadan da çalışır.

Doğrulama:
```bash
node --version   # v20.x.x veya üzeri
pnpm --version
python3 --version   # 3.10.x veya üzeri (opsiyonel)
```

---

### Adım adım kurulum

**1. Depoyu klonlayın**

```bash
git clone <repo-url>
cd takipci-paneli
```

**2. Bağımlılıkları kurun**

```bash
pnpm install
```

Monorepo'daki tüm paketleri tek seferde kurar. İşletim sisteminize uygun native binary'ler (esbuild, Vite/rollup, Tailwind) otomatik indirilir.

**3. `.env` dosyasını oluşturun**

```bash
# Linux / macOS
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

`.env` dosyasını açıp en azından `SESSION_SECRET` değerini değiştirin:

```env
SESSION_SECRET=buraya-uzun-rastgele-bir-sifre-yazin
```

**4. Veritabanı şemasını oluşturun**

```bash
pnpm --filter @workspace/db run push
```

`lib/db/data.db` dosyasını (SQLite) oluşturur; Docker veya harici Postgres **gerekmez**.

**5. Varsayılan admin hesabını yükleyin**

```bash
# Linux / macOS
./scripts/db-restore.sh

# Windows PowerShell
.\scripts\db-restore.ps1
```

**6. API sunucusunu başlatın** *(bu terminali açık bırakın)*

```bash
pnpm --filter @workspace/api-server run dev
```

`Server listening / port: 3000` mesajını görünce hazır demektir.

**7. Yeni terminal açıp frontend'i başlatın** *(bu terminali de açık bırakın)*

```bash
pnpm --filter @workspace/takipci-paneli run dev
```

**8. Tarayıcıda açın**

[http://localhost:5173](http://localhost:5173)

---

### Windows'a özel notlar

- Native bağımlılıklar (esbuild, rollup, Tailwind) için Visual Studio Build Tools **gerekmez** — `pnpm install` doğru binary'leri otomatik indirir.
- `cross-env` kullanıldığı için tüm `pnpm` komutları PowerShell, cmd ve bash'te aynı şekilde çalışır.
- Uzun yol hatası alırsanız projeyi kısa bir konuma (`C:\dev\proje`) klonlayın.
- Python kurulurken **"Add Python to PATH"** seçeneğini işaretlemeyi unutmayın. Kurulum sonrası terminali yeniden açın.

---

## 3. Python köprüsü (Instagram girişi için)

Instagram'a şifre ile doğrudan giriş yapmak için Python stealth köprüsü gerekir. Cookie ile giriş yapıyorsanız (bkz. [Tarayıcı eklentisi](#4-tarayıcı-eklentisi)) bu adımı atlayabilirsiniz.

**Linux / macOS:**

```bash
bash scripts/setup-python.sh
```

**Windows:**

```powershell
.\scripts\setup-python.ps1
```

Bu komut `.venv/` klasörünü oluşturur ve gerekli Python paketlerini (`curl_cffi`, `flask`, `cryptography` vb.) kurar. API sunucusu bir sonraki başlatışında köprüyü otomatik olarak bulur.

> Python bulunamazsa `.env` dosyasına şunu ekleyin:
> ```env
> # Linux/macOS
> STEALTH_REQUESTS_PYTHON=.venv/bin/python3
>
> # Windows
> STEALTH_REQUESTS_PYTHON=.venv\Scripts\python.exe
> ```

---

## 4. Tarayıcı eklentisi

Eklenti, Instagram'a giriş yaptığınız tarayıcıdan oturum bilgisini (session cookie) otomatik olarak okuyup panele gönderir. Şifre, Python köprüsü veya developer tools açmanıza gerek kalmaz.

### Build (kaynak koddan)

```bash
pnpm --filter @workspace/browser-extension run build
```

Çıktılar:
- `artifacts/browser-extension/dist/takipci-paneli-chrome.zip` — Chrome ve Edge için
- `artifacts/browser-extension/dist/takipci-paneli-firefox.zip` — Firefox için

### Chrome / Edge'e kurulum

1. Tarayıcıda `chrome://extensions/` adresine gidin
2. Sağ üstte **"Geliştirici modu"** anahtarını açın
3. **"Paketlenmemiş öğe yükle"** butonuna tıklayın
4. `artifacts/browser-extension/dist/chrome/` klasörünü seçin

> Zip dosyasından kurmak isterseniz önce zip'i bir klasöre çıkarın, ardından aynı şekilde o klasörü seçin.

### Firefox'a kurulum

**Geçici kurulum (geliştirme için):**

1. `about:debugging` adresine gidin
2. **"Bu Firefox"** → **"Geçici Eklenti Yükle"**
3. `artifacts/browser-extension/dist/firefox/manifest.json` dosyasını seçin

> Firefox'ta geçici kurulumlar tarayıcı yeniden başlatıldığında silinir. Kalıcı kurulum için eklentinin imzalanması gerekir ([Firefox Add-on Hub](https://addons.mozilla.org/tr/developers/)).

### Eklentiyi kullanmak

1. Önce **instagram.com**'a giriş yapın (normal şekilde, tarayıcınızdan)
2. Eklenti simgesine tıklayın
3. İlk açılışta **Panel Bağlantısı** alanlarını doldurun:
   - **Panel URL:** Panelinizin adresi (örn. `https://xxxx.replit.dev` veya `http://localhost:5173`)
   - **Kullanıcı Adı / Şifre:** Panel admin bilgileri
4. **"Kaydet"** butonuna basın
5. Instagram durumu **"Aktif oturum bulundu ✓"** gösteriyorsa **"Oturumu Panele Gönder"** butonuna basın

Eklenti arka planda panel admin girişi yapar ve Instagram session cookie'sini güvenli biçimde iletir.

---

## 5. Varsayılan giriş bilgileri

| Alan | Değer |
|---|---|
| Kullanıcı adı | `admin` |
| Şifre | `admin123` |

> ⚠️ **Paneli başkalarıyla paylaşmadan veya internete açmadan önce şifreyi mutlaka değiştirin.** Bunu uygulama içindeki Ayarlar ekranından ya da `ADMIN_PASSWORD` ortam değişkeni üzerinden yapabilirsiniz.

---

## 6. Ortam değişkenleri

Tüm değişkenler `.env` dosyasında tanımlanır (`.env.example` şablonu olarak kullanın).

| Değişken | Zorunlu | Açıklama |
|---|---|---|
| `SESSION_SECRET` | ✅ Evet | Express session imzalama anahtarı — uzun ve rastgele olmalı |
| `DATABASE_URL` | ❌ Hayır | Harici Postgres bağlantı dizesi. Belirtilmezse yerel SQLite (`lib/db/data.db`) kullanılır |
| `ADMIN_PASSWORD` | ❌ Hayır | Varsayılan `admin123` yerine kullanılacak şifre |
| `USE_STEALTH_REQUESTS` | ❌ Hayır | `false` yapılırsa Python köprüsü devre dışı bırakılır (varsayılan: `true`) |
| `STEALTH_REQUESTS_PYTHON` | ❌ Hayır | Python yorumlayıcı yolu (otomatik algılanır; sorun çıkarsa ayarlayın) |
| `VITE_ADMIN_ENABLED` | ❌ Hayır | Frontend'de admin paneli sekmesini göstermek için `true` yapın |

---

## 7. Veritabanı yönetimi

Veritabanı tek bir SQLite dosyasıdır: `lib/db/data.db`

**Şemayı güncelleme** (model değişikliklerinden sonra):

```bash
pnpm --filter @workspace/db run push
```

**Varsayılan veriyi sıfırlama:**

```bash
# Linux / macOS
./scripts/db-restore.sh

# Windows
.\scripts\db-restore.ps1
```

**Manuel yedek alma:**

```bash
# Linux / macOS
cp lib/db/data.db lib/db/data.db.bak

# Windows PowerShell
Copy-Item lib\db\data.db lib\db\data.db.bak
```

**Gerçek Postgres kullanmak isterseniz** `.env` dosyasına bağlantı dizesini ekleyin:

```env
DATABASE_URL=postgresql://kullanici:sifre@host:5432/veritabani
```

Ardından şemayı push edin:

```bash
pnpm --filter @workspace/db run push
```

---

## 8. Prodüksiyon build

Tüm projeyi tip kontrolü ile birlikte derlemek:

```bash
pnpm run build
```

Sadece belirli bir paketi derlemek:

```bash
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/takipci-paneli run build
pnpm --filter @workspace/browser-extension run build
```

Derlenen API sunucusunu çalıştırmak:

```bash
NODE_ENV=production PORT=8080 node --enable-source-maps artifacts/api-server/dist/index.mjs
```

Frontend build çıktısı statik dosyalar olarak oluşur (`artifacts/takipci-paneli/dist/public/`) — nginx, Caddy veya `serve` gibi herhangi bir statik sunucuyla yayınlanabilir.

---

## 9. Proje yapısı

```
takipci-paneli/
├── artifacts/
│   ├── api-server/           Express API sunucusu (backend, port 8080)
│   ├── takipci-paneli/       React + Vite arayüzü (frontend, port 18973)
│   └── browser-extension/    Chrome/Firefox tarayıcı eklentisi
│
├── lib/
│   ├── db/                   Drizzle şeması, migration config, SQLite dosyası
│   ├── api-spec/             OpenAPI tanımı ve kod üretimi
│   ├── api-zod/              Paylaşılan Zod tipleri (API sözleşmesi)
│   ├── api-client-react/     Otomatik üretilen React Query hook'ları
│   ├── instagram-client/     Instagram HTTP istemcisi (TLS fingerprint spoofing)
│   ├── stealth-requests/     Python curl_cffi köprüsü
│   └── funcaptcha-solver/    Python Funcaptcha çözücüsü
│
├── scripts/                  Yardımcı komutlar (db-restore, seed, setup-python)
├── .env.example              Ortam değişkeni şablonu
└── pnpm-workspace.yaml       Monorepo yapılandırması
```

**Port özeti:**

| Servis | Geliştirme portu | Yol |
|---|---|---|
| API sunucusu | 8080 | `/api` |
| Frontend | 18973 | `/` |

---

## 10. Sık karşılaşılan sorunlar

**`pnpm: command not found`**
```bash
npm install -g pnpm
# Ardından terminali kapatıp yeniden açın
```
Hâlâ çalışmıyorsa Windows'ta: `irm get.pnpm.io/install.ps1 | iex`

---

**`PORT environment variable is required` hatası**
Replit dışında çalıştırırken bu hata çıkmamalı — kod otomatik varsayılan port kullanıyor. Yine de çıkıyorsa `pnpm install` komutunu tekrar çalıştırın (önbellek sorunu olabilir).

---

**Giriş yapamıyorum / kullanıcı bulunamadı**
`db-restore.sh` (ya da `.ps1`) komutunu çalıştırmadıysanız veritabanı boştur ve admin hesabı yoktur. Yukarıdaki 5. adıma bakın.

---

**Instagram girişi başarısız / Arkose / Captcha engeli**
Sunucu IP'si Instagram tarafından engellenmiş olabilir. İki çözüm:
1. **Tarayıcı eklentisi** ile cookie gönderin (en kolay yol — bkz. [Bölüm 4](#4-tarayıcı-eklentisi))
2. Panel arayüzündeki **"Cookie ile Giriş"** sekmesine instagram.com'dan kopyaladığınız `sessionid` değerini yapıştırın

---

**Python köprüsü başlamıyor (`ENOENT` hatası)**
`.venv` kurulmamış. Aşağıdaki komutu çalıştırın:
```bash
# Linux / macOS
bash scripts/setup-python.sh

# Windows
.\scripts\setup-python.ps1
```

---

**`esbuild` / `vite` ile ilgili hata**
`node_modules` klasörlerini silip yeniden kurun:
```bash
# Linux / macOS
rm -rf node_modules artifacts/*/node_modules lib/*/node_modules
pnpm install

# Windows PowerShell
Remove-Item -Recurse -Force node_modules, artifacts\*\node_modules, lib\*\node_modules
pnpm install
```

---

**Tarayıcı eklentisi "Bağlantı hatası" veriyor**
- Panel URL'sinin sonunda `/` olmadığından emin olun (örn. `https://xxxx.replit.dev` ✓, `https://xxxx.replit.dev/` ✗)
- Replit üzerindeyseniz URL'nin `.replit.dev` ile bittiğini kontrol edin
- Panelin çalışıyor olduğunu doğrulayın (API Server workflow'u başlatılmış olmalı)
