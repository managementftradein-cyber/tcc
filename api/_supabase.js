const { createClient } = require('@supabase/supabase-js');

function sb() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase environment variables are not configured');
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

const tables = {
  sermons: 'sermons', events: 'events', announcements: 'announcements',
  prayer: 'prayer_requests', visitors: 'visitors', subscribers: 'subscribers',
  giving: 'giving_records', settings: 'church_settings',
  gallery: 'gallery_photos', departments: 'departments', news: 'news', prophetic_words: 'prophetic_words', live_status: 'live_status'
};

async function requireAdmin(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw Object.assign(new Error('Authentication required'), { status: 401 });

  const client = sb();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('Invalid or expired session'), { status: 401 });

  const allowed = String(process.env.ADMIN_EMAILS || '')
    .split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(String(data.user.email || '').toLowerCase())) {
    throw Object.assign(new Error('You are not authorized to access the admin dashboard'), { status: 403 });
  }
  return data.user;
}

module.exports = { sb, tables, requireAdmin };
