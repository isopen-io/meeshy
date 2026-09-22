/**
 * La résolution serveur des `@pseudo` doit atteindre la bulle par les DEUX
 * chemins d'arrivée d'un message, sinon un message reçu en direct se lit
 * autrement qu'une fois rechargé — le handle d'un côté, le nom de l'autre (#7458).
 *
 * Les deux chemins ne la portent pas au même endroit, et c'est le serveur qui
 * en décide : en REST, `resolveMentionedUsers` agrège pour la PAGE entière
 * (`meta.mentionedUsers` de `GET /conversations/:id/messages`) ; sur le socket,
 * `MessageHandler` la pose sur le message diffusé. Les deux transformateurs la
 * déposent sous la même clé, pour que la bulle n'ait qu'UNE forme à lire.
 */
import { transformersService } from '@/services/conversations/transformers.service';

const jean = {
  userId: 'u1',
  username: 'jdupont42',
  displayName: 'Jean Dupont',
  avatar: null,
};

const rawMessage = {
  id: 'm1',
  content: 'salut @jdupont42',
  senderId: 'p1',
  conversationId: 'c1',
  originalLanguage: 'fr',
  messageType: 'text',
  createdAt: '2026-09-22T10:00:00.000Z',
  updatedAt: '2026-09-22T10:00:00.000Z',
  validatedMentions: ['jdupont42'],
  sender: { id: 'u2', username: 'alice' },
};

describe('chemin REST — la résolution de mention de la page atteint le message', () => {
  it('dépose sur le message les personnes résolues par la réponse', () => {
    const message = transformersService.transformMessageData(rawMessage, {
      mentionedUsers: [jean],
    });
    expect(message.mentionedUsers).toEqual([jean]);
  });

  it('laisse le champ absent quand la réponse ne résout personne', () => {
    const message = transformersService.transformMessageData({ ...rawMessage, id: 'm2' });
    expect(message.mentionedUsers).toBeUndefined();
  });

  it('préfère la résolution portée par le message à celle de la page', () => {
    const surLeMessage = { ...jean, displayName: 'Jean D.' };
    const message = transformersService.transformMessageData(
      { ...rawMessage, id: 'm3', mentionedUsers: [surLeMessage] },
      { mentionedUsers: [jean] },
    );
    expect(message.mentionedUsers).toEqual([surLeMessage]);
  });
});
