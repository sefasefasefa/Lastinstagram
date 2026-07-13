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
  Kurulum bittikten sonra terminali yeniden açın ve şunu deneyin:
  ```powershell
  pnpm --version
  ```
- Ayrı bir veritabanı sunucusu, Docker, vb. **gerekmez**. `DATABASE_URL` tanımlanmazsa uygulama, proje dosyalarının içinde saklanan yerel bir dosya veritabanına (`lib/db/.pglite-data`) otomatik olarak geçer.

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

Bu komut, uygulamanın ihtiyaç duyduğu tabloları (kullanıcılar, ayarlar, vb.) veritabanında oluşturur. İlk çalıştırmada `lib/db/.pglite-data` klasörünü otomatik olarak oluşturur.

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

## Gerçek bir Postgres kullanmak isterseniz

Yerel dosya veritabanı yerine kendi Postgres sunucunuzu (yerel kurulum, Docker, veya bulut — örn. Neon, Supabase) kullanmak isterseniz, `.env` içine `DATABASE_URL` tanımlamanız yeterli — geri kalan her şey (şema push, restore, uygulama) otomatik olarak o sunucuya bağlanır:

```bash
DATABASE_URL=postgresql://kullanici:sifre@localhost:5432/veritabani
```

Bu durumda 4. ve 5. adımları (şema push, restore) tekrar çalıştırmanız gerekir — böylece yeni Postgres veritabanınızda tablolar ve örnek veri oluşur.

## Veritabanını güncel tutmak

`lib/db/backup/database.sql` bir **anlık görüntüdür** (snapshot) — uygulama çalışırken otomatik güncellenmez. Replit üzerindeki veritabanının güncel halini tekrar dışa aktarmak isterseniz:

```bash
pg_dump "$DATABASE_URL" --no-owner --no-privileges --inserts -f lib/db/backup/database.sql
```

(`--inserts` bayrağı önemli: dosyanın hem gerçek Postgres'e hem de yerel dosya veritabanına geri yüklenebilir düz SQL formatında kalmasını sağlar.)

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
- Ortam değişkeni gerektiren script'ler (`VITE_ADMIN_ENABLED=true` gibi) `cross-env` ile yazılmıştır, böylece hem PowerShell/cmd hem de bash'te aynı şekilde çalışır.
- `scripts/db-restore.ps1`, `db-restore.sh`'nin PowerShell karşılığıdır — aynı işi yapar.
- Uzun dosya yolu hatası alırsanız (nadiren, Windows'un eski sürümlerinde görülür), projeyi `C:\` köküne yakın kısa bir klasöre klonlamanız yeterlidir (örn. `C:\dev\takipci-paneli`).

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
