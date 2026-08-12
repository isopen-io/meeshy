import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { sharedPlaceFromMetadata } from '../services/location/sharedPlace';
import { participantUserRoomTargets } from './emitToConversationParticipants';
import {
  PREVIEW_PRISM_PARTICIPANT_SELECT,
  resolveLastMessagePreviewPrism,
} from './utils/lastMessagePreviewPrism';

/**
 * Minimal Socket.IO surface used by this helper. Kept structural so the
 * function is trivially unit-testable and accepts both the production
 * `Server` and the REST-side `socketIOManager.getIO()` shape.
 */
export interface PreviewEmitIO {
  to(room: string): { emit(event: string, payload: unknown): unknown };
}

type PreviewPrisma = Pick<PrismaClient, 'participant' | 'message'>;

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
        select: PREVIEW_PRISM_PARTICIPANT_SELECT,
      }),
      prisma.message.findFirst({
        where: { conversationId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        // Lot 3 : sans `metadata`, un dernier message géolocalisé n'affiche
        // jamais sa position dans ce fanout temps réel de l'aperçu.
        // `translations` / `originalLanguage` : le Prisme de la ligne de liste.
        select: {
          id: true,
          content: true,
          senderId: true,
          createdAt: true,
          metadata: true,
          translations: true,
          originalLanguage: true,
        },
      }),
    ]);

    if (scope?.onlyIfLatestIs != null && latest?.id !== scope.onlyIfLatestIs) return;

    // Un message géolocalisé sans légende a un `lastMessagePreview` vide —
    // hisser `location` ne fabrique aucun texte de repli côté serveur ; le
    // client décide comment rendre "" + location (ex. via messageType ou la
    // seule présence de `location`), pas ce helper.
    const place = sharedPlaceFromMetadata((latest as { metadata?: unknown } | null)?.metadata);

    const basePayload = {
      conversationId,
      // `updatedBy` is REQUIRED by ConversationUpdatedEventData — the User.id of
      // whoever triggered this edit/delete. Distinct from `senderId` (the
      // Participant.id of the current latest message's author): the actor and
      // the last-message author differ whenever a non-latest message is edited,
      // or the latest message is deleted leaving an earlier one on top. Mirrors
      // the send path in MeeshySocketIOManager, which always fills this field.
      updatedBy: { id: updatedByUserId },
      lastMessageAt: latest?.createdAt ?? null,
      lastMessageId: latest?.id ?? null,
      lastMessagePreview: latest?.content ?? null,
      senderId: latest?.senderId ?? null,
      updatedAt: new Date().toISOString(),
      ...(place ? { location: place } : {}),
    };

    // Un payload PAR destinataire : la carte d'aperçu est filtrée au prisme du
    // lecteur, donc deux participants de langues différentes n'ont pas la même.
    // La boucle par participant existait déjà — elle envoyait le même objet à
    // tout le monde.
    const wantedLanguage = scope?.onlyIfPreviewCarriesLanguage?.toLowerCase();

    for (const { room, participant } of participantUserRoomTargets(participants)) {
      const prism = resolveLastMessagePreviewPrism(participant, latest);
      if (wantedLanguage != null && !carriesLanguage(prism.lastMessageTranslations, wantedLanguage)) continue;
      io.to(room).emit(SERVER_EVENTS.CONVERSATION_UPDATED, {
        ...basePayload,
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
