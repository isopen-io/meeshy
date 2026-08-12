import {
  isImageMimeType,
  isAudioMimeType,
  isVideoMimeType,
  isTextMimeType,
  isDocumentMimeType,
  isCodeMimeType,
  isAcceptedMimeType,
  getAttachmentType,
  getSizeLimit,
  formatFileSize,
  UPLOAD_LIMITS,
  MAX_FILES_PER_MESSAGE,
  MAX_CONCURRENT_UPLOADS,
  TUS_CHUNK_SIZE,
  SMALL_FILE_THRESHOLD,
  ACCEPTED_MIME_TYPES,
} from '../../types/attachment.js';

describe('UPLOAD_LIMITS constants', () => {
  it('IMAGE is 4GB', () => expect(UPLOAD_LIMITS.IMAGE).toBe(4294967296));
  it('TEXT is 2GB', () => expect(UPLOAD_LIMITS.TEXT).toBe(2147483648));
  it('CODE is 2GB', () => expect(UPLOAD_LIMITS.CODE).toBe(2147483648));
  it('MAX_FILES_PER_MESSAGE is 30', () => expect(MAX_FILES_PER_MESSAGE).toBe(30));
  it('MAX_CONCURRENT_UPLOADS is 3', () => expect(MAX_CONCURRENT_UPLOADS).toBe(3));
  it('TUS_CHUNK_SIZE is 10MB', () => expect(TUS_CHUNK_SIZE).toBe(10 * 1024 * 1024));
  it('SMALL_FILE_THRESHOLD is 50MB', () => expect(SMALL_FILE_THRESHOLD).toBe(50 * 1024 * 1024));
});

describe('ACCEPTED_MIME_TYPES constants', () => {
  it('IMAGE includes standard image types', () => {
    expect(ACCEPTED_MIME_TYPES.IMAGE).toContain('image/jpeg');
    expect(ACCEPTED_MIME_TYPES.IMAGE).toContain('image/webp');
  });
  it('AUDIO includes audio/webm', () => {
    expect(ACCEPTED_MIME_TYPES.AUDIO).toContain('audio/webm');
  });
  it('VIDEO includes video/mp4', () => {
    expect(ACCEPTED_MIME_TYPES.VIDEO).toContain('video/mp4');
  });
  it('CODE includes application/json', () => {
    expect(ACCEPTED_MIME_TYPES.CODE).toContain('application/json');
  });
});

describe('isImageMimeType', () => {
  it.each(['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'])(
    'returns true for %s',
    (mimeType) => expect(isImageMimeType(mimeType)).toBe(true),
  );

  it.each(['audio/mp3', 'video/mp4', 'application/pdf', 'text/plain', 'image/svg+xml', ''])(
    'returns false for %s',
    (mimeType) => expect(isImageMimeType(mimeType)).toBe(false),
  );
});

describe('isAudioMimeType', () => {
  it.each([
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg',
    'audio/webm', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac',
  ])('returns true for %s', (mimeType) => expect(isAudioMimeType(mimeType)).toBe(true));

  it('strips codec params before checking (audio/webm;codecs=opus → audio/webm)', () => {
    expect(isAudioMimeType('audio/webm;codecs=opus')).toBe(true);
  });

  it('strips whitespace after codec stripping', () => {
    expect(isAudioMimeType('audio/webm ; codecs=opus')).toBe(true);
  });

  it.each(['image/jpeg', 'video/mp4', 'audio/flac', 'audio/x-wav', ''])(
    'returns false for %s',
    (mimeType) => expect(isAudioMimeType(mimeType)).toBe(false),
  );

  it('falls back to original when split returns empty string (mimeType starts with ;)', () => {
    // split(';')[0] = '' (falsy) → falls back to ';codecs=opus' → not in AUDIO list
    expect(isAudioMimeType(';codecs=opus')).toBe(false);
  });
});

describe('isVideoMimeType', () => {
  it.each(['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'])(
    'returns true for %s',
    (mimeType) => expect(isVideoMimeType(mimeType)).toBe(true),
  );

  it('strips codec params (video/webm;codecs=vp8 → video/webm)', () => {
    expect(isVideoMimeType('video/webm;codecs=vp8')).toBe(true);
  });

  it('strips whitespace after codec stripping', () => {
    expect(isVideoMimeType('video/mp4 ; codec=h264')).toBe(true);
  });

  it.each(['audio/mp4', 'image/webp', 'video/avi', ''])(
    'returns false for %s',
    (mimeType) => expect(isVideoMimeType(mimeType)).toBe(false),
  );

  it('falls back to original when split returns empty string', () => {
    expect(isVideoMimeType(';codec=h264')).toBe(false);
  });
});

describe('isTextMimeType', () => {
  it('returns true for text/plain', () => expect(isTextMimeType('text/plain')).toBe(true));

  it.each(['text/html', 'text/markdown', 'text/javascript', 'text/xml', ''])(
    'returns false for %s',
    (mimeType) => expect(isTextMimeType(mimeType)).toBe(false),
  );
});

describe('isDocumentMimeType', () => {
  it.each([
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/x-zip-compressed',
  ])('returns true for %s', (mimeType) => expect(isDocumentMimeType(mimeType)).toBe(true));

  it.each(['application/json', 'text/html', 'image/pdf', ''])(
    'returns false for %s',
    (mimeType) => expect(isDocumentMimeType(mimeType)).toBe(false),
  );
});

describe('isCodeMimeType', () => {
  it.each([
    'text/markdown', 'text/x-markdown',
    'text/javascript', 'application/javascript', 'application/x-javascript',
    'text/typescript', 'application/typescript', 'text/x-typescript',
    'text/x-python', 'application/json', 'text/x-yaml', 'text/yaml',
    'text/html', 'text/css', 'text/xml',
  ])('returns true for %s', (mimeType) => expect(isCodeMimeType(mimeType)).toBe(true));

  it.each(['image/jpeg', 'audio/mp3', 'video/mp4', 'text/plain', ''])(
    'returns false for %s',
    (mimeType) => expect(isCodeMimeType(mimeType)).toBe(false),
  );
});

describe('isAcceptedMimeType', () => {
  it('returns true for an image MIME type', () => expect(isAcceptedMimeType('image/jpeg')).toBe(true));
  it('returns true for an audio MIME type', () => expect(isAcceptedMimeType('audio/mp3')).toBe(true));
  it('returns true for a video MIME type', () => expect(isAcceptedMimeType('video/mp4')).toBe(true));
  it('returns true for a text MIME type', () => expect(isAcceptedMimeType('text/plain')).toBe(true));
  it('returns true for a document MIME type', () => expect(isAcceptedMimeType('application/pdf')).toBe(true));
  it('returns true for a code MIME type', () => expect(isAcceptedMimeType('application/json')).toBe(true));

  it.each(['audio/flac', 'video/avi', 'model/gltf+json', ''])(
    'returns false for %s',
    (mimeType) => expect(isAcceptedMimeType(mimeType)).toBe(false),
  );
});

describe('getAttachmentType — MIME-based detection (priority 1)', () => {
  it('detects image from MIME type', () => {
    expect(getAttachmentType('image/png')).toBe('image');
  });

  it('detects audio from MIME type', () => {
    expect(getAttachmentType('audio/mpeg')).toBe('audio');
  });

  it('detects audio from MIME type with codec params', () => {
    expect(getAttachmentType('audio/webm;codecs=opus')).toBe('audio');
  });

  it('detects video from MIME type', () => {
    expect(getAttachmentType('video/mp4')).toBe('video');
  });

  it('detects video from MIME type with codec params', () => {
    expect(getAttachmentType('video/webm;codecs=vp9')).toBe('video');
  });

  it('detects text from MIME type', () => {
    expect(getAttachmentType('text/plain')).toBe('text');
  });

  it('detects code from MIME type (application/json)', () => {
    expect(getAttachmentType('application/json')).toBe('code');
  });

  it('falls through to document default for non-matched MIME type (e.g. application/pdf)', () => {
    // getAttachmentType does not call isDocumentMimeType; documents are the fallthrough default
    expect(getAttachmentType('application/pdf')).toBe('document');
  });

  it('MIME detection takes priority over filename', () => {
    expect(getAttachmentType('image/png', 'file.mp3')).toBe('image');
  });
});

describe('getAttachmentType — extension-based detection (priority 2, MIME unknown)', () => {
  const UNKNOWN = 'application/octet-stream';

  it('detects code from .py extension', () => {
    expect(getAttachmentType(UNKNOWN, 'script.py')).toBe('code');
  });

  it('detects code from .ts extension', () => {
    expect(getAttachmentType(UNKNOWN, 'module.ts')).toBe('code');
  });

  it('detects code from .js extension', () => {
    expect(getAttachmentType(UNKNOWN, 'index.js')).toBe('code');
  });

  it('detects code from .rs (Rust) extension', () => {
    expect(getAttachmentType(UNKNOWN, 'main.rs')).toBe('code');
  });

  it('detects code from .go extension', () => {
    expect(getAttachmentType(UNKNOWN, 'main.go')).toBe('code');
  });

  it('detects code from .md (markdown) extension', () => {
    expect(getAttachmentType(UNKNOWN, 'README.md')).toBe('code');
  });

  it('detects code from .yaml extension', () => {
    expect(getAttachmentType(UNKNOWN, 'config.yaml')).toBe('code');
  });

  it('detects code from .json extension', () => {
    expect(getAttachmentType(UNKNOWN, 'package.json')).toBe('code');
  });

  it('detects code from .sql extension', () => {
    expect(getAttachmentType(UNKNOWN, 'schema.sql')).toBe('code');
  });

  it('detects text from .txt extension', () => {
    expect(getAttachmentType(UNKNOWN, 'notes.txt')).toBe('text');
  });

  it('detects text from .csv extension', () => {
    expect(getAttachmentType(UNKNOWN, 'data.csv')).toBe('text');
  });

  it('detects text from .log extension', () => {
    expect(getAttachmentType(UNKNOWN, 'app.log')).toBe('text');
  });

  it('is case-insensitive for extension matching', () => {
    expect(getAttachmentType(UNKNOWN, 'SCRIPT.PY')).toBe('code');
    expect(getAttachmentType(UNKNOWN, 'DATA.CSV')).toBe('text');
  });

  it('handles filename with directory path (uses last segment)', () => {
    expect(getAttachmentType(UNKNOWN, 'path/to/script.py')).toBe('code');
  });

  it('handles filename with trailing slash (filenameBase becomes empty → document)', () => {
    expect(getAttachmentType(UNKNOWN, 'path/')).toBe('document');
  });

  it('defaults to document for unknown extension', () => {
    expect(getAttachmentType(UNKNOWN, 'file.bin')).toBe('document');
  });

  it('defaults to document when no filename and unknown MIME', () => {
    expect(getAttachmentType(UNKNOWN)).toBe('document');
  });
});

describe('getAttachmentType — special code files (no extension or exact name)', () => {
  const UNKNOWN = 'application/octet-stream';

  it('detects dockerfile by exact name', () => {
    expect(getAttachmentType(UNKNOWN, 'dockerfile')).toBe('code');
  });

  it('detects Dockerfile (case-insensitive)', () => {
    expect(getAttachmentType(UNKNOWN, 'Dockerfile')).toBe('code');
  });

  it('detects makefile by exact name', () => {
    expect(getAttachmentType(UNKNOWN, 'makefile')).toBe('code');
  });

  it('detects Makefile (case-insensitive)', () => {
    expect(getAttachmentType(UNKNOWN, 'Makefile')).toBe('code');
  });

  it('detects .gitignore by exact name', () => {
    expect(getAttachmentType(UNKNOWN, '.gitignore')).toBe('code');
  });

  it('detects .dockerignore by exact name', () => {
    expect(getAttachmentType(UNKNOWN, '.dockerignore')).toBe('code');
  });

  it('detects tsconfig.json by exact name (via endsWith match)', () => {
    expect(getAttachmentType(UNKNOWN, 'tsconfig.json')).toBe('code');
  });

  it('detects .env by exact name', () => {
    expect(getAttachmentType(UNKNOWN, '.env')).toBe('code');
  });

  it('detects .env.local by exact name', () => {
    expect(getAttachmentType(UNKNOWN, '.env.local')).toBe('code');
  });

  it('detects .eslintrc by exact name', () => {
    expect(getAttachmentType(UNKNOWN, '.eslintrc')).toBe('code');
  });

  it('detects .prettierrc by exact name', () => {
    expect(getAttachmentType(UNKNOWN, '.prettierrc')).toBe('code');
  });

  it('detects file ending in special name (endsWith path)', () => {
    // filenameBase 'my-dockerfile' !== 'dockerfile' but endsWith('dockerfile') → code
    expect(getAttachmentType(UNKNOWN, 'my-dockerfile')).toBe('code');
  });
});

describe('getSizeLimit', () => {
  it('returns IMAGE limit for image type', () => {
    expect(getSizeLimit('image')).toBe(UPLOAD_LIMITS.IMAGE);
  });

  it('returns AUDIO limit for audio type', () => {
    expect(getSizeLimit('audio')).toBe(UPLOAD_LIMITS.AUDIO);
  });

  it('returns VIDEO limit for video type', () => {
    expect(getSizeLimit('video')).toBe(UPLOAD_LIMITS.VIDEO);
  });

  it('returns TEXT limit for text type', () => {
    expect(getSizeLimit('text')).toBe(UPLOAD_LIMITS.TEXT);
  });

  it('returns CODE limit for code type', () => {
    expect(getSizeLimit('code')).toBe(UPLOAD_LIMITS.CODE);
  });

  it('returns DOCUMENT limit for document type', () => {
    expect(getSizeLimit('document')).toBe(UPLOAD_LIMITS.DOCUMENT);
  });

  it('returns DOCUMENT limit for unrecognized type (exhaustive-check default)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(getSizeLimit('unknown' as any)).toBe(UPLOAD_LIMITS.DOCUMENT);
  });
});

describe('formatFileSize', () => {
  it('returns "0 B" for 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('returns bytes for values under 1024', () => {
    expect(formatFileSize(1)).toBe('1 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('returns KB for values in the KB range', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(1024 * 1024 - 1)).toBe('1024 KB');
  });

  it('returns MB for values in the MB range', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1 MB');
    expect(formatFileSize(10 * 1024 * 1024)).toBe('10 MB');
  });

  it('returns GB for values in the GB range', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
    expect(formatFileSize(4 * 1024 * 1024 * 1024)).toBe('4 GB');
  });

  it('returns TB for values in the TB range', () => {
    expect(formatFileSize(1024 ** 4)).toBe('1 TB');
  });

  it('clamps to TB for very large values (no PB unit)', () => {
    // 1 PB = 1024 TB; Math.min(i, 4) caps at TB
    expect(formatFileSize(1024 ** 5)).toBe('1024 TB');
  });

  it('defaults to 2 significant decimals (trailing zeros stripped)', () => {
    // 1587 / 1024 = 1.5498...; toFixed(2) → "1.55"
    expect(formatFileSize(1587)).toBe('1.55 KB');
  });

  it('honours the decimals option', () => {
    expect(formatFileSize(1587, { decimals: 1 })).toBe('1.5 KB');
    expect(formatFileSize(1587, { decimals: 0 })).toBe('2 KB');
  });

  it('ignores decimals for exact and zero values', () => {
    expect(formatFileSize(0, { decimals: 1 })).toBe('0 B');
    expect(formatFileSize(1024, { decimals: 1 })).toBe('1 KB');
  });
});
