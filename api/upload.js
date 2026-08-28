const { sb, requireAdmin } = require('./_supabase');

const BUCKET = 'gallery';
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

module.exports = async (req, res) => {
  try {
    await requireAdmin(req);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { contentType, dataBase64, caption, category } = req.body || {};
    const ext = ALLOWED[contentType];
    if (!ext) return res.status(400).json({ error: 'Unsupported image type. Use JPG, PNG, WEBP or GIF.' });
    if (!dataBase64) return res.status(400).json({ error: 'No image data received' });

    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length > MAX_BYTES) return res.status(400).json({ error: 'Image is larger than 5MB' });

    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const db = sb();
    const up = await db.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false });
    if (up.error) throw up.error;

    const pub = db.storage.from(BUCKET).getPublicUrl(path);
    const rec = await db.from('gallery_photos').insert({ url: pub.data.publicUrl, caption: caption || '', category: category || 'Gallery', is_active: true, display_order: 0 }).select().single(); if (rec.error) throw rec.error; return res.status(201).json({ url: pub.data.publicUrl, path, item: rec.data });
  } catch (e) {
    console.error(e);
    return res.status(e.status || 500).json({ error: e.message || 'Upload failed' });
  }
};
