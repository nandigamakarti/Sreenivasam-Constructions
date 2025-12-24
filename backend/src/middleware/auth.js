import { supabaseAdmin } from '../supabaseClient.js';
import { logger } from '../logger.js';

export async function authenticate(req, res, next) {
  try {
    if (process.env.NODE_ENV !== 'production') {
      req.user = { id: null };
      return next();
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (!token) {
      return res.status(401).json({ message: 'Missing bearer token' });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      logger.warn({ error }, 'Auth failed');
      return res.status(401).json({ message: 'Invalid token' });
    }

    req.user = data.user;
    return next();
  } catch (err) {
    logger.error({ err }, 'Auth middleware error');
    return res.status(500).json({ message: 'Authentication error' });
  }
}

