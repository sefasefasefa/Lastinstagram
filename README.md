# Takipçi Paneli

Türkçe bir takipçi/tracker paneli: Express API sunucusu + Postgres veritabanı + React (Vite) arayüzü. Bu proje Replit'te geliştirildi; aşağıda hem Replit'te hem de kendi bilgisayarınızda (Windows, macOS, Linux) çalıştırma adımları var.

## İçindekiler

- [Gereksinimler](#gereksinimler)
- [Kendi bilgisayarınızda çalıştırma — adım adım](#kendi-bilgisayarınızda-çalıştırma--adım-adım)
- [Varsayılan giriş bilgileri](#varsayılan-giriş-bilgileri)
- [Gerçek bir Postgres kullanmak isterseniz](#gerçek-bir-postgres-kullanmak-isterseniz)
- [Veritabanını güncel tutmak](#veritabanını-güncel-tutmak)
- [Prodüksiyon build'i almak](#prodüksiyon-buildi-almak)
- [Windows'a özel notlar](#windowsa-özel-notlar)
- [Sık karşılaşılan sorunlar](#sık-karşılaşılan-sorunlar)
- [Replit'te çalıştırma](#replitte-çalıştırma)
- [Proje yapısı](#proje-yapısı)

## Gereksinimler

- **Node.js 20 veya üzeri** — [nodejs.org](https://nodejs.org) üzerinden indirin (LTS sürüm önerilir).
- **pnpm** — Node kurulduktan sonra PowerShell/terminalde şunu çalıştırın:
  ```bash
  npm install -g pnpm
  ```
  Windows'ta kurulum sonrası terminali kapatıp yeniden açmanız gerekebilir (PATH güncellemesi için).

  Eğer `pnpm` komutunu hâlâ tanımazsa (npm'in global kurulum klasörü PATH'e eklenmemiş olabilir), resmi installer'ı kullanın:
  ```powershell
  irm get.pnpm.io/install.ps1 | iex
  ```
  **Önemli:** Kurulum bittikten sonra mevcut PowerShell penceresini **kapatıp yeni bir pencere açmanız** gerekir. Sonra şunu deneyin:
  ```powershell
  pnpm --version
  ```
  Hâlâ tanımazsa `C:\Users\<kullanıcı-adınız>\AppData\Local\pnpm` klasörünü Ortam Değişkenleri (PATH) listesine manuel ekleyin ve tekrar deneyin.
- Ayrı bir veritabanı sunucusu, Docker veya Postgres **gerekmez**. Veritabanı, projenin içinde tek bir SQLite dosyası olarak saklanır (`lib/db/data.db`) — hiçbir ek kurulum gerekmez.

Kurulumu doğrulamak için:

```bash
node --version   # v20.x.x veya üzeri olmalı
pnpm --version   # herhangi bir sürüm olur
```

## Kendi bilgisayarınızda çalıştırma — adım adım

Bu adımlar Windows (PowerShell/cmd), macOS ve Linux'ta aynı şekilde çalışır.

### 1. Projeyi indirin

```bash
git clone <repo-url>
cd <proje-klasörü>
```

### 2. Bağımlılıkları kurun

```bash
pnpm install
```

Bu komut monorepo'daki tüm paketleri (API sunucusu, frontend, ortak kütüphaneler) tek seferde kurar. İşletim sisteminize uygun native bağımlılıklar (esbuild, Vite, vb.) otomatik olarak indirilir — Windows'ta da ekstra bir işlem gerekmez.

### 3. (Opsiyonel) `.env` dosyanızı oluşturun

```bash
cp .env.example .env
```

Windows PowerShell'de `cp` yerine:

```powershell
Copy-Item .env.example .env
```

Gerçek bir Postgres'e bağlanmak istemiyorsanız bu adımı tamamen atlayabilirsiniz — uygulama varsayılan olarak yerel dosya veritabanını kullanır. `.env` dosyasını yalnızca `SESSION_SECRET` değerini kendiniz belirlemek veya gerçek bir Postgres'e bağlanmak istediğinizde düzenlemeniz yeterli.

### 4. Veritabanı şemasını oluşturun

```bash
pnpm --filter @workspace/db run push
```

Bu komut, uygulamanın ihtiyaç duyduğu tabloları SQLite dosyasında (`lib/db/data.db`) oluşturur. İlk çalıştırmada dosya yoksa otomatik olarak oluşturulur.

### 5. Örnek veriyi (varsayılan admin hesabı dahil) yükleyin

macOS / Linux:

```bash
./scripts/db-restore.sh
```

Windows (PowerShell):

```powershell
.\scripts\db-restore.ps1
```

Bu komut `lib/db/backup/database.sql` içindeki anlık görüntüyü veritabanınıza yükler; böylece varsayılan admin hesabıyla doğrudan giriş yapabilirsiniz.

### 6. API sunucusunu başlatın

```bash
pnpm --filter @workspace/api-server run dev
```

Terminalde `Server listening / port: 3000` görürseniz API sunucusu çalışıyor demektir. Bu terminali açık bırakın.

### 7. Yeni bir terminal açıp frontend'i başlatın

```bash
pnpm --filter @workspace/takipci-paneli run dev
```

Terminalde `VITE ... ready` ve `Local: http://localhost:5173/` satırını göreceksiniz.

### 8. Tarayıcıda açın

[http://localhost:5173](http://localhost:5173) adresine gidin.

> Not: API sunucusu 3000, frontend 5173 portunu kullanır. Bu portlar zaten kullanımdaysa, ilgili terminalde `PORT` ortam değişkenini değiştirerek çalıştırabilirsiniz, örneğin:
> ```bash
> pnpm --filter @workspace/api-server exec cross-env PORT=4000 node --enable-source-maps dist/index.mjs
> ```
> Genellikle buna gerek kalmaz.

## Varsayılan giriş bilgileri

- Kullanıcı adı: `admin`
- Şifre: `admin123`

**Gerçek kullanıma açmadan/paylaşmadan önce mutlaka değiştirin** (uygulama içindeki ayarlar ekranından).

## Veritabanı yedeklemek

SQLite veritabanı tek bir dosyadır (`lib/db/data.db`). Yedeklemek için bu dosyayı kopyalamanız yeterlidir:

Windows (PowerShell):
```powershell
Copy-Item lib\db\data.db lib\db\data.db.bak
```

Linux/macOS:
```bash
cp lib/db/data.db lib/db/data.db.bak
```

## Prodüksiyon build'i almak

Tüm projeyi (tip kontrolü + build) tek seferde derlemek için:

```bash
pnpm run build
```

Sadece API sunucusunu veya sadece frontend'i derlemek isterseniz:

```bash
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/takipci-paneli run build
```

Derlenen API sunucusunu çalıştırmak için:

```bash
cross-env NODE_ENV=production PORT=3000 node --enable-source-maps artifacts/api-server/dist/index.mjs
```

Frontend build çıktısı `artifacts/takipci-paneli/dist/public` klasöründe statik dosyalar olarak oluşur; herhangi bir statik dosya sunucusuyla (nginx, `serve`, vb.) yayınlayabilirsiniz.

## Windows'a özel notlar

Bu proje Windows'ta sorunsuz çalışacak şekilde ayarlanmıştır:

- `pnpm install`, Windows için doğru native bağımlılıkları (esbuild, Vite/rollup, Tailwind derleyicisi) otomatik indirir — ekstra bir kurulum veya derleyici (Visual Studio Build Tools vb.) gerekmez.
- Ortam değişkeni gerektiren script'ler (`cross-env` ile yazılmıştır) hem PowerShell/cmd hem de bash'te aynı şekilde çalışır.
- `scripts/db-restore.ps1`, `db-restore.sh`'nin PowerShell karşılığıdır — aynı işi yapar.
- Uzun dosya yolu hatası alırsanız (nadiren, Windows'un eski sürümlerinde görülür), projeyi `C:\` köküne yakın kısa bir klasöre klonlamanız yeterlidir (örn. `C:\dev\takipci-paneli`).

### Python kurulumu (Instagram girişi + funcaptcha için)

Instagram şifre girişi ve funcaptcha solver Python 3.10+ gerektirir. Aşağıdaki adımları **bir kez** çalıştırmanız yeterlidir:

**1. Python kur**
[python.org](https://python.org) üzerinden Python 3.10 veya üzerini indirin. Kurulum sırasında **"Add Python to PATH"** seçeneğini işaretleyin.

**2. Kurulumu doğrula**
```powershell
py --version   # Python 3.10.x veya üzeri çıkmalı
```

**3. Sanal ortamı kur (tek seferlik)**
```powershell
.\scripts\setup-python.ps1
```

Bu script `.venv` klasörünü oluşturur ve tüm Python bağımlılıklarını (curl_cffi, flask, vb.) kurar. Artık API sunucusu başladığında stealth bridge ve funcaptcha solver otomatik olarak `.venv` içindeki Python'ı kullanır.

> **Not:** `py` komutu API sunucusu tarafından bulunamazsa (nadir durum), `.env` dosyasına şunu ekleyin:
> ```
> STEALTH_REQUESTS_PYTHON=.venv\Scripts\python.exe
> ```

## Sık karşılaşılan sorunlar

**`pnpm: command not found` / `'pnpm' is not recognized`**
Node.js kurulu ama pnpm kurulu değil. `npm install -g pnpm` çalıştırın, ardından terminali yeniden açın.

**`PORT environment variable is required but was not provided.`**
Bu proje artık kendi bilgisayarınızda çalıştırıldığında (Replit dışında) 3000 (API) ve 5173 (frontend) portlarını otomatik kullanır. Bu hatayı görüyorsanız muhtemelen eski bir `pnpm install` önbelleği vardır — `pnpm install` komutunu tekrar çalıştırıp deneyin.

**Giriş yapamıyorum / kullanıcı bulunamadı**
5. adımdaki (`db-restore.sh` / `.ps1`) veri yükleme komutunu çalıştırmadıysanız veritabanı boştur. O adımı çalıştırın.

**`esbuild`/`vite` ile ilgili bir hata alıyorum**
`node_modules` klasörünü silip `pnpm install`'ı tekrar çalıştırın:
```bash
rm -rf node_modules artifacts/*/node_modules lib/*/node_modules
pnpm install
```
Windows PowerShell'de:
```powershell
Remove-Item -Recurse -Force node_modules, artifacts\*\node_modules, lib\*\node_modules
pnpm install
```

## Replit'te çalıştırma

Replit ortamında veritabanı zaten kurulu ve hazırdır, ekstra bir kurulum gerekmez — "Run" tuşuna basmanız yeterlidir. Ortam değişkenleri (`PORT`, `DATABASE_URL`, vb.) Replit tarafından otomatik sağlanır. Detaylar için `replit.md` dosyasına bakın.

## Proje yapısı

```
artifacts/
  api-server/       Express API sunucusu (backend)
  takipci-paneli/    React + Vite arayüzü (frontend)
lib/
  db/               Drizzle şeması, migration/push config, yedek SQL dosyası
  api-spec/         OpenAPI şeması ve kod üretimi
  api-zod/          API için paylaşılan zod tipleri
  instagram-client/ Instagram entegrasyon istemcisi
scripts/            Yardımcı komut satırı script'leri (db-restore, instagram-auto-like, vb.)
```
