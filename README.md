# Lift Tracker

A gym log that runs as a home-screen app on iPhone. No App Store, no developer account, no subscription.

- **300 exercises** with photos or diagrams, step-by-step instructions and a YouTube demo link; search is forgiving ("push ups", "single arm tricep", "lat pull down")
- **Left / right logging** for one-arm and one-leg work, with an imbalance readout and separate Left/Right progress lines
- **Plan ahead:** a 7-day strip on the Workout tab; **Create for me** (rule-based generator) or **Build my own**, by type (Push, Pull, Legs, Core & Abs, Stretch, Full body) and style (Conventional, Calisthenics, Mixed); save for any day
- **Calisthenics tab:** 15 progression tracks (pull-up, dips, rows, push-up, squat, hinge, core, leg raise, muscle-up, L-sit, handstand, HSPU, front lever, back lever, planche), automatic "ready to level up" detection, and a Beginner → Elite rank
- Quick-start Push / Pull / Legs / Abs & Stretch days that copy what you did last time
- Each exercise shows **last time** and your **all-time best**; tick a set to start the rest timer
- **Progressive overload suggestions** for every exercise you repeat: double progression with ACSM-style 2–10% load jumps, holds when you fall short, a ~10% back-off after two stalled sessions, an easier restart after a 3-week break, and "move to the harder variation" for calisthenics (rules in `js/suggest.js`)
- **Reps left (RIR)** buttons in the rest timer after each set; the remaining sets are re-aimed live (±10% max, targeting ~2 reps in reserve) and future suggestions account for effort
- Progress charts (estimated 1RM, heaviest, volume), rep-max PRs, 🏆 badges for new records
- **Personal records page** (Progress → 🏆): latest PRs with how much you improved, and all-time bests for every exercise, searchable and filterable by muscle group
- **Before-workout habits** (☕ coffee, 💊 creatine, 🍽️ fasted): one-tap chips that copy your last workout, plus a performance comparison on the Progress tab (each workout scored against your own recent sessions of the same lifts; it says when a difference is just normal variation)
- **Recovery** category (formerly Stretch): quick whole-routine entries (lower body, upper body, shoulders, hips, back, full body, yoga flow), foam roller and massage ball work, plus individual stretches; logged by time and left out of PRs and progression suggestions
- **Body weight** log (kg) with a trend chart and 7 / 30 / 90-day change
- Works offline; data is saved on the phone first, then synced to **your own private GitHub repo** as JSON

## How it is hosted

| What | Where | Cost |
|---|---|---|
| The app (this repo) | GitHub Pages, public repo | free |
| Your workout data | a separate **private** repo, e.g. `lift-data` | free |

There is no server: the app talks to the GitHub API directly from your phone.

## One-time setup

### 1. Publish the app
1. Push this folder to a **public** repo called `lift-tracker`.
2. In the repo, open **Settings → Pages**, then set **Source: Deploy from a branch**, **Branch: `main` / `(root)`**, and save.
3. After about a minute the app is live at `https://<your-username>.github.io/lift-tracker/`.

### 2. Create the private data repo
Go to <https://github.com/new>, name it `lift-data`, and choose **Private**. Leave it empty; the app initialises it.

### 3. Create an access token (on a computer is easiest)
1. Go to <https://github.com/settings/personal-access-tokens/new> (Fine-grained token).
2. Fill in:
   - **Expiration:** the longest offered (put a reminder in your calendar to renew it).
   - **Repository access:** *Only select repositories*, then choose `lift-data`.
   - **Permissions → Repository permissions → Contents:** *Read and write*.
3. Generate it and copy the token (`github_pat_…`). Getting it to your phone with AirDrop or Notes is fine.

The token can only touch `lift-data`, and it is stored only on your phone.

### 4. Install on the iPhone
1. Open the Pages URL in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Open **Lifts** from the home screen, go to **Settings → GitHub sync**, and enter your username, `lift-data`, and the token.
4. Tap **Save & sync**. The badge at the top should say "Synced".

## Sharing with someone else
They open the same URL, add it to their home screen, and point Settings at **their own** private repo and token. Alternatively, they can use the same repo with a different **Folder** (e.g. `partner`), but that means sharing your token.

## How sync works
- Every change is saved in the phone's IndexedDB immediately, so logging never waits on the network.
- Sync runs when the app opens, when it comes back to the foreground, a few seconds after changes, and from **Sync now**.
- Each sync pulls changed files, then pushes all local changes as **one commit**. If the same workout was edited on two devices, the newer edit wins.
- Repo layout: `data/sessions/<date>-<id>.json` (one file per workout), `data/exercises/<id>.json` (custom exercises), `data/plans/<id>.json` (planned workouts) and `data/calisthenics/cali-progress.json` (track levels) and `data/bodyweight/bw-<date>.json` (body weight). They are readable JSON that you can edit or analyse.
- **Settings → Export JSON** gives you a full backup file at any time.

## iPhone limitations
- The rest-timer beep only plays while the app is open; iOS gives web apps no local notifications or vibration.
- Safari may clear data for websites you rarely visit. Home-screen apps are generally exempt, and GitHub sync is your backup regardless.

## Updating the app
Push changes to `main`; the phone picks them up on the next launch (sometimes the one after, because of the offline cache). If you add or rename files, bump `VERSION` in `sw.js`.

## Code
Plain HTML/CSS/JavaScript modules, no build step.

```
index.html, css/app.css
js/app.js        UI, routing, rest timer
js/store.js      in-memory state + IndexedDB persistence
js/db.js         IndexedDB wrapper
js/sync.js       GitHub sync (Git Data API)
js/catalog.js    the built-in exercise list (add exercises here)
js/exercises.js  day templates, search
js/cali.js       calisthenics tracks, standards, ranks
js/generator.js  "Create for me" workout builder
js/poses.js      stick-figure diagrams for skills without photos
js/ui.js         shared sheets, thumbnails, exercise info
js/suggest.js    progressive overload rules
js/habits.js     before-workout habits + performance score
img/ex/          exercise photos + instructions
js/stats.js      bests, PRs, chart metrics
js/chart.js      SVG line chart
sw.js            offline cache
```

To run locally, run `python3 -m http.server` and open <http://localhost:8000>.

## Credits
Exercise photos and instructions come from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain / Unlicense). Calisthenics progressions follow the r/bodyweightfitness Recommended Routine and the Overcoming Gravity skill ladders.
