const { sb } = require('./_supabase');
const { checkRateLimit } = require('./_ratelimit');

// Consolidated public POST endpoints. Each handler keeps the validation,
// honeypot, and rate limiting that used to live in the separate
// contact.js/subscribe.js files — only the routing (type dispatch) is new.

async function handleContact(db, req, body) {
  if (String(body.website || '').trim()) return { status: 200, body: { ok: true, stored: false } }; // honeypot
  const cleanName = String(body.name || '').trim().slice(0, 120);
  const cleanEmail = String(body.email || '').trim().slice(0, 200);
  const cleanPhone = String(body.phone || '').trim().slice(0, 40);
  const cleanMessage = String(body.message || '').trim().slice(0, 3000);
  if (!cleanName || !cleanMessage) { const err = new Error('Name and message are required'); err.status = 400; throw err; }
  if (cleanEmail && !/^\S+@\S+\.\S+$/.test(cleanEmail)) { const err = new Error('Please enter a valid email address'); err.status = 400; throw err; }

  const { limited } = await checkRateLimit(db, req, 'contact', { max: 5, windowMinutes: 10 });
  if (limited) { const err = new Error('Too many messages sent recently. Please try again later.'); err.status = 429; throw err; }

  const settings = await db.from('church_settings').select('store_visitor_data').eq('id', 1).maybeSingle();
  const store = settings.error || !settings.data ? true : settings.data.store_visitor_data !== false;
  if (store) {
    const q = await db.from('visitors').insert({ name: cleanName, email: cleanEmail || null, phone: cleanPhone || null, message: cleanMessage });
    if (q.error) throw q.error;
  }
  return { status: 200, body: { ok: true, stored: store } };
}

async function handleSubscribe(db, req, body) {
  if (String(body.website || '').trim()) return { status: 200, body: { ok: true, stored: false } }; // honeypot
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  if (!/^\S+@\S+\.\S+$/.test(email)) { const err = new Error('Valid email required'); err.status = 400; throw err; }

  const { limited } = await checkRateLimit(db, req, 'subscribe', { max: 5, windowMinutes: 10 });
  if (limited) { const err = new Error('Too many attempts. Please try again later.'); err.status = 429; throw err; }

  const s = await db.from('church_settings').select('store_visitor_data').eq('id', 1).maybeSingle();
  const store = s.error || !s.data ? true : s.data.store_visitor_data !== false;
  if (store) {
    const q = await db.from('subscribers').upsert({ email }, { onConflict: 'email' });
    if (q.error) throw q.error;
  }
  return { status: 200, body: { ok: true, stored: store } };
}

async function handlePrayerRequest(db, req, body) {
  if (String(body.website || '').trim()) return { status: 200, body: { ok: true } }; // honeypot
  const { name, email, request, message, subject } = body;
  const text = String(request || message || '').trim().slice(0, 3000);
  if (!text) { const err = new Error('Please enter your prayer request before submitting.'); err.status = 400; throw err; }

  const { limited } = await checkRateLimit(db, req, 'prayer-requests', { max: 5, windowMinutes: 10 });
  if (limited) { const err = new Error('Too many requests submitted recently. Please try again later.'); err.status = 429; throw err; }

  const q = await db.from('prayer_requests').insert({
    name: String(name || '').trim().slice(0, 120) || null,
    email: String(email || '').trim().slice(0, 200) || null,
    subject: String(subject || '').trim().slice(0, 120) || 'Prophetic Room',
    message: text
  });
  if (q.error) throw q.error;
  return { status: 201, body: { ok: true } };
}

const HANDLERS = {
  contact: handleContact,
  subscribe: handleSubscribe,
  'prayer-requests': handlePrayerRequest
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const type = String(req.query.type || '');
  const handler = HANDLERS[type];
  if (!handler) return res.status(400).json({ error: `Unknown form type: ${type}` });
  try {
    const result = await handler(sb(), req, req.body || {});
    return res.status(result.status).json(result.body);
  } catch (e) {
    console.error(e);
    return res.status(e.status || 500).json({ error: e.message || 'Could not submit form' });
  }
};
