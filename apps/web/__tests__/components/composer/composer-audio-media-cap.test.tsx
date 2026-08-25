/**
 * Le TROISIÈME écrivain du pool média — l'outil micro.
 *
 * `mediaLimitReached` (l'affordance) et `available` (l'exécution) lisent
 * désormais un seul `totalMediaCount`. Mais `handleAudioCaptured` est un
 * troisième écrivain dans le MÊME pool, et il appelait `handleFilesSelected`
 * en direct, sans consulter ni l'un ni l'autre.
 *
 * Le bouton BASCULE porte bien `disabled` ; le bouton de CONFIRMATION, à
 * l'intérieur du panneau, n'en porte aucun. Le panneau étant ouvrable de
 * l'EXTÉRIEUR par `armCaptureToken` (W7 — le bouton rond du fil), une capture
 * confirmée franchissait le plafond sans qu'aucun grisé ne la retienne.
 *
 * Ce témoin monte un `AudioCapture` STUB : il n'exerce pas la machine de
 * capture (déjà couverte par `meeshy-composer-audio.test.tsx`) mais le seul
 * câblage `onCaptured` → pool, qui est l'objet du constat.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MeeshyComposer } from '@/components/composer/MeeshyComposer';
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

jest.mock('@/hooks/queries/use-users-query', () => ({
  useSearchUsersQuery: () => ({ data: [], isLoading: false }),
}));

jest.mock('@/services/attachmentService', () => ({
  AttachmentService: { validateFiles: () => ({ valid: true, errors: [] }) },
}));

// Le STUB : un bouton de confirmation qui rend `onCaptured` atteignable sans
// `getUserMedia`. Il expose aussi `disabled` TEL QUEL, pour prouver que le
// grisé de la bascule n'est PAS ce qui retient la confirmation.
jest.mock('@/components/composer/AudioCapture', () => ({
  AudioCapture: ({
    disabled,
    onCaptured,
  }: {
    disabled?: boolean;
    onCaptured: (r: { file: File; durationMs: number; transcriptText: string }) => void;
  }) => (
    <button
      type="button"
      data-testid="stub-audio-confirm"
      data-disabled={String(Boolean(disabled))}
      onClick={() =>
        onCaptured({
          file: new File(['son'], 'voix.webm', { type: 'audio/webm' }),
          durationMs: 4200,
          transcriptText: '',
        })
      }
    />
  ),
}));

const mockHandleFilesSelected = jest.fn();
const mockHandleRemoveFile = jest.fn();
const mockClearAttachments = jest.fn();
let mockSelectedFiles: File[] = [];
let mockUploadedAttachments: Array<{ id: string; mimeType: string; fileUrl: string }> = [];
jest.mock('@/hooks/composer/useAttachmentUpload', () => ({
  useAttachmentUpload: () => ({
    selectedFiles: mockSelectedFiles,
    uploadedAttachments: mockUploadedAttachments,
    isUploading: false,
    uploadProgress: {},
    handleFilesSelected: mockHandleFilesSelected,
    handleRemoveFile: mockHandleRemoveFile,
    clearAttachments: mockClearAttachments,
  }),
}));

global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();

beforeEach(() => {
  mockHandleFilesSelected.mockClear();
  mockSelectedFiles = [];
  mockUploadedAttachments = [];
});

function makeMedia(id: string): PostMedia {
  return {
    id,
    postId: 'post-1',
    fileUrl: `https://cdn/${id}.jpg`,
    mimeType: 'image/jpeg',
    order: 0,
  } as unknown as PostMedia;
}

function renderAuCap(count: number): void {
  render(
    <MeeshyComposer
      door={{ kind: 'edit', documentFormat: 'post' }}
      onPublish={jest.fn()}
      onSaveEdit={jest.fn()}
      editSource={{
        postId: 'post-1',
        content: 'Texte original',
        visibility: 'PUBLIC',
        visibilityUserIds: [],
        media: Array.from({ length: count }, (_, i) => makeMedia(`m${i}`)),
        postType: 'POST',
      }}
    />,
  );
}

describe('le pool de dix médias retient AUSSI l’outil micro', () => {
  it('à dix médias existants, confirmer une capture n’ajoute RIEN au pool', () => {
    renderAuCap(10);

    fireEvent.click(screen.getByTestId('stub-audio-confirm'));

    expect(mockHandleFilesSelected).not.toHaveBeenCalled();
  });

  it('sous le plafond, la même confirmation ajoute bien le fichier — la garde ne condamne pas l’outil', () => {
    renderAuCap(3);

    fireEvent.click(screen.getByTestId('stub-audio-confirm'));

    expect(mockHandleFilesSelected).toHaveBeenCalledTimes(1);
    expect(mockHandleFilesSelected.mock.calls[0][0][0]).toMatchObject({ name: 'voix.webm' });
  });

  // Reprise de la garde que `PostComposer.mediaCapDoubleCount.test.tsx`
  // tenait avant le retrait du lot W9 — le composant a disparu, le DÉFAUT
  // qu'elle nommait non : un média téléversé existe dans DEUX collections à
  // la fois (`selectedFiles` ET `uploadedAttachments`). Le compter deux fois
  // ramènerait le plafond de dix à cinq, sans qu'aucun message ne le dise.
  //
  // Elle est reformulée, pas transposée : le pool unifié compte
  // `remainingExistingMedia + selectedFiles`, donc c'est l'INDIFFÉRENCE à
  // `uploadedAttachments` qui doit être gardée.
  it('un média DÉJÀ téléversé ne compte qu’une fois — le plafond ne se divise pas par deux', () => {
    mockSelectedFiles = Array.from(
      { length: 6 },
      (_, i) => new File(['x'], `p${i}.jpg`, { type: 'image/jpeg' }),
    );
    mockUploadedAttachments = mockSelectedFiles.map((f, i) => ({
      id: `up${i}`,
      mimeType: 'image/jpeg',
      fileUrl: `https://cdn/${f.name}`,
    }));

    renderAuCap(0);

    expect(screen.getByLabelText('postComposer.addPhoto')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('stub-audio-confirm'));
    expect(mockHandleFilesSelected).toHaveBeenCalledTimes(1);
  });
});