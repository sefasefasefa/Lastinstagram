# Takipçi Paneli

Türkçe bir takipçi/tracker paneli: Express API sunucusu + Postgres veritabanı + React (Vite) arayüzü. Bu proje Replit'te geliştirildi; aşağıda hem Replit'te hem de kendi bilgisayarınızda çalıştırma adımları var.

## Kendi bilgisayarınızda çalıştırma (git clone sonrası)

Ayrı bir veritabanı sunucusu kurmanıza gerek yok: `DATABASE_URL` tanımlanmazsa uygulama, proje dosyalarının içinde saklanan yerel bir dosya veritabanına (`lib/db/.pglite-data`) otomatik olarak geçer. Docker, Postgres kurulumu vb. gerekmez.

Gereksinimler: Node.js 20+, [pnpm](https://pnpm.io).

### macOS / Linux / Windows (PowerShell)

```bash
# 1. Bağımlılıkları kur
pnpm install

# 2. (Opsiyonel) .env dosyanızı oluşturun — gerçek bir Postgres'e bağlanmak
#    istemiyorsanız bu adımı atlayabilirsiniz, varsayılanlar yeterlidir.
cp .env.example .env

# 3. Veritabanı şemasını oluştur
pnpm --filter @workspace/db run push

# 4. Veritabanını (şema + örnek veri, örn. admin hesabı) geri yükle
./scripts/db-restore.sh
# Windows: .\scripts\db-restore.ps1

# 5. API sunucusunu başlat
pnpm --filter @workspace/api-server run dev

# 6. Başka bir terminalde: frontend'i başlat
pnpm --filter @workspace/takipci-paneli run dev
```

Frontend `http://localhost:5173` (veya Vite'ın gösterdiği port), API `http://localhost:3000` üzerinde çalışır. Varsayılan giriş: kullanıcı adı `admin`, şifre `admin123` — gerçek kullanım öncesi mutlaka değiştirin.

### Gerçek bir Postgres kullanmak isterseniz

Yerel dosya veritabanı yerine kendi Postgres sunucunuzu kullanmak isterseniz, `.env` içine `DATABASE_URL` tanımlamanız yeterli — geri kalan her şey (şema push, restore, uygulama) otomatik olarak o sunucuya bağlanır:

```bash
DATABASE_URL=postgresql://kullanici:sifre@localhost:5432/veritabani
```

### Veritabanını güncel tutmak

`lib/db/backup/database.sql` bir **anlık görüntüdür** (snapshot) — uygulama çalışırken otomatik güncellenmez. Replit üzerindeki veritabanının güncel halini tekrar dışa aktarmak isterseniz:

```bash
pg_dump "$DATABASE_URL" --no-owner --no-privileges -f lib/db/backup/database.sql
```

## Replit'te çalıştırma

Replit ortamında veritabanı zaten kurulu ve hazırdır, ekstra bir kurulum gerekmez. Detaylar için `replit.md` dosyasına bakın.
