// Settings schema. Each entry describes a configurable env var: category for
// UI grouping, label/description for UI text, is_secret for masking, default
// for first-boot suggestions, required for "must be set before brain works".
//
// Add new env vars HERE so they show up in the Settings UI. If a var is read
// via process.env.X but absent from this schema, it still works (config falls
// back to process.env / .env) — it just won't be editable in the UI.

export const SETTINGS_SCHEMA = [
  // ─── Core ──────────────────────────────────────────────────────────
  {
    key: 'CAPTURE_SECRET',
    category: 'Core',
    label: 'API token (Bearer)',
    is_secret: true,
    required: true,
    description: 'Required. Bearer token for all API + MCP routes. Also unlocks this UI.',
  },
  {
    key: 'PORT',
    category: 'Core',
    label: 'HTTP port',
    is_secret: false,
    default: '3000',
    description: 'Express server port. Bound to 127.0.0.1 only — public access via nginx HTTPS.',
  },
  {
    key: 'QDRANT_URL',
    category: 'Core',
    label: 'Qdrant URL',
    is_secret: false,
    default: 'http://localhost:6333',
    description: 'Qdrant vector DB endpoint. Default localhost via Docker.',
  },

  // ─── AI Providers ──────────────────────────────────────────────────
  {
    key: 'ANTHROPIC_API_KEY',
    category: 'AI Providers',
    label: 'Anthropic API key',
    is_secret: true,
    required: true,
    description: 'Claude Haiku for metadata extraction + draft review + coworker-loop summaries.',
  },
  {
    key: 'GOOGLE_API_KEY',
    category: 'AI Providers',
    label: 'Google Gemini API key',
    is_secret: true,
    required: true,
    description: 'Gemini embeddings (3072-dim) for thoughts + Gemini multimodal for YouTube summaries.',
  },

  // ─── Google Drive (vault + backups) ────────────────────────────────
  {
    key: 'GOOGLE_DRIVE_CLIENT_ID',
    category: 'Google Drive',
    label: 'OAuth2 client ID',
    is_secret: false,
    description: 'Google Cloud OAuth2 client ID. Not technically secret, masked for safety.',
  },
  {
    key: 'GOOGLE_DRIVE_CLIENT_SECRET',
    category: 'Google Drive',
    label: 'OAuth2 client secret',
    is_secret: true,
  },
  {
    key: 'GOOGLE_DRIVE_REFRESH_TOKEN',
    category: 'Google Drive',
    label: 'OAuth2 refresh token',
    is_secret: true,
    description: 'Generate via scripts/get-drive-token.js. Required for Drive writes + Gmail + Calendar + YouTube.',
  },
  {
    key: 'GOOGLE_SERVICE_ACCOUNT_PATH',
    category: 'Google Drive',
    label: 'Service account JSON path',
    is_secret: false,
    description: 'Absolute path to service-account.json on the server. Required for Drive vault reads (People/Projects).',
  },
  {
    key: 'GOOGLE_DRIVE_FOLDER_ID',
    category: 'Google Drive',
    label: 'Vault root folder ID',
    is_secret: false,
    description: 'Drive folder where customBrain creates the Obsidian vault and Backups subfolder.',
  },
  {
    key: 'GOOGLE_DRIVE_PEOPLE_FOLDER_ID',
    category: 'Google Drive',
    label: 'People folder ID',
    is_secret: false,
  },
  {
    key: 'GOOGLE_DRIVE_PROJECTS_FOLDER_ID',
    category: 'Google Drive',
    label: 'Projects folder ID',
    is_secret: false,
  },

  // ─── Fireflies (meeting transcripts) ───────────────────────────────
  {
    key: 'FIREFLIES_API_KEY',
    category: 'Fireflies',
    label: 'Fireflies API key',
    is_secret: true,
    description: 'For transcript fetching. Optional — skip if you do not use Fireflies.',
  },
  {
    key: 'FIREFLIES_WEBHOOK_SECRET',
    category: 'Fireflies',
    label: 'Webhook HMAC secret',
    is_secret: true,
    description: 'Set the same value in Fireflies webhook config (x-hub-signature). Optional.',
  },

  // ─── Gmail (auto-intake) ───────────────────────────────────────────
  {
    key: 'GMAIL_BRAIN_LABEL',
    category: 'Gmail',
    label: 'Brain label name',
    is_secret: false,
    default: 'brain',
    description: 'Gmail label that triggers capture of a thread.',
  },
  {
    key: 'GMAIL_CAPTURED_LABEL',
    category: 'Gmail',
    label: 'Captured marker label',
    is_secret: false,
    default: 'brain/captured',
    description: 'Pure UI marker since 0.7.0 — not a filter gate.',
  },

  // ─── YouTube (likes auto-intake) ───────────────────────────────────
  {
    key: 'YOUTUBE_SKIP_CATEGORIES',
    category: 'YouTube',
    label: 'Skip categoryIDs (csv)',
    is_secret: false,
    default: '10',
    description: '10 = Music. Comma-separated YouTube category IDs to ignore during intake.',
  },

  // ─── Tunables ──────────────────────────────────────────────────────
  {
    key: 'AGENDA_MIN_SCORE',
    category: 'Tunables',
    label: 'Agenda match threshold',
    is_secret: false,
    default: '0.65',
    description: 'Minimum cosine score (0-1) for a thought to appear in Agenda event context.',
  },
];

export function getSchemaEntry(key) {
  return SETTINGS_SCHEMA.find((s) => s.key === key);
}

export function isSecret(key) {
  return getSchemaEntry(key)?.is_secret === true;
}
