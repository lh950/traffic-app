# Traffic App v3 — repo instructions for Claude

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

**Before every push:** run `npm run build` (a local `.git/hooks/pre-push` hook already enforces this and blocks the push on failure — it's not optional). The dev server's HMR does not catch a missing/renamed export across files; only a real build does.

## Process

- Update `BUGS.md` (bugs found/fixed, with severity and root cause), `CHANGELOG.md`, and `DEVLOG.md` (architectural decisions, scope calls, judgment calls) on every change — not just at the end of a session.
- Check a proposed feature against the Purpose/scope section of the Project Brief (a Claude Artifact, not in this repo) before building — this app is a field-count data collection + QA/QC + reporting tool, not an engineering-analysis tool (LOS/warrant screening/signal-timing simulation are explicitly out of scope). Importing/exporting data to/from outside tools (StreetLight, Synchro/UTDF) is in scope as data interchange, not scope creep — judge fit against "does this help create counts, or organize/visualize the data," not against whether an outside tool's name sounds engineering-y.
- Read `DEVLOG.md` and `BUGS.md` before starting new work — recent entries document established patterns (e.g. by-label not by-array-position aggregation, generation-counter guards on async renders sharing a DOM container, reset-before-restore on any live global a project load only partially overwrites) and are the fastest way to avoid repeating a bug class that's already been found and fixed once.
