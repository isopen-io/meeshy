/**
 * W4 — le micro devient un OUTIL du format post, pas un cinquième format.
 *
 * `AudioPostComposer.tsx` (531 l., RETIRÉ à la Task W9) était une SURFACE DE
 * CAPTURE, pas un format : la table des portes §C n'en connaît que quatre
 * (post/story/reel/status), et un post audio est un POST PORTEUR d'un média
 * audio. `AudioCapture` porte donc, telle quelle, la machine de capture qu'
 * `AudioPostComposer` portait — quatre phases, négociation de mimeType,
 * quatre locales de reconnaissance, forme d'onde — et la branche dans la
 * rangée d'outils de `ComposerDocumentSurface`, à côté de photo/vidéo.
 *
 * Ce qui change, et pourquoi :
 *
 *  1. **une seule stratégie de téléversement.** `AudioPostComposer` ne
 *     téléverse jamais lui-même — c'est `PostsFeedScreen.handleAudioPublish`
 *     qui construit un `TusUploadService` en deux temps (upload puis
 *     `mediaIds: [media.id]`). L'outil neuf n'a plus cet appelant à deux
 *     temps : le fichier produit entre dans le MÊME pool que photo/vidéo, par
 *     `useAttachmentUpload`, et ni `AudioCapture.tsx` ni
 *     `ComposerDocumentSurface.tsx` ne référencent `TusUploadService` —
 *     asserté ici par lecture de source, pas par absence globale du symbole ;
 *  2. **le micro ne pose AUCUNE langue d'origine.** `AudioPostComposer`
 *     construit sa transcription avec `language: transcriptLang || 'fr'` puis
 *     `PostsFeedScreen.handleAudioPublish` la recopie dans `originalLanguage`.
 *     Or `transcriptLang` vient de `recognition.lang`, réglé depuis la
 *     PRÉFÉRENCE de l'auteur : c'est l'hypothèse du reconnaisseur, jamais une
 *     langue mesurée dans ce qui a été dit — et `originalLanguage` décrit la
 *     langue de `content`, la légende TAPÉE, que le micro n'a pas entendue.
 *     Poser la clé SUPPRIME de surcroît la détection serveur qui la
 *     justifiait : `PostService.createPost` fait gagner la revendication du
 *     client et n'appelle `detectLanguage(data.content)` que si la clé est
 *     ABSENTE. La règle F7d est donc tenue en n'émettant rien ;
 *  3. **la durée gouverne l'éventail, comme n'importe quel autre média.**
 *     `qualifiesAsReel` (partagé) exige ≥ 3 000 ms pour une piste audio — la
 *     loi 4 appliquée à l'audio veut donc qu'un enregistrement plus court
 *     n'offre pas RÉEL, exactement comme une vidéo de moins de 3 s.
 */
import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync } from 'fs';
import { join } from 'path';
import { MeeshyComposer } from '@/components/composer/MeeshyComposer';
import { AudioCapture } from '@/components/composer/AudioCapture';
import type { ComposerDocumentPayload } from '@/components/composer/ComposerDocumentSurface';
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

let mockUser: { id: string } | null = null;
jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: { authToken: string | null }) => unknown) =>
    selector({ authToken: 'token-123' }),
  useUser: () => mockUser,
}));

let mockPreferredLanguage: string | null = null;
jest.mock('@/utils/user-language-preferences', () => ({
  resolveUserPreferredLanguage: () => mockPreferredLanguage,
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

type MockAttachmentState = {
  selectedFiles: File[];
  uploadedAttachments: UploadedAttachmentResponse[];
  isUploading: boolean;
  uploadProgress: Record<number, number>;
};

let mockAttachmentState: MockAttachmentState;
const mockHandleFilesSelected = jest.fn();
const mockHandleRemoveFile = jest.fn();
const mockClearAttachments = jest.fn();

jest.mock('@/hooks/composer/useAttachmentUpload', () => ({
  useAttachmentUpload: () => ({
    selectedFiles: mockAttachmentState.selectedFiles,
    uploadedAttachments: mockAttachmentState.uploadedAttachments,
    isUploading: mockAttachmentState.isUploading,
    uploadProgress: mockAttachmentState.uploadProgress,
    handleFilesSelected: mockHandleFilesSelected,
    handleRemoveFile: mockHandleRemoveFile,
    clearAttachments: mockClearAttachments,
  }),
}));

global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();

function makeAttachment(overrides: Partial<UploadedAttachmentResponse> = {}): UploadedAttachmentResponse {
  return {
    id: 'att-1',
    messageId: '',
    fileName: 'audio.webm',
    originalName: 'audio.webm',
    mimeType: 'audio/webm',
    fileSize: 1024,
    fileUrl: 'https://cdn.test/audio.webm',
    uploadedBy: 'user-1',
    isAnonymous: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Câblage MediaRecorder / AudioContext / getUserMedia — même gréement que
// `audio-post-composer-audience.test.tsx`, dont `AudioCapture` porte la
// machine à l'identique.
// ─────────────────────────────────────────────────────────────────────────────

const mockGetUserMedia = jest.fn();
Object.defineProperty(navigator, 'mediaDevices', {
  value: { getUserMedia: mockGetUserMedia },
  writable: true,
  configurable: true,
});

type MockRecorder = {
  start: jest.Mock;
  stop: jest.Mock;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  state: string;
};

let mockRecorder: MockRecorder;
let mediaRecorderCtor: jest.Mock;
let isTypeSupportedImpl: (mime: string) => boolean;
let rafCallbacks: FrameRequestCallback[];
let now: number;

type MockRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  onresult: ((e: unknown) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: jest.Mock;
  stop: jest.Mock;
  abort: jest.Mock;
};

let mockRecognition: MockRecognitionInstance | null;
let recognitionCtor: jest.Mock;

function installMediaMocks() {
  const mockStream = { getTracks: () => [{ stop: jest.fn() }] };
  mockGetUserMedia.mockResolvedValue(mockStream);

  isTypeSupportedImpl = () => true;
  mediaRecorderCtor = jest.fn(() => {
    mockRecorder = {
      start: jest.fn(),
      stop: jest.fn(),
      ondataavailable: null,
      onstop: null,
      state: 'recording',
    };
    return mockRecorder;
  });
  (mediaRecorderCtor as unknown as { isTypeSupported: (t: string) => boolean }).isTypeSupported = (t: string) =>
    isTypeSupportedImpl(t);
  (window as unknown as { MediaRecorder: unknown }).MediaRecorder = mediaRecorderCtor;

  const mockAnalyser = {
    fftSize: 256,
    frequencyBinCount: 128,
    getByteTimeDomainData: jest.fn(),
  };
  (window as unknown as { AudioContext: unknown }).AudioContext = jest.fn(() => ({
    createMediaStreamSource: () => ({ connect: jest.fn() }),
    createAnalyser: () => mockAnalyser,
    close: jest.fn(),
    sampleRate: 44100,
  }));

  rafCallbacks = [];
  (window as unknown as { requestAnimationFrame: unknown }).requestAnimationFrame = jest.fn(
    (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    },
  );
  (window as unknown as { cancelAnimationFrame: unknown }).cancelAnimationFrame = jest.fn();

  now = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
}

function installSpeechRecognition() {
  mockRecognition = null;
  recognitionCtor = jest.fn(() => {
    mockRecognition = {
      continuous: false,
      interimResults: false,
      maxAlternatives: 1,
      lang: '',
      onresult: null,
      onerror: null,
      onend: null,
      start: jest.fn(),
      stop: jest.fn(),
      abort: jest.fn(),
    };
    return mockRecognition;
  });
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = recognitionCtor;
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
}

function uninstallSpeechRecognition() {
  mockRecognition = null;
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
}

function fireFinalTranscript(text: string) {
  const alt = { transcript: text, confidence: 0.9 };
  const result = Object.assign([alt], { isFinal: true });
  mockRecognition?.onresult?.({ resultIndex: 0, results: [result] });
}

/** Fait avancer la seule frame de forme d'onde en cours, de `ms`. */
function advanceWaveform(ms: number) {
  now += ms;
  const cb = rafCallbacks[rafCallbacks.length - 1];
  act(() => {
    cb?.(now);
  });
}

async function clickStart() {
  await act(async () => {
    fireEvent.click(screen.getByTestId('audio-capture-start'));
  });
}

function clickStop() {
  act(() => {
    fireEvent.click(screen.getByTestId('audio-capture-stop'));
    mockRecorder.onstop?.();
  });
}

function clickConfirm() {
  fireEvent.click(screen.getByTestId('audio-capture-confirm'));
}

function openPanel() {
  fireEvent.click(screen.getByTestId('audio-capture-toggle'));
}

/** Enregistre `durationMs`, sans jamais faire parler le reconnaisseur. */
async function recordSilently(durationMs: number) {
  openPanel();
  await clickStart();
  advanceWaveform(durationMs);
  clickStop();
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockUser = null;
  mockPreferredLanguage = null;
  installMediaMocks();
  uninstallSpeechRecognition();
});

// ─────────────────────────────────────────────────────────────────────────────
// AudioCapture — la machine à quatre phases, standalone.
// ─────────────────────────────────────────────────────────────────────────────
describe('W4 point 1 — AudioCapture porte la machine de capture telle quelle', () => {
  it('se monte fermé, et ouvre le panneau EN PHASE IDLE au clic', () => {
    render(<AudioCapture onCaptured={jest.fn()} />);
    expect(screen.queryByTestId('audio-capture-panel')).not.toBeInTheDocument();

    openPanel();

    expect(screen.getByTestId('audio-capture-panel')).toBeInTheDocument();
    expect(screen.getByTestId('audio-capture-start')).toBeInTheDocument();
  });

  it('demande le flux stéréo 44,1 kHz — mêmes contraintes que le composer hérité', async () => {
    render(<AudioCapture onCaptured={jest.fn()} />);
    openPanel();
    await clickStart();

    expect(mockGetUserMedia).toHaveBeenCalledWith({
      audio: expect.objectContaining({
        channelCount: 2,
        sampleRate: 44100,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }),
    });
  });

  /**
   * Reformulation W9 Step 3 — `audio-post-composer.test.tsx` (« shows error
   * when microphone access denied ») n'est PAS dans l'inventaire du plan
   * (il ne teste ni l'audience, ni le tri-état, ni un plafond — les sept
   * gardes nommées) et sa suite entière est retirée avec `AudioPostComposer`
   * (redondante partout ailleurs : montage, contraintes stéréo, phases). Ce
   * SEUL cas ne l'était pas : `AudioCapture.tsx` porte le MÊME `catch` (une
   * capacité du point 1, « la machine de capture telle quelle »), mais rien
   * dans cette suite ne l'atteignait avant ce test.
   */
  it('un refus de micro affiche une erreur — sans jamais atteindre la phase RECORDING', async () => {
    mockGetUserMedia.mockRejectedValueOnce(new Error('Permission denied'));
    render(<AudioCapture onCaptured={jest.fn()} />);
    openPanel();
    await clickStart();

    expect(screen.getByTestId('audio-capture-error')).toBeInTheDocument();
    expect(screen.getByTestId('audio-capture-start')).toBeInTheDocument();
  });

  it('négocie le mimeType dans le MÊME ordre de candidats que le composer hérité — saute webm si non supporté, retombe sur mp4', async () => {
    isTypeSupportedImpl = (mime: string) => mime === 'audio/mp4';
    render(<AudioCapture onCaptured={jest.fn()} />);
    openPanel();
    await clickStart();

    expect(mediaRecorderCtor).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mimeType: 'audio/mp4' }),
    );
  });

  it('passe en phase RECORDING et peint une forme d’onde', async () => {
    render(<AudioCapture onCaptured={jest.fn()} />);
    openPanel();
    await clickStart();

    expect(screen.getByTestId('audio-capture-waveform')).toBeInTheDocument();
    expect(screen.queryByTestId('audio-capture-start')).not.toBeInTheDocument();
    expect(screen.getByTestId('audio-capture-stop')).toBeInTheDocument();
  });

  it('l’arrêt bascule en phase PREVIEW avec la lecture et les actions Retry/Confirm', async () => {
    render(<AudioCapture onCaptured={jest.fn()} />);
    openPanel();
    await clickStart();
    clickStop();

    expect(screen.queryByTestId('audio-capture-stop')).not.toBeInTheDocument();
    expect(screen.getByTestId('audio-capture-retry')).toBeInTheDocument();
    expect(screen.getByTestId('audio-capture-confirm')).toBeInTheDocument();
  });

  it('Retry efface le brouillon et revient en IDLE, sans jamais appeler `onCaptured`', async () => {
    const onCaptured = jest.fn();
    render(<AudioCapture onCaptured={onCaptured} />);
    openPanel();
    await clickStart();
    clickStop();

    fireEvent.click(screen.getByTestId('audio-capture-retry'));

    expect(screen.getByTestId('audio-capture-start')).toBeInTheDocument();
    expect(onCaptured).not.toHaveBeenCalled();
  });

  it('les QUATRE locales de reconnaissance sont inchangées — espagnol résout `es-ES`', async () => {
    installSpeechRecognition();
    mockUser = { id: 'u1' };
    mockPreferredLanguage = 'es';
    render(<AudioCapture onCaptured={jest.fn()} />);
    openPanel();
    await clickStart();

    expect(mockRecognition?.lang).toBe('es-ES');
  });

  it.each([
    ['fr', 'fr-FR'],
    ['en', 'en-US'],
    ['es', 'es-ES'],
    ['pt', 'pt-BR'],
  ])('mappe %s vers %s', async (preferred, expected) => {
    installSpeechRecognition();
    mockUser = { id: 'u1' };
    mockPreferredLanguage = preferred;
    render(<AudioCapture onCaptured={jest.fn()} />);
    openPanel();
    await clickStart();

    expect(mockRecognition?.lang).toBe(expected);
  });

  it('retombe sur `navigator.language` sans utilisateur connu', async () => {
    installSpeechRecognition();
    mockPreferredLanguage = null;
    const originalLanguage = Object.getOwnPropertyDescriptor(window.navigator, 'language');
    Object.defineProperty(window.navigator, 'language', { value: 'de-DE', configurable: true });

    render(<AudioCapture onCaptured={jest.fn()} />);
    openPanel();
    await clickStart();

    expect(mockRecognition?.lang).toBe('de-DE');
    if (originalLanguage) Object.defineProperty(window.navigator, 'language', originalLanguage);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AudioCapture — l'outil rend un FICHIER et un TEXTE, jamais une langue.
//
// `recognition.lang` est réglé depuis `resolveUserPreferredLanguage(user)` :
// c'est l'hypothèse SERVIE au reconnaisseur, pas une mesure de ce qui a été
// dit. La rendre ferait d'une préférence de lecture une déclaration d'origine.
// ─────────────────────────────────────────────────────────────────────────────
describe("W4 point 3 — le micro ne rend AUCUNE langue, même quand il a transcrit", () => {
  it("un mot transcrit ne fait pas naître une langue : la clé est absente du résultat", async () => {
    installSpeechRecognition();
    mockUser = { id: 'u1' };
    mockPreferredLanguage = 'es';
    const onCaptured = jest.fn();
    render(<AudioCapture onCaptured={onCaptured} />);
    openPanel();
    await clickStart();
    fireFinalTranscript('hola');
    clickStop();
    clickConfirm();

    const result = onCaptured.mock.calls[0]?.[0];
    expect(result).not.toHaveProperty('language');
    expect(result.transcriptText).toBe('hola');
  });

  it("rien de transcrit non plus — et JAMAIS un repli 'fr'", async () => {
    installSpeechRecognition();
    mockPreferredLanguage = null; // navigator.language sert de langue au reconnaisseur, mais personne ne parle
    const onCaptured = jest.fn();
    render(<AudioCapture onCaptured={onCaptured} />);
    openPanel();
    await clickStart();
    clickStop();
    clickConfirm();

    expect(onCaptured.mock.calls[0]?.[0]).not.toHaveProperty('language');
  });

  it("l'API de reconnaissance absente du navigateur ne change rien au contrat", async () => {
    // uninstallSpeechRecognition() est déjà l'état de beforeEach — l'API n'existe pas.
    const onCaptured = jest.fn();
    render(<AudioCapture onCaptured={onCaptured} />);
    openPanel();
    await clickStart();
    clickStop();
    clickConfirm();

    expect(onCaptured.mock.calls[0]?.[0]).not.toHaveProperty('language');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Intégration — le meuble : une seule stratégie de téléversement, et la
// durée qui gouverne l'éventail (loi 4 appliquée à l'audio).
// ─────────────────────────────────────────────────────────────────────────────
function renderComposer() {
  const onPublish = jest.fn();
  render(<MeeshyComposer door={{ kind: 'feedComposer' }} onPublish={onPublish} />);
  return {
    onPublish,
    published: () => onPublish.mock.calls[0]?.[0] as ComposerDocumentPayload | undefined,
  };
}

function expand(): void {
  fireEvent.focus(screen.getByLabelText('postComposer.contentLabel'));
}

beforeEach(() => {
  mockValidation = { valid: true, errors: [] };
  mockAttachmentState = {
    selectedFiles: [],
    uploadedAttachments: [],
    isUploading: false,
    uploadProgress: {},
  };
  mockHandleFilesSelected.mockClear();
  mockHandleRemoveFile.mockClear();
  mockClearAttachments.mockClear();
});

describe("W4 point 2 — une seule stratégie de téléversement", () => {
  it('la surface monte l’outil micro dans sa rangée d’outils, à côté de photo/vidéo', () => {
    renderComposer();
    expand();

    expect(screen.getByTestId('audio-capture-toggle')).toBeInTheDocument();
  });

  it('confirmer un enregistrement l’envoie au MÊME pool que photo/vidéo, `useAttachmentUpload` — jamais un second appel', async () => {
    renderComposer();
    expand();
    await recordSilently(2000);
    clickConfirm();

    expect(mockHandleFilesSelected).toHaveBeenCalledTimes(1);
    const [files, metadata] = mockHandleFilesSelected.mock.calls[0];
    expect(files).toHaveLength(1);
    expect(files[0]).toBeInstanceOf(File);
    expect(metadata?.[0]?.duration).toBe(2000);
  });

  it('désactive l’outil micro au plafond du pool — même garde que photo/vidéo', () => {
    mockAttachmentState.selectedFiles = Array.from(
      { length: 10 },
      (_, i) => new File(['x'], `p${i}.png`, { type: 'image/png' }),
    );
    renderComposer();
    expand();

    expect(screen.getByTestId('audio-capture-toggle')).toBeDisabled();
  });

  it("ni `ComposerDocumentSurface.tsx` ni `AudioCapture.tsx` ne construisent `TusUploadService` — lu en SOURCE, pas déduit d'un comportement", () => {
    const surfaceSource = readFileSync(
      join(__dirname, '../../../components/composer/ComposerDocumentSurface.tsx'),
      'utf-8',
    );
    const captureSource = readFileSync(
      join(__dirname, '../../../components/composer/AudioCapture.tsx'),
      'utf-8',
    );

    expect(surfaceSource).not.toContain('TusUploadService');
    expect(captureSource).not.toContain('TusUploadService');
  });
});

/**
 * Reformulation W9 Step 3 de `audio-post-composer-audience.test.tsx` (Task 3
 * point 4 : `handleAudioPublish` figeait `visibility: 'PUBLIC'` en dur).
 *
 * Le composer hérité gérait sa PROPRE audience (son propre sélecteur, son
 * propre PUBLIC par défaut) parce qu'il était un chemin de publication
 * SÉPARÉ. Depuis W4, un enregistrement rejoint le MÊME pool que
 * photo/vidéo (`useAttachmentUpload`) et publie par le MÊME
 * `ComposerDocumentSurface.handlePublish` — déjà couvert, pour TOUT post,
 * par « W3 point 6 — une audience nommée ne part jamais vide »
 * (`meeshy-composer-post.test.tsx`), qui ne branche sur aucun type de média.
 * Ce test est le SEUL qui ferme la boucle bout en bout sur le geste
 * spécifique qui a régressé historiquement : enregistrer, PUIS choisir une
 * audience, PUIS publier.
 */
describe("W4 — l'audience d'un post enregistré au micro suit le mécanisme générique, jamais un défaut PUBLIC figé", () => {
  it('publie avec l’audience choisie APRÈS l’enregistrement — plus de chemin séparé qui la figerait à PUBLIC', async () => {
    const { published } = renderComposer();
    expand();
    await recordSilently(2000);
    clickConfirm();
    // `useAttachmentUpload` est intégralement mocké dans cette suite (comme
    // dans « W4 point 2 ») : confirmer l'enregistrement APPELLE
    // `handleFilesSelected`, mais rien ne réinjecte automatiquement le
    // fichier dans `uploadedAttachments` — c'est déjà couvert par ce point 2.
    // Une légende porte donc le brouillon jusqu'à un état publiable, pour
    // isoler la seule chose que CE test vérifie : l'audience.
    fireEvent.change(screen.getByLabelText('postComposer.contentLabel'), { target: { value: 'Bonjour' } });

    fireEvent.click(screen.getByLabelText('postComposer.changeVisibility'));
    fireEvent.click(
      within(screen.getByTestId('composer-visibility-options')).getByText('publicationVisibility.friends'),
    );
    fireEvent.click(screen.getByText('publish'));

    expect(published()?.visibility).toBe('FRIENDS');
  });
});

describe('W4 point 4 — loi 4 appliquée à l’audio : la durée gouverne l’éventail', () => {
  it("un enregistrement de moins de 3 s n'offre PAS RÉEL une fois dans le pool", () => {
    mockAttachmentState.uploadedAttachments = [
      makeAttachment({ id: 'aud-1', mimeType: 'audio/webm', duration: 2900 }),
    ];
    renderComposer();
    expand();

    expect(screen.queryByTestId('composer-format-reel')).not.toBeInTheDocument();
  });

  it('un enregistrement de 3 s ou plus OFFRE RÉEL, exactement comme une vidéo qui qualifie', () => {
    mockAttachmentState.uploadedAttachments = [
      makeAttachment({ id: 'aud-1', mimeType: 'audio/webm', duration: 3000 }),
    ];
    renderComposer();
    expand();

    expect(screen.getByTestId('composer-format-reel')).toBeInTheDocument();
  });

  it('l’enregistrement RÉEL confirmé transporte sa VRAIE durée jusqu’au pool, pas une valeur arbitraire', async () => {
    renderComposer();
    expand();
    await recordSilently(3500);
    clickConfirm();

    const [, metadata] = mockHandleFilesSelected.mock.calls[0];
    expect(metadata?.[0]?.duration).toBe(3500);
  });
});

describe("W4 point 3 (intégration) — aucune charge publiée ne porte `originalLanguage`", () => {
  it("la légende part SANS langue d'origine, même quand la transcription a livré un mot", async () => {
    installSpeechRecognition();
    mockUser = { id: 'u1' };
    mockPreferredLanguage = 'pt';
    const { published } = renderComposer();
    expand();
    openPanel();
    await clickStart();
    fireFinalTranscript('olá');
    clickStop();
    clickConfirm();

    fireEvent.change(screen.getByLabelText('postComposer.contentLabel'), { target: { value: 'legenda' } });
    fireEvent.click(screen.getByText('publish'));

    expect(published()).not.toHaveProperty('originalLanguage');
  });

  it("une légende écrite dans une AUTRE langue que la préférence du reconnaisseur n'est pas étiquetée par elle", async () => {
    installSpeechRecognition();
    mockUser = { id: 'u1' };
    mockPreferredLanguage = 'fr';
    const { published } = renderComposer();
    expand();
    openPanel();
    await clickStart();
    fireFinalTranscript('bonjour');
    clickStop();
    clickConfirm();

    fireEvent.change(screen.getByLabelText('postComposer.contentLabel'), { target: { value: 'Check this out' } });
    fireEvent.click(screen.getByText('publish'));

    expect(published()).not.toHaveProperty('originalLanguage');
  });

  it("rien de transcrit non plus — jamais 'fr' par défaut", async () => {
    const { published } = renderComposer();
    expand();
    await recordSilently(2000);
    clickConfirm();

    fireEvent.change(screen.getByLabelText('postComposer.contentLabel'), { target: { value: 'legenda' } });
    fireEvent.click(screen.getByText('publish'));

    expect(published()).not.toHaveProperty('originalLanguage');
  });

  it("retirer la piste enregistrée ne laisse rien derrière elle non plus", async () => {
    installSpeechRecognition();
    mockUser = { id: 'u1' };
    mockPreferredLanguage = 'es';
    const { published } = renderComposer();
    expand();
    openPanel();
    await clickStart();
    fireFinalTranscript('hola');
    clickStop();
    // Simule ce que `useAttachmentUpload` ferait réellement du fichier rendu
    // par `AudioCapture` — le mock ne l'ajoute pas lui-même au pool. La frappe
    // qui suit est ce qui fait relire ce pool par la surface (le mock est un
    // objet mutable, pas une source réactive).
    mockAttachmentState.selectedFiles = [new File(['x'], 'voice.webm', { type: 'audio/webm' })];
    clickConfirm();
    fireEvent.change(screen.getByLabelText('postComposer.contentLabel'), { target: { value: 'texte seul' } });

    fireEvent.click(screen.getByLabelText('delete'));
    fireEvent.click(screen.getByText('publish'));

    expect(published()).not.toHaveProperty('originalLanguage');
  });
});
