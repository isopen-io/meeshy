/**
 * Task W8, Step 1 — la surface DOCUMENT en mode ÉDITION, loi 3 (« on n'écrit
 * que ce qu'on sait complet et qu'on a su rendre »).
 *
 * Ce que cette suite verrouille, cas par cas cités à la ligne du plan
 * (`docs/superpowers/plans/2026-08-24-meeshy-composer-v2-lot-6.md`, Task W8
 * Step 1) :
 *
 *  1. une modification d'audience SEULE n'envoie pas `content` — défaut
 *     mesuré, `PostEditor.tsx:99-104` l'envoyait toujours ;
 *  2. `mentions` n'est JAMAIS envoyé par une édition web ;
 *  3. `storyEffects` n'est JAMAIS envoyé par une édition web ;
 *  4. `removeMediaIds` arrive jusqu'au PUT ;
 *  5. conversion POST↔RÉEL : `type` n'est envoyé QUE s'il a changé, l'éventail
 *     ne l'offre que si `qualifiesAsReel`, et un réel qui perd sa dernière
 *     qualification dégrade vers POST au moment d'enregistrer (même
 *     mécanisme que la création — `publishedType`, jamais un second) ;
 *  6. éditer une STORY ou un STATUS n'offre aucun choix de format — et de
 *     toute façon `MeeshyComposer` ne monte aucune surface d'édition pour eux
 *     (§C, aucune n'existe sur web).
 *
 * Rendu via `MeeshyComposer` — même niveau que `meeshy-composer-post.test.tsx`
 * — pour prouver le CÂBLAGE `editSource`/`onSaveEdit` autant que la surface.
 * `meeshy-composer-post.test.tsx` documente déjà qu'AVANT ce lot, `door.kind
 * === 'edit'` SANS `editSource` peint une surface VIDE (aucune hydratation) :
 * cette suite n'y touche pas — `editSource` reste optionnel, et cette suite
 * ne teste que le chemin où il est fourni.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MeeshyComposer } from '@/components/composer/MeeshyComposer';
import type { ComposerDocumentEditPayload } from '@/components/composer/payload';
import type { PostMedia } from '@meeshy/shared/types/post';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
      typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
  }),
}));

jest.mock('@/components/v2/Avatar', () => ({ Avatar: () => <div data-testid="avatar" /> }));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: { authToken: string | null }) => unknown) => selector({ authToken: 'token-123' }),
  useUser: () => null,
}));

jest.mock('use-debounce', () => ({ useDebounce: (value: unknown) => [value] }));

const mockAudienceResults: Array<{ id: string; username: string; displayName: string }> = [
  { id: 'user-7', username: 'nadia', displayName: 'Nadia' },
];
jest.mock('@/hooks/queries/use-users-query', () => ({
  useSearchUsersQuery: () => ({ data: mockAudienceResults, isLoading: false }),
}));

let mockValidation: { valid: boolean; errors: string[] } = { valid: true, errors: [] };
jest.mock('@/services/attachmentService', () => ({
  AttachmentService: { validateFiles: (...args: unknown[]) => mockValidation },
}));

type MockAttachmentState = {
  selectedFiles: File[];
  uploadedAttachments: Array<{ id: string; mimeType: string; fileUrl: string; duration?: number }>;
  isUploading: boolean;
  uploadProgress: Record<number, number>;
};
let mockAttachmentState: MockAttachmentState;
// Références STABLES entre rendus — le hook RÉEL (`useAttachmentUpload.ts`)
// mémoïse les trois par `useCallback([])` : un `jest.fn()` refabriqué DANS la
// factory du mock à chaque appel produirait une identité NEUVE à chaque rendu
// et masquerait la staleness de `handleKeyDown` (constat 2) — `handlePublish`
// se recréerait alors à CHAQUE rendu quelle qu'en soit la cause, l'exact
// inverse du comportement de production que ce test doit exercer. Même
// discipline que `meeshy-composer-post.test.tsx`.
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

beforeEach(() => {
  mockAttachmentState = { selectedFiles: [], uploadedAttachments: [], isUploading: false, uploadProgress: {} };
  mockValidation = { valid: true, errors: [] };
  mockHandleFilesSelected.mockClear();
  mockHandleRemoveFile.mockClear();
  mockClearAttachments.mockClear();
});

function makeMedia(overrides: Partial<PostMedia> = {}): PostMedia {
  return { id: 'm1', mimeType: 'image/jpeg', fileUrl: 'https://x/1.jpg', order: 0, ...overrides };
}

type EditSource = NonNullable<React.ComponentProps<typeof MeeshyComposer>['editSource']>;

function renderEdit(editSource: EditSource) {
  const onSaveEdit = jest.fn();
  render(
    <MeeshyComposer
      door={{ kind: 'edit', documentFormat: editSource.postType === 'REEL' ? 'reel' : 'post' }}
      onPublish={jest.fn()}
      editSource={editSource}
      onSaveEdit={onSaveEdit}
    />,
  );
  return { onSaveEdit, saved: () => onSaveEdit.mock.calls[0]?.[0] as ComposerDocumentEditPayload | undefined };
}

const BASE: EditSource = {
  postId: 'post-1',
  content: 'Texte original',
  visibility: 'PUBLIC',
  visibilityUserIds: [],
  media: [],
  postType: 'POST',
};

function contentField(): HTMLElement {
  return screen.getByLabelText('composer.edit.contentLabel');
}
function save(): void {
  fireEvent.click(screen.getByText('save'));
}

describe('ComposerDocumentSurface (édition) — loi 3, n’écrire que ce qu’on sait complet', () => {
  it('hydrate le contenu et l’audience depuis editSource', () => {
    renderEdit({ ...BASE, content: 'Salut le monde', visibility: 'FRIENDS' });
    expect(contentField()).toHaveValue('Salut le monde');
  });

  it("une modification d'audience SEULE n'envoie pas `content`", () => {
    const { saved } = renderEdit({ ...BASE, visibility: 'FRIENDS' });

    // Ouvre le sélecteur de visibilité et choisit COMMUNITY — le CONTENU
    // n'est pas touché.
    fireEvent.click(screen.getByLabelText('postComposer.changeVisibility'));
    fireEvent.click(screen.getByText('publicationVisibility.community'));
    save();

    const data = saved()?.data;
    expect(data).toBeDefined();
    expect('content' in (data as object)).toBe(false);
    expect(data?.visibility).toBe('COMMUNITY');
  });

  /**
   * Reformulation W9 Step 3 de `PostEditor.visibility.test.tsx` — le picker
   * ONLY/EXCEPT (`AudienceUserPicker`) et son gate `isAudienceIncomplete`
   * sont un site UNIQUE, partagé sans branche `isEditing` entre création et
   * édition (`ComposerDocumentSurface.tsx`, la garde à `handleSaveEdit`
   * MÊME ligne que `handlePublish`) — déjà exhaustivement prouvés en
   * CRÉATION par « W3 point 6 » (`meeshy-composer-post.test.tsx`). Ce qui
   * reste propre à l'ÉDITION, et qu'aucun test ne couvrait encore ici : la
   * liste HYDRATÉE depuis `editSource` sert de BASE à laquelle le picker
   * AJOUTE, plutôt que d'être écrasée.
   */
  it('ajouter une personne à une audience ONLY déjà peuplée envoie la liste existante PLUS la nouvelle', () => {
    const { saved } = renderEdit({ ...BASE, visibility: 'ONLY', visibilityUserIds: ['user-3'] });

    expect(screen.getByTestId('audience-user-picker')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('audiencePicker.searchPlaceholder'), {
      target: { value: 'nad' },
    });
    fireEvent.click(screen.getByText('Nadia'));
    save();

    expect(saved()?.data.visibility).toBe('ONLY');
    expect(saved()?.data.visibilityUserIds).toEqual(['user-3', 'user-7']);
  });

  it('passer à ONLY sans désigner personne bloque la sauvegarde — même gate qu’à la création', () => {
    const { onSaveEdit } = renderEdit({ ...BASE, visibility: 'FRIENDS' });

    fireEvent.click(screen.getByLabelText('postComposer.changeVisibility'));
    fireEvent.click(screen.getByText('publicationVisibility.only'));
    save();

    expect(onSaveEdit).not.toHaveBeenCalled();
  });

  it('quitter ONLY vide la liste envoyée — pas de destinataires fantômes qui survivent au changement', () => {
    const { saved } = renderEdit({ ...BASE, visibility: 'ONLY', visibilityUserIds: ['user-3'] });

    fireEvent.click(screen.getByLabelText('postComposer.changeVisibility'));
    fireEvent.click(screen.getByText('publicationVisibility.friends'));
    save();

    expect(saved()?.data.visibility).toBe('FRIENDS');
    expect(saved()?.data.visibilityUserIds).toEqual([]);
  });

  it("un contenu INCHANGÉ n'est jamais renvoyé, même après une sauvegarde qui touche autre chose", () => {
    const { saved } = renderEdit({ ...BASE, media: [makeMedia({ id: 'm1' }), makeMedia({ id: 'm2' })] });

    fireEvent.click(screen.getAllByLabelText('composer.edit.removeMedia')[0]);
    save();

    expect('content' in (saved()?.data as object)).toBe(false);
    expect(saved()?.data.removeMediaIds).toEqual(['m1']);
  });

  it('un contenu MODIFIÉ est envoyé', () => {
    const { saved } = renderEdit(BASE);
    fireEvent.change(contentField(), { target: { value: 'Texte réécrit' } });
    save();
    expect(saved()?.data.content).toBe('Texte réécrit');
  });

  it('`mentions` n’apparaît JAMAIS dans la charge — le formulaire d’édition ne peint pas ce jeu', () => {
    const { saved } = renderEdit(BASE);
    fireEvent.change(contentField(), { target: { value: 'Texte réécrit' } });
    save();
    expect('mentions' in (saved()?.data as object)).toBe(false);
  });

  it('`storyEffects` n’apparaît JAMAIS dans la charge — le formulaire n’a jamais peint ce canevas', () => {
    const { saved } = renderEdit(BASE);
    fireEvent.change(contentField(), { target: { value: 'Texte réécrit' } });
    save();
    expect('storyEffects' in (saved()?.data as object)).toBe(false);
  });

  it('`removeMediaIds` arrive jusqu’au PUT', () => {
    const { saved } = renderEdit({
      ...BASE,
      media: [makeMedia({ id: 'm1' }), makeMedia({ id: 'm2' })],
    });

    fireEvent.click(screen.getAllByLabelText('composer.edit.removeMedia')[1]);
    save();

    expect(saved()?.data.removeMediaIds).toEqual(['m2']);
  });

  it("l'éventail post→réel n'offre RÉEL que si la composition restante qualifie", () => {
    renderEdit({ ...BASE, media: [makeMedia({ id: 'm1' })] });
    expect(screen.queryByTestId('composer-format-reel')).not.toBeInTheDocument();
  });

  it('convertir un POST en RÉEL via l’éventail envoie `type: REEL`', () => {
    const { saved } = renderEdit({
      ...BASE,
      media: [
        makeMedia({ id: 'm1', mimeType: 'image/jpeg' }),
        makeMedia({ id: 'm2', mimeType: 'image/png' }),
      ],
    });

    fireEvent.click(screen.getByTestId('composer-format-reel'));
    save();

    expect(saved()?.data.type).toBe('REEL');
  });

  it("`type` n'est PAS envoyé quand le format n'a pas changé", () => {
    const { saved } = renderEdit({ ...BASE, postType: 'POST' });
    fireEvent.change(contentField(), { target: { value: 'Texte réécrit' } });
    save();
    expect('type' in (saved()?.data as object)).toBe(false);
  });

  it('convertir un RÉEL en POST via l’éventail envoie `type: POST`', () => {
    const { saved } = renderEdit({
      ...BASE,
      postType: 'REEL',
      media: [makeMedia({ id: 'm1', mimeType: 'video/mp4', duration: 5000 })],
    });

    fireEvent.click(screen.getByTestId('composer-format-post'));
    save();

    expect(saved()?.data.type).toBe('POST');
  });

  it('un RÉEL qui perd sa dernière qualification en retirant son unique média dégrade vers POST au save', () => {
    const { saved } = renderEdit({
      ...BASE,
      postType: 'REEL',
      media: [makeMedia({ id: 'm1', mimeType: 'video/mp4', duration: 5000 })],
    });

    fireEvent.click(screen.getByLabelText('composer.edit.removeMedia'));
    fireEvent.change(contentField(), { target: { value: 'plus de video' } });
    save();

    expect(saved()?.data.type).toBe('POST');
  });

  /**
   * Constat BLOQUANT (revue adversariale) — un repost-cite d'un RÉEL n'a
   * AUCUN `PostMedia` propre (`repostPost` ne duplique les médias que pour une
   * source ÉPHÉMÈRE) : `editSource.media` y est TOUJOURS vide alors que
   * `editSource.postType` reste `REEL`. Avant ce correctif, `publishedType`
   * dérivait cette composition VIDE comme si l'auteur venait de la faire
   * chuter par un retrait — exactement le mécanisme voulu du test précédent —
   * et envoyait `type: 'POST'` SANS le moindre geste de l'auteur : ouvrir la
   * modale et cliquer Enregistrer suffisait. La dégradation n'est légitime que
   * si le client connaissait une composition qualifiante AU DÉPART
   * (`editSource.media`) et que l'auteur l'a fait chuter lui-même ; ici elle ne
   * qualifiait déjà pas à l'hydratation, donc le client ne sait rien de fiable
   * et ne doit rien affirmer.
   */
  it("format RÉEL mais composition connue du client NON qualifiante (repost-cite) — n'importe rien à l'ouverture ne dégrade jamais `type`", () => {
    const { onSaveEdit } = renderEdit({ ...BASE, postType: 'REEL', media: [] });

    // Rien touché — ni l'éventail, ni les médias, ni le contenu.
    save();

    expect(onSaveEdit).not.toHaveBeenCalled();
  });

  /**
   * Constat MAJEUR (revue adversariale) — `handleKeyDown` (~ligne 596) a été
   * étendu à l'édition mais son tableau de dépendances est resté
   * `[handlePublish]` : ni `isEditing`, ni `handleSaveEdit`. Retirer un média
   * EXISTANT ne recrée pas `handlePublish` (aucun de ses dépendances n'en
   * dépend pour un POST — `publishedType` y est une constante) : `handleKeyDown`
   * reste donc la fermeture du MONTAGE, qui appelle un `handleSaveEdit` figé à
   * `editHasChanges === false` (rien n'avait encore changé). Résultat mesuré :
   * cmd+Entrée après un retrait de média n'envoie RIEN — ni le retrait, ni quoi
   * que ce soit d'autre — alors que le bouton Enregistrer, lui, fonctionne.
   */
  it('cmd+Entrée après un retrait de média EXISTANT envoie `removeMediaIds` — pas une charge périmée', () => {
    const { onSaveEdit, saved } = renderEdit({
      ...BASE,
      media: [makeMedia({ id: 'm1' }), makeMedia({ id: 'm2' })],
    });

    fireEvent.click(screen.getAllByLabelText('composer.edit.removeMedia')[0]);
    fireEvent.keyDown(contentField(), { key: 'Enter', metaKey: true });

    expect(onSaveEdit).toHaveBeenCalledTimes(1);
    expect(saved()?.data.removeMediaIds).toEqual(['m1']);
  });

  /**
   * Constat MAJEUR (revue adversariale) — `available` (~ligne 387) ne
   * soustrayait que `selectedFiles.length`, jamais `remainingExistingMedia`.
   * À 9 médias EXISTANTS, une seule sélection multiple de 3 fichiers passait
   * intégralement (`available` valait 10) : le pool UNIQUE de dix médias que
   * le doc-comment du fichier revendique sautait à l'édition.
   */
  it('le plafond de dix médias compte les médias EXISTANTS à l’édition — 9 déjà présents ne laissent qu’UNE place', () => {
    const nineExisting = Array.from({ length: 9 }, (_, i) =>
      makeMedia({ id: `m${i}`, mimeType: 'image/jpeg' }),
    );
    renderEdit({ ...BASE, media: nineExisting });

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
  });

  /**
   * Constat MINEUR (revue adversariale) — `mediaLimitReached` (~ligne 332) et
   * `available` (~ligne 407) recalculent la MÊME règle depuis DEUX ternaires
   * `isEditing ? totalMediaCount : selectedFiles.length` séparés. Seule la
   * seconde avait un témoin (le test ci-dessus, à 9 médias) : reverter
   * `mediaLimitReached` SEUL vers son ancienne forme naïve
   * (`selectedFiles.length >= MEDIA_LIMIT`, sourde à `isEditing`) laissait
   * 12 suites / 251 tests VERTS — l'AFFORDANCE (boutons grisés) pouvait donc
   * diverger de l'EXÉCUTION (sélection tranchée) sans qu'aucune assertion ne
   * rougisse. Ce témoin ferme l'angle mort : à DIX médias existants et ZÉRO
   * fichier sélectionné, les trois boutons d'ajout (photo, vidéo, audio)
   * doivent être DÉSACTIVÉS — avant ce témoin ils restaient actifs et
   * n'échouaient qu'après ouverture du sélecteur de fichiers.
   */
  it('le plafond de dix médias DÉSACTIVE les trois boutons d’ajout à l’édition — 10 déjà présents, 0 sélectionné', () => {
    const tenExisting = Array.from({ length: 10 }, (_, i) =>
      makeMedia({ id: `m${i}`, mimeType: 'image/jpeg' }),
    );
    renderEdit({ ...BASE, media: tenExisting });

    expect(screen.getByLabelText('postComposer.addPhoto')).toBeDisabled();
    expect(screen.getByLabelText('postComposer.addVideo')).toBeDisabled();
    expect(screen.getByTestId('audio-capture-toggle')).toBeDisabled();
  });

  it('éditer une STORY ou un STATUS ne peint aucune surface document éditable (§C)', () => {
    const onSaveEdit = jest.fn();
    render(
      <MeeshyComposer
        door={{ kind: 'edit', documentFormat: 'story' }}
        onPublish={jest.fn()}
        editSource={{ ...BASE, postType: 'STORY' }}
        onSaveEdit={onSaveEdit}
      />,
    );
    expect(screen.queryByTestId('composer-document-surface')).not.toBeInTheDocument();
  });
});
