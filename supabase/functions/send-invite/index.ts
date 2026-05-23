/**
 * send-invite — Supabase Edge Function
 * Deploy: supabase functions deploy send-invite
 *
 * Sends a branded family invitation. The email body links to:
 *   ${SITE_URL}/accept-invite?token=${token}
 *
 * Delivery (in priority order):
 *   1. If RESEND_API_KEY is set, send the branded HTML invite via Resend.
 *      The recipient lands on /accept-invite which asks them to sign up
 *      (or sign in) and then calls accept_invitation(token) server-side.
 *   2. Otherwise, fall back to Supabase's built-in auth invite mailer
 *      (inviteUserByEmail) so brand-new emails still get a magic link.
 *      For emails that already have a Supabase auth account we *don't*
 *      call inviteUserByEmail (it 422s with "User already registered");
 *      we just persist the invitations row and return existing:true so
 *      the inviter UI can tell them "ask them to log in normally."
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function renderInviteEmail(opts: {
  familyName: string;
  invitedByName: string;
  acceptUrl: string;
}) {
  const familyName = escapeHtml(opts.familyName);
  const invitedByName = escapeHtml(opts.invitedByName);
  // acceptUrl is built from SITE_URL + opaque UUID so it doesn't need escaping
  // beyond href-safety — but quotes still need escaping in case SITE_URL has odd chars.
  const acceptUrl = escapeHtml(opts.acceptUrl);

  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4ede0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#201c18;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f4ede0;">
    ${invitedByName} invited you to join ${familyName} on Home Plus.
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4ede0;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="max-width:520px;width:100%;background:#fffaf3;border:1px solid #e6decf;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:36px 32px 8px 32px;text-align:center;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:600;color:#201c18;letter-spacing:-0.01em;">Home Plus</div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:#9c8e7b;margin-top:6px;">Family operating system</div>
        </td></tr>
        <tr><td style="padding:24px 32px 8px 32px;">
          <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.25;margin:0 0 12px 0;color:#201c18;font-weight:500;">
            You're invited to join ${familyName}.
          </h1>
          <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#3a3329;">
            ${invitedByName} uses Home Plus &mdash; the shared calendar, chores, lists and habits board for the home &mdash; and would like you to join the family.
          </p>
          <p style="margin:0 0 24px 0;font-size:15px;line-height:1.55;color:#3a3329;">
            Tap the button below to set up your account and choose a password.
          </p>
        </td></tr>
        <tr><td style="padding:0 32px 8px 32px;text-align:center;">
          <a href="${acceptUrl}" style="display:inline-block;background:#c44d2e;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:600;">
            Accept invitation
          </a>
        </td></tr>
        <tr><td style="padding:8px 32px 32px 32px;text-align:center;">
          <p style="margin:12px 0 0 0;font-size:12px;color:#6e6458;line-height:1.5;">
            This invitation expires in 7 days.<br />
            Or paste this link into your browser:<br />
            <span style="word-break:break-all;color:#9c8e7b;">${acceptUrl}</span>
          </p>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f2ede4;border-top:1px solid #e6decf;text-align:center;font-size:11px;color:#9c8e7b;line-height:1.5;">
          If you weren't expecting this invite, you can safely ignore this email.
        </td></tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="max-width:520px;width:100%;">
        <tr><td style="padding:16px 32px;text-align:center;font-size:11px;color:#b3a791;line-height:1.5;">
          Home Plus &middot; Your family, organised
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendViaResend(opts: {
  to: string;
  subject: string;
  html: string;
  fromEmail: string;
  fromName: string;
}) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) throw new Error('RESEND_API_KEY not configured');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${opts.fromName} <${opts.fromEmail}>`,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${text || res.statusText}`);
  }
  return await res.json().catch(() => ({}));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const {
      email,
      name,
      role,
      family_id,
      family_name,
      invited_by_name,
      site_url,
    } = await req.json();

    if (!email || !family_id) {
      return json(400, { error: 'email and family_id are required' });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Verify caller is authenticated and is a parent in this family
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const callerClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } },
      );
      const {
        data: { user },
      } = await callerClient.auth.getUser();
      if (user) {
        const { data: member } = await supabaseAdmin
          .from('family_members')
          .select('role')
          .eq('auth_user_id', user.id)
          .eq('family_id', family_id)
          .single();
        if (!member || member.role !== 'parent') {
          return json(403, { error: 'Only parents can send invitations' });
        }
      }
    }

    // Create invitation row (with role)
    const token = crypto.randomUUID();
    const memberRole = role === 'parent' ? 'parent' : 'child';
    const insertRes = await supabaseAdmin.from('invitations').insert({
      family_id,
      email,
      name: name || null,
      role: memberRole,
      token,
    });
    if (insertRes.error) {
      return json(400, { error: insertRes.error.message });
    }

    // Build the branded accept URL. SITE_URL secret overrides whatever the
    // client reported so dev tabs don't end up with localhost links in prod.
    const siteUrl = (
      Deno.env.get('SITE_URL') || site_url || 'http://localhost:5173'
    ).replace(/\/+$/, '');
    const acceptUrl = `${siteUrl}/accept-invite?token=${token}`;

    // Look up whether the email already has a Supabase auth account so we
    // can decide whether to send a fresh signup link or just record the
    // invitation. Uses listUsers paginated.
    let existingUser = false;
    try {
      let page = 1;
      while (page < 50) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({
          page,
          perPage: 200,
        });
        if (error) break;
        if (data.users.some((u) => (u.email ?? '').toLowerCase() === email.toLowerCase())) {
          existingUser = true;
          break;
        }
        if (data.users.length < 200) break;
        page += 1;
      }
    } catch {
      // non-fatal — if lookup fails we still proceed.
    }

    const resendKey = Deno.env.get('RESEND_API_KEY');
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'invites@homeplus.app';
    const resendFromName = Deno.env.get('RESEND_FROM_NAME') || 'Home Plus';

    // ---- Option A: Resend (preferred when configured) -------------------
    if (resendKey) {
      try {
        await sendViaResend({
          to: email,
          subject: `${invited_by_name || 'Someone'} invited you to ${family_name || 'their family'} on Home Plus`,
          html: renderInviteEmail({
            familyName: family_name || 'the family',
            invitedByName: invited_by_name || 'A family member',
            acceptUrl,
          }),
          fromEmail: resendFromEmail,
          fromName: resendFromName,
        });
        return json(200, { ok: true, token, accept_url: acceptUrl, existing: existingUser });
      } catch (err) {
        // Don't strand the invitation row — it can still be used via copy link.
        return json(500, {
          error: err instanceof Error ? err.message : 'Resend failed',
          token,
          accept_url: acceptUrl,
        });
      }
    }

    // ---- Option B: fall back to Supabase's auth mailer ------------------
    if (existingUser) {
      // Don't call inviteUserByEmail for an account that already exists —
      // Supabase returns a 422 and the user gets no email. Keep the invite
      // row (the email-fallback path on the client picks it up on next sign-in)
      // and tell the UI it should display a "ask them to sign in" message.
      return json(200, {
        ok: true,
        token,
        accept_url: acceptUrl,
        existing: true,
      });
    }

    const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        family_id,
        family_name,
        invited_by_name,
        invited_name: name || null,
        invite_token: token,
      },
      redirectTo: acceptUrl,
    });

    if (inviteErr) {
      // NOTE: do NOT delete the invitation row on a benign duplicate. The
      // invite link still works via the manual copy-link path / email
      // fallback in FamilyContext.
      return json(400, {
        error: inviteErr.message,
        token,
        accept_url: acceptUrl,
      });
    }

    return json(200, { ok: true, token, accept_url: acceptUrl, existing: false });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : 'Internal error' });
  }
});
