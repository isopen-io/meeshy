import { AttachmentService } from '@/services/attachmentService';
import {
  MAX_FILES_PER_MESSAGE,
  getSizeLimit,
  getAttachmentType,
  formatFileSize,
} from '@meeshy/shared/types/attachment';

jest.mock('@/lib/config', () => ({
  buildApiUrl: jest.fn((path: string) => `https://api.test${path}`),
}));

jest.mock('@/utils/token-utils', () => ({
  createAuthHeaders: jest.fn(() => ({ Authorization: 'Bearer test-token' })),
}));

jest.mock('@meeshy/shared/types/attachment', () => ({
  __esModule: true,
  getSizeLimit: jest.fn(() => 4294967296),
  getAttachmentType: jest.fn(() => 'document'),
  formatFileSize: jest.fn((bytes: number) => `${bytes} bytes`),
  isAcceptedMimeType: jest.fn(() => true),
  MAX_FILES_PER_MESSAGE: 30,
  MAX_CONCURRENT_UPLOADS: 3,
  SMALL_FILE_THRESHOLD: 50 * 1024 * 1024,
  TUS_CHUNK_SIZE: 10 * 1024 * 1024,
}));

type XhrEventListeners = Record<string, (event?: ProgressEvent) => void>;

const createMockXHR = () => {
  const eventListeners: XhrEventListeners = {};
  const uploadListeners: XhrEventListeners = {};
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

const makeMockFetch = (ok: boolean, body: unknown) =>
  jest.fn().mockResolvedValue({
    ok,
    json: jest.fn().mockResolvedValue(body),
  });

const makeFile = (name: string, size: number, type = 'image/jpeg'): File => {
  const file = new File(['x'.repeat(size)], name, { type });
  return file;
};

describe('AttachmentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    mockXhrInstance = createMockXHR();
    global.XMLHttpRequest = jest.fn(() => mockXhrInstance) as unknown as typeof XMLHttpRequest;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getAttachmentUrl', () => {
    it('returns the API URL for the given attachment id', () => {
      const url = AttachmentService.getAttachmentUrl('abc123');
      expect(url).toBe('https://api.test/attachments/abc123');
    });
  });

  describe('getThumbnailUrl', () => {
    it('returns the thumbnail API URL for the given attachment id', () => {
      const url = AttachmentService.getThumbnailUrl('abc123');
      expect(url).toBe('https://api.test/attachments/abc123/thumbnail');
    });
  });

  describe('validateFile', () => {
    it('returns valid when file size is within limit', () => {
      const file = makeFile('test.jpg', 500);
      const result = AttachmentService.validateFile(file);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('returns invalid when file size exceeds the type limit', () => {
      // image/jpeg → limit is 4 GB (4294967296); fake 5 GB via property override
      const file = makeFile('big.jpg', 1, 'image/jpeg');
      Object.defineProperty(file, 'size', { get: () => 5 * 1024 * 1024 * 1024, configurable: true });
      const result = AttachmentService.validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('File too large');
      expect(result.error).toContain('4 GB'); // real formatFileSize(4294967296) → parseFloat strips trailing zeros
    });

    it('uses the file mime type to determine the size limit', () => {
      // text/plain has a 2 GB limit vs 4 GB for images;
      // a fake 3 GB file should be invalid for text but valid for image
      const threeGb = 3 * 1024 * 1024 * 1024;

      const txtFile = makeFile('doc.txt', 1, 'text/plain');
      Object.defineProperty(txtFile, 'size', { get: () => threeGb, configurable: true });
      expect(AttachmentService.validateFile(txtFile).valid).toBe(false);

      const imgFile = makeFile('photo.jpg', 1, 'image/jpeg');
      Object.defineProperty(imgFile, 'size', { get: () => threeGb, configurable: true });
      expect(AttachmentService.validateFile(imgFile).valid).toBe(true);
    });

    it('returns valid when file size exactly equals the type limit', () => {
      // image/jpeg limit is exactly 4294967296; condition is >, not >=
      const file = makeFile('exact.jpg', 1, 'image/jpeg');
      Object.defineProperty(file, 'size', { get: () => 4294967296, configurable: true });
      const result = AttachmentService.validateFile(file);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateFiles', () => {
    it('returns valid when all files pass and count is within limit', () => {
      const files = [makeFile('a.jpg', 100), makeFile('b.jpg', 100)];
      const result = AttachmentService.validateFiles(files);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns error when files exceed MAX_FILES_PER_MESSAGE', () => {
      const files = Array.from({ length: 31 }, (_, i) =>
        makeFile(`file${i}.jpg`, 100)
      );
      const result = AttachmentService.validateFiles(files);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Maximum'))).toBe(true);
      expect(result.errors.some((e) => e.includes('30'))).toBe(true);
    });

    it('collects per-file errors from validateFile', () => {
      // 5 GB fake image exceeds the 4 GB limit → per-file error with filename
      const file = makeFile('huge.jpg', 1, 'image/jpeg');
      Object.defineProperty(file, 'size', { get: () => 5 * 1024 * 1024 * 1024, configurable: true });
      const result = AttachmentService.validateFiles([file]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('huge.jpg'))).toBe(true);
    });

    it('accumulates both count and per-file errors simultaneously', () => {
      const fiveGb = 5 * 1024 * 1024 * 1024;
      const files = Array.from({ length: 31 }, (_, i) => {
        const f = makeFile(`file${i}.jpg`, 1, 'image/jpeg');
        Object.defineProperty(f, 'size', { get: () => fiveGb, configurable: true });
        return f;
      });
      const result = AttachmentService.validateFiles(files);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    it('returns valid for an empty files array', () => {
      const result = AttachmentService.validateFiles([]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('uploadFiles', () => {
    it('throws when any file has size 0', async () => {
      const emptyFile = makeFile('empty.jpg', 0);
      await expect(
        AttachmentService.uploadFiles([emptyFile])
      ).rejects.toThrow('Cannot upload empty files');
    });

    it('includes the file name in the empty file error', async () => {
      const emptyFile = makeFile('empty-doc.pdf', 0);
      await expect(
        AttachmentService.uploadFiles([emptyFile])
      ).rejects.toThrow('empty-doc.pdf');
    });

    it('throws when a non-File/Blob is passed', async () => {
      const fakeFile = { size: 100, name: 'fake', type: 'image/jpeg' };
      await expect(
        AttachmentService.uploadFiles([fakeFile as unknown as File])
      ).rejects.toThrow('Invalid file at index 0');
    });

    it('throws at the correct index when an invalid file is among valid files', async () => {
      const validFile = makeFile('valid.jpg', 100);
      const fakeFile = { size: 100, name: 'fake', type: 'image/jpeg' };
      await expect(
        AttachmentService.uploadFiles([validFile, fakeFile as unknown as File])
      ).rejects.toThrow('Invalid file at index 1');
    });

    it('opens XHR POST to the upload endpoint', async () => {
      const file = makeFile('photo.jpg', 100);
      const promise = AttachmentService.uploadFiles([file]);

      mockXhrInstance.responseText = JSON.stringify({ success: true, attachments: [] });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await promise;
      expect(mockXhrInstance.open).toHaveBeenCalledWith(
        'POST',
        'https://api.test/attachments/upload'
      );
    });

    it('sets auth headers on the XHR request', async () => {
      const file = makeFile('photo.jpg', 100);
      const promise = AttachmentService.uploadFiles([file]);

      mockXhrInstance.responseText = JSON.stringify({ success: true, attachments: [] });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await promise;
      expect(mockXhrInstance.setRequestHeader).toHaveBeenCalledWith(
        'Authorization',
        'Bearer test-token'
      );
    });

    it('resolves with parsed JSON on 200 response', async () => {
      const file = makeFile('photo.jpg', 100);
      const expected = { success: true, attachments: [{ id: 'att1' }] };
      const promise = AttachmentService.uploadFiles([file]);

      mockXhrInstance.responseText = JSON.stringify(expected);
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      const result = await promise;
      expect(result).toEqual(expected);
    });

    it('resolves on 201 response (within 2xx range)', async () => {
      const file = makeFile('photo.jpg', 100);
      const expected = { success: true, attachments: [] };
      const promise = AttachmentService.uploadFiles([file]);

      mockXhrInstance.responseText = JSON.stringify(expected);
      mockXhrInstance.status = 201;
      mockXhrInstance.triggerEvent('load');

      const result = await promise;
      expect(result).toEqual(expected);
    });

    it('rejects with parse error when response body is not valid JSON', async () => {
      const file = makeFile('photo.jpg', 100);
      const promise = AttachmentService.uploadFiles([file]);

      mockXhrInstance.responseText = 'not-json';
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await expect(promise).rejects.toThrow('Failed to parse response');
    });

    it('rejects with error message from JSON error body on non-2xx response', async () => {
      const file = makeFile('photo.jpg', 100);
      const promise = AttachmentService.uploadFiles([file]);

      mockXhrInstance.responseText = JSON.stringify({ error: 'Unauthorized' });
      mockXhrInstance.status = 401;
      mockXhrInstance.triggerEvent('load');

      await expect(promise).rejects.toThrow('Unauthorized');
    });

    it('falls back to status-based error when error body is not JSON', async () => {
      const file = makeFile('photo.jpg', 100);
      const promise = AttachmentService.uploadFiles([file]);

      mockXhrInstance.responseText = 'Server Error';
      mockXhrInstance.status = 500;
      mockXhrInstance.triggerEvent('load');

      await expect(promise).rejects.toThrow('Upload failed with status 500');
    });

    it('rejects with network error on XHR error event', async () => {
      const file = makeFile('photo.jpg', 100);
      const promise = AttachmentService.uploadFiles([file]);

      mockXhrInstance.triggerEvent('error');

      await expect(promise).rejects.toThrow('Network error during upload');
    });

    it('rejects with abort error on XHR abort event', async () => {
      const file = makeFile('photo.jpg', 100);
      const promise = AttachmentService.uploadFiles([file]);

      mockXhrInstance.triggerEvent('abort');

      await expect(promise).rejects.toThrow('Upload aborted');
    });

    it('rejects with timeout error on XHR timeout event', async () => {
      const file = makeFile('photo.jpg', 100);
      const promise = AttachmentService.uploadFiles([file]);

      mockXhrInstance.triggerEvent('timeout');

      await expect(promise).rejects.toThrow('Upload timeout');
    });

    it('calls onProgress callback when event is lengthComputable', async () => {
      const file = makeFile('photo.jpg', 100);
      const onProgress = jest.fn();
      const promise = AttachmentService.uploadFiles([file], undefined, undefined, onProgress);

      const progressEvent = { lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent;
      mockXhrInstance.triggerUploadEvent('progress', progressEvent);

      mockXhrInstance.responseText = JSON.stringify({ success: true, attachments: [] });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await promise;
      expect(onProgress).toHaveBeenCalledWith(50, 50, 100);
    });

    it('does not call onProgress when event is not lengthComputable', async () => {
      const file = makeFile('photo.jpg', 100);
      const onProgress = jest.fn();
      const promise = AttachmentService.uploadFiles([file], undefined, undefined, onProgress);

      const progressEvent = { lengthComputable: false, loaded: 50, total: 0 } as ProgressEvent;
      mockXhrInstance.triggerUploadEvent('progress', progressEvent);

      mockXhrInstance.responseText = JSON.stringify({ success: true, attachments: [] });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await promise;
      expect(onProgress).not.toHaveBeenCalled();
    });

    it('does not attach progress listener when onProgress is not provided', async () => {
      const file = makeFile('photo.jpg', 100);
      const promise = AttachmentService.uploadFiles([file]);

      mockXhrInstance.responseText = JSON.stringify({ success: true, attachments: [] });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await promise;

      const uploadListenerCalls = (mockXhrInstance.upload.addEventListener as jest.Mock).mock.calls;
      expect(uploadListenerCalls.every(([event]: [string]) => event !== 'progress')).toBe(true);
    });

    it('appends metadata when metadataArray contains entry at index', async () => {
      const file = makeFile('audio.mp3', 100, 'audio/mpeg');
      const metadata = [{ duration: 42, codec: 'mp3' }];
      const appendSpy = jest.spyOn(FormData.prototype, 'append');

      const promise = AttachmentService.uploadFiles([file], undefined, metadata);

      mockXhrInstance.responseText = JSON.stringify({ success: true, attachments: [] });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await promise;
      expect(appendSpy).toHaveBeenCalledWith(
        'metadata_0',
        JSON.stringify(metadata[0])
      );
    });

    it('does not append metadata when metadataArray is undefined', async () => {
      const file = makeFile('audio.mp3', 100, 'audio/mpeg');
      const appendSpy = jest.spyOn(FormData.prototype, 'append');

      const promise = AttachmentService.uploadFiles([file]);

      mockXhrInstance.responseText = JSON.stringify({ success: true, attachments: [] });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await promise;
      expect(appendSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('metadata'),
        expect.anything()
      );
    });

    it('does not append metadata when metadataArray has no entry for that index', async () => {
      const file = makeFile('audio.mp3', 100, 'audio/mpeg');
      const appendSpy = jest.spyOn(FormData.prototype, 'append');

      const promise = AttachmentService.uploadFiles([file], undefined, []);

      mockXhrInstance.responseText = JSON.stringify({ success: true, attachments: [] });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await promise;
      expect(appendSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('metadata'),
        expect.anything()
      );
    });

    it('sets a 10-minute timeout on the XHR', async () => {
      const file = makeFile('photo.jpg', 100);
      const promise = AttachmentService.uploadFiles([file]);

      mockXhrInstance.responseText = JSON.stringify({ success: true, attachments: [] });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await promise;
      expect(mockXhrInstance.timeout).toBe(600000);
    });

    it('sends the formData to XHR', async () => {
      const file = makeFile('photo.jpg', 100);
      const promise = AttachmentService.uploadFiles([file]);

      mockXhrInstance.responseText = JSON.stringify({ success: true, attachments: [] });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await promise;
      expect(mockXhrInstance.send).toHaveBeenCalledWith(expect.any(FormData));
    });

    it('uses token when provided', async () => {
      const { createAuthHeaders } = jest.requireMock('@/utils/token-utils') as {
        createAuthHeaders: jest.Mock;
      };
      const file = makeFile('photo.jpg', 100);
      const promise = AttachmentService.uploadFiles([file], 'my-custom-token');

      mockXhrInstance.responseText = JSON.stringify({ success: true, attachments: [] });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await promise;
      expect(createAuthHeaders).toHaveBeenCalledWith('my-custom-token');
    });

    it('does not call onProgress when XHR progress event is not lengthComputable', async () => {
      const onProgress = jest.fn();
      const file = makeFile('photo.jpg', 100);
      const promise = AttachmentService.uploadFiles([file], undefined, undefined, onProgress);

      const nonComputableEvent = { lengthComputable: false, loaded: 512, total: 0 } as ProgressEvent;
      mockXhrInstance.triggerUploadEvent('progress', nonComputableEvent);

      mockXhrInstance.responseText = JSON.stringify({ success: true, attachments: [] });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await promise;
      expect(onProgress).not.toHaveBeenCalled();
    });

    it('resolves when 200 response uses data.attachments wrapper', async () => {
      const file = makeFile('photo.jpg', 100);
      const expected = { success: true, data: { attachments: [{ id: 'att-from-data' }] } };
      const promise = AttachmentService.uploadFiles([file]);

      mockXhrInstance.responseText = JSON.stringify(expected);
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      const result = await promise;
      expect(result).toEqual(expected);
    });

    it('resolves when 200 response body has no attachments field', async () => {
      const file = makeFile('photo.jpg', 100);
      const promise = AttachmentService.uploadFiles([file]);

      mockXhrInstance.responseText = JSON.stringify({ success: true });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await expect(promise).resolves.toBeDefined();
    });

    it('logs error when response contains attachments with empty IDs', async () => {
      const file = makeFile('photo.jpg', 100);
      const promise = AttachmentService.uploadFiles([file]);

      mockXhrInstance.responseText = JSON.stringify({ success: true, attachments: [{ id: '' }] });
      mockXhrInstance.status = 200;
      mockXhrInstance.triggerEvent('load');

      await promise;
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('ID vide'),
        expect.anything()
      );
    });

    it('rejects with Upload failed when non-2xx JSON response has no error field', async () => {
      const file = makeFile('photo.jpg', 100);
      const promise = AttachmentService.uploadFiles([file]);

      mockXhrInstance.responseText = JSON.stringify({ status: 'fail' });
      mockXhrInstance.status = 422;
      mockXhrInstance.triggerEvent('load');

      await expect(promise).rejects.toThrow('Upload failed');
    });
  });

  describe('uploadText', () => {
    it('resolves with JSON body when response is ok', async () => {
      const body = { success: true, attachment: { id: 'att-text-1' } };
      global.fetch = makeMockFetch(true, body);

      const result = await AttachmentService.uploadText('Hello world');
      expect(result).toEqual(body);
    });

    it('throws when response is not ok and body has error field', async () => {
      global.fetch = makeMockFetch(false, { error: 'Forbidden' });

      await expect(AttachmentService.uploadText('content')).rejects.toThrow('Forbidden');
    });

    it('throws generic message when error body has no error field', async () => {
      global.fetch = makeMockFetch(false, {});

      await expect(AttachmentService.uploadText('content')).rejects.toThrow(
        'Failed to create text attachment'
      );
    });

    it('falls back to Upload failed when error body parsing fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: jest.fn().mockRejectedValue(new Error('parse error')),
      });

      await expect(AttachmentService.uploadText('content')).rejects.toThrow(
        'Upload failed'
      );
    });

    it('sends content as JSON body to the upload-text endpoint', async () => {
      const body = { success: true, attachment: { id: 'txt-1' } };
      global.fetch = makeMockFetch(true, body);

      await AttachmentService.uploadText('my text', 'custom-token');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.test/attachments/upload-text',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ content: 'my text' }),
        })
      );
    });

    it('includes Content-Type application/json header', async () => {
      const body = { success: true, attachment: { id: 'txt-1' } };
      global.fetch = makeMockFetch(true, body);

      await AttachmentService.uploadText('text');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });
  });

  describe('getConversationAttachments', () => {
    it('resolves with attachments list on success', async () => {
      const body = { success: true, attachments: [{ id: 'att1' }] };
      global.fetch = makeMockFetch(true, body);

      const result = await AttachmentService.getConversationAttachments('conv-1', {});
      expect(result).toEqual(body);
    });

    it('throws when response is not ok', async () => {
      global.fetch = makeMockFetch(false, { error: 'Not found' });

      await expect(
        AttachmentService.getConversationAttachments('conv-1', {})
      ).rejects.toThrow('Not found');
    });

    it('throws generic message when error body parsing fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: jest.fn().mockRejectedValue(new Error('parse')),
      });

      await expect(
        AttachmentService.getConversationAttachments('conv-1', {})
      ).rejects.toThrow('Unknown error');
    });

    it('falls back to message field if error field is absent', async () => {
      global.fetch = makeMockFetch(false, { message: 'Forbidden' });

      await expect(
        AttachmentService.getConversationAttachments('conv-1', {})
      ).rejects.toThrow('Forbidden');
    });

    it('appends type param when options.type is set', async () => {
      global.fetch = makeMockFetch(true, { success: true, attachments: [] });

      await AttachmentService.getConversationAttachments('conv-1', { type: 'image' });

      const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(calledUrl).toContain('type=image');
    });

    it('appends limit param when options.limit is set', async () => {
      global.fetch = makeMockFetch(true, { success: true, attachments: [] });

      await AttachmentService.getConversationAttachments('conv-1', { limit: 10 });

      const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(calledUrl).toContain('limit=10');
    });

    it('appends offset param when options.offset is set', async () => {
      global.fetch = makeMockFetch(true, { success: true, attachments: [] });

      await AttachmentService.getConversationAttachments('conv-1', { offset: 20 });

      const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(calledUrl).toContain('offset=20');
    });

    it('omits query params when options are empty', async () => {
      global.fetch = makeMockFetch(true, { success: true, attachments: [] });

      await AttachmentService.getConversationAttachments('conv-1', {});

      const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(calledUrl).not.toContain('type=');
      expect(calledUrl).not.toContain('limit=');
      expect(calledUrl).not.toContain('offset=');
    });

    it('includes conversationId in the request URL', async () => {
      global.fetch = makeMockFetch(true, { success: true, attachments: [] });

      await AttachmentService.getConversationAttachments('conv-xyz', {});

      const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(calledUrl).toContain('conv-xyz');
    });

    it('throws generic fallback when error body has neither error nor message fields', async () => {
      global.fetch = makeMockFetch(false, {});

      await expect(
        AttachmentService.getConversationAttachments('conv-1', {})
      ).rejects.toThrow('Failed to fetch attachments');
    });
  });

  describe('deleteAttachment', () => {
    it('resolves without value when response is ok', async () => {
      global.fetch = makeMockFetch(true, {});

      await expect(
        AttachmentService.deleteAttachment('att-1')
      ).resolves.toBeUndefined();
    });

    it('throws when response is not ok', async () => {
      global.fetch = makeMockFetch(false, {});

      await expect(
        AttachmentService.deleteAttachment('att-1')
      ).rejects.toThrow('Failed to delete attachment');
    });

    it('sends DELETE request to the attachment endpoint', async () => {
      global.fetch = makeMockFetch(true, {});

      await AttachmentService.deleteAttachment('att-42', 'tok');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.test/attachments/att-42',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('includes the attachmentId in the DELETE URL', async () => {
      global.fetch = makeMockFetch(true, {});

      await AttachmentService.deleteAttachment('my-attachment-id');

      const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(calledUrl).toContain('my-attachment-id');
    });
  });
});
