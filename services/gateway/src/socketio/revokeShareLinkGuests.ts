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
import { CALL_TERMINAL_STATUSES } from '@meeshy/shared/types/video-call';
import { endConversationMembership } from './endConversationMembership';
import {
  emitConversationMemberCountEvent,
  type MemberCountAudienceTarget,
} from './emitConversationMemberCount';
import { invalidateParticipantLookup } from '../utils/participant-lookup-cache';
import type { DepartedMemberEphemeralState } from './endConversationMembership';
import type { ConversationRoomEmitter } from './emitToConversationParticipants';
import { announceConversationLanguageChange } from '../services/message-translation/conversationLanguageChanges';
import { shareLinkActiveGuestsWhere, shareLinkGuestsOf } from './shareLinkGuestsWhere';

/**
 * Un socket, réduit aux deux verbes dont cette unité a besoin : celui que
 * `endConversationMembership` utilise, et la coupure qu'elle ne fait pas.
 */
interface RevocableSocket {
  readonly rooms: ReadonlySet<string>;
  leave(room: string): void | Promise<void>;
  disconnect(close?: boolean): void;
}

/**
 * L'accès aux sockets ET l'émission, en structural — pour que le vrai serveur
 * Socket.IO et un double de test soient tous deux acceptés. Même forme que
 * `MembershipRoomReader`, dont c'est un sur-ensemble.
 */
export type GuestSocketRegistry = ConversationRoomEmitter & {
  in(room: string | string[]): { fetchSockets(): Promise<ReadonlyArray<RevocableSocket>> };
};

export interface ShareLinkRevocation {
  readonly prisma: PrismaClient;
  readonly io: GuestSocketRegistry | null | undefined;
  readonly manager: DepartedMemberEphemeralState | null | undefined;
  /** `ConversationShareLink.id` — la clé interne, jamais le `linkId` public. */
  readonly shareLinkId: string;
  /** Injectable pour que le témoin d'ordre n'ait pas à deviner l'horloge. */
  readonly revokedAt?: Date;
  /**
   * #10470 — une révocation DIFFÉRÉE ne retire que les invités entrés avant la
   * fermeture : un lien rouvert entre-temps garde ses nouveaux venus.
   */
  readonly admittedUntil?: Date;
}

/**
 * Clôt l'appartenance de TOUS les invités entrés par ce lien, puis les sort du
 * vivant. Rend les `Participant.id` révoqués.
 */
export async function revokeShareLinkGuests(
  params: ShareLinkRevocation
): Promise<ReadonlyArray<string>> {
  const { prisma, io, manager, shareLinkId, admittedUntil, revokedAt = new Date() } = params;
  const live = withFetchSocketsDeadline(io);

  // Le lien d'un invité se lit comme `guestShareLinkId` le lit : la colonne de
  // la participation, et la session embarquée en repli (#10440) — les deux
  // sont posées à l'entrée par lien, et une ligne qui ne porterait que la
  // seconde échapperait sinon à la révocation.
  const ofThisLink = shareLinkGuestsOf(shareLinkId);
  const candidates = await prisma.participant.findMany({
    where: {
      ...shareLinkActiveGuestsWhere(shareLinkId),
      ...(admittedUntil ? { joinedAt: { lte: admittedUntil } } : {}),
    },
    select: { id: true, conversationId: true, displayName: true },
  });

  // #10457 — une écriture CONDITIONNELLE par ligne (`isActive: true` dans le
  // `where`) : seul l'invité que CETTE révocation a fait passer à inactif est
  // annoncé et rendu.
  //
  // #10464 — par paquets bornés, et chaque issue est lue : une écriture qui
  // lève ne prive plus de leur annonce et de leur éviction les invités DÉJÀ
  // passés à inactif, et un lien sans limite d'usage ne sature plus le pool
  // de connexions.
  const { written: guests, rejected, failure } = await deactivateGuests(prisma, candidates, revokedAt);
  const failures: unknown[] = failure ? [failure.reason] : [];

  // #10468 — une écriture REJETÉE peut avoir été validée en base (réponse
  // perdue après le commit). Celle que la relecture trouve inactive avec CE
  // `leftAt` est un départ de CETTE passe : #10472 l'annonce comme les autres.
  const recovered = await settle(failures, () => readCommittedRejections(prisma, rejected, revokedAt));
  const departed = [...guests, ...(recovered ?? [])];

  // #10472 — l'éviction ne dépend plus de l'issue de l'écriture. Un
  // `updateMany` abandonné par le client peut s'appliquer APRÈS la relecture
  // ci-dessus, un `fetchSockets` peut lever après des écritures validées :
  // l'invité est alors inactif et encore connecté, et la reprise, qui ne lit
  // que les invités ACTIFS, ne le retrouverait plus. Chaque passe évince donc
  // TOUS les invités inactifs du lien — un geste idempotent, sans annonce
  // (leur départ a été annoncé par la passe qui l'a écrit, ou n'est pas
  // établi).
  const inactive = await settle(failures, () =>
    prisma.participant.findMany({
      where: { type: 'anonymous', isActive: false, ...ofThisLink },
      select: { id: true, conversationId: true, displayName: true },
    })
  );
  const evicted = uniqueById([...departed, ...(inactive ?? [])]);

  // Les caches tombent AVANT tout `await` sur le vivant : une annonce ou une
  // éviction qui échoue plus loin ne laisse plus l'invité écrire dans le fil
  // pendant 30 s (recherche REST) ou 5 min (appartenance).
  invalidateCaches(manager, evicted);

  // Un lien n'a qu'une conversation, mais l'effectif se lit sur la ligne de
  // CHAQUE invité plutôt que sur un paramètre : une ligne pendante ne peut
  // alors pas faire annoncer un départ dans le fil d'à côté.
  for (const conversationId of [...new Set(departed.map(guest => guest.conversationId))]) {
    await settle(failures, () => announceDepartures({ prisma, io, conversationId, guests: departed, revokedAt }));
  }

  // #10472 — les inactifs que la passe n'a PAS écrits sont, pour l'immense
  // majorité, partis depuis longtemps : sans socket ni appel. Un seul
  // `fetchSockets` sur leurs rooms et une seule lecture d'appels désignent
  // ceux qui tiennent encore quelque chose de vivant ; les autres ne coûtent
  // aucun aller-retour. Si la détection lève, tous repassent par le chemin
  // complet : l'éviction ne dépend jamais d'elle.
  const departedIds = new Set(departed.map(guest => guest.id));
  const leftovers = evicted.filter(guest => !departedIds.has(guest.id));
  const liveness = await settle(failures, () => leftoverLiveness(prisma, live, leftovers));
  const connected = liveness ? leftovers.filter(guest => liveness.connected.has(guest.id)) : leftovers;

  // #10468 — invité par invité : l'échec de l'un (délai inter-nœuds de
  // `fetchSockets` sur l'adaptateur Redis) ne laisse plus les suivants dans
  // la room, dans l'appel et connectés.
  for (const guest of [...departed, ...connected]) {
    await settle(failures, () =>
      endConversationMembership({
        io: live,
        manager,
        conversationId: guest.conversationId,
        // Room personnelle : `Participant.id` pour un invité de lien partagé —
        // la même clé que celle du registre des partages (`SocketUser.id`).
        userId: guest.id,
      })
    );
    await settle(failures, () => disconnectGuest(live, guest.id));
  }

  // Les inactifs déconnectés : la position vive est un état serveur (sans
  // réseau), l'appel ne se défait que pour ceux qui en tiennent un.
  for (const guest of liveness ? leftovers.filter(candidate => !liveness.connected.has(candidate.id)) : []) {
    await settle(failures, async () => {
      manager?.endLiveLocationForDepartedMember?.(guest.conversationId, guest.id);
      if (liveness?.inCall.has(guest.id)) {
        await manager?.endCallParticipationForDepartedMember?.(guest.conversationId, guest.id);
      }
    });
  }

  // #10472 (R3) — et retombent APRÈS l'éviction : une lecture concurrente a pu
  // remettre la ligne ACTIVE en cache pendant les `await` ci-dessus.
  invalidateCaches(manager, evicted);

  // L'appelant garde le lien ouvert sur un échec : la reprise retrouve les
  // invités restés actifs, et évince à nouveau tous les inactifs.
  if (failures.length > 0) throw failures[0];

  return guests.map(guest => guest.id);
}

/**
 * #10470 — un `fetchSockets` qui ne répond plus (Redis tombé :
 * `maxRetriesPerRequest: null` met la requête de l'adaptateur en file sans
 * fin) rejette au bout de `FETCH_SOCKETS_DEADLINE_MS` au lieu de pendre : la
 * passe le compte comme un échec, et l'appelant garde le lien ouvert.
 */
function withFetchSocketsDeadline(
  io: GuestSocketRegistry | null | undefined
): GuestSocketRegistry | null | undefined {
  if (!io) return io;
  // R3 — le délai borne la PASSE, pas chaque appel : après un premier
  // dépassement, le registre est tenu pour muet et les appels suivants
  // échouent sur-le-champ. Sans quoi N invités coûtaient N fois le délai.
  let unresponsive = false;
  const fetchWithin = async (rooms: string | string[]) => {
    if (unresponsive) throw new Error('fetchSockets skipped: the socket registry already timed out in this pass');
    try {
      return await withDeadline(io.in(rooms).fetchSockets(), FETCH_SOCKETS_DEADLINE_MS);
    } catch (error) {
      if (error instanceof FetchSocketsTimeoutError) unresponsive = true;
      throw error;
    }
  };
  return {
    to: (room: string) => io.to(room),
    in: (rooms: string | string[]) => ({ fetchSockets: () => fetchWithin(rooms) }),
  };
}

class FetchSocketsTimeoutError extends Error {}

function withDeadline<T>(work: Promise<T>, afterMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new FetchSocketsTimeoutError(`fetchSockets did not answer within ${afterMs} ms`)), afterMs);
    timer.unref?.();
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

function uniqueById(guests: ReadonlyArray<RevocationCandidate>): ReadonlyArray<RevocationCandidate> {
  return [...new Map(guests.map(guest => [guest.id, guest] as const)).values()];
}

function invalidateCaches(
  manager: DepartedMemberEphemeralState | null | undefined,
  guests: ReadonlyArray<RevocationCandidate>
): void {
  for (const guest of guests) {
    invalidateParticipantLookup(guest.id, guest.conversationId);
    manager?.invalidateParticipantCache?.(guest.id, guest.conversationId);
  }
}

async function settle<T>(failures: unknown[], step: () => Promise<T>): Promise<T | undefined> {
  try {
    return await step();
  } catch (error) {
    failures.push(error);
    return undefined;
  }
}

async function announceDepartures(params: {
  readonly prisma: PrismaClient;
  readonly io: GuestSocketRegistry | null | undefined;
  readonly conversationId: string;
  readonly guests: ReadonlyArray<RevocationCandidate>;
  readonly revokedAt: Date;
}): Promise<void> {
  const { prisma, io, conversationId, guests, revokedAt } = params;
  announceConversationLanguageChange({ kind: 'departure', conversationId });
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

async function disconnectGuest(io: GuestSocketRegistry | null | undefined, guestId: string): Promise<void> {
  if (!io) return;
  const sockets = await io.in(ROOMS.user(guestId)).fetchSockets();
  for (const socket of sockets) socket.disconnect(true);
}

/**
 * Lesquels de ces invités tiennent encore une socket, et lesquels — parmi les
 * autres — une participation d'appel ouverte : deux requêtes, quel que soit
 * leur nombre.
 */
async function leftoverLiveness(
  prisma: PrismaClient,
  io: GuestSocketRegistry | null | undefined,
  guests: ReadonlyArray<RevocationCandidate>
): Promise<{ connected: ReadonlySet<string>; inCall: ReadonlySet<string> }> {
  if (guests.length === 0) return { connected: new Set(), inCall: new Set() };
  const sockets = io ? await io.in(guests.map(guest => ROOMS.user(guest.id))).fetchSockets() : [];
  const occupied = new Set(sockets.flatMap(socket => [...socket.rooms]));
  const connected = new Set(guests.filter(guest => occupied.has(ROOMS.user(guest.id))).map(guest => guest.id));
  const disconnected = guests.filter(guest => !connected.has(guest.id)).map(guest => guest.id);
  const participations = disconnected.length === 0
    ? []
    : await prisma.callParticipant.findMany({
        where: {
          participantId: { in: disconnected },
          OR: [{ leftAt: null }, { leftAt: { isSet: false } }],
          callSession: { status: { notIn: [...CALL_TERMINAL_STATUSES] } },
        },
        select: { participantId: true },
      });
  return { connected, inCall: new Set(participations.map(participation => participation.participantId)) };
}

async function readCommittedRejections(
  prisma: PrismaClient,
  rejected: ReadonlyArray<RevocationCandidate>,
  revokedAt: Date
): Promise<ReadonlyArray<RevocationCandidate>> {
  if (rejected.length === 0) return [];
  return prisma.participant.findMany({
    where: { id: { in: rejected.map(guest => guest.id) }, isActive: false, leftAt: revokedAt },
    select: { id: true, conversationId: true, displayName: true },
  });
}

/** Délai d'un `fetchSockets` avant d'être tenu pour un échec (#10470). */
export const FETCH_SOCKETS_DEADLINE_MS = 5_000;

/** Écritures concurrentes au plus — entre 25 et 50 (#10464). */
export const REVOCATION_WRITE_BATCH = 25;

type RevocationCandidate = { readonly id: string; readonly conversationId: string; readonly displayName: string };

async function deactivateGuests(
  prisma: PrismaClient,
  candidates: ReadonlyArray<RevocationCandidate>,
  revokedAt: Date
): Promise<{
  written: ReadonlyArray<RevocationCandidate>;
  rejected: ReadonlyArray<RevocationCandidate>;
  failure: PromiseRejectedResult | undefined;
}> {
  if (candidates.length === 0) return { written: [], rejected: [], failure: undefined };
  const batches = Array.from(
    { length: Math.ceil(candidates.length / REVOCATION_WRITE_BATCH) },
    (_unused, index) => candidates.slice(index * REVOCATION_WRITE_BATCH, (index + 1) * REVOCATION_WRITE_BATCH)
  );

  const outcomes: Array<PromiseSettledResult<{ count: number }>> = [];
  for (const batch of batches) {
    outcomes.push(
      ...(await Promise.allSettled(
        batch.map(guest =>
          prisma.participant.updateMany({
            where: { id: guest.id, isActive: true },
            data: { isActive: false, leftAt: revokedAt },
          })
        )
      ))
    );
  }

  return {
    written: candidates.filter((_guest, index) => {
      const outcome = outcomes[index];
      return outcome.status === 'fulfilled' && outcome.value.count > 0;
    }),
    rejected: candidates.filter((_guest, index) => outcomes[index].status === 'rejected'),
    failure: outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected'),
  };
}
