/**
 * WF-110/WF-112 — `FocalQuotedReply`.
 *
 * behaviour-matrix:F09 — « les réponses citées gardent un filet 2.5 pt de
 * la couleur de l'auteur cité + une ligne tronquée ..., et le tap saute
 * vers l'original ». Le filet 2.5/couleur/troncature/tap sont couverts ;
 * le SCROLL ANIMÉ jusqu'à la bande de focale (partie perspective du saut)
 * n'est pas prouvé ici — `onJumpToMessage` délègue au câblage existant
 * (`onNavigateToMessage`), inchangé par ce lot.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { FocalQuotedReply } from '../FocalQuotedReply';
import { resolveFocalAuthorAccent } from '../focal-row-utils';
import type { Message } from '@meeshy/shared/types';

function makeQuoted(): Message {
  return {
    id: 'q1',
    conversationId: 'c1',
    senderId: 'other',
    content: 'Original message',
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
    createdAt: new Date(),
    timestamp: new Date(),
    translations: [],
    sender: { id: 'other', conversationId: 'c1', type: 'user', displayName: 'Bob' } as unknown,
  } as Message;
}

describe('FocalQuotedReply — filet 2.5 couleur de l\'auteur cité (§4.3)', () => {
  it('affiche le nom de l\'auteur cité et le texte', () => {
    render(<FocalQuotedReply quoted={makeQuoted()} preferredLanguages={['en']} />);
    expect(screen.getByTestId('focal-quoted-reply')).toHaveTextContent('Bob');
    expect(screen.getByTestId('focal-quoted-reply')).toHaveTextContent('Original message');
  });

  it('bordure gauche 2.5 (token thread.quote.borderSize), couleur = accent de l\'auteur cité', () => {
    render(<FocalQuotedReply quoted={makeQuoted()} preferredLanguages={['en']} />);
    const accent = resolveFocalAuthorAccent('Bob');
    expect(screen.getByTestId('focal-quoted-reply')).toHaveStyle({
      borderLeft: `var(--lentille-thread-quote-border-size) solid ${accent}`,
    });
  });

  it('le tap appelle onJumpToMessage avec l\'id du message cité (F09 : "le tap saute vers l\'original")', () => {
    const onJumpToMessage = jest.fn();
    render(<FocalQuotedReply quoted={makeQuoted()} preferredLanguages={['en']} onJumpToMessage={onJumpToMessage} />);
    fireEvent.click(screen.getByTestId('focal-quoted-reply'));
    expect(onJumpToMessage).toHaveBeenCalledWith('q1');
  });
});
