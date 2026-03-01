

const MAX_BODY_BYTES = 100 * 1024; // 100KB
const MAX_MESSAGE_LENGTH = 2000;
const MAX_NAME_LENGTH = 80;
const MAX_STROKES = 100;
const MAX_POINTS_PER_STROKE = 500;
const RATE_LIMIT_COUNT = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;


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

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function corsHeaders(origin, allowed) {
  const o = allowed && origin && allowed.includes(origin) ? origin : (allowed && allowed.split(',')[0]?.trim()) || '*';
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
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

function validateDrawing(drawing) {
  if (!drawing || typeof drawing !== 'object') return null;
  const strokes = drawing.strokes;
  if (!Array.isArray(strokes) || strokes.length > MAX_STROKES) return null;
  const out = [];
  for (const s of strokes) {
    if (!s || !Array.isArray(s.points)) continue;
    const points = s.points.slice(0, MAX_POINTS_PER_STROKE).filter((p) => p && typeof p.x === 'number' && typeof p.y === 'number');
    if (points.length === 0) continue;
    const color = typeof s.color === 'string' && /^#[0-9A-Fa-f]{3,8}$/.test(s.color) ? s.color : '#78589d';
    const width = typeof s.width === 'number' && s.width > 0 && s.width <= 50 ? s.width : 2;
    out.push({ color, width, points });
  }
  if (out.length === 0) return null;
  return {
    width: Math.min(Number(drawing.width) || 400, 800),
    height: Math.min(Number(drawing.height) || 300, 600),
    backgroundColor: drawing.backgroundColor || null,
    strokes: out,
  };
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const allowedOrigin = env.ALLOWED_ORIGIN || '';
  const origin = request.headers.get('Origin') || '';

  const headers = { ...corsHeaders(origin, allowedOrigin) };

  if (!request.headers.get('Content-Type')?.includes('application/json')) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid content type' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
  }

  let body;
  try {
    const raw = await request.arrayBuffer();
    if (raw.byteLength > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ success: false, error: 'Payload too large' }), { status: 413, headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
  }

  // Honeypot
  if (body.website_url) {
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
  }

  const clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimit(clientIp)) {
    return new Response(JSON.stringify({ success: false, error: 'Too many submissions. Try again later.' }), { status: 429, headers: { ...headers, 'Content-Type': 'application/json' } });
  }

  const turnstileSecret = env.TURNSTILE_SECRET;
  const token = body['cf-turnstile-response'];
  const tv = await validateTurnstile(token, clientIp, turnstileSecret);
  if (!tv.success) {
    return new Response(JSON.stringify({ success: false, error: 'Verification failed. Please try again.' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
  }

  const name = sanitizeText(body.name, MAX_NAME_LENGTH);
  const message = sanitizeText(body.message, MAX_MESSAGE_LENGTH);
  const isPublic = body.public === true;
  const drawing = validateDrawing(body.drawing);

  if (!message && !drawing) {
    return new Response(JSON.stringify({ success: false, error: 'Add a message and/or a drawing.' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
  }

  const spam = looksSpam(body.message || '', body.name || '');
  const labels = [isPublic ? 'public' : 'private', spam ? 'spam' : 'pending'];
  if (drawing) labels.push('has_drawing');
  if (message) labels.push('has_text');

  const payload = { name, message, public: isPublic, drawing };
  const issueBody = '<!-- GUESTBOOK SUBMISSION -->\n```json\n' + JSON.stringify(payload) + '\n```';

  const githubToken = env.GITHUB_TOKEN;
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  if (!githubToken || !owner || !repo) {
    return new Response(JSON.stringify({ success: false, error: 'Server configuration error.' }), { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } });
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
      },
      body: JSON.stringify({
        title: title.slice(0, 255),
        body: issueBody,
        labels,
      }),
    });

    if (!createRes.ok) {
      return new Response(JSON.stringify({ success: false, error: 'Could not save submission.' }), { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: 'Server error.' }), { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } });
  }
}
