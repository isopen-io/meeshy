/**
 * `translation:request` doit à son JUMEAU POUSSÉ les deux mêmes gardes
 * d'admission — et n'en portait aucune.
 *
 * Le chemin poussé du MÊME événement (`deliverTextTranslation` →
 * `translationReaders`) calcule le plancher d'historique de chaque lecteur et
 * EXCLUT, fail-closed, celui qui est entré après le message. Le chemin
 * DEMANDÉ ne gardait que deux choses : le message existe avec un contenu non
 * vide, et l'appelant est un participant ACTIF. Le même
 * `message:translation` était donc retenu quand le serveur le POUSSE et remis
 * quand le client le DEMANDE.
 *
 * Et aucun des deux ne regardait la VIVACITÉ : les trois transports de
 * suppression écrivent `{ translations: null, deletedAt }` — ils effacent les
 * copies traduites À DESSEIN et gardent `content`. Un message rappelé passait
 * donc la garde `!message.content`, repartait au traducteur, et sa traduction
 * était réécrite en base puis rediffusée à toute la room et à la file hors
 * ligne. Le secret revenait sur le fil APRÈS qu'on a dit à l'utilisateur
 * qu'il était détruit.
 *
 * Doctrine du dépôt : `services/gateway/CLAUDE.md` § « Une garde d'admission
 * se pose sur CHAQUE chemin, pas sur le plus fréquenté ».
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { MeeshySocketIOManager } from '../MeeshySocketIOManager';

const MESSAGE_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const USER_ID = '507f1f77bcf86cd799439013';

const MESSAGE_WRITTEN_AT = new Date('2026-11-06T09:00:00Z');
/** Entré APRÈS le message : son plancher le place hors de portée. */
const JOINED_AFTER = new Date('2026-11-06T10:00:00Z');

/** Une participation ACTIVE qui lit TOUT l'historique — le cas nominal. */
const fullHistoryMember = {
  id: 'p-2',
  role: 'member',
  joinedAt: JOINED_AFTER,
  shareLinkId: null,
  historyVisibleFrom: null,
  permissions: null,
  anonymousSession: null,
  user: { role: 'USER' },
};

/**
 * Même participation, mais son droit figé REFUSE l'historique : son plancher
 * vaut `joinedAt`, donc le message écrit avant elle est hors de portée.
 * (`settleBeforeLink` tranche sans lire aucun lien.)
 */
const flooredMember = { ...fullHistoryMember, permissions: { canViewHistory: false } };

/** Participation par LIEN : son plancher dépend d'une lecture qui peut tomber. */
const linkMember = { ...fullHistoryMember, shareLinkId: 'link-1' };

function build(options: {
  cached?: boolean;
  participant?: unknown;
  deletedAt?: Date | null;
  shareLinkUnreadable?: boolean;
} = {}) {
  const manager = Object.create(MeeshySocketIOManager.prototype) as Record<string, unknown>;
  const socket = { id: 'sock-1', emit: jest.fn() };
  const handleNewMessage = jest.fn<any>().mockResolvedValue({ messageId: MESSAGE_ID });

  manager.prisma = {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: MESSAGE_ID,
        conversationId: CONV_ID,
        content: 'mon code d’accès est 1234',
        originalLanguage: 'fr',
        senderId: 'p-1',
        encryptionMode: null,
        createdAt: MESSAGE_WRITTEN_AT,
        deletedAt: options.deletedAt ?? null,
      }),
    },
    participant: {
      findFirst: jest
        .fn<any>()
        .mockResolvedValue(options.participant === undefined ? fullHistoryMember : options.participant),
    },
    conversationShareLink: {
      findUnique: options.shareLinkUnreadable
        ? jest.fn<any>().mockRejectedValue(new Error('mongo down'))
        : jest.fn<any>().mockResolvedValue({ allowViewHistory: false }),
    },
  };
  manager.socketToUser = new Map([['sock-1', USER_ID]]);
  manager.connectedUsers = new Map([[USER_ID, { id: USER_ID, isAnonymous: false, participantId: 'p-2' }]]);
  manager.stats = { translations_sent: 0, errors: 0 };
  manager.translationService = {
    getTranslation: jest.fn<any>().mockResolvedValue(
      options.cached ? { translatedText: 'my access code is 1234', sourceLanguage: 'fr', confidenceScore: 0.9 } : null,
    ),
    handleNewMessage,
  };
  manager.translationRequestEngagement = { recordActivity: jest.fn<any>().mockResolvedValue(undefined) };

  const handle = () =>
    (manager as unknown as {
      _handleTranslationRequest: (s: unknown, d: unknown) => Promise<void>;
    })._handleTranslationRequest(socket, { messageId: MESSAGE_ID, targetLanguage: 'en' });

  return { handle, socket, handleNewMessage };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const servedTranslation = (socket: { emit: jest.Mock }) =>
  socket.emit.mock.calls.filter(([event]) => event === SERVER_EVENTS.MESSAGE_TRANSLATION);

describe('translation:request — la VIVACITÉ du message', () => {
  it('ne sert pas la traduction en cache d’un message RAPPELÉ', async () => {
    const { handle, socket } = build({ cached: true, deletedAt: new Date('2026-11-06T11:00:00Z') });
    await handle();
    await flush();

    expect(servedTranslation(socket)).toHaveLength(0);
  });

  it('ne RETRADUIT pas un message rappelé — sinon sa traduction est réécrite en base et rediffusée', async () => {
    const { handle, handleNewMessage } = build({ cached: false, deletedAt: new Date('2026-11-06T11:00:00Z') });
    await handle();
    await flush();

    expect(handleNewMessage).not.toHaveBeenCalled();
  });

  it('ne divulgue pas le texte rappelé dans la charge du refus', async () => {
    const { handle, socket } = build({ cached: true, deletedAt: new Date('2026-11-06T11:00:00Z') });
    await handle();
    await flush();

    expect(JSON.stringify(socket.emit.mock.calls)).not.toContain('1234');
  });
});

describe('translation:request — le PLANCHER D’HISTORIQUE de l’appelant', () => {
  it('ne sert pas la traduction en cache d’un message écrit AVANT le plancher', async () => {
    const { handle, socket } = build({ cached: true, participant: flooredMember });
    await handle();
    await flush();

    expect(servedTranslation(socket)).toHaveLength(0);
  });

  it('ne demande pas la traduction d’un message écrit AVANT le plancher', async () => {
    const { handle, handleNewMessage } = build({ cached: false, participant: flooredMember });
    await handle();
    await flush();

    expect(handleNewMessage).not.toHaveBeenCalled();
  });

  it('FAIL-CLOSED — un plancher illisible refuse, comme le chemin poussé', async () => {
    const { handle, socket } = build({ cached: true, participant: linkMember, shareLinkUnreadable: true });
    await handle();
    await flush();

    expect(servedTranslation(socket)).toHaveLength(0);
  });

  it('CONTRÔLE — un participant qui lit TOUT l’historique est servi', async () => {
    const { handle, socket } = build({ cached: true });
    await handle();
    await flush();

    expect(servedTranslation(socket)).toHaveLength(1);
  });
});
