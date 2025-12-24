import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { logger } from './logger.js';

function parseJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const payloadB64 = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    const json = Buffer.from(payloadB64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function validateSupabaseConfigOrThrow() {
  const url = config.supabaseUrl;
  const key = config.supabaseServiceRoleKey;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  let host = null;
  try {
    host = new URL(url).host;
  } catch {
    throw new Error('Invalid SUPABASE_URL');
  }
  if (!host.includes('supabase.co')) {
    throw new Error('SUPABASE_URL does not look like a Supabase project URL');
  }

  const payload = parseJwtPayload(key);
  const role = payload?.role;
  if (role !== 'service_role') {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not a service_role JWT (check you did not use the anon key)');
  }
}

try {
  if (process.env.NODE_ENV === 'production') {
    validateSupabaseConfigOrThrow();
  } else {
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
      logger.warn('Supabase URL or service role key not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    }
  }
} catch (err) {
  logger.error({ err }, 'Invalid Supabase configuration');
  throw err;
}

function getSupabaseProjectRef(url) {
  try {
    const u = new URL(url);
    const host = u.hostname || '';
    // <ref>.supabase.co
    return host.split('.')[0] || null;
  } catch {
    return null;
  }
}

export const supabaseProjectRef = config.supabaseUrl ? getSupabaseProjectRef(config.supabaseUrl) : null;

if (config.supabaseUrl) {
  logger.info(
    {
      supabase_url_host: (() => {
        try {
          return new URL(config.supabaseUrl).host;
        } catch {
          return config.supabaseUrl;
        }
      })(),
      supabase_project_ref: supabaseProjectRef,
      has_service_role_key: Boolean(config.supabaseServiceRoleKey),
    },
    'Supabase admin client configured',
  );
}

export const supabaseAdmin = createClient(config.supabaseUrl ?? '', config.supabaseServiceRoleKey ?? '', {
  auth: { autoRefreshToken: false, persistSession: false },
});

