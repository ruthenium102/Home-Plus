/**
 * send-invite — Supabase Edge Function
 *
 * Receives an invitation request from an authenticated parent, creates an
 * invitation record, then uses the Supabase Admin API to send a magic-link
 * invitation email to the new family member.
 *
 * Deploy:  supabase functions deploy send-invite
 * Env vars required in Supabase dashboard → Edge Functions → Secrets:
 *   SUPABASE_URL           (auto-set by Supabase)
 *   SUPABASE_SERVICE_ROLE_KEY  (set this manually — never expose client-side)
 *   SITE_URL               (your production app URL, e.g. https://homeplus.app)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    // ---- Parse body ---------------------------------------------------------
    const {
      email,
      name,
      family_id,
      family_name,
      invited_by_name,
      site_url
    }: {
      email: string;
      name?: string;
      family_id: string;
      family_name: string;
      invited_by_name: string;
      site_url: string;
    } = await req.json();

    if (!email || !family_id) {
      return new Response(JSON.stringify({ error: 'email and family_id are required' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    // ---- Validate caller is authenticated -----------------------------------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    // ---- Create admin client (service role bypasses RLS) --------------------
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ---- Verify caller belongs to the family --------------------------------
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    // Confirm caller is a parent in this family
    const { data: member, error: memberErr } = await supabaseAdmin
      .from('family_members')
      .select('role')
      .eq('auth_user_id', user.id)
      .eq('family_id', family_id)
      .single();

    if (memberErr || !member || member.role !== 'parent') {
      return new Response(JSON.stringify({ error: 'Only parents can send invitations' }), {
        status: 403,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    // ---- Create invitation record -------------------------------------------
    const token = crypto.randomUUID();
    const { error: insertErr } = await supabaseAdmin
      .from('invitations')
      .insert({
        family_id,
        email,
        name: name || null,
        token,
        invited_by_auth_id: user.id
      });

    if (insertErr) {
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    // ---- Send Supabase auth invitation email --------------------------------
    // This uses Supabase's built-in mailer (configure SMTP in Auth → Settings).
    // The email includes a magic link that signs the user in immediately.
    // After sign-in, user.user_metadata contains { family_id, name, token }.
    const siteUrl = site_url || Deno.env.get('SITE_URL') || 'http://localhost:5173';
    const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        family_id,
        family_name,
        invited_by_name,
        invited_name: name || null,
        invite_token: token
      },
      redirectTo: `${siteUrl}?invite=${token}`
    });

    if (inviteErr) {
      // Roll back the invitation record if the email failed
      await supabaseAdmin.from('invitations').delete().eq('token', token);
      return new Response(JSON.stringify({ error: inviteErr.message }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ ok: true, token }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});
