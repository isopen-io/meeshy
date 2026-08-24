/**
 * W3 — le meuble, format POST/RÉEL : l'INVENTAIRE DE PARITÉ.
 *
 * Cette suite est la moitié « capacités » de la preuve de retrait : un composer
 * hérité ne se supprime que si ses appelants sont recâblés ET si la surface qui
 * le remplace tient chacune de ses capacités. Chaque bloc ci-dessous porte donc
 * une capacité mesurée sur `components/v2/PostComposer.tsx` (605 l.), citée à sa
 * ligne, et rougirait si la surface neuve la perdait.
 *
 * Ce qui est délibérément DIFFÉRENT du composer hérité, et pourquoi :
 *
 *  1. la bascule locale POST/RÉEL (`PostComposer.tsx`, le bloc `post-composer-type-toggle`) est remplacée par
 *     l'éventail partagé (`components/composer/ComposerFormatFan.tsx`) — c'est
 *     l'objet du point 8 du plan, et une garde négative vérifie ici que
 *     l'ancienne bascule n'a pas été transportée ;
 *  2. les deux messages de plafond média, ANGLAIS EN DUR dans le composer hérité
 *     (`PostComposer.tsx`, ses deux « You can attach up to … »), passent par le catalogue. Absorber une
 *     chaîne non localisée dans un fichier neuf la graverait pour la durée du
 *     lot ; le web est localisé en quatre langues ;
 *  3. **la classification par défaut d'une composition qualifiante change** —
 *     changement de PRODUIT, pas de forme. Le composer hérité naît sur RÉEL
 *     (`PostComposer.tsx`, `useState<PostType>('REEL')`) ; ici le format naît de la PORTE, et le composer
 *     du fil ouvre sur POST. Une vidéo jointe puis publiée sans toucher
 *     l'éventail donnait un RÉEL, elle donne un POST — et n'entre plus dans le
 *     fil Réels. Le raisonnement complet est dans l'en-tête de
 *     `ComposerDocumentSurface.tsx` ; le bloc « la classification par défaut »
 *     ci-dessous en est la garde.
 *
 * Le reste est un port fidèle, quirks compris. La liste ci-dessus est la seule
 * qui fasse foi : trois assertions de `PostComposer.reelToggle.test.tsx`
 * (`:131`, `:174`, `:188`) décrivent aujourd'hui le geste inverse du point 3 et
 * restent vertes sur leur propre composant — elles ne se reformulent pas sur
 * cette surface, elles se remplacent, et cela reste à faire avant le retrait.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MeeshyComposer } from '@/components/composer/MeeshyComposer';
import type { ComposerDocumentPayload } from '@/components/composer/ComposerDocumentSurface';
import { webComposerOpening } from '@/lib/composer-door';
import { COMPOSER_DOORS } from '@meeshy/shared/utils/composer-contract';
import { PUBLICATION_VISIBILITY_OPTIONS } from '@/components/v2/publication-visibility';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
      typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
  }),
}));

jest.mock('@/components/v2/Avatar', () => ({
  Avatar: () => <div data-testid="avatar" />,
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: { authToken: string | null }) => unknown) =>
    selector({ authToken: 'token-123' }),
}));

let mockValidation: { valid: boolean; errors: string[] } = { valid: true, errors: [] };
jest.mock('@/services/attachmentService', () => ({
  AttachmentService: {
    validateFiles: () => mockValidation,
  },
}));

// Le picker de références et celui d'audience débouncent (400 ms) et vivent
// dans un popover Radix : sans ces trois raccourcis, ni la liste de candidats
// ni le contenu du popover n'existent dans le tour de rendu du test. Même
// gréement que `PostComposerReferences.test.tsx` et `PostEditor.visibility.test.tsx`.
jest.mock('use-debounce', () => ({
  useDebounce: (value: unknown) => [value],
}));

jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={onSelect}>{children}</button>
  ),
}));

const mockSearchUsers = jest.fn();
jest.mock('@/services/users.service', () => ({
  usersService: { searchUsers: (...args: unknown[]) => mockSearchUsers(...args) },
}));

const mockAudienceResults: Array<{ id: string; username: string; displayName: string }> = [
  { id: 'user-7', username: 'nadia', displayName: 'Nadia' },
];
jest.mock('@/hooks/queries/use-users-query', () => ({
  useSearchUsersQuery: () => ({ data: mockAudienceResults, isLoading: false }),
}));

type MockAttachmentState = {
  selectedFiles: File[];
  uploadedAttachments: UploadedAttachmentResponse[];
  isUploading: boolean;
  uploadProgress: Record<number, number>;
};

let mockAttachmentState: MockAttachmentState;
let mockAttachmentOptions: { maxAttachments?: number } | undefined;
const mockHandleFilesSelected = jest.fn();
const mockHandleRemoveFile = jest.fn();
const mockClearAttachments = jest.fn();

jest.mock('@/hooks/composer/useAttachmentUpload', () => ({
  useAttachmentUpload: (options: { maxAttachments?: number }) => {
    mockAttachmentOptions = options;
    return {
      selectedFiles: mockAttachmentState.selectedFiles,
      uploadedAttachments: mockAttachmentState.uploadedAttachments,
      isUploading: mockAttachmentState.isUploading,
      uploadProgress: mockAttachmentState.uploadProgress,
      handleFilesSelected: mockHandleFilesSelected,
      handleRemoveFile: mockHandleRemoveFile,
      clearAttachments: mockClearAttachments,
    };
  },
}));

global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();

function makeAttachment(overrides: Partial<UploadedAttachmentResponse> = {}): UploadedAttachmentResponse {
  return {
    id: 'att-1',
    messageId: '',
    fileName: 'photo.png',
    originalName: 'photo.png',
    mimeType: 'image/png',
    fileSize: 1024,
    fileUrl: 'https://cdn.test/photo.png',
    uploadedBy: 'user-1',
    isAnonymous: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const TWO_IMAGES = [
  makeAttachment({ id: 'att-1', mimeType: 'image/jpeg' }),
  makeAttachment({ id: 'att-2', mimeType: 'image/png' }),
];

type Door = React.ComponentProps<typeof MeeshyComposer>['door'];

/** Les neuf portes du contrat, LUES — jamais une dixième inventée ici. */
const EVERY_DOOR: ReadonlyArray<Door> = [
  { kind: 'storyTray' },
  { kind: 'feedComposer' },
  { kind: 'reelTab' },
  { kind: 'moodChip' },
  { kind: 'repost', sourceFormat: 'reel' },
  { kind: 'edit', documentFormat: 'post' },
  { kind: 'draft' },
  { kind: 'share' },
  { kind: 'conversationMedia' },
];

function renderComposer(door: Door = { kind: 'feedComposer' }) {
  const onPublish = jest.fn();
  const view = render(<MeeshyComposer door={door} onPublish={onPublish} />);
  return {
    onPublish,
    // Le second argument est le VECTEUR de la porte vivante : sans lui, un
    // `rerender` repasse toujours la porte capturée en clôture, et un
    // changement de porte sur une instance déjà montée n'est jamais exercé.
    rerender: (nextDoor: Door = door) =>
      view.rerender(<MeeshyComposer door={nextDoor} onPublish={onPublish} />),
    container: view.container,
    published: () => onPublish.mock.calls[0]?.[0] as ComposerDocumentPayload | undefined,
  };
}

const paintedFormats = (): string[] =>
  screen
    .queryAllByRole('radio')
    .map((node) => node.getAttribute('data-testid') ?? '')
    .map((id) => id.replace('composer-format-', ''));

function expand(): void {
  fireEvent.focus(screen.getByLabelText('postComposer.contentLabel'));
}

function type(text: string): void {
  fireEvent.change(screen.getByLabelText('postComposer.contentLabel'), { target: { value: text } });
}

function publishButton(): HTMLButtonElement {
  return screen.getByText('publish').closest('button') as HTMLButtonElement;
}

function clickPublish(): void {
  fireEvent.click(screen.getByText('publish'));
}

function chooseVisibility(labelKey: string): void {
  fireEvent.click(screen.getByLabelText('postComposer.changeVisibility'));
  fireEvent.click(within(screen.getByTestId('composer-visibility-options')).getByText(labelKey));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockValidation = { valid: true, errors: [] };
  mockAttachmentOptions = undefined;
  mockAttachmentState = {
    selectedFiles: [],
    uploadedAttachments: [],
    isUploading: false,
    uploadProgress: {},
  };
  mockSearchUsers.mockResolvedValue([{ id: 'u-a', username: 'alice', displayName: 'Alice' }]);
});

// ─────────────────────────────────────────────────────────────────────────────
// Point 1 — contenu plafonné à 5 000, compteur au-delà de 4 500
// (`PostComposer.tsx` : `isValid`, `charCount`, l'attribut `maxLength` du
//  textarea, et le compteur sous `charCount > 4500` — les ancres à la ligne du
//  plan ne tenaient pas, elles ont été remplacées par leurs symboles)
// ─────────────────────────────────────────────────────────────────────────────
describe('W3 point 1 — le plafond de 5 000 caractères et son compteur', () => {
  it('borne la saisie à 5 000 caractères dans le DOM', () => {
    renderComposer();
    expect(screen.getByLabelText('postComposer.contentLabel')).toHaveAttribute('maxlength', '5000');
  });

  it("n'affiche AUCUN compteur à 4 500 caractères — il n'apparaît qu'au-delà", () => {
    renderComposer();
    expand();
    type('x'.repeat(4500));

    expect(screen.queryByTestId('composer-char-count')).not.toBeInTheDocument();
  });

  it('affiche le RESTANT dès 4 501 caractères', () => {
    renderComposer();
    expand();
    type('x'.repeat(4501));

    expect(screen.getByTestId('composer-char-count')).toHaveTextContent('499');
  });

  it('refuse de publier un contenu de 5 001 caractères (collé, le maxLength du DOM contourné)', () => {
    const { onPublish } = renderComposer();
    expand();
    type('x'.repeat(5001));

    expect(publishButton()).toBeDisabled();
    clickPublish();
    expect(onPublish).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Point 2 — pool UNIQUE de 10 médias (`PostComposer.tsx` : `MEDIA_LIMIT`, et
// son `useAttachmentUpload({ maxAttachments: MEDIA_LIMIT })`)
// ─────────────────────────────────────────────────────────────────────────────
describe('W3 point 2 — un seul pool de 10 médias, jamais une somme', () => {
  it('passe EXACTEMENT 10 à useAttachmentUpload — le plafond serveur de `mediaIds`, sans facteur correctif', () => {
    renderComposer();
    expect(mockAttachmentOptions?.maxAttachments).toBe(10);
  });

  it('compte `selectedFiles` SEUL : 9 sélectionnés dont 9 déjà uploadés laissent les boutons actifs', () => {
    const nine = Array.from({ length: 9 }, (_, i) => new File(['x'], `p${i}.png`, { type: 'image/png' }));
    mockAttachmentState.selectedFiles = nine;
    mockAttachmentState.uploadedAttachments = nine.map((_, i) =>
      makeAttachment({ id: `att-${i}`, mimeType: 'image/png' }),
    );
    renderComposer();
    expand();

    expect(screen.getByLabelText('postComposer.addPhoto')).not.toBeDisabled();
  });

  it('bloque les boutons média à 10 fichiers sélectionnés', () => {
    mockAttachmentState.selectedFiles = Array.from(
      { length: 10 },
      (_, i) => new File(['x'], `p${i}.png`, { type: 'image/png' }),
    );
    renderComposer();
    expand();

    expect(screen.getByLabelText('postComposer.addPhoto')).toBeDisabled();
    expect(screen.getByLabelText('postComposer.addVideo')).toBeDisabled();
  });

  it("dit le plafond par le CATALOGUE, jamais par une chaîne anglaise en dur (le composer hérité en portait deux, `:183` et `:200`)", () => {
    mockAttachmentState.selectedFiles = Array.from(
      { length: 10 },
      (_, i) => new File(['x'], `p${i}.png`, { type: 'image/png' }),
    );
    renderComposer();
    expand();

    fireEvent.change(screen.getByTestId('composer-media-input-image'), {
      target: { files: [new File(['x'], 'onemore.png', { type: 'image/png' })] },
    });

    const error = screen.getByTestId('composer-media-error');
    expect(error).toHaveTextContent('composer.media.limitReached');
    expect(error.textContent).not.toMatch(/You can attach/i);
  });

  it('ne garde que la place disponible et le DIT, toujours par le catalogue', () => {
    mockAttachmentState.selectedFiles = Array.from(
      { length: 9 },
      (_, i) => new File(['x'], `p${i}.png`, { type: 'image/png' }),
    );
    renderComposer();
    expand();

    fireEvent.change(screen.getByTestId('composer-media-input-image'), {
      target: {
        files: [
          new File(['x'], 'a.png', { type: 'image/png' }),
          new File(['x'], 'b.png', { type: 'image/png' }),
          new File(['x'], 'c.png', { type: 'image/png' }),
        ],
      },
    });

    expect(mockHandleFilesSelected).toHaveBeenCalledWith([expect.objectContaining({ name: 'a.png' })]);
    expect(screen.getByTestId('composer-media-error')).toHaveTextContent('composer.media.limitPartial');
  });

  it('remonte le message de validation du service quand un fichier est refusé', () => {
    mockValidation = { valid: false, errors: ['file too large'] };
    renderComposer();
    expand();

    fireEvent.change(screen.getByTestId('composer-media-input-image'), {
      target: { files: [new File(['x'], 'huge.png', { type: 'image/png' })] },
    });

    expect(screen.getByTestId('composer-media-error')).toHaveTextContent('file too large');
    expect(mockHandleFilesSelected).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Point 2 bis — l'APERÇU des médias sélectionnés, et le RETRAIT
//
// Le composer hérité laisse retirer un média avant publication (`PostComposer`,
// bouton ✕ de la vignette). Sans ces vecteurs, tout le bloc d'aperçu — les
// vignettes, la jauge de téléversement, la mémoïsation des URL blob et le ✕ —
// pouvait être supprimé sans qu'une seule assertion rougisse : la moitié
// « capacités » de la preuve de retrait aurait alors autorisé la suppression du
// composer hérité en ayant perdu l'une de ses capacités.
// ─────────────────────────────────────────────────────────────────────────────
describe('W3 point 2 bis — l’aperçu des médias et leur retrait', () => {
  const threeFiles = () => [
    new File(['x'], 'a.png', { type: 'image/png' }),
    new File(['x'], 'b.png', { type: 'image/png' }),
    new File(['x'], 'c.mp4', { type: 'video/mp4' }),
  ];

  it('peint UNE vignette par fichier sélectionné', () => {
    mockAttachmentState.selectedFiles = threeFiles();
    renderComposer();
    expand();

    const preview = screen.getByTestId('composer-media-preview');
    expect(within(preview).getAllByLabelText('delete')).toHaveLength(3);
  });

  it('ne peint aucun aperçu tant que rien n’est sélectionné', () => {
    renderComposer();
    expand();

    expect(screen.queryByTestId('composer-media-preview')).not.toBeInTheDocument();
  });

  it('le ✕ de la vignette i retire le média i — pas le premier', () => {
    mockAttachmentState.selectedFiles = threeFiles();
    renderComposer();
    expand();

    const removeButtons = within(screen.getByTestId('composer-media-preview')).getAllByLabelText('delete');
    fireEvent.click(removeButtons[2]);

    expect(mockHandleRemoveFile).toHaveBeenCalledTimes(1);
    expect(mockHandleRemoveFile).toHaveBeenCalledWith(2);
  });

  it('retirer un média efface le message de plafond — il ne survit pas à la place libérée', () => {
    mockAttachmentState.selectedFiles = Array.from(
      { length: 10 },
      (_, i) => new File(['x'], `p${i}.png`, { type: 'image/png' }),
    );
    renderComposer();
    expand();
    fireEvent.change(screen.getByTestId('composer-media-input-image'), {
      target: { files: [new File(['x'], 'onemore.png', { type: 'image/png' })] },
    });
    expect(screen.getByTestId('composer-media-error')).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByTestId('composer-media-preview')).getAllByLabelText('delete')[0],
    );

    expect(screen.queryByTestId('composer-media-error')).not.toBeInTheDocument();
  });

  it('n’émet qu’UNE url d’objet par `File`, même après plusieurs frappes dans la légende', () => {
    mockAttachmentState.selectedFiles = [new File(['x'], 'a.png', { type: 'image/png' })];
    renderComposer();
    expand();
    const mintedAfterFirstPaint = (global.URL.createObjectURL as jest.Mock).mock.calls.length;

    type('B');
    type('Bo');
    type('Bon');

    expect(mintedAfterFirstPaint).toBe(1);
    expect((global.URL.createObjectURL as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('RÉVOQUE l’url d’un fichier qui quitte la sélection', () => {
    const [first, second] = threeFiles();
    mockAttachmentState.selectedFiles = [first, second];
    const { rerender } = renderComposer();
    expand();
    expect(global.URL.revokeObjectURL).not.toHaveBeenCalled();

    mockAttachmentState.selectedFiles = [first];
    rerender();

    expect(global.URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('affiche la jauge de téléversement sur les vignettes, et seulement pendant le téléversement', () => {
    mockAttachmentState.selectedFiles = [new File(['x'], 'a.png', { type: 'image/png' })];
    mockAttachmentState.uploadProgress = { 0: 42 };
    mockAttachmentState.isUploading = true;
    const { rerender } = renderComposer();
    expand();

    expect(within(screen.getByTestId('composer-media-preview')).getByText('42%')).toBeInTheDocument();

    mockAttachmentState.isUploading = false;
    rerender();

    expect(within(screen.getByTestId('composer-media-preview')).queryByText('42%')).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Point 3 — alt PAR MÉDIA via `MediaAccessibilityFields`
// ─────────────────────────────────────────────────────────────────────────────
describe('W3 point 3 — le texte alternatif par média', () => {
  it('monte un champ alt par média uploadé et publie ce qui a été tapé', () => {
    mockAttachmentState.uploadedAttachments = TWO_IMAGES;
    const { onPublish, published } = renderComposer();
    expand();

    fireEvent.change(screen.getByTestId('media-alt-input-att-1'), { target: { value: 'un chat' } });
    type('Bonjour');
    clickPublish();

    expect(onPublish).toHaveBeenCalledTimes(1);
    expect(published()?.mediaAlt).toEqual({ 'att-1': 'un chat' });
  });

  it("n'envoie PAS `mediaAlt` (jamais `{}`) quand l'auteur n'a touché aucun champ", () => {
    mockAttachmentState.uploadedAttachments = TWO_IMAGES;
    const { published } = renderComposer();
    expand();
    type('Bonjour');
    clickPublish();

    expect(published()).not.toHaveProperty('mediaAlt');
  });

  it('ne ressuscite pas un alt orphelin : le média retiré emporte sa clé', async () => {
    mockAttachmentState.uploadedAttachments = TWO_IMAGES;
    const { rerender, published } = renderComposer();
    expand();
    fireEvent.change(screen.getByTestId('media-alt-input-att-2'), { target: { value: 'orphelin' } });

    mockAttachmentState.uploadedAttachments = [TWO_IMAGES[0]];
    rerender();
    await waitFor(() => expect(screen.queryByTestId('media-alt-input-att-2')).not.toBeInTheDocument());

    type('Bonjour');
    clickPublish();
    expect(published()).not.toHaveProperty('mediaAlt');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Point 4 — `allowSoundExtraction` TRI-ÉTAT (`PostComposer.tsx`,
// `allowSoundExtraction` + `allowSoundExtractionTouched`,
// contrat `:47-54`)
// ─────────────────────────────────────────────────────────────────────────────
describe("W3 point 4 — l'opt-in son est un TRI-ÉTAT, pas un booléen", () => {
  const withVideo = [makeAttachment({ id: 'vid-1', mimeType: 'video/mp4', duration: 5000 })];

  it('ABSENT tant que la bascule n’a pas été touchée — un défaut non touché n’écrase rien côté serveur', () => {
    mockAttachmentState.uploadedAttachments = withVideo;
    const { published } = renderComposer();
    expand();
    type('Bonjour');
    clickPublish();

    expect(published()).not.toHaveProperty('allowSoundExtraction');
  });

  it('`true` quand l’auteur l’active', () => {
    mockAttachmentState.uploadedAttachments = withVideo;
    const { published } = renderComposer();
    expand();
    fireEvent.click(screen.getByTestId('media-sound-extraction-checkbox'));
    type('Bonjour');
    clickPublish();

    expect(published()?.allowSoundExtraction).toBe(true);
  });

  it('`false` — et non ABSENT — quand l’auteur l’active puis la désactive', () => {
    mockAttachmentState.uploadedAttachments = withVideo;
    const { published } = renderComposer();
    expand();
    const toggle = screen.getByTestId('media-sound-extraction-checkbox');
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    type('Bonjour');
    clickPublish();

    expect(published()?.allowSoundExtraction).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Point 5 — références non-INLINE (`components/composer/payload.ts`, `mentions` ;
// `PostComposer.tsx`, `handlePickReference`)
// ─────────────────────────────────────────────────────────────────────────────
describe('W3 point 5 — les références déclarées', () => {
  it("n'envoie AUCUN `mentions` quand personne n'est référencé — `[]` effacerait les références du serveur", () => {
    const { published } = renderComposer();
    expand();
    type('Bonjour');
    clickPublish();

    expect(published()).not.toHaveProperty('mentions');
  });

  it('publie la personne choisie en SILENT et retire son @handle de la légende', async () => {
    const { published } = renderComposer();
    expand();
    type('Salut @alice, ça va ?');

    fireEvent.click(screen.getByLabelText('Mention someone'));
    fireEvent.change(screen.getByPlaceholderText('Search for someone'), {
      target: { value: 'ali' },
    });
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Alice'));

    await waitFor(() =>
      expect(screen.getByLabelText('postComposer.contentLabel')).toHaveValue('Salut, ça va ?'),
    );

    clickPublish();
    // `referencePayload` (`@meeshy/shared/utils/composer-references:53-61`)
    // désigne par ID dès qu'il en connaît un, et ne retombe sur le pseudo que
    // faute d'ID : un pseudo change, un ID non.
    expect(published()?.mentions).toEqual([{ userId: 'u-a', display: 'SILENT' }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Point 6 — audience EXCEPT/ONLY gatée par `isAudienceIncomplete`
// ─────────────────────────────────────────────────────────────────────────────
describe('W3 point 6 — une audience nommée ne part jamais vide', () => {
  it('offre les SIX audiences du modèle, dans l’ordre de la source unique', () => {
    renderComposer();
    expand();
    fireEvent.click(screen.getByLabelText('postComposer.changeVisibility'));

    const options = within(screen.getByTestId('composer-visibility-options')).getAllByRole('button');
    expect(options.map((b) => b.textContent)).toEqual(
      PUBLICATION_VISIBILITY_OPTIONS.map((o) => `${o.icon}${o.labelKey}`),
    );
  });

  it('bloque la publication d’un EXCEPT sans personne désignée', () => {
    const { onPublish } = renderComposer();
    expand();
    type('Bonjour');
    chooseVisibility('publicationVisibility.except');

    expect(screen.getByTestId('audience-user-picker')).toBeInTheDocument();
    expect(publishButton()).toBeDisabled();
    clickPublish();
    expect(onPublish).not.toHaveBeenCalled();
  });

  it('publie l’audience une fois qu’elle porte au moins une personne', () => {
    const { published } = renderComposer();
    expand();
    type('Bonjour');
    chooseVisibility('publicationVisibility.only');
    fireEvent.change(screen.getByPlaceholderText('audiencePicker.searchPlaceholder'), {
      target: { value: 'nad' },
    });
    fireEvent.click(screen.getByText('Nadia'));
    clickPublish();

    expect(published()?.visibility).toBe('ONLY');
    expect(published()?.visibilityUserIds).toEqual(['user-7']);
  });

  it('ne transporte AUCUNE liste sous une audience qui n’en prend pas', () => {
    const { published } = renderComposer();
    expand();
    type('Bonjour');
    clickPublish();

    expect(published()?.visibility).toBe('PUBLIC');
    expect(published()?.visibilityUserIds).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Point 7 — `optimisticMedia` rendu à l'APPELANT
// (`components/composer/payload.ts`, `optimisticMedia`)
// ─────────────────────────────────────────────────────────────────────────────
describe('W3 point 7 — l’écho optimiste des médias', () => {
  it('rend les médias uploadés à l’appelant, dans leur ordre d’insertion', () => {
    mockAttachmentState.uploadedAttachments = TWO_IMAGES;
    const { published } = renderComposer();
    expand();
    type('Bonjour');
    clickPublish();

    expect(published()?.mediaIds).toEqual(['att-1', 'att-2']);
    expect(published()?.optimisticMedia).toEqual([
      expect.objectContaining({ id: 'att-1', order: 0, fileUrl: 'https://cdn.test/photo.png' }),
      expect.objectContaining({ id: 'att-2', order: 1 }),
    ]);
  });

  it('reste ABSENT quand il n’y a aucun média — comme `mediaIds`', () => {
    const { published } = renderComposer();
    expand();
    type('Bonjour');
    clickPublish();

    expect(published()?.optimisticMedia).toBeUndefined();
    expect(published()?.mediaIds).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Point 8 — l'ÉVENTAIL remplace la bascule locale
// ─────────────────────────────────────────────────────────────────────────────
describe('W3 point 8 — l’éventail de la porte, à la place de la bascule locale', () => {
  it('ouvre `feedComposer` sur POST, l’état initial que fixe le contrat', () => {
    mockAttachmentState.uploadedAttachments = TWO_IMAGES;
    renderComposer();
    expand();

    expect(screen.getByTestId('composer-format-post')).toHaveAttribute('aria-checked', 'true');
  });

  it('ne peint AUCUN éventail sur une composition vide — un seul format routable, donc rien à choisir', () => {
    const { published } = renderComposer();
    expand();

    expect(screen.queryByTestId('composer-format-fan')).not.toBeInTheDocument();
    type('Bonjour');
    clickPublish();
    expect(published()?.type).toBe('POST');
  });

  it('N’A PAS transporté la bascule POST/RÉEL du composer hérité', () => {
    mockAttachmentState.uploadedAttachments = TWO_IMAGES;
    renderComposer();
    expand();

    expect(screen.queryByTestId('post-composer-type-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-composer-type-reel')).not.toBeInTheDocument();
  });

  it('n’offre PAS RÉEL sur une composition qui ne qualifie pas — absent du DOM, jamais grisé', () => {
    mockAttachmentState.uploadedAttachments = [makeAttachment({ mimeType: 'image/jpeg' })];
    const { container } = renderComposer();
    expand();

    expect(screen.queryByTestId('composer-format-reel')).not.toBeInTheDocument();
    // Loi 4 : pas de pastille grisée en guise d'excuse. La garde vise le
    // conteneur entier — un `disabled` posé sur un bouton de format le ferait
    // rougir ici même si le nœud n'était plus dans l'éventail.
    expect(container.querySelectorAll('[aria-disabled]')).toHaveLength(0);
    expect(container.innerHTML).not.toContain('composer.format.reel');
  });

  it('offre RÉEL dès que la composition qualifie, et publie REEL quand l’auteur le choisit', () => {
    mockAttachmentState.uploadedAttachments = TWO_IMAGES;
    const { published } = renderComposer();
    expand();

    fireEvent.click(screen.getByTestId('composer-format-reel'));
    type('Bonjour');
    clickPublish();

    expect(published()?.type).toBe('REEL');
  });

  it('publie POST tant que l’auteur ne choisit pas RÉEL, même sur une composition qualifiante', () => {
    mockAttachmentState.uploadedAttachments = TWO_IMAGES;
    const { published } = renderComposer();
    expand();
    type('Bonjour');
    clickPublish();

    expect(published()?.type).toBe('POST');
  });

  /**
   * LA DIVERGENCE ASSUMÉE, épinglée sur le geste exact qui change de résultat.
   *
   * Composer hérité : `useState<PostType>('REEL')` (`PostComposer.tsx`) puis
   * `effectivePostType = compositionQualifies ? postType : 'POST'` —
   * joindre une vidéo de 5 s et publier sans rien toucher rend `type: 'REEL'`,
   * et la publication entre dans le fil Réels.
   *
   * Ici le format naît de la PORTE (`feedComposer` ⇒ `post`,
   * `composer-contract.ts`, `case 'feedComposer'`) et la promotion est un geste. Le même geste
   * publie donc un POST. C'est voulu — reproduire le quirk demanderait de
   * re-semer un format initial contre la table partagée — mais ce n'est pas
   * neutre pour le produit, et c'est ce que ce test dit à voix haute.
   */
  it('DIVERGENCE ASSUMÉE — une vidéo qualifiante publiée sans geste donne POST, là où le composer hérité donnait REEL', () => {
    mockAttachmentState.uploadedAttachments = [
      makeAttachment({ id: 'att-v', mimeType: 'video/mp4', duration: 5000 }),
    ];
    const { published } = renderComposer({ kind: 'feedComposer' });
    expand();

    // L'éventail OFFRE bien le réel — rien n'empêche l'auteur de le choisir.
    expect(screen.getByTestId('composer-format-reel')).toBeInTheDocument();
    expect(screen.getByTestId('composer-format-post')).toHaveAttribute('aria-checked', 'true');

    type('Bonjour');
    clickPublish();

    expect(published()?.type).toBe('POST');
  });

  it('une composition qui DÉ-QUALIFIE reprend la sélection RÉEL et publie POST', async () => {
    mockAttachmentState.uploadedAttachments = TWO_IMAGES;
    const { rerender, published } = renderComposer();
    expand();
    fireEvent.click(screen.getByTestId('composer-format-reel'));

    mockAttachmentState.uploadedAttachments = [TWO_IMAGES[0]];
    rerender();
    await waitFor(() => expect(screen.queryByTestId('composer-format-reel')).not.toBeInTheDocument());

    type('Bonjour');
    clickPublish();
    expect(published()?.type).toBe('POST');
  });

  it('un RÉEL non qualifiant ne fuit PAS vers le fil, même quand la porte offre RÉEL sans composition (`reelTab`)', () => {
    const { published } = renderComposer({ kind: 'reelTab' });
    expand();

    // Le contrat OFFRE reel à cette porte avant qu'une composition existe
    // (`composer-contract.ts`, `case 'reelTab'`) : le repli de l'éventail ne peut donc
    // pas être le seul garde-fou, et la charge dégrade comme le fait
    // `effectivePostType` (`PostComposer.tsx`).
    expect(screen.getByTestId('composer-format-reel')).toHaveAttribute('aria-checked', 'true');
    type('Bonjour');
    clickPublish();

    expect(published()?.type).toBe('POST');
  });

  it('publie REEL depuis `reelTab` dès que la composition qualifie', () => {
    mockAttachmentState.uploadedAttachments = TWO_IMAGES;
    const { published } = renderComposer({ kind: 'reelTab' });
    expand();
    type('Bonjour');
    clickPublish();

    expect(published()?.type).toBe('REEL');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L'ÉVENTAIL NE PROPOSE QUE CE QUE LE MEUBLE SAIT PEINDRE
//
// La porte du fil OFFRE `story` (`composer-contract.ts`, `feedComposer` ⇒
// `['post','story']`) et le meuble n'a pas encore de surface story. Peindre ce
// bouton promettait une affordance qui, au clic, démontait la surface — donc le
// brouillon entier : texte, médias, références, audience — sans laisser un seul
// nœud pour revenir en arrière, puisque l'éventail vit DANS la surface.
//
// La loi 4 tranche : rien à l'écran sans raison. Ce que l'auteur peut choisir
// est l'intersection de ce que la PORTE offre et de ce que l'HÔTE sait peindre.
// Ce n'est pas une règle de la table partagée — c'est l'aveu d'une capacité, et
// il se referme tout seul le jour où la surface manquante arrive.
// ─────────────────────────────────────────────────────────────────────────────
describe('W3 — l’éventail n’offre jamais un format que le meuble ne peut pas peindre', () => {
  it('n’offre PAS story sur `feedComposer`, alors que la porte l’offre — le meuble n’a pas cette surface', () => {
    mockAttachmentState.uploadedAttachments = TWO_IMAGES;
    renderComposer();
    expand();

    expect(webComposerOpening({ kind: 'feedComposer' }, TWO_IMAGES).offeredFormats).toContain('story');
    expect(screen.queryByTestId('composer-format-story')).not.toBeInTheDocument();
    expect(paintedFormats()).toEqual(['post', 'reel']);
  });

  it('aucun bouton de l’éventail ne mène hors des formats que le meuble route, sur les neuf portes', () => {
    EVERY_DOOR.forEach((door) => {
      mockAttachmentState.uploadedAttachments = TWO_IMAGES;
      const view = render(<MeeshyComposer door={door} onPublish={jest.fn()} />);
      if (screen.queryByLabelText('postComposer.contentLabel')) expand();

      paintedFormats().forEach((format) => expect(['post', 'reel']).toContain(format));

      view.unmount();
    });
  });

  it('le brouillon SURVIT à tout format que l’éventail propose — aucun choix offert n’est destructeur', () => {
    mockAttachmentState.uploadedAttachments = TWO_IMAGES;
    renderComposer();
    expand();
    type('Un brouillon de trois cents mots');

    paintedFormats().forEach((format) => {
      fireEvent.click(screen.getByTestId(`composer-format-${format}`));
      expect(screen.getByTestId('composer-document-surface')).toBeInTheDocument();
      expect(screen.getByLabelText('postComposer.contentLabel')).toHaveValue(
        'Un brouillon de trois cents mots',
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LA PORTE VIVANTE — elle change sur une instance déjà montée
//
// `initialFormat` se recalcule à chaque rendu, mais l'état du format ne se sème
// qu'au montage. W7 tient la porte en ÉTAT sur un seul composer par écran (cinq
// gestes, cinq portes) : sans re-semis, l'onglet Réels s'ouvrirait sur POST et
// publierait des POST en silence.
// ─────────────────────────────────────────────────────────────────────────────
describe('W3 — un changement de PORTE re-sème le format', () => {
  it('passer de `feedComposer` à `reelTab` sélectionne RÉEL', () => {
    mockAttachmentState.uploadedAttachments = TWO_IMAGES;
    const { rerender } = renderComposer({ kind: 'feedComposer' });
    expand();
    expect(screen.getByTestId('composer-format-post')).toHaveAttribute('aria-checked', 'true');

    rerender({ kind: 'reelTab' });

    expect(screen.getByTestId('composer-format-reel')).toHaveAttribute('aria-checked', 'true');
  });

  it('publier depuis la porte NOUVELLE porte son format, pas celui de l’ancienne', () => {
    mockAttachmentState.uploadedAttachments = TWO_IMAGES;
    const { rerender, published } = renderComposer({ kind: 'feedComposer' });
    expand();

    rerender({ kind: 'reelTab' });
    type('Bonjour');
    clickPublish();

    expect(published()?.type).toBe('REEL');
  });

  it('l’éventail suit la porte NOUVELLE — `reelTab` n’offre que [reel, post]', () => {
    mockAttachmentState.uploadedAttachments = TWO_IMAGES;
    const { rerender } = renderComposer({ kind: 'feedComposer' });
    expand();

    rerender({ kind: 'reelTab' });

    expect(paintedFormats()).toEqual(['reel', 'post']);
  });

  it('une porte INCHANGÉE ne réinitialise PAS un format que l’auteur vient de choisir', () => {
    mockAttachmentState.uploadedAttachments = TWO_IMAGES;
    const { rerender } = renderComposer({ kind: 'feedComposer' });
    expand();
    fireEvent.click(screen.getByTestId('composer-format-reel'));

    rerender();

    expect(screen.getByTestId('composer-format-reel')).toHaveAttribute('aria-checked', 'true');
  });

  it('deux portes de MÊME sorte mais de format différent sont deux portes — `edit` d’un post puis d’un réel', () => {
    const { rerender } = renderComposer({ kind: 'edit', documentFormat: 'post' });
    expand();

    rerender({ kind: 'edit', documentFormat: 'reel' });

    expect(screen.getByTestId('composer-format-reel')).toHaveAttribute('aria-checked', 'true');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Le meuble : ce qu'il route, et ce que CE LOT n'a pas encore peint
// ─────────────────────────────────────────────────────────────────────────────
describe('W3 — le meuble et sa porte', () => {
  // Ce bloc n'assère QUE ce que la porte ouvre. La surface naît VIDE quelle que
  // soit la porte : rien ici n'hydrate un document déjà publié — ni son texte,
  // ni ses médias, ni son audience. Lire ces tests comme « l'édition marche »
  // serait une erreur, et c'est précisément le genre de lecture qu'un test mal
  // nommé installe pour la session suivante.
  it('ouvre `edit` d’un réel sur RÉEL, avec POST pour seule autre issue', () => {
    renderComposer({ kind: 'edit', documentFormat: 'reel' });
    expand();

    expect(screen.getByTestId('composer-format-reel')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('composer-format-post')).toBeInTheDocument();
    expect(screen.queryByTestId('composer-format-story')).not.toBeInTheDocument();
  });

  it('ne peint RIEN quand la PORTE elle-même ouvre sur un format sans surface — pas une surface document de repli', () => {
    // `storyTray` ouvre sur `story` : le meuble n'a pas cette surface, donc il
    // ne peint rien plutôt que d'ouvrir un POST que l'auteur n'a pas demandé.
    // C'est le seul chemin qui reste vers l'écran vide — l'éventail, lui,
    // n'offre plus aucun format que le meuble ne sait peindre.
    const { container } = renderComposer({ kind: 'storyTray' });

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('composer-document-surface')).not.toBeInTheDocument();
  });

  it('ne peint rien du tout sur `moodChip`, dont le format n’a pas de surface ici', () => {
    const { container } = renderComposer({ kind: 'moodChip' });
    expect(container).toBeEmptyDOMElement();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Les gestes de publication portés tels quels
// ─────────────────────────────────────────────────────────────────────────────
describe('W3 — les gardes et le reset de la publication', () => {
  it('refuse de publier un brouillon vide', () => {
    const { onPublish } = renderComposer();
    expand();
    clickPublish();

    expect(onPublish).not.toHaveBeenCalled();
  });

  it('publie un média SEUL, sans une ligne de texte', () => {
    mockAttachmentState.uploadedAttachments = [makeAttachment({ mimeType: 'image/jpeg' })];
    const { published } = renderComposer();
    expand();
    clickPublish();

    expect(published()?.content).toBe('');
    expect(published()?.mediaIds).toEqual(['att-1']);
  });

  it('refuse de publier pendant un téléversement', () => {
    mockAttachmentState.isUploading = true;
    const { onPublish } = renderComposer();
    expand();
    type('Bonjour');
    fireEvent.click(screen.getByText('uploading'));

    expect(onPublish).not.toHaveBeenCalled();
  });

  it('publie au raccourci ⌘/Ctrl+Entrée', () => {
    const { onPublish } = renderComposer();
    expand();
    type('Bonjour');
    fireEvent.keyDown(screen.getByLabelText('postComposer.contentLabel'), { key: 'Enter', metaKey: true });

    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it('vide le brouillon et rend la main aux pièces jointes après publication', () => {
    const { onPublish } = renderComposer();
    expand();
    type('  Bonjour  ');
    clickPublish();

    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ content: 'Bonjour' }));
    expect(screen.getByLabelText('postComposer.contentLabel')).toHaveValue('');
    expect(mockClearAttachments).toHaveBeenCalledTimes(1);
  });
});
