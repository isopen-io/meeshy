export const meta = {
  name: 'meeshy-profil-vue-finale',
  description:
    "Chantier #18857 « le profil en trois faces, fait du kit » : UNE chaîne par session (serveur, ios, android ou web). Lot après lot, dans l'ordre : issue ouverte ou retrouvée, développement par meeshy-issues-dev (TDD, revue, audit des lots sensibles, preuve CI par workflow_dispatch, PR vers dev), puis guichet de fusion (dev fusionnée dans la branche, gardes rejouées sur l'arbre fusionné, fusion, issue fermée avec sa preuve). Le lot suivant part du dev qui contient le précédent : aucune PR empilée, aucun conflit à l'intérieur d'une chaîne ; entre chaînes, les chemins sont disjoints.",
  whenToUse:
    "Lancer ou reprendre le développement du profil (planche docs/product/profil-vue-finale.md) dans une session par plateforme. Args : { plateforme (OBLIGATOIRE : 'serveur' | 'ios' | 'android' | 'web'), attribution (lignes de pied de commit de la session ; défaut aucune), seulement [clés], sauter [clés], fusionner (true : fusionne chaque PR prouvée verte avant de passer au lot suivant ; false : toutes les PR restent ouvertes, empilées), milestone (numéro, si le porteur l'a créé), chantier (18857), repo ('/home/user/meeshy'), base ('dev'), essais (2) }.",
  phases: [
    { title: 'Ouvrir', detail: 'retrouve ou ouvre la sous-issue de chaque lot de la chaîne' },
    { title: 'Développer', detail: 'un lot à la fois, par le workflow meeshy-issues-dev' },
    { title: 'Fusionner', detail: 'guichet : dev dans la branche, gardes sur l arbre fusionné, fusion, clôture' },
  ],
}

// ---------------------------------------------------------------------------
// PARAMÈTRES
// ---------------------------------------------------------------------------
const A = args && typeof args === 'object' ? args : {}
const P = typeof A.plateforme === 'string' ? A.plateforme : ''
const REPO = typeof A.repo === 'string' && A.repo ? A.repo : '/home/user/meeshy'
const GH = 'isopen-io/meeshy'
const BASE = typeof A.base === 'string' && A.base ? A.base : 'dev'
const CHANTIER = Number.isInteger(A.chantier) ? A.chantier : 18857
const MILESTONE = Number.isInteger(A.milestone) ? A.milestone : null
const FUSIONNER = A.fusionner !== false
const ESSAIS = Number.isInteger(A.essais) && A.essais >= 0 ? A.essais : 2
const ATTR = typeof A.attribution === 'string' ? A.attribution.trim() : ''
const SAUTER = new Set(Array.isArray(A.sauter) ? A.sauter : [])
const SEULEMENT = new Set(Array.isArray(A.seulement) ? A.seulement : [])

const PLANCHE = 'docs/product/profil-vue-finale'
const DOC = `${PLANCHE}.md`

// ---------------------------------------------------------------------------
// LES CHEMINS DE CHAQUE CHAÎNE — la règle qui rend la fusion sans conflit
// ---------------------------------------------------------------------------
const CHEMINS = {
  serveur: ['services/gateway/', 'packages/shared/'],
  ios: ['apps/ios/', 'packages/MeeshySDK/'],
  android: ['apps/android/'],
  web: ['apps/web/'],
}
const REGLE_CHEMINS = p => `CHEMINS DE LA CHAÎNE « ${p} » : tu n'écris QUE sous ${CHEMINS[p].map(c => `\`${c}\``).join(' et ')}. ` +
  `Aucun fichier d'une autre chaîne (${Object.keys(CHEMINS).filter(k => k !== p).map(k => CHEMINS[k].join(', ')).join(' ; ')}), ` +
  `rien sous \`${PLANCHE}/\`, \`docs/product/kit/\` ni \`.claude/\`. ` +
  (p === 'ios'
    ? `Exception unique : la chaîne iOS est la RÉFÉRENCE, elle seule pose les vecteurs de recette \`docs/product/kit/K<nn>-<Nom>.vectors.json\` de ses composants. `
    : `Les vecteurs \`docs/product/kit/K<nn>-*.vectors.json\` se LISENT s'ils sont déjà sur ${BASE} ; sinon prends les mesures de la fiche de la planche, et dis-le dans la PR. `) +
  `S'il te faut un changement hors de tes chemins (un type partagé, une route, une clé), tu ne l'écris pas : tu ouvres une issue pour la chaîne concernée et tu gardes ton lot rétrocompatible (champ absent ⇒ ancien comportement).`

const COMMUN = `Chantier #${CHANTIER}. Lis d'abord \`${DOC}\` (les lois, l'index des vues, le kit) puis les sources que ton lot cite sous \`${PLANCHE}/src/\` (balisage HTML des planches : il donne la disposition, la hiérarchie, les états, les mesures en px et les noms d'icônes) et leurs captures sous \`${PLANCHE}/vues/\`. ` +
  `Le brief \`${PLANCHE}/brief/BRIEF.md\` § 9 et § 10 fixe le kit (réemploi K01–K25, nouveaux K26–K55, décisions de nommage qui priment) ; \`${PLANCHE}/brief/plan-kit.json\` détaille parties, variantes et évolutions. ` +
  `Conformité = disposition, hiérarchie, états et gestes ; polices, rayons et teintes viennent du design system de la plateforme, pas de la planche. ` +
  `Règles du kit : on EXTRAIT avant de créer (le jumeau le plus complet du code DEVIENT le composant, cité dans la fiche § « Jumeaux ») ; un composant est un atome agnostique (aucun type du domaine, aucun singleton Meeshy) ; mêmes noms d'API sur les trois plateformes ; le verre a une entrée (K01), le bouton rond aussi (K02). ` +
  `AUCUNE RÉGRESSION DE FEATURE : ce que le code porte et que la planche ne montre pas se garde, à la place la plus sobre. Rétrocompatible : un ancien client marche contre le nouveau serveur, et l'inverse.`

const fiche = ks => ks.map(k => `\`${PLANCHE}/src/Kit-${k}-*.dc.html\``).join(', ')

// ---------------------------------------------------------------------------
// LES LOTS — l'ordre est l'ordre de dépendance ; une chaîne s'arrête au premier lot non fusionné
// ---------------------------------------------------------------------------
const NOM = { ios: 'iOS', android: 'Android', web: 'Web' }
const PREUVE = {
  ios: 'Preuve : `./apps/ios/meeshy.sh test` n\'existe pas en session cloud ; les gardes de texte tournent en local (check_house_rules.sh, check_cohesion_budget.sh, check_test_registration.sh, check-accent-color-hardcoding.mjs, projet Xcode régénéré) et la compilation plus les tests se prouvent par workflow_dispatch de ios.yml au SHA de tête.',
  android: 'Preuve : workflow_dispatch de android.yml (assembleDebug + testDebugUnitTest) au SHA de tête ; gardes locales du dépôt avant.',
  web: 'Preuve : suite complète depuis `apps/web`, build, cliquets et gate de poids, en local dans le conteneur.',
  serveur: 'Preuve : `bun run test:coverage` du gateway et tests de `packages/shared`, en local (parité bun de la CI).',
}

const KIT = [
  { cle: 'kit-atomes-a', ks: ['K26', 'K40', 'K41', 'K42', 'K45', 'K46', 'K55'],
    titre: p => `${NOM[p]} : le mouvement, le bouton libellé, la pastille, la jauge, le médaillon, la note et la touche de raccourci sont des composants du kit`,
    quoi: 'Vague 1 et début de la vague 2. K26 `MeeshyMotion` d\'abord (la table de ressorts, durées et retours haptiques : tous les suivants l\'appellent ; un type `MeeshyMotion` existe déjà dans le thème, il s\'étend, il ne se double pas). Puis K40 `MeeshyButton`, K41 `MeeshyBadge`, K42 `MeeshyMeter`, K45 `MeeshyMedallion`, K46 `MeeshyNote`, K55 `MeeshyKeyHint`. Chaque composant entre au catalogue du kit de la plateforme avec sa recette en valeurs et ses témoins (comportement, nom/rôle/valeur, cible 44, contraste, mouvement réduit). Aucun écran ne change dans ce lot.' },
  { cle: 'kit-atomes-b', ks: ['K33', 'K35', 'K37', 'K51', 'K53', 'K38'],
    titre: p => `${NOM[p]} : l'échelle de proximité, le lecteur d'onde, la rangée verrouillée, la marque de traduction, le pas-à-pas et le squelette sont des composants du kit`,
    quoi: 'Fin de la vague 2. K33 `MeeshyCircleScale` (pastilles, pilule de relation, anneaux ; la loi d\'intensité vit dans la recette), K35 `MeeshyWavePlayer` (le lecteur des vocaux DEVIENT le composant), K37 `MeeshyLockedRow` (elle ne reçoit jamais une donnée protégée), K51 `MeeshyTranslationMark`, K53 `MeeshyStepper`, et de K38 le seul atome `MeeshySkeleton`. Aucun écran ne change dans ce lot.' },
  { cle: 'kit-assemblages-a', ks: ['K27', 'K28', 'K30', 'K31', 'K32', 'K34', 'K39', 'K43', 'K44'],
    titre: p => `${NOM[p]} : la bannière vivante, l'en-tête repliable, le billet, la carte à code, l'action libellée, les chiffres, la rangée de personne, la carte de groupe et l'en-tête de section sont des composants du kit`,
    quoi: 'Vague 3, première moitié. K27 `MeeshyLivingBanner`, K28 `MeeshyCollapsingHero`, K30 `MeeshyTicket`, K31 `MeeshyCodeCard` (un seul générateur de QR), K32 `MeeshyLabeledAction` et sa grille, K34 `MeeshyFigures` (chiffre, bande, mini-courbe ; les barres sont à K50), K39 `MeeshyPersonRow`, K43 `MeeshyGroupCard`, K44 `MeeshySectionHeader`. Aucun écran ne change dans ce lot.' },
  { cle: 'kit-assemblages-b', ks: ['K36', 'K38', 'K47', 'K48', 'K49', 'K50', 'K52', 'K54', 'K29'],
    titre: p => `${NOM[p]} : l'épingle de personne, le bloc d'état, les tuiles de choix, le groupe d'avatars, la grille de médias, le graphique, la liste réordonnable, le tracé de carte et l'avatar qui voyage sont des composants du kit`,
    quoi: 'Vague 3, seconde moitié, puis la vague 4. K36 `MeeshyMapPin` (il ne connaît ni la carte ni les coordonnées), K38 `MeeshyStateBlock`, K47 `MeeshyChoiceTiles`, K48 `MeeshyAvatarGroup`, K49 `MeeshyMediaGrid`, K50 `MeeshyChart`, K52 `MeeshyReorderList`, K54 `MeeshyMapTrace`, et K29 `MeeshyAvatarMorph` en dernier (élément partagé entre écrans). Les 33 évolutions de composants existants ou proposés (`plan-kit.json` → `evolutions`) qui concernent des composants déjà en place sur ta plateforme entrent ici. Aucun écran ne change dans ce lot.' },
]

const ECRANS = [
  { cle: 'vitrine-publique',
    titre: p => `${NOM[p]} : ma Vitrine se voit telle que chaque cercle la voit, et la page publique en est le niveau Public`,
    vues: { ios: ['Main', 'Moi-Apercu', 'Moi-Edition'], android: ['Android-Moi', 'Main', 'Moi-Apercu', 'Moi-Edition'], web: ['Web-Public', 'Web-Public-Mobile', 'Web-Moi', 'Web-Etats', 'Main', 'Moi-Apercu'] },
    quoi: 'LE PROFIL PUBLIC. Ma fiche devient la face Vitrine (bannière vivante, avatar, cercles, activité, voix, publications) et gagne « Voir comme » : la même Vitrine rendue au niveau d\'un cercle, Public en tête, ce qui est fermé montré en rangées verrouillées (K37) avec le cercle qui l\'ouvre. L\'aperçu se calcule depuis la loi d\'accès partagée (`relation-access`), JAMAIS depuis une liste écrite à la main. Sur le web : la page `/u/<pseudo>` (et le raccourci `/@<pseudo>` quand le serveur le sert) pour un visiteur sans compte, 403 et 404 confondus. L\'édition reste sur place. Sensible (ce que chaque cercle voit) : audit adverse.' },
  { cle: 'fiche-relation',
    titre: p => `${NOM[p]} : la fiche d'un autre est le profil de notre relation, en trois faces, et ce que mon cercle n'ouvre pas s'y voit verrouillé`,
    vues: { ios: ['Autre-Vitrine', 'Autre-Publications', 'Autre-Commun', 'Autre-Actions', 'Autre-Cercle', 'Autre-Inconnu', 'Etat-Demande'], android: ['Android-Vitrine', 'Android-Actions', 'Android-Feuilles', 'Autre-Commun', 'Autre-Cercle', 'Autre-Inconnu'], web: ['Web-Autre', 'Autre-Vitrine', 'Autre-Commun', 'Autre-Actions', 'Autre-Cercle', 'Autre-Inconnu'] },
    quoi: 'LE PROFIL DE LA RELATION ENTRE DEUX UTILISATEURS. La fiche d\'un autre prend les trois faces (Vitrine · Liens · Actions) avec le sélecteur du bas (K03 dans K10 ; sur le web large, voir #18845) ; la pilule de relation dit le cercle commun ; la face Actions range TOUTES les opérations existantes (écrire, appels, Talkie, Ensemble, Bring, position, batterie, injoignable, envoyer le profil, bloquer, signaler) en actions libellées (K32), chacune offerte ou verrouillée selon le cercle ; « Notre cercle » montre le niveau accordé de chaque côté et ce qui manque pour monter. La fiche d\'un inconnu (cercle Public) propose la demande de message et l\'appel. Rien de ce que la fiche actuelle sait faire ne disparaît (onglets Conversations et Publications, emplacements injectés par l\'app). La présence obéit à la loi existante, sans exception nouvelle. Sensible : audit adverse.' },
  { cle: 'face-liens',
    titre: p => `${NOM[p]} : la face Liens réunit mon lien de profil, son QR, mes adresses et mes liens créés, en billets`,
    vues: { ios: ['Moi-Liens', 'Autre-Liens', 'Carte-Profil', 'Mes-Adresses', 'Lien-Detail', 'Lien-Partage', 'Lien-Communaute', 'Lien-Creer', 'Lien-Suivi-Creer', 'Parrainage', 'Sans-Contact'], android: ['Android-Liens', 'Moi-Liens', 'Autre-Liens', 'Carte-Profil', 'Mes-Adresses'], web: ['Web-Moi', 'Web-Lien', 'Moi-Liens', 'Autre-Liens', 'Carte-Profil', 'Mes-Adresses', 'Apercu-Lien'] },
    quoi: 'LA PAGE DE LIENS. Le hub « Mes liens » existant devient la face Liens : billet du lien de profil avec son QR (K30 + K31 ; le QR de profil manque sur iOS et sur le web), partage du profil (« Envoyer le profil » manque sur iOS), les quatre familles de liens en billets avec leurs chiffres, et « Mes adresses » quand le serveur les sert (sinon la section n\'apparaît pas). Les écrans de détail et de création existants gardent leurs fonctions et prennent les composants du kit. Le partage sans contact est un lot ultérieur : la planche le montre, ce lot ne le livre pas. Sur le web, l\'aperçu de lien par personne (`share-preview`) entre ici.' },
  { cle: 'carte-action',
    titre: p => `${NOM[p]} : « voir sur la carte » est une action de la fiche, l'avatar devient l'épingle, et mes proches se voient ensemble`,
    vues: { ios: ['Carte-Personne', 'Carte-Proches', 'Carte-Partage', 'Carte-Sang', 'iPad-Split'], android: ['Android-Carte', 'Carte-Proches', 'Carte-Partage'], web: ['Web-Autre', 'Web-Etats', 'Carte-Personne', 'Carte-Proches'] },
    quoi: 'LA CARTE COMME ACTION. Depuis la face Actions, « Voir sur la carte » ouvre la carte existante des positions partagées, l\'avatar voyageant de la fiche à l\'épingle (K29 + K36), la fiche devenant une feuille basse (K15) : lieu, précision, temps restant (K09 en décompte), itinéraire, partager la mienne. La carte de tous mes proches réemploie la même carte et la même épingle. La position Sang continue et le mode fantôme côté client restent derrière leur flag serveur : ce lot ne les allume pas.' },
  { cle: 'etats',
    titre: p => `${NOM[p]} : chaque face du profil a ses états vide, chargement, erreur, hors ligne, bloqué et introuvable`,
    vues: { ios: ['Etat-Chargement', 'Etat-Vide', 'Etat-Erreur', 'Etat-HorsLigne', 'Etat-Bloque', 'Etat-Introuvable', 'Signaler'], android: ['Android-Feuilles', 'Etat-Vide', 'Etat-Erreur', 'Etat-HorsLigne'], web: ['Web-Etats', 'Etat-Vide', 'Etat-Erreur', 'Etat-Introuvable'] },
    quoi: 'LES ÉTATS. Squelette seulement si le cache est vide (cache d\'abord, jamais de roue sur un cache non vide) ; vide avec une sortie ; erreur avec « Réessayer » ; hors ligne servi par le cache, actions réseau mises en file ; fiche bloquée réduite ; introuvable et privé confondus ; « Signaler » en tuiles de choix (K47). Les capsules d\'état passent par K14.' },
]

const SERVEUR = [
  { cle: 'serveur-fiche-par-cercle', sensible: true,
    titre: 'Serveur : la fiche servie dit ce que le cercle du lecteur ouvre, ce qu\'il ferme et ce qui l\'ouvrirait — et rien ne part à côté',
    quoi: 'Le contrat des deux écrans phares. `GET /directory/people/:handle` (implémentation unique `buildPublicProfile`) rend, en plus de l\'existant et sans rien retirer : la relation (cercle commun, niveau accordé de chaque côté, ce qui manque pour monter), et pour chaque capacité de la loi d\'accès un état `open | locked` avec le cercle qui l\'ouvre — un état `locked` ne porte JAMAIS la valeur protégée ni un champ voisin (présence, position, batterie, jeu). Paramètre `as=<cercle>` réservé au propriétaire de la fiche : sa Vitrine telle que ce cercle la voit (« Voir comme »), résolue par la MÊME loi `resolve…` que le service réel, jamais par une seconde boucle. Fuseau et pays d\'inscription servis selon le cercle (ils ne le sont pas aujourd\'hui). Types et schéma dans `packages/shared`. Témoins écrits sur un cercle AUTRE que le premier, et sur ce qui part à côté du champ gardé.' },
  { cle: 'serveur-adresse-courte',
    titre: 'Serveur : meeshy.me/@pseudo mène à la fiche, et la ville déclarée s\'affiche si son propriétaire le veut',
    quoi: 'Alias `/@<pseudo>` vers l\'adresse canonique `/u/<pseudo>` (redirection ; l\'ancien chemin reste). Champ `city` déclaré par l\'utilisateur (Prisma + `PATCH /users/me`, validation), servi selon le cercle choisi par son propriétaire. Rétrocompatible.' },
  { cle: 'serveur-mes-adresses', sensible: true,
    titre: 'Serveur : un utilisateur publie ses adresses personnelles sur sa fiche et choisit le cercle qui les voit',
    quoi: 'Modèle des adresses personnelles (titre, URL validée, glyphe, audience = un cercle, ordre, affichée ou non ; compteur de clics par un lien de suivi existant, sans nouveau modèle de clic), routes de lecture, création, modification, réordonnancement et suppression sous `/users/me`, et leur service dans la fiche selon le cercle du lecteur. Une adresse hors audience n\'est ni servie ni comptée. URL : schéma http(s) seulement, pas d\'adresse interne.' },
  { cle: 'serveur-apercu-lien-personne',
    titre: 'Serveur : le lien d\'une fiche collé dans une conversation Meeshy se déplie en carte de profil',
    quoi: '`linkUnfurl` reconnaît `/u/<pseudo>` et `/@<pseudo>` et rend la carte de profil au niveau Public (jamais plus : le lien est lu par n\'importe qui), bio servie dans la langue du lecteur par le Prisme existant.' },
]

const lotsDe = p => p === 'serveur'
  ? SERVEUR.map(l => ({ cle: l.cle, titre: l.titre, sensible: !!l.sensible, notes: `${COMMUN}\n\n${l.quoi}\n\n${REGLE_CHEMINS(p)}\n${PREUVE[p]}` }))
  : [
      ...KIT.map(l => ({ cle: `${p}-${l.cle}`, titre: l.titre(p), sensible: false,
        notes: `${COMMUN}\n\nLOT DE KIT (${l.ks.join(', ')}). ${l.quoi}\nFiches de contrat (rôle, anatomie, variantes, états, mouvement, API, jumeaux, témoins) : ${fiche(l.ks)} et leurs captures \`${PLANCHE}/vues/\` (carte du kit : \`Kit-Carte\`, réemploi : \`Kit-Reemploi\`, évolutions : \`Kit-Evolutions\`). Les numéros K26–K55 et les noms d'API des évolutions sont des PROPOSITIONS : si le registre du kit réel (\`docs/product/kit/\`, \`.claude/workflows/meeshy-kit-planche.lots.json\`) a pris un numéro entre-temps, garde le NOM et signale le numéro dans la PR.\n\n${REGLE_CHEMINS(p)}\n${PREUVE[p]}` })),
      ...ECRANS.map(l => ({ cle: `${p}-${l.cle}`, titre: l.titre(p), sensible: l.cle === 'vitrine-publique' || l.cle === 'fiche-relation',
        notes: `${COMMUN}\n\nLOT D'ÉCRAN. ${l.quoi}\nVues à reproduire (source puis capture) : ${l.vues[p].map(v => `\`${PLANCHE}/src/${v}.dc.html\``).join(', ')}. ${p === 'ios' ? 'iOS est la référence des deux autres plateformes : ce que tu tranches ici, dis-le dans la PR.' : `La référence est iOS : si le lot iOS équivalent est sur ${BASE}, lis-le et reproduis ses états et ses gestes ; transpose seulement ce que la plateforme impose.`} L'écran est fait des composants du kit livrés par les lots précédents de cette chaîne : aucun composant redessiné sur place. Si le serveur ne sert pas encore un champ de ce lot (contrat « serveur-fiche-par-cercle », adresses), l'écran s'en passe proprement et le reste part.\n\n${REGLE_CHEMINS(p)}\n${PREUVE[p]}` })),
    ]

// ---------------------------------------------------------------------------
// DÉROULÉ
// ---------------------------------------------------------------------------
if (!CHEMINS[P]) {
  return { erreur: `args.plateforme obligatoire : 'serveur', 'ios', 'android' ou 'web' (reçu : ${JSON.stringify(A.plateforme)}). Une session par chaîne.` }
}
const TOUS = lotsDe(P)
const LOTS = TOUS.filter(l => !SAUTER.has(l.cle) && (!SEULEMENT.size || SEULEMENT.has(l.cle)))
log(`Chaîne « ${P} » : ${LOTS.length} lot(s) sur ${TOUS.length} — ${LOTS.map(l => l.cle).join(', ')} — ${FUSIONNER ? 'fusion lot après lot' : 'PR laissées ouvertes'}`)

phase('Ouvrir')
const NUMS = {
  type: 'object',
  properties: { lots: { type: 'array', items: { type: 'object', properties: { cle: { type: 'string' }, n: { type: 'number' }, etat: { type: 'string', enum: ['ouverte', 'fermée'] }, cree: { type: 'boolean' } }, required: ['cle', 'n', 'etat', 'cree'] } } },
  required: ['lots'],
}
const ouvertes = await agent(`Dépôt \`${GH}\`, clone dans \`${REPO}\`. Chantier #${CHANTIER}. Pour CHAQUE lot ci-dessous, retrouve sa sous-issue ou ouvre-la. Ne développe rien.

Lots (clé — titre exact de l'issue) :
${LOTS.map(l => `- ${l.cle} — ${l.titre}`).join('\n')}

Méthode, lot par lot :
1. Cherche une issue qui porte déjà la clé : \`gh api -X GET search/issues -f q='repo:${GH} is:issue "clé de lot : <clé>" in:body'\` (\`gh\` ne sert QU'À cette recherche ; attends 3 s entre deux recherches). Si elle existe, rends son numéro et son état (ouverte ou fermée), \`cree: false\`.
2. Sinon ouvre-la avec l'outil GitHub MCP \`issue_write\` (charge-le par ToolSearch : \`select:mcp__github__issue_write\`), méthode \`create\`, \`parent_issue_number: ${CHANTIER}\`${MILESTONE ? '' : ''}, titre = le titre exact ci-dessus, corps :
   « ## Contexte » (2 phrases : le chantier #${CHANTIER}, la planche \`${DOC}\`, ce que ce lot livre) ; « ## Preuve » (les gates de la plateforme et la CI au SHA de tête) ; « ## Critère de fin » (le résultat du titre est vrai ; \`${BASE}\` fusionnée dans la branche, ses corrections gardées, gardes rejouées sur l'arbre fusionné ; issue fermée par la PR) ; « ## Dimensions visées » (3 à 5 des treize dimensions du CLAUDE.md racine, celles qui comptent pour ce lot) ; « ## Source » (\`${DOC}\`, \`.claude/workflows/meeshy-profil-vue-finale.js\`) ; puis une ligne seule « clé de lot : <clé> » ; puis le pied « --- » et « _Generated by [Claude Code](https://claude.ai/code)_ ».
   ${MILESTONE ? `Puis rattache-la au milestone ${MILESTONE} (\`issue_write\`, méthode \`update\`, \`milestone: ${MILESTONE}\`).` : 'Aucun milestone à poser (le porteur ne l\'a pas encore créé).'}
3. Rends la liste complète : une entrée par lot.`, { label: `ouvrir:${P}`, phase: 'Ouvrir', schema: NUMS })

if (!ouvertes) return { erreur: 'ouverture des issues perdue : relancer', chaine: P }
const num = Object.fromEntries(ouvertes.lots.map(x => [x.cle, x]))

const GUICHET = {
  type: 'object',
  properties: { fusionne: { type: 'boolean' }, sha: { type: 'string' }, devContenu: { type: 'string' }, raison: { type: 'string' }, horsChemins: { type: 'array', items: { type: 'string' } } },
  required: ['fusionne', 'raison'],
}
const guichet = (l, pr) => agent(`GUICHET DE FUSION — chaîne « ${P} », lot « ${l.cle} », PR #${pr.pr} de \`${GH}\` (issue #${num[l.cle].n}), clone \`${REPO}\`. Tu fusionnes cette PR dans \`${BASE}\` SANS CONFLIT, ou tu dis pourquoi tu ne le fais pas. Charge les outils GitHub MCP par ToolSearch (\`pull_request_read\`, \`merge_pull_request\`, \`issue_write\`, \`add_issue_comment\`, \`actions_run_trigger\`, \`actions_list\`).

1. Relève la PR : branche de tête, état, fichiers modifiés. ${REGLE_CHEMINS(P)} Si un fichier modifié sort de ces chemins, NE FUSIONNE PAS : rends \`fusionne: false\`, la liste dans \`horsChemins\`.
2. Dans un worktree de la branche (\`git worktree add\` sous \`${REPO.replace(/\/[^/]+$/, '')}/wt-guichet-${l.cle}\`, quatre worktrees ouverts au plus dans tout le dépôt : range d'abord s'il le faut) : \`git fetch origin ${BASE}\` puis \`git merge --no-edit origin/${BASE}\` — jamais de rebase, jamais de \`--ours\` global. Là où les deux côtés ont touché le même endroit, LA CORRECTION DÉJÀ SUR ${BASE} SE GARDE et le lot s'y adapte ; un fichier de ${BASE} ne se remplace jamais par la version entière de la branche. Un conflit que tu ne sais pas trancher sans perdre un comportement : \`git merge --abort\`, \`fusionne: false\`, dis où.
3. Rejoue sur l'arbre FUSIONNÉ : ${PREUVE[P]} Une référence de cliquet se remesure sur un export de l'arbre fusionné (\`git archive\`). Rouge ⇒ corrige la cause racine (au plus ${ESSAIS} tours), jamais un test sauté ni désactivé ; toujours rouge ⇒ \`fusionne: false\`.
4. Pousse (\`git push -u origin <branche>\`, 4 essais espacés sur erreur réseau). Si la fusion de ${BASE} a changé du code compilé, relance la preuve CI au nouveau SHA de tête et attends son verdict.
5. Vert au SHA de tête : fusionne la PR (\`merge_pull_request\`, méthode \`merge\`). Puis commente l'issue #${num[l.cle].n} : la preuve (PR, SHA fusionné, gates, run CI), « ${BASE} fusionnée dans la branche au SHA <sha de ${BASE} contenu>, ses corrections gardées, gardes rejouées sur l'arbre fusionné », les dimensions mûres et celles qui restent (une issue par dimension qui reste, sous #${CHANTIER}) ; ferme l'issue si la PR ne l'a pas fermée. Termine ton commentaire par le pied « --- » puis « _Generated by [Claude Code](https://claude.ai/code)_ ».
6. Retire le worktree du guichet s'il est propre et poussé.
${ATTR ? `Pied de tout commit que tu crées :\n${ATTR}` : 'Aucune ligne Co-Authored-By dans tes commits.'}
Rends \`fusionne\`, le \`sha\` de fusion, \`devContenu\` (SHA de ${BASE} contenu dans la branche avant fusion) et la \`raison\` (une phrase).`, { label: `guichet:${l.cle}`, phase: 'Fusionner', schema: GUICHET })

const bilan = []
const aDevelopper = LOTS.filter(l => num[l.cle] && num[l.cle].etat === 'ouverte')
for (const l of LOTS) if (!num[l.cle]) bilan.push({ cle: l.cle, etat: 'sans issue' })
for (const l of LOTS) if (num[l.cle] && num[l.cle].etat === 'fermée') bilan.push({ cle: l.cle, issue: num[l.cle].n, etat: 'déjà livré' })

const enIssue = (l, apres) => ({ n: num[l.cle].n, plateforme: P, cle: l.cle, notes: `${l.notes}${l.sensible ? '\n\nLOT SENSIBLE (contrôle d\'accès) : audit par l\'agent auditeur-adversarial avant toute fusion.' : ''}`, ...(apres ? { apres } : {}) })
const communs = { repo: REPO, base: BASE, essais: ESSAIS, ...(ATTR ? { attribution: ATTR } : {}) }

if (!FUSIONNER) {
  phase('Développer')
  const r = await workflow({ scriptPath: `${REPO}/.claude/workflows/meeshy-issues-dev.js` }, { ...communs, issues: aDevelopper.map((l, i) => enIssue(l, i ? aDevelopper[i - 1].cle : null)) })
  return { chaine: P, mode: 'PR empilées, non fusionnées', deja: bilan, ...r }
}

let arret = null
for (const l of aDevelopper) {
  if (arret) { bilan.push({ cle: l.cle, issue: num[l.cle].n, etat: 'non lancé', raison: `la chaîne s'est arrêtée à ${arret}` }); continue }
  phase('Développer')
  log(`Lot ${l.cle} (#${num[l.cle].n}) : développement depuis origin/${BASE}`)
  let r = null
  try { r = await workflow({ scriptPath: `${REPO}/.claude/workflows/meeshy-issues-dev.js` }, { ...communs, issues: [enIssue(l, null)] }) } catch (e) { r = null }
  const pr = r && Array.isArray(r.prs) ? r.prs[0] : null
  if (!pr) {
    const b = r && Array.isArray(r.bloques) && r.bloques[0] ? r.bloques[0].raison : 'développement perdu'
    bilan.push({ cle: l.cle, issue: num[l.cle].n, etat: 'bloqué', raison: b }); arret = l.cle; continue
  }
  phase('Fusionner')
  const g = await guichet(l, pr)
  if (g && g.fusionne) {
    bilan.push({ cle: l.cle, issue: num[l.cle].n, pr: pr.pr, etat: 'fusionné', sha: g.sha, devContenu: g.devContenu })
    log(`Lot ${l.cle} : PR #${pr.pr} fusionnée dans ${BASE}`)
  } else {
    bilan.push({ cle: l.cle, issue: num[l.cle].n, pr: pr.pr, etat: 'PR ouverte, non fusionnée', raison: g ? g.raison : 'guichet perdu', horsChemins: g ? g.horsChemins : undefined })
    arret = l.cle
  }
}

return {
  chaine: P,
  chantier: CHANTIER,
  fusionnes: bilan.filter(b => b.etat === 'fusionné').length,
  arretA: arret,
  lots: bilan,
  suite: arret
    ? `Régler le lot « ${arret} » (voir sa raison), puis relancer le même workflow avec la même plateforme : les lots fermés sont sautés.`
    : 'Chaîne terminée. Recette sur appareil et sur staging, puis les lots ultérieurs (sans contact, position Sang côté client).',
}
