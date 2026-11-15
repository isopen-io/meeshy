export const meta = {
  name: 'android-parity-merge-backlog',
  description: 'Merge the open claude/android-* PRs into dev as ordered by the owner: per PR, merge dev into the branch, resolve conflicts, push, merge the PR (4 lanes)',
  phases: [{ title: 'Merge', detail: 'sonnet: resolve conflicts and merge each PR' }],
}
const RUN = args.run
const ATTR = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01EP6Bfac7sFfP8RkuHTATHN'
const R = { type: 'object', properties: { merged: { type: 'boolean' }, note: { type: 'string' } }, required: ['merged', 'note'] }
function prompt(p) {
  return `The project owner ordered (2026-10-23) that the open Android parity PRs be MERGED into dev now; red CI is fixed later on dev. Your job: get PR #${p.pr} (branch claude/android-${p.key}) of isopen-io/meeshy merged.
Private clone (NEVER edit /home/user/meeshy):
D=${RUN}/lots/merge-${p.key}
rm -rf "$D" && git clone -q --shared --no-checkout /home/user/meeshy "$D" && cd "$D" && git remote set-url origin https://github.com/isopen-io/meeshy && git sparse-checkout set --cone apps/android packages/shared/fixtures packages/shared/types packages/shared/utils packages/MeeshySDK/Sources .github && git fetch -q origin dev claude/android-${p.key} && git checkout -q -B claude/android-${p.key} origin/claude/android-${p.key}
1. git merge origin/dev (never rebase, never force-push). Resolve every conflict per ${RUN}/CONVENTIONS.md:
   - both sides' intent is kept: registration files (Hilt modules, nav graphs, manifests, settings.gradle.kts, libs.versions.toml) keep both hunks; composables/screens that both sides edited combine both changes;
   - strings_generated.xml: take dev's version, then regenerate with "cd apps/android && ./meeshy.sh i18n" if the lot added manifest keys; never hand-merge;
   - Room: if dev already has a migration/schema with the same version number, renumber THIS lot's migration to the next free version (class name, version constant in the database, schema JSON file name and its "version" field, tests);
   - two lots declaring the same symbol → ONE declaration serving both callers.
   Make sure no conflict marker remains (git grep -n '^<<<<<<<\\|^>>>>>>>' must be empty). Commit "Merge dev into claude/android-${p.key}" ending with:
${ATTR}
   git push origin claude/android-${p.key}.
2. Load mcp__github__merge_pull_request with ToolSearch and merge: owner isopen-io repo meeshy pullNumber ${p.pr} merge_method "merge" (no commit_title/commit_message: the default title "Merge pull request #${p.pr} from isopen-io/claude/android-${p.key}" is the program ledger). If it is refused because dev moved and conflicts again, repeat step 1 then merge again (at most 3 times). If the PR is already merged or closed, return merged accordingly.
3. Delete the clone directory. Never subscribe to PR activity, never create scheduled tasks. Return {merged, note} (note: what the conflicts were and how you resolved them, one sentence).`
}
const lanes = args.lanes
const results = await parallel(lanes.map((lane, i) => async () => {
  const out = []
  for (const p of lane) {
    const r = await agent(prompt(p), { label: `merge:${p.key}`, phase: 'Merge', schema: R, model: 'sonnet' })
    out.push({ pr: p.pr, key: p.key, merged: !!(r && r.merged), note: r ? r.note : 'no result' })
    log(`#${p.pr} ${p.key}: ${r && r.merged ? 'merged' : 'NOT merged'}`)
  }
  return out
}))
const flat = results.flat()
return { merged: flat.filter((x) => x.merged).length, notMerged: flat.filter((x) => !x.merged) }
