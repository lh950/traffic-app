# Traffic App v3 — repo instructions for Claude

**This file is the shared source of truth for any session working on this repo — local CLI, desktop app, or claude.ai/code (web/remote).** Sessions don't share memory with each other; this file is how they stay in sync. If you (any session) establish a new standing process rule, correct a wrong assumption, or learn something that would matter to a *different* session working on this repo later, add it here — not only to your own local/personal memory. Keep entries short and dated where relevant; this file should stay a quick read, not a full history (that's what `DEVLOG.md` is for).

## Session check-in / check-out — avoid two sessions colliding on the same files

Before starting substantive work (more than a one-line fix), check `SESSION_LOCK.md` at the repo root:

- **If it says `status: clear`** — pull latest, then immediately edit it to `status: active`, fill in who/what/when, commit, and push that alone (a fast, tiny commit) before doing any real work. This claims the repo.
- **If it says `status: active`** and the timestamp is recent (say, within the last few hours) — a session may already be mid-work. Don't start overlapping file changes; either wait, work in a clearly separate area, or ask the user which session should proceed.
- **If it says `status: active`** but the timestamp is old/stale (previous session likely ended without clearing it, e.g. crashed or the user closed it) — it's safe to treat as clear, but note in your own check-in that you overrode a stale lock.
- **When your work is fully committed and pushed**, set it back to `status: clear` and push that too.

This isn't a hard distributed lock — two sessions could still race if they check at the exact same moment — but it makes the common case (one session picks up after the other) visible and safe, and git's own merge-conflict-on-push is the backstop if it's ever missed.

## ⚠️ If you are a remote/web session (claude.ai/code): you cannot push. Save your work for the main session instead.

**Confirmed, not hypothetical:** the GitHub integration behind claude.ai/code sessions on this repo currently has read access only. Every push path has been tested and fails the same way — plain `git push`, an authenticated push with the session's own token, and the `mcp__github__push_files` MCP tool all get rejected (`403 Resource not accessible by integration` on `git/refs` — it can't create or update refs). This is a permission gap on the connector itself, not something fixable from within a session, and not something worth re-attempting more than once per session.

**What to do instead — this is the expected, supported workflow, not a fallback:**

1. Do the real work: understand the task, make the fix, verify it live (run the app, don't just read the diff), update `BUGS.md`/`CHANGELOG.md`/`DEVLOG.md`/version numbers per the conventions below, and commit locally in your clone. Commit — don't leave it sitting uncommitted, since this container/clone is ephemeral and uncommitted work disappears when the session ends.
2. Try pushing once, expect it to fail, don't retry it repeatedly or burn time diagnosing it further — the cause is already known (see above).
3. Produce a **handoff** for whichever session does have push access (a local CLI session on the maintainer's machine): a plain unified diff/patch (`git diff <base>..<your-HEAD> > name.patch`, or `git format-patch`) covering everything you changed, plus a short written summary — what the task was, root cause, what you changed, and exactly how you verified it live. A worked example of this exact pattern exists: BUG-030 (see `BUGS.md`/`DEVLOG.md`) was fixed by a remote session this way — patch applied cleanly, verified again, and pushed by the local session with no rework needed. That's the bar: the patch should be good enough to apply and push with no back-and-forth, not a rough draft.
4. Send/deliver the patch through whatever channel actually reaches the user (chat attachment, a rendered artifact, pasting the diff directly) — don't assume a link or file reference alone will be seen.
5. Don't touch `SESSION_LOCK.md` on `master` if your session is scoped to its own branch and a push there would be denied anyway — just note the lock state you observed in your handoff so the applying session knows whether it needs to claim/clear it.

## Versioning scheme

`MAJOR.MINOR.PATCH[-alpha.BUILD]`

- **MAJOR** — incompatible schema change.
- **MINOR** — one per batch of related work pushed together as a single session/push — **not one per individual feature.** If several features are built in sequence within one session, they all share one MINOR number; only the first commit in the batch bumps MINOR. A new MINOR bump starts only after the previous batch has actually been pushed and new, unrelated work begins.
- **PATCH** — a bug fix or small tweak within an already-shipped (non-alpha) MINOR version.
- **`-alpha.N` suffix** — the version is pushed but not yet confirmed stable in the deployed app. Every commit within an open batch increments the build number (`alpha.1` → `alpha.2` → …) rather than bumping MINOR — this is how multiple features in one push get distinguished from each other. Drop the suffix only when the user confirms it's stable in production; never drop it unprompted.

**Session boundary:** a "batch" = a session, and it stays open (same MINOR, only `alpha.N` climbing) until the user confirms the final push. Don't close a batch just because a to-do list feels complete — if more work gets added before a push is confirmed, it folds into the same MINOR version.

**Bump all 5 UI locations on every version-changing commit:**
1. `package.json` — `"version"` field
2. `index.html` — `<title>` tag
3. `index.html` — home screen `.home-version` div
4. `index.html` — sidebar version span (workspace mode)
5. `index.html` — counter header inline version span

Also bump `public/sw.js`'s `const CACHE = 'traffic-app-vX.Y.Za N'` service-worker cache key (no dots in the `aN` suffix, e.g. `v3.42.0a1`) — otherwise stale clients keep serving cached assets.

**Before every push:** run `npm run build`. On a **local clone**, `.git/hooks/pre-push` already enforces this and blocks the push on failure — but that hook is local-only (`.git/hooks/` isn't tracked by git), so it will NOT exist on a fresh/remote clone. Run the build manually if you can't confirm the hook is present. The dev server's HMR does not catch a missing/renamed export across files; only a real build does.

## Repo structure — read before running any git/npm command

- **Local machine:** the git repo is nested inside a `traffic-app-v3/` subfolder (the parent folder is NOT a repo). `cd traffic-app-v3` before git/npm commands, or they'll fail with "not a git repository."
- **Fresh/remote clone (e.g. claude.ai/code, a cloud agent):** cloning `github.com/lh950/traffic-app.git` puts the app at the clone's repo ROOT — there is **no nested `traffic-app-v3/` subdirectory**. That nesting is a local-machine-only artifact. Run npm/build commands at the clone root directly; don't `cd traffic-app-v3` on a remote clone.
- Remote: `origin` → `https://github.com/lh950/traffic-app.git`, branch `master`.
- Deployment is automatic: `.github/workflows/deploy.yml` runs on every push to `master` (Node 24), builds, and publishes `dist/` to GitHub Pages via `actions/deploy-pages`. No manual deploy step. If the live site doesn't reflect a recent push, check the Actions tab — a workflow failure (including transient runner infra failures, which have happened before and just need a re-run) means the push didn't deploy.

## Scope

**Positioning:** a browser-based platform for collecting, organizing, and doing top-level analysis of traffic count data — not a tool for building or replacing engineering analysis software that already exists (Synchro, HCS, SIDRA, MUTCD warrant calculators, HCM LOS, signal-timing simulation, etc.), even in simplified/self-disclaiming form. The core problem it solves: the prior workflow ran on Excel files with formulas that broke silently; this app replaces that with a structured UI that can't be broken the same way, then hands clean data off to GIS/Excel/Synchro for whatever deeper analysis comes next.

Judge scope fit against the two core goals — (1) a better way to create manual counts, (2) better visualization/organization of the resulting data — not against whether a feature's *source* sounds engineering-y. Importing/exporting data to/from outside tools (StreetLight comparison import, UTDF export for Synchro) is in scope as data interchange serving goal #2; it does not make the app itself a counting or analysis engine. Two features (signal warrant screening, a v/c-ratio LOS section) were built, shipped, and only caught as scope creep later when re-examined against this positioning — both were removed (v3.24.0). Before implementing anything resembling an engineering calculation (LOS, capacity, signal timing, delay, queuing), stop and check whether it duplicates a capability dedicated software already provides; if so, flag it rather than building it, even if explicitly requested.

**Roadmap / stage tracking** lives in the [Traffic App v3 — Project Brief](https://claude.ai/code/artifact/9e5767b1-cbc7-410e-99b0-e03311340a4d) (a Claude Artifact, not a file in this repo — read it before proposing or reporting on features; it drifts less than re-deriving from git log). When proposing a new feature or scope expansion: name which stage it belongs to, and check it against the Purpose section above, before building.

**Legacy code:** earlier iterations (`traffic-app/`, `traffic-app-v2/`, `traffic-counter/`, `traffic-analysis/`, an original single-file `traffic_counter_v5.html`) were archived to `_archive/` at the top level and are not live — don't derive current behavior from them.

## Process

- Update `BUGS.md` (bugs found/fixed, with severity and root cause), `CHANGELOG.md`, and `DEVLOG.md` (architectural decisions, scope calls, judgment calls) on every change — not just at the end of a session.
- Read `DEVLOG.md` and `BUGS.md` before starting new work — recent entries document established patterns (e.g. by-label not by-array-position aggregation, generation-counter guards on async renders sharing a DOM container, reset-before-restore on any live global a project load only partially overwrites) and are the fastest way to avoid repeating a bug class that's already been found and fixed once.
