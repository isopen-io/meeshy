/**
 * **Le budget de mention est de CINQ par minute et par paire, et il se consomme
 * UNE fois par notification** (#17073).
 *
 * `shouldCreateMentionNotification` est un prédicat MUTANT : quand il autorise,
 * il pousse un horodatage. Et il était appelé DEUX FOIS sur le même chemin pour
 * la même paire — une fois en filtre d'éligibilité dans
 * `createMentionNotificationsBatch`, une fois en tête de
 * `createMentionNotification`, que ce même lot appelle juste après.
 *
 * Le déroulé, arithmétique (plafond 5, fenêtre vide) :
 *
 * | mention | filtre | créateur | résultat |
 * |---|---|---|---|
 * | 1 | 1 | 2 | créée |
 * | 2 | 3 | 4 | créée |
 * | 3 | 5 (passe) | `5 >= 5` ⇒ `null` | **bloquée** |
 *
 * **Le budget annoncé était 5, le budget réel était 2.** Le second appel était
 * justifié en commentaire par « la garde par destinataire reste, pour
 * l'appelant qui l'atteint en solo » — et cet appelant n'existe pas : mesuré,
 * `createMentionNotification` n'a aucun appelant de production hors de ce lot.
 *
 * **Pourquoi les témoins existants ne pouvaient pas tomber.**
 * `notifications-performance.test.ts` appelle le lot avec CINQUANTE
 * destinataires DISTINCTS : cinquante clés de paire différentes, donc deux
 * jetons chacune, donc aucun budget épuisé, cinquante notifications, VERT. Et
 * un témoin au rang 1 ne peut pas tomber non plus — la première mention passe
 * sous les deux formes. La propriété ne se voit qu'en RÉPÉTANT sur la MÊME
 * paire.
 *
 * Le second volet est le DOUBLON : la liste explicite n'était dédoublonnée
 * nulle part (ni le schéma zod, ni la troncature à `MAX_MENTIONS_PER_MESSAGE`,
 * ni `validateMentionPermissions`, qui pousse une entrée par occurrence). Une
 * charge `[victime, victime, …]` produisait donc plusieurs bannières identiques
 * pour un seul message — et épuisait le budget de la paire au passage. La table
 * `Mention` est protégée par `@@unique([messageId, mentionedUserId])` ; c'est la
 * NOTIFICATION qui ne l'était pas.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('@meeshy/shared/prisma/client', () => {
  const actual = jest.requireActual<Record<string, unknown>>('@meeshy/shared/prisma/client');
  const mockPrisma = require('../../helpers/notification-service-doubles').makeNotificationPrisma();
  return { ...actual, PrismaClient: jest.fn(() => mockPrisma) };
});
jest.mock('../../../utils/logger', () => require('../../helpers/notification-service-doubles').makeLoggerModule());
jest.mock('../../../utils/logger-enhanced', () => require('../../helpers/notification-service-doubles').makeLoggerEnhancedModule());

import { NotificationService } from '../../../services/notifications/NotificationService';
import { PrismaClient } from '@meeshy/shared/prisma/client';

const SENDER = 'sender-1';
const TARGET = 'target-1';

const commonData = {
  senderId: SENDER,
  senderUsername: 'sender',
  messageContent: 'coucou @target',
  conversationId: 'conv-1',
  conversationTitle: 'Groupe',
  messageId: 'msg-1',
  attachments: [] as never[],
};

function buildService() {
  const prisma = new PrismaClient() as never as Record<string, Record<string, jest.Mock>>;
  prisma.notificationPreference!.findUnique!.mockResolvedValue({ mentionEnabled: true });
  prisma.user!.findUnique!.mockResolvedValue({ username: 'sender', displayName: 'Sender', avatar: null });
  prisma.conversation!.findUnique!.mockResolvedValue({ id: 'conv-1', title: 'Groupe', type: 'group', avatar: null, participants: [] });
  prisma.notification!.create!.mockImplementation((args: never) =>
    Promise.resolve({ id: 'notif', ...(args as { data: object }).data, isRead: false, createdAt: new Date() }));
  prisma.notification!.findMany!.mockResolvedValue([]);
  return { service: new NotificationService(prisma as never), prisma };
}

describe('le budget de mention vaut 5 par minute et par paire (#17073)', () => {
  let harness: ReturnType<typeof buildService>;

  beforeEach(() => {
    jest.clearAllMocks();
    harness = buildService();
  });

  const notifyOnce = () =>
    harness.service.createMentionNotificationsBatch([TARGET], commonData as never, [TARGET]);

  it('cinq mentions de la même personne dans la fenêtre passent, la sixième est bloquée', async () => {
    const results: number[] = [];
    for (let i = 0; i < 6; i += 1) results.push(await notifyOnce());

    expect(results).toEqual([1, 1, 1, 1, 1, 0]);
  });

  it('une mention ne consomme qu’UN jeton — mesuré sur la ligne écrite', async () => {
    for (let i = 0; i < 5; i += 1) await notifyOnce();

    expect(harness.prisma.notification!.create!).toHaveBeenCalledTimes(5);
  });

  it('nommer la même personne plusieurs fois dans UN message ne la notifie qu’une fois', async () => {
    const count = await harness.service.createMentionNotificationsBatch(
      [TARGET, TARGET, TARGET],
      commonData as never,
      [TARGET],
    );

    expect(count).toBe(1);
    expect(harness.prisma.notification!.create!).toHaveBeenCalledTimes(1);
  });

  it('un doublon ne consomme pas le budget des autres mentions du même message', async () => {
    await harness.service.createMentionNotificationsBatch([TARGET, TARGET, TARGET], commonData as never, [TARGET]);
    const results: number[] = [];
    for (let i = 0; i < 4; i += 1) results.push(await notifyOnce());

    expect(results).toEqual([1, 1, 1, 1]);
  });

  // Négatif, vert des deux côtés : deux personnes DIFFÉRENTES ont chacune leur
  // budget. C'est la forme sous laquelle le témoin de performance existant
  // appelle le lot, et la raison pour laquelle il ne pouvait pas voir le défaut.
  it('deux destinataires distincts ont chacun leur budget', async () => {
    const count = await harness.service.createMentionNotificationsBatch(
      [TARGET, 'target-2'],
      commonData as never,
      [TARGET, 'target-2'],
    );

    expect(count).toBe(2);
  });
});
