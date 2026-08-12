import { TusUploadService, type QueueProgress } from '@/services/tusUploadService';
import {
  MAX_FILES_PER_MESSAGE,
  SMALL_FILE_THRESHOLD,
  getSizeLimit,
  getAttachmentType,
  formatFileSize,
} from '@meeshy/shared/types/attachment';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';

jest.mock('tus-js-client', () => ({
  Upload: jest.fn(),
}));

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

jest.mock('@meeshy/shared/types/attachment', () => ({
  getSizeLimit: jest.fn(() => 4294967296),
  getAttachmentType: jest.fn(() => 'document'),
  formatFileSize: jest.fn((bytes: number) => `${bytes} bytes`),
  MAX_FILES_PER_MESSAGE: 30,
  MAX_CONCURRENT_UPLOADS: 3,
  SMALL_FILE_THRESHOLD: 50 * 1024 * 1024,
  TUS_CHUNK_SIZE: 10 * 1024 * 1024,
}));

import { Upload } from 'tus-js-client';

type TusCallbacks = {
  onError?: (err: Error) => void;
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void;
  onSuccess?: () => void;
};

let capturedCallbacks: TusCallbacks = {};
let mockUploadInstance: {
  findPreviousUploads: jest.Mock;
  resumeFromPreviousUpload: jest.Mock;
  start: jest.Mock;
  abort: jest.Mock;
  lastResponse: { getBody: () => string } | undefined;
};

// Arrays to capture all instances/callbacks when multiple uploads run concurrently
let mockUploadInstances: typeof mockUploadInstance[] = [];
let allCapturedCallbacks: TusCallbacks[] = [];
// Set before uploadFiles call to control what findPreviousUploads returns for the NEXT Upload()
let nextFindPreviousUploadsResult: unknown[] = [];

const MockUpload = jest.fn().mockImplementation(
  (_file: unknown, options: TusCallbacks) => {
    capturedCallbacks = options;
    allCapturedCallbacks.push(options);
    const findResult = nextFindPreviousUploadsResult;
    nextFindPreviousUploadsResult = [];
    const instance = {
      findPreviousUploads: jest.fn().mockResolvedValue(findResult),
      resumeFromPreviousUpload: jest.fn(),
      start: jest.fn(),
      abort: jest.fn(),
      lastResponse: undefined as { getBody: () => string } | undefined,
    };
    mockUploadInstances.push(instance);
    mockUploadInstance = instance;
    return instance;
  }
);

type XhrEventMap = Record<string, (event?: ProgressEvent) => void>;

const createMockXHR = () => {
  const eventListeners: XhrEventMap = {};
  const uploadListeners: XhrEventMap = {};

  const xhr = {
    upload: {
      addEventListener: jest.fn((event: string, cb: (event?: ProgressEvent) => void) => {
        uploadListeners[event] = cb;
      }),
    },
    addEventListener: jest.fn((event: string, cb: (event?: ProgressEvent) => void) => {
      eventListeners[event] = cb;
    }),
    open: jest.fn(),
    setRequestHeader: jest.fn(),
    send: jest.fn(),
    status: 200,
    responseText: '',
    timeout: 0,
    triggerEvent: (name: string, event?: ProgressEvent) => eventListeners[name]?.(event),
    triggerUploadEvent: (name: string, event: ProgressEvent) => uploadListeners[name]?.(event),
  };
  return xhr;
};

type MockXHR = ReturnType<typeof createMockXHR>;

let mockXhrInstance: MockXHR;

const makeFile = (name: string, sizeBytes: number, type = 'image/jpeg'): File =>
  new File(['x'.repeat(sizeBytes)], name, { type });

const makeSmallFile = (name = 'small.jpg', type = 'image/jpeg'): File =>
  makeFile(name, 1024, type);

const makeLargeFile = (name = 'large.mp4', type = 'video/mp4'): File => {
  const file = new File(['a'], name, { type });
  Object.defineProperty(file, 'size', { get: () => SMALL_FILE_THRESHOLD + 1, configurable: true });
  return file;
};

const makeAttachmentResponse = (id = 'att-1'): UploadedAttachmentResponse => ({
  id,
  messageId: 'msg-1',
  fileName: 'file.jpg',
  originalName: 'file.jpg',
  mimeType: 'image/jpeg',
  fileSize: 1024,
  fileUrl: `https://cdn.test/${id}`,
  uploadedBy: 'user-1',
  isAnonymous: false,
  createdAt: new Date().toISOString(),
});

describe('TusUploadService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    (Upload as jest.Mock).mockImplementation(MockUpload);
    capturedCallbacks = {};
    mockUploadInstances = [];
    allCapturedCallbacks = [];
    nextFindPreviousUploadsResult = [];

    mockXhrInstance = createMockXHR();
    global.XMLHttpRequest = jest.fn(() => mockXhrInstance) as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('setToken', () => {
    it('updates the token used for subsequent uploads', () => {
      const service = new TusUploadService();
      service.setToken('new-token');
      const { createAuthHeaders } = jest.requireMock('@/utils/token-utils') as {
        createAuthHeaders: jest.Mock;
      };
      createAuthHeaders.mockClear();

      const file = makeSmallFile();
      service.uploadFiles([file]).catch(() => undefined);

      expect(createAuthHeaders).toHaveBeenCalled();
    });
  });

  describe('onProgress', () => {
    it('registers a progress callback that is invoked during upload', async () => {
      const service = new TusUploadService();
      const progressCallback = jest.fn();
      service.onProgress(progressCallback);

      const file = makeSmallFile();
      const promise = service.uploadFiles([file]);

      const response = { data: { attachments: [makeAttachmentResponse()] } };
      mockXhrInstance.responseText = JSON.stringify(response);
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await promise;
      expect(progressCallback).toHaveBeenCalled();
    });

    it('does not throw when no progress callback is registered', async () => {
      const service = new TusUploadService();
      const file = makeSmallFile();
      const promise = service.uploadFiles([file]);

      const response = { data: { attachments: [makeAttachmentResponse()] } };
      mockXhrInstance.responseText = JSON.stringify(response);
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await expect(promise).resolves.toBeDefined();
    });
  });

  describe('uploadFiles — validation', () => {
    it('throws when files count exceeds MAX_FILES_PER_MESSAGE', async () => {
      const service = new TusUploadService();
      const files = Array.from({ length: MAX_FILES_PER_MESSAGE + 1 }, (_, i) =>
        makeSmallFile(`file${i}.jpg`)
      );

      await expect(service.uploadFiles(files)).rejects.toThrow(
        `Maximum ${MAX_FILES_PER_MESSAGE} files allowed per message`
      );
    });

    it('throws when a file exceeds the size limit', async () => {
      // image/jpeg limit is 4 GB; override size to 5 GB to trigger validation
      const service = new TusUploadService();
      const file = makeFile('huge.jpg', 1, 'image/jpeg');
      Object.defineProperty(file, 'size', { get: () => 5 * 1024 * 1024 * 1024, configurable: true });

      await expect(service.uploadFiles([file])).rejects.toThrow('huge.jpg');
    });

    it('applies per-mime-type size limits during validation', async () => {
      // text/plain limit is 2 GB; a 3 GB text file must be rejected
      const threeGb = 3 * 1024 * 1024 * 1024;
      const service = new TusUploadService();
      const textFile = makeFile('notes.txt', 1, 'text/plain');
      Object.defineProperty(textFile, 'size', { get: () => threeGb, configurable: true });

      await expect(service.uploadFiles([textFile])).rejects.toThrow('notes.txt');
    });
  });

  describe('uploadFiles — small files (direct upload via XHR)', () => {
    it('resolves with uploaded attachment for a small file', async () => {
      const service = new TusUploadService();
      const file = makeSmallFile();
      const att = makeAttachmentResponse();

      const promise = service.uploadFiles([file]);

      mockXhrInstance.responseText = JSON.stringify({ data: { attachments: [att] } });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      const results = await promise;
      expect(results[0]).toMatchObject({ id: att.id });
    });

    it('resolves using attachments at root level when data wrapper is absent', async () => {
      const service = new TusUploadService();
      const file = makeSmallFile();
      const att = makeAttachmentResponse();

      const promise = service.uploadFiles([file]);

      mockXhrInstance.responseText = JSON.stringify({ attachments: [att] });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      const results = await promise;
      expect(results[0]).toMatchObject({ id: att.id });
    });

    it('rejects when response has no attachments', async () => {
      const service = new TusUploadService();
      const file = makeSmallFile();
      const promise = service.uploadFiles([file]);

      mockXhrInstance.responseText = JSON.stringify({ data: { attachments: [] } });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await expect(promise).rejects.toThrow('No attachment returned');
    });

    it('rejects on non-2xx status', async () => {
      const service = new TusUploadService();
      const file = makeSmallFile();
      const promise = service.uploadFiles([file]);

      mockXhrInstance.responseText = 'error';
      mockXhrInstance.status = 500;
      mockXhrInstance.triggerEvent('load');

      await expect(promise).rejects.toThrow('Upload failed with status 500');
    });

    it('rejects on XHR network error', async () => {
      const service = new TusUploadService();
      const file = makeSmallFile();
      const promise = service.uploadFiles([file]);

      mockXhrInstance.triggerEvent('error');

      await expect(promise).rejects.toThrow('Network error');
    });

    it('rejects on XHR timeout', async () => {
      const service = new TusUploadService();
      const file = makeSmallFile();
      const promise = service.uploadFiles([file]);

      mockXhrInstance.triggerEvent('timeout');

      await expect(promise).rejects.toThrow('Upload timeout');
    });

    it('opens XHR POST to the upload endpoint', async () => {
      const service = new TusUploadService();
      const file = makeSmallFile();
      const promise = service.uploadFiles([file]);

      mockXhrInstance.responseText = JSON.stringify({ data: { attachments: [makeAttachmentResponse()] } });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await promise;
      expect(mockXhrInstance.open).toHaveBeenCalledWith('POST', 'https://api.test/attachments/upload');
    });

    it('appends metadata to FormData when provided', async () => {
      const service = new TusUploadService();
      const file = makeSmallFile();
      const metadata = { duration: '42', codec: 'aac' };
      const appendSpy = jest.spyOn(FormData.prototype, 'append');

      const promise = service.uploadFiles([file], [metadata]);

      mockXhrInstance.responseText = JSON.stringify({ data: { attachments: [makeAttachmentResponse()] } });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await promise;
      expect(appendSpy).toHaveBeenCalledWith('metadata_0', JSON.stringify(metadata));
    });

    it('does not append metadata when metadataArray is not provided', async () => {
      const service = new TusUploadService();
      const file = makeSmallFile();
      const appendSpy = jest.spyOn(FormData.prototype, 'append');

      const promise = service.uploadFiles([file]);

      mockXhrInstance.responseText = JSON.stringify({ data: { attachments: [makeAttachmentResponse()] } });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await promise;
      expect(appendSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('metadata'),
        expect.anything()
      );
    });

    it('reports upload progress when event is lengthComputable', async () => {
      const service = new TusUploadService();
      const progressCallback = jest.fn();
      service.onProgress(progressCallback);

      const file = makeSmallFile();
      const promise = service.uploadFiles([file]);

      const progressEvent = { lengthComputable: true, loaded: 512, total: 1024 } as ProgressEvent;
      mockXhrInstance.triggerUploadEvent('progress', progressEvent);

      mockXhrInstance.responseText = JSON.stringify({ data: { attachments: [makeAttachmentResponse()] } });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await promise;
      const calls = progressCallback.mock.calls as QueueProgress[][];
      const uploadingCall = calls.find((args) => {
        const progress = args[0];
        return progress.files.some((f) => f.status === 'uploading' && f.percentage === 50);
      });
      expect(uploadingCall).toBeDefined();
    });

    it('does not report progress when event is not lengthComputable', async () => {
      const service = new TusUploadService();
      const progressCallback = jest.fn();
      service.onProgress(progressCallback);

      const file = makeSmallFile();
      const promise = service.uploadFiles([file]);

      const progressEvent = { lengthComputable: false, loaded: 512, total: 0 } as ProgressEvent;
      mockXhrInstance.triggerUploadEvent('progress', progressEvent);

      mockXhrInstance.responseText = JSON.stringify({ data: { attachments: [makeAttachmentResponse()] } });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await promise;
      const calls = progressCallback.mock.calls as QueueProgress[][];
      const duringProgressCall = calls.find((args) => {
        const p = args[0];
        return p.files.some((f) => f.percentage === 50);
      });
      expect(duringProgressCall).toBeUndefined();
    });

    it('rejects with No attachment returned when response body has no attachment fields', async () => {
      const service = new TusUploadService();
      const file = makeSmallFile();
      const promise = service.uploadFiles([file]);

      mockXhrInstance.responseText = JSON.stringify({});
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await expect(promise).rejects.toThrow('No attachment returned');
    });
  });

  describe('uploadFiles — large files (tus upload)', () => {
    it('creates a tus Upload instance for files above the threshold', async () => {
      const service = new TusUploadService();
      const file = makeLargeFile();

      service.uploadFiles([file]).catch(() => undefined);

      await Promise.resolve();

      expect(Upload).toHaveBeenCalledWith(
        file,
        expect.objectContaining({
          endpoint: 'https://api.test/uploads',
        })
      );
    });

    it('resolves when tus onSuccess fires with a valid attachment in response body', async () => {
      const service = new TusUploadService();
      const file = makeLargeFile();
      const att = makeAttachmentResponse();

      const promise = service.uploadFiles([file]);

      await Promise.resolve();
      await Promise.resolve();

      mockUploadInstance.lastResponse = {
        getBody: () => JSON.stringify({ data: { attachment: att } }),
      };
      capturedCallbacks.onSuccess?.();

      const results = await promise;
      expect(results[0]).toMatchObject({ id: att.id });
    });

    it('rejects when tus onSuccess fires but response has no attachment', async () => {
      const service = new TusUploadService();
      const file = makeLargeFile();

      const promise = service.uploadFiles([file]);

      await Promise.resolve();
      await Promise.resolve();

      mockUploadInstance.lastResponse = {
        getBody: () => JSON.stringify({ data: {} }),
      };
      capturedCallbacks.onSuccess?.();

      await expect(promise).rejects.toThrow('Upload completed but no attachment data received');
    });

    it('rejects when tus onSuccess fires but response body is absent', async () => {
      const service = new TusUploadService();
      const file = makeLargeFile();

      const promise = service.uploadFiles([file]);

      await Promise.resolve();
      await Promise.resolve();

      mockUploadInstance.lastResponse = undefined;
      capturedCallbacks.onSuccess?.();

      await expect(promise).rejects.toThrow('Upload completed but no attachment data received');
    });

    it('rejects when tus onSuccess fires but response body is invalid JSON', async () => {
      const service = new TusUploadService();
      const file = makeLargeFile();

      const promise = service.uploadFiles([file]);

      await Promise.resolve();
      await Promise.resolve();

      mockUploadInstance.lastResponse = {
        getBody: () => 'not-json',
      };
      capturedCallbacks.onSuccess?.();

      await expect(promise).rejects.toThrow('Upload completed but no attachment data received');
    });

    it('rejects when tus onError fires', async () => {
      const service = new TusUploadService();
      const file = makeLargeFile();

      const promise = service.uploadFiles([file]);

      await Promise.resolve();
      await Promise.resolve();

      capturedCallbacks.onError?.(new Error('Tus upload failed'));

      await expect(promise).rejects.toThrow('Tus upload failed');
    });

    it('updates progress during tus onProgress', async () => {
      const service = new TusUploadService();
      const progressCallback = jest.fn();
      service.onProgress(progressCallback);

      const file = makeLargeFile();
      service.uploadFiles([file]).catch(() => undefined);

      await Promise.resolve();
      await Promise.resolve();

      capturedCallbacks.onProgress?.(512 * 1024, 1024 * 1024);

      const calls = progressCallback.mock.calls as QueueProgress[][];
      const uploadingCall = calls.find((args) => {
        const p = args[0];
        return p.files.some((f) => f.status === 'uploading' && f.percentage === 50);
      });
      expect(uploadingCall).toBeDefined();
    });

    it('resumes from previous upload when findPreviousUploads returns entries', async () => {
      const service = new TusUploadService();
      const file = makeLargeFile();
      const previousUpload = { uploadUrl: 'https://api.test/uploads/prev' };

      // Set before uploadFiles so MockUpload captures it when new Upload() is called
      nextFindPreviousUploadsResult = [previousUpload];
      service.uploadFiles([file]).catch(() => undefined);

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockUploadInstance.resumeFromPreviousUpload).toHaveBeenCalledWith(previousUpload);
    });

    it('starts upload directly without resuming when no previous uploads exist', async () => {
      const service = new TusUploadService();
      const file = makeLargeFile();

      mockUploadInstance.findPreviousUploads.mockResolvedValue([]);

      service.uploadFiles([file]).catch(() => undefined);

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockUploadInstance.resumeFromPreviousUpload).not.toHaveBeenCalled();
      expect(mockUploadInstance.start).toHaveBeenCalled();
    });

    it('includes X-Session-Token as isAnonymous metadata when header is present', async () => {
      const { createAuthHeaders } = jest.requireMock('@/utils/token-utils') as {
        createAuthHeaders: jest.Mock;
      };
      createAuthHeaders.mockReturnValue({ 'X-Session-Token': 'anon-session-id' });

      const service = new TusUploadService();
      const file = makeLargeFile();

      service.uploadFiles([file]).catch(() => undefined);

      await Promise.resolve();

      const tusOptions = (Upload as jest.Mock).mock.calls[0][1] as {
        metadata: Record<string, string>;
      };
      expect(tusOptions.metadata.isAnonymous).toBe('true');
      expect(tusOptions.metadata.userId).toBe('anon-session-id');
    });

    it('does not include isAnonymous metadata when X-Session-Token is absent', async () => {
      const { createAuthHeaders } = jest.requireMock('@/utils/token-utils') as {
        createAuthHeaders: jest.Mock;
      };
      createAuthHeaders.mockReturnValue({ Authorization: 'Bearer jwt-token' });

      const service = new TusUploadService();
      const file = makeLargeFile();

      service.uploadFiles([file]).catch(() => undefined);

      await Promise.resolve();

      const tusOptions = (Upload as jest.Mock).mock.calls[0][1] as {
        metadata: Record<string, string>;
      };
      expect(tusOptions.metadata.isAnonymous).toBeUndefined();
    });

    it('includes custom metadata in tus upload metadata', async () => {
      const service = new TusUploadService();
      const file = makeLargeFile();
      const extraMetadata = { duration: '120', codec: 'h264' };

      service.uploadFiles([file], [extraMetadata]).catch(() => undefined);

      await Promise.resolve();

      const tusOptions = (Upload as jest.Mock).mock.calls[0][1] as {
        metadata: Record<string, string>;
      };
      expect(tusOptions.metadata.duration).toBe('120');
      expect(tusOptions.metadata.codec).toBe('h264');
    });

    it('uses application/octet-stream as filetype when file has no mime type', async () => {
      const service = new TusUploadService();
      // Empty type string → file.type || 'application/octet-stream'
      const file = makeLargeFile('binary.bin', '');
      service.uploadFiles([file]).catch(() => undefined);

      await Promise.resolve();

      const tusOptions = (Upload as jest.Mock).mock.calls[0][1] as {
        metadata: Record<string, string>;
      };
      expect(tusOptions.metadata.filetype).toBe('application/octet-stream');
    });

    it('falls back to Upload failed message when tus onError fires with no message', async () => {
      const service = new TusUploadService();
      const file = makeLargeFile();

      const promise = service.uploadFiles([file]);

      await Promise.resolve();
      await Promise.resolve();

      capturedCallbacks.onError?.(new Error(''));

      await expect(promise).rejects.toThrow('Upload failed');
    });
  });

  describe('pauseAll', () => {
    it('aborts all active uploads and marks them as paused', async () => {
      const service = new TusUploadService();
      const file = makeLargeFile();

      service.uploadFiles([file]).catch(() => undefined);

      await Promise.resolve();
      await Promise.resolve();

      service.pauseAll();

      expect(mockUploadInstance.abort).toHaveBeenCalledWith(true);

      const progress = service.getProgress();
      expect(progress.files.some((f) => f.status === 'paused')).toBe(true);
    });

    it('emits progress after pausing', async () => {
      const service = new TusUploadService();
      const progressCallback = jest.fn();
      service.onProgress(progressCallback);

      const file = makeLargeFile();
      service.uploadFiles([file]).catch(() => undefined);

      await Promise.resolve();
      await Promise.resolve();

      progressCallback.mockClear();
      service.pauseAll();

      expect(progressCallback).toHaveBeenCalled();
    });
  });

  describe('resumeAll', () => {
    it('restarts paused uploads', async () => {
      const service = new TusUploadService();
      const file = makeLargeFile();

      service.uploadFiles([file]).catch(() => undefined);

      await Promise.resolve();
      await Promise.resolve();

      service.pauseAll();
      mockUploadInstance.start.mockClear();

      service.resumeAll();

      expect(mockUploadInstance.start).toHaveBeenCalled();
    });

    it('does not restart uploads that are not paused', async () => {
      const service = new TusUploadService();
      const file = makeLargeFile();

      service.uploadFiles([file]).catch(() => undefined);

      await Promise.resolve();
      await Promise.resolve();

      mockUploadInstance.start.mockClear();
      service.resumeAll();

      expect(mockUploadInstance.start).not.toHaveBeenCalled();
    });

    it('marks resumed uploads as uploading', async () => {
      const service = new TusUploadService();
      const file = makeLargeFile();

      service.uploadFiles([file]).catch(() => undefined);

      await Promise.resolve();
      await Promise.resolve();

      service.pauseAll();
      service.resumeAll();

      const progress = service.getProgress();
      expect(progress.files.some((f) => f.status === 'uploading')).toBe(true);
    });
  });

  describe('abort', () => {
    it('cancels an active upload by fileId', async () => {
      const service = new TusUploadService();
      const file = makeLargeFile();

      service.uploadFiles([file]).catch(() => undefined);

      await Promise.resolve();
      await Promise.resolve();

      const progress = service.getProgress();
      const fileId = progress.files[0]?.fileId;
      if (!fileId) throw new Error('No fileId found');

      service.abort(fileId);

      expect(mockUploadInstance.abort).toHaveBeenCalledWith(true);
    });

    it('marks the aborted file as error with Cancelled message', async () => {
      const service = new TusUploadService();
      const file = makeLargeFile();

      service.uploadFiles([file]).catch(() => undefined);

      await Promise.resolve();
      await Promise.resolve();

      const fileId = service.getProgress().files[0]?.fileId;
      if (!fileId) throw new Error('No fileId found');

      service.abort(fileId);

      const progress = service.getProgress();
      const abortedFile = progress.files.find((f) => f.fileId === fileId);
      expect(abortedFile?.status).toBe('error');
      expect(abortedFile?.error).toBe('Cancelled');
    });

    it('does nothing when fileId does not match any active upload', () => {
      const service = new TusUploadService();
      expect(() => service.abort('non-existent-id')).not.toThrow();
    });

    it('emits progress after abort', async () => {
      const service = new TusUploadService();
      const progressCallback = jest.fn();
      service.onProgress(progressCallback);

      const file = makeLargeFile();
      service.uploadFiles([file]).catch(() => undefined);

      await Promise.resolve();
      await Promise.resolve();

      const fileId = service.getProgress().files[0]?.fileId;
      if (!fileId) throw new Error('No fileId found');

      progressCallback.mockClear();
      service.abort(fileId);

      expect(progressCallback).toHaveBeenCalled();
    });
  });

  describe('getProgress', () => {
    it('returns zero totals when no files have been uploaded', () => {
      const service = new TusUploadService();
      const progress = service.getProgress();

      expect(progress.totalFiles).toBe(0);
      expect(progress.completedFiles).toBe(0);
      expect(progress.totalBytes).toBe(0);
      expect(progress.uploadedBytes).toBe(0);
      expect(progress.globalPercentage).toBe(0);
    });

    it('returns globalPercentage of 0 when totalBytes is 0', () => {
      const service = new TusUploadService();
      const progress = service.getProgress();

      expect(progress.globalPercentage).toBe(0);
    });

    it('computes global percentage correctly when bytes are tracked', async () => {
      const service = new TusUploadService();
      const file = makeLargeFile();

      service.uploadFiles([file]).catch(() => undefined);

      await Promise.resolve();
      await Promise.resolve();

      // fileSize = SMALL_FILE_THRESHOLD + 1; pass half uploaded vs full file size
      // so uploadedBytes/totalBytes = 0.5 → globalPercentage = 50
      const fileSize = SMALL_FILE_THRESHOLD + 1;
      capturedCallbacks.onProgress?.(Math.floor(fileSize / 2), fileSize);

      const progress = service.getProgress();
      expect(progress.globalPercentage).toBe(50);
    });

    it('reflects queued state initially', () => {
      const service = new TusUploadService();
      const files = [makeSmallFile('a.jpg'), makeSmallFile('b.jpg'), makeSmallFile('c.jpg'), makeSmallFile('d.jpg')];

      // Fire-and-forget: we only check the synchronous state before uploads complete
      service.uploadFiles(files).catch(() => undefined);

      const progress = service.getProgress();
      expect(progress.totalFiles).toBe(4);
    });

    it('increments completedFiles when a file completes', async () => {
      const service = new TusUploadService();
      const file = makeSmallFile();

      const promise = service.uploadFiles([file]);

      mockXhrInstance.responseText = JSON.stringify({ data: { attachments: [makeAttachmentResponse()] } });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await promise;

      const progress = service.getProgress();
      expect(progress.completedFiles).toBe(1);
    });
  });

  describe('emitProgress — callback and no-callback branches', () => {
    it('does not throw when onProgressCallback is not set', async () => {
      const service = new TusUploadService();
      const file = makeSmallFile();

      const promise = service.uploadFiles([file]);

      mockXhrInstance.responseText = JSON.stringify({ data: { attachments: [makeAttachmentResponse()] } });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await expect(promise).resolves.toBeDefined();
    });

    it('calls onProgressCallback with correct shape', async () => {
      const service = new TusUploadService();
      const progressCallback = jest.fn();
      service.onProgress(progressCallback);

      const file = makeSmallFile();
      const promise = service.uploadFiles([file]);

      mockXhrInstance.responseText = JSON.stringify({ data: { attachments: [makeAttachmentResponse()] } });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await promise;

      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          files: expect.any(Array),
          totalFiles: expect.any(Number),
          completedFiles: expect.any(Number),
          totalBytes: expect.any(Number),
          uploadedBytes: expect.any(Number),
          globalPercentage: expect.any(Number),
        })
      );
    });

    it('emits 0 percentage via callback when no files have been tracked', () => {
      const service = new TusUploadService();
      const progressCallback = jest.fn();
      service.onProgress(progressCallback);
      // pauseAll on an empty service triggers emitProgress with empty progress map → totalBytes = 0
      service.pauseAll();
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({ globalPercentage: 0 })
      );
    });
  });

  describe('queue concurrency (processQueue)', () => {
    it('processes up to MAX_CONCURRENT_UPLOADS files at a time', () => {
      const service = new TusUploadService();
      // Large files use TUS protocol and properly track activeUploads for concurrency
      const files = Array.from({ length: 5 }, (_, i) => makeLargeFile(`f${i}.mp4`));

      service.uploadFiles(files).catch(() => undefined);

      // Only MAX_CONCURRENT_UPLOADS (3) TUS Upload instances should be created immediately
      expect((Upload as jest.Mock).mock.calls.length).toBeLessThanOrEqual(3);
      expect((Upload as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    });

    it('starts next queued upload after one completes', async () => {
      const service = new TusUploadService();
      // 4 large files: 3 start (fills MAX_CONCURRENT_UPLOADS = 3), 4th queues
      const files = Array.from({ length: 4 }, (_, i) => makeLargeFile(`f${i}.mp4`));

      service.uploadFiles(files).catch(() => undefined);

      await Promise.resolve(); // let processQueue/startTusUpload run synchronously

      expect((Upload as jest.Mock).mock.calls.length).toBe(3);

      // Complete the first upload → processQueue fires → 4th starts
      mockUploadInstances[0].lastResponse = {
        getBody: () => JSON.stringify({ data: { attachment: makeAttachmentResponse('att-1') } }),
      };
      allCapturedCallbacks[0]!.onSuccess?.();

      expect((Upload as jest.Mock).mock.calls.length).toBe(4);
    });
  });
});
