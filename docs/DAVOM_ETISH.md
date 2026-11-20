# Tish Duxtir — davom ettirish uchun qo'llanma

Bu fayl yangi suhbat (chat) uchun: loyiha qayerda turibdi va keyin nima qilish kerak.

## Loyiha

- Repozitoriy: `baxtishodibrohimov-rgb/tish-duxtir`, branch: `claude/compassionate-fermi-ofdblr` (artifaktga moslangan oxirgi holat; `claude/eloquent-euler-qavaku` — undan oldingi).
- Eski dastur Lovable'da yozilgan edi (Supabase bilan). Yangi dastur undan butunlay ajratilgan va noldan yozilgan.
- Dizayn manbai: claude.ai artifakti «Tish Duxtir» — 11 ta ekran: yuqori menyu, Jadval, Bemorlar, Bemor kartasi, Yangi bemor,
  Sozlamalar, Kassa, Ombor, Davolash rejalari, Hisobotlar, AI yordamchi. Interfeys shu artifaktga moslangan.

## Texnologiya

- `web/` — React 18 + TypeScript + Tailwind v4 (Vite). Router o'zimizniki (`web/src/lib/router.tsx`).
- `server/` — Node.js 22 + Fastify 5 + PostgreSQL 16 (`pg`). Sessiya: httpOnly cookie + JWT, parollar bcrypt.
- `server/migrations/` — 4 ta migratsiya, server ishga tushganda avtomatik qo'llanadi.
- `deploy/` — Docker Compose: `db` (Postgres), `api`, `web` (Caddy: HTTPS + statik + /api proksi), `backup` (har kuni 03:00).

## Asosiy tushunchalar

- Bitta tashkilot (`orgs`) → 3 filial (`branches`). Bemorlar, prays, tovarlar, kontragentlar — umumiy.
  Jadval, kabinetlar, kassalar, omborlar, aktlar — filial bo'yicha.
- Xodim (`members`) rol + qo'shimcha ruxsatlar (`permissions` jsonb) + filiallar (`member_branches`).
  Ruxsat ham serverda (`server/src/perms.ts`), ham bazada (`has_perm()`) tekshiriladi.
- Umumiy CRUD: `server/src/crud.ts` — har bir jadval uchun oq ro'yxat (ustunlar, filtrlar, ruxsat).
- Ombor: qoldiq faqat o'tkazilgan nakladnoylardan (`stock_moves` jurnali, `stock_balances` kesh), tannarx FIFO
  (`stock_lots`). O'tkazilgan hujjat o'chirilmaydi — `reverse_stock_doc()` (storno). Akt yopilganda
  `close_act()` kalkulyatsiya kartalari bo'yicha materialni avtomatik chiqaradi.
- Pul: `money_moves` (income/expense/transfer/refund). Bemor balansi: `patient_balances` view.
- Davolash rejasi: `treatment_plans.stages` (jsonb) — bosqichlar va qatorlar. «Bajarish» (`POST /api/plans/:id/done`)
  akt yaratadi va yopadi, qatorlar «Bajarildi» bo'ladi.
- 004-migratsiya: kutish navbati (`waiting_list`), eslatmalar (`reminders.audience`, `done`), qabul belgisi va
  manipulyatsiyalar (`visits.mood`, `visit_items`), bemorning qo'shimcha maydonlari, `patient_notes`, `plan_templates`,
  kontragent hisoblari (`counterparty_invoices`).
- Hisobotlar: `server/src/routes/reports.ts` — 27 ta jadval hisoboti (`GET /api/reports/table/:slug`).

## Holat

Tayyor va sinovdan o'tgan: barcha sahifalar, server, ombor mantig'i (`server/tests/warehouse_test.sql`),
eski bazadan import (`server/src/import.ts`). Docker image hali hech qayerda yig'ib ko'rilmagan — birinchi
`docker compose up --build` Contabo'da bo'ladi.

## 1-qadam: Contabo'ga o'rnatish

To'liq qadamlar `README.md` da. Qisqacha:
1. Domen DNS A yozuvi → server IP.
2. `curl -fsSL https://get.docker.com | sh`, `ufw` bilan 22/80/443 portlarni ochish.
3. `git clone -b claude/compassionate-fermi-ofdblr ... /opt/tish-duxtir`
4. `cd /opt/tish-duxtir/deploy && cp .env.example .env` → `DOMAIN`, `DB_PASSWORD`, `JWT_SECRET` (`openssl rand -hex 32`).
5. `docker compose up -d --build`
6. `docker compose run --rm api node dist/cli.js setup --org "..." --branches "A,B,C" --name "..." --login ...`
7. Brauzerda `https://DOMAIN` → Sozlamalar: kabinetlar, xodimlar, Prays.

Xato chiqsa: `docker compose logs api` va `docker compose logs web` natijasini tekshirish.

## 2-qadam: eski ma'lumotlarni ko'chirish

Lovable/Supabase'dan CSV: `patients`, `patient_visits`, `price_categories`, `price_items`, `acts`, `payments`,
`treatment_records`. Keyin har filial uchun:
`docker compose run --rm -v /root/export:/import api node dist/import.js --dir /import --branch "Filial nomi"`

## Hali qilinmagan (eski dasturda bor edi)

1. Telegram bot (eslatmalar, rentgen yuborish) — `TELEGRAM_BOT_TOKEN` .env da, webhook marshruti yo'q hali.
2. AI yordamchi.
3. Xodimlar maoshi (hisoblash, to'lash).
4. Kutish ro'yxati, bemor depoziti.
5. Filial bo'yicha alohida narx (`price_overrides` jadvali bor, interfeysi va CRUD yo'q).

## Xavfsizlik

- `.env` va parollarni hech qachon repoga yoki chatga yozmang.
- Eski Lovable migratsiyasida admin paroli ochiq yozilgan edi — eski tizimda uni almashtiring.
- `deploy/backups/` ni vaqti-vaqti bilan serverdan tashqariga ko'chiring.
