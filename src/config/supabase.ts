import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// Uses the service role key to bypass Row Level Security (RLS) for
// server-side operations. Never expose this key to the client.
export const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});
