## 2026-07-26 — Swarm collision, second occurrence: check `main` for the *whole* iteration, not just the file

**Context:** Iteration 220i (`StatusComposerView` `NavigationView` → `NavigationStack`) was
selected when `list_pull_requests` returned **zero** open PRs — the safest possible signal.
Within the hour a dozen concurrent `claude/quirky-curie-*` branches appeared, and one landed
`fdc6b422` on `main`: the same migration, the same empty-set invariant on
`NavigationContainerMigrationTests`, even the same reasoning in the doc comment. It also took
the **220i number** and consigned it in `branch-tracking.md` (`31d9e61d`). My PR #2339 was
entirely superseded — for the second time after 212i.

**Lessons:**
1. **Zero open PRs is not safety, it is a snapshot.** In a dense swarm the window between
   target selection and commit is where the collision happens. 212i taught "re-verify the
   defect on fresh `main` before committing"; I did that and still lost, because the
   supersession landed while CI was queueing — which on macOS runners was **90+ minutes**.
   The longer the gate takes, the wider the window. Re-check `main` again *after* CI, before
   assuming the PR is still worth merging.
2. **Iteration numbers collide too.** Another agent published 220i docs while my 220i PR was
   in flight. Reserve the number by pushing the tracking-doc entry **early**, or accept the
   number is only settled at merge time.
3. **Supersession is not total — salvage the remainder.** Of five changes on my branch, four
   were duplicated upstream but one (the export-duration expectation) was still uniquely
   needed and still red on `main`. The right move was to reset to `main` and re-apply only
   that, not to abandon the branch wholesale *or* force the superseded work through.
4. **A red `main` is the real blocker, not the collision.** Two unrelated breakages
   (`MockPostService` visibility drift, two-phase outro duration) reached `main` and kept
   every iOS PR red. Fixing those was worth more than the UI/UX iteration itself. When the
   gate is red for everyone, repairing it *is* the iteration.

---
