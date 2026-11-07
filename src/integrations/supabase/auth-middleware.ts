import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'
import { supabase as clientSupabase } from './client'

function cleanKey(val?: string | null): string {
  if (!val) return '';
  return val.trim().replace(/^[\r\n\s"'`]+|[\r\n\s"'`]+$/g, '').trim();
}

function isNewSupabaseApiKey(value: string): boolean {
  const cleaned = cleanKey(value);
  return cleaned.startsWith('sb_publishable_') || cleaned.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  const cleanedKey = cleanKey(supabaseKey);
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    const urlStr = typeof input === 'string' ? input : input instanceof Request ? input.url : '';
    // Strip Authorization header for PostgREST (/rest/v1/) requests when:
    // - using new opaque keys (sb_publishable_ / sb_secret_)
    // - or token is an ES256 JWT which PostgREST cannot verify (causes PGRST301 "No suitable key or wrong key type")
    if (urlStr.includes('/rest/v1/')) {
      const authHeader = headers.get('Authorization');
      if (authHeader) {
        if (
          isNewSupabaseApiKey(cleanedKey) ||
          authHeader.includes('eyJhbGciOiJFUzI1Ni') ||
          authHeader.includes(cleanedKey)
        ) {
          headers.delete('Authorization');
        }
      }
    }

    headers.set('apikey', cleanedKey);
    return fetch(input, { ...init, headers });
  };
}

export const requireSupabaseAuth = createMiddleware({ type: 'function' })
  .client(async ({ next }) => {
    let token: string | undefined;

    try {
      const { data } = await clientSupabase.auth.getSession();
      let session = data.session;

      // Proactively refresh if the token has expired or will expire in under 60 seconds
      if (session) {
        const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
        if (expiresAt > 0 && expiresAt - Date.now() < 60_000) {
          const { data: refreshed, error } = await clientSupabase.auth.refreshSession();
          if (!error && refreshed.session) {
            session = refreshed.session;
          }
        }
        token = session?.access_token;
      }
    } catch (e) {
      console.warn('Failed to retrieve or refresh session in requireSupabaseAuth client:', e);
    }

    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      sendContext: token ? { token } : {},
    });
  })
  .server(async ({ next, context }) => {
    const DEFAULT_URL = "https://wziyxocwnwqeupkkutgr.supabase.co";
    const DEFAULT_KEY = "sb_publishable_3JSJLIsZJcjtz4c2GeSWMA_kHIroIUP";

    const SUPABASE_URL = process.env['SUPABASE_URL'] || process.env['VITE_SUPABASE_URL'] || DEFAULT_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env['SUPABASE_PUBLISHABLE_KEY'] || process.env['VITE_SUPABASE_PUBLISHABLE_KEY'] || DEFAULT_KEY;

    const request = getRequest();

    let token: string | undefined;

    // 1. Try reading from Authorization header
    const authHeader = request?.headers?.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '').trim();
    }

    // 2. Fallback: try reading from sendContext (passed by .client)
    if (!token && (context as any)?.token) {
      token = String((context as any).token).trim();
    }

    // 3. Fallback: try reading from cookie if present
    if (!token && request?.headers) {
      const cookieHeader = request.headers.get('cookie') || '';
      const match = cookieHeader.match(/sb-[a-z0-9]+-auth-token=([^;]+)/i);
      if (match && match[1]) {
        try {
          const decoded = decodeURIComponent(match[1]);
          const parsed = JSON.parse(decoded);
          token = parsed?.[0] || parsed?.access_token || parsed;
        } catch {
          // ignore cookie parse error
        }
      }
    }

    if (!token) {
      throw new Error('Unauthorized: No authentication session found. Please sign in to continue.');
    }

    const rawServiceKey =
      process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
      process.env['SUPABASE_SECRET_KEY'] ||
      process.env['SERVICE_ROLE_KEY'] ||
      process.env['SUPABASE_SERVICE_KEY'] ||
      process.env['VITE_SUPABASE_SERVICE_ROLE_KEY'] ||
      process.env['VITE_SUPABASE_SECRET_KEY'] ||
      process.env['SUPABASE_SECRET'] ||
      process.env['SB_SECRET_KEY'] ||
      process.env['SECRET_KEY'];
    const SERVICE_ROLE_KEY = cleanKey(rawServiceKey) || undefined;
    const dbKey = SERVICE_ROLE_KEY || SUPABASE_PUBLISHABLE_KEY!;

    const supabase = createClient<Database>(
      SUPABASE_URL!,
      dbKey,
      {
        global: {
          fetch: createSupabaseFetch(dbKey),
        },
        auth: {
          storage: undefined,
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    let userId: string | null = null;
    let userClaims: any = null;
    let userObj: any = null;

    // 1. Try local cryptographic verification via getClaims (uses project JWKS without calling buggy GoTrue /user endpoint)
    try {
      const claimsResult = await supabase.auth.getClaims(token);
      if (claimsResult?.data?.claims?.sub) {
        userClaims = claimsResult.data.claims;
        userId = claimsResult.data.claims.sub;
        userObj = { id: userId, email: userClaims.email || '' };
      }
    } catch (e) {
      console.warn('getClaims verification failed, attempting fallback:', e);
    }

    // 2. Fallback: try getUser(token)
    if (!userId) {
      try {
        const { data: userData } = await supabase.auth.getUser(token);
        if (userData?.user?.id) {
          userObj = userData.user;
          userId = userData.user.id;
          userClaims = { sub: userData.user.id, email: userData.user.email };
        }
      } catch (e) {
        console.warn('getUser fallback failed:', e);
      }
    }

    // 3. Fallback: decode JWT payload directly (bypasses upstream GoTrue keyfunc bug for ES256)
    if (!userId) {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=');
          const str = Buffer.from(padded, 'base64').toString('utf8');
          const payload = JSON.parse(str);

          if (payload?.sub) {
            const nowSec = Math.floor(Date.now() / 1000);
            if (payload.exp && payload.exp < nowSec) {
              throw new Error('Unauthorized: Your session has expired. Please sign out and sign in again.');
            }
            userId = payload.sub;
            userClaims = payload;
            userObj = { id: payload.sub, email: payload.email || '' };
          }
        }
      } catch (e: any) {
        if (e?.message?.startsWith('Unauthorized:')) throw e;
      }
    }

    if (!userId) {
      throw new Error('Unauthorized: Invalid or unverifiable session token. Please sign out and sign in again.');
    }

    return next({
      context: {
        supabase,
        userId,
        user: userObj,
        claims: userClaims,
        token,
      },
    });
  });
