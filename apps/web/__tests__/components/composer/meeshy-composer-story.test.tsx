/**
 * W5 — la surface STORY entre dans le meuble : ABSORPTION, pas retrait.
 *
 * `StoryComposer.tsx` survit (§G, opposable) : son corps devient
 * `StoryComposerSurface`, montable directement par `MeeshyComposer` quand le
 * format courant est `story`, et le dialogue (`StoryComposer`) devient un
 * enrobage mince autour de la MÊME surface. L'émetteur v3 (`buildCanvasV3` et
 * ses catalogues) vit désormais dans `lib/story-canvas-v3.ts` — ce fichier ne
 * le re-teste PAS en détail : les cinq suites historiques
 * (`story-composer-emits-v3`, `story-v3-roundtrip`, `story-composer-media`,
 * `story-composer-default-visibility`, `story-prisme-origin-locale`) restent
 * la preuve que l'émetteur déplacé rend le même blob — elles tournent sur le
 * MÊME composant, inchangé de leur point de vue. Cette suite couvre ce que W5
 * AJOUTE : le branchement dans le meuble, `ROUTABLE_FORMATS`, l'éventail
 * partagé entre les deux surfaces, et la preuve d'équivalence entre le
 * dialogue autonome et la surface montée en meuble.
 */
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MeeshyComposer } from '@/components/composer/MeeshyComposer';
import { StoryComposer, StoryComposerSurface, type ComposerStoryPayload } from '@/components/v2/StoryComposer';
import type { ComposerDocumentPayload } from '@/components/composer/ComposerDocumentSurface';
import { webComposerOpening } from '@/lib/composer-door';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
      typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
  }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: { authToken: string | null }) => unknown) =>
    selector({ authToken: 'token-1' }),
  useUser: () => null,
}));

let mockUploadedAttachments: UploadedAttachmentResponse[] = [];
let mockSelectedFiles: File[] = [];

jest.mock('@/hooks/composer/useAttachmentUpload', () => ({
  useAttachmentUpload: () => ({
    selectedFiles: mockSelectedFiles,
    uploadedAttachments: mockUploadedAttachments,
    isUploading: false,
    uploadProgress: {},
    handleFilesSelected: jest.fn(),
    handleRemoveFile: jest.fn(),
    clearAttachments: jest.fn(),
  }),
}));

let mockValidation: { valid: boolean; errors: string[] } = { valid: true, errors: [] };
jest.mock('@/services/attachmentService', () => ({
  AttachmentService: { validateFiles: () => mockValidation },
}));

jest.mock('use-debounce', () => ({
  useDebounce: (value: unknown) => [value],
}));

jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div data-testid="popover-content">{children}</div>,
}));

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect, onClick }: { children: React.ReactNode; onSelect?: () => void; onClick?: () => void }) => (
    <button type="button" onClick={onClick || onSelect}>{children}</button>
  ),
}));

const mockSearchUsers = jest.fn();
jest.mock('@/services/users.service', () => ({
  usersService: {
    searchUsers: (...args: unknown[]) => mockSearchUsers(...args),
  },
}));

global.URL.createObjectURL = jest.fn(() => 'blob:mock-story-meuble');
global.URL.revokeObjectURL = jest.fn();

beforeEach(() => {
  mockUploadedAttachments = [];
  mockSelectedFiles = [new File(['x'], 'placeholder.jpg', { type: 'image/jpeg' })];
  mockValidation = { valid: true, errors: [] };
  mockSearchUsers.mockReset();
  mockSearchUsers.mockResolvedValue([{ id: 'u-a', username: 'alice', displayName: 'Alice' }]);
});

function typeContent(text: string): void {
  fireEvent.change(screen.getByPlaceholderText('storyPlaceholder'), { target: { value: text } });
}

function clickPublish(): void {
  fireEvent.click(screen.getByText('publish'));
}

async function pickAliceFromPicker() {
  fireEvent.click(screen.getByLabelText('Mention someone'));
  fireEvent.change(screen.getByPlaceholderText('Search for someone'), { target: { value: 'ali' } });
  await waitFor(() => expect(mockSearchUsers).toHaveBeenCalled());
  fireEvent.click(await screen.findByText('Alice'));
}

/** Neutralise les ids générés aléatoirement par `generateStoryObjectId()`
 * (tout objet sauf le fond, dont l'id reste le littéral `'bg'`) pour comparer
 * deux blobs `storyEffects` par leur FORME, jamais par leur id d'insertion. */
function stripGeneratedIds(effects: Record<string, unknown>): unknown {
  return JSON.parse(
    JSON.stringify(effects, (key, value) => (key === 'id' && value !== 'bg' ? '<id>' : value)),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Le meuble peint désormais la surface story, plutôt qu'un écran vide.
// ─────────────────────────────────────────────────────────────────────────────
describe('W5 — `storyTray` peint la surface story dans le meuble', () => {
  it('rend la surface story — pas un conteneur vide, pas la surface document', () => {
    render(<MeeshyComposer door={{ kind: 'storyTray' }} onPublish={jest.fn()} onPublishStory={jest.fn()} />);

    expect(screen.getByTestId('composer-story-surface')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('storyPlaceholder')).toBeInTheDocument();
    expect(screen.queryByTestId('composer-document-surface')).not.toBeInTheDocument();
  });

  it('publie via `onPublishStory`, jamais via `onPublish` (document)', () => {
    const onPublish = jest.fn();
    const onPublishStory = jest.fn();
    render(<MeeshyComposer door={{ kind: 'storyTray' }} onPublish={onPublish} onPublishStory={onPublishStory} />);

    typeContent('Bonjour');
    clickPublish();

    expect(onPublishStory).toHaveBeenCalledTimes(1);
    expect(onPublish).not.toHaveBeenCalled();
    const payload = onPublishStory.mock.calls[0][0] as ComposerStoryPayload;
    expect(payload.storyEffects.v).toBe(3);
  });

  it("n'envoie AUCUN `mentions` quand personne n'est référencé, à travers le meuble", () => {
    const onPublishStory = jest.fn();
    render(<MeeshyComposer door={{ kind: 'storyTray' }} onPublish={jest.fn()} onPublishStory={onPublishStory} />);

    typeContent('Bonjour');
    clickPublish();

    const payload = onPublishStory.mock.calls[0][0] as ComposerStoryPayload;
    expect(payload).not.toHaveProperty('mentions');
  });

  it('sans `onPublishStory`, la surface reste montée et fonctionnelle — le publish redevient un no-op silencieux, jamais un crash', () => {
    render(<MeeshyComposer door={{ kind: 'storyTray' }} onPublish={jest.fn()} />);

    typeContent('Bonjour');
    expect(() => clickPublish()).not.toThrow();
  });
});

/**
 * Reformulation W9 Step 3 — le volet `StoryComposer — references` de
 * `PostComposerReferences.test.tsx` (fichier retiré : il importait aussi
 * `PostComposer`/`PostEditor`, deux modules qui ne survivent pas à ce lot).
 * `StoryComposer.tsx` LUI reste (§G, opposable) — cette suite ne perd donc
 * PAS sa cible, seulement son ancien fichier d'accueil. Rendu via le
 * dialogue autonome, exactement comme l'original : le chemin POSITIF du
 * picker (choisir Alice ⇒ `mentions: [{ userId, display: 'SILENT' }]`) que
 * la garde d'ABSENCE ci-dessus, à elle seule, ne prouve pas.
 */
describe('StoryComposer (dialogue autonome) — références', () => {
  it('publie la personne choisie au picker en SILENT', async () => {
    const onPublish = jest.fn();
    render(<StoryComposer open onClose={jest.fn()} onPublish={onPublish} />);

    typeContent('Soirée');
    await pickAliceFromPicker();
    clickPublish();

    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({ mentions: [{ userId: 'u-a', display: 'SILENT' }] }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// `ROUTABLE_FORMATS` gagne `story` — LÀ, dans le meuble, pas ailleurs.
// ─────────────────────────────────────────────────────────────────────────────
describe('W5 — `story` rejoint ce que le meuble sait peindre', () => {
  it('`feedComposer` offre post ET story dans l’éventail, même sur une composition vide', () => {
    render(<MeeshyComposer door={{ kind: 'feedComposer' }} onPublish={jest.fn()} onPublishStory={jest.fn()} />);
    fireEvent.focus(screen.getByLabelText('postComposer.contentLabel'));

    // Le contrat (`composer-contract.ts`, `case 'feedComposer'`) offre `story`
    // INCONDITIONNELLEMENT — ce n'est pas gated par `qualifiesAsReel` comme
    // `reel` l'est. `ROUTABLE_FORMATS` doit donc laisser passer ce bouton dès
    // que la porte l'offre, sans exiger de média.
    expect(webComposerOpening({ kind: 'feedComposer' }, []).offeredFormats).toContain('story');
    expect(screen.getByTestId('composer-format-post')).toBeInTheDocument();
    expect(screen.getByTestId('composer-format-story')).toBeInTheDocument();
  });

  it('basculer vers `story` depuis l’éventail du document remonte la surface story proprement — jamais un conteneur vide', () => {
    render(<MeeshyComposer door={{ kind: 'feedComposer' }} onPublish={jest.fn()} onPublishStory={jest.fn()} />);
    fireEvent.focus(screen.getByLabelText('postComposer.contentLabel'));
    expect(screen.getByTestId('composer-document-surface')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('composer-format-story'));

    expect(screen.queryByTestId('composer-document-surface')).not.toBeInTheDocument();
    expect(screen.getByTestId('composer-story-surface')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('storyPlaceholder')).toBeInTheDocument();
  });

  it('et revenir à `post` depuis l’éventail de la surface story remonte la surface document — l’aller-retour ne casse rien', () => {
    render(<MeeshyComposer door={{ kind: 'storyTray' }} onPublish={jest.fn()} onPublishStory={jest.fn()} />);
    expect(screen.getByTestId('composer-story-surface')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('composer-format-post'));

    expect(screen.queryByTestId('composer-story-surface')).not.toBeInTheDocument();
    expect(screen.getByTestId('composer-document-surface')).toBeInTheDocument();
  });

  it("le dialogue autonome (sans `door`) ne peint AUCUN éventail — la porte est une capacité du MEUBLE, jamais du dialogue historique", () => {
    render(<StoryComposer open onClose={jest.fn()} onPublish={jest.fn()} />);

    expect(screen.queryByTestId('composer-format-fan')).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La porte reste VIVANTE avec `story` dans le mélange.
// ─────────────────────────────────────────────────────────────────────────────
describe('W5 — la porte vivante n’est pas cassée par l’ajout de story', () => {
  it('passer de `feedComposer` à `storyTray` sur une instance déjà montée bascule sur la surface story', () => {
    const onPublish = jest.fn();
    const onPublishStory = jest.fn();
    const view = render(
      <MeeshyComposer door={{ kind: 'feedComposer' }} onPublish={onPublish} onPublishStory={onPublishStory} />,
    );
    expect(screen.getByTestId('composer-document-surface')).toBeInTheDocument();

    view.rerender(
      <MeeshyComposer door={{ kind: 'storyTray' }} onPublish={onPublish} onPublishStory={onPublishStory} />,
    );

    expect(screen.queryByTestId('composer-document-surface')).not.toBeInTheDocument();
    expect(screen.getByTestId('composer-story-surface')).toBeInTheDocument();
  });

  it('publier depuis la porte `storyTray` neuve porte bien vers `onPublishStory`, pas vers l’`onPublish` capturé sur `feedComposer`', () => {
    const onPublish = jest.fn();
    const onPublishStory = jest.fn();
    const view = render(
      <MeeshyComposer door={{ kind: 'feedComposer' }} onPublish={onPublish} onPublishStory={onPublishStory} />,
    );
    view.rerender(
      <MeeshyComposer door={{ kind: 'storyTray' }} onPublish={onPublish} onPublishStory={onPublishStory} />,
    );

    typeContent('Bonjour');
    clickPublish();

    expect(onPublishStory).toHaveBeenCalledTimes(1);
    expect(onPublish).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Preuve d'ÉQUIVALENCE (plan W5, point 2) — la même surface, deux enrobages.
// ─────────────────────────────────────────────────────────────────────────────
describe('W5 — équivalence : le dialogue autonome et la surface en meuble émettent la même charge', () => {
  it('même contenu, même fond, même style de texte ⇒ même `storyEffects`, même `visibility`, mêmes `mediaIds`', () => {
    mockUploadedAttachments = [
      {
        id: 'media-eq',
        messageId: 'msg-1',
        fileName: 'photo.jpg',
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 10,
        fileUrl: 'https://cdn.example.com/photo.jpg',
        uploadedBy: 'user-1',
        isAnonymous: false,
        createdAt: '2026-08-10T00:00:00Z',
      },
    ];

    const dialogCapture: { payload: ComposerStoryPayload | null } = { payload: null };
    const dialogView = render(
      <StoryComposer
        open
        onClose={jest.fn()}
        onPublish={(story) => {
          dialogCapture.payload = story;
        }}
      />,
    );
    typeContent('Bonjour');
    fireEvent.click(screen.getByLabelText('Gradient'));
    fireEvent.click(screen.getByText('Ne'));
    clickPublish();
    dialogView.unmount();

    const meubleCapture: { payload: ComposerStoryPayload | null } = { payload: null };
    render(
      <StoryComposerSurface
        onPublish={(story) => {
          meubleCapture.payload = story;
        }}
      />,
    );
    typeContent('Bonjour');
    fireEvent.click(screen.getByLabelText('Gradient'));
    fireEvent.click(screen.getByText('Ne'));
    clickPublish();

    const viaDialog = dialogCapture.payload;
    const viaMeuble = meubleCapture.payload;
    if (viaDialog === null) throw new Error('onPublish was not called on the dialog surface');
    if (viaMeuble === null) throw new Error('onPublish was not called on the meuble surface');
    // `generateStoryObjectId()` mint un id ALÉATOIRE par objet non-fond — deux
    // publications distinctes n'auront donc jamais le même id, même pour un
    // état identique. L'équivalence porte sur la FORME émise, pas sur l'id.
    expect(stripGeneratedIds(viaMeuble.storyEffects)).toEqual(stripGeneratedIds(viaDialog.storyEffects));
    expect(viaMeuble.visibility).toEqual(viaDialog.visibility);
    expect(viaMeuble.mediaIds).toEqual(viaDialog.mediaIds);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L'enrobage DIALOGUE garde son bouton Publier dans l'EN-TÊTE.
//
// Le dialogue est le seul chemin VIVANT touché par W5 (`PostsFeedScreen.tsx`
// le monte toujours). Son en-tête portait TROIS enfants sous
// `flex items-center justify-between` — fermer, titre, Publier — ce qui
// CENTRAIT le titre par construction et rendait le CTA visible avant toute
// saisie. Descendre Publier dans le corps en retire deux garanties d'un coup :
// le titre se plaque contre le bord droit, et le CTA passe sous six rangées
// d'outils dans un `Dialog` (`components/v2/Dialog.tsx`) qui n'a NI `max-h` NI
// `overflow-y` — ce qui dépasse la fenêtre est coupé, donc inatteignable.
//
// La surface, elle, garde son bouton bas quand elle est montée par le meuble :
// le meuble n'est pas un modal. C'est l'enrobage qui déclare où va le CTA.
// ─────────────────────────────────────────────────────────────────────────────
describe("W5 — le dialogue story publie depuis son EN-TÊTE, la surface en meuble depuis son bas", () => {
  function dialogHeaderOf(): HTMLElement {
    return screen.getByText('newStory').parentElement as HTMLElement;
  }

  it("l'en-tête porte ses TROIS enfants — fermer, titre, Publier — donc le titre reste centré", () => {
    render(<StoryComposer open onClose={jest.fn()} onPublish={jest.fn()} />);

    const header = dialogHeaderOf();
    expect(header.children).toHaveLength(3);
    expect(within(header).getByLabelText('close')).toBeInTheDocument();
    expect(within(header).getByText('publish')).toBeInTheDocument();
  });

  it("le dialogue n'a qu'UN seul bouton Publier — jamais deux à choisir", () => {
    render(<StoryComposer open onClose={jest.fn()} onPublish={jest.fn()} />);

    expect(screen.getAllByText('publish')).toHaveLength(1);
  });

  it("le Publier de l'en-tête publie bien la charge du corps", () => {
    const onPublish = jest.fn();
    render(<StoryComposer open onClose={jest.fn()} onPublish={onPublish} />);

    typeContent('Bonjour');
    fireEvent.click(within(dialogHeaderOf()).getByText('publish'));

    expect(onPublish).toHaveBeenCalledTimes(1);
    expect((onPublish.mock.calls[0][0] as ComposerStoryPayload).content).toBe('Bonjour');
  });

  it("le Publier de l'en-tête suit l'état VIVANT du corps, il n'en est pas une copie figée", () => {
    mockSelectedFiles = [];
    render(<StoryComposer open onClose={jest.fn()} onPublish={jest.fn()} />);

    expect(within(dialogHeaderOf()).getByText('publish').closest('button')).toBeDisabled();

    typeContent('Bonjour');

    expect(within(dialogHeaderOf()).getByText('publish').closest('button')).not.toBeDisabled();
  });

  it('montée par le meuble, la surface garde son propre bouton Publier — le meuble n’est pas un modal', () => {
    render(<MeeshyComposer door={{ kind: 'storyTray' }} onPublish={jest.fn()} onPublishStory={jest.fn()} />);

    const surface = screen.getByTestId('composer-story-surface');
    expect(within(surface).getByText('publish')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La préférence d'audience de l'auteur a un site sur la surface neuve.
//
// `PostsFeedScreen.tsx` alimente déjà le dialogue avec
// `storyPrefs.defaultVisibility` (`useStoryPreferences`). Sans ce prop sur le
// meuble, une story composée par la surface neuve naîtrait TOUJOURS PUBLIC —
// un élargissement silencieux de l'audience sur le contrôle le plus sensible,
// et une capacité du montage de production sans site sur la surface neuve.
// ─────────────────────────────────────────────────────────────────────────────
describe('W5 — la visibilité par défaut de l’auteur atteint la surface montée par le meuble', () => {
  it('une préférence FRIENDS ouvre le composer sur FRIENDS, pas sur PUBLIC', () => {
    const onPublishStory = jest.fn();
    render(
      <MeeshyComposer
        door={{ kind: 'storyTray' }}
        onPublish={jest.fn()}
        onPublishStory={onPublishStory}
        storyDefaultVisibility="FRIENDS"
      />,
    );

    typeContent('Bonjour');
    clickPublish();

    expect((onPublishStory.mock.calls[0][0] as ComposerStoryPayload).visibility).toBe('FRIENDS');
  });

  it('sans préférence fournie, le défaut PUBLIC est conservé', () => {
    const onPublishStory = jest.fn();
    render(
      <MeeshyComposer door={{ kind: 'storyTray' }} onPublish={jest.fn()} onPublishStory={onPublishStory} />,
    );

    typeContent('Bonjour');
    clickPublish();

    expect((onPublishStory.mock.calls[0][0] as ComposerStoryPayload).visibility).toBe('PUBLIC');
  });
});
