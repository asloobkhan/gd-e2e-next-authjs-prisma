# Revocable Auth Boilerplate

Next.js 16 + Auth.js v5 + Prisma + Postgres, with Credentials and Google OAuth on a single revocable session model.

> Detailed architecture write-ups will be added after the boilerplate stabilizes. This README is just the local boot guide.

## Local setup

### Prerequisites
- Node.js 20+
- Yarn (Classic 1.x is fine)
- Docker (for the local Postgres)

### Steps

```bash
# 1) Start Postgres in the background
docker compose up -d

# 2) Copy the env template and adjust if needed
cp .env.example .env

# 3) Install dependencies (Prisma client is generated via postinstall)
yarn

# 4) Apply schema and create initial migration
yarn db:migrate

# 5) Seed a demo user (optional — creates demo@example.com / demopass1)
yarn db:seed

# 6) Run the dev server
yarn dev
```

Open <http://localhost:3000> — you'll be redirected to `/login`.

### Demo credentials

After running `yarn db:seed`:

- **Email**: `demo@example.com`
- **Password**: `demopass1`

### Google OAuth (optional)

Without `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`, the "Continue with Google" buttons will fail to round-trip. To enable:

1. Create OAuth credentials at <https://console.cloud.google.com/apis/credentials>
2. Add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI
3. Paste the client id/secret into `.env` and restart `yarn dev`

## Useful scripts

| Command | What it does |
|---|---|
| `yarn dev` | Run the dev server |
| `yarn build` | Production build |
| `yarn db:migrate` | Apply pending Prisma migrations (dev) |
| `yarn db:reset` | Drop & recreate the schema, re-seed |
| `yarn db:studio` | Launch Prisma Studio at <http://localhost:5555> |
| `yarn db:seed` | Re-run the seed script |

## Force-logout demo

In dev only:

```bash
# Wipe all sessions for a user
curl -X DELETE http://localhost:3000/api/admin/sessions \
     -H 'content-type: application/json' \
     -d '{"userId":"<USER_ID>"}'
```

Or directly in Postgres:

```sql
DELETE FROM "Session" WHERE "userId" = '<USER_ID>';
```

The next request from that user gets a fresh redirect to `/login`.
