/**
 * PostComposer — media cap survives useAttachmentUpload's double-count
 * (Task 1 review fix, Important #1).
 *
 * useAttachmentUpload.ts enforces `maxAttachments` against
 * `selectedFiles.length + uploadedAttachments.length` (:280-281), but
 * `selectedFiles` is never trimmed after a successful upload while
 * `uploadedAttachments` grows alongside it (:332, :359) — after N
 * successful uploads both arrays hold N, so the hook counts 2N against
 * maxAttachments. Passing MEDIA_LIMIT (10) as-is silently caps real
 * uploads at 5: the 6th selection computes 11 > 10, the hook sets
 * `showAttachmentLimitModal` (which PostComposer never renders), and the
 * user's 📷 tap becomes a dead click with no upload and no message.
 *
 * PostComposer.test.tsx exercises PostComposer's own logic against a
 * "dumb" externally-controlled mock of the hook, which cannot reproduce
 * this bug (it never actually re-implements the hook's counting). This
 * file uses a small but faithful re-implementation of that exact
 * arithmetic — real React state, same block condition, same
 * never-trim-selectedFiles behavior — so a regression from
 * `MEDIA_LIMIT * 2` back to `MEDIA_LIMIT` in PostComposer.tsx fails here
 * instead of silently dead-clicking in production.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { PostComposer } from '@/components/v2/PostComposer';

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

jest.mock('@/services/attachmentService', () => ({
  AttachmentService: {
    validateFiles: () => ({ valid: true, errors: [] }),
  },
}));

let nextAttachmentId = 0;

// Faithful (not the real module — kept hermetic/fast) re-implementation of
// useAttachmentUpload's maxAttachments arithmetic: block when
// `selectedFiles.length + uploadedAttachments.length + incoming.length >
// maxAttachments`; on success, append to BOTH arrays and never trim
// selectedFiles. See useAttachmentUpload.ts:280-359 for the real thing.
jest.mock('@/hooks/composer/useAttachmentUpload', () => {
  const ReactActual = require('react');
  return {
    useAttachmentUpload: ({ maxAttachments = 50 }: { maxAttachments?: number }) => {
      const [selectedFiles, setSelectedFiles] = ReactActual.useState<File[]>([]);
      const [uploadedAttachments, setUploadedAttachments] = ReactActual.useState<
        Array<{ id: string; mimeType: string }>
      >([]);

      const handleFilesSelected = (files: File[]) => {
        const currentTotal = selectedFiles.length + uploadedAttachments.length;
        if (currentTotal + files.length > maxAttachments) return; // mirrors showAttachmentLimitModal (never rendered by PostComposer)

        setSelectedFiles((prev: File[]) => [...prev, ...files]);
        setUploadedAttachments((prev: Array<{ id: string; mimeType: string }>) => [
          ...prev,
          ...files.map(() => ({ id: `att-${nextAttachmentId++}`, mimeType: 'image/png' })),
        ]);
      };

      return {
        selectedFiles,
        uploadedAttachments,
        isUploading: false,
        uploadProgress: {},
        handleFilesSelected,
        handleRemoveFile: () => undefined,
        clearAttachments: () => {
          setSelectedFiles([]);
          setUploadedAttachments([]);
        },
      };
    },
  };
});

global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-url');
global.URL.revokeObjectURL = jest.fn();

function makeFile(name: string): File {
  return new File([new ArrayBuffer(10)], name, { type: 'image/png' });
}

function expandComposer() {
  fireEvent.focus(screen.getByLabelText('postComposer.contentLabel'));
}

function selectOneFile(container: HTMLElement, name: string) {
  const imageInput = container.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
  fireEvent.change(imageInput, { target: { files: [makeFile(name)] } });
}

describe('PostComposer — media cap survives the upload hook double-count (review fix)', () => {
  beforeEach(() => {
    nextAttachmentId = 0;
  });

  it('lets 10 sequential single-file selections all succeed and reach onPublish with all 10 mediaIds', () => {
    const onPublish = jest.fn();
    const { container } = render(<PostComposer onPublish={onPublish} />);
    expandComposer();

    for (let i = 0; i < 10; i++) {
      selectOneFile(container, `img-${i}.png`);
    }

    fireEvent.click(screen.getByText('publish'));

    expect(onPublish).toHaveBeenCalledTimes(1);
    const mediaIds = onPublish.mock.calls[0][0].mediaIds as string[];
    expect(mediaIds).toHaveLength(10);
    expect(new Set(mediaIds).size).toBe(10);
  });

  it('disables further selection once the real 10-file client cap is hit (cap still holds under the fixed headroom)', () => {
    const { container } = render(<PostComposer onPublish={jest.fn()} />);
    expandComposer();

    for (let i = 0; i < 10; i++) {
      selectOneFile(container, `img-${i}.png`);
    }

    expect(screen.getByLabelText('postComposer.addPhoto')).toBeDisabled();
    expect(screen.getByLabelText('postComposer.addVideo')).toBeDisabled();
  });
});
