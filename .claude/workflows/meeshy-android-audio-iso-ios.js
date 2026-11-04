export const meta = {
  name: 'meeshy-android-audio-iso-ios',
  description:
    "Chantier #15462 « Android lit les vocaux comme iOS », de bout en bout et SANS S'ARRÊTER : lots du programme de parité (branches claude/android-<clé>) ordonnancés par ready.py --scope, cadrés contre l'arbre vivant, développés en TDD, relus et corrigés, audités s'ils sont sensibles, prouvés par workflow_dispatch d'android.yml (CI des PR gelée), fusionnés dans dev et clos avec leur preuve, en boucle jusqu'à ce que tout le périmètre soit fusionné ou bloqué après deux tentatives — opus cadre, relit, prouve et arbitre ; sonnet développe ; haiku fait le mécanique",
  whenToUse:
    "Reprise : l'état fait foi dans les issues de #15462 et le registre de dev — le workflow le relit seul (lots fusionnés sautés, branches du chantier reprises, PR ouvertes prouvées puis fusionnées) ; passer attribution = les lignes Co-Authored-By/Claude-Session de la session qui reprend, et rapprocher=false. Lancer, reprendre ou poursuivre le chantier audio Android (#15462) : lecture qui survit à la conversation et à l'app, enchaînement des non-écoutés, karaoké, forme d'onde, mini-lecteur, plein écran décoré avec Réagir, Répondre et Transférer. Args, tous optionnels : { run, scope, date, attribution, batch (2), maxFix (4), maxRounds (160), maxIdle (40), tentatives (2), rapprocher (true), pleinEcranSansBulle (false), sessionsPrecedentes ([]), parapluie (15462), outillage (15463), milestone (17), base ('dev'), brancheOutillage ('claude/youthful-mayer-an0qgn'), sensibles, lourds }.",
  phases: [
    { title: 'Préparer', detail: "répertoire d'exécution, PR de l'outillage, rouge préalable de dev, rapprochement des issues des lots déjà fusionnés", model: 'opus' },
    { title: 'Ordonnancer', detail: 'ready.py --scope : lots prêts, branches à reprendre, PR du périmètre restées ouvertes', model: 'haiku' },
    { title: 'Issue', detail: 'issue du lot (titre du plan), sous-issue du parapluie', model: 'haiku' },
    { title: 'Cadrer', detail: "chaque lot vérifié contre l'arbre VIVANT de dev et les références iOS : à faire ou déjà tenu, plan TDD exact", model: 'opus' },
    { title: 'Développer', detail: 'clone privé, branche réservée tôt, TDD, :core:model prouvé en local', model: 'sonnet' },
    { title: 'Relire', detail: 'opus relit tout le diff, corrige lui-même : compilation, critères, iso iOS, treize dimensions', model: 'opus' },
    { title: 'Auditer', detail: 'auditeur-adversarial sur les lots sensibles (cache, médias protégés, portillon de sortie)' },
    { title: 'Prouver', detail: "PR vers dev, workflow_dispatch d'android.yml au SHA de tête, rouge causé ⇒ correction, rouge préexistant ⇒ accepté et dit", model: 'opus' },
    { title: 'Livrer', detail: 'fusion au vert (titre par défaut : registre du programme), issue close avec preuve et dimensions', model: 'sonnet' },
    { title: 'Bilan', detail: 'commentaire du tour sur le parapluie, issue de recette sur appareil', model: 'haiku' },
  ],
}

// ---------------------------------------------------------------------------
// PARAMÈTRES
// ---------------------------------------------------------------------------
const A = args && typeof args === 'object' ? args : {}
const REPO = '/home/user/meeshy'
const REPO_GH = 'isopen-io/meeshy'
const RUN = typeof A.run === 'string' && A.run ? A.run.replace(/\/$/, '') : '/home/user/meeshy-audio-run'
const LOTS = `${RUN}/lots`
const NOTES = `${RUN}/notes`
const BASE = typeof A.base === 'string' && A.base ? A.base : 'dev'
const DATE = typeof A.date === 'string' && A.date ? A.date : '(lire la date avec date -I)'
const ATTR = typeof A.attribution === 'string' && A.attribution
  ? A.attribution
  : 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01EbRyWaS7aHE8U5jr55RNSY'
const SESSION_TRAILER = (ATTR.match(/Claude-Session: (\S+)/) || [])[1] || ''
const SESSIONS_CHANTIER = [...new Set([SESSION_TRAILER, 'https://claude.ai/code/session_01EbRyWaS7aHE8U5jr55RNSY',
  ...(Array.isArray(A.sessionsPrecedentes) ? A.sessionsPrecedentes : [])].filter(Boolean))]
const PLEIN_ECRAN_SANS_BULLE = A.pleinEcranSansBulle === true
const PARAPLUIE = Number.isInteger(A.parapluie) ? A.parapluie : 15462
const OUTILLAGE = Number.isInteger(A.outillage) ? A.outillage : 15463
const MILESTONE = Number.isInteger(A.milestone) ? A.milestone : 17
const BRANCHE_OUTILLAGE = typeof A.brancheOutillage === 'string' && A.brancheOutillage ? A.brancheOutillage : 'claude/youthful-mayer-an0qgn'
const BATCH = Number.isInteger(A.batch) && A.batch > 0 ? Math.min(A.batch, 4) : 2
const MAX_FIX = Number.isInteger(A.maxFix) && A.maxFix > 0 ? A.maxFix : 4
const MAX_ROUNDS = Number.isInteger(A.maxRounds) && A.maxRounds > 0 ? A.maxRounds : 160
const MAX_IDLE = Number.isInteger(A.maxIdle) && A.maxIdle > 0 ? A.maxIdle : 40
const TENTATIVES = Number.isInteger(A.tentatives) && A.tentatives > 0 ? A.tentatives : 2
const RAPPROCHER = A.rapprocher !== false

const SCOPE = Array.isArray(A.scope) && A.scope.length ? A.scope : [
  // 1-2 · la lecture survit à la conversation et à l'app
  'lecture-moteur-partage-carte-systeme-et-caches',
  // 1-3-5 · la bulle joue par le moteur partagé, forme d'onde réelle, vitesse
  'vocal-bulle-branchement-fil',
  // 3 · le suivant non écouté, dans l'ordre d'arrivée
  'vocal-file-du-fil-non-lus-et-arrivees',
  // 1 · le mini-lecteur pour mettre en pause ou revenir
  'mini-lecteur-audio-global',
  // 4 · segments, karaoké, déplier, plein écran
  'transcription-vocal-arrive-seule',
  'transcription-karaoke-dans-la-bulle',
  'vocal-langue-de-piste-et-traduction-a-la-demande',
  // 6 · plein écran
  'audio-plein-ecran-pager-et-transport',
  'audio-plein-ecran-portrait-decore-et-anneau',
  'audio-plein-ecran-actions-reagir-repondre-transferer',
  'audio-plein-ecran-paroles-langues-telechargement',
]
const SENSIBLES = new Set(Array.isArray(A.sensibles) ? A.sensibles : [
  'lecture-moteur-partage-carte-systeme-et-caches',
  'vocal-bulle-branchement-fil',
  'audio-plein-ecran-actions-reagir-repondre-transferer',
])
const LOURDS = new Set(Array.isArray(A.lourds) ? A.lourds : [
  'vocal-bulle-branchement-fil',
  'audio-plein-ecran-pager-et-transport',
  'transcription-karaoke-dans-la-bulle',
])
const MODELE = { mecanique: 'haiku', cadrer: 'opus', developper: 'sonnet', lourd: 'opus', relire: 'opus', prouver: 'opus', corriger: 'opus', livrer: 'sonnet' }
const branche = (key) => `claude/android-${key}`

// ---------------------------------------------------------------------------
// SOCLE COMMUN
// ---------------------------------------------------------------------------
const JVM_CHECK = `cd "$D/apps/android" && flock ${RUN}/jvm-check.lock ./meeshy.sh jvm-check -PjvmCheckModelOnly --no-daemon -q -Dorg.gradle.jvmargs=-Xmx4g -Pkotlin.compiler.execution.strategy=in-process`

const clone = (key, existante) => `D=${LOTS}/${key}
rm -rf "$D" && { git clone -q --shared --no-checkout ${REPO} "$D" || git clone -q --filter=blob:none --no-checkout https://github.com/${REPO_GH} "$D"; } && cd "$D" \\
  && git remote set-url origin https://github.com/${REPO_GH} \\
  && git sparse-checkout set --no-cone '/apps/android/' '/packages/shared/' '/packages/design-tokens/' '/packages/MeeshySDK/Sources/MeeshyUI/Theme/' '/.github/' '/scripts/ci/' '/services/gateway/route-manifest.json' '/apps/ios/**/*.xcstrings' '/packages/MeeshySDK/**/*.xcstrings' \\
  && git fetch -q origin ${BASE} \\
  && ${existante
    ? `{ git fetch -q origin ${branche(key)} && git checkout -q -B ${branche(key)} origin/${branche(key)} || git checkout -q -B ${branche(key)} origin/${BASE}; }`
    : `git checkout -q -B ${branche(key)} origin/${BASE}`}`

const socle = (key) => `
CHANTIER #${PARAPLUIE} (${REPO_GH}) — « Android lit les vocaux comme iOS ». Date : ${DATE}. Application NATIVE Kotlin apps/android
(Compose, Hilt, Media3). La référence de comportement, d'états, de gestes et de disposition est apps/ios + packages/MeeshySDK, lus
en LECTURE SEULE dans ${REPO}. Priorités du porteur : (1) quitter une conversation laisse le vocal jouer, avec un mini-lecteur ;
(2) quitter l'app laisse le vocal jouer ; (3) le suivant non écouté démarre seul, dans l'ordre d'arrivée ; (4) transcription par
segments, karaoké, déplier, plein écran ; (5) vraie forme d'onde mise en cache ; (6) plein écran comme iOS : portrait avec sa
décoration de profil au cœur de l'anneau de lecture, Réagir, Répondre sur place, Transférer (feuille de transfert).
${key ? `TON LOT : « ${key} » — spécification : python3 ${RUN}/lot.py - ${key} (but, critères, tests, fichiers, références iOS, dépendances).
Notes hors dépôt : ${NOTES}/${key}/ (spec.md, journaux, rapport.md).` : ''}
Conventions LIANTES du programme : ${RUN}/CONVENTIONS.md (placement des modules, UDF, cache d'abord, Prisme unique, jetons et accent passés
en paramètre, chaînes générées depuis les catalogues iOS, points d'extension Hilt et navigation, verrou du schéma Room, fichiers chauds).

FAITS DE CET ENVIRONNEMENT (mesurés le 2026-11-03) :
- Conteneur sans SDK Android (dl.google.com refusé). Le SEUL compilateur Android est la CI : .github/workflows/android.yml.
- La CI des PR est GELÉE (vars.PR_CI_GEL) : sur une PR, les jobs d'android.yml sont « skipped » — un skipped ne prouve RIEN.
  La preuve d'un lot est un workflow_dispatch d'android.yml sur SA branche, au SHA de tête, jobs verts.
- dev est rouge par moments sur « Android (assemble + unit tests) » : d'autres sessions le réparent (branches claude/android-fix-dev-tests*).
  N'y touche pas ; un TEST rouge identique sur dev est PRÉEXISTANT, une erreur de COMPILATION ne l'est jamais (rien n'est alors prouvé).
- :core:model se prouve en local, sans crypto ni e2ee (libsignal est refusé par le proxy) :
  ${JVM_CHECK}
  (5 à 15 min ; le verrou flock n'en laisse tourner qu'UN à la fois sur la machine — deux compilations parallèles ont fait redémarrer
  le conteneur. N'enlève jamais le flock, ne lance jamais ./gradlew en parallèle, et commit + push AVANT chaque jvm-check : un redémarrage
  efface tout ce qui n'est pas poussé).
- GitHub : outils MCP mcp__github__* pour TOUT (issues, PR, checks, actions, fusion), chargés par ToolSearch. La CLI gh ne sert QU'À la
  recherche (gh api -X GET search/issues -f q='repo:${REPO_GH} is:issue …'). GraphQL est refusé. Verdict des checks d'une PR : écris
  { state, head_sha, total_count, check_runs (toutes les pages de pull_request_read get_check_runs), statuses (get_status) } dans un
  fichier puis node ${REPO}/scripts/ci/pr-verte.mjs --rest <fichier> (0 vert, 1 rouge, 3 en cours, 2 lecture incomplète).
- Versions réelles : lis apps/android/gradle/libs.versions.toml (Kotlin, BOM Compose, Media3, Hilt, Room, Coil, lifecycle, navigation)
  et apps/android/app/build.gradle.kts (minSdk 26, compileSdk) — n'utilise AUCUNE API absente de ces versions ; jamais de signature de mémoire.

INTERDITS : écrire dans ${REPO} (il porte l'outillage ; tes clones vivent sous ${LOTS}) ; pousser sur ${BASE} ou main ; git push --force ;
git rebase d'une branche poussée ; git stash ; git worktree ; désactiver, @Ignore, affaiblir ou supprimer un témoin ; affaiblir une garde
(médias protégés jamais en cache disque ni transférables, purge de fin de session ADR-027, politique d'URL média, E2EE) ; toucher la
production ; écrire un secret ; fusionner une PR que ce lot n'a pas prouvée.

RÈGLES (CLAUDE.md, injecté) : TDD — témoin ROUGE constaté avant le code ; la décision dans une loi PURE de :core:model, l'écran mince ;
UNE source de vérité (cherche la loi jumelle avant d'en écrire une : beaucoup de lois audio existent déjà sous core/model/.../playback,
fullscreen, waveform, rootnav et sdk-core/.../playback, waveform) ; budget 1000-1200 lignes par fichier (un fichier > 1000 lignes ne
reçoit rien sans extraction — ChatViewModel.kt est à 1175) ; immuabilité ; cache d'abord, jamais de spinner sur un cache non vide ;
une lenteur est un BUG ; accent de la conversation passé en paramètre, jamais codé ; Prisme rangs 1 à 4, original sinon, jamais
translations.first ; treize dimensions — dis lesquelles le lot rend mûres.
COMMITS : français, le RÉSULTAT (feat(android/audio): …, fix(android/audio): …), Refs #<issue> aux étapes, et EXACTEMENT en fin de message :
${ATTR}
TON RENDU est du JSON validé, champs texte COURTS (résumé ≤ 2 500 caractères, chaque extrait de sortie ≤ 800, la fin utile) ; le
détail va dans ${NOTES}/<clé>/rapport.md, que tu cites.`

const COMPILE_SAFETY = `Garde de compilation (un rouge de CI coûte 15 à 40 min) :
- chaque symbole référencé existe (grep) ou tu le crées ; chaque import se résout ; APIs des versions RÉELLES de libs.versions.toml ;
- modificateurs de visibilité explicites dans les modules en explicitApi() ;
- interface, classe abstraite, constructeur de data class ou hiérarchie scellée modifiés ⇒ TOUTES les implémentations, doublures et
  appelants mis à jour, main ET test, dans TOUS les modules (grep ': Nom', 'Nom(', 'object : Nom') ;
- when exhaustif ; suspend seulement depuis une coroutine ; types Flow/StateFlow cohérents ;
- Hilt : constructeurs @Inject, liaisons dans un NOUVEAU fichier @Module du lot, jamais dans SdkModule.kt, NetworkModule.kt ou AppModule.kt ;
- ressources : chaque R.string / R.drawable existe dans le module ; chaînes nouvelles par le manifeste i18n du module (./apps/android/meeshy.sh i18n),
  sinon un strings_<clé>.xml par dossier de langue, jamais dans le fichier d'un autre lot ; le job « Chaînes Android générées à jour » rejoue --check ;
- tests au motif du module (JUnit4, Truth, Turbine, coroutines-test, Robolectric, MockK) ; doublures complètes.`

// ---------------------------------------------------------------------------
// SCHÉMAS
// ---------------------------------------------------------------------------
const PREP = { type: 'object', properties: {
  pret: { type: 'boolean' }, dev_head: { type: 'string' },
  rouge_prealable: { type: 'array', items: { type: 'string' }, description: 'tâches ou tests rouges de la dernière exécution terminée d android.yml sur dev' },
  pr_outillage: { type: 'integer' }, outillage_fusionne: { type: 'boolean' },
  issues_rapprochees: { type: 'array', items: { type: 'string' } }, rapport: { type: 'string' },
}, required: ['pret', 'dev_head', 'rouge_prealable', 'pr_outillage', 'outillage_fusionne', 'issues_rapprochees', 'rapport'] }

const SCHED = { type: 'object', properties: {
  ready: { type: 'array', items: { type: 'string' } }, remaining: { type: 'integer' }, waiting_on_deps: { type: 'integer' },
  claimed_unmerged: { type: 'array', items: { type: 'string' } }, rescued: { type: 'array', items: { type: 'string' } },
  scope_closure: { type: 'array', items: { type: 'string' } }, blocked: { type: 'array', items: { type: 'string' } },
  prs_a_reprendre: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, pr: { type: 'integer' } }, required: ['key', 'pr'] } },
  tenus_ailleurs: { type: 'array', items: { type: 'string' }, description: 'clés dont une PR ou une branche vivante d une AUTRE session tient le lot' },
}, required: ['ready', 'remaining', 'waiting_on_deps', 'claimed_unmerged', 'rescued', 'scope_closure', 'blocked', 'prs_a_reprendre', 'tenus_ailleurs'] }

const ISSUE = { type: 'object', properties: { issue: { type: 'integer' }, cree: { type: 'boolean' } }, required: ['issue', 'cree'] }

const CADRAGE = { type: 'object', properties: {
  decision: { type: 'string', enum: ['a-faire', 'deja-tenu', 'tenu-ailleurs'] }, preuve: { type: 'string' },
  plan: { type: 'string' }, fichiers: { type: 'array', items: { type: 'string' } },
  hors_budget: { type: 'array', items: { type: 'string' } }, risques: { type: 'array', items: { type: 'string' } },
}, required: ['decision', 'preuve', 'plan', 'fichiers', 'hors_budget', 'risques'] }

const IMPL = { type: 'object', properties: {
  status: { type: 'string', enum: ['pushed', 'skipped-claimed', 'failed'] }, head_sha: { type: 'string' },
  files_changed: { type: 'array', items: { type: 'string' } }, tests_added: { type: 'array', items: { type: 'string' } },
  red_observed: { type: 'string' }, jvm_check: { type: 'string', enum: ['pass', 'fail', 'not-run'] },
  criteria_met: { type: 'array', items: { type: 'string' } }, criteria_not_met: { type: 'array', items: { type: 'string' } },
  summary: { type: 'string' }, followups: { type: 'array', items: { type: 'string' } },
}, required: ['status', 'head_sha', 'files_changed', 'tests_added', 'red_observed', 'jvm_check', 'criteria_met', 'criteria_not_met', 'summary', 'followups'] }

const REVUE = { type: 'object', properties: {
  verdict: { type: 'string', enum: ['ok', 'corrige', 'bloque'] }, head_sha: { type: 'string' },
  fixes: { type: 'array', items: { type: 'string' } }, residual_risks: { type: 'array', items: { type: 'string' } },
  dimensions_mures: { type: 'array', items: { type: 'integer' } }, dimensions_non_mures: { type: 'array', items: { type: 'string' } },
  rapport: { type: 'string' },
}, required: ['verdict', 'head_sha', 'fixes', 'residual_risks', 'dimensions_mures', 'dimensions_non_mures', 'rapport'] }

const AUDIT = { type: 'object', properties: {
  verdict: { type: 'string', enum: ['aucun-bloquant', 'bloquants'] },
  blocking: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['title', 'evidence', 'fix'] } },
  non_blocking: { type: 'array', items: { type: 'string' } },
}, required: ['verdict', 'blocking', 'non_blocking'] }

const PR = { type: 'object', properties: { pr: { type: 'integer' } }, required: ['pr'] }

const PREUVE = { type: 'object', properties: {
  etat: { type: 'string', enum: ['vert', 'rouge-prealable', 'rouge', 'conflit', 'en-cours', 'erreur'] },
  head_sha: { type: 'string' }, run_id: { type: 'integer' }, run_url: { type: 'string' },
  jobs: { type: 'string', description: 'nom → conclusion, une ligne par job d android.yml' },
  echecs: { type: 'array', items: { type: 'string' }, description: 'erreurs de compilation fichier:ligne ou FQN des tests rouges' },
  prealables: { type: 'array', items: { type: 'string' }, description: 'échecs identiques au rouge de dev, avec l id du run de dev qui le prouve' },
  checks_pr: { type: 'string' }, detail: { type: 'string' },
}, required: ['etat', 'head_sha', 'run_id', 'run_url', 'jobs', 'echecs', 'prealables', 'checks_pr', 'detail'] }

const FIX = { type: 'object', properties: {
  pushed: { type: 'boolean' }, head_sha: { type: 'string' }, cause: { type: 'string' }, change: { type: 'string' },
}, required: ['pushed', 'head_sha', 'cause', 'change'] }

const LIVRAISON = { type: 'object', properties: {
  etat: { type: 'string', enum: ['fusionnee', 'non-fusionnee'] }, merge_sha: { type: 'string' },
  issue_close: { type: 'boolean' }, issues_ouvertes: { type: 'array', items: { type: 'integer' } }, rapport: { type: 'string' },
}, required: ['etat', 'merge_sha', 'issue_close', 'issues_ouvertes', 'rapport'] }

const BILAN = { type: 'object', properties: { commentaire: { type: 'string' }, recette_issue: { type: 'integer' }, resume: { type: 'string' } }, required: ['commentaire', 'recette_issue', 'resume'] }

const ATTENTE = { type: 'object', properties: { attendu_min: { type: 'integer' }, note: { type: 'string' } }, required: ['attendu_min', 'note'] }

// ---------------------------------------------------------------------------
// PROMPTS
// ---------------------------------------------------------------------------
const prepPrompt = () => `${socle(null)}
MISSION — PRÉPARER LE CHANTIER (mécanique et vérifications, aucune ligne de Kotlin).
1. Répertoire d'exécution : si ${RUN}/ready.py n'existe pas, cd ${REPO} && apps/android/scripts/parity/setup_run.sh ${RUN} ; sinon
   recopie l'outillage À JOUR depuis ${REPO} (cp apps/android/scripts/parity/{ready.py,lot.py,issue_body.py,pr_body.py} ${RUN}/ ;
   cp apps/android/docs/parite-ios/plan/*.json ${RUN}/plan/ en gardant F0a/F0b ; cp apps/android/docs/parite-ios/CONVENTIONS.md ${RUN}/).
   Crée ${RUN}/blocked.txt, ${RUN}/satisfied.txt et ${NOTES} s'ils manquent.${PLEIN_ECRAN_SANS_BULLE ? `
   DÉCISION DE REPRISE : le plein écran audio ne dépend plus de la bulle — python3 -c "import json;p='${RUN}/plan/D.json';L=json.load(open(p));[l.__setitem__('deps',[d for d in l['deps'] if d!='vocal-bulle-branchement-fil']) for l in L if l['key']=='audio-plein-ecran-pager-et-transport'];open(p,'w').write(json.dumps(L,ensure_ascii=False,indent=1))" (l'ouverture depuis la bulle reste câblée par le lot de la bulle).` : ''} N'active PAS ${RUN}/rescue-enabled (il reprendrait la
   branche fraîche d'une autre session) : la reprise passe par --rescue, décidée lot par lot.
2. Contrôle de l'outillage : cd ${REPO} && node scripts/ci/pr-verte.mjs --self-test ; python3 ${RUN}/ready.py audio --gen 2 --batch 1 --scope ${SCOPE.join(',')}
   doit rendre un JSON avec unknown vide. Un échec ⇒ pret=false et la sortie dans rapport.
3. PR de l'outillage : la branche ${BRANCHE_OUTILLAGE} porte l'outillage du chantier (workflow, pr-verte --rest, ready.py --scope,
   lots du plan D). Cherche une PR ouverte de cette tête vers ${BASE} (mcp__github__list_pull_requests head "isopen-io:${BRANCHE_OUTILLAGE}") ;
   sinon crée-la (titre : « Le chantier audio Android a son workflow autonome, et le vert d'une PR se juge sans GraphQL », corps :
   Closes #${OUTILLAGE}, Refs #${PARAPLUIE}, la liste des fichiers et la preuve du point 2, puis une ligne vide et
   « 🤖 Generated with [Claude Code](https://claude.com/claude-code) »). Elle ne touche aucun Kotlin compilé : la preuve est le point 2.
   Si elle est mergeable (pull_request_read get : mergeable_state ni dirty ni blocked) et qu'aucun check n'est rouge (pr-verte --rest ≠ 1),
   fusionne-la (mcp__github__merge_pull_request merge_method "merge") et ferme #${OUTILLAGE} avec un commentaire de preuve (finis tout corps
   de commentaire par une ligne vide, « --- » et « _Generated by [Claude Code](https://claude.ai/code)_ »). Sinon laisse-la ouverte et dis pourquoi.
4. Rouge préalable de ${BASE} : mcp__github__actions_list list_workflow_runs resource_id android.yml, branch ${BASE}, event push, status completed :
   prends la plus récente. Conclusion failure ⇒ mcp__github__get_job_logs run_id <id> failed_only true return_content true tail_lines 400 :
   relève les tâches Gradle rouges et les FQN des tests rouges (étape « Summarise failing tests »). Écris
   ${RUN}/rouge-prealable.json = { run_id, head_sha, conclusion, echecs: [...] } et rends echecs dans rouge_prealable.
5. ${RAPPROCHER ? '' : 'SAUTE CE POINT (déjà fait à un tour précédent) : rends issues_rapprochees vide. '}Rapprochement des issues de lots DÉJÀ fusionnés du programme audio qui sont restées ouvertes (les PR vers ${BASE} ne ferment pas les
   issues : seule la branche par défaut le fait) : #14519, #11823, #14899, #14746, #15088, #14947, #11645, #11835, #13393, #13680, #12109.
   Pour chacune : lis-la (mcp__github__issue_read), confronte son critère au code de origin/${BASE} (lecture seule dans ${REPO} après
   git fetch origin ${BASE} : git show origin/${BASE}:<chemin>, git grep <symbole> origin/${BASE}). Critère TENU ⇒ ferme-la avec la preuve
   (commit de fusion, fichier:ligne). Critère NON tenu mais repris par un lot du périmètre ⇒ commentaire « repris par le lot <clé> de #${PARAPLUIE} »,
   laisse-la ouverte. Une phrase par issue dans issues_rapprochees.
Rends dev_head (SHA court de origin/${BASE}), pr_outillage (0 si aucune), outillage_fusionne.`

const schedPrompt = (blocked, enVol, adoptes) => `${socle(null)}
MISSION — ORDONNANCER LE TOUR (mécanique).
1. python3 ${RUN}/ready.py audio --gen 2 --stale-hours 6 --batch ${BATCH} --scope ${SCOPE.join(',')}${blocked.length ? ` --exclude ${blocked.join(',')}` : ''}${enVol.length ? ` --inflight ${enVol.join(',')}` : ''}
   (sortie JSON : ready, remaining, waiting_on_deps, claimed_unmerged, claimed_without_pr, blocked, scope_closure).
2. Pour chaque clé de claimed_without_pr (branche poussée, aucune PR) : cd ${REPO} && git fetch -q origin ${branche('<clé>')} &&
   git log -1 --format='%ct%n%B' FETCH_HEAD. Elle est À REPRENDRE si un de ses 5 derniers commits porte une de ces lignes de session du
   chantier : ${SESSIONS_CHANTIER.join(' , ')}
   ou date de plus de 6 heures (date -u +%s) ; sinon une autre session la tient : tenus_ailleurs.
   S'il y en a à reprendre, relance la commande du point 1 en ajoutant --rescue <clés,séparées,par,virgules> et rends CETTE sortie, avec rescued.
3. Les lots ${enVol.length ? enVol.join(', ') : '(aucun)'} sont EN VOL dans ce chantier : ni à reprendre, ni tenus ailleurs.
4. PR ouvertes du périmètre : mcp__github__list_pull_requests owner isopen-io repo meeshy base ${BASE} state open perPage 100 (pages suivantes
   tant qu'une page est pleine). Garde celles dont head.ref = claude/android-<clé> avec <clé> dans scope_closure${adoptes.length ? `, hors PR déjà suivies : ${adoptes.join(', ')}` : ''}.
   Pour chacune, mcp__github__pull_request_read get_commits (dernier commit) : elle est À REPRENDRE (prs_a_reprendre) si son dernier commit
   porte une des lignes de session du chantier (${SESSIONS_CHANTIER.join(' , ')}) ou date de plus de 3 heures ; sinon tenus_ailleurs.
Rends les champs du JSON final, plus rescued, prs_a_reprendre, tenus_ailleurs.`

const issuePrompt = (key) => `${socle(key)}
MISSION — L'ISSUE DU LOT « ${key} » (mécanique).
1. python3 ${RUN}/lot.py - ${key} → lis plan_track et title. Puis python3 ${RUN}/issue_body.py <plan_track> ${key} ${PARAPLUIE} → JSON {title, body}.
2. Cherche une issue au titre IDENTIQUE : gh api -X GET search/issues -f q='repo:${REPO_GH} is:issue in:title "<title>"' --jq '.items[]|"\\(.number) \\(.state) \\(.title)"'.
   Titre identique trouvé (ouverte ou fermée) ⇒ rends son numéro, cree=false.
3. Sinon : ToolSearch "select:mcp__github__issue_write", puis issue_write method "create", owner isopen-io, repo meeshy, title et body TELS QUELS,
   labels ["android"], milestone ${MILESTONE}, parent_issue_number ${PARAPLUIE} (si le lien de parenté échoue, recrée sans lui). cree=true.`

const cadrerPrompt = (key, issue, histoire) => `${socle(key)}
MISSION — CADRER LE LOT contre l'arbre VIVANT (lecture seule). Issue #${issue}.${histoire ? `\nTENTATIVE PRÉCÉDENTE (bloquée) : ${histoire}\nTon plan doit lever cette cause, autrement.` : ''}
1. cd ${REPO} && git fetch -q origin ${BASE}. Lis la spécification (lot.py), l'issue, les références iOS du lot, et le code Android RÉEL qu'il touche
   (git show origin/${BASE}:<chemin>, git grep -n <symbole> origin/${BASE} -- apps/android). Les chemins du plan ont pu bouger : retrouve-les
   (git ls-tree -r --name-only origin/${BASE} | grep <nom>). Le relevé du 2026-11-03 est dans le corps de #${PARAPLUIE} : vérifie-le, ne le crois pas.
2. Décide : deja-tenu (CHAQUE critère est tenu sur origin/${BASE} : preuve fichier:ligne par critère), tenu-ailleurs (une PR ouverte ou une branche
   vivante de moins de 6 h d'une autre session écrit ces fichiers : gh api -X GET search/issues -f q='repo:${REPO_GH} is:pr is:open <mots>',
   git branch -r --sort=-committerdate | head -40 après git fetch), sinon a-faire.
3. a-faire : écris le PLAN dans ${NOTES}/${key}/spec.md puis résume-le dans plan : les lois pures de :core:model (noms, signatures,
   vecteurs de test dérivés d'iOS), les lois et composants DÉJÀ présents à réutiliser (cite-les), le câblage mince (fichiers exacts),
   les témoins dans l'ordre TDD, les extractions préalables pour tout fichier touché de plus de 1000 lignes (wc -l), les pièges de
   compilation (interfaces à doublures multiples, Hilt, ressources), et ce qui part À CÔTÉ (cache disque, métadonnées, contenu protégé).
   Un critère que le lot ne peut pas tenir sans un autre lot : dis-le dans risques.`

const devPrompt = (key, issue, cadrage, reprise) => `${socle(key)}
MISSION — DÉVELOPPER LE LOT, de bout en bout, sur sa branche ${branche(key)}. Issue #${issue}.
PLAN DU CADRAGE : ${JSON.stringify(cadrage).slice(0, 6000)}
${reprise ? `REPRISE : la branche existe déjà (tour interrompu ou tentative bloquée : ${reprise}). Reprends-la, lis ce qui est fait (git log origin/${BASE}..HEAD,
git diff origin/${BASE}...HEAD) contre la spécification, garde ce qui est juste, complète, et merge origin/${BASE} (jamais rebase).` : ''}
Clone privé (jamais ${REPO}) :
${clone(key, !!reprise)}
${reprise ? `puis git merge -q origin/${BASE} (conflit : garde la sémantique des deux côtés).` : `Avant d'écrire : git ls-remote origin refs/heads/${branche(key)} — si la branche existe et a une PR, une autre session tient le lot : status skipped-claimed.`}
1. Réserve le lot tôt : après le premier témoin rouge, commit puis git push -u origin ${branche(key)} (erreur réseau : 4 essais après 2, 4, 8, 16 s).
   Ensuite commit ET push après chaque étape (témoin rouge, loi verte, chaque fichier de câblage) : rien ne vit plus de 10 minutes en local.
2. TDD : témoins de la loi pure d'abord, ROUGE constaté (copie l'extrait dans red_observed), minimum pour le vert, refactor. Les lois de :core:model
   se prouvent par : ${JVM_CHECK} --tests '<FQN>' puis en entier avant de rendre.
   Câblage mince ensuite (Compose, Hilt, service), testé là où c'est possible (Robolectric, tests de module) — ces tests-là, seule la CI les jouera.
${COMPILE_SAFETY}
3. Touche les fichiers du plan plus le câblage additif minimal (protocole des fichiers partagés de CONVENTIONS.md). Un fichier > 1000 lignes : extrais d'abord.
4. Un critère impossible maintenant : livre ce qui est sûr derrière une couture inerte et liste le reste dans followups (il deviendra une issue).
Ne crée pas de PR. Ne supprime pas $D (le relecteur le réutilise).
Rends status, head_sha, files_changed, tests_added, red_observed, jvm_check, criteria_met / criteria_not_met (critère par critère), summary
(ce que l'utilisateur Android voit désormais, comme sur iOS), followups.`

const revuePrompt = (key, issue, impl) => `${socle(key)}
MISSION — REVUE-CORRECTION du lot (issue #${issue}). Rendu du développeur : ${JSON.stringify({ summary: impl.summary, files: impl.files_changed, tests: impl.tests_added, not_met: impl.criteria_not_met, jvm: impl.jvm_check }).slice(0, 3500)}
Clone : ${LOTS}/${key} sur ${branche(key)} ; s'il manque ou n'est pas sur la branche :
${clone(key, true)}
1. git fetch -q origin ${BASE} ; lis TOUT le diff : git diff origin/${BASE}...HEAD.
2. Compilation, ligne par ligne — la CI est le seul compilateur, fais que son PREMIER passage soit vert : symboles et imports non résolus
   (grep chaque référence nouvelle), signatures absentes des versions réelles, override manquant, when non exhaustif, visibilité explicitApi,
   nullabilité, suspend mal placé, graphe Hilt (chaque type injecté lié une seule fois), navigation, R manquants ou en double, doublures de
   test sans les membres nouveaux (grep dans TOUS les modules, src/test compris), constructeurs changés aux appelants périmés, Room.
${COMPILE_SAFETY}
3. Comportement : chaque critère de la spécification et les références iOS ; témoins de COMPORTEMENT (un rang autre que le premier pour le
   Prisme, aucun témoin affaibli) ; ce qui part À CÔTÉ (cache disque d'un média protégé, métadonnées de carte, transfert d'un contenu protégé) ;
   loi jumelle déjà existante ; budget de lignes ; fuites (lecteur non libéré, listener, scope, cache non borné) ; fil principal bloqué ;
   une recomposition par tic de progression hors de la bulle active.
4. Corrige toi-même, commits « fix(android/audio): revue — … » (Refs #${issue} puis les lignes d'attribution), push (sans force). :core:model touché
   ⇒ ${JVM_CHECK} vert.
Rends verdict (ok : rien à changer ; corrige : tu as poussé ; bloque : le lot ne peut pas compiler ou tenir son critère sans travail hors de son
périmètre — dis lequel), head_sha, fixes, residual_risks, dimensions_mures (numéros 1 à 13 de CLAUDE.md), dimensions_non_mures (« n — pourquoi »).`

const auditPrompt = (key, issue) => `${socle(key)}
MISSION — AUDIT ADVERSARIAL du lot (lecture seule), issue #${issue}. Diff : cd ${LOTS}/${key} && git fetch -q origin ${BASE} && git diff origin/${BASE}...HEAD
(si le clone manque : git fetch origin ${branche(key)} dans un dossier temporaire de ${NOTES}/${key}/). Cherche ce qui FUIT ou CASSE :
vocal protégé (éphémère, vue unique, flouté, chiffré) écrit sur disque, mis en cache, exposé dans la carte média ou l'écran verrouillé,
transférable ou enregistrable ; cache audio ou formes d'onde qui survivent à la déconnexion (ADR-027) ou franchissent la clôture de compte ;
jeton envoyé à un hôte tiers ; garde fail-open ; lecture qui démarre ou reprend pendant un appel ; test affaibli.
Chaque constat bloquant : fichier:ligne, scénario, correction.`

const corrigerAuditPrompt = (key, issue, audit) => `${socle(key)}
MISSION — CORRIGER LES CONSTATS BLOQUANTS DE L'AUDIT, en TDD (témoin qui reproduit, rouge, correctif), issue #${issue} :
${JSON.stringify(audit.blocking).slice(0, 5000)}
Clone : ${LOTS}/${key} (sinon : ${clone(key, true).split('\n').join(' ')}). Commits « fix(android/audio): audit — … », push sans force.
${COMPILE_SAFETY}
Rends verdict (corrige, ou bloque avec la cause), head_sha, fixes, residual_risks, dimensions_mures, dimensions_non_mures, rapport.`

const prPrompt = (key, issue, resume) => `${socle(key)}
MISSION — OUVRIR LA PR DU LOT (mécanique).
1. python3 ${RUN}/lot.py - ${key} → plan_track ; python3 ${RUN}/pr_body.py <plan_track> ${key} ${issue} "<résumé sans guillemets doubles>" → JSON {title, body}.
   Résumé à passer : ${JSON.stringify(String(resume || '').replace(/"/g, "'").slice(0, 1200))}
2. Ajoute au corps, avant la ligne « 🤖 Generated… » : « Refs #${PARAPLUIE} » et « Preuve : workflow_dispatch d'android.yml sur cette branche (la CI des PR est gelée) — lien posé en commentaire. »
   Remplace la ligne « https://claude.ai/code/session_… » du corps par « ${SESSION_TRAILER} ».
3. Une PR ouverte existe déjà pour la tête isopen-io:${branche(key)} (mcp__github__list_pull_requests head "isopen-io:${branche(key)}" state open) ⇒ rends son numéro.
   Sinon mcp__github__create_pull_request owner isopen-io repo meeshy base ${BASE} head ${branche(key)}, titre et corps ainsi composés.`

const prouverPrompt = (key, pr, issue) => `${socle(key)}
MISSION — PROUVER LA PR #${pr} (lot « ${key} », branche ${branche(key)}, issue #${issue}) par android.yml en workflow_dispatch. Tu ne modifies aucun code
de production (seul un merge de ${BASE} est permis), tu ne fusionnes pas.
0. ToolSearch "select:mcp__github__pull_request_read,mcp__github__actions_list,mcp__github__actions_get,mcp__github__actions_run_trigger,mcp__github__get_job_logs".
1. pull_request_read get #${pr} : state, mergeable_state, head.sha. Fermée ⇒ etat erreur. mergeable_state dirty ⇒ etat conflit (rends-le, n'essaie pas).
   behind (en retard sur ${BASE}) ⇒ dans ${LOTS}/${key} (sinon recrée le clone : ${clone(key, true).split('\n').join(' ')}) : git fetch -q origin ${BASE} &&
   git merge -q origin/${BASE} && git push origin ${branche(key)} ; conflit ⇒ git merge --abort et etat conflit. Relis head.sha après le push.
2. Exécution d'android.yml pour CE SHA : actions_list list_workflow_runs resource_id android.yml, branch ${branche(key)}, event workflow_dispatch.
   Aucune exécution NON annulée dont head_sha = SHA de tête ⇒ actions_run_trigger method run_workflow workflow_id android.yml ref ${branche(key)} ;
   attends 60 s (sleep 60 en Bash) et relis la liste jusqu'à la voir (5 essais).
3. Attends sa fin, au plus 55 minutes : relis actions_get get_workflow_run toutes les 4 minutes (sleep 240 en Bash ; si l'outil refuse
   un sleep, charge Monitor par ToolSearch et attends avec une boucle until). Toujours en cours à l'échéance ⇒ etat en-cours (le script repassera).
4. Terminée : actions_list list_workflow_jobs <run_id> → une ligne « nom → conclusion » par job dans jobs. Tous success (ou skipped hors
   « Android (assemble + unit tests) ») ⇒ etat vert. Un job « cancelled » sans autre échec (une exécution plus récente l'a remplacée) ⇒ etat en-cours.
5. Rouge : get_job_logs run_id <id> failed_only true return_content true tail_lines 500. Relève les erreurs de compilation (« e: file:///…/X.kt:L:C … »)
   et les tests rouges (étape « Summarise failing tests ») dans echecs. Puis le rouge de ${BASE} À CETTE HEURE : dernière exécution terminée
   d'android.yml sur ${BASE} (event push), et la précédente ; leurs tests rouges (get_job_logs failed_only). Un échec du lot est PRÉALABLE s'il
   est identique (même tâche, même FQN de test, même message) dans l'une de ces deux exécutions de ${BASE}.
   Une erreur de COMPILATION n'est JAMAIS préalable : quand assembleDebug échoue, les modules du lot n'ont pas tous été compilés ni testés,
   donc RIEN n'est prouvé. Si l'erreur est hors des fichiers du lot et identique sur ${BASE} (${BASE} ne compile pas), rends etat en-cours avec
   detail « ${BASE} ne compile pas : <erreur> » — le script repassera, et tu merges alors ${BASE} dans la branche (point 1) pour relancer quand
   ${BASE} compile. Sinon c'est etat rouge. Les tests rouges ne peuvent être préalables que si assembleDebug est VERT.
   Tous les échecs préalables ⇒ etat rouge-prealable (prealables : « FQN — run <id> de ${BASE} ») ; sinon rouge.
6. Checks de la PR : écris le fichier de charge (voir FAITS) et node ${REPO}/scripts/ci/pr-verte.mjs --rest <fichier> → checks_pr (sortie tronquée).
   Un check rouge de la PR hors android.yml (skipped ne compte pas) ⇒ dis-le dans detail ; s'il vient du lot, etat rouge.
7. Poste sur la PR UN commentaire (mcp__github__add_issue_comment issue_number ${pr}) : SHA, lien du run, jobs, échecs et préalables,
   terminé par une ligne vide, « --- » et « _Generated by [Claude Code](https://claude.ai/code)_ ».`

const corrigerPrompt = (key, pr, issue, preuve, essai) => `${socle(key)}
MISSION — RENDRE LA PR #${pr} VERTE (lot « ${key} », issue #${issue}), essai ${essai}/${MAX_FIX}. État prouvé : ${JSON.stringify(preuve).slice(0, 4000)}
Clone de la branche : ${LOTS}/${key} (sinon : ${clone(key, true).split('\n').join(' ')}) ; git fetch -q origin ${BASE} ${branche(key)} ;
si origin/${branche(key)} a bougé depuis ${preuve.head_sha || '?'} et contient la correction d'un autre, ne double pas : rends pushed=false, cause « déjà corrigé ».
- conflit : git merge origin/${BASE} (jamais rebase), résous selon CONVENTIONS.md (fichiers d'enregistrement : garde les deux blocs ;
  strings générées : régénère par ./apps/android/meeshy.sh i18n ; collision de version Room : renumérote avec migration et JSON de schéma).
- rouge : la CAUSE RACINE de chaque échec du lot (lis les fichiers cités, la version réelle de l'API dans libs.versions.toml). Jamais @Ignore,
  jamais un témoin affaibli ou supprimé. Un test du lot qui révèle un vrai défaut ⇒ corrige le code, pas le test.
${COMPILE_SAFETY}
:core:model touché ⇒ ${JVM_CHECK} vert. Commit « fix(android/audio): … » (Refs #${issue} puis les lignes d'attribution), git push origin ${branche(key)} sans force.
Rends pushed, head_sha, cause, change.`

const livrerPrompt = (key, pr, issue, etat) => `${socle(key)}
MISSION — LIVRER LA PR #${pr} (lot « ${key} », issue #${issue}). État : ${JSON.stringify(etat).slice(0, 5000)}
1. pull_request_read get #${pr} : si head.sha ≠ ${etat.preuve.head_sha}, la preuve ne vaut plus : rends etat non-fusionnee (le script reprouvera).
2. mcp__github__merge_pull_request owner isopen-io repo meeshy pullNumber ${pr} merge_method "merge" expectedHeadSha ${etat.preuve.head_sha}
   SANS commit_title ni commit_message (le titre par défaut « Merge pull request #${pr} from isopen-io/${branche(key)} » est le registre du programme).
   Refus pour conflit ⇒ etat non-fusionnee. Succès ⇒ merge_sha.
3. Ferme l'issue #${issue} (issue_write update state closed state_reason completed) avec un commentaire de clôture : PR, SHA de fusion,
   preuve (lien du run android.yml, jobs${etat.preuve.etat === 'rouge-prealable' ? ', et les échecs PRÉALABLES de dev avec leur run' : ''}),
   critères tenus / non tenus, dimensions mûres ${JSON.stringify((etat.revue && etat.revue.dimensions_mures) || [])} et non mûres
   ${JSON.stringify((etat.revue && etat.revue.dimensions_non_mures) || [])}, ce qui reste à rejouer sur appareil réel.
4. Une issue par dimension non mûre et par followup qui n'a pas déjà la sienne (cherche d'abord : gh api -X GET search/issues) :
   titre SÉMANTIQUE (le résultat attendu), labels ["android"], milestone ${MILESTONE}, parent_issue_number ${PARAPLUIE}. Followups : ${JSON.stringify((etat.impl && etat.impl.followups) || []).slice(0, 2000)}
5. rm -rf ${LOTS}/${key}.
Tout corps de commentaire ou d'issue finit par une ligne vide, « --- » et « _Generated by [Claude Code](https://claude.ai/code)_ ».`

const satisfaitPrompt = (key, issue, cadrage) => `${socle(key)}
MISSION — CONSIGNER UN LOT DÉJÀ TENU (mécanique). Le cadrage prouve que chaque critère est tenu sur origin/${BASE} : ${JSON.stringify({ preuve: cadrage.preuve }).slice(0, 3000)}
1. grep -qx '${key}' ${RUN}/satisfied.txt || echo '${key}' >> ${RUN}/satisfied.txt
2. Ferme l'issue #${issue} (state closed, completed) avec un commentaire : « tenu sur ${BASE} sans branche de lot » et la preuve critère par critère,
   terminé par une ligne vide, « --- » et « _Generated by [Claude Code](https://claude.ai/code)_ ». Rends {"issue": ${issue}, "cree": false}.`

const bloquerPrompt = (key, issue, cause, final) => `${socle(key)}
MISSION — CONSIGNER UN BLOCAGE (mécanique). Lot « ${key} », issue #${issue}. Cause : ${String(cause).slice(0, 3000)}
${final ? `Blocage DÉFINITIF après ${TENTATIVES} tentatives : grep -qx '${key}' ${RUN}/blocked.txt || echo '${key}' >> ${RUN}/blocked.txt` : `Blocage de la tentative courante : une nouvelle tentative suivra, plus tard dans le chantier.`}
Commente l'issue #${issue} : la cause exacte, la branche ${branche(key)} (gardée sur origin), ce qu'il faut pour lever le blocage${final ? ', et que le lot attend une session humaine ou un autre lot' : ''} ;
termine par une ligne vide, « --- » et « _Generated by [Claude Code](https://claude.ai/code)_ ». Rends {"issue": ${issue}, "cree": false}.`

const attentePrompt = (minutes, raison) => `Attends ${minutes} minutes, puis rends {"attendu_min": ${minutes}, "note": "…"}. Raison : ${raison}.
Attends par tranches : sleep 240 en Bash, répété ; si l'outil refuse un sleep au premier plan, charge Monitor par ToolSearch et attends avec
une boucle until bornée (until [ $(date +%s) -ge <échéance> ]; do sleep 30; done). Ne fais rien d'autre.`

const bilanPrompt = (etat) => `${socle(null)}
MISSION — BILAN DU CHANTIER (mécanique). État : ${JSON.stringify(etat).slice(0, 12000)}
1. Poste UN commentaire sur #${PARAPLUIE} (mcp__github__add_issue_comment) : tableau lot → issue → PR → état (fusionné / bloqué / en attente) → preuve
   (run android.yml) → dimensions mûres ; puis ce qui reste, dans l'ordre ; puis les blocages avec leur cause et leur issue ; puis la dette
   ouverte en chemin. Termine par une ligne vide, « --- » et « _Generated by [Claude Code](https://claude.ai/code)_ ».
2. Recette sur appareil : cherche une issue ouverte au titre « Les vocaux Android se recettent sur un S8 et un Pixel : lecture hors conversation et
   hors app, enchaînement, karaoké, mini-lecteur, plein écran » (gh api -X GET search/issues) ; sinon crée-la (labels ["android"], milestone ${MILESTONE},
   parent_issue_number ${PARAPLUIE}) avec, pour chacune des six priorités, le scénario à rejouer (gestes, attendu, mesures : dumpsys media_session,
   dumpsys gfxinfo framestats pendant le défilement, dumpsys meminfo après sortie du plein écran) et les lots qui la portent.
3. Si TOUS les lots du périmètre sont fusionnés, dis-le en tête du commentaire ; laisse #${PARAPLUIE} OUVERTE (la recette sur appareil reste).
Rends commentaire (URL), recette_issue, resume.`

// ---------------------------------------------------------------------------
// UN LOT, DE BOUT EN BOUT — retourne { key, issue, resultat, cause }
// ---------------------------------------------------------------------------
const tentatives = {}
const historique = {}
const journal = []

const prouverEtLivrer = async (key, issue, pr, contexte) => {
  let essai = 0
  let attentes = 0
  for (;;) {
    const preuve = await agent(prouverPrompt(key, pr, issue), { label: `prouver:${key}#${essai + attentes}`, phase: 'Prouver', schema: PREUVE, model: MODELE.prouver, effort: 'medium' })
    if (!preuve) return { resultat: 'bloque', cause: 'la preuve n a rien rendu' }
    log(`${key} · PR #${pr} @ ${(preuve.head_sha || '').slice(0, 10)} : ${preuve.etat}${preuve.echecs.length ? ` (${preuve.echecs.slice(0, 3).join(' ; ').slice(0, 200)})` : ''}`)
    if (preuve.etat === 'vert' || preuve.etat === 'rouge-prealable') {
      const livraison = await agent(livrerPrompt(key, pr, issue, { ...contexte, preuve }), { label: `livrer:${key}`, phase: 'Livrer', schema: LIVRAISON, model: MODELE.livrer, effort: 'medium' })
      if (livraison && livraison.etat === 'fusionnee') return { resultat: 'fusionne', pr, preuve, livraison }
      attentes++
      if (attentes > 8) return { resultat: 'bloque', cause: `fusion refusée : ${livraison ? livraison.rapport : 'aucun rendu'}`, pr }
      continue
    }
    if (preuve.etat === 'en-cours') {
      attentes++
      if (attentes > 12) return { resultat: 'bloque', cause: 'android.yml n a pas abouti en 12 attentes', pr }
      continue
    }
    if (preuve.etat === 'erreur') return { resultat: 'bloque', cause: `PR en erreur : ${preuve.detail}`, pr }
    essai++
    if (essai > MAX_FIX) return { resultat: 'bloque', cause: `${preuve.etat} après ${MAX_FIX} corrections : ${preuve.echecs.join(' ; ').slice(0, 1500)}`, pr }
    const fix = await agent(corrigerPrompt(key, pr, issue, preuve, essai), { label: `corriger:${key}#${essai}`, phase: 'Prouver', schema: FIX, model: MODELE.corriger, effort: 'high' })
    if (fix) log(`${key} · correction ${essai} : ${fix.pushed ? 'poussée' : 'rien poussé'} — ${String(fix.cause).slice(0, 160)}`)
  }
}

const traiterLot = async (key, reprise) => {
  tentatives[key] = (tentatives[key] || 0) + 1
  const n = tentatives[key]
  const iss = await agent(issuePrompt(key), { label: `issue:${key}`, phase: 'Issue', schema: ISSUE, model: MODELE.mecanique, effort: 'low' })
  if (!iss || !iss.issue) return { key, resultat: 'bloque', cause: 'aucune issue' }
  const issue = iss.issue

  const cadrage = await agent(cadrerPrompt(key, issue, historique[key]), { label: `cadrer:${key}#${n}`, phase: 'Cadrer', schema: CADRAGE, model: MODELE.cadrer, effort: 'high' })
  if (!cadrage) return { key, issue, resultat: 'bloque', cause: 'cadrage sans rendu' }
  if (cadrage.decision === 'deja-tenu') {
    await agent(satisfaitPrompt(key, issue, cadrage), { label: `tenu:${key}`, phase: 'Livrer', schema: ISSUE, model: MODELE.mecanique, effort: 'low' })
    return { key, issue, resultat: 'tenu', cause: cadrage.preuve }
  }
  if (cadrage.decision === 'tenu-ailleurs') return { key, issue, resultat: 'ailleurs', cause: cadrage.preuve }

  const lourd = LOURDS.has(key) || n > 1
  const impl = await agent(devPrompt(key, issue, cadrage, reprise || (n > 1 ? historique[key] : '')), { label: `developper:${key}#${n}`, phase: 'Développer', schema: IMPL, model: lourd ? MODELE.lourd : MODELE.developper, effort: 'high' })
  if (!impl || impl.status === 'failed') return { key, issue, resultat: 'bloque', cause: `développement : ${impl ? impl.summary : 'aucun rendu'}` }
  if (impl.status === 'skipped-claimed') return { key, issue, resultat: 'ailleurs', cause: 'branche et PR d une autre session' }

  let revue = await agent(revuePrompt(key, issue, impl), { label: `relire:${key}#${n}`, phase: 'Relire', schema: REVUE, model: MODELE.relire, effort: 'high' })
  if (!revue) return { key, issue, resultat: 'bloque', cause: 'revue sans rendu' }
  if (revue.verdict === 'bloque') return { key, issue, resultat: 'bloque', cause: `revue : ${revue.rapport}` }

  if (SENSIBLES.has(key)) {
    const audit = await agent(auditPrompt(key, issue), { label: `auditer:${key}#${n}`, phase: 'Auditer', schema: AUDIT, agentType: 'auditeur-adversarial' })
    if (audit && audit.blocking.length) {
      const corr = await agent(corrigerAuditPrompt(key, issue, audit), { label: `corriger-audit:${key}#${n}`, phase: 'Auditer', schema: REVUE, model: MODELE.corriger, effort: 'high' })
      if (!corr || corr.verdict === 'bloque') return { key, issue, resultat: 'bloque', cause: `audit : ${audit.blocking.map((b) => b.title).join(' ; ')}` }
      revue = { ...revue, fixes: [...revue.fixes, ...corr.fixes], head_sha: corr.head_sha }
    }
  }

  const pr = await agent(prPrompt(key, issue, impl.summary), { label: `pr:${key}`, phase: 'Prouver', schema: PR, model: MODELE.mecanique, effort: 'low' })
  if (!pr || !pr.pr) return { key, issue, resultat: 'bloque', cause: 'PR non ouverte' }
  const fin = await prouverEtLivrer(key, issue, pr.pr, { impl, revue })
  return { key, issue, ...fin }
}

const reprendrePr = async (key, pr) => {
  const iss = await agent(issuePrompt(key), { label: `issue:${key}`, phase: 'Issue', schema: ISSUE, model: MODELE.mecanique, effort: 'low' })
  const issue = (iss && iss.issue) || 0
  const fin = await prouverEtLivrer(key, issue, pr, { impl: null, revue: null })
  return { key, issue, ...fin }
}

// ---------------------------------------------------------------------------
// 1. PRÉPARER
// ---------------------------------------------------------------------------
phase('Préparer')
const prep = await agent(prepPrompt(), { label: 'preparer', phase: 'Préparer', schema: PREP, model: MODELE.cadrer, effort: 'medium' })
if (!prep || !prep.pret) {
  log(`ARRÊT — préparation impossible : ${prep ? prep.rapport.slice(0, 400) : 'aucun rendu'}`)
  return { arret: 'preparation', prep }
}
log(`${BASE} à ${prep.dev_head} — rouge préalable : ${prep.rouge_prealable.length} — PR d'outillage #${prep.pr_outillage}${prep.outillage_fusionne ? ' fusionnée' : ' ouverte'}`)

// ---------------------------------------------------------------------------
// 2. LA BOUCLE — un pool de BATCH lots : dès qu'un lot finit, l'ordonnanceur est rejoué.
//    Elle ne s'arrête que si tout le périmètre est fusionné, ou si tout ce qui reste attend un lot
//    définitivement bloqué (après TENTATIVES tentatives complètes).
// ---------------------------------------------------------------------------
const bloquesDefinitifs = new Set()
const enPause = new Map()
const prsSuivies = new Set()
const aRetenter = []
const enCours = new Map()
let idle = 0
let tour = 0
let dernier = null
let complet = false

const lancer = (t) => {
  const run = async () => {
    try {
      return t.type === 'pr' ? await reprendrePr(t.key, t.pr) : await traiterLot(t.key, t.reprise)
    } catch (e) {
      return { key: t.key, resultat: 'bloque', cause: `exception : ${String(e && e.message ? e.message : e).slice(0, 400)}` }
    }
  }
  enCours.set(t.key, run().then((r) => ({ ...r, key: t.key })))
}

const ailleurs = {}
const consigner = async (resultat) => {
  let r = resultat
  journal.push({ tour, key: r.key, issue: r.issue, pr: r.pr, resultat: r.resultat, cause: r.cause ? String(r.cause).slice(0, 600) : undefined,
    preuve: r.preuve ? { etat: r.preuve.etat, run_url: r.preuve.run_url, head_sha: r.preuve.head_sha } : undefined,
    merge_sha: r.livraison ? r.livraison.merge_sha : undefined })
  if (r.resultat === 'fusionne') { log(`${r.key} : FUSIONNÉ (PR #${r.pr}, ${r.preuve.etat})`); return }
  if (r.resultat === 'tenu') { log(`${r.key} : déjà tenu sur ${BASE}, consigné`); return }
  if (r.resultat === 'ailleurs') {
    ailleurs[r.key] = (ailleurs[r.key] || 0) + 1
    if (ailleurs[r.key] <= 4) { enPause.set(r.key, tour + 3); log(`${r.key} : tenu par une autre session (${ailleurs[r.key]}/4) — revu plus tard`); return }
    r = { ...r, resultat: 'bloque', cause: `tenu par une autre session à 4 relevés : ${String(r.cause).slice(0, 600)}` }
    tentatives[r.key] = TENTATIVES
  }
  historique[r.key] = `${historique[r.key] ? `${historique[r.key]} | ` : ''}tentative ${tentatives[r.key] || 1} : ${String(r.cause).slice(0, 800)}`
  const final = (tentatives[r.key] || 1) >= TENTATIVES
  await agent(bloquerPrompt(r.key, r.issue || 0, r.cause, final), { label: `bloquer:${r.key}`, phase: 'Livrer', schema: ISSUE, model: MODELE.mecanique, effort: 'low' })
  if (final) { bloquesDefinitifs.add(r.key); log(`${r.key} : BLOQUÉ définitivement — ${String(r.cause).slice(0, 200)}`) }
  else { aRetenter.push(r.key); log(`${r.key} : bloqué (tentative ${tentatives[r.key] || 1}) — nouvelle tentative, avec opus, reprise de sa branche`) }
}

while (tour < MAX_ROUNDS) {
  tour++
  if (enCours.size < BATCH) {
    const enVolIci = [...enCours.keys()]
    const exclus = [...bloquesDefinitifs, ...aRetenter, ...enVolIci, ...[...enPause.entries()].filter(([, t]) => t >= tour).map(([k]) => k)]
    const sched = await agent(schedPrompt(exclus, enVolIci, [...prsSuivies]), { label: `ordonnancer#${tour}`, phase: 'Ordonnancer', schema: SCHED, model: MODELE.mecanique, effort: 'low' })
    if (sched) {
      dernier = sched
      if (sched.remaining === 0 && !enCours.size) { complet = true; log(`TOUT LE PÉRIMÈTRE EST FUSIONNÉ (${sched.scope_closure.length} lots)`); break }
      const places = BATCH - enCours.size
      const travaux = [
        ...aRetenter.splice(0, places).map((key) => ({ type: 'lot', key, reprise: historique[key] || 'tentative précédente bloquée' })),
        ...sched.prs_a_reprendre.filter((p) => !prsSuivies.has(p.pr) && !enCours.has(p.key)).map((p) => ({ type: 'pr', key: p.key, pr: p.pr })),
        ...sched.ready.filter((k) => !enCours.has(k)).map((key) => ({ type: 'lot', key, reprise: sched.rescued.includes(key) ? 'branche poussée sans PR (tour interrompu)' : '' })),
      ].filter((t, i, all) => all.findIndex((x) => x.key === t.key) === i).slice(0, places)
      travaux.filter((t) => t.type === 'pr').forEach((t) => { prsSuivies.add(t.pr); tentatives[t.key] = (tentatives[t.key] || 0) + 1 })
      if (travaux.length) {
        idle = 0
        log(`tour ${tour} : lance ${travaux.map((t) => t.type === 'pr' ? `${t.key} (PR #${t.pr} reprise)` : `${t.key}${t.reprise ? ' (reprise)' : ''}`).join(', ')} — ${sched.remaining} restants, ${enCours.size} déjà en vol`)
        travaux.forEach(lancer)
      } else if (!enCours.size) {
        const bloquesIci = sched.scope_closure.filter((k) => bloquesDefinitifs.has(k)).length
        const attentes = [...enPause.values()].filter((t) => t >= tour).length
        const ailleurs = sched.claimed_unmerged.length + sched.tenus_ailleurs.length
        if (bloquesIci && !attentes && !ailleurs && !aRetenter.length && sched.waiting_on_deps >= sched.remaining - bloquesIci) {
          log(`plus rien ne peut avancer : il reste ${sched.remaining} lots, bloqués (${[...bloquesDefinitifs].join(', ')}) ou en attente d'un lot bloqué`)
          break
        }
        idle++
        log(`tour ${tour} : rien de prêt (${sched.waiting_on_deps} en attente de dépendances ; ailleurs : ${[...sched.claimed_unmerged, ...sched.tenus_ailleurs].join(', ') || '—'} ; en pause : ${attentes}) — attente ${idle}/${MAX_IDLE}`)
        if (idle >= MAX_IDLE) break
        await agent(attentePrompt(15, 'des lots du périmètre sont tenus ailleurs ou attendent une fusion'), { label: `attendre#${tour}`, phase: 'Ordonnancer', schema: ATTENTE, model: MODELE.mecanique, effort: 'low' })
        continue
      }
    } else if (!enCours.size) {
      idle++
      log(`tour ${tour} : ordonnancement sans rendu — attente ${idle}/${MAX_IDLE}`)
      if (idle >= MAX_IDLE) break
      continue
    }
  }
  if (!enCours.size) continue
  const fini = await Promise.race([...enCours.values()])
  enCours.delete(fini.key)
  await consigner(fini)
}

if (enCours.size) {
  log(`fin de boucle : ${enCours.size} lots encore en vol, attendus avant le bilan`)
  for (const r of await Promise.all([...enCours.values()])) await consigner(r)
}
if (!complet && tour >= MAX_ROUNDS) log(`plafond de ${MAX_ROUNDS} tours atteint — relancer le workflow le poursuit là où il s'est arrêté`)
if (!complet && idle >= MAX_IDLE) log(`${MAX_IDLE} attentes sans travail — relancer le workflow le poursuit là où il s'est arrêté`)

// ---------------------------------------------------------------------------
// 3. BILAN
// ---------------------------------------------------------------------------
phase('Bilan')
const bilan = await agent(bilanPrompt({ prep: { dev_head: prep.dev_head, rouge_prealable: prep.rouge_prealable, pr_outillage: prep.pr_outillage }, tours: tour, dernier_ordonnancement: dernier && { remaining: dernier.remaining, scope_closure: dernier.scope_closure, claimed_unmerged: dernier.claimed_unmerged, tenus_ailleurs: dernier.tenus_ailleurs }, bloques: [...bloquesDefinitifs], historique, journal }),
  { label: 'bilan', phase: 'Bilan', schema: BILAN, model: MODELE.mecanique, effort: 'low' })

return { tours: tour, restant: dernier ? dernier.remaining : null, bloques: [...bloquesDefinitifs], journal, bilan }
