/**
 * « L'expéditeur LIT la source » — le double des témoins de transfert qui ne
 * portent PAS sur ce droit (#9579).
 *
 * Depuis #9579 un transfert n'est admis que si son expéditeur lit la source.
 * Les témoins qui prouvent autre chose — ce que la source IMPOSE à sa copie
 * (#9572) — doivent donc poser un expéditeur qui la lit : participant actif de
 * sa conversation, sans plancher ni masquage, aucun décompte lancé, aucune vue
 * unique ouverte.
 *
 * Ce double répond « oui » sans évaluer la requête : il ne prouve RIEN du
 * droit de lire. Ce droit a ses témoins, sur une base qui évalue les `where` :
 * `MessagingService.forwardSourceAccess.test.ts` et
 * `services/messaging/__tests__/forwardSourceReadAccess.test.ts`.
 *
 * Il vit ici, et non dans la suite qui s'en sert : `MessagingService.test.ts`
 * est hors budget de taille, on n'y ajoute pas.
 */
import { jest } from '@jest/globals';

const SOURCE_CONVERSATION_ID = '507f1f77bcf86cd799439098';
const SOURCE_AUTHOR_ID = '507f1f77bcf86cd799439097';
const SENDER_IN_SOURCE_ID = '507f1f77bcf86cd799439096';

/** Les colonnes que le droit de lire demande à la ligne de la source. */
export const readableForwardSource = (id: string) => ({
  id,
  conversationId: SOURCE_CONVERSATION_ID,
  createdAt: new Date('2026-08-12T11:00:00.000Z'),
  deletedAt: null,
  senderId: SOURCE_AUTHOR_ID,
  viewOnceBurnedAt: null,
});

type ForwardSourceReaderDouble = {
  participant: { findFirst: { mockResolvedValue(value: unknown): unknown } };
  userConversationPreferences?: unknown;
  userMessageDeletion?: unknown;
  messageStatusEntry?: unknown;
};

/** Arme un faux Prisma de suite : l'expéditeur est participant actif de la conversation de la source. */
export function armForwardSourceReader(prisma: ForwardSourceReaderDouble): void {
  prisma.participant.findFirst.mockResolvedValue({
    id: SENDER_IN_SOURCE_ID,
    role: 'member',
    joinedAt: new Date('2026-01-01T00:00:00.000Z'),
    shareLinkId: null,
    historyVisibleFrom: null,
    permissions: null,
    anonymousSession: null,
    user: { role: 'USER' },
  });
  prisma.userConversationPreferences = { findFirst: jest.fn<() => Promise<null>>().mockResolvedValue(null) };
  prisma.userMessageDeletion = { findMany: jest.fn<() => Promise<never[]>>().mockResolvedValue([]) };
  prisma.messageStatusEntry = { findFirst: jest.fn<() => Promise<null>>().mockResolvedValue(null) };
}
