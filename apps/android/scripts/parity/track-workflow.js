export const meta = {
  name: 'android-parity-track',
  description: 'Android parity track: schedule ready lots, then issue → branch/TDD → review → PR → CI watch → fix → merge, until the track is done',
  whenToUse: 'Run one track of the Android↔iOS parity plan (apps/android/docs/parite-ios/plan/<track>.json); args {track, epic, run, lotsDir}',
  phases: [
    { title: 'Schedule', detail: 'haiku: ready lots from the dev merge ledger', model: 'haiku' },
    { title: 'Issue', detail: 'haiku: sub-issue of the track epic', model: 'haiku' },
    { title: 'Implement', detail: 'sonnet: own branch, TDD, push', model: 'sonnet' },
    { title: 'Review', detail: 'sonnet: pre-CI compile hazards and iOS fidelity', model: 'sonnet' },
    { title: 'PR', detail: 'haiku: open the PR to dev', model: 'haiku' },
    { title: 'CI', detail: 'haiku: watch checks, merge green PRs', model: 'haiku' },
    { title: 'Fix', detail: 'sonnet: fix red CI or merge conflicts', model: 'sonnet' },
  ],
}

const T = args.track
const EPIC = args.epic
const RUN = args.run
const LOTS = args.lotsDir
const BATCH = args.batch || 4
const MAX_FIX_ROUNDS = args.maxFixRounds || 4
const MAX_IDLE = args.maxIdle || 12
const MAX_STALL = args.maxStall || 5
const ATTR = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01EP6Bfac7sFfP8RkuHTATHN'

const SCHED = { type: 'object', properties: { track: { type: 'string' }, ready: { type: 'array', items: { type: 'string' } }, remaining: { type: 'number' }, waiting_on_deps: { type: 'number' }, claimed_unmerged: { type: 'array', items: { type: 'string' } } }, required: ['ready', 'remaining', 'waiting_on_deps', 'claimed_unmerged'] }
const ISSUE = { type: 'object', properties: { issue: { type: 'number' } }, required: ['issue'] }
const IMPL = { type: 'object', properties: { status: { type: 'string', enum: ['pushed', 'skipped-claimed', 'failed'] }, branch: { type: 'string' }, head_sha: { type: 'string' }, files_changed: { type: 'array', items: { type: 'string' } }, tests_added: { type: 'array', items: { type: 'string' } }, jvm_check: { type: 'string', enum: ['pass', 'fail', 'not-run'] }, summary: { type: 'string' }, risks: { type: 'array', items: { type: 'string' } }, followups: { type: 'array', items: { type: 'string' } } }, required: ['status', 'summary'] }
const REVIEW = { type: 'object', properties: { verdict: { type: 'string', enum: ['ok', 'fixed', 'blocked'] }, head_sha: { type: 'string' }, fixes: { type: 'array', items: { type: 'string' } }, residual_risks: { type: 'array', items: { type: 'string' } } }, required: ['verdict'] }
const PRS = { type: 'object', properties: { pr: { type: 'number' } }, required: ['pr'] }
const MON = { type: 'object', properties: { prs: { type: 'array', items: { type: 'object', properties: { pr: { type: 'number' }, state: { type: 'string', enum: ['merged', 'red', 'conflict', 'merge-failed', 'pending'] }, head_sha: { type: 'string' }, failed: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, url: { type: 'string' } }, required: ['name'] } }, note: { type: 'string' } }, required: ['pr', 'state'] } } }, required: ['prs'] }
const FIX = { type: 'object', properties: { pushed: { type: 'boolean' }, head_sha: { type: 'string' }, cause: { type: 'string' }, change: { type: 'string' } }, required: ['pushed', 'cause'] }

function clone(key, existing) {
  const fetchExtra = existing ? ' claude/android-' + key : ''
  const base = existing ? 'origin/claude/android-' + key : 'origin/dev'
  return 'D=' + LOTS + '/' + key + '\n' +
    'rm -rf "$D" && git clone -q --shared --no-checkout /home/user/meeshy "$D" && cd "$D" \\\n' +
    '  && git remote set-url origin https://github.com/isopen-io/meeshy \\\n' +
    '  && git sparse-checkout set --cone apps/android packages/shared/fixtures packages/shared/types packages/shared/utils .github \\\n' +
    '  && git fetch -q origin dev' + fetchExtra + ' \\\n' +
    '  && git checkout -q -B claude/android-' + key + ' ' + base
}

const COMPILE_SAFETY = `Compile-safety checklist (the GitHub CI is the ONLY Android compiler; a red run costs ~15 minutes):
- every symbol you reference exists (grep the repo) or you create it; every import resolves; use only APIs of the pinned versions (Kotlin 2.0.21, Compose BOM 2024.10.01 = Compose 1.7 / Material3 1.3, navigation-compose 2.8.3, lifecycle 2.8.6, Room 2.6.1, Hilt 2.52, WorkManager 2.9.1, Media3 1.4.1, Coil 2.7.0, minSdk 26);
- explicit visibility modifiers in modules that use explicitApi();
- when you change an interface, abstract class, data class constructor or sealed hierarchy, update ALL implementations, fakes and callers in main AND test source sets of EVERY module (grep ': Name', 'Name(' and 'object : Name');
- 'when' over sealed/enum stays exhaustive; suspend functions only from coroutines; Flow/StateFlow types match;
- Hilt: @Inject constructors; bindings in a NEW @Module file of your lot; never add @Provides to SdkModule.kt, NetworkModule.kt or AppModule.kt;
- resources: every R.string / R.drawable you use exists in that module (or is generated by your i18n manifest step); new strings go in a new strings_<lotkey>.xml per locale folder of the module, never in another lot's file;
- tests: follow the module's existing patterns (JUnit4, Truth, Turbine, coroutines-test, Robolectric, MockK); test doubles implement every member.`

function schedPrompt(blocked) {
  const ex = blocked.length ? ' --exclude ' + blocked.join(',') : ''
  const rec = blocked.length ? ('First record the blocked lots (one per line, no duplicates) in ' + RUN + '/blocked.txt: for k in ' + blocked.join(' ') + '; do grep -qx "$k" ' + RUN + '/blocked.txt || echo "$k" >> ' + RUN + '/blocked.txt; done\n') : ''
  return rec + 'Run in Bash: python3 ' + RUN + '/ready.py ' + T + ' --batch ' + BATCH + ex + '\nIt prints one JSON object. If its "ready" list is empty AND "remaining" > 0, run "sleep 600" in Bash and run the same command again; repeat at most 3 times. Return the LAST JSON exactly as printed (fields ready, remaining, waiting_on_deps, claimed_unmerged, track).'
}

function issuePrompt(key) {
  return `Create (or reuse) the GitHub issue of Android parity lot "${key}".
1. Run in Bash: python3 ${RUN}/issue_body.py ${T} ${key} ${EPIC}  → prints JSON {title, body}.
2. Load tools with ToolSearch "select:mcp__github__search_issues,mcp__github__issue_write".
3. Search for an existing issue with exactly that title: mcp__github__search_issues with owner "isopen-io", repo "meeshy", query = the title, fields ["number","title","state"]. If an issue with the identical title exists, return its number.
4. Otherwise create it: mcp__github__issue_write method "create", owner "isopen-io", repo "meeshy", title and body EXACTLY as printed (verbatim), labels ["android"], milestone 17, parent_issue_number ${EPIC}. If the parent link fails, retry once without parent_issue_number.
Return {"issue": <number>}.`
}

function implPrompt(key, issue) {
  return `You implement ONE lot of the Meeshy Android ↔ iOS parity program (directive #11570), end to end, on its own branch. Lot "${key}", track ${T}, issue #${issue}.

Read first:
1. The lot spec: python3 ${RUN}/lot.py ${T} ${key}  (goal, acceptance, tests, android_files_touched, ios_reference_files, absorbed lots, deps — all deps are already merged in dev).
2. ${RUN}/CONVENTIONS.md — BINDING rules (module placement, UDF, cache-first SWR, outbox, single Prism resolver, presence law, theme tokens and accent passed as parameter, i18n generated from the iOS catalogs, Hilt and navigation extension points, Room schema lock, hot files, file size budget, versions, branch/PR rules).
3. The iOS reference files of the spec, read-only from /home/user/meeshy: they define the behavior, states (empty/loading/error/offline), gestures, hierarchy and visual rendering you must reproduce on Android. Read the existing Android code you will touch before changing it.

Private clone (NEVER edit /home/user/meeshy itself):
${clone(key, false)}
If "git ls-remote --heads origin claude/android-${key}" already lists the branch before you start, another session owns this lot: stop and return status "skipped-claimed".
Reserve the lot early: after your first failing test or first new file, commit and run git push -u origin claude/android-${key}.

Implement with TDD in small increments: failing test → minimal code → green. Pure logic (laws, resolvers, reducers, presenters, decoders) goes in :core:model and is proven locally with: cd "$D/apps/android" && ./meeshy.sh jvm-check --no-daemon -q  (1–2 min; must pass before you push).
${COMPILE_SAFETY}
Touch the spec's files plus minimal additive wiring allowed by the shared-files protocol of CONVENTIONS.md. Keep every file under 1000 lines (extract first if a file you must extend is over budget and the spec says so). Match the style of the surrounding Kotlin code. Never weaken or delete an existing test.

Commits: French, semantic, e.g. "feat(android/<domaine>): <résultat visible pour l'utilisateur>", a short body (what and why), then a blank line and exactly:
Refs #${issue}
${ATTR}
Push: git push -u origin claude/android-${key} (on a network error retry up to 4 times after 2, 4, 8, 16 s). Do not open a PR. Do not delete $D (the reviewer reuses it).
If a dependency or the spec makes part of the lot impossible now, ship what is safely possible behind an inert seam and list the rest in followups.

Return: status ("pushed" | "skipped-claimed" | "failed"), branch, head_sha, files_changed, tests_added, jvm_check ("pass" | "fail" | "not-run"), summary (French, 3–6 lines: what the Android user now sees or gets, as on iOS), risks, followups.`
}

function reviewPrompt(key, impl) {
  return `You are the pre-CI reviewer of Android parity lot "${key}" (track ${T}). The GitHub CI (assembleDebug + testDebugUnitTest) is the only Android compiler and a red run costs ~15 minutes: make the FIRST CI run green, and the lot faithful to iOS.
Implementer report: ${JSON.stringify({ summary: impl.summary, files: impl.files_changed, risks: impl.risks, jvm_check: impl.jvm_check }).slice(0, 3000)}

Clone: ${LOTS}/${key} on branch claude/android-${key}. If that directory is missing or not on the branch, recreate it:
${clone(key, true)}
1. cd into it, git fetch -q origin dev, and read the whole diff: git diff origin/dev...HEAD
2. Compile-hazard audit, line by line: unresolved symbols and imports (grep every new reference), signatures that do not exist in the pinned versions, missing override, non-exhaustive when, explicitApi visibility, nullability, suspend misuse, Hilt graph (every injected type bound exactly once), navigation registration, R references to missing resources, duplicate resource names, test doubles missing new interface members (grep implementations across ALL modules including src/test), stale call sites of changed constructors, Room entity/DAO/migration consistency.
${COMPILE_SAFETY}
3. Behavior: compare with the spec (python3 ${RUN}/lot.py ${T} ${key}) acceptance criteria and the iOS references; fix small gaps, report the rest.
4. If :core:model changed: cd apps/android && ./meeshy.sh jvm-check --no-daemon -q must pass.
Fix what you find, commit "fix(android/<domaine>): …" with the same trailer lines (Refs #<issue> then:
${ATTR}), push (no force). Then delete the clone directory ${LOTS}/${key}.
Return: verdict ("ok" if nothing to change, "fixed" if you pushed fixes, "blocked" only if the lot cannot compile without work outside its scope), head_sha, fixes, residual_risks.`
}

function prPrompt(key, impl) {
  const summary = (impl.summary || '').replace(/"/g, "'").slice(0, 1500)
  return `Open the pull request of Android parity lot "${key}".
1. Run in Bash: python3 ${RUN}/pr_body.py ${T} ${key} ${impl.issue} "${summary}"  → prints JSON {title, body}.
2. Load tools with ToolSearch "select:mcp__github__list_pull_requests,mcp__github__create_pull_request".
3. If an open PR already exists for head "isopen-io:claude/android-${key}" (mcp__github__list_pull_requests owner isopen-io repo meeshy head "isopen-io:claude/android-${key}" state open, fields ["number"]), return its number.
4. Otherwise mcp__github__create_pull_request: owner "isopen-io", repo "meeshy", base "dev", head "claude/android-${key}", title and body EXACTLY as printed.
Return {"pr": <number>}.`
}

function monitorPrompt(pending) {
  return `Watch these pull requests of isopen-io/meeshy until each reaches a terminal state, and merge the green ones: ${JSON.stringify(pending.map(p => ({ pr: p.pr, lot: p.key })))}
Load tools with ToolSearch "select:mcp__github__pull_request_read,mcp__github__merge_pull_request".
Polling loop, at most ~50 minutes in total; between rounds run "sleep 150" in Bash. For each PR that is not terminal yet:
- mcp__github__pull_request_read method "get" (look at state, merged, mergeable, mergeable_state, head.sha). merged=true → state "merged".
- mcp__github__pull_request_read method "get_check_runs". If there are no check runs yet, or any is queued/in_progress → still pending.
- When all check runs are completed: a check FAILS if its conclusion is failure, timed_out, startup_failure or action_required; "cancelled" fails only for "Android (assemble + unit tests)"; success, skipped and neutral pass.
  - none failing → merge: mcp__github__merge_pull_request owner isopen-io repo meeshy pullNumber <n> merge_method "merge" expectedHeadSha <head sha> (do NOT pass commit_title or commit_message) → "merged". If the merge is refused because of conflicts → "conflict"; any other refusal → "merge-failed" with the message in note.
  - some failing → "red", with failed = [{name, url: details_url}].
- mergeable_state "dirty" → "conflict".
Stop when every PR is terminal (merged, red, conflict, merge-failed) or the time is up (the rest stay "pending"). Return {"prs":[{pr, state, head_sha, failed, note}]}.`
}

function fixPrompt(p, status) {
  return `Make PR #${p.pr} of isopen-io/meeshy (Android parity lot "${p.key}", branch claude/android-${p.key}, track ${T}) mergeable and green. Current state: ${JSON.stringify(status).slice(0, 2500)}
Private clone of the PR branch (NEVER edit /home/user/meeshy):
${clone(p.key, true)}
- conflict or merge-failed: git merge origin/dev (never rebase, never force-push). Resolve per CONVENTIONS.md (${RUN}/CONVENTIONS.md, shared-files protocol): registration files keep both hunks; strings_generated.xml is regenerated (./apps/android/meeshy.sh i18n if it exists), never merged by hand; a Room schema version collision is renumbered with its migration and schema JSON.
- red: load mcp__github__get_job_logs with ToolSearch, take the run id from the failing check's url (…/actions/runs/<run_id>/job/<job_id>) and call it with run_id, failed_only true, return_content true, tail_lines 400. Kotlin compile errors look like "e: file:///…/X.kt:LINE:COL message"; failing tests are listed by the "Summarise failing tests" step. Find the ROOT cause and fix it. Never skip, @Ignore, weaken or delete a test to get green. If the same failure exists on dev without this PR (check the latest Android run on dev with mcp__github__actions_list method list_workflow_runs resource_id android.yml branch dev), still port the minimal clear fix and say so.
${COMPILE_SAFETY}
Validate what you can locally (cd apps/android && ./meeshy.sh jvm-check --no-daemon -q when :core:model is involved). Commit "fix(android/<domaine>): …" ending with:
${ATTR}
then git push origin claude/android-${p.key} (no force). Delete the clone directory afterwards.
Return {pushed, head_sha, cause, change}.`
}

const blocked = []
const report = []
const followups = []
let idle = 0
let round = 0
while (true) {
  round++
  const sched = await agent(schedPrompt(blocked), { label: `sched:${T}#${round}`, phase: 'Schedule', schema: SCHED, model: 'haiku', effort: 'low' })
  if (!sched) { log(`${T}: scheduler failed, stopping`); break }
  if (!sched.ready.length) {
    if (sched.remaining === 0) { log(`${T}: track complete`); break }
    idle++
    log(`${T}: nothing ready (${sched.waiting_on_deps} waiting on deps, ${sched.claimed_unmerged.length} claimed elsewhere) — idle ${idle}/${MAX_IDLE}`)
    if (idle >= MAX_IDLE) break
    continue
  }
  idle = 0
  const keys = sched.ready
  log(`${T} round ${round}: ${keys.join(', ')} (${sched.remaining} remaining)`)

  const built = await pipeline(keys,
    (key) => agent(issuePrompt(key), { label: `issue:${key}`, phase: 'Issue', schema: ISSUE, model: 'haiku', effort: 'low' }),
    (iss, key) => (iss && iss.issue)
      ? agent(implPrompt(key, iss.issue), { label: `impl:${key}`, phase: 'Implement', schema: IMPL, model: 'sonnet' }).then((r) => (r ? { ...r, issue: iss.issue } : { status: 'failed', summary: 'implementer returned nothing', issue: iss.issue }))
      : { status: 'failed', summary: 'no issue' },
    (impl, key) => (impl && impl.status === 'pushed')
      ? agent(reviewPrompt(key, impl), { label: `review:${key}`, phase: 'Review', schema: REVIEW, model: 'sonnet' }).then((rv) => ({ impl, review: rv }))
      : { impl, review: null },
    (res, key) => (res && res.impl && res.impl.status === 'pushed' && !(res.review && res.review.verdict === 'blocked'))
      ? agent(prPrompt(key, res.impl), { label: `pr:${key}`, phase: 'PR', schema: PRS, model: 'haiku', effort: 'low' }).then((pr) => ({ ...res, pr: pr && pr.pr }))
      : res,
  )

  let pending = []
  keys.forEach((key, i) => {
    const b = built[i]
    if (b && b.impl && b.impl.followups) for (const f of b.impl.followups) followups.push({ key, followup: f })
    if (b && b.pr) pending.push({ key, pr: b.pr, issue: b.impl.issue })
    else {
      const st = b && b.impl ? b.impl.status : 'failed'
      if (st !== 'skipped-claimed') blocked.push(key)
      report.push({ key, outcome: st === 'skipped-claimed' ? 'skipped-claimed' : 'not-opened', detail: JSON.stringify(b ? { impl: b.impl && { status: b.impl.status, summary: b.impl.summary }, review: b.review } : null).slice(0, 600) })
    }
  })

  let fixRound = 0
  let stall = 0
  while (pending.length) {
    const mon = await agent(monitorPrompt(pending), { label: `ci:${T}#${round}.${fixRound}.${stall}`, phase: 'CI', schema: MON, model: 'haiku', effort: 'low' })
    const byPr = {}
    for (const s of ((mon && mon.prs) || [])) byPr[s.pr] = s
    const merged = pending.filter((p) => byPr[p.pr] && byPr[p.pr].state === 'merged')
    for (const p of merged) report.push({ key: p.key, pr: p.pr, issue: p.issue, outcome: 'merged', fixRounds: fixRound })
    const toFix = pending.filter((p) => byPr[p.pr] && ['red', 'conflict', 'merge-failed'].includes(byPr[p.pr].state))
    const still = pending.filter((p) => !byPr[p.pr] || byPr[p.pr].state === 'pending')
    if (toFix.length) {
      stall = 0
      fixRound++
      if (fixRound > MAX_FIX_ROUNDS) {
        for (const p of toFix) { blocked.push(p.key); report.push({ key: p.key, pr: p.pr, outcome: 'blocked-red', detail: JSON.stringify(byPr[p.pr]).slice(0, 800) }) }
        pending = still
        continue
      }
      log(`${T}: fixing ${toFix.map((p) => p.key).join(', ')} (round ${fixRound})`)
      await parallel(toFix.map((p) => () => agent(fixPrompt(p, byPr[p.pr]), { label: `fix:${p.key}#${fixRound}`, phase: 'Fix', schema: FIX, model: 'sonnet' })))
      pending = [...toFix, ...still]
    } else if (still.length) {
      if (!merged.length) stall++
      if (stall >= MAX_STALL) {
        for (const p of still) { blocked.push(p.key); report.push({ key: p.key, pr: p.pr, outcome: 'stalled' }) }
        pending = []
      } else pending = still
    } else pending = []
  }
}

const mergedCount = report.filter((r) => r.outcome === 'merged').length
log(`${T}: ${mergedCount} lots merged, ${blocked.length} blocked`)
return { track: T, rounds: round, merged: mergedCount, blocked, report, followups }
