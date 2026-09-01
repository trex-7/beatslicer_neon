# REST API Documentation: Beat Slicer

The Beat Slicer backend is built with **Express.js**, **Drizzle ORM**, **Neon PostgreSQL**, and **S3-compatible Object Storage**.

All API routes are prefixed with `/api`.

---

## Authentication

Authentication is handled via JWT tokens issued by **Neon Auth** (or local session authentication). 
Include the bearer token in the `Authorization` header:

```http
Authorization: Bearer <jwt_token>
```

Routes marked with 🔒 require authentication.
Routes marked with 🛡️ require administrator privileges (`ADMIN_EMAIL`).

---

## Endpoints

### System & Health

#### `GET /api/health`
Checks server availability.
- **Response**: `200 OK`
```json
{
  "status": "ok",
  "time": "2026-09-01T12:00:00.000Z"
}
```

---

### Library & Cloud Assets

#### `GET /api/library`
Fetches all public presets, samples, kits, and user-owned content.
- **Auth**: Optional (returns user-specific items if authenticated)
- **Response**: `200 OK`
```json
{
  "presets": [...],
  "samples": [...],
  "kits": [...]
}
```

---

### Presets

#### `POST /api/presets` 🔒
Saves a new user preset.
- **Body**:
```json
{
  "name": "Heavy Glitch Break",
  "params": { ... },
  "sequencer": { "steps": [...], "stepCount": 16, "mode": "forward" },
  "slices": [ ... ],
  "sampleId": "optional-uuid",
  "isPublic": false
}
```
- **Response**: `200 OK` with created preset object.

#### `PUT /api/presets/:id` 🔒
Updates an existing preset owned by the user (or by admin).
- **Parameters**: `id` (Preset UUID)
- **Response**: `200 OK` with updated preset object.

#### `DELETE /api/presets/:id` 🔒
Deletes a preset. Automatically cascades to delete associated sample files and object storage assets.
- **Parameters**: `id` (Preset UUID)
- **Query / Body**: `deleteFiles=true` (defaults to `true`)
- **Response**: `200 OK`
```json
{
  "success": true,
  "deletedPreset": { "id": "..." },
  "deletedSampleUrls": ["https://.../sample.wav"]
}
```

---

### Samples & Storage

#### `POST /api/samples` 🔒
Uploads an audio sample file via `multipart/form-data`.
- **Form Data**:
  - `file`: Audio binary (WAV, MP3, OGG, FLAC, AIFF up to 50MB)
  - `title`: String name
  - `isPublic`: Boolean
- **Response**: `200 OK`
```json
{
  "success": true,
  "sample": {
    "id": "uuid",
    "title": "Acoustic_Snare.wav",
    "url": "https://.../uploads/unique_Acoustic_Snare.wav",
    "userId": "user_123"
  }
}
```

#### `DELETE /api/samples/:id` 🔒
Deletes a sample and unlinks it from any associated kits or presets.
- **Parameters**: `id` (Sample UUID)
- **Body**: `{ "url": "https://.../sample.wav" }`
- **Response**: `200 OK`
```json
{
  "success": true,
  "deletedSample": { "id": "..." }
}
```

---

### Construction Kits

#### `POST /api/kits` 🔒
Creates a multi-sample construction kit with linked sample definitions.
- **Body**:
```json
{
  "name": "Cyberpunk 2088 Kit",
  "description": "Aggressive industrial drum kit",
  "coverImageUrl": "https://...",
  "isPublic": true,
  "samples": [
    { "title": "Kick.wav", "url": "https://...", "type": "kick" },
    { "title": "Snare.wav", "url": "https://...", "type": "snare" }
  ]
}
```
- **Response**: `200 OK`

#### `DELETE /api/kits/:id` 🔒
Deletes a kit. Automatically cleans up all associated sample records, `kit_samples` associations, and stored audio files.
- **Parameters**: `id` (Kit UUID)
- **Query / Body**: `deleteFiles=true` (defaults to `true`)
- **Response**: `200 OK`
```json
{
  "success": true,
  "deletedKit": { "id": "..." },
  "deletedSampleUrls": ["https://.../kick.wav", "https://.../snare.wav"]
}
```

---

### Item Management

#### `PATCH /api/items/rename` 🔒
Renames any preset, sample, or kit.
- **Body**:
```json
{
  "id": "item-uuid",
  "type": "preset" | "sample" | "kit",
  "newName": "Updated Name"
}
```
- **Response**: `200 OK`

---

### Feedback & Diagnostics

#### `POST /api/feedback`
Submits user feedback, suggestions, or error reports.
- **Body**:
```json
{
  "message": "Encountered latency issue on Firefox 128",
  "category": "bug" | "feature" | "general"
}
```
- **Response**: `200 OK`

#### `GET /api/feedback` 🛡️
Retrieves all feedback entries (Administrator only).
- **Response**: `200 OK` with feedback items list.

---

### AI Generation & Storage Utilities

#### `POST /api/ai/generate-pattern` 🔒
Generates algorithmic or AI-powered sequencer patterns based on genre prompts (House, Breakbeat, Chaos, Trap, Ambient).
- **Body**:
```json
{
  "genre": "breakbeat",
  "sliceCount": 16,
  "stepCount": 16,
  "complexity": 0.75
}
```
- **Response**: `200 OK` with 16-step sequencer matrix.

#### `POST /api/storage/sync-local` 🛡️
Uploads any local disk samples into the connected S3/Neon object storage bucket.
- **Response**: `200 OK` with sync status and file counts.
