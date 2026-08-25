/**
 * TÉMOIN DE NEUTRALITÉ — `useAttachmentUpload` monté SANS `uploadContext`,
 * exactement comme `useComposerState` (le composer de MESSAGE) le monte.
 *
 * Sans ce test, une régression du chemin message serait INVISIBLE : aucune
 * autre suite de ce dépôt ne l'attraperait — `useAttachmentUpload.test.ts`,
 * `-batch.test.ts` et `-parallel.test.ts` mockent `AttachmentService`
 * directement mais ne vérifient jamais que `TusUploadService`/
 * `PostMediaService` restent HORS-JEU sur le chemin par défaut.
 *
 * La mutation qui prouve la morsure : donner à `uploadContext` un défaut
 * `'post'` dans le hook (ou faire rendre `resolveAttachmentTransport(undefined)`
 * un transport post). Les CINQ cas ci-dessous rougissent alors ensemble —
 * c'est le seul test du dépôt qui voit cette régression.
 */
import { renderHook, act, waitFor } from '@testing-library/react';

const mockToastFns = { warning: jest.fn(), error: jest.fn(), success: jest.fn(), info: jest.fn() };
jest.mock('sonner', () => ({
  toast: {
    warning: (...args: unknown[]) => mockToastFns.warning(...args),
    error: (...args: unknown[]) => mockToastFns.error(...args),
    success: (...args: unknown[]) => mockToastFns.success(...args),
    info: (...args: unknown[]) => mockToastFns.info(...args),
  },
}));

const mockServiceFns = {
  uploadFiles: jest.fn(),
  uploadText: jest.fn(),
  deleteAttachment: jest.fn(),
  validateFiles: jest.fn(),
};

jest.mock('@/services/attachmentService', () => ({
  AttachmentService: {
    uploadFiles: (...args: unknown[]) => mockServiceFns.uploadFiles(...args),
    uploadText: (...args: unknown[]) => mockServiceFns.uploadText(...args),
    deleteAttachment: (...args: unknown[]) => mockServiceFns.deleteAttachment(...args),
    validateFiles: (...args: unknown[]) => mockServiceFns.validateFiles(...args),
  },
}));

const mockTusConstruct = jest.fn();
const mockTusUploadFiles = jest.fn();

jest.mock('@/services/tusUploadService', () => ({
  TusUploadService: jest.fn().mockImplementation((token?: string) => {
    mockTusConstruct(token);
    return { onProgress: jest.fn(), uploadFiles: mockTusUploadFiles };
  }),
}));

const mockDeletePendingMedia = jest.fn();
jest.mock('@/services/postMediaService', () => ({
  PostMediaService: { deletePendingMedia: (...args: unknown[]) => mockDeletePendingMedia(...args) },
}));

jest.mock('@/utils/media-compression', () => ({
  needsCompression: jest.fn(() => false),
  compressMultipleFiles: jest.fn((files: File[]) => Promise.resolve(files)),
}));

import { useAttachmentUpload } from '@/hooks/composer/useAttachmentUpload';

const makeFile = (name: string, size = 100, type = 'image/jpeg'): File =>
  new File(['x'.repeat(size)], name, { type });

const attachmentsFor = (files: File[]) =>
  files.map((f, i) => ({
    id: `att-${i}`,
    originalName: f.name,
    mimeType: f.type,
    fileSize: f.size,
    createdAt: new Date().toISOString(),
  }));

describe('useAttachmentUpload — SANS uploadContext (composer de MESSAGE)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockServiceFns.validateFiles.mockReturnValue({ valid: true, errors: [] });
  });

  it('1 — handleFilesSelected appelle AttachmentService.uploadFiles ; TusUploadService n’est jamais construit', async () => {
    mockServiceFns.uploadFiles.mockResolvedValue({ success: true, attachments: attachmentsFor([makeFile('a.jpg')]) });

    const { result } = renderHook(() => useAttachmentUpload({ token: 't' }));
    await act(async () => {
      await result.current.handleFilesSelected([makeFile('a.jpg')]);
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false));

    expect(mockServiceFns.uploadFiles).toHaveBeenCalledTimes(1);
    expect(mockServiceFns.uploadFiles.mock.calls[0][0]).toEqual([expect.any(File)]);
    expect(mockServiceFns.uploadFiles.mock.calls[0][1]).toBe('t');
    expect(mockTusConstruct).not.toHaveBeenCalled();
    expect(mockTusUploadFiles).not.toHaveBeenCalled();
  });

  it('2 — handleRemoveFile appelle AttachmentService.deleteAttachment ; PostMediaService n’est jamais appelé', async () => {
    mockServiceFns.uploadFiles.mockResolvedValue({ success: true, attachments: attachmentsFor([makeFile('a.jpg')]) });
    mockServiceFns.deleteAttachment.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAttachmentUpload({ token: 't' }));
    await act(async () => {
      await result.current.handleFilesSelected([makeFile('a.jpg')]);
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false));

    await act(async () => {
      await result.current.handleRemoveFile(0);
    });

    expect(mockServiceFns.deleteAttachment).toHaveBeenCalledWith('att-0', 't');
    expect(mockDeletePendingMedia).not.toHaveBeenCalled();
  });

  it('3 — 11 fichiers passent, et la validation part SANS plafond explicite (199, pas 10)', async () => {
    const files = Array.from({ length: 11 }, (_, i) => makeFile(`f${i}.jpg`));
    mockServiceFns.uploadFiles.mockResolvedValue({ success: true, attachments: attachmentsFor(files) });

    const { result } = renderHook(() => useAttachmentUpload({ token: 't', batchSize: 20 }));
    await act(async () => {
      await result.current.handleFilesSelected(files);
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false));

    expect(result.current.showAttachmentLimitModal).toBe(false);
    expect(mockServiceFns.uploadFiles).toHaveBeenCalledTimes(1);
    expect(result.current.uploadedAttachments).toHaveLength(11);
    // Le plafond n'est pas mesurable par la sortie (`validateFiles` est
    // mocké VALIDE ici) : ce qui le prouve est l'ARITÉ de l'appel. Le chemin
    // message ne passe AUCUN `maxCount`, donc `AttachmentService.validateFiles`
    // applique son défaut de 199. Un `maxCount` glissé ici ferait rougir.
    expect(mockServiceFns.validateFiles).toHaveBeenCalledWith([...files]);
    expect(mockServiceFns.validateFiles.mock.calls[0]).toHaveLength(1);
  });

  it('4 — handleCreateTextAttachment appelle AttachmentService.uploadText, chemin intouché', async () => {
    mockServiceFns.uploadText.mockResolvedValue({
      success: true,
      attachment: { id: 'text-1', originalName: 'note.txt', mimeType: 'text/plain', fileSize: 4, createdAt: new Date().toISOString() },
    });

    const { result } = renderHook(() => useAttachmentUpload({ token: 't' }));
    await act(async () => {
      await result.current.handleCreateTextAttachment('Hello');
    });

    expect(mockServiceFns.uploadText).toHaveBeenCalledWith('Hello', 't');
    expect(result.current.uploadedAttachments).toHaveLength(1);
  });

  it('5 — 25 fichiers avec batchSize=10 → 3 appels d’AttachmentService.uploadFiles (10/10/5), progression suit le 2e lot', async () => {
    mockServiceFns.uploadFiles.mockImplementation(
      async (batch: File[], _token: unknown, _meta: unknown, onProgress?: (p: number, l: number, t: number) => void) => {
        onProgress?.(60, 60, 100);
        return { success: true, attachments: attachmentsFor(batch) };
      }
    );

    const { result } = renderHook(() => useAttachmentUpload({ token: 't', batchSize: 10 }));
    await act(async () => {
      await result.current.handleFilesSelected(Array.from({ length: 25 }, (_, i) => makeFile(`f${i}.jpg`)));
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false));

    expect(mockServiceFns.uploadFiles).toHaveBeenCalledTimes(3);
    const batchSizes = mockServiceFns.uploadFiles.mock.calls.map((call) => (call[0] as File[]).length);
    expect(batchSizes.sort((a, b) => a - b)).toEqual([5, 10, 10]);
    // Index 12 appartient au 2e lot (fichiers 10..19) — même garantie que
    // `useAttachmentUpload-parallel.test.ts`, rejouée À TRAVERS l'indirection.
    expect(result.current.uploadProgress[12]).toBe(60);
    expect(result.current.uploadedAttachments).toHaveLength(25);
  });
});
