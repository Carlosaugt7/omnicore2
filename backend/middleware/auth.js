const { createClient } = require('@supabase/supabase-js');

// Use a lightweight Supabase client just for JWT verification
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * Express middleware that validates the Supabase JWT from the
 * Authorization header and ensures the authenticated user matches
 * the userId provided in the request body/query.
 *
 * On success, attaches `req.userId` (verified from the token).
 * On failure, returns 401 Unauthorized.
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  // Verify the JWT with Supabase
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Extract the userId from the request (body or query)
  const requestedUserId = req.body?.userId || req.query?.userId;

  // If a userId was provided, it must match the token owner
  if (requestedUserId && requestedUserId !== user.id) {
    return res.status(403).json({ error: 'Forbidden: userId mismatch' });
  }

  // Attach verified userId to the request for downstream handlers
  req.userId = user.id;
  next();
}

module.exports = { requireAuth };
