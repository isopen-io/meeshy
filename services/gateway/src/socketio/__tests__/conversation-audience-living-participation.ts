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
  return /isActive:\s*true/.test(where) && /bannedAt/.test(where);
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
  /** Ce qui tient la place du littéral : `variable`, `appel`, `ternaire`, `absent`. */
  readonly form: string;
};

/**
 * LA PORTÉE DU BALAYAGE — `src/` ENTIER, et c'est #20091.
 *
 * Elle valait `path.resolve(__dirname, '..')`, soit `src/socketio/`. Mesuré en
 * faisant tourner CE classifieur sur `src/` : 15 audiences dans `socketio/`
 * (13 épellent la loi, 2 déclarées larges) et **51 au dehors, dont 50 nues**.
 * Le cliquet était vert, et affirmait d'un dépôt ce qu'il mesurait d'un
 * répertoire.
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
    'la capacité « rendre obsolète » (`sendsPendingRequest`). Il est large par nature — il cherche ' +
    'précisément ce que la participation vivante EXCLUT — et resserrer le priverait de son objet. Borné ' +
    'par les conversations directes du lecteur.',
  'services/conversations/obsoleteCapability.ts#1':
    'Le `groupBy` jumeau du précédent, visible du cliquet depuis #20091 seulement (il ne lisait pas ' +
    '`groupBy`). Il alimente `activeParticipants <= 2`, du même verdict autoriser/refuser et du même ' +
    'côté : un membre de trop fait REFUSER, un membre manquant ferait autoriser. Sur-ensemble délibéré, ' +
    'pour la raison de son #0.',
  'services/game/GameAbuseGuard.ts#0':
    'La garde d\'abus lit la FORME de la conversation (`self` / `pair` / `group`, `take: 3`) pour REFUSER ' +
    'le crédit de jeu — entre-soi, nouveau venu non prouvé, blocage. Un membre que le relevé rate fait ' +
    'passer une conversation de `pair` à `self`, donc fait CRÉDITER ce qu\'il faut refuser. Le ' +
    'sur-ensemble échoue fermé.',
  'services/message-translation/ArrivalHistoryBackfill.ts#0':
    'Le rattrapage prend le plancher d\'historique le PLUS RÉCENT de tous les participants pour ne PAS ' +
    'traduire puis pousser à la room un message qu\'un membre n\'a pas le droit de lire. Un participant ' +
    'oublié du relevé est un plancher qu\'on n\'applique pas, donc de l\'historique servi à qui ne l\'a ' +
    'jamais eu : ici encore, le sur-ensemble est la garde.',
  'services/e2ee/E2EESignalRelay.ts#0':
    "`assertNotBlocked` relève mes PAIRS d'une conversation directe pour REFUSER l'envoi si l'un " +
    "d'eux m'a bloqué : c'est une liste de REFUS, et resserrer la retirerait un pair banni-mais-actif " +
    'des verdicts de blocage interrogés — donc ferait PASSER un envoi que le blocage doit arrêter. ' +
    "Un blocage survit au bannissement : il lie deux COMPTES, pas deux appartenances. Le site était " +
    'juste par accident avant #20091 ; il est désormais juste par décision.',
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
 * Ces 48 sites sont entrés dans la portée du balayage le jour où elle est
 * passée de `src/socketio/` à `src/` : ils n'ont pas été écrits en violation
 * d'un cliquet, ils étaient simplement hors de sa vue. Les geler avec leur
 * raison est la seule manœuvre honnête — vider l'inventaire en reclassant
 * 48 sites en « décision » le rendrait vert en affirmant 48 fois ce que
 * personne n'a instruit.
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
  'services/calls/callConversationRebranch.ts#0': 'ni-audience-ni-refus',
  'services/conversations/orphanedSalonLinks.ts#0': 'ni-audience-ni-refus',
  'services/message-translation/ConversationLanguages.ts#0': 'ni-audience-ni-refus',
  'services/messaging/messageMentions.ts#0': 'ni-audience-ni-refus',
  'services/world/worldSeedOperations.ts#0': 'ni-audience-ni-refus',
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
    // Un filtre de nullité ne nomme personne ; tout le reste (variable,
    // littéral, `{ in: [...] }`) sélectionne des personnes précises.
    if (!/^\{\s*not:\s*null\s*\}$/.test(value)) return true;
  }
  return false;
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
  const declaration = new RegExp(`\\bconst\\s+${name}\\s*(?::[^=]*)?=\\s*\\{`).exec(source);
  if (declaration === null) return null;
  return balancedObjectBody(source, declaration.index + declaration[0].length);
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
      const re = /participant\.(findMany|count|groupBy|aggregate)\(/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(src)) !== null) {
        const file = path.relative(AUDIENCE_ROOT, full);
        const line = src.slice(0, match.index).split('\n').length;
        const args = callArguments(src, match.index + match[0].length - 1);
        const at = args === null ? -1 : args.indexOf('where:');
        if (args === null || at < 0) {
          unjudgeable.push({ file, line, method: match[1], form: 'absent' });
          continue;
        }
        const after = args.slice(at + 'where:'.length);
        const form = unreadableForm(after);
        // Une VARIABLE déclarée dans le même fichier se résout ; tout le reste
        // se PUBLIE comme illisible.
        const local = form === 'variable' ? resolveLocalWhere(src, (after.trimStart().match(/^[A-Za-z_$][\w$]*/) ?? [''])[0]) : null;
        if (form !== '' && local === null) {
          unjudgeable.push({ file, line, method: match[1], form });
          continue;
        }
        const where = local ?? balancedObjectBody(args, args.indexOf('{', at) + 1);
        if (where === null) {
          unjudgeable.push({ file, line, method: match[1], form: 'absent' });
          continue;
        }
        if (!where.includes('conversationId')) continue;
        if (namesAParticularMember(where)) continue;
        audiences.push({ file, line, where, usesLaw: spellsTheLaw(where) });
      }
    }
  };
  walk(AUDIENCE_ROOT);
  return { audiences, unjudgeable };
}

/** La clé d'inventaire d'un site : fichier + rang de la requête dans ce fichier. */
export function audienceKey(sites: readonly AudienceSite[], site: AudienceSite): string {
  const sameFile = sites.filter((s) => s.file === site.file);
  return `${site.file}#${sameFile.indexOf(site)}`;
}
