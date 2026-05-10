/**
 * send-invite — Supabase Edge Function
 * Deploy: supabase functions deploy send-invite
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const {
      email, name, family_id, family_name, invited_by_name, site_url
    } = await req.json();

    if (!email || !family_id) {
      return new Response(JSON.stringify({ error: 'email and family_id are required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller is authenticated and is a parent in this family
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const callerClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await callerClient.auth.getUser();
      if (user) {
        const { data: member } = await supabaseAdmin
          .from('family_members')
          .select('role')
          .eq('auth_user_id', user.id)
          .eq('family_id', family_id)
          .single();
        if (!member || member.role !== 'parent') {
          return new Response(JSON.stringify({ error: 'Only parents can send invitations' }), {
            status: 403, headers: { ...CORS, 'Content-Type': 'application/json' }
          });
        }
      }
    }

    // Create invitation record
    const token = crypto.randomUUID();
    await supabaseAdmin.from('invitations').insert({
      family_id, email, name: name || null, token
    });

    // Send Supabase auth invitation email
    // SITE_URL secret takes priority over whatever the client reported (avoids localhost links)
    const siteUrl = Deno.env.get('SITE_URL') || site_url || 'http://localhost:5173';
    const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { family_id, family_name, invited_by_name, invited_name: name || null, invite_token: token },
      redirectTo: `${siteUrl}?invite=${token}`
    });

    if (inviteErr) {
      await supabaseAdmin.from('invitations').delete().eq('token', token);
      return new Response(JSON.stringify({ error: inviteErr.message }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});
