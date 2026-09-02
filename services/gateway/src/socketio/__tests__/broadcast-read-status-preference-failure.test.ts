/**
 * La JUMELLE de #4530, MESURÉE plutôt que supposée.
 *
 * L'issue demandait : « `broadcastReadStatus` est appelé depuis TROIS plugins de
 * routes et lit les mêmes préférences. Si le motif s'y répète, le correctif est
 * un site UNIQUE, pas trois. » Deux mesures répondent, et aucune n'est celle
 * qu'on attendait :
 *
 * 1. **Il n'y a pas trois sites, il y en a UN.** `broadcastReadStatus(` n'a
 *    qu'un seul appelant de production — `applyReceipt`
 *    (`routes/conversations/receipts.ts:374`). `routes/message-read-status.ts`
 *    et `routes/conversations/messages-read-status.ts` sont des ADAPTATEURS qui
 *    montent `receiptHandlers(...)` importés de là ; ils ne diffusent rien.
 *
 * 2. **Le motif ne s'y répète PAS, et la raison est structurelle.** Ce chemin
 *    lit la même préférence (`showReadReceipts`) mais à travers
 *    `PrivacyPreferencesService.shouldShowReadReceipts` →`getPreferences`, qui
 *    porte SON PROPRE `try/catch` autour de `loadPrivacyPreferencesCached` et
 *    retombe sur les défauts. Le site fautif de #4530
 *    (`routes/messages-writes.ts`) était le seul du dépôt à appeler la fonction
 *    de cache À CRU sans repli à lui.
 *
 * Ce témoin FIGE la mesure. Il fait lever la même requête que celle du témoin
 * de #4530 — `prisma.userPreferences.findMany`, la première de
 * `loadStoredPrivacyPreferences` — avec le VRAI `PrivacyPreferencesService`
 * derrière : un double du service aurait attesté la garde à la place du code
 * qui la porte. Si quelqu'un « optimise » un jour ce chemin en appelant le
 * cache à cru, la diffusion disparaîtra comme elle disparaissait sur les pièces
 * jointes, et c'est ici que ça se verra.
 *
 * ## Ce qu'il fige AUSSI : le repli est OUVERT ici
 *
 * Défauts ⇒ `showReadReceipts: true` ⇒ l'accusé part à toute la conversation.
 * L'inverse du repli RESTRICTIF retenu pour `attachment-status:updated`, et
 * l'écart est délibéré (cf. le tableau de `services/preferences/privacy-cache.ts`) :
 * là-bas la préférence choisit une ADRESSE, ici elle décide si un accusé de
 * lecture EXISTE pour les autres membres du fil. Le jour où l'on voudra unifier
 * les deux postures, ce témoin tombera — c'est ce qu'on lui demande, plutôt que
 * de laisser la divergence se découvrir en production.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { broadcastReadStatus } from '../broadcastReadStatus';
import { PrivacyPreferencesService } from '../../services/PrivacyPreferencesService';
import { clearPrivacyPreferencesCache } from '../../services/preferences/privacy-cache';

const USER_ID = '507f1f77bcf86cd799439101';
const PARTICIPANT_ID = '507f1f77bcf86cd799439102';
const PAIR_PARTICIPANT_ID = '507f1f77bcf86cd799439103';
const PAIR_USER_ID = '507f1f77bcf86cd799439104';
const CONVERSATION_ID = '507f1f77bcf86cd799439105';

const SUMMARY = { totalMembers: 2, receivedCount: 2, readCount: 1 };

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

function makePrisma(readPreferences: () => Promise<ReadonlyArray<unknown>>) {
  return {
    conversationReadCursor: {
      findUnique: jest
        .fn<() => Promise<{ lastReadAt: Date; lastReadMessageCreatedAt: Date }>>()
        .mockResolvedValue({
          lastReadAt: new Date('2026-08-31T10:00:00Z'),
          lastReadMessageCreatedAt: new Date('2026-08-31T09:59:00Z'),
        }),
    },
    participant: {
      findMany: jest
        .fn<() => Promise<ReadonlyArray<{ id: string; userId: string }>>>()
        .mockResolvedValue([
          { id: PARTICIPANT_ID, userId: USER_ID },
          { id: PAIR_PARTICIPANT_ID, userId: PAIR_USER_ID },
        ]),
    },
    userPreferences: { findMany: jest.fn(readPreferences) },
    userPreference: { findMany: jest.fn<() => Promise<never[]>>().mockResolvedValue([]) },
  };
}

const readStatusService = {
  getLatestMessageSummary: jest.fn<() => Promise<typeof SUMMARY>>().mockResolvedValue(SUMMARY),
  getUnreadCount: jest.fn<() => Promise<number>>().mockResolvedValue(3),
};

async function diffuser(readPreferences: () => Promise<ReadonlyArray<unknown>>) {
  const { io, emissions } = makeIoDouble();
  const prisma = makePrisma(readPreferences);
  await broadcastReadStatus(
    {
      io,
      // Le VRAI service, sur le VRAI prisma double : c'est son repli qu'on
      // mesure, pas celui d'un double écrit pour l'occasion.
      privacyPreferencesService: new PrivacyPreferencesService(
        prisma as unknown as ConstructorParameters<typeof PrivacyPreferencesService>[0]
      ),
      prisma: prisma as unknown as Parameters<typeof broadcastReadStatus>[0]['prisma'],
      readStatusService,
    },
    {
      conversationId: CONVERSATION_ID,
      participantId: PARTICIPANT_ID,
      userId: USER_ID,
      isAnonymous: false,
      type: 'read',
    }
  );
  return emissions;
}

describe('broadcastReadStatus — la jumelle de #4530 ne perd PAS son événement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPrivacyPreferencesCache();
  });

  it('préférences ILLISIBLES ⇒ les deux événements partent quand même', async () => {
    const emissions = await diffuser(() => Promise.reject(new Error('base indisponible')));

    const noms = emissions.map((e) => e.event);
    expect(noms).toContain(SERVER_EVENTS.READ_STATUS_UPDATED);
    expect(noms).toContain(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED);

    // Le badge de l'acteur — la moitié que le défaut de #4530 faisait
    // disparaître entièrement sur son propre chemin.
    const badge = emissions.find((e) => e.event === SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED);
    expect(badge?.rooms).toEqual([ROOMS.user(USER_ID)]);
  });

  it('le repli y est OUVERT — l\'accusé part à la CONVERSATION, pas à la seule room de l\'acteur', async () => {
    const emissions = await diffuser(() => Promise.reject(new Error('base indisponible')));

    const accuse = emissions.find((e) => e.event === SERVER_EVENTS.READ_STATUS_UPDATED);
    expect(accuse?.rooms).toContain(ROOMS.conversation(CONVERSATION_ID));
  });

  it('non-régression — un opt-out LU tait bien l\'accusé et garde le badge', async () => {
    const emissions = await diffuser(() =>
      Promise.resolve([{ userId: USER_ID, privacy: { showReadReceipts: false } }])
    );

    const noms = emissions.map((e) => e.event);
    expect(noms).not.toContain(SERVER_EVENTS.READ_STATUS_UPDATED);
    expect(noms).toContain(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED);
  });
});
