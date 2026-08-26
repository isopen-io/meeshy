/**
 * LA COUTURE : du transport jusqu'à l'octet qui décide de la TABLE.
 *
 * `attachmentTransport.test.ts` prouve le tableau passé à un
 * `TusUploadService` MOCKÉ ; `tusUploadService.test.ts` prouve que
 * `forceResumable` route vers `Upload`. Aucun des deux ne prouve que la
 * chaîne `uploadcontext` arrive DANS l'en-tête `Upload-Metadata` — et c'est
 * le seul octet dont dépend la création d'un `PostMedia` plutôt que d'un
 * `MessageAttachment` (`isPostMediaUploadContext` dans
 * `routes/uploads/tus-handler.ts`, consulté avant le premier octet).
 *
 * Ce fichier ne mocke donc PAS `TusUploadService` : il monte le vrai service
 * sous un `tus-js-client` factice, et lit ce que le transport lui a réellement
 * remis.
 */

jest.mock('tus-js-client', () => ({ Upload: jest.fn() }));

jest.mock('@/lib/config', () => ({
  buildApiUrl: jest.fn((path: string) => `https://api.test${path}`),
}));

jest.mock('@/utils/token-utils', () => ({
  createAuthHeaders: jest.fn(() => ({ Authorization: 'Bearer test-token' })),
}));

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: jest.fn(() => 'test-token'),
    getAnonymousSession: jest.fn(() => null),
    getSessionToken: jest.fn(() => null),
  },
}));

jest.mock('@/services/api.service', () => ({
  apiService: { refreshAuthToken: jest.fn() },
}));

import { Upload } from 'tus-js-client';
import { resolveAttachmentTransport } from '@/services/attachmentTransport';

type TusOptions = { metadata?: Record<string, string> };

const instances: Array<{ start: jest.Mock; abort: jest.Mock; findPreviousUploads: jest.Mock; options: TusOptions }> = [];

const makeFile = (name: string, type = 'image/jpeg'): File => new File(['x'.repeat(64)], name, { type });

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.clearAllMocks();
  instances.length = 0;
  (Upload as unknown as jest.Mock).mockImplementation((_file: File, options: TusOptions) => {
    const instance = {
      start: jest.fn(),
      abort: jest.fn(),
      findPreviousUploads: jest.fn().mockResolvedValue([]),
      resumeFromPreviousUpload: jest.fn(),
      options,
    };
    instances.push(instance);
    return instance;
  });
});

describe('transport POST → en-tête Upload-Metadata réellement remis à tus', () => {
  it('porte `uploadcontext` — l’octet qui fait naître un PostMedia', async () => {
    const transport = resolveAttachmentTransport('post');

    void transport.upload([makeFile('photo.jpg')], 'tok', undefined, undefined).catch(() => undefined);
    await flush();

    expect(instances).toHaveLength(1);
    expect(instances[0].options.metadata).toMatchObject({
      filename: 'photo.jpg',
      filetype: 'image/jpeg',
      uploadcontext: 'post',
    });
  });

  it('porte le contexte DEMANDÉ, pas « post » en dur', async () => {
    const transport = resolveAttachmentTransport('story');

    void transport.upload([makeFile('clip.mp4', 'video/mp4')], 'tok', undefined, undefined).catch(() => undefined);
    await flush();

    expect(instances[0].options.metadata?.uploadcontext).toBe('story');
  });

  it('porte la DURÉE mesurée par le navigateur, en chaîne de millisecondes', async () => {
    // Le seul fait que le serveur ne peut pas refaire : un WebM de
    // `MediaRecorder` ne porte pas sa durée dans son en-tête, et sans repli
    // la bulle vocale reste à 0:00. Voir `clientMeasuredMetadata` côté
    // gateway — sa branche de repli n'existe QUE si un `providedMetadata`
    // lui parvient.
    const transport = resolveAttachmentTransport('post');

    void transport
      .upload([makeFile('voice.webm', 'audio/webm')], 'tok', [{ duration: 12340 }], undefined)
      .catch(() => undefined);
    await flush();

    expect(instances[0].options.metadata?.duration).toBe('12340');
  });

  it('n’invente AUCUNE durée quand le composer n’en fournit pas', async () => {
    const transport = resolveAttachmentTransport('post');

    void transport.upload([makeFile('photo.jpg')], 'tok', undefined, undefined).catch(() => undefined);
    await flush();

    expect(instances[0].options.metadata).not.toHaveProperty('duration');
  });

  it('un petit fichier de publication passe QUAND MÊME par tus — jamais par XHR', async () => {
    // `SMALL_FILE_THRESHOLD` (50 Mo) enverrait la quasi-totalité des médias
    // sur `POST /attachments/upload`, une route qui ne connaît aucun
    // `uploadcontext` : c'est le défaut d'origine du lot.
    const xhrSend = jest.fn();
    global.XMLHttpRequest = jest.fn(() => ({
      upload: { addEventListener: jest.fn() },
      addEventListener: jest.fn(),
      open: jest.fn(),
      setRequestHeader: jest.fn(),
      send: xhrSend,
    })) as unknown as typeof XMLHttpRequest;

    const transport = resolveAttachmentTransport('post');

    void transport.upload([makeFile('tiny.jpg')], 'tok', undefined, undefined).catch(() => undefined);
    await flush();

    expect(Upload).toHaveBeenCalledTimes(1);
    expect(xhrSend).not.toHaveBeenCalled();
  });
});
