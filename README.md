# Palerock

Minimalist black & white messaging app — built with Next.js, MongoDB, and deployed on Vercel.

---

## Deployment Guide (Ubuntu Terminal)

### Prerequisites

Make sure you have `git` installed:
```bash
git --version
# If not installed:
sudo apt update && sudo apt install git -y
```

You do NOT need Node.js or npm locally — Vercel handles all builds in the cloud.

---

### Step 1: Place Your Logo

After unzipping the project, place your logo file:
```bash
mkdir -p ~/palerock/public/assets
cp /path/to/your/PALEROCK.png ~/palerock/public/assets/PALEROCK.png
```

> The logo is referenced at `/assets/PALEROCK.png` in the app. If no logo is provided, it gracefully falls back to a "P" text mark.

---

### Step 2: Set Up a GitHub Repository

1. Go to [https://github.com/new](https://github.com/new)
2. Create a new repository named `palerock`
3. Set it to **Private** (recommended) or Public
4. Do **NOT** initialize with README, .gitignore, or license (the project has its own)
5. Copy the repository URL (e.g. `https://github.com/YOURUSERNAME/palerock.git`)

---

### Step 3: Push to GitHub

```bash
cd ~/palerock

# Initialize git
git init
git add .
git commit -m "Initial commit — Palerock"

# Connect to your GitHub repo
git remote add origin https://github.com/YOURUSERNAME/palerock.git

# Push
git branch -M main
git push -u origin main
```

GitHub will prompt for your credentials. If you use 2FA, use a **Personal Access Token** instead of your password:
- Go to GitHub → Settings → Developer Settings → Personal Access Tokens → Tokens (classic)
- Generate a token with `repo` scope
- Use this token as the password when prompted

---

### Step 4: Deploy on Vercel

1. Go to [https://vercel.com](https://vercel.com) and sign in (use "Continue with GitHub")
2. Click **"Add New Project"**
3. Import your `palerock` GitHub repository
4. Vercel will auto-detect Next.js. Leave all build settings as-is.
5. Before clicking Deploy, click **"Environment Variables"** and add:

| Name | Value |
|------|-------|
| `MONGODB_URI` | `mongodb+srv://server:asdahdjk23@palerock.mongodb.net/palerock` |
| `JWT_SECRET` | A random secret string (e.g. generate with: `openssl rand -hex 32`) |

6. Click **Deploy**

---

### Step 5: Set Custom Domain (palerock.vercel.app)

Vercel auto-assigns a domain like `palerock-xyz.vercel.app`. To use `palerock.vercel.app`:

1. In your Vercel project, go to **Settings → Domains**
2. Add `palerock.vercel.app` — Vercel will check if it's available as a free `.vercel.app` subdomain
3. If `palerock` is taken on vercel.app, you can use any name you choose

---

### Step 6: MongoDB Atlas Setup (if not already done)

Your connection string uses MongoDB Atlas. Make sure:

1. Go to [https://cloud.mongodb.com](https://cloud.mongodb.com)
2. In your cluster → **Network Access** → Add IP Address → `0.0.0.0/0` (allow all — required for Vercel's dynamic IPs)
3. In **Database Access**, make sure the `server` user has `readWrite` privileges on the `palerock` database

---

### Updating the App Later

After making changes:
```bash
cd ~/palerock
git add .
git commit -m "Your change description"
git push
```

Vercel automatically redeploys on every push to `main`.

---

## Project Structure

```
palerock/
├── pages/
│   ├── _app.tsx          # App wrapper
│   ├── _document.tsx     # HTML document
│   ├── index.tsx         # Login/Register page
│   ├── app.tsx           # Main app layout
│   ├── 404.tsx           # Not found page
│   └── api/
│       ├── auth/         # login, register, logout, me
│       ├── user/         # profile CRUD
│       ├── friends/      # requests, respond, pending-count
│       └── channels/     # list, messages, poll
├── components/
│   ├── Sidebar.tsx       # Navigation sidebar + DM list
│   ├── ChatPane.tsx      # Chat interface with polling
│   ├── FriendsPane.tsx   # Friend requests (sent/received)
│   └── ProfilePane.tsx   # Profile + password settings
├── lib/
│   ├── mongodb.ts        # DB connection
│   └── auth.ts           # JWT utilities
├── styles/
│   └── globals.css       # Global styles + CSS variables
└── public/
    └── assets/
        └── PALEROCK.png  # Your logo (add after unzip)
```

---

## Expandability

The codebase is structured for easy extension:
- **Messages** have placeholder fields for `reactions`, `replyTo`, `attachments`
- **Channels** support a `type` field (currently `dm`, ready for `server`)
- **Users** have `avatar`, `status`, `blockedUsers`, `settings` fields ready
- API routes follow REST conventions for easy addition of new endpoints
- CSS variables make theming (light mode, etc.) straightforward
