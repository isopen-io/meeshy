/**
 * LES DEUX INVENTAIRES du cliquet des audiences — et ils ne se fondent JAMAIS en
 * un seul.
 *
 * | inventaire | la phrase | ce qu'il faut pour y entrer |
 * |---|---|---|
 * | `DELIBERATELY_WIDE` | « ce site DOIT être large » | la raison, instruite, écrite sur place |
 * | `MEASURED_NOT_INSTRUCTED` | « on ne sait pas encore ce que ce site décide » | sa famille, et une issue |
 *
 * > **« Décidé large » et « pas encore instruit » ne sont pas la même phrase, et
 * > les confondre transforme une dette en autorisation** — dans un inventaire
 * > unique, on lira toujours « décidé ».
 *
 * Ils vivent ici, et non avec le balayage qui les consomme, parce que #20100 a
 * fait passer ce fichier hors budget : les RAISONS sont la part qui grossit à
 * chaque lot, le DISCRIMINANT est la part qui se relit. Un découpage par
 * RESPONSABILITÉ, pas par tranche.
 *
 * **Une entrée de `DELIBERATELY_WIDE` est la forme la plus AUTORISÉE du dépôt** :
 * l'audit de #20100 y a trouvé une raison fausse qui portait « Mesuré, pas
 * supposé » au-dessus d'une fuite vivante. Ce qu'on écrit ici se relit comme
 * instruit — donc on n'y écrit que ce dont la question est FERMÉE.
 */
/**
 * Les exclusions DÉLIBÉRÉES — clé `fichier#indice-de-requête`, jamais un
 * numéro de ligne, qui dériverait à la première édition et transformerait le
 * cliquet en bruit (règle du balayage des schémas de réponse).
 */
export const DELIBERATELY_WIDE: Readonly<Record<string, string>> = {
  'socketio/handlers/StatusHandler.ts#0':
    "`_getBlockedSocketIdsInRoom` rend les sockets à EXCLURE d'une diffusion de frappe : " +
    'resserrer réduirait la liste de refus. Et le même relevé décide `typerIsRegistered`, ' +
    "donc laquelle des deux lois s'applique — un frappeur actif-et-banni y basculerait de " +
    'la loi des cercles vers la règle de blocage seule, strictement plus faible.',
  'socketio/conversationAudienceRooms.ts#1':
    "`scanActiveParticipants` sert les listes de REFUS, qui se construisent sur le " +
    "sur-ensemble : resserrer ici retirerait un membre banni de l'exclusion, donc lui " +
    'servirait le contenu par la file hors ligne. Son unique consommateur est ' +
    "`translationReaders.excludedQueueKeys` (#20050) ; l'audience du même appel, elle, " +
    "passe par `scanLiveParticipants`, qui ÉPELLE la loi. L'entrée vivait sur " +
    '`translationReaders.ts#1` jusqu\'à ce que la lecture manuscrite y soit remplacée par ' +
    'cet appel — une DÉCISION déménage avec le site qu\'elle motive, elle ne disparaît pas.',
  'services/calls/callRingPolicy.ts#0':
    '`callRingPolicy` relève les membres d\'un tête-à-tête pour en DÉDUIRE le destinataire à tester, et ' +
    'REFUSER l\'appel quand il n\'accepte pas les inconnus (`CALLEE_REFUSES_NON_CONTACTS`). Un pair que le ' +
    'relevé rate est une préférence qu\'on n\'interroge pas, donc une sonnerie qui passe : le sur-ensemble ' +
    'est le seul sens fail-closed.',
  'services/conversations/newMemberAdmission.ts#0':
    'L\'admission relit les membres pour REFUSER le retour d\'un ancien dans un tête-à-tête chiffré — une ' +
    'paire doit rester à deux. Resserrer rendrait un banni-mais-actif invisible au compte, donc ' +
    'admettrait un troisième appareil dans une session Signal à deux. Le refus se construit sur le ' +
    'sur-ensemble, et le bannissement n\'est pas une place libérée pour cette question-là.',
  'services/conversations/obsoleteCapability.ts#0':
    '`NOT_YET_ACCEPTED`, et non `isActive` : ce relevé nomme les participations EN ATTENTE qui REFUSENT ' +
    'la capacité « rendre obsolète » (`sendsPendingRequest`), et plus de lignes ⇒ plus de refus. ' +
    "L'entrée affirmait d'abord qu'il « cherche ce que la participation vivante EXCLUT » : l'audit " +
    'adversarial l\'a mesuré FAUX — `NOT_YET_ACCEPTED` est ORTHOGONAL à `isActive`/`bannedAt` (une ' +
    'demande en attente vit sur une ligne ACTIVE). La décision était juste et sa raison fausse ; ' +
    "c'est le fail-closed du refus qui la porte, pas une orthogonalité inventée.",
  'services/conversations/obsoleteCapability.ts#1':
    'Le `groupBy` jumeau du précédent, visible du cliquet depuis #20091 seulement (il ne lisait pas ' +
    '`groupBy`). Il alimente `activeParticipants <= 2`, du même verdict autoriser/refuser et du même ' +
    'côté : un membre de trop fait REFUSER, un membre manquant ferait autoriser. Sur-ensemble délibéré, ' +
    'pour la raison de son #0.',
  'services/message-translation/ArrivalHistoryBackfill.ts#0':
    'Le rattrapage prend le plancher d\'historique le PLUS RÉCENT de tous les participants pour ne PAS ' +
    'traduire puis pousser à la room un message qu\'un membre n\'a pas le droit de lire. Un participant ' +
    'oublié du relevé est un plancher qu\'on n\'applique pas, donc de l\'historique servi à qui ne l\'a ' +
    'jamais eu : ici encore, le sur-ensemble est la garde.',
  'services/e2ee/E2EEEnvelopeRelay.ts#0':
    "`directoryOf` est l'annuaire des appareils qui REÇOIVENT l'enveloppe chiffrée — une AUDIENCE, " +
    "donc la loi étroite en principe. #20091 l'a resserrée, et l'audit adversarial du lot l'a fait " +
    'ANNULER sur une mesure : les trois lectures qui servent la liste de membres au client, et ' +
    '`mayReadKeysOf` qui autorise la lecture des clés, sont TOUTES en `isActive` nu. Resserrer ici ' +
    'fait donc DIVERGER les deux côtés d\'une égalité EXACTE (`compareDeviceSets`), soit un ' +
    '`409 DEVICES_MISMATCH` sur CHAQUE envoi — et le chiffrement de bout en bout étant réservé aux ' +
    'PAIRES, le banni-mais-actif y est le SEUL pair : la panne frappe le membre légitime, ' +
    'définitivement, dans une conversation que rien ne ramène en clair (#12949). Raison complète sur ' +
    'le site, avec son lot de convergence : #20093.',
  'services/e2ee/E2EESignalRelay.ts#0':
    "`assertNotBlocked` relève mes PAIRS d'une conversation directe pour REFUSER l'envoi si l'un " +
    "d'eux m'a bloqué : c'est une liste de REFUS, et resserrer la retirerait un pair banni-mais-actif " +
    'des verdicts de blocage interrogés — donc ferait PASSER un envoi que le blocage doit arrêter. ' +
    "Un blocage survit au bannissement : il lie deux COMPTES, pas deux appartenances. Le site était " +
    'juste par accident avant #20091 ; il est désormais juste par décision.',
  'routes/conversations/messages-send.ts#0':
    "Le gate de BLOCAGE d'un tête-à-tête : la liste sert à interroger les verdicts de blocage des " +
    "pairs, pour REFUSER l'envoi. Resserrer retirerait un pair banni-mais-actif des verdicts " +
    "interrogés, donc ferait PASSER un envoi que le blocage doit arrêter — un blocage lie deux " +
    'COMPTES, pas deux appartenances (même raison que `E2EESignalRelay.ts#0`). **L\'ADMISSION de ' +
    "cette même route, elle, est un défaut OUVERT** : elle n'appelle pas `canAccessConversation` et " +
    'admet sur `isActive` nu (I5 de #20091, suivi #20093). Deux lectures, deux sens : ne pas ' +
    "confondre l'entrée de ce refus avec le laissez-passer qu'il faut fermer.",
  'socketio/handlers/MessageHandler.ts#1':
    '`_isDirectMessageBlocked` est le JUMEAU socket du précédent, au mot près, et prend la même ' +
    'réponse pour la même raison. Les deux transports du même geste portent la même décision — un ' +
    "commentaire ne documente que l'exemplaire qu'il touche (cycle 85).",
  'services/conversations/announceStartedGroup.ts#0':
    "DEUX questions dans une requête, et le dépôt n'offre pas de second chemin pour la première : le " +
    "créateur ne se reconnaît qu'au `role` de sa LIGNE de participation (`Conversation` ne porte " +
    "aucune colonne d'auteur, mesuré sur `schema.prisma`). Resserrer le `where` ferait disparaître un " +
    'créateur banni-mais-actif du relevé, `creator` serait introuvable et PLUS AUCUN invité légitime ' +
    "ne serait annoncé. L'AUDIENCE est donc resserrée un cran plus bas, en code " +
    '(`participationEstVivante` sur `invitees`, #20100), et les deux colonnes de la loi sont ' +
    'PROJETÉES pour cela — un `where` n\'est pas une projection.',
  'services/calls/callGroupConversation.ts#0':
    "La liste alimente une ÉGALITÉ EXACTE (`sameSet(activeKeys(row), target)`) qui reconnaît le groupe " +
    "déjà porteur d'un appel. Resserrer ferait DIVERGER les deux côtés de la comparaison : le groupe " +
    "ne serait plus reconnu, et un second appel s'ouvrirait sur la même conversation. Même forme que " +
    "l'annuaire d'appareils E2EE (`E2EEEnvelopeRelay.ts#0`) : devant une liste qui alimente une " +
    'comparaison exacte, la question n\'est pas « est-elle trop large ? » mais « que fait le site ' +
    "d'en face quand elle ne correspond pas, et qui paie ? ».",
  'routes/conversation-encryption.ts#0':
    "La lecture UNIQUE des trois routes de régime porte TROIS questions : une PORTE (`memberOf`), un " +
    'REFUS par égalité exacte (`pairOfMembers` — un tête-à-tête chiffré reste à DEUX, #16188) et une ' +
    'AUDIENCE (`participantUserRooms(conversation.participants)`, qui diffuse ' +
    '`conversation:encryption-changed`). Resserrer servirait la troisième et casserait la deuxième — ' +
    "sur le chemin que rien ne ramène en clair (#12949). C'est la famille de convergence #20093, et " +
    "elle se tranche là, pas ici.",
  'routes/conversations/shared-translations.ts#0':
    "`blockSeparatesFromDirectPeer` pose la MÊME question côté lecture d'historique, et prend la même " +
    'réponse : le sur-ensemble, parce qu\'un pair oublié du relevé est un blocage qu\'on n\'interroge ' +
    "pas, donc un historique servi à quelqu'un qui l'a coupé. Fail-closed, ici, c'est la liste la plus " +
    'LARGE — et son `take: DIRECT_CONVERSATION_MEMBERS_MAX` la borne déjà.',
};

/**
 * MESURÉ, PAS ENCORE INSTRUIT — et ce n'est PAS `DELIBERATELY_WIDE` (#20091).
 *
 * Les deux inventaires portent la même forme et deux phrases opposées, et les
 * confondre est précisément ce qui transforme une dette en autorisation :
 *
 * | inventaire | la phrase | ce qu'il faut pour y entrer |
 * |---|---|---|
 * | `DELIBERATELY_WIDE` | « ce site DOIT être large » | la raison, instruite, écrite sur place |
 * | `MEASURED_NOT_INSTRUCTED` | « on ne sait pas encore ce que ce site décide » | sa famille, et une issue |
 *
 * Ces sites sont entrés dans la portée du balayage le jour où elle est passée
 * de `src/socketio/` à `src/` : ils n'ont pas été écrits en violation d'un
 * cliquet, ils étaient simplement hors de sa vue. Les geler avec leur raison
 * est la seule manœuvre honnête — vider l'inventaire en les reclassant tous en
 * « décision » le rendrait vert en affirmant autant de fois ce que personne n'a
 * instruit. Leur NOMBRE est tenu par un témoin, pas par cette phrase.
 *
 * **La question à poser à chaque ligne est celle du doc-comment en tête de ce
 * fichier** : cette liste décide-t-elle qui REÇOIT (audience ⇒ loi étroite),
 * qui ne doit RIEN recevoir (exclusion ⇒ sur-ensemble délibéré), ou ne sert-elle
 * qu'à COMPTER (mesure ⇒ dire ce que le nombre alimente) ? Une ligne sort de cet
 * inventaire quand sa réponse est écrite sur le site, jamais quand elle est
 * devinée ici.
 */
/**
 * Les FAMILLES de l'inventaire mesuré, et ce que chacune retient. Une famille,
 * pas une ligne : ces sites se décident ENSEMBLE ou pas du tout, et quarante
 * raisons écrites une à une seraient quarante affirmations que personne n'a
 * instruites (#20091).
 */
export const MEASURED_FAMILIES: Readonly<Record<string, string>> = {
  'effectif-et-depart':
    'AUDIENCE, et elle part avec le lot EFFECTIF de #20051. Ces sites diffusent un départ, un ' +
    'bannissement, une levée ou une arrivée NOMINATIFS plus l\'effectif, et #20051 les fait tous passer ' +
    'par `scanLiveParticipants` — qui ÉPELLE la loi : ils en sortiront par CONSTRUCTION, pas par un ' +
    'correctif de clause. Les resserrer ici doublerait ce lot et le ferait entrer en conflit de chemin ' +
    'avec lui (règle d\'asymétrie #5243). Ce qu\'un banni-mais-actif reçoit aujourd\'hui : l\'identité de ' +
    'chaque partant, banni, débanni ou arrivant, et le nombre de membres.',
  'audience-a-instruire':
    'AUDIENCE, un lot par site parce que chacune sert autre chose — et cette énumération est OUVERTE : ' +
    "l'audit de #20100 a mesuré qu'elle se lisait comme exhaustive alors que le lot y avait ajouté des " +
    "entrées sans les instruire. S'y ajoutent `share-link-mint` (une notification système portant le " +
    'TITRE de la conversation et le nom du lien, vers les admins et le créateur), ' +
    "`unrespondedParticipants` (qui n'a pas répondu à un appel), et les DEUX lectures de " +
    "`conversation-partners` — dont le doc-comment dit lui-même qu'elles servent à « fan out " +
    'user-level realtime events (e.g. `USER_UPDATED`) » : une audience de DIFFUSION, que ce lot avait ' +
    "d'abord rangée parmi les aperçus affichés, et qui invoque en plus la directive de présence du " +
    '2026-08-25. `callEndedFanout` fait taire une ' +
    'sonnerie (un banni apprend qu\'un appel a eu lieu) ; `AtlasService` tamponne une langue « reçue » ' +
    'dans le jeu (progression indue, aucun contenu) ; `membershipAdmissionFanOut` sert `participantIds` ' +
    'au SEUL arrivant — un annuaire affiché, qui basculerait en audience si un client s\'en servait pour ' +
    'adresser des clés ; `communitySalonAdoption` est DÉJÀ conforme, mais en CODE ' +
    '(`participationEstVivante` après lecture) et non dans son `where` — donc invisible au cliquet, et ' +
    'c\'est la ligne qu\'il faut aligner, pas la règle.',
  'mesure-effectif-servi':
    'MESURE — un effectif ou une liste AFFICHÉS, pas une audience. Un banni-mais-actif y gonfle un nombre servi aux ' +
    'clients (fiche de lien, carte de conversation, feuille des participants, salon World Wide, ' +
    'statistiques). Ce n\'est pas une livraison, c\'est un nombre FAUX, et la question à instruire est ' +
    'celle de #20051 : que vaut un effectif quand la lecture qui le produit n\'est pas la liste des ' +
    'membres ? `fanout/member-joined.ts#0` est le plus mal cadré du dépôt — son `where` ne porte AUCUNE ' +
    'clause d\'activité : il compte les partis, les retirés et les bannis.',
  'mesure-denominateur-destructif':
    'MESURE, et c\'est la famille dont le sur-ensemble échoue OUVERT : ces nombres sont des ' +
    'DÉNOMINATEURS qui déclenchent une destruction ou un verdict « tous ». Un banni-mais-actif ne verra ' +
    'jamais le message, donc `readByAllAt` ne se pose JAMAIS, la vue unique n\'est JAMAIS « entièrement ' +
    'consommée » et la destruction de l\'éphémère n\'est JAMAIS programmée — de la rétention qui ne ' +
    's\'éteint pas, et un expéditeur à qui on montre un `notSeenBy` qui ne se videra pas. À instruire ' +
    'comme une règle de rétention, pas comme une clause.',
  'mesure-jeu-et-priorite':
    'MESURE — taille de conversation gravée en palier, clé d\'idempotence d\'un signal de jeu, « créateur ' +
    '» d\'un classement, nombre de destinataires mineurs qui fait monter la priorité d\'un signalement. ' +
    'Aucune livraison, et l\'écart qu\'un banni-mais-actif produit est un palier, une clé ou une priorité ' +
    'légèrement faux. À instruire avec les règles du Jeu et de la modération, dont les seuils sont des ' +
    'décisions produit — pas au fil d\'un lot de clause.',
  'refus-dont-une-frontiere-echoue-ouvert':
    "`GameAbuseGuard.shapeOf` a TROIS branches et DEUX frontières, et l'inventaire des décisions n'en " +
    'avait raisonné QU\'UNE. À la frontière 1↔2 le sur-ensemble échoue FERMÉ (un membre de plus fait ' +
    "passer `self` à `pair`, donc soumet au plafond d'entre-soi). À la frontière 2↔3 il S'INVERSE : " +
    '`group` ne passe NI par `accountsAllowed` (blocage, nouveau venu non prouvé) NI par le plafond ' +
    "d'entre-soi, si bien qu'un banni-mais-actif de trop transforme `quarter` en `full` et `none` en " +
    '`full` — il CRÉDITE les deux abus que la garde existe pour refuser. Mesuré par l\'audit ' +
    'adversarial sur la vraie classe. Le fichier se déclare lui-même fail-OUVERT, ce que l\'entrée de ' +
    "décision contredisait mot pour mot. Ce n'est donc pas une décision mais une dette, et son lot " +
    "devra nommer la frontière qu'il tranche. Suivi : #20091.",
  'apercu-de-membres-servi':
    'MESURE — un APERÇU de membres servi dans une charge utile de conversation, et le gros de ce que ' +
    "la forme imbriquée a fait entrer dans le relevé (#20100) : la fiche admin, " +
    "l'aperçu de nom, la liste souveraine, la fiche d'un compte, les conversations d'une communauté, " +
    "le détail et la ligne de liste, la recherche, l'export RGPD, la feuille de préférences, le " +
    "fragment `_count` partagé, les pairs d'un historique d'appels et les partenaires de " +
    "conversation. Aucune livraison de contenu : un banni-mais-actif y gonfle un nombre ou occupe une " +
    'ligne AFFICHÉE. **Et c\'est pire qu\'un nombre faux quand la projection est CAPÉE** — `take: 5`, ' +
    "`take: 6`, `take: 100` : un banni prend la place d'un membre légitime dans l'aperçu, qui montre " +
    "alors quelqu'un qui n'est plus là en cachant quelqu'un qui l'est. À instruire avec #20051 (que " +
    "vaut un effectif quand la lecture qui le produit n'est pas la liste des membres ?), pas au fil " +
    "d'un lot de clause.",
  'audience-de-publication-a-instruire':
    "AUDIENCE, et d'un autre domaine : `feedContacts` et `viewerAudience` composent l'ensemble des " +
    '« contacts » du ' +
    "lecteur — les autres membres de ses tête-à-tête — qui décide QUI PEUT LIRE une publication " +
    "d'audience restreinte (`buildPostVisibilityOrFilter`, `recordView`). Un banni-mais-actif d'un " +
    'tête-à-tête y reste un contact, donc lit les posts réservés aux contacts. Ce n\'est pas la même ' +
    "question que l'audience d'un message — elle se tranche avec les cercles de proximité et la " +
    "visibilité des publications, dont les seuils sont des décisions produit.",
  'porte-sur-un-sur-ensemble':
    "PORTE, et c'est un défaut OUVERT, pas une mesure : `POST /conversations/:id/invite` résout " +
    "l'INVITEUR depuis cette liste nue (`participants.find(m => m.userId === inviterId)`), si bien " +
    "qu'un membre actif-et-banni fait entrer qui il veut dans une conversation dont il est exclu — et " +
    '« inviter » écrit ici un `Participant` immédiatement ACTIF. Le `where` ne se resserre PAS : la ' +
    'même lecture tient `newMemberRefusal`, un refus par égalité exacte (un tête-à-tête chiffré reste ' +
    "à DEUX, #16188). Le correctif est celui d'`announceStartedGroup` — la loi jugée en code sur la " +
    'PORTE seule. Suivi : #20104.',
  'unicite-d-un-nom':
    "MESURE, et la seule que `findFirst` a fait entrer dans le relevé (#20100) : le tirage d'un nom " +
    "d'affichage anonyme interroge si un candidat est déjà PRIS dans la conversation. Un " +
    'banni-mais-actif qui garde son nom fait retirer un candidat du tirage — un nom de moins, jamais ' +
    'une fuite. Le sur-ensemble y échoue du bon côté : deux anonymes homonymes dans un même fil ' +
    "seraient indistinguables à l'écran.",
  'ni-audience-ni-refus':
    'Les sites que la taxonomie du balayage ne range PAS, et le dire vaut mieux que les forcer : ' +
    '`callConversationRebranch` est une table de jointure qui REPOINTE des lignes d\'appel ; ' +
    '`orphanedSalonLinks` rend un verdict d\'AUTORITÉ (un salon a-t-il encore un gouvernant ?) où le ' +
    'sur-ensemble échoue OUVERT — un créateur banni passe pour gouvernant et son lien de partage reste ' +
    "ouvert ; `creatorSuccession` pose la MÊME question dans l'autre sens et échoue du même côté — un " +
    'banni-mais-actif y est ÉLIGIBLE à la succession, donc peut être ÉLU créateur de la conversation ' +
    "dont il est exclu (trouvé par le discriminant corrigé de #20100, qui ne prend plus `{ not: … }` " +
    'pour la désignation d\'une personne) ; `ConversationLanguages` fabrique des traductions pour une langue de trop (du coût, pas une ' +
    'fuite) ; `messageMentions` est un RÉSOLVEUR de `@Nom d\'affichage` dont l\'autorisation vit en AVAL ' +
    '(`validateMentionPermissions`, qui épelle la loi) — mesuré non-fuite, donc un piège armé, pas un ' +
    'défaut.',
};

/** Chaque site mesuré, et sa famille. Suivi : #20091. */
export const MEASURED_NOT_INSTRUCTED: Readonly<Record<string, string>> = {
  'routes/admin/conversation-settings-sovereign.ts#0': 'effectif-et-depart',
  'routes/conversations/leave.ts#0': 'effectif-et-depart',
  'routes/conversations/memberArrivalFanOut.ts#0': 'effectif-et-depart',
  'routes/conversations/participant-ban-core.ts#0': 'effectif-et-depart',
  'routes/conversations/participant-ban-core.ts#1': 'effectif-et-depart',
  'routes/conversations/participant-removal.ts#0': 'effectif-et-depart',
  'services/conversations/communitySalonExit.ts#0': 'effectif-et-depart',
  'utils/callEndedFanout.ts#0': 'audience-a-instruire',
  'services/game/AtlasService.ts#0': 'audience-a-instruire',
  'routes/conversations/membershipAdmissionFanOut.ts#0': 'audience-a-instruire',
  'services/conversations/communitySalonAdoption.ts#0': 'audience-a-instruire',
  'routes/anonymous.ts#0': 'mesure-effectif-servi',
  'routes/anonymous.ts#1': 'mesure-effectif-servi',
  'routes/anonymous.ts#2': 'mesure-effectif-servi',
  'routes/links/utils/prisma-queries.ts#0': 'mesure-effectif-servi',
  'routes/links/utils/prisma-queries.ts#1': 'mesure-effectif-servi',
  'routes/links/utils/prisma-queries.ts#2': 'mesure-effectif-servi',
  'routes/links/utils/prisma-queries.ts#3': 'mesure-effectif-servi',
  'routes/links/utils/prisma-queries.ts#4': 'mesure-effectif-servi',
  'routes/conversations/participants-reads.ts#0': 'mesure-effectif-servi',
  'routes/conversations/participants-reads.ts#1': 'mesure-effectif-servi',
  'services/conversationCard.ts#0': 'mesure-effectif-servi',
  'services/conversationCard.ts#1': 'mesure-effectif-servi',
  'services/world/worldConversation.ts#0': 'mesure-effectif-servi',
  'services/ConversationStatsService.ts#0': 'mesure-effectif-servi',
  'services/conversations/ensureGlobalConversationMembership.ts#0': 'mesure-effectif-servi',
  'services/notifications/fanout/member-joined.ts#0': 'mesure-effectif-servi',
  'services/MessageReadStatusService.ts#0': 'mesure-denominateur-destructif',
  'services/MessageReadStatusService.ts#1': 'mesure-denominateur-destructif',
  'services/messaging/viewOnceAudience.ts#0': 'mesure-denominateur-destructif',
  'services/messaging/consumeAfterReadMessages.ts#0': 'mesure-denominateur-destructif',
  'services/achievements/CerclesAchievements.ts#0': 'mesure-jeu-et-priorite',
  'services/game/MessageGameSignals.ts#0': 'mesure-jeu-et-priorite',
  'services/game/MessageGameSignals.ts#1': 'mesure-jeu-et-priorite',
  'routes/admin/system-rankings.ts#0': 'mesure-jeu-et-priorite',
  'services/reports/reportPriority.ts#0': 'mesure-jeu-et-priorite',
  'services/game/GameAbuseGuard.ts#0': 'refus-dont-une-frontiere-echoue-ouvert',
  'services/calls/callConversationRebranch.ts#0': 'ni-audience-ni-refus',
  'services/conversations/orphanedSalonLinks.ts#0': 'ni-audience-ni-refus',
  'services/message-translation/ConversationLanguages.ts#0': 'ni-audience-ni-refus',
  'services/messaging/messageMentions.ts#0': 'ni-audience-ni-refus',
  'services/world/worldSeedOperations.ts#0': 'ni-audience-ni-refus',
  // #20100 — ce que la forme IMBRIQUÉE, `findFirst` et le filtre NÉGATIF ont
  // fait entrer dans le relevé. Aucun n'a été écrit en violation d'un cliquet :
  // ils étaient hors de sa vue, comme les cinquante de #20091.
  'routes/admin/conversation-fiche.ts#0': 'apercu-de-membres-servi',
  'routes/admin/conversation-name-preview.ts#0': 'apercu-de-membres-servi',
  'routes/admin/conversations-sovereign.ts#0': 'apercu-de-membres-servi',
  'routes/admin/users.ts#0': 'apercu-de-membres-servi',
  'routes/communities/core.ts#0': 'apercu-de-membres-servi',
  'routes/communities/core.ts#1': 'apercu-de-membres-servi',
  'routes/conversations/core-selects.ts#0': 'apercu-de-membres-servi',
  'routes/conversations/core-selects.ts#1': 'apercu-de-membres-servi',
  'routes/conversations/search.ts#0': 'apercu-de-membres-servi',
  'routes/conversations/search.ts#1': 'apercu-de-membres-servi',
  'routes/conversations/utils/active-member-count.ts#0': 'apercu-de-membres-servi',
  'routes/me/export.ts#0': 'apercu-de-membres-servi',
  'routes/users/preferences.ts#0': 'apercu-de-membres-servi',
  'services/search/globalMessageSearch.ts#0': 'apercu-de-membres-servi',
  'services/calls/callHistoryList.ts#0': 'apercu-de-membres-servi',
  'services/calls/callHistorySearch.ts#0': 'apercu-de-membres-servi',
  'utils/conversation-partners.ts#0': 'audience-a-instruire',
  'utils/conversation-partners.ts#1': 'audience-a-instruire',
  'services/posts/feedContacts.ts#0': 'audience-de-publication-a-instruire',
  'services/posts/viewerAudience.ts#0': 'audience-de-publication-a-instruire',
  'routes/conversations/sharing-invite.ts#0': 'porte-sur-un-sur-ensemble',
  'services/conversations/anonymousUsername.ts#0': 'unicite-d-un-nom',
  'services/MessageMediaConsumptionService.ts#0': 'mesure-denominateur-destructif',
  'services/MessageReadStatusService.ts#2': 'mesure-denominateur-destructif',
  'services/messaging/messagePostSaveEffects.ts#0': 'mesure-jeu-et-priorite',
  'services/relations/messageInteractions.ts#0': 'mesure-jeu-et-priorite',
  'routes/conversations/participant-removal.ts#1': 'effectif-et-depart',
  'routes/links/utils/share-link-mint.ts#0': 'audience-a-instruire',
  'services/calls/unrespondedParticipants.ts#0': 'audience-a-instruire',
  // Les quatre que le discriminant CORRIGÉ de #20100 a fait entrer : il prenait
  // `{ notIn: … }`, `{ gt: … }` et `NOT: { userId }` pour la désignation d'une
  // personne, donc faisait disparaître ces audiences SANS TRACE.
  'routes/conversations/participants-presence.ts#0': 'apercu-de-membres-servi',
  'services/messaging/messageStars/StarredMessagesReader.ts#0': 'apercu-de-membres-servi',
  'services/conversations/memberAdmission.ts#0': 'effectif-et-depart',
  'services/conversations/creatorSuccession.ts#0': 'ni-audience-ni-refus',
};
