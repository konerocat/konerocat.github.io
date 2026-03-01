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
      const text = first.body && first.body.trim();
      if (text) {
        ownerReply = { text };
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
