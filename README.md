# Tish Duxtir

Stomatologiya klinikalari tarmog'i uchun dastur: jadval, bemorlar, kassa, ombor (FIFO), hisobotlar. Bir nechta filial bilan ishlaydi; bemorlar barcha filiallar uchun umumiy.

## Tuzilishi

| Papka | Nima |
|---|---|
| `web/` | Interfeys: React + TypeScript + Tailwind (Vite) |
| `server/` | API: Node.js + Fastify + PostgreSQL |
| `server/migrations/` | Baza sxemasi. Server ishga tushganda avtomatik qo'llanadi |
| `server/tests/` | Ombor mantiqi sinovlari (FIFO, storno, ruxsatlar) |
| `deploy/` | Docker Compose, Caddy (HTTPS), kunlik zaxira nusxa |

Muhim qoidalar bazaning o'zida tekshiriladi:
- ombor qoldig'i faqat o'tkazilgan nakladnoylardan hisoblanadi;
- o'tkazilgan nakladnoyni o'chirib yoki tahrirlab bo'lmaydi, u storno bilan tuzatiladi;
- har bir amalda xodimning ruxsati va filiali tekshiriladi.

---

## Serverga o'rnatish (Contabo, Ubuntu)

### 1. Tayyorgarlik

Domeningizning DNS A yozuvini server IP manziliga yo'naltiring (masalan `tishduxtir.uz` → `123.45.67.89`).

Serverga SSH orqali kiring va Docker'ni o'rnating:

```bash
curl -fsSL https://get.docker.com | sh
```

Faqat kerakli portlarni oching:

```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

### 2. Dasturni yuklab olish

Repozitoriy yopiq (private) bo'lsa, GitHub sizdan login so'raydi: parol o'rniga GitHub'da yaratilgan token (Settings → Developer settings → Personal access tokens) kiritiladi.

```bash
git clone -b claude/eloquent-euler-qavaku https://github.com/baxtishodibrohimov-rgb/tish-duxtir.git /opt/tish-duxtir
```

```bash
cd /opt/tish-duxtir/deploy && cp .env.example .env
```

`.env` faylini oching (`nano .env`) va to'ldiring:
- `DOMAIN` — domeningiz;
- `DB_PASSWORD` va `JWT_SECRET` — har biri uchun alohida `openssl rand -hex 32` buyrug'i natijasini qo'ying.

### 3. Ishga tushirish

```bash
docker compose up -d --build
```

Birinchi marta 3–5 daqiqa davom etadi. Caddy HTTPS sertifikatini o'zi oladi.

### 4. Tashkilot, filiallar va egasini yaratish

```bash
docker compose run --rm api node dist/cli.js setup --org "Tish Duxtir" --branches "Chilonzor,Yunusobod,Sergeli" --name "Ism Familiya" --login sizning@email.uz
```

Parol terminalda so'raladi. Shundan keyin `https://DOMAIN` manzilida tizimga kiring va **Sozlamalar** bo'limida:
- kabinetlarni qo'shing;
- xodimlarni qo'shib, filiallarga biriktiring;
- Praysni to'ldiring.

### Yangilash

```bash
cd /opt/tish-duxtir && git pull && cd deploy && docker compose up -d --build
```

Yangi migratsiyalar server ishga tushganda avtomatik qo'llanadi.

### Zaxira nusxa

Har kuni soat 03:00 da `deploy/backups/` papkasiga ikkita fayl yoziladi: baza nusxasi (`db_*.dump`) va bemor fayllari (`files_*.tar.gz`). Oxirgi 14 kunlik nusxa saqlanadi.

**Muhim:** bu papkani vaqti-vaqti bilan boshqa joyga ham ko'chiring (kompyuteringizga yoki bulutga). Server buzilsa, faqat serverdagi nusxa yordam bermaydi.

Nusxadan tiklash:

```bash
docker compose exec -T db pg_restore -U tishduxtir -d tishduxtir --clean --if-exists < backups/db_2026-11-16_0300.dump
```

### Parolni tiklash

```bash
docker compose run --rm api node dist/cli.js reset-password --login sizning@email.uz
```

---

## Eski (Lovable) bazadan ma'lumot ko'chirish

1. Supabase / Lovable Cloud jadval muharriridan quyidagi jadvallarni CSV qilib yuklab oling: `patients`, `patient_visits`, `price_categories`, `price_items`, `acts`, `payments`, `treatment_records`.
2. Fayllarni serverga, masalan `/root/export/` papkasiga ko'chiring. Nomlari: `patients.csv`, `acts.csv` va hokazo.
3. Har bir eski klinika (filial) uchun alohida ishga tushiring:

```bash
docker compose run --rm -v /root/export:/import api node dist/import.js --dir /import --branch "Chilonzor"
```

Import haqida bilish kerak:
- eski `id`lar saqlanadi, shuning uchun bemor, tashrif, akt va to'lov orasidagi bog'lanishlar buzilmaydi;
- qayta ishga tushirsangiz, allaqachon ko'chirilgan yozuvlar o'tkazib yuboriladi;
- xodimlar yangi tizimda qaytadan qo'shiladi, eski yozuvlardagi shifokor bog'lanishi ko'chirilmaydi;
- eski ombor qoldiqlari ham ko'chirilmaydi: ularni bitta kirim nakladnoyi bilan kiriting.

---

## Dasturchilar uchun

Mahalliy ishga tushirish uchun PostgreSQL 16 kerak:

```bash
npm install
```

```bash
createdb tishduxtir && SETUP_PASSWORD=Sinov12345 npm run build -w server && node server/dist/cli.js setup --org Test --branches "A,B" --name Admin --login admin@test.uz
```

Ikki terminalda:

```bash
npm run dev:server
```

```bash
npm run dev:web
```

Brauzerda http://localhost:5173 manzilini oching.

Ombor mantiqi sinovlari:

```bash
PGHOST=localhost PGUSER=postgres npm run test:db
```
