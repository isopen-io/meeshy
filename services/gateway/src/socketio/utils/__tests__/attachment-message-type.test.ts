import { messageTypeFromMimeTypes } from '../attachment-message-type';

describe('messageTypeFromMimeTypes', () => {
  it('returns undefined when there are no attachments (caller keeps default text)', () => {
    expect(messageTypeFromMimeTypes([])).toBeUndefined();
  });

  it('maps a single image attachment to "image"', () => {
    expect(messageTypeFromMimeTypes(['image/jpeg'])).toBe('image');
  });

  it('maps a single audio attachment to "audio" (voice note path)', () => {
    expect(messageTypeFromMimeTypes(['audio/m4a'])).toBe('audio');
  });

  it('maps a single video attachment to "video"', () => {
    expect(messageTypeFromMimeTypes(['video/mp4'])).toBe('video');
  });

  it('maps a document attachment to "file"', () => {
    expect(messageTypeFromMimeTypes(['application/pdf'])).toBe('file');
  });

  it('treats several attachments of the same media class as that class', () => {
    expect(messageTypeFromMimeTypes(['image/png', 'image/jpeg', 'image/heic'])).toBe('image');
  });

  it('falls back to "file" for a heterogeneous bundle (mixed media classes)', () => {
    expect(messageTypeFromMimeTypes(['image/png', 'video/mp4'])).toBe('file');
  });

  it('is case-insensitive on the MIME prefix', () => {
    expect(messageTypeFromMimeTypes(['IMAGE/JPEG'])).toBe('image');
  });

  it('treats an unknown or empty MIME as a generic file, never text', () => {
    expect(messageTypeFromMimeTypes([''])).toBe('file');
    expect(messageTypeFromMimeTypes([null])).toBe('file');
    expect(messageTypeFromMimeTypes([undefined])).toBe('file');
  });
});
