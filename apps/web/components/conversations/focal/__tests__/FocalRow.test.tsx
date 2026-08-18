/**
 * WF-110/111 — `FocalRow`.
 */
import { render, screen } from '@testing-library/react';
import { FocalRow } from '../FocalRow';
import type { Message, User } from '@meeshy/shared/types';

const currentUser = { id: 'me' } as Pick<User, 'id'>;

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    conversationId: 'c1',
    senderId: 'other',
    content: 'Hello world',
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
    createdAt: new Date('2026-08-12T10:00:00Z'),
    timestamp: new Date('2026-08-12T10:00:00Z'),
    translations: [],
    sender: { id: 'other', conversationId: 'c1', type: 'user', displayName: 'Alice' } as unknown,
    ...overrides,
  } as Message;
}

describe('FocalRow — densité focal (perspective ON)', () => {
  it('affiche l\'en-tête d\'identité en tête de groupe (previousMessage=null)', () => {
    render(
      <FocalRow
        message={makeMessage()}
        previousMessage={null}
        currentUser={currentUser}
        density="focal"
        preferredLanguages={['en']}
        time="10:00"
        youLabel="Toi"
      />
    );
    expect(screen.getByTestId('focal-identity-header')).toBeInTheDocument();
  });

  it('MASQUE l\'en-tête quand le même expéditeur enchaîne (collapse par groupe)', () => {
    const previous = makeMessage({ id: 'm0', senderId: 'other' });
    render(
      <FocalRow
        message={makeMessage({ senderId: 'other' })}
        previousMessage={previous}
        currentUser={currentUser}
        density="focal"
        preferredLanguages={['en']}
        time="10:00"
        youLabel="Toi"
      />
    );
    expect(screen.queryByTestId('focal-identity-header')).not.toBeInTheDocument();
  });

  it('appelle registerRow(message.id) — la rangée s\'enregistre dans la passe de perspective', () => {
    const registerRow = jest.fn(() => jest.fn());
    render(
      <FocalRow
        message={makeMessage()}
        previousMessage={null}
        currentUser={currentUser}
        density="focal"
        preferredLanguages={['en']}
        time="10:00"
        youLabel="Toi"
        registerRow={registerRow}
      />
    );
    expect(registerRow).toHaveBeenCalledWith('m1');
  });

  it('publie le plafond optimiste 0.7 au pass via setAlphaCeiling quand isOptimistic', () => {
    const setAlphaCeiling = jest.fn();
    render(
      <FocalRow
        message={makeMessage()}
        previousMessage={null}
        currentUser={currentUser}
        density="focal"
        preferredLanguages={['en']}
        time="10:00"
        youLabel="Toi"
        isOptimistic
        setAlphaCeiling={setAlphaCeiling}
      />
    );
    expect(setAlphaCeiling).toHaveBeenCalledWith('m1', 0.7);
  });

  it('publie le plafond confirmé (1) au pass quand la rangée n\'est plus optimiste', () => {
    const setAlphaCeiling = jest.fn();
    render(
      <FocalRow
        message={makeMessage()}
        previousMessage={null}
        currentUser={currentUser}
        density="focal"
        preferredLanguages={['en']}
        time="10:00"
        youLabel="Toi"
        isOptimistic={false}
        setAlphaCeiling={setAlphaCeiling}
      />
    );
    expect(setAlphaCeiling).toHaveBeenCalledWith('m1', 1);
  });

  it('typographie 16px SEULEMENT si isFocused (bump "à l\'arrêt", jamais par défaut)', () => {
    const { rerender } = render(
      <FocalRow
        message={makeMessage()}
        previousMessage={null}
        currentUser={currentUser}
        density="focal"
        preferredLanguages={['en']}
        time="10:00"
        youLabel="Toi"
        isFocused={false}
      />
    );
    expect(screen.getByTestId('focal-row-text')).toHaveStyle({ fontSize: 'var(--lentille-thread-line2-size)' });

    rerender(
      <FocalRow
        message={makeMessage()}
        previousMessage={null}
        currentUser={currentUser}
        density="focal"
        preferredLanguages={['en']}
        time="10:00"
        youLabel="Toi"
        isFocused
      />
    );
    expect(screen.getByTestId('focal-row-text')).toHaveStyle({ fontSize: '16px' });
  });
});

describe('FocalRow — densité script (« MÊME rangée, densité uniforme, ZÉRO perspective »)', () => {
  it('affiche TOUJOURS l\'en-tête, même si le même expéditeur enchaîne', () => {
    const previous = makeMessage({ id: 'm0', senderId: 'other' });
    render(
      <FocalRow
        message={makeMessage({ senderId: 'other' })}
        previousMessage={previous}
        currentUser={currentUser}
        density="script"
        preferredLanguages={['en']}
        time="10:00"
        youLabel="Toi"
      />
    );
    expect(screen.getByTestId('focal-identity-header')).toBeInTheDocument();
  });

  it('N\'APPELLE JAMAIS registerRow — zéro perspective', () => {
    const registerRow = jest.fn(() => jest.fn());
    render(
      <FocalRow
        message={makeMessage()}
        previousMessage={null}
        currentUser={currentUser}
        density="script"
        preferredLanguages={['en']}
        time="10:00"
        youLabel="Toi"
        registerRow={registerRow}
      />
    );
    expect(registerRow).not.toHaveBeenCalled();
  });

  it('N\'APPELLE JAMAIS setAlphaCeiling — zéro perspective, même optimiste', () => {
    const setAlphaCeiling = jest.fn();
    render(
      <FocalRow
        message={makeMessage()}
        previousMessage={null}
        currentUser={currentUser}
        density="script"
        preferredLanguages={['en']}
        time="10:00"
        youLabel="Toi"
        isOptimistic
        setAlphaCeiling={setAlphaCeiling}
      />
    );
    expect(setAlphaCeiling).not.toHaveBeenCalled();
  });

  it('n\'applique JAMAIS le bump 16px, même avec isFocused=true (le scan reste net)', () => {
    render(
      <FocalRow
        message={makeMessage()}
        previousMessage={null}
        currentUser={currentUser}
        density="script"
        preferredLanguages={['en']}
        time="10:00"
        youLabel="Toi"
        isFocused
      />
    );
    expect(screen.getByTestId('focal-row-text')).toHaveStyle({ fontSize: 'var(--lentille-thread-line2-size)' });
  });
});

describe('FocalRow — Prisme, citation, médias', () => {
  it('résout le texte par resolveFocalMessageText (traduction préférée affichée)', () => {
    render(
      <FocalRow
        message={makeMessage({
          content: 'Hello',
          originalLanguage: 'en',
          translations: [
            {
              id: 't1',
              messageId: 'm1',
              targetLanguage: 'fr',
              translatedContent: 'Bonjour',
              translationModel: 'basic',
              createdAt: new Date(),
            } as unknown,
          ],
        })}
        previousMessage={null}
        currentUser={currentUser}
        density="focal"
        preferredLanguages={['fr']}
        time="10:00"
        youLabel="Toi"
      />
    );
    expect(screen.getByTestId('focal-row-text')).toHaveTextContent('Bonjour');
  });

  it('rend la citation quand replyTo est présent, au retrait 29', () => {
    render(
      <FocalRow
        message={makeMessage({
          replyTo: makeMessage({ id: 'm0', content: 'Original', sender: { id: 'other', conversationId: 'c1', type: 'user', displayName: 'Bob' } as unknown }),
        })}
        previousMessage={null}
        currentUser={currentUser}
        density="focal"
        preferredLanguages={['en']}
        time="10:00"
        youLabel="Toi"
      />
    );
    expect(screen.getByTestId('focal-quoted-reply')).toBeInTheDocument();
  });

  it('rend le bloc médias nu quand des pièces jointes image sont présentes', () => {
    render(
      <FocalRow
        message={makeMessage({
          attachments: [
            {
              id: 'a1',
              messageId: 'm1',
              fileName: 'x.jpg',
              originalName: 'x.jpg',
              mimeType: 'image/jpeg',
              fileSize: 10,
              fileUrl: 'https://example.com/x.jpg',
            } as unknown,
          ],
        })}
        previousMessage={null}
        currentUser={currentUser}
        density="focal"
        preferredLanguages={['en']}
        time="10:00"
        youLabel="Toi"
      />
    );
    expect(screen.getByTestId('focal-media-block')).toBeInTheDocument();
  });
});

// ─── Avis d'arrivée — la rangée cède la place à la notice ────────────────────
//
// Le fil plat rend une rangée par message. Sans court-circuit, « Bob a rejoint
// la conversation » y arriverait signé de Bob : en-tête d'identité, heure,
// affordances — l'annonce d'une arrivée déguisée en premier message de
// l'arrivant. Même arbitrage que le résumé d'appel, pour la même raison.
//
// Le témoin porte sur la SUBSTITUTION (l'en-tête d'identité disparaît), pas
// seulement sur la présence de la notice : les deux pourraient coexister, et
// c'est justement ce qu'il faut interdire.

const joinNoticeMessage = () =>
  makeMessage({
    content: 'Bob a rejoint la conversation',
    messageType: 'system',
    messageSource: 'system',
    metadata: {
      kind: 'member-joined',
      participantId: 'p-bob',
      displayName: 'ano_bob_sm123',
      isAnonymous: true,
      viaShareLink: true,
    },
  } as Partial<Message>);

describe('FocalRow — avis d’arrivée', () => {
  const renderRow = (message: Message) =>
    render(
      <FocalRow
        message={message}
        previousMessage={null}
        currentUser={currentUser}
        density="focal"
        preferredLanguages={['fr']}
        time="10:00"
        youLabel="Toi"
      />
    );

  it('rend la notice plutôt qu’une rangée ordinaire', () => {
    renderRow(joinNoticeMessage());

    expect(screen.getByTestId('focal-join-notice')).toBeInTheDocument();
  });

  it('n’affiche NI en-tête d’identité NI texte de message — ce n’est pas une prise de parole', () => {
    renderRow(joinNoticeMessage());

    expect(screen.queryByTestId('focal-identity-header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('focal-row-text')).not.toBeInTheDocument();
  });

  it('CONTRE-ÉPREUVE — un message ordinaire garde sa rangée', () => {
    renderRow(makeMessage());

    expect(screen.queryByTestId('focal-join-notice')).not.toBeInTheDocument();
    expect(screen.getByTestId('focal-identity-header')).toBeInTheDocument();
  });

  it('ne confond pas un résumé d’appel avec une arrivée', () => {
    renderRow(makeMessage({
      messageSource: 'system',
      metadata: { kind: 'call', callType: 'audio', outcome: 'completed' },
    } as Partial<Message>));

    expect(screen.queryByTestId('focal-join-notice')).not.toBeInTheDocument();
  });
});
