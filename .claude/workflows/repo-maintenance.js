export const meta = {
  name: 'repo-maintenance',
  description: 'Passe de maintenance: triage/merge Dependabot, fix Release, hygiène branches, rapport',
  whenToUse: 'Passe périodique quand la file Dependabot grossit, que Release est rouge ou que branches/worktrees s\'accumulent',
  phases: [
    { title: 'Triage', detail: 'classer les PRs Dependabot contre les pins documentés', model: 'haiku' },
    { title: 'Merge', detail: 'merger les PRs sûres, fermer les interdites, différer les majors', model: 'haiku' },
    { title: 'Fix Release', detail: 'diagnostiquer et corriger le job rouge du workflow Release', model: 'sonnet' },
    { title: 'Hygiène', detail: 'inventaire worktrees/branches + script de purge (non exécuté)', model: 'haiku' },
    { title: 'Synthèse', detail: 'rapport consolidé dans tasks/', model: 'haiku' },
  ],
}

let parsedArgs = args
if (typeof parsedArgs === 'string') {
  try { parsedArgs = JSON.parse(parsedArgs) } catch (e) { parsedArgs = {} }
}
parsedArgs = parsedArgs || {}
const date = parsedArgs.date || 'date-non-fournie'
const failedRunId = parsedArgs.failedRunId
const mainRepo = '/Users/smpceo/Documents/v2_meeshy'

const PR_ITEM = {
  type: 'object',
  required: ['number', 'reason'],
  properties: { number: { type: 'number' }, reason: { type: 'string' } },
}
const TRIAGE_SCHEMA = {
  type: 'object',
  required: ['merge', 'reject', 'defer'],
  properties: {
    merge: { type: 'array', items: PR_ITEM },
    reject: { type: 'array', items: PR_ITEM },
    defer: { type: 'array', items: PR_ITEM },
  },
}
const MERGE_SCHEMA = {
  type: 'object',
  required: ['merged', 'failed', 'closed', 'deferred'],
  properties: {
    merged: { type: 'array', items: { type: 'number' } },
    failed: { type: 'array', items: PR_ITEM },
    closed: { type: 'array', items: { type: 'number' } },
    deferred: { type: 'array', items: { type: 'number' } },
  },
}
const RELEASE_SCHEMA = {
  type: 'object',
  required: ['rootCause', 'fix', 'prNumber', 'branch', 'verification'],
  properties: {
    rootCause: { type: 'string' },
    fix: { type: 'string' },
    prNumber: { type: 'number' },
    branch: { type: 'string' },
    verification: { type: 'string' },
  },
}
const REVIEW_SCHEMA = {
  type: 'object',
  required: ['verdict', 'issues'],
  properties: {
    verdict: { type: 'string', enum: ['OK', 'CHANGES_NEEDED'] },
    issues: { type: 'array', items: { type: 'string' } },
  },
}
const HYGIENE_SCHEMA = {
  type: 'object',
  required: ['mergedRemoteCount', 'unmergedCount', 'worktrees', 'scriptPath', 'buildDirsRemoved'],
  properties: {
    mergedRemoteCount: { type: 'number' },
    unmergedCount: { type: 'number' },
    worktrees: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'branch', 'merged', 'locked'],
        properties: {
          path: { type: 'string' },
          branch: { type: 'string' },
          merged: { type: 'boolean' },
          locked: { type: 'boolean' },
        },
      },
    },
    scriptPath: { type: 'string' },
    buildDirsRemoved: { type: 'array', items: { type: 'string' } },
  },
}

phase('Triage')
const triage = await agent(
  'Dépôt Meeshy (cwd = worktree du repo, GitHub isopen-io/meeshy). Objectif : classifier TOUTES les PRs Dependabot ouvertes.\n' +
  '1. Exécute : gh pr list --state open --limit 40 --json number,title,headRefName — ne garde que les branches dependabot/*.\n' +
  '2. Lis les pins documentés dans services/translator/requirements.txt (les commentaires, ~lignes 1-70). Règle CRITIQUE documentée : tout bump protobuf vers 7.x doit être REJETÉ (grpcio-tools/grpcio-reflection 1.76.0 plafonnent protobuf <7.0.0 ; le commentaire dit explicitement de rejeter les PRs 7.x).\n' +
  '3. Règles de classement :\n' +
  '   - reject : bump interdit par un commentaire de pin documenté (protobuf 7.x aujourd\'hui) ; @types/node vers un major NE correspondant PAS au runtime Node 22 de la CI (ex. 20→26) va aussi en reject.\n' +
  '   - defer AUSSI, même si le bump est minor : grpcio, grpcio-tools, grpcio-reflection (translator) — leur pin 1.76.0 est DOCUMENTÉ (releases yanked sur PyPI + c\'est lui qui justifie le cap protobuf <7) ; tout bump de ce trio exige une passe dédiée qui revalide la résolution uv complète et le cap protobuf.\n' +
  '   - merge : bump patch ou minor (semver, d\'après le titre), y compris les groupes de dev-dependencies, sans interdiction documentée.\n' +
  '   - defer : tout bump MAJOR restant (ex. typescript 6→7, @fastify/rate-limit 10→11, web-vitals 5→6, actions/upload-artifact 5→7) → passe dédiée ultérieure avec gates (tsc, build, CI complète).\n' +
  'Retourne le JSON demandé, reason = 1 phrase par PR.',
  { label: 'triage-dependabot', phase: 'Triage', model: 'haiku', effort: 'low', schema: TRIAGE_SCHEMA }
)

if (!triage) log('Triage indisponible — phases Merge sautées')

phase('Merge')
const results = await parallel([
  () => triage && agent(
    'Dépôt Meeshy (isopen-io/meeshy). Tu exécutes le résultat d\'un triage de PRs Dependabot. Pratiques établies du projet : merger les PRs vertes en admin, fermer avec justification les bumps interdits, annuler les runs CI intermédiaires sur main sauf le dernier.\n\n' +
  'A MERGER (squash, une par une, dans l\'ordre) : ' + JSON.stringify(triage && triage.merge) + '\n' +
  'Pour chaque PR N :\n' +
  '1. gh pr view N --json mergeStateStatus,statusCheckRollup — si un check est en FAILURE, ne merge pas et note-la dans failed avec la raison. Si des checks sont encore en cours, passe à la suivante et refais une 2e passe à la fin ; après 2 passes toujours pending → failed avec raison "checks pending".\n' +
  '2. gh pr merge N --squash --admin. Si conflit / mergeStateStatus DIRTY → commente "@dependabot rebase" sur la PR et note-la dans failed.\n\n' +
  'A REJETER : ' + JSON.stringify(triage && triage.reject) + '\n' +
  'Pour chacune : poste d\'abord un commentaire expliquant le rejet en citant la source documentée (pour protobuf 7.x : le bloc de commentaires de services/translator/requirements.txt — "DO NOT bump protobuf to 7.x while grpcio-tools/grpcio-reflection are pinned to 1.76.0" ; pour @types/node : le runtime CI est Node 22). Puis poste le commentaire "@dependabot ignore this major version" (il ferme la PR et supprime les futures PRs de ce major).\n\n' +
  'DEFER (aucune action GitHub, juste les reporter) : ' + JSON.stringify(triage && triage.defer) + '\n\n' +
  'Après tous les merges : gh run list --branch main --status in_progress --json databaseId,name,createdAt — annule (gh run cancel) les runs du même workflow rendus obsolètes par un run plus récent, garde le plus récent de chaque workflow.\n' +
  'Retourne le JSON demandé.',
    { label: 'merge-dependabot', phase: 'Merge', model: 'haiku', schema: MERGE_SCHEMA }
  ),

  () => failedRunId && agent(
  'Dépôt Meeshy (isopen-io/meeshy). Le workflow GitHub "Release" (release.yml) est rouge depuis des semaines. Dernier échec : run ' + failedRunId + ', job "Build translator", checkout du tag de release :\n' +
  '- uv pip install -r requirements.txt échoue à COMPILER sentencepiece==0.1.97 depuis les sources (ld: libsentencepiece.a, collect2 exit 1, g++ échec). sentencepiece est tiré par espnet 202412 (cf. commentaire dans services/translator/requirements.txt vers la ligne 57).\n' +
  '- Le workflow env PLATFORMS=linux/amd64,linux/arm64 ; le workflow "Docker" (docker.yml) sur main est VERT pour le même service — compare précisément les deux workflows (plateformes, Dockerfile, build-args, cache) pour expliquer pourquoi seul Release casse.\n\n' +
  'Tâches :\n' +
  '1. Diagnostique la cause racine exacte. Piste probable : absence de wheel (aarch64 et/ou la version de Python de l\'image) pour sentencepiece 0.1.97 → build source qui échoue avec les toolchains récents. Vérifie sur PyPI (https://pypi.org/pypi/sentencepiece/json) quels wheels existent pour 0.1.97 et pour les versions plus récentes, et quelle contrainte exacte espnet==202412 impose sur sentencepiece (metadata PyPI d\'espnet ou son setup.py sur GitHub).\n' +
  '2. Regarde les 2-3 échecs Release précédents (gh run list --workflow=release.yml, puis gh run view <id> --log-failed) pour vérifier si la cause est identique ou s\'il y a plusieurs causes empilées — liste-les toutes dans le corps de la PR.\n' +
  '3. Implémente le fix MINIMAL sur main (services/translator/requirements.txt et/ou services/translator/Dockerfile et/ou .github/workflows/release.yml) : par exemple contrainte sentencepiece vers une version avec wheels pour les deux plateformes si espnet le permet, ou ajout des deps de build manquantes. NE TOUCHE PAS au pin protobuf (6.x, documenté). Mets à jour les commentaires de pins si tu changes une version.\n' +
  '4. Vérifie ce qui est vérifiable sans builder l\'image multi-arch complète : existence des wheels sur PyPI pour cp312/aarch64/x86_64, compatibilité des contraintes (résolution uv si disponible).\n' +
  '5. Tu es dans un worktree git isolé : pars de origin/main (git fetch origin main && git checkout -b fix/release-translator-sentencepiece origin/main), commite (message conventionnel en français, SANS trailer Co-Authored-By — règle projet), pousse la branche, ouvre une PR vers main avec le diagnostic complet.\n' +
  'Retourne le JSON demandé (verification = ce que tu as pu prouver et ce qui ne sera prouvé qu\'au prochain tag de release).',
    { label: 'fix-release-translator', phase: 'Fix Release', model: 'sonnet', isolation: 'worktree', schema: RELEASE_SCHEMA }
  ).then(fix => {
    if (!fix) return null
    return agent(
      'Revue adversariale de la PR #' + fix.prNumber + ' (fix du job "Build translator" du workflow Release, dépôt isopen-io/meeshy). Lis gh pr diff ' + fix.prNumber + ' et le diagnostic du corps de la PR. Cherche à la RÉFUTER :\n' +
      '1. La cause racine est-elle traitée pour linux/amd64 ET linux/arm64 (wheels réellement présents sur PyPI pour la version retenue et le Python de l\'image) ?\n' +
      '2. Un pin documenté de services/translator/requirements.txt est-il violé (protobuf doit rester 6.x) ? Les commentaires de pins sont-ils à jour ?\n' +
      '3. Le workflow Docker vert peut-il régresser à cause de ce diff ?\n' +
      'Si CHANGES_NEEDED : poste un commentaire précis sur la PR avec les problèmes. Retourne le JSON demandé.',
      { label: 'review-fix-release', phase: 'Fix Release', model: 'sonnet', effort: 'low', schema: REVIEW_SCHEMA }
    ).then(review => ({ ...fix, review }))
  }),

  () => agent(
  'Inventaire d\'hygiène du dépôt Meeshy (cwd = un worktree du repo). AUCUNE suppression de branche distante ni de worktree — tu génères un script, sauf le point 1 qui est à exécuter réellement.\n' +
  '1. Supprime les répertoires de build non suivis type apps/ios/.build-* dans le cwd (git status --short pour les repérer ; rm -rf ; ce sont des artefacts locaux, ~2 Go).\n' +
  '2. Worktrees : git worktree list ; pour chacun, indique si sa branche est entièrement mergée dans origin/main (git log origin/main..BRANCH vide) et s\'il est "locked" (session possiblement active — ne jamais proposer de le supprimer sans déverrouillage).\n' +
  '3. Branches distantes : compte les origin/claude/* et origin/dependabot/* entièrement mergées dans origin/main (git branch -r --merged origin/main) ; liste les branches NON mergées hors claude/dependabot (backup/, experiment/, feat/, fix/…).\n' +
  '4. Signale que origin/dev est ~513 commits derrière origin/main (décision utilisateur attendue : resynchroniser ou supprimer dev).\n' +
  '5. Écris ' + mainRepo + '/tasks/branch-purge-' + date + '.sh : script commenté, idempotent, qui exige CONFIRM=yes en variable d\'environnement pour agir, avec (a) suppression des branches distantes mergées par lots de 50 (git push origin --delete), (b) git worktree remove des worktrees mergés NON verrouillés, (c) en commentaire, les décisions restantes (branches non mergées à trier, sort de origin/dev).\n' +
  'Retourne le JSON demandé.',
    { label: 'hygiene-inventaire', phase: 'Hygiène', model: 'haiku', schema: HYGIENE_SCHEMA }
  ),
])

const [mergeRes, releaseRes, hygieneRes] = results

phase('Synthèse')
const summary = await agent(
  'Compile le rapport final de la passe de maintenance du ' + date + ' pour le dépôt Meeshy.\n' +
  'Données JSON des étapes :\n' +
  'DEPENDABOT_TRIAGE=' + JSON.stringify(triage) + '\n' +
  'DEPENDABOT_MERGE=' + JSON.stringify(mergeRes) + '\n' +
  'FIX_RELEASE=' + JSON.stringify(releaseRes) + '\n' +
  'HYGIENE=' + JSON.stringify(hygieneRes) + '\n' +
  'Vérifie aussi l\'état CI courant : gh run list --branch main --limit 6.\n' +
  'Écris ' + mainRepo + '/tasks/maintenance-report-' + date + '.md avec les sections : 1) CI & Release (cause racine, PR de fix, verdict de revue), 2) Dependabot (mergées / rejetées / différées et pourquoi), 3) Hygiène (worktrees, branches, script de purge à valider), 4) Décisions en attente côté utilisateur, 5) Suivi prod : vérifier que le gateway déployé compte désormais une impression PAR occurrence dans POST /posts/impressions/batch et accepte source "status" (cf. tasks/todo.md du 2026-07-31, section "Dépend du déploiement").\n' +
  'Retourne un résumé de 10 lignes maximum.',
  { label: 'rapport-final', phase: 'Synthèse', model: 'haiku', effort: 'low' }
)

return {
  dependabot: { triage, execution: mergeRes },
  release: releaseRes,
  hygiene: hygieneRes,
  summary,
}
