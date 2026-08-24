/**
 * W7, incrément I2 (Option B) — le bouton rond du fil ARME l'outil micro au
 * lieu d'ouvrir `AudioPostComposer`.
 *
 * Trois props ADDITIVES et OPTIONNELLES portent l'armement, de l'hôte
 * jusqu'à l'outil : `MeeshyComposer.armCaptureToken?: number` →
 * `ComposerDocumentSurface.armCaptureToken?: number` (force `isExpanded` et
 * relaie) → `AudioCapture.armToken?: number` (ouvre son panneau). Aucune
 * signature existante ne change ; aucun appelant actuel n'est touché — c'est
 * ce que `meeshy-composer-post.test.tsx` et `meeshy-composer-audio.test.tsx`
 * continuent de prouver sans la moindre modification.
 *
 * Pourquoi un JETON (compteur) et pas un booléen : refermer le panneau puis
 * re-taper le bouton rond doit RÉ-ouvrir la capture. Un `true` déjà `true` ne
 * change pas de valeur — React ne redéclenche donc aucun effet — alors qu'un
 * compteur qui s'incrémente à chaque tap change de valeur à CHAQUE geste,
 * fermé ou pas.
 *
 * Cette suite ne réenregistre RIEN (pas de `getUserMedia`/`MediaRecorder`
 * installés) : elle ne prouve que l'OUVERTURE du panneau, jamais la capture
 * elle-même — déjà couverte par `meeshy-composer-audio.test.tsx`.
 */
import React, { useCallback, useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MeeshyComposer } from '@/components/composer/MeeshyComposer';

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
  useUser: () => null,
}));

let mockValidation: { valid: boolean; errors: string[] } = { valid: true, errors: [] };
jest.mock('@/services/attachmentService', () => ({
  AttachmentService: {
    validateFiles: () => mockValidation,
  },
}));

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

jest.mock('@/services/users.service', () => ({
  usersService: { searchUsers: jest.fn().mockResolvedValue([]) },
}));

jest.mock('@/hooks/queries/use-users-query', () => ({
  useSearchUsersQuery: () => ({ data: [], isLoading: false }),
}));

jest.mock('@/hooks/composer/useAttachmentUpload', () => ({
  useAttachmentUpload: () => ({
    selectedFiles: [],
    uploadedAttachments: [],
    isUploading: false,
    uploadProgress: {},
    handleFilesSelected: jest.fn(),
    handleRemoveFile: jest.fn(),
    clearAttachments: jest.fn(),
  }),
}));

type Props = React.ComponentProps<typeof MeeshyComposer>;

function renderDocument(props: Partial<Props> = {}) {
  const onPublish = jest.fn();
  const view = render(<MeeshyComposer door={{ kind: 'feedComposer' }} onPublish={onPublish} {...props} />);
  return {
    onPublish,
    rerender: (next: Partial<Props> = props) =>
      view.rerender(<MeeshyComposer door={{ kind: 'feedComposer' }} onPublish={onPublish} {...next} />),
  };
}

function closePanel(): void {
  fireEvent.click(screen.getByTestId('audio-capture-toggle'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockValidation = { valid: true, errors: [] };
});

describe('W7 — armCaptureToken force l’expansion et ouvre le panneau de capture', () => {
  it('sans armCaptureToken, la surface reste repliée et le panneau audio fermé', () => {
    renderDocument();
    expect(screen.queryByTestId('audio-capture-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('audio-capture-toggle')).not.toBeInTheDocument();
  });

  it('un armCaptureToken déjà défini AU MONTAGE force l’expansion et ouvre le panneau', () => {
    renderDocument({ armCaptureToken: 1 });
    expect(screen.getByTestId('audio-capture-panel')).toBeInTheDocument();
  });

  it('un CHANGEMENT de jeton après montage force l’expansion et ouvre le panneau', () => {
    const { rerender } = renderDocument({ armCaptureToken: undefined });
    expect(screen.queryByTestId('audio-capture-panel')).not.toBeInTheDocument();

    rerender({ armCaptureToken: 1 });
    expect(screen.getByTestId('audio-capture-panel')).toBeInTheDocument();
  });

  it('refermer le panneau PUIS re-taper (jeton incrémenté) le RÉ-ouvre — un booléen déjà vrai ne le ferait pas', () => {
    const { rerender } = renderDocument({ armCaptureToken: 1 });
    expect(screen.getByTestId('audio-capture-panel')).toBeInTheDocument();

    closePanel();
    expect(screen.queryByTestId('audio-capture-panel')).not.toBeInTheDocument();

    rerender({ armCaptureToken: 2 });
    expect(screen.getByTestId('audio-capture-panel')).toBeInTheDocument();
  });

  it('un jeton INCHANGÉ entre deux rendus ne réouvre pas un panneau que l’auteur vient de refermer', () => {
    const { rerender } = renderDocument({ armCaptureToken: 1, disabled: false });
    closePanel();
    expect(screen.queryByTestId('audio-capture-panel')).not.toBeInTheDocument();

    // Un rendu déclenché par AUTRE CHOSE (ici `disabled`), même jeton.
    rerender({ armCaptureToken: 1, disabled: true });
    expect(screen.queryByTestId('audio-capture-panel')).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// R2 — l'HÔTE, modelé sur `PostsFeedScreen` : un bouton rond qui incrémente
// un jeton d'état, et le meuble qui le reçoit.
//
// Rendre le meuble SEUL, avec un jeton figé passé en prop, ne peut pas voir
// le défaut mesuré : celui-ci passe par un REMONTAGE (publier replie la
// surface et démonte l'outil ; changer de format démonte la surface entière),
// or React ré-exécute chaque effet au montage. Il faut donc un hôte qui
// POSSÈDE le jeton, exactement comme l'écran du fil.
// ─────────────────────────────────────────────────────────────────────────
function FeedHost({ disabled = false }: { disabled?: boolean }) {
  const [token, setToken] = useState<number | undefined>(undefined);
  const consume = useCallback(() => setToken(undefined), []);
  return (
    <>
      <button type="button" data-testid="host-mic" onClick={() => setToken((t) => (t ?? 0) + 1)}>
        mic
      </button>
      <MeeshyComposer
        door={{ kind: 'feedComposer' }}
        onPublish={jest.fn()}
        onPublishStory={jest.fn()}
        armCaptureToken={token}
        onCaptureArmed={consume}
        disabled={disabled}
      />
    </>
  );
}

function tapMic(): void {
  fireEvent.click(screen.getByTestId('host-mic'));
}

function expand(): void {
  fireEvent.focus(screen.getByLabelText('postComposer.contentLabel'));
}

function panelIsOpen(): boolean {
  return screen.queryByTestId('audio-capture-panel') !== null;
}

describe("W7 — le jeton d'armement se CONSOMME : le panneau micro ne se rouvre jamais tout seul", () => {
  it("un tap ouvre le panneau (l'hôte arme réellement l'outil)", () => {
    render(<FeedHost />);
    tapMic();
    expect(panelIsOpen()).toBe(true);
  });

  it("publier puis re-déplier la surface ne rouvre PAS le panneau — l'outil est REMONTÉ, pas re-demandé", () => {
    render(<FeedHost />);
    tapMic();
    expect(panelIsOpen()).toBe(true);
    closePanel();

    fireEvent.change(screen.getByLabelText('postComposer.contentLabel'), { target: { value: 'Un post' } });
    fireEvent.click(screen.getByText('publish'));

    expand();
    expect(panelIsOpen()).toBe(false);
  });

  it("un aller-retour de format (post → story → post) ne rouvre PAS le panneau — la SURFACE est remontée", () => {
    render(<FeedHost />);
    tapMic();
    closePanel();

    fireEvent.click(screen.getByTestId('composer-format-story'));
    expect(screen.getByTestId('composer-story-surface')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('composer-format-post'));

    expect(screen.getByTestId('composer-document-surface')).toBeInTheDocument();
    expect(panelIsOpen()).toBe(false);
  });

  it("re-taper le bouton APRÈS consommation ré-arme — un jeton consommé n'est pas un jeton mort", () => {
    render(<FeedHost />);
    tapMic();
    closePanel();
    expect(panelIsOpen()).toBe(false);

    tapMic();
    expect(panelIsOpen()).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// R2b (loi 4) — « Enregistrer un post audio » depuis un format qui ne porte
// pas l'outil. Le bouton rond du fil vit HORS du meuble : il reste peint et
// tapable quand l'auteur a choisi story dans l'éventail. Peint, tapable,
// sans effet, c'est très exactement ce que la loi 4 interdit — le geste
// RAMÈNE donc sur le format document, qui est ce que son libellé promet.
// ─────────────────────────────────────────────────────────────────────────
describe('W7 — armer depuis un format sans outil micro ramène sur le format document', () => {
  it('depuis la surface story, taper le bouton rond remonte la surface document et ouvre le panneau', () => {
    render(<FeedHost />);
    expand();
    fireEvent.click(screen.getByTestId('composer-format-story'));
    expect(screen.getByTestId('composer-story-surface')).toBeInTheDocument();

    tapMic();

    expect(screen.getByTestId('composer-document-surface')).toBeInTheDocument();
    expect(panelIsOpen()).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// R6 — `disabled` (publication en vol) descend jusqu'à l'OUTIL. Le dialogue
// audio hérité le recevait (`AudioPostComposer disabled={…isPending}`) ;
// l'outil qui le remplace ne le recevait plus, et l'armement l'ignorait.
// ─────────────────────────────────────────────────────────────────────────
describe('W7 — une surface désactivée désactive aussi son outil micro', () => {
  it('la bascule de capture est désactivée quand la surface l’est', () => {
    render(<FeedHost disabled />);
    expand();
    expect(screen.getByTestId('audio-capture-toggle')).toBeDisabled();
  });

  it("un jeton reçu pendant la publication n'ouvre rien, et ouvre dès que la surface redevient active", () => {
    const view = render(<FeedHost disabled />);
    tapMic();
    expect(panelIsOpen()).toBe(false);

    // Le jeton n'est PAS consommé tant qu'il n'a rien ouvert : l'intention de
    // l'auteur survit à la publication en vol plutôt que d'être avalée.
    view.rerender(<FeedHost disabled={false} />);
    expect(panelIsOpen()).toBe(true);
  });
});
