/**
 * `FocalRow` est la SECONDE surface qui rend le corps d'un message, et elle
 * appelle `mentionsToLinks` elle-même plutôt que par `useMessageDisplay` — son
 * texte vient de `resolveFocalMessageDisplay`, un autre chemin de Prisme.
 *
 * Elle doit donc recevoir la même carte de noms que la bulle : sans cela, un
 * message se lirait « @Jean Dupont » en vue Bulles et « @jdupont42 » en vue
 * Focal — une divergence PIRE que le défaut d'origine, parce qu'elle est
 * intermittente et se lit comme un bug d'affichage plutôt que comme un manque
 * (#7458). Le lien, lui, vise toujours le handle : c'est le seul segment qui
 * désigne une route.
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FocalRow, type FocalDensity } from '../FocalRow';
import type { Message, User } from '@meeshy/shared/types';

const currentUser = { id: 'me' } as Pick<User, 'id'>;
const BOTH_DENSITIES: readonly FocalDensity[] = ['focal', 'script'];

const jean = { userId: 'u1', username: 'jdupont42', displayName: 'Jean Dupont', avatar: null };

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    conversationId: 'c1',
    senderId: 'other',
    content: 'salut @jdupont42',
    originalLanguage: 'en',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    createdAt: new Date('2026-09-22T10:00:00Z'),
    timestamp: new Date('2026-09-22T10:00:00Z'),
    translations: [],
    validatedMentions: ['jdupont42'],
    sender: { id: 'other', conversationId: 'c1', type: 'user', displayName: 'Alice' } as unknown,
    ...overrides,
  } as Message;
}

function renderRow(message: Message, density: FocalDensity) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <FocalRow
        message={message}
        previousMessage={null}
        currentUser={currentUser}
        density={density}
        preferredLanguages={['en']}
        time="10:00"
        youLabel="Toi"
        conversationId="c1"
      />
    </QueryClientProvider>
  );
}

describe('FocalRow — le nom affiché d’une mention', () => {
  BOTH_DENSITIES.forEach((density) => {
    it(`[${density}] rend le nom de la personne quand la résolution accompagne le message`, () => {
      renderRow(makeMessage({ mentionedUsers: [jean] }), density);
      expect(screen.getByTestId('focal-row').textContent).toContain('@Jean Dupont');
    });

    it(`[${density}] rend le handle quand aucune résolution n’accompagne le message`, () => {
      renderRow(makeMessage(), density);
      expect(screen.getByTestId('focal-row').textContent).toContain('@jdupont42');
    });
  });
});
