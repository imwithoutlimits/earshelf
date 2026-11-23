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
| earshelf Plus | Natural voice, smart cleanup, two-voice dialogue, audiobook export (5/mo), AI summaries, OCR, offline audio, sync, **tags and advanced search, share a web article as a link** | |
| earshelf Pro | Questions about a document, quizzes and flashcards, search across all documents, explain tables, batch import, unlimited exports, Talk to Your Library, priority audio rendering, **private podcast feed, shared vaults** | |
| Tapestry Free | Reading, wells, bookmarks, activity | |
| Tapestry Plus | AI search, recommendations, reflection prompts, AI-drafted wells, translations side by side, guided audio memorization loops, ambient soundscapes, **natural voice reading, partner sharing** | |
| Tapestry Pro | Study guide and talk outline, **AI message draft**, spaced recall, streak insights, **related passages, family vaults and small groups** (plus everything in Plus) | Advanced guided paths, Hebrew and Greek word study (needs your approval, Part 12), dramatized narration |

Tapestry's voice today is the phone's own voice, not Kokoro, so "natural voice narration" is marked Soon there. **Tapestry Pro is on sale** now that it has three features of its own (`SELLABLE` in `packages/billing/src/pitch.ts`).

Things that need data I cannot invent (cross references, Hebrew and Greek word data, extra Bible translations) will need you to approve a data source first, because the Supabase free plan has limited space.

---

## Part 8. If something goes wrong

- **Undo everything:** on GitHub open the merged pull request and click **Revert**. That makes a new pull request that puts the old files back. Merge it. The database file (`trials`) can stay; the old app ignores it.
- **Payment taken but no plan:** in Creem open **Developers, Webhooks** and look at the delivery log for that payment. A red delivery means the server rejected or failed it: usually the signing secret is wrong or the server was down. Fix it and press **Resend**. Resending is safe: repeats are ignored.
- **Webhook says rejected (401):** `CREEM_WEBHOOK_SECRET` in Coolify is not the signing secret of the **same mode** (test or live) as the key.
- **Someone is stuck on Free after paying:** the app and the server read the same table. In Supabase **Table editor, entitlements**, find their row. `plan`, `active` and `expires_at` tell the story.

---

## Part 9. What was added in the second run, and how to try each thing

**There is no new SQL to run.** Upload the new files the same way as Part 1 (a new branch, the changed-files zip, a pull request, wait for green, merge). Then Coolify needs a **Redeploy** of the api app, because the server has two new routes. Netlify rebuilds the websites by itself.

### 9a. earshelf (Plus): tags, advanced search, share a link

1. Open the app, tap the three dots on a book in your library, **Document options**.
2. **Tags:** type a word (like `history`) and press **Add**. A document can have up to 12. Tags sync to your other devices.
3. Back in the library a row of tag buttons appears. Tap one to show only those documents.
4. **Search** (magnifier): type `tag:history`, `type:pdf`, `author:smith`, `is:unfinished`, `"exact phrase"` or `-word` (leaves out anything containing it). You can mix them: `war tag:history is:unfinished`.
5. **Share link:** it appears on **web articles** only. Tap **Share link** and send it. Your friend opens it, signs in and adds the article to **their own** library. Nothing is uploaded or hosted, so there is no copyright problem.
   - The link needs the article's web address, which is saved **from now on**. Articles you added before this update, and articles on a second device, will say "Only articles added from a web link can be shared".

### 9b. earshelf (Pro): Talk to Your Library

1. Search, then pick **Ask** next to Words and Meaning (it only shows for Pro and for people in a Pro trial).
2. Type a question like "What did I save about sleep?" and tap **Ask**.
3. The answer comes **only from your own documents** and lists where it was found. Tap a source to jump to it. If the AI cannot tie the answer to a real place in your documents, it says so instead of guessing.
4. It needs the same things "search by meaning" needs: documents already indexed (this happens by itself in the background after you add or change a document) and the AI and embeddings keys set in Coolify. If **Ask** does not appear, one of those is missing. Your `/status` page shows `aiKey`.

### 9c. Tapestry (Plus): translations side by side

1. Open a passage, tap **Compare**. You see a table with one column per translation, verse by verse. Tap the small buttons (WEB, KJV...) to choose up to three.
2. On the Free plan the button explains that this is a Plus feature.
3. **If you only see one translation:** the others are not loaded yet (this is a correction to an earlier version of this guide, which said Owner setup loads them all; it loads only the default one). To add more: on GitHub open the **Actions** tab, choose **Load Tapestry content** on the left, click **Run workflow**, and in the **translations** box type `engwebp,eng-kjv2006,eng-asv` (World English Bible, King James Version, American Standard Version: all public domain), then **Run workflow**. Wait for the green tick. Each translation uses a few MB of your free database space. Open Compare again.

### 9d. Tapestry (Pro): study guide, spaced recall, streak insights

1. **Study guide:** open any well, tap **Study guide**, choose **Group study** or **Talk outline**, tick the passages and tap **Make the guide**. You get your passages in order, each with the Scripture text **word for word from your own Bible**, plus open questions. Tap **Copy as text** or **Share**.
   - **A rule you should know about.** Tapestry's own rules (`AGENTS.md`, rule 9) say the AI must never write, quote or interpret Scripture or speak with spiritual authority. So this generator does not write sermon points. The AI only groups and orders the passages you chose, gives each group a plain label, and writes **open questions**. Anything that sounds like a claim, a promise or a made-up reference is thrown away and replaced by a built-in question. If you ever want it to write sermon text, that is a deliberate decision to change those rules; tell me first and I will go through it with you.
2. **Spaced recall:** open a passage, tap **Memorize**, practise, then rate how well you recalled it (1 to 5). On Pro the wait before the next review **grows** each time you recall it well and **resets to tomorrow** when you do not. When passages are due, Home shows a line "N passages are ready to recall".
3. **Streak insights:** the **Activity** tab shows your longest thread, active days in 30, your best weekday, a small chart of the last 8 weeks and what you did most.
4. On the Free and Plus plans these show a short note with **See plans**.

### 9e. Checks to do after you merge

- Free test account (trial ended): tags show "included with Plus"; Compare shows the Plus note; Study guide shows the Pro note.
- Plus test account: tags, advanced search, share link and Compare work; Ask, Study guide and Streak insights show Pro notes.
- Pro or trial account: everything works.
- Remember the SQL from Part 6 to end or restart a trial for a test email.

---

## Part 10. Turn on AI and "search by meaning" (your status page says they are off)

Your `/status` page showed `"aiKey": false`. Until you add a key, these show nothing or say "not switched on": AI summaries, quizzes, **Ask your library**, Tapestry recommendations and reflections, and the **study guide questions** (the guide still works, but with the built-in questions only). After the update the page also says so in words under `warnings`.

You have two choices. Pick one.

**Choice A: a paid key (best quality, a few cents of use for most people).**
1. Create an account at **console.anthropic.com**, add a small amount of credit, and in **API keys** create a key. In the same website set a **monthly spending limit** so a surprise can never cost you more than you decide.
2. Coolify, **api** app, **Environment Variables**, add: `AI_API_KEY=paste-your-key` (leave `AI_PROVIDER` empty or `anthropic`). Save.
3. For **search by meaning** and **Ask**, also add `EMBED_API_KEY=` with an **OpenAI** key (platform.openai.com, API keys, set a spending limit there too). Save.
4. **Redeploy** the api app. Reload `/status`: `aiEnabled` and `embeddingsEnabled` should say `true`.

**Choice B: free, runs on your own server (slower and simpler answers).** Your server setup already includes a small local AI called Ollama. In Coolify add `AI_PROVIDER=openai-compatible` and `AI_BASE_URL=http://ollama:11434/v1` (and for embeddings `EMBED_BASE_URL=http://ollama:11434/v1`). Redeploy. It uses server memory, so watch `free -h` as in Part 5.4.

Every AI action counts against each plan's monthly allowance (Free 5, Plus 100, Pro 1000 requests), so your cost is bounded by how many people are on each plan.

---

## Part 11. New in this run, and how to test it

No SQL. Upload the new files like Part 1, merge, then **Redeploy** the api app.

- **Pro priority rendering (earshelf).** When several people listen at once, Pro voices are made first, normal next, the Free preview last. Nobody waits more than about 30 seconds behind newer Pro requests. By default two voices render at once; if your server is strong you can add `TTS_RENDER_SLOTS=3` in Coolify.
- **Soundscapes (Tapestry Plus).** Open the player (tap the bar at the bottom while something plays). **Soundscape**: Soft rain, Prayer pad, or both, with a volume slider. It plays only while a passage is being read, fades in and out, and is made on the phone (no download).
- **Guided memorization loop (Tapestry Plus).** Open a passage, **Memorize**, tap **Guided loop**. It reads the passage aloud, pauses for you to say it, hides more words, and repeats up to all words hidden, then reads it once more so you can check yourself. **Stop loop** ends it at any time. It uses your phone's own voice.
- **Status page** now warns in words when AI or search-by-meaning is off.

---

## Part 12. Your approvals, and what is left

You approved items 1 to 6, so they are built (Part 13 has the steps). One thing still needs a decision from you:

**Hebrew and Greek word study (Tapestry Pro).** I checked the license as you asked, from the source's own page. **STEPBible-Data is licensed CC BY 4.0**: it may be used in any software without asking permission; you must credit it to "STEP Bible" linked to www.STEPBible.org, and any changes you make to the data should be recorded. It contains the Hebrew Old Testament (Leningrad codex, every word tagged with Strong's numbers and grammar), the Greek New Testament (every word tagged), and short word definitions for both languages. That is exactly what a word-by-word study screen needs, and the license allows it.

What I have **not** done: loaded anything, or measured the size. The files are tab-separated text; I would keep only what the screen needs (the reference, the original word, its transliteration, Strong's number, a short meaning, and the grammar code), and I expect that to be tens of MB in your database, but I will not guess: like the cross-references loader, I would first run a "dry run" that downloads the files and prints the exact size before anything is saved.

**To approve:** reply "approve Hebrew and Greek from STEPBible, check the size first". I will then build the loader with the dry run, a word-by-word screen for the passage you are reading (Pro), and the credit line.

**Left to build later:** dramatized multi-voice narration (needs a list of who speaks each verse), and Tapestry "advanced guided paths".

---

## Part 13. New in this run (all six approved items) and how to switch them on

### 13a. Upload and run three SQL files (in this order)

1. Upload the new files like Part 1 (new branch, pull request, green checks, merge).
2. In Supabase, **SQL Editor, New query**, paste and **Run** each file, one at a time, in this order. Each is safe to run twice: `supabase/migrations/0007_podcast_feed.sql`, then `0008_shared_vaults.sql`, then `0053_cross_references.sql`.
3. In Coolify, **Redeploy** the api app.
4. Optional: if the podcast feed address shows the wrong website name, add `PUBLIC_API_URL=https://your-api-address` (no slash at the end) in Coolify and redeploy.

### 13b. Load the cross-reference data (Tapestry Pro, about 50,000 strongest pairs)

1. GitHub, **Actions** tab, **Load cross-references**, **Run workflow**. Leave **dry run** ticked, keep the votes at **5**, run it.
2. Open the finished run and read the log. You want lines like `Read 340000 lines`, `Understood ...`, `Keeping 5xxxx pairs`. If it says "does not look like what was expected", nothing was saved: send me the log.
3. Run it again with **dry run unticked**. It loads the pairs in batches and ends with `Done`. It uses a few MB of database space.
4. The data comes from OpenBible.info under CC BY 4.0. The app shows the credit line under the list.

### 13c. How to try each new feature

- **AI message draft (Tapestry Pro).** Needs the AI key from Part 10. Open a well, **Study guide**, make the guide, then under it **Message draft**, choose tone and length, **Write a draft**. The Scripture in the draft is your own Bible's text, word for word. The AI's writing is checked sentence by sentence: anything that quotes the verses, promises healing, speaks "for God", gives medical advice or names a passage you did not choose is thrown away. If too little is left it says so instead of showing something half-written. A draft counts as 2 AI requests.
- **Private podcast feed (earshelf Pro).** Settings, **Private podcast feed**, **Create my feed**, copy the address. In **Apple Podcasts**: Library, the three dots, **Follow a Show by URL**. In **Overcast**: the plus button, **Add URL**. Pocket Casts and most others work too. **Spotify does not accept private feed addresses.** Then open a book, **Natural voice**, make an audiobook file, and tap **Add to my podcast feed**. Limits: 5 episodes and 300 MB per person; each episode and its file are removed 60 days after you add it. Anyone who has your feed address can listen, so **Make a new address** if it ever leaks (the old one stops working at once).
- **Shared vaults.** earshelf: Settings, **Shared vaults**. Tapestry: Profile, **Together**. Start a vault (Partner holds 2 people, Family 8, Group 25), tap **Copy code** and send it. The other person opens the same screen, enters the code and taps **Join**. They need **no paid plan**. Starting a vault needs Plus (Tapestry partner) or Pro (the rest). In Tapestry open a well and tap **Share to a vault**; in earshelf paste an article link or write a short note. **Only wells (Tapestry) or article links and notes (earshelf) are shared: never private notes, files or book text.** The owner can remove people, make a new code or delete the vault; members can leave. Test it with two accounts.
- **Related passages (Tapestry Pro).** Open a passage, tap **Related**. It lists related passages; tap one to open it.
- **Natural voice reading (Tapestry Plus).** Open a passage in the World English Bible, King James or American Standard (choose it in Profile), tap **Listen** under the buttons. The voice is made when you press it (a few seconds to start) in parts, with the next part getting ready while one plays. Nothing is saved, so replaying makes it again. It counts toward the same monthly natural-voice time as earshelf (Plus 600 minutes). Other translations show a note instead.

### 13d. If something does not work

- `/status` shows `kokoro` `reachable: true` before narration or audiobooks can work.
- A vault code says "did not work": codes are 8 letters and numbers with no 0, O, 1 or I; the owner can make a new one. A code made in earshelf does not work in Tapestry.
- Podcast app says the feed is empty: add an episode first; some apps take a few minutes to refresh.
- "Cross-references have not been set up": run the SQL file `0053` and then the **Load cross-references** action (13a, 13b).
