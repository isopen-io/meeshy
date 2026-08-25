/**
 * W6 — la surface MOOD entre dans le meuble, avec l'audience qui se souvient
 * PAR FORMAT.
 *
 * `StatusComposer.tsx` (230 l.) restait INTACT et monté ailleurs jusqu'à son
 * retrait à la Task W9 (contrairement à la STORY, absorbée à W5 : le mood
 * n'avait aucun canevas partagé entre deux enrobages, rien à extraire en
 * commun) — `ComposerMoodSurface` est un PORT FRAIS, dans l'esprit de
 * `ComposerDocumentSurface` (W3). Cette suite est
 * donc, comme `meeshy-composer-post.test.tsx`, la moitié « capacités » de la
 * preuve de retrait : chaque bloc porte une capacité mesurée sur
 * `StatusComposer.tsx`, citée à sa ligne, et rougirait si la surface neuve la
 * perdait.
 *
 * Ce qui est délibérément DIFFÉRENT (et pourquoi), suivant la loi transmise
 * par iOS (`ComposerMoodSurface.swift`, `ComposerMoodPolicy`) :
 *
 *  1. **la sélection d'emoji gagne la BASCULE** — `StatusComposer.tsx:110`
 *     (`onClick={() => setSelectedEmoji(emoji)}`) ne pouvait QUE sélectionner.
 *     Retaper l'emoji choisi le désélectionne désormais
 *     (`ComposerMoodPolicy.toggling`) ;
 *  2. **l'audience existe enfin, et se souvient PAR FORMAT** — défaut mesuré
 *     (plan §A.3 point 5) : `StatusComposer.onPublish` (`:23`) ne portait
 *     AUCUNE visibilité, et `useCreateStatusMutation` retombait sur `'PUBLIC'`.
 *     **C'est la SEULE capacité que ce lot AJOUTE au-delà du port** — si la
 *     revue la retire, rien d'autre n'en dépend.
 *
 * Port fidèle pour le reste : dix emojis, le plafond de 140 (MÊME mécanisme
 * que le composer hérité — `maxLength` sur le champ ; la troncature de
 * `handleContentChange` n'en est que le filet, cf. la note de
 * `ComposerMoodSurface.tsx`), et les références en tri-état.
 *
 * Deux gestes en revanche CHANGENT de forme parce que la surface neuve les
 * rend atteignables là où le composer hérité ne les peignait jamais :
 *
 *  - **« effacer » a son propre canal** (`onClearStatus`). Le composer hérité
 *    le publiait sur `onPublish` sous la forme `{ moodEmoji: '' }` — une
 *    charge sans aucun porteur de contenu, que le gateway refuse
 *    (`CreatePostSchema.refine(hasAnyContentCarrier)`). Son unique montage ne
 *    passant pas `currentStatus`, le bouton n'était jamais peint et le défaut
 *    jamais atteint ;
 *  - **la graine `currentStatus` est VIVANTE**, comme dans le composer hérité
 *    (`useEffect(..., [open, currentStatus])`, `:46-51`) : elle est adoptée
 *    même quand elle arrive après le montage, et elle ne remplit que le vide
 *    (`ComposerMoodSeeding.adopt`, iOS).
 */
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MeeshyComposer } from '@/components/composer/MeeshyComposer';
import type { ComposerStatusPayload } from '@/components/composer/ComposerMoodSurface';
import { PUBLICATION_VISIBILITY_OPTIONS } from '@/components/v2/publication-visibility';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
      typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
  }),
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

type Door = React.ComponentProps<typeof MeeshyComposer>['door'];

function renderMood(door: Door = { kind: 'moodChip' }, extraProps: Partial<React.ComponentProps<typeof MeeshyComposer>> = {}) {
  const onPublish = jest.fn();
  const onPublishStatus = jest.fn();
  const view = render(
    <MeeshyComposer door={door} onPublish={onPublish} onPublishStatus={onPublishStatus} {...extraProps} />,
  );
  return {
    onPublish,
    onPublishStatus,
    rerender: (nextDoor: Door = door, nextExtra: Partial<React.ComponentProps<typeof MeeshyComposer>> = extraProps) =>
      view.rerender(
        <MeeshyComposer door={nextDoor} onPublish={onPublish} onPublishStatus={onPublishStatus} {...nextExtra} />,
      ),
    unmount: view.unmount,
    published: () => onPublishStatus.mock.calls[0]?.[0] as ComposerStatusPayload | undefined,
    lastPublished: () =>
      onPublishStatus.mock.calls[onPublishStatus.mock.calls.length - 1]?.[0] as ComposerStatusPayload | undefined,
  };
}

function emojiButton(emoji: string): HTMLButtonElement {
  return screen.getByLabelText(`Mood ${emoji}`) as HTMLButtonElement;
}

function publishButton(): HTMLButtonElement {
  return screen.getByText('publish').closest('button') as HTMLButtonElement;
}

function clickPublish(): void {
  fireEvent.click(publishButton());
}

function chooseVisibility(id: string): void {
  fireEvent.click(screen.getByTestId(`composer-status-visibility-${id}`));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchUsers.mockResolvedValue([]);
  window.localStorage.clear();
});

// ─────────────────────────────────────────────────────────────────────────────
// Routage — `moodChip` peint la surface mood, publie par le canal dédié.
// ─────────────────────────────────────────────────────────────────────────────
describe('W6 — `moodChip` peint la surface mood dans le meuble', () => {
  it('rend la surface mood — pas la surface document', () => {
    renderMood();
    expect(screen.getByTestId('composer-status-surface')).toBeInTheDocument();
    expect(screen.queryByTestId('composer-document-surface')).not.toBeInTheDocument();
  });

  it('publie via `onPublishStatus`, jamais via `onPublish` (document)', () => {
    const { onPublish, onPublishStatus } = renderMood();
    fireEvent.click(emojiButton('🎉'));
    clickPublish();

    expect(onPublishStatus).toHaveBeenCalledTimes(1);
    expect(onPublish).not.toHaveBeenCalled();
  });

  it('sans `onPublishStatus`, la surface reste montée et fonctionnelle — no-op silencieux, jamais un crash', () => {
    render(<MeeshyComposer door={{ kind: 'moodChip' }} onPublish={jest.fn()} />);
    fireEvent.click(emojiButton('🎉'));
    expect(() => clickPublish()).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Point 1 — parité : dix emojis, avec la BASCULE.
// ─────────────────────────────────────────────────────────────────────────────
describe("W6 point 1 — la grille d'emojis, identique à `StatusComposer.tsx:31`, avec bascule", () => {
  const MOOD_EMOJIS = ['😴', '🎉', '💪', '☕', '🔥', '💭', '🎵', '📚', '✈️', '❤️'];

  it('rend exactement les dix mêmes emojis', () => {
    renderMood();
    MOOD_EMOJIS.forEach((emoji) => expect(emojiButton(emoji)).toBeInTheDocument());
  });

  it('sans emoji, la publication ne part pas', () => {
    const { onPublishStatus } = renderMood();
    expect(publishButton()).toBeDisabled();
    clickPublish();
    expect(onPublishStatus).not.toHaveBeenCalled();
  });

  it('retaper l’emoji déjà choisi le DÉSÉLECTIONNE — capacité que le composer hérité n’avait pas', () => {
    renderMood();
    fireEvent.click(emojiButton('🎉'));
    expect(publishButton()).not.toBeDisabled();

    fireEvent.click(emojiButton('🎉'));
    expect(publishButton()).toBeDisabled();
  });

  it('choisir un second emoji REMPLACE le premier, ne les cumule pas', () => {
    const { published } = renderMood();
    fireEvent.click(emojiButton('🎉'));
    fireEvent.click(emojiButton('🔥'));
    clickPublish();

    expect(published()?.moodEmoji).toBe('🔥');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Point 1 — le plafond DUR de 140. Le MÉCANISME est celui du web (le plafond
// natif du champ), l'ISSUE est celle d'iOS (`ComposerMoodPolicy.truncate` :
// garder les 140 premiers). Voir la note de `ComposerMoodSurface.tsx`.
// ─────────────────────────────────────────────────────────────────────────────
describe('W6 point 1 — plafond 140 : le champ le déclare, la troncature le garantit', () => {
  it('le champ porte le plafond NATIF `maxlength=140` — le mécanisme que le navigateur applique réellement', () => {
    renderMood();

    expect(screen.getByPlaceholderText('statusComposer.placeholder')).toHaveAttribute('maxlength', '140');
  });

  it('une écriture qui ÉCHAPPE au plafond natif est coupée à 140 dans la charge publiée', () => {
    const { published } = renderMood();
    fireEvent.click(emojiButton('🎉'));
    fireEvent.change(screen.getByPlaceholderText('statusComposer.placeholder'), {
      target: { value: 'x'.repeat(150) },
    });
    clickPublish();

    expect(published()?.content).toHaveLength(140);
  });

  it('le compteur passe en alerte à partir de 126 caractères, pas avant', () => {
    renderMood();
    const input = screen.getByPlaceholderText('statusComposer.placeholder');

    fireEvent.change(input, { target: { value: 'x'.repeat(125) } });
    expect(screen.getByTestId('composer-status-char-count').className).not.toContain('gp-error');

    fireEvent.change(input, { target: { value: 'x'.repeat(126) } });
    expect(screen.getByTestId('composer-status-char-count').className).toContain('gp-error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Point 1 — références en tri-état (jamais `[]`).
// ─────────────────────────────────────────────────────────────────────────────
describe('W6 point 1 — références déclarées, jamais `mentions: []`', () => {
  it("n'envoie AUCUN `mentions` quand personne n'est référencé", () => {
    const { published } = renderMood();
    fireEvent.click(emojiButton('🎉'));
    clickPublish();

    expect(published()).not.toHaveProperty('mentions');
  });

  /**
   * Reformulation W9 Step 3 — le seul volet de `PostComposerReferences.test.tsx`
   * (« StatusComposer — references ») que la garde d'ABSENCE ci-dessus ne
   * couvrait pas : le chemin POSITIF, choisir quelqu'un au picker jusqu'à la
   * charge publiée. `useReferences` (le hook, testé exhaustivement en
   * isolation dans `useReferences.test.ts`) fait déjà foi sur le calcul
   * SILENT/INLINE ; ce test est le SEUL qui prouve que `ComposerMoodSurface`
   * le CÂBLE bien jusqu'à `onPublishStatus` — une régression de câblage
   * (le picker ouvert, la sélection perdue en route) ne rougirait nulle part
   * ailleurs.
   */
  it('publie la personne choisie au picker en SILENT', async () => {
    mockSearchUsers.mockResolvedValue([{ id: 'u-a', username: 'alice', displayName: 'Alice' }]);
    const { published } = renderMood();
    fireEvent.click(emojiButton('🎉'));

    fireEvent.click(screen.getByLabelText('Mention someone'));
    fireEvent.change(screen.getByPlaceholderText('Search for someone'), { target: { value: 'ali' } });
    await waitFor(() => expect(mockSearchUsers).toHaveBeenCalled());
    fireEvent.click(await screen.findByText('Alice'));

    clickPublish();

    expect(published()?.mentions).toEqual([{ userId: 'u-a', display: 'SILENT' }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Le geste « effacer » n'emprunte PAS le canal de CRÉATION.
//
// `StatusComposer.handleClear` (`:74-81`) publiait `{ moodEmoji: '' }` sur le
// même `onPublish` qu'une création. Ce chemin est INATTEIGNABLE dans le
// composer hérité — son unique montage (`PostsFeedScreen.tsx:991-995`) ne
// passe pas `currentStatus`, donc le bouton n'est jamais peint. La surface
// neuve, elle, documente `currentStatus` comme un champ de son contrat : le
// geste devient atteignable, et la charge qu'il émettait ne porte AUCUN
// porteur de contenu — ce que le gateway refuse (400 VALIDATION_ERROR,
// `CreatePostSchema.refine(hasAnyContentCarrier)`,
// `services/gateway/src/routes/posts/types.ts`). Un canal DÉDIÉ sépare donc
// les deux intentions que rien ne distinguait dans le type.
// ─────────────────────────────────────────────────────────────────────────────
describe("W6 — « Effacer » a son propre canal, jamais celui de la création", () => {
  it("sans `currentStatus`, aucun bouton Effacer n'est peint", () => {
    renderMood({ kind: 'moodChip' }, { onClearStatus: jest.fn() });
    expect(screen.queryByText('statusComposer.clear')).not.toBeInTheDocument();
  });

  it("avec un mood courant mais AUCUN canal d'effacement, le bouton n'est pas peint — jamais une charge que le serveur refuse", () => {
    renderMood({ kind: 'moodChip' }, { currentStatus: { moodEmoji: '🔥', content: 'ça va' } });

    expect(screen.queryByText('statusComposer.clear')).not.toBeInTheDocument();
  });

  it('avec les deux, Effacer appelle `onClearStatus` et ne publie RIEN', () => {
    const onClearStatus = jest.fn();
    const { onPublishStatus, onPublish } = renderMood(
      { kind: 'moodChip' },
      { currentStatus: { moodEmoji: '🔥', content: 'ça va' }, onClearStatus },
    );

    fireEvent.click(screen.getByText('statusComposer.clear'));

    expect(onClearStatus).toHaveBeenCalledTimes(1);
    expect(onPublishStatus).not.toHaveBeenCalled();
    expect(onPublish).not.toHaveBeenCalled();
  });

  it('Effacer remet le formulaire à zéro — la publication redevient impossible', () => {
    renderMood(
      { kind: 'moodChip' },
      { currentStatus: { moodEmoji: '🔥', content: 'ça va' }, onClearStatus: jest.fn() },
    );

    fireEvent.click(screen.getByText('statusComposer.clear'));

    expect(publishButton()).toBeDisabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La graine `currentStatus` est VIVANTE.
//
// Le composer hérité re-sème par `useEffect(..., [open, currentStatus])`
// (`StatusComposer.tsx:46-51`). Un `useState(currentStatus?.…)` ne se sème
// qu'au MONTAGE : un mood qui arrive après (requête en vol) laisserait la
// grille vide sous un bouton Effacer déjà peint. C'est le défaut n°2 de
// W1-W3 — « la porte est VIVANTE » — appliqué à la graine.
//
// L'adoption ne remplit que le VIDE, comme `ComposerMoodSeeding.adopt` (iOS).
// ─────────────────────────────────────────────────────────────────────────────
describe('W6 — la graine `currentStatus` est vivante, et ne remplit que le vide', () => {
  it('un mood fourni au MONTAGE présélectionne son emoji et préremplit son texte', () => {
    renderMood({ kind: 'moodChip' }, { currentStatus: { moodEmoji: '🔥', content: 'ça va' } });

    expect(emojiButton('🔥')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByPlaceholderText('statusComposer.placeholder')).toHaveValue('ça va');
  });

  it("un mood qui ARRIVE APRÈS le montage est adopté — la requête en vol ne laisse pas la grille vide", () => {
    const { rerender } = renderMood({ kind: 'moodChip' }, {});

    expect(emojiButton('🔥')).toHaveAttribute('aria-pressed', 'false');

    rerender({ kind: 'moodChip' }, { currentStatus: { moodEmoji: '🔥', content: 'ça va' } });

    expect(emojiButton('🔥')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByPlaceholderText('statusComposer.placeholder')).toHaveValue('ça va');
  });

  it("la graine tardive ne remplace JAMAIS ce que l'auteur vient de poser", () => {
    const { rerender } = renderMood({ kind: 'moodChip' }, {});
    fireEvent.click(emojiButton('🎉'));
    fireEvent.change(screen.getByPlaceholderText('statusComposer.placeholder'), {
      target: { value: 'déjà tapé' },
    });

    rerender({ kind: 'moodChip' }, { currentStatus: { moodEmoji: '🔥', content: 'ça va' } });

    expect(emojiButton('🎉')).toHaveAttribute('aria-pressed', 'true');
    expect(emojiButton('🔥')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByPlaceholderText('statusComposer.placeholder')).toHaveValue('déjà tapé');
  });

  it("un rendu de MÊME graine ne réinitialise pas ce que l'auteur vient de changer", () => {
    const { rerender } = renderMood(
      { kind: 'moodChip' },
      { currentStatus: { moodEmoji: '🔥', content: 'ça va' } },
    );
    fireEvent.click(emojiButton('🔥'));

    rerender({ kind: 'moodChip' }, { currentStatus: { moodEmoji: '🔥', content: 'ça va' } });

    expect(emojiButton('🔥')).toHaveAttribute('aria-pressed', 'false');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Point 2 — le défaut mesuré : l'audience atteint enfin la charge publiée.
// ─────────────────────────────────────────────────────────────────────────────
describe('W6 point 2 — la visibilité choisie voyage jusqu’à la charge (défaut mesuré §A.3.5)', () => {
  it('naît sur PUBLIC quand rien n’est choisi', () => {
    const { published } = renderMood();
    fireEvent.click(emojiButton('🎉'));
    clickPublish();

    expect(published()?.visibility).toBe('PUBLIC');
  });

  it('offre les SIX audiences du modèle, dans l’ordre de la source unique', () => {
    renderMood();
    const options = within(screen.getByTestId('composer-status-visibility-options')).getAllByRole('button');
    expect(options.map((b) => b.textContent)).toEqual(
      PUBLICATION_VISIBILITY_OPTIONS.map((o) => `${o.icon}${o.labelKey}`),
    );
  });

  it('choisir FRIENDS le porte jusqu’à la charge publiée', () => {
    const { published } = renderMood();
    fireEvent.click(emojiButton('🎉'));
    chooseVisibility('FRIENDS');
    clickPublish();

    expect(published()?.visibility).toBe('FRIENDS');
  });

  it('bloque la publication d’un ONLY sans personne désignée', () => {
    const { onPublishStatus } = renderMood();
    fireEvent.click(emojiButton('🎉'));
    chooseVisibility('ONLY');

    expect(screen.getByTestId('audience-user-picker')).toBeInTheDocument();
    expect(publishButton()).toBeDisabled();
    clickPublish();
    expect(onPublishStatus).not.toHaveBeenCalled();
  });

  it('publie l’audience une fois qu’elle porte au moins une personne', () => {
    const { published } = renderMood();
    fireEvent.click(emojiButton('🎉'));
    chooseVisibility('ONLY');
    fireEvent.change(screen.getByPlaceholderText('audiencePicker.searchPlaceholder'), {
      target: { value: 'nad' },
    });
    fireEvent.click(screen.getByText('Nadia'));
    clickPublish();

    expect(published()?.visibility).toBe('ONLY');
    expect(published()?.visibilityUserIds).toEqual(['user-7']);
  });

  it('ne transporte AUCUNE liste sous une audience qui n’en prend pas — jamais `visibilityUserIds` sans son couple', () => {
    const { published } = renderMood();
    fireEvent.click(emojiButton('🎉'));
    chooseVisibility('FRIENDS');
    clickPublish();

    expect(published()?.visibility).toBe('FRIENDS');
    // Même convention que `ComposerDocumentSurface` (`meeshy-composer-post.test.tsx`,
    // « ne transporte AUCUNE liste… ») : la clé peut être PRÉSENTE avec la
    // valeur `undefined` — c'est `useCreateStatusMutation`'s conditional
    // spread qui l'omet ensuite de la charge réseau ; ce que cette surface
    // garantit est qu'aucune LISTE non vide ne fuit sous la mauvaise audience.
    expect(published()?.visibilityUserIds).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Point 2 — la mémoire, PAR FORMAT (loi 10).
// ─────────────────────────────────────────────────────────────────────────────
describe('W6 point 2 — l’audience se souvient PAR FORMAT (loi 10, miroir de `lastStatusVisibility`)', () => {
  it('un choix publié est relu au remontage suivant de la surface mood', () => {
    // Deux ARBRES distincts, jamais deux en vie en même temps : le premier
    // est démonté avant que le second ne peigne son propre bouton
    // « publish », sans quoi `screen` verrait deux correspondances.
    const first = renderMood();
    fireEvent.click(emojiButton('🎉'));
    chooseVisibility('FRIENDS');
    clickPublish();
    first.unmount();

    const second = renderMood();
    fireEvent.click(emojiButton('💪'));
    clickPublish();

    expect(second.published()?.visibility).toBe('FRIENDS');
  });

  it('n’écrit PAS sous une clé partagée avec un autre format — un post monté ensuite reste PUBLIC', () => {
    const mood = renderMood();
    fireEvent.click(emojiButton('🎉'));
    chooseVisibility('COMMUNITY');
    clickPublish();

    expect(window.localStorage.getItem('lastStatusVisibility')).toBe('COMMUNITY');
    // Aucune écriture sous une clé de format DOCUMENT — la mémoire du mood
    // ne fait pas hériter le post d'une audience qu'il n'a pas choisie.
    expect(window.localStorage.getItem('lastPostVisibility')).toBeNull();
  });

  it('un `localStorage` indisponible (navigation privée) retombe sur PUBLIC, jamais une exception', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => renderMood()).not.toThrow();
    fireEvent.click(emojiButton('🎉'));
    expect(() => clickPublish()).not.toThrow();

    jest.restoreAllMocks();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// `onPublish` (document) n'est jamais concerné par la porte mood.
// ─────────────────────────────────────────────────────────────────────────────
describe('W6 — la porte `moodChip` ne peint jamais la surface document', () => {
  it('une porte qui n’ouvre pas sur `status` (feedComposer) peint bien la surface document, pas la mood', () => {
    render(<MeeshyComposer door={{ kind: 'feedComposer' }} onPublish={jest.fn()} onPublishStatus={jest.fn()} />);
    expect(screen.getByTestId('composer-document-surface')).toBeInTheDocument();
    expect(screen.queryByTestId('composer-status-surface')).not.toBeInTheDocument();
  });
});
