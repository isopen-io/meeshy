import * as fs from 'fs';
import * as path from 'path';

/**
 * Les AUDIENCES de diffusion d'une conversation lisent-elles l'appartenance
 * VIVANTE, ou `isActive` NU ? (#16690)
 *
 * Toute PORTE D'ACCÈS du dépôt exige `PARTICIPATION_VIVANTE` — `isActive: true`
 * **et** `bannedAt` nul ou absent : la jonction aux rooms
 * (`AuthHandler`), le refus de jonction (`ConversationHandler`), le contrôle
 * d'accès REST (`access-control`), l'admission des lecteurs de fichier
 * (`fileReaderAdmission`). Les DIFFUSEURS, eux, se construisaient sur
 * `isActive: true` nu — si bien que la porte et la diffusion n'avaient pas la
 * même définition de « membre ».
 *
 * Une ligne `isActive: true, bannedAt ≠ null` existe en base : bannir pendant
 * qu'une ligne est inactive n'écrit que `bannedAt`
 * (`conversationBanState.ts`), et `restore-for-me` rallumait `isActive`
 * avant #10436. Le dépôt NOMME cette conséquence
 * (`routes/user-deletions.ts`) : « rendait la ligne active ET bannie, lue comme
 * vivante par toute lecture `userId + isActive: true` ». Le producteur est
 * fermé ; aucune migration n'a reprise les lignes existantes.
 *
 * Une telle ligne n'est PAS dans `conversation:<id>`, mais sa room `user:<id>`
 * est rejointe INCONDITIONNELLEMENT (`AuthHandler.ts:392`) — c'est par là que
 * les accusés, la pastille et le rejeu hors ligne l'atteignaient.
 *
 * ## LA DISTINCTION QUI DÉCIDE DU SENS DU CORRECTIF
 *
 * Elle est la raison d'être de ce balayage, et l'ignorer OUVRE une fuite au
 * lieu d'en fermer une :
 *
 * | l'ensemble répond à | l'appliquer veut dire | la loi |
 * |---|---|---|
 * | **qui REÇOIT** (audience) | servir | la plus ÉTROITE — `PARTICIPATION_VIVANTE` |
 * | **qui ne doit RIEN recevoir** (exclusion) | taire | la plus LARGE — `isActive` nu |
 *
 * `translationReaders` porte les DEUX dans un seul `Promise.all` : la lecture
 * lawful (`scanLiveParticipants`) construit `rooms` (qui reçoit la traduction),
 * la lecture NUE (`scanActiveParticipants`, bornée depuis #20050) construit
 * `excludedQueueKeys` (qui ne doit rien recevoir, pas même en file). Resserrer
 * la seconde retirerait le membre banni de la liste d'EXCLUSION — il
 * recevrait donc la traduction par la file hors ligne. **Une liste de refus se
 * construit sur le sur-ensemble ; c'est le seul sens où elle échoue fermée.**
 *
 * D'où un inventaire de refus qui n'est pas une dette : c'est une DÉCISION,
 * et chaque entrée porte sa raison.
 */

/**
 * Les façons d'ÉPELER la loi dans un `where`.
 *
 * `ADMITTED_FILE_READER_WHERE` y figure parce qu'il EST
 * `PARTICIPATION_VIVANTE` — une seule définition, un nom qui dit l'usage — et
 * **le balayage ne lui fait confiance que parce qu'un second témoin prouve
 * l'identité** (`fileReaderAdmission` § « l'alias est la loi »). Sans cette
 * preuve, accepter un second nom serait exactement la jumelle que ce cliquet
 * existe pour empêcher.
 */
const LAW_SPELLINGS = ['PARTICIPATION_VIVANTE', 'ADMITTED_FILE_READER_WHERE'] as const;

/**
 * Ce `where` ÉPELLE-t-il la loi ?
 *
 * Par une des constantes ci-dessus — ou **à la main**, ce que le doc-comment du
 * balayage de bornes (`live-audience-bound-sweep.ts`) annonçait comme sa
 * quatrième forme sans que personne la mesure : `isActive: true` SUIVI de la
 * garde de bannissement, qu'elle s'écrive `unsetOrNull('bannedAt')` ou en
 * clair. `captureNoticeVisibility.ts` est ce cas, et le compter parmi les
 * audiences nues aurait envoyé réparer un site conforme — **un cliquet qui
 * sur-signale coûte une relecture ; un cliquet qui se trompe sur un site juste
 * coûte sa crédibilité, et avec elle les constats voisins.**
 *
 * La garde de bannissement, et RIEN d'autre, fait la différence : `isActive`
 * seul n'est pas la loi, c'est son sur-ensemble.
 */
function spellsTheLaw(where: string): boolean {
  if (LAW_SPELLINGS.some((spelling) => where.includes(spelling))) return true;
  if (!/isActive:\s*true/.test(where)) return false;
  // La POLARITÉ, jamais le MOT. Le premier jet rendait `true` sur
  // `/bannedAt/` nu — l'audit adversarial a mesuré le faux VERT qu'il
  // autorisait : `{ conversationId, isActive: true, bannedAt: { not: null } }`,
  // soit une audience composée EXCLUSIVEMENT de bannis, était déclarée
  // conforme à la loi qui existe pour les exclure. Un cliquet qui se trompe
  // dans le sens rassurant est pire que pas de cliquet.
  return /unsetOrNull\(\s*['"`]bannedAt['"`]\s*\)/.test(where)
    || /bannedAt:\s*null/.test(where)
    || /bannedAt:\s*\{\s*isSet:\s*false\s*\}/.test(where);
}

/** Une audience relevée par le balayage. */
export type AudienceSite = {
  readonly file: string;
  readonly line: number;
  /** Le `where` tel qu'il est écrit, commentaires dépouillés et espaces réduits. */
  readonly where: string;
  readonly usesLaw: boolean;
};

/**
 * Une lecture de `Participant` que le balayage n'a pas pu JUGER, et pourquoi.
 *
 * ── POURQUOI LA PUBLIER AU LIEU DE LA SAUTER (#20091) ────────────────────────
 *
 * Le discriminant est TEXTUEL : il lit le littéral du `where`. Quand ce `where`
 * est une VARIABLE (`where: others`), un APPEL (`where: presenceSnapshotContactsWhere(…)`)
 * ou un TERNAIRE, il n'y a pas de littéral à lire — et l'ancien balayage
 * passait au suivant sans rien dire.
 *
 * > **« Zéro trouvé » et « zéro existe » ne sont pas la même affirmation.** Un
 * > balayage qui écarte ce qu'il ne sait pas résoudre doit PUBLIER ce qu'il
 * > écarte, et quelqu'un doit l'ouvrir — sans quoi le chiffre qu'il publie se
 * > lit comme une propriété du dépôt alors qu'il n'est qu'une propriété de
 * > l'instrument (cycle 164, leçon 261).
 *
 * Ce n'est pas théorique : `ensureGlobalConversationMembership` servait
 * l'arrivée dans le salon GLOBAL depuis un `where: others` — une variable —
 * donc sur `isActive` NU, invisible aux deux balayages du dépôt. Il a été
 * trouvé en comptant ce que l'instrument ne savait pas juger, pas en cherchant
 * un défaut.
 */
export type UnjudgeableRead = {
  readonly file: string;
  readonly line: number;
  readonly method: string;
  /**
   * Ce qui tient la place du littéral : `variable`, `appel`, `ternaire`,
   * `absent`, ou `portée-indirecte` — un `where` littéral dont le
   * `conversationId` vient d'un spread, donc dont on ne sait pas dire s'il
   * désigne une conversation.
   */
  readonly form: string;
};

/**
 * LA PORTÉE DU BALAYAGE — `src/` ENTIER, et c'est #20091.
 *
 * Elle valait `path.resolve(__dirname, '..')`, soit `src/socketio/`. Le cliquet
 * était vert, et affirmait d'un dépôt ce qu'il mesurait d'un répertoire.
 *
 * **Les comptes vivent dans un TÉMOIN, pas ici** (`audience-law-scope.test.ts`,
 * § « la distribution mesurée »). Le premier jet de ce lot les avait écrits en
 * prose — « 51 au dehors, dont 50 nues » — et l'audit adversarial a mesuré
 * qu'ils ne correspondaient plus : le lot avait ÉLARGI le discriminant dans le
 * même mouvement, si bien que le chiffre d'avant et le chiffre d'après ne
 * comptent pas la même chose. Un compte est une AFFIRMATION (cycle 93) ; écrit
 * dans un commentaire il ne peut pas rougir, et il dérive au premier
 * élargissement de l'instrument qui le produit.
 *
 * > Une énumération porte DEUX affirmations (leçon 261) : « ces sites
 * > respectent la règle » — vérifiable, et vérifiée — et « ce sont les sites
 * > où la règle s'applique », qui ne l'était pas. Ici la seconde n'était même
 * > pas une liste : c'était un CHEMIN, donc une affirmation qu'on ne relit
 * > jamais, puisqu'elle ne ressemble pas à un inventaire. Une audience de
 * > diffusion ne vit pas dans un répertoire — elle vit partout où quelque
 * > chose part vers des membres : `routes/`, `services/`, `utils/` autant que
 * > `socketio/`.
 *
 * Conséquence de forme : les clés d'inventaire portent désormais leur chemin
 * depuis `src/` (`socketio/handlers/StatusHandler.ts#0`, et non
 * `handlers/StatusHandler.ts#0`). Une clé qui ne désigne plus rien fait
 * tomber le témoin « ne garde aucun refus périmé » — c'est voulu : un refus
 * qui ne désigne plus de site autorise en silence le site futur qui
 * reprendrait sa clé.
 */
const AUDIENCE_ROOT = path.resolve(__dirname, '..', '..');

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
  'services/messaging/messageMentions.ts#1':
    "`notifyNewlyMentioned` (chemin d'ÉDITION) ne tire de cette liste que des EXCLUSIONS — " +
    '`pendingRequestUserIds` et `departedAccountUserIds` — appliquées à `newlyMentionedUserIds`, un ' +
    'ensemble DÉJÀ borné par la loi en amont : `MentionService.validateMentionPermissions` épelle ' +
    '`PARTICIPATION_VIVANTE` depuis #14066. Resserrer ici ne retirerait donc personne de ' +
    "l'admission (il n'y a aucun banni à en retirer) et rétrécirait un refus : le mauvais sens, " +
    'pour rien. Mesuré, pas supposé — la jumelle de cette lecture dans ' +
    "`messageNotificationFanOut` a été RESSERRÉE par #20100, parce que l'admission en sort.",
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
    'AUDIENCE, et elle part avec le lot EFFECTIF de #20051. Ces sept sites diffusent un départ, un ' +
    'bannissement, une levée ou une arrivée NOMINATIFS plus l\'effectif, et #20051 les fait tous passer ' +
    'par `scanLiveParticipants` — qui ÉPELLE la loi : ils en sortiront par CONSTRUCTION, pas par un ' +
    'correctif de clause. Les resserrer ici doublerait ce lot et le ferait entrer en conflit de chemin ' +
    'avec lui (règle d\'asymétrie #5243). Ce qu\'un banni-mais-actif reçoit aujourd\'hui : l\'identité de ' +
    'chaque partant, banni, débanni ou arrivant, et le nombre de membres.',
  'audience-a-instruire':
    'AUDIENCE, un lot par site parce que chacune sert autre chose. `callEndedFanout` fait taire une ' +
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
    'MESURE, et c\'est la famille dont le sur-ensemble échoue OUVERT : ces quatre nombres sont des ' +
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
    "la forme imbriquée a fait entrer dans le relevé (#20100). Dix-huit projections : la fiche admin, " +
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
    "AUDIENCE, et d'un autre domaine : ces deux lectures composent l'ensemble des « contacts » du " +
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
    'Les quatre sites que la taxonomie du balayage ne range PAS, et le dire vaut mieux que les forcer : ' +
    '`callConversationRebranch` est une table de jointure qui REPOINTE des lignes d\'appel ; ' +
    '`orphanedSalonLinks` rend un verdict d\'AUTORITÉ (un salon a-t-il encore un gouvernant ?) où le ' +
    'sur-ensemble échoue OUVERT — un créateur banni passe pour gouvernant et son lien de partage reste ' +
    'ouvert ; `ConversationLanguages` fabrique des traductions pour une langue de trop (du coût, pas une ' +
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
  'utils/conversation-partners.ts#0': 'apercu-de-membres-servi',
  'utils/conversation-partners.ts#1': 'apercu-de-membres-servi',
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
};

/**
 * Dépouille les commentaires en PRÉSERVANT le compte de lignes : un numéro de
 * ligne calculé sur une source raccourcie désigne la mauvaise ligne, et un
 * cliquet qui pointe à côté se lit comme un cliquet qui se trompe.
 */
function stripComments(source: string): string {
  const keepLines = (block: string): string => '\n'.repeat((block.match(/\n/g) ?? []).length);
  return source
    .replace(/\/\*[\s\S]*?\*\//g, keepLines)
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * Ce `where` DÉSIGNE-t-il un membre en particulier ?
 *
 * Si oui, c'est une PORTE (« ce lecteur-ci appartient-il ? »), pas une
 * audience : elle relève d'`access-control` et de ses propres gardes, et la
 * faire entrer ici mesurerait la popularité d'un motif au lieu d'une propriété
 * (cycle 107, balayage JETÉ plutôt que gelé).
 *
 * **`userId: { not: null }` ne désigne PERSONNE**, et c'est la correction qui
 * compte : c'est un filtre de NULLITÉ — « garder les membres qui ont un
 * compte » — sur une audience de tout le salon. Le premier discriminant, un
 * `\buserId\b` nu, écartait ainsi en silence trois audiences réelles (frappe,
 * appel manqué, pont d'agent). Un balayage qui OMET est plus coûteux qu'un
 * balayage qui sur-signale : seul le premier est silencieux.
 */
function namesAParticularMember(where: string): boolean {
  const binding = /(?:^|[,{]\s*)(?:userId|id)\s*(?::\s*([^,]*))?/g;
  let match: RegExpExecArray | null;
  while ((match = binding.exec(where)) !== null) {
    const value = (match[1] ?? '').trim();
    // Raccourci (`userId,`) ⇒ la variable homonyme NOMME une personne.
    if (value === '') return true;
    // Un filtre NÉGATIF ne nomme personne ; tout le reste (variable, littéral,
    // `{ in: [...] }`) sélectionne des personnes précises. Le premier
    // discriminant n'admettait que `{ not: null }` — la NULLITÉ — et écartait
    // ainsi en silence onze audiences réelles dont la clause dit « tous les
    // membres SAUF moi » (`userId: { not: userId }`) : la liste des pairs d'un
    // tête-à-tête, l'audience d'une story, les partenaires de conversation.
    // **Aucune forme de `{ not: … }` ne SÉLECTIONNE quelqu'un** ; les ranger
    // avec les clés est l'erreur qui omet, donc la silencieuse.
    if (!/^\{\s*not:\s*[^}]*\}$/.test(value)) return true;
  }
  return false;
}

/**
 * Cette clause imbriquée parle-t-elle de PARTICIPATION — donc le relevé sait-il
 * même de quel MODÈLE elle vient ?
 *
 * Le schéma ne porte que DEUX relations nommées `participants` :
 * `Conversation.participants: Participant[]` et
 * `CallSession.participants: CallParticipant[]`. La seconde n'a **ni
 * `isActive` ni `bannedAt`** — c'est la mesure, pas une impression, et
 * `audience-law-nested-scope.test.ts` § « le modèle » la relit dans
 * `schema.prisma` pour que l'ajout d'une colonne ou d'une troisième relation
 * rougisse ici.
 *
 * Une clause qui ne nomme aucune des deux colonnes ne peut donc pas être
 * rattachée à un modèle par le texte, et le premier jet de ce lot l'a payé : il
 * rangeait les deux lectures de `CallCleanupService`
 * (`{ OR: [{ leftAt: null }, { leftAt: { isSet: false } }] }`, des participants
 * d'APPEL) parmi les audiences NUES d'une conversation. Le signal était faux et
 * il envoyait réparer une clause qui n'a rien à voir avec le bannissement.
 *
 * > **Un balayage qui change de forme d'appel change aussi de PREUVE DE
 * > MODÈLE.** La forme appelée la portait gratuitement — `participant.findMany`
 * > NOMME la table. La forme imbriquée ne nomme qu'une RELATION, et deux
 * > modèles la partagent.
 *
 * La garde ne s'applique pas à la forme APPELÉE : `participant.<méthode>` dit
 * la table, et un `where` qui ne porte aucune clause d'activité y est une
 * audience réellement NON BORNÉE — plus large qu'`isActive` nu, donc à voir.
 */
function speaksOfParticipation(where: string): boolean {
  // Une épellation de la loi compte comme une colonne : `PARTICIPATION_VIVANTE`
  // est typée `Prisma.ParticipantWhereInput`, donc elle ne se compile que sur la
  // bonne relation — alors qu'elle ne NOMME aucune colonne dans le texte. Le
  // premier jet l'oubliait, et c'est le pire défaut que ce lot pouvait avoir :
  // il publiait en « modèle indécidable » l'audience qu'il venait de
  // RESSERRER, si bien que l'inventaire se rééquilibrait et que tout paraissait
  // vert — **un site corrigé disparaissait du relevé au lieu d'y passer au
  // VERT**. Un cliquet qui se trompe dans le sens rassurant est pire que pas de
  // cliquet (#20091).
  if (LAW_SPELLINGS.some((spelling) => where.includes(spelling))) return true;
  return /\bisActive\b/.test(where) || /\bbannedAt\b/.test(where);
}

/**
 * Ce `where` tient-il sa clause d'un APPEL étalé, que le balayage ne sait pas
 * lire ?
 *
 * `{ conversationId, ...callerParticipantWhere(caller) }` a toute l'apparence
 * d'une audience — portée écrite, aucune identité visible — et c'en est le
 * CONTRAIRE : l'appel porte la clé du membre. Le discriminant d'identité est
 * TEXTUEL ; devant un appel il ne peut rien conclure, et conclure quand même
 * rendait un verdict d'AUDIENCE sur une PORTE (`messagePinAdmission`,
 * `call-participants`).
 *
 * > C'est le constat I2 de #20091 vu par son autre bout : le lot y avait publié
 * > la portée indirecte (`{ ...SCOPE, isActive: true }`) et laissé la CLÉ
 * > indirecte se faire juger. Les deux formes ont la même cause — un étalement
 * > illisible — et seule la seconde produit un faux verdict plutôt qu'un
 * > silence.
 *
 * **Un APPEL, jamais un identifiant**, et ce n'est pas une commodité : nommer
 * un membre en particulier exige une valeur d'EXÉCUTION, qu'une constante de
 * module ne peut pas porter. `...NOT_YET_ACCEPTED` et `[...narrowing]` restent
 * donc jugés — le premier jet publiait les deux formes, et il a fallu mesurer
 * ce qu'il faisait disparaître : **trois décisions déjà instruites**, reclassées
 * en « je ne sais pas » par le lot même qui prétend mieux voir.
 */
function keyedByAnUnreadableCall(where: string): boolean {
  const calls = where.match(/\.{3}\s*([A-Za-z_$][\w$.]*)\s*\(/g) ?? [];
  return calls.some((spread) => {
    const name = (spread.match(/[A-Za-z_$][\w$.]*/) ?? [''])[0];
    return !NEGATIVE_WHERE_HELPERS.includes(name);
  });
}

/**
 * Les fabriques de clause du dépôt qui ne peuvent PAS nommer un membre, parce
 * qu'elles ne produisent qu'un refus : `unsetOrNull(f)` rend
 * `{ OR: [{ f: null }, { f: { isSet: false } }] }`, `differsOrUnset(f, v)` rend
 * `{ OR: [{ NOT: { f: v } }, { f: { isSet: false } }] }`
 * (`utils/prisma-unset.ts`).
 *
 * C'est la MÊME règle que celle du `{ not: … }` ci-dessus, prise un niveau
 * d'écriture plus haut : **aucune forme négative ne SÉLECTIONNE quelqu'un**, et
 * `differsOrUnset('userId', arrival.userId)` — « tout le monde SAUF l'arrivant »
 * — est une audience, pas une porte. La ranger avec les clés aurait reclassé
 * l'éventail d'arrivée de #20051 en « je ne sais pas », perdant une famille
 * déjà instruite.
 */
const NEGATIVE_WHERE_HELPERS = ['unsetOrNull', 'differsOrUnset'] as const satisfies readonly string[];

/**
 * Le corps d'un bloc, accolades INCLUSES, depuis son accolade ouvrante — ce que
 * `callArguments` fait pour un appel, sans la parenthèse à franchir.
 */
function balancedBlock(source: string, openIndex: number): string | null {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, i + 1);
    }
  }
  return null;
}

/**
 * Le corps du `where`, accolades ÉQUILIBRÉES.
 *
 * Un `[^}]*` s'arrête à la PREMIÈRE accolade fermante — donc à l'intérieur du
 * premier objet imbriqué (`conversationId: { in: [...] }`), et tout ce qui
 * suit dans le `where` devient invisible. Le cliquet a d'abord signalé ainsi
 * un site parfaitement conforme ; il aurait TU, de la même façon, un site nu
 * dont le `where` porte un objet imbriqué avant `isActive`. **Un balayage qui
 * tronque se trompe dans les deux sens, et seul le sens rassurant est
 * silencieux.**
 */
function balancedObjectBody(source: string, openIndex: number): string | null {
  let depth = 1;
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, i).split(/\s+/).join(' ').trim();
    }
  }
  return null;
}

/**
 * Relève les `participant.findMany`/`count` dont le `where` porte
 * `conversationId` SANS identité particulière — c'est-à-dire « tous les
 * membres de cette conversation », la forme d'une audience de diffusion.
 *
 * Une requête keyée sur `id:` ou `userId:` est une PORTE (« ce lecteur-ci
 * appartient-il ? »), pas une audience : elle relève d'`access-control` et de
 * ses propres gardes, et la faire entrer ici mesurerait la popularité d'un
 * motif au lieu d'une propriété (cycle 107, balayage JETÉ).
 */
/**
 * Le bloc d'ARGUMENTS d'un appel, accolades équilibrées — depuis l'accolade
 * ouvrante qui suit la parenthèse.
 */
function callArguments(source: string, parenIndex: number): string | null {
  const open = source.indexOf('{', parenIndex);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

/** Ce qui tient la place du littéral, quand `where:` n'ouvre pas d'accolade. */
function unreadableForm(afterWhere: string): string {
  const head = afterWhere.trimStart();
  if (head.startsWith('{')) return '';
  if (/^[A-Za-z_$][\w$.]*\s*\(/.test(head)) return 'appel';
  if (/^[A-Za-z_$][\w$.]*\s*[?]/.test(head)) return 'ternaire';
  if (/^[A-Za-z_$][\w$.]*/.test(head)) return 'variable';
  return 'ternaire';
}

/**
 * Un `where` qui est une VARIABLE, résolu si le fichier la DÉCLARE lui-même.
 *
 * C'est l'élargissement qu'a exigé le premier correctif de #20091 :
 * `ensureGlobalConversationMembership` sert l'arrivée dans le salon GLOBAL
 * depuis `where: others`, et sa clause a été resserrée **sans qu'aucun cliquet
 * puisse le garder** — mesuré, pas supposé : la mutation inverse laissait le
 * témoin VERT. Un correctif sans témoin est un correctif qui se perdra.
 *
 * La résolution est volontairement ÉTROITE — un `const` du MÊME fichier, jamais
 * un import, un paramètre ni un appel : le balayage doit rester capable de dire
 * « je n'ai pas pu juger » (`UnjudgeableRead`), et une résolution qui devine
 * fabriquerait des verdicts au lieu d'en publier l'absence. Même discipline que
 * `response-payload-mismatch`, qui résout la variable que le gestionnaire
 * compose sous ses propres yeux et se tait sur tout le reste.
 */
function resolveLocalWhere(source: string, name: string): string | null {
  // `$` est un métacaractère : un identifiant qui en porte un composerait une
  // expression régulière qui ne cherche pas ce qu'on croit.
  const escaped = name.replace(/[$]/g, '\\$&');
  const declaration = new RegExp(`\\bconst\\s+${escaped}\\s*(?::[^=]*)?=\\s*\\{`, 'g');
  const first = declaration.exec(source);
  if (first === null) return null;
  // HOMONYME ⇒ on ne résout PAS. Deux fonctions du même fichier peuvent
  // déclarer `const others = { … }` ; prendre la PREMIÈRE déclarerait conforme
  // un site qui ne l'est pas, et ce faux VERT est le seul verdict que ce
  // balayage n'a pas le droit de rendre. Un site non résolu se publie comme
  // illisible — « je n'ai pas conclu » est une réponse, « il est conforme »
  // n'en est pas une quand on a deviné.
  if (declaration.exec(source) !== null) return null;
  return balancedObjectBody(source, first.index + first[0].length);
}

/**
 * Les lectures de `Participant` que le balayage a vues passer sans pouvoir les
 * juger — `where` non littéral, ou absent. Voir `UnjudgeableRead`.
 */
export function sweepUnjudgeableParticipantReads(): UnjudgeableRead[] {
  return walkParticipantReads().unjudgeable;
}

/**
 * Relève les `participant.findMany|count|groupBy|aggregate` dont le `where`
 * porte `conversationId` SANS identité particulière — c'est-à-dire « tous les
 * membres de cette conversation », la forme d'une audience de diffusion.
 *
 * Une requête keyée sur `id:` ou `userId:` est une PORTE (« ce lecteur-ci
 * appartient-il ? »), pas une audience : elle relève d'`access-control` et de
 * ses propres gardes, et la faire entrer ici mesurerait la popularité d'un
 * motif au lieu d'une propriété (cycle 107, balayage JETÉ).
 *
 * **`groupBy` et `aggregate` sont dans le relevé depuis #20091**, et le `where`
 * n'a plus à être la PREMIÈRE clé de l'appel. L'ancien discriminant exigeait
 * `findMany(\{ where: \{` d'affilée : **28 des 215 lectures de `Participant` du
 * dépôt lui échappaient par la seule forme de leur appel**, dont deux dans son
 * propre répertoire. Un `select` écrit avant le `where` suffisait à sortir une
 * audience du cliquet, et rien ne le disait.
 */
export function sweepConversationAudiences(): AudienceSite[] {
  return walkParticipantReads().audiences;
}

function walkParticipantReads(): { audiences: AudienceSite[]; unjudgeable: UnjudgeableRead[] } {
  const audiences: AudienceSite[] = [];
  const unjudgeable: UnjudgeableRead[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
      const src = stripComments(fs.readFileSync(full, 'utf8'));
      const file = path.relative(AUDIENCE_ROOT, full);
      const lineOf = (index: number): number => src.slice(0, index).split('\n').length;
      let match: RegExpExecArray | null;

      const called = /participant\.(findMany|count|groupBy|aggregate|findFirst)\(/g;
      while ((match = called.exec(src)) !== null) {
        const line = lineOf(match.index);
        const method = match[1];
        const args = callArguments(src, match.index + match[0].length - 1);
        const at = args === null ? -1 : args.indexOf('where:');
        if (args === null || at < 0) {
          unjudgeable.push({ file, line, method, form: 'absent' });
          continue;
        }
        const after = args.slice(at + 'where:'.length);
        const form = unreadableForm(after);
        // Une VARIABLE déclarée dans le même fichier se résout ; tout le reste
        // se PUBLIE comme illisible.
        const local = form === 'variable' ? resolveLocalWhere(src, (after.trimStart().match(/^[A-Za-z_$][\w$]*/) ?? [''])[0]) : null;
        if (form !== '' && local === null) {
          unjudgeable.push({ file, line, method, form });
          continue;
        }
        const where = local ?? balancedObjectBody(args, args.indexOf('{', at) + 1);
        if (where === null) {
          unjudgeable.push({ file, line, method, form: 'absent' });
          continue;
        }
        judge({ file, line, method, where, scopeIsWritten: true }, audiences, unjudgeable);
      }

      // L'AUTRE forme d'audience : la PROJECTION imbriquée (#20100).
      const projected = /\bparticipants:\s*\{/g;
      while ((match = projected.exec(src)) !== null) {
        const block = balancedBlock(src, match.index + match[0].length - 1);
        if (block === null) continue;
        const at = block.indexOf('where:');
        // Un bloc SANS `where:` n'est pas de ce relevé, et pour deux raisons
        // distinctes qu'il ne faut pas confondre : ou c'est un FILTRE de
        // conversation (`{ some: … }`, `{ every: … }`), qui ne nomme aucune
        // audience, ou c'est une projection NON BORNÉE — plus large encore
        // qu'`isActive` nu — qui se filtre souvent en CODE, ce qu'aucun
        // discriminant de `where` ne peut voir. La seconde est mesurée et
        // suivie chez elle (#20103) ; la deviner ici fabriquerait des verdicts.
        if (at < 0) continue;
        const line = lineOf(match.index);
        const form = unreadableForm(block.slice(at + 'where:'.length));
        if (form !== '') {
          unjudgeable.push({ file, line, method: 'participants-imbriqué', form });
          continue;
        }
        const where = balancedObjectBody(block, block.indexOf('{', at) + 1);
        if (where === null) {
          unjudgeable.push({ file, line, method: 'participants-imbriqué', form: 'absent' });
          continue;
        }
        if (!speaksOfParticipation(where)) {
          unjudgeable.push({ file, line, method: 'participants-imbriqué', form: 'modèle-indécidable' });
          continue;
        }
        judge({ file, line, method: 'participants-imbriqué', where, scopeIsWritten: false }, audiences, unjudgeable);
      }
    }
  };
  walk(AUDIENCE_ROOT);
  // Le rang d'inventaire d'un site est son rang dans son FICHIER, et les deux
  // relevés ne balaient pas la même passe : sans ce tri, la clé d'un site
  // dépendrait de l'ORDRE DES SCANNERS plutôt que de la source. Il est sans
  // effet sur les clés d'avant #20100, que la passe unique rendait déjà dans
  // l'ordre des lignes.
  const byLine = (a: { file: string; line: number }, b: { file: string; line: number }): number =>
    a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file);
  audiences.sort(byLine);
  unjudgeable.sort(byLine);
  return { audiences, unjudgeable };
}

/**
 * Le verdict sur un `where` LITTÉRAL, partagé par les deux formes d'audience.
 *
 * `scopeIsWritten` est la seule chose qui les distingue, et ce n'est pas un
 * détail d'implémentation. Une audience IMBRIQUÉE tient sa portée du `where` de
 * son PARENT :
 *
 * ```ts
 * conversation.findUnique({ where: { id: conversationId }, select: { participants: { where: … } } })
 * ```
 *
 * Exiger d'elle un `conversationId` textuel la rejetait TOUTE — c'est le
 * constat I2 de #20091, et la raison pour laquelle trente-trois audiences, dont
 * l'éventail de notifications push, vivaient hors de tout relevé du dépôt.
 */
function judge(
  read: { file: string; line: number; method: string; where: string; scopeIsWritten: boolean },
  audiences: AudienceSite[],
  unjudgeable: UnjudgeableRead[]
): void {
  const { file, line, method, where, scopeIsWritten } = read;
  if (scopeIsWritten && !where.includes('conversationId')) {
    // #20091, constat de l'audit : un `where` LITTÉRAL dont la portée vient
    // d'un spread (`{ ...SCOPE, isActive: true }`) n'a pas de `conversationId`
    // textuel. L'écarter en SILENCE est exactement le défaut que ce lot
    // corrige ailleurs — il se publie donc.
    if (/\.{3}[A-Za-z_$]/.test(where)) unjudgeable.push({ file, line, method, form: 'portée-indirecte' });
    return;
  }
  // La LOI D'ABORD. Un `where` qui l'épelle est conforme, qu'il désigne un
  // membre ou toute une audience — se taire sur lui perdrait un VERT sans rien
  // rendre de plus sûr, et c'est ce que faisait le premier jet de ce lot sur
  // `scanLiveParticipants`, la lecture d'audience la plus utilisée du dépôt
  // (son `[...narrowing]` suffisait à la rendre illisible).
  if (spellsTheLaw(where)) {
    audiences.push({ file, line, where, usesLaw: true });
    return;
  }
  if (namesAParticularMember(where)) return;
  // La CLÉ peut venir d'un appel étalé, comme la PORTÉE — et là, se taire est
  // le seul verdict honnête (#20100).
  if (keyedByAnUnreadableCall(where)) {
    unjudgeable.push({ file, line, method, form: 'clé-indirecte' });
    return;
  }
  audiences.push({ file, line, where, usesLaw: false });
}

/** La clé d'inventaire d'un site : fichier + rang de la requête dans ce fichier. */
export function audienceKey(sites: readonly AudienceSite[], site: AudienceSite): string {
  const sameFile = sites.filter((s) => s.file === site.file);
  return `${site.file}#${sameFile.indexOf(site)}`;
}
