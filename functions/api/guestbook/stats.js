const SMARTGB_URL = 'http://users2.smartgb.com/g/g.php?a=s&i=g26-40205-c8';
const CACHE_TTL = 300;

let cached = null;
let cachedAt = 0;

function corsHeaders(origin, allowed) {
    const o = allowed && origin && allowed.includes(origin) ? origin : (allowed && allowed.split(',')[0]?.trim()) || '*';
    return {
        'Access-Control-Allow-Origin': o,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
    };
}

export async function onRequest(context) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || 'https://konerocat.github.io';
    const headers = { ...corsHeaders(origin, allowed), 'Content-Type': 'application/json' };

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers });
    }

    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
    }

    const now = Date.now() / 1000;
    if (cached && (now - cachedAt) < CACHE_TTL) {
        return new Response(JSON.stringify(cached), { headers });
    }

    try {
        const res = await fetch(SMARTGB_URL, {
            headers: { 'User-Agent': 'konerocat-guestbook-stats/1.0' },
        });
        const html = await res.text();

        const match = html.match(/Total\s+(\d[\d,]*)\s+visitors?\s+and\s+(\d[\d,]*)\s+messages?/i);
        const data = {
            visitors: match ? parseInt(match[1].replace(/,/g, ''), 10) : null,
            legacy_messages: match ? parseInt(match[2].replace(/,/g, ''), 10) : null,
        };

        cached = data;
        cachedAt = now;

        return new Response(JSON.stringify(data), { headers });
    } catch (e) {
        return new Response(JSON.stringify({ visitors: null, legacy_messages: null }), { headers });
    }
}
