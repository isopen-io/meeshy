export const meta = {
  name: 'meeshy-perf-mobile',
  description:
    "Grands gains de performance sur iOS et Android, lot par lot : relevé point par point (démarrage, listes, fil principal, mémoire, cache d'abord, re-rendus, médias, réseau), contestation de chaque constat, classement par gain, conception à plusieurs angles, optimisation en TDD, contre-vérification à trois regards pour une meilleure solution, épreuve sur l'arbre fusionné et la CI, puis livraison /ship (PR vers dev, fusion au vert, issue fermée avec sa preuve) et validation finale sur dev",
  whenToUse:
    "« Rends l'app iOS / Android plus rapide », « chasse les lenteurs », passe de performance générale ou ciblée. Args, tous optionnels : { plateformes ['ios','android'], axes [clés de la table AXES], perimetre (texte libre : un écran, un module, un parcours), lots (3 : nombre de lots livrés), constatsParPoint (4), angles (3 : conceptions concurrentes par lot), toursContre (2), toursEpreuve (2), branche (branche de travail de la session, sinon la branche courante), attribution (lignes Co-Authored-By + Claude-Session), base ('dev'), releverSeulement (false : s'arrêter après le classement, issues ouvertes, rien d'écrit) }.",
  phases: [
    { title: 'Préparer', detail: 'branche alignée sur dev, arbre préparé, outillage de mesure et issues de performance déjà ouvertes' },
    { title: 'Relever', detail: 'un auditeur par plateforme × point de contrôle, constats situés et chiffrés' },
    { title: 'Contester', detail: 'un sceptique par constat : réel, sur un chemin chaud, pas déjà traité ?' },
    { title: 'Classer', detail: 'jumeaux iOS/Android réunis, lots sans fichier commun, issues ouvertes, ce qui est écarté est dit' },
    { title: 'Concevoir', detail: 'plusieurs conceptions concurrentes par lot, un juge retient et greffe' },
    { title: 'Optimiser', detail: 'témoin rouge poussé tôt, puis le minimum qui le fait passer' },
    { title: 'Contre-vérifier', detail: 'trois regards indépendants : comportement, gain réel, meilleure solution' },
    { title: 'Éprouver', detail: 'dev fusionnée dans la branche, gardes rejouées sur l’arbre fusionné, CI au SHA' },
    { title: 'Livrer', detail: '/ship : PR vers dev, audit des lots sensibles, fusion au vert, issue fermée avec sa preuve' },
    { title: 'Valider', detail: 'relecture indépendante de dev après fusion, bilan, suivis ouverts en issues' },
  ],
}

// ---------------------------------------------------------------------------
// PARAMÈTRES — vérifiés en tête (leçon 102 : args peut ne pas arriver)
// ---------------------------------------------------------------------------
const A = args && typeof args === 'object' && !Array.isArray(args) ? args : {}
const REPO = '/home/user/meeshy'
const GH = 'isopen-io/meeshy'
const entier = (v, defaut, min, max) => (Number.isInteger(v) && v >= min ? Math.min(v, max) : defaut)
const BASE = typeof A.base === 'string' && A.base ? A.base : 'dev'
const NB_LOTS = entier(A.lots, 3, 1, 12)
const PAR_POINT = entier(A.constatsParPoint, 4, 1, 10)
const NB_ANGLES = entier(A.angles, 3, 1, 3)
const TOURS_CONTRE = entier(A.toursContre, 2, 1, 4)
const TOURS_EPREUVE = entier(A.toursEpreuve, 2, 1, 4)
const RELEVER_SEULEMENT = A.releverSeulement === true
const PERIMETRE = typeof A.perimetre === 'string' && A.perimetre.trim() ? A.perimetre.trim() : ''
const BRANCHE_DEMANDEE = typeof A.branche === 'string' && A.branche ? A.branche : ''
const ATTR = typeof A.attribution === 'string' && A.attribution ? A.attribution : ''
const SESSION_URL = (ATTR.match(/Claude-Session: (\S+)/) || [])[1] || ''
const GARDES_ANDROID = `bash ${REPO}/.claude/workflows/meeshy-dev-vert-android.gardes/run.sh`

const PLATEFORMES_CONNUES = {
  ios: {
    nom: 'iOS',
    racines: 'apps/ios/Meeshy, packages/MeeshySDK/Sources',
    regles: 'apps/ios/CLAUDE.md, packages/MeeshySDK/CLAUDE.md',
    outils:
      'scripts/ios-perf-benchmark.sh (MeeshyTests/Performance, RUN_PERF_BENCHMARKS=1), apps/ios/scripts/probe-conversation-open.sh, .github/workflows/ios.yml, sdk-tests.yml, ios-wmo-probe.yml',
  },
  android: {
    nom: 'Android',
    racines: 'apps/android/app, apps/android/feature, apps/android/core, apps/android/sdk-core, apps/android/sdk-ui',
    regles: 'apps/android/CLAUDE.md, apps/android/ARCHITECTURE.md, apps/android/decisions.md',
    outils:
      'apps/android/app/src/main/baseline-prof.txt, apps/android/scripts/startup-profile, apps/android/scripts/check-file-budget.sh, .github/workflows/android.yml',
  },
}
const AXES = {
  demarrage: {
    titre: 'Démarrage à froid et première image',
    cherche:
      "ce qui s'exécute avant la première image utile : initialisations de singletons, E/S disque ou réseau synchrones, décodage, injection, migrations de base, polices et catalogues chargés d'un bloc ; sur Android le profil de référence (baseline profile) et son contenu réel ; sur iOS le travail fait dans App.init, les +load et statiques, les premières vues qui attendent le réseau",
  },
  listes: {
    titre: 'Listes, défilement et frappe',
    cherche:
      "les cellules des listes chaudes (liste de conversations, fil de messages, fil de posts, réels) : identités instables, calculs dans le corps de la vue, formatage de dates et de texte par cellule, images non dimensionnées, mises en page mesurées deux fois, diff de liste en O(n²), clés manquantes (LazyColumn key/contentType, ForEach id), Equatable absent sur une cellule",
  },
  rerendus: {
    titre: 'Re-rendus et recompositions inutiles',
    cherche:
      "SwiftUI : @ObservedObject / @EnvironmentObject sur des singletons globaux dans des feuilles, @Published trop large, vues qui se réévaluent à chaque frappe ; Compose : paramètres instables (List, lambdas recréées, classes non @Stable/@Immutable), lecture d'état trop haute dans l'arbre, collectAsState sur un flux qui émet des égaux, derivedStateOf manquant",
  },
  filprincipal: {
    titre: 'Fil principal et concurrence',
    cherche:
      "tout travail bloquant sur le fil principal : JSON, base (GRDB / Room), chiffrement, images, fichiers, regex, tri de grandes collections ; @MainActor trop large, Dispatchers.Main ou runBlocking, verrous contendus, tâches non annulées qui continuent après la sortie de l'écran, rafales d'événements socket appliquées une par une au lieu d'être regroupées",
  },
  memoire: {
    titre: 'Mémoire et rétention',
    cherche:
      "cycles de rétention (closures, délégués, Combine, Job / scope non annulé), écouteurs jamais retirés, caches non bornés, images gardées en pleine résolution, ViewModel qui survit à son écran, collections qui grossissent sans limite, copies de gros tableaux par valeur",
  },
  cache: {
    titre: "Cache d'abord, réseau ensuite",
    cherche:
      "tout écran qui montre un indicateur d'attente alors que le cache a des données, toute lecture réseau refaite sans condition, requêtes en cascade ou N+1 côté client, pagination qui recharge la première page, charge utile décodée deux fois, absence de mise à jour optimiste sur une action, préchargement manquant sur le parcours nominal",
  },
  medias: {
    titre: 'Images, audio et vidéo',
    cherche:
      "décodage d'image hors cible (taille d'affichage ignorée), miniatures absentes, lecteurs créés par cellule, décodage logiciel là où le matériel existe, préchargement des réels et des stories, animations portées par le CPU au lieu du serveur de composition, sessions audio rouvertes à chaque lecture",
    agentType: 'lecture-media',
  },
  persistance: {
    titre: 'Base locale et sérialisation',
    cherche:
      "requêtes sans index, lectures ligne à ligne dans une boucle, transactions par élément au lieu d'un lot, observation de tables entières pour une ligne, encodage / décodage répété du même objet, colonnes JSON relues à chaque affichage, écritures synchrones pendant le défilement",
  },
}

const PLATEFORMES = (Array.isArray(A.plateformes) ? A.plateformes : ['ios', 'android']).filter(p => PLATEFORMES_CONNUES[p])
const AXES_RETENUS = (Array.isArray(A.axes) ? A.axes : Object.keys(AXES)).filter(a => AXES[a])
if (!PLATEFORMES.length || !AXES_RETENUS.length) {
  return { arret: `args invalides : plateformes parmi ${Object.keys(PLATEFORMES_CONNUES)}, axes parmi ${Object.keys(AXES)}` }
}
const POINTS = PLATEFORMES.flatMap(p => AXES_RETENUS.map(a => ({ plateforme: p, axe: a })))
log(`${POINTS.length} points de contrôle (${PLATEFORMES.join(' + ')} × ${AXES_RETENUS.length} axes), ${NB_LOTS} lot(s) livré(s) au plus${PERIMETRE ? `, périmètre : ${PERIMETRE}` : ''}`)

// ---------------------------------------------------------------------------
// SOCLE COMMUN
// ---------------------------------------------------------------------------
const SOCLE = `
DÉPÔT ${GH}, clone ${REPO} (vérifie « test -d ${REPO} » avant tout cd ; ne devine jamais un autre chemin). Base ${BASE}.
${PERIMETRE ? `PÉRIMÈTRE DEMANDÉ : ${PERIMETRE}. Hors de ce périmètre, rien ne se relève ni ne se touche.` : ''}

CE QU'EST UN GAIN ICI
- Une lenteur est un BUG. Le gain visé est celui que l'utilisateur VOIT : temps avant la première image utile, images
  perdues pendant un geste, attente après une action, mémoire qui reste une fois l'écran quitté.
- Un gain porte TOUJOURS son type de preuve, et le mot n'est jamais gonflé :
  « mesuré » (un chiffre avant, un chiffre après, même protocole, sur la CI ou un appareil) ;
  « structurel » (un témoin déterministe prouve que le travail n'a plus lieu : nombre de requêtes, de recompositions,
  d'allocations, de passes, complexité, appel absent du fil principal) ;
  « à mesurer sur appareil » (ni l'un ni l'autre n'est joignable d'ici : une issue de mesure est ouverte, le gain n'est
  PAS annoncé).
- Une optimisation ne change AUCUN comportement observable. Un raccourci qui produit un effet visible avant son
  contrôle (accès, confidentialité, Prisme, présence) est un défaut, pas un gain (leçon 54).

CE QUE CE CONTENEUR PEUT ET NE PEUT PAS
- Ni Xcode ni simulateur ici. iOS se prouve par la CI (.github/workflows/ios.yml, sdk-tests.yml) et par les gardes de
  texte : apps/ios/scripts/check_house_rules.sh, check_cohesion_budget.sh, check_test_registration.sh,
  node scripts/check-accent-color-hardcoding.mjs, et le projet Xcode régénéré quand un fichier s'ajoute
  (ios-xcodegen-sync.yml dit si la CI le fait).
- Aucun Gradle Android en local (dl.google.com refusé). Android se prouve par android.yml (assembleDebug +
  testDebugUnitTest) et par les gardes locales : ${GARDES_ANDROID} (sortie 0 et « GARDES PROPRES »).
- La CI des PR peut être gelée (vars.PR_CI_GEL) : un job « skipped » ne prouve rien. Lis le workflow pour savoir s'il
  accepte workflow_dispatch et déclenche-le sur la branche (mcp__github__actions_run_trigger).
- Suivre un run : curl -sS "https://api.github.com/repos/${GH}/actions/runs/<id>/jobs?per_page=50" marche sans jeton.
  Les journaux ne se lisent que par mcp__github__get_job_logs (return_content, tail_lines ≤ 5000).
- Attendre un run : jamais de sleep au premier plan, et jamais « j'attendrai » comme réponse finale. Lance une boucle
  de surveillance en arrière-plan (Bash run_in_background, curl toutes les 90 s, sort au verdict) et reste bloqué
  dessus jusqu'au verdict réel.
- bun install --ignore-scripts --no-save ; bun.lock ne se committe jamais d'ici.

RÈGLES DU DÉPÔT QUI GOUVERNENT CE TRAVAIL
- Aucune écriture sans issue : chaque lot a son issue dans ${GH} (milestone nommé par le résultat, projet « Meeshy —
  pilotage »). Ce qu'on découvre en chemin devient une issue, jamais une ligne dans un fichier.
- Règle d'asymétrie : avant d'écrire, git fetch puis regarde les branches vivantes et les PR ouvertes qui touchent
  tes fichiers. Si une autre a déjà écrit, tu cèdes ce fichier et tu le dis.
- Lois à miroirs : une règle partagée (Prisme, présence, accent, fenêtre de préchargement) évolue sur iOS ET Android ;
  un gain trouvé sur une plateforme se cherche sur l'autre.
- Le SDK reste pur : orchestration côté app, briques côté SDK. Budgets : fichier ≤ 1200 lignes, fonction ≤ 80 lignes.
- TDD : aucun code de production sans témoin rouge d'abord. Un témoin teste un COMPORTEMENT, ne dépend ni de la langue
  ni de l'horloge du poste, et un témoin de performance est déterministe (compte, borne, absence), jamais un
  chronomètre fragile.
- Jamais de force-push, jamais de push direct sur ${BASE}, jamais de test désactivé pour verdir. Tu ne pousses pas sur
  la branche d'une PR que tu n'as pas ouverte.
- Commit : message en français qui dit le résultat${ATTR ? `, terminé par les lignes\n${ATTR}` : ', terminé par les lignes d’attribution de la session si elle en donne'}
- PR : sections du gabarit .github/pull_request_template.md, corps terminé par
  « 🤖 Generated with [Claude Code](https://claude.com/claude-code) »${SESSION_URL ? ` puis ${SESSION_URL}` : ''}.
  Aucun identifiant de modèle dans un commit, une PR ou un code.
- Tout commentaire GitHub finit par « --- » puis « _Generated by [Claude Code](https://claude.ai/code)_ ».
- Outils GitHub par ToolSearch (« select:mcp__github__… ») ; recherche : gh api -X GET search/issues -f q='repo:${GH} …'.
- Push : git push -u origin <branche>, réessayé 4 fois (2, 4, 8, 16 s) sur erreur réseau seulement.
`

// ---------------------------------------------------------------------------
// SCHÉMAS
// ---------------------------------------------------------------------------
const NIVEAU = { type: 'string', enum: ['fort', 'moyen', 'faible'] }
const PREUVE = { type: 'string', enum: ['mesuré', 'structurel', 'à mesurer sur appareil'] }
const PREPARE = {
  type: 'object',
  properties: {
    branche: { type: 'string' },
    devSha: { type: 'string' },
    arbrePret: { type: 'boolean' },
    outillage: { type: 'string', description: 'ce qui mesure déjà la performance sur chaque plateforme, et ce que la CI en exécute réellement' },
    issuesOuvertes: { type: 'string', description: 'issues et PR de performance déjà ouvertes : numéro, titre, fichiers visés' },
    obstacles: { type: 'string' },
  },
  required: ['branche', 'devSha', 'arbrePret', 'outillage', 'issuesOuvertes'],
}
const CONSTAT = {
  type: 'object',
  properties: {
    titre: { type: 'string', description: 'ce que l’utilisateur subit, en une phrase' },
    fichiers: { type: 'array', items: { type: 'string' }, description: 'chemin:ligne' },
    cause: { type: 'string' },
    cheminChaud: { type: 'string', description: 'pourquoi ce code s’exécute souvent ou au pire moment, avec l’appelant' },
    preuve: { type: 'string', description: 'ce qui a été lu ou exécuté pour l’établir' },
    temoin: { type: 'string', description: 'le témoin déterministe ou la mesure qui prouverait le gain' },
    gain: NIVEAU,
    risque: NIVEAU,
    jumeau: { type: 'string', description: 'le même défaut probable sur l’autre plateforme : où regarder' },
  },
  required: ['titre', 'fichiers', 'cause', 'cheminChaud', 'preuve', 'temoin', 'gain', 'risque'],
}
const RELEVE = {
  type: 'object',
  properties: {
    constats: { type: 'array', items: CONSTAT },
    nonRetenus: { type: 'array', items: { type: 'string' }, description: 'constats plus faibles, non développés' },
    sain: { type: 'string', description: 'ce qui a été vérifié et trouvé juste' },
  },
  required: ['constats'],
}
const CONTESTE = {
  type: 'object',
  properties: {
    tient: { type: 'boolean' },
    raison: { type: 'string' },
    dejaTraite: { type: 'string', description: 'issue, PR ou branche vivante qui le couvre déjà, sinon vide' },
    gain: NIVEAU,
    risque: NIVEAU,
    precision: { type: 'string', description: 'ce que le constat a manqué ou mal situé' },
  },
  required: ['tient', 'raison', 'gain', 'risque'],
}
const LOT = {
  type: 'object',
  properties: {
    slug: { type: 'string' },
    titre: { type: 'string', description: 'le résultat attendu pour l’utilisateur' },
    issue: { type: 'integer' },
    plateformes: { type: 'array', items: { type: 'string' } },
    constats: { type: 'array', items: { type: 'string' }, description: 'les constats réunis, cause et fichiers compris' },
    fichiers: { type: 'array', items: { type: 'string' } },
    temoin: { type: 'string' },
    gain: NIVEAU,
    sensible: { type: 'boolean', description: 'touche crypto, auth, contrôle d’accès, migration de données ou protocole' },
  },
  required: ['slug', 'titre', 'issue', 'plateformes', 'constats', 'fichiers', 'temoin', 'gain', 'sensible'],
}
const PLAN = {
  type: 'object',
  properties: {
    lots: { type: 'array', items: LOT },
    ecartes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { titre: { type: 'string' }, raison: { type: 'string' }, issue: { type: 'integer' } },
        required: ['titre', 'raison'],
      },
    },
  },
  required: ['lots', 'ecartes'],
}
const CONCEPTION = {
  type: 'object',
  properties: {
    approche: { type: 'string' },
    etapes: { type: 'array', items: { type: 'string' } },
    temoinRouge: { type: 'string' },
    gainAttendu: { type: 'string' },
    risques: { type: 'string' },
    ceQuiNeChangePas: { type: 'string', description: 'les comportements observables à tenir, et le témoin qui les tient' },
  },
  required: ['approche', 'etapes', 'temoinRouge', 'gainAttendu', 'risques', 'ceQuiNeChangePas'],
}
const OUVRAGE = {
  type: 'object',
  properties: {
    fait: { type: 'boolean' },
    sha: { type: 'string' },
    fichiers: { type: 'array', items: { type: 'string' } },
    temoins: { type: 'array', items: { type: 'string' } },
    typePreuve: PREUVE,
    avant: { type: 'string' },
    apres: { type: 'string' },
    cede: { type: 'string', description: 'ce qui a été cédé à une branche vivante, sinon vide' },
    obstacle: { type: 'string' },
  },
  required: ['fait', 'typePreuve'],
}
const REGARD = {
  type: 'object',
  properties: {
    bloquant: { type: 'boolean' },
    defauts: { type: 'array', items: { type: 'string' }, description: 'chemin:ligne, ce qui casse, comment le reproduire' },
    meilleureSolution: { type: 'string', description: 'une solution nettement meilleure, sinon vide' },
    gainConfirme: { type: 'string' },
  },
  required: ['bloquant', 'defauts'],
}
const EPREUVE = {
  type: 'object',
  properties: {
    vert: { type: 'boolean' },
    sha: { type: 'string' },
    devShaContenu: { type: 'string' },
    runs: { type: 'array', items: { type: 'string' }, description: 'workflow, id du run, conclusion' },
    echecs: { type: 'array', items: { type: 'string' } },
    nonProuve: { type: 'string', description: 'ce qu’aucune CI joignable n’a exécuté' },
  },
  required: ['vert', 'echecs'],
}
const LIVRAISON = {
  type: 'object',
  properties: {
    livre: { type: 'boolean' },
    pr: { type: 'integer' },
    mergeSha: { type: 'string' },
    issueFermee: { type: 'boolean' },
    suivis: { type: 'array', items: { type: 'integer' }, description: 'issues ouvertes pour les dimensions non mûres' },
    raison: { type: 'string' },
  },
  required: ['livre'],
}
const BILAN = {
  type: 'object',
  properties: {
    resume: { type: 'string' },
    valides: { type: 'array', items: { type: 'string' } },
    regressions: { type: 'array', items: { type: 'string' } },
    suivis: { type: 'array', items: { type: 'integer' } },
  },
  required: ['resume', 'valides', 'regressions'],
}

const json = v => JSON.stringify(v, null, 1)
const poids = { fort: 3, moyen: 2, faible: 1 }

// ---------------------------------------------------------------------------
// 1. PRÉPARER
// ---------------------------------------------------------------------------
phase('Préparer')
const prep = await agent(
  `${SOCLE}
TÂCHE — préparer le terrain, sans rien optimiser.
1. cd ${REPO} ; git fetch origin ${BASE}. Branche de travail : ${BRANCHE_DEMANDEE || 'la branche courante (git branch --show-current)'}.
   Si elle ne contient pas la tête de origin/${BASE}, fusionne origin/${BASE} dedans (jamais de rebase), pousse.
   Si l'arbre porte du travail non committé qui n'est pas le tien, n'y touche pas et dis-le dans obstacles.
2. Prépare l'arbre : bun install --ignore-scripts --no-save ; dans packages/shared : npx prisma generate --generator
   client puis bun run build. ${PLATEFORMES.includes('android') ? `Lance ${GARDES_ANDROID} et note sa sortie.` : ''}
3. Inventorie l'outillage de mesure de chaque plateforme (${PLATEFORMES.map(p => PLATEFORMES_CONNUES[p].outils).join(' ; ')}) :
   ce qui existe, ce que la CI exécute VRAIMENT (lis les workflows : déclencheurs, filtres de chemin, jobs gelés),
   ce qui n'est joignable que sur appareil.
4. Liste les issues et PR OUVERTES qui parlent de performance, lenteur, fluidité, mémoire, démarrage sur
   ${PLATEFORMES.map(p => PLATEFORMES_CONNUES[p].nom).join(' et ')} (recherche par mots, puis lecture) et les branches
   vivantes des 7 derniers jours qui touchent ${PLATEFORMES.map(p => PLATEFORMES_CONNUES[p].racines).join(', ')}.
   Pour chacune : numéro, titre, fichiers visés. Parcours aussi ls tasks/lessons | grep -i -E 'perf|lent|fluid|cache|memoire'.`,
  { label: 'préparer', phase: 'Préparer', schema: PREPARE },
)
if (!prep || !prep.arbrePret) {
  return { arret: 'préparation impossible', detail: prep }
}
const BRANCHE = prep.branche
const TERRAIN = `
TERRAIN (relevé à la préparation, tête de ${BASE} ${prep.devSha})
- Branche de travail : ${BRANCHE}
- Outillage de mesure : ${prep.outillage}
- Déjà ouvert (ne pas doubler) : ${prep.issuesOuvertes}
${prep.obstacles ? `- Obstacles : ${prep.obstacles}` : ''}
`

// ---------------------------------------------------------------------------
// 2-3. RELEVER point par point, puis CONTESTER chaque constat
// ---------------------------------------------------------------------------
const releves = await pipeline(
  POINTS,
  point => {
    const pf = PLATEFORMES_CONNUES[point.plateforme]
    const axe = AXES[point.axe]
    return agent(
      `${SOCLE}${TERRAIN}
TÂCHE — relever, en LECTURE SEULE, le point de contrôle « ${axe.titre} » sur ${pf.nom}.
Code : ${pf.racines}. Règles du domaine : ${pf.regles}.${point.plateforme === 'android' ? " Le Kotlin natif est dégelé (directive 2026-10-22) : apps/android est bien la cible, pas la coque Capacitor." : ''}
Ce que tu cherches : ${axe.cherche}.

Méthode, dans cet ordre :
1. Pars des PARCOURS chauds (lancement, liste de conversations, ouverture d'une conversation, envoi d'un message,
   défilement d'un fil, réels et stories), pas d'un balayage alphabétique. Suis chaque parcours jusqu'au code exécuté.
2. Pour chaque défaut : situe-le (chemin:ligne), nomme son APPELANT et sa fréquence (par image, par cellule, par
   frappe, par événement socket, une fois au lancement), et dis ce que l'utilisateur subit.
3. Exécute ce qui est exécutable ici pour l'étayer (grep de motifs, comptage de sites, lecture des témoins existants,
   scripts de garde). Ne rapporte rien que tu n'aies lu.
4. Dis quel témoin déterministe ou quelle mesure prouverait le gain, et où est le jumeau probable sur l'autre plateforme.
Rends au plus ${PAR_POINT} constats, les plus forts d'abord ; le reste en une ligne chacun dans nonRetenus. Aucun
constat de style, aucune micro-optimisation hors chemin chaud, rien de ce qui est « déjà ouvert » ci-dessus.`,
      { label: `relever:${point.plateforme}:${point.axe}`, phase: 'Relever', schema: RELEVE, agentType: axe.agentType },
    )
  },
  (releve, point) =>
    parallel(
      ((releve && releve.constats) || []).slice(0, PAR_POINT).map((c, i) => () =>
        agent(
          `${SOCLE}${TERRAIN}
TÂCHE — CONTESTER ce constat de performance (${PLATEFORMES_CONNUES[point.plateforme].nom}, « ${AXES[point.axe].titre} »).
Tu n'es pas là pour l'approuver. En LECTURE SEULE, cherche à le faire tomber :
${json(c)}

1. Le code cité existe-t-il tel que décrit, à la tête de ${BASE} ? Relis-le, et relis son appelant.
2. Est-il sur un chemin chaud, ou s'exécute-t-il une fois, hors écran, derrière un cache, sur un fil de fond ?
3. Le coût est-il réel à l'échelle d'usage (taille des listes, fréquence), ou théorique ?
4. Est-il déjà traité : issue ou PR ouverte, branche vivante, correctif fusionné depuis ?
5. Le remède suggéré casserait-il un comportement (ordre, accès, Prisme, présence, hors-ligne, accessibilité) ?
6. Le témoin proposé peut-il vraiment tomber, ou passerait-il avant comme après ?
Dans le doute, tient = false. Si le constat tient, corrige sa portée (precision) et réévalue gain et risque.`,
          { label: `contester:${point.plateforme}:${point.axe}:${i + 1}`, phase: 'Contester', schema: CONTESTE },
        ).then(v => ({ ...c, plateforme: point.plateforme, axe: point.axe, verdict: v })),
      ),
    ).then(juges => ({
      point,
      sain: (releve && releve.sain) || '',
      nonRetenus: (releve && releve.nonRetenus) || [],
      au_dela: Math.max(0, ((releve && releve.constats) || []).length - PAR_POINT),
      juges: juges.filter(Boolean),
    })),
)

const faits = releves.filter(Boolean)
const pointsPerdus = POINTS.length - faits.length
if (pointsPerdus) log(`${pointsPerdus} point(s) de contrôle sans relevé (agent tombé) : non couverts`)
const tousJuges = faits.flatMap(r => r.juges)
const confirmes = tousJuges
  .filter(c => c.verdict && c.verdict.tient && !c.verdict.dejaTraite)
  .map(c => ({ ...c, gain: c.verdict.gain, risque: c.verdict.risque, precision: c.verdict.precision || '', verdict: undefined }))
  .sort((a, b) => poids[b.gain] * 2 - poids[b.risque] - (poids[a.gain] * 2 - poids[a.risque]))
const refutes = tousJuges.filter(c => !c.verdict || !c.verdict.tient || c.verdict.dejaTraite)
const nonDeveloppes = faits.flatMap(r => r.nonRetenus.map(t => `${r.point.plateforme}/${r.point.axe} : ${t}`))
log(`${tousJuges.length} constats relevés, ${confirmes.length} tiennent, ${refutes.length} réfutés ou déjà traités, ${nonDeveloppes.length} non développés`)

if (!confirmes.length) {
  return { arret: 'aucun constat ne tient après contestation', refutes: refutes.map(c => ({ titre: c.titre, raison: c.verdict && c.verdict.raison })), nonDeveloppes }
}

// ---------------------------------------------------------------------------
// 4. CLASSER — barrière voulue : jumeaux, fichiers disjoints, issues
// ---------------------------------------------------------------------------
phase('Classer')
const plan = await agent(
  `${SOCLE}${TERRAIN}
TÂCHE — composer les lots à partir des constats qui ont tenu, et ouvrir leurs issues. Tu n'écris aucun code.
CONSTATS CONFIRMÉS (classés gain d'abord) :
${json(confirmes)}

1. Réunis en UN lot les jumeaux iOS / Android d'une même cause, et les constats d'une même cause racine. Un lot = un
   résultat que l'utilisateur voit, livrable par UNE PR relisible.
2. Deux lots ne partagent AUCUN fichier. S'ils en partagent, fusionne-les ou écarte le plus faible.
3. Retiens au plus ${NB_LOTS} lots : ceux dont le gain est le plus grand pour le risque le plus faible, en équilibrant
   les plateformes demandées (${PLATEFORMES.join(', ')}). Marque sensible tout lot qui touche crypto, authentification,
   contrôle d'accès, migration de données (Room, GRDB) ou protocole.
4. Pour CHAQUE lot retenu : cherche une issue existante (gh api search/issues), sinon ouvre-la dans ${GH} — titre
   sémantique (le résultat attendu), corps Contexte · Preuve · Critère de fin · source (chemin:ligne), critère de fin
   portant « ${BASE} fusionnée dans la branche, ses corrections gardées, gardes rejouées sur l'arbre fusionné », les
   dimensions visées (2 Performance, 3 Mémoire, 4 Fluidité selon le cas). Milestone de performance existant s'il y en
   a un qui convient ; inscris-la au projet « Meeshy — pilotage » si tes outils le permettent, sinon dis-le dans le corps.
5. Pour CHAQUE constat confirmé NON retenu : une issue aussi (même forme, plus courte), ou le numéro de celle qui
   existe. Rien de ce qui a tenu ne se perd.
Rends les lots dans l'ordre de livraison (les plus sûrs et les plus isolés d'abord), chacun avec son numéro d'issue.`,
  { label: 'classer', phase: 'Classer', schema: PLAN },
)
if (!plan || !plan.lots.length) {
  return { arret: 'aucun lot composé', confirmes: confirmes.map(c => c.titre) }
}
const lots = plan.lots.slice(0, NB_LOTS)
if (plan.lots.length > lots.length) log(`${plan.lots.length - lots.length} lot(s) au-delà de la limite de ${NB_LOTS} : laissés à leurs issues`)
log(`${lots.length} lot(s) : ${lots.map(l => `#${l.issue} ${l.slug}`).join(' · ')} — ${plan.ecartes.length} constat(s) écarté(s), en issues`)

if (RELEVER_SEULEMENT) {
  return { releve: true, lots, ecartes: plan.ecartes, refutes: refutes.length, nonDeveloppes }
}

// ---------------------------------------------------------------------------
// 5-9. PAR LOT, l'un après l'autre : une seule branche, un seul arbre
// ---------------------------------------------------------------------------
const ANGLES = [
  { cle: 'ne-pas-faire', consigne: "NE PAS FAIRE LE TRAVAIL : cache, précalcul, paresse, annulation, regroupement — le coût disparaît parce que le calcul n'a plus lieu ou plus à ce moment-là" },
  { cle: 'cause-racine', consigne: "LA CAUSE RACINE : corriger la structure qui produit le coût (source de vérité unique, bonne structure de données, bon fil, bonne frontière d'observation), même si le changement est plus large" },
  { cle: 'moindre-changement', consigne: 'LE MOINDRE CHANGEMENT : le plus petit diff qui retire l’essentiel du coût, sans toucher aux signatures publiques ni aux fichiers voisins' },
].slice(0, NB_ANGLES)

const contexteLot = lot => `
LOT #${lot.issue} — ${lot.titre}
Plateformes : ${lot.plateformes.join(', ')} · gain attendu : ${lot.gain}${lot.sensible ? ' · LOT SENSIBLE' : ''}
Fichiers : ${lot.fichiers.join(', ')}
Témoin attendu : ${lot.temoin}
Constats réunis :
${lot.constats.map(c => `- ${c}`).join('\n')}
`

const resultats = []
for (const lot of lots) {
  const L = contexteLot(lot)
  const suivi = { issue: lot.issue, slug: lot.slug, titre: lot.titre, etat: 'ouvert' }
  resultats.push(suivi)

  // 5. CONCEVOIR — conceptions concurrentes, puis un juge
  const propositions = (
    await parallel(
      ANGLES.map(angle => () =>
        agent(
          `${SOCLE}${TERRAIN}${L}
TÂCHE — concevoir, en LECTURE SEULE, la solution de ce lot sous UN angle imposé : ${angle.consigne}.
Lis le code cité et ses appelants avant de proposer. Rends l'approche, ses étapes dans l'ordre TDD, le témoin rouge
exact (fichier, nom, ce qu'il affirme, pourquoi il tombe aujourd'hui), le gain attendu avec son type de preuve, les
risques, et la liste des comportements observables qui ne doivent pas bouger avec le témoin qui les tient déjà (ou
qu'il faut écrire). Si ton angle ne mène à rien d'honnête sur ce lot, dis-le plutôt que de forcer.`,
          { label: `concevoir:${lot.slug}:${angle.cle}`, phase: 'Concevoir', schema: CONCEPTION },
        ).then(p => p && { angle: angle.cle, ...p }),
      ),
    )
  ).filter(Boolean)
  if (!propositions.length) {
    suivi.etat = 'abandonné : aucune conception'
    continue
  }
  const retenue =
    propositions.length === 1
      ? propositions[0]
      : await agent(
          `${SOCLE}${L}
TÂCHE — juger ${propositions.length} conceptions concurrentes de ce lot et rendre CELLE à implémenter. LECTURE SEULE.
${json(propositions)}
Vérifie dans le code les affirmations sur lesquelles elles divergent. Critères, dans l'ordre : aucun comportement
observable ne change ; le gain est le plus grand ET prouvable d'ici (mesuré ou structurel) ; une seule source de
vérité, pas de jumelle ; le diff le plus petit à gain égal. Pars de la meilleure et greffe-lui ce que les autres ont
vu de juste (un risque, un témoin, un cas limite). Rends la conception finale, complète, prête à suivre pas à pas.`,
          { label: `juger:${lot.slug}`, phase: 'Concevoir', schema: CONCEPTION },
        )
  if (!retenue) {
    suivi.etat = 'abandonné : jugement tombé'
    continue
  }

  // 6. OPTIMISER — TDD
  let ouvrage = await agent(
    `${SOCLE}${TERRAIN}${L}
CONCEPTION RETENUE :
${json(retenue)}

TÂCHE — implémenter ce lot en TDD sur la branche ${BRANCHE}, dans ${REPO}.
1. git fetch origin ${BASE} ; la branche doit contenir origin/${BASE} (fusionne sinon). Relève les branches vivantes et
   PR ouvertes qui touchent tes fichiers : si l'une a déjà écrit, cède ce fichier (champ cede) et réduis le lot.
2. Commente l'issue #${lot.issue} : travail commencé, branche, conception en trois lignes.
3. ROUGE d'abord : écris le témoin (déterministe), plus les témoins de comportement qui manquent autour du code que tu
   vas toucher. Committe et POUSSE ce squelette tout de suite (réservation par git).
4. VERT : le minimum qui fait passer le témoin. Puis relis : immuabilité, retours anticipés, budgets de taille, SDK pur.
5. Miroirs : si le lot porte les deux plateformes, les deux sont faites dans ce lot ; sinon dis ce que l'autre n'a pas reçu.
6. Rejoue ce qui est jouable ici : ${PLATEFORMES.includes('ios') ? 'gardes iOS de texte' : ''}${PLATEFORMES.length > 1 ? ' ; ' : ''}${PLATEFORMES.includes('android') ? `gardes Android (${GARDES_ANDROID})` : ''} ; suites TS touchées si le lot en touche.
7. Mesure avant / après avec le protocole de la conception si un outil joignable le permet ; sinon le témoin structurel
   fait foi et typePreuve le dit. N'annonce aucun chiffre que tu n'as pas obtenu.
8. Committe par étape, pousse, rends le SHA de tête.`,
    { label: `optimiser:${lot.slug}`, phase: 'Optimiser', schema: OUVRAGE },
  )
  if (!ouvrage || !ouvrage.fait) {
    suivi.etat = `abandonné : ${(ouvrage && (ouvrage.obstacle || ouvrage.cede)) || 'implémentation tombée'}`
    continue
  }

  // 7. CONTRE-VÉRIFIER — trois regards, boucle bornée
  const REGARDS = [
    { cle: 'comportement', consigne: "COMPORTEMENT : cherche ce que ce diff CASSE. Ordre des éléments, états vide / chargement / erreur / hors-ligne, annulation, concurrence (courses, réentrance, fil d'exécution), invalidation du cache (une donnée périmée servie pour toujours est pire qu'une lenteur), accès et confidentialité, Prisme, présence, accessibilité. Un raccourci produit-il un effet avant son contrôle ?" },
    { cle: 'gain', consigne: "GAIN RÉEL : le coût a-t-il vraiment disparu, ou s'est-il déplacé (autre fil saturé, mémoire échangée contre du temps sans borne, travail refait ailleurs) ? Le témoin tombe-t-il vraiment si on retire le correctif (retire-le dans un arbre de travail jetable ou raisonne ligne à ligne) ? Le type de preuve annoncé est-il le bon mot ?" },
    { cle: 'meilleure-solution', consigne: "MEILLEURE SOLUTION : sachant tout ce que le diff montre, existe-t-il une solution nettement plus simple, plus générale ou plus sûre — une API de la plateforme qui fait déjà ce travail, une source de vérité existante, le même défaut ailleurs que ce lot aurait dû couvrir (autres appelants, plateforme jumelle) ? Ne propose que ce qui vaut un nouveau tour." },
  ]
  let tour = 0
  let bloque = true
  let derniersRegards = []
  while (tour < TOURS_CONTRE) {
    tour += 1
    const shaVu = ouvrage.sha
    derniersRegards = (
      await parallel(
        REGARDS.map(r => () =>
          agent(
            `${SOCLE}${L}
TÂCHE — contre-vérifier, en LECTURE SEULE, le lot livré sur ${BRANCHE} au SHA ${shaVu} (tour ${tour}).
Diff à lire : git fetch origin ${BASE} ${BRANCHE} ; git diff origin/${BASE}...${shaVu}. Lis le DIFF et le code autour,
pas le compte rendu de son auteur : tu ne sais de ce lot que ce que git montre.
Ton regard, et lui seul : ${r.consigne}
bloquant = true seulement pour un défaut que tu peux situer (chemin:ligne) et dire comment reproduire, ou pour une
meilleure solution qui change le résultat. Une préférence n'est pas un défaut.`,
            { label: `contre:${lot.slug}:${r.cle}:t${tour}`, phase: 'Contre-vérifier', schema: REGARD },
          ).then(v => v && { regard: r.cle, ...v }),
        ),
      )
    ).filter(Boolean)
    const bloquants = derniersRegards.filter(v => v.bloquant)
    if (derniersRegards.length < REGARDS.length) log(`#${lot.issue} : ${REGARDS.length - derniersRegards.length} regard(s) tombé(s) au tour ${tour}`)
    if (!bloquants.length && derniersRegards.length) {
      bloque = false
      break
    }
    if (!bloquants.length || tour === TOURS_CONTRE) break
    const reprise = await agent(
      `${SOCLE}${L}
TÂCHE — reprendre le lot sur ${BRANCHE} (SHA ${shaVu}) d'après la contre-vérification. Chaque point se VÉRIFIE avant
de se corriger : un défaut confirmé reçoit d'abord son témoin rouge, puis son correctif ; un défaut que tu réfutes se
réfute par une preuve (témoin existant, ligne lue), pas par une opinion. Une meilleure solution retenue REMPLACE
l'ancienne — pas de second chemin laissé à côté.
${json(bloquants)}
Rejoue les gardes jouables ici, committe, pousse, rends le nouveau SHA et le type de preuve à jour.`,
      { label: `reprendre:${lot.slug}:t${tour}`, phase: 'Contre-vérifier', schema: OUVRAGE },
    )
    if (!reprise || !reprise.fait) break
    ouvrage = { ...ouvrage, ...reprise }
  }
  if (bloque) {
    await agent(
      `${SOCLE}${L}
TÂCHE — ce lot n'a pas passé la contre-vérification en ${TOURS_CONTRE} tour(s). Retire-le proprement de ${BRANCHE} :
git revert (jamais de réécriture d'historique) des commits du lot au-delà de origin/${BASE}, pousse, puis commente
l'issue #${lot.issue} avec ce qui bloque, sans la fermer :
${json(derniersRegards.filter(v => v.bloquant))}`,
      { label: `retirer:${lot.slug}`, phase: 'Contre-vérifier' },
    )
    suivi.etat = 'retiré : contre-vérification non passée'
    continue
  }

  // 8. ÉPROUVER — arbre fusionné + CI
  let epreuve = null
  for (let essai = 1; essai <= TOURS_EPREUVE; essai += 1) {
    epreuve = await agent(
      `${SOCLE}${L}
TÂCHE — éprouver le lot sur ${BRANCHE} (essai ${essai}/${TOURS_EPREUVE}).
1. git fetch origin ${BASE} ; fusionne origin/${BASE} DANS ${BRANCHE} (jamais de rebase, jamais de --ours global). En
   cas de conflit, la correction déjà sur ${BASE} se garde et le lot s'y adapte. Pousse.
2. Rejoue sur l'arbre FUSIONNÉ : gardes de texte des plateformes touchées (${lot.plateformes.join(', ')}), suites TS
   touchées, cliquets remesurés sur un export de l'arbre fusionné (git archive).
3. Prouve par la CI au SHA de tête : pour chaque plateforme touchée, le workflow qui compile et teste (android.yml ;
   ios.yml et sdk-tests.yml). S'il ne part pas tout seul sur la branche, déclenche-le (workflow_dispatch). Attends le
   verdict réel, en arrière-plan, sans rendre la main avant.
4. Sur un rouge : lis le journal (mcp__github__get_job_logs), sépare ce que le lot a cassé de ce que ${BASE} portait
   déjà (compare au dernier run de ${BASE}). Corrige à la cause ce que le lot a cassé — témoin d'abord —, pousse, et
   rends vert = false avec les échecs : l'essai suivant reprouvera. Ne désactive aucun test.
5. Dis dans nonProuve ce qu'aucune CI joignable n'a exécuté (mesure sur appareil, profil de trames, mémoire réelle).`,
      { label: `éprouver:${lot.slug}:e${essai}`, phase: 'Éprouver', schema: EPREUVE },
    )
    if (epreuve && epreuve.vert) break
  }
  if (!epreuve || !epreuve.vert) {
    await agent(
      `${SOCLE}${L}
TÂCHE — ce lot n'est pas vert après ${TOURS_EPREUVE} essai(s). Retire-le de ${BRANCHE} par git revert de ses commits
(aucune réécriture d'historique), pousse, et commente l'issue #${lot.issue} avec les échecs restants, sans la fermer :
${json((epreuve && epreuve.echecs) || ['épreuve tombée sans verdict'])}`,
      { label: `retirer:${lot.slug}`, phase: 'Éprouver' },
    )
    suivi.etat = 'retiré : épreuve rouge'
    continue
  }

  // 9. LIVRER — /ship
  const livraison = await agent(
    `${SOCLE}${L}
ÉTAT : branche ${BRANCHE}, SHA ${epreuve.sha || ouvrage.sha}, ${BASE} contenue au SHA ${epreuve.devShaContenu || '(à relever)'}.
Preuve : ${ouvrage.typePreuve} — avant : ${ouvrage.avant || 'n/a'} — après : ${ouvrage.apres || 'n/a'}.
Runs : ${json(epreuve.runs || [])}. Non prouvé d'ici : ${epreuve.nonProuve || 'rien'}.

TÂCHE — LIVRER ce lot (/ship). Si une compétence nommée « ship » figure dans tes compétences disponibles, invoque-la
(outil Skill) et suis-la ; les étapes ci-dessous restent le minimum exigé et s'appliquent telles quelles si elle
n'existe pas.
1. Vérifie que ${BRANCHE} contient TOUJOURS la tête de origin/${BASE}. Sinon : fusionne, pousse, et rends livre = false
   avec raison « ${BASE} a avancé » — l'épreuve doit être rejouée, tu ne fusionnes pas sur une preuve périmée.
2. Ouvre la PR ${BRANCHE} → ${BASE} (gabarit du dépôt, « Closes #${lot.issue} », la preuve et son type écrits tels quels).
${lot.sensible ? '3. LOT SENSIBLE : avant toute fusion, fais-le passer par l’agent auditeur-adversarial (outil Agent, subagent_type auditeur-adversarial) sur le diff de la PR. Un constat bloquant ⇒ livre = false, raison = le constat.' : '3. Lot non sensible : pas d’audit adversarial requis.'}
4. Fusionne quand les contrôles de la PR sont verts ou prouvés par les runs ci-dessus au même SHA (fusion au SHA
   attendu ; ${BASE} est le staging, la fusion automatique y est la règle). Jamais de fusion sur un rouge.
5. Commente l'issue #${lot.issue} : SHA de fusion, SHA de ${BASE} contenu, preuve avec son type, dimensions mûres et
   dimensions qui ne le sont pas. Ouvre UNE issue par dimension non mûre et par mesure « à mesurer sur appareil »
   (protocole exact, appareil, chiffre attendu). Vérifie que l'issue est fermée par la fusion.
6. Réaligne ${BRANCHE} sur origin/${BASE} pour le lot suivant (fusion, pas de réécriture), pousse.`,
    { label: `livrer:${lot.slug}`, phase: 'Livrer', schema: LIVRAISON },
  )
  suivi.preuve = ouvrage.typePreuve
  suivi.avant = ouvrage.avant || ''
  suivi.apres = ouvrage.apres || ''
  suivi.nonProuve = epreuve.nonProuve || ''
  if (livraison && livraison.livre) {
    suivi.etat = 'livré'
    suivi.pr = livraison.pr
    suivi.mergeSha = livraison.mergeSha
    suivi.suivis = livraison.suivis || []
  } else {
    suivi.etat = `non livré : ${(livraison && livraison.raison) || 'livraison tombée'}`
  }
  log(`#${lot.issue} ${lot.slug} : ${suivi.etat}${suivi.pr ? ` (PR #${suivi.pr})` : ''}`)
}

// ---------------------------------------------------------------------------
// 10. VALIDER — relecture indépendante de dev, bilan
// ---------------------------------------------------------------------------
phase('Valider')
const livres = resultats.filter(r => r.etat === 'livré')
const bilan = await agent(
  `${SOCLE}
TÂCHE — valider, de façon INDÉPENDANTE, ce que ce passage a livré sur ${BASE}, puis en rendre le bilan.
LOTS :
${json(resultats)}

1. git fetch origin ${BASE}. Pour chaque lot « livré » : son SHA de fusion est-il bien dans origin/${BASE} ? Son
   issue est-elle fermée, avec la preuve en commentaire ? Ses témoins existent-ils encore sur ${BASE} et sont-ils
   exécutés par la CI (pas filtrés par chemin, pas ignorés) ?
2. Le dernier run de ${BASE} sur chaque plateforme touchée, APRÈS la dernière fusion : vert ? S'il est rouge par un de
   ces lots, c'est une régression : ouvre la PR de revert du lot fautif (sans la fusionner si le rouge n'est pas
   établi), rouvre son issue, et dis-le.
3. Chaque lot « retiré », « abandonné » ou « non livré » a-t-il son issue ouverte avec la raison en commentaire ?
   Complète ce qui manque.
4. Toute correction reçue ou erreur payée pendant ce passage devient un fichier tasks/lessons/<AAAA-MM-JJ>-<slug>.md
   seulement si elle est nouvelle (cherche d'abord) ; committe-le sur ${BRANCHE} sans ouvrir de PR pour lui seul.
5. Rends le bilan : par lot, ce que l'utilisateur gagne, le type de preuve (jamais « mesuré » sans chiffres), ce qui
   reste à mesurer sur appareil, les suivis ouverts. Aucun commentaire GitHub en dehors des issues de ces lots.`,
  { label: 'valider', phase: 'Valider', schema: BILAN },
)

return {
  branche: BRANCHE,
  points: POINTS.length,
  constats: { releves: tousJuges.length, confirmes: confirmes.length, refutes: refutes.length, nonDeveloppes: nonDeveloppes.length },
  lots: resultats,
  livres: livres.length,
  ecartes: plan.ecartes,
  bilan,
}
