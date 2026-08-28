# Traffic App v3 — repo instructions for Claude

**This file is the shared source of truth for any session working on this repo — local CLI, desktop app, or claude.ai/code (web/remote).** Sessions don't share memory with each other; this file is how they stay in sync. If you (any session) establish a new standing process rule, correct a wrong assumption, or learn something that would matter to a *different* session working on this repo later, add it here — not only to your own local/personal memory. Keep entries short and dated where relevant; this file should stay a quick read, not a full history (that's what `DEVLOG.md` is for).

## Coding discipline

Behavioral guidelines to reduce common LLM coding mistakes. These bias toward caution over speed — for trivial one-line fixes, use judgment rather than applying all four steps ceremonially. This section governs *code*; it does not shrink `BUGS.md`/`DEVLOG.md` entry depth (see Process below) — thorough root-cause writeups have been catching real bugs in this repo and should stay thorough.

**1. Think before coding.** Don't assume, don't hide confusion, surface tradeoffs. State assumptions explicitly; if uncertain, ask. If multiple interpretations exist, present them rather than silently picking one. If a simpler approach exists, say so — push back when warranted. If something is unclear, stop, name what's confusing, and ask.

**2. Simplicity first.** Minimum code that solves the problem, nothing speculative. No features beyond what was asked, no abstractions for single-use code, no unrequested "flexibility"/"configurability," no error handling for impossible scenarios. If a change is 200 lines and could be 50, rewrite it. Test: would a senior engineer call this overcomplicated?

**3. Surgical changes.** Touch only what you must; clean up only your own mess. Don't "improve" adjacent code, comments, or formatting while editing something else. Don't refactor things that aren't broken. Match existing style even if you'd do it differently. If you notice unrelated dead code, mention it — don't delete it. Do remove imports/variables/functions that YOUR OWN changes made unused; don't remove pre-existing dead code unless asked. Test: every changed line should trace directly to the user's request.

**4. Goal-driven execution.** Turn tasks into verifiable goals before starting ("fix the bug" → "reproduce it live, then confirm the repro no longer fails"; matches this repo's own live-verification requirement below). For multi-step work, state a brief plan with a verification check per step. Strong success criteria let you work independently; weak ones ("make it work") force constant clarification.

**Writing style:** new code comments and documentation written for this repo should default to ASD Simplified Technical English (ASD-STE100) — short sentences, one action per sentence, plain approved vocabulary, active voice, no idioms — applied going forward, not as a retroactive rewrite of existing comments/docs. Where this would strip out a genuinely load-bearing nuance (the kind of non-obvious *why* this repo's own comment guidance already calls for), keep the nuance and simplify the sentence structure around it rather than deleting the substance.

**These guidelines are working if:** fewer unnecessary changes show up in diffs, fewer rewrites happen due to overcomplication, and clarifying questions arrive before implementation rather than after a mistake.

## Session check-in / check-out — avoid two sessions colliding on the same files

Before starting substantive work (more than a one-line fix), check `SESSION_LOCK.md` at the repo root:

- **If it says `status: clear`** — pull latest, then immediately edit it to `status: active`, fill in who/what/when, commit, and push that alone (a fast, tiny commit) before doing any real work. This claims the repo.
- **If it says `status: active`** and the timestamp is recent (say, within the last few hours) — a session may already be mid-work. Don't start overlapping file changes; either wait, work in a clearly separate area, or ask the user which session should proceed.
- **If it says `status: active`** but the timestamp is old/stale (previous session likely ended without clearing it, e.g. crashed or the user closed it) — it's safe to treat as clear, but note in your own check-in that you overrode a stale lock.
- **When your work is fully committed and pushed**, set it back to `status: clear` and push that too.

This isn't a hard distributed lock — two sessions could still race if they check at the exact same moment — but it makes the common case (one session picks up after the other) visible and safe, and git's own merge-conflict-on-push is the backstop if it's ever missed.

**Is this push safe right now, or should it wait?** Sessions on this repo share the same physical working directory — there's no filesystem isolation unless a session was explicitly started in a git worktree. If `SESSION_LOCK.md` shows another session `active` (not stale) while you have a commit ready, check all of these before pushing:

1. **File overlap** — does your change touch any file the active session is working in (per its check-in note, or files with uncommitted changes in `git status` that aren't yours)? If yes, wait or ask the user; don't push.
2. **Staging is narrow** — stage only the specific files your own change touched (`git add <path>`, never `git add -A`/`git add .`). This matters more than usual here: another session's in-progress edits are sitting uncommitted in the same tree, and a broad `git add` would sweep them into your commit.
3. **Build still passes** — run `npm run build` before pushing (the pre-push hook does this too, but check it yourself first). If it fails and the failure traces to files you didn't touch, that's a signal the other session's WIP is mid-edit/broken right now — wait rather than pushing through it.
4. **You're not behind** — `git pull` (or check `git status`) before pushing in case the other session already pushed; use a normal merge/rebase, never force.

If all four check out, push — no need to wait idle for the other session to fully finish. If any fail, wait or work in a clearly separate area instead, same as the file-overlap guidance above.

## ⚠️ If you are a remote/web session (claude.ai/code): you cannot push. Save your work for the main session instead.

**Confirmed, not hypothetical:** the GitHub integration behind claude.ai/code sessions on this repo currently has read access only. Every push path has been tested and fails the same way — plain `git push`, an authenticated push with the session's own token, and the `mcp__github__push_files` MCP tool all get rejected (`403 Resource not accessible by integration` on `git/refs` — it can't create or update refs). This is a permission gap on the connector itself, not something fixable from within a session, and not something worth re-attempting more than once per session.

**What to do instead — this is the expected, supported workflow, not a fallback:**

1. Do the real work: understand the task, make the fix, verify it live (run the app, don't just read the diff), update `BUGS.md`/`CHANGELOG.md`/`DEVLOG.md`/version numbers per the conventions below, and commit locally in your clone. Commit — don't leave it sitting uncommitted, since this container/clone is ephemeral and uncommitted work disappears when the session ends.
2. **Do not attempt `git push` at all in a remote/web session** — not once, not to "confirm" the known failure. The 403 is confirmed and permanent until an org admin fixes the connector; every attempt is a wasted round-trip. Just commit locally and move on to the handoff step below. The repo's `stop-hook-git-check.sh` hook will still fire an automated "N unpushed commits" reminder after every turn regardless — that's expected noise given rule 2, not a new instruction each time. Don't reply to it, explain it, or acknowledge it; just continue.
3. **Do not start a new batch of work on your own initiative.** Wait for the user's explicit go-ahead ("run this as a batch," "go ahead," etc.) before beginning a new fix/feature — this applies per new item, not to continuing something already in progress (a "continue" instruction covers work already underway).
4. **Do not produce or send a handoff patch after every commit.** The user will ask for a patch file explicitly, typically once at the end of the day covering everything accumulated since the last handoff — wait for that request rather than pushing (pun intended) a patch after each individual change.
5. When the user does ask for the end-of-day patch: produce a **handoff** for whichever session does have push access (a local CLI session on the maintainer's machine): a plain unified diff/patch (`git diff <base>..<your-HEAD> > name.patch`, or `git format-patch`) covering everything accumulated since the last handoff, plus a short written summary — what the task was, root cause, what you changed, and exactly how you verified it live. A worked example of this exact pattern exists: BUG-030 (see `BUGS.md`/`DEVLOG.md`) was fixed by a remote session this way — patch applied cleanly, verified again, and pushed by the local session with no rework needed. That's the bar: the patch should be good enough to apply and push with no back-and-forth, not a rough draft.
6. Send/deliver the patch through whatever channel actually reaches the user (chat attachment, a rendered artifact, pasting the diff directly) — don't assume a link or file reference alone will be seen.
7. Don't touch `SESSION_LOCK.md` on `master` if your session is scoped to its own branch and a push there would be denied anyway — just note the lock state you observed in your handoff so the applying session knows whether it needs to claim/clear it.

*(Rules 2–4 above are remote/web-session-only. A local CLI session with real push access pushes normally and does not wait for an end-of-day patch request.)*

## Versioning scheme

Two separate markers, shown together as `v3 · vMAJOR.MINOR.PATCH` (e.g. `v3 · v0.49.2`) — deliberately not one combined number.

**`v3`** is a fixed generation label, not a version — it means "the third rewrite of this app" (`traffic-app` → `traffic-app-v2` → this one), and never changes on its own. It lives in the repo/package name (`traffic-app-v3`) and is prefixed onto the display string in all 4 `index.html` spots below; don't bump it as part of routine version-bumping. It would only change on an actual next full rewrite, which isn't a routine event this scheme needs to plan for.

**`MAJOR.MINOR.PATCH`** (no `-alpha` suffix — retired 2026-08-27; see `DEVLOG.md`'s versioning-scheme entry for why) is the part that actually moves on every change:

- **MAJOR** — reserved for the "safe to hand to other people" milestone, not schema compatibility. Stays `0` until the user explicitly declares the count-data-loss risk resolved (see `project_data_stability_gate` — two real field days were lost to BUG-047/048 before this rule existed) and the app is fit to share beyond the user's own solo use. Only bumps again after that on the user's own call, not a routine schema change.
- **MINOR** — one per batch of related work pushed together as a single session — **not one per individual feature.** If several features are built in sequence within one session, they all share one MINOR number; only the first commit in the batch bumps MINOR. A new MINOR starts only once the previous batch is actually pushed and new, unrelated work begins. Same "batch = session, stays open until pushed" rule as before.
- **PATCH** — increments on every commit within the open MINOR batch (this replaces what `-alpha.N` used to do — it was already functioning as a per-commit build counter, just under a "not yet confirmed" label that never actually got dropped in practice). Resets to `0` at the start of each new MINOR.

**Session boundary:** a "batch" = a session, and it stays open (same MINOR, only PATCH climbing) until the user confirms the final push. Don't close a batch just because a to-do list feels complete — if more work gets added before a push is confirmed, it folds into the same MINOR version.

**Bump all 5 UI locations on every version-changing commit** (only the `MAJOR.MINOR.PATCH` part changes; keep the `v3 · ` prefix as-is):
1. `package.json` — `"version"` field (pure semver only, no `v3 · ` prefix — npm expects a bare semver string here)
2. `index.html` — `<title>` tag
3. `index.html` — home screen `.home-version` div
4. `index.html` — sidebar version span (workspace mode)
5. `index.html` — counter header inline version span

Also bump `public/sw.js`'s `const CACHE = 'traffic-app-v3-X.Y.Z'` service-worker cache key — otherwise stale clients keep serving cached assets.

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

**Parked work — remind the user proactively:** the shared-viewer tab bar (Overview/QA-QC/Locations/Reports, shipped v3 · v1.1.2, 2026-08-28) is Trip Gen-only. The user confirmed intersection/area/parking shared viewers should get the same treatment, but explicitly deferred it — bring it up again when relevant (see DEVLOG's v1.1.2 entry for what's already generalized vs. what still needs replicating).

**Legacy code:** earlier iterations (`traffic-app/`, `traffic-app-v2/`, `traffic-counter/`, `traffic-analysis/`, an original single-file `traffic_counter_v5.html`) were archived to `_archive/` at the top level and are not live — don't derive current behavior from them.

## Process

- Update `BUGS.md` (bugs found/fixed, with severity and root cause), `CHANGELOG.md`, and `DEVLOG.md` (architectural decisions, scope calls, judgment calls) on every change — not just at the end of a session.
- Read `DEVLOG.md` and `BUGS.md` before starting new work — recent entries document established patterns (e.g. by-label not by-array-position aggregation, generation-counter guards on async renders sharing a DOM container, reset-before-restore on any live global a project load only partially overwrites) and are the fastest way to avoid repeating a bug class that's already been found and fixed once.
- **Bug numbering:** every new `BUGS.md` entry's heading gets a timestamp appended after the sequential number — `## BUG-NNN (MMDDYYYYHHMM)`, 24-hour time, e.g. `## BUG-047 (082620262254)` for 8/26/2026, 10:54 PM. The sequential number still increments normally (read the current highest `BUG-NNN` in the file, don't derive it from the timestamp); the timestamp is just appended for precise "when did this happen" reference later, since bugs get referenced across sessions/days and exact timing helps reconstruct what happened. Use the real current time when you write the entry, not an approximation. Existing entries from before this convention started aren't being backfilled (no reliable exact-time record for them) — this applies going forward only.
- **Cross-count-type parity:** this app has several count types (Trip Gen, intersection vehicle/ped/TMC, area studies, parking) built somewhat independently, so they can drift out of sync. Any backend/data-model/feature-dependent change made to ONE count type (not a UI-only tweak scoped to one screen) should be assumed to need the same change across the others, unless the user says otherwise. Before considering such a change done: check whether the same risk/gap/feature exists in the other count types, and either fix it there too or explicitly note why it doesn't apply (different architecture, already isolated, etc.) — don't silently leave the others unaddressed.
