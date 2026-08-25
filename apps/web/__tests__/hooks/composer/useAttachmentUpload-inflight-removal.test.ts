/**
 * Ce que la VIGNETTE dit, et ce qui PART réellement.
 *
 * Deux défauts jumeaux, tous deux nés du fait que le transport POST fonctionne
 * enfin — avant lui, aucun `mediaIds` n'aboutissait, donc rien ne se voyait :
 *
 * 1. RETRAIT EN VOL. `handleRemoveFile` lit `uploadedAttachments[index]` ;
 *    pendant l'upload, `selectedFiles` porte déjà le fichier mais
 *    `uploadedAttachments` est vide. Aucun appel serveur ne partait, la
 *    vignette disparaissait — puis l'arrivée du lot ajoutait TOUT, retiré
 *    compris, et le média RETIRÉ était PUBLIÉ.
 *
 * 2. PROGRESSION. Les clés d'`uploadProgress` portaient sur les fichiers de
 *    l'APPEL ; les surfaces les lisent par index dans `selectedFiles`. Dès la
 *    deuxième sélection, le pourcentage d'un fichier neuf s'affichait sur la
 *    vignette d'un ancien.
 */
import { renderHook, act, waitFor } from '@testing-library/react';

const mockValidate = jest.fn();
const mockUpload = jest.fn();
const mockRemove = jest.fn();
const mockResolveAttachmentTransport = jest.fn();

jest.mock('@/services/attachmentTransport', () => ({
  resolveAttachmentTransport: (...args: unknown[]) => mockResolveAttachmentTransport(...args),
}));

jest.mock('@/services/attachmentService', () => ({
  AttachmentService: {
    uploadFiles: jest.fn(),
    uploadText: jest.fn(),
    deleteAttachment: jest.fn(),
    validateFiles: jest.fn(() => ({ valid: true, errors: [] })),
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

let uid = 0;
const makeFile = (name: string, size = 100, type = 'image/jpeg'): File =>
  new File(['x'.repeat(size)], name, { type, lastModified: ++uid });

const attachmentFor = (file: File, id: string) => ({
  id,
  originalName: file.name,
  mimeType: file.type,
  fileSize: file.size,
});

describe('retrait PENDANT le téléversement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidate.mockReturnValue({ valid: true, errors: [] });
    mockRemove.mockResolvedValue(undefined);
    mockResolveAttachmentTransport.mockReturnValue({
      validate: mockValidate,
      upload: mockUpload,
      remove: mockRemove,
    });
  });

  it('le média retiré EN VOL n’entre jamais dans mediaIds et est RELÂCHÉ côté serveur', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const files = [makeFile('garde.jpg'), makeFile('retire.jpg')];

    mockUpload.mockImplementation(async (uploaded: File[]) => {
      await gate;
      return {
        success: true,
        attachments: uploaded.map((f, i) => attachmentFor(f, `media-${i}`)),
      };
    });

    const { result } = renderHook(() => useAttachmentUpload({ token: 't', uploadContext: 'post' }));

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleFilesSelected(files);
    });
    await waitFor(() => expect(result.current.isUploading).toBe(true));
    await waitFor(() => expect(result.current.selectedFiles).toHaveLength(2));

    // L'utilisateur retire la 2e vignette AVANT que le lot n'arrive.
    await act(async () => {
      await result.current.handleRemoveFile(1);
    });
    expect(result.current.selectedFiles.map((f) => f.name)).toEqual(['garde.jpg']);

    await act(async () => {
      release();
      await pending;
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false));

    // Le retiré n'est PAS publié...
    expect(result.current.uploadedAttachments.map((a) => a.id)).toEqual(['media-0']);
    expect(result.current.selectedFiles.map((f) => f.name)).toEqual(['garde.jpg']);
    // ... et sa ligne serveur ne reste pas orpheline.
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith('media-1', 't'));
  });

  it('la note de retrait ne SURVIT pas à un lot en échec — le même fichier reste re-téléversable', async () => {
    // `settleUploadedBatch` n'efface la note que pour les fichiers APPARIÉS.
    // Un lot qui rejette en bloc n'apparie rien : sans purge, l'objet `File`
    // resterait marqué « retiré » pour toujours, et une nouvelle tentative
    // avec le MÊME fichier serait écartée en silence à son arrivée.
    const file = makeFile('reessaye.jpg');

    let fail!: () => void;
    const gate = new Promise<void>((_resolve, reject) => {
      fail = () => reject(new Error('réseau'));
    });
    mockUpload.mockImplementationOnce(async () => gate);
    const { result } = renderHook(() => useAttachmentUpload({ token: 't', uploadContext: 'post' }));

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleFilesSelected([file]);
    });
    await waitFor(() => expect(result.current.isUploading).toBe(true));
    await act(async () => {
      await result.current.handleRemoveFile(0);
    });
    await act(async () => {
      fail();
      await pending;
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false));

    mockUpload.mockResolvedValue({ success: true, attachments: [attachmentFor(file, 'media-2')] });
    await act(async () => {
      await result.current.handleFilesSelected([file]);
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false));

    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(result.current.uploadedAttachments.map((a) => a.id)).toEqual(['media-2']);
  });

  it('un retrait DÉJÀ téléversé continue de partir tout de suite', async () => {
    const file = makeFile('a.jpg');
    mockUpload.mockResolvedValue({ success: true, attachments: [attachmentFor(file, 'media-1')] });

    const { result } = renderHook(() => useAttachmentUpload({ token: 't', uploadContext: 'post' }));
    await act(async () => {
      await result.current.handleFilesSelected([file]);
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false));

    await act(async () => {
      await result.current.handleRemoveFile(0);
    });

    expect(mockRemove).toHaveBeenCalledWith('media-1', 't');
    expect(result.current.uploadedAttachments).toHaveLength(0);
  });
});

describe('progression — les clés portent sur selectedFiles, pas sur l’appel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidate.mockReturnValue({ valid: true, errors: [] });
    mockRemove.mockResolvedValue(undefined);
    mockResolveAttachmentTransport.mockReturnValue({
      validate: mockValidate,
      upload: mockUpload,
      remove: mockRemove,
    });
  });

  it('une DEUXIÈME sélection écrit sa progression sur SES vignettes, jamais sur les anciennes', async () => {
    mockUpload.mockImplementation(async (uploaded: File[], _t: unknown, _m: unknown, onProgress: any) => {
      uploaded.forEach((_f, i) => onProgress?.(i, 100));
      return { success: true, attachments: uploaded.map((f, i) => attachmentFor(f, `${f.name}-${i}`)) };
    });

    const { result } = renderHook(() => useAttachmentUpload({ token: 't', uploadContext: 'post' }));

    await act(async () => {
      await result.current.handleFilesSelected([makeFile('un.jpg'), makeFile('deux.jpg')]);
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false));

    mockUpload.mockImplementation(async (uploaded: File[], _t: unknown, _m: unknown, onProgress: any) => {
      onProgress?.(0, 42);
      return { success: true, attachments: uploaded.map((f, i) => attachmentFor(f, `${f.name}-${i}`)) };
    });

    await act(async () => {
      await result.current.handleFilesSelected([makeFile('trois.jpg')]);
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false));

    // `trois.jpg` occupe l'index 2 de `selectedFiles` : c'est là que sa
    // progression doit s'écrire, pas sur `un.jpg`.
    expect(result.current.uploadProgress[2]).toBe(42);
    expect(result.current.uploadProgress[0]).toBe(100);
  });

  it('un retrait DÉCALE les clés de progression avec les vignettes', async () => {
    mockUpload.mockImplementation(async (uploaded: File[], _t: unknown, _m: unknown, onProgress: any) => {
      uploaded.forEach((_f, i) => onProgress?.(i, (i + 1) * 10));
      return { success: true, attachments: uploaded.map((f, i) => attachmentFor(f, `media-${i}`)) };
    });

    const { result } = renderHook(() => useAttachmentUpload({ token: 't', uploadContext: 'post' }));

    await act(async () => {
      await result.current.handleFilesSelected([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')]);
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false));
    expect(result.current.uploadProgress).toEqual({ 0: 10, 1: 20, 2: 30 });

    await act(async () => {
      await result.current.handleRemoveFile(0);
    });

    expect(result.current.uploadProgress).toEqual({ 0: 20, 1: 30 });
  });
});
