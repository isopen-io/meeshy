/**
 * #9709 — un invité qui arrive lit dans sa langue les messages écrits AVANT son
 * arrivée.
 *
 * Le cas NOMINAL de l'acquisition : l'hôte écrit, PUIS envoie le lien. Les
 * messages antérieurs n'avaient été traduits que vers les langues présentes à ce
 * moment-là ; l'invité anglophone ouvrait le lien et lisait du français.
 *
 * Le double Prisma ÉVALUE le `where` (`matchesMongoWhere`) : un plancher
 * d'historique mal posé, ou une borne d'arrivée oubliée, se voit dans ce qui
 * revient — jamais dans une comparaison de la clause avec sa propre copie.
 *
 * @jest-environment node
 */

import { describe, it, expect, afterEach, jest } from '@jest/globals';

import {
  ARRIVAL_BACKFILL_DEPTH,
  ArrivalHistoryBackfill,
  backfillHistoryForArrival,
  type ArrivalBackfillDeps,
} from '../../../services/message-translation/ArrivalHistoryBackfill';
import { announceConversationLanguageChange } from '../../../services/message-translation/conversationLanguageChanges';
import { MessageTranslationService } from '../../../services/message-translation/MessageTranslationService';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

const CONV = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ARRIVEE = new Date('2026-10-08T12:00:00Z');
const minutesAvant = (n: number) => new Date(ARRIVEE.getTime() - n * 60_000);

const message = (id: string, overrides: MongoDocument = {}): MongoDocument => ({
  id,
  conversationId: CONV,
  senderId: 'p-hote',
  content: `Bonjour ${id}`,
  originalLanguage: 'fr',
  messageType: 'text',
  translations: null,
  deletedAt: null,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  ephemeralDuration: null,
  expiresAt: null,
  isEncrypted: false,
  encryptionMode: null,
  attachments: [],
  createdAt: minutesAvant(10),
  ...overrides,
});

const hote: MongoDocument = {
  role: 'creator', joinedAt: minutesAvant(60), shareLinkId: null, historyVisibleFrom: null,
  permissions: { canViewHistory: true }, anonymousSession: null, user: { role: 'USER' },
};
const invite = (overrides: MongoDocument = {}): MongoDocument => ({
  role: 'member', joinedAt: ARRIVEE, shareLinkId: 'lnk', historyVisibleFrom: null,
  permissions: null, anonymousSession: { rights: null }, user: null, ...overrides,
});

function monde(options: {
  messages: MongoDocument[];
  participants?: MongoDocument[];
  allowViewHistory?: boolean;
  conversation?: MongoDocument | null;
  linkGrantsFail?: boolean;
  clearHistoryBefore?: Date;
  hiddenMessageIds?: string[];
}) {
  const traduits: Array<{ id: string; langue: string }> = [];
  const prisma = {
    conversation: {
      findUnique: jest.fn(async () =>
        options.conversation === undefined ? { autoTranslateEnabled: true, encryptionMode: null } : options.conversation
      ),
    },
    participant: {
      findMany: jest.fn(async () => options.participants ?? [hote, invite()]),
    },
    userConversationPreferences: {
      findFirst: jest.fn(async () => (options.clearHistoryBefore ? { clearHistoryBefore: options.clearHistoryBefore } : null)),
    },
    userMessageDeletion: {
      findMany: jest.fn(async () => (options.hiddenMessageIds ?? []).map((messageId) => ({ messageId }))),
    },
    conversationShareLink: {
      findMany: jest.fn(async () => {
        if (options.linkGrantsFail) throw new Error('mongo down');
        return [{ id: 'lnk', allowViewHistory: options.allowViewHistory ?? true }];
      }),
    },
    message: {
      findMany: jest.fn(async (args: any) =>
        options.messages
          .filter((row) => matchesMongoWhere(row, args.where))
          .sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime())
          .slice(0, args.take)
      ),
    },
  };
  const deps: ArrivalBackfillDeps = {
    prisma: prisma as never,
    translate: async (m, langue) => { traduits.push({ id: m.id, langue }); },
  };
  return { prisma, deps, traduits, ids: () => traduits.map((t) => t.id) };
}

const rattraper = (deps: ArrivalBackfillDeps, language = 'en', readerUserId: string | null = null) =>
  backfillHistoryForArrival(deps, { conversationId: CONV, language, arrivedAt: ARRIVEE, readerUserId });

describe('#9709 — la langue qui arrive reçoit l’historique récent traduit', () => {
  it('traduit vers elle les messages écrits AVANT l’arrivée', async () => {
    const m = monde({ messages: [message('m1'), message('m2', { createdAt: minutesAvant(5) })] });

    await rattraper(m.deps);

    expect(m.traduits).toEqual([{ id: 'm2', langue: 'en' }, { id: 'm1', langue: 'en' }]);
  });

  it('ne retraduit pas un message qui a déjà la langue, ni un message écrit dans cette langue', async () => {
    const m = monde({
      messages: [
        message('deja', { translations: { en: { text: 'Hello' } } }),
        message('deja-region', { translations: { 'EN-us': { text: 'Hello' } } }),
        message('anglais', { originalLanguage: 'en-GB' }),
        message('a-faire'),
      ],
    });

    await rattraper(m.deps);

    expect(m.ids()).toEqual(['a-faire']);
  });

  it('laisse au chemin d’envoi les messages écrits APRÈS l’arrivée', async () => {
    const m = monde({ messages: [message('avant'), message('apres', { createdAt: new Date(ARRIVEE.getTime() + 1000) })] });

    await rattraper(m.deps);

    expect(m.ids()).toEqual(['avant']);
  });

  it(`se borne aux ${ARRIVAL_BACKFILL_DEPTH} messages texte les plus récents`, async () => {
    const messages = Array.from({ length: ARRIVAL_BACKFILL_DEPTH + 30 }, (_, i) => message(`m${i}`, { createdAt: minutesAvant(i + 1) }));
    const m = monde({ messages });

    await rattraper(m.deps);

    expect(m.traduits).toHaveLength(ARRIVAL_BACKFILL_DEPTH);
    expect(m.ids()).toContain('m0');
    expect(m.ids()).not.toContain(`m${ARRIVAL_BACKFILL_DEPTH}`);
  });

  it('un message ordinaire dont les colonnes FACULTATIVES sont absentes du document est rattrapé', async () => {
    const sansCles = message('sans-cles');
    delete sansCles.deletedAt;
    delete sansCles.expiresAt;
    delete sansCles.encryptionMode;
    delete sansCles.ephemeralDuration;
    const m = monde({ messages: [sansCles] });

    await rattraper(m.deps);

    expect(m.ids()).toEqual(['sans-cles']);
  });

  it('une langue hors catalogue ne rattrape rien — la langue d’un invité vient du corps de sa requête', async () => {
    const m = monde({ messages: [message('m1')] });

    expect(await rattraper(m.deps, 'xq')).toEqual([]);
    expect(m.prisma.message.findMany).not.toHaveBeenCalled();
  });

  it('ignore ce qui n’est pas un message texte (avis système, médias)', async () => {
    const m = monde({ messages: [message('systeme', { messageType: 'system' }), message('texte')] });

    await rattraper(m.deps);

    expect(m.ids()).toEqual(['texte']);
  });
});

describe('#9709 — FAIL-CLOSED : un message protégé ne part vers aucune langue nouvelle', () => {
  const proteges: ReadonlyArray<[string, MongoDocument]> = [
    ['vue unique', { isViewOnce: true }],
    ['vue unique par drapeau', { effectFlags: 4 }],
    ['flouté', { isBlurred: true }],
    ['flouté par drapeau', { effectFlags: 2 }],
    ['éphémère à échéance', { expiresAt: new Date('2026-10-09T00:00:00Z') }],
    ['éphémère à durée', { ephemeralDuration: 30 }],
    ['éphémère par drapeau', { effectFlags: 1 }],
    ['flamme après lecture', { effectFlags: 1 | 8 }],
    ['chiffré de bout en bout', { isEncrypted: true, encryptionMode: 'e2ee' }],
    ['chiffré sans mode déclaré', { isEncrypted: true }],
    ['mode de chiffrement déclaré', { encryptionMode: 'server' }],
    ['pièce jointe floutée', { attachments: [{ isViewOnce: false, isBlurred: true, effectFlags: 0 }] }],
    ['pièce jointe à vue unique', { attachments: [{ isViewOnce: true, isBlurred: false, effectFlags: 0 }] }],
    ['supprimé', { deletedAt: minutesAvant(1) }],
    ['drapeau de vue unique ABSENT du document', { isViewOnce: undefined }],
    ['drapeau de chiffrement ABSENT du document', { isEncrypted: undefined }],
    ['vide', { content: '   ' }],
  ];

  it.each(proteges)('%s', async (_nom, protection) => {
    const m = monde({ messages: [message('protege', protection), message('ordinaire')] });

    await rattraper(m.deps);

    expect(m.ids()).toEqual(['ordinaire']);
  });

  it('une conversation chiffrée n’est pas rattrapée du tout', async () => {
    const m = monde({ messages: [message('m1')], conversation: { autoTranslateEnabled: true, encryptionMode: 'e2ee' } });

    expect(await rattraper(m.deps)).toEqual([]);
    expect(m.prisma.message.findMany).not.toHaveBeenCalled();
  });

  it('ni une conversation où la traduction automatique est coupée', async () => {
    const m = monde({ messages: [message('m1')], conversation: { autoTranslateEnabled: false, encryptionMode: null } });

    expect(await rattraper(m.deps)).toEqual([]);
  });
});

describe('#9709 — le rattrapage respecte ce que le lecteur qui revient a masqué de SA vue', () => {
  it('ni l’historique qu’il a effacé, ni les messages qu’il a supprimés pour lui', async () => {
    const m = monde({
      messages: [
        message('avant-effacement', { createdAt: minutesAvant(40) }),
        message('supprime-pour-lui', { createdAt: minutesAvant(10) }),
        message('visible', { createdAt: minutesAvant(5) }),
      ],
      clearHistoryBefore: minutesAvant(30),
      hiddenMessageIds: ['supprime-pour-lui'],
    });

    await rattraper(m.deps, 'en', 'u-revenant');

    expect(m.ids()).toEqual(['visible']);
  });

  it('un invité sans compte n’a rien à masquer — aucune lecture de masquage', async () => {
    const m = monde({ messages: [message('m1')] });

    await rattraper(m.deps);

    expect(m.prisma.userConversationPreferences.findFirst).not.toHaveBeenCalled();
    expect(m.ids()).toEqual(['m1']);
  });
});

describe('#9709 — la traduction se diffuse à la ROOM : aucun membre ne reçoit ce qu’il n’a pas le droit de lire', () => {
  it('un invité SANS historique a pour plancher son arrivée : rien n’est rattrapé, rien n’est même lu', async () => {
    const m = monde({ messages: [message('m1'), message('m2')], allowViewHistory: false });

    expect(await rattraper(m.deps)).toEqual([]);
    expect(m.prisma.message.findMany).not.toHaveBeenCalled();
  });

  it('le plancher est APPLIQUÉ à la lecture : un message antérieur au plancher commun ne revient pas', async () => {
    const m = monde({
      messages: [message('avant', { createdAt: minutesAvant(30) })],
      participants: [hote, invite({ historyVisibleFrom: minutesAvant(20), shareLinkId: null })],
    });

    await rattraper(m.deps);

    expect(m.traduits).toEqual([]);
  });

  it('un membre déjà présent sans historique borne le rattrapage à ce qu’il voit déjà', async () => {
    const m = monde({
      messages: [message('avant-lui', { createdAt: minutesAvant(30) }), message('apres-lui', { createdAt: minutesAvant(5) })],
      participants: [hote, invite(), invite({ shareLinkId: 'lnk-ferme', joinedAt: minutesAvant(20) })],
    });
    m.prisma.conversationShareLink.findMany.mockImplementation(async () => [
      { id: 'lnk', allowViewHistory: true },
      { id: 'lnk-ferme', allowViewHistory: false },
    ]);

    await rattraper(m.deps);

    expect(m.ids()).toEqual(['apres-lui']);
  });

  it('un plancher illisible ne rattrape RIEN — la lecture qui échoue ne vaut pas « pas de plancher »', async () => {
    const m = monde({ messages: [message('m1')], linkGrantsFail: true });

    await expect(rattraper(m.deps)).rejects.toThrow('mongo down');
    expect(m.traduits).toEqual([]);
  });
});

describe('#9709 — l’arrivée annoncée déclenche le rattrapage, une fois par langue', () => {
  const ouverts: Array<{ dispose(): void } | MessageTranslationService> = [];
  afterEach(async () => {
    for (const o of ouverts.splice(0)) {
      if (o instanceof MessageTranslationService) await o.close();
      else o.dispose();
    }
  });

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  it('l’arrivée d’une langue la rattrape ; une seconde arrivée de la même langue ne relance rien', async () => {
    const m = monde({ messages: [message('m1')] });
    const backfill = new ArrivalHistoryBackfill(m.deps, () => ARRIVEE);
    ouverts.push(backfill);

    announceConversationLanguageChange({ kind: 'arrival', conversationId: CONV, language: 'EN-us', readerUserId: null });
    await flush();
    announceConversationLanguageChange({ kind: 'arrival', conversationId: CONV, language: 'en', readerUserId: null });
    await flush();

    expect(m.traduits).toEqual([{ id: 'm1', langue: 'en' }]);
  });

  it('au plus trois langues DISTINCTES par conversation et par fenêtre', async () => {
    const m = monde({ messages: [message('m1')] });
    const backfill = new ArrivalHistoryBackfill(m.deps, () => ARRIVEE);
    ouverts.push(backfill);

    for (const language of ['en', 'es', 'de', 'it']) {
      announceConversationLanguageChange({ kind: 'arrival', conversationId: CONV, language, readerUserId: null });
      await flush();
    }

    expect(m.traduits.map((t) => t.langue)).toEqual(['en', 'es', 'de']);
  });

  it('un rattrapage qui échoue n’empêche pas le suivant', async () => {
    const m = monde({ messages: [message('m1')], linkGrantsFail: true });
    const backfill = new ArrivalHistoryBackfill(m.deps, () => ARRIVEE);
    ouverts.push(backfill);

    announceConversationLanguageChange({ kind: 'arrival', conversationId: CONV, language: 'en', readerUserId: null });
    await flush();
    m.prisma.conversationShareLink.findMany.mockImplementation(async () => [{ id: 'lnk', allowViewHistory: true }]);
    announceConversationLanguageChange({ kind: 'arrival', conversationId: CONV, language: 'en', readerUserId: null });
    await flush();

    expect(m.ids()).toEqual(['m1']);
  });

  it('bout en bout dans la passerelle : l’arrivée envoie au traducteur, par le pipeline existant, l’ancien message vers la langue de l’invité', async () => {
    const ancien = message('507f1f77bcf86cd799439011');
    const m = monde({ messages: [ancien] });
    const svc = new MessageTranslationService(m.prisma as never);
    ouverts.push(svc);
    const sendTranslationRequest = jest.fn(async (_request: unknown) => 'task-1');
    (svc as unknown as { zmqClient: unknown }).zmqClient = { sendTranslationRequest, close: jest.fn(async () => undefined) };

    announceConversationLanguageChange({ kind: 'arrival', conversationId: CONV, language: 'en', readerUserId: null });
    for (let i = 0; i < 10; i += 1) await flush();

    expect(sendTranslationRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: ancien.id, conversationId: CONV, targetLanguages: ['en'], sourceLanguage: 'fr', text: ancien.content,
      })
    );
  });
});
