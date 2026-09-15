# Deployment Guide: Beat Slicer

This guide provides instructions for deploying **Beat Slicer** to production:
- **Backend & Frontend**: Node.js Server (Express + Drizzle ORM + esbuild) or Netlify Functions with Vite single-page application.
- **Database & Auth**: [Neon PostgreSQL](https://neon.tech) serverless database with Neon Auth.
- **Object Storage**: Neon S3 Object Storage (`beat-slicer` bucket in `us-east-2`) with fallback to local disk storage.

---

## 1. Database Setup (Neon PostgreSQL)

1. Log into your [Neon Console](https://console.neon.tech).
2. Create a new PostgreSQL project (e.g., `slicer-app-db`).
3. Under **Dashboard > Connection Details**, retrieve your database credentials:
   - `SQL_HOST` (e.g. `ep-example-pooler.<region>.aws.neon.tech`)
   - `SQL_DB_NAME` (default is `neondb`)
   - `SQL_USER` (e.g. `neondb_owner`)
   - `SQL_PASSWORD`
4. Execute the initial SQL schema migrations:
   - Open the **SQL Editor** in Neon Console.
   - Run the contents of `schema.sql` (creates `users`, `samples`, `kits`, `kit_samples`, `presets`, and `feedback` tables with appropriate indexes).

---

## 2. Object Storage Setup (Neon S3 Storage)

Beat Slicer natively supports Neon S3 Object Storage for sample audio assets, kit files, and impulse responses.

### Neon S3 Storage Parameters
- **Endpoint**: `https://br-red-haze-axuhpihj.storage.c-4.us-east-2.aws.neon.tech`
- **Bucket Name**: `beat-slicer`
- **Region**: `us-east-2`

### Environment Variables
Configure the following in your runtime environment:
- `ENDPOINT_URL_S3`: `https://br-red-haze-axuhpihj.storage.c-4.us-east-2.aws.neon.tech`
- `STORAGE_BUCKET_NAME`: `beat-slicer`
- `REGION`: `us-east-2`
- `ACCESS_KEY_ID`: Your storage access key identifier
- `SECRET_ACCESS_KEY`: Your storage secret key

---

## 3. Server & Hosting Deployment

### Option A: Standard Node.js Container / Web Service
1. Connect your repository to your Node.js hosting service.
2. Build Command:
   ```bash
   npm install && npm run build
   ```
3. Start Command:
   ```bash
   npm start
   ```
4. Set environment variables (`DATABASE_URL`, `ENDPOINT_URL_S3`, `STORAGE_BUCKET_NAME`, `REGION`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `GEMINI_API_KEY`, etc.).

### Option B: Netlify Deployment
1. Log into [Netlify](https://app.netlify.com) and link your repository.
2. Build Command: `npm run build`
3. Publish Directory: `dist`
4. Configure Netlify Functions (or Netlify environment variables) in `netlify.toml` for `/api/*` rewrites to `/.netlify/functions/api/:splat`.

---

## 4. Environment Variables Summary

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `NODE_ENV` | Runtime environment | `production` |
| `PORT` | Listening port | `3000` |
| `DATABASE_URL` / `POSTGRES_URL` | Neon PostgreSQL Connection String | `postgresql://neondb_owner:...@ep-xxx.neon.tech/neondb` |
| `NEON_AUTH_URL` | Neon Auth endpoint | `https://<neon-auth-url>/auth` |
| `ENDPOINT_URL_S3` | Neon S3 Endpoint | `https://br-red-haze-axuhpihj.storage.c-4.us-east-2.aws.neon.tech` |
| `STORAGE_BUCKET_NAME` | Neon S3 Bucket | `beat-slicer` |
| `REGION` | Storage region | `us-east-2` |
| `ACCESS_KEY_ID` | Storage access key | `AKIA...` |
| `SECRET_ACCESS_KEY` | Storage secret access key | `secret_...` |
| `ADMIN_EMAIL` | Admin email for moderation | `admin@example.com` |
| `GEMINI_API_KEY` | (Optional) Google Gemini API Key | `AIza...` |

---

## 5. Verification & Health Checks

Once running:
1. **API Health**: Visit `/api/health` — should return `{"status":"ok"}`.
2. **Neon DB Verification**: Open the app, click the **Monitor** button in the header, and check database latency and AudioWorklet health.
3. **Audio Upload & Storage**: Upload a sample file in Pro Mode and verify that waveforms are rendered and stored in the `beat-slicer` bucket.
4. **Preset & Kit Deletion**: Verify that deleting user presets or kits properly cascades to delete associated audio samples and cleans up remote storage assets.
