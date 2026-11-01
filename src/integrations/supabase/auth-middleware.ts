import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'
import { supabase as clientSupabase } from './client'

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New Supabase API keys are opaque strings, not bearer JWTs.
    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
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

    const supabase = createClient<Database>(
      SUPABASE_URL!,
      SUPABASE_PUBLISHABLE_KEY!,
      {
        global: {
          fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY!),
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        auth: {
          storage: undefined,
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      throw new Error(
        userError?.message
          ? `Unauthorized: ${userError.message}`
          : 'Unauthorized: Session expired or invalid. Please sign out and sign in again.'
      );
    }

    return next({
      context: {
        supabase,
        userId: userData.user.id,
        user: userData.user,
        claims: { sub: userData.user.id, email: userData.user.email },
      },
    });
  });
