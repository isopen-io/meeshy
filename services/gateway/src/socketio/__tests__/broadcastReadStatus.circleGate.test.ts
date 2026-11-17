/**
 * Le canal SOCKET des accusés de lecture honore la loi de cercle (#19385,
 * MSG-04 de #14107).
 *
 * ─── LES DEUX PRÉCONDITIONS, ÉCRITES AVANT LE PREMIER TÉMOIN ────────────────
 *
 * 1. **Un témoin posé sur une paire à `ACQUAINTANCE` ou au-dessus ne peut pas
 *    tomber** : la loi juste et l'absence de loi y rendent le même verdict.
 *    Chaque témoin de refus construit donc une paire SOUS le plancher.
 *
 * 2. **Retirer la seule room PERSONNELLE d'un lecteur refusé ne prouve rien.**
 *    La room de CONVERSATION le tient dès qu'il a le fil ouvert, et
 *    `emitToConversationParticipants` la chaîne toujours. Un témoin qui
 *    n'exigeait que l'absence de `user:<refusé>` de la chaîne passerait au vert
 *    sur un correctif INOPÉRANT pour tout lecteur ayant le fil à l'écran —
 *    c'est-à-dire sur le cas nominal de la fuite. D'où l'assertion sur
 *    `except:` : seul `.except()` retire un socket de TOUTE la chaîne.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { broadcastReadStatus } from '../broadcastReadStatus';
import { clearPrivacyPreferencesCache } from '../../services/preferences/privacy-cache';
import { ADULT_BIRTH, messagingWorld, type CircleLink } from '../../__tests__/helpers/messaging-circle-world';

const LECTEUR = '6400000000000000000000c1';
const CONNAISSANCE = '6400000000000000000000c2';
const INCONNU = '6400000000000000000000c3';
const CONVERSATION = '6400000000000000000000c9';

const P_LECTEUR = '7400000000000000000000c1';
const P_CONNAISSANCE = '7400000000000000000000c2';
const P_INCONNU = '7400000000000000000000c3';
const P_ANONYME = '7400000000000000000000c4';

const SUMMARY = { totalMembers: 4, receivedCount: 4, readCount: 1, readByAllAt: null };

const LIENS_NOMINAUX: readonly CircleLink[] = [[LECTEUR, CONNAISSANCE, 'ACQUAINTANCE']];

function makeIoDouble() {
  const emissions: Array<{ readonly event: string; readonly rooms: readonly string[] }> = [];
  let rooms: string[] = [];
  const chain = {
    to: (room: string) => {
      rooms.push(room);
      return chain;
    },
    except: (room: string) => {
      rooms.push(`except:${room}`);
      return chain;
    },
    emit: (event: string) => {
      emissions.push({ event, rooms: [...rooms] });
      rooms = [];
      return true;
    },
  };
  return {
    emissions,
    io: {
      to: (room: string) => {
        rooms = [room];
        return chain;
      },
    },
  };
}

/**
 * Le monde des cercles, plus les deux lectures que la diffusion fait en propre
 * (le curseur de l'acteur, les préférences de confidentialité). Les
 * participants sont posés ici et non dans `messagingWorld` parce que la
 * diffusion les lit avec `PARTICIPATION_VIVANTE`, que le double de table
 * n'évalue pas.
 */
function monde(options: { links?: readonly CircleLink[]; anonymousActor?: boolean } = {}) {
  const world = messagingWorld({
    links: options.links ?? LIENS_NOMINAUX,
    users: [LECTEUR, CONNAISSANCE, INCONNU].map((id) => ({
      id,
      birthDate: ADULT_BIRTH,
      username: id,
      displayName: id,
      blockedUserIds: [],
    })),
  });
  return {
    ...world.prisma,
    conversationReadCursor: {
      findUnique: jest.fn(async () => ({
        lastReadAt: new Date('2026-11-17T10:00:00Z'),
        lastReadMessageCreatedAt: new Date('2026-11-17T09:59:00Z'),
      })),
    },
    participant: {
      ...world.prisma.participant,
      findMany: jest.fn(async () => [
        { id: P_LECTEUR, userId: options.anonymousActor ? null : LECTEUR },
        { id: P_CONNAISSANCE, userId: CONNAISSANCE },
        { id: P_INCONNU, userId: INCONNU },
        // Un invité de lien : aucun cercle, donc jamais refusé par la loi.
        { id: P_ANONYME, userId: null },
      ]),
    },
    userPreferences: { findMany: jest.fn(async () => [] as unknown[]) },
    userPreference: { findMany: jest.fn(async () => [] as unknown[]) },
  };
}

const readStatusService = {
  getLatestMessageSummary: jest.fn<() => Promise<typeof SUMMARY>>().mockResolvedValue(SUMMARY),
  getUnreadCount: jest.fn<() => Promise<number>>().mockResolvedValue(0),
};

async function diffuser(prisma: ReturnType<typeof monde>, options: { anonymousActor?: boolean } = {}) {
  const { io, emissions } = makeIoDouble();
  await broadcastReadStatus(
    {
      io,
      prisma: prisma as unknown as Parameters<typeof broadcastReadStatus>[0]['prisma'],
      readStatusService,
      privacyPreferencesService: { shouldShowReadReceipts: async () => true },
    },
    {
      conversationId: CONVERSATION,
      participantId: P_LECTEUR,
      userId: options.anonymousActor ? P_LECTEUR : LECTEUR,
      isAnonymous: Boolean(options.anonymousActor),
      type: 'read',
    }
  );
  return emissions;
}

const accuse = (emissions: Array<{ event: string; rooms: readonly string[] }>) =>
  emissions.filter((e) => e.event === SERVER_EVENTS.READ_STATUS_UPDATED);

/**
 * Les exceptions dues à la LOI, l'acteur retiré.
 *
 * La room de l'acteur est exceptée de longue date, et pour une raison qui n'a
 * rien à voir avec les cercles : il reçoit une variante à lui (son arriéré
 * personnel) par une seconde chaîne, et `.except()` l'empêche de recevoir en
 * plus la copie des pairs. Compter cette exception comme un refus de cercle
 * rendrait tout témoin de ce fichier illisible.
 */
const exceptionsDeLaLoi = (rooms: readonly string[] | undefined, acteurRoom: string): string[] =>
  (rooms ?? []).filter((r) => r.startsWith('except:') && r !== `except:${acteurRoom}`);

describe('read-status:updated — l\'accusé suit le cercle (#19385)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPrivacyPreferencesCache();
    readStatusService.getLatestMessageSummary.mockResolvedValue(SUMMARY);
    readStatusService.getUnreadCount.mockResolvedValue(0);
  });

  it('EXCEPTE l\'inconnu de TOUTE la chaîne — room de conversation comprise', async () => {
    const emissions = await diffuser(monde());

    const pair = accuse(emissions).find((e) => e.rooms.includes(ROOMS.conversation(CONVERSATION)));
    expect(pair?.rooms).toContain(`except:${ROOMS.user(INCONNU)}`);
    // La Connaissance reste servie : la loi RESTREINT, elle ne ferme pas tout.
    expect(pair?.rooms).toContain(ROOMS.user(CONNAISSANCE));
    expect(pair?.rooms).not.toContain(`except:${ROOMS.user(CONNAISSANCE)}`);
  });

  it('n\'excepte PERSONNE quand tous les inscrits sont au moins Connaissance', async () => {
    const emissions = await diffuser(
      monde({
        links: [
          [LECTEUR, CONNAISSANCE, 'ACQUAINTANCE'],
          [LECTEUR, INCONNU, 'CLOSE'],
        ],
      })
    );

    const pair = accuse(emissions).find((e) => e.rooms.includes(ROOMS.conversation(CONVERSATION)));
    expect(exceptionsDeLaLoi(pair?.rooms, ROOMS.user(LECTEUR))).toEqual([]);
    // NON-VACUITÉ : les deux pairs sont bien dans la chaîne, donc l'absence
    // d'exception ci-dessus dit « servis » et non « jamais adressés ».
    expect(pair?.rooms).toContain(ROOMS.user(CONNAISSANCE));
    expect(pair?.rooms).toContain(ROOMS.user(INCONNU));
  });

  it('un invité de lien n\'est JAMAIS excepté : il n\'a pas de cercle', async () => {
    const emissions = await diffuser(monde());

    const pair = accuse(emissions).find((e) => e.rooms.includes(ROOMS.conversation(CONVERSATION)));
    expect(pair?.rooms).not.toContain(`except:${ROOMS.user(P_ANONYME)}`);
    expect(pair?.rooms).toContain(ROOMS.user(P_ANONYME));
  });

  it('un acteur SANS compte garde le régime d\'avant — aucun cercle à interroger', async () => {
    const emissions = await diffuser(monde({ anonymousActor: true }), { anonymousActor: true });

    const pair = accuse(emissions).find((e) => e.rooms.includes(ROOMS.conversation(CONVERSATION)));
    expect(exceptionsDeLaLoi(pair?.rooms, ROOMS.user(P_LECTEUR))).toEqual([]);
    expect(pair?.rooms).toContain(ROOMS.user(INCONNU));
  });

  it('FAIL-CLOSED — une loi illisible tait l\'accusé des pairs, et garde le badge de l\'acteur', async () => {
    const aveugle = monde();
    aveugle.userRelation = {
      ...aveugle.userRelation,
      findMany: jest.fn(() => Promise.reject(new Error('base indisponible'))),
    } as never;

    const emissions = await diffuser(aveugle);

    expect(accuse(emissions).filter((e) => e.rooms.includes(ROOMS.conversation(CONVERSATION)))).toEqual([]);
    // Le badge n'est pas un accusé : il décrit l'arriéré de l'acteur, chez lui.
    const badge = emissions.find((e) => e.event === SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED);
    expect(badge?.rooms).toEqual([ROOMS.user(LECTEUR)]);
  });
});
