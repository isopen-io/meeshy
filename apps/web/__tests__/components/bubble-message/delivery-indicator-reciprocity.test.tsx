/**
 * Réciprocité des accusés de lecture : « je ne partage pas, je ne vois pas ».
 *
 * Le serveur retire déjà des réponses les participants qui ont désactivé leurs
 * accusés — c'est la moitié qui protège une donnée personnelle, donc autoritaire.
 * La moitié réciproque est une règle d'ÉQUITÉ : ce qu'elle masque a été consenti
 * par ceux qui l'ont émis, il n'y a rien à protéger contre l'utilisateur opt-out.
 * Elle vit donc côté client, où elle s'applique uniformément au REST et au
 * temps réel — la placer sur le REST seul aurait donné des coches qui bougent
 * en direct au-dessus d'une feuille de détail vide.
 *
 * @see docs/superpowers/specs/2026-07-24-read-exactness-design.md
 */

import { render, screen } from '@testing-library/react';

const mockPrivacy = { showReadReceipts: true };
jest.mock('@/stores/user-preferences-store', () => ({
  usePrivacyPreferences: () => ({ preferences: mockPrivacy, update: jest.fn(), sync: jest.fn() }),
}));

const mockMessageSummary: { value: unknown } = { value: null };
const mockConversationSummary: { value: unknown } = { value: null };
jest.mock('@/stores/conversation-ui-store', () => ({
  useMessageReadStatus: () => mockMessageSummary.value,
  useReadStatusSummary: () => mockConversationSummary.value,
}));

import { DeliveryIndicator } from '@/components/common/bubble-message/DeliveryIndicator';

function renderIndicator() {
  return render(
    <DeliveryIndicator isOwnMessage messageId="m-1" conversationId="c-1" />
  );
}

describe('DeliveryIndicator — réciprocité showReadReceipts', () => {
  beforeEach(() => {
    mockPrivacy.showReadReceipts = true;
    mockMessageSummary.value = { totalMembers: 2, deliveredCount: 2, readCount: 2 };
    mockConversationSummary.value = null;
  });

  it('shows the read state when the user shares their own read receipts', () => {
    const { container } = renderIndicator();

    expect(container.firstChild).not.toBeNull();
  });

  it('renders nothing at all when the user opted out', () => {
    mockPrivacy.showReadReceipts = false;

    const { container } = renderIndicator();

    // Pas même une coche « envoyé » : l'utilisateur a renoncé à cette
    // information dans les deux sens, l'afficher partiellement serait
    // incohérent avec la feuille de détail, vide de son côté.
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for a message that is not the user\'s own', () => {
    const { container } = render(
      <DeliveryIndicator isOwnMessage={false} messageId="m-1" conversationId="c-1" />
    );

    expect(container.firstChild).toBeNull();
  });

  it('still renders the sent check when sharing but no status is known yet', () => {
    mockMessageSummary.value = null;
    mockConversationSummary.value = null;

    const { container } = renderIndicator();

    expect(container.firstChild).not.toBeNull();
  });
});
