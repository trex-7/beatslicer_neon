# Deployment Guide: Beat Slicer

This guide provides instructions for deploying **Beat Slicer** to production:
- **Backend**: Hosted on [Render](https://render.com) (Node.js web service running Express + Drizzle ORM + esbuild).
- **Frontend**: Hosted on [Netlify](https://netlify.com) (Single Page Application with Vite build).
- **Database & Auth**: [Neon PostgreSQL](https://neon.tech) serverless database with Neon Auth.
- **Object Storage**: S3-Compatible Object Storage (Neon Storage, AWS S3, Cloudflare R2, or Wasabi) with fallback to local disk storage.

---

## 1. Database Setup (Neon PostgreSQL)

1. Log into your [Neon Console](https://console.neon.tech).
2. Create a new PostgreSQL project (e.g., `beat-slicer-db`).
3. Under **Dashboard > Connection Details**, retrieve your database credentials:
   - `SQL_HOST` (e.g. `ep-example-pooler.us-east-2.aws.neon.tech`)
   - `SQL_DB_NAME` (default is `neondb`)
   - `SQL_USER` (e.g. `neondb_owner`)
   - `SQL_PASSWORD`
4. Execute the initial SQL schema migrations:
   - Open the **SQL Editor** in Neon Console.
   - Run the contents of `schema.sql` (creates `users`, `samples`, `kits`, `kit_samples`, `presets`, and `feedback` tables with appropriate indexes).

---

## 2. Object Storage Setup (Neon S3 / AWS S3 / Cloudflare R2)

Beat Slicer natively supports any S3-compatible object storage provider for sample audio assets, kit files, and impulse responses.

### S3 / Neon Storage Configuration
Ensure you have the following credentials from your bucket provider:
- `AWS_ACCESS_KEY_ID`: Your access key identifier.
- `AWS_SECRET_ACCESS_KEY`: Your secret key.
- `AWS_REGION`: Storage region (e.g., `us-east-2`).
- `NEON_STORAGE_BUCKET` or `S3_BUCKET_NAME`: Target bucket name.
- `NEON_STORAGE_ENDPOINT` or `S3_ENDPOINT`: Custom endpoint URL (e.g., `https://<account-id>.r2.cloudflarestorage.com` or Neon storage endpoint).
- `NEON_STORAGE_FORCE_PATH_STYLE`: Set to `true` if using MinIO or custom path-style endpoints.

---

## 3. Backend Deployment on Render

### Step 1: Create a Render Web Service
1. Sign in to [Render Dashboard](https://dashboard.render.com).
2. Click **New + > Web Service**.
3. Connect your GitHub repository.

### Step 2: Configure Service Settings
- **Name**: `beat-slicer-api`
- **Region**: Choose the region closest to your Neon database (e.g., `Ohio (US East)`).
- **Branch**: `main`
- **Runtime**: `Node`
- **Build Command**:
  ```bash
  npm install && npm run build
  ```
- **Start Command**:
  ```bash
  npm start
  ```

### Step 3: Configure Environment Variables on Render
Add the following key-value pairs under **Environment** tab:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `NODE_ENV` | Runtime environment | `production` |
| `PORT` | Listening port (Render automatically sets port 3000/10000) | `3000` |
| `SQL_HOST` | Neon PostgreSQL host | `ep-xxxx.us-east-2.aws.neon.tech` |
| `SQL_DB_NAME` | Neon Database Name | `neondb` |
| `SQL_USER` | Neon Database User | `neondb_owner` |
| `SQL_PASSWORD` | Neon Database Password | `your_db_password` |
| `NEON_AUTH_URL` | Neon Auth endpoint | `https://<neon-auth-url>/auth` |
| `NEON_AUTH_JWKS_URL` | Neon Auth JWKS URL for JWT validation | `https://<neon-auth-url>/auth/.well-known/jwks.json` |
| `AWS_ACCESS_KEY_ID` | Storage access key | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | Storage secret access key | `secret_...` |
| `AWS_REGION` | Storage region | `us-east-2` |
| `NEON_STORAGE_BUCKET` | S3 bucket name | `beat-slicer` |
| `NEON_STORAGE_ENDPOINT` | Custom S3 endpoint (if applicable) | `https://...` |
| `ADMIN_EMAIL` | Admin account email for library management & moderation | `admin@example.com` |
| `GEMINI_API_KEY` | (Optional) Google Gemini API Key for AI rhythm generation | `AIza...` |

---

## 4. Frontend Deployment on Netlify

### Step 1: Connect Repository
1. Log into [Netlify](https://app.netlify.com).
2. Click **Add new site > Import an existing project** and link your repository.

### Step 2: Build & Directory Settings
The project contains `netlify.toml` which configures build commands and client-side SPA routing rewrites:
- **Base directory**: `/` (project root)
- **Build command**: `npm run build`
- **Publish directory**: `dist`

### Step 3: Client Environment Variables on Netlify
Add the following client-accessible environment variables in **Site configuration > Environment variables**:

| Variable | Description |
| :--- | :--- |
| `VITE_NEON_AUTH_URL` | Neon Authentication endpoint URL for user login and signup flows |

### Step 4: API Proxy / Redirects
When Netlify is deployed separately from the Render backend, configure `netlify.toml` to proxy `/api/*` requests to your Render Web Service URL:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/api/*"
  to = "https://beat-slicer-api.onrender.com/api/:splat"
  status = 200
  force = true

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

---

## 5. Verification & Health Checks

Once both services are running:
1. **API Health**: Visit `https://<your-render-url>/api/health` — should return `{"status":"ok"}`.
2. **Neon DB Verification**: Open the app, click the **Monitor** button in the header, and check database latency and AudioWorklet health.
3. **Audio Upload & Storage**: Upload a sample file in Pro Mode and verify that waveforms are rendered and stored in your bucket.
4. **Preset & Kit Deletion**: Verify that deleting user presets or kits properly cascades to delete associated audio samples and cleans up remote storage assets.
