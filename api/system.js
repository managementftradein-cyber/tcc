// Consolidated tiny GET endpoints. Each handler's logic is unchanged from
// the original files — only the routing (type dispatch) is new.

function handleHealth() {
  const checks = {
    supabase_url: !!process.env.SUPABASE_URL,
    public_key: !!(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY),
    service_role_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    admin_emails: !!process.env.ADMIN_EMAILS
  };
  const ok = Object.values(checks).every(Boolean);
  return { status: ok ? 200 : 500, body: { ok, checks } };
}

function handleConfig() {
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!process.env.SUPABASE_URL || !key) {
    return { status: 500, body: { error: 'Supabase public configuration is not configured' } };
  }
  return { status: 200, body: { url: process.env.SUPABASE_URL, anonKey: key } };
}

function handleAuthStatus(req) {
  const email = String(req.query.email || '').trim().toLowerCase();
  const allowed = String(process.env.ADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  const result = {
    admin_email_configured: allowed.length > 0,
    email_supplied: !!email,
    email_is_listed: email ? allowed.includes(email) : false
  };
  return { status: 200, body: result };
}

const HANDLERS = {
  health: () => handleHealth(),
  config: () => handleConfig(),
  'auth-status': (req) => handleAuthStatus(req)
};

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const type = String(req.query.type || '');
  const handler = HANDLERS[type];
  if (!handler) return res.status(400).json({ error: `Unknown system type: ${type}` });
  try {
    const result = handler(req);
    return res.status(result.status).json(result.body);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
};
