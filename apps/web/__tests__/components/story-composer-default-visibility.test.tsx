/**
 * Règle produit 2026-08-23 — toute publication web (post, story, réel) naît
 * PUBLIQUE, et l'auteur reste libre d'en restreindre l'audience avant d'envoyer.
 *
 * Le composer story portait l'unique défaut divergent du parc web (`FRIENDS`) :
 * ce fichier fixe le défaut de la prop ET prouve que l'affordance de changement
 * d'audience reste intacte (sinon « public par défaut » deviendrait
 * « public sans recours »).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StoryComposer, StoryComposerProps } from '@/components/v2/StoryComposer';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';

global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-story-visibility');

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { authToken: string | null }) => unknown) =>
    selector({ authToken: 'token-1' }),
}));

const mockUploadedAttachments: UploadedAttachmentResponse[] = [];

jest.mock('@/hooks/composer/useAttachmentUpload', () => ({
  useAttachmentUpload: () => ({
    selectedFiles: [],
    uploadedAttachments: mockUploadedAttachments,
    isUploading: false,
    handleFilesSelected: jest.fn(),
    handleRemoveFile: jest.fn(),
    clearAttachments: jest.fn(),
  }),
}));

type PublishPayload = Parameters<StoryComposerProps['onPublish']>[0];

function renderComposer(props: Partial<StoryComposerProps> = {}): { published: () => PublishPayload } {
  let published: PublishPayload | null = null;
  render(
    <StoryComposer
      open
      onClose={jest.fn()}
      onPublish={(story) => { published = story; }}
      {...props}
    />,
  );
  return {
    published: () => {
      if (!published) throw new Error('onPublish was not called');
      return published;
    },
  };
}

describe('StoryComposer default audience', () => {
  it('publishes PUBLIC when the caller passes no defaultVisibility', () => {
    const { published } = renderComposer();
    fireEvent.change(screen.getByPlaceholderText('storyPlaceholder'), { target: { value: 'Bonjour' } });
    fireEvent.click(screen.getByText('publish'));

    expect(published().visibility).toBe('PUBLIC');
  });

  it('lets the author narrow the audience before publishing', () => {
    const { published } = renderComposer();
    fireEvent.change(screen.getByPlaceholderText('storyPlaceholder'), { target: { value: 'Bonjour' } });
    fireEvent.click(screen.getByText('publicationVisibility.friends'));
    fireEvent.click(screen.getByText('publish'));

    expect(published().visibility).toBe('FRIENDS');
  });

  it('still honours an explicit defaultVisibility from the caller', () => {
    const { published } = renderComposer({ defaultVisibility: 'PRIVATE' });
    fireEvent.change(screen.getByPlaceholderText('storyPlaceholder'), { target: { value: 'Bonjour' } });
    fireEvent.click(screen.getByText('publish'));

    expect(published().visibility).toBe('PRIVATE');
  });
});
