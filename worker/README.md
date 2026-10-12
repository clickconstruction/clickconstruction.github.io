# Contact-form Worker

Receives submissions from the form at the bottom of clickconstruction.com and
emails them to robert@clickconstruction.com through Cloudflare Email Routing.
No mail is ever sent to the visitor.

Public address: `https://contact.clickconstruction.com/`
Sends from: `contact@clicktooling.com` (clicktooling.com has Email Routing on)

## One-time setup in the Cloudflare dashboard

These need dashboard permissions the deploy token doesn't have.

1. **Turn on Email Routing for clicktooling.com.**
   Cloudflare dashboard → clicktooling.com → Email → Email Routing → Get started.
   Accept the MX and TXT records it offers. clicktooling.com has no mailbox,
   so nothing else is affected.
2. **Verify the destination address.**
   Same page → Destination addresses → Add → `robert@clickconstruction.com`.
   Click the link in the verification email Cloudflare sends.
3. **Optional: Turnstile.**
   Dashboard → Turnstile → Add widget for `clickconstruction.com` (Managed,
   invisible is fine). Copy the Site Key into `data-turnstile-sitekey` on the
   form in `index.html`, then store the Secret Key on the Worker:
   `npx wrangler@4 secret put TURNSTILE_SECRET`
   Without the secret the Worker relies on the honeypot and rate limit only.

## Deploy

```bash
cd worker
npx wrangler@4 deploy
```

Needs Node 22+. On this Mac the default `node` is 20, but Homebrew has a
newer one at `/usr/local/opt/node/bin`, so prefix with
`PATH=/usr/local/opt/node/bin:$PATH`.

The first deploy creates the `contact.clickconstruction.com` custom domain and
its DNS record automatically.

## Test from a terminal

```bash
curl -s -X POST https://contact.clickconstruction.com/ \
  -H 'Origin: https://clickconstruction.com' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test Person","phone":"512-555-0100","email":"","message":"Testing the form."}'
```

Expect `{"ok":true}` and an email in the inbox within a few seconds.

## What the Worker checks

- Origin must be clickconstruction.com or www.
- Hidden `website` field must be empty (honeypot).
- At most 5 submissions per minute per IP.
- Name required; at least one of phone or email required.
- Also accepted and included in the email: `company`, `open` (list of what's
  waiting on an answer), `project_type`, `stage`, `city`, `role`, `message`.
- Turnstile token, when `TURNSTILE_SECRET` is set.
