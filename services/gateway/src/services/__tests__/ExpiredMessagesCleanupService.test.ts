import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../utils/logger-enhanced', () => {
  const actual = jest.requireActual('../../utils/logger-enhanced') as {
    enhancedLogger: Record<string, unknown>;
  };
  const child: Record<string, unknown> = {};
  Object.assign(child, {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    child: () => child,
  });
  return {
    ...actual,
    enhancedLogger: { ...actual.enhancedLogger, child: () => child },
  };
});

import { enhancedLogger } from '../../utils/logger-enhanced';
import { ExpiredMessagesCleanupService } from '../ExpiredMessagesCleanupService';

const sharedLog = enhancedLogger.child({ module: 'test-probe' }) as unknown as {
  error: jest.Mock;
  warn: jest.Mock;
  info: jest.Mock;
};

const burnRefusedCalls = () =>
  sharedLog.error.mock.calls.filter((call) => String(call[0]).includes('burn refused'));

/**
 * Un message qui s'autodétruit ne s'autodétruisait que sur l'écran.
 *
 * `Message.expiresAt` est écrit par les deux transports d'envoi, les trois
 * clients replient la bulle quand l'échéance passe — et le serveur, lui, ne
 * balayait RIEN. Aucune lecture ne filtre `expiresAt` (les ~119 lectures du
 * modèle sont gardées par le seul `deletedAt`), aucun service ne détruisait la
 * ligne : le texte en clair restait servi par `GET /conversations/:id/messages`
 * indéfiniment après l'échéance. Une réinstallation, un nouvel appareil, le web
 * (qui n'a AUCUN traitement d'éphémère) ou un simple appel d'API avec un jeton
 * valide le rendaient intégralement.
 *
 * Ces tests décrivent le balayage qui manquait, et surtout les deux endroits où
 * il peut faire pire que le défaut qu'il ferme : apparier un message NON
 * éphémère, et apparier un message que son créateur n'a pas marqué vivant.
 */

const NOW = new Date('2026-08-12T12:00:00.000Z');
const LAPSED = new Date('2026-08-12T11:59:00.000Z');

interface MessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  sender: { id: string; userId: string | null } | null;
  content: string;
  metadata: unknown;
  messageType: string;
  expiresAt: Date | null;
  attachments: Array<{ id: string; mimeType: string | null }>;
}

function messageRow(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    senderId: 'participant-1',
    sender: { id: 'participant-1', userId: 'user-1' },
    content: 'le secret',
    metadata: null,
    messageType: 'text',
    expiresAt: LAPSED,
    attachments: [],
    ...overrides,
  };
}

function buildPrisma(rows: MessageRow[]) {
  const message = {
    findMany: jest.fn<(args: unknown) => Promise<MessageRow[]>>().mockResolvedValue(rows),
    findFirst: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue(null),
    update: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({}),
  };
  return {
    message,
    conversation: {
      findUnique: jest.fn<(args: unknown) => Promise<unknown>>()
        .mockResolvedValue({ lastMessageAt: NOW, createdAt: NOW }),
      updateMany: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ count: 1 }),
    },
    notification: {
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([]),
      deleteMany: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ count: 0 }),
    },
    trackingLink: {
      updateMany: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ count: 0 }),
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([]),
    },
    conversationMessageStats: {
      findUnique: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue(null),
      update: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({}),
    },
    $runCommandRaw: jest.fn<(command: unknown) => Promise<unknown>>()
      .mockResolvedValue({ cursor: { firstBatch: [] } }),
  } as unknown as import('@meeshy/shared/prisma/client').PrismaClient;
}

function buildAttachments() {
  return {
    deleteAttachment: jest.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
  };
}

function buildManager() {
  const emit = jest.fn<(event: string, payload: unknown) => void>();
  const to = jest.fn<(room: string) => { emit: typeof emit }>().mockReturnValue({ emit });
  return {
    emit,
    to,
    getIO: jest.fn<() => { to: typeof to }>().mockReturnValue({ to }),
    enqueueOfflineMessageMutation: jest.fn<(params: unknown) => Promise<void>>()
      .mockResolvedValue(undefined),
    emitUnreadCountsToRecipients: jest.fn<(params: unknown) => Promise<void>>()
      .mockResolvedValue(undefined),
  };
}

const buildService = (
  rows: MessageRow[],
  options: {
    attachments?: { deleteAttachment: (id: string) => Promise<void> };
    manager?: ReturnType<typeof buildManager> | null;
  } = {},
) => {
  const prisma = buildPrisma(rows);
  const attachments = options.attachments ?? buildAttachments();
  const manager = options.manager === undefined ? buildManager() : options.manager;
  const service = new ExpiredMessagesCleanupService(prisma, {
    attachmentRemover: attachments,
    now: () => NOW,
    resolveManager: () => manager,
  });
  return { service, prisma, attachments, manager };
};

const findManyArgs = (prisma: unknown) =>
  ((prisma as { message: { findMany: jest.Mock } }).message.findMany.mock.calls[0][0]) as {
    where: Record<string, unknown>;
    orderBy?: unknown;
    take?: number;
  };

const updateCalls = (prisma: unknown) =>
  (prisma as { message: { update: jest.Mock } }).message.update.mock.calls as Array<[
    { where: { id: string }; data: Record<string, unknown> },
  ]>;

describe('ExpiredMessagesCleanupService', () => {
  it('ne balaye que les messages dont l’échéance est passée', async () => {
    const { service, prisma } = buildService([messageRow()]);

    await service.cleanup();

    expect(findManyArgs(prisma).where.AND).toContainEqual({ expiresAt: { lt: NOW } });
  });

  it('apparie le vivant sur l’ABSENCE de `deletedAt` autant que sur sa nullité', async () => {
    const { service, prisma } = buildService([messageRow()]);

    await service.cleanup();

    // `deletedAt: null` seul manquerait toute ligne dont le créateur n'a pas
    // écrit `LIVE_MESSAGE_MARK` — elle ne serait JAMAIS balayée.
    expect(findManyArgs(prisma).where).toMatchObject({
      OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
    });
  });

  it('borne la fournée et draine les plus anciennes échéances d’abord', async () => {
    const { service, prisma } = buildService([messageRow()]);

    await service.cleanup();

    const args = findManyArgs(prisma);
    expect(args.take).toBeGreaterThan(0);
    expect(args.orderBy).toEqual({ expiresAt: 'asc' });
  });

  it('efface le clair, le chiffré, les traductions et le payload structuré, et pose `deletedAt`', async () => {
    const { service, prisma } = buildService([messageRow()]);

    await service.cleanup();

    expect(updateCalls(prisma)[0][0]).toEqual({
      where: { id: 'msg-1' },
      data: {
        content: '',
        encryptedContent: null,
        translations: null,
        metadata: null,
        deletedAt: NOW,
      },
    });
  });

  it('efface `metadata` — les coordonnées d’un lieu partagé y sont EN CLAIR', async () => {
    // `metadata` n'est pas de la décoration : `MessageProcessor.saveMessage` y
    // range le lieu partagé (`metadata.location`, stockage en clair assumé) et
    // l'instantané figé du post cité (`metadata.postReplyTo` — contenu,
    // vignette, compteurs). Le laisser intact laissait la position GPS d'un
    // partage éphémère survivre à son échéance, en clair et pour toujours,
    // alors que le texte du même message était détruit. La destruction a été
    // ÉCRITE pour fermer la fuite au repos ; elle la laissait ouverte sur le
    // seul champ où la donnée est la plus sensible.
    const { service, prisma } = buildService([
      messageRow({ metadata: { location: { latitude: 48.8566, longitude: 2.3522 } } }),
    ]);

    await service.cleanup();

    expect(updateCalls(prisma)[0][0].data.metadata).toBeNull();
  });

  it('capture `metadata` AVANT de l’effacer — les effets de retrait le lisent', async () => {
    // L'ordre est un invariant, pas une commodité : `applyMessageRemovalEffects`
    // lit `metadata` pour décompter les compteurs de conversation, et
    // l'effacement le rend illisible. La copie est prise dans le `select` de la
    // requête, jamais relue après l'écriture.
    const { service, prisma } = buildService([messageRow()]);

    await service.cleanup();

    const select = (prisma as unknown as { message: { findMany: jest.Mock } })
      .message.findMany.mock.calls[0][0] as { select: Record<string, unknown> };
    expect(select.select.metadata).toBe(true);
  });

  it('ne détruit RIEN d’un message que la requête rendrait sans échéance', async () => {
    // Filet de sécurité de dernier ressort : sur MongoDB, l'ordre BSON place
    // `null` avant les dates. `$lt` est bracketé par type et n'apparie donc pas
    // les nuls — mais le rayon de souffle d'une erreur ici est la destruction
    // de TOUS les messages de la base, et un invariant à ce prix se vérifie
    // dans le processus plutôt que dans les notes.
    const { service, prisma, attachments } = buildService([
      messageRow({ id: 'jamais-ephemere', expiresAt: null }),
      messageRow({ id: 'pas-encore-echu', expiresAt: new Date(NOW.getTime() + 60_000) }),
    ]);

    const burned = await service.cleanup();

    expect(updateCalls(prisma)).toHaveLength(0);
    expect(attachments.deleteAttachment).not.toHaveBeenCalled();
    expect(burned).toEqual({ burned: 0 });
  });

  it('supprime les pièces jointes AVANT d’effacer la ligne qui les nomme', async () => {
    const { service, prisma, attachments } = buildService([
      messageRow({ attachments: [{ id: 'att-1', mimeType: 'image/jpeg' }] }),
    ]);

    await service.cleanup();

    expect(attachments.deleteAttachment).toHaveBeenCalledWith('att-1');
    const removalOrder = (attachments.deleteAttachment as jest.Mock).mock.invocationCallOrder[0];
    const eraseOrder = (prisma as unknown as { message: { update: jest.Mock } })
      .message.update.mock.invocationCallOrder[0];
    expect(removalOrder).toBeLessThan(eraseOrder);
  });

  it('un fichier récalcitrant n’empêche pas la destruction du contenu', async () => {
    const attachments = {
      deleteAttachment: jest.fn<(id: string) => Promise<void>>()
        .mockRejectedValue(new Error('disk gone')),
    };
    const { service, prisma } = buildService(
      [messageRow({ attachments: [{ id: 'att-1', mimeType: 'image/jpeg' }] })],
      { attachments },
    );

    const result = await service.cleanup();

    expect(updateCalls(prisma)).toHaveLength(1);
    expect(result).toEqual({ burned: 1 });
  });

  it('joue les effets de retrait partagés, avec le contenu CAPTURÉ avant l’effacement', async () => {
    const { service, prisma } = buildService([messageRow()]);

    await service.cleanup();

    // `applyMessageRemovalEffects` est l'unité des quatre écrivains de
    // `deletedAt` ; ce balayage est le cinquième. Le recalcul de
    // `lastMessageAt` en est l'effet observable le plus direct.
    expect((prisma as unknown as { conversation: { updateMany: jest.Mock } })
      .conversation.updateMany).toHaveBeenCalled();
  });

  it('un message dont l’effacement échoue ne fait pas échouer la passe', async () => {
    const { service, prisma } = buildService([
      messageRow({ id: 'msg-1' }),
      messageRow({ id: 'msg-2' }),
    ]);
    (prisma as unknown as { message: { update: jest.Mock } }).message.update
      .mockRejectedValueOnce(new Error('write conflict'));

    const result = await service.cleanup();

    expect(result).toEqual({ burned: 1 });
    expect(updateCalls(prisma)).toHaveLength(2);
  });

  it('une requête en échec rend une passe vide au lieu de propager', async () => {
    const { service, prisma } = buildService([messageRow()]);
    (prisma as unknown as { message: { findMany: jest.Mock } }).message.findMany
      .mockRejectedValueOnce(new Error('mongo down'));

    await expect(service.cleanup()).resolves.toEqual({ burned: 0 });
  });

  it('annonce la destruction à la room, à la liste et à la file hors ligne', async () => {
    const { service, manager } = buildService([messageRow()]);

    await service.cleanup();

    expect(manager!.to).toHaveBeenCalledWith('conversation:conv-1');
    expect(manager!.emit).toHaveBeenCalledWith('message:deleted', {
      messageId: 'msg-1',
      conversationId: 'conv-1',
    });
    expect(manager!.enqueueOfflineMessageMutation).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'deleted', messageId: 'msg-1' }),
    );
  });

  it('repousse la pastille de non-lus en excluant l’auteur du message', async () => {
    const { service, manager } = buildService([messageRow()]);

    await service.cleanup();

    expect(manager!.emitUnreadCountsToRecipients).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      senderId: 'participant-1',
    });
  });

  it('n’annonce qu’APRÈS avoir effacé — un client qui recharge ne doit rien retrouver', async () => {
    const { service, prisma, manager } = buildService([messageRow()]);

    await service.cleanup();

    const eraseOrder = (prisma as unknown as { message: { update: jest.Mock } })
      .message.update.mock.invocationCallOrder[0];
    expect(manager!.emit.mock.invocationCallOrder[0]).toBeGreaterThan(eraseOrder);
  });

  it('détruit quand même quand le socket n’est pas encore câblé', async () => {
    const { service, prisma } = buildService([messageRow()], { manager: null });

    const result = await service.cleanup();

    expect(updateCalls(prisma)).toHaveLength(1);
    expect(result).toEqual({ burned: 1 });
  });

  it('n’annonce pas un message que l’effacement a refusé', async () => {
    const { service, prisma, manager } = buildService([messageRow()]);
    (prisma as unknown as { message: { update: jest.Mock } }).message.update
      .mockRejectedValueOnce(new Error('write conflict'));

    await service.cleanup();

    expect(manager!.emit).not.toHaveBeenCalled();
  });

  it('le prédicat exige une échéance PRÉSENTE, NON NULLE et passée — jamais l’ordre BSON', async () => {
    // Incident prod : le connecteur Prisma/Mongo passe par un pipeline
    // d'agrégation où `$lt` suit l'ordre BSON total — `null`/absent passent
    // AVANT les dates et la page de 500 se remplit de lignes sans échéance,
    // que le filet refuse à chaque passe. Le prédicat doit exclure ces états
    // EXPLICITEMENT, pas par hypothèse de bracketing.
    const { service, prisma } = buildService([messageRow()]);

    await service.cleanup();

    const where = findManyArgs(prisma).where;
    expect(where.AND).toEqual([
      { expiresAt: { isSet: true } },
      { expiresAt: { not: null } },
      { expiresAt: { lt: NOW } },
    ]);
    expect(where.OR).toEqual([{ deletedAt: null }, { deletedAt: { isSet: false } }]);
  });

  it('le refus de brûler emporte un échantillon exploitable des lignes refusées', async () => {
    sharedLog.error.mockClear();
    const { service } = buildService([
      messageRow({ id: 'sans-echeance-1', expiresAt: null }),
      messageRow({ id: 'sans-echeance-2', expiresAt: null }),
      messageRow({ id: 'pas-echu', expiresAt: new Date(NOW.getTime() + 60_000) }),
      messageRow({ id: 'sans-echeance-4', expiresAt: null }),
    ]);

    await service.cleanup();

    const calls = burnRefusedCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toMatchObject({
      returned: 4,
      lapsed: 0,
      refusedSample: [
        { id: 'sans-echeance-1', expiresAtType: 'null', expiresAtValue: 'null' },
        { id: 'sans-echeance-2', expiresAtType: 'null', expiresAtValue: 'null' },
        {
          id: 'pas-echu',
          expiresAtType: 'Date',
          expiresAtValue: JSON.stringify(new Date(NOW.getTime() + 60_000)),
        },
      ],
    });
  });

  it('le refus persistant ne part en ERROR qu’à la première passe puis une fois toutes les 10', async () => {
    sharedLog.error.mockClear();
    const { service } = buildService([messageRow({ id: 'refuse', expiresAt: null })]);

    for (let pass = 0; pass < 10; pass += 1) {
      await service.cleanup();
    }
    expect(burnRefusedCalls()).toHaveLength(1);

    await service.cleanup();
    const calls = burnRefusedCalls();
    expect(calls).toHaveLength(2);
    expect(calls[1][1]).toMatchObject({ suppressedOccurrences: 9 });
  });

  it('une passe saine remet le dédoublonnage à zéro — le refus suivant repart en ERROR immédiat', async () => {
    sharedLog.error.mockClear();
    const { service, prisma } = buildService([]);
    const findMany = (prisma as unknown as { message: { findMany: jest.Mock } }).message.findMany;
    const refused = [messageRow({ id: 'refuse', expiresAt: null })];
    findMany
      .mockResolvedValueOnce(refused)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(refused);

    await service.cleanup();
    await service.cleanup();
    await service.cleanup();

    const calls = burnRefusedCalls();
    expect(calls).toHaveLength(2);
    expect(calls[1][1]).toMatchObject({ suppressedOccurrences: 0 });
  });

  it('`start` balaye immédiatement puis à intervalle, `stop` désarme', async () => {
    jest.useFakeTimers();
    try {
      const { service, prisma } = buildService([messageRow()]);
      const findMany = (prisma as unknown as { message: { findMany: jest.Mock } }).message.findMany;

      service.start(60_000);
      expect(findMany).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(60_000);
      expect(findMany).toHaveBeenCalledTimes(2);

      service.stop();
      jest.advanceTimersByTime(180_000);
      expect(findMany).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
