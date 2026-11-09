export const meta = {
  name: 'meeshy-conformite-vues',
  description:
    "Conformité d'une planche de vues (#17311) : chaque vue et chaque loi de la planche devient un contrat de clauses vérifiables, audité sur la plateforme de référence (iOS) puis reproduit sur les autres (Android), écart par écart avec fichier et ligne. Mode audit : rien n'est écrit, une matrice et des lots sortent. Mode livrer : une issue, une branche et une PR par lot, iOS d'abord, son miroir ensuite — opus tranche la cohérence, vérifie les divergences et intègre ; sonnet ou haiku auditent et développent selon la réflexion que la vue demande",
  whenToUse:
    "Vérifier ou faire respecter une planche de vues cibles (docs/product/appels-vue-finale.md par défaut, toute planche « lois + vues + captures » sinon). Args (objet ou chaîne JSON) : { planche ('docs/product/appels-vue-finale.md'), plateformes (['ios','android'] ; la première est la référence ; 'web' admis), mode ('audit' | 'livrer'), grain ('vue' | 'famille'), seulement [ids de vue ou noms de famille], sauter [ids], chantier (issue qui reçoit le bilan en mode livrer), milestone, attribution (OBLIGATOIRE en mode livrer : lignes Co-Authored-By et Claude-Session de la session qui lance), date, run ('/home/user/meeshy-conformite-run'), base ('dev'), devPar (2), maxFix (3), enTetePr (les deux lignes d'attribution à poser en tête du corps de chaque PR, si la session en impose) }.",
  phases: [
    { title: 'Préparer', detail: "arbre de lecture figé sur origin/dev, répertoire d'exécution", model: 'haiku' },
    { title: 'Inventorier', detail: 'la planche découpée en lois, familles, vues et captures', model: 'sonnet' },
    { title: 'Cohérence', detail: 'par famille : lois, captures et directives confrontées, contrat de clauses par vue', model: 'opus' },
    { title: 'Auditer', detail: 'chaque clause confrontée au code, plateforme de référence puis miroirs' },
    { title: 'Vérifier', detail: 'écarts réfutés ou confirmés, divergences entre plateformes, issues déjà ouvertes', model: 'opus' },
    { title: 'Consolider', detail: 'écarts regroupés en lots sans fichier commun, miroirs rattachés à leur lot de référence', model: 'opus' },
    { title: 'Issue', detail: 'une issue par lot et par décision produit', model: 'haiku' },
    { title: 'Développer', detail: 'clone privé, branche poussée tôt, TDD, gardes locales' },
    { title: 'Intégrer', detail: 'merge de dev, conflits, relecture du diff contre le contrat, PR', model: 'opus' },
    { title: 'Prouver', detail: 'CI de la plateforme au SHA de tête', model: 'sonnet' },
    { title: 'Corriger', detail: 'cause racine des rouges', model: 'opus' },
    { title: 'Livrer', detail: 'fusion au vert, issue close avec preuve et dimensions', model: 'opus' },
    { title: 'Bilan', detail: 'compte rendu daté sur le chantier', model: 'sonnet' },
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
const OUTILLAGE = 17311
const texte = (v, defaut) => (typeof v === 'string' && v ? v : defaut)
const entier = (v, defaut, max) => (Number.isInteger(v) && v > 0 ? Math.min(v, max) : defaut)
const PLANCHE = texte(A.planche, 'docs/product/appels-vue-finale.md')
const MODE = A.mode === 'livrer' ? 'livrer' : 'audit'
const GRAIN = A.grain === 'famille' ? 'famille' : 'vue'
const RUN = texte(A.run, '/home/user/meeshy-conformite-run').replace(/\/$/, '')
const REF = `${RUN}/ref`
const LOTS = `${RUN}/lots`
const BASE = texte(A.base, 'dev')
const DATE = texte(A.date, '(lis la date avec date -I)')
const ATTR = typeof A.attribution === 'string' && /Claude-Session: \S+/.test(A.attribution) ? A.attribution.trim() : ''
const CHANTIER = Number.isInteger(A.chantier) ? A.chantier : 0
const MILESTONE = Number.isInteger(A.milestone) ? A.milestone : 0
const DEV_PAR = entier(A.devPar, 2, 3)
const MAX_FIX = entier(A.maxFix, 3, 6)
const SEULEMENT = Array.isArray(A.seulement) && A.seulement.length ? new Set(A.seulement) : null
const SAUTER = new Set(Array.isArray(A.sauter) ? A.sauter : [])

const PLATEFORMES = {
  ios: {
    nom: 'iOS',
    racines: 'apps/ios/Meeshy, packages/MeeshySDK/Sources',
    tests: 'apps/ios/MeeshyTests, packages/MeeshySDK/Tests',
    ci: 'ios.yml et sdk-tests.yml (entrée only_testing : classes de test séparées par des virgules)',
    portee: 'ios',
    gates: `ni Xcode ni swift dans le conteneur : la seule compilation est la CI. Gardes locales, toutes vertes avant de pousser :
bash apps/ios/scripts/check_cohesion_budget.sh ; bash scripts/check-law-literals.sh ; bash scripts/check-swift-viewbuilder.sh ;
node scripts/check-accent-color-hardcoding.mjs. Un .swift neuf est inclus par xcodegen : jamais de pbxproj édité à la main. Un .xcstrings
touché ⇒ ./apps/android/meeshy.sh i18n puis python3 apps/android/scripts/i18n/xcstrings_to_android.py --check, dans le même commit.
Chaque type et membre référencé existe (grep), switch exhaustif, protocole changé ⇒ toutes ses conformances et ses Mock*.`,
  },
  android: {
    nom: 'Android natif',
    racines: 'apps/android (features, sdk-ui, sdk-core, core/model)',
    tests: 'apps/android/**/src/test',
    ci: 'android.yml (assembleDebug + testDebugUnitTest)',
    portee: 'android',
    gates: `aucun SDK Android dans le conteneur : le seul compilateur complet est la CI android.yml. :core:model se prouve en local par
./apps/android/meeshy.sh jvm-check -PjvmCheckModelOnly [--tests '<FQN>'] (jamais deux à la fois : pgrep -f jvm-check). Les chaînes sont
GÉNÉRÉES depuis les catalogues iOS (./apps/android/meeshy.sh i18n, --check vert). Conventions : .claude/workflows/android-parity/CONVENTIONS.md
(logique dans :core:model d'abord, un @Module Hilt par lot, fichiers chauds en câblage de cinq lignes au plus, cibles de 48 dp).`,
  },
  web: {
    nom: 'Web et coque Capacitor',
    racines: 'apps/web/src',
    tests: 'apps/web (bun test)',
    ci: 'ci.yml',
    portee: 'web',
    gates: `cd apps/web && bun test <fichiers> && bun run type-check && bun run gate (poids et budgets compris). Le web CONSOMME
@meeshy/shared : aucune loi réécrite localement. Textes dans les sept langues.`,
  },
}
const demandees = (Array.isArray(A.plateformes) ? A.plateformes : ['ios', 'android']).filter((p) => PLATEFORMES[p])
const CIBLES = demandees.length ? [...new Set(demandees)] : ['ios', 'android']
const REFERENCE = CIBLES[0]
const MIROIRS = CIBLES.slice(1)

const VERDICTS = ['conforme', 'ecart', 'absent', 'indetermine', 'sans-objet']
const REFLEXIONS = ['mecanique', 'standard', 'delicat']
const modeleExecution = (reflexion) => (reflexion === 'mecanique' ? 'haiku' : 'sonnet')
const effortExecution = (reflexion) => (reflexion === 'delicat' ? 'high' : reflexion === 'mecanique' ? 'low' : 'medium')

// ---------------------------------------------------------------------------
// SOCLE COMMUN
// ---------------------------------------------------------------------------
const LECTURE = `ARBRE DE LECTURE : ${REF}, figé sur origin/${BASE} au lancement. Lis TOUT là (planche, captures, code), jamais dans ${REPO}, dont la
branche courante n'est pas ${BASE}. Tu n'écris rien dans ${REF} ni dans ${REPO}.`

const SOCLE = `CONFORMITÉ DE LA PLANCHE ${PLANCHE} (${GH}, outillage #${OUTILLAGE}) — date : ${DATE}.
${LECTURE}
CE QUE « CONFORME » VEUT DIRE : disposition, hiérarchie, états et gestes. Polices, rayons et teintes exactes viennent du design system de
chaque plateforme et ne sont jamais un écart ; une couleur que la planche fait sortir d'une fonction partagée, elle, se vérifie.
La planche prescrit ce qu'elle MONTRE ou ÉCRIT ; son silence n'interdit rien. Une directive porteur postérieure à la planche la supplante,
et c'est alors l'issue fermée qui fait foi : cherche-la avant de conclure à un écart.
PREUVE : un verdict porte un fichier et une ligne lus par toi dans ${REF}. Tu n'inventes ni chemin, ni symbole, ni numéro d'issue. Ce que seul
un écran allumé peut dire (un rendu, un fondu, une taille) se rend « indetermine », avec la capture ou le geste à rejouer sur simulateur.
GITHUB : outils MCP mcp__github__* chargés par ToolSearch ; la CLI gh ne sert qu'à la recherche
(gh api -X GET search/issues -f q='repo:${GH} …' --jq '.items[]|"\\(.number) \\(.state) \\(.title)"').`

const ECRITURE = (cle, plateforme) => `CLONE PRIVÉ : D=${LOTS}/${cle} ; s'il n'existe pas :
git clone -q --shared --no-checkout ${REPO} "$D" && cd "$D" && git remote set-url origin https://github.com/${GH} && git fetch -q origin ${BASE}
&& git checkout -q -B claude/conformite-${plateforme}-${cle} origin/${BASE}. Tu n'écris que dans ce clone. Interdits : git worktree, git stash,
rebase d'une branche poussée, push --force, pousser sur ${BASE} ou main, désactiver ou affaiblir un témoin ou une garde.
SYNCHRONISATION : git fetch origin ${BASE} puis git merge origin/${BASE} (jamais rebase) avant chaque étape ; d'autres sessions fusionnent sans cesse.
UNE AUTRE SESSION écrit déjà ces fichiers (branche vivante, PR ouverte) ⇒ tu cèdes et tu le dis, sans doublon (CLAUDE.md, #5243).
GATES ${PLATEFORMES[plateforme].nom} : ${PLATEFORMES[plateforme].gates}
COMMITS : français, le RÉSULTAT (fix(${PLATEFORMES[plateforme].portee}/…): …), Refs #<issue>, et EXACTEMENT en fin de message :
${ATTR}`

const ATTENTE = `ATTENTE : le sleep au premier plan est refusé. Charge Monitor par ToolSearch (« select:Monitor »), appelle-le avec command
« sleep 290; echo go » et timeout_ms 300000, attends son événement, recommence. Ne termine jamais ton tour pendant qu'une tranche court.`

const PIED = `Tout commentaire GitHub finit par une ligne vide, « --- » et « _Generated by [Claude Code](https://claude.ai/code)_ ».`

// ---------------------------------------------------------------------------
// SCHÉMAS
// ---------------------------------------------------------------------------
const S = (properties, required) => ({ type: 'object', properties, required: required || Object.keys(properties) })
const liste = (items) => ({ type: 'array', items })
const T = { type: 'string' }
const N = { type: 'integer' }
const B = { type: 'boolean' }

const PRET = S({ ok: B, sha: T, note: T })
const INVENTAIRE = S({
  titre: T,
  regles: liste(S({ id: T, titre: T })),
  familles: liste(S({ nom: T, vues: liste(S({ id: T, titre: T, capture: T })) })),
  references: liste(T),
})
const CONTRATS = S({
  contrats: liste(S({
    vue: T,
    reflexion: { type: 'string', enum: REFLEXIONS },
    clauses: liste(S({ id: T, dimension: { type: 'string', enum: ['disposition', 'hierarchie', 'etat', 'geste', 'regle'] }, enonce: T, regles: liste(T) })),
  })),
  incoherences: liste(S({ vues: liste(T), constat: T, gravite: { type: 'string', enum: ['bloquante', 'mineure'] }, proposition: T })),
})
const AUDIT = S({
  sites: liste(T),
  clauses: liste(S({ id: T, verdict: { type: 'string', enum: VERDICTS }, preuve: T, temoin: T, note: T })),
})
const VERIFICATION = S({
  verdicts: liste(S({ clause: T, plateforme: T, verdict: { type: 'string', enum: VERDICTS }, preuve: T })),
  ecarts: liste(S({
    clause: T, plateforme: T, constat: T, preuve: T, fichiers: liste(T), issue: N,
    nature: { type: 'string', enum: ['defaut', 'decision-produit'] },
    reflexion: { type: 'string', enum: REFLEXIONS },
  })),
  divergences: liste(T),
})
const PLAN = S({
  lots: liste(S({
    cle: T, plateforme: T, titre: T, clauses: liste(T), fichiers: liste(T), miroir_de: T, issue: N,
    reflexion: { type: 'string', enum: REFLEXIONS }, sensible: B,
  })),
  decisions: liste(S({ titre: T, question: T, vues: liste(T) })),
  deja_suivis: liste(S({ issue: N, clauses: liste(T) })),
})
const ISSUE = S({ issue: N, cree: B })
const DEV = S({ pushed: B, branche: T, head_sha: T, resume: T, fichiers: liste(T), suites: liste(T), cede: B })
const INTEGRATION = S({ pr: N, head_sha: T, pret: B, remarques: liste(T) })
const PREUVE = S({ etat: { type: 'string', enum: ['vert', 'rouge', 'rouge-prealable', 'en-cours'] }, head_sha: T, runs: liste(T), echecs: liste(T) })
const CORRECTION = S({ pushed: B, head_sha: T, cause: T })
const LIVRAISON = S({ etat: { type: 'string', enum: ['fusionnee', 'prete-a-fusionner', 'non-fusionnee'] }, detail: T, suivis: liste(N) })
const BILAN = S({ commentaire: T })

// ---------------------------------------------------------------------------
// PROMPTS — COMPRENDRE
// ---------------------------------------------------------------------------
const preparerPrompt = `Prépare l'arbre de lecture (mécanique), puis rends { ok, sha, note }.
mkdir -p ${LOTS} && cd ${REPO} && git fetch -q origin ${BASE} && rm -rf ${REF} && git clone -q --shared --no-checkout ${REPO} ${REF}
&& cd ${REF} && git checkout -q --detach $(git -C ${REPO} rev-parse origin/${BASE}) && git rev-parse HEAD
ok = le fichier ${REF}/${PLANCHE} existe. sha = le SHA affiché. Un échec réseau se réessaie trois fois à 20 s. N'invente rien.`

const inventorierPrompt = `${SOCLE}
MISSION — INVENTORIER LA PLANCHE (${REF}/${PLANCHE}), sans juger.
- regles : chaque loi ou règle numérotée de la planche, id tel qu'écrit (« 1 », « 14 »…), titre = sa première phrase.
- familles : chaque section de vues, dans l'ordre du document, avec ses vues : id tel qu'écrit (« P1 », « G3 »…), titre, capture = chemin de
  l'image depuis la racine du dépôt (vérifie qu'elle existe dans ${REF} ; sinon chaîne vide). Une vue sans section va dans « Hors famille ».
- Une loi qu'aucune vue n'illustre devient une vue de la famille « Lois sans vue », id « loi-<numéro de la loi> », titre = celui de la loi, capture vide.
- references : les fichiers que la planche déclare faire autorité avec elle (modèles, autres planches, fichiers de consignes d'agents).`

const coherencePrompt = (famille, inventaire) => `${SOCLE}
MISSION — COHÉRENCE ET CONTRAT de la famille « ${famille.nom} ». Vues : ${JSON.stringify(famille.vues)}
Lois de la planche : ${JSON.stringify(inventaire.regles)} ; références : ${JSON.stringify(inventaire.references)}.
1. Lis la planche en entier, puis OUVRE chaque capture de la famille (outil Read sur le PNG) et décris-toi ce qu'elle montre.
2. COHÉRENCE, sans rien trancher toi-même :
   - une capture contredit une loi, ou deux lois se contredisent sur cette vue ;
   - une capture montre un élément qu'aucune loi ne nomme et dont le rôle n'est pas lisible ;
   - le tableau d'état de la planche, s'il existe, contredit une issue (ouverte ou fermée) que tu retrouves ;
   - une directive ou une issue fermée POSTÉRIEURE à la planche la supplante sur cette vue (cherche par les numéros que la planche cite).
   Chaque constat va dans incoherences ; « bloquante » = on ne peut pas dire ce qui est attendu sans le porteur. proposition = la question à lui poser.
3. CONTRAT : pour chaque vue, la liste des clauses VÉRIFIABLES dans du code, une affirmation par clause, id « <vue>.<n> », dimension
   (disposition, hierarchie, etat, geste, ou regle pour une loi transverse : couleur, Prisme, contrat de fil), regles = les lois qu'elle applique.
   Écris ce qu'on doit trouver (« la pilule porte, dans cet ordre, (…), Micro, Sortie, Fin »), pas une impression. Les états de bord que la
   loi nomme (vide, coupé, paysage, groupe) sont des clauses. N'écris aucune clause sur une police, un rayon ou une teinte de design system.
   Une clause dont l'attendu est suspendu à une incohérence bloquante ne s'écrit pas.
4. reflexion de la vue : « mecanique » si toutes ses clauses se vérifient par présence, ordre ou vocabulaire ; « delicat » si elle engage une
   machine à états, un geste composé, le Prisme, la couleur d'auteur ou un contrat réseau ; « standard » sinon.`

const auditPrompt = (unite, plateforme, reference) => `${SOCLE}
MISSION — AUDITER ${unite.vues.map((v) => `${v.id} « ${v.titre} »`).join(', ')} sur ${PLATEFORMES[plateforme].nom}. Tu ne modifies rien.
Code : ${PLATEFORMES[plateforme].racines} ; témoins : ${PLATEFORMES[plateforme].tests}. Captures : ${JSON.stringify(unite.vues.map((v) => v.capture).filter(Boolean))}.
Clauses : ${JSON.stringify(unite.clauses)}
${reference ? `RÉFÉRENCE — l'audit ${PLATEFORMES[REFERENCE].nom} des mêmes clauses : ${JSON.stringify(reference).slice(0, 6000)}
${PLATEFORMES[plateforme].nom} REPRODUIT ${PLATEFORMES[REFERENCE].nom} : même ordre, même vocabulaire, mêmes états, mêmes gestes, transposés seulement là où la
plateforme l'impose (retour système, notifications, partage). Lis les sites ${PLATEFORMES[REFERENCE].nom} cités quand la clause est ambiguë, et signale dans note
toute différence avec eux, même quand la clause est tenue.` : `${PLATEFORMES[plateforme].nom} est la plateforme de RÉFÉRENCE : les autres seront comparées à ce que tu relèves. Nomme dans note le type, la fonction ou
la loi pure qui porte la décision, pour que le miroir sache quoi reproduire.`}
1. Trouve les sites (grep par vocabulaire de la planche, clés de chaînes, noms de lois) ; liste-les dans sites.
2. Pour CHAQUE clause, un verdict :
   - conforme : le code fait ce que la clause dit ; preuve = fichier:ligne ; temoin = le test qui le garde, ou chaîne vide s'il n'y en a pas ;
   - ecart : le code existe et fait autre chose ; note = ce qu'il fait ;
   - absent : rien ne l'implémente (preuve = les recherches faites) ;
   - indetermine : seul un écran allumé le dirait ; note = quoi rejouer ;
   - sans-objet : la planche l'exclut pour cette plateforme (cite la ligne).
Rends une ligne par clause reçue, sans en ajouter ni en retirer.`

const verifierPrompt = (unite, audits) => `${SOCLE}
MISSION — VÉRIFIER LES DIVERGENCES de ${unite.vues.map((v) => v.id).join(', ')}. Tu ne modifies rien. Tu es le contradicteur des audits ci-dessous.
Clauses : ${JSON.stringify(unite.clauses)}
Audits : ${JSON.stringify(audits).slice(0, 14000)}
1. Chaque « ecart » et chaque « absent » : rouvre les fichiers et cherche à le RÉFUTER (autre site, autre nom, loi partagée, variante de
   disposition). Réfuté ⇒ corrige le verdict. Confirmé ⇒ une entrée dans ecarts.
2. Chaque « conforme » sans temoin : relis la preuve ; si elle ne dit pas ce que la clause dit, corrige le verdict.
3. DIVERGENCES entre plateformes : une clause tenue des deux côtés mais autrement (ordre, mot, icône, état en moins, geste différent) est un
   écart de la plateforme qui s'éloigne de ${PLATEFORMES[REFERENCE].nom}, sauf transposition imposée ; une phrase par divergence dans divergences.
4. Pour chaque écart confirmé : fichiers = ceux qu'un correctif toucherait ; issue = le numéro d'une issue OUVERTE qui le suit déjà (recherche
   gh, 0 sinon) ; nature = « decision-produit » quand corriger suppose un choix que la planche ne fait pas, « defaut » sinon ;
   reflexion = mecanique (libellé, ordre, câblage), standard, ou delicat (machine à états, geste, Prisme, couleur, réseau).
verdicts : une ligne par clause et par plateforme (${CIBLES.join(', ')}), après tes corrections.`

const consoliderPrompt = (ecarts, incoherences) => `${SOCLE}
MISSION — REGROUPER LES ÉCARTS EN LOTS. Tu ne modifies rien.
Écarts confirmés : ${JSON.stringify(ecarts).slice(0, 60000)}
Incohérences de la planche : ${JSON.stringify(incoherences).slice(0, 12000)}
- Un lot = une plateforme et un résultat qu'on peut nommer d'une phrase (titre SÉMANTIQUE, en français, sans code interne).
- Deux lots ne partagent AUCUN fichier : deux écarts qui touchent le même fichier vont dans le même lot.
- cle : minuscules et tirets, unique, sans le nom de la plateforme.
- Un lot ${MIROIRS.map((p) => PLATEFORMES[p].nom).join(' ou ') || 'miroir'} qui reproduit un lot ${PLATEFORMES[REFERENCE].nom} porte miroir_de = la cle de ce lot (chaîne vide sinon) : il partira après lui.
- issue : si TOUS les écarts du lot sont déjà suivis par la même issue ouverte, son numéro ; 0 sinon. Les écarts déjà suivis par une issue
  qui couvre autre chose vont dans deja_suivis, pas dans un lot.
- reflexion du lot = la plus haute de ses écarts. sensible = le lot touche chiffrement, authentification, protection de contenu ou présence.
- decisions : une entrée par incohérence bloquante et par écart de nature decision-produit ; ces écarts n'entrent dans AUCUN lot.
clauses de chaque lot = les ids de clause de ses écarts.`

// ---------------------------------------------------------------------------
// PROMPTS — LIVRER
// ---------------------------------------------------------------------------
const brancheLot = (lot) => `claude/conformite-${lot.plateforme}-${lot.cle}`
const contexteLot = (lot, ecarts) => JSON.stringify({ lot, ecarts: ecarts.filter((e) => e.plateforme === lot.plateforme && lot.clauses.includes(e.clause)) }).slice(0, 12000)

const issuePrompt = (lot, ecarts) => `${SOCLE}
MISSION — L'ISSUE DU LOT « ${lot.cle} » (mécanique). ${contexteLot(lot, ecarts)}
1. Cherche une issue au titre identique (gh api search, in:title). Trouvée et ouverte ⇒ rends-la, cree=false.
2. Sinon mcp__github__issue_write create, owner isopen-io, repo meeshy${MILESTONE ? `, milestone ${MILESTONE}` : ''}, title = le titre du lot, body en quatre sections :
   Contexte (planche ${PLANCHE}, vues et clauses, ce que le code fait aujourd'hui avec fichier:ligne) · Preuve (témoin attendu, CI ${PLATEFORMES[lot.plateforme].ci})
   · Critère de fin (une ligne par clause) · Dimensions visées. Dernière ligne : « Relevé par le workflow meeshy-conformite-vues (#${OUTILLAGE}). »`

const decisionPrompt = (decision) => `${SOCLE}
MISSION — UNE DÉCISION PRODUIT À POSER (mécanique). ${JSON.stringify(decision)}
Cherche une issue ouverte qui pose déjà cette question (gh api search). Sinon mcp__github__issue_write create, owner isopen-io, repo meeshy,
labels ["décision-produit"], assignees ["jcnm"]${MILESTONE ? `, milestone ${MILESTONE}` : ''}, title = la question en une phrase, body = le constat, les vues, les options, et ce qui reste suspendu.`

const developperPrompt = (lot, ecarts, issue, reference) => `${SOCLE}
${ECRITURE(lot.cle, lot.plateforme)}
MISSION — RENDRE CONFORMES les clauses du lot « ${lot.cle} » sur ${PLATEFORMES[lot.plateforme].nom} (issue #${issue}). ${contexteLot(lot, ecarts)}
${reference ? `Ce lot REPRODUIT le lot ${PLATEFORMES[REFERENCE].nom} déjà livré : ${JSON.stringify(reference).slice(0, 3000)}. Lis son diff (git fetch origin ${reference.branche || BASE}) et
reprends ses décisions, ses noms de lois et l'intention de ses témoins ; transpose seulement ce que la plateforme impose.` : ''}
1. Vérifie d'abord dans ton clone, sur ${BASE} frais, que chaque écart tient encore ; un écart déjà corrigé se retire et se dit dans resume.
2. Branche ${brancheLot(lot)} poussée dans le quart d'heure avec le premier témoin ROUGE (git push -u origin ${brancheLot(lot)}).
3. TDD : témoin rouge constaté, code minimal, vert. La décision dans une loi pure, l'écran mince. Textes dans les sept langues.
   Rien d'autre que les clauses du lot ; un défaut voisin se note dans resume, il ne se corrige pas ici.
4. Gardes locales vertes, commits, push. suites = les classes ou fichiers de test à jouer en CI (les tiens et ceux des types touchés).
cede=true si une autre session tient ces fichiers (alors pushed=false).`

const integrerPrompt = (lot, ecarts, issue, dev) => `${SOCLE}
${ECRITURE(lot.cle, lot.plateforme)}
MISSION — INTÉGRER le lot « ${lot.cle} » (issue #${issue}, branche ${brancheLot(lot)}). Rendu du développement : ${JSON.stringify(dev).slice(0, 3000)}
${contexteLot(lot, ecarts)}
1. git fetch origin ${BASE} ${brancheLot(lot)} ; git merge origin/${BASE} ; résous chaque conflit en gardant les deux sémantiques (fichier généré : régénère).
2. CONFLITS À VENIR : pour chaque PR ouverte vers ${BASE} qui touche un fichier du lot (gh api search, puis pull_request_read get_files),
   git merge-tree contre sa branche ; un conflit réel se note dans remarques avec le numéro de la PR.
3. RELIS TOUT LE DIFF (git diff origin/${BASE}...HEAD) contre les clauses et les captures : chaque clause est tenue, rien n'est sorti du périmètre,
   aucun témoin affaibli, aucune loi réécrite à côté de sa source, budgets de taille tenus. Corrige toi-même ce qui manque, en TDD.
4. Gardes locales, push. PR vers ${BASE} en BROUILLON (mcp__github__create_pull_request, ou celle qui existe pour cette tête). Corps :
   ${A.enTetePr ? `ces deux premières lignes, telles quelles : ${A.enTetePr} ; puis ` : ''}Closes #${issue}, les clauses tenues, les fichiers, les miroirs touchés, ce qui reste à rejouer sur simulateur.
pret=false si le lot ne tient pas ses clauses malgré tes corrections (dis pourquoi dans remarques).`

const prouverPrompt = (lot, pr, head) => `${SOCLE}
MISSION — PROUVER la PR #${pr} (lot « ${lot.cle} », ${PLATEFORMES[lot.plateforme].nom}) au SHA ${head}. Tu ne modifies aucun code.
CI attendue : ${PLATEFORMES[lot.plateforme].ci}.
1. pull_request_read get puis get_check_runs (toutes les pages). Des jobs « skipped » ne prouvent rien : si la CI de la PR ne tourne pas,
   lance les workflows par mcp__github__actions_run_trigger (workflow_dispatch) sur ${brancheLot(lot)} et suis ces exécutions-là.
2. Tant qu'une exécution court, attends. ${ATTENTE} Au-delà de 90 minutes, rends en-cours.
3. Rouge : get_job_logs (failed_only) → echecs en « fichier:ligne — message » ou nom complet du test. Le même échec sur les deux dernières
   exécutions terminées de ${BASE} ⇒ rouge-prealable (une erreur de compilation ne l'est jamais si ${BASE} compile).
runs = une ligne par workflow (nom, lien, conclusion).`

const corrigerPrompt = (lot, issue, preuve, essai) => `${SOCLE}
${ECRITURE(lot.cle, lot.plateforme)}
MISSION — RENDRE VERTE la branche ${brancheLot(lot)} (issue #${issue}), essai ${essai}/${MAX_FIX}. Preuve : ${JSON.stringify(preuve).slice(0, 5000)}
La CAUSE RACINE de chaque échec du lot : lis les fichiers cités et la version réelle de l'API. Un test qui révèle un vrai défaut ⇒ corrige
le code. Merge origin/${BASE} d'abord. Gardes locales, commit, push sans force. pushed=false si un autre a déjà corrigé.`

const livrerPrompt = (lot, issue, pr, preuve) => `${SOCLE}
MISSION — LIVRER la PR #${pr} (lot « ${lot.cle} », issue #${issue}). Preuve : ${JSON.stringify(preuve).slice(0, 4000)}
1. pull_request_read get : head.sha ≠ ${preuve.head_sha} ou mergeable_state dirty ⇒ non-fusionnee.
2. La PR quitte le brouillon (update_pull_request draft false).
3. Preuve verte SANS relance ciblée ⇒ mcp__github__merge_pull_request merge_method « merge ». Refus de l'outil, ou vert obtenu seulement en
   relançant des tests ciblés, ou rouge-prealable ⇒ ne force rien : etat prete-a-fusionner, et detail dit ce que le porteur doit regarder.
4. Fusionnée : ferme l'issue si elle est ouverte ; commentaire de clôture = PR, SHA, exécutions, clauses tenues, dimensions mûres et non
   mûres, ce qui reste à rejouer sur simulateur ou appareil. Une issue par dimension non mûre (recherche d'abord) ; leurs numéros dans suivis.
${PIED}`

const bilanPrompt = (resume, poster) => `${SOCLE}
MISSION — LE COMPTE RENDU DATÉ. ${JSON.stringify(resume).slice(0, 40000)}
Rédige en français un commentaire : date et SHA de ${BASE} ; tableau vue × plateforme (conformes / total, puis écarts, absents, indéterminés) ;
incohérences de la planche ; lots avec issue, PR et état ; ce qui attend le porteur (décisions, PR prêtes) ; ce qui reste à rejouer à l'écran.
${poster && CHANTIER ? `Poste-le sur #${CHANTIER} (mcp__github__add_issue_comment). ${PIED}` : 'Ne poste rien : rends seulement le texte.'}
Ce commentaire est un compte rendu : l'état vivant reste dans les issues.`

// ---------------------------------------------------------------------------
// EXÉCUTION
// ---------------------------------------------------------------------------
const appel = (prompt, opts) => agent(prompt, opts).catch((e) => {
  log(`${opts && opts.label ? opts.label : 'agent'} : aucun rendu exploitable (${String(e).slice(0, 160)})`)
  return null
})
const tranches = (items, taille) => items.reduce((acc, item, i) => (i % taille ? [...acc.slice(0, -1), [...acc[acc.length - 1], item]] : [...acc, [item]]), [])
const retenue = (vue, famille) => !SAUTER.has(vue.id) && (!SEULEMENT || SEULEMENT.has(vue.id) || SEULEMENT.has(famille.nom))

if (MODE === 'livrer' && !ATTR) {
  return { erreur: "mode livrer : args.attribution doit porter les lignes Co-Authored-By et Claude-Session de la session qui lance" }
}

phase('Préparer')
const pret = await appel(preparerPrompt, { label: 'arbre de lecture', phase: 'Préparer', schema: PRET, model: 'haiku', effort: 'low' })
if (!pret || !pret.ok) return { erreur: `arbre de lecture indisponible : ${pret ? pret.note : 'aucun rendu'}` }

phase('Inventorier')
const inventaire = await appel(inventorierPrompt, { label: 'inventaire', phase: 'Inventorier', schema: INVENTAIRE, model: 'sonnet', effort: 'low' })
if (!inventaire) return { erreur: 'inventaire sans rendu' }
const familles = inventaire.familles
  .map((f) => ({ nom: f.nom, vues: f.vues.filter((v) => retenue(v, f)) }))
  .filter((f) => f.vues.length)
const totalVues = familles.reduce((n, f) => n + f.vues.length, 0)
const ecartees = inventaire.familles.reduce((n, f) => n + f.vues.length, 0) - totalVues
log(`${inventaire.titre} : ${inventaire.regles.length} lois, ${totalVues} vues retenues en ${familles.length} familles${ecartees ? `, ${ecartees} écartées par seulement/sauter` : ''} ; plateformes ${CIBLES.join(' puis ')} ; grain ${GRAIN} ; mode ${MODE}`)

const unitesDe = (famille, contrats) => {
  const parVue = famille.vues
    .map((v) => ({ vue: v, contrat: contrats.find((c) => c.vue === v.id) }))
    .filter((x) => x.contrat && x.contrat.clauses.length)
  const sansContrat = famille.vues.filter((v) => !parVue.some((x) => x.vue.id === v.id))
  if (sansContrat.length) log(`${famille.nom} : sans clause vérifiable, non auditées : ${sansContrat.map((v) => v.id).join(', ')}`)
  if (GRAIN === 'vue') return parVue.map((x) => ({ id: x.vue.id, vues: [x.vue], clauses: x.contrat.clauses, reflexion: x.contrat.reflexion }))
  if (!parVue.length) return []
  const reflexion = REFLEXIONS[Math.max(...parVue.map((x) => REFLEXIONS.indexOf(x.contrat.reflexion)))]
  return [{ id: famille.nom, vues: parVue.map((x) => x.vue), clauses: parVue.flatMap((x) => x.contrat.clauses), reflexion }]
}

const auditerUnite = async (unite) => {
  const opts = (p) => ({ label: `audit ${p} ${unite.id}`, phase: 'Auditer', schema: AUDIT, model: modeleExecution(unite.reflexion), effort: effortExecution(unite.reflexion) })
  const reference = await appel(auditPrompt(unite, REFERENCE, null), opts(REFERENCE))
  const miroirs = await parallel(MIROIRS.map((p) => () => appel(auditPrompt(unite, p, reference), opts(p)).then((a) => ({ plateforme: p, audit: a }))))
  const audits = [{ plateforme: REFERENCE, audit: reference }, ...miroirs.filter(Boolean)].filter((a) => a.audit)
  const manquantes = CIBLES.filter((p) => !audits.some((a) => a.plateforme === p))
  if (manquantes.length) log(`${unite.id} : audit sans rendu sur ${manquantes.join(', ')}`)
  if (!audits.length) return { unite, verification: null }
  const verification = await appel(verifierPrompt(unite, audits), { label: `vérif ${unite.id}`, phase: 'Vérifier', schema: VERIFICATION, model: 'opus' })
  return { unite, verification }
}

const parFamille = await pipeline(
  familles,
  (famille) => appel(coherencePrompt(famille, inventaire), { label: `cohérence ${famille.nom}`, phase: 'Cohérence', schema: CONTRATS, model: 'opus' }),
  async (contrats, famille) => {
    if (!contrats) { log(`${famille.nom} : cohérence sans rendu, famille non auditée`); return null }
    const resultats = await parallel(unitesDe(famille, contrats.contrats).map((u) => () => auditerUnite(u)))
    return { famille: famille.nom, incoherences: contrats.incoherences, resultats: resultats.filter(Boolean) }
  },
)

const rendus = parFamille.filter(Boolean)
const incoherences = rendus.flatMap((r) => r.incoherences)
const verifies = rendus.flatMap((r) => r.resultats).filter((r) => r.verification)
const ecarts = verifies.flatMap((r) => r.verification.ecarts)
const divergences = verifies.flatMap((r) => r.verification.divergences.map((d) => `${r.unite.id} : ${d}`))
const compter = (verdicts, p, v) => verdicts.filter((x) => x.plateforme === p && x.verdict === v).length
const matrice = verifies.map((r) => ({
  unite: r.unite.id,
  plateformes: CIBLES.map((p) => ({
    plateforme: p,
    ...Object.fromEntries(VERDICTS.map((v) => [v, compter(r.verification.verdicts, p, v)])),
  })),
  non_conformes: r.verification.verdicts.filter((x) => x.verdict !== 'conforme' && x.verdict !== 'sans-objet'),
}))
log(`${verifies.length} unités vérifiées, ${ecarts.length} écarts confirmés, ${divergences.length} divergences entre plateformes, ${incoherences.length} incohérences de planche`)

phase('Consolider')
const plan = ecarts.length || incoherences.some((i) => i.gravite === 'bloquante')
  ? await appel(consoliderPrompt(ecarts, incoherences), { label: 'lots', phase: 'Consolider', schema: PLAN, model: 'opus' })
  : { lots: [], decisions: [], deja_suivis: [] }
const lots = plan ? plan.lots.filter((l) => PLATEFORMES[l.plateforme]) : []
const decisions = plan ? plan.decisions : []
const resume = { planche: PLANCHE, sha: pret.sha, plateformes: CIBLES, matrice, incoherences, divergences, decisions, deja_suivis: plan ? plan.deja_suivis : [], lots }

if (MODE === 'audit') {
  phase('Bilan')
  const bilan = await appel(bilanPrompt(resume, false), { label: 'compte rendu', phase: 'Bilan', schema: BILAN, model: 'sonnet' })
  return { ...resume, ecarts, compte_rendu: bilan ? bilan.commentaire : '' }
}

await parallel(decisions.map((d) => () => appel(decisionPrompt(d), { label: `décision ${d.titre.slice(0, 40)}`, phase: 'Issue', schema: ISSUE, model: 'haiku' })))

const livrerLot = async (lot, reference) => {
  const etat = { cle: lot.cle, plateforme: lot.plateforme, branche: brancheLot(lot), issue: lot.issue, pr: 0, etat: 'non-commence', detail: '' }
  const fin = (e, detail) => { log(`${lot.plateforme} ${lot.cle} → ${e}${detail ? ` — ${String(detail).slice(0, 160)}` : ''}`); return { ...etat, etat: e, detail: String(detail || '') } }
  if (!etat.issue) {
    const i = await appel(issuePrompt(lot, ecarts), { label: `issue ${lot.cle}`, phase: 'Issue', schema: ISSUE, model: 'haiku', effort: 'low' })
    if (!i || !i.issue) return fin('sans-issue')
    etat.issue = i.issue
  }
  const dev = await appel(developperPrompt(lot, ecarts, etat.issue, reference), {
    label: `dev ${lot.plateforme} ${lot.cle}`, phase: 'Développer', schema: DEV, model: modeleExecution(lot.reflexion), effort: effortExecution(lot.reflexion),
  })
  if (!dev || dev.cede || !dev.pushed) return fin(dev && dev.cede ? 'cede' : 'sans-developpement', dev ? dev.resume : '')
  const integration = await appel(integrerPrompt(lot, ecarts, etat.issue, dev), { label: `intégration ${lot.cle}`, phase: 'Intégrer', schema: INTEGRATION, model: 'opus' })
  if (!integration || !integration.pr) return fin('sans-pr')
  etat.pr = integration.pr
  if (!integration.pret) return fin('a-reprendre', integration.remarques.join(' ; '))
  let head = integration.head_sha
  let preuve = null
  for (let essai = 1; essai <= MAX_FIX + 1; essai += 1) {
    preuve = await appel(prouverPrompt(lot, etat.pr, head), { label: `preuve ${lot.cle} ${essai}`, phase: 'Prouver', schema: PREUVE, model: 'sonnet', effort: 'low' })
    if (!preuve || preuve.etat !== 'rouge' || essai > MAX_FIX) break
    const correction = await appel(corrigerPrompt(lot, etat.issue, preuve, essai), { label: `correction ${lot.cle} ${essai}`, phase: 'Corriger', schema: CORRECTION, model: 'opus' })
    if (!correction || !correction.pushed) break
    head = correction.head_sha
  }
  if (!preuve || preuve.etat === 'rouge' || preuve.etat === 'en-cours') return fin(preuve ? `preuve-${preuve.etat}` : 'sans-preuve', preuve ? preuve.echecs.join(' ; ') : '')
  const livraison = await appel(livrerPrompt(lot, etat.issue, etat.pr, preuve), { label: `livraison ${lot.cle}`, phase: 'Livrer', schema: LIVRAISON, model: 'opus', effort: 'medium' })
  return { ...fin(livraison ? livraison.etat : 'non-fusionnee', livraison ? livraison.detail : ''), reference: { branche: etat.branche, resume: dev.resume, fichiers: dev.fichiers } }
}

const cles = new Set(lots.map((l) => l.cle))
const premiers = lots.filter((l) => !l.miroir_de || !cles.has(l.miroir_de))
const miroirsDe = (cle) => lots.filter((l) => l.miroir_de === cle && l.cle !== cle)
const livres = []
for (const tranche of tranches(premiers, DEV_PAR)) {
  const rendusTranche = await parallel(tranche.map((lot) => async () => {
    const tete = await livrerLot(lot, null)
    const suite = await parallel(miroirsDe(lot.cle).map((m) => () => livrerLot(m, tete.reference || { branche: tete.branche })))
    return [tete, ...suite.filter(Boolean)]
  }))
  livres.push(...rendusTranche.filter(Boolean).flat())
}

phase('Bilan')
const livraisons = livres.map((l) => ({ cle: l.cle, plateforme: l.plateforme, issue: l.issue, pr: l.pr, etat: l.etat, detail: l.detail }))
const bilan = await appel(bilanPrompt({ ...resume, livraisons }, true), { label: 'compte rendu', phase: 'Bilan', schema: BILAN, model: 'sonnet' })
return { ...resume, livraisons, compte_rendu: bilan ? bilan.commentaire : '' }
