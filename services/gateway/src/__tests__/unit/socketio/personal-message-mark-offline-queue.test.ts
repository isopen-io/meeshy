/**
 * #16688 — un appareil resté hors ligne converge sur les MARQUES PERSONNELLES
 * du lecteur, même quand un AUTRE appareil du compte était connecté.
 *
 * Les trois familles — `message:starred`, `message:hidden-for-me`,
 * `message:restored-for-me` — sont diffusées sur la seule room `user:{id}`
 * pour que les AUTRES appareils du compte convergent : leurs deux modules
 * producteurs l'écrivent dans leur préambule, et les deux clients qui les
 * consomment (web et iOS) le disent dans le leur.
 *
 * Elles ne pouvaient PAS entrer dans la file de rejeu hors ligne, qui est le
 * seul rattrapage d'une absence : `enqueueForOfflineParticipants` décide de
 * l'audience par `connectedUsers.has(queueKey)`, la clé est le COMPTE, et
 * l'appareil qui pose la marque EST le compte. Le prédicat mesurait la présence
 * de l'ÉMETTEUR, jamais celle du destinataire.
 *
 * Les témoins portent sur l'EFFET — une entrée écrite dans la file, sous le
 * bon `eventType`, avec la bonne identité de dédup — jamais sur un statut HTTP.
 *
 * @jest-environment node
 */

import { describe, it, expect, afterEach, beforeEach } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  setSharedDeliveryQueue,
  getSharedPersonalMarkEnqueuer,
} from '../../../services/delivery-queue-registry';
import {
  enqueuePersonalVisibilityMark,
  enqueueStarMark,
} from '../../../socketio/enqueuePersonalMessageMark';
import {
  DRAINED_EVENT,
  PERSONAL_MARK_EVENT_TYPES,
  carriesMessageText,
  drainedEventName,
} from '../../../socketio/queuedEventContract';
import { announcesMessageArrival } from '../../../socketio/queuedMessageArrival';

const READER = '507f1f77bcf86cd799430001';
const CONV_A = '507f1f77bcf86cd799430011';
const CONV_B = '507f1f77bcf86cd799430012';
const MSG_1 = '507f1f77bcf86cd799430021';
const MSG_2 = '507f1f77bcf86cd799430022';
const MSG_3 = '507f1f77bcf86cd799430023';

type Written = { readonly userId: string; readonly entry: QueuedMessagePayload };

/**
 * Le double ENREGISTRE ce qu'on lui demande d'enfiler, et il déclare les DEUX
 * capacités du registre : un double réduit à `purgeMessage` rendrait
 * `getSharedPersonalMarkEnqueuer()` nul, donc tout témoin d'enfilage
 * trivialement vert — un double mentant par ce qu'il ne sait pas faire.
 */
const recordingQueue = (): Written[] => {
  const written: Written[] = [];
  setSharedDeliveryQueue({
    purgeMessage: async () => 0,
    enqueue: async (userId: string, entry: QueuedMessagePayload) => {
      written.push({ userId, entry });
    },
  });
  return written;
};

let written: Written[];
beforeEach(() => {
  written = recordingQueue();
});
afterEach(() => setSharedDeliveryQueue(undefined));

describe('les marques personnelles entrent dans la file de rejeu hors ligne (#16688)', () => {
  it('une étoile POSÉE est enfilée sous la clé du compte, avec son état absolu', async () => {
    await enqueueStarMark({
      userId: READER,
      state: { messageId: MSG_1, conversationId: CONV_A, starred: true, starredAt: '2026-11-08T10:00:00.000Z' },
    });

    expect(written).toHaveLength(1);
    expect(written[0].userId).toBe(READER);
    expect(written[0].entry.eventType).toBe('starred');
    expect(written[0].entry.messageId).toBe(MSG_1);
    expect(written[0].entry.conversationId).toBe(CONV_A);
    expect(written[0].entry.payload).toEqual({
      messageId: MSG_1,
      conversationId: CONV_A,
      starred: true,
      starredAt: '2026-11-08T10:00:00.000Z',
    });
  });

  it("l'étoile n'a PAS de dedupKey : la clé par défaut est `messageId`, donc un retrait SUPPLANTE la pose", async () => {
    await enqueueStarMark({
      userId: READER,
      state: { messageId: MSG_1, conversationId: CONV_A, starred: true, starredAt: '2026-11-08T10:00:00.000Z' },
    });
    await enqueueStarMark({
      userId: READER,
      state: { messageId: MSG_1, conversationId: CONV_A, starred: false, starredAt: null },
    });

    // La supplantation est l'affaire d'`ENQUEUE_DEDUP_LUA` ; ce que ce témoin
    // garde est la condition qui la rend possible — même identité de dédup et
    // même `eventType` pour les deux transitions du MÊME message.
    expect(written.map((w) => w.entry.dedupKey)).toEqual([undefined, undefined]);
    expect(new Set(written.map((w) => w.entry.messageId))).toEqual(new Set([MSG_1]));
    expect(new Set(written.map((w) => w.entry.eventType))).toEqual(new Set(['starred']));
  });

  it('un masquage GROUPE par conversation — jamais une entrée par message', async () => {
    await enqueuePersonalVisibilityMark({
      userId: READER,
      eventType: 'hidden-for-me',
      messages: [
        { messageId: MSG_1, conversationId: CONV_A },
        { messageId: MSG_2, conversationId: CONV_A },
        { messageId: MSG_3, conversationId: CONV_B },
      ],
      at: '2026-11-08T10:00:00.000Z',
    });

    expect(written).toHaveLength(2);
    const byConversation = new Map(written.map((w) => [w.entry.conversationId, w.entry]));
    expect([...byConversation.keys()].sort()).toEqual([CONV_A, CONV_B].sort());
    expect(byConversation.get(CONV_A)?.payload).toEqual({
      userId: READER,
      messages: [
        { messageId: MSG_1, conversationId: CONV_A },
        { messageId: MSG_2, conversationId: CONV_A },
      ],
      hiddenAt: '2026-11-08T10:00:00.000Z',
    });
    expect(byConversation.get(CONV_B)?.payload).toEqual({
      userId: READER,
      messages: [{ messageId: MSG_3, conversationId: CONV_B }],
      hiddenAt: '2026-11-08T10:00:00.000Z',
    });
  });

  it('la dedupKey d’un lot nomme le LOT : deux lots qui se recouvrent ne se supplantent pas', async () => {
    const at = '2026-11-08T10:00:00.000Z';
    await enqueuePersonalVisibilityMark({
      userId: READER,
      eventType: 'hidden-for-me',
      messages: [{ messageId: MSG_1, conversationId: CONV_A }, { messageId: MSG_2, conversationId: CONV_A }],
      at,
    });
    await enqueuePersonalVisibilityMark({
      userId: READER,
      eventType: 'hidden-for-me',
      messages: [{ messageId: MSG_1, conversationId: CONV_A }],
      at,
    });

    const keys = written.map((w) => w.entry.dedupKey);
    expect(keys.every((k) => typeof k === 'string' && k.length > 0)).toBe(true);
    // Les deux lots partagent leur PREMIER message : sous la clé par défaut ils
    // se seraient supplantés, et le second aurait emporté MSG_2 avec lui.
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('le même lot réécrit garde la MÊME clé, quel que soit l’ordre des messages', async () => {
    const at = '2026-11-08T10:00:00.000Z';
    await enqueuePersonalVisibilityMark({
      userId: READER,
      eventType: 'hidden-for-me',
      messages: [{ messageId: MSG_1, conversationId: CONV_A }, { messageId: MSG_2, conversationId: CONV_A }],
      at,
    });
    await enqueuePersonalVisibilityMark({
      userId: READER,
      eventType: 'hidden-for-me',
      messages: [{ messageId: MSG_2, conversationId: CONV_A }, { messageId: MSG_1, conversationId: CONV_A }],
      at,
    });
    expect(written[0].entry.dedupKey).toBe(written[1].entry.dedupKey);
  });

  it('masquage et restauration ne se supplantent PAS : deux eventType, rejoués dans l’ordre', async () => {
    await enqueuePersonalVisibilityMark({
      userId: READER,
      eventType: 'hidden-for-me',
      messages: [{ messageId: MSG_1, conversationId: CONV_A }],
      at: '2026-11-08T10:00:00.000Z',
    });
    await enqueuePersonalVisibilityMark({
      userId: READER,
      eventType: 'restored-for-me',
      messages: [{ messageId: MSG_1, conversationId: CONV_A }],
      at: '2026-11-08T10:01:00.000Z',
    });

    expect(written.map((w) => w.entry.eventType)).toEqual(['hidden-for-me', 'restored-for-me']);
    expect(written[1].entry.payload).toEqual({
      userId: READER,
      messages: [{ messageId: MSG_1, conversationId: CONV_A }],
      restoredAt: '2026-11-08T10:01:00.000Z',
    });
  });

  it('un id de conversation non interrogeable n’est PAS enfilé : il désarmerait le gate d’autorisation du drain', async () => {
    await enqueueStarMark({
      userId: READER,
      state: { messageId: MSG_1, conversationId: 'conv-lisible-par-un-humain', starred: true, starredAt: null },
    });
    expect(written).toHaveLength(0);
  });

  it('un lot vide n’écrit rien', async () => {
    await enqueuePersonalVisibilityMark({
      userId: READER,
      eventType: 'hidden-for-me',
      messages: [],
      at: '2026-11-08T10:00:00.000Z',
    });
    expect(written).toHaveLength(0);
  });

  it('une file en panne ne lève jamais : le canal est best-effort, l’écriture est déjà commise', async () => {
    setSharedDeliveryQueue({
      purgeMessage: async () => 0,
      enqueue: async () => {
        throw new Error('redis down');
      },
    });
    await expect(
      enqueueStarMark({
        userId: READER,
        state: { messageId: MSG_1, conversationId: CONV_A, starred: true, starredAt: null },
      })
    ).resolves.toBeUndefined();
  });

  it('aucune file dans ce processus : rien n’est enfilé, rien ne lève', async () => {
    setSharedDeliveryQueue(undefined);
    expect(getSharedPersonalMarkEnqueuer()).toBeUndefined();
    await expect(
      enqueueStarMark({
        userId: READER,
        state: { messageId: MSG_1, conversationId: CONV_A, starred: true, starredAt: null },
      })
    ).resolves.toBeUndefined();
  });

  it('un objet enregistré qui ne sait QUE purger n’est pas vu comme un enfileur', () => {
    setSharedDeliveryQueue({ purgeMessage: async () => 0 });
    expect(getSharedPersonalMarkEnqueuer()).toBeUndefined();
  });
});

describe('le contrat de file des marques personnelles (#16688)', () => {
  it('les trois familles rejouent le MÊME événement que la diffusion directe', () => {
    expect(drainedEventName('starred')).toBe(SERVER_EVENTS.MESSAGE_STARRED);
    expect(drainedEventName('hidden-for-me')).toBe(SERVER_EVENTS.MESSAGE_HIDDEN_FOR_ME);
    expect(drainedEventName('restored-for-me')).toBe(SERVER_EVENTS.MESSAGE_RESTORED_FOR_ME);
  });

  it('aucune ne porte de TEXTE : ni scellement au repos, ni index de purge, ni garde de vivacité', () => {
    for (const eventType of PERSONAL_MARK_EVENT_TYPES) {
      expect(carriesMessageText(eventType)).toBe(false);
    }
  });

  it('aucune n’est une ARRIVÉE : jamais d’accusé de remise pour une étoile', () => {
    for (const eventType of PERSONAL_MARK_EVENT_TYPES) {
      expect(announcesMessageArrival(eventType)).toBe(false);
    }
  });

  it('les trois sont dans la table du drain, et la table reste TOTALE', () => {
    for (const eventType of PERSONAL_MARK_EVENT_TYPES) {
      expect(DRAINED_EVENT[eventType]).toBeDefined();
    }
  });
});

/**
 * LE BALAYAGE — une QUATRIÈME famille de marque personnelle ne peut pas entrer
 * muette.
 *
 * Un témoin par famille ne dit rien de celle qu'un lot futur ajoutera sans
 * savoir que cette loi existe : c'est exactement ce qui s'est passé ici, où
 * trois familles ont vécu des mois sans producteur d'entrées parce qu'aucune
 * n'était dans aucune énumération.
 *
 * Il vérifie D'ABORD qu'il TROUVE quelque chose : une sonde dont le balayage
 * rend `[]` reste verte sans rien garder.
 */
describe('balayage — toute marque personnelle a un producteur d’entrées de file (#16688)', () => {
  const GATEWAY_SRC = join(__dirname, '..', '..', '..');

  /** Les deux seules unités qui ont le droit d'écrire une entrée de marque. */
  const PRODUCERS = ['enqueuePersonalVisibilityMark', 'enqueueStarMark'] as const;

  it('les deux producteurs existent et sont exportés par l’unité unique', () => {
    const source = readFileSync(join(GATEWAY_SRC, 'socketio', 'enqueuePersonalMessageMark.ts'), 'utf8');
    for (const producer of PRODUCERS) {
      expect(source).toContain(`export async function ${producer}(`);
    }
  });

  it('chaque famille a au moins un site de PRODUCTION qui l’enfile', () => {
    const sites: Record<string, string[]> = {
      'hidden-for-me': [join(GATEWAY_SRC, 'services', 'personalMessageVisibilitySync.ts')],
      'restored-for-me': [join(GATEWAY_SRC, 'services', 'personalMessageVisibilitySync.ts')],
      starred: [join(GATEWAY_SRC, 'routes', 'me', 'starred-messages.ts')],
    };
    // La sonde prouve d'abord qu'elle balaie bien quelque chose.
    expect(Object.keys(sites).sort()).toEqual([...PERSONAL_MARK_EVENT_TYPES].sort());

    for (const eventType of PERSONAL_MARK_EVENT_TYPES) {
      const found = sites[eventType].some((file) => {
        const source = readFileSync(file, 'utf8');
        return PRODUCERS.some((producer) => source.includes(`${producer}({`));
      });
      expect(found).toBe(true);
    }
  });

  it('les familles déclarées au contrat et celles couvertes par ce balayage sont les MÊMES', () => {
    const contract = readFileSync(join(GATEWAY_SRC, 'socketio', 'queuedEventContract.ts'), 'utf8');
    const declared = /PERSONAL_MARK_EVENT_TYPES = \[([^\]]+)\]/.exec(contract);
    expect(declared).not.toBeNull();
    const names = [...(declared as RegExpExecArray)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(names.sort()).toEqual([...PERSONAL_MARK_EVENT_TYPES].sort());
  });

  it('aucune des trois ne passe par l’éventail de CONVERSATION, dont le prédicat ne peut pas les servir', () => {
    for (const file of [
      join(GATEWAY_SRC, 'services', 'personalMessageVisibilitySync.ts'),
      join(GATEWAY_SRC, 'routes', 'me', 'starred-messages.ts'),
    ]) {
      expect(readFileSync(file, 'utf8')).not.toContain('enqueueForOfflineParticipants');
    }
  });
});
