export const meta = {
  name: 'meeshy-liste-iso-ios',
  description:
    "Chantier #15537 de bout en bout, sans s'arrêter, sur iOS et Android : la pastille dit qui écrit et mène à la conversation, l'aperçu montre l'auteur et le détail des pièces jointes, l'avatar de ligne ouvre profil ou détails, le rail de stories reste en haut au défilement. Cartographie features × plateformes, registre des lots (plan de parité + compléments iOS, Android, partagés), puis deux voies en parallèle : DÉVELOPPEMENT (issue, cadrage contre dev vivant, TDD, revue-correction, audit des lots sensibles, PR) et GUICHET CI (resynchronisation sur dev, preuve par workflow_dispatch, corrections, fusion au vert, clôture avec preuve) — opus cadre, relit et corrige ; sonnet développe et prouve ; haiku fait le mécanique",
  whenToUse:
    "Lancer ou reprendre le chantier « liste iso iOS » (#15537, milestone #232) depuis n'importe quelle session. Args (objet ou chaîne JSON) : { attribution (OBLIGATOIRE : les lignes Co-Authored-By et Claude-Session de la session qui lance), date, sessionsPrecedentes [« Claude-Session: … » des sessions qui ont déjà poussé des branches du chantier ; défaut : celle du 2026-11-03], run ('/home/user/meeshy-quatre-run'), recartographier (false), devPar (1), maxFix (4), tentatives (2), maxIdle (36), maxResync (3), guichetMax (4), sauter [clés], seulement [clés], base ('dev'), brancheOutillage (branche dont la PR d'outillage est à fusionner ; défaut aucune), aVerifier [{ key, platform, pr, issue }] }.",
  phases: [
    { title: 'Préparer', detail: "répertoire d'exécution, registre, PR de l'outillage, restauration du registre depuis #15537", model: 'sonnet' },
    { title: 'Cartographier', detail: 'une feature à la fois : chaque clause confrontée à iOS et Android sur dev vivant, lots manquants', model: 'opus' },
    { title: 'Consolider', detail: 'déduplication, dépendances, couverture clause par clause, registre persisté dans #15537', model: 'opus' },
    { title: 'Ordonnancer', detail: 'registre.py status : prêt, attente, tenu ailleurs, chevauchement, PR à reprendre', model: 'haiku' },
    { title: 'Issue', detail: 'issue du lot (plan : issue_body.py ; cartographie : spec), milestone #232', model: 'haiku' },
    { title: 'Cadrer', detail: "lot vérifié contre l'arbre vivant de dev et les références iOS : à faire, déjà tenu ou tenu ailleurs", model: 'opus' },
    { title: 'Développer', detail: 'clone privé depuis origin/dev, branche réservée tôt, TDD, gates locales', model: 'sonnet' },
    { title: 'Relire', detail: 'opus relit tout le diff resynchronisé sur dev et corrige lui-même', model: 'opus' },
    { title: 'Auditer', detail: 'auditeur-adversarial sur les lots sensibles (pièces protégées, présence, navigation)' },
    { title: 'Prouver', detail: 'guichet CI : merge de dev, workflow_dispatch des CI concernées au SHA de tête, verdict', model: 'sonnet' },
    { title: 'Corriger', detail: 'cause racine des rouges du lot et des conflits avec dev', model: 'opus' },
    { title: 'Livrer', detail: 'dérive de dev contrôlée, fusion au vert, issue close avec preuve et dimensions', model: 'sonnet' },
    { title: 'Bilan', detail: 'commentaire de #15537, recette sur appareil, dette web', model: 'sonnet' },
  ],
}

// ---------------------------------------------------------------------------
// PARAMÈTRES
// ---------------------------------------------------------------------------
const lireArgs = (brut) => {
  if (brut && typeof brut === 'object') return brut
  if (typeof brut === 'string' && brut.trim().startsWith('{')) {
    try { return JSON.parse(brut) } catch (e) { return {} }
  }
  return {}
}
const A = lireArgs(args)
const REPO = '/home/user/meeshy'
const GH = 'isopen-io/meeshy'
const RUN = typeof A.run === 'string' && A.run ? A.run.replace(/\/$/, '') : '/home/user/meeshy-quatre-run'
const LOTS = `${RUN}/lots`
const NOTES = `${RUN}/notes`
const BASE = typeof A.base === 'string' && A.base ? A.base : 'dev'
const DATE = typeof A.date === 'string' && A.date ? A.date : '(lis la date avec date -I)'
const ATTR = typeof A.attribution === 'string' && /Claude-Session: \S+/.test(A.attribution) ? A.attribution.trim() : ''
const TRAILER = (ATTR.match(/Claude-Session: \S+/) || [''])[0]
const SESSIONS_PRECEDENTES = Array.isArray(A.sessionsPrecedentes) ? A.sessionsPrecedentes
  : ['Claude-Session: https://claude.ai/code/session_01EbRyWdY9YqethRbp6RRuTh']
const SIGNATURES = [TRAILER, ...SESSIONS_PRECEDENTES.filter((t) => typeof t === 'string' && t.startsWith('Claude-Session: ') && t !== TRAILER)].filter(Boolean)
const SIG_ARG = SIGNATURES.join('|')
const SESSION_URL = (ATTR.match(/Claude-Session: (\S+)/) || [])[1] || ''
const CHANTIER = 15537
const OUTILLAGE = 15538
const MILESTONE = 232
const BRANCHE_OUTILLAGE = typeof A.brancheOutillage === 'string' ? A.brancheOutillage : ''
const INSTANTANE = '.claude/workflows/meeshy-liste-iso-ios.registre.json'
const EPOPEES = { F0a: 11590, F0b: 11590, A: 11591, B: 11592, C: 11593, D: 11594, E: 11595 }
const DEV_PAR = Number.isInteger(A.devPar) && A.devPar > 0 ? Math.min(A.devPar, 3) : 1
const MAX_FIX = Number.isInteger(A.maxFix) && A.maxFix > 0 ? A.maxFix : 4
const TENTATIVES = Number.isInteger(A.tentatives) && A.tentatives > 0 ? A.tentatives : 2
const MAX_IDLE = Number.isInteger(A.maxIdle) && A.maxIdle > 0 ? A.maxIdle : 36
const MAX_RESYNC = Number.isInteger(A.maxResync) && A.maxResync >= 0 ? A.maxResync : 3
const MAX_ATTENTES = 16
const GUICHET_MAX = Number.isInteger(A.guichetMax) && A.guichetMax > 0 ? A.guichetMax : 4
const SAUTER = new Set(Array.isArray(A.sauter) ? A.sauter : [])
const SEULEMENT = Array.isArray(A.seulement) && A.seulement.length ? new Set(A.seulement) : null
const MODELE = { mecanique: 'haiku', carto: 'opus', cadrer: 'opus', developper: 'sonnet', lourd: 'opus', relire: 'opus', prouver: 'sonnet', corriger: 'opus', livrer: 'sonnet', bilan: 'sonnet' }
const MARQUEUR = '<!-- registre-liste-iso-ios -->'
const REG = `python3 ${RUN}/registre.py`
const branche = (plateforme, cle) => `claude/${plateforme}-${cle}`

// ---------------------------------------------------------------------------
// SOCLE COMMUN
// ---------------------------------------------------------------------------
const JVM_CHECK = `cd "$D/apps/android" && ./meeshy.sh jvm-check -PjvmCheckModelOnly --no-daemon -q -Dorg.gradle.jvmargs=-Xmx6g -Pkotlin.compiler.execution.strategy=in-process`

const SPARSE = {
  android: `'/apps/android/' '/packages/shared/' '/packages/design-tokens/' '/packages/MeeshySDK/Sources/MeeshyUI/Theme/' '/.github/' '/scripts/' '/services/gateway/route-manifest.json' '/apps/ios/**/*.xcstrings' '/packages/MeeshySDK/**/*.xcstrings'`,
  ios: `'/apps/ios/' '/packages/MeeshySDK/' '/packages/shared/' '/packages/design-tokens/' '/apps/android/' '/.github/' '/scripts/'`,
}

const clone = (cle, plateforme, existante) => {
  const b = branche(plateforme, cle)
  const checkout = SPARSE[plateforme]
    ? `git sparse-checkout set --no-cone ${SPARSE[plateforme]}`
    : 'git sparse-checkout disable'
  return `D=${LOTS}/${cle}
rm -rf "$D" && { git clone -q --shared --no-checkout ${REPO} "$D" || git clone -q --filter=blob:none --no-checkout https://github.com/${GH} "$D"; } && cd "$D" \\
  && git remote set-url origin https://github.com/${GH} && ${checkout} \\
  && git fetch -q origin ${BASE} \\
  && ${existante
    ? `{ git fetch -q origin ${b} && git checkout -q -B ${b} origin/${b} || git checkout -q -B ${b} origin/${BASE}; }`
    : `git checkout -q -B ${b} origin/${BASE}`}`
}

const GATES = {
  android: `GATES ANDROID (D = ${LOTS}/<clé>, ton clone) — conteneur SANS SDK Android (dl.google.com refusé) : le seul compilateur complet est la CI android.yml.
- :core:model se prouve en local, sans crypto ni e2ee : ${JVM_CHECK} [--tests '<FQN>'] (5 à 15 min ; jamais deux à la fois sur la
  machine : si pgrep -f jvm-check répond, attends qu'il finisse).
- chaînes : les strings Android sont GÉNÉRÉES depuis les catalogues iOS (.xcstrings) par ./apps/android/meeshy.sh i18n ;
  python3 apps/android/scripts/i18n/xcstrings_to_android.py --check doit passer (job « Chaînes Android générées à jour »).
- versions réelles : apps/android/gradle/libs.versions.toml et app/build.gradle.kts (minSdk 26) — aucune API de mémoire.`,
  ios: `GATES iOS — ni Xcode ni swift ici : la seule compilation est la CI (ios.yml, sdk-tests.yml) prouvée par le guichet.
- gardes qui tournent sous Linux, toutes vertes avant de pousser : bash apps/ios/scripts/check_cohesion_budget.sh ;
  bash scripts/check-law-literals.sh ; bash scripts/check-swift-viewbuilder.sh ; node scripts/check-accent-color-hardcoding.mjs.
- un .swift neuf sous apps/ios/Meeshy est inclus par xcodegen (globbing de project.yml) : n'édite JAMAIS le pbxproj à la main.
- un .xcstrings touché ⇒ ./apps/android/meeshy.sh i18n (les chaînes Android en sont générées) puis
  python3 apps/android/scripts/i18n/xcstrings_to_android.py --check, et le commit porte les deux.
- écris les témoins XCTest (apps/ios/MeeshyTests) ou Swift Testing (packages/MeeshySDK/Tests) d'abord ; liste dans suites_ios
  les classes de test à jouer (les tiennes + celles qui exercent les types modifiés : grep -l <Type> apps/ios/MeeshyTests packages/MeeshySDK/Tests).`,
  partage: `GATES PARTAGÉ (packages/shared, et ses consommateurs) :
- bun install --ignore-scripts à la racine du clone (le postinstall grpc-tools échoue derrière le proxy, ce n'est pas un dépôt cassé) ;
  cd packages/shared && npx prisma generate --generator client && bun run build && bun run type-check && bun test <fichiers>.
- consommateurs : cd services/gateway && bunx tsc --noEmit && bun run test -- <fichiers liés> ; cd apps/web && bun run type-check
  && bun test <fichiers liés> (le web CONSOMME @meeshy/shared : une signature changée le casse).
- vecteurs packages/shared/fixtures/** : les miroirs Swift (sdk-tests.yml) et Kotlin (android.yml) les rejouent ; un vecteur neuf ou
  changé ⇒ les DEUX miroirs restent verts ou le lot qui les met à jour en dépend (dis-le).`,
  serveur: `GATES SERVEUR (services/gateway + packages/shared) :
- bun install --ignore-scripts ; cd packages/shared && npx prisma generate --generator client && bun run build ;
  cd services/gateway && bunx tsc --noEmit && bun run test -- <fichiers du périmètre>, puis bun run test:coverage | tail -30 avant la PR.
- RÉTROCOMPATIBLE (#9223) : un champ s'AJOUTE, rien ne se retire ni ne se renomme ; un ancien client reste servi.`,
}

const COMPILE_SAFETY = {
  android: `Garde de compilation Kotlin (un rouge de CI coûte 15 à 40 min) : chaque symbole et import existe (grep) ; APIs des versions réelles ;
visibilité explicite en explicitApi() ; interface, data class ou hiérarchie scellée changées ⇒ TOUTES les implémentations, doublures
et appelants, main ET test, dans TOUS les modules ; when exhaustif ; suspend depuis une coroutine ; Hilt : liaisons dans un NOUVEAU
@Module du lot (jamais SdkModule.kt, NetworkModule.kt, AppModule.kt) ; chaque R.string / R.drawable existe ; tests au motif du module.`,
  ios: `Garde de compilation Swift : chaque type et membre référencé existe (grep sur origin/${BASE}) ; switch exhaustif ; frontières de
cible (MeeshySDK ne voit pas MeeshyUI ni l'app ; un type utilisé hors de son module est public) ; isolation (@MainActor par défaut
de l'app, nonisolated pour les lois pures, Sendable) ; protocole changé ⇒ toutes les conformances et les Mock*, main ET tests ;
init de ViewModel par injection avec .shared par défaut ; aucun @ObservedObject de singleton dans une vue feuille ; chaînes dans
les .xcstrings ; budgets de cohésion (fonction ≤ 80 lignes, type ≤ 1500).`,
  ts: `Garde TypeScript : strict, aucun any, aucune assertion sans justification ; types dérivés des schémas Zod ; exports de
packages/shared/utils/index.ts tenus ; appelants du web et de la passerelle mis à jour.`,
}

const garde = (p) => (p === 'android' ? COMPILE_SAFETY.android : p === 'ios' ? COMPILE_SAFETY.ios : COMPILE_SAFETY.ts)
const portee = (p) => (p === 'partage' ? 'shared' : p === 'serveur' ? 'gateway' : p)

const socle = (cle, plateforme) => `
CHANTIER #${CHANTIER} (${GH}, milestone #${MILESTONE}) — date : ${DATE}. Demande du porteur, quatre features sur ANDROID natif
(apps/android, iso iOS) et iOS (compléments) : la graine ${RUN}/graine.json porte la demande verbatim et les clauses de chaque feature.
La référence de comportement, d'états, de gestes et de disposition est apps/ios + packages/MeeshySDK.
${cle ? `TON LOT : « ${cle} » (plateforme ${plateforme}, branche ${branche(plateforme, cle)}) — spécification complète : ${REG} spec ${RUN} ${cle}
(plan de parité ou cartographie, critères ajoutés par la cartographie, dépendances). Notes hors dépôt : ${NOTES}/${cle}/ (spec.md, rapport.md).` : ''}
${plateforme === 'android' || !plateforme ? `Conventions LIANTES Android : ${RUN}/CONVENTIONS.md (modules, UDF, cache d'abord, Prisme unique, accent en paramètre, chaînes générées, Hilt, fichiers chauds).` : ''}

SYNCHRONISATION AVEC ${BASE} (exigence du porteur) : tout part de origin/${BASE} FRAIS (git fetch juste avant) ; une branche se met à jour par
git merge origin/${BASE} (JAMAIS rebase ni force) avant la revue, avant chaque preuve et quand ${BASE} a touché ses fichiers ; d'autres
sessions fusionnent dans ${BASE} toutes les quelques minutes, donc relis l'état de ${BASE} au lieu de le supposer.

FAITS DE L'ENVIRONNEMENT (mesurés le 2026-11-03) :
- La CI des PR est GELÉE (vars.PR_CI_GEL) : sur une PR, les jobs d'android.yml, ios.yml, sdk-tests.yml et ci.yml sont « skipped » — un
  skipped ne prouve RIEN. Une preuve est un workflow_dispatch sur la branche du lot, au SHA de tête. ios.yml et sdk-tests.yml prennent
  l'entrée only_testing (classes de test séparées par des virgules).
- GitHub : outils MCP mcp__github__* pour tout (issues, PR, checks, actions, fusion), chargés par ToolSearch. La CLI gh ne sert QU'À la
  recherche (gh api -X GET search/issues -f q='repo:${GH} …'). GraphQL refusé (pas de champs Projects v2).
  Verdict des checks d'une PR : écris { state, head_sha, total_count, check_runs (toutes les pages de pull_request_read get_check_runs),
  statuses (get_status) } dans un fichier puis node ${REPO}/scripts/ci/pr-verte.mjs --rest <fichier> (0 vert, 1 rouge, 3 en cours, 2 incomplet).
- D'autres sessions Android sont ACTIVES sur le programme de parité (branches claude/android-*). Une branche vivante d'une autre session
  qui écrit tes fichiers ⇒ tu cèdes (CLAUDE.md, #5243) : statut tenu-ailleurs, jamais de doublon ni de fusion en avance.
- Une PR vers ${BASE} ferme ses issues « Closes #n » (${BASE} est la branche par défaut) ; vérifie et ferme toi-même sinon.
- Une PR ouverte et prête peut être fusionnée par un tiers AVANT sa preuve (mesuré le 2026-11-04 : #15700 fusionnée pendant que ses
  CI tournaient). Une PR de ce chantier reste donc en BROUILLON (draft) tant qu'elle n'est pas prouvée ; seul l'agent de livraison
  la passe prête, juste avant de la fusionner.

INTERDITS : écrire dans ${REPO} (lecture seule ; tes clones vivent sous ${LOTS}) ; pousser sur ${BASE} ou main ; git push --force ; rebase
d'une branche poussée ; git stash ; git worktree ; désactiver, affaiblir ou supprimer un témoin ; affaiblir une garde (pièce ou message
protégés — éphémère, vue unique, flouté, chiffré — dont AUCUN détail ne sort : ni texte, ni poids, ni dimensions, ni durée, ni nom ;
présence réservée aux amis acceptés, #13928 ; E2EE fail-closed) ; toucher la production ; écrire un secret ; fusionner ce qui n'est pas prouvé.

RÈGLES (CLAUDE.md, injecté) : TDD — témoin ROUGE constaté avant le code ; la décision dans une loi PURE (Android :core:model,
iOS type nonisolated ou SDK, partagé packages/shared/utils), l'écran mince ; UNE source de vérité (cherche la loi jumelle avant d'en
écrire une) ; budget 1000-1200 lignes par fichier (au-delà, extrais d'abord) ; immuabilité ; cache d'abord ; une lenteur est un BUG ;
accent de conversation passé en paramètre ; Prisme rang par rang, jamais translations.first ; treize dimensions — dis lesquelles le lot rend mûres.
COMMITS : français, le RÉSULTAT (feat(${plateforme ? portee(plateforme) : '<portée>'}/liste): …, fix(…): …), Refs #<issue>, et EXACTEMENT en fin de message :
${ATTR}
TON RENDU est du JSON validé, champs texte COURTS (résumé ≤ 2 500 caractères, extraits de sortie ≤ 800, la fin utile) ; le détail
va dans ${NOTES}/<clé>/rapport.md, que tu cites.`

// ---------------------------------------------------------------------------
// SCHÉMAS
// ---------------------------------------------------------------------------
const PREP = { type: 'object', properties: {
  pret: { type: 'boolean' }, dev_head: { type: 'string' }, registre_restaure: { type: 'boolean' },
  pr_outillage: { type: 'integer' }, outillage_fusionne: { type: 'boolean' }, rapport: { type: 'string' },
}, required: ['pret', 'dev_head', 'registre_restaure', 'pr_outillage', 'outillage_fusionne', 'rapport'] }

const LOT_CARTO = { type: 'object', properties: {
  key: { type: 'string', description: 'kebab-case, 3 à 57 caractères, sans préfixe de plateforme' },
  platform: { type: 'string', enum: ['android', 'ios', 'partage', 'serveur'] },
  title: { type: 'string', description: 'titre SÉMANTIQUE : le résultat que l utilisateur voit' },
  goal: { type: 'string' }, acceptance: { type: 'array', items: { type: 'string' } }, tests: { type: 'array', items: { type: 'string' } },
  files: { type: 'array', items: { type: 'string' } }, ios_reference_files: { type: 'array', items: { type: 'string' } },
  deps: { type: 'array', items: { type: 'string' }, description: 'clés de lots du registre (plan ou cartographie)' },
  sensible: { type: 'boolean' }, lourd: { type: 'boolean' }, features: { type: 'array', items: { type: 'string' } },
}, required: ['key', 'platform', 'title', 'goal', 'acceptance', 'tests', 'files', 'ios_reference_files', 'deps', 'sensible', 'lourd', 'features'] }

const CLAUSE = { type: 'object', properties: {
  clause: { type: 'string' }, verdict: { type: 'string', enum: ['tenu', 'partiel', 'absent'] },
  preuve: { type: 'string', description: 'fichier:ligne sur origin/dev, ou critère du lot du plan qui la porte' },
  porte_par: { type: 'array', items: { type: 'string' }, description: 'clés de lots qui la tiendront' },
}, required: ['clause', 'verdict', 'preuve', 'porte_par'] }

const CARTO = { type: 'object', properties: {
  feature: { type: 'string' },
  ios: { type: 'array', items: CLAUSE }, android: { type: 'array', items: CLAUSE },
  lots: { type: 'array', items: LOT_CARTO },
  criteres_ajoutes: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, criteres: { type: 'array', items: { type: 'string' } } }, required: ['key', 'criteres'] } },
  deps_extra: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, dep: { type: 'string' } }, required: ['key', 'dep'] } },
  plan_cibles: { type: 'array', items: { type: 'string' }, description: 'lots du plan à AJOUTER au périmètre' },
  exclusions: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, motif: { type: 'string' } }, required: ['key', 'motif'] } },
  dette_web: { type: 'string' }, rapport: { type: 'string' },
}, required: ['feature', 'ios', 'android', 'lots', 'criteres_ajoutes', 'deps_extra', 'plan_cibles', 'exclusions', 'dette_web', 'rapport'] }

const CONSO = { type: 'object', properties: {
  lots_ajoutes: { type: 'array', items: { type: 'string' } }, exclus: { type: 'array', items: { type: 'string' } },
  couverture: { type: 'array', items: { type: 'object', properties: { feature: { type: 'string' }, clause: { type: 'string' }, ios: { type: 'string' }, android: { type: 'string' } }, required: ['feature', 'clause', 'ios', 'android'] } },
  manques: { type: 'array', items: { type: 'string' } }, dette_web: { type: 'array', items: { type: 'string' } },
  commentaire: { type: 'string' }, rapport: { type: 'string' },
}, required: ['lots_ajoutes', 'exclus', 'couverture', 'manques', 'dette_web', 'commentaire', 'rapport'] }

const LOT_ETAT = { type: 'object', properties: {
  key: { type: 'string' }, etat: { type: 'string' }, platform: { type: 'string' }, branch: { type: 'string' },
  issue: { type: 'integer' }, pr: { type: 'integer' }, reprise: { type: 'boolean' }, nous: { type: 'boolean' },
  sensible: { type: 'boolean' }, lourd: { type: 'boolean' }, deps_manquantes: { type: 'array', items: { type: 'string' } },
}, required: ['key', 'etat', 'platform', 'branch', 'issue', 'pr', 'reprise', 'nous', 'sensible', 'lourd', 'deps_manquantes'] }

const STATUT = { type: 'object', properties: {
  dev: { type: 'string' }, pret: { type: 'array', items: { type: 'string' } }, attente: { type: 'array', items: { type: 'string' } },
  chevauchement: { type: 'array', items: { type: 'string' } }, tenu_ailleurs: { type: 'array', items: { type: 'string' } },
  pr_nous: { type: 'array', items: { type: 'string' } }, pr_a_reprendre: { type: 'array', items: { type: 'string' } },
  bloque: { type: 'array', items: { type: 'string' } }, fusionne: { type: 'array', items: { type: 'string' } },
  restants: { type: 'integer' }, lots: { type: 'array', items: LOT_ETAT },
}, required: ['dev', 'pret', 'attente', 'chevauchement', 'tenu_ailleurs', 'pr_nous', 'pr_a_reprendre', 'bloque', 'fusionne', 'restants', 'lots'] }

const ISSUE = { type: 'object', properties: { issue: { type: 'integer' }, cree: { type: 'boolean' } }, required: ['issue', 'cree'] }

const CADRAGE = { type: 'object', properties: {
  decision: { type: 'string', enum: ['a-faire', 'deja-tenu', 'tenu-ailleurs'] }, preuve: { type: 'string' },
  plan: { type: 'string' }, fichiers: { type: 'array', items: { type: 'string' } },
  hors_budget: { type: 'array', items: { type: 'string' } }, risques: { type: 'array', items: { type: 'string' } },
}, required: ['decision', 'preuve', 'plan', 'fichiers', 'hors_budget', 'risques'] }

const IMPL = { type: 'object', properties: {
  status: { type: 'string', enum: ['pushed', 'skipped-claimed', 'failed'] }, head_sha: { type: 'string' },
  files_changed: { type: 'array', items: { type: 'string' } }, tests_added: { type: 'array', items: { type: 'string' } },
  suites_ios: { type: 'array', items: { type: 'string' }, description: 'classes de test à passer en only_testing (ios.yml / sdk-tests.yml)' },
  red_observed: { type: 'string' }, gates_locales: { type: 'string' },
  criteria_met: { type: 'array', items: { type: 'string' } }, criteria_not_met: { type: 'array', items: { type: 'string' } },
  summary: { type: 'string' }, followups: { type: 'array', items: { type: 'string' } },
}, required: ['status', 'head_sha', 'files_changed', 'tests_added', 'suites_ios', 'red_observed', 'gates_locales', 'criteria_met', 'criteria_not_met', 'summary', 'followups'] }

const REVUE = { type: 'object', properties: {
  verdict: { type: 'string', enum: ['ok', 'corrige', 'bloque'] }, head_sha: { type: 'string' },
  fixes: { type: 'array', items: { type: 'string' } }, residual_risks: { type: 'array', items: { type: 'string' } },
  suites_ios: { type: 'array', items: { type: 'string' } },
  dimensions_mures: { type: 'array', items: { type: 'integer' } }, dimensions_non_mures: { type: 'array', items: { type: 'string' } },
  rapport: { type: 'string' },
}, required: ['verdict', 'head_sha', 'fixes', 'residual_risks', 'suites_ios', 'dimensions_mures', 'dimensions_non_mures', 'rapport'] }

const AUDIT = { type: 'object', properties: {
  verdict: { type: 'string', enum: ['aucun-bloquant', 'bloquants'] },
  blocking: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['title', 'evidence', 'fix'] } },
  non_blocking: { type: 'array', items: { type: 'string' } },
}, required: ['verdict', 'blocking', 'non_blocking'] }

const PR = { type: 'object', properties: { pr: { type: 'integer' }, head_sha: { type: 'string' } }, required: ['pr', 'head_sha'] }

const VERDICT = { type: 'object', properties: {
  key: { type: 'string' }, pr: { type: 'integer' },
  etat: { type: 'string', enum: ['vert', 'rouge-prealable', 'rouge', 'conflit', 'en-cours', 'fusionnee-ailleurs', 'fermee', 'erreur'] },
  head_sha: { type: 'string' }, dev_base: { type: 'string', description: 'SHA de origin/dev fusionné dans la branche pour cette preuve' },
  runs: { type: 'string', description: 'une ligne par workflow prouvé : nom, run_id, URL, conclusion, jobs' },
  echecs: { type: 'array', items: { type: 'string' } }, prealables: { type: 'array', items: { type: 'string' } },
  checks_pr: { type: 'string' }, detail: { type: 'string' },
}, required: ['key', 'pr', 'etat', 'head_sha', 'dev_base', 'runs', 'echecs', 'prealables', 'checks_pr', 'detail'] }

const GUICHET = { type: 'object', properties: { verdicts: { type: 'array', items: VERDICT }, attendu_min: { type: 'integer' } }, required: ['verdicts', 'attendu_min'] }

const REPARATION = { type: 'object', properties: {
  pushed: { type: 'boolean' }, pr: { type: 'integer' }, branch: { type: 'string' }, head_sha: { type: 'string' }, cause: { type: 'string' }, change: { type: 'string' },
}, required: ['pushed', 'pr', 'branch', 'head_sha', 'cause', 'change'] }

const FIX = { type: 'object', properties: {
  pushed: { type: 'boolean' }, head_sha: { type: 'string' }, cause: { type: 'string' }, change: { type: 'string' },
}, required: ['pushed', 'head_sha', 'cause', 'change'] }

const LIVRAISON = { type: 'object', properties: {
  etat: { type: 'string', enum: ['fusionnee', 'resync', 'non-fusionnee'] }, merge_sha: { type: 'string' },
  derive: { type: 'array', items: { type: 'string' }, description: 'fichiers du lot touchés par dev depuis dev_base' },
  issue_close: { type: 'boolean' }, issues_ouvertes: { type: 'array', items: { type: 'integer' } }, rapport: { type: 'string' },
}, required: ['etat', 'merge_sha', 'derive', 'issue_close', 'issues_ouvertes', 'rapport'] }

const SIMPLE = { type: 'object', properties: { ok: { type: 'boolean' }, note: { type: 'string' } }, required: ['ok', 'note'] }

const BILAN = { type: 'object', properties: { commentaire: { type: 'string' }, recette_issue: { type: 'integer' }, dette_issues: { type: 'array', items: { type: 'integer' } }, resume: { type: 'string' } }, required: ['commentaire', 'recette_issue', 'dette_issues', 'resume'] }

// ---------------------------------------------------------------------------
// PROMPTS — PRÉPARATION, CARTOGRAPHIE, CONSOLIDATION, ORDONNANCEMENT
// ---------------------------------------------------------------------------
const prepPrompt = () => `${socle(null, null)}
MISSION — PRÉPARER LE CHANTIER (mécanique et vérifications ; aucune ligne de produit).
1. cd ${REPO} && git fetch -q origin ${BASE}${BRANCHE_OUTILLAGE ? ' ' + BRANCHE_OUTILLAGE : ''}. Répertoire d'exécution : si ${RUN}/ready.py manque,
   apps/android/scripts/parity/setup_run.sh ${RUN} ; sinon recopie l'outillage à jour : cp apps/android/scripts/parity/{ready.py,lot.py,issue_body.py,pr_body.py}
   ${RUN}/, cp apps/android/docs/parite-ios/plan/*.json ${RUN}/plan/ (garde F0a/F0b), cp apps/android/docs/parite-ios/CONVENTIONS.md ${RUN}/.
   Puis l'outillage du chantier, lu sur ${BRANCHE_OUTILLAGE ? `origin/${BRANCHE_OUTILLAGE} (à défaut origin/${BASE})` : `origin/${BASE}`} :
   git show <réf>:.claude/workflows/meeshy-liste-iso-ios.registre.py > ${RUN}/registre.py ; …lots.json → ${RUN}/graine.json ;
   ${INSTANTANE} → ${RUN}/registre-instantane.json. touch ${RUN}/satisfied.txt ${RUN}/blocked.txt ; mkdir -p ${LOTS} ${NOTES}.
2. python3 ${RUN}/registre.py self-test doit dire « self-test vert », sinon pret=false avec la sortie.
3. Restauration : ${REG} init ${RUN} ${RUN}/graine.json, puis, si ${RUN}/registre-instantane.json existe, ${REG} import ${RUN} ${RUN}/registre-instantane.json
   (l'instantané versionné du registre : lots de cartographie, issues, critères, dépendances, exclusions). Ensuite lis les commentaires de #${CHANTIER}
   (mcp__github__issue_read get_comments, toutes les pages) : le DERNIER qui contient « ${MARQUEUR} » porte un bloc \`\`\`json ; s'il est postérieur au
   dernier commit de l'instantané (git log -1 --format=%cI origin/${BASE} -- ${INSTANTANE}), écris-le dans ${RUN}/registre-export.json et
   ${REG} import ${RUN} ${RUN}/registre-export.json (l'import garde les numéros d'issue et de PR déjà posés). registre_restaure=true si l'un des deux a été
   importé, false sinon.
4. ${BRANCHE_OUTILLAGE ? '' : `Aucune branche d'outillage n'est donnée : saute ce point (pr_outillage=0, outillage_fusionne=true).
   `}PR de l'outillage (#${OUTILLAGE}) : cherche une PR ouverte de la tête isopen-io:${BRANCHE_OUTILLAGE} vers ${BASE} (mcp__github__list_pull_requests
   head « isopen-io:${BRANCHE_OUTILLAGE} » state all). Fusionnée ⇒ outillage_fusionne=true. Aucune ⇒ si la branche a des commits absents de
   ${BASE} (git log origin/${BASE}..origin/${BRANCHE_OUTILLAGE}), crée-la : titre « Le chantier « liste iso iOS » a son workflow autonome et un registre
   qui ordonnance des lots Android, iOS et partagés », corps : Closes #${OUTILLAGE}, Refs #${CHANTIER}, les fichiers, la preuve du point 2, puis une
   ligne vide, « 🤖 Generated with [Claude Code](https://claude.com/claude-code) », une ligne vide et ${SESSION_URL}. Elle ne touche aucun code compilé.
   Ouverte : si elle est en retard sur ${BASE}, ne la mets PAS à jour toi-même (elle ne touche que .claude/workflows/) ; si mergeable_state n'est ni
   dirty ni blocked et que pr-verte --rest ≠ 1, fusionne-la (merge_method « merge ») et commente #${OUTILLAGE} (preuve) ; sinon laisse-la et dis pourquoi.
5. Rends dev_head (SHA court de origin/${BASE}), pr_outillage (0 si aucune), rapport (ce que tu as fait, une ligne par point).
Tout corps de commentaire GitHub finit par une ligne vide, « --- » et « _Generated by [Claude Code](https://claude.ai/code)_ ».`

const cartoPrompt = (fid) => `${socle(null, null)}
MISSION — CARTOGRAPHIER LA FEATURE ${fid} (lecture seule, aucun code). Tu décides QUELS lots portent chaque clause de la demande, sur iOS
et sur Android, en lisant l'arbre VIVANT de ${BASE}.
1. cd ${REPO} && git fetch -q origin ${BASE}. Lis la feature : python3 -c "import json;print(json.dumps(json.load(open('${RUN}/graine.json'))['features']['${fid}'],ensure_ascii=False,indent=1))"
   (clauses, références iOS, existant Android, lots cibles du plan). Lis la spécification de chaque lot cible et de ses dépendances :
   ${REG} spec ${RUN} <clé>, et l'état de tous : ${REG} status ${RUN} --trailer "${SIG_ARG}".
   Lis le code RÉEL sur origin/${BASE} (git show origin/${BASE}:<chemin> ; git grep -n <symbole> origin/${BASE} -- <dossier> ;
   git ls-tree -r --name-only origin/${BASE} | grep <nom>) : iOS (apps/ios, packages/MeeshySDK), Android (apps/android), loi partagée
   (packages/shared) et, pour un détail que la liste ne sert peut-être pas, la passerelle (services/gateway : la sélection du dernier
   message et de ses pièces dans la liste des conversations).
2. iOS — pour CHAQUE clause : tenu / partiel / absent, avec la preuve fichier:ligne. La demande du 2026-11-03 PRIME sur un comportement iOS
   antérieur qui la contredit : un tel écart est « partiel » et devient un lot iOS (avec une décision écrite dans apps/ios/decisions/).
3. Android — pour CHAQUE clause : quel lot la tient (fusionné : preuve fichier:ligne ; lot du plan à faire : le critère exact qui la porte).
   Une clause qu'aucun critère ne dit ⇒ préfère un CRITÈRE AJOUTÉ au lot du plan qui écrit déjà ces fichiers (criteres_ajoutes) ; un lot
   Android de cartographie seulement si aucun lot du plan n'est le bon lieu.
4. Loi partagée et serveur : une clause qui change la valeur d'une loi tenue en trois miroirs (ex. l'aperçu : packages/shared/utils/conversation-preview.ts
   + packages/shared/fixtures/conversation-preview-cases.json, rejoués par Swift et Kotlin) ⇒ un lot « partage » qui change la loi TS et les
   vecteurs, dont dépendent (deps_extra pour un lot du plan, deps pour un lot de cartographie) les lots iOS et Android qui la rejouent.
   Une donnée que la passerelle ne sert pas ⇒ un lot « serveur » ADDITIF et rétrocompatible, protégé comme le reste (rien d'une pièce protégée).
5. Lots de cartographie : clé kebab-case sans préfixe de plateforme (la branche sera claude/<plateforme>-<clé>), titre SÉMANTIQUE, goal,
   acceptance (critères vérifiables), tests (témoins à écrire, nommés), files (chemins réels), ios_reference_files, deps, sensible (true si
   pièce ou message protégés, présence, contrôle d'accès, navigation vers un profil), lourd (true si plus de ~600 lignes ou plusieurs modules),
   features ["${fid}"]. Le plus petit nombre de lots qui couvre tout : un lot = une PR revue en une fois.
6. plan_cibles : un lot du plan non listé dont la feature a besoin. exclusions : un lot cible ou dépendance inutile à la demande (motif).
7. dette_web : en une phrase, ce que apps/web n'aura pas (le porteur l'a sorti du chantier ; ce sera une issue).
Écris le détail (tableau clause × plateforme, preuves) dans ${NOTES}/cartographie/${fid}.md et cite-le dans rapport.`

const consoPrompt = (cartos) => `${socle(null, null)}
MISSION — CONSOLIDER LA CARTOGRAPHIE et la rendre exécutable. Rendus des quatre cartographies (détail : ${NOTES}/cartographie/F*.md) :
${JSON.stringify(cartos).slice(0, 26000)}
1. Fusionne : un même travail proposé par deux features devient UN lot (features = l'union) ; clés uniques ; deps vers des clés qui existent
   (registre ou lots ajoutés) ; aucun cycle. Un lot qui ne sert aucune clause est retiré.
2. Écris les lots dans ${RUN}/carto-lots.json (liste JSON au schéma de la cartographie) puis ${REG} add ${RUN} ${RUN}/carto-lots.json
   (refus ⇒ corrige et rejoue). Pour chaque plan_cibles : ${REG} plan-cible ${RUN} <clé> <feature>. Pour chaque critère ajouté :
   écris la liste dans ${RUN}/crit-<clé>.json et ${REG} criteres ${RUN} <clé> ${RUN}/crit-<clé>.json. Pour chaque deps_extra :
   ${REG} depend ${RUN} <clé> <dep>. Pour chaque exclusion : ${REG} exclude ${RUN} <clé> <motif>.
3. Couverture : pour CHAQUE clause des quatre features, sur iOS et sur Android, « tenu sur dev (preuve) » ou les lots qui la tiendront.
   Une clause sans porteur ⇒ ajoute le lot qui manque (point 2) ; ce qui reste impossible va dans manques avec la raison.
4. Persiste : ${REG} export ${RUN} > ${RUN}/registre-export.json, puis poste sur #${CHANTIER} (mcp__github__add_issue_comment) UN commentaire :
   « ${MARQUEUR} », la table de couverture clause × plateforme → lots, l'ordre des dépendances, la dette web, puis le contenu de
   ${RUN}/registre-export.json dans un bloc \`\`\`json, puis une ligne vide, « --- » et « _Generated by [Claude Code](https://claude.ai/code)_ ».
   Le commentaire dépasse 60 000 caractères ⇒ raccourcis les goal des lots dans le bloc (jamais les clés, deps, files, acceptance).
5. Rends lots_ajoutes, exclus, couverture, manques, dette_web (une entrée par feature concernée), commentaire (URL), rapport.`

const statutPrompt = (enVol) => `MISSION MÉCANIQUE — état du registre. Exécute exactement :
${REG} status ${RUN} --trailer "${SIG_ARG}"${enVol.length ? ` --inflight ${enVol.join(',')}` : ''}
La sortie est un JSON { dev, pret, attente, chevauchement, tenu_ailleurs, pr_nous, pr_a_reprendre, en_vol, bloque, fusionne, exclus, restants, lots }
où lots est un objet clé → { branch, platform, issue, pr, age_h, nous, deps_manquantes, etat, reprise? }. Rends-le TEL QUEL, sauf lots, que tu
rends en LISTE d'objets { key, etat, platform, branch, issue (0 si null), pr (0 si null), reprise (false si absent), nous, sensible, lourd, deps_manquantes }.
Une commande en échec (réseau) : réessaie trois fois à 20 s d'écart, puis rends restants=-1 et des listes vides. N'invente rien.`

const ATTENTE_MODE = `MODE D'ATTENTE (mesuré le 2026-11-04) : le sleep au premier plan est REFUSÉ aux sous-agents, et un seul Monitor long
se termine sans que tu le voies. Attends par TRANCHES : charge Monitor par ToolSearch (« select:Monitor »), puis appelle-le avec
command « sleep 290; echo go » et timeout_ms 300000, ATTENDS son événement « go », et recommence autant de fois qu'il le faut.
Ne termine JAMAIS ton tour pendant qu'une tranche court, et termine-le TOUJOURS par l'appel StructuredOutput.`

const attentePrompt = (minutes, raison) => `Attends ${minutes} minutes, puis rends {"ok": true, "note": "…"}. Raison : ${raison}.
${ATTENTE_MODE}
Nombre de tranches : ${Math.max(1, Math.ceil((minutes * 60) / 290))}. Ne fais rien d'autre.`

// ---------------------------------------------------------------------------
// PROMPTS — UN LOT : ISSUE, CADRAGE, DÉVELOPPEMENT, REVUE, AUDIT, PR
// ---------------------------------------------------------------------------
const issuePrompt = (cle, info) => `${socle(cle, info.platform)}
MISSION — L'ISSUE DU LOT « ${cle} » (mécanique).${info.issue ? ` Le registre la connaît déjà : #${info.issue} — vérifie qu'elle existe (issue_read get) et rends-la, cree=false.` : ''}
1. ${REG} spec ${RUN} ${cle} → source, plan_track, title, features, criteres_ajoutes.
2. Lot du PLAN : python3 ${RUN}/issue_body.py <plan_track> ${cle} <épopée> (épopées : ${JSON.stringify(EPOPEES)}) → JSON {title, body}.
   Lot de CARTOGRAPHIE : compose title = son title ; body = « ## Contexte » (le chantier #${CHANTIER}, ses features et les clauses de la demande
   qu'il porte, verbatim depuis ${RUN}/graine.json), « Références iOS », « Fichiers », « ## Preuve attendue (critères d'acceptation) » en cases
   « - [ ] » (acceptance), « Témoins » (tests), « Dépend de », « Dimensions visées », « ## Critère de fin », puis une ligne vide, « --- » et
   « _Generated by [Claude Code](https://claude.ai/code)_ ».
3. Cherche une issue au titre IDENTIQUE : gh api -X GET search/issues -f q='repo:${GH} is:issue in:title "<title>"' --jq '.items[]|"\\(.number) \\(.state) \\(.title)"'.
   Trouvée (ouverte ou fermée) ⇒ cree=false. Sinon : mcp__github__issue_write create, owner isopen-io, repo meeshy, title et body, labels
   ${info.platform === 'android' ? '["android"]' : info.platform === 'ios' ? '["ios"]' : '[]'}, milestone ${MILESTONE}, parent_issue_number = l'épopée (plan) ou ${CHANTIER}
   (cartographie) — si le lien de parenté échoue, recrée sans lui. cree=true.
4. Rattachement : si l'issue n'a pas encore de commentaire citant #${CHANTIER}, poste-en un : « Porté par le chantier #${CHANTIER} (milestone #${MILESTONE}) »,
   ${info.platform === 'android' ? 'plus, s\'il y a des criteres_ajoutes, la liste « Critères ajoutés par la demande du porteur du 2026-11-03 » en cases,' : ''}
   puis une ligne vide, « --- » et « _Generated by [Claude Code](https://claude.ai/code)_ ».
5. ${REG} set ${RUN} ${cle} issue <numéro>. Rends {issue, cree}.`

const cadrerPrompt = (cle, info, issue, histoire) => `${socle(cle, info.platform)}
MISSION — CADRER LE LOT contre l'arbre VIVANT (lecture seule). Issue #${issue}.${histoire ? `\nTENTATIVE PRÉCÉDENTE (bloquée) : ${histoire}\nTon plan doit lever cette cause, autrement.` : ''}
1. cd ${REPO} && git fetch -q origin ${BASE}. Lis la spécification (${REG} spec ${RUN} ${cle}) — y compris criteres_ajoutes et les clauses de ses
   features dans ${RUN}/graine.json —, l'issue, ses références iOS et le code RÉEL qu'il touche (git show origin/${BASE}:<chemin>, git grep -n
   <symbole> origin/${BASE}). Les chemins du plan ont pu bouger : retrouve-les (git ls-tree -r --name-only origin/${BASE} | grep <nom>).
   Cartographie de sa feature : ${NOTES}/cartographie/.
2. Décide : deja-tenu (CHAQUE critère, y compris ajouté, est tenu sur origin/${BASE} : preuve fichier:ligne par critère) ; tenu-ailleurs (une PR
   ouverte ou une branche vivante de moins de 6 h d'une AUTRE session écrit ces fichiers : gh api -X GET search/issues -f q='repo:${GH} is:pr is:open <mots>',
   git ls-remote origin 'refs/heads/claude/*' puis git log -1 des branches suspectes — preuve : branche, PR, fichiers) ; sinon a-faire.
3. a-faire : écris le PLAN dans ${NOTES}/${cle}/spec.md et résume-le dans plan : lois pures (noms, signatures, vecteurs de test dérivés d'iOS ou
   des fixtures partagées), composants DÉJÀ présents à réutiliser (cite-les), câblage mince (fichiers exacts), témoins dans l'ordre TDD,
   extractions préalables pour tout fichier touché de plus de 1000 lignes (wc -l), pièges de compilation (${info.platform === 'ios' ? 'conformances, Mock*, frontières de cible, isolation' : info.platform === 'android' ? 'interfaces à doublures multiples, Hilt, ressources' : 'consommateurs web et passerelle'}),
   et ce qui part À CÔTÉ (détails d'une pièce protégée, présence d'un non-ami, métadonnées). Un critère que le lot ne peut tenir sans un autre
   lot : dis-le dans risques.`

const devPrompt = (cle, info, issue, cadrage, reprise) => `${socle(cle, info.platform)}
MISSION — DÉVELOPPER LE LOT de bout en bout sur sa branche ${branche(info.platform, cle)}. Issue #${issue}.
PLAN DU CADRAGE : ${JSON.stringify(cadrage).slice(0, 6000)}
${reprise ? `REPRISE : la branche existe déjà (${reprise}). Lis ce qui est fait (git log origin/${BASE}..HEAD, git diff origin/${BASE}...HEAD) contre la
spécification, garde ce qui est juste, complète, et git merge origin/${BASE} d'abord (conflit : garde la sémantique des deux côtés).` : ''}
Clone privé (jamais ${REPO}) :
${clone(cle, info.platform, !!reprise)}
${reprise ? '' : `Avant d'écrire : git ls-remote origin refs/heads/${branche(info.platform, cle)} — la branche existe et n'est pas du chantier (aucun des cinq
derniers commits de sa lignée principale, git log --first-parent -5, ne porte l'une de ces signatures : ${SIGNATURES.join(' ; ')}) ⇒ une autre
session tient le lot : status skipped-claimed, sans rien pousser.`}
1. Réserve tôt : après le premier témoin rouge, commit puis git push -u origin ${branche(info.platform, cle)} (erreur réseau : 4 essais après 2, 4, 8,
   16 s). Ensuite commit ET push après chaque étape (témoin rouge, loi verte, chaque fichier de câblage) : rien ne vit plus de 10 minutes en local.
2. TDD : témoins de la loi pure d'abord, ROUGE constaté (copie l'extrait dans red_observed — ${info.platform === 'ios' ? 'pour Swift, que tu ne peux pas exécuter ici, le rouge est le témoin écrit contre l\'API absente ou l\'ancienne valeur, et le guichet le jouera ; dis-le' : 'exécute-le'}),
   le minimum pour le vert, puis refactor. Câblage mince ensuite.
${GATES[info.platform]}
${garde(info.platform)}
3. Touche les fichiers du plan, plus le câblage additif minimal. Un fichier de plus de 1000 lignes : extrais d'abord.
4. Avant de rendre : git fetch -q origin ${BASE} && git merge -q origin/${BASE} (conflit ⇒ résous en gardant les deux sémantiques), rejoue les gates
   locales, push. Un critère impossible maintenant : livre ce qui est sûr derrière une couture inerte et liste le reste dans followups.
Ne crée pas de PR. Ne supprime pas $D (le relecteur le réutilise).
Rends status, head_sha, files_changed, tests_added, suites_ios (classes à jouer ; [] hors iOS), red_observed, gates_locales (commande → verdict),
criteria_met / criteria_not_met (critère par critère, y compris les criteres_ajoutes), summary (ce que l'utilisateur voit désormais, comme sur iOS), followups.`

const revuePrompt = (cle, info, issue, impl) => `${socle(cle, info.platform)}
MISSION — REVUE-CORRECTION du lot (issue #${issue}). Rendu du développeur : ${JSON.stringify({ summary: impl.summary, files: impl.files_changed, tests: impl.tests_added, suites: impl.suites_ios, not_met: impl.criteria_not_met, gates: impl.gates_locales }).slice(0, 3500)}
Clone : ${LOTS}/${cle} sur ${branche(info.platform, cle)} ; s'il manque ou n'est pas sur la branche :
${clone(cle, info.platform, true)}
1. git fetch -q origin ${BASE} && git merge -q origin/${BASE} (synchronisation ; conflit ⇒ résous), puis lis TOUT le diff : git diff origin/${BASE}...HEAD.
2. Compilation, ligne par ligne — la CI est le seul compilateur, fais que son PREMIER passage soit vert :
${garde(info.platform)}
3. Comportement : chaque critère (plan, cartographie et criteres_ajoutes) et les références iOS ; témoins de COMPORTEMENT (un rang autre que le
   premier pour le Prisme ; une pièce PROTÉGÉE dont aucun détail ne sort ; un non-ami sans présence) ; ce qui part À CÔTÉ du champ gardé ;
   loi jumelle existante ; budget de lignes ; fuites (listener, scope, cache non borné) ; fil principal bloqué ; recomposition ou re-rendu à
   chaque image de défilement ; accessibilité (libellés, cibles 44 pt / 48 dp, actions annoncées) ; clair et sombre.
4. Corrige toi-même, commits « fix(${portee(info.platform)}/liste): revue — … » (Refs #${issue} puis les lignes d'attribution), push sans force,
   gates locales rejouées :
${GATES[info.platform]}
Rends verdict (ok : rien à changer ; corrige : tu as poussé ; bloque : le lot ne peut ni compiler ni tenir son critère sans travail hors de son
périmètre — dis lequel), head_sha, fixes, residual_risks, suites_ios (la liste finale), dimensions_mures (1 à 13), dimensions_non_mures (« n — pourquoi »), rapport.`

const auditPrompt = (cle, info, issue) => `${socle(cle, info.platform)}
MISSION — AUDIT ADVERSARIAL du lot (lecture seule), issue #${issue}. Diff : cd ${LOTS}/${cle} && git fetch -q origin ${BASE} && git diff origin/${BASE}...HEAD
(si le clone manque : clone frais de ${branche(info.platform, cle)} dans ${NOTES}/${cle}/audit). Cherche ce qui FUIT ou CASSE : un détail de pièce
ou de message protégés (poids, dimensions, durée, nom, vignette, texte, traduction) qui apparaît dans l'aperçu, la ligne, un libellé
d'accessibilité, un cache ou une notification ; une présence servie ou rendue hors amitié acceptée (#13928 : Ami = en ligne ou rien) ; un
profil ouvert pour un compte bloqué, supprimé ou anonyme ; une navigation déclenchée depuis une entrée de pastille qui ne désigne plus
rien ; une garde fail-open ; un test affaibli ; une régression d'un ancien client (rétrocompatibilité). Chaque constat bloquant : fichier:ligne, scénario, correction.`

const corrigerAuditPrompt = (cle, info, issue, audit) => `${socle(cle, info.platform)}
MISSION — CORRIGER LES CONSTATS BLOQUANTS DE L'AUDIT, en TDD (témoin qui reproduit, rouge, correctif), issue #${issue} :
${JSON.stringify(audit.blocking).slice(0, 5000)}
Clone : ${LOTS}/${cle} (sinon : ${clone(cle, info.platform, true).split('\n').join(' ')}). git merge origin/${BASE} d'abord. Commits « fix(${portee(info.platform)}/liste): audit — … », push sans force.
${garde(info.platform)}
Rends verdict (corrige, ou bloque avec la cause), head_sha, fixes, residual_risks, suites_ios, dimensions_mures, dimensions_non_mures, rapport.`

const prPrompt = (cle, info, issue, resume) => `${socle(cle, info.platform)}
MISSION — OUVRIR LA PR DU LOT (mécanique). Branche ${branche(info.platform, cle)} → ${BASE}.
1. Une PR ouverte existe déjà pour la tête isopen-io:${branche(info.platform, cle)} (mcp__github__list_pull_requests head « isopen-io:${branche(info.platform, cle)} » state open) ⇒ rends-la.
2. Sinon compose : lot du PLAN ⇒ python3 ${RUN}/pr_body.py <plan_track de ${REG} spec ${RUN} ${cle}> ${cle} ${issue} "<résumé sans guillemets doubles>" → {title, body},
   et remplace la ligne « https://claude.ai/code/session_… » du corps par « ${SESSION_URL} » ; lot de CARTOGRAPHIE ⇒ title = son title, body =
   « Closes #${issue} », le résumé, les fichiers, les témoins, les critères tenus.
   Résumé : ${JSON.stringify(String(resume || '').replace(/"/g, "'").slice(0, 1200))}
   Ajoute, avant la ligne « 🤖 Generated… » : « Refs #${CHANTIER} » et « Preuve : workflow_dispatch des CI concernées sur cette branche (la CI des PR est
   gelée) — liens en commentaire. Brouillon jusqu'à la preuve verte. » La fin du corps est : une ligne vide, « 🤖 Generated with [Claude Code](https://claude.com/claude-code) », une ligne vide, ${SESSION_URL}.
3. mcp__github__create_pull_request owner isopen-io repo meeshy base ${BASE} head ${branche(info.platform, cle)} draft true (BROUILLON jusqu'à sa preuve :
   l'agent de livraison la passera prête juste avant de la fusionner ; une PR existante non brouillon ⇒ mcp__github__update_pull_request draft true).
   ${REG} set ${RUN} ${cle} pr <numéro>.
Rends {pr, head_sha}.`

// ---------------------------------------------------------------------------
// PROMPTS — GUICHET CI, CORRECTION, LIVRAISON
// ---------------------------------------------------------------------------
const guichetPrompt = (items) => `${socle(null, null)}
MISSION — GUICHET CI : prouver ces PR au SHA de tête, après synchronisation sur ${BASE}. Tu ne modifies aucun code de produit (seul un merge de
${BASE} est permis) et tu ne fusionnes rien. Lots :
${JSON.stringify(items.map((i) => ({ key: i.key, platform: i.platform, branch: i.branch, pr: i.pr || 0, issue: i.issue || 0, suites_ios: i.suites_ios || [], nouvelle_preuve: !i.preuveEnCours, dernier_sha_prouve: i.dernierSha || '' }))).slice(0, 5000)}
0. ToolSearch « select:mcp__github__pull_request_read,mcp__github__list_pull_requests,mcp__github__actions_list,mcp__github__actions_get,mcp__github__actions_run_trigger,mcp__github__get_job_logs,mcp__github__add_issue_comment ».
POUR CHAQUE LOT :
1. PR : pr = 0 ⇒ retrouve-la (list_pull_requests head « isopen-io:<branch> » state all) ; aucune ⇒ etat erreur. pull_request_read get :
   - FUSIONNÉE (par un tiers, avant ou pendant sa preuve) : ne synchronise rien, ne relance rien. La preuve à lire est celle du SHA fusionné : les
     exécutions workflow_dispatch de la branche au head.sha ; s'il n'y en a aucune, les exécutions « push » de ${BASE} au merge_commit_sha. En cours ⇒
     attends-les comme au point 5 (non terminées à l'échéance ⇒ etat en-cours) ; terminées ⇒ etat fusionnee-ailleurs avec echecs et prealables jugés comme
     au point 6 (un échec du lot qui n'est pas préalable est un défaut désormais DANS ${BASE} : dis-le dans detail) ; aucune exécution ⇒ fusionnee-ailleurs,
     echecs vides, detail « aucune preuve trouvée ». Passe ensuite au lot suivant.
   - fermée sans fusion ⇒ etat fermee ; mergeable_state dirty ⇒ etat conflit.
   - ouverte et PAS en brouillon ⇒ mcp__github__update_pull_request draft true (personne ne doit la fusionner avant sa preuve).
2. SYNCHRONISATION — seulement si nouvelle_preuve=true OU si aucune exécution non annulée n'existe pour le SHA de tête : dans ${LOTS}/<key>
   (sinon clone frais de la branche : git clone -q --filter=blob:none https://github.com/${GH} ${LOTS}/<key> -b <branch>), git fetch -q origin ${BASE}
   <branch> && git checkout -q -B <branch> origin/<branch> && git merge -q origin/${BASE} && git push origin <branch> (conflit ⇒ git merge --abort,
   etat conflit). dev_base = git rev-parse origin/${BASE} au moment du merge (sinon git merge-base HEAD origin/${BASE}). Une preuve EN COURS pour le
   SHA de tête n'est jamais relancée par une nouvelle synchronisation : ${BASE} bouge toutes les minutes, re-synchroniser à chaque passage ne
   conclurait jamais.
3. Workflows à prouver, d'après git diff --name-only origin/${BASE}...HEAD et les filtres paths: de chaque fichier .github/workflows/*.yml :
   android.yml (apps/android/** et ses autres chemins, dont packages/shared/fixtures/** et les .xcstrings) ; ios.yml (apps/ios/**, packages/MeeshySDK/**)
   avec inputs {only_testing: suites_ios jointes par des virgules — vide ⇒ dérive-les des classes de test ajoutées ou modifiées du diff} ;
   sdk-tests.yml (packages/MeeshySDK/** et ses fixtures) avec only_testing ; ci.yml (packages/shared/** hors fixtures, services/**, apps/web/**).
4. Pour chaque workflow : actions_list list_workflow_runs resource_id <fichier>, branch <branch>, event workflow_dispatch. Aucune exécution non
   annulée au SHA de tête ⇒ actions_run_trigger run_workflow workflow_id <fichier> ref <branch> (inputs) ; sleep 60, relis jusqu'à la voir (5 essais).
5. ATTENTE : tant qu'AUCUN lot de ce guichet n'a toutes ses exécutions terminées, relis toutes les 5 minutes, au plus 45 minutes. À l'échéance,
   les lots non terminés sont « en-cours ».
   ${ATTENTE_MODE}
6. Lot terminé : jobs → conclusion (actions_list list_workflow_jobs). Tous success (skipped admis hors jobs de build et de test) ⇒ vert.
   Un job « cancelled » sans autre échec ⇒ en-cours. Rouge ⇒ get_job_logs run_id failed_only true return_content true tail_lines 500 : erreurs
   de compilation (fichier:ligne) et tests rouges (FQN) dans echecs ; puis les deux dernières exécutions TERMINÉES du même workflow sur ${BASE}
   (event push) : un échec identique (même tâche ou FQN, même message) y figure ⇒ préalable ; une erreur de COMPILATION ne l'est jamais si ${BASE}
   compile. Tous préalables ⇒ rouge-prealable (prealables : « FQN — run <id> de ${BASE} ») ; sinon rouge.
7. Checks de la PR : charge REST et node ${REPO}/scripts/ci/pr-verte.mjs --rest <fichier> → checks_pr. Un check rouge du lot hors des workflows
   prouvés ⇒ dis-le dans detail et etat rouge.
8. Verdict terminal (vert, rouge-prealable, rouge) : UN commentaire sur la PR — SHA, dev_base, runs (lien, jobs), échecs et préalables — fini par une
   ligne vide, « --- » et « _Generated by [Claude Code](https://claude.ai/code)_ ».
Rends verdicts (un par lot, key et pr renseignés, runs en une ligne par workflow) et attendu_min (minutes passées à attendre).`

const corrigerPrompt = (item, verdict, essai) => `${socle(item.key, item.platform)}
MISSION — RENDRE LA PR #${verdict.pr || item.pr} VERTE (lot « ${item.key} », issue #${item.issue || '?'}), essai ${essai}/${MAX_FIX}. État prouvé : ${JSON.stringify(verdict).slice(0, 4000)}
Clone : ${LOTS}/${item.key} (sinon : ${clone(item.key, item.platform, true).split('\n').join(' ')}) ; git fetch -q origin ${BASE} ${item.branch} && git checkout -q -B ${item.branch} origin/${item.branch} ;
si origin/${item.branch} a bougé depuis ${verdict.head_sha || '?'} et porte déjà la correction d'un autre, ne double pas : pushed=false, cause « déjà corrigé ».
- conflit : git merge origin/${BASE} (jamais rebase), résous en gardant les deux sémantiques (fichiers d'enregistrement : les deux blocs ; chaînes
  Android générées : ./apps/android/meeshy.sh i18n ; collision de version Room : renumérote avec migration et schéma JSON).
- rouge : la CAUSE RACINE de chaque échec du lot (lis les fichiers cités, la version réelle de l'API). Jamais un témoin désactivé, affaibli ou
  supprimé ; un test qui révèle un vrai défaut ⇒ corrige le code.
${GATES[item.platform]}
${garde(item.platform)}
Commit « fix(${portee(item.platform)}/liste): … » (Refs #${item.issue || CHANTIER} puis les lignes d'attribution), git push origin ${item.branch} sans force. Rends pushed, head_sha, cause, change.`

const livrerPrompt = (item, verdict, autoriserDerive, dejaFusionnee) => `${socle(item.key, item.platform)}
MISSION — ${dejaFusionnee ? `CONSIGNER LA PR #${verdict.pr}, DÉJÀ FUSIONNÉE par un tiers (lot « ${item.key} », issue #${item.issue || '?'}) : ne fusionne rien, saute les points 1 à 3,
et dis dans la clôture qu'elle a été fusionnée avant la fin de sa preuve, puis ce que la preuve a dit ensuite` : `LIVRER LA PR #${verdict.pr} (lot « ${item.key} », issue #${item.issue || '?'})`}. Preuve : ${JSON.stringify(verdict).slice(0, 3500)}
Contexte du lot : ${JSON.stringify({ revue: item.revue || null, followups: item.followups || [] }).slice(0, 2500)}
1. pull_request_read get #${verdict.pr} : head.sha ≠ ${verdict.head_sha} ⇒ etat non-fusionnee (la preuve ne vaut plus). mergeable_state dirty ⇒ non-fusionnee.
2. DÉRIVE DE ${BASE} (synchronisation) : dans un clone (${LOTS}/${item.key}, sinon frais), git fetch -q origin ${BASE} ; fichiers du lot = git diff --name-only
   ${verdict.dev_base || 'origin/' + BASE}...${verdict.head_sha} ; fichiers touchés par ${BASE} depuis la preuve = git diff --name-only ${verdict.dev_base || 'HEAD'} origin/${BASE}.
   Intersection non vide ⇒ derive = l'intersection${autoriserDerive ? " ; ce lot a déjà été resynchronisé plusieurs fois : continue si mergeable_state n'est pas dirty, et nomme la dérive dans la clôture" : ' et etat resync (le guichet re-synchronisera et re-prouvera) — ne fusionne pas'}.
3. mcp__github__update_pull_request pullNumber ${verdict.pr} draft false (la PR quitte le brouillon maintenant qu'elle est prouvée), puis aussitôt
   mcp__github__merge_pull_request owner isopen-io repo meeshy pullNumber ${verdict.pr} merge_method « merge » expectedHeadSha ${verdict.head_sha}, SANS commit_title
   ni commit_message (le titre par défaut « Merge pull request #… from isopen-io/${item.branch} » est le registre du programme). Refus ⇒ remets-la en
   brouillon (draft true) et etat non-fusionnee.
4. Issue #${item.issue || '?'} : si elle est encore ouverte, ferme-la (issue_write update state closed state_reason completed). Commentaire de clôture : PR, SHA de
   fusion, preuve (runs${verdict.etat === 'rouge-prealable' ? ', échecs PRÉALABLES de ' + BASE + ' avec leur run' : ''}), critères tenus et non tenus, dimensions mûres et non mûres,
   ce qui reste à rejouer sur appareil réel, et la dérive de ${BASE} s'il y en a.
5. Une issue par dimension non mûre et par followup qui n'a pas déjà la sienne (gh api -X GET search/issues d'abord) : titre SÉMANTIQUE, labels
   ${item.platform === 'android' ? '["android"]' : item.platform === 'ios' ? '["ios"]' : '[]'}, milestone ${MILESTONE}, parent_issue_number ${CHANTIER}.
6. rm -rf ${LOTS}/${item.key}.
Tout corps finit par une ligne vide, « --- » et « _Generated by [Claude Code](https://claude.ai/code)_ ». Rends etat, merge_sha, derive, issue_close, issues_ouvertes, rapport.`

const reparerPrompt = (item, verdict) => `${socle(item.key, item.platform)}
MISSION — RÉPARER ${BASE} : la PR #${verdict.pr} (lot « ${item.key} », issue #${item.issue || '?'}) a été fusionnée par un tiers avant la fin de sa preuve, et
la preuve du SHA fusionné est ROUGE pour des raisons qui ne sont pas préalables : ${JSON.stringify({ echecs: verdict.echecs, runs: verdict.runs, detail: verdict.detail }).slice(0, 3500)}
1. Vérifie d'abord que ${BASE} porte encore le défaut : git fetch -q origin ${BASE} ; une autre session l'a peut-être déjà corrigé (git log origin/${BASE} --since=<fusion>
   -- <fichiers cités>, gh api -X GET search/issues -f q='repo:${GH} is:pr <symbole ou test>'). Déjà corrigé ⇒ pushed=false, cause « déjà corrigé sur ${BASE} : <commit|PR> ».
2. Sinon, nouvelle branche ${branche(item.platform, item.key + '-reparation')} depuis origin/${BASE} dans ${LOTS}/${item.key}-reparation (clone frais) ; cause racine
   de chaque échec, témoin qui la reproduit d'abord quand c'est un comportement ; jamais un témoin désactivé ou affaibli.
${GATES[item.platform]}
${garde(item.platform)}
3. Commit « fix(${portee(item.platform)}/liste): … » (Refs #${item.issue || CHANTIER} puis les lignes d'attribution), push, PR vers ${BASE} en BROUILLON (draft true) :
   titre sémantique (ce que la réparation rend), corps « Refs #${item.issue || CHANTIER} », « Refs #${CHANTIER} », la cause et la preuve rouge citée, puis une ligne vide,
   « 🤖 Generated with [Claude Code](https://claude.com/claude-code) », une ligne vide, ${SESSION_URL}.
Rends pushed, pr, branch, head_sha, cause, change.`

const satisfaitPrompt = (cle, info, issue, cadrage) => `${socle(cle, info.platform)}
MISSION — CONSIGNER UN LOT DÉJÀ TENU (mécanique). Le cadrage prouve que chaque critère est tenu sur origin/${BASE} : ${JSON.stringify({ preuve: cadrage.preuve }).slice(0, 3000)}
1. ${REG} mark ${RUN} ${cle} satisfait
2. Ferme l'issue #${issue} (state closed, completed) avec un commentaire : « tenu sur ${BASE} sans branche de lot » et la preuve critère par critère, fini par une
   ligne vide, « --- » et « _Generated by [Claude Code](https://claude.ai/code)_ ». Rends {"ok": true, "note": "…"}.`

const bloquerPrompt = (cle, info, issue, cause, final) => `${socle(cle, info.platform)}
MISSION — CONSIGNER UN BLOCAGE (mécanique). Lot « ${cle} », issue #${issue || '?'}. Cause : ${String(cause).slice(0, 3000)}
${final ? `Blocage DÉFINITIF : ${REG} mark ${RUN} ${cle} bloque` : 'Blocage de la tentative courante : une nouvelle tentative suivra plus tard dans le chantier.'}
${issue ? `Commente l'issue #${issue} : la cause exacte, la branche ${branche(info.platform, cle)} (gardée sur origin), ce qu'il faut pour lever le blocage${final ? ', et que le lot attend une session humaine ou un autre lot' : ''} ;
fini par une ligne vide, « --- » et « _Generated by [Claude Code](https://claude.ai/code)_ ».` : ''} Rends {"ok": true, "note": "…"}.`

const bilanPrompt = (etat) => `${socle(null, null)}
MISSION — BILAN DU CHANTIER (mécanique). État : ${JSON.stringify(etat).slice(0, 14000)}
1. ${REG} status ${RUN} --trailer "${SIG_ARG}" pour l'état final. Poste UN commentaire sur #${CHANTIER} : tableau lot → plateforme → issue → PR → état
   (fusionné / bloqué / tenu ailleurs / en attente) → preuve → dimensions mûres ; puis, par feature et par clause, ce qui est visible sur iOS et
   sur Android depuis ${BASE} ; ce qui reste, dans l'ordre ; les blocages avec leur cause et leur issue ; la dette ouverte en chemin.
2. Recette : cherche une issue ouverte au titre « La liste et le fil se recettent sur un S8, un Pixel et le simulateur iOS : pastille de frappe,
   aperçu détaillé, avatar de ligne, rail de stories réduit » (gh api -X GET search/issues) ; sinon crée-la (labels ["android","ios"], milestone
   ${MILESTONE}, parent_issue_number ${CHANTIER}) : pour chacune des quatre features, les scénarios à rejouer (gestes, attendu, deux comptes amis pour la
   frappe et la présence, une pièce protégée pour l'aperçu, mesures : dumpsys gfxinfo framestats pendant le défilement, Instruments Hitches sur iOS).
3. Dette web : pour chaque entrée de dette_web, une issue (titre sémantique « Sur le web, … », milestone ${MILESTONE}, parent ${CHANTIER}) si aucune n'existe.
4. Si TOUS les lots sont fusionnés ou tenus, dis-le en tête ; laisse #${CHANTIER} OUVERTE (la recette sur appareil reste).
Tout corps finit par une ligne vide, « --- » et « _Generated by [Claude Code](https://claude.ai/code)_ ». Rends commentaire (URL), recette_issue, dette_issues, resume.`

// ---------------------------------------------------------------------------
// ORCHESTRATION
// ---------------------------------------------------------------------------
const evt = (() => {
  let attente = []
  return {
    wait: () => new Promise((r) => attente.push(r)),
    notify: () => { const w = attente; attente = []; w.forEach((f) => f()) },
  }
})()

const enVol = new Set()
const termine = new Map()
const tentatives = {}
const historique = {}
const differes = new Map()
const reports = {}
const queueCI = []
const journal = []
let ciActif = false
let devActifs = 0
let devTermine = false
let dernierDev = ''

const appel = (prompt, opts) => agent(prompt, opts).catch((e) => {
  log(`${opts && opts.label ? opts.label : 'agent'} : aucun rendu exploitable (${String(e).slice(0, 160)})`)
  return null
})

const noter = (cle, resultat, detail) => {
  journal.push({ cle, resultat, detail: String(detail || '').slice(0, 400) })
  log(`${cle} → ${resultat}${detail ? ` — ${String(detail).slice(0, 160)}` : ''}`)
}

const statut = async (label) => {
  const st = await appel(statutPrompt([...enVol]), { label, phase: 'Ordonnancer', schema: STATUT, model: MODELE.mecanique, effort: 'low' })
  if (!st || st.restants < 0) return null
  if (st.dev && st.dev !== dernierDev) {
    log(`dev @ ${st.dev} — ${st.fusionne.length} fusionnés, ${st.pret.length} prêts, ${st.attente.length} en attente, ${st.tenu_ailleurs.length} tenus ailleurs, ${st.chevauchement.length} en chevauchement`)
    dernierDev = st.dev
  }
  return st
}

const adopter = (st) => {
  const ids = [...st.pr_nous, ...st.pr_a_reprendre]
  ids.filter((k) => !enVol.has(k) && !termine.has(k) && !SAUTER.has(k) && (!SEULEMENT || SEULEMENT.has(k))).forEach((k) => {
    const l = st.lots.find((x) => x.key === k)
    if (!l) return
    enVol.add(k)
    queueCI.push({ key: k, platform: l.platform, branch: l.branch, pr: l.pr || 0, issue: l.issue || 0, essai: 0, attentes: 0, resync: 0, preuveEnCours: false, adopte: true })
    log(`${k} : PR ${l.pr ? '#' + l.pr : ''} adoptée par le guichet (${st.pr_a_reprendre.includes(k) ? 'reprise d une autre session' : 'ouverte par ce chantier'})`)
  })
  if (ids.length) evt.notify()
}

const bloquer = async (cle, info, issue, cause, final) => {
  await appel(bloquerPrompt(cle, info, issue, cause, final), { label: `bloquer:${cle}`, phase: 'Livrer', schema: SIMPLE, model: MODELE.mecanique, effort: 'low' })
}

const chaine = async (cle, info) => {
  tentatives[cle] = (tentatives[cle] || 0) + 1
  const n = tentatives[cle]
  const iss = await appel(issuePrompt(cle, info), { label: `issue:${cle}`, phase: 'Issue', schema: ISSUE, model: MODELE.mecanique, effort: 'low' })
  if (!iss || !iss.issue) return { resultat: 'bloque', cause: 'aucune issue' }
  const issue = iss.issue

  const cadrage = await appel(cadrerPrompt(cle, info, issue, historique[cle]), { label: `cadrer:${cle}#${n}`, phase: 'Cadrer', schema: CADRAGE, model: MODELE.cadrer, effort: 'high' })
  if (!cadrage) return { resultat: 'bloque', cause: 'cadrage sans rendu', issue }
  if (cadrage.decision === 'deja-tenu') {
    await appel(satisfaitPrompt(cle, info, issue, cadrage), { label: `tenu:${cle}`, phase: 'Livrer', schema: SIMPLE, model: MODELE.mecanique, effort: 'low' })
    return { resultat: 'deja-tenu', issue, cause: cadrage.preuve }
  }
  if (cadrage.decision === 'tenu-ailleurs') return { resultat: 'tenu-ailleurs', issue, cause: cadrage.preuve }

  const lourd = info.platform !== 'partage' && (info.lourd || (cadrage.fichiers || []).length > 14)
  const impl = await appel(devPrompt(cle, info, issue, cadrage, info.reprise ? `branche existante${historique[cle] ? ' ; ' + historique[cle] : ''}` : (n > 1 ? historique[cle] : '')),
    { label: `dev:${cle}#${n}`, phase: 'Développer', schema: IMPL, model: lourd ? MODELE.lourd : MODELE.developper, effort: 'high' })
  if (!impl) return { resultat: 'bloque', cause: 'développement sans rendu', issue }
  if (impl.status === 'skipped-claimed') return { resultat: 'tenu-ailleurs', issue, cause: 'branche réservée par une autre session' }
  if (impl.status !== 'pushed') return { resultat: 'bloque', cause: `développement : ${impl.summary}`, issue }

  let revue = await appel(revuePrompt(cle, info, issue, impl), { label: `relire:${cle}#${n}`, phase: 'Relire', schema: REVUE, model: MODELE.relire, effort: 'high' })
  if (!revue) return { resultat: 'bloque', cause: 'revue sans rendu', issue }
  if (revue.verdict === 'bloque') return { resultat: 'bloque', cause: `revue : ${revue.rapport}`, issue }

  if (info.sensible) {
    let audit = await appel(auditPrompt(cle, info, issue), { label: `audit:${cle}#${n}`, phase: 'Auditer', schema: AUDIT, agentType: 'auditeur-adversarial', effort: 'high' })
    for (let passe = 0; audit && audit.verdict === 'bloquants' && passe < 2; passe++) {
      const c = await appel(corrigerAuditPrompt(cle, info, issue, audit), { label: `audit-fix:${cle}#${passe + 1}`, phase: 'Auditer', schema: REVUE, model: MODELE.corriger, effort: 'high' })
      if (!c || c.verdict === 'bloque') return { resultat: 'bloque', cause: `audit : ${c ? c.rapport : 'aucun rendu'}`, issue }
      revue = { ...revue, ...c, dimensions_mures: c.dimensions_mures, dimensions_non_mures: c.dimensions_non_mures }
      audit = await appel(auditPrompt(cle, info, issue), { label: `audit:${cle}#${n}.${passe + 2}`, phase: 'Auditer', schema: AUDIT, agentType: 'auditeur-adversarial', effort: 'high' })
    }
    if (!audit) return { resultat: 'bloque', cause: 'audit sans rendu', issue }
    if (audit.verdict === 'bloquants') return { resultat: 'bloque', cause: `audit : ${audit.blocking.map((b) => b.title).join(' ; ')}`, issue }
  }

  const pr = await appel(prPrompt(cle, info, issue, impl.summary), { label: `pr:${cle}`, phase: 'Prouver', schema: PR, model: MODELE.mecanique, effort: 'low' })
  if (!pr || !pr.pr) return { resultat: 'bloque', cause: 'PR non ouverte', issue }
  const suites = (revue.suites_ios && revue.suites_ios.length ? revue.suites_ios : impl.suites_ios) || []
  queueCI.push({ key: cle, platform: info.platform, branch: info.branch, pr: pr.pr, issue, essai: 0, attentes: 0, resync: 0, preuveEnCours: false,
    suites_ios: suites, revue: { dimensions_mures: revue.dimensions_mures, dimensions_non_mures: revue.dimensions_non_mures }, followups: impl.followups })
  return { resultat: 'pr', issue, pr: pr.pr }
}

const apresChaine = async (cle, info, r) => {
  if (r.resultat === 'pr') { noter(cle, `PR #${r.pr} au guichet`); return }
  enVol.delete(cle)
  if (r.resultat === 'deja-tenu') { termine.set(cle, r); noter(cle, 'déjà tenu sur dev', r.cause); return }
  if (r.resultat === 'tenu-ailleurs') {
    reports[cle] = (reports[cle] || 0) + 1
    tentatives[cle] = Math.max(0, (tentatives[cle] || 1) - 1)
    if (reports[cle] > 3) { termine.set(cle, r); noter(cle, 'tenu ailleurs (définitif pour ce run)', r.cause); return }
    differes.set(cle, 4)
    noter(cle, `tenu ailleurs, différé (${reports[cle]}/3)`, r.cause)
    return
  }
  historique[cle] = String(r.cause || '').slice(0, 1500)
  const final = tentatives[cle] >= TENTATIVES
  await bloquer(cle, info, r.issue, r.cause, final)
  if (final) termine.set(cle, r)
  else differes.set(cle, 2)
  noter(cle, final ? 'bloqué (définitif)' : `bloqué, nouvelle tentative plus tard (${tentatives[cle]}/${TENTATIVES})`, r.cause)
}

const devWorker = async (id) => {
  let idle = 0
  for (let tour = 0; tour < 400; tour++) {
    const st = await statut(`statut:dev${id}#${tour}`)
    if (!st) { idle++; if (idle > MAX_IDLE) return; continue }
    adopter(st)
    differes.forEach((v, k) => { if (v <= 1) differes.delete(k); else differes.set(k, v - 1) })
    const eligibles = st.pret.filter((k) => !enVol.has(k) && !termine.has(k) && !differes.has(k) && !SAUTER.has(k) && (!SEULEMENT || SEULEMENT.has(k)))
    const cle = eligibles.find((k) => !tentatives[k]) || eligibles[0]
    if (cle) {
      idle = 0
      const info = st.lots.find((l) => l.key === cle)
      enVol.add(cle)
      devActifs++
      let r
      try { r = await chaine(cle, info) } catch (e) { r = { resultat: 'bloque', cause: `exception : ${e}` } }
      devActifs--
      await apresChaine(cle, info, r)
      evt.notify()
      continue
    }
    const restants = st.lots.filter((l) => !['fusionne', 'bloque'].includes(l.etat) && !termine.has(l.key) && !SAUTER.has(l.key) && (!SEULEMENT || SEULEMENT.has(l.key)))
    if (!restants.length) return
    if (queueCI.length || ciActif || devActifs > 0) { await evt.wait(); continue }
    idle++
    if (idle > MAX_IDLE) { log(`voie de développement : ${restants.length} lots restants sans progrès après ${MAX_IDLE} attentes`); return }
    const raison = `aucun lot prêt — attente ${st.attente.length}, tenus ailleurs ${st.tenu_ailleurs.join(',') || '0'}, chevauchement ${st.chevauchement.join(',') || '0'}, différés ${[...differes.keys()].join(',') || '0'}`
    await appel(attentePrompt(20, raison), { label: `attente:dev${id}#${idle}`, phase: 'Ordonnancer', schema: SIMPLE, model: MODELE.mecanique, effort: 'low' })
  }
}

const finirCI = (item, resultat, detail) => {
  const i = queueCI.indexOf(item)
  if (i >= 0) queueCI.splice(i, 1)
  enVol.delete(item.key)
  termine.set(item.key, { resultat, pr: item.pr, issue: item.issue, detail })
  noter(item.key, resultat, detail)
}

const traiterVerdict = async (item, v) => {
  if (v.pr) item.pr = v.pr
  if (v.head_sha) item.dernierSha = v.head_sha
  if (v.etat === 'fusionnee-ailleurs') {
    const defauts = (v.echecs || []).filter((e) => !(v.prealables || []).includes(e))
    let rep = null
    if (defauts.length && !item.reparation) {
      rep = await appel(reparerPrompt(item, v), { label: `reparer:${item.key}`, phase: 'Corriger', schema: REPARATION, model: MODELE.corriger, effort: 'high' })
      log(`${item.key} : ${rep && rep.pushed && rep.pr ? `réparation de dev en PR #${rep.pr}` : 'réparation non poussée'} — ${rep ? String(rep.cause).slice(0, 160) : 'aucun rendu'}`)
    }
    const vu = rep ? { ...v, detail: `${v.detail} | réparation : ${rep.pushed && rep.pr ? 'PR #' + rep.pr : rep.cause}`.slice(0, 1500) } : v
    await appel(livrerPrompt(item, vu, true, true), { label: `consigner:${item.key}`, phase: 'Livrer', schema: LIVRAISON, model: MODELE.livrer, effort: 'medium' })
    finirCI(item, 'fusionne', `PR #${item.pr} fusionnée par un tiers ; preuve ${defauts.length ? 'ROUGE' : (v.echecs || []).length ? 'rouge préalable' : v.detail || 'verte'}`)
    if (rep && rep.pushed && rep.pr) {
      const cle = `${item.key}-reparation`
      enVol.add(cle)
      queueCI.push({ key: cle, platform: item.platform, branch: rep.branch, pr: rep.pr, issue: item.issue, essai: 0, attentes: 0, resync: 0, preuveEnCours: false, reparation: true })
    }
    return
  }
  if (v.etat === 'fermee' || v.etat === 'erreur') {
    await bloquer(item.key, item, item.issue, `PR ${v.etat} : ${v.detail}`, true)
    return finirCI(item, 'bloque', `PR ${v.etat}`)
  }
  if (v.etat === 'en-cours') {
    item.preuveEnCours = true
    item.attentes++
    if (item.attentes > MAX_ATTENTES) {
      await bloquer(item.key, item, item.issue, `la CI n'a pas conclu en ${MAX_ATTENTES} passages du guichet`, true)
      return finirCI(item, 'bloque', 'CI sans conclusion')
    }
    return
  }
  if (v.etat === 'vert' || v.etat === 'rouge-prealable') {
    const liv = await appel(livrerPrompt(item, v, item.resync >= MAX_RESYNC), { label: `livrer:${item.key}#${item.resync}`, phase: 'Livrer', schema: LIVRAISON, model: MODELE.livrer, effort: 'medium' })
    if (liv && liv.etat === 'fusionnee') return finirCI(item, 'fusionne', `PR #${item.pr} → ${liv.merge_sha}${v.etat === 'rouge-prealable' ? ' (rouge préalable de dev)' : ''}${liv.derive.length ? ` ; dérive : ${liv.derive.join(', ')}` : ''}`)
    if (liv && liv.etat === 'resync') {
      item.resync++
      item.preuveEnCours = false
      log(`${item.key} : dev a touché ${liv.derive.join(', ')} depuis la preuve — resynchronisation ${item.resync}/${MAX_RESYNC}`)
      return
    }
    item.preuveEnCours = false
    item.attentes++
    return
  }
  item.essai++
  item.preuveEnCours = false
  if (item.essai > MAX_FIX) {
    await bloquer(item.key, item, item.issue, `${v.etat} après ${MAX_FIX} corrections : ${v.echecs.join(' ; ').slice(0, 1500)}`, true)
    return finirCI(item, 'bloque', `${v.etat} après ${MAX_FIX} corrections`)
  }
  const fix = await appel(corrigerPrompt(item, v, item.essai), { label: `corriger:${item.key}#${item.essai}`, phase: 'Corriger', schema: FIX, model: MODELE.corriger, effort: 'high' })
  log(`${item.key} · correction ${item.essai}/${MAX_FIX} : ${fix ? (fix.pushed ? 'poussée' : 'rien poussé') + ' — ' + String(fix.cause).slice(0, 160) : 'aucun rendu'}`)
}

const ciLane = async () => {
  for (let tour = 0; tour < 600; tour++) {
    if (!queueCI.length) {
      if (devTermine) return
      await evt.wait()
      continue
    }
    ciActif = true
    const lot = queueCI.slice(0, GUICHET_MAX)
    const g = await appel(guichetPrompt(lot), { label: `guichet#${tour}`, phase: 'Prouver', schema: GUICHET, model: MODELE.prouver, effort: 'medium' })
    for (const item of lot) {
      const v = g && g.verdicts.find((x) => x.key === item.key)
      if (!v) { item.attentes++; if (item.attentes > MAX_ATTENTES) finirCI(item, 'bloque', 'guichet sans verdict'); continue }
      log(`${item.key} · PR #${v.pr || item.pr} @ ${(v.head_sha || '').slice(0, 10)} (dev ${String(v.dev_base || '').slice(0, 10)}) : ${v.etat}${v.echecs.length ? ` — ${v.echecs.slice(0, 2).join(' ; ').slice(0, 200)}` : ''}`)
      await traiterVerdict(item, v)
    }
    ciActif = false
    evt.notify()
  }
}

// ---------------------------------------------------------------------------
// DÉROULÉ
// ---------------------------------------------------------------------------
if (!ATTR) {
  log("args.attribution manque : passe les lignes « Co-Authored-By: … » et « Claude-Session: https://claude.ai/code/session_… » de la session qui lance le workflow.")
  return { etat: 'arguments', message: 'attribution obligatoire (lignes Co-Authored-By et Claude-Session de la session qui lance)' }
}
log(`signatures du chantier reconnues comme « nous » : ${SIGNATURES.join(' ; ')}`)

phase('Préparer')
const prep = await appel(prepPrompt(), { label: 'preparer', phase: 'Préparer', schema: PREP, model: 'sonnet', effort: 'medium' })
if (!prep || !prep.pret) {
  log(`préparation impossible : ${prep ? prep.rapport : 'aucun rendu'}`)
  return { etat: 'non-prepare', prep }
}
log(`dev @ ${prep.dev_head} ; registre ${prep.registre_restaure ? 'restauré depuis #' + CHANTIER : 'initialisé depuis la graine'} ; outillage PR #${prep.pr_outillage || '—'}${prep.outillage_fusionne ? ' fusionnée' : ''}`)

let conso = null
if (!prep.registre_restaure || A.recartographier) {
  phase('Cartographier')
  const rendus = await parallel(['F1', 'F2', 'F3', 'F4'].map((fid) => () =>
    appel(cartoPrompt(fid), { label: `carto:${fid}`, phase: 'Cartographier', schema: CARTO, model: MODELE.carto, effort: 'high' }).then((c) => {
      if (c) log(`${fid} : iOS ${c.ios.filter((x) => x.verdict === 'tenu').length}/${c.ios.length} clauses tenues, Android ${c.android.filter((x) => x.verdict === 'tenu').length}/${c.android.length} ; ${c.lots.length} lots proposés ; ${c.criteres_ajoutes.length} critères ajoutés`)
      else log(`${fid} : cartographie sans rendu`)
      return c
    })))
  const cartos = rendus.filter(Boolean)
  phase('Consolider')
  conso = await appel(consoPrompt(cartos), { label: 'consolider', phase: 'Consolider', schema: CONSO, model: MODELE.carto, effort: 'high' })
  if (!conso) return { etat: 'cartographie-non-consolidee', cartos: cartos.map((c) => c.feature) }
  log(`registre : +${conso.lots_ajoutes.length} lots (${conso.lots_ajoutes.join(', ')}) ; exclus ${conso.exclus.join(', ') || '—'} ; manques ${conso.manques.length}`)
  conso.manques.forEach((m) => log(`MANQUE : ${m}`))
}

const A_VERIFIER = Array.isArray(A.aVerifier) ? A.aVerifier.filter((x) => x && x.key && x.pr) : []
A_VERIFIER.forEach((x) => {
  const plateforme = x.platform || 'android'
  enVol.add(x.key)
  queueCI.push({ key: x.key, platform: plateforme, branch: branche(plateforme, x.key), pr: x.pr, issue: x.issue || 0, essai: 0, attentes: 0, resync: 0, preuveEnCours: true, adopte: true })
  log(`${x.key} : PR #${x.pr} fusionnée avant sa preuve — le guichet lit la preuve a posteriori`)
})

phase('Ordonnancer')
const travailleurs = Array.from({ length: DEV_PAR }, (_, i) => devWorker(i + 1))
const voieDev = Promise.all(travailleurs).then(() => { devTermine = true; evt.notify() })
await Promise.all([voieDev, ciLane()])

phase('Bilan')
const final = await statut('statut:final')
const etat = {
  fusionnes: [...termine.entries()].filter(([, r]) => r.resultat === 'fusionne').map(([k, r]) => ({ k, pr: r.pr, issue: r.issue })),
  tenus: [...termine.entries()].filter(([, r]) => r.resultat === 'deja-tenu').map(([k, r]) => ({ k, issue: r.issue })),
  bloques: [...termine.entries()].filter(([, r]) => r.resultat === 'bloque').map(([k, r]) => ({ k, issue: r.issue, cause: String(r.cause || r.detail || '').slice(0, 300) })),
  ailleurs: [...termine.entries()].filter(([, r]) => r.resultat === 'tenu-ailleurs').map(([k]) => k),
  restants: final ? final.lots.filter((l) => l.etat !== 'fusionne').map((l) => `${l.key}:${l.etat}`) : [],
  dette_web: conso ? conso.dette_web : [],
  journal: journal.slice(-80),
}
const bilan = await appel(bilanPrompt(etat), { label: 'bilan', phase: 'Bilan', schema: BILAN, model: MODELE.bilan, effort: 'medium' })
return { etat, bilan }
