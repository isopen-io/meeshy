/**
 * Ce que RETIRER UN LIEN DE PARTAGE retire à ses invités, en un seul endroit.
 *
 * ─── La phrase qui n'avait pas de code ──────────────────────────────────────
 *
 * La porte d'entrée anonyme (`POST /anonymous/join/:linkId`) vérifie NEUF
 * propriétés du lien avant de créer la ligne `Participant` : actif, expiration,
 * usages, concurrence, pays, langue, plage IP, compte requis, identité requise.
 * Deux d'entre elles ne sont pas des propriétés d'ADMISSION mais de DURÉE —
 * `isActive` et `expiresAt` décrivent l'état du lien à tout instant, pas
 * seulement au premier pas. **Rien ne les relisait après ce premier pas.**
 *
 * Les deux routes qui retirent un lien le DÉCLARENT pourtant dans leur propre
 * contrat OpenAPI :
 *
 * - `PATCH /links/:linkId/toggle` — *« When deactivated, the link becomes
 *   inaccessible to new **and existing** anonymous users. »*
 * - `DELETE /links/:linkId` — *« will **immediately invalidate all anonymous
 *   participants** using this link. »*
 *
 * Derrière la première moitié de chaque phrase, du code ; derrière la seconde,
 * rien. `Participant.shareLinkId` est un `String?` sans relation Prisma : la
 * suppression du lien ne cascade sur aucune ligne, et l'invité gardait sa
 * socket dans `ROOMS.conversation(...)` — chaque message, chaque réaction,
 * chaque frappe, le droit d'écrire, l'appel en cours et son partage de position,
 * indéfiniment, tant que son onglet restait ouvert. La révocation était
 * cosmétique.
 *
 * ─── La règle était déjà écrite, sur UNE route ──────────────────────────────
 *
 * `POST /anonymous/session/refresh` (`routes/anonymous.ts`) relit le lien d'une
 * session existante et rend `410 LINK_DEACTIVATED` / `410 LINK_EXPIRED`, avec
 * la sémantique fail-closed voulue : lien introuvable ⇒ 410. C'était la seule
 * route du dépôt à tenir la promesse des deux autres — donc l'accès d'un invité
 * après révocation dépendait de si son client appelait, ou non, ce
 * rafraîchissement. **La même question recevait deux réponses selon la porte.**
 *
 * ─── Ce que ce n'est PAS : le gel des permissions ───────────────────────────
 *
 * `routes/anonymous.ts` fige les sept droits (`canSendMessages`, …,
 * `canViewHistory`) à l'entrée, et l'assume : *« on entre sous les conditions du
 * MOMENT. Un hôte qui décoche `allowViewHistory` ensuite ne referme rien à qui
 * est déjà là. »* Cette unité ne touche pas à cette décision. `isActive` et
 * `expiresAt` ne sont pas des droits accordés à l'entrée : ils SONT la
 * révocation, et deux routes l'écrivent dans leur contrat.
 *
 * ─── Ni le bannissement, qui ferme la porte sans vider la salle ─────────────
 *
 * `routes/conversations/ban.ts` désactive lui aussi le lien du banni, et dit
 * pourquoi il s'arrête là : *« Ce qui est fermé, c'est la PORTE, pas la salle :
 * les personnes déjà entrées par ce lien restent membres. »* C'est juste pour
 * SON intention — retirer UNE personne — et cette unité n'y est pas appelée.
 * L'intention de `toggle(false)` et de `DELETE`, elle, est de retirer le LIEN :
 * c'est la seule différence, et c'est toute la différence.
 *
 * ─── L'ordre, et pourquoi il n'est pas indifférent ──────────────────────────
 *
 * 1. **La base d'abord.** L'appartenance cesse durablement avant tout effet
 *    vivant — une annonce ne précède jamais la durabilité du fait qu'elle
 *    annonce (`leave.ts`, `delete-for-me.ts`). C'est aussi ce qui rend la
 *    révocation résistante à une panne au milieu : les deux gardes déjà en
 *    place (`middleware/auth.ts` et `AuthHandler`, toutes deux keyées sur
 *    `Participant.isActive`) refusent dès cet instant la reconnexion.
 * 2. **Puis l'extinction, par le point de convergence existant.**
 *    `endConversationMembership` éteint la position vive et l'appel en cours
 *    AVANT de sortir les sockets de la room — voir son en-tête pour la raison
 *    de cet ordre-là. Cette unité ne recopie aucun de ces gestes ; c'est une
 *    cinquième copie qu'elle évite, pas trois lignes.
 * 3. **La socket en dernier.** Un invité de lien n'a qu'UNE identité : ce
 *    participant. Une fois sa ligne inactive, sa socket n'a plus d'identité
 *    valide du tout — la laisser connectée hors de toute room est un état pire
 *    que la coupure. `endConversationMembership` ne coupe rien, et c'est juste
 *    pour un membre inscrit qui garde trente autres conversations.
 *
 * ─── Ce que cette unité ANNONCE, et pourquoi elle, plutôt que ses appelants ─
 *
 * `endConversationMembership` n'annonce rien parce que ses quatre appelants
 * portent des faits DIFFÉRENTS (partir, être banni, être retiré, effacer pour
 * soi). Ici les deux appelants portent le MÊME fait — « ce lien ne donne plus
 * accès » — et la même charge : le départ est donc émis ici, une fois.
 *
 * `memberCount` est ABSOLU (cf. `ConversationParticipantLeftEventData`) : N
 * invités révoqués donnent N événements portant tous l'effectif final. Un
 * client qui POSE la valeur atterrit juste ; un client qui décrémente aussi,
 * puisqu'il reçoit exactement un événement par départ.
 *
 * ─── Ce qu'elle ne couvre pas ───────────────────────────────────────────────
 *
 * L'EXPIRATION (`expiresAt`) n'est le geste de personne : aucune route ne la
 * franchit, elle survient toute seule. La révoquer demande un balayage
 * périodique (cf. `ExpiredStoriesCleanupService`), qui a sa propre issue.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { endConversationMembership } from './endConversationMembership';
import {
  emitConversationMemberCountEvent,
  type MemberCountAudienceTarget,
} from './emitConversationMemberCount';
import { invalidateParticipantLookup } from '../utils/participant-lookup-cache';
import type { DepartedMemberEphemeralState } from './endConversationMembership';
import type { ConversationRoomEmitter } from './emitToConversationParticipants';

/**
 * Un socket, réduit aux deux verbes dont cette unité a besoin : celui que
 * `endConversationMembership` utilise, et la coupure qu'elle ne fait pas.
 */
interface RevocableSocket {
  leave(room: string): void | Promise<void>;
  disconnect(close?: boolean): void;
}

/**
 * L'accès aux sockets ET l'émission, en structural — pour que le vrai serveur
 * Socket.IO et un double de test soient tous deux acceptés. Même forme que
 * `MembershipRoomReader`, dont c'est un sur-ensemble.
 */
export type GuestSocketRegistry = ConversationRoomEmitter & {
  in(room: string): { fetchSockets(): Promise<ReadonlyArray<RevocableSocket>> };
};

export interface ShareLinkRevocation {
  readonly prisma: PrismaClient;
  readonly io: GuestSocketRegistry | null | undefined;
  readonly manager: DepartedMemberEphemeralState | null | undefined;
  /** `ConversationShareLink.id` — la clé interne, jamais le `linkId` public. */
  readonly shareLinkId: string;
  /** Injectable pour que le témoin d'ordre n'ait pas à deviner l'horloge. */
  readonly revokedAt?: Date;
}

/**
 * Clôt l'appartenance de TOUS les invités entrés par ce lien, puis les sort du
 * vivant. Rend les `Participant.id` révoqués.
 */
export async function revokeShareLinkGuests(
  params: ShareLinkRevocation
): Promise<ReadonlyArray<string>> {
  const { prisma, io, manager, shareLinkId, revokedAt = new Date() } = params;

  const guests = await prisma.participant.findMany({
    where: { shareLinkId, type: 'anonymous', isActive: true },
    select: { id: true, conversationId: true, displayName: true },
  });

  if (guests.length === 0) return [];

  await prisma.participant.updateMany({
    where: { id: { in: guests.map(guest => guest.id) } },
    data: { isActive: false, leftAt: revokedAt },
  });

  // Un lien n'a qu'une conversation, mais l'effectif se lit sur la ligne de
  // CHAQUE invité plutôt que sur un paramètre : une ligne pendante ne peut
  // alors pas faire annoncer un départ dans le fil d'à côté.
  const conversationIds = [...new Set(guests.map(guest => guest.conversationId))];

  for (const conversationId of conversationIds) {
    const remaining: ReadonlyArray<MemberCountAudienceTarget> = await prisma.participant.findMany({
      where: { conversationId, isActive: true },
      select: { id: true, userId: true, role: true, user: { select: { role: true } } },
    });

    for (const guest of guests.filter(candidate => candidate.conversationId === conversationId)) {
      emitConversationMemberCountEvent({
        io,
        conversationId,
        participants: remaining,
        event: SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT,
        payload: {
          conversationId,
          // `participantId` TOUJOURS, `userId` NUL sans compte — un invité de
          // lien n'a aucune ligne `User`, et ce champ-là en DÉCLARE une.
          participantId: guest.id,
          userId: null,
          displayName: guest.displayName,
          leftAt: revokedAt.toISOString(),
        },
        memberCount: remaining.length,
      });
    }
  }

  for (const guest of guests) {
    // Le cache de recherche REST (30 s) laisserait sinon l'invité écrire dans
    // le fil pendant toute sa fenêtre — même invalidation que les quatre
    // chemins de fin d'appartenance.
    invalidateParticipantLookup(guest.id, guest.conversationId);

    await endConversationMembership({
      io,
      manager,
      conversationId: guest.conversationId,
      // Room personnelle : `Participant.id` pour un invité de lien partagé —
      // la même clé que celle du registre des partages (`SocketUser.id`).
      userId: guest.id,
    });

    if (io) {
      const sockets = await io.in(ROOMS.user(guest.id)).fetchSockets();
      for (const socket of sockets) socket.disconnect(true);
    }
  }

  return guests.map(guest => guest.id);
}
