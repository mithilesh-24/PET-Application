# PET Prep

Local-first, CodeTantra-style online placement examination platform for CSE Software Only students of Kongu Engineering College.

## Quick Start (M0 Scaffold)

```bash
npm install
npm run dev
```

- Backend API: `http://localhost:4000/api/health`
- Frontend dev server: `http://localhost:5173`

## Scripts

- `npm run dev` — Run backend and frontend concurrently
- `npm run build` — Build frontend production bundle
- `npm run start` — Start backend server
- `npm test` — Run backend and frontend test suites
- `npm run lint` — Run ESLint across workspace
- `npm run setup` — Check Node version, install dependencies, and run compiler doctor when present

## Security and Encryption Scope

- **Encrypted Question Papers at Rest**: Imported papers are gzipped and encrypted with AES-256-GCM (`PET1` package format with unique 96-bit nonces and authenticated headers). Keys are stored in the OS keychain when available, or in `~/.pet-prep/keys/` (outside the repository and `DATA_DIR`) with `0600` permissions.
- **What this protects against**: Casual inspection of stored `.pet` files, accidental plaintext leaks, and file tampering (detected by GCM authentication tags).
- **What this does not protect against**: A user with administrator/root privileges on the same machine who can read the local keychain, key files, or process memory.
