/**
 * PARITÉ DE DONNÉES DU FIL PLAT — directive produit du 2026-08-17.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QUE CE FICHIER FERME
 * ═══════════════════════════════════════════════════════════════════════════
 * « Certains messages de Script et Focal ont le contenu VIDE, pourtant en mode
 * Bulles on y voit quelque chose. » Ce n'était pas du chrome manquant : la
 * rangée du fil plat ne savait rendre QUE deux choses — le texte résolu par le
 * Prisme et les pièces jointes IMAGE. Tout message dont le contenu ne vit pas
 * dans le champ texte rendait donc une rangée littéralement vide :
 *
 *   - un vocal / un audio seul          (`FocalMediaBlock` filtrait `image/*`)
 *   - une vidéo seule                   (idem)
 *   - un PDF / un fichier / du code     (idem)
 *   - un résumé d'appel                 (`messageSource: 'system'` + metadata,
 *                                        `content` vide — la vue Bulles monte
 *                                        `CallSystemMessage`, le fil rien)
 *   - un message sans contenu affichable (rien du tout, pas même un repli)
 *
 * Ces témoins prennent chaque TYPE que la vue Bulles sait rendre et exigent
 * qu'aucun ne produise une rangée vide dans le fil plat — dans les DEUX
 * densités, `focal` ET `script` (la mission dit « toutes les données … dans
 * les deux densités »), puisque c'est la MÊME rangée.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QU'ILS N'EXIGENT PAS
 * ═══════════════════════════════════════════════════════════════════════════
 * Ils ne figent aucune COTE (garde R15 : la loi vit dans les tokens) ni aucune
 * géométrie de grille : ils exigent que la DONNÉE soit à l'écran, et que le
 * composant qui la rend soit celui de `bubble-message`/`attachments`
 * RÉUTILISÉ, jamais une copie — ce que les `data-testid` de ce fichier
 * pointent nommément.
 */
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FocalRow, type FocalDensity } from '../FocalRow';
import type { Message, User } from '@meeshy/shared/types';

const currentUser = { id: 'me' } as Pick<User, 'id'>;

const BOTH_DENSITIES: readonly FocalDensity[] = ['focal', 'script'];

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
    createdAt: new Date('2026-08-17T10:00:00Z'),
    timestamp: new Date('2026-08-17T10:00:00Z'),
    translations: [],
    sender: { id: 'other', conversationId: 'c1', type: 'user', displayName: 'Alice' } as unknown,
    ...overrides,
  } as Message;
}

function makeAttachment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    messageId: 'm1',
    fileName: 'x.jpg',
    originalName: 'x.jpg',
    mimeType: 'image/jpeg',
    fileSize: 10,
    fileUrl: 'https://example.com/x.jpg',
    ...overrides,
  } as unknown;
}

function renderRow(message: Message, density: FocalDensity, extra: Record<string, unknown> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
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
        {...extra}
      />
    </QueryClientProvider>
  );
}

/** « La rangée n'est pas vide » — le critère dur de la directive. */
function expectRowNotEmpty() {
  const row = screen.getByTestId('focal-row');
  expect(row.textContent?.trim().length ?? 0).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// LES TYPES QUI RENDAIENT VIDE
// ---------------------------------------------------------------------------

describe('parité — aucun TYPE de message ne rend une rangée vide', () => {
  BOTH_DENSITIES.forEach((density) => {
    it(`[${density}] un vocal/audio SEUL est rendu (il rendait vide)`, () => {
      renderRow(
        makeMessage({
          content: '',
          messageType: 'audio',
          attachments: [
            makeAttachment({ id: 'au1', mimeType: 'audio/mpeg', fileName: 'v.mp3', originalName: 'v.mp3', fileUrl: 'https://example.com/v.mp3' }),
          ] as unknown,
        }),
        density
      );
      expect(screen.getByTestId('focal-attachment-block')).toBeInTheDocument();
      expectRowNotEmpty();
    });

    it(`[${density}] une vidéo SEULE est rendue (elle rendait vide)`, () => {
      renderRow(
        makeMessage({
          content: '',
          messageType: 'video',
          attachments: [
            makeAttachment({ id: 'v1', mimeType: 'video/mp4', fileName: 'c.mp4', originalName: 'c.mp4', fileUrl: 'https://example.com/c.mp4' }),
          ] as unknown,
        }),
        density
      );
      expect(screen.getByTestId('focal-attachment-block')).toBeInTheDocument();
      expectRowNotEmpty();
    });

    it(`[${density}] un document/PDF SEUL est rendu (il rendait vide)`, () => {
      renderRow(
        makeMessage({
          content: '',
          messageType: 'file',
          attachments: [
            makeAttachment({ id: 'd1', mimeType: 'application/pdf', fileName: 'r.pdf', originalName: 'r.pdf', fileUrl: 'https://example.com/r.pdf' }),
          ] as unknown,
        }),
        density
      );
      expect(screen.getByTestId('focal-attachment-block')).toBeInTheDocument();
      expectRowNotEmpty();
    });

    it(`[${density}] une image SEULE reste rendue par la grille NUE du contrat (non-régression)`, () => {
      renderRow(
        makeMessage({ content: '', messageType: 'image', attachments: [makeAttachment()] as unknown }),
        density
      );
      expect(screen.getByTestId('focal-media-block')).toBeInTheDocument();
    });

    it(`[${density}] un message MIXTE rend les images ET les autres pièces jointes`, () => {
      renderRow(
        makeMessage({
          content: '',
          attachments: [
            makeAttachment(),
            makeAttachment({ id: 'd2', mimeType: 'application/pdf', fileName: 'r.pdf', originalName: 'r.pdf', fileUrl: 'https://example.com/r.pdf' }),
          ] as unknown,
        }),
        density
      );
      expect(screen.getByTestId('focal-media-block')).toBeInTheDocument();
      expect(screen.getByTestId('focal-attachment-block')).toBeInTheDocument();
    });

    it(`[${density}] un résumé d'appel monte CallSystemMessage (il rendait vide)`, () => {
      renderRow(
        makeMessage({
          content: '',
          messageType: 'system',
          messageSource: 'system',
          metadata: {
            kind: 'call',
            callType: 'audio',
            outcome: 'completed',
            initiatorId: 'other',
            durationMs: 42_000,
          } as unknown,
        }),
        density
      );
      expect(screen.getByTestId('focal-call-message')).toBeInTheDocument();
      expectRowNotEmpty();
    });

    it(`[${density}] un message SANS contenu affichable porte un repli descriptif, jamais du vide`, () => {
      renderRow(
        makeMessage({ content: '', messageType: 'system', messageSource: 'system' }),
        density
      );
      expect(screen.getByTestId('focal-row-empty')).toBeInTheDocument();
      expectRowNotEmpty();
    });
  });
});

// ---------------------------------------------------------------------------
// LES DONNÉES DE CHROME QUE LA VUE BULLES AFFICHAIT DÉJÀ
// ---------------------------------------------------------------------------

describe('parité — le chrome de données de la vue Bulles est à l’écran', () => {
  BOTH_DENSITIES.forEach((density) => {
    it(`[${density}] les réactions posées sont visibles`, () => {
      renderRow(
        makeMessage({ reactionSummary: { '👍': 2 }, reactionCount: 2 }),
        density
      );
      expect(screen.getByTestId('focal-reactions')).toBeInTheDocument();
    });

    it(`[${density}] un message de MOI porte l’indicateur de livraison/lecture DANS l’identité`, () => {
      renderRow(makeMessage({ senderId: 'me' }), density);
      const identity = screen.getByTestId('focal-identity-header');
      expect(within(identity).getByTestId('focal-delivery')).toBeInTheDocument();
    });

    it(`[${density}] un message TRANSFÉRÉ le dit`, () => {
      renderRow(makeMessage({ forwardedFromId: 'src-1' }), density);
      expect(screen.getByTestId('focal-forwarded')).toBeInTheDocument();
    });

    it(`[${density}] un message ÉDITÉ le dit`, () => {
      renderRow(
        makeMessage({ isEdited: true, editedAt: new Date('2026-08-17T10:05:00Z') }),
        density
      );
      expect(screen.getByTestId('focal-edited')).toBeInTheDocument();
    });

    it(`[${density}] un message AFFICHÉ TRADUIT porte le témoin « original → affiché »`, () => {
      const { container } = render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
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
            density={density}
            preferredLanguages={['fr']}
            time="10:00"
            youLabel="Toi"
            conversationId="c1"
          />
        </QueryClientProvider>
      );
      expect(within(container).getByTestId('focal-translated')).toBeInTheDocument();
      expect(screen.getByTestId('focal-row-text')).toHaveTextContent('Bonjour');
    });

    /**
     * L'ASSERTION porte sur le Markdown REMIS au renderer, pas sur le `<a>`
     * final : `react-markdown` est mocké globalement dans cette suite web
     * (`jest.setup.js` — il rend son entrée en texte brut), donc aucun test
     * de ce dépôt ne peut observer l'ancre. Ce qui est prouvé ici est le
     * maillon qui MANQUAIT : le texte du fil plat passe désormais par
     * `mentionsToLinks` (loi partagée, la MÊME que `useMessageDisplay`) avant
     * d'atteindre le renderer, là où la rangée poussait auparavant la chaîne
     * brute dans un `<p>` — une mention n'y était jamais cliquable.
     */
    it(`[${density}] une MENTION validée part en lien vers le profil (la rangée rendait du texte brut)`, () => {
      renderRow(
        makeMessage({ content: 'salut @alice', validatedMentions: ['alice'] }),
        density
      );
      expect(screen.getByTestId('focal-row-text')).toHaveTextContent('[@alice](/u/alice)');
    });

    it(`[${density}] une mention NON validée reste du texte (la loi partagée décide, pas la rangée)`, () => {
      renderRow(makeMessage({ content: 'salut @mallory', validatedMentions: [] }), density);
      expect(screen.getByTestId('focal-row-text')).toHaveTextContent('salut @mallory');
      expect(screen.getByTestId('focal-row-text')).not.toHaveTextContent('/u/mallory');
    });
  });
});

// ---------------------------------------------------------------------------
// CE QUE LA PARITÉ NE DOIT PAS CASSER
// ---------------------------------------------------------------------------

describe('parité — les invariants du fil plat survivent', () => {
  it('densité `script` : AUCUN enregistrement dans la perspective, même avec le nouveau chrome', () => {
    const registerRow = jest.fn(() => jest.fn());
    const setAlphaCeiling = jest.fn();
    renderRow(makeMessage({ reactionSummary: { '👍': 1 }, senderId: 'me' }), 'script', {
      registerRow,
      setAlphaCeiling,
      isOptimistic: true,
    });
    expect(registerRow).not.toHaveBeenCalled();
    expect(setAlphaCeiling).not.toHaveBeenCalled();
  });

  it('densité `focal` : la rangée reste enregistrée par callback malgré le nouveau chrome', () => {
    const registerRow = jest.fn(() => jest.fn());
    renderRow(makeMessage({ reactionSummary: { '👍': 1 } }), 'focal', { registerRow });
    expect(registerRow).toHaveBeenCalledWith('m1');
  });

  it('un résumé d’appel en densité `focal` reste enregistré dans la perspective (une rangée = un rang)', () => {
    const registerRow = jest.fn(() => jest.fn());
    renderRow(
      makeMessage({
        content: '',
        messageSource: 'system',
        metadata: { kind: 'call', callType: 'audio', outcome: 'completed', initiatorId: 'other' } as unknown,
      }),
      'focal',
      { registerRow }
    );
    expect(registerRow).toHaveBeenCalledWith('m1');
  });

  it('l’aria-label de la rangée nomme l’expéditeur ET l’heure visibles (a11y synchronisée)', () => {
    renderRow(makeMessage(), 'focal');
    const row = screen.getByTestId('focal-row');
    expect(row).toHaveAttribute('aria-label', expect.stringContaining('Alice'));
    expect(row).toHaveAttribute('aria-label', expect.stringContaining('10:00'));
  });
});

// ---------------------------------------------------------------------------
// FIDÉLITÉ À LA MAQUETTE — docs/design/2026-08-15-focal-spec-integration.html
// ---------------------------------------------------------------------------

describe('fidélité maquette — l’auteur est cliquable et mène à son profil', () => {
  BOTH_DENSITIES.forEach((density) => {
    it(`[${density}] la pastille ET le nom ouvrent le profil de l’auteur`, () => {
      renderRow(
        makeMessage({
          sender: {
            id: 'other',
            conversationId: 'c1',
            type: 'user',
            displayName: 'Alice',
            username: 'alice',
          } as unknown,
        }),
        density
      );

      const link = screen.getByTestId('focal-identity-profile-link');
      // MÊME affordance de profil que la vue Bulles
      // (`bubble-message/MessageNameDate.tsx`) : la route `/u/{username}`.
      expect(link).toHaveAttribute('href', '/u/alice');
      // La pastille ET le nom sont DANS le lien — pas seulement le nom.
      expect(within(link).getByTestId('focal-identity-name')).toBeInTheDocument();
      expect(link.querySelector('img, span[data-slot], .relative')).toBeTruthy();
      // Nom accessible explicite : « lien » sans libellé serait illisible.
      expect(link).toHaveAccessibleName(expect.stringContaining('Alice'));
    });

    it(`[${density}] sans username, l’identité reste du TEXTE — jamais un lien menteur`, () => {
      renderRow(makeMessage(), density);
      expect(screen.queryByTestId('focal-identity-profile-link')).not.toBeInTheDocument();
      expect(screen.getByTestId('focal-identity-name')).toBeInTheDocument();
    });
  });
});

describe('fidélité maquette — le libellé d’assistance est « {Pseudo}, {heure}, {contenu} »', () => {
  it('un message texte annonce son texte', () => {
    renderRow(makeMessage({ content: 'Bonjour tout le monde' }), 'focal');
    expect(screen.getByTestId('focal-row')).toHaveAttribute(
      'aria-label',
      'Alice, 10:00, Bonjour tout le monde'
    );
  });

  it('un message SANS contenu annonce EXACTEMENT le repli qu’il affiche', () => {
    renderRow(makeMessage({ content: '', messageSource: 'system' }), 'focal');
    const shown = screen.getByTestId('focal-row-empty').textContent ?? '';
    expect(shown.length).toBeGreaterThan(0);
    expect(screen.getByTestId('focal-row')).toHaveAttribute(
      'aria-label',
      `Alice, 10:00, ${shown}`
    );
  });

  it('la rangée est UN groupe d’assistance (une rangée = un élément)', () => {
    renderRow(makeMessage(), 'focal');
    expect(screen.getByTestId('focal-row')).toHaveAttribute('role', 'group');
  });
});
