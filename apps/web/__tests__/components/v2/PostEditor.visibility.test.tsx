/**
 * Loi produit 2026-08-23 — l'auteur change l'audience de sa publication à TOUT
 * MOMENT, pas seulement à la création.
 *
 * L'éditeur n'offrait que PUBLIC/FRIENDS/PRIVATE : la moitié des audiences du
 * modèle (COMMUNITY, EXCEPT, ONLY) étaient posables au composer puis
 * INATTEIGNABLES ensuite — et rouvrir l'éditeur sur un post en ONLY aurait
 * écrasé sa liste de destinataires en la laissant hors du payload.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PostEditor } from '@/components/v2/PostEditor';
import { PUBLICATION_VISIBILITY_OPTIONS } from '@/components/v2/publication-visibility';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

const mockSearchResults: Array<{ id: string; username: string; displayName: string }> = [
  { id: 'user-7', username: 'nadia', displayName: 'Nadia' },
];

// Le picker débounce la recherche (400 ms) : sans ce raccourci, la liste de
// candidats n'apparaît jamais dans le tour de rendu du test.
jest.mock('use-debounce', () => ({
  useDebounce: (value: unknown) => [value],
}));

jest.mock('@/hooks/queries/use-users-query', () => ({
  useSearchUsersQuery: () => ({ data: mockSearchResults, isLoading: false }),
}));

type SavePayload = {
  content: string;
  visibility: string;
  visibilityUserIds?: readonly string[];
  removeMediaIds: string[];
};

function renderEditor(props: Partial<React.ComponentProps<typeof PostEditor>> = {}) {
  const onSave = jest.fn();
  render(
    <PostEditor
      open
      initialContent="Un texte"
      initialVisibility="PUBLIC"
      onSave={onSave}
      onClose={jest.fn()}
      {...props}
    />,
  );
  return { onSave, saved: () => onSave.mock.calls[0]?.[0] as SavePayload | undefined };
}

function selectVisibility(value: string): void {
  fireEvent.change(screen.getByLabelText('publicationVisibility.label'), { target: { value } });
}

describe('PostEditor audience', () => {
  it('offers every PostVisibility the model defines, in the shared order', () => {
    renderEditor();
    const select = screen.getByLabelText('publicationVisibility.label') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(
      PUBLICATION_VISIBILITY_OPTIONS.map((o) => o.id),
    );
  });

  it('narrows a published post to COMMUNITY', () => {
    const { saved } = renderEditor();
    selectVisibility('COMMUNITY');
    fireEvent.click(screen.getByText('Save'));

    expect(saved()?.visibility).toBe('COMMUNITY');
  });

  it('asks for an explicit audience when switching to ONLY, and blocks saving while it is empty', () => {
    const { onSave } = renderEditor();
    selectVisibility('ONLY');

    expect(screen.getByTestId('audience-user-picker')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Save'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('sends the audience it collected alongside the visibility', () => {
    const { saved } = renderEditor();
    selectVisibility('ONLY');
    fireEvent.change(screen.getByPlaceholderText('audiencePicker.searchPlaceholder'), {
      target: { value: 'nad' },
    });
    fireEvent.click(screen.getByText('Nadia'));
    fireEvent.click(screen.getByText('Save'));

    expect(saved()?.visibility).toBe('ONLY');
    expect(saved()?.visibilityUserIds).toEqual(['user-7']);
  });

  it('reopens on an EXCEPT post with its existing audience already loaded', () => {
    const { saved } = renderEditor({
      initialVisibility: 'EXCEPT',
      initialVisibilityUserIds: ['user-3'],
    });

    // La liste préexistante suffit à débloquer l'enregistrement : elle n'est
    // pas à re-saisir, et elle repart telle quelle.
    fireEvent.change(screen.getByLabelText('Edit post content'), { target: { value: 'Un texte modifié' } });
    fireEvent.click(screen.getByText('Save'));

    expect(saved()?.visibility).toBe('EXCEPT');
    expect(saved()?.visibilityUserIds).toEqual(['user-3']);
  });

  it('drops the audience list when the author leaves EXCEPT/ONLY', () => {
    const { saved } = renderEditor({
      initialVisibility: 'ONLY',
      initialVisibilityUserIds: ['user-3'],
    });
    selectVisibility('PUBLIC');
    fireEvent.click(screen.getByText('Save'));

    expect(saved()?.visibility).toBe('PUBLIC');
    expect(saved()?.visibilityUserIds).toEqual([]);
  });

  it('counts an audience-only edit as a change worth saving', () => {
    const { onSave } = renderEditor({
      initialVisibility: 'ONLY',
      initialVisibilityUserIds: ['user-3'],
    });
    fireEvent.change(screen.getByPlaceholderText('audiencePicker.searchPlaceholder'), {
      target: { value: 'nad' },
    });
    fireEvent.click(screen.getByText('Nadia'));
    fireEvent.click(screen.getByText('Save'));

    expect(onSave).toHaveBeenCalled();
    expect((onSave.mock.calls[0][0] as SavePayload).visibilityUserIds).toEqual(['user-3', 'user-7']);
  });
});
