/**
 * Task W7 — « Les portes de CRÉATION basculent ».
 *
 * Ce lot est un lot de BRANCHEMENT, pas de construction : `MeeshyComposer`
 * (W1-W6) est vert et injoignable en production ; ce fichier prouve le
 * geste qui le rend joignable — `PostsFeedScreen.tsx` monte désormais
 * `MeeshyComposer` sur trois portes (`feedComposer` inline, son outil micro,
 * `moodChip`) et ne relaie plus les charges à travers les trois composers
 * hérités qu'il démonte (`PostComposer`, `AudioPostComposer`,
 * `StatusComposer` — voir la garde NÉGATIVE et ÉNUMÉRÉE dans
 * `composer-legacy-mounts-guard.test.ts`, dont c'est l'unique objet).
 *
 * `MeeshyComposer` est ici un ESPION, pas le vrai composant : le contrat que
 * chaque FORMAT tient (parité de capacités, tri-états, éventail) est déjà
 * prouvé par `meeshy-composer-post.test.tsx` / `-status.test.tsx` /
 * `-audio.test.tsx` — le réimporter ici retesterait la même chose deux fois.
 * Ce que CE fichier seul peut prouver, c'est le CÂBLAGE de l'hôte : quelle
 * PORTE chaque geste ouvre, quelle PROP il transporte, et où atterrit la
 * charge qu'un `onPublish`/`onPublishStatus` capté renvoie.
 *
 * Le mécanisme d'armement du micro (jeton → expansion → panneau) est, lui,
 * prouvé RÉEL — sans mock de `MeeshyComposer` — par
 * `composer-document-arm-capture.test.tsx`. Ici on ne prouve que la MOITIÉ
 * hôte de ce mécanisme : le bouton rond du fil incrémente bien le jeton que
 * `MeeshyComposer` reçoit.
 */
import { act, render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
      typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
  }),
}));

type CapturedProps = {
  door: { kind: string; [key: string]: unknown };
  currentUser?: { username: string; avatar?: string | null } | null;
  onPublish: (payload: Record<string, unknown>) => void;
  onPublishStatus?: (payload: Record<string, unknown>) => void;
  onPublishStory?: (payload: Record<string, unknown>) => void;
  storyDefaultVisibility?: string;
  armCaptureToken?: number;
  onCaptureArmed?: () => void;
  disabled?: boolean;
};

let capturedCalls: CapturedProps[] = [];

jest.mock('@/components/composer/MeeshyComposer', () => ({
  MeeshyComposer: (props: CapturedProps) => {
    capturedCalls.push(props);
    return <div data-testid={`meeshy-composer-${props.door.kind}`} />;
  },
}));

function latestFor(kind: string): CapturedProps | undefined {
  const matches = capturedCalls.filter((c) => c.door.kind === kind);
  return matches[matches.length - 1];
}

jest.mock('@/components/v2', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  useToast: () => ({ addToast: jest.fn() }),
  PostCard: () => <div data-testid="post-card" />,
  StoryTray: () => <div data-testid="story-tray" />,
  StatusBar: ({ onAddStatus }: { onAddStatus?: () => void }) => (
    <button data-testid="status-bar-add-status" onClick={onAddStatus}>
      add status
    </button>
  ),
  StoryViewer: () => null,
  StoryComposer: () => null,
}));

jest.mock('@/components/v2/Skeleton', () => ({ Skeleton: () => null }));

const mockCreateStoryMutate = jest.fn();
jest.mock('@/hooks/social/use-stories', () => ({
  useStoriesFeedQuery: () => ({ data: [], isLoading: false }),
  useCreateStoryMutation: () => ({ mutate: mockCreateStoryMutate }),
  useDeleteStoryMutation: () => ({ mutate: jest.fn() }),
  useRecordStoryViewMutation: () => ({ recordView: jest.fn() }),
}));
jest.mock('@/hooks/social/use-stories-realtime', () => ({ useStoriesRealtime: () => undefined }));
jest.mock('@/lib/story-transforms', () => ({
  postToStoryData: jest.fn(),
  groupStoriesByAuthor: () => new Map(),
  groupToStoryItem: jest.fn(),
}));
// `FRIENDS`, et non `PUBLIC` : `DEFAULT_PUBLICATION_VISIBILITY` VAUT `PUBLIC`
// (`packages/shared/types/post.ts`). Un témoin sur la valeur par défaut du
// contrat ne peut pas distinguer « la préférence est passée » de « rien n'est
// passé » — c'est la forme de la leçon 261 : un témoin de rang s'écrit sur un
// rang AUTRE que celui où la règle juste et son absence rendent le même verdict.
jest.mock('@/stores/user-preferences-store', () => ({
  useStoryPreferences: () => ({ preferences: { defaultVisibility: 'FRIENDS' } }),
}));

const mockCreateStatusMutate = jest.fn();
jest.mock('@/hooks/social/use-statuses', () => ({
  useStatusesFeedQuery: () => ({ isLoading: false }),
  useStatusesList: () => [],
  useCreateStatusMutation: () => ({ mutate: mockCreateStatusMutate }),
}));
jest.mock('@/lib/status-transforms', () => ({ postToStatusItem: jest.fn() }));

jest.mock('@/hooks/queries/use-feed-query', () => ({
  useFeedQuery: () => ({
    data: undefined,
    dataUpdatedAt: 0,
    isLoading: false,
    isSuccess: true,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
  }),
  useFeedPosts: () => [],
  usePrefetchPost: () => jest.fn(),
}));

const mockCreatePostMutate = jest.fn();
let mockCreatePostPending = false;
jest.mock('@/hooks/queries/use-post-mutations', () => ({
  useCreatePostMutation: () => ({ mutate: mockCreatePostMutate, isPending: mockCreatePostPending }),
  useLikePostMutation: () => ({ mutate: jest.fn() }),
  useUnlikePostMutation: () => ({ mutate: jest.fn() }),
  useSharePostMutation: () => ({ mutate: jest.fn() }),
  useBookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useUnbookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useTranslatePostMutation: () => ({ mutate: jest.fn() }),
  useDeletePostMutation: () => ({ mutate: jest.fn() }),
  usePinPostMutation: () => ({ mutate: jest.fn() }),
  useRepostMutation: () => ({ mutate: jest.fn() }),
  useUpdatePostMutation: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/hooks/queries/use-comment-mutations', () => ({
  useCreateCommentMutation: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/hooks/queries/use-post-socket-cache-sync', () => ({
  usePostSocketCacheSync: () => undefined,
}));
jest.mock('@/hooks/use-post-translation', () => ({
  usePreferredLanguage: () => 'en',
  usePreferredLanguages: () => ['en'],
}));
jest.mock('@/hooks/use-impression-tracking', () => ({
  useImpressionTracking: () => ({ observe: jest.fn() }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: { user: { id: string; username: string; avatar: string | null } | null }) => unknown) =>
    selector({ user: { id: 'user-1', username: 'alice', avatar: null } }),
}));

jest.mock('@/lib/clipboard', () => ({ copyToClipboard: jest.fn() }));

import { PostsFeedScreen } from '@/components/feed/PostsFeedScreen';

function openMoodDialog(): void {
  fireEvent.click(screen.getByTestId('status-bar-add-status'));
}

beforeEach(() => {
  jest.clearAllMocks();
  capturedCalls = [];
  mockCreatePostPending = false;
});

// ─────────────────────────────────────────────────────────────────────────
// G2 (positive, par geste) — le composer inline du fil ouvre la porte
// `feedComposer`.
// ─────────────────────────────────────────────────────────────────────────
describe('W7 — le composer inline du fil monte MeeshyComposer sur la porte feedComposer', () => {
  it('rend exactement UN MeeshyComposer portant `{ kind: "feedComposer" }`', () => {
    render(<PostsFeedScreen />);
    expect(screen.getAllByTestId('meeshy-composer-feedComposer')).toHaveLength(1);
  });

  it('reflète `createPostMutation.isPending` dans `disabled`', () => {
    mockCreatePostPending = true;
    render(<PostsFeedScreen />);
    expect(latestFor('feedComposer')?.disabled).toBe(true);
  });

  it("passe l'utilisateur courant du store d'auth", () => {
    render(<PostsFeedScreen />);
    expect(latestFor('feedComposer')?.currentUser).toEqual({ username: 'alice', avatar: null });
  });

  it('relaie un `onPublish` capté vers `createPostMutation` — même charge, même appelant que le composer hérité', () => {
    render(<PostsFeedScreen />);
    latestFor('feedComposer')!.onPublish({ content: 'Hello world', type: 'POST', visibility: 'PUBLIC' });

    expect(mockCreatePostMutate).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Hello world', type: 'POST', visibility: 'PUBLIC' }),
      expect.anything(),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// R1 — un témoin par CANAL, pas seulement par PORTE.
//
// La porte `feedComposer` OFFRE `story` (`composer-contract.ts`,
// `case 'feedComposer'`) et le meuble sait la peindre (`ROUTABLE_FORMATS`) :
// l'éventail rend donc une pastille story, et la choisir monte
// `StoryComposerSurface`. Son bouton Publier ne retombe QUE sur
// `onPublishStory` — non fourni, il devient le no-op silencieux que
// `MeeshyComposer.tsx` nomme mot pour mot dans sa doc de prop, et le brouillon
// de l'auteur part avec la surface démontée.
//
// Une garde qui n'interroge que `door` ne peut PAS voir ce défaut : un espion
// ne révèle jamais un canal ABSENT, seulement ceux qu'on pense à lire. D'où
// des témoins nommés sur CE que la porte fait sortir.
// ─────────────────────────────────────────────────────────────────────────
describe('W7 — la porte feedComposer OFFRE story : elle doit donc BRANCHER le canal story', () => {
  it('fournit `onPublishStory` — sans lui le bouton Publier de la surface story est un no-op silencieux', () => {
    render(<PostsFeedScreen />);
    expect(latestFor('feedComposer')?.onPublishStory).toEqual(expect.any(Function));
  });

  it('relaie un `onPublishStory` capté vers `createStoryMutation` — la MÊME file que le dialogue hérité', () => {
    render(<PostsFeedScreen />);
    latestFor('feedComposer')!.onPublishStory!({
      content: 'Bonjour',
      storyEffects: { v: 3 },
      visibility: 'PUBLIC',
    });

    expect(mockCreateStoryMutate).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Bonjour', visibility: 'PUBLIC' }),
      expect.anything(),
    );
  });

  it("passe `storyDefaultVisibility` — la préférence de l'auteur, jamais le PUBLIC par défaut du contrat", () => {
    render(<PostsFeedScreen />);
    expect(latestFor('feedComposer')?.storyDefaultVisibility).toBe('FRIENDS');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// G2 (positive, par geste) — `onAddStatus` ouvre la porte `moodChip`.
// ─────────────────────────────────────────────────────────────────────────
describe('W7 — le geste « ajouter un statut » monte MeeshyComposer sur la porte moodChip', () => {
  it("n'existe pas avant le geste, existe (une fois) après", () => {
    render(<PostsFeedScreen />);
    expect(screen.queryByTestId('meeshy-composer-moodChip')).not.toBeInTheDocument();

    openMoodDialog();

    expect(screen.getAllByTestId('meeshy-composer-moodChip')).toHaveLength(1);
  });

  // La coquille du dialogue appartient à l'HÔTE, pas à la surface : basculer
  // `StatusComposer` (qui peignait son propre `DialogHeader`) vers
  // `ComposerMoodSurface` (qui n'en peint aucun) a donc laissé un
  // `role="dialog"` SANS NOM ACCESSIBLE, et la clé `statusComposer.title` —
  // traduite dans les quatre catalogues — sans le moindre site de rendu.
  it("porte un nom accessible — un `role=dialog` anonyme n'est annoncé par rien", () => {
    render(<PostsFeedScreen />);
    openMoodDialog();

    expect(screen.getByRole('dialog')).toHaveAccessibleName('statusComposer.title');
  });

  it('rend le titre du composer de mood, la clé qui restait sans site après la bascule', () => {
    render(<PostsFeedScreen />);
    openMoodDialog();

    expect(screen.getByRole('heading', { name: 'statusComposer.title' })).toBeInTheDocument();
  });

  // Témoin de CLASSE, faute de mieux : jsdom ne mesure aucune hauteur. La
  // surface mood a grandi (six puces d'audience, plus un sélecteur de
  // personnes sous EXCEPT/ONLY) et son bouton Publier est en bas — dans une
  // coquille qui ne défile pas, il sort de l'écran. `StoryComposer` documente
  // exactement cette contrainte sur le dialogue voisin.
  it('défile — la surface mood dépasse la hauteur de la coquille', () => {
    render(<PostsFeedScreen />);
    openMoodDialog();

    const content = screen.getByRole('dialog').firstElementChild as HTMLElement;
    expect(content.className).toContain('overflow-y-auto');
    expect(content.className).toMatch(/max-h-/);
  });

  it('fournit toujours `onPublish` (requis par le contrat) même si la porte ne le sert jamais', () => {
    render(<PostsFeedScreen />);
    openMoodDialog();
    expect(latestFor('moodChip')?.onPublish).toEqual(expect.any(Function));
  });
});

// ─────────────────────────────────────────────────────────────────────────
// R3b/R3c — le relais `handleStatusPublish` : visibilité, audience nommée,
// références, en tri-état — le défaut mesuré que W6 corrige, atteignable
// pour la première fois par CE lot.
// ─────────────────────────────────────────────────────────────────────────
describe('W7 — handleStatusPublish relaie visibility/visibilityUserIds/mentions (tri-état)', () => {
  function renderAndOpen() {
    render(<PostsFeedScreen />);
    openMoodDialog();
    return latestFor('moodChip')!.onPublishStatus!;
  }

  it('relaie `visibility` (ex. FRIENDS) au lieu du PUBLIC en dur du composer hérité', () => {
    const publish = renderAndOpen();
    publish({ moodEmoji: '🔥', content: 'ça va', visibility: 'FRIENDS' });

    expect(mockCreateStatusMutate).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'FRIENDS' }),
      expect.anything(),
    );
  });

  it('sous ONLY, relaie aussi `visibilityUserIds`', () => {
    const publish = renderAndOpen();
    publish({ moodEmoji: '🔥', visibility: 'ONLY', visibilityUserIds: ['friend-1'] });

    expect(mockCreateStatusMutate).toHaveBeenCalledWith(
      expect.objectContaining({ visibilityUserIds: ['friend-1'] }),
      expect.anything(),
    );
  });

  it('sans `visibilityUserIds` dans la charge (ex. PUBLIC), ne le fabrique jamais — ni `undefined` explicite ni `[]`', () => {
    const publish = renderAndOpen();
    publish({ moodEmoji: '😴' });

    expect(mockCreateStatusMutate.mock.calls[0][0]).not.toHaveProperty('visibilityUserIds');
  });

  it('relaie `mentions` quand la surface en déclare', () => {
    const publish = renderAndOpen();
    publish({ moodEmoji: '💭', mentions: [{ userId: 'u-a', display: 'SILENT' }] });

    expect(mockCreateStatusMutate).toHaveBeenCalledWith(
      expect.objectContaining({ mentions: [{ userId: 'u-a', display: 'SILENT' }] }),
      expect.anything(),
    );
  });

  it('omet `mentions` quand la surface ne le déclare pas — jamais `[]`', () => {
    const publish = renderAndOpen();
    publish({ moodEmoji: '🎵' });

    expect(mockCreateStatusMutate.mock.calls[0][0]).not.toHaveProperty('mentions');
  });

  it("pose `originalLanguage: userLanguage` — défaut antérieur de concept CONSERVÉ tel quel (dette nommée, pas une régression de ce lot)", () => {
    const publish = renderAndOpen();
    publish({ moodEmoji: '😴' });

    expect(mockCreateStatusMutate).toHaveBeenCalledWith(
      expect.objectContaining({ originalLanguage: 'en' }),
      expect.anything(),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// R2a/R2 (moitié hôte) — le bouton rond ARME le micro au lieu d'ouvrir un
// dialogue audio séparé. La moitié « ça ouvre vraiment le panneau » est
// prouvée par `composer-document-arm-capture.test.tsx`.
// ─────────────────────────────────────────────────────────────────────────
describe("W7 — le bouton rond arme l'outil micro (jeton, pas un booléen)", () => {
  it('sans avoir été tapé, `armCaptureToken` est absent', () => {
    render(<PostsFeedScreen />);
    expect(latestFor('feedComposer')?.armCaptureToken).toBeUndefined();
  });

  it('un premier tap pose un jeton défini', () => {
    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByLabelText('Record an audio post'));

    expect(latestFor('feedComposer')?.armCaptureToken).not.toBeUndefined();
  });

  it("fournit `onCaptureArmed` — le canal par lequel le jeton se CONSOMME", () => {
    render(<PostsFeedScreen />);
    expect(latestFor('feedComposer')?.onCaptureArmed).toEqual(expect.any(Function));
  });

  it("recevoir `onCaptureArmed` EFFACE le jeton — sans quoi tout remontage de l'outil rouvrirait le panneau", () => {
    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByLabelText('Record an audio post'));
    expect(latestFor('feedComposer')?.armCaptureToken).not.toBeUndefined();

    act(() => {
      latestFor('feedComposer')!.onCaptureArmed!();
    });

    expect(latestFor('feedComposer')?.armCaptureToken).toBeUndefined();
  });

  it('un tap APRÈS consommation ré-arme — un jeton consommé n’est pas un jeton mort', () => {
    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByLabelText('Record an audio post'));
    act(() => {
      latestFor('feedComposer')!.onCaptureArmed!();
    });

    fireEvent.click(screen.getByLabelText('Record an audio post'));

    expect(latestFor('feedComposer')?.armCaptureToken).not.toBeUndefined();
  });

  it('un second tap change la VALEUR du jeton — sans quoi refermer puis re-taper ne ré-armerait rien', () => {
    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByLabelText('Record an audio post'));
    const first = latestFor('feedComposer')?.armCaptureToken;

    fireEvent.click(screen.getByLabelText('Record an audio post'));
    const second = latestFor('feedComposer')?.armCaptureToken;

    expect(second).not.toBe(first);
    expect(second).not.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// R2c — garde négative : le chemin audio ne pose plus `mobileTranscription`
// ni `originalLanguage`, et l'hôte n'a plus besoin de son propre service
// d'upload — Whisper produit la transcription côté serveur (§2 du plan).
// ─────────────────────────────────────────────────────────────────────────
describe("W7 — garde négative : le micro ne pose plus mobileTranscription/originalLanguage", () => {
  it('`PostsFeedScreen.tsx` ne référence plus `TusUploadService` ni `MobileTranscription`', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../../components/feed/PostsFeedScreen.tsx'),
      'utf8',
    );
    expect(source).not.toContain('TusUploadService');
    expect(source).not.toContain('MobileTranscription');
  });

  it('la charge relayée à `createPostMutation` ne porte jamais `mobileTranscription` ni `originalLanguage`', () => {
    render(<PostsFeedScreen />);
    latestFor('feedComposer')!.onPublish({
      content: '',
      type: 'POST',
      visibility: 'PUBLIC',
      mediaIds: ['media-1'],
      optimisticMedia: [{ id: 'media-1', mimeType: 'audio/webm', fileUrl: 'https://cdn.test/media-1.webm', order: 0 }],
    });

    const call = mockCreatePostMutate.mock.calls[0][0];
    expect(call).not.toHaveProperty('mobileTranscription');
    expect(call).not.toHaveProperty('originalLanguage');
  });
});
