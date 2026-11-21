# Upgrade guide: Creem payments, 7-day trial, Google sign-in, and fixing the server

Read this top to bottom. Every step says exactly what to click or paste. You never run `npm`.
Where a terminal is needed it is **Windows PowerShell** (press the Windows key, type `PowerShell`, press Enter).

Things marked **[YOU]** can only be done by you, in a website that has your login.
If a button has a slightly different name than I wrote, pick the closest one.

---

## The 10 second summary

| What | Status |
|---|---|
| Pricing: Plus $9.99/mo or $89/yr, Pro $19.99/mo or $169/yr, for both apps | Done in the code |
| Payments moved from Lemon Squeezy to Creem (checkout, webhook, "Manage billing") | Done in the code. Needs Part 3 from you |
| 7-day free trial of Pro for everyone, then upgrade prompt or automatic Free | Done in the code. Needs Part 2 from you |
| Tapestry has its own paid tier and plan screen | Done. Plus is on sale; Pro shows "Coming soon" until its features exist (see Part 7) |
| Google sign-in button in both apps | Done in the code. Needs Part 4 from you |
| Server that will not load on Coolify | I could not see your server, so see Part 5. I added a self-check page so we can find the cause fast |

Do the parts in this order: **1, 2, 3, 4, 5, 6**.

---

## Part 1. Put the new files on GitHub (safely, on a branch)

Your repo has a rule: nothing goes straight to `main`. We use a **branch** and a **pull request**. It is all in the browser.

1. **[YOU]** Unzip `earshelf-changed-files-only.zip` somewhere easy, for example `C:\Users\YOURNAME\Desktop\upgrade`. Inside is a folder with the same structure as your repo (`apps`, `packages`, `services`, `supabase`, `deploy`, and a few files).
2. **[YOU]** Open your repo on github.com. Click the branch button (it says `main`), type `creem-trial-google` in the box, and click **Create branch: creem-trial-google**.
3. You are now on the new branch (the button says `creem-trial-google`). Click **Add file**, then **Upload files**.
4. **[YOU]** Drag **the folders and files from inside the unzipped folder** into the page. GitHub keeps the folder structure. Files with the same name are replaced; new ones are added.
   - GitHub accepts up to 100 files in one go. The changed-files zip has fewer. If GitHub says there are too many, do it in two rounds (first `packages` and `services`, then `apps`, `supabase`, `deploy` and the loose files).
5. At the bottom type a message like `Creem payments, 7-day trial, Google sign-in` and choose **Commit directly to the creem-trial-google branch**. Click **Commit changes**.
6. GitHub shows a yellow bar **Compare & pull request**. Click it, then **Create pull request**.
7. Wait about 2 to 5 minutes. Under the pull request you will see the checks. **Green** means the tests and the type check passed. Netlify also adds a **Deploy Preview** link to try the website before it goes live.
   - If a check is **red**: click **Details**, copy the red text and send it to me. Do not merge.
8. When green, click **Merge pull request**, then **Confirm merge**. Netlify now rebuilds your websites by itself.

> Do **not** merge yet if you want to test first. Parts 2, 3 and 4 do not depend on the merge. Part 5 (Coolify) needs the merge, because Coolify builds from `main`.

---

## Part 2. Run the new database file (Supabase) [YOU]

This adds the trial table. The apps keep working if you skip it, but there will be no trial until you run it.

1. Go to **supabase.com**, open your project, click **SQL Editor** in the left menu, then **New query**.
2. On GitHub, open the file `supabase/migrations/0006_trials_and_creem.sql`, click the **Copy raw file** button (two squares icon).
3. Paste it into the Supabase box and click **Run**. You should see `Success. No rows returned`. It is safe to run twice.

### Make your own accounts Pro for free (so you can always use Kokoro) [YOU]

You are the owner, so you should not have to pay yourself. In the same SQL Editor, **New query**, paste this, change the email to the one you sign in with, and click **Run**:

```sql
insert into entitlements (user_id, product, plan, active, source, expires_at)
select u.id, v.p, 'pro', true, 'manual', null
from auth.users u, (values ('earshelf'), ('tapestry')) as v(p)
where u.email = 'YOUR-EMAIL@example.com'
on conflict (user_id, product) do update
  set plan = 'pro', active = true, source = 'manual', expires_at = null;
```

`source = 'manual'` means no payment event can ever overwrite it. To take it away later:
`delete from entitlements where source = 'manual' and user_id = (select id from auth.users where email = 'YOUR-EMAIL@example.com');`

> This grant is made by you in your own database. The apps themselves can never grant a plan.

---

## Part 3. Creem [YOU]

### 3a. Fix two Tapestry products first

In your product list, **Tapestry Plus (Annual)** and **Tapestry Pro (Annual)** showed **$89.00/mo** and **$169.00/mo**. The other annual products showed `/yr`. That looks like those two are set to bill **every month**. If so, a customer would be charged $89 or $169 **each month**.

1. In Creem open **Products**, then **Tapestry Plus (Annual)**.
2. Check the **billing period**. It must be **yearly** (every 12 months). If you can change it, change it and save.
3. If Creem will not let you change it, make a **new** product with the same name and price but a yearly period, and archive the wrong one. Do the same for **Tapestry Pro (Annual)**.
4. If you made new products, copy their new product ids (they start with `prod_`). Later, in Part 3d, you will put them in Coolify as `CREEM_PRODUCT_TAPESTRY_PLUS_YEAR` and `CREEM_PRODUCT_TAPESTRY_PRO_YEAR`.

Also: the description on **Earshelf Pro (Annual)** is a copy of the Plus one. Open it and use the Pro text (AI summaries and study tools, shared vaults, unlimited exports). Do **not** set a free trial inside Creem. The 7-day trial is handled by the apps, and a second trial there would double it.

### 3b. Get your API key

In Creem go to **Settings**, then **API Keys**, and create or copy your key. Creem has **separate keys for test mode and live mode**. Keep this key secret.

### 3c. Add the webhook

1. In Creem go to **Developers**, then **Webhooks**, and add a webhook.
2. **URL:** `https://api.YOUR-ADDRESS/webhooks/creem` (your API address from Coolify, the same one you use for `/health`).
3. Tick these events (or leave the list empty to receive all of them, which also works): `checkout.completed`, `subscription.active`, `subscription.paid`, `subscription.trialing`, `subscription.update`, `subscription.canceled`, `subscription.scheduled_cancel`, `subscription.past_due`, `subscription.unpaid`, `subscription.expired`, `subscription.paused`, `refund.created`, `dispute.created`.
4. Copy the **signing secret** (also called webhook secret). Keep it secret.

### 3d. Give the server the keys (Coolify) [YOU]

1. Open Coolify, your project, the **api** application (the same place you added your Supabase keys in the old guide, **Environment Variables**).
2. Add these (turn on **Developer view** if it helps, then paste one per line):

```
CREEM_API_KEY=paste-your-key
CREEM_WEBHOOK_SECRET=paste-the-signing-secret
CREEM_TEST_MODE=false
```
3. Only if you made new products in 3a (or you are testing with test-mode products), also add the ones that changed, for example:
```
CREEM_PRODUCT_TAPESTRY_PLUS_YEAR=prod_xxxxxxxx
CREEM_PRODUCT_TAPESTRY_PRO_YEAR=prod_xxxxxxxx
```
The other six product ids are already built in (they are the ones you sent me).
4. Click **Save**, then **Redeploy**. New settings only apply after a redeploy.

### 3e. Test with fake money first (recommended)

1. In Creem switch to **Test mode**. Make test copies of the 8 products there (test products have **different ids**), create a **test** API key and a **test** webhook pointing at the same URL.
2. In Coolify set `CREEM_TEST_MODE=true`, the test key, the test webhook secret, and the 8 `CREEM_PRODUCT_...` variables with the test product ids. Names:
   `CREEM_PRODUCT_EARSHELF_PLUS_MONTH`, `..._PLUS_YEAR`, `..._PRO_MONTH`, `..._PRO_YEAR`, and the same four with `TAPESTRY`.
3. Redeploy, buy Plus in the app with Creem's test card, and see Part 6.
4. When happy, set the live key, live secret, `CREEM_TEST_MODE=false`, delete the 8 test product variables, and Redeploy.

How it works, so you can trust it: the app asks **your server** for a payment page. The server tells Creem who is buying. Creem sends a **signed** message to your server when the payment is real. Only that message unlocks a plan. The "thank you" page unlocks nothing.

---

## Part 4. Google sign-in [YOU]

You set up Google once, then Supabase once. About 15 minutes.

### 4a. Google Cloud

1. Go to **console.cloud.google.com** and sign in with your Google account.
2. Top left, click the project name, then **New project**. Name it `Earshelf and Tapestry`. Click **Create** and make sure it is selected.
3. Open the menu (three lines), choose **Google Auth Platform** (Google may also call this **APIs & Services, OAuth consent screen**). Click **Get started**.
4. **App name:** `earshelf` (people see this). **User support email:** yours. **Audience:** **External**. **Contact email:** yours. Agree and **Create**.
5. Left menu, **Audience**: set the publishing status to **In production** (the button says **Publish app**). If you leave it on **Testing**, only people you list as test users can sign in.
6. Left menu, **Clients**, then **Create client**. **Application type: Web application**. **Name:** `Supabase login`.
7. **Authorized JavaScript origins:** click **Add URI** for each of your sites, with no slash at the end, for example `https://YOUR-EARSHELF-SITE.netlify.app` and `https://YOUR-TAPESTRY-SITE.netlify.app`. Add your own domains too if you have them.
8. **Authorized redirect URIs:** click **Add URI** and paste `https://YOUR-SUPABASE-PROJECT-REF.supabase.co/auth/v1/callback`. You can copy the exact address from Supabase in step 4b.
9. Click **Create**. Copy the **Client ID** and the **Client secret**.

### 4b. Supabase

1. In Supabase click **Authentication**, then **Providers** (sometimes under **Sign In / Providers**). Click **Google**.
2. Switch it **On**. It shows a **Callback URL**: that is the address for 4a step 8.
3. Paste the **Client ID** and **Client secret**. Click **Save**.
4. Still in Authentication, click **URL Configuration**. Make sure **Site URL** is one of your sites and **Redirect URLs** contains **both** sites, written exactly like `https://YOUR-EARSHELF-SITE.netlify.app` and `https://YOUR-TAPESTRY-SITE.netlify.app` (add a second line with `/**` at the end of each if Supabase asks for a pattern). Save.

### 4c. Check

Open your website in a private window and click **Continue with Google**. You should pick an account and land back in the app, signed in. If the button says "Google sign-in is not switched on yet", 4b is not saved. If Google shows `redirect_uri_mismatch`, the address in 4a step 8 is not exactly the Supabase **Callback URL**.

If you ever want to hide the button, add `VITE_GOOGLE_SIGNIN` with the value `off` in Netlify (Site configuration, Environment variables) and redeploy.

---

## Part 5. The API server that will not load (Coolify)

**What I checked.** I ran the server code from `services/api` on the same Node version your Dockerfile uses and it starts, answers `/health`, and passes all its tests. The Dockerfile copies everything the server needs. So the code is not what is stopping it. The cause is in how it runs on your machine. I cannot see your machine, so below are the real causes, from most to least likely, with how to check each one. I also added a **self-check page** and **startup warnings** so the server tells you what is wrong.

**What I added.**
- `https://YOUR-API-ADDRESS/status` shows which settings are missing (yes or no only, no secrets) and whether the Kokoro voice container answers.
- At start the server prints `SETUP PROBLEM: ...` lines in the Coolify **Logs** for any missing setting.

### Step 5.1: Look at it from outside (browser)

1. Open `https://YOUR-API-ADDRESS/health`.
2. What do you see?

| You see | Meaning | Go to |
|---|---|---|
| `{"ok":true}` | The server is fine. Then open `/status` (5.2) | 5.2 |
| `no available server` or a plain `404 page not found` | Coolify's front door cannot reach the container | 5.3, 5.4 |
| Spinner forever, or a security warning | Address or certificate problem | 5.5 |

### Step 5.2: Open the self-check page

Open `https://YOUR-API-ADDRESS/status`. Read `problems` and `warnings`. Each line says what to fix. In `kokoro` look at `reachable`: if it is `false`, the voice container is not answering (see 5.4). To change a setting, change it in Coolify, **Save**, **Redeploy**.

### Step 5.3: The address must end in `:10000` [YOU]

This is the most common cause and easy to miss.

1. Coolify, your project, the **api** app, **Configuration**.
2. Find the **Domains** box for the **api** service.
3. It must look exactly like `https://api.YOUR-IP.sslip.io:10000` (with `:10000` at the end). The `:10000` tells Coolify's front door which port the server listens on inside. Without it, it knocks on the wrong door and you see "no available server".
4. **Save**, then **Redeploy**.

### Step 5.4: Look inside the machine (PowerShell then the server)

If 5.3 was already right, we need the server's own words.

1. Open **PowerShell** on your PC and connect (use your own key file and IP address from your Notes table):
```powershell
ssh -i "C:\Users\YOURNAME\oracle-keys\YOUR-KEY-FILE.key" ubuntu@YOUR_SERVER_IP
```
Type `yes` if it asks. The prompt changes. Everything you paste next runs **on the server** (it is Linux, that is normal).

2. See what is running and whether it is healthy:
```bash
docker ps -a --format "table {{.Names}}\t{{.Status}}"
```
Look for the line with **api** in the name. `Up ... (healthy)` is good. `(unhealthy)`, `Restarting` or `Exited` is the problem. The `ollama-models` line saying `Exited (0)` is normal.

3. Read the server's own log (replace `API-NAME` with the name you saw that contains `api`):
```bash
docker logs --tail 80 API-NAME
```
Look for lines starting with `SETUP PROBLEM`, or an error. Copy the last 60 lines.

4. Check if the machine ran out of memory (this kills containers silently):
```bash
free -h
docker stats --no-stream
```
If `Mem` shows almost everything used and `Swap` is `0B`, add safety memory (copy all five lines):
```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```
Then in Coolify **Redeploy**. The voice container (Kokoro) alone can use up to 4 GB.

5. Leave the server: type `exit` and press Enter.

### Step 5.5: Certificate or address problems

If the browser warns about the certificate or never loads, the free `sslip.io` name may be rate limited. Switch the **Domains** to a free DuckDNS name as described in `GUIDE.md` Part 4, then redeploy.

### Step 5.6: Restart cleanly [YOU]

In Coolify open the **api** app and click **Redeploy**. If Coolify offers a choice to rebuild **without cache**, choose that once. The first deploy downloads the voice engine (a few GB) and can take 5 to 15 minutes, and the page stays empty until the log shows the server is listening.

### Step 5.7: Getting Kokoro to speak

After `/health` works, the voice works when **all** of these are true:
1. `/status` shows `kokoro` `reachable: true`.
2. You are allowed to use it: Free users get 20 minutes a day of **Kokoro only**; Plus and Pro get all natural voices. Your own account is Pro if you ran the owner SQL in Part 2.
3. The app can reach the server: in Netlify, `VITE_API_URL` is your API address **without a slash**, and in Coolify `ALLOWED_ORIGINS` lists your Netlify addresses exactly (no slash).
4. You are signed in, and the book has finished syncing (the audio is made from the copy in your account).
Then open a book, **Settings, Natural voice**, tick **Use a natural voice**, press **Hear a sample**.

### If it still fails

Send me three things (hide any key you see): the `/status` page text, the output of `docker ps -a ...` from 5.4, and the last 60 lines of the api log. With those I can name the exact cause.

---

## Part 6. Test it end to end

Use a **second email that is not your owner email** (your owner account is always Pro, which hides the trial).

1. Open the website in a private window. Click **Continue with Google** (or use an email).
2. A sheet says **7 days of Pro, on us**. Click **Start exploring**.
3. Settings (earshelf) or Profile (Tapestry), **Plan** card: it says `Pro trial: 7 days left`.
4. Open **See plans**. Pick **Plus**, **Monthly**. It opens Creem. Pay with the test card (Creem shows test card details in test mode).
5. You return to the app, see `Thank you! Confirming your payment…`, then `Your plan is ready.` and the plan card says `Plus` (you keep Pro features until the trial ends, then Plus).

**See the "trial ended" screen without waiting 7 days.** In Supabase SQL Editor (change the email):
```sql
update trials set ends_at = now() - interval '1 minute'
where user_id = (select id from auth.users where email = 'TEST-EMAIL@example.com');
```
Reload the app: it shows **Your Pro trial has ended** with **Choose Plus**, **Choose Pro** and **Continue with Free**.
**Start the trial again for testing:**
```sql
delete from trials where user_id = (select id from auth.users where email = 'TEST-EMAIL@example.com');
```
Real customers cannot do this: they can read their trial but never change it, and "delete my content" does not touch it.

**Free Kokoro preview:** as a Free user with the trial ended, turn on **Use a natural voice** in a book. It plays the Kokoro voice for up to 20 minutes a day, then says the daily allowance is used.

---

## Part 7. How the plans work (for your reference)

- **Everyone** gets 7 days of **Pro** once per app, starting when they first sign in after this update. No card. Then they are on **Free** unless they pay, and see the "trial ended" screen once.
- **To trial Plus instead of Pro:** change `TRIAL_PLAN` in `packages/billing/src/plans.ts` to `'plus'` **and** change `'pro'` to `'plus'` in the `start_trial` function in migration 0006, then run that file again in Supabase.
- **Buying during the trial:** a Plus buyer keeps Pro features until the trial ends, then moves to Plus. A cancelled plan keeps working until the period they paid for ends. A refund or dispute removes the plan at once. An old plan being cancelled never removes a newer one.
- **"Unlimited" natural voice** on Plus and Pro is a fair-use monthly allowance (Plus 600 minutes, Pro 3000) so one heavy listener cannot cost more than they pay. Raise it in `packages/billing/src/plans.ts` if you like.
- **Plus audiobook exports:** 5 a month. Pro: no limit (still inside the 3000 voice minutes).

### What is in the apps today, and what says "Soon"

The plan screens show anything not built yet with a **Soon** label, so nobody pays for something that is missing. When a feature ships, remove its `soon: true` in `packages/billing/src/pitch.ts`.

| App | Working now | Marked "Soon" (not built yet) |
|---|---|---|
| earshelf Free | Imports, device voices, 20 min/day Kokoro preview, basic search | |
| earshelf Plus | Natural voice, smart cleanup (drops reference lists and citations), two-voice dialogue, audiobook export (5/mo), AI summaries, OCR, offline audio, sync | Advanced search and tags, link sharing |
| earshelf Pro | Questions about a document, quizzes and flashcards, search across all documents, explain tables, batch import, unlimited exports | Talk to Your Library, private podcast feed, shared vaults, priority queue |
| Tapestry Free | Reading, wells, bookmarks, activity | |
| Tapestry Plus | AI search, recommendations, reflection prompts, AI-drafted wells | Natural voice narration, audio memorization loops, side-by-side translations, soundscapes, partner sharing |
| Tapestry Pro | (Includes Plus) | **Everything that makes Pro different is still to build**, so **Tapestry Pro is off sale**: its card says "Coming soon" and the server refuses to start a checkout for it. Put it on sale by adding `'pro'` to `SELLABLE.tapestry` in `packages/billing/src/pitch.ts` once a few of its Pro features have shipped. |

Tapestry's voice today is the phone's own voice, not Kokoro, so "natural voice narration" is marked Soon there.

Things that need data I cannot invent (cross references, Hebrew and Greek word data, extra Bible translations) will need you to approve a data source first, because the Supabase free plan has limited space.

---

## Part 8. If something goes wrong

- **Undo everything:** on GitHub open the merged pull request and click **Revert**. That makes a new pull request that puts the old files back. Merge it. The database file (`trials`) can stay; the old app ignores it.
- **Payment taken but no plan:** in Creem open **Developers, Webhooks** and look at the delivery log for that payment. A red delivery means the server rejected or failed it: usually the signing secret is wrong or the server was down. Fix it and press **Resend**. Resending is safe: repeats are ignored.
- **Webhook says rejected (401):** `CREEM_WEBHOOK_SECRET` in Coolify is not the signing secret of the **same mode** (test or live) as the key.
- **Someone is stuck on Free after paying:** the app and the server read the same table. In Supabase **Table editor, entitlements**, find their row. `plan`, `active` and `expires_at` tell the story.
