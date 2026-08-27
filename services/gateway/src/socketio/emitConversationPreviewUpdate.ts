import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { sharedPlaceFromMetadata } from '../services/location/sharedPlace';
import { participantUserRoomTargets } from './emitToConversationParticipants';
import {
  PREVIEW_PRISM_PARTICIPANT_SELECT,
  resolveLastMessagePreviewPrism,
  toIsoOrNull,
} from './utils/lastMessagePreviewPrism';
import { resolvePersonalPreviewOverrides } from './utils/personalPreviewOverride';
import { HISTORY_FLOOR_PARTICIPANT_SELECT, loadHistoryFloorsForOrFail } from '../services/historyFloor';
import type { ServerEmitIO } from './serverEmit';

/**
 * Minimal Socket.IO surface used by this helper. Kept structural so the
 * function is trivially unit-testable and accepts both the production
 * `Server` and the REST-side `socketIOManager.getIO()` shape.
 *
 * Alias de `ServerEmitIO` depuis le cycle 104 : la forme est inchangée, le
 * couple `(événement, charge)` est désormais celui de `ServerToClientEvents`.
 * Le nom survit parce que sept fichiers l'importent — voir `serverEmit.ts`.
 */
export type PreviewEmitIO = ServerEmitIO;

/**
 * Exporté pour que les relais qui ne font que TRANSMETTRE ce prisma
 * (`broadcastMessageMutation`) le dérivent au lieu d'en redéclarer un `Pick`
 * jumeau — c'est cette duplication qui laissait la liste des modèles diverger
 * d'un côté sans que l'autre l'apprenne.
 */
export type PreviewPrisma = Pick<
  PrismaClient,
  'participant' | 'message' | 'userMessageDeletion' | 'userConversationPreferences' | 'conversationShareLink'
>;

/**
 * La projection de l'aperçu, partagée par le dernier message GLOBAL et par le
 * remplaçant que se voit servir un lecteur qui a masqué ce dernier — deux
 * requêtes qui doivent rendre la même forme, sans quoi le payload d'un lecteur
 * masquant perdrait des champs que celui de son voisin porte.
 *
 * Lot 3 : sans `metadata`, un dernier message géolocalisé n'affiche jamais sa
 * position dans ce fanout temps réel de l'aperçu.
 * `translations` / `originalLanguage` : le Prisme de la ligne de liste.
 */
const PREVIEW_MESSAGE_SELECT = {
  id: true,
  content: true,
  senderId: true,
  createdAt: true,
  metadata: true,
  translations: true,
  originalLanguage: true,
} as const;

/**
 * La projection du participant, seul site du dépôt qui compose DEUX SSOT dont
 * chacune déclare son propre `user`.
 *
 * `id` n'est pas de la décoration : il NOMME la room personnelle d'un
 * participant sans ligne `User`. Ne sélectionner que `userId` n'ignorait pas
 * l'identité de repli, il ne la lisait jamais. `user` porte les préférences de
 * langue du lecteur — sans elles il n'y a pas de Prisme à résoudre — et son
 * rôle PLATEFORME, qui décide du PLANCHER d'historique (#3892) : le dernier
 * message global peut précéder l'arrivée de l'un d'eux.
 *
 * **`user` est réécrit à la MAIN, et c'est un piège armé.** Un spread naïf
 * (`{...A, ...B}`) ferait gagner le `user` de `HISTORY_FLOOR_PARTICIPANT_SELECT`
 * (`{ role }` seul) au prix des préférences de langue du Prisme. La fusion
 * explicite corrige cela — mais elle FIGE la liste : un champ ajouté demain à
 * l'un ou l'autre `select.user` n'arrivera pas ici, silencieusement, et
 * `tsc` ne verra que la moitié Prisme (`PreviewPrismParticipant` l'exige ;
 * `HistoryFloorJoin.user` est OPTIONNEL, donc sa perte ne compile pas moins
 * bien). C'est exactement le défaut que #3892 a trouvé sur ce site.
 *
 * D'où l'extraction : la constante est EXPORTÉE pour qu'un témoin puisse la
 * comparer champ par champ aux deux SSOT — même cliquet que
 * `shareLinkIncludeStructure` (`routes/links/utils/prisma-queries.ts`), l'autre
 * site qui redéclare son `user`, et le seul des deux que #3892 ait gardé.
 */
export const PREVIEW_PARTICIPANT_SELECT = {
  ...PREVIEW_PRISM_PARTICIPANT_SELECT,
  ...HISTORY_FLOOR_PARTICIPANT_SELECT,
  user: {
    select: {
      systemLanguage: true,
      regionalLanguage: true,
      customDestinationLanguage: true,
      deviceLocale: true,
      role: true,
    },
  },
} as const;

/** Ce qu'un dernier message — global ou propre à un lecteur — met sur le fil. */
type PreviewMessage = {
  id: string;
  content: string | null;
  senderId: string;
  createdAt: Date;
  metadata?: unknown;
  translations?: unknown;
  originalLanguage?: string | null;
};

/**
 * Restreint le fan-out d'un appelant qui ne parle PAS au nom d'une mutation du
 * contenu.
 *
 * Une édition ou une suppression change l'aperçu pour tout le monde : ces
 * appelants ne passent rien et gardent la diffusion complète. Une TRADUCTION qui
 * atterrit est l'autre cas — elle ne change la ligne que pour les lecteurs de
 * cette langue-là, et seulement tant que le message traduit est encore le
 * dernier. Sans ces deux bornes, chaque traduction re-diffuserait la ligne
 * entière à tous les participants, une fois par langue de la conversation, sur
 * le chemin le plus chaud du service.
 */
export interface PreviewUpdateScope {
  /**
   * Abandonne tout le fan-out si le dernier message recalculé n'est pas
   * celui-ci. Un message plus récent est arrivé entre-temps : son propre chemin
   * d'envoi a déjà servi l'aperçu, et celui qu'on tenait est devenu hors sujet.
   */
  readonly onlyIfLatestIs?: string;
  /**
   * N'émet qu'aux destinataires dont la carte résolue porte cette langue.
   * Comparaison insensible à la casse, comme partout ailleurs dans le Prisme.
   *
   * Le test porte sur la carte SORTIE (`lastMessageTranslations`), pas sur les
   * préférences en entrée : c'est elle qui décide, et elle applique déjà les
   * quatre exclusions de `buildLastMessagePreviewTranslations` (hors prisme,
   * langue d'origine, traduction chiffrée, texte inexploitable). Un lecteur dont
   * la carte ne bouge pas recevrait un payload identique à l'octet près.
   */
  readonly onlyIfPreviewCarriesLanguage?: string;
  /**
   * N'émet qu'à CE lecteur, et ne sonde le masquage personnel que pour lui.
   *
   * Les deux bornes ci-dessus tiennent l'INSTANT et la LANGUE ; celle-ci tient
   * l'AUDIENCE, pour la famille d'appelants dont le geste ne change la ligne de
   * liste que de son auteur : un masquage PERSONNEL (« supprimer pour moi »,
   * « effacer l'historique »). Le dernier message GLOBAL n'a pas bougé, donc
   * tous les autres participants recevraient un payload identique à l'octet
   * près — un événement chacun, par geste.
   *
   * Sélectionne par `Participant.userId`, donc un lecteur INSCRIT : les quatre
   * routes de masquage personnel sont montées `allowAnonymous: false`, et les
   * deux tables de masquage sont elles-mêmes scopées `userId`. Un participant
   * sans compte ne peut ni écrire dans l'une ni figurer ici.
   */
  readonly onlyForReaderUserId?: string;
}

/**
 * Fan a `conversation:updated` preview refresh to every active
 * participant's personal user room after a message edit or delete.
 *
 * `MESSAGE_EDITED` / `MESSAGE_DELETED` are emitted only to the
 * conversation room. A participant sitting on the conversation-list
 * screen has joined `user:<id>` but has left `conversation:<id>`, so it
 * never learns that the last-message preview changed — its list row keeps
 * rendering the pre-edit text or the deleted message indefinitely (until a
 * manual reopen triggers a stale-while-revalidate refetch).
 *
 * `broadcastNewMessage` already fans `CONVERSATION_UPDATED` to user rooms
 * on send for exactly this reason; this mirrors it for edit/delete so the
 * three transports (WS + the two REST edit/delete routes) cannot drift.
 *
 * The current latest non-deleted message is recomputed here so the payload
 * is always self-consistent: editing or deleting a NON-latest message emits
 * the unchanged preview, which is an idempotent no-op on clients.
 *
 * Ce dernier message est GLOBAL, et il n'est pas celui de tout le monde :
 * `deletedAt` ne porte que le « supprimer pour tous ». Le masquage PERSONNEL
 * (`UserMessageDeletion`, `UserConversationPreferences.clearHistoryBefore`) vit
 * dans deux tables qu'aucun `deletedAt` ne croise, si bien que ce fan-out
 * repoussait dans la ligne de liste d'un lecteur le message qu'il venait d'en
 * retirer — pendant que `GET /conversations` le lui masquait correctement
 * (`resolveVisibleLastMessages`). `resolvePersonalPreviewOverrides` rend son
 * propre dernier message visible à chaque lecteur concerné, et à eux seuls.
 *
 * Every active participant is reached, accountless ones included — see
 * `participantUserRooms`. This paragraph used to say the opposite ("anonymous
 * participants are skipped, exactly as the send path does"), and it was
 * accurate on both counts: the send path skipped them too. A shared-link guest
 * sitting on the conversation list therefore kept rendering the pre-edit text
 * of a message, or a deleted one, until a manual reopen.
 *
 * Chaque destinataire reçoit SON payload : l'aperçu porte la carte de
 * traductions filtrée à son propre Prisme (`resolveLastMessagePreviewPrism`).
 * Sans ces deux champs, une édition laissait la ligne de liste afficher le
 * texte D'AVANT — le client PRÉFÈRE la traduction hydratée par
 * `GET /conversations` à `lastMessagePreview`, et le serveur périme
 * `Message.translations` dans la même écriture que l'édition sans jamais le
 * dire sur le fil. Le message garde le même id : le client ne peut pas
 * l'inférer.
 *
 * Le troisième appelant n'est pas une mutation humaine : une TRADUCTION qui
 * atterrit (`message:translation`) change la ligne de liste sans changer une
 * ligne de la base côté message. Le serveur écrit `Message.translations`, diffuse
 * la traduction dans la room de CONVERSATION — et s'arrêtait là. Un lecteur sur
 * l'écran de liste garde donc l'aperçu dans la langue de l'expéditeur : au
 * moment de l'envoi la traduction n'existait pas encore, et rien ne repasse
 * ensuite. Le Prisme s'applique « à TOUT le contenu, previews comprises » ;
 * c'était la seule surface où il dépendait de l'ORDRE d'arrivée. Cet appelant
 * passe un `scope` (voir `PreviewUpdateScope`) parce qu'il ne concerne ni tous
 * les destinataires ni tous les instants — contrairement à l'édition.
 *
 * Best-effort side channel — never throws. A failure here must not fail the
 * edit/delete that already succeeded; the optional `onError` hook lets
 * callers log it against the originating request.
 */
export async function emitConversationPreviewUpdate(
  prisma: PreviewPrisma,
  io: PreviewEmitIO | null | undefined,
  conversationId: string,
  updatedByUserId: string,
  onError?: (error: unknown) => void,
  scope?: PreviewUpdateScope,
): Promise<void> {
  if (!io) return;
  try {
    const [participants, latest] = await Promise.all([
      prisma.participant.findMany({
        where: { conversationId, isActive: true },
        // `id` is not decoration: it NAMES the personal room of a participant
        // with no `User` row. Selecting `userId` alone did not ignore the
        // fallback identity, it never read it. `user` carries the reader's
        // language preferences — without them there is no Prisme to resolve.
        // Et ce qui décide du PLANCHER d'historique de chaque lecteur : le
        // dernier message global peut précéder l'arrivée de l'un d'eux.
        //
        select: PREVIEW_PARTICIPANT_SELECT,
      }),
      prisma.message.findFirst({
        where: { conversationId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: PREVIEW_MESSAGE_SELECT,
      }) as Promise<PreviewMessage | null>,
    ]);

    if (scope?.onlyIfLatestIs != null && latest?.id !== scope.onlyIfLatestIs) return;

    // La borne du LECTEUR se pose ICI, avant la sonde et avant la boucle, parce
    // qu'elle vaut pour les deux : demander à la base si CHAQUE participant a
    // masqué cet aperçu, alors qu'un seul vient de le faire et qu'on sait
    // lequel, coûterait la question la plus large pour la réponse la plus
    // étroite. Vide ⇒ le lecteur nommé n'est plus participant actif : rien à
    // sonder, rien à émettre.
    const targets =
      scope?.onlyForReaderUserId != null
        ? participants.filter((p) => p.userId === scope.onlyForReaderUserId)
        : participants;
    if (targets.length === 0) return;

    // Le dernier message GLOBAL n'est pas le dernier message de tout le monde :
    // `deletedAt` ne porte que le « supprimer pour tous », et le masquage
    // personnel vit dans deux autres tables. Sans cette carte, un lecteur qui
    // avait retiré ce message de sa propre vue se le voyait repousser dans sa
    // ligne de liste — voir `resolvePersonalPreviewOverrides`. Résolue APRÈS le
    // portillon `onlyIfLatestIs` : le chemin des traductions, le plus fréquenté
    // des trois, abandonne avant d'avoir rien sondé.
    //
    // Le plancher d'historique de chaque lecteur s'y ajoute : un participant
    // ajouté après coup, ou entré par un lien sans historique, ne doit pas voir
    // dans sa ligne de liste un message d'AVANT son arrivée. Lu ici, pas dans la
    // sonde : sa lecture est un contrôle d'accès, et son échec ne dégrade pas en
    // « on sert » comme le masquage personnel.
    //
    // Fail-closed PAR DESTINATAIRE, jamais en bloc : la lecture des liens
    // n'apprend rien sur un lecteur dont le plancher se rend sans elle (admin,
    // octroi par date, droit figé, aucune participation par lien). Abandonner
    // l'émission entière le privait d'un aperçu que la panne ne rendait pas
    // incertain — et lui SERVIR l'aperçu global sans son plancher aurait été
    // pire. Seul celui dont le LIEN décidait sort de l'émission.
    const { floors, unreadable } = await loadHistoryFloorsForOrFail(prisma, targets);
    const floorByParticipant = new Map(targets.map((p, index) => [p.id, floors[index]]));
    const served = targets.filter((_, index) => !unreadable.has(index));
    if (served.length === 0) return;

    const overrides = await resolvePersonalPreviewOverrides<PreviewMessage>(prisma, {
      conversationId,
      latest,
      readers: served.map((p) => ({
        participantId: p.id,
        userId: p.userId,
        historyFloor: floorByParticipant.get(p.id) ?? null,
      })),
      select: PREVIEW_MESSAGE_SELECT,
    });

    // La moitié du payload qui dépend du message, donc du LECTEUR dès qu'il en
    // a masqué un. `location` comprise : servir la position du message global à
    // qui ne le voit pas placerait une épingle sous un aperçu qui parle d'autre
    // chose. Un message géolocalisé sans légende a un `lastMessagePreview`
    // vide — hisser `location` ne fabrique aucun texte de repli côté serveur ;
    // le client décide comment rendre "" + location (ex. via messageType ou la
    // seule présence de `location`), pas ce helper.
    const messagePayloadFor = (message: PreviewMessage | null) => {
      const place = sharedPlaceFromMetadata(message?.metadata);
      return {
        // Chaîne ISO — voir `toIsoOrNull`. `null` reste une VALEUR ici : c'est
        // ainsi que ce chemin dit « ce lecteur n'a plus aucun message visible ».
        lastMessageAt: toIsoOrNull(message?.createdAt),
        lastMessageId: message?.id ?? null,
        // `lastMessagePreview` n'est PAS ici : il sort de
        // `resolveLastMessagePreviewPrism` avec le reste de la paire, plafonné
        // comme elle.
        senderId: message?.senderId ?? null,
        ...(place ? { location: place } : {}),
      };
    };

    const basePayload = {
      conversationId,
      // `updatedBy` is REQUIRED by ConversationUpdatedEventData — the User.id of
      // whoever triggered this edit/delete. Distinct from `senderId` (the
      // Participant.id of the current latest message's author): the actor and
      // the last-message author differ whenever a non-latest message is edited,
      // or the latest message is deleted leaving an earlier one on top. Mirrors
      // the send path in MeeshySocketIOManager, which always fills this field.
      updatedBy: { id: updatedByUserId },
      updatedAt: new Date().toISOString(),
      // Tout ce que CETTE unité émet est un recalcul depuis l'état courant de
      // la base — c'est sa définition même (`message.findFirst` juste au-dessus,
      // plus la sonde de masquage personnel). Un tel aperçu peut légitimement
      // RECULER dans le temps : supprimer le dernier message pour tous fait
      // redescendre la ligne sur le précédent, et un lecteur qui masque son
      // dernier message visible se voit servir un remplaçant plus ancien par
      // construction. La garde monotone des clients jette ce cas — elle ne peut
      // pas le distinguer d'une diffusion arrivée dans le désordre, qui recule
      // elle aussi. Ce drapeau est la seule chose qui les sépare, et seul
      // l'émetteur peut le dire.
      //
      // Les émetteurs message-driven (`MessageHandler`, `MeeshySocketIOManager`)
      // ne le posent PAS : ce sont exactement ceux que la garde protège.
      previewRecalculated: true,
    };

    // Un payload PAR destinataire : la carte d'aperçu est filtrée au prisme du
    // lecteur, donc deux participants de langues différentes n'ont pas la même.
    // La boucle par participant existait déjà — elle envoyait le même objet à
    // tout le monde.
    const wantedLanguage = scope?.onlyIfPreviewCarriesLanguage?.toLowerCase();

    for (const { room, participant } of participantUserRoomTargets(served)) {
      // La sonde a pu échouer (carte vide, aperçu global pour tous) : sous un
      // plancher, l'aperçu global est précisément ce que ce lecteur n'a pas le
      // droit de lire. Rien plutôt que l'interdit — sa ligne garde l'état que
      // le REST lui a servi sous la même borne.
      const floor = floorByParticipant.get(participant.id) ?? null;
      const latestBelowFloor = floor !== null && latest !== null && latest.createdAt < floor;
      if (latestBelowFloor && !overrides.has(participant.id)) continue;

      // `has`, jamais `get() ?? latest` : une entrée qui vaut `null` dit « cette
      // personne n'a plus AUCUN message visible ici », ce qu'un repli sur
      // l'aperçu global rendrait exactement à l'envers.
      const own = overrides.has(participant.id) ? overrides.get(participant.id) ?? null : latest;
      const prism = resolveLastMessagePreviewPrism(participant, own);
      if (wantedLanguage != null && !carriesLanguage(prism.lastMessageTranslations, wantedLanguage)) continue;
      io.to(room).emit(SERVER_EVENTS.CONVERSATION_UPDATED, {
        ...basePayload,
        ...messagePayloadFor(own),
        ...prism,
      });
    }
  } catch (error) {
    onError?.(error);
  }
}

function carriesLanguage(map: Record<string, string> | null, wantedLowercase: string): boolean {
  if (!map) return false;
  return Object.keys(map).some((lang) => lang.toLowerCase() === wantedLowercase);
}
