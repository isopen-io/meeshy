/**
 * #9709 (audit adversarial) — la traduction d'un message ne part qu'aux
 * lecteurs qui ont le droit de LIRE ce message.
 *
 * `message:translation` partait à toute la room de conversation, et la file
 * hors ligne à tous ses absents. Un invité entré par un lien SANS historique
 * recevait donc le texte traduit d'un message écrit avant lui dès que sa
 * traduction atterrissait après son arrivée — rattrapage d'une langue nouvelle,
 * traduction à la demande, ou traduction encore en vol quand il entre.
 *
 * Le double Prisma ÉVALUE le `where` : la sélection des lecteurs tardifs se juge
 * sur ce qu'elle rend, jamais sur une copie de la clause.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

import { deliverTextTranslation } from '../deliverTextTranslation';
import type { OfflineParticipantQueueParams } from '../offlineParticipantQueue';
import { matchesMongoWhere, type MongoDocument } from '../../__tests__/helpers/mongo-where';

const CONV = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const MSG = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const ECRIT = new Date('2026-10-08T10:00:00Z');
const apres = (minutes: number) => new Date(ECRIT.getTime() + minutes * 60_000);

const hote: MongoDocument = {
  id: 'p-hote', userId: 'u-hote', isActive: true, conversationId: CONV, role: 'creator',
  joinedAt: new Date('2026-10-01T00:00:00Z'), shareLinkId: null, historyVisibleFrom: null,
  permissions: null, anonymousSession: null, user: { role: 'USER' },
};
const invite = (overrides: MongoDocument = {}): MongoDocument => ({
  id: 'p-invite', userId: null, isActive: true, conversationId: CONV, role: 'member',
  joinedAt: apres(30), shareLinkId: 'lnk-ferme', historyVisibleFrom: null,
  permissions: null, anonymousSession: { rights: null }, user: null, ...overrides,
});

function monde(options: {
  participants: MongoDocument[];
  messageCreatedAt?: Date | null;
  liensIllisibles?: boolean;
  participantsEnPanne?: boolean;
  /** `io.to(...).emit(...)` LÈVE — adaptateur ou encodeur en défaut (#17026). */
  emissionEnPanne?: boolean;
  /**
   * Les sockets que l'ADAPTATEUR porte, par room — `{ 'conversation:…': 4 }`.
   * Le défaut (aucune) laisse `clientCount` à zéro, ce qui rend le compteur
   * `translations_sent` invisible : c'est exactement ce qui a tenu #20222 hors
   * de portée de tous les témoins de ce fichier.
   */
  socketsParRoom?: Readonly<Record<string, number>>;
}) {
  const stats = { translations_sent: 0, errors: 0 };
  const roomsDeLAdaptateur = new Map<string, Set<string>>(
    Object.entries(options.socketsParRoom ?? {}).map(([room, nombre]) => [
      room,
      new Set(Array.from({ length: nombre }, (_, index) => `${room}#${index}`)),
    ]),
  );
  const emit = jest.fn((event: string) => {
    if (options.emissionEnPanne && event === SERVER_EVENTS.MESSAGE_TRANSLATION) throw new Error('adapter down');
    return undefined;
  });
  const to = jest.fn((_rooms: string | string[]) => ({ emit }));
  const enfile: OfflineParticipantQueueParams[] = [];
  const prisma = {
    message: {
      findUnique: jest.fn(async () => ({
        conversationId: CONV,
        senderId: 'p-hote',
        ...(options.messageCreatedAt === null ? {} : { createdAt: options.messageCreatedAt ?? ECRIT }),
      })),
    },
    participant: {
      findMany: jest.fn(async (args: any) => {
        if (options.participantsEnPanne) throw new Error('mongo down');
        return options.participants.filter((row) => matchesMongoWhere(row, args.where));
      }),
    },
    conversationShareLink: {
      findMany: jest.fn(async () => {
        if (options.liensIllisibles) throw new Error('mongo down');
        return [{ id: 'lnk-ferme', allowViewHistory: false }, { id: 'lnk-ouvert', allowViewHistory: true }];
      }),
    },
    conversation: { findUnique: jest.fn(async () => null) },
  };
  const livrer = () =>
    deliverTextTranslation(
      {
        prisma: prisma as never,
        io: { to, sockets: { adapter: { rooms: roomsDeLAdaptateur } } } as never,
        normalizeConversationId: async (id) => id,
        enqueueForOfflineParticipants: async (params) => { enfile.push(params); },
        stats,
      },
      {
        taskId: 't-1',
        targetLanguage: 'en',
        result: { messageId: MSG, translatedText: 'Hello', sourceLanguage: 'fr', confidenceScore: 0.9 },
      },
    );
  const traductionsEmises = () => emit.mock.calls.filter(([event]) => event === SERVER_EVENTS.MESSAGE_TRANSLATION).length;
  return { to, emit, enfile, livrer, traductionsEmises, stats };
}

describe('la traduction d’un message ne part qu’à ceux qui peuvent le lire', () => {
  it('cas nominal — personne n’est arrivé après le message : la room entière, en une émission', async () => {
    const m = monde({ participants: [hote, invite({ joinedAt: new Date('2026-10-02T00:00:00Z') })] });

    await m.livrer();

    expect(m.to).toHaveBeenCalledWith(ROOMS.conversation(CONV));
    expect(m.enfile[0]?.excludedQueueKeys).toBeUndefined();
  });

  it('un invité SANS historique arrivé après le message ne la reçoit ni en direct ni en file', async () => {
    const m = monde({ participants: [hote, invite()] });

    await m.livrer();

    expect(m.to).not.toHaveBeenCalledWith(ROOMS.conversation(CONV));
    expect(m.to).toHaveBeenCalledWith([ROOMS.user('u-hote')]);
    expect(m.traductionsEmises()).toBe(1);
    expect([...(m.enfile[0]?.excludedQueueKeys ?? [])]).toEqual(['p-invite']);
  });

  it('un invité arrivé après mais AVEC l’historique la reçoit avec la room', async () => {
    const m = monde({ participants: [hote, invite({ shareLinkId: 'lnk-ouvert' })] });

    await m.livrer();

    expect(m.to).toHaveBeenCalledWith(ROOMS.conversation(CONV));
  });

  it('un octroi d’historique POSTÉRIEUR au message borne aussi', async () => {
    const m = monde({
      participants: [hote, invite({ joinedAt: new Date('2026-10-02T00:00:00Z'), shareLinkId: null, historyVisibleFrom: apres(5) })],
    });

    await m.livrer();

    expect(m.to).toHaveBeenCalledWith([ROOMS.user('u-hote')]);
  });

  it('quand l’audience se restreint, un BANNI resté actif ne reçoit rien, ni en direct ni en file', async () => {
    const banni: MongoDocument = {
      ...hote, id: 'p-banni', userId: 'u-banni', role: 'member', bannedAt: new Date('2026-10-05T00:00:00Z'),
    };
    const m = monde({ participants: [hote, banni, invite()] });

    await m.livrer();

    expect(m.to).toHaveBeenCalledWith([ROOMS.user('u-hote')]);
    expect([...(m.enfile[0]?.excludedQueueKeys ?? [])].sort()).toEqual(['p-invite', 'u-banni']);
  });

  it('FAIL-CLOSED — un plancher illisible exclut le lecteur tardif', async () => {
    const m = monde({ participants: [hote, invite({ shareLinkId: 'lnk-ouvert' })], liensIllisibles: true });

    await m.livrer();

    expect(m.to).toHaveBeenCalledWith([ROOMS.user('u-hote')]);
    expect([...(m.enfile[0]?.excludedQueueKeys ?? [])]).toEqual(['p-invite']);
  });

  it('FAIL-CLOSED — une date de message inconnue exclut quiconque a un plancher', async () => {
    const m = monde({
      participants: [hote, invite({ joinedAt: new Date('2026-10-02T00:00:00Z') })],
      messageCreatedAt: null,
    });

    await m.livrer();

    expect(m.to).toHaveBeenCalledWith([ROOMS.user('u-hote')]);
  });

  it('FAIL-CLOSED — une lecture des participants qui tombe n’émet RIEN', async () => {
    const m = monde({ participants: [hote, invite()], participantsEnPanne: true });

    await m.livrer();

    expect(m.traductionsEmises()).toBe(0);
    expect(m.enfile).toEqual([]);
  });

  /**
   * #17026 — le témoin ci-dessus était vert AVANT le guard d'audience comme
   * APRÈS : la panne sortait alors par le `catch` de fin de méthode, dont
   * l'effet observable est le même (rien émis, rien enfilé). Il ne pouvait donc
   * pas distinguer « retenu à dessein » de « la méthode a explosé » — et il ne
   * faut pas lui faire dire la première chose.
   *
   * Ce qui les sépare est le COMPTEUR : une décision ne passe pas par le
   * `catch`, donc n'incrémente pas `stats.errors`. C'est la seule assertion de
   * ce fichier qui tombe sous le retrait du guard.
   */
  it('#17026 — une audience irrésolvable est une DÉCISION, pas une erreur attrapée en fin de méthode', async () => {
    const m = monde({ participants: [hote, invite()], participantsEnPanne: true });

    await m.livrer();

    expect(m.stats.errors).toBe(0);
  });

  /**
   * Et la moitié qui porte la DURABILITÉ : l'émission vivante précédait
   * l'enfilage dans le même `try`, donc une diffusion tombée emportait la
   * traduction des ABSENTS — définitivement, puisque le `message:new` enfilé à
   * l'envoi porte `translations: []` et qu'aucun client ne refetch de lui-même
   * tant qu'il n'ouvre pas la conversation.
   */
  it('#17026 — une émission vivante qui LÈVE n’emporte pas l’enfilage des absents', async () => {
    const m = monde({ participants: [hote, invite({ joinedAt: new Date('2026-10-02T00:00:00Z') })], emissionEnPanne: true });

    await m.livrer();

    expect(m.enfile[0]).toEqual(
      expect.objectContaining({ eventType: 'translation', messageId: MSG, restrictToReadersOfLanguage: 'en' }),
    );
  });
});

/**
 * #20222 — le COMPTEUR, l'autre moitié de la loi du plancher.
 *
 * Les gardes d'AUDIENCE de ce chemin sont justes, et les témoins ci-dessus le
 * prouvent. Ce que personne ne regardait, c'est ce que la livraison DÉCLARE
 * avoir servi : `stats.translations_sent`, que `GET /admin/monitoring` publie
 * sous `translationsSent`.
 *
 * Il était incrémenté de `clientCount` — les sockets de la room de
 * CONVERSATION — sous un booléen que la fonction d'émission posait APRÈS la
 * branche, donc même quand aucune branche n'avait émis. Le commentaire du site
 * énonçait pourtant la règle juste : « le compteur ne s'incrémente QUE si
 * l'émission a eu lieu ; sinon il affirmerait avoir servi `clientCount` clients
 * qui n'ont rien reçu ».
 *
 * Ces témoins sont les premiers du fichier à PEUPLER la room de l'adaptateur.
 * Sans cela `clientCount` vaut zéro et le compteur reste à zéro quelle que soit
 * la branche — un témoin qui ne peut pas tomber.
 */
describe('#20222 — la traduction ne compte que les clients qu’elle a VRAIMENT servis', () => {
  const ROOM_CONV = ROOMS.conversation(CONV);

  /** Tous arrivés après le message, sans historique : la loi ne laisse AUCUN lecteur. */
  const tardif = (id: string, userId: string | null): MongoDocument => ({
    ...invite({ id, userId }),
    joinedAt: apres(30),
    shareLinkId: 'lnk-ferme',
  });

  it('l’audience ENTIÈRE compte les sockets de la room', async () => {
    const m = monde({
      participants: [hote, invite({ joinedAt: new Date('2026-10-02T00:00:00Z') })],
      socketsParRoom: { [ROOM_CONV]: 4 },
    });

    await m.livrer();

    expect(m.to).toHaveBeenCalledWith(ROOM_CONV);
    expect(m.stats.translations_sent).toBe(4);
  });

  it('une audience RESTREINTE ne compte que les sockets des rooms adressées, pas celles de la room', async () => {
    const m = monde({
      participants: [hote, invite()],
      socketsParRoom: { [ROOM_CONV]: 4, [ROOMS.user('u-hote')]: 2 },
    });

    await m.livrer();

    expect(m.to).toHaveBeenCalledWith([ROOMS.user('u-hote')]);
    expect(m.stats.translations_sent).toBe(2);
  });

  /**
   * Le cœur de #20222 : `rooms: []` est atteignable sans rien de pathologique —
   * il suffit que TOUS les participants vivants soient sous le plancher. Aucune
   * branche n'émet, et le compteur créditait quand même la room entière.
   */
  it('aucun lecteur autorisé : rien n’est émis, donc RIEN n’est compté', async () => {
    const m = monde({
      participants: [tardif('p-1', 'u-1'), tardif('p-2', 'u-2')],
      socketsParRoom: { [ROOM_CONV]: 4 },
    });

    await m.livrer();

    expect(m.traductionsEmises()).toBe(0);
    expect(m.stats.translations_sent).toBe(0);
  });

  it('une émission qui LÈVE ne compte rien non plus', async () => {
    const m = monde({
      participants: [hote, invite({ joinedAt: new Date('2026-10-02T00:00:00Z') })],
      socketsParRoom: { [ROOM_CONV]: 4 },
      emissionEnPanne: true,
    });

    await m.livrer();

    expect(m.stats.translations_sent).toBe(0);
  });

  /**
   * Une room personnelle VIDE (le lecteur est autorisé mais hors ligne) : la
   * remise part, et elle n'atteint aucun client. Le compteur dit zéro, et la
   * file hors ligne — gardée par ses propres témoins — prend le relais.
   */
  it('un lecteur autorisé mais HORS LIGNE est adressé sans être compté', async () => {
    const m = monde({
      participants: [hote, invite()],
      socketsParRoom: { [ROOM_CONV]: 1 },
    });

    await m.livrer();

    expect(m.to).toHaveBeenCalledWith([ROOMS.user('u-hote')]);
    expect(m.stats.translations_sent).toBe(0);
  });
});
