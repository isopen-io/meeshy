/**
 * #17080 — **l'enveloppe de l'APPAREIL voyage sur les TROIS éventails**.
 *
 * Dans un groupe chiffré de bout en bout, un message ordinaire arrive avec son
 * texte déchiffré sur l'écran verrouillé. Une RÉPONSE ou une MENTION y restait
 * « 🔒 💬 » à vie : seul le lot `regular` portait
 * `deviceEnvelopeForPush(message, conversation.encryptionMode)`.
 *
 * ─── Pourquoi ce champ a échappé à quatre cycles de convergence ──────────────
 *
 * Les cycles 125 bis → 128 ont fait converger le TEXTE, l'HORLOGE, le VERROU et
 * le MÉDIA des trois éventails. `encryptedContent` **ne compose aucune
 * chaîne** : ce n'est ni un texte, ni un qualificatif de texte, c'est la charge
 * que le LECTEUR déchiffre. Il ne se trouve donc pas en cherchant « qui compose
 * ce corps ? » — c'est la leçon du cycle 126, mot pour mot, sur un champ de plus.
 *
 * ─── Ce que l'absence coûtait, mesuré sur la NSE ─────────────────────────────
 *
 * `applyBodyRewrites` (`apps/ios/MeeshyNotificationExtension/`) ne remplace le
 * corps par le clair que si `userInfo["encryptedContent"]` est NON VIDE. Et son
 * repli — rendre le placeholder depuis le catalogue de l'extension — exige
 * `isEncryptedPush`, qui accepte `userInfo["isEncrypted"]`… **un champ que la
 * charge push ne porte pas** (vérifié : aucune occurrence dans ce que
 * `createNotification` assemble). `isEncryptedPush` est donc dérivé du SEUL
 * `encryptedContent`, et avec `''` **aucune des deux branches ne tire**.
 *
 * ─── Le témoin en clair ne peut pas tomber ───────────────────────────────────
 *
 * `deviceEnvelopeForPush` rend `undefined` hors E2EE : les trois éventails sont
 * alors identiques, et un témoin posé là rendrait le même verdict avant et
 * après. Celui qui MESURE est donc en `encryptionMode: 'e2ee'`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { deviceEnvelopeForPush, notifyMessageRecipients } from '../../../../services/messaging/messageNotificationFanOut';
import { NotificationService } from '../../../../services/notifications/NotificationService';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439051';
const SENDER_PART_ID = '507f1f77bcf86cd799439031';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const REPLIED_TO = 'auteur-du-message-cite';
const MENTIONED = 'la-personne-mentionnee';
const ORDINAIRE = 'un-membre-ordinaire';
const REPLIED_TO_PART_ID = '507f1f77bcf86cd799439061';
const REPLIED_TO_MSG_ID = '507f1f77bcf86cd799439052';

/** L'enveloppe que l'appareil a scellée — ce que la NSE ouvre avec ses clés. */
const ENVELOPPE = 'eyJ2IjoxLCJjdCI6ImJhc2U2NC1zY2VsbGUtcGFyLWwtYXBwYXJlaWwifQ==';

const MEMBERS = [REPLIED_TO, MENTIONED, ORDINAIRE];

function makePrisma(mode: string) {
  return {
    participant: {
      // DEUX appelants, et ils ne demandent pas la même personne : l'identité de
      // l'ACTEUR, puis l'auteur du message CITÉ. Un double qui rend la même
      // ligne aux deux fait de l'auteur cité l'expéditeur lui-même, et
      // `owesReplyNotification` devient faux — l'éventail `reply` ne part pas,
      // et le témoin passe pour un défaut de production.
      findUnique: jest.fn<any>().mockImplementation(async (args: any) =>
        args?.where?.id === REPLIED_TO_PART_ID
          ? { userId: REPLIED_TO }
          : { userId: SENDER_USER_ID, displayName: 'Alice', avatar: null },
      ),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({ username: 'alice', displayName: 'Alice', avatar: null }),
      findMany: jest.fn<any>().mockResolvedValue(MEMBERS.map((id) => ({ id, username: id }))),
    },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({
        title: 'Le groupe scellé',
        type: 'group',
        encryptionMode: mode,
        participants: [SENDER_USER_ID, ...MEMBERS].map((userId) => ({ userId })),
      }),
    },
    message: {
      findUnique: jest.fn<any>().mockImplementation(async (args: any) =>
        args?.where?.id === REPLIED_TO_MSG_ID
          ? { senderId: REPLIED_TO_PART_ID }
          : { deletedAt: null },
      ),
    },
    notification: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    mention: { findMany: jest.fn<any>().mockResolvedValue([{ mentionedUserId: MENTIONED }]) },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
}

const message = (mode: string, envelope: string | null) => ({
  id: MSG_ID,
  messageType: 'text',
  replyToId: REPLIED_TO_MSG_ID,
  isEncrypted: mode === 'e2ee',
  encryptionMode: mode,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  expiresAt: null,
  createdAt: new Date('2026-11-08T21:05:00Z'),
  encryptedContent: envelope,
});

/**
 * Les TROIS éventails, et ce que chacun reçoit. Seules les créations sont
 * doublées : le reste de l'unité — la composition de l'aperçu, la base du
 * Prisme, le verrou de protection — est celui de la production.
 */
function captureFanOuts() {
  const vus: Record<string, Record<string, unknown>> = {};
  return {
    vus,
    service: {
      createMessageNotification: jest.fn<any>(async (params: Record<string, unknown>) => {
        vus['regular'] = params;
        return { id: 'n-regular' };
      }),
      createReplyNotification: jest.fn<any>(async (params: Record<string, unknown>) => {
        vus['reply'] = params;
        return { id: 'n-reply' };
      }),
      createMentionNotificationsBatch: jest.fn<any>(async (ids: string[], common: Record<string, unknown>) => {
        vus['mentions'] = common;
        return ids.length;
      }),
    },
  };
}

async function fanOut(mode: string, envelope: string | null) {
  const { vus, service } = captureFanOuts();
  await notifyMessageRecipients({
    prisma: makePrisma(mode) as any,
    notificationService: service as any,
    message: message(mode, envelope) as any,
    senderParticipantId: SENDER_PART_ID,
    conversationId: CONV_ID,
    processedContent: `bonjour @${MENTIONED}`,
    validatedMentionUserIds: [MENTIONED],
  });
  return vus;
}

describe('l’enveloppe de l’appareil voyage sur les trois éventails (#17080)', () => {
  it('en E2EE, la RÉPONSE et la MENTION portent la même enveloppe que le message simple', async () => {
    const vus = await fanOut('e2ee', ENVELOPPE);

    expect(Object.keys(vus).sort()).toEqual(['mentions', 'regular', 'reply']);
    expect(vus['regular']?.['encryptedContent']).toBe(ENVELOPPE);
    expect(vus['reply']?.['encryptedContent']).toBe(ENVELOPPE);
    expect(vus['mentions']?.['encryptedContent']).toBe(ENVELOPPE);
  });

  /**
   * Témoin NÉGATIF, vert des DEUX côtés par construction, et c'est dit pour
   * qu'on ne le lise pas comme une mesure : `deviceEnvelopeForPush` rend
   * `undefined` hors E2EE, donc la forme juste et le défaut rendent la même
   * charge. Son rôle est d'interdire qu'on paie le correctif en faisant voyager
   * un chiffré AU REPOS — celui que seule la passerelle peut ouvrir.
   */
  it('en mode serveur, AUCUN des trois ne porte d’enveloppe', async () => {
    const vus = await fanOut('server', 'chiffre-au-repos-sous-la-cle-de-conversation');

    expect(vus['regular']?.['encryptedContent']).toBeUndefined();
    expect(vus['reply']?.['encryptedContent']).toBeUndefined();
    expect(vus['mentions']?.['encryptedContent']).toBeUndefined();
  });

  /** La règle elle-même, énoncée une fois — les trois éventails l'appellent. */
  it('la règle est UNE : le mode de la LIGNE décide, la conversation ne supplée qu’une ligne muette', () => {
    expect(deviceEnvelopeForPush({ encryptedContent: ENVELOPPE, encryptionMode: 'e2ee' }, 'server')).toBe(ENVELOPPE);
    expect(deviceEnvelopeForPush({ encryptedContent: ENVELOPPE, encryptionMode: 'server' }, 'e2ee')).toBeUndefined();
    expect(deviceEnvelopeForPush({ encryptedContent: ENVELOPPE, encryptionMode: null }, 'e2ee')).toBe(ENVELOPPE);
    expect(deviceEnvelopeForPush({ encryptedContent: null, encryptionMode: 'e2ee' }, 'e2ee')).toBeUndefined();
  });
});

/**
 * ─── Et la seconde moitié : qui AFFICHE ce que l'éventail REMET ? ────────────
 *
 * Les témoins ci-dessus prouvent que les trois lots REÇOIVENT l'enveloppe. Ils
 * ne prouvent pas qu'elle part sur le FIL — et le dépôt a déjà payé exactement
 * cette distinction au cycle 122 : une descente de Prisme correcte alimentait
 * deux champs **qu'aucun client ne lisait**, et le symptôme visé survivait une
 * couche plus bas.
 *
 * Ces témoins-ci traversent `createNotification` jusqu'à `payload.data`.
 */
function makeServiceFor(mode: string) {
  const prisma = {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({
        deletedAt: null,
        expiresAt: null,
        createdAt: new Date('2026-11-08T21:05:00Z'),
        messageType: 'text',
        translations: null,
        originalLanguage: 'fr',
      }),
    },
    notification: {
      create: jest.fn<any>().mockImplementation((args: any) => ({ id: 'notif', ...args.data })),
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    user: {
      findUnique: jest.fn<any>().mockImplementation(({ where }: any) =>
        Promise.resolve({ id: where?.id, username: 'bob', displayName: 'Bob', avatar: null, systemLanguage: 'fr' }),
      ),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({ title: 'Le groupe scellé', type: 'group', avatar: null, encryptionMode: mode }),
    },
    userPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any;

  const sendToUser = jest.fn<any>().mockResolvedValue(undefined);
  const service = new NotificationService(prisma);
  service.setSocketIO({
    to: jest.fn<any>().mockReturnThis(),
    in: jest.fn<any>().mockReturnThis(),
    fetchSockets: jest.fn<any>().mockResolvedValue([]),
    emit: jest.fn<any>(),
  } as any);
  service.setPushNotificationService({ sendToUser } as any);
  return { service, sendToUser };
}

const pushData = (sendToUser: any): Record<string, any> | undefined =>
  sendToUser.mock.calls[0]?.[0]?.payload?.data;

const producteurs = [
  ['createMessageNotification', (s: NotificationService, envelope: string) =>
    s.createMessageNotification({
      recipientUserId: ORDINAIRE, senderId: SENDER_USER_ID, messageId: MSG_ID,
      conversationId: CONV_ID, messagePreview: 'bonjour', encryptedContent: envelope,
    } as any)],
  ['createReplyNotification', (s: NotificationService, envelope: string) =>
    s.createReplyNotification({
      recipientUserId: REPLIED_TO, replierUserId: SENDER_USER_ID, messageId: MSG_ID,
      conversationId: CONV_ID, messagePreview: 'bonjour', originalMessageId: REPLIED_TO_MSG_ID,
      encryptedContent: envelope,
    } as any)],
  ['createMentionNotification', (s: NotificationService, envelope: string) =>
    s.createMentionNotification({
      mentionedUserId: MENTIONED, mentionerUserId: SENDER_USER_ID, messageId: MSG_ID,
      conversationId: CONV_ID, messagePreview: 'bonjour', encryptedContent: envelope,
    } as any)],
] as const;

describe.each(producteurs)('%s — l’enveloppe atteint le FIL, pas seulement la méthode', (_nom, run) => {
  it('la charge push porte `encryptedContent`', async () => {
    const { service, sendToUser } = makeServiceFor('e2ee');

    await run(service, ENVELOPPE);

    expect(pushData(sendToUser)?.encryptedContent).toBe(ENVELOPPE);
  });

  /**
   * Le mode PRIVÉ (`showPreview: false`) retire TOUT champ porteur de contenu,
   * et l'enveloppe en est un : la NSE réécrit le corps depuis elle sans
   * condition, donc l'embarquer vaincrait le mode. Ce témoin garde le verrou
   * que le lot NE doit pas desserrer.
   */
  it('en mode privé, elle ne voyage PAS', async () => {
    const { service, sendToUser } = makeServiceFor('e2ee');
    (service as any).prisma.userPreferences.findUnique.mockResolvedValue({ notification: { showPreview: false } });

    await run(service, ENVELOPPE);

    expect(pushData(sendToUser)).not.toHaveProperty('encryptedContent');
  });
});
