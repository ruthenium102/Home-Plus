# Supabase email templates

These are the branded HTML templates for Home Plus auth emails. They are
version-controlled here, but Supabase reads them from the dashboard — copy
the contents into:

  Supabase Dashboard → Authentication → Email Templates → [template]

Templates use Supabase merge tags:
  - `{{ .ConfirmationURL }}` — the action link
  - `{{ .Email }}`           — recipient email
  - `{{ .Token }}`           — six-digit OTP (where applicable)
  - `{{ .SiteURL }}`         — your configured site URL

If the dashboard subject line field is blank, Supabase falls back to its
default — set it explicitly per template:

  invite.html         → "You've been invited to Home Plus"
  reset-password.html → "Reset your Home Plus password"

## SMTP

The default Supabase SMTP has a 4-emails-per-hour limit. Once Home Plus
goes beyond a few invites, configure a custom SMTP provider (Resend,
Postmark, SendGrid) under Project Settings → Authentication → SMTP.
