/**
 * `attachmentTransport` — le port derrière lequel `useAttachmentUpload` cesse
 * de parler directement à `AttachmentService`. Deux implémentations, CÔTE À
 * CÔTE dans ce fichier pour qu'on ne puisse pas les lire séparément :
 *
 * - `undefined` (aucun contexte) ⇒ transport MESSAGE — un enrobage LITTÉRAL
 *   des appels d'aujourd'hui (`AttachmentService`) ;
 * - un contexte de publication (`'post' | 'story' | 'status' | 'comment'`)
 *   ⇒ transport POST MEDIA — force le chemin résumable (`TusUploadService`,
 *   seul créateur de `PostMedia` côté upload) et supprime via
 *   `PostMediaService`.
 */

const mockConstructTus = jest.fn();
const mockTusUploadFiles = jest.fn();
const mockTusUploadFilesSettled = jest.fn();
const mockTusOnProgress = jest.fn();

jest.mock('@/services/tusUploadService', () => ({
  TusUploadService: jest.fn().mockImplementation((token?: string) => {
    mockConstructTus(token);
    return {
      onProgress: mockTusOnProgress,
      uploadFiles: mockTusUploadFiles,
      uploadFilesSettled: mockTusUploadFilesSettled,
    };
  }),
}));

jest.mock('@/services/postMediaService', () => ({
  PostMediaService: {
    deletePendingMedia: jest.fn(),
  },
}));

import { AttachmentService } from '@/services/attachmentService';
import { TusUploadService } from '@/services/tusUploadService';
import { PostMediaService } from '@/services/postMediaService';
import { resolveAttachmentTransport } from '@/services/attachmentTransport';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';

const makeFile = (name: string, size = 100, type = 'image/jpeg'): File =>
  new File(['x'.repeat(size)], name, { type });

/** Laisse se résoudre les imports dynamiques du transport POST. */
const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const makeAttachment = (id: string): UploadedAttachmentResponse => ({
  id,
  messageId: 'msg-1',
  fileName: `${id}.jpg`,
  originalName: `${id}.jpg`,
  mimeType: 'image/jpeg',
  fileSize: 100,
  fileUrl: `https://cdn.test/${id}.jpg`,
  uploadedBy: 'user-1',
  isAnonymous: false,
  createdAt: new Date().toISOString(),
});

describe('resolveAttachmentTransport(undefined) — transport MESSAGE', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('upload() appelle AttachmentService.uploadFiles et rien d’autre', async () => {
    const uploadFilesSpy = jest
      .spyOn(AttachmentService, 'uploadFiles')
      .mockResolvedValue({ success: true, attachments: [makeAttachment('att-1')] });

    const transport = resolveAttachmentTransport(undefined);
    const files = [makeFile('a.jpg')];
    const result = await transport.upload(files, 'tok', undefined, undefined);

    expect(uploadFilesSpy).toHaveBeenCalledTimes(1);
    const [calledFiles, calledToken, calledMetadata] = uploadFilesSpy.mock.calls[0];
    expect(calledFiles).toBe(files);
    expect(calledToken).toBe('tok');
    expect(calledMetadata).toBeUndefined();
    expect(result.attachments[0].id).toBe('att-1');
    expect(TusUploadService).not.toHaveBeenCalled();

    uploadFilesSpy.mockRestore();
  });

  it('upload() fait suivre la progression à CHAQUE fichier — comportement inchangé', async () => {
    const uploadFilesSpy = jest
      .spyOn(AttachmentService, 'uploadFiles')
      .mockImplementation(async (files, _token, _meta, onProgress) => {
        onProgress?.(50, 50, 100);
        return { success: true, attachments: files.map((f) => makeAttachment(f.name)) };
      });

    const transport = resolveAttachmentTransport(undefined);
    const files = [makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')];
    const onProgress = jest.fn();
    await transport.upload(files, 'tok', undefined, onProgress);

    expect(onProgress).toHaveBeenCalledWith(0, 50);
    expect(onProgress).toHaveBeenCalledWith(1, 50);
    expect(onProgress).toHaveBeenCalledWith(2, 50);

    uploadFilesSpy.mockRestore();
  });

  it('remove() appelle AttachmentService.deleteAttachment', async () => {
    const deleteSpy = jest.spyOn(AttachmentService, 'deleteAttachment').mockResolvedValue(undefined);

    const transport = resolveAttachmentTransport(undefined);
    await transport.remove('att-1', 'tok');

    expect(deleteSpy).toHaveBeenCalledWith('att-1', 'tok');
    expect(PostMediaService.deletePendingMedia).not.toHaveBeenCalled();

    deleteSpy.mockRestore();
  });

  it('createTextAttachment() délègue à AttachmentService.uploadText', async () => {
    const uploadTextSpy = jest
      .spyOn(AttachmentService, 'uploadText')
      .mockResolvedValue({ success: true, attachment: makeAttachment('att-txt') } as never);

    const transport = resolveAttachmentTransport(undefined);
    const attachment = await transport.createTextAttachment('Bonjour', 'tok');

    expect(uploadTextSpy).toHaveBeenCalledWith('Bonjour', 'tok');
    expect(attachment?.id).toBe('att-txt');

    uploadTextSpy.mockRestore();
  });

  it('validate() accepte une sélection de 11 fichiers (plafond message = 199)', () => {
    const transport = resolveAttachmentTransport(undefined);
    const files = Array.from({ length: 11 }, (_, i) => makeFile(`f${i}.jpg`));
    expect(transport.validate(files).valid).toBe(true);
  });
});

describe("resolveAttachmentTransport('post') — transport POST MEDIA", () => {
  const uploadedMedia = makeAttachment('media-1');

  beforeEach(() => {
    jest.clearAllMocks();
    mockTusUploadFiles.mockResolvedValue([uploadedMedia]);
    mockTusUploadFilesSettled.mockResolvedValue([{ status: 'fulfilled', value: uploadedMedia }]);
  });

  it('upload() construit un TusUploadService, force le résumable, tague chaque fichier — jamais AttachmentService.uploadFiles', async () => {
    const uploadFilesSpy = jest.spyOn(AttachmentService, 'uploadFiles');

    const transport = resolveAttachmentTransport('post');
    const files = [makeFile('a.jpg'), makeFile('b.jpg')];
    const result = await transport.upload(files, 'tok', undefined, undefined);

    expect(mockConstructTus).toHaveBeenCalledWith('tok');
    expect(mockTusUploadFilesSettled).toHaveBeenCalledTimes(1);
    const [calledFiles, calledMetadata, calledOptions] = mockTusUploadFilesSettled.mock.calls[0];
    expect(calledFiles).toEqual(files);
    expect(calledMetadata).toEqual([
      { uploadcontext: 'post' },
      { uploadcontext: 'post' },
    ]);
    expect(calledOptions).toMatchObject({ forceResumable: true });
    expect(result).toEqual({ success: true, attachments: [uploadedMedia] });
    expect(uploadFilesSpy).not.toHaveBeenCalled();

    uploadFilesSpy.mockRestore();
  });

  it('upload() relaie la progression PAR FICHIER — granularité que le message ne peut pas rendre', async () => {
    const transport = resolveAttachmentTransport('post');
    const onProgress = jest.fn();

    const uploadPromise = transport.upload([makeFile('a.jpg'), makeFile('b.jpg')], 'tok', undefined, onProgress);
    // Le module TUS est chargé PARESSEUSEMENT (il ne doit pas peser sur le
    // chunk du composer de messages) : laisser l'import se résoudre avant
    // d'observer l'abonnement. Ce qui compte reste l'ORDRE — l'abonnement
    // précède `uploadFilesSettled`, donc aucun événement ne peut être manqué.
    await flushMicrotasks();

    // Le transport doit s'être abonné avant que l'upload ne parte.
    expect(mockTusOnProgress).toHaveBeenCalledTimes(1);
    const progressCallback = mockTusOnProgress.mock.calls[0][0] as (q: unknown) => void;
    progressCallback({
      files: [
        { percentage: 30 },
        { percentage: 70 },
      ],
    });

    await uploadPromise;

    expect(onProgress).toHaveBeenCalledWith(0, 30);
    expect(onProgress).toHaveBeenCalledWith(1, 70);
  });

  it('upload() RETIENT les fichiers réussis quand un voisin échoue', async () => {
    // `Promise.all` faisait perdre à l'utilisateur les 9 fichiers qui avaient
    // abouti dès que le 10e échouait — et leurs 9 lignes `PostMedia`
    // devenaient des orphelins, leurs ids étant partis avec le rejet. Le
    // transport MESSAGE a toujours toléré l'échec partiel
    // (`pairUploads` du hook, qui apparie par `originalName`) ;
    // il faut donc lui rendre la MÊME forme de réponse : `success: true`
    // avec un tableau plus COURT.
    mockTusUploadFilesSettled.mockResolvedValue([
      { status: 'fulfilled', value: makeAttachment('media-ok') },
      { status: 'rejected', reason: new Error('boom') },
    ]);

    const transport = resolveAttachmentTransport('post');
    const result = await transport.upload([makeFile('ok.jpg'), makeFile('ko.jpg')], 'tok', undefined, undefined);

    expect(result.success).toBe(true);
    expect(result.attachments.map((a) => a.id)).toEqual(['media-ok']);
  });

  it('upload() propage un refus PRÉ-VOL — rien n’est parti, la sélection entière tombe', async () => {
    mockTusUploadFilesSettled.mockRejectedValue(new Error('Maximum 10 files allowed per message'));

    const transport = resolveAttachmentTransport('post');

    await expect(
      transport.upload([makeFile('a.jpg')], 'tok', undefined, undefined),
    ).rejects.toThrow('Maximum 10 files allowed per message');
  });

  it('remove() appelle PostMediaService.deletePendingMedia, jamais AttachmentService.deleteAttachment', async () => {
    const deleteSpy = jest.spyOn(AttachmentService, 'deleteAttachment');

    const transport = resolveAttachmentTransport('post');
    await transport.remove('media-1', 'tok');

    expect(PostMediaService.deletePendingMedia).toHaveBeenCalledWith('media-1', 'tok');
    expect(deleteSpy).not.toHaveBeenCalled();

    deleteSpy.mockRestore();
  });

  it('createTextAttachment() REFUSE — il créerait un MessageAttachment irréclamable', async () => {
    // `AttachmentService.uploadText` crée un `MessageAttachment`. Son id
    // entrerait dans `uploadedAttachments`, donc dans `mediaIds`, où
    // `claimableMediaWhere` ne le trouverait JAMAIS : pièce jointe disparue en
    // silence à la publication, et un `handleRemoveFile` qui rend 404 (la
    // route de relâchement ne connaît que `PostMedia`). Le COUPLE créer /
    // détruire doit rester du même côté du port.
    const uploadTextSpy = jest.spyOn(AttachmentService, 'uploadText');

    const transport = resolveAttachmentTransport('post');

    await expect(transport.createTextAttachment('Bonjour', 'tok')).rejects.toThrow(
      /publication/i,
    );
    expect(uploadTextSpy).not.toHaveBeenCalled();

    uploadTextSpy.mockRestore();
  });

  it('validate() refuse 11 fichiers (plafond post = MAX_POST_MEDIA = 10)', () => {
    const transport = resolveAttachmentTransport('post');
    const files = Array.from({ length: 11 }, (_, i) => makeFile(`f${i}.jpg`));
    const result = transport.validate(files);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('10'))).toBe(true);
  });

  it('validate() accepte exactement MAX_POST_MEDIA fichiers', () => {
    const transport = resolveAttachmentTransport('post');
    const files = Array.from({ length: 10 }, (_, i) => makeFile(`f${i}.jpg`));
    expect(transport.validate(files).valid).toBe(true);
  });
});
