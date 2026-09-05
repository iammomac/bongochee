# BONGO CHEE Inventory Management System

Enterprise inventory, sales, and returns management for a multi-brand mobile
phone retailer. React + TypeScript frontend, Django REST Framework backend,
PostgreSQL, JWT auth via httpOnly cookies, dynamic RBAC.

## Status: Phase 1 — Foundation ✅

This is the first of several build phases (see roadmap below). What's here now:

**Backend (`/backend`)**
- Django project with 9 apps: `accounts`, `rbac`, `catalog`, `stock`, `sales`,
  `returns_app`, `suppliers`, `reports`, `activitylog`
- Full data model: custom `User` (UUID pk, admin-managed passwords), dynamic
  `Role`/`Permission`, `Category`/`PhoneModel` (auto-create on use), `StockIn`/
  `StockItem` (no IMEI at import), `Sale`/`SaleItem` (IMEI per unit), `Return`/
  `ReturnPhoto`, immutable `ActivityLog`
- JWT auth wired for httpOnly cookies (`CookieJWTAuthentication`), CORS/CSRF
  configured, per-request throttling, custom exception handler
- `HasPermission` DRF permission class — declare `required_permission` on any
  view and it's enforced against the user's role
- Migrations generated and verified (`python manage.py check` passes)
- Permission catalog seed fixture matching every permission in the spec
- Dockerfile (gunicorn) + `.env.example`

**Frontend (`/frontend`)**
- Vite + React 19 + TypeScript, Tailwind configured with the brand palette
  (`primary #6C63FF`, `secondary #8B5CF6`, `background #F7F8FC`, etc.), dark
  mode via `class` strategy
- Folder structure: `components/`, `pages/<module>/`, `hooks/`, `services/`,
  `types/`, `layouts/`, `routes/`, `providers/`
- Axios client with CSRF header injection + automatic 401 refresh
- `AuthProvider` + `useAuth`/`usePermissions` hooks
- `ProtectedRoute` that gates on auth, forced password change, and per-route
  permissions — sidebar nav also filters itself by permission
- Login page (React Hook Form + Zod), dashboard KPI grid, and stub pages for
  every module so routing/permissions are provable end-to-end
- `tsc -b` and `vite build` both verified clean

**Infra**
- Root `docker-compose.yml` wiring `db` (Postgres 16), `backend` (gunicorn),
  `frontend` (nginx-served static build)
- `nginx.conf` for the frontend container

## Local setup

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in secret key, db creds
# point POSTGRES_HOST to localhost for local (non-docker) dev
python manage.py migrate
python manage.py loaddata rbac/fixtures/permissions.json
python manage.py createsuperuser
python manage.py runserver

# Frontend
cd frontend
npm install
cp .env.example .env
npm run dev
```

Or with Docker: `docker compose up --build` from the repo root (after filling
in `backend/.env`).

## Roadmap

- **Phase 2 — Auth & RBAC end-to-end**: real login/logout/refresh/me
  endpoints, DRF ViewSets + routers for Role/Permission CRUD, admin-approval
  password-reset workflow (request → approve → temp password → forced
  change), force-password-change screen, session idle timeout on the
  frontend, seeded default roles.
- **Phase 3 — Dashboard & catalog**: KPI aggregation endpoints, Recharts
  panels (revenue/profit trends, best sellers, most returned), Category/Model
  autocomplete-and-create endpoints.
- **Phase 4 — Stock In**: Excel-like multi-row entry grid, Excel import,
  supplier CRUD.
- **Phase 5 — Sales (POS)**: phone search → quantity → IMEI capture flow,
  receipt/invoice generation, payment method handling.
- **Phase 6 — Returns**: search by IMEI/invoice/customer, photo upload,
  status workflow.
- **Phase 7 — Reports**: all report types, filters, Excel/PDF export,
  per-employee activity report.
- **Phase 8 — Activity logs & notifications**: admin-only immutable log
  viewer, low-stock/failed-login/return alerts.
- **Phase 9 — Hardening & deployment**: rate-limit tuning, security review
  (SQLi/XSS/CSRF pass), automated tests, production Nginx/SSL, deployment
  guide for Ubuntu.

Tell me which phase to build next and I'll pick up from here — for example
"Phase 2" or "build the login/auth endpoints first."
