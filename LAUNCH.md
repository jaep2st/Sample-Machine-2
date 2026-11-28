# Launch setup

The app ships in **beta mode** (every feature free, no Pro prompts) until the settings below are filled in.
Everything you need to change is in one place: the `CFG` block at the top of the script in `index.html`.

```js
const CFG={
  polarOrg:"",        // Polar organization ID
  checkout:"",        // Polar checkout link for Pro
  portal:"https://polar.sh/",  // customer portal link (manage / cancel)
  price:"$5 a month or $40 a year",
  fine:"Cancel any time. Not happy? Email us within 7 days for a full refund.",
  support:"",         // support email
  freeSaves:5         // free saves per day
};
```

## 1. Polar (payments, tax, license keys)

1. Create an account at polar.sh and finish identity and payout setup.
2. Create a product **Producer Face Pro** with two prices: monthly ($5) and yearly ($40). Optional: a one-time "Lifetime (launch deal)".
3. Add a **License key** benefit to the product. Set an activation limit of **3** (phone, laptop, one spare). No expiry: the key stops working by itself when a subscription ends.
4. Copy the **organization ID** (Settings) into `polarOrg`, the product's **checkout link** into `checkout`, and your **customer portal** link into `portal`.

How the app uses it: the customer pastes their key, the app calls Polar's public license-key endpoints (`activate`, then `validate`) and remembers the key on that device. It re-checks once a day and keeps working offline for 14 days. If a key is refunded or a plan ends, Pro switches off at the next check.

## 2. Cloudflare Pages (hosting you're allowed to sell from)

1. Create a Cloudflare account, then Workers & Pages → Create → Pages → connect the GitHub repo.
2. Framework preset: **None**. Build command: *empty*. Output directory: **/** (the repo root).
3. Add your domain under Custom domains.
4. `functions/api/polar/[action].js` deploys automatically. It's a backup relay for license checks if a browser blocks the direct call to Polar.
5. `_headers` adds basic security headers.
6. When the Cloudflare site works: turn off GitHub Pages (repo Settings → Pages), and consider making the repo private.

## 2b. Key-free unlock (buyers never copy a key)

1. Polar: Products > Checkout Links > Pro > set **Success URL** to `https://producerface.com/?checkout_id={CHECKOUT_ID}`.
2. Polar: Settings > Access Tokens > New token, scopes **checkouts:read** and **customer_sessions:write**, no expiry. Copy it.
3. Cloudflare: Workers & Pages > producerface > Settings > Variables and secrets > Add, type **Secret**, name `POLAR_TOKEN`, paste the token. Then Deployments > latest > Retry deployment.

Without the token, buyers still unlock with "Already bought? Unlock Pro" (email + code) or by pasting the key.

## 3. Support email

Cloudflare → your domain → Email → Email Routing: forward `help@yourdomain` to your own inbox (free).
Put it in `support` in `CFG`, and replace `SUPPORT_EMAIL` in `terms.html` and `privacy.html`.

## 4. Name

The app is named **Producer Face** (domain: producerface.com). Support email: producerface.help@gmail.com.

## What's free and what's Pro

| Free | Pro |
|---|---|
| Load tracks, Best / Breaks / Open / All / One-shots | Unlimited saves |
| Every flip mode, editing, tempo and key tools | Export kit (MPC / SP-404 / DAW) |
| Beat section: pads, sequencer, record, bounce | Isolate (drums, no drums, centre, sides) |
| 5 saves a day | Save and reopen named beat sessions |
| Autosave of the last beat | |

## Before you flip it on

- [ ] Test a real purchase in Polar's sandbox or with a 100% discount code, enter the key on your phone, and check Pro unlocks.
- [ ] Refund that test order and check Pro switches off the next day.
- [ ] Run `node tests/lab.js`, `node tests/flips.js` and `node tests/best.js` (GitHub runs them on every push).
