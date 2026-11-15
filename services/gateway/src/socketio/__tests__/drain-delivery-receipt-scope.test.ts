/**
 * L'accusé de remise du rejeu nomme les messages RÉELLEMENT livrés (#18614).
 *
 * `_drainPendingMessages` va à de vraies longueurs pour tenir les entrées
 * REFUSÉES hors de `delivered`, sous un invariant ÉCRIT :
 *
 * > « Un accusé affirme “ce message est arrivé chez son destinataire” —
 * > l'affirmer d'un message qu'on vient de refuser de livrer mentirait à son
 * > auteur. »
 *
 * **L'invariant mourait une couche plus bas.** `markMessagesAsReceived` ne
 * recevait que le PLUS RÉCENT id, et appelait `freezeMessageStatus` sans
 * `messageIds` — qui résout alors une PLAGE :
 *
 * ```ts
 * ...(messageIds ? { id: { in: [...messageIds] } }
 *                : { createdAt: { lte: until ?? at, ...(since ? { gt: since } : {}) } }),
 * ```
 *
 * Tout message non supprimé de la conversation créé depuis le curseur
 * précédent recevait donc `deliveredAt` — et l'écriture est **write-once**,
 * donc rien ne la défait. La coche de l'expéditeur passait à « remis » pour un
 * message que le destinataire n'a jamais reçu.
 *
 * ## Deux déclencheurs, et le second n'exige AUCUNE panne
 *
 * 1. une émission qui LÈVE (`dropEntry(…, 'emit-failed')`) — l'entrée sort de
 *    `delivered` et reste dans la fenêtre estampillée ;
 * 2. **le plafond de 500 de la file** (`LTRIM`) : les arrivées évincées
 *    n'entrent JAMAIS dans le drain, et sont pourtant dans la fenêtre. Aucune
 *    panne requise — il suffit d'une absence un peu longue.
 *
 * ## Pourquoi le témoin qui portait ce nom ne gardait rien
 *
 * `n'accuse pas la remise d'une entrée qu'il n'a pas su diffuser`
 * (`MeeshySocketIOManager.test.ts`) **mocke `_emitDeliveryForDrainedMessages`**
 * et n'assert que le tableau qu'on lui passe. Il prouve le FILTRE et n'exerce
 * jamais l'EFFET — c'est la leçon du cycle 122 : « la question n'est pas
 * seulement *élit-il le bon rang ?* mais *qui AFFICHE ce qu'il élit ?* ».
 *
 * Ce fichier traverse donc la chaîne entière, jusqu'au `where` que
 * `freezeMessageStatus` remet à Prisma.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { getIoState } from './helpers/message-new-parity-mocks';

import { MeeshySocketIOManager } from '../MeeshySocketIOManager';
import { makePrisma, makeTranslationService } from './helpers/message-new-parity-fixtures';

function oid(seed: string): string {
  const hex = Buffer.from(seed).toString('hex');
  return (hex + '0'.repeat(24)).slice(0, 24);
}

const CONV = oid('conv-receipt');
const M1 = oid('m-one');
const M2 = oid('m-two');

describe('rejeu hors ligne — l’accusé de remise ne nomme que ce qui est parti', () => {
  let manager: any;
  let prisma: any;
  let ioState: ReturnType<typeof getIoState>;

  function queueOf(entries: unknown[]): any {
    return { drain: jest.fn<any>().mockResolvedValue(entries) };
  }

  const entry = (messageId: string) => ({
    payload: { id: messageId, content: `texte ${messageId}`, conversationId: CONV },
    conversationId: CONV,
    messageId,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    ioState = getIoState();
    ioState.to.mockClear();
    // `clearAllMocks` efface les APPELS, pas les IMPLÉMENTATIONS : sans ce
    // reset, le `mockImplementation` qui fait LEVER l'émission d'un message
    // dans un témoin survit aux suivants, et ils tombent — ou passent — pour
    // une raison qui n'est pas la leur. Mesuré dans ce fichier.
    ioState.toEmit.mockReset();
    ioState.toEmit.mockImplementation(() => undefined);
    ioState.sockets.sockets.clear();
    ioState.sockets.adapter.rooms.clear();

    prisma = makePrisma();
    // Le lecteur est un membre VIVANT, sans plancher : les gates d'autorisation
    // passent et ne sont pas le sujet de ce fichier.
    prisma.participant.findMany = jest.fn(async (args: any) => {
      if (args?.select?.bannedAt !== undefined) {
        return [{
          conversationId: CONV,
          bannedAt: null,
          role: 'admin',
          joinedAt: new Date('2020-01-01T00:00:00Z'),
          shareLinkId: null,
          historyVisibleFrom: null,
          permissions: null,
          anonymousSession: null,
          user: null,
        }];
      }
      return [{ id: oid('p-reader'), userId: 'reader', conversationId: CONV }];
    }) as any;
    prisma.message.findMany = jest.fn(async () => []) as any;

    manager = new MeeshySocketIOManager({} as any, prisma as any, makeTranslationService() as any);
    await manager.initialize();
    // La préférence d'accusé ne gouverne que la DIFFUSION ; l'avancée du
    // curseur et le gel par message ont lieu dans les deux cas (c'est ce que
    // `broadcastReadStatus` documente). On la pose pour que le chemin soit
    // complet et que le témoin ne dépende pas d'un défaut de service.
    manager.privacyPreferencesService.getPreferencesForUsers = jest.fn(async () =>
      new Map([['reader', { showReadReceipts: true }]]),
    ) as any;
  });

  /**
   * `_emitDeliveryForDrainedMessages` est DÉTACHÉ du drain (`.catch(…)`, jamais
   * `await`) : le rendre synchrone changerait le chemin de production, donc le
   * témoin franchit la phase « check » de la boucle d'événements au lieu de le
   * supposer terminé. Sans cela, l'assertion court avant l'accusé et le témoin
   * passerait — ou tomberait — pour une raison qui n'est pas la sienne.
   */
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setImmediate(resolve));
  };

  /**
   * LE témoin du lot. M1 ne part pas (l'émission lève — le cas pour lequel
   * `dropEntry(…, 'emit-failed')` existe), M2 part. L'accusé ne doit nommer
   * que M2.
   */
  it('n’accuse pas la remise d’un message dont l’émission a LEVÉ', async () => {
    const received = jest.fn<any>().mockResolvedValue(0);
    manager.readStatusService.markMessagesAsReceived = received;
    // `emit` lève pour M1 SEULEMENT : un double qui lève sur tout ne prouverait
    // que la survie à un harnais mort.
    ioState.toEmit.mockImplementation((_event: string, payload: any) => {
      if (payload?.id === M1) throw new Error('adapter down');
      return undefined;
    });
    manager.setDeliveryQueue(queueOf([entry(M1), entry(M2)]));

    await manager._drainPendingMessages('reader', false);
    await flush();

    expect(received).toHaveBeenCalledTimes(1);
    const [, , latest, options] = received.mock.calls[0] as any[];
    expect(latest).toBe(M2);
    expect(options?.messageIds).toEqual([M2]);
  });

  /**
   * Le SECOND déclencheur, et il n'exige aucune panne : la file plafonne à 500
   * entrées (`LTRIM`). Une arrivée évincée n'entre jamais dans le drain — et
   * sous la fenêtre de temps elle était estampillée quand même, parce qu'elle
   * est en base et dans l'intervalle.
   *
   * Ici le drain ne voit que M2 ; M1 existe en base et n'a jamais été remis.
   */
  it('n’accuse que ce que la file a RENDU, même sans aucune panne', async () => {
    const received = jest.fn<any>().mockResolvedValue(0);
    manager.readStatusService.markMessagesAsReceived = received;
    manager.setDeliveryQueue(queueOf([entry(M2)]));

    await manager._drainPendingMessages('reader', false);
    await flush();

    const [, , , options] = received.mock.calls[0] as any[];
    expect(options?.messageIds).toEqual([M2]);
  });

  /** Le cas nominal : tout part, tout est nommé — dans l'ordre du drain. */
  it('nomme TOUS les messages livrés quand rien ne tombe', async () => {
    const received = jest.fn<any>().mockResolvedValue(0);
    manager.readStatusService.markMessagesAsReceived = received;
    manager.setDeliveryQueue(queueOf([entry(M1), entry(M2)]));

    await manager._drainPendingMessages('reader', false);
    await flush();

    const [, , latest, options] = received.mock.calls[0] as any[];
    expect(latest).toBe(M2);
    expect([...(options?.messageIds ?? [])].sort()).toEqual([M1, M2].sort());
  });

  /**
   * Une MUTATION (édition, réaction, épingle) rejouée n'est pas une ARRIVÉE :
   * elle ne doit nommer aucun message dans l'accusé — elle n'attendait aucune
   * coche. C'est le cadrage `announcesMessageArrival`, et il ne doit pas
   * changer en passant des ids.
   */
  it('ne nomme pas une entrée de MUTATION rejouée', async () => {
    const received = jest.fn<any>().mockResolvedValue(0);
    manager.readStatusService.markMessagesAsReceived = received;
    manager.setDeliveryQueue(queueOf([
      { ...entry(M1), eventType: 'edited' },
      entry(M2),
    ]));

    await manager._drainPendingMessages('reader', false);
    await flush();

    const [, , , options] = received.mock.calls[0] as any[];
    expect(options?.messageIds).toEqual([M2]);
  });
});
