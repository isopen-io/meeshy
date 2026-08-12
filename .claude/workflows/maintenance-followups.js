export const meta = {
  name: 'maintenance-followups',
  description: 'Suites de maintenance : règle dependabot.yml, diagnostics PR rouges (gateway/Trivy), retrait dep inutilisée, dette keyGenerator',
  whenToUse: 'Après une passe repo-maintenance/deps-majors-gate, pour exécuter les suites actionnables identifiées',
  phases: [
    { title: 'Actions', detail: 'un agent par suite : config, diagnostics, retraits, dette — PR + merge si vert', model: 'sonnet' },
    { title: 'Synthèse', detail: 'section ajoutée au rapport de maintenance', model: 'haiku' },
  ],
}

let parsedArgs = args
if (typeof parsedArgs === 'string') {
  try { parsedArgs = JSON.parse(parsedArgs) } catch (e) { parsedArgs = {} }
}
parsedArgs = parsedArgs || {}
const date = parsedArgs.date || 'date-non-fournie'
const mainRepo = '/Users/smpceo/Documents/v2_meeshy'

const ACTION_SCHEMA = {
  type: 'object',
  required: ['task', 'status', 'details', 'prActions'],
  properties: {
    task: { type: 'string' },
    status: { type: 'string', enum: ['DONE', 'PARTIAL', 'BLOCKED'] },
    details: { type: 'string' },
    prActions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['number', 'action'],
        properties: { number: { type: 'number' }, action: { type: 'string' } },
      },
    },
  },
}

const COMMON =
  'Dépôt Meeshy (isopen-io/meeshy). Règles projet : commits conventionnels en français SANS trailer Co-Authored-By ; jamais de push sur une branche dependabot ; parité locale avant tests gateway = npx prisma generate --generator client PUIS bun run build dans packages/shared ; merge admin = gh pr merge N --squash --admin (pratique établie). Si un merge échoue pour conflit de lockfile (une autre PR vient de merger), rebase ta branche sur origin/main fraîchement fetché, régénère le lockfile (bun install), re-push et re-merge. Nettoie les node_modules créés dans ton worktree isolé avant de terminer. Retourne le JSON demandé (details = 4-8 phrases factuelles).\n\n'

phase('Actions')
const results = await parallel([
  () => agent(COMMON +
    'TÂCHE dependabot-config : empêcher Dependabot de recréer des bumps interdits, au niveau CONFIG (les commandes @dependabot ignore sont inopérantes sur les PRs groupées — #2493 a été recréée pour cette raison).\n' +
    '1. Lis .github/dependabot.yml (blocs updates, groupes existants).\n' +
    '2. Ajoute des règles ignore : (a) dependency-name "@types/node" avec update-types ["version-update:semver-major"] dans tous les blocs npm pertinents (au minimum celui de packages/shared qui porte le groupe types) — justification : le runtime CI est Node 22, les majors de @types/node doivent le suivre ; (b) dependency-name "protobuf" avec versions [">=7.0.0"] dans le bloc pip de services/translator — pin documenté dans requirements.txt (grpcio-tools/grpcio-reflection 1.76.0 plafonnent protobuf <7.0.0).\n' +
    '3. Valide la syntaxe : python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" .github/dependabot.yml\n' +
    '4. Worktree isolé : branche chore/dependabot-ignore-rules depuis origin/main, commit, push, PR vers main, merge admin (changement config-only).\n' +
    '5. Ferme ensuite la PR #2493 avec un commentaire renvoyant à la nouvelle règle.',
    { label: 'dependabot-config', phase: 'Actions', model: 'sonnet', effort: 'low', isolation: 'worktree', schema: ACTION_SCHEMA }),

  () => agent(COMMON +
    'TÂCHE diagnostic-2488 : la PR #2488 (react + react-dom 19.2.7→19.2.8, apps/web) a le check "Test gateway" en FAILURE sur la PR ET sur le run de mise à jour dependabot de main — 2 occurrences, donc plus probablement réel que flake.\n' +
    '1. Récupère les logs rouges : gh pr checks 2488 pour trouver le run, puis gh run view <id> --log-failed. Identifie les tests exacts qui échouent et leur message.\n' +
    '2. Explique le lien de causalité : pourquoi un bump react (apps/web) ferait-il échouer des tests GATEWAY ? Regarde le diff réel de la PR (gh pr diff 2488) et le hoisting du lockfile bun racine partagé.\n' +
    '3. Worktree isolé : gh pr checkout 2488, git merge origin/main --no-edit, parité locale, puis rejoue LOCALEMENT les suites qui échouent en CI ; compare avec origin/main pur (A/B propre, même environnement).\n' +
    '4. Verdict : flake avéré (vert local reproductible + explication du rouge CI) → relance les checks rouges (gh run rerun <id> --failed), attends le résultat (re-vérifie régulièrement, max ~15 min) et merge admin si vert ; cause réelle → commente le diagnostic précis fichier:ligne sur la PR et laisse ouverte.',
    { label: 'diagnostic-2488', phase: 'Actions', model: 'sonnet', isolation: 'worktree', schema: ACTION_SCHEMA }),

  () => agent(COMMON +
    'TÂCHE diagnostic-trivy : les PRs #2490 (@fastify/cors 11.2.0→11.3.0) et #2491 (@tus/server 2.4.1→2.4.3) ont un check Trivy/Security en FAILURE. NE fais AUCUN checkout ni install — analyse via gh et les registres uniquement.\n' +
    '1. Pour chaque PR : gh pr checks N → id du run Security rouge → gh run view <id> --log-failed. Extrais chaque CVE (id, paquet, sévérité, version corrigée).\n' +
    '2. Détermine si chaque CVE est INTRODUITE par le bump (présente dans la nouvelle version, absente de l\'ancienne — npm view, advisories GitHub) ou PRÉEXISTANTE (déjà présente sur main : compare avec le dernier run Security de main, vert ou rouge).\n' +
    '3. Verdict par PR : préexistante/étrangère au bump → merge admin avec commentaire expliquant pourquoi le rouge Trivy n\'est pas imputable à la PR ; introduite par le bump → commente le détail CVE et laisse ouverte ; corrigeable par une version plus récente → indique laquelle dans le commentaire.',
    { label: 'diagnostic-trivy', phase: 'Actions', model: 'sonnet', schema: ACTION_SCHEMA }),

  () => agent(COMMON +
    'TÂCHE retrait-web-vitals : retirer la dépendance INUTILISÉE web-vitals de apps/web.\n' +
    '1. Re-vérifie d\'abord la preuve : grep -rn "web-vitals" dans apps/web (imports, require, next.config, instrumentation) ET grep des APIs (onCLS, onINP, onLCP, onTTFB, onFCP, reportWebVitals, useReportWebVitals). Si tu trouves un usage réel → status BLOCKED, rapporte-le, ne touche à rien.\n' +
    '2. Worktree isolé : branche chore/web-remove-unused-web-vitals depuis origin/main ; retire web-vitals de apps/web/package.json ; bun install à la racine (met à jour le lockfile) ; lance un sous-ensemble rapide des tests apps/web pour confirmer que rien ne casse.\n' +
    '3. Commit, push, PR (corps : preuve du non-usage), merge admin.',
    { label: 'retrait-web-vitals', phase: 'Actions', model: 'sonnet', effort: 'low', isolation: 'worktree', schema: ACTION_SCHEMA }),

  () => agent(COMMON +
    'TÂCHE keygen-calls : dette gateway — ROUTE_RATE_LIMITS dans services/gateway/src/middleware/rate-limit.ts (consommé par routes/calls.ts) n\'a PAS de keyGenerator explicite → il hérite du keyGenerator GLOBAL (seau IP plateforme, piège documenté du projet : le rate limit par-route hérite du global sans keyGenerator explicite).\n' +
    '1. Lis rate-limit.ts, routes/calls.ts, et les configs qui font ça correctement (createPostRouteRateLimitConfig, createSoundRouteRateLimitConfig, createSignalProtocolRateLimitConfig) — réutilise EXACTEMENT le même pattern de keyGenerator (par utilisateur, repli IP) : single source of truth, extraire/réutiliser l\'existant plutôt que réimplémenter.\n' +
    '2. TDD obligatoire (règle projet) : écris D\'ABORD un test rouge qui prouve le comportement attendu (la config calls fournit une clé par utilisateur, pas le seau plateforme) — teste le COMPORTEMENT via l\'API publique, pas l\'implémentation ; puis le fix minimal ; puis vert.\n' +
    '3. Gates : bunx tsc --noEmit dans services/gateway ; suites ciblées rate-limit + calls.\n' +
    '4. Worktree isolé : branche fix/calls-rate-limit-keygenerator depuis origin/main, commit, push, PR détaillée (avant/après du comportement), merge admin si tout est vert.',
    { label: 'keygen-calls', phase: 'Actions', model: 'sonnet', isolation: 'worktree', schema: ACTION_SCHEMA }),
])

const all = results.filter(Boolean)

phase('Synthèse')
const summary = await agent(
  'Ajoute une section "## Suites du ' + date + ' (points 1-5)" à la FIN du fichier ' + mainRepo + '/tasks/maintenance-report-' + date + '.md (ne réécris pas le reste du fichier, ajoute seulement la section).\n' +
  'Données JSON des 5 tâches : ' + JSON.stringify(all) + '\n' +
  'Vérifie aussi : gh pr list --state open --limit 15 (PRs restantes) et gh run list --branch main --limit 5.\n' +
  'La section liste chaque tâche (statut, PRs touchées, détail court) puis un bloc "Restant".\n' +
  'Retourne un résumé de 8 lignes maximum.',
  { label: 'rapport-suites', phase: 'Synthèse', model: 'haiku', effort: 'low' }
)

return { results: all, summary }
