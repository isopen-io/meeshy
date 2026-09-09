export const meta = {
  name: 'meeshy-web-v3-bout-en-bout',
  description:
    'Developper la v3.1 web (apps/web-v3, Vite + Preact + Capacitor) a parite avec l app iOS, pour le web ET Android en une fois : dev resynchronise a chaque tour, etat des lieux ecran par ecran CONTRE apps/ios, issues, une SPECIFICATION par travail, TDD, revue-correction systematique, gates (gate composite + coques QEMU/simulateur), LIVRAISON INCREMENTALE (chaque travail vert part vers dev dans l heure, le staging suit pas a pas) — fable DECRIT et LIVRE, sonnet et haiku DEVELOPPENT, opus RELIT ET CORRIGE',
  whenToUse:
    "Lancer un tour de developpement de la v3.1 web (apps/web-v3 — directive porteur 2026-09-07 soir : une application similaire a apps/ios pour le web et Android en une fois, en boucle jusqu'a maturite feature par feature). D'abord les coques et le reseau (assets, shells, staging), puis les ecrans dans l'ordre de l'app iOS : conversations, thread, composer, stories, feed, contacts, search, notifs, profile, settings. Args : { branche, depuis, focus, dabord, phares, plafond, tours, sans_issues, pr, base, date, attribution, modeles, repo, sauter }.",
  phases: [
    { title: 'Synchroniser', detail: "fetch + merge origin/dev avant tout travail, et releve de ce que les autres sessions tiennent", model: 'haiku' },
    { title: 'Cadrer', detail: "etat des lieux surface par surface CONTRE apps/ios (parity.md, route-inventory), choix des travaux — fable DECRIT", model: 'fable' },
    { title: 'Concevoir', detail: "la CIBLE de chaque ecran = l'ecran iOS capture au simulateur (clair + sombre) ; une decision prise entre dans decisions.md", model: 'sonnet' },
    { title: 'Ouvrir', detail: 'une issue GitHub par travail (epopee #5491), avant la premiere ligne de code — mecanique', model: 'haiku' },
    { title: 'Specifier', detail: "une SPECIFICATION par travail (l'ecran iOS lu et cite, routes et charges reelles, temoins d'abord, decoupage) — fable DECRIT et choisit le modele", model: 'fable' },
    { title: 'Implementer', detail: 'un ecran a la fois, en TDD, depuis sa specification — sonnet ; haiku quand la specification le juge suffisant', model: 'sonnet' },
    { title: 'Revue', detail: "SYSTEMATIQUE : opus relit surface ET conception, CORRIGE lui-meme, met en conformite (D-1..D-14, passerelle, Prisme, a11y) ; recette au navigateur sur les phares", model: 'opus' },
    { title: 'Gates', detail: 'bun run gate + check-offline + captures + coherence des coques (QEMU + simulateur) — corriger, jamais contourner', model: 'sonnet' },
    { title: 'Documenter', detail: 'decisions.md, parity.md (regenere), README (mesures avec leur commande), lessons.md', model: 'sonnet' },
    { title: 'Livrer', detail: 'INCREMENTAL : chaque travail vert part tout de suite (commit, push, PR auto-merge) ; en fin de tour, fermeture des issues avec preuve — fable', model: 'fable' },
    { title: 'Completude', detail: "ce qui manque encore par rapport a apps/ios — le prochain tour, decrit", model: 'fable' },
  ],
}

// ---------------------------------------------------------------------------
// PARAMETRES
// ---------------------------------------------------------------------------

const A = args && typeof args === 'object' ? args : {}
const REPO = typeof A.repo === 'string' && A.repo ? A.repo : '/Users/smpceo/Documents/v2_meeshy'
const V3 = `${REPO}/apps/web-v3`
const IOS = `${REPO}/apps/ios`
const SDK = `${REPO}/packages/MeeshySDK`
const SCRATCH = `${REPO}/.cache/web-v3-workflow`
// DEUX SIMULATEURS, JAMAIS UN SEUL (2026-09-09) : l'app NATIVE apps/ios (LA REFERENCE) et la coque
// Capacitor de web-v3 (L'OBJET TESTE) portent le meme identifiant me.meeshy.app — installer l'une
// REMPLACE l'autre en silence. Les gates du tour 2 ont pose la coque sur le simulateur du chantier,
// et la conception du tour 3 y a « capture l'ecran iOS » : c'etait web-v3 sur ses fixtures.
const SIM_REF = typeof A.sim_ref === 'string' && A.sim_ref ? A.sim_ref : '3E761BC1-845D-49D2-8E4D-E0606E04D3E2'
const SIM_CHANTIER = typeof A.sim_chantier === 'string' && A.sim_chantier ? A.sim_chantier : '54438823-4ADC-4536-88D2-FC441395FA04'

// La branche de travail est, par defaut, la branche COURANTE : chaque session lance ce script depuis
// sa propre branche `claude/…`, et un nom ecrit en dur ici enverrait la session suivante travailler
// sur une branche qui n'est pas la sienne. `branche` explicite dans les args reste possible.
const BRANCHE = typeof A.branche === 'string' && A.branche ? A.branche : '(courante)'
const NOM_DE_BRANCHE = BRANCHE === '(courante)' ? 'la branche COURANTE — `git branch --show-current` la nomme' : `\`${BRANCHE}\``
const REF_PUSH = BRANCHE === '(courante)' ? 'HEAD' : BRANCHE
const NOM_SHELL = BRANCHE === '(courante)' ? '$(git branch --show-current)' : BRANCHE
const ATTRIBUTION = typeof A.attribution === 'string' && A.attribution ? A.attribution : 'Co-Authored-By: Claude <noreply@anthropic.com>'

// LE BON MODELE AU BON MOMENT (directive du porteur, 2026-09-04) :
//   - fable   DECRIT : cadrage, specification, completude ;
//   - sonnet  DEVELOPPE : implementation, corrections, gates, documentation, livraison ;
//   - haiku   fait le MECANIQUE : git, issues, et les travaux que la specification juge PETITS ;
//   - opus    RELIT ET CORRIGE, systematiquement, chaque travail.
const M0 = A.modeles && typeof A.modeles === 'object' ? A.modeles : {}
const MODELE = {
  decrire: typeof M0.decrire === 'string' ? M0.decrire : 'fable',
  developper: typeof M0.developper === 'string' ? M0.developper : 'sonnet',
  petit: typeof M0.petit === 'string' ? M0.petit : 'haiku',
  mecanique: typeof M0.mecanique === 'string' ? M0.mecanique : 'haiku',
  relire: typeof M0.relire === 'string' ? M0.relire : 'opus',
  // Directive porteur 2026-09-07 : les LIVRAISONS regulieres (chaque heure si possible) sont
  // gerees par fable — c'est lui qui decide ce qui part, avec quel message, et ce qui reste.
  livrer: typeof M0.livrer === 'string' ? M0.livrer : 'fable',
}

const DEPUIS = typeof A.depuis === 'string' && A.depuis ? A.depuis : 'dev'

// L'ORDRE DU FOCUS (directive du porteur, 2026-09-07 soir) : d'abord ce qui rend la boucle
// tri-plateforme HONNETE (les assets iOS dans les coques, les trois defauts de coque, le reseau
// reel vers staging), puis les ecrans DANS L'ORDRE DE L'APP iOS — les surfaces de conversation
// d'abord (la lentille et le fil sont deja poses), puis le reste de Features/.
// Une reprise de run ne relit pas toujours ses args : l'ordre vit dans le script.
const FOCUS = Array.isArray(A.focus) && A.focus.length
  ? A.focus
  : ['assets', 'shells', 'staging',
     'auth', 'conversations', 'thread', 'composer',
     'stories', 'feed', 'contacts', 'search', 'notifs', 'profile', 'settings', 'calls', 'links']
const PLAFOND = Number.isInteger(A.plafond) && A.plafond > 0 ? A.plafond : 6
const TOURS = Number.isInteger(A.tours) && A.tours > 0 ? A.tours : 1
const SANS_ISSUES = A.sans_issues === true

// Les ecrans PHARES : implementes EN PREMIER, par le modele le plus fort, avec une recette au
// navigateur en plus des deux revues. Rester un PETIT ensemble (2-3 cles).
const DABORD = Array.isArray(A.dabord) && A.dabord.length
  ? A.dabord.filter((c) => typeof c === 'string')
  : ['thread', 'conversations', 'shells', 'staging']
const PHARES = new Set(Array.isArray(A.phares) ? A.phares : ['thread', 'conversations'])
const DATE = typeof A.date === 'string' ? A.date : '(date non fournie — la lire avec `date -I`)'
const PR = A.pr !== false
const BASE = typeof A.base === 'string' && A.base ? A.base : 'dev'

// ---------------------------------------------------------------------------
// LE SOCLE — ce que TOUT agent lit avant de travailler
// ---------------------------------------------------------------------------

const SOCLE = `
TU TRAVAILLES SUR LA V3.1 WEB DE MEESHY (\`apps/web-v3\` — Vite + Preact via preact/compat +
Tailwind 4 + TanStack Query + zustand + routeur maison, empaquetable Android/iOS par Capacitor 8),
monorepo ${REPO}, sur ${NOM_DE_BRANCHE}. Date : ${DATE}.

TON REPERTOIRE DE TRAVAIL EST ${REPO} — et le shell REINITIALISE le cwd entre deux appels Bash :
PREFIXE CHAQUE commande, SANS EXCEPTION, par \`cd ${REPO} && \` (ou le sous-dossier vise, p.ex.
\`cd ${V3} && \`). Une commande sans ce prefixe s'execute dans le cwd de session, qui peut etre un
AUTRE clone/worktree du meme depot, occupe par une autre session — c'est le MAUVAIS depot : ce que
tu y lirais est faux, ce que tu y ecrirais detruirait le travail d'un autre. Premiere commande de
ta mission, litteralement : \`cd ${REPO} && git branch --show-current\` — elle doit rendre la
branche attendue. NE CHANGE JAMAIS DE BRANCHE, ne cree pas de worktree.

LA DIRECTIVE DU PORTEUR (2026-09-07 soir), qui gouverne ce chantier :
« developper dans apps/web-v3 une application similaire a la version iOS (apps/ios) pour le web ET
Android en une fois ; organiser une boucle de developpement qui atteint la maturite feature par
feature ; recuperer les icones, logo, signature, splashscreen, stickers, features ; verifier la
coherence generale sur l'emulateur Android (QEMU) et tester sur Chrome en local connecte a
*.staging.meeshy.me. »

SOURCES DE VERITE, dans cet ordre — lis-les AVANT d'ecrire quoi que ce soit :
0. ${V3}/targets/README.md   LA CIBLE DES QUATRE VUES — Lentille (la liste), Focal, Script et Bulles
   (le fil) — capturee le 2026-09-08 sur l'app iOS DRAPEAUX BETA ACTIVES (directive porteur
   2026-09-08, issue #5672, decision D-20) : les captures (targets/*.png, clair ET sombre, listees
   et decrites par targets/captures.md — la preuve drapeaux ON est settings.beta.*), les arbres
   d'accessibilite (*.a11y.txt), les donnees semees sur staging (targets/seed.md) et les analyses
   (targets/lentille.md, focal-script.md, bulle.md, resume.md, riviere.md : anatomie citee
   fichier:ligne, lois, etats, gestes, tableau iOS → web-v3 avec verdict par element, ecarts
   ordonnes par visibilite avec leur temoin). targets/README.md en est la synthese : ce qui est
   tranche, ce qui reste a trancher (#5680), les defauts de la cible iOS (#5681-#5683). Ce dossier
   PRIME sur toute specification anterieure et sur toute capture faite drapeaux eteints.
   Le fait le plus lourd qu'il etablit : sur iOS, ce qui distingue Focal de Script n'est PAS une
   courbe d'estompage (retiree le 2026-08-24) mais l'ELECTION d'une rangee — carte teintee, chip
   d'identite agrandi, tampon date — armee au defilement soutenu et aplatie 4,5 s apres ; web-v3
   applique aujourd'hui la courbe retiree et n'a pas l'election (targets/focal-script.md § 4). UNE CAPTURE iOS N'EST UNE CIBLE QUE DRAPEAUX ON : iOS porte trois drapeaux
   (lentille_list, reading_modes, riviere_mode — Lentille/Core/LentilleFeatureFlag.swift) qu'un
   seul interrupteur allume, Reglages › Beta (cle UserDefaults meeshy.pref.beta_features_enabled,
   Lentille/Core/BetaFeaturesPreference.swift). Une installation neuve les a OFF : une capture
   sans la preuve « Reglages › Beta : programme ON » montre l'ANCIEN produit (liste en cartes,
   fil en bulles sans puce de mode — la bulle iOS n'a PAS de queue, rayon 18 uniforme dans les deux
   configurations, targets/bulle.md) et ne vaut rien comme cible. Au simulateur : \`xcrun simctl terminate <udid>
   me.meeshy.app && xcrun simctl spawn <udid> defaults write me.meeshy.app
   meeshy.pref.beta_features_enabled -bool true && xcrun simctl launch <udid> me.meeshy.app\`.
1. ${IOS}/Meeshy/Features/** et ${SDK}/Sources/**   LA REFERENCE (decision D-1) : disposition,
   hierarchie, etats et gestes de CHAQUE ecran se lisent dans le code SwiftUI — jamais dans la
   planche web de l'ancienne v3. Un ecran web-v3 se specifie en CITANT les fichiers Swift qui
   font foi (Features/Main/Views/*, Features/Main/Lentille/*, Features/Main/Focal/*,
   Features/Main/Riviere/*, Features/Main/Composer/*, Features/Stories/*, Features/Auth/*,
   Features/Contacts/*).
2. ${V3}/decisions.md   les decisions D-1 a D-14 (et suivantes), OPPOSABLES : D-1 la v4 suit
   l'interface iOS ; D-2 runtime Preact, API React ; D-3 routeur maison (src/lib/router.tsx) ;
   D-4 palette DERIVEE de Swift, jamais recopiee ; D-5 nomenclature du legacy, on AJOUTE ;
   D-6 /c/ ne revele rien d'une conversation dont on n'est pas membre ; D-7 lecture FOCALE par
   defaut ; D-9 la lentille est la SEULE peau de liste ; D-11 jamais deux notifications pour un
   meme evenement ; D-13 le CODE est nomme en ANGLAIS (fichiers, identifiants, jetons, cles JSON,
   scripts npm — la PROSE reste en francais : commentaires, messages de gate, commits, textes
   utilisateur) ; D-14 les types et trois lois viennent de @meeshy/shared.
3. ${V3}/README.md   les mesures fondatrices (24,53 Ko gzip avant premier pixel en Preact, budgets
   Fast 3G, variante A PWA / variante B Capacitor sur le MEME dist) et la doctrine des captures
   (horloge figee, fixtures ancrees sur maintenant).
4. ${V3}/parity.md + \`node ${V3}/scripts/route-inventory.mjs\`   l'inventaire de parite (issue
   #5492) : ce document est une PROJECTION du script — le jour ou ils divergent, c'est le document
   qui a tort.
5. ${REPO}/packages/design-tokens/   les jetons GENERES depuis MeeshyColors.swift et
   DesignTokens.swift par scripts/generate-from-ios.mjs — aucune valeur de couleur ou de geometrie
   ecrite a la main (D-4) ; \`bun run check:tokens\` prouve la derivation, \`check:tokens-resolved\`
   prouve que le navigateur les peint.
6. ${REPO}/CLAUDE.md   TDD non negociable, TypeScript strict sans 'any', immuabilite, budget
   1000-1200 lignes par fichier, UNE source de verite, Instant App Principles, Prisme
   Linguistique, treize dimensions.
7. ${REPO}/tasks/lessons.md   les 40 dernieres lecons (tail -400) — le depot a deja paye ces erreurs.
8. Le code EXISTANT de ${V3} : src/routes/ (conversations, thread, route-table), src/components/
   (shell, bubble, composer, avatar, glyph, lens-row), src/lib/ (router, reader, scheme, accent,
   grouping, api/prism, api/fixtures, lens/law, view/*), src/institutional/, scripts/ (gate
   composite, capture.mjs, check-*.mjs, measure-weight.mjs, route-inventory.mjs,
   generate-icons.py, extract-glyphs.mjs), budgets.json, capacitor.config.ts, vite.config.ts.

ATTENTION — \`docs/product/MeeshyWebV3Design/\` (planche, matrice, ordre, conception-web-v3.md)
decrit l'ANCIENNE v3 (\`apps/web-old-version3\`, Next.js, ARRETEE le 2026-09-07). C'est un materiau
d'HISTOIRE : n'y inscris rien, n'en fais jamais une cible (D-1). \`apps/web-old-version3\` ne se
touche pas.

LES TROIS PLATEFORMES, UN SEUL CODE :
- WEB : \`vite build\` → dist/ (variante A, PWA) ; serveur local \`bunx vite --port 5173\`.
- COQUES (variante B) : \`MEESHY_TARGET=capacitor bunx vite build && bunx cap sync\` — le MEME dist,
  base relative, sans service worker. Les coques ios/ et android/ de ${V3} sont GENEREES
  (\`bunx cap add ios\`, \`bunx cap add android\`) si absentes ; capacitor.config.ts est la source.
- OUTILLAGE LOCAL VERIFIE (2026-09-07) : SDK Android a ~/android-sdk (PAS ~/Library/Android),
  JAVA_HOME=/opt/homebrew/opt/openjdk@21, AVD \`Meeshy_Poc_Web-v31\` (nom affiche « Meeshy Poc Web-v31 », android-36 arm64, demarrage :
  ~/android-sdk/emulator/emulator -avd Meeshy_Poc_Web-v31 -no-snapshot -no-audio), adb dans
  ~/android-sdk/platform-tools ; APK par \`cd ${V3}/android && JAVA_HOME=/opt/homebrew/opt/openjdk@21 ANDROID_HOME=~/android-sdk ./gradlew assembleDebug\`
  → app/build/outputs/apk/debug/app-debug.apk. Simulateur iOS DEDIE a la COQUE du chantier : « Meeshy Poc-Web-V31 »
  (${SIM_CHANTIER}, iPhone 16 Pro, iOS 26.1 — la DERNIERE version iOS disponible, directive porteur — noms fixes par le porteur
  2026-09-07 : c'est LUI qui recoit la coque, jamais un autre) ; build par \`xcodebuild -project ${V3}/ios/App/App.xcodeproj -scheme App -destination 'id=${SIM_CHANTIER}' build\`
  → produits sous ${V3}/ios/App/Build/Products/Debug-iphonesimulator/App.app (le projet fixe son
  SYMROOT — ne cherche pas dans DerivedData).

DEUX SIMULATEURS, DEUX APPS, UN SEUL IDENTIFIANT — la regle qui empeche de se comparer a soi-meme
(2026-09-09). L'app NATIVE ${IOS} (LA REFERENCE de tout ecran, D-1) et la coque Capacitor de web-v3
(L'OBJET TESTE) portent toutes deux \`me.meeshy.app\` : installer l'une REMPLACE l'autre sans un
mot. Le 2026-09-09, la « capture de l'ecran iOS » d'un tour a montre web-v3 sur ses fixtures.
- LA REFERENCE vit sur « Meeshy Ref-Native » (${SIM_REF}) : apps/ios NATIF, drapeaux beta ON,
  compte \`cible-web-trois\` de targets/seed.md sur STAGING. Ce simulateur NE RECOIT JAMAIS la
  coque — ni \`xcodebuild\` du projet ${V3}/ios, ni \`cap run\`, ni \`simctl install\` d'un App.app.
  Si l'app manque : \`xcrun simctl install ${SIM_REF} ${IOS}/Build/Products/Debug-iphonesimulator/Meeshy.app\`
  (build par \`${IOS}/meeshy.sh build\` si absent), puis le drapeau (source 0 du socle).
- LA COQUE vit sur « Meeshy Poc-Web-V31 » (${SIM_CHANTIER}) et NULLE PART AILLEURS. Aucune capture
  prise sur ce simulateur n'est une cible iOS, quoi qu'elle montre.
- AVANT TOUTE CAPTURE DE REFERENCE, TROIS verifications, dans l'ordre — la capture est NULLE si une
  seule echoue, et tu ecris les trois resultats dans ton rapport a cote de chaque capture :
  1. \`xcrun simctl listapps ${SIM_REF} | grep -A8 '"me.meeshy.app"' | grep Path\` finit par
     \`/Meeshy.app\` (CFBundleName = Meeshy) — jamais \`/App.app\` ;
  2. \`idb ui describe-all --udid ${SIM_REF}\` rend PLUSIEURS noeuds (boutons, textes, cellules) :
     UN SEUL noeud AXApplication = une WKWebView = la coque, jamais une vue native ;
  3. l'ecran montre les comptes SEMES de targets/seed.md (cible-web-trois, Bruno Beta, le Salon
     Riviere…). Kwame Mensah, Amina Diallo, Fatou Ba, « Equipe deploiement », la puce « AUTO Focal »,
     l'auteur « Vous » sont les FIXTURES de web-v3 : si tu les vois, tu regardes web-v3, pas iOS.
- CAPTURES WEB : \`cd ${V3} && BASE=http://localhost:5173 CHROMIUM='' node scripts/capture.mjs\`
  (le script epingle un chemin CI Linux ; CHROMIUM vide fait retomber Playwright sur son cache
  local). Captures Android : \`adb exec-out screencap -p > f.png\` ; iOS : \`xcrun simctl io <udid>
  screenshot f.png\`. REGARDE les captures (outil Read), ne les enumere pas.

LE RESEAU :
- Aujourd'hui les donnees viennent de FIXTURES (src/lib/api/fixtures.ts, ancrees sur maintenant).
- Le reseau REEL se branche sur le STAGING : passerelle https://gate.staging.meeshy.me/api/v1
  (auth POST /auth/login, socket.io sur le namespace par defaut). Lis vite.config.ts et
  src/lib/api/* pour savoir comment la base se configure ; si aucun mecanisme n'existe encore,
  c'est le travail \`staging\` qui le cree — UNE config, jamais une jumelle des fixtures.
- AUCUN gate ne depend du staging : les temoins tournent sur fixtures et bouchons. Le staging sert
  a la RECETTE manuelle (Chrome local, QEMU, simulateur) et aux verifications de coherence.

REGLES NON NEGOCIABLES :
- D-13 : tout NOM nouveau (fichier, identifiant, jeton, cle JSON, script npm) est en ANGLAIS ;
  la prose (commentaires, commits, gates, textes utilisateur) reste en francais.
- Prisme linguistique : la descente vit dans src/lib/api/prism.ts et suit resolvePrismTranslation
  de @meeshy/shared (D-14) ; un temoin de RANG s'ecrit sur un rang AUTRE que le premier ;
  \`lang="xx"\` sur tout noeud rendu dans une langue differente du document.
- Les DEUX schemas (clair et sombre) sont regardes a chaque ecran ; la bascule se fait par
  src/lib/scheme.ts — jamais une seconde source.
- Etats dessines : vide, chargement (jamais un spinner sur un cache non vide), erreur, hors-ligne,
  refus. Un ecran blanc n'est pas un etat. Un controle existe s'il a un EFFET : rien d'inerte.
- TDD : le temoin qui echoue AVANT le code (bun test, fichiers *.test.ts a cote du module) ;
  comportement par l'API publique, jamais l'implementation.
- LE POIDS EST UN GATE : budgets.json et check-curve.mjs gardent la courbe — mesure
  (measure-weight.mjs), ne devine jamais un chiffre ; « a mesurer » plutot qu'un chiffre invente.
- Ajouter a un fichier deja hors budget (1000-1200 lignes) est interdit : on extrait d'abord.
- Ne desactive JAMAIS un test, ne baisse JAMAIS un seuil, ne pose JAMAIS un ignore pour passer.
- N'ecris JAMAIS un nom de modele dans un commit, un commentaire ou un fichier du depot.
- \`gh\` est disponible en local ; s'il echoue, les outils mcp__github__ via ToolSearch.
- LIVRAISON INCREMENTALE (directive porteur 2026-09-07) : le chantier avance PAS A PAS — chaque
  travail livre part vers \`dev\` dans l'heure (commit, push, PR auto-merge), pour qu'un staging
  UTILISABLE suive le developpement. On ne garde jamais deux travaux finis en attente d'un
  troisieme ; un travail vert PART.
`

const dossierDeTravail = `${SCRATCH}` // hors du depot suivi (.cache est gitignore)

// ---------------------------------------------------------------------------
// LA PASSERELLE — la v3 s'y conforme, elle ne la modifie jamais
// ---------------------------------------------------------------------------

const PASSERELLE = `
CONFORMITE A LA PASSERELLE — la v3.1 NE TOUCHE PAS services/gateway, ni le schema Prisma, ni les
types partages cote serveur : elle SE CONFORME a la passerelle TELLE QU'ELLE EST. Une issue gateway
compagnon peut s'ouvrir ; un patch serveur pour une capacite nouvelle, jamais.
SEULE EXCEPTION — un BOGUE PROUVE : un comportement du gateway qui contredit son propre contrat.
Il se corrige a la racine, et seulement ainsi : (1) un test du gateway qui ECHOUE et reproduit le
bogue, ecrit AVANT le correctif ; (2) le correctif MINIMAL ; (3) la suite rejouee sur le perimetre
(\`cd services/gateway && bun run test -- <fichier>\`) ; (4) sa propre issue et son propre commit ;
(5) le rapport cite la preuve. Un diff serveur sans ces cinq elements est BLOQUANT en revue.
- Avant d'ecrire un appel, LIS la route REELLE dans services/gateway/src/routes/** : chemin exact
  (prefixe /api/v1), methode, schema de corps, prevalidation d'auth (Authorization: Bearer /
  X-Session-Token / optionalAuth), forme de la reponse ({ success, data, error, pagination } —
  \`error\` est une CHAINE PLATE) et codes d'erreur. Cite fichier:ligne pour CHAQUE endpoint.
  Un endpoint qui n'existe pas ne s'invente pas : la capacite n'est pas exposee, une issue gateway
  compagnon est ouverte — jamais un contournement.
- TEMPS REEL : UN client socket.io vers le namespace par defaut, authentifie comme
  services/gateway/src/socketio/handlers/AuthHandler.ts l'attend, et UNIQUEMENT les evenements de
  packages/shared/types/socketio-events.ts (format entity:action-word a tirets) avec leurs charges
  REELLES — lis les handlers pour la forme exacte (message:new, message:translation,
  typing:start/stop, reaction:added, conversation:unread-updated…). Aucun champ devine.
- DELTA et cache : GET /api/v1/sync tel que routes/sync.ts le sert (ETag/304, curseur keyset,
  hasGap) — pas un second moteur.
- Les FIXTURES (src/lib/api/fixtures.ts) et tout bouchon MIMENT la passerelle reelle : memes
  chemins, memes codes, memes formes de charge, PRISES DANS LE CODE du gateway. Pour chaque
  endpoint ou evenement bouchonne, le rapport nomme la route ou l'emetteur reel copie.
`

// ---------------------------------------------------------------------------
// LES DECISIONS DU PORTEUR — elles PRIMENT sur tout cadrage qui les rediscute
// ---------------------------------------------------------------------------

const DIRECTIVES = `
DECISIONS DU PORTEUR EN VIGUEUR — ne les rediscute pas : applique-les.

1. L'APP iOS EST LA REFERENCE DE CHAQUE ECRAN (D-1, 2026-09-07). Avant de specifier ou de coder un
   ecran, OUVRE les fichiers Swift qui le rendent (Features/**, MeeshySDK) et cite-les : la
   disposition, la hierarchie, les etats, les gestes et le VOCABULAIRE viennent de la. La coherence
   verifiee le 2026-09-07 sur les trois plateformes (liste + fil identiques au pixel pres, accent
   par conversation, Prisme, schemas clair/sombre) est le niveau attendu de tout ecran nouveau.

2. LES ASSETS iOS SE RECUPERENT, ILS NE SE REDESSINENT PAS (directive 2026-09-07 soir — cle
   \`assets\`) : icones d'app, logo, signature, splashscreen, stickers viennent de
   ${IOS}/Meeshy/Assets.xcassets et ${IOS}/Meeshy/Resources ; le pipeline existe deja —
   ${V3}/scripts/generate-icons.py et extract-glyphs.mjs — on l'ETEND, on ne le double pas.
   Les coques Capacitor (icone, splash, fond #0b0c14) et le manifest PWA servent les MEMES actifs.

3. TROIS DEFAUTS DE COQUE RELEVES LE 2026-09-07, a corriger en priorite (cle \`shells\`), chacun
   avec son temoin :
   a) iOS : la safe-area BASSE n'est pas respectee — le composeur et la barre de recherche passent
      sous l'indicateur home (viewport-fit / env(safe-area-inset-bottom) a poser dans le dist,
      correct sur Android et sur le web) ;
   b) Android : le bouton RETOUR materiel depuis un fil QUITTE l'app au lieu de revenir a la liste
      (l'historique du routeur maison n'est pas pousse, ou le back Capacitor n'est pas cable —
      lis src/lib/router.tsx et la doc @capacitor/app) ;
   c) iOS : la bascule clair/sombre A CHAUD n'est pas repercutee (elle ne prend qu'au relancement —
      lis src/lib/scheme.ts : l'ecoute de prefers-color-scheme doit vivre, pas une lecture unique).

4. LE FIL EST UN CHAT VIVANT, JAMAIS UN FORMULAIRE (directives 2026-09-03/04, reconduites) :
   toute action a un effet IMMEDIAT et OPTIMISTE ; citation/reponse avec saut et mise en evidence,
   plein ecran sur tout media, transcription au Prisme, avatar et nom dans le pied de la DERNIERE
   bulle d'une suite (jamais la premiere, regle iOS), groupement meme auteur + meme jour SANS
   fenetre temporelle ET jamais a travers un message systeme (MessageDayGrouping.swift:97 ;
   src/lib/grouping.ts ne porte pas encore ce troisieme critere), bulle envoyee INDIGO de marque,
   bulle recue : voir la CHARTE (iOS mele la couleur de l'expediteur a 70 % d'indigo — question
   produit ouverte, l'« accent de la conversation » de cette directive n'est que le repli iOS),
   recherche de la liste EN BAS.
   Le mode de lecture par defaut est FOCAL (D-7) et la lentille est la seule peau de liste (D-9).
   LA CIBLE EST iOS DRAPEAUX ACTIVES (D-20, directive porteur 2026-09-08) : la Lentille, Focal,
   Script et Bulles se lisent dans ${V3}/targets/ — jamais dans une capture drapeaux eteints, et
   « ecart assume avec iOS ou le drapeau est desactive » n'est plus une phrase recevable.
   ET LA V3.1 N'A NI DRAPEAU NI PROGRAMME BETA (porteur, 2026-09-08 : « dans cette version pas
   besoin de ceci ! par defaut la lentille est la et la conversation focal aussi avec possibilite
   des choix en script ou bulle ») : les drapeaux iOS ne servent qu'a CAPTURER la cible ; sur le
   web, la Lentille EST la liste (aucune autre peau), le fil S'OUVRE en Focal, et l'utilisateur
   CHOISIT Script ou Bulles par la puce de mode. Resume et Riviere ENTRENT au perimetre sous leurs
   conditions (D-21 remplace D-8 — targets/resume.md, targets/riviere.md) : le Resume apres un corpus
   de fixtures qui l'atteigne (26 non-lus), l'inversion de check-reading-mode.mjs et le cadrage des
   dates par la langue du lecteur ; la Riviere apres la virtualisation du trace (D-15, miroir de
   RiverCanvasRankPlacement) — sa loi est deja dans @meeshy/shared (river-lanes.ts, 61 vecteurs) et
   son eligibilite lit conversation.memberCount, deja servi. Ordre : Lentille, rangee plate (Focal,
   Script) et Bulle d'abord, puis Resume, puis Riviere ; tous deux en chunk A LA DEMANDE. Un mode
   dont la condition n'est pas levee reste LISTE et motive au menu, jamais rendu.
   Aucun toggle « beta », aucun \`isFlagEnabled\` configurable, aucun chemin « bulles par defaut ».

5. STORY ET COMMENTS SE LIVRENT AU LECTEUR CONNECTE (decision 2026-09-02, la passerelle n'a pas
   bouge) : GET /posts/:postId et GET /posts/:postId/comments sont en requiredAuth — un visiteur
   sans session recoit une INVITATION a se connecter, jamais une erreur ; rien du contenu ne part
   avant la connexion.

6. LE BON MODELE AU BON MOMENT (2026-09-04) : fable DECRIT, sonnet et haiku DEVELOPPENT, opus
   RELIT ET CORRIGE — un agent ne choisit pas son modele, il fait le travail de son role. Le
   SPECIFICATEUR dit si l'implementation est PETITE (haiku) ou non (sonnet), et pourquoi.

7. QUALITE ET OPTIMISATION DES LA PREMIERE ITERATION (directive porteur 2026-09-07 soir). On ne
   livre pas un brouillon qu'on ameliorera plus tard : la PREMIERE forme est deja la bonne —
   mesuree (poids, requetes, re-rendus), maintenable, et pensee pour les 40+ surfaces iOS qui
   restent a porter. La REVUE est TRES POINTILLEUSE et porte une vision GLOBALE et MOYEN/LONG
   TERME : elle juge le diff ET la trajectoire — cette forme tiendra-t-elle quand toutes les
   surfaces seront la ? ce motif sera-t-il copie par trente ecrans (alors il doit etre juste
   MAINTENANT) ? cette commodite d'aujourd'hui est-elle la jumelle de demain ? Un « ca marche »
   qui rame, re-rend pour rien ou fige une mauvaise forme n'est PAS livrable.
`

// ---------------------------------------------------------------------------
// LES ECRANS PHARES — le fil et la liste (memes priorites que l'app iOS)
// ---------------------------------------------------------------------------

const PHARE = `
CET ECRAN EST UN ECRAN PHARE : le fil (/c/:conversation) et la liste (/) sont ce qui compte le
plus — 100 % fonctionnels, attrayants, aeres, coherents avec l'app iOS au pixel pres, sur les
TROIS plateformes. Tu y mets toute ton intelligence : rien d'approximatif, rien d'inerte.

CE QUI DOIT MARCHER (chaque ligne est un temoin a ecrire — bun test sur le comportement, capture
regardee pour le rendu, et QEMU + simulateur quand la coque est concernee) :
1. La liste (lentille, D-9) : rail de stories, filtres a EFFET (tous / non-lus / groupes / directs /
   epingles), lignes avec accent, badge de non-lus, apercu resolu par le Prisme
   (resolveLastMessagePreview via @meeshy/shared, D-14), recherche EN BAS a portee du pouce.
2. Le fil : groupement des bulles (grouping.ts), citation avec saut, reactions, vocal avec
   transcription au Prisme, indicateur de frappe, etats d'envoi, separateurs de jour, 60 fps au
   defilement, position de lecture conservee.
3. Le composeur : textarea qui grandit, envoi optimiste, erreur d'envoi VISIBLE avec reessayer,
   brouillon par conversation, micro et pieces jointes selon les droits, cibles >= 44 px.
4. Le Prisme : le contenu affiche EST la traduction preferee (src/lib/api/prism.ts) ; pastille
   translate discrete, drapeaux du pied, exploration de l'original au geste — et le temoin de rang
   s'ecrit sur un rang AUTRE que le premier.
5. Les coques : la MEME experience dans l'app Android (QEMU) et l'app iOS (simulateur) — safe-area
   respectee, retour materiel qui navigue, schemas clair et sombre.
6. Hors-ligne : l'app s'ouvre et lit depuis le cache (variante A : scripts/check-offline.mjs le
   prouve) ; en coque, la WebView embarque le dist.
7. Quand le reseau reel est branche (staging) : la liste et le fil se peuplent depuis
   gate.staging.meeshy.me, le temps reel suit les evenements de socketio-events.ts, et une panne
   reseau degrade proprement (bandeau, cache, jamais un ecran blanc).
`

// ---------------------------------------------------------------------------
// SCHEMAS
// ---------------------------------------------------------------------------

const TRAVAIL = {
  type: 'object',
  additionalProperties: false,
  required: ['cle', 'genre', 'titre_issue', 'critere_de_fin'],
  properties: {
    cle: { type: 'string', description: "la cle de surface (assets, shells, staging, conversations, thread, composer, stories, feed…) ou infra-N" },
    genre: { type: 'string', enum: ['ecran', 'infra', 'style'] },
    titre_issue: { type: 'string', description: 'SEMANTIQUE : le resultat attendu, jamais un code interne' },
    route: { type: 'string' },
    priorite: { type: 'string' },
    audience: { type: 'string' },
    critere_de_fin: { type: 'string', description: 'OBSERVABLE : une commande, une mesure, une assertion' },
    corps_issue: { type: 'string' },
    reference_ios: { type: 'string', description: "les fichiers Swift qui font foi pour cette surface (Features/…), ou '(infra)' si aucun ecran" },
    existe_deja: { type: 'string', description: "ce qui existe deja dans apps/web-v3 pour ce travail (fichiers), s'il y a lieu" },
    detail: { type: 'string' },
  },
}

const SYNCHRO = {
  type: 'object',
  additionalProperties: false,
  required: ['reintegre', 'etat'],
  properties: {
    reintegre: { type: 'boolean', description: 'true si la branche porte maintenant origin/DEPUIS' },
    etat: { type: 'string', description: 'FACTUEL : commandes et sorties (compte de commits repris, conflits, gates apres merge)' },
    commits_repris: { type: 'integer' },
    fichiers_touches_par_dev: { type: 'array', items: { type: 'string' }, description: 'les chemins que dev vient de bouger — ce que le tour ne doit pas reecrire a l aveugle' },
    conflit_non_resolu: { type: 'string', description: 'vide si tout est resolu ; sinon ce qui demande un arbitrage' },
    gates_apres_merge: { type: 'string', description: 'type-check / test apres la reintegration — ce qui est rouge AVANT le tour' },
    tenus_ailleurs: {
      type: 'array',
      description: 'ce que d AUTRES sessions tiennent en ce moment : PR ouvertes, branches claude/* poussees recemment, issues assignees',
      items: { type: 'object', additionalProperties: false, required: ['quoi', 'preuve'], properties: { quoi: { type: 'string' }, preuve: { type: 'string' }, cles_a_eviter: { type: 'array', items: { type: 'string' } } } },
    },
  },
}

const CADRAGE = {
  type: 'object',
  additionalProperties: false,
  required: ['etat', 'pret', 'travaux'],
  properties: {
    etat: { type: 'string', description: 'FACTUEL : commandes et sorties (routes presentes, gates qui passent, issues ouvertes)' },
    pret: { type: 'boolean' },
    blocage: { type: 'string' },
    lot_courant: { type: 'string' },
    travaux: { type: 'array', items: TRAVAIL },
    inventaire: {
      type: 'array',
      description: "l'ETAT DES LIEUX par SURFACE contre apps/ios — mesure, jamais impressionniste",
      items: {
        type: 'object', additionalProperties: false, required: ['surface', 'existe', 'a_jour_dans_dev', 'manque', 'verdict'],
        properties: {
          surface: { type: 'string' },
          reference_ios: { type: 'string', description: 'les fichiers Swift qui rendent cette surface dans apps/ios' },
          routes: { type: 'array', items: { type: 'string' } },
          existe: { type: 'string', description: 'fichiers web-v3 (avec wc -l) et ce qu ils font deja' },
          a_jour_dans_dev: { type: 'boolean', description: 'true si origin/dev porte le meme etat que la branche pour ces fichiers' },
          dernier_commit_dev: { type: 'string' },
          manque: { type: 'string', description: 'ce qui manque par rapport a l ecran iOS (fichiers Swift cites) et aux directives' },
          verdict: { type: 'string', enum: ['livre', 'a-completer', 'a-styliser', 'absent'] },
        },
      },
    },
    ecarte_car_tenu_ailleurs: {
      type: 'array',
      description: 'les cles ECARTEES de ce tour parce qu une autre session les tient — avec la preuve',
      items: { type: 'object', additionalProperties: false, required: ['cle', 'preuve'], properties: { cle: { type: 'string' }, preuve: { type: 'string' } } },
    },
  },
}

const CONCEPTION = {
  type: 'object', additionalProperties: false, required: ['rapport', 'inventaire_rc', 'cibles', 'fichiers_touches'],
  properties: {
    rapport: { type: 'string' },
    inventaire_rc: { type: 'number', description: 'code de sortie de node scripts/route-inventory.mjs apres mise a jour (doit etre 0)' },
    cibles: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['cle', 'png'], properties: { cle: { type: 'string' }, png: { type: 'string', description: 'la capture iOS de reference (clair), et sa jumelle sombre a cote' } } } },
    decisions_ajoutees: { type: 'array', items: { type: 'string' }, description: 'les D-n ajoutes a decisions.md ce tour, s il y en a' },
    fichiers_touches: { type: 'array', items: { type: 'string' } },
    contradictions: { type: 'string', description: 'ce que la directive contredit dans une decision existante, et comment c est tranche' },
  },
}

const ISSUES = {
  type: 'object', additionalProperties: false, required: ['issues', 'outils_disponibles'],
  properties: {
    outils_disponibles: { type: 'boolean' },
    issues: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['cle', 'titre', 'numero'],
        properties: { cle: { type: 'string' }, titre: { type: 'string', description: 'le titre SEMANTIQUE du travail, recopie VERBATIM — c est lui qui distingue deux travaux de la meme surface' }, numero: { type: 'number' }, url: { type: 'string' }, deja_ouverte: { type: 'boolean' } },
      },
    },
  },
}

const DEFAUT = {
  type: 'object', additionalProperties: false, required: ['gravite', 'constat', 'preuve', 'correctif'],
  properties: {
    gravite: { type: 'string', enum: ['bloquant', 'majeur', 'mineur'] },
    constat: { type: 'string' }, preuve: { type: 'string', description: 'fichier:ligne, commande et sortie' }, correctif: { type: 'string' },
  },
}

const REVUE = {
  type: 'object', additionalProperties: false, required: ['verdict', 'defauts'],
  properties: {
    verdict: { type: 'string', enum: ['conforme', 'a-corriger', 'a-refaire'] },
    defauts: { type: 'array', items: DEFAUT },
    dimensions_mures: { type: 'array', items: { type: 'string' } },
    dimensions_restantes: { type: 'array', items: { type: 'string' } },
  },
}

const SPEC = {
  type: 'object', additionalProperties: false, required: ['specification', 'modele', 'pourquoi_ce_modele', 'fichier'],
  properties: {
    specification: { type: 'string', description: "la specification COMPLETE, en Markdown : l'ecran iOS lu et cite (fichiers Swift), etat des lieux mesure, routes et evenements reels (fichier:ligne), temoins a ecrire d'abord, decoupage, etats et gestes, mesures, interdits, questions tranchees" },
    modele: { type: 'string', enum: ['petit', 'developper'], description: "petit = haiku suffit (une feuille, un contenu, un relais delimite, sans temps reel ni route nouvelle) ; developper = sonnet" },
    pourquoi_ce_modele: { type: 'string' },
    fichier: { type: 'string', description: 'le chemin ou la specification a ete ecrite' },
    endpoints: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['route', 'site', 'existe'], properties: { route: { type: 'string' }, site: { type: 'string', description: 'fichier:ligne dans services/gateway/src, ou packages/shared/types/socketio-events.ts pour un evenement' }, existe: { type: 'boolean' } } } },
    temoins: { type: 'array', items: { type: 'string' }, description: 'un par ligne du critere de fin : fichier, describe, ce qui est prouve' },
    questions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['question', 'reponse_retenue'], properties: { question: { type: 'string' }, reponse_retenue: { type: 'string' } } } },
  },
}

const REVUE_CORRIGEE = {
  type: 'object', additionalProperties: false, required: ['verdict', 'defauts_trouves', 'corriges', 'restants', 'rapport'],
  properties: {
    verdict: { type: 'string', enum: ['conforme', 'a-corriger', 'a-refaire'], description: "l'etat APRES les corrections du relecteur" },
    defauts_trouves: { type: 'array', items: DEFAUT, description: 'TOUS les defauts constates, corriges ou non' },
    corriges: { type: 'number', description: 'combien le relecteur a corriges lui-meme' },
    restants: { type: 'array', items: DEFAUT, description: 'ce qui reste au developpeur : bloquant et majeur seulement, avec le correctif propose' },
    rapport: { type: 'string', description: 'ce qui a ete corrige, fichier par fichier, et les commandes rejouees avec leurs sorties' },
    gates_rejoues: { type: 'string', description: 'type-check / test / build apres correction — sorties tronquees, jamais un resume' },
    dimensions_mures: { type: 'array', items: { type: 'string' } },
    dimensions_restantes: { type: 'array', items: { type: 'string' } },
  },
}

const CORRECTION = {
  type: 'object', additionalProperties: false, required: ['corriges', 'refutes', 'rapport'],
  properties: {
    corriges: { type: 'number' },
    refutes: { type: 'number' },
    rapport: { type: 'string' },
  },
}

const GATES = {
  type: 'object', additionalProperties: false, required: ['gates', 'tous_verts'],
  properties: {
    gates: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['nom', 'commande', 'resultat'],
        properties: {
          nom: { type: 'string' }, commande: { type: 'string' },
          resultat: { type: 'string', enum: ['vert', 'rouge', 'non-applicable'] },
          sortie: { type: 'string', description: 'la SORTIE reelle, tronquee — jamais un resume' }, pourquoi_non_applicable: { type: 'string' },
        },
      },
    },
    tous_verts: { type: 'boolean' },
    ce_qui_bloque: { type: 'string' },
    mesures: { type: 'string', description: 'les chiffres rendus par measure-weight / check-curve, tels quels' },
  },
}

const LIVRAISON = {
  type: 'object', additionalProperties: false, required: ['pousse', 'rapport'],
  properties: {
    pousse: { type: 'boolean' },
    commits: { type: 'array', items: { type: 'string' } },
    issues_fermees: { type: 'array', items: { type: 'number' } },
    pr_numero: { type: 'number', description: 'le numero de la PR ouverte ou reprise pour la branche (0 si aucune)' },
    auto_merge: { type: 'boolean', description: "true si l'auto-merge de la PR est arme" },
    rapport: { type: 'string' },
  },
}

const COMPLETUDE = {
  type: 'object', additionalProperties: false, required: ['rapport', 'prochains_travaux'],
  properties: {
    rapport: { type: 'string' },
    manques_ios: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['feature', 'ou_dans_ios', 'surface_v3'], properties: { feature: { type: 'string' }, ou_dans_ios: { type: 'string' }, surface_v3: { type: 'string' }, priorite: { type: 'string' } } } },
    prochains_travaux: { type: 'array', items: { type: 'string' }, description: 'les cles de surface du prochain tour, dans l ordre' },
    dimensions_non_mures: { type: 'array', items: { type: 'string' } },
  },
}

// ---------------------------------------------------------------------------
// OUTILS DE SCRIPT
// ---------------------------------------------------------------------------

const court = (valeur, n) => JSON.stringify(valeur === undefined ? null : valeur, null, 1).slice(0, n)

const ligneDeTravail = (t) =>
  `- cle=${t.cle} | genre=${t.genre} | titre=${t.titre_issue}` +
  (t.route ? ` | route=${t.route}` : '') +
  (t.priorite ? ` | ${t.priorite}` : '') +
  (t.audience ? ` | audience=${t.audience}` : '') +
  `\n  critere : ${t.critere_de_fin}` +
  (t.reference_ios ? `\n  reference iOS : ${t.reference_ios}` : '') +
  (t.existe_deja ? `\n  existe deja : ${t.existe_deja}` : '') +
  (t.detail ? `\n  detail : ${t.detail}` : '')

const resultatsDesTours = []
let focusDuTour = FOCUS

for (let tour = 1; tour <= TOURS; tour += 1) {
  log(`=== TOUR ${tour}/${TOURS} — focus : ${focusDuTour.join(', ')} ===`)

  // -------------------------------------------------------------------------
  phase('Synchroniser')
  // -------------------------------------------------------------------------
  const synchro = await agent(`ETAPE 0, AVANT TOUT AUTRE MOT — COLLE ET EXECUTE EXACTEMENT CETTE COMMANDE :
\`cd ${REPO} && git branch --show-current\`
Si la sortie n'est pas la branche attendue (${NOM_DE_BRANCHE}), c'est que ta commande n'avait pas
le prefixe \`cd ${REPO} && \` — recommence avec le prefixe. Tout diagnostic rendu depuis un autre
repertoire est FAUX et sera rejete : le cwd de session est un AUTRE clone, occupe par une autre
session, et il ne te concerne en rien.

${SOCLE}

TA MISSION — REINTEGRER \`${DEPUIS}\` DANS ${NOM_DE_BRANCHE}, PUIS RELEVER CE QUE LES AUTRES SESSIONS TIENNENT.
Tu ne modifies AUCUN fichier de production autrement que par la fusion elle-meme.

A. LA REINTEGRATION
1. \`cd ${REPO} && git branch --show-current\` — tu DOIS etre sur ${NOM_DE_BRANCHE}.${BRANCHE === '(courante)' ? " Si la commande ne rend rien (HEAD detache), arrete-toi et dis-le : reintegre=false." : ` Si elle rend une
   AUTRE branche, tu es dans le mauvais depot : verifie ton prefixe \`cd ${REPO} && \` AVANT de
   conclure quoi que ce soit. Si la branche n'existe pas encore localement dans ${REPO}, cree-la
   depuis \`origin/${DEPUIS}\` (\`cd ${REPO} && git fetch origin ${DEPUIS} && git checkout -B ${BRANCHE} origin/${DEPUIS}\`).`}
   NE CHANGE JAMAIS pour une autre branche de travail, ne cree pas de worktree.
   Si \`${V3}/node_modules\` est vide ou absent, \`cd ${REPO} && bun install --ignore-scripts\` d'abord ;
   si \`${REPO}/packages/shared/dist\` est absent, \`cd ${REPO}/packages/shared && npx prisma generate --generator client && bun run build\`.
2. \`git status --short\` : si l'arbre est sale DE TON FAIT, commite un point d'etape d'abord (jamais de stash).
3. \`git fetch origin ${DEPUIS}\` (sur echec RESEAU seulement, 4 essais : 2s, 4s, 8s, 16s).
4. \`git log --oneline HEAD..origin/${DEPUIS}\` : compte les commits repris et lis leurs titres.
   \`git diff --stat HEAD...origin/${DEPUIS}\` : note les chemins que dev vient de bouger, en
   particulier sous apps/web-v3, apps/ios, packages/shared et packages/design-tokens.
5. \`git merge origin/${DEPUIS}\` — **JAMAIS** \`git pull --rebase\` ni \`git rebase\` (lecon 324).
   Un conflit se resout en gardant les DEUX apports quand les fichiers le permettent (lecons,
   decisions) ou en reconciliant le CODE par sa logique. Si un conflit demande un arbitrage
   produit, laisse-le, rends conflit_non_resolu et reintegre=false.
6. Apres la fusion : \`cd ${V3} && bun run type-check\` puis \`bun test 2>&1 | tail -5\`. Ce qui est
   rouge ICI est rouge AVANT le tour — un FAIT a rapporter (gates_apres_merge), pas un blocage.

B. LE RELEVE — CE QUE LES AUTRES SESSIONS TIENNENT
1. \`gh pr list --state open --limit 30\` : pour chaque PR ouverte, titre, branche head, et les
   fichiers touches si le titre ne suffit pas. Une PR qui touche apps/web-v3 TIENT son sujet.
2. \`git branch -r --sort=-committerdate | head -30\` + \`git log --oneline -1 --format='%ci %s' <branche>\`
   sur les branches claude/* de moins de 48 h : une branche vivante qui n'est pas la tienne TIENT son sujet.
3. \`gh issue list --state open --label web-v3 --limit 30\` (et sans label si vide) : une issue
   assignee ou citee par un commit tres recent de \`${DEPUIS}\` est prise.
Rends \`tenus_ailleurs\` : une entree par sujet tenu, avec la PREUVE et les CLES de surface a eviter.
Si gh ne repond pas, les outils mcp__github__ via ToolSearch ; sinon rends au moins le releve des
branches — l'absence de releve se DIT, elle n'arrete pas le tour.

Sois FACTUEL : 'etat' cite les commandes et leurs sorties, jamais une impression.`,
    // Modele developpeur, pas mecanique : haiku a ignore deux fois le prefixe `cd` et rendu un
    // diagnostic plausible et faux depuis le mauvais clone (2026-09-07) — la synchro d'ouverture
    // fonde tout le tour, elle merite la fiabilite de sonnet.
    { label: `synchroniser:tour-${tour}`, phase: 'Synchroniser', schema: SYNCHRO, model: MODELE.developper, effort: 'medium' })

  if (synchro && synchro.conflit_non_resolu) {
    log(`ARRET — la reintegration de ${DEPUIS} demande un arbitrage : ${synchro.conflit_non_resolu}`)
    resultatsDesTours.push({ tour, arret: 'conflit de reintegration', blocage: synchro.conflit_non_resolu, etat: synchro.etat })
    break
  }
  if (synchro && synchro.reintegre === false) {
    log(`ARRET — reintegration impossible : ${synchro.etat}`)
    resultatsDesTours.push({ tour, arret: 'reintegration impossible', etat: synchro.etat })
    break
  }
  if (synchro) {
    log(`${DEPUIS} reintegre : ${synchro.commits_repris || 0} commits repris` +
      (synchro.tenus_ailleurs && synchro.tenus_ailleurs.length ? ` — ${synchro.tenus_ailleurs.length} sujets tenus ailleurs` : ' — rien de tenu ailleurs'))
  }

  const TENUS = (synchro && Array.isArray(synchro.tenus_ailleurs) ? synchro.tenus_ailleurs : [])
  const CLES_TENUES = new Set(TENUS.flatMap((t) => Array.isArray(t.cles_a_eviter) ? t.cles_a_eviter : []))
  const RELEVE = TENUS.length
    ? `\nCE QUE D'AUTRES SESSIONS TIENNENT EN CE MOMENT — n'y touche pas, et ne prends aucune de leurs cles :\n${TENUS.map((t) => `- ${t.quoi} (preuve : ${t.preuve})${(t.cles_a_eviter || []).length ? ` — cles a eviter : ${t.cles_a_eviter.join(', ')}` : ''}`).join('\n')}\n${synchro && synchro.fichiers_touches_par_dev && synchro.fichiers_touches_par_dev.length ? `FICHIERS QUE \`${DEPUIS}\` VIENT DE BOUGER (relis-les avant de les reecrire) :\n${synchro.fichiers_touches_par_dev.slice(0, 40).join(', ')}\n` : ''}`
    : `\nAucun sujet releve comme tenu par une autre session a l'ouverture de ce tour.\n`

  // -------------------------------------------------------------------------
  phase('Cadrer')
  // -------------------------------------------------------------------------
  const cadrage = await agent(`${SOCLE}${RELEVE}
TA MISSION — CADRER ce tour. Tu ne modifies AUCUN fichier de production.
\`${DEPUIS}\` VIENT D'ETRE REINTEGRE : la base est fraiche, prends-la pour acquise.

1. MESURE ce qui existe : \`git branch --show-current\`, \`git status --short\`, \`git log --oneline -15\`,
   \`ls ${V3}/src/routes ${V3}/src/components ${V3}/src/lib\`, \`node ${V3}/scripts/route-inventory.mjs\`,
   \`ls -d ${V3}/ios ${V3}/android 2>/dev/null\` (les coques existent-elles ?).
   Lance les gates rapides pour connaitre le point de depart : \`cd ${V3} && bun run type-check\`,
   \`bun test 2>&1 | tail -5\`. Note ce qui est deja rouge AVANT ce tour.
1 bis. L'ETAT DES LIEUX PAR SURFACE, CONTRE L'APP iOS : pour chaque cle du focus —
   ${focusDuTour.join(', ')} — rends une entree d'\`inventaire\` : les fichiers Swift qui rendent
   cette surface dans ${IOS}/Meeshy/Features/** (lis-les : c'est la REFERENCE, D-1), les fichiers
   web-v3 qui la portent deja (wc -l, ce qu'ils font — lis-les, cite fichier:ligne), si origin/dev
   porte le meme etat que la branche, et ce qui MANQUE par rapport a l'ecran iOS et aux
   directives — verdict : livre / a-completer / a-styliser / absent.
   Pour \`conversations\` (Lentille) et \`thread\` (Focal, Script, Bulles, Resume, Riviere) :
   l'etat des lieux CONTRE iOS drapeaux ON est DEJA FAIT dans ${V3}/targets/ (lentille.md,
   focal-script.md, bulle.md, resume.md, riviere.md — tableau element iOS → web-v3, ecarts
   ordonnes par visibilite, temoins ; README.md en tete) : PARS de
   ses ecarts, ne le refais pas ; complete-le seulement si \`git log --since=<date du dossier>
   -- ${IOS}/Meeshy/Features/Main/{Lentille,Focal,Views/Bubble} ${V3}/src\` montre du mouvement.
   Pour \`assets\` : compare ${IOS}/Meeshy/Assets.xcassets et Resources a ce que ${V3}/public et
   les coques servent. Pour \`shells\` : rejoue les trois defauts de la DIRECTIVE 3 (ils sont
   peut-etre deja corriges — verifie dans le code, pas de memoire). Pour \`staging\` : lis
   src/lib/api/* et vite.config.ts — comment la base d'API se configure-t-elle aujourd'hui ?
2. Lis ${V3}/parity.md, ${V3}/decisions.md (toutes les D-n) et ${V3}/README.md.
3. \`gh issue list --state open --limit 40\` + \`gh issue view 5491\` (l'epopee « La v4 remplace la
   v3 en production ») : ce qui est deja ouvert ou ferme. Si gh ne repond pas, dis-le et continue.
4. CHOISIS LES TRAVAUX DU TOUR, plafonnes a ${PLAFOND}, dans l'ordre du focus. Une surface qui
   EXISTE mais est incomplete ou incoherente avec iOS est un travail (genre "ecran" ou "style").
   ECARTE toute cle tenue par une autre session (releve ci-dessus), rends-la dans
   \`ecarte_car_tenu_ailleurs\` avec sa preuve, et prends la suivante.
   Pour chaque travail : titre SEMANTIQUE, route, audience, reference_ios (les fichiers Swift),
   critere de fin OBSERVABLE, corps d'issue (Contexte · Preuve attendue · Critere de fin · Source).
5. Si un prerequis manque et qu'aucun travail utile n'est possible sans decision du porteur,
   pret=false et dis exactement quoi. Sinon pret=true.

Sois FACTUEL : 'etat' cite des commandes et leurs sorties, pas des impressions.`,
    { label: `cadrer:tour-${tour}`, phase: 'Cadrer', schema: CADRAGE, model: MODELE.decrire, effort: 'high' })

  if (!cadrage) { resultatsDesTours.push({ tour, arret: 'le cadrage n a rien rendu' }); break }
  if (!cadrage.pret) {
    log(`ARRET — ${cadrage.blocage}`)
    resultatsDesTours.push({ tour, arret: 'prerequis manquant', blocage: cadrage.blocage, etat: cadrage.etat })
    break
  }
  const SAUTER = new Set(Array.isArray(A.sauter) ? A.sauter.filter((c) => typeof c === 'string') : [])
  const choisis = (cadrage.travaux || [])
    .filter((t) => !CLES_TENUES.has(t.cle))
    .slice(0, PLAFOND)
    .filter((t) => !SAUTER.has(t.cle))
  const ecartes = (cadrage.travaux || []).filter((t) => CLES_TENUES.has(t.cle)).map((t) => t.cle)
  if (ecartes.length) log(`Ecartes — tenus par une autre session : ${ecartes.join(', ')}`)
  if (SAUTER.size) log(`Reportes au tour suivant : ${[...SAUTER].join(', ')}`)
  const rang = (cle) => { const i = DABORD.indexOf(cle); return i === -1 ? DABORD.length : i }
  const travaux = [...choisis].sort((a, b) => rang(a.cle) - rang(b.cle))
  if (!travaux.length) {
    log('Rien a faire : tout le focus est livre.')
    resultatsDesTours.push({ tour, arret: 'rien a faire', etat: cadrage.etat })
    break
  }
  log(`${travaux.length} travaux : ${travaux.map((t) => t.cle).join(', ')}`)

  // La charte visuelle N'EST PAS un travail de ce chantier : elle EST l'interface iOS (D-1) et les
  // jetons derives de Swift (D-4) ; check:tokens et check:tokens-resolved en sont les temoins.
  const CHARTE = `
LA CHARTE VISUELLE : l'interface iOS elle-meme (D-1) rendue par les jetons DERIVES de Swift (D-4,
packages/design-tokens/scripts/generate-from-ios.mjs). Aucune valeur en dur ; bulle a rayon
uniforme 18 px sans ombre ni degrade (le media a 16, targets/bulle.md § 10) ; bulle envoyee indigo
de marque ; bulle recue : iOS peint la couleur de l'EXPEDITEUR melee a 70 % d'indigo
(ThemedMessageBubble.swift:383-390), l'accent de conversation n'etant que le repli — question
produit ouverte (targets/README.md), ne tranche pas seul ; avatar+nom dans le pied de la DERNIERE
bulle d'une suite (showIdentityBar, BubbleStandardLayout.swift:238-240 — le parametre showAvatar
est MORT, ne t'y fie pas) ; recherche en bas ;
cibles >= 44 px ; les DEUX schemas regardes. Temoins : bun run check:tokens,
bun run check:tokens-resolved, node scripts/check-utilities.mjs.
`

  // -------------------------------------------------------------------------
  phase('Concevoir')
  // -------------------------------------------------------------------------
  const conception = await agent(`${SOCLE}
${PASSERELLE}${CHARTE}
TA MISSION — POSER LA CIBLE DE CHAQUE TRAVAIL AVANT LE CODE. La cible d'un ecran de la v3.1 est
L'ECRAN iOS QUI EXISTE (D-1) — pas une maquette web.

1. LES CAPTURES CIBLES iOS. Pour chaque travail de genre "ecran" ci-dessous, capture l'ecran de
   REFERENCE dans l'app iOS NATIVE au simulateur de REFERENCE « Meeshy Ref-Native » (${SIM_REF}) —
   JAMAIS sur « Meeshy Poc-Web-V31 » (${SIM_CHANTIER}), qui porte la coque Capacitor de web-v3 :
   installe l'app native si elle manque (\`xcrun simctl install ${SIM_REF} ${IOS}/Build/Products/Debug-iphonesimulator/Meeshy.app\`,
   build par \`${IOS}/meeshy.sh build\` — lis apps/ios/CLAUDE.md ;
   si le build iOS est trop long ou casse, dis-le et capture ce qui est atteignable), navigue
   jusqu'a l'ecran, capture CLAIR et SOMBRE (\`xcrun simctl ui ${SIM_REF} appearance dark\` puis
   relance l'app — la bascule a chaud ne prend pas), pose les fichiers dans
   ${dossierDeTravail}/cibles/<cle>.{light,dark}.png et REGARDE-LES.
   DRAPEAUX ON, OBLIGATOIREMENT (source 0 du socle, D-20) : AVANT toute capture, active le
   programme beta (\`xcrun simctl terminate ${SIM_REF} me.meeshy.app && xcrun simctl spawn ${SIM_REF}
   defaults write me.meeshy.app meeshy.pref.beta_features_enabled -bool true && xcrun simctl
   launch ${SIM_REF} me.meeshy.app\`), ouvre Reglages › Beta dans l'app et capture la PREUVE
   (${dossierDeTravail}/cibles/settings.beta.light.png : toggle ON, trois fonctionnalites actives).
   Sans cette preuve, aucune capture de ce tour n'est une cible. Si ${V3}/targets/ porte deja la
   cible de cette cle (lentille.*, thread.focal.*, thread.focal.scene.*, thread.script.*,
   thread.bubbles.*, thread.summary.*, thread.river.*, reading-mode-sheet.*, thread.message-menu.*),
   REUTILISE-la et ne recapture que si le Swift a bouge depuis la date du dossier (git log). Compte de test :
   \`${dossierDeTravail}/captures/signup-creds.txt\` s'il existe (compte jetable sur STAGING,
   jamais la production) ; sinon cree-en un par POST /api/v1/auth/register sur
   gate.staging.meeshy.me et note-le la. AVANT chaque capture, les TROIS verifications du socle
   (chemin /Meeshy.app, arbre a11y a plusieurs noeuds, comptes semes et non fixtures) — une capture
   qui en rate une est NULLE : ne la pose pas, dis-le dans le rapport. Si l'app est sur l'accueil :
   Sign in › Staging › identifiant cible-web-trois, mot de passe = 2e ligne du fichier de comptes
   (idb ui tap / idb ui text), et la ligne « Connected to » doit dire gate.staging.meeshy.me.
   Si l'ecran iOS n'existe pas (travail purement web), dis-le : la cible est alors la coherence
   avec les ecrans web-v3 existants.
2. LES DECISIONS. Si un travail impose une DIRECTION nouvelle (une regle, un placement, un
   mecanisme) qui n'est dans aucune D-n de ${V3}/decisions.md, ECRIS-LA : un « ## D-<suivant> ·
   <titre> — ${DATE} » au format des existantes (la regle, pourquoi, ce que ca coute). Une
   contradiction avec une D-n existante ne s'efface pas : elle se tranche par ecrit et se rend
   dans \`contradictions\`.
3. LA PARITE. \`node ${V3}/scripts/route-inventory.mjs\` doit rendre 0 ; si parity.md est en
   retard sur le script, regenere-le comme le document le prescrit (il est une PROJECTION du
   script). Rends son rc dans inventaire_rc.

TRAVAUX DU TOUR :
${travaux.map(ligneDeTravail).join('\n')}

Ne commit PAS. Rends le rapport, les cibles capturees (cle, png), les decisions ajoutees, le rc de
l'inventaire, les fichiers touches, les contradictions tranchees.`,
    { label: `concevoir:tour-${tour}`, phase: 'Concevoir', schema: CONCEPTION, model: MODELE.developper, effort: 'high' })

  if (conception && conception.inventaire_rc !== 0) {
    log(`ATTENTION : route-inventory.mjs rend rc=${conception.inventaire_rc} — la phase Gates devra le remettre a 0`)
  }
  const CIBLES = new Map(((conception && conception.cibles) || []).map((c) => [c.cle, c.png]))

  // -------------------------------------------------------------------------
  phase('Ouvrir')
  // -------------------------------------------------------------------------
  let numero = new Map()
  if (SANS_ISSUES) {
    log('Issues : sautees (sans_issues=true) — la tracabilite GitHub reste a faire par le porteur')
  } else {
    const ouverture = await agent(`${SOCLE}

TA MISSION — OUVRIR une issue GitHub par travail ci-dessous, dans isopen-io/meeshy, AVANT toute
ligne de code (regle du CLAUDE.md : « une tache sans issue n'existe pas »).

OUTILS : \`gh\` d'abord ; s'il ne repond pas, les outils mcp__github__ via ToolSearch ; si rien ne
repond, n'invente AUCUN numero — rends numero: 0 partout et outils_disponibles=false.

LE CADRE DU CHANTIER : l'epopee est #5491 (« La v4 remplace la v3 en production »). Le milestone du
chantier : retrouve-le (\`gh api repos/isopen-io/meeshy/milestones --jq '.[].title'\`) — celui qui
nomme ce resultat ; s'il n'existe pas, cree-le (\`gh api -X POST repos/isopen-io/meeshy/milestones
-f title='La v4 remplace la v3 en production' -f due_on=<echeance ISO a ~3 semaines>\`).

Pour CHAQUE travail :
- cherche d'abord une issue OUVERTE qui le couvre (\`gh issue list --search\`) ; si elle existe,
  rends son numero avec deja_ouverte=true — n'en cree pas une seconde ; si son titre ou son corps
  sont perimes, mets-la a jour plutot que d'ouvrir une jumelle ;
- rends \`titre\` = le titre du travail RECOPIE VERBATIM (c'est la cle : deux travaux peuvent
  partager la meme surface, jamais le meme titre) ;
- sinon cree-la : label "web-v3" (cree le label s'il n'existe pas), le milestone du chantier, et
  reference l'epopee #5491 dans le corps ;
- titre : le titre SEMANTIQUE fourni ; corps : Contexte (avec preuve fichier:ligne et la reference
  iOS), Preuve attendue, Critere de fin (in extenso), Source ;
- termine TOUJOURS le corps par une ligne vide, puis ---, puis
  _Generated by [Claude Code](https://claude.ai/code)_
- inscris l'issue au projet « Meeshy — pilotage » (gh project item-add 1 --owner isopen-io --url <url>)
  et pose Status = In Progress si le scope du token le permet ; sinon dis-le, ne bloque pas.

LES TRAVAUX :
${travaux.map(ligneDeTravail).join('\n')}`,
      { label: `ouvrir:tour-${tour}`, phase: 'Ouvrir', schema: ISSUES, model: MODELE.mecanique, effort: 'medium' })

    // Cle = le TITRE du travail, jamais la surface : deux travaux de la meme surface (`thread` x2 le
    // 2026-09-08) partageaient un numero, et le premier commit a ferme l'issue du second (#5676 au
    // lieu de #5648). Repli sur la cle de surface pour une reponse qui n'aurait pas recopie le titre.
    numero = new Map(((ouverture && ouverture.issues) || []).filter((i) => i.numero > 0).map((i) => [i.titre || i.cle, i.numero]))
    log(`${numero.size}/${travaux.length} issues connues`)
  }

  // -------------------------------------------------------------------------
  // Un a un : les travaux partagent le socle (composants, jetons, router, styles), et deux agents
  // qui l'editent en parallele fabriqueraient une jumelle. Pour CHAQUE travail : fable SPECIFIE,
  // sonnet (ou haiku) DEVELOPPE, opus RELIT ET CORRIGE, puis recette au navigateur sur les phares.
  phase('Specifier')
  // -------------------------------------------------------------------------
  const resultats = []
  const SANS_COMMIT = `
GIT — ne commit PAS, ne pousse PAS, ne cree ni stash, ni branche, ni worktree : l'arbre est PARTAGE
avec les autres agents du tour, et ce sont les phases Synchroniser (points d'etape) et Livrer
(commits, push, PR) qui commitent pour tous. Un commit ou un push de ta part est un DEFAUT du tour.`

  const resynchroniser = async (moment) => {
    phase('Synchroniser')
    const s = await agent(`${SOCLE}
${PASSERELLE}
TA MISSION — RESYNCHRONISER l'arbre ${moment}. Un tour dure des heures : \`${DEPUIS}\` et la branche
distante avancent pendant ce temps, et ce qui se specifie, se code, se juge ou se livre ici doit
l'etre sur l'arbre FUSIONNE.

1. \`cd ${REPO} && git branch --show-current\` — tu dois etre sur ${NOM_DE_BRANCHE} (sinon, ton prefixe
   \`cd ${REPO} && \` manque : corrige-le, ne conclus rien depuis un autre depot).
   \`cd ${REPO} && git status --short\` : si l'arbre
   porte du travail non commite, c'est un POINT D'ETAPE — commite-le D'ABORD, tel quel (\`git add -A\`
   apres avoir retire les artefacts generes : ${V3}/rendu/, ${V3}/dist/, ${V3}/ios/App/Build/,
   ${V3}/android/app/build/, .cache/), message \`wip(web-v3): point d'etape — <ce que l'arbre porte> (Refs #n)\`,
   termine par les lignes :
${ATTRIBUTION}
   JAMAIS \`git stash\` : dans un arbre partage, un pop rejoue le stash d'un AUTRE lot (lecon 527).
2. \`git fetch origin ${DEPUIS} ${NOM_SHELL}\` (sur echec RESEAU seulement, 4 essais : 2s, 4s, 8s, 16s).
   \`git log --oneline HEAD..origin/${NOM_SHELL}\` et \`git log --oneline HEAD..origin/${DEPUIS}\` : s'il n'y a
   RIEN a reprendre d'aucun cote, pousse le point d'etape s'il y en a un (etape 5) et arrete-toi la
   (reintegre=true, commits_repris=0).
3. \`git merge origin/${NOM_SHELL}\` (si la branche distante a avance), puis \`git merge origin/${DEPUIS}\` —
   **JAMAIS** \`git rebase\` ni \`git pull --rebase\` (lecon 324). Un conflit se resout en gardant les DEUX
   apports (decisions, lecons : celles de dev gardent leurs numeros, les notres se renumerotent a la
   suite ; budgets-measured.json : les valeurs se REMESURENT avec la commande que la ligne nomme) ou en
   reconciliant le CODE par sa logique ; \`git checkout --ours\`/\`--theirs\` a l'aveugle est interdit.
   Verifie qu'aucun marqueur ne reste (\`git grep -n '^<<<<<<<'\` vide). Commite chaque fusion.
4. \`cd ${V3} && bun run type-check && bun test 2>&1 | tail -5\` : ce qui est rouge se corrige ICI si la
   cause est la fusion ; sinon il est rapporte dans gates_apres_merge.
5. \`git push -u origin ${REF_PUSH}\` (4 essais sur echec RESEAU) : le point d'etape et la fusion partent
   tout de suite — les sessions voisines les voient.
6. Rends fichiers_touches_par_dev, conflit_non_resolu VIDE si tout est resolu, et un etat FACTUEL.`,
      { label: `resynchroniser:tour-${tour}:${moment.replace(/[^a-z0-9:-]+/gi, '-')}`, phase: 'Synchroniser', schema: SYNCHRO, model: MODELE.developper, effort: 'high' })
    if (s && s.conflit_non_resolu) log(`ATTENTION — resynchronisation incomplete ${moment} : ${s.conflit_non_resolu}`)
    else if (s) log(`Resynchronise ${moment} : ${s.commits_repris || 0} commits repris`)
    return s
  }

  for (const t of travaux) {
    const num = numero.get(t.titre_issue) ?? numero.get(t.cle)
    const synchroAvant = await resynchroniser(`avant ${t.cle}`)
    const cheminCible = CIBLES.get(t.cle)
    const cible = t.genre !== 'infra'
      ? `\nLA CIBLE de cet ecran est l'ecran iOS : ${cheminCible ? `capture de reference ${cheminCible} (et sa jumelle sombre) — REGARDE-LA (outil Read)` : `pas de capture posee — lis les fichiers Swift de reference (${t.reference_ios || 'a retrouver dans Features/**'}) et, si tu peux, capture l'ecran au simulateur de REFERENCE ${SIM_REF} (app native, apres les trois verifications du socle — jamais ${SIM_CHANTIER}, qui porte la coque)`}. Elle fait foi sur la disposition, la hierarchie, les etats et les gestes ; les jetons derives de Swift font foi sur le style.`
      : ''
    const phare = PHARES.has(t.cle)

    // ---------------------------------------------------------------- Specifier (decrire)
    phase('Specifier')
    const spec = await agent(`${SOCLE}
${PASSERELLE}${DIRECTIVES}${CHARTE}${phare ? PHARE : ''}
TA MISSION — SPECIFIER ce travail, AVANT qu'une ligne de code ne soit ecrite. Tu ne modifies AUCUN
fichier de production : tu ecris la specification dans ${dossierDeTravail}/specs/${t.cle}.md (cree
le dossier) et tu la rends aussi, in extenso, dans le champ \`specification\`. Un developpeur qui ne
connait pas le depot doit pouvoir livrer JUSTE en la suivant ; un relecteur doit pouvoir la lui
OPPOSER ligne a ligne.

TRAVAIL : ${t.titre_issue}
${ligneDeTravail(t)}${cible}
${num ? `ISSUE : #${num}.` : ''}
${synchroAvant && synchroAvant.fichiers_touches_par_dev ? `\nCE QUE LES SESSIONS VOISINES ONT BOUGE dans \`${DEPUIS}\` depuis le debut du tour — lis-le AVANT de specifier :\n${court(synchroAvant.fichiers_touches_par_dev, 3000)}` : ''}

CE QUE LA SPECIFICATION CONTIENT, dans cet ordre :
1. LA REFERENCE iOS, lue : les fichiers Swift qui rendent cet ecran (ouvre-les, cite
   fichier:ligne) — disposition, hierarchie, etats, gestes, vocabulaire. Ce que la v3.1 REPREND et
   ce qu'elle adapte au web (et pourquoi). Pour \`conversations\` et \`thread\` : PARS de
   ${V3}/targets/ (lentille.md, focal-script.md, bulle.md, et les captures drapeaux ON) — la
   specification CITE ses sections et son tableau d'ecarts, et ne recopie ni ne rediscute ce qu'il
   a deja tranche ; une capture drapeaux eteints n'est pas une reference. Pour un travail d'infra (assets, shells, staging) : la
   source iOS des actifs ou du comportement, citee de la meme facon.
2. L'ETAT DES LIEUX web-v3, mesure : les fichiers qui portent DEJA cette surface (wc -l), ce
   qu'ils font (fichier:ligne), ce qui MANQUE par rapport au critere de fin et a la reference iOS.
3. LES ROUTES ET EVENEMENTS REELS de la passerelle que le travail consomme (fichier:ligne dans
   services/gateway/src, methode, chemin /api/v1, auth, forme de charge, codes d'erreur) ; et ce
   que les FIXTURES doivent mimer. Un endpoint qui n'existe pas : dis-le, issue gateway compagnon,
   jamais un contournement.
4. LES TEMOINS A ECRIRE D'ABORD (TDD) : chaque ligne du critere de fin a son temoin bun test
   (fichier, describe, ce qu'il prouve, par quelle API publique). Un temoin de RANG du Prisme
   s'ecrit sur un rang autre que le premier ; un controle a un temoin d'EFFET ; un seuil a ses
   DEUX moities.
5. LE DECOUPAGE en etapes ordonnees (rouge → vert → refactor) : fichiers touches (noms ANGLAIS,
   D-13), ce qui s'EXTRAIT d'abord quand un fichier approche le budget, le site UNIQUE existant a
   reutiliser (jamais une jumelle : router.tsx, scheme.ts, accent.ts, grouping.ts, api/prism.ts,
   view/*, @meeshy/shared).
6. LES ETATS a dessiner (vide / chargement / erreur / hors-ligne / refus) et les GESTES (clavier,
   doigt, lecteur d'ecran) — chacun avec son temoin.
7. LES MESURES a rendre (measure-weight, courbe, et pour les coques : la capture QEMU + simulateur
   comparee au web) et les plafonds de budgets.json opposes.
8. LE MODELE qui developpera : \`petit\` (haiku) ou \`developper\` (sonnet) — avec la raison.
9. LES QUESTIONS que tu ne peux pas trancher seul, chacune avec la reponse RETENUE par defaut.

Sois PRECIS et VERIFIABLE : chaque affirmation sur le code cite fichier:ligne. Une specification
qui devine est pire qu'aucune. Et c'est ICI que la DIRECTIVE 7 se joue : la forme que tu specifies
est celle que trente ecrans copieront — choisis celle qui tient a l'echelle des 40+ surfaces iOS,
pas la plus rapide a coder ; nomme ce qui devra etre extrait, partage ou memoise DES MAINTENANT.`,
      { label: `specifier:${t.cle}`, phase: 'Specifier', schema: SPEC, model: MODELE.decrire, effort: 'high' })

    const SPEC_TEXTE = spec && spec.specification
      ? spec.specification.slice(0, 24000)
      : "(aucune specification rendue — relis le critere de fin et la reference iOS, ecris toi-meme la specification en tete de ton rapport, puis livre)"
    const modeleDev = spec && spec.modele === 'petit' ? MODELE.petit : MODELE.developper
    log(`${t.cle} : specifie — developpement par ${modeleDev}${spec && spec.modele === 'petit' ? ' (travail petit)' : ''}${phare ? ' — ecran PHARE' : ''}`)

    // #5243 — le point d'etape le moins cher du depot : la specification poussee rend l'intention
    // visible des autres sessions AVANT l'implementation (doctrine « pousser le squelette »).
    const synchroApresSpec = await resynchroniser(`apres specification de ${t.cle}, avant l'implementation`)

    // ---------------------------------------------------------------- Implementer (developper)
    phase('Implementer')
    const fait = await agent(`${SOCLE}
${PASSERELLE}${DIRECTIVES}${CHARTE}${phare ? PHARE : ''}
TA MISSION — LIVRER ce travail, en TDD, en ENTIER, en suivant SA SPECIFICATION.

TRAVAIL : ${t.titre_issue}
${ligneDeTravail(t)}${cible}
${num ? `\nISSUE : #${num}. Le commit final la fermera (Closes #${num}) — la phase Livrer s'en charge.` : ''}
${synchroApresSpec && synchroApresSpec.fichiers_touches_par_dev ? `\nCE QUE LES SESSIONS VOISINES ONT BOUGE dans \`${DEPUIS}\` pendant la specification :\n${court(synchroApresSpec.fichiers_touches_par_dev, 3000)}` : ''}

LA SPECIFICATION (aussi dans ${dossierDeTravail}/specs/${t.cle}.md) :
${SPEC_TEXTE}

METHODE, dans cet ordre :
1. Lis la specification en entier, puis CHAQUE fichier qu'elle cite (Swift compris). Si elle te
   semble FAUSSE sur un point, verifie dans le code, DIS-LE et suis le code REEL — jamais une
   divergence silencieuse. On FAIT EVOLUER le code existant, on ne le reecrit pas a cote.
2. TDD : les temoins de la specification, qui echouent AVANT le code (bun test, *.test.ts a cote
   du module). Teste le COMPORTEMENT par l'API publique.
3. Le minimum qui fait passer. TypeScript strict, aucun 'any', donnees immuables, noms ANGLAIS
   (D-13), prose en francais. Un fichier par responsabilite.
4. STYLE : jetons derives de Swift uniquement (D-4) ; regarde le rendu dans les DEUX schemas
   (\`bunx vite --port 5173\` en arriere-plan + \`BASE=http://localhost:5173 CHROMIUM='' node
   scripts/capture.mjs\`, ou une capture manuelle) ; pose les captures dans
   ${dossierDeTravail}/rendus/${t.cle}-{light,dark}.png et REGARDE-LES, compare-les a la cible iOS.
5. COQUES (si le travail touche le dist, les assets, le routeur ou une coque) : reconstruit et
   rejoue sur les DEUX coques — \`MEESHY_TARGET=capacitor bunx vite build && bunx cap sync\`, APK +
   installation sur l'AVD Meeshy_Poc_Web-v31 (QEMU), build + installation sur le simulateur DE LA COQUE « Meeshy Poc-Web-V31 » (${SIM_CHANTIER}) — JAMAIS sur ${SIM_REF}, le simulateur de reference,
   capture chaque coque et REGARDE. Les commandes exactes sont dans le socle.
6. Fais tourner localement : \`cd ${V3} && bun run type-check && bun test\`, puis \`bun run build\`
   et \`node scripts/check-curve.mjs\` ; corrige AVANT de rendre.
7.${SANS_COMMIT}

Rends un rapport texte : chaque ETAPE de la specification (faite / non faite, et pourquoi), les
fichiers touches, les commandes lancees et leurs sorties, les CAPTURES produites, ce que tu n'as
PAS fait et pourquoi, toute contradiction entre la specification et le code reel.`,
      { label: `livrer:${t.cle}`, phase: 'Implementer', model: modeleDev, effort: 'high' })

    // ---------------------------------------------------------------- Revue-correction, SYSTEMATIQUE
    phase('Revue')
    const revue = await agent(`${SOCLE}
${PASSERELLE}${DIRECTIVES}${CHARTE}${phare ? PHARE : ''}
TU ES LE RELECTEUR-CORRECTEUR de ce travail. La revue est SYSTEMATIQUE et c'est toi qui la fais en
entier : tu prends le travail EN DEFAUT sur la SURFACE et sur la CONCEPTION, puis tu CORRIGES
toi-meme ce qui se corrige et tu METS EN CONFORMITE (D-1..D-14, passerelle, Prisme, accessibilite,
budget). Tu n'es pas complaisant : le porteur verra ce que tu laisses passer.

TRAVAIL : ${t.titre_issue}
CRITERE DE FIN : ${t.critere_de_fin}

LA SPECIFICATION (oppose-la au diff, ligne a ligne) :
${SPEC_TEXTE.slice(0, 14000)}

RAPPORT DU DEVELOPPEUR :
${fait || '(aucun rapport rendu)'}

A. PRENDRE EN DEFAUT — LA SURFACE (git diff, git status, fichiers) :
- le critere de fin est-il REELLEMENT atteint ? Rejoue la commande qu'il nomme.
- la COHERENCE AVEC iOS : ouvre la capture cible ET la capture produite — meme disposition, meme
  hierarchie, memes etats, memes gestes ? (l'ecart typographique web/iOS est assume, pas l'ecart
  de structure) ;
- LA CIBLE EST-ELLE iOS ? Une capture cible prise sur ${SIM_CHANTIER} (la coque), dont le
  \`.a11y.txt\` jumeau n'a qu'UN noeud, ou qui montre les fixtures de web-v3 (Kwame Mensah, Amina
  Diallo, « AUTO Focal », « Vous ») est web-v3 compare a lui-meme : BLOQUANT — le travail se
  reprend depuis une capture NATIVE sur ${SIM_REF} (regle « deux simulateurs » du socle) ;
- un NOM francais nouveau (fichier, identifiant, jeton, cle) : defaut D-13 ;
- du 'any', une donnee mutee, un fichier hors budget qu'on a grossi ;
- une JUMELLE : couleur en dur au lieu d'un jeton derive, resolution de langue reecrite au lieu
  d'api/prism.ts / @meeshy/shared, second routeur, seconde loi de groupage, seconde peau de liste
  (D-9) ;
- des <div onClick> la ou <button>/<a>/<form>/<dialog>/<details> etait le bon element ;
- un test qui ne peut pas echouer — FALSIFIE-LE (casse le code, le temoin doit rougir, restaure) ;
- une cible < 44 px, un contraste < 4,5:1 dans l'un des deux schemas (regarde les captures) ;
- un \`lang=\` manquant sur un texte resolu par le Prisme ;
- un etat manquant (vide, hors-ligne, erreur, refus) : ecran blanc = defaut ;
- un CONTROLE INERTE (le defaut le plus frequent du depot) : cherche-le activement — cliquer
  change-t-il quelque chose ?
- si le travail touche dist/assets/routeur/coques : la coherence des COQUES a-t-elle ete rejouee
  (QEMU + simulateur, captures) ? Rejoue-la toi-meme si le rapport ne la prouve pas.

B. PRENDRE EN DEFAUT — LA CONCEPTION, en ingenieur staff hostile, avec la vision GLOBALE et
MOYEN/LONG TERME de la DIRECTIVE 7 (tu juges le diff ET la trajectoire — ce que cette forme
deviendra quand les 40+ surfaces iOS seront portees, ce que trente ecrans copieront d'elle) :
- le POIDS : \`bun run build && node scripts/check-curve.mjs && node scripts/measure-weight.mjs\` —
  un chiffre non mesure ne compte pas ; la courbe est un gate, pas une intention ;
- le PRISME : bon rang elu ? qui AFFICHE ce qu'il elit ? que transporte-t-on A COTE ? (cycles
  121-125 du CLAUDE.md) ;
- la SECURITE : D-6 — /c/ ne revele RIEN d'une conversation dont on n'est pas membre ; trois
  jetons (aucun, le sien, celui d'un autre) — que voit le troisieme ?
- l'ACCESSIBILITE : clavier, lecteur d'ecran, contraste AA dans les DEUX schemas, cibles,
  reduced-motion ;
- la PASSERELLE : un diff sous services/gateway/ ou packages/shared/ sans les CINQ elements de la
  preuve de bogue ⇒ BLOQUANT ; chaque endpoint et evenement attaques existent-ils (fichier:ligne) ?
- ce que le travail a laisse DERRIERE : champ ajoute non relaye, appelant non migre, jumelle non
  supprimee, decision non ecrite, budget non declare.

C. CORRIGER ET METTRE EN CONFORMITE — toi-meme, maintenant :
- corrige CHAQUE defaut bloquant ou majeur corrigeable dans ta passe, avec son temoin ; et les
  mineurs de forme au passage ;
- rejoue \`cd ${V3} && bun run type-check && bun test\` puis \`bun run build\` ; refais les captures
  si tu as touche une feuille, et REGARDE-LES ;
- ce que tu ne PEUX pas corriger (re-implementation, decision produit, endpoint absent) : rends-le
  dans \`restants\` avec gravite, constat, preuve et correctif propose.

${SANS_COMMIT}

Rends : verdict (l'etat APRES tes corrections), defauts_trouves (tous, avec preuve), corriges
(nombre), restants (bloquant/majeur seulement), rapport, gates_rejoues (sorties tronquees),
dimensions_mures, dimensions_restantes.`,
      { label: `revue-correction:${t.cle}`, phase: 'Revue', schema: REVUE_CORRIGEE, model: MODELE.relire, effort: 'xhigh' })

    log(`${t.cle} : revue-correction — verdict ${revue ? revue.verdict : '(aucun)'}, ${revue ? revue.corriges : 0} corriges, ${revue && revue.restants ? revue.restants.length : 0} rendus au developpeur`)

    // ---------------------------------------------------------------- Recette au navigateur (phares)
    const recette = phare
      ? await agent(`${SOCLE}
${PASSERELLE}${DIRECTIVES}${PHARE}
TU ES LE RECETTEUR de l'ecran phare « ${t.titre_issue} », APRES la revue-correction. Tu ne lis pas
seulement le code : tu FAIS TOURNER l'ecran — au navigateur (\`bunx vite --port 5173\` +
captures Playwright OU navigation manuelle), et sur les COQUES si le travail les touche (QEMU +
simulateur, commandes du socle) — et tu joues chaque famille du texte PHARE comme un utilisateur
exigeant sur un telephone. Les filtres ont-ils un EFFET ? le fil groupe-t-il comme iOS ? la
citation saute-t-elle ? le composeur envoie-t-il, garde-t-il le focus, montre-t-il l'erreur ? le
Prisme sert-il le bon rang, avec sa pastille ? le retour materiel Android navigue-t-il ? la
safe-area iOS est-elle respectee ? le sombre est-il aussi soigne que le clair ?
Rends CHAQUE defaut avec sa preuve (capture, assertion, sortie) ; bloquant = ecran non fonctionnel
ou inerte, majeur = usage degrade, mineur = le reste. Pose tes captures dans
${dossierDeTravail}/recette/${t.cle}/ et cite-les. Tu ne corriges RIEN toi-meme.${SANS_COMMIT}

RAPPORT DU DEVELOPPEUR :
${fait || '(aucun rapport rendu)'}

RAPPORT DU RELECTEUR-CORRECTEUR :
${court(revue, 6000)}`,
        { label: `recette:${t.cle}`, phase: 'Revue', schema: REVUE, model: MODELE.relire, effort: 'high' })
      : null

    // ---------------------------------------------------------------- Ce qui repart au developpeur
    let aCorriger = [
      ...((revue && revue.restants) || []),
      ...((recette && recette.defauts) || []),
    ].filter((d) => d.gravite !== 'mineur')

    const corrections = []
    for (let passe = 1; passe <= 2 && aCorriger.length; passe += 1) {
      phase('Implementer')
      log(`${t.cle} : ${aCorriger.length} defauts non mineurs rendus au developpeur (passe ${passe})`)
      const correction = await agent(`${SOCLE}
${PASSERELLE}${DIRECTIVES}${CHARTE}${phare ? PHARE : ''}
TA MISSION — CORRIGER les defauts que la revue a rendus au developpeur sur « ${t.titre_issue} ».

LA SPECIFICATION :
${SPEC_TEXTE.slice(0, 10000)}

Tu corriges CHACUN, ou tu dis explicitement pourquoi un constat est FAUX — avec ta preuve. Un
relecteur peut se tromper : ne corrige pas un defaut qui n'existe pas, refute-le. Chaque correction
garde son test. Rejoue type-check, test, build.

LES DEFAUTS :
${aCorriger.map((d, i) => `${i + 1}. [${d.gravite}] ${d.constat}\n   preuve: ${d.preuve}\n   correctif propose: ${d.correctif}`).join('\n\n')}

${SANS_COMMIT}

Rends : corriges (nombre), refutes (nombre), rapport.`,
        { label: `corriger:${t.cle}:${passe}`, phase: 'Implementer', schema: CORRECTION, model: MODELE.developper, effort: 'high' })
      corrections.push(correction)

      if (passe === 1 && correction && (correction.corriges > 0 || correction.refutes > 0)) {
        phase('Revue')
        const contre = await agent(`${SOCLE}
${PASSERELLE}${DIRECTIVES}
CONTRE-REVUE. Des defauts ont ete corriges ou refutes sur « ${t.titre_issue} ». Verifie que CHAQUE
correction est reelle (git diff) et n'a rien casse (rejoue type-check, test sur le perimetre), et
que chaque refutation est FONDEE — une refutation infondee redevient un defaut. Ne rends que ce
qui reste BLOQUANT ou MAJEUR.

${SANS_COMMIT}

DEFAUTS RENDUS AU DEVELOPPEUR :
${court(aCorriger, 6000)}

RAPPORT DE CORRECTION :
${court(correction, 6000)}`,
          { label: `contre-revue:${t.cle}`, phase: 'Revue', schema: REVUE, model: MODELE.relire, effort: 'medium' })
        aCorriger = ((contre && contre.defauts) || []).filter((d) => d.gravite !== 'mineur')
      } else {
        aCorriger = []
      }
    }
    if (aCorriger.length) log(`${t.cle} : ${aCorriger.length} defauts non mineurs restent apres deux passes — la phase Gates et le rapport les portent`)

    // ---------------------------------------------------------------- Livraison INCREMENTALE
    // Directive porteur 2026-09-07 : commits et pushes REGULIERS — un travail fini part vers dev
    // dans l'heure, le staging suit pas a pas. Fable gere la livraison.
    phase('Livrer')
    const livraisonIncrementale = await agent(`${SOCLE}

TA MISSION — LIVRER CE TRAVAIL MAINTENANT, de facon INCREMENTALE (directive du porteur : le
staging doit pouvoir suivre le developpement heure par heure — un travail vert PART, il n'attend
pas la fin du tour).

TRAVAIL LIVRE : ${t.titre_issue}${num ? ` (issue #${num})` : ''}
VERDICT DE LA REVUE : ${revue ? revue.verdict : '(aucun)'} — ${aCorriger.length} defauts non mineurs restants.

1. \`cd ${V3} && bun run type-check && bun test 2>&1 | tail -5\` — les gates RAPIDES seulement (le
   gate complet viendra en fin de tour).
2. \`git status --short\` : retire des chemins a commiter tout artefact genere (dist/, rendu/,
   ios/App/Build/, android/app/build/, android/.gradle/, .cache/).
3. SI les gates rapides sont VERTS et le verdict n'est pas « a-refaire » : commit du travail —
   titre \`feat(web-v3): <le resultat>\` (ou fix/style selon la nature), corps bref (ce qui etait
   absent, la forme retenue)${num ? `, \`Closes #${num}\`` : ''}, fin de message EXACTEMENT :
${ATTRIBUTION}
   SINON : commit en \`wip(web-v3): <etat> (Refs #${num || 'n'})\` — le travail part quand meme
   comme point d'etape, mais l'issue ne se ferme pas ; dis pourquoi.
4. \`git push -u origin ${REF_PUSH}\` (4 essais sur echec RESEAU ; sur rejet non fast-forward,
   \`git fetch origin ${NOM_SHELL} && git merge origin/${NOM_SHELL}\`, jamais de rebase, rejoue les
   gates rapides, pousse).
5. ${PR ? `La PR de la branche vers \`${BASE}\` : cree-la si elle n'existe pas encore
   (\`gh pr create --base ${BASE}\`, titre = le chantier du tour), arme l'auto-merge
   (\`gh pr merge --auto --merge\`) — chaque push suivant l'alimente et GitHub fusionne des que la
   CI est verte : c'est ainsi que le staging recoit une version utilisable a chaque pas.` : `PR : pas de PR (pr=false) — le push suffit.`}
6. Rends pousse (true/false), commits (les sha), et un rapport bref.

${aCorriger.length ? `DEFAUTS RESTANTS (ils voyagent avec le wip, dis-les dans le corps du commit) :\n${court(aCorriger, 2000)}` : ''}`,
      { label: `livrer-incremental:${t.cle}`, phase: 'Livrer', schema: LIVRAISON, model: MODELE.livrer, effort: 'medium' })
    if (livraisonIncrementale) log(`${t.cle} : livraison incrementale — ${livraisonIncrementale.pousse ? 'poussee' : 'NON poussee'}${livraisonIncrementale.pr_numero ? ` (PR #${livraisonIncrementale.pr_numero})` : ''}`)

    resultats.push({
      cle: t.cle, titre: t.titre_issue, issue: num,
      spec: spec ? { modele: spec.modele, pourquoi: spec.pourquoi_ce_modele, fichier: spec.fichier, questions: spec.questions } : null,
      fait, revue, recette, corrections, restants_apres_corrections: aCorriger, livraison_incrementale: livraisonIncrementale,
      dimensions_mures: (revue && revue.dimensions_mures) || (recette && recette.dimensions_mures) || [],
      dimensions_restantes: (revue && revue.dimensions_restantes) || (recette && recette.dimensions_restantes) || [],
    })
  }

  // Resynchroniser AVANT les gates : les gates et la livraison se jouent sur l'arbre FUSIONNE.
  await resynchroniser('avant les gates')

  // -------------------------------------------------------------------------
  phase('Gates')
  // -------------------------------------------------------------------------
  let gates = null
  const coquesTouchees = travaux.some((t) => ['assets', 'shells', 'staging'].includes(t.cle)) ||
    resultats.some((r) => /capacitor|coque|shell|android\/|ios\//i.test(String(r.fait || '')))
  for (let passe = 1; passe <= 3; passe += 1) {
    gates = await agent(`${SOCLE}
${PASSERELLE}${DIRECTIVES}
TA MISSION — FAIRE PASSER LES GATES, et CORRIGER ce qui est rouge (passe ${passe}/3).

Dans cet ordre, en t'arretant pour corriger des qu'un gate est rouge :
1. \`cd ${V3} && bun run gate\` — le gate COMPOSITE du depot : check:tokens, check-curve,
   type-check, bun test, build, check-utilities, measure-weight, check-institutional, check-lens,
   check-docker-context, check-git-tracking. Rends chaque segment rouge SEPAREMENT.
2. \`cd ${V3} && node scripts/check-offline.mjs\` (la variante A s'ouvre hors ligne).
3. \`cd ${V3} && bun run check:tokens-resolved\` (le navigateur peint bien les jetons, deux schemas).
4. LES CAPTURES : \`bunx vite --port 5173\` en arriere-plan puis
   \`BASE=http://localhost:5173 CHROMIUM='' node scripts/capture.mjs\` — REGARDE chaque capture
   produite (outil Read), clair ET sombre : c'est le gate de conformite visuelle contre la
   reference iOS (compare aux cibles de ${dossierDeTravail}/cibles/ quand elles existent).
5. \`node ${V3}/scripts/route-inventory.mjs\` (rc 0 — la parite est a jour).
${coquesTouchees ? `6. LA COHERENCE DES COQUES (le tour a touche dist/assets/coques) :
   \`cd ${V3} && MEESHY_TARGET=capacitor bunx vite build && bunx cap sync\` ;
   ANDROID (QEMU) : demarre l'AVD Meeshy_Poc_Web-v31 si aucun \`adb devices\` ne repond, gradle
   assembleDebug (JAVA_HOME et ANDROID_HOME du socle), \`adb install -r\`, lance MainActivity,
   capture (\`adb exec-out screencap -p\`) clair ET sombre (\`adb shell cmd uimode night yes|no\` +
   relance) ;
   iOS : xcodebuild (commande du socle), \`xcrun simctl install/launch\`, capture clair ET sombre
   (\`xcrun simctl ui <udid> appearance dark\` + relance) ;
   REGARDE les quatre captures et compare-les aux captures web : meme ecran, meme accent, memes
   etats. Rejoue les trois defauts de la DIRECTIVE 3 (safe-area, retour materiel, bascule a chaud)
   et dis ou ils en sont.` : `6. La coherence des coques : non-applicable ce tour (dist, assets et coques non touches) — dis-le.`}

REGLES :
- Un gate rouge se CORRIGE, il ne se contourne pas. Ne desactive JAMAIS un test, ne baisse JAMAIS
  un seuil ni un budget. Si un seuil est mal calibre, dis-le dans ce_qui_bloque et laisse-le rouge.
- Un gate rouge AVANT ce tour (voir l'etat du cadrage) se corrige aussi s'il touche ce que le tour
  a livre ; sinon nomme-le dans ce_qui_bloque avec sa cause.
- Non-applicable = le prerequis n'existe pas (dis lequel) ; jamais « vert ».
- Rends la SORTIE reelle de chaque commande, tronquee, jamais un resume ; et les MESURES chiffrees
  (poids par ecran, courbe, requetes avant premier pixel).

${SANS_COMMIT}

ETAT AVANT CE TOUR (cadrage) :
${(cadrage.etat || '').slice(0, 3000)}

TRAVAUX DE CE TOUR : ${travaux.map((t) => t.cle).join(', ')}`,
      { label: `gates:tour-${tour}:${passe}`, phase: 'Gates', schema: GATES, model: MODELE.developper, effort: 'high' })

    if (!gates || gates.tous_verts) break
    const rouges = (gates.gates || []).filter((g) => g.resultat === 'rouge')
    if (!rouges.length) break
    if (passe === 3) break
    phase('Implementer')
    log(`Gates rouges (${rouges.map((g) => g.nom).join(', ')}) — correction de fond, passe ${passe}`)
    await agent(`${SOCLE}
${PASSERELLE}${DIRECTIVES}
TA MISSION — CORRIGER A LA RACINE les gates restes rouges apres la passe ${passe}. Un gate rouge
est un BUG du lot : trouve la cause, corrige, garde le test. Interdit : desactiver, ignorer,
baisser un seuil, retirer un ecran pour passer.

GATES ROUGES :
${court(rouges, 8000)}

CE QUI BLOQUE, selon la passe : ${gates.ce_qui_bloque || '(non dit)'}

${SANS_COMMIT}

Rends ce que tu as corrige, avec les commandes rejouees et leurs sorties.`,
      { label: `corriger-gates:tour-${tour}:${passe}`, phase: 'Implementer', model: MODELE.developper, effort: 'high' })
  }

  // -------------------------------------------------------------------------
  phase('Documenter')
  // -------------------------------------------------------------------------
  const documentation = await agent(`${SOCLE}
${PASSERELLE}${DIRECTIVES}
TA MISSION — FAIRE DIRE AUX DOCUMENTS CE QUI A ETE CONSTRUIT. Ils decrivent la v3.1 telle qu'elle
EST — jamais un tableau de bord (aucune case cochee, aucun « fait » : l'etat vit dans les issues).

1. ${V3}/decisions.md : chaque direction PRISE ce tour qui n'y est pas encore (une D-n datee, au
   format des existantes — la regle, pourquoi, ce que ca coute). Rien si aucune direction nouvelle.
2. ${V3}/parity.md : regenere par sa source (\`node scripts/route-inventory.mjs\`) si le tour a
   ajoute ou retire des routes.
3. ${V3}/README.md : chaque MESURE nouvelle avec la commande qui la rejoue (poids, courbe,
   requetes) — prise dans les sorties des gates, JAMAIS inventee.
4. ${REPO}/tasks/lessons.md : une lecon NUMEROTEE (numero suivant, verifie \`grep -n '^## Leçon'
   | tail -3\`) par correction de FOND faite en revue ou aux gates ce tour, au format des lecons
   existantes. Rien si aucune correction de fond.

${SANS_COMMIT}

RESULTATS DU TOUR :
${resultats.map((r) => `- ${r.cle} : ${r.titre}\n  mures: ${(r.dimensions_mures || []).join(', ')}\n  restantes: ${(r.dimensions_restantes || []).join(', ')}`).join('\n')}

GATES (sorties) :
${court(gates, 10000)}

Rends un rapport texte des fichiers touches et de ce qui a change dans chaque document.`,
    { label: `documenter:tour-${tour}`, phase: 'Documenter', model: MODELE.developper, effort: 'medium' })

  // -------------------------------------------------------------------------
  phase('Livrer')
  // -------------------------------------------------------------------------
  const livraison = await agent(`${SOCLE}

TA MISSION — LIVRER le tour ${tour} sur ${NOM_DE_BRANCHE}.

ETAT DES GATES :
${court(gates, 8000)}

SI UN GATE EST ROUGE, DISTINGUE :
(a) le rouge est CAUSE par le tour : ne pousse RIEN de plus, rends pousse=false et un rapport qui
    dit ce qui est rouge et ce qu'il faut.
(b) le rouge est PREEXISTANT ou TRANSVERSAL (deja rouge au cadrage, ou sur des surfaces que le
    tour n'a pas touchees) : il n'arrete PAS la livraison. Livre et DIS-LE, dans le corps de la PR
    et dans le rapport : le gate, sa cause, l'issue qui le porte (ouvre-la si elle n'existe pas).

SI TOUS LES GATES SONT VERTS OU NON-APPLICABLES, et dans le cas (b) :
1. \`git status --short\`, \`git diff --stat\` : regarde ce que tu t'apprentes a commiter. Retire tout
   artefact genere (${V3}/dist/, ${V3}/rendu/, ${V3}/ios/App/Build/, ${V3}/android/app/build/,
   ${V3}/android/.gradle/, .cache/, node_modules/). Les coques GENEREES (ios/, android/ hors
   build) n'entrent dans le commit QUE si le tour a decide de les tracker — sinon verifie que
   ${V3}/.gitignore les couvre et dis-le.
2. Commits : UN commit par travail livre quand les fichiers se separent proprement. Message dans la
   forme du depot : titre en francais qui dit le RESULTAT (\`feat(web-v3): …\`), corps qui dit ce
   qui etait absent et pourquoi la forme retenue, \`Closes #<n>\` par issue livree (JAMAIS
   \`Closes #0\`), et en fin de message, EXACTEMENT ces lignes :
${ATTRIBUTION}
   N'ecris aucun nom de modele ailleurs. Un travail deja porte par des POINTS D'ETAPE n'a plus de
   commit a lui : son \`Closes #n\` va dans le corps de la PR.
3. \`git push -u origin ${REF_PUSH}\` (4 essais sur echec RESEAU). Sur rejet non fast-forward :
   \`git fetch origin ${NOM_SHELL} && git merge origin/${NOM_SHELL}\` — JAMAIS de rebase — puis rejoue
   type-check + test, et pousse a nouveau.
3 bis. ${PR ? `LA PR, SANS INTERVENTION : ${NOM_DE_BRANCHE} doit avoir une PR OUVERTE vers \`${BASE}\`.
   (a) \`gh pr list --head ${NOM_SHELL} --state open\` : si elle existe, mets a jour titre et corps
       (\`gh pr edit\`) avec ce que ce tour ajoute.
   (b) Sinon \`gh pr create --base ${BASE}\` : titre en francais qui dit le RESULTAT du tour ; corps :
       ce qui etait absent, ce qui est livre surface par surface, les gates et leurs chiffres, les
       issues fermees, les dimensions restantes ; termine par une ligne vide puis
       🤖 Generated with [Claude Code](https://claude.com/claude-code)
   (c) Arme l'AUTO-MERGE (\`gh pr merge --auto --merge\`). Si le depot le refuse, dis-le
       (auto_merge=false).
   (d) Si \`${BASE}\` a avance et que la PR est en CONFLIT : \`git merge origin/${BASE}\` dans la
       branche, resous, rejoue type-check + test, pousse a nouveau.
   Rends pr_numero et auto_merge.` : 'PR : aucune a ouvrir dans ce tour (pr=false).'}
4. Pour chaque issue livree DONT TU CONNAIS LE NUMERO : un commentaire de cloture
   (\`gh issue comment\`) — preuve (commit, gate, mesure), captures decrites, dimensions MURES et
   RESTANTES ; et une issue par dimension non mure (label web-v3, meme milestone). Termine chaque
   commentaire par une ligne vide, ---, puis _Generated by [Claude Code](https://claude.ai/code)_

TRAVAUX ET LEURS ISSUES :
${resultats.map((r) => `- ${r.cle} (#${r.issue || '?'}) : ${r.titre}\n  mures: ${(r.dimensions_mures || []).join(', ') || '(non dites)'} | restantes: ${(r.dimensions_restantes || []).join(', ') || '(non dites)'}`).join('\n')}

DOCUMENTATION DU TOUR :
${(documentation || '').slice(0, 3000)}`,
    { label: `livrer:tour-${tour}`, phase: 'Livrer', schema: LIVRAISON, model: MODELE.livrer, effort: 'high' })

  // -------------------------------------------------------------------------
  phase('Completude')
  // -------------------------------------------------------------------------
  const completude = await agent(`${SOCLE}
${PASSERELLE}${DIRECTIVES}
TU ES LE CRITIQUE DE COMPLETUDE. Le tour ${tour} vient de livrer : ${resultats.map((r) => r.cle).join(', ')}.
Ta question : QU'EST-CE QUI MANQUE ENCORE PAR RAPPORT A L'APP iOS, et dans quel ordre le prochain
tour doit-il le prendre ?

1. Compare surface par surface ce que la v3.1 sert (src/routes/, route-inventory) a ce que l'app
   iOS offre (${IOS}/Meeshy/Features/** : Main — lentille, focal, riviere, composer, appels,
   reglages, profil, recherche, notifications, liens, bookmarks, sessions… ; Stories ; Auth ;
   Contacts ; et ${SDK}). Une feature iOS absente de la v3.1 sur une surface LIVREE est un manque
   a nommer (feature, ou dans iOS — fichier Swift —, surface v3, priorite).
2. Relis les revues : quelles dimensions sont restees non mures ? Une lenteur est un BUG.
3. La boucle tri-plateforme : les trois defauts de coque (DIRECTIVE 3) sont-ils fermes ? les
   assets iOS sont-ils repris partout ? le staging est-il branche ? Tant qu'un de ces trois
   travaux n'est pas livre, il OUVRE le prochain tour.
4. Rends prochains_travaux : les cles de surface du prochain tour (plafond ${PLAFOND}), dans
   l'ordre — d'abord ce qui complete assets/shells/staging, puis le fil et la liste, puis l'ordre
   de l'app iOS.

RAPPORTS DE LIVRAISON :
${court(livraison, 4000)}`,
    { label: `completude:tour-${tour}`, phase: 'Completude', schema: COMPLETUDE, model: MODELE.decrire, effort: 'medium' })

  resultatsDesTours.push({
    tour,
    travaux: resultats.map((r) => ({ cle: r.cle, titre: r.titre, issue: r.issue, mures: r.dimensions_mures, restantes: r.dimensions_restantes })),
    conception: conception ? { cibles: conception.cibles, decisions_ajoutees: conception.decisions_ajoutees, contradictions: conception.contradictions } : null,
    gates: gates ? { tous_verts: gates.tous_verts, ce_qui_bloque: gates.ce_qui_bloque, mesures: gates.mesures, gates: (gates.gates || []).map((g) => `${g.nom}: ${g.resultat}`) } : null,
    livraison,
    completude: completude ? { rapport: completude.rapport, prochains_travaux: completude.prochains_travaux, manques_ios: completude.manques_ios } : null,
  })

  if (!livraison || !livraison.pousse) {
    log(`Tour ${tour} non pousse — arret des tours (voir le rapport de livraison).`)
    break
  }
  if (completude && Array.isArray(completude.prochains_travaux) && completude.prochains_travaux.length) {
    focusDuTour = completude.prochains_travaux
  } else {
    log('Le critique ne rend aucun travail suivant — fin des tours.')
    break
  }
}

return {
  branche: BRANCHE,
  tours: resultatsDesTours,
}
