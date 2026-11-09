/**
 * #17208 — la garde de vivacité des bannières voit les TROIS preuves de mort,
 * parce qu'elle SÉLECTIONNE la loi au lieu de retaper ses colonnes.
 *
 * `messageLivenessOf` interroge `deletedAt`, `expiresAt` et — depuis le
 * cycle 143 bis — `viewOnceBurnedAt`, et publie la liste sous
 * `MESSAGE_LIVENESS_SELECT` avec son doc-comment qui dit pourquoi :
 *
 * > **Tout consommateur doit les `select`** — le `select` est la seule des
 * > conditions qu'aucun témoin de verdict ne peut voir. Un double Prisma rend
 * > ce qu'on lui dit quel que soit le `select`, donc un témoin passe au vert
 * > sur un site dont la requête ne ramène pas les colonnes de la loi, et la
 * > garde est morte en production.
 *
 * Des quatre consommateurs, les deux du DRAIN spreadent la constante ; les deux
 * de `NotificationService` énumèrent huit colonnes à la main, sans la
 * troisième. Et le type du paramètre de `messageLiveness` ne déclarait que deux
 * colonnes : il ne POUVAIT pas faire rougir le compilateur sur une ligne qui ne
 * porte pas la troisième, puisqu'il ne la demandait pas.
 *
 * `purgeViewOnceContent` détruit le clair d'une vue unique — `content: ''`,
 * `encryptedContent: null`, `translations: null`, les fichiers — **sans écrire
 * `deletedAt`** : la bulle survit, c'est la raison d'être du module, et
 * `viewOnceBurnedAt` est la seule preuve qu'il laisse. Le lot qui l'a écrit l'a
 * dit lui-même — « `viewOnceBurnedAt` n'est lu par aucune garde de remise » —
 * puis a donné la colonne au DRAIN sans la donner aux bannières.
 *
 * > **Diagnostiquer qu'une garde est aveugle à une preuve n'est pas la rendre
 * > voyante**, et une loi qui PUBLIE son `select` n'est appliquée que par les
 * > consommateurs qui l'importent.
 *
 * Ce que ce lot corrige est un défaut de JUSTESSE, pas de confidentialité : le
 * texte d'une vue unique est masqué en amont par `protectedPreview`, son média
 * retenu par `mediaMayTravel`, son enveloppe par `deviceEnvelopeForPush`. Ce
 * qui partait est une bannière de protection et la bulle que la NSE
 * PRÉ-ENREGISTRE derrière elle, pour un contenu qui n'existe plus.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import { NotificationService } from '../../../../services/notifications/NotificationService';
import { MESSAGE_LIVENESS_SELECT } from '../../../../services/messages/message-liveness';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439051';
const REPLIED_MSG_ID = '507f1f77bcf86cd799439052';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const RECIPIENT_ID = '507f1f77bcf86cd799439043';

const SERVER_CLOCK = new Date('2026-11-09T10:00:00Z');

/** Le texte que la bannière d'une vue unique purgée ne doit pas annoncer. */
const PREVIEW = 'la photo du contrat';

const row = (overrides: Record<string, unknown> = {}) => ({
  deletedAt: null,
  expiresAt: null,
  viewOnceBurnedAt: null,
  isViewOnce: null,
  isBlurred: null,
  effectFlags: null,
  ephemeralDuration: null,
  translations: null,
  originalLanguage: 'fr',
  createdAt: SERVER_CLOCK,
  messageType: 'text',
  ...overrides,
});

function makeService(messageFindUnique: any) {
  const prisma = {
    message: { findUnique: messageFindUnique },
    notification: {
      create: jest.fn<any>().mockImplementation((args: any) => ({ id: 'notif_created', ...args.data })),
      findMany: jest.fn<any>().mockResolvedValue([]),
      findUnique: jest.fn<any>(),
      update: jest.fn<any>(),
      updateMany: jest.fn<any>(),
      delete: jest.fn<any>(),
      deleteMany: jest.fn<any>(),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    user: {
      findUnique: jest.fn<any>().mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.id === SENDER_USER_ID
            ? { id: SENDER_USER_ID, username: 'alice', displayName: 'Alice', avatar: null }
            : { id: where?.id, systemLanguage: 'fr' }
        )
      ),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({ title: 'Salon', type: 'group', avatar: null }),
    },
    participant: { findUnique: jest.fn<any>(), findMany: jest.fn<any>().mockResolvedValue([]) },
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
  return { service, sendToUser, prisma };
}

const runRegular = (service: NotificationService) =>
  service.createMessageNotification({
    recipientUserId: RECIPIENT_ID,
    senderId: SENDER_USER_ID,
    messageId: MSG_ID,
    conversationId: CONV_ID,
    messagePreview: PREVIEW,
    senderProfile: { username: 'alice', displayName: 'Alice', avatar: null },
  } as any);

const runReply = (service: NotificationService) =>
  service.createReplyNotification({
    recipientUserId: RECIPIENT_ID,
    replierUserId: SENDER_USER_ID,
    messageId: MSG_ID,
    conversationId: CONV_ID,
    messagePreview: PREVIEW,
    originalMessageId: REPLIED_MSG_ID,
    senderProfile: { username: 'alice', displayName: 'Alice', avatar: null },
  } as any);

const runMention = (service: NotificationService) =>
  service.createMentionNotificationsBatch(
    [RECIPIENT_ID],
    {
      senderId: SENDER_USER_ID,
      senderProfile: { username: 'alice', displayName: 'Alice', avatar: null },
      messageContent: PREVIEW,
      conversationId: CONV_ID,
      messageId: MSG_ID,
    } as any,
    [SENDER_USER_ID, RECIPIENT_ID]
  );

const fanOuts = (): ReadonlyArray<readonly [string, (s: NotificationService) => Promise<unknown>]> => [
  ['regular', runRegular],
  ['reply', runReply],
  ['mentions', runMention],
];

/**
 * **Les trois témoins de VERDICT qui suivent étaient VERTS avant le correctif,
 * et c'est la démonstration du lot plutôt qu'une faiblesse.**
 *
 * Un double Prisma rend ce qu'on lui dit quel que soit le `select` : la ligne de
 * fixture porte `viewOnceBurnedAt`, la loi la lit, le verdict est `gone`, et le
 * témoin passe — sur une production dont la requête ne ramenait pas la colonne.
 * C'est mot pour mot ce que `MESSAGE_LIVENESS_SELECT` documente, et le motif
 * pour lequel la liste appartient à la loi.
 *
 * Ils restent écrits parce qu'ils gardent le COMPORTEMENT (une vue unique
 * purgée ne s'annonce pas) une fois la colonne sélectionnée ; ce qui PROUVE le
 * correctif est le témoin de REQUÊTE qui les suit, et le cliquet.
 */
describe('#17208 — la troisième preuve de mort atteint les trois éventails', () => {
  it.each(fanOuts())(
    'éventail %s — une vue unique dont le contenu a été PURGÉ en vol ne pousse aucune bannière',
    async (_label, run) => {
      const { service, sendToUser, prisma } = makeService(
        jest.fn<any>().mockResolvedValue(
          // Exactement ce que `purgeViewOnceContent.writePurge` laisse : la
          // preuve, et AUCUNE des deux que la garde lisait.
          row({ viewOnceBurnedAt: new Date('2026-11-09T09:59:59Z'), isViewOnce: true, translations: null })
        )
      );

      await run(service);

      expect(sendToUser).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    }
  );

  it.each(fanOuts())(
    'éventail %s — la relecture DEMANDE les trois colonnes de la loi',
    async (_label, run) => {
      // Le témoin de verdict ci-dessus ne peut PAS voir le `select` : le double
      // rend `viewOnceBurnedAt` quoi que la requête demande. Celui-ci assert
      // sur la REQUÊTE, et c'est le seul endroit où la condition est visible.
      const findUnique = jest.fn<any>().mockResolvedValue(row());
      const { service } = makeService(findUnique);

      await run(service);

      expect(findUnique.mock.calls.length).toBeGreaterThan(0);
      for (const call of findUnique.mock.calls) {
        expect(call[0].select).toMatchObject(MESSAGE_LIVENESS_SELECT);
      }
    }
  );

  it('un message VIVANT est toujours annoncé — la garde ne referme pas le cas nominal', async () => {
    const { service, sendToUser } = makeService(jest.fn<any>().mockResolvedValue(row()));

    await expect(runReply(service)).resolves.not.toBeNull();
    expect(sendToUser).toHaveBeenCalled();
  });
});

/**
 * Le CLIQUET : un consommateur de la loi ne retape pas ses colonnes.
 *
 * Son discriminant est ÉTROIT par décision — un fichier de PRODUCTION qui
 * appelle `messageLivenessOf(` doit référencer `MESSAGE_LIVENESS_SELECT`. Il ne
 * prouve pas que le `select` de la requête est celui-là (c'est le travail des
 * témoins de requête ci-dessus, par consommateur) ; il prouve qu'aucun appelant
 * n'ignore la liste publiée. C'est la garde la moins chère qui ferme la CLASSE
 * plutôt qu'un site, et sa limite est dite plutôt que tue — le dépôt a déjà
 * JETÉ un balayage qui mesurait la popularité d'un idiome au lieu d'une
 * propriété (cycle 107).
 *
 * Quand il tombe, la réparation est de spreader la constante, jamais d'ajouter
 * une ligne à un inventaire : il n'y a pas de `select` de vivacité légitime à
 * retaper.
 */
describe('cliquet — tout appelant de la loi de vivacité référence son select', () => {
  const SRC = path.resolve(__dirname, '../../../..');

  const productionFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === '__tests__' ? [] : productionFiles(full);
      return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
    });

  it('balaie bien quelque chose — une garde négative dont le balayage rend [] reste verte', () => {
    const callers = productionFiles(SRC).filter((f) =>
      fs.readFileSync(f, 'utf8').includes('messageLivenessOf(')
    );
    // La loi elle-même + ses consommateurs : moins de trois fichiers voudrait
    // dire que le balayage ne voit plus la production.
    expect(callers.length).toBeGreaterThanOrEqual(3);
  });

  it('aucun appelant ne retape les colonnes de la loi', () => {
    const offenders = productionFiles(SRC)
      .filter((f) => {
        const source = fs.readFileSync(f, 'utf8');
        if (!source.includes('messageLivenessOf(')) return false;
        // La loi est son propre site de définition : elle DÉCLARE la constante.
        if (source.includes('export const MESSAGE_LIVENESS_SELECT')) return false;
        return !source.includes('MESSAGE_LIVENESS_SELECT');
      })
      .map((f) => path.relative(SRC, f));

    expect(offenders).toEqual([]);
  });
});
