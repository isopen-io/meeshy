/**
 * `useAttachmentUpload({ uploadContext: 'post' })` — le composer de
 * publication doit transiter par le transport POST MEDIA
 * (`attachmentTransport.ts`), jamais par `AttachmentService` directement.
 *
 * Jumeau de `useAttachmentUpload-transport-neutrality.test.ts`, qui prouve
 * l'INVERSE : monté SANS `uploadContext`, rien ne doit changer.
 */
import { renderHook, act, waitFor } from '@testing-library/react';

const mockValidate = jest.fn();
const mockUpload = jest.fn();
const mockRemove = jest.fn();
const mockCreateTextAttachment = jest.fn();
const mockResolveAttachmentTransport = jest.fn();

jest.mock('@/services/attachmentTransport', () => ({
  resolveAttachmentTransport: (...args: unknown[]) => mockResolveAttachmentTransport(...args),
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

jest.mock('@/utils/media-compression', () => ({
  needsCompression: jest.fn(() => false),
  compressMultipleFiles: jest.fn((files: File[]) => Promise.resolve(files)),
}));

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), warning: jest.fn(), success: jest.fn(), info: jest.fn() },
}));

import { useAttachmentUpload } from '@/hooks/composer/useAttachmentUpload';

const makeFile = (name: string, size = 100, type = 'image/jpeg'): File =>
  new File(['x'.repeat(size)], name, { type });

describe("useAttachmentUpload({ uploadContext: 'post' })", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidate.mockReturnValue({ valid: true, errors: [] });
    mockUpload.mockResolvedValue({ success: true, attachments: [] });
    mockRemove.mockResolvedValue(undefined);
    mockCreateTextAttachment.mockResolvedValue(undefined);
    mockResolveAttachmentTransport.mockReturnValue({
      validate: mockValidate,
      upload: mockUpload,
      remove: mockRemove,
      createTextAttachment: mockCreateTextAttachment,
    });
  });

  it('résout le transport avec le contexte demandé et passe par lui, jamais par AttachmentService.uploadFiles', async () => {
    mockUpload.mockResolvedValue({
      success: true,
      attachments: [{ id: 'media-1', originalName: 'a.jpg', mimeType: 'image/jpeg', fileSize: 100, createdAt: new Date().toISOString() }],
    });

    const { result } = renderHook(() => useAttachmentUpload({ token: 't', uploadContext: 'post' }));

    await act(async () => {
      await result.current.handleFilesSelected([makeFile('a.jpg')]);
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false));

    expect(mockResolveAttachmentTransport).toHaveBeenCalledWith('post');
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockServiceFns.uploadFiles).not.toHaveBeenCalled();
    expect(result.current.uploadedAttachments).toHaveLength(1);
  });

  it('handleRemoveFile passe par le transport post et retire la vignette', async () => {
    mockUpload.mockResolvedValue({
      success: true,
      attachments: [{ id: 'media-1', originalName: 'a.jpg', mimeType: 'image/jpeg', fileSize: 100, createdAt: new Date().toISOString() }],
    });

    const { result } = renderHook(() => useAttachmentUpload({ token: 't', uploadContext: 'post' }));

    await act(async () => {
      await result.current.handleFilesSelected([makeFile('a.jpg')]);
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false));
    expect(result.current.selectedFiles).toHaveLength(1);

    await act(async () => {
      await result.current.handleRemoveFile(0);
    });

    expect(mockRemove).toHaveBeenCalledWith('media-1', 't');
    expect(mockServiceFns.deleteAttachment).not.toHaveBeenCalled();
    expect(result.current.selectedFiles).toHaveLength(0);
    expect(result.current.uploadedAttachments).toHaveLength(0);
  });

  it('ne casse pas sur une réponse TUS sans createdAt — deux sélections du même fichier restent dédupliquées à une entrée', async () => {
    // Écart mesuré (plan §3) : l'enrobage TUS ne porte pas `createdAt`. La
    // déduplication tient par `selectedFiles` (nom+taille+lastModified), pas
    // par la signature d'`uploadedAttachments` — elle doit tenir MÊME quand
    // `createdAt` est absent, pas seulement quand il vaut une date valide.
    mockUpload.mockResolvedValue({
      success: true,
      attachments: [{ id: 'media-1', originalName: 'a.jpg', mimeType: 'image/jpeg', fileSize: 4 }],
    });

    const file = makeFile('a.jpg', 4);
    const { result } = renderHook(() => useAttachmentUpload({ token: 't', uploadContext: 'post' }));

    await act(async () => {
      await result.current.handleFilesSelected([file]);
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false));

    await act(async () => {
      await result.current.handleFilesSelected([file]);
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false));

    expect(result.current.selectedFiles).toHaveLength(1);
    expect(result.current.uploadedAttachments).toHaveLength(1);
  });

  it("uploadProgress[1] reçoit le pourcentage du DEUXIÈME fichier — granularité que TUS rend", async () => {
    mockUpload.mockImplementation(async (files: File[], _token, _meta, onProgress) => {
      onProgress?.(0, 30);
      onProgress?.(1, 70);
      return {
        success: true,
        attachments: files.map((f, i) => ({ id: `media-${i}`, originalName: f.name, mimeType: f.type, fileSize: f.size })),
      };
    });

    const { result } = renderHook(() => useAttachmentUpload({ token: 't', uploadContext: 'post' }));

    await act(async () => {
      await result.current.handleFilesSelected([makeFile('a.jpg'), makeFile('b.jpg')]);
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false));

    expect(result.current.uploadProgress[0]).toBe(30);
    expect(result.current.uploadProgress[1]).toBe(70);
  });

  it('handleCreateTextAttachment passe par le TRANSPORT, jamais par AttachmentService.uploadText', async () => {
    // Le COUPLE créer/détruire vivait de part et d'autre du port :
    // `uploadText` créait un `MessageAttachment` (irréclamable par
    // `mediaIds`) pendant que `handleRemoveFile` le cherchait dans la table
    // `PostMedia`. Latent — aucun composer de publication ne l'appelle encore
    // — mais armé, dans un hook documenté comme neutre par contexte.
    const { result } = renderHook(() => useAttachmentUpload({ token: 't', uploadContext: 'post' }));

    await act(async () => {
      await result.current.handleCreateTextAttachment('Bonjour');
    });

    expect(mockCreateTextAttachment).toHaveBeenCalledWith('Bonjour', 't');
    expect(mockServiceFns.uploadText).not.toHaveBeenCalled();
  });

  it('un refus du transport ne laisse AUCUNE vignette fantôme', async () => {
    mockCreateTextAttachment.mockRejectedValue(new Error('not supported'));

    const { result } = renderHook(() => useAttachmentUpload({ token: 't', uploadContext: 'post' }));

    await act(async () => {
      await result.current.handleCreateTextAttachment('Bonjour');
    });

    expect(result.current.selectedFiles).toHaveLength(0);
    expect(result.current.uploadedAttachments).toHaveLength(0);
  });
});