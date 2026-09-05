# Deploying BONGO CHEE to Ubuntu

This guide covers a single-server Docker Compose deployment on Ubuntu 22.04/24.04
LTS, fronted by Nginx with a free Let's Encrypt certificate. It's written against
placeholder domains (`bongochee.co.tz` for the frontend, `api.bongochee.co.tz` for
the API — matching `backend/.env.example`) — swap in your real domain once you have
one; everything else works as written.

## 1. Server prep

```bash
sudo apt update && sudo apt upgrade -y

# Firewall: only SSH, HTTP, HTTPS
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Docker Engine + Compose plugin (official install script)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# log out and back in for the group change to take effect
```

Point both DNS records (`bongochee.co.tz` and `api.bongochee.co.tz`) at the
server's IP before continuing — certbot needs them resolving correctly to issue a
certificate.

## 2. Get the code and configure secrets

```bash
git clone <your-repo-url> bongochee
cd bongochee
cp backend/.env.example backend/.env
```

Edit `backend/.env`:
- `DJANGO_SECRET_KEY` — a long random value (`python3 -c "import secrets; print(secrets.token_urlsafe(50))"`). The app **refuses to start** with the placeholder value once `DJANGO_DEBUG=False` (see `config/settings.py`) — this is intentional, not a bug.
- `DJANGO_DEBUG=False`
- `DJANGO_ALLOWED_HOSTS=api.bongochee.co.tz`
- `POSTGRES_PASSWORD` — a real password, not the example placeholder.
- `CORS_ALLOWED_ORIGINS=https://bongochee.co.tz`
- `CSRF_TRUSTED_ORIGINS=https://bongochee.co.tz`

The frontend needs to know the API's real URL **at build time** (Vite bakes it into
the static bundle — there's no runtime env var to change later):

```bash
echo "VITE_API_BASE_URL=https://api.bongochee.co.tz/api/v1" > frontend/.env.production
```

If you're using a different domain than the placeholders above, also update the
`server_name` lines and cert paths in `deploy/nginx.conf` and
`deploy/nginx.bootstrap.conf` to match.

## 3. First boot: get a certificate before enabling HTTPS

Nginx can't start referencing a certificate that doesn't exist yet — `docker-compose.prod.yml`
mounts `deploy/nginx.conf` into the nginx container, and that file's HTTPS server
blocks point at a cert that won't exist until certbot issues one. So for the very
first boot only, swap in the HTTP-only bootstrap config, get the cert, then swap
back:

```bash
# 1. Temporarily stand in the bootstrap config (HTTP only, proxies straight through)
cp deploy/nginx.conf deploy/nginx.conf.full        # keep the real one aside
cp deploy/nginx.bootstrap.conf deploy/nginx.conf

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 2. Issue the certificate (covers both domains in one cert).
#    --entrypoint overrides the certbot service's custom entrypoint (the renewal
#    loop, used when it runs long-lived) back to the image's own `certbot` binary
#    for this one-off invocation.
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm --entrypoint certbot certbot \
  certonly --webroot -w /var/www/certbot \
  -d bongochee.co.tz -d api.bongochee.co.tz \
  --email you@example.com --agree-tos --no-eff-email

# 3. Restore the real config now that the cert exists, and reload
mv deploy/nginx.conf.full deploy/nginx.conf
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart nginx
```

(The `certbot` service in `docker-compose.prod.yml` keeps running afterward and
renews automatically twice a day — no further action needed.)

## 4. Initialize the database

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend \
  python manage.py migrate

docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend \
  python seed_data.py
# Creates the permission catalog, the Admin/Manager roles, the "admin" system-role
# account, and the "super" superuser. Passwords for both come from SEED_SUPER_PASSWORD
# and SEED_ADMIN_PASSWORD in backend/.env — set strong, unique values there before
# running this for the first time (see backend/.env.example).

docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend \
  python manage.py collectstatic --noinput
```

Visit `https://bongochee.co.tz` and log in as `super` with the `SEED_SUPER_PASSWORD`
you set in `backend/.env`.

## 5. Ongoing operations

**Redeploying after a code change:**
```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend python manage.py migrate
```

**Logs:**
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f backend
```

**Database backups** (daily cron, keeps 14 days):
```bash
# /etc/cron.daily/bongochee-backup
#!/bin/sh
cd /path/to/bongochee
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db \
  pg_dump -U "$(grep POSTGRES_USER backend/.env | cut -d= -f2)" \
  "$(grep POSTGRES_DB backend/.env | cut -d= -f2)" \
  | gzip > "/var/backups/bongochee-$(date +%F).sql.gz"
find /var/backups -name 'bongochee-*.sql.gz' -mtime +14 -delete
```
Make it executable: `chmod +x /etc/cron.daily/bongochee-backup`.

**Rotating secrets**: change `DJANGO_SECRET_KEY` or `POSTGRES_PASSWORD` in
`backend/.env`, then `docker compose ... up -d` to recreate the backend with the new
values. Changing `DJANGO_SECRET_KEY` invalidates all existing JWT sessions — every
user gets logged out and needs to sign in again, which is expected.

## Notes

- `docker compose -f docker-compose.yml -f docker-compose.prod.yml config` validates
  the merged config without starting anything — run it after any changes to either
  compose file. (Not run as part of this change — no Docker available in the
  environment this guide was written in; run it yourself before your first deploy.)
- `deploy/nginx.conf` is the host-level reverse proxy. `frontend/nginx.conf` is a
  different file — the frontend container's own internal static-file server; you
  don't need to touch it.
