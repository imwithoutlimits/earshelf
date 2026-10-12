# earshelf: go-live guide (no terminal, no npm)

You will never type `npm run build` or `npm run dev`. GitHub holds the code. Netlify builds the website from GitHub. Coolify runs the server on your own Oracle Cloud machine, built from GitHub. Supabase stores the data. Everything is clicking and pasting.

Plan for 1 to 2 hours the first time. Do the parts **in order**. Keep the "Notes" table (bottom) open in another tab and paste values into it as you go.

Buttons and menus on these sites get renamed now and then. If a label is slightly different, look for the closest match. If you get stuck, take a screenshot and send it to me.

---

## Part 1. Put the code on GitHub

1. Go to github.com and sign in (or create a free account).
2. Click the **+** at the top right, then **New repository**.
3. Name it `earshelf`. Choose **Private**. Leave everything else alone. Click **Create repository**.
4. On your computer, unzip `earshelf-monorepo.zip`. You get a folder called `wells`.
5. **Show hidden files** so the dotted files are included:
   - Mac: in Finder press `Cmd + Shift + .`
   - Windows: in File Explorer choose View, then Show, then Hidden items.
6. On the new empty repository page, click **uploading an existing file**.
7. GitHub only accepts about 100 files per upload, so upload in **three rounds**. In each round, open the `wells` folder and drag the items *inside* it into the GitHub page, wait until the list finishes, type a short note like "part 1" in the box at the bottom, and click **Commit changes**. Then click **Add file, Upload files** for the next round.
   - Round 1: the `apps` folder.
   - Round 2: the `packages` folder and the `services` folder.
   - Round 3: the `supabase` folder, the `deploy` folder, the `.github` folder, and all the loose files (`package.json`, `netlify.toml`, `.dockerignore`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `README.md`, `GUIDE.md`, `LICENSES.md`).
8. Check: on the repository home page you should see `apps`, `packages`, `services`, `supabase`, `.github`, and `netlify.toml`. Open `apps/earshelf/src` and confirm you can see `App.tsx`.

Easier alternative: install **GitHub Desktop**, choose File, Add local repository, pick the `wells` folder, click Publish repository. It handles all the files at once.

---

## Part 2. Supabase (your database, login and file storage)

1. Go to supabase.com, sign in, click **New project**.
2. Give it a name (`earshelf`), create a **database password** and save it in your password manager, pick the region closest to you, click **Create new project**. Wait a couple of minutes.
3. **Create the tables.** In the left menu click **SQL Editor**, then **New query**.
   1. On GitHub open `supabase/migrations/0001_shared_foundation.sql`, click the **Copy raw file** button, paste into the Supabase editor, click **Run**. You should see "Success. No rows returned."
   2. Repeat with `0002_earshelf.sql`.
   3. Repeat with `0003_sync_and_content.sql`.
   4. Repeat with `0004_semantic_srs_export.sql`.
   5. Repeat with `0005_product_scope.sql`.
   6. Repeat with `supabase/seed.sql`.
   - **Already ran the first four files earlier?** Run only `0005_product_scope.sql`, and do it **before** you upload the new code to GitHub and redeploy. The new website and server expect it.
- If any one shows a red error, stop and send me the exact message. If it mentions an extension, open **Database, Extensions**, switch on `vector`, `pg_trgm` and `pgcrypto`, and run that file again.
4. **Turn off email confirmation for now** (so you can test without waiting for emails): **Authentication, Sign In / Providers, Email**, switch **Confirm email** off, **Save**.
5. **Get your keys:** click the gear (**Project Settings**), then **API Keys**.
   - If you see a **Create new API keys** button, click it.
   - Copy the **Project URL** (top of the page or under Data API) into Notes.
   - Copy the **Publishable key** (starts with `sb_publishable_`) into Notes. This one is safe to put in the website.
   - Copy the **Secret key** (starts with `sb_secret_`) into Notes. **This one is a master key. It goes only into Coolify. Never paste it into GitHub, Netlify, or a chat.**
6. Check storage: **Storage** in the left menu. You should see two buckets, `originals` and `audio`, both marked private.

---

## Part 3. Netlify (the website)

1. Go to netlify.com, sign in with GitHub.
2. **Add new site, Import an existing project, GitHub.** Allow access, choose the `earshelf` repository.
3. The build settings fill themselves in from `netlify.toml` (Build command `npm run build`, Publish directory `apps/earshelf/dist`). Leave them.
4. Click **Add environment variables** (or set them after, under **Site configuration, Environment variables**) and add these two now:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = your publishable key
5. Click **Deploy**. It takes a few minutes.
6. **If the deploy fails** (red): click the failed deploy, scroll to the bottom of the log, copy the last 60 lines, and send them to me. I wrote this without being able to run the build, so a small fix here is possible and normal.
7. When it turns green you get an address like `https://something.netlify.app`. Write it in Notes. You can change the name under **Site configuration, Change site name**.
8. Back in Supabase: **Authentication, URL Configuration.** Set **Site URL** to your Netlify address. Under **Redirect URLs** add the same address, and again with `/**` on the end. Save.

---

## Part 4. Your own server: Oracle Cloud + Coolify

This replaces Render. Oracle Cloud lends you a computer for free. Coolify is a free control panel that runs on that computer and turns "here is my GitHub code" into "here is a running server", with a Deploy button. Your server does the heavy jobs: natural voices, AI, link import, audiobook files, and payment messages.

### Read this first: five honest warnings about Oracle's free tier
1. **Stay small.** Oracle's pages disagree about the free size. Older pages say 4 CPUs and 24 GB. Newer reports say the free limit was cut to **2 CPUs and 12 GB** in 2026, and that a machine bigger than the limit gets switched off, then deleted after 30 days. So choose **2 CPUs and 12 GB**. That is plenty for us.
2. **"Out of capacity" is normal.** Free ARM machines are popular. If creating the machine says *out of host capacity*, wait an hour and try again, try another "availability domain" in the form, or do the Pay As You Go upgrade in warning 4.
3. **Idle machines can be taken back.** Oracle may reclaim a free ARM machine if, for 7 days in a row, its processor use, network use *and* memory use are all under 20%. Running Coolify plus the Kokoro voice engine keeps memory above that line, which helps. Upgrading to Pay As You Go (next point) is the proper protection.
4. **Upgrade to "Pay As You Go". It still costs nothing while you stay inside the free limits.** It needs a card, which Oracle holds for verification. It also makes "out of capacity" much rarer and protects against reclaiming. **Menu, Billing and Cost Management, Upgrade and Manage Payment, Upgrade your account.** It can take a day. Then **create a budget alert of 1 dollar** (Billing and Cost Management, Budgets, Create budget) so you get an email if anything ever starts costing money. Only ever create things labelled **Always Free eligible**.
5. **Sign in to the Oracle console at least once a month.** Accounts left untouched for a long time can be suspended.

### Step 1. Create the machine (check your settings if you already started)
In the Oracle console: **Menu (three lines), Compute, Instances, Create instance.**

| Setting | Choose |
|---|---|
| Name | `earshelf-server` |
| Image | **Canonical Ubuntu 24.04**. Click **Change image**. Do **not** pick one that says "Minimal". Make sure it says aarch64 or Arm. (22.04 also works.) |
| Shape | Click **Change shape**, choose **Ampere**, then **VM.Standard.A1.Flex**. Set **OCPUs = 2** and **Memory = 12 GB**. |
| Networking | Let it create a new virtual cloud network and a public subnet. Tick **Assign a public IPv4 address**. |
| SSH keys | Choose **Generate a key pair for me**. Click **Save private key** AND **Save public key**. **You cannot download the private key again later.** |
| Boot volume | Tick **Specify a custom boot volume size** and enter **100** (GB). The free allowance is 200 GB in total. |

Click **Create**. Wait until the box says **Running** in green. Copy the **Public IP address** into your Notes (for example `129.150.1.2`).

Make a folder for the keys and move the two downloaded key files into it. In File Explorer create `C:\Users\YOURNAME\oracle-keys` and put both files there. Write down the name of the private key file (it ends in `.key`).

### Step 2. Open the doors in Oracle's network
1. On the instance page, under **Primary VNIC**, click the blue **Subnet** link.
2. Click the **Default Security List**.
3. Click **Add Ingress Rules**, and add these three rules one by one (leave everything else as it is):

| Source CIDR | IP Protocol | Destination Port Range |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |
| `0.0.0.0/0` | TCP | `8000` |

(Port 8000 is only for the Coolify control panel. In Step 9 you will close it.) Port 22, which lets you sign in, is already open.

### Step 3. Sign in to your server from Windows PowerShell
1. Press the **Windows key**, type **PowerShell**, press **Enter**. A blue or black window opens.
2. Check that the connection tool exists. Type `ssh -V` and press Enter. If it prints a version, good. If it says "not recognized": **Settings, Apps, Optional features, Add a feature, OpenSSH Client, Install**, then open PowerShell again.
3. **Protect your key file.** Windows refuses keys that other people could read. Copy these two lines into Notepad, change the path to your real key file, copy them into PowerShell, and press Enter after each:
```
icacls "C:\Users\YOURNAME\oracle-keys\YOUR-KEY-FILE.key" /inheritance:r
icacls "C:\Users\YOURNAME\oracle-keys\YOUR-KEY-FILE.key" /grant:r "$($env:USERNAME):(R)"
```
4. **Connect.** Change the path and the IP, then press Enter:
```
ssh -i "C:\Users\YOURNAME\oracle-keys\YOUR-KEY-FILE.key" ubuntu@YOUR_IP
```
5. The first time it asks *Are you sure you want to continue connecting?* Type `yes` and press Enter.
6. Success looks like a line ending in `ubuntu@earshelf-server:~$`. **Everything you type now happens on your server.**

Tips: in PowerShell, **right-click pastes** what you copied. To leave the server later, type `exit`.

### Step 4. Open the doors inside the server
Oracle's Ubuntu has its own firewall that blocks web traffic even after Step 2. Paste these lines one at a time (right-click to paste, Enter to run). If it asks for a password, it will not, because `sudo` just works on this machine.
```
sudo iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 1 -p tcp --dport 8000 -j ACCEPT
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
sudo netfilter-persistent save
```
The last line makes the rules survive a restart. Check with `sudo iptables -L INPUT -n --line-numbers`. You should see ACCEPT lines for ports 80, 443 and 8000 near the top.

### Step 5. Install Coolify (one line)
Still in PowerShell, connected to the server:
```
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```
It prints a lot of text and takes about 3 to 10 minutes. It installs Docker for you. When it finishes it shows a line like **Your instance is ready to use** with an address `http://YOUR_IP:8000`. If it complains that something is "locked", wait one minute and run the same line again.

### Step 6. Create your Coolify account (do this straight away)
1. On your own computer open `http://YOUR_IP:8000` in the browser.
2. **The first person to open this page becomes the owner.** Create your account right now with your email and a strong password.
3. Coolify's welcome screens ask you to connect a server. Choose **Localhost** (this very machine) and let it finish. Then it offers to create a project. Skip or accept, either is fine.

### Step 7. Let Coolify read your GitHub code
1. In Coolify's left menu click **Keys & Tokens**, then **Private Keys**, then **Add**. Name it `github-earshelf`. Click **Generate new Private Key** (any type). Click **Continue**. **Copy the public key** it shows.
2. On GitHub open your `earshelf` repository. **Settings, Deploy keys, Add deploy key.** Title: `Coolify`. Paste the public key. **Leave "Allow write access" unticked.** Click **Add key**.
3. Back in Coolify: **Projects, Add**, name it `earshelf`, then open it and its **production** environment.
4. Click **New Resource**, then **Private Repository (with Deploy Key)**.
5. Choose the **Localhost** server and the default destination. Choose the `github-earshelf` key.
6. For the repository address use the **SSH** form: `git@github.com:YOURNAME/earshelf.git`. Branch: `main`.
7. Set **Build Pack** to **Docker Compose**. **Base Directory**: `/`. **Docker Compose Location**: `/deploy/docker-compose.yml`. Click **Continue**.

### Step 8. Fill in the settings and deploy
1. Open the **Environment Variables** tab. Choose **Developer view** (a big text box). Paste this block and replace the values after each `=` (leave a line empty if you do not have it yet):
```
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
ALLOWED_ORIGINS=
AI_PROVIDER=anthropic
AI_API_KEY=
LEMON_SQUEEZY_SIGNING_SECRET=
LS_VARIANT_EARSHELF_PLUS=
LS_VARIANT_EARSHELF_PRO=
ELEVENLABS_API_KEY=
EMBED_API_KEY=
SENTRY_DSN=
```
   `ALLOWED_ORIGINS` is your Netlify address exactly, with no slash at the end. The Supabase values are from Part 2. Save. You can add more settings from the later parts the same way.
2. **Give the server an address with a padlock.** Open the **Configuration** tab, click the **api** service, and in **Domains** type `https://api.YOUR_IP.sslip.io:10000` (for example `https://api.129.150.1.2.sslip.io:10000`). The `:10000` tells Coolify which inside door to use; the public address stays plain `https://`. (sslip.io is a free service that turns any IP into a web address.) Leave **kokoro** without a domain: it is private on purpose. Save.
3. Click **Deploy**. Open the **Deployments** tab and watch the log. The first run takes several minutes because it downloads the voice engine (a few GB). Wait for **Running (healthy)**.
4. **Test it.** Open `https://api.YOUR_IP.sslip.io/health` in your browser. You should see `{"ok":true}`. If the browser warns about the certificate, wait two minutes and try again: Coolify is still getting it.
5. **Tell the website.** In Netlify, **Environment variables**, add `VITE_API_URL` = `https://api.YOUR_IP.sslip.io` (no `:10000`, no slash). Then **Deploys, Trigger deploy, Deploy site**.

**If the padlock never appears (sslip.io is shared and sometimes rate limited):** use a free name instead. Go to duckdns.org, sign in with GitHub, type a name like `myearshelf`, click **add domain**, paste your server IP in the box and click **update ip**. Then in Coolify use `https://myearshelf.duckdns.org:10000` as the Domain, redeploy, and use `https://myearshelf.duckdns.org` as `VITE_API_URL`.

### Step 9. Lock it down
1. Give the control panel its own padlock address too, so you no longer need port 8000: in Coolify **Settings**, set **Instance's Domain** to `https://coolify.YOUR_IP.sslip.io`, Save.
2. After that works, go back to the Oracle **Security List** and **delete the port 8000 rule**.
3. Once a month: connect with PowerShell and run `sudo apt-get update && sudo apt-get -y upgrade`, then `sudo reboot`. Wait two minutes before reconnecting.

### Step 10. Changing the code later
After you upload new files to GitHub, open the application in Coolify and click **Redeploy**. (Optional automatic version: in the application's **Webhooks** tab copy the GitHub webhook address and secret, then on GitHub **Settings, Webhooks, Add webhook**, paste them, content type `application/json`, push events. After that every upload redeploys by itself.)

### Good to know
- **Nothing important lives on this machine.** Your documents, accounts and audio files are in Supabase. If the machine is ever lost, you create a new one and press Deploy again.
- **Voice speed.** Kokoro on two ARM processors makes audio a few times faster than real time, so a long book can take hours to export the first time. Parts are saved as they are made, so nothing is lost if you close the page.
- **Too much memory used?** If the Coolify log for `kokoro` says it was killed or "out of memory", open `deploy/docker-compose.yml` on GitHub, change `mem_limit: 4g` to `6g`, and redeploy. Or delete the whole `kokoro` block if you only use another voice.

---

## Part 5. First test (about 10 minutes)

1. Open your Netlify address. Create an account with an email and a password (8+ characters).
2. Tap **Add**, choose **Paste text**, paste a few paragraphs, **Continue**, **Add to library**.
3. Press **Listen**. You should hear your device's voice reading, with the sentence highlighted.
4. Go to **Profile**. It should say **Up to date**.
5. In Supabase open **Table Editor, documents**. Your document is there. That is your proof it is stored in Supabase.
6. Open the site on your phone, sign in, and your document appears.
7. **Give yourself the Pro plan for testing, without paying:** in Supabase, **Authentication, Users**, copy your **User UID**. Then **Table Editor, entitlements, Insert row**: `user_id` = your UID, `product` = `earshelf`, `plan` = `pro`, `active` = true. In the app open Profile and tap **Sync now**. It should say you are on the pro plan.

**Install it like an app:** on iPhone open the site in Safari, tap Share, **Add to Home Screen**. On Android open it in Chrome, menu, **Add to Home screen** or **Install app**.

---

## Part 6. Natural voices

Open **Profile, Natural voices** and use **Hear a sample** to compare. You can switch on several engines at once and pick per document. Add the settings in Coolify (your application, **Environment Variables**), save, and click **Redeploy**.

**Option A: Kokoro (free voices, already running on your own server)**
Nothing to install: the `kokoro` block in `deploy/docker-compose.yml` started it with your server in Part 4. In the app go to Profile, Natural voices, choose **Kokoro (free open voices)**, and tap **Hear a sample**. The first sample can take longer while the model wakes up. If a sample fails, open Coolify, your application, **Logs**, pick `kokoro`, and send me what it says.

**Option B: ElevenLabs (the most expressive voices, pay per character)**
- Create an account at elevenlabs.io, open your profile, **API Keys**, create one.
- `ELEVENLABS_API_KEY` = your key.
- Optional: `ELEVENLABS_VOICE_IDS` = a comma separated list of the voice ids you want to offer (each voice's id is on its page), so your list stays short. `ELEVENLABS_MODEL` defaults to `eleven_multilingual_v2`.
- Optional: `ELEVENLABS_CONCURRENCY` (default 2). Lower it if you see "busy" errors.
- earshelf passes the neighbouring sentences to ElevenLabs so the tone flows from one sentence to the next, which makes long reading sound less choppy.
- This is the priciest option per minute. Check that your ElevenLabs plan allows commercial use before you sell access, and consider lowering the monthly minutes in `packages/billing/src/plans.ts`.

**Option C: OpenAI voices (easy, pay per use)**
- Create an API key at platform.openai.com.
- `TTS_OPENAI_BASE_URL` = `https://api.openai.com/v1`, `TTS_OPENAI_API_KEY` = your key, `TTS_OPENAI_MODEL` = `tts-1`, `TTS_OPENAI_VOICES` = `alloy,nova,onyx,shimmer,echo,fable`.

**Option D: Edge voices, for you only**
- `EDGE_TTS_ENABLED` = `true` and `EDGE_TTS_ALLOWED_USER_IDS` = your User UID from Supabase.
- Microsoft's online voices through an unofficial route. Only the accounts you list can use them. Do not offer them to customers.

**How human will it sound?** Trust your ears with **Hear a sample**. Reviews I found put Kokoro close to premium services for plain English narration, but flatter for fiction and emotion. ElevenLabs is still the benchmark for expressive reading.

Usage limits protect your bill: Plus gets 600 natural-voice minutes a month, Pro 3,000. Change them in `packages/billing/src/plans.ts`.

---

## Part 7. AI (summaries, questions, quizzes)

In Coolify (your application, **Environment Variables**), add:
- Using Claude: `AI_PROVIDER` = `anthropic`, `AI_API_KEY` = your key from console.anthropic.com, `AI_MODEL` = `claude-haiku-4-5-20251001` (already the default).
- Using OpenAI, or a model on your own machine through Ollama: `AI_PROVIDER` = `openai-compatible`, `AI_BASE_URL` = `https://api.openai.com/v1` (or your Ollama address ending in `/v1`), `AI_API_KEY`, and `AI_MODEL`.

Test: open a document, tap the sparkle button at the top, choose **Summary**, tap **Create**.

**Search by meaning (finds passages by idea, not just exact words)**
- It needs an embedding service. An OpenAI key works: `EMBED_API_KEY` = your OpenAI key (the default model `text-embedding-3-small` is set up to return the 384 numbers the database expects).
- Using Ollama or another OpenAI-style server instead: `EMBED_BASE_URL` = its address ending in `/v1`, and `EMBED_MODEL` = a model that returns 384 numbers (for example `all-minilm`). If the numbers do not match, earshelf says so plainly.
- Once on, signed-in Plus and Pro accounts get their documents prepared automatically after each sync (each document counts as one AI request that month). Then tick **Search by meaning** on the Search page (Pro searches the whole library) or in a document's search panel (Plus and Pro).

---

## Part 8. Payments with Lemon Squeezy (do this last)

Stay in **Test mode** the whole time (there is a switch near the top or bottom of the dashboard).

1. Sign up at lemonsqueezy.com and create a store.
2. **Products, New product.** Create **earshelf Plus** as a **subscription**, monthly price. Create **earshelf Pro** the same way.
3. On each product click **Share** and copy the **checkout link**. In Netlify add `VITE_LS_CHECKOUT_PLUS` and `VITE_LS_CHECKOUT_PRO`, then trigger a new deploy.
4. **Settings, Webhooks, add one:**
   - Callback URL: `https://api.YOUR_IP.sslip.io/webhooks/lemonsqueezy` (your server address)
   - Signing secret: make up a long random text and save it in Notes.
   - Tick these events: `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_expired`, `subscription_payment_success`, `subscription_payment_failed`, `order_refunded`.
   - In Coolify add `LEMON_SQUEEZY_SIGNING_SECRET` = the same signing secret.
5. **Find the two variant numbers.** In the app, Profile, tap **Upgrade to Plus** and buy with the test card `4242 4242 4242 4242`, any future date, any 3 digits. Then in Supabase open **Table Editor, billing_events**, click the newest row's `payload`, and find `variant_id`. Do the same for Pro. In Coolify add `LS_VARIANT_EARSHELF_PLUS` and `LS_VARIANT_EARSHELF_PRO`.
6. Those first test events were recorded before the numbers were known. In Supabase delete the rows in `billing_events`, then in Lemon Squeezy open the webhook's recent deliveries and click **Resend**. Now the plan should switch to Plus or Pro in the app, a few seconds after Profile, **Sync now**.
7. To go live later: switch off Test mode, recreate the products, webhook and links, and update the values.

The app never trusts the "thank you" page. It only unlocks a plan when Lemon Squeezy's signed message reaches your server.

---

## Part 9. Error alerts (optional, recommended)

So you hear about crashes before customers tell you.
1. Create a free account at sentry.io (or run GlitchTip, an open-source look-alike; both use the same address format).
2. Create one project for the website and one for the server (or use one for both). Copy each project's **DSN** (a web address that starts with `https://`).
3. Netlify: add `VITE_SENTRY_DSN` = the website project's DSN, then trigger a new deploy. Coolify: add `SENTRY_DSN` = the server project's DSN.
What is sent: the error message, where it happened, a technical trace, and your account's id. Email addresses, tokens and keys are removed first, and document text is never included. The same error is reported at most once a minute.

---

## Part 10. Using the newer features

- **Review cards:** open a document, tap the sparkle button, **Quiz**, then **Make flashcards** (or **Make a quiz**) and **Save all for review**. A **cards to review** card appears on Home and Activity. Forgotten cards return sooner, easy ones later.
- **A voice style for a well:** Wells, open a well, **Voice style for this well**. Documents opened from it use that pace and those pauses.
- **Explain a table or figure (Pro):** tap **Explain this** under a table or a figure caption. For figures it works from the caption and the surrounding text only, and says so, because it does not look at the picture yet.
- **Audiobook file (Pro):** open a document, tap the player, **Natural voice**, then **Audiobook file**. Pick MP3 or M4B, tap **Create file**, and come back when it says Ready. The file has one chapter per section. Parts that were already created are reused, so a retry is quick.

---

## Part 11. Send things to earshelf from your phone and browser

**From your phone's Share menu (installed app, Android and desktop Chrome):** open earshelf once, then install it (Chrome menu, **Install app** or **Add to Home screen**). After that, in any app or web page tap **Share** and pick **earshelf**. A link opens the **Link** tab with the address filled in. Shared text opens the **Paste text** tab. Tap **Continue** to review and add it. iPhone does not allow websites to appear in the Share menu, so on iPhone copy the link and paste it into the Add screen instead.

**Browser extension (Chrome and Edge), no building needed:**
1. On your computer, unzip `earshelf-monorepo.zip`. Inside `wells` open the `apps` folder and find `extension`.
2. In Chrome open `chrome://extensions` (in Edge `edge://extensions`). Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `extension` folder.
4. Click the puzzle-piece icon, pin **Send to earshelf**, and click its **Settings** link. Type your Netlify address (starting with `https://`) and click **Save**.
5. Now right-click any page, link, or selected text and choose **Send ... to earshelf**, or click the extension button to send the page you are on. earshelf opens with it ready to add.
If you are not signed in yet, sign in first and use the extension again.

---

## Part 12. New listening and export options

- **What gets read aloud (Profile):** choose how citations like [3] are handled (skip, author and year, or in full), whether **equations** are said in words, and what to do with tables. Equations work when they are written in LaTeX between dollar signs, like `$x^2$`, or on their own line between double dollar signs. Money like $5 is never mistaken for a formula.
- **A second voice for dialogue (Pro, natural voices only):** Profile, Natural voices, **Voice for quoted speech**. Anything inside quotation marks is read in that voice, and the rest in your main voice. It changes the audio, so a document is generated again the first time you use it. Best for fiction.
- **Export your highlights and notes:** Activity, **Saved passages**, then **Markdown** (for Obsidian, Notion and any notes app), **CSV** (for spreadsheets), or **Readwise** (for Readwise's CSV import).
- **Accessibility:** see `ACCESSIBILITY.md` for what is built in and a 30-minute hand check to do before launch.
- **License report:** on GitHub open **Actions**, the newest run, then **Artifacts, licenses**. It lists the license of everything the app uses. Look at anything marked GPL or AGPL before you sell the app.

---

## Part 13. Tapestry (the second app, same database and server)

Tapestry uses the same GitHub repo, the same Supabase project and the same Coolify server as earshelf. Nothing to reinstall.

**A. Database (Supabase, 3 minutes).** Open Supabase, then SQL Editor, then New query. Run these files from the repo folder `supabase/migrations`, in this order, one at a time (paste the whole file, press Run). Skip any you already ran: `0005_product_scope.sql`, `0050_tapestry_content.sql`, `0051_tapestry_activity.sql`. Each should end with "Success".

**B. The website (Netlify).** Add new site, Import from GitHub, pick the same repo. Set **Base directory** to `apps/tapestry` (the build settings then come from `apps/tapestry/netlify.toml`). Add environment variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (same values as earshelf) and `VITE_API_URL` (your Coolify address). Deploy.

**C. Let the new site talk to your server and login.** In Coolify, edit the API settings: add the Tapestry site address to `ALLOWED_ORIGINS` (comma between addresses), then Redeploy. In Supabase, Authentication, URL Configuration, add the Tapestry address to Redirect URLs.

**D. Make yourself the owner.** In Supabase, Authentication, Users, copy your user id. In Coolify add `TAPESTRY_ADMIN_USER_IDS` = that id, then Redeploy.

**E. Load the Scripture and the 16 starter wells.** Open the Tapestry site, Profile, Sign in. A new box called **Owner setup** appears. Press **Load starter wells and Scripture**. It downloads the World English Bible from eBible.org, stores it in your database, loads the starter wells, and checks that every starter passage exists. It says how many verses loaded and lists any passage that needs attention. It is safe to press again.

**F. AI without paying a provider (optional).** After the redeploy that brings the `ollama` block, open it in Coolify, open its Terminal and run `ollama pull qwen2.5:3b`. In the API settings set `AI_PROVIDER=openai-compatible`, `AI_BASE_URL=http://ollama:11434/v1` (use the service name Coolify shows), `AI_MODEL=qwen2.5:3b`, `AI_API_KEY=ollama`, then Redeploy. Tapestry only ever asks the model to choose and order passages from a list it is given, and anything invalid is dropped, so a small model is enough. Without AI the app still finds passages from feelings using the built-in word list. Kokoro is the voice engine (Part 6), not the AI.

**G. Payments.** Create Tapestry Plus and Pro in Lemon Squeezy the same way as Part 8 and set `LS_VARIANT_TAPESTRY_PLUS` and `LS_VARIANT_TAPESTRY_PRO`. Checkout links must pass `custom[product]=tapestry`.

## Troubleshooting

| What you see | What to do |
|---|---|
| Netlify build is red | Copy the last 60 lines of the deploy log and send them to me. |
| Page stays on "Loading…" or is blank | Netlify environment variables missing or misspelled. Fix, then trigger a new deploy. |
| "Invalid API key" when signing in | You pasted the wrong key. Use the **publishable** key (or the older `anon` key) on Netlify. |
| "Could not reach the earshelf server" | `VITE_API_URL` is wrong, or `ALLOWED_ORIGINS` in Coolify does not match your Netlify address exactly. |
| "Sign in to use this" in the server logs, or 401 | `SUPABASE_URL` or the keys in Coolify are wrong. |
| Natural voice does not play | Coolify, your application, **Logs** tab. The error says what failed. If it says the voice server returned an error, check the `TTS_` values. |
| Sync says there was a problem | Read the message under Profile. Most often a SQL file was skipped. Run all six again in order. |
| "Search by meaning" finds nothing | New documents are prepared in the background after a sync. Wait a minute and try again. Check `EMBED_API_KEY` on Render. |
| Audiobook export stops with an error | Read the message. Usually the monthly voice minutes ran out or the voice provider was busy. Start it again; finished parts are reused. |
| The Share menu does not list earshelf | The app must be installed first (Chrome menu, Install app). iPhone does not support this. |
| The extension opens earshelf but nothing is filled in | Sign in first, then send again. Check the address in the extension's Settings is exactly your Netlify address. |
| Equations are read as plain text | They need dollar signs around them, like `$x^2$`. Check Profile, What gets read aloud, Equations. |
| The dialogue voice is not used | It needs the Pro plan, a natural voice switched on, and a voice chosen under Voice for quoted speech. |
| A sign-up email never arrives | Supabase's built-in email is heavily rate limited. Keep "Confirm email" off while testing. |

## Keep safe
- The **Secret key**, the **signing secret** and any API keys live only in Coolify. If one leaks, replace it in Supabase, Lemon Squeezy or the provider, then update Render.
- Supabase free projects can pause after a period of inactivity. If the site suddenly cannot sign in, open the Supabase dashboard and restore the project.

## Notes (paste values here, keep private)

| Item | Value |
|---|---|
| Supabase Project URL | |
| Supabase publishable key | |
| Supabase secret key (Coolify only) | |
| Netlify address | |
| Oracle server public IP | |
| Server address (https://api...) | |
| Lemon Squeezy signing secret | |
| Plus variant number | |
| Pro variant number | |
| My User UID | |
