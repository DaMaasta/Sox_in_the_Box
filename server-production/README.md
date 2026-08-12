# Kistle production server

This directory mirrors the CommonJS/Express server currently deployed on `heaven`.
It intentionally contains no `.env` file or credentials.

## Verify

```bash
npm ci
npm test
find . -name '*.js' -not -path './node_modules/*' -exec node --check {} \;
```

## Deployment

1. Back up PostgreSQL and the current server directory.
2. Copy these files to `/home/damaasta/kistle/server/` without overwriting `.env`.
3. Set `NUKI_SPACE_ID` to the group whose editors/admins may operate the lock.
4. Build `kistle-webapp`, recreate only the `webapp` container, and verify `/api/health`.

Authorization is centralized in `authorization.js`. Child spaces inherit access from
their parent group; viewers may read, editors may change inventory, and only admins
may manage members.
