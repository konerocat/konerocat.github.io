const fs = require('fs');
const path = require('path');
const https = require('https');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  });
}
loadEnv();

const token = process.env.GITHUB_TOKEN;
let owner = process.env.GITHUB_OWNER;
let repo = process.env.GITHUB_REPO;
const repoEnv = process.env.GITHUB_REPOSITORY;
if (!owner || !repo) {
  const match = repoEnv && repoEnv.match(/^([^/]+)\/(.+)$/);
  if (match) {
    owner = owner || match[1];
    repo = repo || match[2];
  }
}

if (!token || !owner || !repo) {
  console.error('Set GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO (or GITHUB_REPOSITORY=owner/repo) in env or .env');
  process.exit(1);
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'https://api.github.com');
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'guestbook-admin-cli',
      },
    };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
      opts.headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = https.request(opts, (res) => {
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
    if (body) req.write(body);
    req.end();
  });
}

function getLabelNames(issue) {
  return (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
}

function parsePayload(body) {
  if (!body || typeof body !== 'string') return null;
  const match = body.match(/<!-- GUESTBOOK SUBMISSION -->\s*```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch (e) {
    return null;
  }
}

async function listIssues(filter) {
  const labels = filter === 'pending' ? 'public,pending' : filter === 'public' ? 'public' : filter === 'private' ? 'private' : null;
  const pathStr = `/repos/${owner}/${repo}/issues?state=all&per_page=100` + (labels ? `&labels=${labels}` : '');
  const issues = await request('GET', pathStr);
  if (!Array.isArray(issues)) throw new Error('Expected array');

  const out = [];
  for (const issue of issues) {
    const names = getLabelNames(issue);
    if (filter === 'pending' && (!names.includes('public') || !names.includes('pending'))) continue;
    if (filter === 'public' && !names.includes('public')) continue;
    if (filter === 'private' && !names.includes('private')) continue;
    const payload = parsePayload(issue.body);
    const preview = payload?.message ? payload.message.slice(0, 50) + (payload.message.length > 50 ? '…' : '') : '(no text)';
    out.push({
      number: issue.number,
      title: issue.title,
      labels: names,
      created: issue.created_at,
      preview,
    });
  }
  out.sort((a, b) => b.number - a.number);
  return out;
}

async function addLabel(issueNumber, label) {
  const issue = await request('GET', `/repos/${owner}/${repo}/issues/${issueNumber}`);
  const current = getLabelNames(issue);
  if (current.includes(label)) {
    console.log('Label', label, 'already present');
    return;
  }
  await request('POST', `/repos/${owner}/${repo}/issues/${issueNumber}/labels`, { labels: [label] });
  console.log('Added label:', label);
}

async function removeLabel(issueNumber, label) {
  await request('DELETE', `/repos/${owner}/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`);
  console.log('Removed label:', label);
}

async function postComment(issueNumber, body) {
  await request('POST', `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, { body });
  console.log('Posted reply to #' + issueNumber);
}

async function main() {
  const [cmd, arg1, ...rest] = process.argv.slice(2);

  if (cmd === 'list') {
    const filter = arg1 || 'all';
    const issues = await listIssues(filter);
    console.log('Issues (' + filter + '):', issues.length);
    issues.forEach((i) => {
      console.log('  #' + i.number, i.labels.join(', '), '|', i.preview);
    });
    return;
  }

  if (cmd === 'approve') {
    const num = parseInt(arg1, 10);
    if (!num) {
      console.error('Usage: approve <issue_number>');
      process.exit(1);
    }
    await removeLabel(num, 'pending');
    await addLabel(num, 'approved');
    console.log('Approved #' + num);
    return;
  }

  if (cmd === 'spam') {
    const num = parseInt(arg1, 10);
    if (!num) {
      console.error('Usage: spam <issue_number>');
      process.exit(1);
    }
    await removeLabel(num, 'pending');
    await removeLabel(num, 'approved');
    await addLabel(num, 'spam');
    console.log('Marked #' + num + ' as spam');
    return;
  }

  if (cmd === 'reply') {
    const num = parseInt(arg1, 10);
    const text = rest.join(' ').replace(/^["']|["']$/g, '');
    if (!num || !text) {
      console.error('Usage: reply <issue_number> "Your reply text"');
      process.exit(1);
    }
    await postComment(num, text);
    return;
  }

  if (cmd === 'rebuild') {
    const { execSync } = require('child_process');
    const scriptPath = path.join(__dirname, 'build-guestbook-json.js');
    execSync(`node "${scriptPath}"`, { stdio: 'inherit', env: { ...process.env, GITHUB_OWNER: owner, GITHUB_REPO: repo } });
    console.log('Run "git add public/guestbook.json && git commit -m \'chore: update guestbook\' && git push" to publish.');
    return;
  }

  console.log(`
Guestbook admin CLI

  list [pending|public|private|all]   List issues (default: all)
  approve <issue_number>              Add "approved", remove "pending"
  spam <issue_number>                 Mark as spam (removes approved/pending)
  reply <issue_number> "text"         Post your reply as first comment
  rebuild                             Regenerate public/guestbook.json locally

Private entries and replies are only visible to you in this CLI and on GitHub.
We do not send DMs to submitters.
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
