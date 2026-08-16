/**
 * Parallélisation bornée des uploads, progression par vignette, et conseil
 * actionnable en cas d'échec ("réduisez le nombre de pièces jointes").
 *
 * Contexte : le plafond produit est passé à 199 pièces par message
 * (`MAX_ATTACHMENTS_PER_MESSAGE`). Les lots partaient en séquence — 199
 * fichiers = 20 requêtes l'une après l'autre.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAttachmentUpload, withReduceAttachmentsHint } from '@/hooks/composer/useAttachmentUpload';
import { AttachmentService } from '@/services/attachmentService';
import { MAX_CONCURRENT_UPLOADS } from '@meeshy/shared/types/attachment';

jest.mock('@/services/attachmentService');
jest.mock('@/utils/media-compression', () => ({
  compressMultipleFiles: jest.fn((files) => Promise.resolve(files)),
  needsCompression: jest.fn(() => false),
}));
jest.mock('sonner', () => ({
  toast: { error: jest.fn(), warning: jest.fn(), success: jest.fn(), info: jest.fn() },
}));

const makeFiles = (count: number) =>
  Array.from({ length: count }, (_, i) => new File([`c-${i}`], `file-${i}.txt`, { type: 'text/plain' }));

const attachmentsFor = (files: File[], offset: number) =>
  files.map((f, idx) => ({
    id: `att-${offset + idx}`,
    originalName: f.name,
    mimeType: f.type,
    fileSize: f.size,
    createdAt: new Date().toISOString(),
  }));

describe('useAttachmentUpload — parallélisation bornée', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AttachmentService.validateFiles as jest.Mock).mockReturnValue({ valid: true, errors: [] });
  });

  it('runs batches concurrently, capped at MAX_CONCURRENT_UPLOADS', async () => {
    let inFlight = 0;
    let peak = 0;
    (AttachmentService.uploadFiles as jest.Mock).mockImplementation(async (batch: File[]) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return { success: true, attachments: attachmentsFor(batch, 0) };
    });

    const { result } = renderHook(() => useAttachmentUpload({ token: 't', batchSize: 10 }));

    await act(async () => {
      await result.current.handleFilesSelected(makeFiles(80));
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false), { timeout: 5000 });

    expect(AttachmentService.uploadFiles).toHaveBeenCalledTimes(8);
    // Sans parallélisme le pic vaudrait 1 ; sans borne il vaudrait 8.
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENT_UPLOADS);
  });

  it('keeps uploaded attachments in selection order despite out-of-order completion', async () => {
    // Le premier lot est le plus lent : il finit APRÈS les suivants.
    (AttachmentService.uploadFiles as jest.Mock).mockImplementation(async (batch: File[]) => {
      const first = Number(batch[0].name.replace('file-', '').replace('.txt', ''));
      await new Promise((r) => setTimeout(r, first === 0 ? 30 : 1));
      return { success: true, attachments: attachmentsFor(batch, first) };
    });

    const { result } = renderHook(() => useAttachmentUpload({ token: 't', batchSize: 10 }));

    await act(async () => {
      await result.current.handleFilesSelected(makeFiles(30));
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false), { timeout: 5000 });

    const ids = result.current.uploadedAttachments.map((a) => a.id);
    expect(ids).toHaveLength(30);
    expect(ids[0]).toBe('att-0');
    expect(ids[10]).toBe('att-10');
    expect(ids[20]).toBe('att-20');
  });

  it('reports progress for every file of a batch, not just the first one', async () => {
    (AttachmentService.uploadFiles as jest.Mock).mockImplementation(
      async (batch: File[], _token: unknown, _meta: unknown, onProgress?: (p: number, l: number, t: number) => void) => {
        onProgress?.(50, 50, 100);
        return { success: true, attachments: attachmentsFor(batch, 0) };
      }
    );

    const { result } = renderHook(() => useAttachmentUpload({ token: 't', batchSize: 10 }));

    await act(async () => {
      await result.current.handleFilesSelected(makeFiles(25));
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false), { timeout: 5000 });

    // 25 fichiers → indices 0..24 renseignés (la pastille de chaque vignette
    // lit uploadProgress[indexDuFichier] ; l'indexation par numéro de LOT ne
    // renseignait que 0, 1 et 2).
    for (const index of [0, 5, 9, 10, 19, 24]) {
      expect(result.current.uploadProgress[index]).toBe(50);
    }
  });

  it('reports progress for every file on the single-request path too', async () => {
    (AttachmentService.uploadFiles as jest.Mock).mockImplementation(
      async (batch: File[], _token: unknown, _meta: unknown, onProgress?: (p: number, l: number, t: number) => void) => {
        onProgress?.(75, 75, 100);
        return { success: true, attachments: attachmentsFor(batch, 0) };
      }
    );

    const { result } = renderHook(() => useAttachmentUpload({ token: 't', batchSize: 10 }));

    await act(async () => {
      await result.current.handleFilesSelected(makeFiles(4));
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false), { timeout: 5000 });

    // Ce chemin n'écrivait que l'index 0 : seule la première vignette bougeait.
    expect(result.current.uploadProgress[0]).toBe(75);
    expect(result.current.uploadProgress[3]).toBe(75);
  });

  it('keeps every batch running when one of them fails', async () => {
    (AttachmentService.uploadFiles as jest.Mock).mockImplementation(async (batch: File[]) => {
      const first = Number(batch[0].name.replace('file-', '').replace('.txt', ''));
      if (first === 0) throw new Error('network down');
      return { success: true, attachments: attachmentsFor(batch, first) };
    });

    const { result } = renderHook(() => useAttachmentUpload({ token: 't', batchSize: 10 }));

    await act(async () => {
      await result.current.handleFilesSelected(makeFiles(30));
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false), { timeout: 5000 });

    expect(AttachmentService.uploadFiles).toHaveBeenCalledTimes(3);
    expect(result.current.uploadedAttachments).toHaveLength(20);
  });

  it('tells the user to reduce the attachment count when a batch fails', async () => {
    (AttachmentService.uploadFiles as jest.Mock).mockRejectedValue(new Error('network down'));
    const onUploadError = jest.fn();
    const t = (key: string, opts?: Record<string, unknown>) =>
      key === 'attachmentUploadFailure.reduceCount'
        ? `Réduisez le nombre de pièces jointes (${opts?.count} en cours) et réessayez.`
        : key;

    const { result } = renderHook(() =>
      useAttachmentUpload({ token: 't', batchSize: 10, onUploadError, t })
    );

    await act(async () => {
      await result.current.handleFilesSelected(makeFiles(30));
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false), { timeout: 5000 });

    expect(result.current.uploadError).toContain('Réduisez le nombre de pièces jointes');
    expect(onUploadError).toHaveBeenCalledWith(expect.stringContaining('Réduisez le nombre'));
  });

  it('tells the user to reduce the count on the single-request path too', async () => {
    (AttachmentService.uploadFiles as jest.Mock).mockRejectedValue(new Error('network down'));
    const t = (key: string, opts?: Record<string, unknown>) =>
      key === 'attachmentUploadFailure.reduceCount' ? `Reduce to fewer than ${opts?.count}.` : key;

    const { result } = renderHook(() => useAttachmentUpload({ token: 't', batchSize: 10, t }));

    await act(async () => {
      await result.current.handleFilesSelected(makeFiles(4));
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false), { timeout: 5000 });

    expect(result.current.uploadError).toContain('Reduce to fewer than 4.');
  });
});

describe('withReduceAttachmentsHint', () => {
  const t = (key: string, opts?: Record<string, unknown>) =>
    key === 'attachmentUploadFailure.reduceCount' ? `Reduce (${opts?.count}).` : key;

  it('appends the hint for a multi-attachment failure', () => {
    expect(withReduceAttachmentsHint('Upload failed.', 12, t)).toBe('Upload failed. Reduce (12).');
  });

  it('stays silent for a single attachment — reducing means nothing there', () => {
    expect(withReduceAttachmentsHint('Upload failed.', 1, t)).toBe('Upload failed.');
  });

  it('stays silent when the translator is the identity fallback', () => {
    expect(withReduceAttachmentsHint('Upload failed.', 12, (key: string) => key)).toBe('Upload failed.');
  });

  it('stays silent when the translator returns nothing', () => {
    expect(withReduceAttachmentsHint('Upload failed.', 12, () => '')).toBe('Upload failed.');
  });
});
