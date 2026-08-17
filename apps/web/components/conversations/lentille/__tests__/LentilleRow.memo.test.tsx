/**
 * REV-4/R4-6 — « memo `LentilleRow` annulé par onClick littéral ».
 *
 * `LentilleRow` est enveloppé dans `memo(…)`, mais un memo n'existe qu'au
 * point d'APPEL : il compare les props que le parent lui donne. Le point de
 * montage passait `onClick={() => onSelectConversation(conversation)}` — une
 * fonction NEUVE à chaque rendu du parent, donc une prop toujours différente,
 * donc un memo qui ne refuse jamais rien. Vingt rangs se re-rendaient à chaque
 * frappe typing d'un seul, à chaque publication de brouillon, à chaque
 * changement de sélection. Le `memo` était décoratif.
 *
 * Le remède est le patron déjà en place dans le dépôt pour une rangée
 * mémoïsée (`ConversationGroup` / `ConversationItem`) : le parent passe un
 * rappel STABLE plus des données, et c'est l'enfant qui referme dessus avec
 * son propre `useCallback`. `LentilleRow` reçoit donc `onSelect`
 * (`(conversation) => void`, mémoïsé une fois chez `ConversationList`) et
 * construit lui-même son `handleClick`.
 *
 * Ces témoins comptent les rendus RÉELS de la rangée — pas la présence du mot
 * `memo` dans le fichier. Le compteur est posé sur `LentillePeek`, l'enfant
 * que `LentilleRow` rend toujours : s'il est appelé une deuxième fois pour un
 * même rang, c'est que la rangée a re-rendu.
 *
 * Témoin de discrimination inclus : un memo qui refuserait TOUT serait pire
 * que pas de memo. Les deux derniers cas prouvent que la rangée re-rend bien
 * quand une prop qui la concerne change (sélection, typing).
 */
import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AvatarImage: () => null,
}));

jest.mock('@/stores/user-store', () => ({
  useUserById: jest.fn(() => null),
  useUserStatusTick: jest.fn(),
}));

jest.mock('@/hooks/use-resolved-theme', () => ({ useResolvedTheme: () => 'light' }));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, isLoading: false }),
}));

jest.mock('@/hooks/lentille/use-lentille-list-typing', () => ({
  useLentilleListTyping: () => mockTypingMap,
}));

let mockBridgeMap = new Map<string, unknown>();
jest.mock('@/hooks/lentille/use-lentille-bridges', () => ({
  useLentilleBridges: () => mockBridgeMap,
}));

jest.mock('@/stores/conversation-ui-store', () => ({
  useConversationUIStore: (selector: (state: unknown) => unknown) => selector({ draftMessages: {} }),
}));

/**
 * Le compteur : `LentillePeek` est le wrapper interne que `LentilleRow` rend
 * systématiquement. Un rendu de plus ici = un rendu de plus de la rangée.
 */
const peekRenders = new Map<string, number>();
jest.mock('../LentillePeek', () => ({
  LentillePeek: ({ conversation, children, wrapperRef }: {
    conversation: { id: string };
    children?: React.ReactNode;
    wrapperRef?: (el: HTMLDivElement | null) => void;
  }) => {
    peekRenders.set(conversation.id, (peekRenders.get(conversation.id) ?? 0) + 1);
    return <div ref={wrapperRef}>{children}</div>;
  },
}));

let mockTypingMap = new Map<string, unknown>();

import { LentilleConversationListMount } from '../LentilleConversationListMount';

const makeUser = (): User =>
  ({
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    email: 'alice@example.com',
    role: 'USER',
    systemLanguage: 'fr',
  }) as unknown as User;

const conv = (id: string): Conversation =>
  ({
    id,
    type: 'group',
    title: `Conv ${id}`,
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 3,
    participants: [],
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    lastMessageAt: new Date('2026-08-16T09:00:00.000Z'),
    unreadCount: 0,
  }) as unknown as Conversation;

/**
 * Les conversations sont construites UNE FOIS : un parent qui recrée ses
 * objets de données à chaque rendu invaliderait le memo pour une raison qui
 * n'a rien à voir avec R4-6, et le témoin ne prouverait plus rien.
 */
const conversations = [conv('a'), conv('b'), conv('c')];
const currentUser = makeUser();
const t = (key: string) => key;
const onSelectConversation = jest.fn();

const props = {
  currentUserId: 'user-1',
  currentUser,
  conversations,
  selectedConversationId: null as string | null,
  onSelectConversation,
  preferencesMap: new Map(),
  categories: [],
  isLoading: false,
  t,
};

describe('LentilleRow — le memo est EFFECTIF (R4-6)', () => {
  beforeEach(() => {
    peekRenders.clear();
    mockTypingMap = new Map();
    mockBridgeMap = new Map();
    onSelectConversation.mockClear();
  });

  it('un rang ne se rend QU’UNE fois au montage (le parent publie sa cible, les rangs ne bougent pas)', () => {
    render(<LentilleConversationListMount {...props} />);

    // AVANT R4-6 : 2 — le rendu de publication du conteneur (ref par callback,
    // B1) re-rendait chaque rang, `onClick` littéral annulant le memo.
    expect([...peekRenders.values()]).toEqual([1, 1, 1]);
  });

  it('re-rendu du parent SANS changement de props ⇒ AUCUN rang ne se re-rend', () => {
    const { rerender } = render(<LentilleConversationListMount {...props} />);
    peekRenders.clear();

    rerender(<LentilleConversationListMount {...props} />);
    rerender(<LentilleConversationListMount {...props} />);

    expect([...peekRenders.entries()]).toEqual([]);
  });

  it("le typing d'UN rang ne re-rend QUE ce rang (les dix-neuf autres restent immobiles)", () => {
    const { rerender } = render(<LentilleConversationListMount {...props} />);
    peekRenders.clear();

    mockTypingMap = new Map([['b', [{ userId: 'u9', displayName: 'Zoé' }]]]);
    rerender(<LentilleConversationListMount {...props} />);

    expect([...peekRenders.keys()]).toEqual(['b']);
  });

  /**
   * V4bis/R4-1 — behaviour-matrix:L15.
   *
   * Le miroir iOS de cet id étend `renderFingerprint` avec le champ `bridge`
   * pour que le portillon `.equatable()` (manuel, un comparateur écrit à la
   * main) ne gèle pas les mises à jour du pont. Le web n'a PAS de portillon
   * manuel équivalent : `LentilleRow` est enveloppé dans `memo(fn)` SANS
   * second argument (comparateur de props) — vérifié en tête de
   * `LentilleRow.tsx` — donc React compare TOUTES les props par défaut,
   * `bridge` inclus, sans qu'aucun code n'ait eu besoin de le lister
   * explicitement. Il n'existe donc structurellement AUCUNE façon d'oublier
   * `bridge` dans la comparaison côté web : ce témoin prouve que la mise à
   * jour du pont d'UN rang traverse bien le memo, sans toucher ses voisins.
   */
  it('behaviour-matrix:L15 — un pont qui apparaît sur UN rang le re-rend, seul (memo par défaut, bridge inclus)', () => {
    const { rerender } = render(<LentilleConversationListMount {...props} />);
    peekRenders.clear();

    mockBridgeMap = new Map([
      ['b', { kind: 'fallback', unreadCount: 2, suggestedMode: 'focal', data: { authors: ['Zoe'], extraAuthorCount: 0, messageCount: 2 } }],
    ]);
    rerender(<LentilleConversationListMount {...props} />);

    expect([...peekRenders.keys()]).toEqual(['b']);
  });

  /**
   * Discrimination : un memo qui refuserait tout serait un bug plus grave que
   * celui qu'on répare. La rangée DOIT se re-rendre quand une prop la
   * concernant change.
   */
  it('la sélection change ⇒ les rangs concernés se re-rendent (le memo ne fige rien)', () => {
    const { rerender } = render(<LentilleConversationListMount {...props} />);
    peekRenders.clear();

    rerender(<LentilleConversationListMount {...props} selectedConversationId="a" />);

    expect([...peekRenders.keys()]).toEqual(['a']);

    peekRenders.clear();
    rerender(<LentilleConversationListMount {...props} selectedConversationId="c" />);
    expect([...peekRenders.keys()].sort()).toEqual(['a', 'c']);
  });

  it('le clic reste branché sur la bonne conversation malgré le rappel partagé', () => {
    const { container } = render(<LentilleConversationListMount {...props} />);

    // Q-142/R5-7 — le porteur du clic d'ouverture est la COUVERTURE
    // (`lentille-row-open`), un `<button>` frère : la racine `lentille-row`
    // est devenue un conteneur muet. La question posée par ce témoin est
    // inchangée — le rang referme-t-il sur SA conversation malgré le rappel
    // partagé ? — seul le point d'appui a bougé.
    const rows = container.querySelectorAll('[data-testid="lentille-row"]');
    expect(rows).toHaveLength(3);
    const covers = container.querySelectorAll('[data-testid="lentille-row-open"]');
    expect(covers).toHaveLength(3);
    (covers[1] as HTMLElement).click();

    expect(onSelectConversation).toHaveBeenCalledTimes(1);
    expect(onSelectConversation).toHaveBeenCalledWith(conversations[1]);
  });
});
