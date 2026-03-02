const fs = require('fs');
const path = require('path');
const https = require('https');

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
const REPLY_IMG_DIR = path.join(__dirname, '..', 'public', 'reply-images');

function fetchBinary(urlStr) {
  return new Promise((resolve, reject) => {
    const get = (u, depth) => {
      if (depth > 5) return reject(new Error('Too many redirects'));
      const parsed = new URL(u);
      const mod = parsed.protocol === 'https:' ? https : require('http');
      mod.get({
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: {
          'User-Agent': 'guestbook-build',
          ...(parsed.hostname.includes('github.com') ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location, depth + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error('HTTP ' + res.statusCode + ' for ' + u));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ buf: Buffer.concat(chunks), type: res.headers['content-type'] || '' }));
      }).on('error', reject);
    };
    get(urlStr, 0);
  });
}

function request(opts, postBody) {
  return new Promise((resolve, reject) => {
    const url = new URL(opts.path, 'https://api.github.com');
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: opts.method || 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'guestbook-build',
        ...(postBody ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postBody) } : {}),
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
    if (postBody) req.write(postBody);
    req.end();
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

async function main() {
  const issues = await request({
    path: `/repos/${owner}/${repo}/issues?state=all&labels=public,approved&per_page=100`,
  });
  if (!Array.isArray(issues)) {
    throw new Error('Expected array of issues');
  }

  const entries = [];
  for (const issue of issues) {
    const labels = getLabelNames(issue);
    if (!labels.includes('public') || !labels.includes('approved')) continue;
    const payload = parseSubmissionFromBody(issue.body);
    if (!payload) continue;

    let ownerReply = null;
    const comments = await request({ path: `/repos/${owner}/${repo}/issues/${issue.number}/comments` });
    if (Array.isArray(comments) && comments.length > 0) {
      const first = comments[0];
      const raw = first.body && first.body.trim();
      if (raw) {
        const imageUrls = [];
        const cleaned = raw.replace(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g, (_, url) => {
          imageUrls.push(url);
          return '';
        }).trim();
        ownerReply = { text: cleaned };
        if (imageUrls.length > 0) {
          const localPaths = [];
          for (const imgUrl of imageUrls) {
            try {
              const { buf, type } = await fetchBinary(imgUrl);
              const ext = type.includes('png') ? '.png' : type.includes('gif') ? '.gif' : type.includes('webp') ? '.webp' : '.jpg';
              const hash = require('crypto').createHash('md5').update(imgUrl).digest('hex').slice(0, 12);
              const filename = hash + ext;
              if (!fs.existsSync(REPLY_IMG_DIR)) fs.mkdirSync(REPLY_IMG_DIR, { recursive: true });
              fs.writeFileSync(path.join(REPLY_IMG_DIR, filename), buf);
              localPaths.push('/public/reply-images/' + filename);
              console.log('  Downloaded reply image:', filename);
            } catch (e) {
              console.warn('  Failed to download reply image:', imgUrl, e.message);
              localPaths.push(imgUrl);
            }
          }
          ownerReply.images = localPaths;
        }
      }
    }

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
