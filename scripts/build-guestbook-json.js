const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const token = process.env.GITHUB_TOKEN;
const repoEnv = process.env.GITHUB_REPOSITORY;
let owner = process.env.GITHUB_OWNER;
let repo = process.env.GITHUB_REPO;
if (!owner || !repo) {
  const match = repoEnv && repoEnv.match(/^([^/]+)\/(.+)$/);
  if (match) {
    owner = owner || match[1];
    repo = repo || match[2];
  }
}
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--owner') owner = args[++i];
  else if (args[i] === '--repo') repo = args[++i];
}

if (!token || !owner || !repo) {
  console.error('Usage: GITHUB_TOKEN=xxx [GITHUB_OWNER=xxx GITHUB_REPO=xxx] node scripts/build-guestbook-json.js');
  process.exit(1);
}

const OUT_PATH = path.join(__dirname, '..', 'public', 'guestbook.json');

function apiRequest(apiPath, acceptHeader) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, 'https://api.github.com');
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': acceptHeader || 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'guestbook-build',
      },
    }, (res) => {
      let data = '';
      res.on('data', (ch) => (data += ch));
      res.on('end', () => {
        try {
          const j = data ? JSON.parse(data) : null;
          if (res.statusCode >= 400) reject(new Error(j?.message || res.statusCode + ' ' + data));
          else resolve(j);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function downloadImage(urlStr, depth) {
  depth = depth || 0;
  if (depth > 8) return Promise.reject(new Error('Too many redirects'));
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const mod = parsed.protocol === 'https:' ? https : http;
    mod.get({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: { 'User-Agent': 'guestbook-build' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(downloadImage(res.headers.location, depth + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const ct = (res.headers['content-type'] || '').split(';')[0].trim();
        const mime = ct.startsWith('image/') ? ct : 'image/jpeg';
        resolve('data:' + mime + ';base64,' + buf.toString('base64'));
      });
    }).on('error', reject);
  });
}

function parseSubmissionFromBody(body) {
  if (!body || typeof body !== 'string') return null;
  const match = body.match(/<!-- GUESTBOOK SUBMISSION -->\s*```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch (e) {
    return null;
  }
}

function getLabelNames(issue) {
  return (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
}

async function processReply(issueNumber) {
  const comments = await apiRequest(
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    'application/vnd.github.full+json'
  );
  if (!Array.isArray(comments) || comments.length === 0) return null;

  const first = comments[0];
  const raw = first.body && first.body.trim();
  if (!raw) return null;

  const text = raw.replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim();
  const reply = {};
  if (text) reply.text = text;

  const html = first.body_html || '';
  const imgSrcRe = /<img[^>]+src="([^"]+)"/g;
  const cdnUrls = [];
  let m;
  while ((m = imgSrcRe.exec(html)) !== null) {
    if (m[1] && !m[1].startsWith('data:')) cdnUrls.push(m[1]);
  }

  if (cdnUrls.length > 0) {
    console.log('  Found', cdnUrls.length, 'image(s) in reply, converting to base64...');
    const b64images = [];
    for (const url of cdnUrls) {
      try {
        const dataUrl = await downloadImage(url);
        const sizeKB = Math.round(dataUrl.length / 1024);
        console.log('    OK:', sizeKB + 'KB');
        b64images.push(dataUrl);
      } catch (e) {
        console.warn('    FAIL:', e.message, '- url:', url.slice(0, 100));
      }
    }
    if (b64images.length > 0) reply.images = b64images;
  }

  return (reply.text || reply.images) ? reply : null;
}

async function main() {
  const issues = await apiRequest(
    `/repos/${owner}/${repo}/issues?state=all&labels=public,approved&per_page=100`
  );
  if (!Array.isArray(issues)) {
    throw new Error('Expected array of issues');
  }

  const entries = [];
  for (const issue of issues) {
    const labels = getLabelNames(issue);
    if (!labels.includes('public') || !labels.includes('approved')) continue;
    const payload = parseSubmissionFromBody(issue.body);
    if (!payload) continue;

    console.log('Processing #' + issue.number);
    const ownerReply = await processReply(issue.number);

    const created_at = issue.created_at ? new Date(issue.created_at).toISOString().slice(0, 10) : '';
    entries.push({
      id: issue.number,
      created_at,
      displayName: payload.name || '',
      message: payload.message || '',
      drawing: payload.drawing || null,
      ownerReply,
    });
  }

  entries.sort((a, b) => (a.id || 0) - (b.id || 0));

  const outDir = path.dirname(OUT_PATH);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync(OUT_PATH, JSON.stringify(entries, null, 2), 'utf8');
  console.log('Wrote', entries.length, 'entries to', OUT_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
