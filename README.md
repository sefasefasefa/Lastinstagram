# Takipçi Paneli

Türkçe bir takipçi/tracker paneli: Express API sunucusu + Postgres veritabanı + React (Vite) arayüzü. Bu proje Replit'te geliştirildi; aşağıda hem Replit'te hem de kendi bilgisayarınızda çalıştırma adımları var.

## Kendi bilgisayarınızda çalıştırma (git clone sonrası)

Replit'in veritabanı yalnızca Replit içinden erişilebilir, bu yüzden bilgisayarınızda ayrı bir Postgres'e ihtiyacınız var. Proje içindeki `lib/db/backup/database.sql` dosyası, veritabanının tablo yapısını ve mevcut verileri (örn. `admin` hesabı) içeren hazır bir yedek — kurulumu tek komuta indiriyor.

Gereksinimler: Node.js 20+, [pnpm](https://pnpm.io), [Docker Desktop](https://www.docker.com/products/docker-desktop/) (yerel Postgres için).

### macOS / Linux

```bash
# 1. Bağımlılıkları kur
pnpm install

# 2. Yerel Postgres'i başlat (arka planda)
docker compose up -d

# 3. .env dosyanızı oluşturun
cp .env.example .env
# .env içine şunu yazın:
# DATABASE_URL=postgresql://takipci:takipci@localhost:5432/takipci_paneli
# SESSION_SECRET=herhangi-bir-gizli-deger

# 4. Veritabanını (şema + veri) geri yükle
./scripts/db-restore.sh

# 5. API sunucusunu başlat
pnpm --filter @workspace/api-server run dev

# 6. Başka bir terminalde: frontend'i başlat
pnpm --filter @workspace/takipci-paneli run dev
```

### Windows (PowerShell)

Docker Desktop'ın kurulu ve çalışır durumda olması gerekir (WSL2 backend ile).

```powershell
# 1. Bağımlılıkları kur
pnpm install

# 2. Yerel Postgres'i başlat (arka planda)
docker compose up -d

# 3. .env dosyanızı oluşturun
Copy-Item .env.example .env
# .env içine şunu yazın:
# DATABASE_URL=postgresql://takipci:takipci@localhost:5432/takipci_paneli
# SESSION_SECRET=herhangi-bir-gizli-deger

# 4. Veritabanını (şema + veri) geri yükle
.\scripts\db-restore.ps1
# Eğer "script çalıştırma devre dışı" hatası alırsanız, önce şunu çalıştırın:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# 5. API sunucusunu başlat
pnpm --filter @workspace/api-server run dev

# 6. Başka bir terminalde (yeni bir PowerShell penceresi): frontend'i başlat
pnpm --filter @workspace/takipci-paneli run dev
```

Frontend `http://localhost:5173` (veya Vite'ın gösterdiği port), API `http://localhost:3000` üzerinde çalışır. Varsayılan giriş: kullanıcı adı `admin`, şifre `admin123` — gerçek kullanım öncesi mutlaka değiştirin.

### Veritabanını güncel tutmak

`lib/db/backup/database.sql` bir **anlık görüntüdür** (snapshot) — uygulama çalışırken otomatik güncellenmez. Replit üzerindeki veritabanının güncel halini tekrar dışa aktarmak isterseniz:

```bash
pg_dump "$DATABASE_URL" --no-owner --no-privileges -f lib/db/backup/database.sql
```

### Docker olmadan (Windows'ta yerel Postgres kurulumu)

Docker kullanmak istemiyorsanız, [PostgreSQL for Windows](https://www.postgresql.org/download/windows/) kurup elle bir veritabanı oluşturabilirsiniz; bu durumda `db-restore.ps1` yerine `psql` doğrudan kullanılır:

```powershell
psql -U postgres -c "CREATE USER takipci WITH PASSWORD 'takipci';"
psql -U postgres -c "CREATE DATABASE takipci_paneli OWNER takipci;"
psql "postgresql://takipci:takipci@localhost:5432/takipci_paneli" -v ON_ERROR_STOP=1 -f lib/db/backup/database.sql
```

## Replit'te çalıştırma

Replit ortamında veritabanı zaten kurulu ve hazırdır, `docker compose` veya `db-restore.sh` gerekmez. Detaylar için `replit.md` dosyasına bakın.
