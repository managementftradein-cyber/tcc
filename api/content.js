const { sb } = require('./_supabase');

// Consolidated GET/read endpoints. Kept as separate functions internally so
// each type's query logic is unchanged from the original single-purpose
// files — only the routing (type dispatch) is new.

async function getEvents(db) {
  const q = await db.from('events').select('id,title,date,location,description').order('date', { ascending: true }).limit(30);
  if (q.error) throw q.error;
  return { items: q.data || [] };
}

async function getDepartments(db) {
  const q = await db.from('departments').select('id,name,description,icon,contact_email').eq('is_active', true).order('display_order', { ascending: true }).limit(30);
  if (q.error) throw q.error;
  return { items: q.data || [] };
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function getPhotos(db) {
  const q = await db.from('gallery_photos').select('id,url,caption,category').eq('is_active', true).order('display_order', { ascending: true }).limit(60);
  if (q.error) throw q.error;
  return { items: shuffle(q.data || []) };
}

async function getNews(db) {
  const q = await db.from('news').select('*').eq('published', true).order('created_at', { ascending: false });
  if (q.error) throw q.error;
  return { items: q.data || [] };
}

async function getPropheticWords(db) {
  const q = await db.from('prophetic_words').select('*').eq('published', true).order('created_at', { ascending: false });
  if (q.error) throw q.error;
  return { items: q.data || [] };
}

async function getSiteContent(db) {
  const settings = await db.from('church_settings')
    .select('church_name,email,phone,location,service_times,about_label,about_heading,about_body,about_quote,about_image_url,hero_eyebrow,hero_title,hero_body,hero_interval_seconds,map_url,facebook_url,instagram_url,youtube_url,spotify_url')
    .eq('id', 1).maybeSingle();
  if (settings.error) throw settings.error;
  const photos = await db.from('gallery_photos').select('id,url,caption,category,display_order,is_active').eq('is_active', true).order('display_order', { ascending: true }).limit(100);
  if (photos.error) throw photos.error;
  const items = photos.data || [];
  const hero = items.filter(x => String(x.category || '').toLowerCase() === 'hero');
  return {
    settings: settings.data || {},
    hero: hero.length ? hero : items.slice(0, 3),
    gallery: items.filter(x => String(x.category || '').toLowerCase() !== 'hero')
  };
}

async function getLiveStatus(db) {
  const q = await db.from('live_status').select('*').eq('id', 1).maybeSingle();
  if (q.error) throw q.error;
  const row = q.data || { is_live: false, title: 'TCC Live' };
  // live.html reads isLive/embedUrl (camelCase); the DB columns are
  // is_live/embed_url (snake_case). The old standalone live-status.js
  // returned the raw row, which meant live.html's `d.isLive` check was
  // always undefined and the live banner never actually showed — fixed by
  // returning both cases here rather than relying on the frontend to match
  // the DB's naming.
  return { ...row, isLive: !!row.is_live, embedUrl: row.embed_url || row.stream_url };
}

const HANDLERS = {
  events: getEvents,
  departments: getDepartments,
  photos: getPhotos,
  news: getNews,
  'prophetic-words': getPropheticWords,
  'site-content': getSiteContent,
  'live-status': getLiveStatus
};

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const type = String(req.query.type || '');
  const handler = HANDLERS[type];
  if (!handler) return res.status(400).json({ error: `Unknown content type: ${type}` });
  try {
    const data = await handler(sb());
    return res.json(data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Could not load content' });
  }
};
