/**
 * Unit tests for NotificationService attachment helpers:
 * formatSingleAttachmentLabelI18n, buildMessageNotificationBodyI18n
 *
 * Also exercises private helpers formatDuration, formatFileSize,
 * extractExtension, formatDocumentLabel, formatDocumentBadge,
 * buildAttachmentBadges via the public API.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    }),
  },
  notificationLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  securityLogger: {
    logAttempt: jest.fn(), logViolation: jest.fn(), logSuccess: jest.fn(),
  },
}));

jest.mock('../../../../services/PushNotificationService', () => ({
  PushNotificationService: jest.fn(),
}));

jest.mock('../../../../services/EmailService', () => ({
  EmailService: jest.fn(),
}));

import {
  formatSingleAttachmentLabelI18n,
  buildMessageNotificationBodyI18n,
} from '../../../../services/notifications/NotificationService';

// ── formatSingleAttachmentLabelI18n ───────────────────────────────────────────

describe('formatSingleAttachmentLabelI18n — audio', () => {
  it('returns audio label with duration and fileSize', () => {
    const result = formatSingleAttachmentLabelI18n('en', {
      type: 'audio',
      duration: 5000,
      fileSize: 512,
    });
    // formatDuration(5000) = "0:05", formatFileSize(512) = "512 o"
    expect(result).toContain('0:05');
    expect(result).toContain('512 o');
    expect(result).toContain('·');
  });

  it('returns audio label with duration only (minutes)', () => {
    const result = formatSingleAttachmentLabelI18n('en', {
      type: 'audio',
      duration: 90000, // 1min 30s
    });
    expect(result).toContain('1:30');
  });

  it('returns audio label with fileSize in Ko range', () => {
    const result = formatSingleAttachmentLabelI18n('fr', {
      type: 'audio',
      fileSize: 2048, // 2 Ko
    });
    expect(result).toContain('2 Ko');
  });

  it('returns audio label with fileSize in Mo range', () => {
    const result = formatSingleAttachmentLabelI18n('en', {
      type: 'audio',
      fileSize: 3 * 1024 * 1024, // 3 Mo
    });
    expect(result).toContain('3.0 Mo');
  });

  it('returns plain audio word when no details', () => {
    const result = formatSingleAttachmentLabelI18n('en', { type: 'audio' });
    expect(result).toBe('🎵 Audio');
    expect(result).not.toContain('·');
  });
});

describe('formatSingleAttachmentLabelI18n — video', () => {
  it('returns video label with duration and fileSize', () => {
    const result = formatSingleAttachmentLabelI18n('en', {
      type: 'video',
      duration: 120000,
      fileSize: 1024,
    });
    expect(result).toContain('2:00');
    expect(result).toContain('1 Ko');
  });

  it('returns plain video word when no details', () => {
    const result = formatSingleAttachmentLabelI18n('fr', { type: 'video' });
    expect(result).toBe('🎬 Vidéo');
  });
});

describe('formatSingleAttachmentLabelI18n — image', () => {
  it('returns image label with dimensions and fileSize', () => {
    const result = formatSingleAttachmentLabelI18n('en', {
      type: 'image',
      width: 1920,
      height: 1080,
      fileSize: 512,
    });
    expect(result).toContain('1920×1080');
    expect(result).toContain('512 o');
  });

  it('returns image label with fileSize only (no dimensions)', () => {
    const result = formatSingleAttachmentLabelI18n('en', {
      type: 'image',
      fileSize: 2048,
    });
    expect(result).toContain('2 Ko');
    expect(result).not.toContain('×');
  });

  it('returns plain photo word when no details', () => {
    const result = formatSingleAttachmentLabelI18n('en', { type: 'image' });
    expect(result).toBe('📷 Photo');
  });
});

describe('formatSingleAttachmentLabelI18n — document', () => {
  it('returns known doc label with fileSize for PDF', () => {
    const result = formatSingleAttachmentLabelI18n('en', {
      type: 'document',
      filename: 'report.pdf',
      fileSize: 512,
    });
    expect(result).toContain('📄 PDF');
    expect(result).toContain('512 o');
  });

  it('returns Word label for .docx file', () => {
    const result = formatSingleAttachmentLabelI18n('en', {
      type: 'document',
      filename: 'doc.docx',
    });
    expect(result).toContain('📝 Word');
    expect(result).not.toContain('·');
  });

  it('returns generic label for unknown extension', () => {
    const result = formatSingleAttachmentLabelI18n('en', {
      type: 'document',
      filename: 'file.xyz',
    });
    expect(result).toContain('📎 Fichier .xyz');
  });

  it('returns generic document label when filename is null', () => {
    const result = formatSingleAttachmentLabelI18n('en', {
      type: 'document',
      filename: null,
    });
    expect(result).toContain('Document');
  });

  it('returns generic document label when filename has no extension', () => {
    const result = formatSingleAttachmentLabelI18n('en', {
      type: 'document',
      filename: 'filewithoutext',
    });
    expect(result).toContain('Document');
  });

  it('returns generic document label when filename ends with dot', () => {
    const result = formatSingleAttachmentLabelI18n('en', {
      type: 'document',
      filename: 'file.',
    });
    expect(result).toContain('Document');
  });
});

// ── buildMessageNotificationBodyI18n ──────────────────────────────────────────

describe('buildMessageNotificationBodyI18n', () => {
  it('returns empty string when no attachments and no text', () => {
    const result = buildMessageNotificationBodyI18n('en', {});
    expect(result).toBe('');
  });

  it('returns text when no attachments', () => {
    const result = buildMessageNotificationBodyI18n('en', { messagePreview: 'Hello!' });
    expect(result).toBe('Hello!');
  });

  it('returns text only when there are no attachments even with whitespace preview', () => {
    const result = buildMessageNotificationBodyI18n('en', {
      messagePreview: '  trimmed  ',
      attachments: [],
    });
    expect(result).toBe('trimmed');
  });

  it('uses attachment label as base when no text and one attachment', () => {
    const result = buildMessageNotificationBodyI18n('en', {
      attachments: [{ type: 'image' }],
    });
    expect(result).toBe('📷 Photo');
  });

  it('appends +N badge for extra images', () => {
    const result = buildMessageNotificationBodyI18n('en', {
      attachments: [
        { type: 'image' },
        { type: 'image' },
        { type: 'image' },
      ],
    });
    expect(result).toContain('+2📷');
  });

  it('appends +N badge for extra audio', () => {
    const result = buildMessageNotificationBodyI18n('en', {
      attachments: [
        { type: 'audio' },
        { type: 'audio' },
      ],
    });
    expect(result).toContain('+1🎵');
  });

  it('appends +N badge for extra videos', () => {
    const result = buildMessageNotificationBodyI18n('en', {
      attachments: [
        { type: 'video' },
        { type: 'video' },
      ],
    });
    expect(result).toContain('+1🎬');
  });

  it('appends homogeneous document badge for extra docs of same type', () => {
    const result = buildMessageNotificationBodyI18n('en', {
      attachments: [
        { type: 'image' },
        { type: 'document', filename: 'a.pdf' },
        { type: 'document', filename: 'b.pdf' },
      ],
    });
    // Both extras are PDFs → homogeneous → "📄 PDF · 2"
    expect(result).toContain('📄 PDF · 2');
  });

  it('appends heterogeneous document badge for mixed doc types', () => {
    const result = buildMessageNotificationBodyI18n('en', {
      attachments: [
        { type: 'image' },
        { type: 'document', filename: 'a.pdf' },
        { type: 'document', filename: 'b.docx' },
      ],
    });
    // Mixed doc types → generic "📎 2 files"
    expect(result).toContain('files');
  });

  it('includes text as base with badges appended', () => {
    const result = buildMessageNotificationBodyI18n('en', {
      messagePreview: 'Check this out',
      attachments: [
        { type: 'image' },
        { type: 'image' },
      ],
    });
    expect(result).toContain('Check this out');
    expect(result).toContain('+1📷');
  });

  it('uses firstAttachment metadata for first attachment label', () => {
    const result = buildMessageNotificationBodyI18n('en', {
      attachments: [{ type: 'audio' }],
      firstAttachmentDuration: 65000, // 1:05
    });
    expect(result).toContain('1:05');
  });
});
