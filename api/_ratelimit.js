const crypto = require('crypto');

function clientIp(req) {
  // Vercel sets x-forwarded-for; take the first (client) address in the chain.
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket?.remoteAddress || 'unknown';
}

function ipHash(req) {
  // Don't store raw IPs in the database — hash with a salt from the
  // deployment's own service-role key so it's not reversible without it.
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY || 'tcc-ratelimit';
  return crypto.createHash('sha256').update(salt + '|' + clientIp(req)).digest('hex');
}

/**
 * Returns { limited: boolean }. Also opportunistically prunes old rows for
 * this bucket so the table doesn't grow unbounded.
 *
 * @param db Supabase client (service role)
 * @param req the request object
 * @param bucket a short name for this endpoint, e.g. 'contact'
 * @param opts {max, windowMinutes}
 */
async function checkRateLimit(db, req, bucket, { max = 5, windowMinutes = 10 } = {}) {
  const hash = ipHash(req);
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const { count, error } = await db
    .from('rate_limit_log')
    .select('id', { count: 'exact', head: true })
    .eq('bucket', bucket)
    .eq('ip_hash', hash)
    .gte('created_at', since);

  // If the rate-limit table/check itself fails (e.g. migration not run yet),
  // fail open rather than blocking legitimate traffic — this is defense in
  // depth on top of, not a replacement for, the RLS policy lockdown.
  if (error) { console.warn('Rate limit check failed, failing open:', error.message); return { limited: false }; }

  if ((count || 0) >= max) return { limited: true };

  await db.from('rate_limit_log').insert({ bucket, ip_hash: hash });

  // Best-effort cleanup of old rows for this bucket (ignore failures).
  db.from('rate_limit_log')
    .delete()
    .eq('bucket', bucket)
    .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .then(() => {}, () => {});

  return { limited: false };
}

module.exports = { checkRateLimit, clientIp };
