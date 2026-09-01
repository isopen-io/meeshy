export const meta = {
  name: 'meeshy-web-v3-bout-en-bout',
  description:
    'Developper la v3 web de bout en bout : charte visuelle jugee, vues neuves inscrites dans la planche et la conception, issues, TDD ecran par ecran, temps reel, revue croisee, gates, livraison — chaque agent sur le modele qui convient a sa tache',
  whenToUse:
    "Lancer un tour de developpement de la v3 web (apps/web-v3) : d'abord les ecrans prioritaires du porteur (vitrine, tableau de bord, /chats, /chat, fil temps reel), puis l'ordre calcule de ordre.md. Args : { branche, focus, plafond, tours, sans_issues }.",
  phases: [
    { title: 'Cadrer', detail: "mesurer ce qui existe, lire l'ordre calcule et les issues, choisir les travaux du tour", model: 'sonnet' },
    { title: 'Charte', detail: 'trois directions de style en concurrence, un juge, UNE charte opposable', model: 'fable' },
    { title: 'Concevoir', detail: 'les vues neuves entrent dans la planche, la matrice, la conception ; captures regenerees', model: 'fable' },
    { title: 'Ouvrir', detail: 'une issue GitHub par travail, avant la premiere ligne de code', model: 'sonnet' },
    { title: 'Implementer', detail: 'un ecran a la fois, en TDD, sur la charte', model: 'opus' },
    { title: 'Revue', detail: 'sonnet prend en defaut la surface, fable attaque la conception', model: 'fable' },
    { title: 'Gates', detail: 'ordre, tsc, lint, tests, build + budget, conformite visuelle, axe — corriger, jamais contourner', model: 'sonnet' },
    { title: 'Documenter', detail: 'la planche et la conception disent ce qui a ete construit', model: 'opus' },
    { title: 'Livrer', detail: 'commit, push, fermeture des issues avec preuve', model: 'opus' },
    { title: 'Completude', detail: "ce qui manque encore par rapport au legacy — le prochain tour", model: 'fable' },
  ],
}

// ---------------------------------------------------------------------------
// PARAMETRES
// ---------------------------------------------------------------------------

const REPO = '/home/user/meeshy'
const D = `${REPO}/docs/product/MeeshyWebV3Design`
const V3 = `${REPO}/apps/web-v3`
const SCRATCH = `${REPO}/.cache/web-v3-workflow`

const A = args && typeof args === 'object' ? args : {}
const BRANCHE = typeof A.branche === 'string' && A.branche ? A.branche : 'dev'
const FOCUS = Array.isArray(A.focus) && A.focus.length
  ? A.focus
  : ['vitrine', 'home', 'chats', 'join', 'rights', 'thread']
const PLAFOND = Number.isInteger(A.plafond) && A.plafond > 0 ? A.plafond : 6
const TOURS = Number.isInteger(A.tours) && A.tours > 0 ? A.tours : 1
const SANS_ISSUES = A.sans_issues === true
const SANS_CHARTE = A.sans_charte === true
const DATE = typeof A.date === 'string' ? A.date : '(date non fournie — la lire avec `date -I`)'

// ---------------------------------------------------------------------------
// LE SOCLE — ce que TOUT agent lit avant de travailler
// ---------------------------------------------------------------------------

const SOCLE = `
TU TRAVAILLES SUR LA V3 WEB DE MEESHY, monorepo ${REPO}, branche \`${BRANCHE}\` (verifie avec
\`git branch --show-current\` ; NE CHANGE JAMAIS DE BRANCHE, ne cree pas de worktree). Date : ${DATE}.

SOURCES DE VERITE, dans cet ordre — lis-les AVANT d'ecrire quoi que ce soit :
1. ${D}/conception-web-v3.md   la conception ARRETEE (stack, regle de placement § 3, deploiement § 4,
                               contrat de donnees § 5, session invitee § 6, reseau degrade § 7,
                               budgets § 8, machine de verification § 9, routine § 10, questions § 11,
                               et — s'il existe — le § 12 « Directive du porteur 2026-09-01 » qui PRIME).
2. ${D}/MeeshyWebV3.dc.html    la PLANCHE (prototype vivant) : disposition, hierarchie, etats, gestes.
3. ${D}/ordre.md               l'ordre d'implementation CALCULE (jamais ecrit a la main).
4. ${D}/matrice.json           la matrice des ecrans : lot, priorite, route, audience, depend_de,
                               critere_de_fin, dimensions visees, corps d'issue.
5. ${D}/cible/<vue_id>.png     la capture CIBLE de chaque ecran — regarde-la (outil Read).
6. ${REPO}/CLAUDE.md           TDD non negociable, TypeScript strict sans 'any', immuabilite,
                               budget 800-1100 lignes par fichier, UNE source de verite,
                               Instant App Principles, Prisme Linguistique, treize dimensions.
7. ${REPO}/tasks/lessons.md    les 40 dernieres lecons (tail -400) — le depot a deja paye ces erreurs.
8. Le code EXISTANT de ${V3} : app/route.ts, app/enveloppe/*, app/connecte/*, app/vitrine/*,
   app/authentification/*, app/chats/*, app/(public)/l/*, lib/api/*, lib/realtime/*, __tests__/*,
   e2e/visual/* (dont lib/serveurs.ts : la PASSERELLE DE BOUCHON), scripts/*, budgets.json.

DIRECTIVE DU PORTEUR (2026-09-01) — elle PRIME sur tout ce qui la contredit dans la conception :
- La v3 est une application web MODERNE, AGREABLE, AEREE, a GROS BOUTONS (toute action principale
  est une cible d'au moins 52 px de haut, pleine largeur sur mobile ; toute cible tactile >= 44 px),
  et pourtant LEGERE : elle doit se charger vite dans une zone RURALE en connexion FAIBLE (3G lent,
  latence 500 ms+, coupures). Donc : peu de requetes (le HTML porte deja son CSS et ses glyphes),
  aucune police web sur les ecrans publics, aucune image decorative lourde, aucun framework hydrate
  sur les ecrans rendus en gestionnaire de route, cache-first des qu'un cache existe.
- Les pages EXISTANTES de la v3 sont TERNES : il faut les STYLISER — sans les alourdir. Le style
  vient du CSS (jetons, color-mix, degrades discrets, rythme vertical, cartes, glyphes du sprite
  inlines), jamais d'un octet de JavaScript ni d'un actif externe.
- L'effort est TOTAL sur : la page AVANT connexion (la vitrine, \`/\` pour un visiteur), la page APRES
  connexion (le TABLEAU DE BORD, \`/\` pour un lecteur connecte — vue \`home\` de la planche),
  \`/chats\` (la liste des conversations du lecteur connecte), \`/chat/:lien\` (REJOINDRE une
  conversation par un lien partage — vues \`join\` et \`rights\` de la planche) et le FIL
  \`/chats/:cle\` (vue \`thread\`).
- FULL TEMPS REEL sur les surfaces de PARTICIPATION (fil ouvert, liste des conversations ouverte) :
  un message recu apparait sans rechargement, la liste se reordonne, les non-lus bougent, la frappe
  se voit — via UN client socket.io (\`lib/realtime/participate.ts\`, charge par \`await import()\`
  APRES le premier pixel, jamais avant, jamais sur une surface de lecture pure). Le chemin SANS
  JavaScript (formulaire POST, rechargement) RESTE le chemin qui marche partout : le temps reel est
  une AMELIORATION progressive, pas une condition. Le JavaScript expedie est un petit module ES ecrit
  a la main (pas de React hydrate, pas de page d'App Router — une page emet 6 requetes avant le
  premier pixel, cf. budgets.json « plancher-next-au-dessus-du-gate-de-requetes »), servi DANS LA
  ZONE v3 (jamais depuis public/ a la racine, § 4.4 ; un chemin d'actif nouveau entre nommement dans
  la regle Traefik du routeur frontend-v3 ET dans V3_ZONE_PREFIXES, dans cet ordre, § 4.4 bis).
- Toutes les features de la webapp legacy (apps/web) ont vocation a exister dans la v3, ecran par
  ecran, dans l'ordre calcule — ce tour livre ses travaux, la critique de completude nomme le reste.

ROUTES — decision de ce tour (a inscrire dans la conception par la phase Concevoir) :
- \`/\`            : vitrine (visiteur) OU tableau de bord (lecteur connecte) — deja aiguille par app/route.ts.
- \`/chats\`       : liste des conversations (connecte) — existe, a styliser et rendre temps reel.
- \`/chats/:cle\`  : le fil d'une conversation (connecte) — existe, a styliser et rendre temps reel.
- \`/chat/:lien\`  : REJOINDRE par un lien partage — UNE adresse, gouvernee par un ETAT que le
  SERVEUR decide d'apres ce que le lecteur detient (directive du porteur, 2026-09-01) :

  ETAT « CHOIX » (aucune session — ni jeton de membre, ni session invitee pour ce lien) :
    la page rend le CADRE du fil (en-tete au nom du lien, zone de messages VIDE, composeur
    inactif) FLOUTE (filter: blur sur le fond), et par-dessus une MODALE (<dialog open>, rendue
    par le serveur, qui marche sans JavaScript) qui demande : « vous venez en anonyme, ou avec
    votre compte ? ». La modale porte l'apercu du lien (nom, description, l'accordeon des droits
    en <details>/<summary>), le formulaire anonyme (pseudo, langue pre-remplie depuis
    Accept-Language, POST vers la meme adresse), le bouton « Se connecter » (→ \`/login?next=/chat/:lien\`)
    et « Creer un compte » (→ \`/signup?next=/chat/:lien\`). AUCUN message de la conversation
    n'est charge ni servi dans cet etat, meme si le lien autorise l'historique : rien ne part
    avant le choix. Les sept refus du § 6.3.A se peignent DANS la modale (409 pseudo pris ⇒
    suggestion pre-remplie).
  ETAT « INVITE » (session invitee valide pour ce lien) :
    la MEME adresse rend le FIL de la conversation, avec le composeur regi par les droits du
    lien (canSendMessages, canSendFiles, canSendImages, allowViewHistory…) relus a chaque
    chargement ; juste apres la jonction, les droits obtenus s'annoncent DANS le fil (bandeau ou
    <details> refermable — c'est ce que la planche appelle la vue \`rights\`, qui devient un ETAT du
    fil et non une page) ; le temps reel s'y greffe apres le premier pixel. Les etats B a H du
    § 6.3 (rechargement, retour d'arriere-plan, 401 ⇒ bandeau a BOUTON, 410 ⇒ composeur ferme
    avec sa raison) s'appliquent tels quels. lib/api/guest-session.ts reste l'UNIQUE detenteur de
    la session invitee ; si le serveur doit la lire pour decider l'etat, elle voyage dans un
    cookie pose par ce meme module/cette meme route (portee au lien), jamais dans un second store.
  ETAT « MEMBRE » (jeton de compte valide — arrive connecte, ou revient de /login?next=) :
    le serveur JOINT le lecteur a la conversation s'il n'en est pas deja membre (par la route de
    la passerelle qui applique la police du lien — verifie laquelle, jamais un contournement) et
    repond 302 vers \`/chats/:cle\` : le membre lit et ecrit dans l'INTERFACE CONNECTEE, jamais dans
    \`/chat/\`. Un lecteur connecte ne voit donc jamais la modale.

  ET \`/l/:token\` Y MENE EN UN SAUT : un lien trace qui pointe une CONVERSATION repond 302 vers
  \`/chat/<cle du lien>\` (plus jamais vers \`/chats/<cle>\`, devenu le fil du membre, qui renvoie
  l'anonyme vers /login en un SECOND saut — c'est ce que \`e2e/visual/v3-network-vitals.spec.ts\`
  mesure aujourd'hui en rouge : « une seule requete avant la 302, et un seul saut »). Le site du
  mapping est \`app/(public)/l/[token]/destination.ts\` ; la cible de \`/chat/:lien\` repond 200 en
  etat CHOIX a un lecteur sans session, jamais une redirection de plus.

  Il n'existe AUCUNE route \`/join\`, aucune redirection pour REJOINDRE, aucun \`/chat/:lien/...\`
  pour lire : un lien recu dans WhatsApp s'ouvre, se rejoint et se lit a UNE adresse. C'est la
  route LEGACY (apps/web/app/chat/[id], declaree dans l'AASA iOS pour les liens universels) : les
  liens deja partages pointent \`/chat/<id>\`, ils doivent continuer de s'ouvrir. La conception
  ecrivait \`/chats/:lien\` pour join/rights (collision avec le fil connecte \`/chats/:cle\`) et
  faisait de \`rights\` une page : \`/chat/:lien\` et l'etat du fil les remplacent, la matrice et la
  planche suivent (la vue \`join\` se redessine : cadre floute + modale ; \`rights\` : bandeau des
  droits dans le fil). Le fil de l'invite (\`/chat/:lien\`) et le fil du membre (\`/chats/:cle\`)
  sont rendus par le MEME module de vue (app/connecte/fil-vue.ts, a faire evoluer) — deux
  portes, une seule vue, jamais une jumelle.

REGLES DE LA V3, non negociables :
- La v3 vit dans apps/web-v3. apps/web reste VIF et sert le trafic : on n'y touche que si la
  conception le dit explicitement (sw.js V3_ZONE_PREFIXES est l'exception nommee).
- HTML SEMANTIQUE reel : <header>/<nav>/<main>/<button>/<a>/<form>/<dialog>/<details>. La planche
  n'a QUE des div cliquables — c'est une planche, pas une reference sur ce point.
- Icones : le sprite des 72 glyphes Phosphor (packages/icons ; \`glypheDuSprite\` dans
  app/actifs-inlines.ts). JAMAIS @phosphor-icons/web, JAMAIS lucide-react, jamais une fonte d'icones.
- Couleurs, rayons, polices : UNIQUEMENT les jetons de packages/design-tokens (§ 3.2 corollaire 2).
  Un jeton qui manque s'AJOUTE a la table (dark.css ET light.css, contraste AA mesure par
  scripts/check-jetons.mjs), jamais en dur dans une feuille.
- Prisme linguistique : UNIQUEMENT resolvePrismTranslation() de @meeshy/shared ; \`lang="xx"\` sur
  tout noeud rendu dans une langue != <html lang>.
- .dark / .light / system sans flash ; les DEUX schemas sont regardes a chaque ecran.
- Conformite = DISPOSITION, HIERARCHIE, ETATS et GESTES (compare-rendu.js). Polices, couleurs et
  rayons viennent du design system Meeshy : l'ecart typographique avec la planche est ASSUME.
- Aucun gate ne depend d'une passerelle REELLE : e2e/visual/lib/serveurs.ts porte une passerelle de
  bouchon, qui se COMPLETE pour chaque endpoint nouveau (auth/me, conversations, messages, anonymous/
  join, sync, socket) — c'est ainsi que la recette tourne hors ligne, en CI comme ici.
- Etats dessines : vide, chargement (jamais un spinner sur un cache non vide), erreur, hors-ligne,
  session expiree, refus. Un ecran blanc n'est pas un etat.
- Un controle existe s'il a un EFFET : aucun bouton, onglet ou puce inerte.
- TDD : le test qui echoue AVANT le code ; comportement par l'API publique, jamais l'implementation.

INTERDITS :
- inventer un chiffre (poids, version, mesure) : ecris « a mesurer » ou mesure-le ;
- ajouter a un fichier deja hors budget (800-1100 lignes) : on extrait d'abord ;
- ecrire une JUMELLE (seconde source de verite pour une donnee qui en a une) ;
- toucher a l'ordre a la main : \`node ${D}/ordre-des-ecrans.js\` le recalcule ;
- desactiver un test, baisser un seuil, poser un ignore pour passer un gate ;
- ecrire un nom de modele dans un commit, un commentaire ou un fichier du depot ;
- utiliser gh ou curl vers api.github.com (fermes) : les outils mcp__github__ via ToolSearch.
`

const dossierDeTravail = `${SCRATCH}` // hors du depot suivi (.cache est gitignore)

// ---------------------------------------------------------------------------
// LA PASSERELLE — la v3 s'y conforme, elle ne la modifie jamais
// ---------------------------------------------------------------------------

const PASSERELLE = `
CONFORMITE A LA PASSERELLE (directive du porteur, 2026-09-01) — la v3 NE TOUCHE PAS
services/gateway, ni le schema Prisma, ni les types partages cote serveur : elle SE CONFORME a la
passerelle TELLE QU'ELLE EST. Une issue gateway compagnon peut s'ouvrir ; un patch serveur pour
une CAPACITE nouvelle ou une commodite de la v3, jamais.
SEULE EXCEPTION — un BOGUE PROUVE, decouvert en chemin : un comportement de la passerelle qui
contredit son propre contrat (sa doc, son schema, son test existant, ou la conception § 5/§ 6,
par ex. un decrement sans plancher, un 500 sur une entree valide, une route qui repond hors de son
schema). Il se corrige alors A LA RACINE, et seulement ainsi : (1) un test du gateway qui ECHOUE
et reproduit le bogue, ecrit AVANT le correctif ; (2) le correctif MINIMAL, sans capacite ajoutee ;
(3) la suite du gateway rejouee sur le perimetre touche (\`cd services/gateway && bun run test --
<fichier>\`) ; (4) sa propre issue (label gateway, « bug ») et son propre commit, distinct de
l'ecran ; (5) le rapport cite la preuve. Un relecteur qui trouve un diff serveur SANS ces cinq
elements le classe BLOQUANT — « la v3 en avait besoin » n'est pas une preuve de bogue.
- Avant d'ecrire un appel, LIS la route REELLE dans services/gateway/src/routes/** : chemin exact
  (prefixe /api/v1), methode, schema de corps (Zod/JSON schema), prevalidation d'authentification
  (jwt Authorization: Bearer / session invitee X-Session-Token / optionalAuth / allowAnonymous),
  forme de la reponse ({ success, data, error, pagination }) et codes d'erreur nommes. Cite
  fichier:ligne dans ton rapport pour CHAQUE endpoint attaque. Un endpoint qui n'existe pas ne
  s'invente pas : la capacite n'est PAS exposee dans l'interface (regime 3, § 5.2 de la conception)
  et une issue gateway compagnon est ouverte — jamais un contournement (par exemple : rejoindre en
  anonyme passe par POST /anonymous/join/:linkId, la SEULE route qui applique la police du lien,
  jamais par POST /conversations/join/:linkId ; un membre rejoint par la route qui existe pour lui —
  lis routes/links/*, routes/conversations/*, routes/anonymous.ts pour la trouver).
- TEMPS REEL : UN client socket.io vers le namespace PAR DEFAUT (la passerelle ne declare aucun
  .of()), authentifie comme services/gateway/src/socketio/handlers/AuthHandler.ts l'attend (jeton
  JWT, ou session invitee — lis _authenticateAnonymousUser), rooms par conversation:join /
  conversation:leave, et UNIQUEMENT les evenements declares dans
  packages/shared/types/socketio-events.ts (SERVER_EVENTS / CLIENT_EVENTS, format
  entity:action-word a tirets) avec leurs charges REELLES — lis
  services/gateway/src/socketio/handlers/** et socketio/buildTranslationEvent.ts pour la forme
  exacte de chaque charge (message:new, message:translation, typing:start/stop, reaction:added,
  conversation:unread-updated, presence:snapshot, auth:token-expired…). Aucun evenement invente,
  aucun champ devine : ce que la charge porte se lit dans l'emetteur.
- DELTA et cache : GET /api/v1/sync tel que services/gateway/src/routes/sync.ts le sert (ETag/304,
  curseur keyset, hasGap, allowAnonymous) — pas un second moteur.
- La PASSERELLE DE BOUCHON (apps/web-v3/e2e/visual/lib/serveurs.ts, et tout bouchon socket) MIME
  la passerelle reelle : memes chemins, memes codes, memes formes de charge, PRISES DANS LE CODE du
  gateway — un vert obtenu contre un bouchon qui ne ressemble pas au serveur ne prouve rien. Pour
  chaque endpoint ou evenement bouchonne, le rapport nomme la route ou l'emetteur reel qu'il copie.
- apps/web (legacy) reste vif ; seul apps/web/public/sw.js (V3_ZONE_PREFIXES) est modifiable,
  selon le § 4.4 bis.
`


// ---------------------------------------------------------------------------
// SCHEMAS
// ---------------------------------------------------------------------------

const TRAVAIL = {
  type: 'object',
  additionalProperties: false,
  required: ['cle', 'genre', 'titre_issue', 'critere_de_fin'],
  properties: {
    cle: { type: 'string', description: "l'id de vue (vitrine, home, chats, join, rights, thread…) ou infra-N" },
    genre: { type: 'string', enum: ['ecran', 'infra', 'style'] },
    titre_issue: { type: 'string', description: 'SEMANTIQUE : le resultat attendu, jamais un code interne' },
    route: { type: 'string' },
    priorite: { type: 'string' },
    audience: { type: 'string' },
    critere_de_fin: { type: 'string', description: 'OBSERVABLE : une commande, une mesure, une assertion' },
    corps_issue: { type: 'string' },
    dans_la_planche: { type: 'boolean', description: 'true si un cible/<cle>.png existe deja' },
    existe_deja: { type: 'string', description: "ce qui existe deja dans le code pour ce travail (fichiers), s'il y a lieu" },
    detail: { type: 'string' },
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
    vues_a_ajouter_a_la_planche: {
      type: 'array',
      description: 'les vues du tour qui ne sont PAS dans la planche (aucun cible/<id>.png) et que la phase Concevoir doit y faire entrer',
      items: { type: 'object', additionalProperties: false, required: ['id', 'route', 'audience', 'titre'], properties: { id: { type: 'string' }, route: { type: 'string' }, audience: { type: 'string' }, titre: { type: 'string' }, pourquoi: { type: 'string' } } },
    },
  },
}

const PROPOSITION = {
  type: 'object', additionalProperties: false, required: ['nom', 'these', 'dossier', 'fichiers', 'poids_css_octets'],
  properties: {
    nom: { type: 'string' },
    these: { type: 'string', description: 'en trois phrases : ce que cette direction fait au lecteur' },
    dossier: { type: 'string' },
    fichiers: { type: 'array', items: { type: 'string' } },
    poids_css_octets: { type: 'number', description: 'MESURE (gzip -9 de la feuille de chrome proposee), jamais estime' },
    captures: { type: 'array', items: { type: 'string' } },
    limites: { type: 'string' },
  },
}

const JUGEMENT = {
  type: 'object', additionalProperties: false, required: ['retenue', 'scores', 'charte'],
  properties: {
    retenue: { type: 'string' },
    scores: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['nom', 'total', 'detail'], properties: { nom: { type: 'string' }, total: { type: 'number' }, detail: { type: 'string' } } } },
    greffes: { type: 'string', description: 'ce qui est repris des propositions non retenues' },
    charte: { type: 'string', description: 'LA CHARTE, en Markdown, opposable : regles numerotees, chaque regle avec son temoin (gate ou assertion)' },
    fichier_charte: { type: 'string', description: 'le chemin ou la charte a ete ecrite' },
  },
}

const CONCEPTION = {
  type: 'object', additionalProperties: false, required: ['rapport', 'ordre_rc', 'vues_ajoutees', 'fichiers_touches'],
  properties: {
    rapport: { type: 'string' },
    ordre_rc: { type: 'number', description: 'code de sortie de node ordre-des-ecrans.js apres modification (doit etre 0)' },
    captures_regenerees: { type: 'boolean' },
    vues_ajoutees: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'route'], properties: { id: { type: 'string' }, route: { type: 'string' }, png: { type: 'string' } } } },
    routes_modifiees: { type: 'array', items: { type: 'string' } },
    fichiers_touches: { type: 'array', items: { type: 'string' } },
    contradictions: { type: 'string', description: 'ce que la directive contredit dans la conception, et comment le § 12 le tranche' },
  },
}

const ISSUES = {
  type: 'object', additionalProperties: false, required: ['issues', 'outils_disponibles'],
  properties: {
    outils_disponibles: { type: 'boolean' },
    issues: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['cle', 'numero'],
        properties: { cle: { type: 'string' }, numero: { type: 'number' }, url: { type: 'string' }, deja_ouverte: { type: 'boolean' } },
      },
    },
  },
}

const REVUE = {
  type: 'object', additionalProperties: false, required: ['verdict', 'defauts'],
  properties: {
    verdict: { type: 'string', enum: ['conforme', 'a-corriger', 'a-refaire'] },
    defauts: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['gravite', 'constat', 'preuve', 'correctif'],
        properties: {
          gravite: { type: 'string', enum: ['bloquant', 'majeur', 'mineur'] },
          constat: { type: 'string' }, preuve: { type: 'string', description: 'fichier:ligne, commande et sortie' }, correctif: { type: 'string' },
        },
      },
    },
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
    mesures: { type: 'string', description: 'les chiffres rendus par check-bundle-budget / mesure-reseau / compare-rendu, tels quels' },
  },
}

const LIVRAISON = {
  type: 'object', additionalProperties: false, required: ['pousse', 'rapport'],
  properties: {
    pousse: { type: 'boolean' },
    commits: { type: 'array', items: { type: 'string' } },
    issues_fermees: { type: 'array', items: { type: 'number' } },
    rapport: { type: 'string' },
  },
}

const COMPLETUDE = {
  type: 'object', additionalProperties: false, required: ['rapport', 'prochains_travaux'],
  properties: {
    rapport: { type: 'string' },
    manques_legacy: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['feature', 'ou_dans_le_legacy', 'ecran_v3'], properties: { feature: { type: 'string' }, ou_dans_le_legacy: { type: 'string' }, ecran_v3: { type: 'string' }, priorite: { type: 'string' } } } },
    prochains_travaux: { type: 'array', items: { type: 'string' }, description: 'les cles de vue du prochain tour, dans l ordre' },
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
  (t.existe_deja ? `\n  existe deja : ${t.existe_deja}` : '') +
  (t.detail ? `\n  detail : ${t.detail}` : '')

const resultatsDesTours = []
let charteRetenue = null
let focusDuTour = FOCUS

for (let tour = 1; tour <= TOURS; tour += 1) {
  log(`=== TOUR ${tour}/${TOURS} — focus : ${focusDuTour.join(', ')} ===`)

  // -------------------------------------------------------------------------
  phase('Cadrer')
  // -------------------------------------------------------------------------
  const cadrage = await agent(`${SOCLE}

TA MISSION — CADRER ce tour. Tu ne modifies AUCUN fichier de production.

1. MESURE ce qui existe : \`git branch --show-current\`, \`git status --short\`, \`git log --oneline -15\`,
   \`find ${V3}/app -name 'route.ts' -o -name 'page.tsx' | sort\`, \`ls ${V3}/lib/*\`,
   \`ls ${D}/cible\`, \`node ${D}/ordre-des-ecrans.js >/dev/null; echo rc=$?\`.
   Lance les gates rapides pour connaitre le point de depart : \`cd ${V3} && bun run type-check\`,
   \`bun run lint\`, \`bun run test 2>&1 | tail -5\`. Note ce qui est deja rouge AVANT ce tour.
2. Lis ${D}/ordre.md, ${D}/matrice.json et le § 12 de la conception s'il existe.
3. Charge ToolSearch({query: "select:mcp__github__list_issues,mcp__github__search_issues,mcp__github__issue_read", max_results: 3})
   et lis les issues ouvertes label "web" (epopee #4371, milestone 74) pour savoir ce qui est deja
   ouvert ou ferme. Si les outils ne repondent pas, dis-le et continue.
4. CHOISIS LES TRAVAUX DU TOUR, plafonnes a ${PLAFOND}, dans cet ordre :
   a) les cles de FOCUS du porteur, dans l'ordre donne : ${focusDuTour.join(', ')} — un ecran
      qui EXISTE deja mais est terne, sans temps reel ou incomplet est un travail (genre "style"
      ou "ecran" selon ce qui manque : dis-le dans existe_deja et detail) ;
   b) puis, s'il reste de la place, les ecrans suivants de ${D}/ordre.md dont les dependances
      sont livrees.
   Pour chaque travail : titre SEMANTIQUE, route, audience, critere de fin OBSERVABLE (repris de
   matrice.json quand la ligne existe, ecrit sinon), corps d'issue (Contexte · Preuve attendue ·
   Critere de fin · Source).
   \`vitrine\` n'est PAS dans la planche ni dans la matrice (issue #4476 la posait en question ; la
   directive du porteur la tranche : c'est un ecran de la v3, route \`/\`, audience anonyme,
   P1-role-secondaire sans dependance). Rends-la dans vues_a_ajouter_a_la_planche, avec toute autre
   vue du focus sans capture cible.
5. Si un prerequis manque et qu'aucun travail utile n'est possible sans decision du porteur,
   pret=false et dis exactement quoi. Sinon pret=true — un gate deja rouge AVANT le tour n'est pas
   un blocage, c'est un fait a rapporter dans etat (la phase Gates le traitera).

Sois FACTUEL : 'etat' cite des commandes et leurs sorties, pas des impressions.`,
    { label: `cadrer:tour-${tour}`, phase: 'Cadrer', schema: CADRAGE, model: 'sonnet', effort: 'high' })

  if (!cadrage) { resultatsDesTours.push({ tour, arret: 'le cadrage n a rien rendu' }); break }
  if (!cadrage.pret) {
    log(`ARRET — ${cadrage.blocage}`)
    resultatsDesTours.push({ tour, arret: 'prerequis manquant', blocage: cadrage.blocage, etat: cadrage.etat })
    break
  }
  const travaux = (cadrage.travaux || []).slice(0, PLAFOND)
  if (!travaux.length) {
    log('Rien a faire : tout le focus et l ordre sont livres.')
    resultatsDesTours.push({ tour, arret: 'rien a faire', etat: cadrage.etat })
    break
  }
  log(`${travaux.length} travaux : ${travaux.map((t) => t.cle).join(', ')}`)

  // -------------------------------------------------------------------------
  phase('Charte')
  // -------------------------------------------------------------------------
  if (!SANS_CHARTE && tour === 1) {
    log('Trois directions de style en concurrence, puis un juge')

    const DIRECTIONS = [
      {
        nom: 'clarte-rurale',
        modele: 'opus',
        angle: "LA LISIBILITE D'ABORD, pour un telephone d'entree de gamme au soleil, en 3G lente : contrastes forts, typographie systeme genereuse, boutons pleins et hauts, un seul accent, zero decoration qui ne porte pas de sens. Le luxe, c'est l'espace blanc.",
      },
      {
        nom: 'app-moderne',
        modele: 'fable',
        angle: "L'APPLICATION MODERNE que l'on a envie de rouvrir : cartes a filet fin, surfaces en couches (color-mix sur les jetons), degrades tres discrets sur les heros, glyphes du sprite comme ponctuation, gros boutons arrondis, micro-hierarchie par le poids et la taille — et TOUJOURS sous le budget (aucune police web, aucune image, aucun JS).",
      },
      {
        nom: 'sobriete-premium',
        modele: 'sonnet',
        angle: "LA SOBRIETE PREMIUM : peu d'elements, chacun a sa place, une grille stricte, des rangees hautes et aerees, la couleur reservee a ce qui est actionnable, une seule ombre douce autorisee sur l'element flottant, et un rythme vertical constant (8 px).",
      },
    ]

    const propositions = (await parallel(DIRECTIONS.map((d) => () =>
      agent(`${SOCLE}

TA MISSION — PROPOSER une DIRECTION DE STYLE pour la v3, nommee « ${d.nom} », sous cet angle :
${d.angle}

Tu ne touches PAS aux fichiers du depot. Tu ecris dans ${dossierDeTravail}/charte/${d.nom}/ :
1. \`chrome.css\` — la feuille de CHROME proposee (remplacante de ${V3}/app/enveloppe/feuille.ts
   + app/connecte/feuille.ts + app/vitrine/feuille.ts), qui n'emploie QUE les jetons de
   packages/design-tokens/{tokens,dark,light}.css (tu peux PROPOSER des jetons nouveaux dans un
   \`jetons-proposes.css\`, avec leur contraste AA calcule dans les DEUX schemas) ;
2. \`vitrine.html\`, \`tableau.html\`, \`chats.html\`, \`join.html\`, \`fil.html\` — cinq documents
   STATIQUES complets (memes jetons inlines, meme socle, sprite inline par <svg><use>) qui montrent
   la direction sur les cinq ecrans du focus, avec des donnees realistes (noms, langues, non-lus,
   un message traduit avec sa pastille de langue, un etat vide, un etat hors-ligne) ;
3. des CAPTURES 390x844 clair ET sombre de chacun (Chromium : ${REPO}/scripts/lib/navigateur.cjs
   → chromiumPath() ; Playwright est installe dans ${V3}/node_modules) ;
4. \`these.md\` — trois phrases, puis la liste des regles que ta direction impose, chacune avec
   le TEMOIN qui permettra de la verifier (une assertion CSS, une mesure, un gate existant).

CONTRAINTES : regarde d'abord ${D}/cible/home.png, chats.png, join.png, rights.png, thread.png,
login.png (la planche fait foi sur DISPOSITION, hierarchie, etats, gestes) et le rendu ACTUEL de la
v3 (lance \`cd ${V3} && bun run build && bun run start\` en arriere-plan puis capture \`/\`, \`/login\` ;
les ecrans connectes demandent un cookie : lis app/session.ts et la passerelle de bouchon de
e2e/visual/lib/serveurs.ts, ou juge sur le code). Aucune police web, aucune image, aucun JS,
aucune couleur ecrite hors jeton. Boutons principaux >= 52 px, cibles >= 44 px, contraste AA dans
les deux schemas, \`prefers-reduced-motion\` respecte. MESURE le poids gzip de chrome.css
(\`gzip -9c chrome.css | wc -c\`).

Rends : nom, these, dossier, fichiers, poids_css_octets MESURE, captures, limites.`,
        { label: `charte:${d.nom}`, phase: 'Charte', schema: PROPOSITION, model: d.modele, effort: 'high' }),
    ))).filter(Boolean)

    log(`${propositions.length}/3 propositions rendues`)

    const jugement = await agent(`${SOCLE}

TU ES LE JUGE. Trois directions de style ont ete proposees pour la v3. Tu les REGARDES (outil Read
sur chaque capture PNG, clair et sombre), tu lis leurs feuilles et leurs theses, et tu les notes.

CRITERES (sur 10 chacun, note ecrite avec sa raison) :
1. Lisibilite sur un petit telephone au soleil (contraste, tailles, hierarchie) ;
2. « Application moderne, agreable, aeree, gros boutons » — la directive du porteur ;
3. Legerete : poids gzip MESURE, nombre de regles, absence de tout actif ;
4. Fidelite a la planche sur disposition / hierarchie / etats / gestes ;
5. Accessibilite (cibles, focus visible, reduced-motion, contraste AA dans les DEUX schemas) ;
6. Maintenabilite (jetons seuls, aucune jumelle, regles opposables par un temoin) ;
7. Ce qu'elle fait aux CINQ ecrans du focus a la fois (coherence).

PUIS TU ECRIS LA CHARTE : la direction retenue, GREFFEE des meilleures idees des deux autres,
sous forme de regles NUMEROTEES, chacune avec son temoin. Elle tient en une page. Elle dit
explicitement : la hauteur des boutons principaux et secondaires, les rayons, les espacements
(echelle), les cartes, l'usage de l'accent, les etats (vide / hors-ligne / erreur / chargement),
la pastille de langue du Prisme, les glyphes (lesquels, ou), ce qui est INTERDIT.
Ecris-la dans ${dossierDeTravail}/charte/CHARTE.md et rends-la aussi dans le champ \`charte\`.

LES PROPOSITIONS :
${court(propositions, 12000)}`,
      { label: 'charte:juge', phase: 'Charte', schema: JUGEMENT, model: 'fable', effort: 'max' })

    charteRetenue = jugement
    log(`Charte retenue : ${jugement ? jugement.retenue : '(aucune — le juge n a rien rendu)'}`)
  } else if (SANS_CHARTE) {
    log('Charte : sautee (sans_charte=true) — la charte est celle du § 12 de la conception')
  }

  const CHARTE = charteRetenue && charteRetenue.charte
    ? `\nLA CHARTE VISUELLE RETENUE (opposable — chaque regle a son temoin) :\n${charteRetenue.charte.slice(0, 9000)}\n`
    : `\nLA CHARTE VISUELLE : celle du § 12 de ${D}/conception-web-v3.md (« Charte »). Si ce paragraphe n'existe pas, applique la directive du porteur ci-dessus.\n`

  // -------------------------------------------------------------------------
  phase('Concevoir')
  // -------------------------------------------------------------------------
  const vuesNeuves = cadrage.vues_a_ajouter_a_la_planche || []
  const conception = await agent(`${SOCLE}
${PASSERELLE}${CHARTE}
TA MISSION — FAIRE ENTRER CE TOUR DANS LES DOCUMENTS DE DESIGN, avant la premiere ligne de code.
Ce sont des documents de DESIGN (planche, matrice, conception) : ils portent la CIBLE et les
mecanismes, jamais l'etat des taches (l'etat vit dans les issues).

1. LA PLANCHE ${D}/MeeshyWebV3.dc.html.
   Pour chaque vue neuve ci-dessous, ajoute un ECRAN au prototype : une entree dans \`const MAP\`
   (identifiant + glyphe ph-*, dans le bon groupe — cree un groupe « SITE » pour la vitrine),
   un bloc \`<sc-if value="{{ isXxx }}">\` dessine dans la langue de la planche (390x844, memes
   composants, meme densite), l'etat \`isXxx\` calcule dans \`render()\`, les sorties dans \`EXITS\`,
   et sa route dans le navigateur de droite (lis comment \`capture-cibles.js\` scrape le titre, le
   sous-titre et la route : le harnais ECHOUE si MAP et le navigateur ne s'accordent pas).
   La vitrine se dessine d'apres ${V3}/app/vitrine/contenu.ts (le contenu, repris du legacy) et la
   charte : heros a gros CTA, trois atouts, la mission, l'appel final, le pied.
   Si un ecran du focus EXISTE dans la planche mais que la charte ou la directive le fait evoluer
   (gros boutons, FAB, etats), METS LA PLANCHE A JOUR — elle est la source du design, pas une
   archive. En particulier : \`join\` se redessine en ETAT CHOIX (le cadre du fil floute, vide de
   tout message, et la modale « anonyme ou compte ? » avec connexion / inscription / formulaire
   anonyme / accordeon des droits) et \`rights\` en bandeau des droits DANS le fil de l'invite,
   juste apres la jonction.
   VUES NEUVES : ${court(vuesNeuves, 3000)}
2. REGENERE les captures : \`node ${D}/capture-cibles.js\` (Chromium local, cache npm dans
   .cache/dc-vendor). Verifie que \`cible/<id>.png\` existe pour chaque vue neuve et que vues.json /
   vues.md la portent. Si une route parametree entre, declare son jeton dans jetons-de-vues.json.
3. LA MATRICE ${D}/matrice.json : une ligne par vue neuve (vue_id, titre_issue, lot, priorite,
   route, audience, depend_de, critere_de_fin, dimensions_visees, corps_issue) ; \`join\` et
   \`rights\` passent a la route \`/chat/:lien\` (join = etat CHOIX : cadre floute + modale ;
   rights = etat INVITE juste apres la jonction : bandeau des droits dans le fil), et \`thread\`
   porte ses DEUX adresses (\`/chat/:lien\` pour l'invite, \`/chats/:cle\` pour le membre — voir
   « ROUTES ») ; declare dans jetons-de-vues.json le jeton \`lien\` de chaque vue de \`/chat/:lien\`
   (un jeton par ETAT : lien vivant sans session, lien rejoint) ; puis
   \`node ${D}/ordre-des-ecrans.js\` doit rendre rc=0 et regenerer ordre.md. Ne touche jamais
   ordre.md a la main.
4. LA CONCEPTION ${D}/conception-web-v3.md : ajoute (ou complete) un « § 12 — Directive du
   porteur (2026-09-01) » qui tranche par ecrit, avec la meme exigence de preuve que le reste du
   document : (a) la vitrine est un ecran de la v3 (ferme la question de #4476 point 2) ; (b) \`/\`
   sert le TABLEAU DE BORD au lecteur connecte (pas le fil) ; (c) \`/chat/:lien\` est LA route de
   jonction ET de lecture pour l'invite, machine a trois ETATS decides par le serveur (CHOIX :
   cadre floute + modale, rien de la conversation ne part ; INVITE : le fil sous la meme adresse
   avec les droits du lien ; MEMBRE : jonction puis 302 vers /chats/:cle) — aucune route /join —
   et pourquoi (legacy, AASA, collision avec /chats/:cle ; le § 6.3 etat par etat s'y applique
   tel quel, l'etat A devenant l'etat CHOIX) — avec l'etape de bascule
   Traefik correspondante dans le tableau du § 4.9 ; (d) le TEMPS REEL de participation : un module
   ES ecrit a la main, charge apres le premier pixel, socket.io-client par import dynamique, servi
   dans la zone (ou et comment — decide-le en lisant § 4.4, § 4.4 bis, next.config.ts,
   scripts/check-v3-pipeline.mjs, et dis ce que la regle Traefik doit reclamer) ; (e) LA CHARTE
   visuelle (colle-la, regles numerotees et temoins) ; (f) les budgets que ces ecrans doivent
   tenir (ajoute les motifs manquants a ${V3}/budgets.json — \`/chat/*\` dans (public), etc.) ;
   (g) l'arborescence § 3.3 mise a jour. Mets a jour aussi vues.md si la regeneration ne le fait pas.
   Si la directive CONTREDIT un point de la conception, ne l'efface pas : ecris dans le § 12 ce qui
   change et pourquoi, et rends-le dans \`contradictions\`.
5. Verifie : \`cd ${V3} && bun run test -- index-des-vues vues-comparables jetons\` (les temoins qui
   lisent vues.json et la matrice), et \`node ${D}/ordre-des-ecrans.js ; echo rc=$?\`.

Ne commit PAS. Rends le rapport, les fichiers touches, les vues ajoutees (id, route, png), le rc de
l'ordre, et les contradictions tranchees.`,
    { label: `concevoir:tour-${tour}`, phase: 'Concevoir', schema: CONCEPTION, model: 'fable', effort: 'high' })

  if (conception && conception.ordre_rc !== 0) {
    log(`ATTENTION : ordre-des-ecrans.js rend rc=${conception.ordre_rc} — la phase Gates devra le remettre a 0`)
  }

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

D'ABORD : ToolSearch({query: "select:mcp__github__issue_write,mcp__github__search_issues,mcp__github__list_issues", max_results: 3}).
L'API REST directe est FERMEE — ni curl ni gh.

SI LES OUTILS NE REPONDENT PAS : n'invente aucun numero. Ecris ou complete ${D}/issues-a-ouvrir.md
(une entree par travail au format d'issue, datee, sans doublon), rends numero: 0 partout et
outils_disponibles=false.

Pour CHAQUE travail :
- cherche d'abord une issue OUVERTE qui le couvre (search_issues, list_issues label "web") ; si elle
  existe, rends son numero avec deja_ouverte=true — n'en cree pas une seconde (ex. #4712 couvre le
  tableau de bord, #4522/#4523 couvrent join/rights, #4524 le fil) ; si son titre ou son corps sont
  perimes par la directive (route /chat/:lien, tableau de bord et non le fil), METS-LA A JOUR
  (issue_write update) plutot que d'en ouvrir une jumelle ;
- sinon cree-la : sous-issue de l'epopee #4371 (parent_issue_number: 4371), label "web", milestone
  74 (« La v3 web sert le role premier ») ;
- titre : le titre SEMANTIQUE fourni ; corps : Contexte (avec preuve fichier:ligne), Preuve attendue,
  Critere de fin (in extenso), Source (lot, ligne de matrice, capture cible, § 12 de la conception) ;
- termine TOUJOURS le corps par une ligne vide, puis ---, puis
  _Generated by [Claude Code](https://claude.ai/code)_

LES TRAVAUX :
${travaux.map(ligneDeTravail).join('\n')}`,
      { label: `ouvrir:tour-${tour}`, phase: 'Ouvrir', schema: ISSUES, model: 'sonnet', effort: 'medium' })

    numero = new Map(((ouverture && ouverture.issues) || []).filter((i) => i.numero > 0).map((i) => [i.cle, i.numero]))
    log(`${numero.size}/${travaux.length} issues connues`)
  }

  // -------------------------------------------------------------------------
  // Un a un : les travaux partagent le socle (chrome, jetons, sprite, lib/realtime), et deux
  // agents qui l'editent en parallele fabriqueraient une jumelle.
  phase('Implementer')
  // -------------------------------------------------------------------------
  const resultats = []
  for (const t of travaux) {
    const num = numero.get(t.cle)
    const cible = t.genre !== 'infra'
      ? `\nLa capture CIBLE de cet ecran est ${D}/cible/${t.cle}.png — REGARDE-LA (outil Read) avant d'ecrire. Elle fait foi sur la disposition, la hierarchie, les etats et les gestes ; la CHARTE fait foi sur le style.`
      : ''

    const fait = await agent(`${SOCLE}
${PASSERELLE}${CHARTE}
TA MISSION — LIVRER ce travail, en TDD, en ENTIER.

TRAVAIL : ${t.titre_issue}
${ligneDeTravail(t)}${cible}
${num ? `\nISSUE : #${num}. Le commit final la fermera (Closes #${num}) — la phase Livrer s'en charge.` : ''}

METHODE, dans cet ordre :
1. RELIS la section de la conception qui couvre ce travail (et le § 12). Suis-la plutot que
   d'improviser ; si elle te semble fausse, DIS-LE dans ton rapport, ne diverge pas en silence.
   Lis le code existant de l'ecran s'il existe (existe_deja) : on le FAIT EVOLUER, on ne le
   reecrit pas a cote.
2. TDD : le test qui echoue AVANT le code (${V3}/__tests__/*.test.ts, jsdom + jest-axe pour tout
   document rendu ; e2e/visual/*.spec.ts avec la passerelle de bouchon pour ce qui se mesure au
   navigateur). Teste le COMPORTEMENT par l'API publique.
3. Le minimum qui fait passer. TypeScript strict, aucun 'any', donnees immuables, un fichier par
   responsabilite (vue / feuille / contenu / porte, comme les ecrans existants), aucun commentaire
   qui paraphrase le code (les doc-comments qui expliquent un POURQUOI sont la norme du depot).
4. STYLE : applique la charte au chrome (app/enveloppe/feuille.ts) et a la feuille de l'ecran ;
   regarde le rendu dans les DEUX schemas (\`bun run build && bun run start\` en arriere-plan +
   capture 390x844 par Playwright ; les ecrans connectes se servent avec le cookie de session lu par
   app/session.ts contre la passerelle de bouchon de e2e/visual/lib/serveurs.ts — complete-la).
   Pose les captures dans ${dossierDeTravail}/rendus/${t.cle}-{light,dark}.png et REGARDE-LES.
5. TEMPS REEL (si le travail est une surface de participation : fil, liste des chats) : le module
   ES et lib/realtime/participate.ts selon le § 12 ; le chemin sans JS reste vert ; la reprise sur
   \`visible\` / \`online\` passe par lib/realtime/lifecycle.ts (site unique) ; une requete pendant
   \`hidden\` est un defaut (gate lifecycle).
6. Fais tourner localement : \`cd ${V3} && bun run type-check && bun run lint && bun run test\`, puis
   \`bun run build\` (qui lance check-bundle-budget) ; corrige AVANT de rendre.
7. Ne commit PAS : la phase Livrer s'en charge apres la revue.

Rends un rapport texte : ce que tu as fait, les fichiers touches, les commandes lancees et leurs
sorties, les CAPTURES produites, ce que tu n'as PAS fait et pourquoi, toute contradiction trouvee.`,
      { label: `livrer:${t.cle}`, phase: 'Implementer', model: 'opus', effort: 'high' })

    // ------------------------------------------------------------------ Revue
    phase('Revue')
    const revues = await parallel([
      () => agent(`${SOCLE}
${PASSERELLE}
Tu RELIS le travail qui vient d'etre fait et ta consigne est de LE PRENDRE EN DEFAUT, sur la
SURFACE : tu ne le reecris pas, tu constates (git diff, git status, fichiers), tu prouves, tu
proposes le correctif.

Cherche, dans cet ordre :
- le critere de fin est-il REELLEMENT atteint ? Rejoue la commande qu'il nomme ;
- du 'any', un type assertion non justifie, une donnee mutee, un fichier hors budget qu'on a grossi ;
- une JUMELLE : couleur en dur au lieu d'un jeton, resolution de langue reecrite au lieu de
  resolvePrismTranslation(), second client socket, second socle de document, seconde table ;
- des <div onClick> la ou un <button>/<a>/<form>/<dialog>/<details> etait le bon element ;
- un test qui teste l'implementation, ou qui ne peut pas echouer ;
- une icone servie autrement que par le sprite ; un import de lucide-react ou @phosphor-icons/web ;
- une cible < 44 px, un bouton principal < 52 px, un texte < 4,5:1 dans l'un des deux schemas
  (regarde les captures du rapport, ou refais-les) ;
- un \`lang=\` manquant sur un texte resolu par le Prisme ; un <Link> qui traverse la zone ;
- une requete emise pendant que l'onglet est cache ; du JS charge avant le premier pixel ;
- un etat manquant (vide, hors-ligne, erreur, session expiree, refus) : ecran blanc = defaut.

TRAVAIL : ${t.titre_issue}
CRITERE DE FIN : ${t.critere_de_fin}

RAPPORT DE L'IMPLEMENTEUR :
${fait || '(aucun rapport rendu)'}`,
        { label: `revue-surface:${t.cle}`, phase: 'Revue', schema: REVUE, model: 'sonnet', effort: 'high' }),

      () => agent(`${SOCLE}
${PASSERELLE}
Tu es un ingenieur staff HOSTILE a ce travail. Tu attaques la CONCEPTION et ce qui a ete OUBLIE —
pas la surface (un autre relecteur s'en charge en parallele).

Les questions, sans complaisance :
- Le lecteur en zone RURALE : combien d'octets et de requetes avant le premier pixel utile, en 3G
  lente ? Mesure-le (build + \`node ${V3}/scripts/mesure-reseau.mjs\` ou check-bundle-budget). Un
  chiffre non mesure ne compte pas.
- Le TEMPS REEL : qui affiche ce que le socket recoit ? Que se passe-t-il quand il tombe 2 min, quand
  l'onglet revient de l'arriere-plan, quand deux onglets sont ouverts, sans JS du tout ? Le chemin
  POST/rechargement marche-t-il encore ?
- Le PRISME : bon rang elu ? qui AFFICHE ce qu'il elit ? que transporte-t-on A COTE ? le texte
  servi a-t-il le DROIT d'etre la (protege, ephemere, vue unique) ? (cycles 121-124 du CLAUDE.md)
- La SECURITE : trois jetons (aucun, le sien, celui d'un autre) — que voit le troisieme ? un 403 se
  dit « introuvable » ? un cookie forge obtient-il des donnees ?
- L'ACCESSIBILITE : clavier, lecteur d'ecran, contraste AA dans les DEUX schemas, cibles, RTL,
  reduced-motion. Le mode CLAIR a-t-il ete regarde, ou seulement le sombre ?
- Un CONTROLE INERTE (le defaut le plus frequent de ce depot) : cherche-le activement.
- La regle de placement § 3 : ce fichier est-il au bon endroit ? un second lecteur trancherait pareil ?
- Ce que le travail a laisse DERRIERE : un champ ajoute et non relaye, un appelant non migre, une
  jumelle non supprimee, un doc de design non mis a jour, un budget non declare (budgets.json).
- La CHARTE : quelle regle est violee, avec sa preuve ?
- La PASSERELLE : un diff sous services/gateway/ ou packages/shared/ (hors types client) sans les
  CINQ elements de la preuve de bogue (test qui echouait avant, correctif minimal, suite rejouee,
  issue, commit distinct) ⇒ BLOQUANT ; chaque endpoint et chaque evenement attaques existent-ils,
  avec cette forme de charge, dans le code du gateway (fichier:ligne) ? le bouchon copie-t-il la
  route reelle ?

TRAVAIL : ${t.titre_issue}
CRITERE DE FIN : ${t.critere_de_fin}

RAPPORT DE L'IMPLEMENTEUR :
${fait || '(aucun rapport rendu)'}`,
        { label: `revue-conception:${t.cle}`, phase: 'Revue', schema: REVUE, model: 'fable', effort: 'high' }),
    ])

    const [revueS, revueO] = revues
    let aCorriger = [...((revueS && revueS.defauts) || []), ...((revueO && revueO.defauts) || [])]
      .filter((d) => d.gravite !== 'mineur')

    const corrections = []
    for (let passe = 1; passe <= 2 && aCorriger.length; passe += 1) {
      phase('Implementer')
      log(`${t.cle} : ${aCorriger.length} defauts non mineurs a corriger (passe ${passe})`)
      const correction = await agent(`${SOCLE}
${PASSERELLE}${CHARTE}
TA MISSION — CORRIGER les defauts que la revue croisee a trouves sur « ${t.titre_issue} ».

Tu corriges CHACUN, ou tu dis explicitement pourquoi un constat est FAUX — avec ta preuve
(commande, sortie, fichier:ligne). Un relecteur peut se tromper : ne corrige pas un defaut qui
n'existe pas, refute-le. Chaque correction garde son test. Rejoue type-check, lint, test, build.

LES DEFAUTS :
${aCorriger.map((d, i) => `${i + 1}. [${d.gravite}] ${d.constat}\n   preuve: ${d.preuve}\n   correctif propose: ${d.correctif}`).join('\n\n')}

Rends : corriges (nombre), refutes (nombre), rapport (ce qui a ete corrige, ce qui a ete refute et
pourquoi, les commandes rejouees et leurs sorties).`,
        { label: `corriger:${t.cle}:${passe}`, phase: 'Implementer', schema: CORRECTION, model: 'opus', effort: 'high' })
      corrections.push(correction)

      if (passe === 1 && correction && correction.corriges > 0) {
        phase('Revue')
        const contre = await agent(`${SOCLE}
${PASSERELLE}
CONTRE-REVUE. Des defauts ont ete corriges sur « ${t.titre_issue} ». Verifie que CHAQUE correction
est reelle (git diff) et n'a rien casse, et que chaque refutation est fondee. Ne rends que ce qui
reste BLOQUANT ou MAJEUR — un defaut resolu ne se recopie pas.

DEFAUTS INITIAUX :
${court(aCorriger, 6000)}

RAPPORT DE CORRECTION :
${court(correction, 6000)}`,
          { label: `contre-revue:${t.cle}`, phase: 'Revue', schema: REVUE, model: 'sonnet', effort: 'medium' })
        aCorriger = ((contre && contre.defauts) || []).filter((d) => d.gravite !== 'mineur')
      } else {
        aCorriger = []
      }
    }

    resultats.push({
      cle: t.cle, titre: t.titre_issue, issue: num, fait, revueS, revueO, corrections,
      dimensions_mures: (revueO && revueO.dimensions_mures) || (revueS && revueS.dimensions_mures) || [],
      dimensions_restantes: (revueO && revueO.dimensions_restantes) || (revueS && revueS.dimensions_restantes) || [],
    })
  }

  // -------------------------------------------------------------------------
  phase('Gates')
  // -------------------------------------------------------------------------
  let gates = null
  for (let passe = 1; passe <= 3; passe += 1) {
    gates = await agent(`${SOCLE}
${PASSERELLE}
TA MISSION — FAIRE PASSER LES GATES, et CORRIGER ce qui est rouge (passe ${passe}/3).

Dans cet ordre, en t'arretant pour corriger des qu'un gate est rouge :
1. \`node ${D}/ordre-des-ecrans.js\`                          (rc 0 ; regenere ordre.md)
2. \`node ${REPO}/scripts/check-v3-pipeline.mjs\`             (invariants de la chaine d'integration)
3. \`cd ${V3} && bun run type-check\`
4. \`cd ${V3} && bun run lint\`                                (eslint + check-jetons)
5. \`cd ${V3} && bun run test\`                                (jest, tout)
6. \`cd ${V3} && bun run build\`                               (next build + check-app-router-built + check-bundle-budget)
7. \`cd ${V3} && bun run test:a11y\` et \`bun run test:lifecycle\` (Playwright, serveur \`bun run start\`
   lance par la config ; Chromium dans /opt/pw-browsers)
8. les suites e2e du role premier et celles ajoutees ce tour : \`cd ${V3} && bun run e2e\`
9. conformite visuelle : serveur v3 en arriere-plan (\`bun run start\`, port 3300) puis
   \`node ${D}/compare-rendu.js --base http://127.0.0.1:3300 --vues ${travaux.filter((t) => t.genre !== 'infra').map((t) => t.cle).join(',')}\`
   — rends les SCORES rendus tels quels ; rc=3 (non comparable) se dit, ne se maquille pas.
10. \`node ${REPO}/scripts/v3-rapport.mjs --base http://127.0.0.1:3300\`  (le rapport unique)
11. si apps/web a ete touche (sw.js) : \`cd ${REPO}/apps/web && npx jest __tests__/public/sw.v3-zone.test.ts\`

REGLES :
- Un gate rouge se CORRIGE, il ne se contourne pas. Ne desactive JAMAIS un test, ne baisse JAMAIS
  un seuil. Si un seuil est mal calibre, dis-le dans ce_qui_bloque et laisse le gate rouge.
- Un gate rouge AVANT ce tour (voir l'etat du cadrage) se corrige aussi s'il touche ce que le tour
  a livre ; sinon nomme-le dans ce_qui_bloque avec sa cause.
- Non-applicable = le prerequis n'existe pas (dis lequel) ; jamais « vert ».
- Rends la SORTIE reelle de chaque commande, tronquee, jamais un resume ; et les MESURES chiffrees
  (budget par groupe en trois lignes, requetes avant premier pixel, scores de conformite).

ETAT AVANT CE TOUR (cadrage) :
${(cadrage.etat || '').slice(0, 3000)}

TRAVAUX DE CE TOUR : ${travaux.map((t) => t.cle).join(', ')}`,
      { label: `gates:tour-${tour}:${passe}`, phase: 'Gates', schema: GATES, model: 'sonnet', effort: 'high' })

    if (!gates || gates.tous_verts) break
    const rouges = (gates.gates || []).filter((g) => g.resultat === 'rouge')
    if (!rouges.length) break
    if (passe === 3) break
    phase('Implementer')
    log(`Gates rouges (${rouges.map((g) => g.nom).join(', ')}) — correction de fond, passe ${passe}`)
    await agent(`${SOCLE}
${PASSERELLE}${CHARTE}
TA MISSION — CORRIGER A LA RACINE les gates restes rouges apres la passe ${passe}. Un gate rouge
est un BUG du lot : trouve la cause, corrige, garde le test. Interdit : desactiver, ignorer, baisser
un seuil, retirer un ecran pour passer.

GATES ROUGES :
${court(rouges, 8000)}

CE QUI BLOQUE, selon la passe : ${gates.ce_qui_bloque || '(non dit)'}

Rends ce que tu as corrige, avec les commandes rejouees et leurs sorties.`,
      { label: `corriger-gates:tour-${tour}:${passe}`, phase: 'Implementer', model: 'opus', effort: 'high' })
  }

  // -------------------------------------------------------------------------
  phase('Documenter')
  // -------------------------------------------------------------------------
  const documentation = await agent(`${SOCLE}
${PASSERELLE}
TA MISSION — FAIRE DIRE AUX DOCUMENTS DE DESIGN CE QUI A ETE CONSTRUIT. La phase Concevoir a
ecrit la CIBLE avant le code ; le code a pu s'en ecarter (une contradiction tranchee, un chemin
d'actif, un jeton ajoute, un etat de plus). Les documents doivent decrire la v3 telle qu'elle EST,
comme documents de DESIGN — jamais comme tableau de bord (aucune case cochee, aucun « fait »).

1. ${D}/conception-web-v3.md : le § 12 (charte, routes, temps reel, budgets, arborescence § 3.3),
   et l'Annexe des MESURES : chaque chiffre nouveau avec la commande qui le rejoue (poids gzip du
   chrome, du module temps reel, requetes avant premier pixel par ecran du tour, scores de
   conformite) — pris dans les sorties des gates ci-dessous, JAMAIS inventes.
2. ${D}/MeeshyWebV3.dc.html : si un ecran livre differe de la planche sur DISPOSITION, hierarchie,
   etats ou gestes (par decision, pas par defaut), la planche suit ; puis
   \`node ${D}/capture-cibles.js\` regenere cible/, vues.json, vues.md.
3. ${D}/matrice.json + \`node ${D}/ordre-des-ecrans.js\` (rc=0).
4. ${REPO}/tasks/lessons.md : une lecon NUMEROTEE (numero suivant, pas de doublon — verifie
   \`grep -n '^## Leçon' | tail -3\`) par correction de fond faite en revue ou aux gates ce tour, au
   format des lecons existantes (constat, cause, regle). Rien si aucune correction de fond.
5. Rejoue \`cd ${V3} && bun run test -- index-des-vues vues-comparables\` et le gate d'ordre.

RESULTATS DU TOUR :
${resultats.map((r) => `- ${r.cle} : ${r.titre}\n  mures: ${(r.dimensions_mures || []).join(', ')}\n  restantes: ${(r.dimensions_restantes || []).join(', ')}`).join('\n')}

GATES (sorties) :
${court(gates, 10000)}

Rends un rapport texte des fichiers touches et de ce qui a change dans chaque document.`,
    { label: `documenter:tour-${tour}`, phase: 'Documenter', model: 'opus', effort: 'medium' })

  // -------------------------------------------------------------------------
  phase('Livrer')
  // -------------------------------------------------------------------------
  const livraison = await agent(`${SOCLE}

TA MISSION — LIVRER le tour ${tour} sur la branche \`${BRANCHE}\`.

ETAT DES GATES :
${court(gates, 8000)}

SI UN GATE EST ROUGE (resultat "rouge") : ne pousse RIEN, ne commit RIEN. Rends pousse=false et un
rapport qui dit ce qui est rouge et ce qu'il faut. C'est tout.

SI TOUS LES GATES SONT VERTS OU NON-APPLICABLES :
1. \`git status --short\`, \`git diff --stat\` : regarde ce que tu t'appretes a commiter. Retire tout
   artefact genere (rendu/, rapport-conformite.json, .next/, node_modules/, .cache/, captures de
   travail hors ${D}/cible/). Les captures cibles regenerees (${D}/cible/*.png), vues.json, vues.md,
   ordre.md, matrice.json et la conception FONT partie du commit.
2. Commits : UN commit par travail livre quand les fichiers se separent proprement (sinon un
   commit par lot coherent : design, ecran, temps reel, docs). Message dans la forme du depot : un
   titre en francais qui dit le RESULTAT (\`feat(web-v3): …\`, \`docs(design): …\`), un corps qui dit
   CE QUI ETAIT CASSE ou absent et POURQUOI la forme retenue, \`Closes #<n>\` par issue livree
   (JAMAIS \`Closes #0\`), et en fin de message :
   Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
   N'ecris aucun nom de modele ailleurs dans le message.
3. \`git push -u origin ${BRANCHE}\`. Sur echec RESEAU seulement, reessaie 4 fois (2s, 4s, 8s, 16s).
   Sur rejet non-reseau (non fast-forward) : \`git pull --rebase origin ${BRANCHE}\` puis rejoue
   type-check + test, puis push ; si le conflit demande un arbitrage, arrete-toi et dis-le.
4. Pour chaque issue livree DONT TU CONNAIS LE NUMERO : un commentaire de cloture par
   mcp__github__add_issue_comment (ToolSearch d'abord) — preuve (commit, gate, mesure), captures
   decrites, dimensions MURES et RESTANTES ; et une issue par dimension non mure (issue_write,
   sous-issue de #4371, label web, milestone 74) comme l'exige le CLAUDE.md. Termine chaque
   commentaire par une ligne vide, ---, puis _Generated by [Claude Code](https://claude.ai/code)_
   Si les outils ne repondent pas, consigne dans ${D}/issues-a-ouvrir.md et DIS-LE.

TRAVAUX ET LEURS ISSUES :
${resultats.map((r) => `- ${r.cle} (#${r.issue || '?'}) : ${r.titre}\n  mures: ${(r.dimensions_mures || []).join(', ') || '(non dites)'} | restantes: ${(r.dimensions_restantes || []).join(', ') || '(non dites)'}`).join('\n')}

DOCUMENTATION DU TOUR :
${(documentation || '').slice(0, 3000)}`,
    { label: `livrer:tour-${tour}`, phase: 'Livrer', schema: LIVRAISON, model: 'opus', effort: 'high' })

  // -------------------------------------------------------------------------
  phase('Completude')
  // -------------------------------------------------------------------------
  const completude = await agent(`${SOCLE}
${PASSERELLE}
TU ES LE CRITIQUE DE COMPLETUDE. Le tour ${tour} vient de livrer : ${resultats.map((r) => r.cle).join(', ')}.
Ta question : QU'EST-CE QUI MANQUE ENCORE, et dans quel ordre le prochain tour doit-il le prendre ?

1. Compare ecran par ecran ce que la v3 sert (\`find ${V3}/app -name route.ts -o -name page.tsx\`,
   lire les vues) a ce que le LEGACY offre sur les memes surfaces (${REPO}/apps/web/app/page.tsx,
   app/(connected)/*, app/chat/[id], app/conversations, components/conversations/*,
   components/chat/*, hooks/*) : reactions, reponses, pieces jointes, vocaux, edition,
   suppression, epinglage, recherche, presence, frappe, accuses, liens de partage, notifications,
   feed, stories, reels, reglages… Une feature du legacy absente de la v3 sur un ecran LIVRE est un
   manque a nommer (feature, ou dans le legacy, ecran v3, priorite).
2. Relis ${D}/ordre.md : quels ecrans suivent, dependances livrees ?
3. Relis les revues : quelles dimensions sont restees non mures ? Une lenteur est un BUG.
4. Rends prochains_travaux : les cles de vue du prochain tour (plafond ${PLAFOND}), dans l'ordre —
   d'abord ce qui complete les ecrans du FOCUS du porteur (vitrine, tableau de bord, /chats, /chat,
   fil), puis l'ordre calcule.

RAPPORTS DE LIVRAISON :
${court(livraison, 4000)}`,
    { label: `completude:tour-${tour}`, phase: 'Completude', schema: COMPLETUDE, model: 'fable', effort: 'high' })

  resultatsDesTours.push({
    tour,
    travaux: resultats.map((r) => ({ cle: r.cle, titre: r.titre, issue: r.issue, mures: r.dimensions_mures, restantes: r.dimensions_restantes })),
    conception: conception ? { vues_ajoutees: conception.vues_ajoutees, routes_modifiees: conception.routes_modifiees, contradictions: conception.contradictions } : null,
    gates: gates ? { tous_verts: gates.tous_verts, ce_qui_bloque: gates.ce_qui_bloque, mesures: gates.mesures, gates: (gates.gates || []).map((g) => `${g.nom}: ${g.resultat}`) } : null,
    livraison,
    completude: completude ? { rapport: completude.rapport, prochains_travaux: completude.prochains_travaux, manques_legacy: completude.manques_legacy } : null,
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
  charte: charteRetenue ? { retenue: charteRetenue.retenue, fichier: charteRetenue.fichier_charte, scores: charteRetenue.scores } : null,
  tours: resultatsDesTours,
}
