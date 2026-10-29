# EZ Attendance

A tiny attendance notification app for **desktop and mobile** with English, Spanish, French, Arabic, and Vietnamese interfaces.

## Use it in two ways

### 1. My email app: no backend needed

Works with Outlook, Gmail, Apple Mail, or any configured mail app on Windows, Mac, Android, or iPhone.

1. Open the website (or local index.html), select **My email app**.
2. Enter the **HR inbox** once. The address stays **only on that device**, not in GitHub.
3. Complete the form and select **Open email to send**.
4. In your email program, press **Send**. You must send the draft yourself.

The employee is included as CC when supported by their email app. This is **not** an automatic delivery receipt. The website cannot know whether the employee pressed Send.

**Desktop shortcut:** Open the published site in a browser, then create a desktop shortcut with its URL. On a work PC, set Outlook as the default email application. To use a local file instead, save index.html and config.js in the same folder and open index.html in a browser.

**Mobile:** Open the published URL in your phone browser; choose Add to Home Screen. Install/sign in to Gmail, Outlook, or Apple Mail and make sure it handles email links.

### 2. Cloudflare online: automatic HR + employee email

An administrator sets this up **once**. Employees then open the site, fill in the form, and press **Send notification**. No employee email account is needed. HR receives the notice, and the employee receives a separate email receipt. **No SMS.**

**Quick setup:**

1. In GitHub, go to **Settings > Pages > Build and deployment > Deploy from a branch > main > /(root) > Save**. After it deploys, the expected site URL is:
   https://danieloculus0-bot.github.io/EZ-Attendance/
2. Create a **Cloudflare Worker** named ez-attendance-mail, using the code in [worker/index.js](worker/index.js). You can deploy with [Wrangler](https://developers.cloudflare.com/workers/wrangler/) from the worker folder using the command: npx wrangler deploy.
3. Choose **one** outgoing email provider:
   - **Cloudflare Email Sending:** Uses Cloudflare's own service. Requires Workers Paid to send receipts to arbitrary employee addresses. Verify a sending domain, uncomment the send_email binding in worker/wrangler.toml, and deploy. You do not need Resend.
   - **Resend + Cloudflare Worker:** Can use Resend's free sending tier (subject to its limits). Verify a sending domain in Resend and create an API key. Keep the send_email binding commented out. Set secret RESEND_API_KEY.
4. In Cloudflare Worker **Settings > Variables and Secrets**, add:
   - HR_EMAIL: the company's attendance inbox (**secret**).
   - FROM_EMAIL: a sender address from your verified sending domain (**secret**).
   - TURNSTILE_SECRET: Cloudflare Turnstile private secret (**secret**).
   - RESEND_API_KEY: only if using Resend (**secret**).
5. In Cloudflare **Turnstile**, create a widget for hostname danieloculus0-bot.github.io; copy the **public site key**. The Turnstile *secret* belongs in the Worker only.
6. In GitHub, edit config.js. Set apiUrl to https://YOUR-WORKER.workers.dev/notify and siteKey to the **public** Turnstile site key. These two values are allowed to be public.
7. Test using a non-sensitive fake attendance notice and verify the HR email and employee receipt before telling employees to use it.

**Command-line Worker setup, if preferred:**
- In the worker/ folder, run npx wrangler login and npx wrangler deploy.
- Add secrets one at a time: npx wrangler secret put HR_EMAIL, then FROM_EMAIL, and then TURNSTILE_SECRET.
- For Resend only: npx wrangler secret put RESEND_API_KEY.
- After enabling a native email binding, redeploy with npx wrangler deploy.

## What's in the app?

- Name, employee number, email, phone, optional department.
- **A** Leaving early, **B** Running late, **C** Absent, **D** Requesting time off, **E** Other.
- Relevant dates/times only, optional comments, PTO yes/no and hours when relevant.
- Five complete UI translations, including right-to-left Arabic.
- No login, no database, no SMS, no employee roster, no proprietary contact details in the repository.

## Important

- **GitHub Pages does not send email.** It hosts the form; the email app or secure Worker handles sending.
- The public form **does not authenticate employee identity**. Cloudflare Turnstile reduces automated abuse but does not prove an employee is who they claim. For sensitive use, evaluate company sign-in and rate limits.
- The public website should not store passwords, API keys, internal employee records or confidential company information.
- **PTO selections are requests, not approvals.**
- Do not include private medical details or diagnoses.
- Outbound delivery may be delayed or rejected by email providers. A successful Worker response means the outgoing email service accepted the message, not that HR opened it.
- Browser local storage stores only the HR recipient address for the email-app mode, never submitted employee records.
- Employee notices and receipts are processed by email providers and may be retained in mailboxes and provider logs. Apply company retention and privacy policies.
- Keep the existing reporting process in place until HR has verified the automated route.

## Technical files

- index.html: all five languages, responsive form, conditional questions, local mailto connector, online connector.
- config.js: public online connector URL and Turnstile site key; initially empty.
- worker/index.js: secure backend for native Cloudflare Email Sending or Resend.
- worker/wrangler.toml: Worker deployment configuration.
