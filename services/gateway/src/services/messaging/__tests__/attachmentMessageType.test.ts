import { deriveMessageTypeForAttachments, messageTypeFromMimeTypes } from '../attachmentMessageType';

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

  /**
   * Le point exact où l'exemplaire manuscrit de `copyForwardedAttachments`
   * divergeait : il ne connaissait que le préfixe `application/`, donc une
   * carte de visite ou un `.txt` y restait `'text'`. La règle canonique n'a
   * jamais eu ce trou — c'est elle qui gagne.
   */
  it('range un document text/* dans "file", jamais dans "text"', () => {
    expect(messageTypeFromMimeTypes(['text/vcard'])).toBe('file');
    expect(messageTypeFromMimeTypes(['text/plain'])).toBe('file');
  });
});

describe('deriveMessageTypeForAttachments', () => {
  it('comble le défaut : une colonne restée à "text" prend le type des pièces jointes', () => {
    expect(deriveMessageTypeForAttachments({
      persistedMessageType: 'text', mimeTypes: ['image/jpeg'],
    })).toBe('image');
  });

  it('traite une colonne vide comme le défaut "text"', () => {
    expect(deriveMessageTypeForAttachments({
      persistedMessageType: null, mimeTypes: ['audio/m4a'],
    })).toBe('audio');
    expect(deriveMessageTypeForAttachments({
      persistedMessageType: undefined, mimeTypes: ['audio/m4a'],
    })).toBe('audio');
  });

  /**
   * ADDITIVITÉ — la garde qui rend la dérivation sûre partout. `'location'` et
   * `'system'` ne se lisent dans aucun MIME : les écraser détruirait un fait
   * que seul le producteur connaît.
   */
  it('n’écrase JAMAIS un type déjà explicite', () => {
    expect(deriveMessageTypeForAttachments({
      persistedMessageType: 'location', mimeTypes: ['image/jpeg'],
    })).toBeUndefined();
    expect(deriveMessageTypeForAttachments({
      persistedMessageType: 'system', mimeTypes: ['image/jpeg'],
    })).toBeUndefined();
    expect(deriveMessageTypeForAttachments({
      persistedMessageType: 'image', mimeTypes: ['image/jpeg'],
    })).toBeUndefined();
  });

  it('ne dit rien quand le message ne porte aucune pièce jointe', () => {
    expect(deriveMessageTypeForAttachments({
      persistedMessageType: 'text', mimeTypes: [],
    })).toBeUndefined();
  });
});
