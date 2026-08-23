import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';
import { bridgeComputed, bridgeNotComputed } from './unreadBridgeField.js';
import type { ServerEmitIO } from './serverEmit';

/**
 * A conversation participant, reduced to what the unread fan-out reads.
 * `joinedAt` is NOT decoration: it is the counting floor a participant who has
 * never read anything falls back to, so dropping it would count the whole
 * pre-arrival history as unread.
 */
export interface UnreadRecipient {
  readonly id: string;
  readonly userId: string | null;
  readonly joinedAt: Date | null;
}

/**
 * The Socket.IO surface this fan-out needs, kept structural so it accepts the
 * typed server, the manager's `getIO()` (which is nullable during boot) and a
 * test double alike.
 */
export type UnreadCountEmitter = ServerEmitIO;

export interface UnreadCountReader {
  getUnreadCountsForParticipants(
    participants: ReadonlyArray<{ id: string; userId?: string | null; joinedAt: Date | null }>,
    conversationId: string
  ): Promise<Map<string, number>>;
}

export interface UnreadParticipantSource {
  participant: {
    findMany(args: {
      where: { conversationId: string; isActive: boolean };
      select: { id: true; userId: true; joinedAt: true };
    }): Promise<UnreadRecipient[]>;
  };
}

/**
 * Ce que ce fan-out demande à `ConversationBridgeService` — G-123, corrigé
 * REV-5/B2. Interface STRUCTURELLE plutôt qu'un import direct de la classe :
 * ce fichier reste testable sans construire un vrai `PrismaClient`, et
 * n'importe quel objet qui sait construire les ponts d'UNE conversation pour
 * PLUSIEURS lecteurs convient (le vrai service, ou un double de test).
 *
 * La forme demandée est celle d'un LOT — `viewers[]`, un seul appel — et pas
 * celle d'un lecteur unique appelé N fois. Ce n'est pas une commodité de
 * style : la passe du service coûte un nombre CONSTANT de requêtes par appel,
 * donc un appelant qui l'appelait par destinataire reconstituait à lui seul
 * le N+1 que le service interdit chez lui (5 requêtes × N destinataires, à
 * chaque message envoyé). La map rendue est indexée par `viewerId` — la même
 * clé que la room personnelle du destinataire.
 *
 * Aucun `agent` ici, et c'est délibéré (acquis REV-5) : l'étage agent de
 * G-127 est réservé à `GET /conversations`. Ce chemin-ci est celui de l'ACK
 * d'envoi ; il ne peut pas payer un aller-retour réseau par message.
 */
export interface UnreadBridgeBuilder {
  buildBridgeDataForViewers(params: {
    readonly conversationId: string;
    readonly viewers: readonly { readonly viewerId: string; readonly unreadCount: number }[];
  }): Promise<ReadonlyMap<string, { readonly bridge: ConversationBridge; readonly lastReadAt?: Date }>>;
}

/**
 * Aucun pont — l'absence, pas une map fabriquée par appel. Sert de valeur par
 * défaut quand il n'y a pas de constructeur de pont, aucun destinataire à
 * enrichir, ou que la passe a échoué.
 */
const EMPTY_BRIDGES: ReadonlyMap<string, { bridge: ConversationBridge; lastReadAt?: Date }> = new Map();

/**
 * What EVERY committed message owes its RECIPIENTS: a fresh unread badge.
 *
 * `conversation:unread-updated` is the only live signal that moves a
 * recipient's unread pill. The count itself is derived from read cursors, so it
 * is always right at the next full refetch — but the web conversation list runs
 * on `staleTime: Infinity`, so without this push the pill keeps showing its
 * previous value indefinitely while the conversation visibly jumps to the top
 * of the list with a new preview. The badge does not go stale: it lies.
 *
 * This existed in TWO copies — `MessageHandler._updateUnreadCounts` (private)
 * and an inline block in `MeeshySocketIOManager._broadcastNewMessage` — which
 * differed only in the sender-exclusion predicate, i.e. in a value, not in a
 * behavior. Both were unreachable from the share-link send routes, which bypass
 * both classes entirely, so a message sent through a share link (the ONLY send
 * transport an anonymous participant has) never moved anyone's badge.
 *
 * Sender exclusion goes through BOTH identities. `senderId` is a
 * `Participant.id` on the REST/ZMQ and share-link transports and a `User.id` on
 * the WS transport; the two id spaces are ObjectIds of distinct collections and
 * never collide, so the wide predicate is strictly equivalent to the narrow one
 * wherever the narrow one was already correct, and correct where it was not.
 *
 * The room falls back to the participant id when the participant has no
 * account. That is not defensive padding: a conversation opened through a share
 * link is populated with ANONYMOUS participants, who are precisely this
 * transport's audience.
 *
 * Best-effort — never throws, never awaited on the ACK path. A missing badge
 * must not turn a delivered message into a 500, nor block the offline queue.
 * `participants` lets a caller that already loaded the list (the manager loads
 * one superset for `conversation:updated` + the offline queue) avoid a second
 * round-trip on the service's hottest path.
 *
 * ── Ce que ce fan-out coûte, vraiment ───────────────────────────────────────
 * Ce chemin est INLINE dans l'envoi d'un message : `broadcastNewMessage`
 * (socket) et `_broadcastNewMessage` (REST/ZMQ) l'ATTENDENT. L'ACK du client
 * part AVANT (phase 4), mais tout ce qui suit dans la diffusion — notification
 * de l'agent, reçus de livraison — attend derrière lui, à chaque message écrit
 * sur la plateforme. Son coût mérite donc d'être écrit ici plutôt que supposé.
 *
 * Il est CONSTANT — il ne croît pas avec le nombre de destinataires :
 *   - 1 `participant.findMany`, sautée si l'appelant a préchargé la liste ;
 *   - 4 pour `getUnreadCountsForParticipants` (curseurs + masquage batché +
 *     UNE fenêtre de messages), et c'est un batch DÉLIBÉRÉ, documenté comme
 *     tel dans `MessageReadStatusService` ;
 *   - 5 pour la totalité des ponts, en UN appel à
 *     `buildBridgeDataForViewers` — zéro si aucun destinataire n'a de non-lu,
 *     et le même 5 pour 200 destinataires que pour un seul.
 *
 * Cette dernière ligne est une CORRECTION (REV-5/B2). Le pont a d'abord été
 * attaché en appelant la passe par conversations une fois par destinataire :
 * 5 requêtes de plus PAR destinataire, mesurées à 10 requêtes pour 1
 * destinataire et 55 pour 10 — linéaire, sur le chemin le plus chaud du
 * service. La doc de ce fichier affirmait alors l'inverse de son propre coût.
 * `emitUnreadCountsToRecipients.cost.test.ts` compte désormais les requêtes.
 */
export async function emitUnreadCountsToRecipients(params: {
  io: UnreadCountEmitter | null | undefined;
  prisma: UnreadParticipantSource;
  readStatusService: UnreadCountReader;
  conversationId: string;
  senderId: string | null | undefined;
  participants?: ReadonlyArray<UnreadRecipient>;
  /**
   * Optionnel — G-123. Absent : comportement d'avant, `{conversationId,
   * unreadCount}` seul. Présent : chaque destinataire dont le compteur
   * repasse au-dessus de zéro reçoit AUSSI `bridge`, calculé pour LUI (le
   * pont est par lecteur, jamais partagé entre deux destinataires du même
   * événement) — mais TOUS les ponts de l'événement sortent d'UN SEUL appel,
   * qui coûte le même nombre de requêtes pour 1 destinataire que pour 200.
   *
   * Le coût nouveau du pont est donc CONSTANT, jamais proportionnel à
   * l'effectif de la conversation. Il l'a été : la première version appelait
   * la passe par conversations une fois par destinataire, avec un candidat
   * singleton, et payait ses 5 requêtes autant de fois — 5N requêtes de plus
   * sur le chemin d'envoi, avant de rendre la main (REV-5/B2). Le témoin de
   * `emitUnreadCountsToRecipients.cost.test.ts` compte ces requêtes et
   * échouerait de nouveau si la boucle revenait.
   */
  bridgeService?: UnreadBridgeBuilder;
  onError?: (error: unknown) => void;
}): Promise<void> {
  const { io, prisma, readStatusService, conversationId, senderId, participants, bridgeService, onError } = params;
  if (!io || !senderId) return;

  try {
    const all =
      participants ??
      (await prisma.participant.findMany({
        where: { conversationId, isActive: true },
        select: { id: true, userId: true, joinedAt: true },
      }));

    const recipients = all.filter((p) => p.id !== senderId && p.userId !== senderId);
    // A single-participant conversation is common right after a share link is
    // created, and the count service costs up to two queries.
    if (recipients.length === 0) return;

    const counts = await readStatusService.getUnreadCountsForParticipants(recipients, conversationId);

    // `viewerId` — l'identité par laquelle ce destinataire est ADRESSÉ : sa
    // room personnelle, et la clé des ponts. Le repli sur l'id de participant
    // est celui des invités de lien de partage (cf. en-tête).
    const targets = recipients.map((recipient) => ({
      viewerId: recipient.userId ?? recipient.id,
      unreadCount: counts.get(recipient.id) ?? 0,
    }));

    // Un destinataire déjà à jour (unreadCount === 0) n'entre pas dans le lot :
    // `ConversationBridgeService` le filtrerait de toute façon (contrat gelé
    // §3.2), et un lot vide n'appelle pas le service du tout.
    const viewers = targets.filter((target) => target.unreadCount > 0);

    let bridges: ReadonlyMap<string, { bridge: ConversationBridge; lastReadAt?: Date }> = EMPTY_BRIDGES;
    // « La passe a-t-elle TOURNÉ ? » — la seule question qui décide entre les
    // deux formes de fil (cycle 63). Sans bridgeService, il n'y a rien à
    // demander ; avec, il faut encore qu'elle ne soit pas tombée. Un lot vide
    // (`viewers.length === 0`) compte comme TOURNÉE : tous les compteurs y sont
    // à zéro, et un compteur nul est un fait connu, pas une abstention.
    let bridgePassRan = Boolean(bridgeService);
    if (bridgeService && viewers.length > 0) {
      try {
        // UN appel pour TOUS les destinataires. Le pont reste par lecteur —
        // fenêtre, curseur et masquage personnel de CHACUN — mais il n'est
        // plus payé par lecteur.
        bridges = await bridgeService.buildBridgeDataForViewers({ conversationId, viewers });
      } catch (error) {
        // Best-effort : des ponts qui échouent ne doivent priver personne de
        // sa pastille — même posture que le reste du fan-out (cf. le catch
        // englobant). Tout le monde retombe sur `{conversationId, unreadCount}`
        // — et depuis le cycle 63, cette forme courte est un SILENCE et non un
        // ordre d'effacement : un incident de passe ne détruit plus le pont que
        // les lecteurs ont déjà en cache.
        bridgePassRan = false;
        onError?.(error);
      }
    }

    for (const target of targets) {
      io.to(ROOMS.user(target.viewerId)).emit(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, {
        conversationId,
        unreadCount: target.unreadCount,
        // Le pont ABSENT du Map n'est pas la même chose que le pont NON
        // DEMANDÉ : le premier est une réponse (« ce lecteur n'en a pas »), le
        // second une abstention. `bridgeComputed(undefined)` dit la première,
        // `bridgeNotComputed()` la seconde.
        ...(bridgePassRan
          ? bridgeComputed(bridges.get(target.viewerId)?.bridge)
          : bridgeNotComputed()),
      });
    }
  } catch (error) {
    onError?.(error);
  }
}
