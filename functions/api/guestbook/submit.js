

const MAX_BODY_BYTES = 250 * 1024; // 250KB
const MAX_IMAGES = 3;
const MAX_IMAGE_SRC_BYTES = 40 * 1024; // 40KB per image base64
const MAX_MESSAGE_LENGTH = 2000;
const MAX_NAME_LENGTH = 80;
const MAX_STROKES = 100;
const MAX_POINTS_PER_STROKE = 500;
const RATE_LIMIT_COUNT = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
const TURNSTILE_ACTION = 'guestbook_submit';


const ipCounts = new Map();
function rateLimit(ip) {
  const now = Date.now();
  let list = ipCounts.get(ip) || [];
  list = list.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (list.length >= RATE_LIMIT_COUNT) return false;
  list.push(now);
  ipCounts.set(ip, list);
  return true;
}

function jsonResponse(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function corsHeaders(origin, allowedOrigins) {
  const o = allowedOrigins.includes(origin) ? origin : (allowedOrigins[0] || '*');
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function isAllowedOrigin(origin, allowedOrigins) {
  if (!origin || allowedOrigins.length === 0) return true;
  return allowedOrigins.includes(origin);
}

function getExpectedTurnstileHostnames(env, allowedOrigins) {
  const explicit = parseCsv(env.TURNSTILE_HOSTNAMES);
  if (explicit.length > 0) return explicit;
  return allowedOrigins
    .map((origin) => {
      try {
        return new URL(origin).hostname;
      } catch (_) {
        return '';
      }
    })
    .filter(Boolean);
}

function getClientIp(request, env) {
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) return cfIp.trim();

  if (env.TRUST_X_FORWARDED_FOR === 'true') {
    const forwarded = request.headers.get('X-Forwarded-For');
    if (forwarded) return forwarded.split(',')[0].trim();
  }

  return '';
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return toHex(digest);
}

function canUseKv(namespace) {
  return namespace && typeof namespace.get === 'function' && typeof namespace.put === 'function';
}

async function consumeRateLimit(env, clientIp) {
  const keyHash = await sha256Hex('ip:' + clientIp);
  const kv = env.GUESTBOOK_RATE_LIMIT_KV;
  const now = Date.now();

  if (!canUseKv(kv)) {
    return {
      allowed: rateLimit(keyHash),
      retryAfterSec: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
      storage: 'memory',
    };
  }

  const key = 'guestbook:rl:' + keyHash;
  let record = null;

  try {
    const raw = await kv.get(key, 'text');
    record = raw ? JSON.parse(raw) : null;
  } catch (_) {
    record = null;
  }

  if (!record || typeof record !== 'object' || typeof record.resetAt !== 'number' || now >= record.resetAt) {
    record = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }

  if (record.count >= RATE_LIMIT_COUNT) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((record.resetAt - now) / 1000)),
      storage: 'kv',
    };
  }

  record.count += 1;
  const ttl = Math.max(60, Math.ceil((record.resetAt - now) / 1000) + 60);
  await kv.put(key, JSON.stringify(record), { expirationTtl: ttl });

  return {
    allowed: true,
    retryAfterSec: Math.max(1, Math.ceil((record.resetAt - now) / 1000)),
    storage: 'kv',
  };
}

async function getDuplicateSubmissionKey(clientIp, payload) {
  return 'guestbook:dup:' + await sha256Hex('ip:' + clientIp + '|payload:' + JSON.stringify(payload));
}

async function isDuplicateSubmission(env, duplicateKey) {
  const kv = env.GUESTBOOK_RATE_LIMIT_KV;
  if (!canUseKv(kv)) return false;

  return Boolean(await kv.get(duplicateKey, 'text'));
}

async function rememberDuplicateSubmission(env, duplicateKey) {
  const kv = env.GUESTBOOK_RATE_LIMIT_KV;
  if (!canUseKv(kv)) return;
  await kv.put(duplicateKey, '1', { expirationTtl: Math.ceil(DUPLICATE_WINDOW_MS / 1000) });
}

function sanitizeText(s, maxLen) {
  if (s == null) return '';
  return String(s).slice(0, maxLen).trim();
}


function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function looksSpam(message, name) {
  const text = (name + ' ' + (message || '')).toLowerCase();
  const linkCount = (text.match(/https?:\/\//g) || []).length;
  if (linkCount > 2) return true;
  if (/(.)\1{19,}/.test(text)) return true; // 20+ same char
  const emojiCount = (text.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
  if (emojiCount > 15) return true;
  return false;
}

async function validateTurnstile(token, remoteip, secret) {
  if (!secret || !token) return { success: false };
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip }),
    });
    const data = await res.json();
    return data;
  } catch (e) {
    return { success: false, 'error-codes': ['internal-error'] };
  }
}

function validateImages(images) {
  if (!Array.isArray(images)) return [];
  const out = [];
  for (const img of images.slice(0, MAX_IMAGES)) {
    if (!img || typeof img !== 'object') continue;
    if (typeof img.src !== 'string' || !img.src.startsWith('data:image/')) continue;
    if (img.src.length > MAX_IMAGE_SRC_BYTES) continue;
    if (typeof img.x !== 'number' || typeof img.y !== 'number') continue;
    if (typeof img.w !== 'number' || typeof img.h !== 'number') continue;
    if (img.w <= 0 || img.h <= 0 || img.w > 800 || img.h > 800) continue;
    out.push({ src: img.src, x: Math.round(img.x), y: Math.round(img.y), w: Math.round(img.w), h: Math.round(img.h) });
  }
  return out;
}

function validateDrawing(drawing) {
  if (!drawing || typeof drawing !== 'object') return null;
  const strokes = Array.isArray(drawing.strokes) ? drawing.strokes : [];
  if (strokes.length > MAX_STROKES) return null;
  const out = [];
  for (const s of strokes) {
    if (!s || !Array.isArray(s.points)) continue;
    const points = s.points.slice(0, MAX_POINTS_PER_STROKE).filter((p) => p && typeof p.x === 'number' && typeof p.y === 'number');
    if (points.length === 0) continue;
    const color = typeof s.color === 'string' && /^#[0-9A-Fa-f]{3,8}$/.test(s.color) ? s.color : '#78589d';
    const width = typeof s.width === 'number' && s.width > 0 && s.width <= 50 ? s.width : 2;
    out.push({ color, width, points });
  }
  const images = validateImages(drawing.images);
  if (out.length === 0 && images.length === 0) return null;
  const result = {
    width: Math.min(Number(drawing.width) || 400, 800),
    height: Math.min(Number(drawing.height) || 300, 600),
    backgroundColor: drawing.backgroundColor || null,
    strokes: out,
  };
  if (images.length > 0) result.images = images;
  return result;
}

export async function onRequestOptions(context) {
  const { request, env } = context;
  const allowedOrigins = parseCsv(env.ALLOWED_ORIGIN);
  const origin = request.headers.get('Origin') || '';
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin, allowedOrigins),
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const allowedOrigins = parseCsv(env.ALLOWED_ORIGIN);
  const origin = request.headers.get('Origin') || '';

  const headers = { ...corsHeaders(origin, allowedOrigins) };

  if (!isAllowedOrigin(origin, allowedOrigins)) {
    return jsonResponse({ success: false, error: 'Origin not allowed' }, 403, headers);
  }

  if (!request.headers.get('Content-Type')?.includes('application/json')) {
    return jsonResponse({ success: false, error: 'Invalid content type' }, 400, headers);
  }

  let body;
  try {
    const raw = await request.arrayBuffer();
    if (raw.byteLength > MAX_BODY_BYTES) {
      return jsonResponse({ success: false, error: 'Payload too large' }, 413, headers);
    }
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch (e) {
    return jsonResponse({ success: false, error: 'Invalid JSON' }, 400, headers);
  }

  // Honeypot
  if (body.website_url) {
    return jsonResponse({ success: true }, 200, headers);
  }

  const clientIp = getClientIp(request, env);
  if (!clientIp) {
    return jsonResponse({ success: false, error: 'Could not determine client IP.' }, 400, headers);
  }

  const rateLimitResult = await consumeRateLimit(env, clientIp);
  if (!rateLimitResult.allowed) {
    return jsonResponse(
      { success: false, error: 'Too many submissions. Try again later.' },
      429,
      { ...headers, 'Retry-After': String(rateLimitResult.retryAfterSec) }
    );
  }

  const turnstileSecret = env.TURNSTILE_SECRET;
  const token = body['cf-turnstile-response'];
  const tv = await validateTurnstile(token, clientIp, turnstileSecret);
  if (!tv.success) {
    return jsonResponse({ success: false, error: 'Verification failed. Please try again.' }, 400, headers);
  }

  const expectedHostnames = getExpectedTurnstileHostnames(env, allowedOrigins);
  if (expectedHostnames.length > 0 && tv.hostname && !expectedHostnames.includes(tv.hostname)) {
    return jsonResponse({ success: false, error: 'Verification host mismatch.' }, 400, headers);
  }

  if (tv.action && tv.action !== TURNSTILE_ACTION) {
    return jsonResponse({ success: false, error: 'Verification action mismatch.' }, 400, headers);
  }

  const name = sanitizeText(body.name, MAX_NAME_LENGTH);
  const message = sanitizeText(body.message, MAX_MESSAGE_LENGTH);
  const isPublic = body.public === true;
  const drawing = validateDrawing(body.drawing);

  const hasDrawingContent = drawing && (drawing.strokes.length > 0 || (drawing.images && drawing.images.length > 0));
  if (!message && !hasDrawingContent) {
    return jsonResponse({ success: false, error: 'Add a message and/or a drawing.' }, 400, headers);
  }

  const spam = looksSpam(body.message || '', body.name || '');
  const labels = [isPublic ? 'public' : 'private', spam ? 'spam' : 'pending'];
  if (drawing) labels.push('has_drawing');
  if (message) labels.push('has_text');

  const payload = { name, message, public: isPublic, drawing };
  const duplicateKey = await getDuplicateSubmissionKey(clientIp, payload);
  if (await isDuplicateSubmission(env, duplicateKey)) {
    return jsonResponse({ success: false, error: 'Duplicate submission detected. Please wait a few minutes.' }, 429, headers);
  }

  const issueBody = '<!-- GUESTBOOK SUBMISSION -->\n```json\n' + JSON.stringify(payload) + '\n```';

  const githubToken = env.GITHUB_TOKEN;
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  if (!githubToken || !owner || !repo) {
    return jsonResponse({ success: false, error: 'Server configuration error.' }, 500, headers);
  }

  const title = (name || 'Anonymous') + ' — ' + (isPublic ? 'public' : 'private');
  try {
    const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'konerocat-guestbook',
      },
      body: JSON.stringify({
        title: title.slice(0, 255),
        body: issueBody,
        labels,
      }),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();
      const detail = createRes.status + ': ' + errBody.slice(0, 200);
      return jsonResponse({ success: false, error: 'Could not save submission. GitHub: ' + detail }, 500, headers);
    }
    await rememberDuplicateSubmission(env, duplicateKey);
    return jsonResponse({ success: true }, 200, headers);
  } catch (e) {
    return jsonResponse({ success: false, error: 'Server error.' }, 500, headers);
  }
}
