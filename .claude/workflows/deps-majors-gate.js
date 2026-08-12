export const meta = {
  name: 'deps-majors-gate',
  description: 'Valide avec gates (tsc, tests, build) les bumps majeurs Dependabot différés, merge ou documente',
  whenToUse: 'Après une passe repo-maintenance ayant différé des bumps MAJOR — les valider un par un avec gates',
  phases: [
    { title: 'Gates', detail: 'un agent par PR major : checkout, merge-test local, changelog, gates, verdict', model: 'sonnet' },
    { title: 'Synthèse', detail: 'rapport consolidé dans tasks/', model: 'haiku' },
  ],
}

let parsedArgs = args
if (typeof parsedArgs === 'string') {
  try { parsedArgs = JSON.parse(parsedArgs) } catch (e) { parsedArgs = {} }
}
parsedArgs = parsedArgs || {}
const date = parsedArgs.date || 'date-non-fournie'
const seqPrs = parsedArgs.seqPrs || []
const parallelPrs = parsedArgs.parallelPrs || []
const mainRepo = '/Users/smpceo/Documents/v2_meeshy'

const GATE_SCHEMA = {
  type: 'object',
  required: ['pr', 'verdict', 'merged', 'gates', 'details'],
  properties: {
    pr: { type: 'number' },
    verdict: { type: 'string', enum: ['MERGE', 'LEAVE', 'IGNORE'] },
    merged: { type: 'boolean' },
    gates: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'result'],
        properties: { name: { type: 'string' }, result: { type: 'string' } },
      },
    },
    details: { type: 'string' },
  },
}

const promptFor = (pr) =>
  'Dépôt Meeshy (isopen-io/meeshy). Valide la PR Dependabot #' + pr.number + ' — ' + pr.title + ' — bump MAJOR différé, à passer avec gates avant tout merge.\n' +
  'Contexte projet : CI sous bun 1.3.14 / Node 22 ; les tests gateway ne remplacent PAS tsc ; parité locale (cf. CLAUDE.md) = npx prisma generate --generator client dans packages/shared PUIS bun run build dans packages/shared AVANT les tests gateway.\n\n' +
  'FOCUS : ' + pr.focus + '\n\n' +
  'Étapes :\n' +
  '1. gh pr view ' + pr.number + ' --json mergeStateStatus,statusCheckRollup — note ce que la CI de la PR couvre déjà ; si un check est FAILURE, diagnostique-le d\'abord.\n' +
  '2. Tu es dans un worktree git isolé et JETABLE. gh pr checkout ' + pr.number + ' puis git fetch origin main && git merge origin/main --no-edit pour tester l\'état post-merge RÉEL. Si conflit → commente "@dependabot rebase" sur la PR, verdict LEAVE, termine proprement.\n' +
  '3. Lis le changelog / les release notes du paquet pour TOUS les breaking changes du major, puis grep les sites d\'usage dans le repo et confronte chacun au changelog.\n' +
  '4. Exécute les gates du FOCUS. Ne commite ni ne pousse JAMAIS rien sur la branche dependabot.\n' +
  '5. Verdict et action :\n' +
  '   - MERGE : tous les gates verts → exécute réellement gh pr merge ' + pr.number + ' --squash --admin, puis merged=true.\n' +
  '   - LEAVE : gate rouge réparable, rebase requis, ou bump coordonné manquant → commente le détail précis sur la PR (gates exécutés, erreurs exactes), ne merge pas.\n' +
  '   - IGNORE : incompatibilité fondamentale ou politique documentée → commente la raison, puis commente "@dependabot ignore this major version".\n' +
  '6. Nettoyage final : supprime les node_modules que tu as créés dans le worktree isolé (rm -rf), pour libérer le disque.\n' +
  'Retourne le JSON demandé (details = 3-6 phrases : breaking changes trouvés, résultats de gates, justification du verdict).'

phase('Gates')
const parallelPromises = parallelPrs.map((pr) =>
  agent(promptFor(pr), { label: 'pr-' + pr.number, phase: 'Gates', model: 'sonnet', isolation: 'worktree', schema: GATE_SCHEMA })
)

const seqResults = []
for (const pr of seqPrs) {
  const r = await agent(promptFor(pr), {
    label: 'pr-' + pr.number,
    phase: 'Gates',
    model: 'sonnet',
    isolation: 'worktree',
    schema: GATE_SCHEMA,
  })
  seqResults.push(r)
  if (r) log('PR #' + pr.number + ' → ' + r.verdict + (r.merged ? ' (mergée)' : ''))
}

const parallelResults = []
for (const p of parallelPromises) parallelResults.push(await p)

const all = seqResults.concat(parallelResults).filter(Boolean)

phase('Synthèse')
const summary = await agent(
  'Compile le rapport de la passe de validation des bumps MAJOR Dependabot du ' + date + ' (dépôt Meeshy).\n' +
  'Résultats JSON : ' + JSON.stringify(all) + '\n' +
  'Vérifie aussi : gh pr list --state open --limit 20 (PRs deps restantes) et gh run list --branch main --limit 5 (CI après merges).\n' +
  'Écris ' + mainRepo + '/tasks/deps-majors-report-' + date + '.md : une section par PR (verdict, gates, breaking changes, suite à donner), puis une section « Restant » (PRs ouvertes, actions futures).\n' +
  'Retourne un résumé de 8 lignes maximum.',
  { label: 'rapport-majors', phase: 'Synthèse', model: 'haiku', effort: 'low' }
)

return { results: all, summary }
