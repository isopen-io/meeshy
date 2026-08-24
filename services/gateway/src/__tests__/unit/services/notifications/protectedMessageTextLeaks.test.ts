/**
 * Cycle 123 bis — « cette entité a-t-elle une JUMELLE ? », posée AU MOMENT du
 * correctif plutôt que des cycles plus tard.
 *
 * Le lot précédent a fermé la fuite du fil push sur les trois éventails de
 * `messageNotificationFanOut`. La question de `/services/gateway/CLAUDE.md` en
 * a rendu trois autres, et la mesure qui les explique tient en une ligne :
 * **`protectedPreview()` n'avait qu'UN SEUL appelant de production dans tout le
 * dépôt** (`messageNotificationFanOut.ts`). Tout ce qui ne passe pas par cet
 * éventail copiait le texte du message sans masque.
 *
 * Les trois sites, et ce qu'ils exposent :
 *
 *  1. `createReactionNotification` — relit `Message.content` LUI-MÊME
 *     (`select: { content, expiresAt }` : les drapeaux de protection ne sont
 *     même pas chargés) et en pousse 100 caractères dans le corps de la
 *     bannière ET dans `metadata.messageContent`. Destinataire : l'AUTEUR du
 *     message. Il connaît son texte — mais la protection ne parle pas de qui
 *     sait, elle parle de ce qui s'affiche : un message éphémère ou flouté n'a
 *     rien à faire sur un écran verrouillé, fût-il celui de son auteur.
 *
 *  2. `notifyNewlyMentioned` (édition) — passe le contenu ÉDITÉ brut à
 *     `createMentionNotificationsBatch`, sans masque et sans base de Prisme.
 *     Destinataires : les ENTRANTS, des TIERS. Éditer un message à vue unique
 *     pour y nommer quelqu'un lui poussait le texte en clair.
 *
 *  3. `reproduceEditedMessageNotifications` — réécrit la copie dénormalisée de
 *     TOUTES les lignes du message avec le contenu brut. Destinataires : tous
 *     ceux déjà notifiés, des TIERS. Le placeholder correctement masqué à la
 *     création était REMPLACÉ par le vrai texte à la première édition, puis
 *     réannoncé (`notification:deleted` + `notification:new`).
 *
 * Les sites 2 et 3 fuient vers des tiers ; c'est la moitié chère. Mesuré au
 * passage : rien n'interdit d'éditer un message protégé (`messageEditAdmission`
 * et `messageEditContent` ne portent aucune occurrence de `isViewOnce`,
 * `isBlurred`, `effectFlags` ni `expiresAt`).
 *
 * Ces témoins assertent sur la charge SERVIE — la ligne écrite et le corps du
 * push —, jamais sur un calcul intermédiaire.
 *
 * @jest-environment node
 */
import { NotificationService } from '../../../../services/notifications/NotificationService';
import { reproduceEditedMessageNotifications } from '../../../../services/messaging/reproduceEditedMessageNotifications';
import { reconcileEditedMentions } from '../../../../services/messaging/messageMentions';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

const AUTHOR_ID = '507f1f77bcf86cd799439041';
const REACTOR_ID = '507f1f77bcf86cd799439042';
const NEWCOMER_ID = '507f1f77bcf86cd799439043';
const MSG_ID = '507f1f77bcf86cd799439051';
const CONV_ID = '507f1f77bcf86cd799439022';

/** Le SECRET : aucun témoin de ce fichier ne doit le retrouver sur un fil. */
const SECRET = 'le code du coffre est 4242';

/**
 * Un message à VUE UNIQUE porteur de texte. `isEncrypted: false` est
 * délibéré et c'est le cœur de l'atteignabilité : le pipeline de traduction
 * n'a aucun gate sur ces drapeaux, et `MessageProcessor` ne vide `content` que
 * pour un message CHIFFRÉ. Un message protégé non chiffré porte donc bien son
 * texte en clair en base.
 */
const protectedMessage = {
  content: SECRET,
  expiresAt: null,
  isViewOnce: true,
  isBlurred: false,
  isEncrypted: false,
  encryptionMode: null,
  effectFlags: 0,
  messageType: 'text',
  createdAt: new Date('2026-08-24T10:00:00Z'),
};

const plainMessage = { ...protectedMessage, isViewOnce: false };

// ── Site 1 — la réaction ────────────────────────────────────────────────────

const makeReactionPrisma = (message: Record<string, unknown>) => ({
  message: { findUnique: jest.fn().mockResolvedValue(message) },
  user: {
    findUnique: jest.fn().mockResolvedValue({
      id: REACTOR_ID, username: 'bob', displayName: 'Bob', avatar: null,
      systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
    }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  conversation: { findUnique: jest.fn().mockResolvedValue({ title: 'Salon', type: 'group' }) },
  notification: {
    create: jest.fn().mockImplementation((args: any) => ({ id: 'notif_x', ...args.data })),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  userConversationPreferences: { findUnique: jest.fn().mockResolvedValue(null) },
  userPreferences: { findUnique: jest.fn().mockResolvedValue(null) },
}) as any;

const runReaction = async (message: Record<string, unknown>) => {
  const prisma = makeReactionPrisma(message);
  const sendToUser = jest.fn().mockResolvedValue(undefined);
  const service = new NotificationService(prisma);
  service.setSocketIO({ to: jest.fn().mockReturnThis(), in: jest.fn().mockReturnThis(), fetchSockets: jest.fn().mockResolvedValue([]), emit: jest.fn() } as any);
  service.setPushNotificationService({ sendToUser } as any);

  const notification = await service.createReactionNotification({
    messageAuthorId: AUTHOR_ID,
    reactorUserId: REACTOR_ID,
    messageId: MSG_ID,
    conversationId: CONV_ID,
    reactionEmoji: '🔥',
  });

  return { notification, push: sendToUser.mock.calls[0]?.[0]?.payload };
};

describe('createReactionNotification — le texte d’un message PROTÉGÉ ne part pas', () => {
  it('n’écrit aucun extrait dans le corps servi', async () => {
    const { notification, push } = await runReaction(protectedMessage);

    expect((notification as any)?.content).not.toContain(SECRET);
    expect(push?.body).not.toContain(SECRET);
  });

  it('n’écrit aucun extrait dans metadata.messageContent', async () => {
    // La copie DÉNORMALISÉE, que l'inbox in-app relit — l'autre moitié, et
    // celle qui SURVIT au push : elle reste en base.
    const { notification } = await runReaction(protectedMessage);

    expect(JSON.stringify((notification as any)?.metadata ?? {})).not.toContain(SECRET);
  });

  it('nomme quand même la réaction — le masque retire l’extrait, pas la notification', async () => {
    // Mode d'échec du CORRECTIF : masquer ne doit pas supprimer l'annonce.
    const { notification } = await runReaction(protectedMessage);

    expect(notification).not.toBeNull();
    expect((notification as any)?.content).toContain('🔥');
  });

  it('témoin — un message ORDINAIRE garde son extrait', async () => {
    // Sans lui, un masque appliqué à tout le monde passerait pour un correctif.
    const { notification } = await runReaction(plainMessage);

    expect((notification as any)?.content).toContain(SECRET);
  });
});

// ── Site 2 — les entrants d'une édition ─────────────────────────────────────

const makeMentionPrisma = () => ({
  message: {
    findUnique: jest.fn().mockResolvedValue(protectedMessage),
    update: jest.fn().mockResolvedValue({}),
  },
  participant: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue({ userId: AUTHOR_ID }),
  },
  user: {
    findUnique: jest.fn().mockResolvedValue({ username: 'alice', displayName: 'Alice', avatar: null }),
    findMany: jest.fn().mockResolvedValue([{ id: NEWCOMER_ID, username: 'bob' }]),
  },
  mention: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn(), deleteMany: jest.fn() },
  conversation: {
    findUnique: jest.fn().mockResolvedValue({
      participants: [{ userId: AUTHOR_ID }, { userId: NEWCOMER_ID }],
    }),
  },
}) as any;

describe('notifyNewlyMentioned — un ENTRANT nommé par édition ne reçoit pas le texte protégé', () => {
  const runEdit = async () => {
    const createMentionNotificationsBatch = jest.fn().mockResolvedValue(1);

    await reconcileEditedMentions({
      prisma: makeMentionPrisma(),
      mentionService: {
        extractMentionsWithParticipants: jest.fn().mockReturnValue([]),
        resolveUsernames: jest.fn().mockResolvedValue(new Map()),
        validateMentionPermissions: jest.fn().mockResolvedValue({ validUserIds: [NEWCOMER_ID] }),
        createMentions: jest.fn().mockResolvedValue(undefined),
      } as any,
      notificationService: { createMentionNotificationsBatch } as any,
      message: { id: MSG_ID, conversationId: CONV_ID, senderId: 'part_author', expiresAt: null },
      content: SECRET,
      explicitMentionedUserIds: [NEWCOMER_ID],
      editorUserId: AUTHOR_ID,
    });

    return createMentionNotificationsBatch.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
  };

  it('ne passe pas le contenu brut comme aperçu', async () => {
    const commonData = await runEdit();

    expect(commonData).toBeDefined();
    expect(commonData?.messageContent).not.toContain(SECRET);
  });

  it('déclare la base PROTÉGÉE — sinon le Prisme y réinjecterait la traduction', async () => {
    // Le masque du TEXTE ne suffit pas : sans base déclarée,
    // `createMentionNotification` retombe sur `message-content` et
    // `Message.translations` porte la traduction du même secret.
    const commonData = await runEdit();

    expect(commonData?.previewBasis).toEqual({ kind: 'protected-placeholder' });
  });
});

// ── Site 3 — la reproduction après édition ──────────────────────────────────

const makeReproducePrisma = (message: Record<string, unknown> | null) => {
  const rows = [
    {
      id: 'notif_1',
      userId: NEWCOMER_ID,
      type: 'new_message',
      content: '👁️ 💬',
      context: { messageId: MSG_ID, notificationLocKey: 'notification.view_once_message' },
      metadata: { messagePreview: '👁️ 💬' },
    },
  ];
  return {
    prisma: {
      message: { findUnique: jest.fn().mockResolvedValue(message) },
      notification: {
        findMany: jest.fn().mockResolvedValue(rows),
        update: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: args.where.id })),
      },
    } as any,
    written: (p: any) => p.notification.update.mock.calls.map((c: any[]) => c[0].data),
  };
};

describe('reproduceEditedMessageNotifications — une édition ne DÉMASQUE pas un message protégé', () => {
  it('ne réécrit ni le corps ni l’aperçu d’une ligne masquée', async () => {
    const { prisma, written } = makeReproducePrisma(protectedMessage);

    await reproduceEditedMessageNotifications(prisma, { messageId: MSG_ID, content: SECRET }, undefined);

    expect(JSON.stringify(written(prisma))).not.toContain(SECRET);
  });

  it('témoin — un message ORDINAIRE voit bien sa copie rafraîchie', async () => {
    // La raison d'être de l'unité : sans ce témoin, « ne rien réécrire jamais »
    // passerait le témoin ci-dessus.
    const { prisma, written } = makeReproducePrisma(plainMessage);

    await reproduceEditedMessageNotifications(
      prisma,
      { messageId: MSG_ID, content: 'texte corrigé' },
      undefined
    );

    expect(JSON.stringify(written(prisma))).toContain('texte corrigé');
  });
});
