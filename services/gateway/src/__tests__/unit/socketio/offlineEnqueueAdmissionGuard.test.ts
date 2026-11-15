/**
 * #16706, cycle 143 bis — la garde d'ADMISSION, et les deux courses que la purge
 * ponctuelle ne pouvait pas fermer.
 *
 * L'audit adversarial du lot A a rendu ces défauts BLOQUANTS, et la session les a
 * re-vérifiés ligne à ligne avant d'écrire ces témoins :
 *
 * - `deliverTextTranslation` sélectionne `{ conversationId, senderId, createdAt,
 *   encryptionMode }` — aucune colonne de vivacité — et enfile `eventType:
 *   'translation'`, une famille PORTEUSE DE TEXTE, après une latence NLLB.
 * - `MESSAGE_LIVENESS_SELECT` ne portait pas `viewOnceBurnedAt`, ce que le lot A
 *   avait DIAGNOSTIQUÉ et écrit dans son propre commentaire sans l'ajouter.
 *
 * Les deux ensemble faisaient une fuite de LIVRAISON, pas seulement de stockage.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { enqueueForOfflineParticipants } from '../../../socketio/offlineParticipantQueue';
import { messageLivenessOf } from '../../../services/messages/message-liveness';

const CONVERSATION = '507f1f77bcf86cd799439022';
const MESSAGE = '507f1f77bcf86cd799439011';
const SECRET = 'le code du coffre est 4471';

type Row = { deletedAt: Date | null; expiresAt: Date | null; viewOnceBurnedAt: Date | null };

const live: Row = { deletedAt: null, expiresAt: null, viewOnceBurnedAt: null };
const viewOnceBurned: Row = { deletedAt: null, expiresAt: null, viewOnceBurnedAt: new Date() };

const depsFor = (row: Row | null, onRead?: (args: unknown) => void) => {
  const enqueue = jest.fn<any>().mockResolvedValue(undefined);
  const deps = {
    deliveryQueue: { enqueue } as never,
    prisma: {
      participant: {
        findMany: async () => [{ id: 'p-absent', userId: 'u-absent' }],
      },
      message: {
        findUnique: async (args: unknown) => {
          onRead?.(args);
          return row;
        },
      },
    } as never,
    connectedUsers: new Map() as never,
  };
  return { deps, enqueue };
};

const translationParams = {
  conversationId: CONVERSATION,
  messageId: MESSAGE,
  eventType: 'translation' as const,
  atRest: false,
  payload: { messageId: MESSAGE, translatedContent: SECRET, targetLanguage: 'en' } as never,
  dedupKey: `${MESSAGE}:en`,
};

describe('la loi de vivacité connaît la vue unique brûlée', () => {
  it('rend `gone` sur `viewOnceBurnedAt`, la TROISIÈME preuve de mort', () => {
    // Sans cette ligne, le drain lisait `deletedAt` et `expiresAt` — tous deux
    // nuls sur une vue unique purgée, parce que la bulle SURVIT — et rendait
    // `live` sur un message dont le contenu était détruit.
    expect(messageLivenessOf(viewOnceBurned)).toEqual({ liveness: 'gone', cause: 'view-once-burned' });
  });

  it('laisse `live` un message intact — la resserre ne mange pas le cas nominal', () => {
    expect(messageLivenessOf(live)).toEqual({ liveness: 'live' });
  });

  it('demande les TROIS colonnes, et un témoin de verdict ne peut pas le voir', async () => {
    // La leçon que `message-liveness.ts` écrit sur lui-même : un double Prisma
    // rend ce qu'on lui dit quel que soit le `select`. Ce témoin assert donc sur
    // la REQUÊTE, pas sur le verdict.
    const reads: unknown[] = [];
    const { deps } = depsFor(live, (args) => reads.push(args));

    await enqueueForOfflineParticipants(deps, translationParams);

    expect(reads).toHaveLength(1);
    expect((reads[0] as { select: unknown }).select).toEqual({
      deletedAt: true,
      expiresAt: true,
      viewOnceBurnedAt: true,
    });
  });
});

describe('la garde d’admission refuse le clair d’un message sans contenu', () => {
  it('n’enfile PAS une traduction qui arrive après la purge d’une vue unique', async () => {
    // Le scénario exact de l'audit : B et C ouvrent la vue unique, C se
    // déconnecte, la purge passe et nettoie sa file — puis la traduction en vol
    // arrive. Sans cette garde, le clair repartait pour 48 h dans Redis ET était
    // REMIS à C à sa reconnexion.
    const { deps, enqueue } = depsFor(viewOnceBurned);

    await enqueueForOfflineParticipants(deps, translationParams);

    expect(enqueue).not.toHaveBeenCalled();
  });

  it('n’enfile pas non plus pour un message rappelé ou échu', async () => {
    for (const row of [
      { deletedAt: new Date(), expiresAt: null, viewOnceBurnedAt: null },
      { deletedAt: null, expiresAt: new Date(Date.now() - 1000), viewOnceBurnedAt: null },
    ]) {
      const { deps, enqueue } = depsFor(row);
      await enqueueForOfflineParticipants(deps, translationParams);
      expect(enqueue).not.toHaveBeenCalled();
    }
  });

  it('enfile un message VIVANT — la garde ne casse pas le chemin nominal', async () => {
    const { deps, enqueue } = depsFor(live);

    await enqueueForOfflineParticipants(deps, translationParams);

    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('LAISSE PASSER une annonce de mort : c’est son objet de dire que le message est mort', async () => {
    // Le défaut symétrique, et le plus cher : refuser `deleted`/`expired` parce
    // que le message est mort laisserait l'absent afficher un message détruit
    // pour toujours. Aucune lecture n'est même ouverte.
    const reads: unknown[] = [];
    const { deps, enqueue } = depsFor(viewOnceBurned, (args) => reads.push(args));

    await enqueueForOfflineParticipants(deps, {
      ...translationParams,
      eventType: 'expired' as const,
      atRest: undefined as never,
      dedupKey: undefined as never,
    });

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(reads).toEqual([]);
  });

  it('enfile quand la lecture TOMBE — pas de preuve, pas de refus', async () => {
    // Fail-OPEN sur l'absence de preuve : une tempête de reconnexions est
    // exactement le moment où la base est sous pression, et refuser ici perdrait
    // un message vivant sans recours.
    const enqueue = jest.fn<any>().mockResolvedValue(undefined);
    const deps = {
      deliveryQueue: { enqueue } as never,
      prisma: {
        participant: { findMany: async () => [{ id: 'p-absent', userId: 'u-absent' }] },
        message: {
          findUnique: async () => {
            throw new Error('mongo down');
          },
        },
      } as never,
      connectedUsers: new Map() as never,
    };

    await enqueueForOfflineParticipants(deps, translationParams);

    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('n’ouvre AUCUNE lecture par destinataire : la vivacité est au MESSAGE', async () => {
    const reads: unknown[] = [];
    const enqueue = jest.fn<any>().mockResolvedValue(undefined);
    const deps = {
      deliveryQueue: { enqueue } as never,
      prisma: {
        participant: {
          findMany: async () => [
            { id: 'p-1', userId: 'u-1' },
            { id: 'p-2', userId: 'u-2' },
            { id: 'p-3', userId: 'u-3' },
          ],
        },
        message: {
          findUnique: async (args: unknown) => {
            reads.push(args);
            return live;
          },
        },
      } as never,
      connectedUsers: new Map() as never,
    };

    await enqueueForOfflineParticipants(deps, translationParams);

    expect(enqueue).toHaveBeenCalledTimes(3);
    expect(reads).toHaveLength(1);
  });
});

describe('l’enfilage est ATTENDU', () => {
  it('les entrées ont atterri quand l’appel rend la main', async () => {
    // Avant ce lot, `queued.catch(...)` n'était jamais `await`é : l'appel rendait
    // la main AVANT que la moindre entrée soit écrite. Une purge déclenchée juste
    // après une destruction immédiate balayait donc une file vide, et le clair y
    // arrivait ensuite — pour 48 h, sans qu'aucune purge ne repasse.
    const landed: string[] = [];
    const deps = {
      deliveryQueue: {
        enqueue: (key: string) =>
          new Promise<void>((resolve) =>
            setTimeout(() => {
              landed.push(key);
              resolve();
            }, 5),
          ),
      } as never,
      prisma: {
        participant: { findMany: async () => [{ id: 'p-1', userId: 'u-1' }, { id: 'p-2', userId: 'u-2' }] },
        message: { findUnique: async () => live },
      } as never,
      connectedUsers: new Map() as never,
    };

    await enqueueForOfflineParticipants(deps, translationParams);

    expect(landed.sort()).toEqual(['u-1', 'u-2']);
  });

  it('un enfilage qui ÉCHOUE ne prive pas les autres du leur', async () => {
    const landed: string[] = [];
    const deps = {
      deliveryQueue: {
        enqueue: async (key: string) => {
          if (key === 'u-1') throw new Error('redis down');
          landed.push(key);
        },
      } as never,
      prisma: {
        participant: { findMany: async () => [{ id: 'p-1', userId: 'u-1' }, { id: 'p-2', userId: 'u-2' }] },
        message: { findUnique: async () => live },
      } as never,
      connectedUsers: new Map() as never,
    };

    await expect(enqueueForOfflineParticipants(deps, translationParams)).resolves.toBeUndefined();
    expect(landed).toEqual(['u-2']);
  });
});
