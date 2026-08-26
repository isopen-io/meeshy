/**
 * La règle du `messageType` des pièces jointes — remontée dans `shared` parce
 * que la moitié SERVEUR ne peut pas corriger la moitié CLIENT.
 *
 * `deriveMessageTypeForAttachments` est ADDITIVE : elle se tait dès que la
 * colonne porte autre chose que le défaut `'text'`. Un client qui écrit la
 * règle à la main est donc le SEUL à décider dès qu'il rend autre chose que
 * `'text'` — le serveur, voyant une déclaration explicite, ne repassera pas
 * derrière. C'est ce qui fait de la duplication client un défaut de contrat et
 * non une redondance inoffensive.
 */
import { describe, it, expect } from 'vitest';
import {
  messageTypeFromMimeTypes,
  messageTypeForClientAttachments,
  deriveMessageTypeForAttachments,
} from '../../utils/attachment-message-type';

describe('messageTypeFromMimeTypes — la catégorie du LOT, jamais celle du premier', () => {
  it('aucune pièce jointe → undefined (l\'appelant conserve son défaut)', () => {
    expect(messageTypeFromMimeTypes([])).toBeUndefined();
  });

  it.each([
    ['image/jpeg', 'image'],
    ['audio/mpeg', 'audio'],
    ['video/mp4', 'video'],
    ['application/pdf', 'file'],
    ['application/octet-stream', 'file'],
  ])('une seule catégorie (%s) → %s', (mime, expected) => {
    expect(messageTypeFromMimeTypes([mime])).toBe(expected);
  });

  it('text/plain est une PIÈCE JOINTE, donc "file" — jamais "text"', () => {
    expect(messageTypeFromMimeTypes(['text/plain'])).toBe('file');
    expect(messageTypeFromMimeTypes(['text/csv'])).toBe('file');
  });

  it('plusieurs pièces jointes de la MÊME catégorie → cette catégorie', () => {
    expect(messageTypeFromMimeTypes(['image/jpeg', 'image/png'])).toBe('image');
  });

  it('lot HÉTÉROGÈNE → "file", quelle que soit la première pièce jointe', () => {
    expect(messageTypeFromMimeTypes(['image/jpeg', 'application/pdf'])).toBe('file');
    expect(messageTypeFromMimeTypes(['application/pdf', 'image/jpeg'])).toBe('file');
    expect(messageTypeFromMimeTypes(['audio/mpeg', 'video/mp4'])).toBe('file');
  });

  it('un MIME manquant compte comme "file" et rend le lot hétérogène', () => {
    expect(messageTypeFromMimeTypes(['image/jpeg', undefined])).toBe('file');
    expect(messageTypeFromMimeTypes([null])).toBe('file');
  });

  it('la casse du MIME ne change pas la catégorie', () => {
    expect(messageTypeFromMimeTypes(['IMAGE/JPEG'])).toBe('image');
  });
});

describe('messageTypeForClientAttachments — la moitié DÉCLARATIVE', () => {
  it('aucune pièce jointe → "text" (le seul cas où il est vrai)', () => {
    expect(
      messageTypeForClientAttachments({ hasAttachments: false, mimeTypes: [] })
    ).toBe('text');
  });

  it('des pièces jointes mais aucun MIME connu → "file", jamais "text"', () => {
    expect(
      messageTypeForClientAttachments({ hasAttachments: true, mimeTypes: [] })
    ).toBe('file');
  });

  it('des pièces jointes dont on connaît les MIME → la catégorie du lot', () => {
    expect(
      messageTypeForClientAttachments({ hasAttachments: true, mimeTypes: ['image/png', 'image/gif'] })
    ).toBe('image');
    expect(
      messageTypeForClientAttachments({ hasAttachments: true, mimeTypes: ['image/png', 'application/pdf'] })
    ).toBe('file');
  });

  it('aucune pièce jointe l\'emporte sur des MIME résiduels', () => {
    expect(
      messageTypeForClientAttachments({ hasAttachments: false, mimeTypes: ['image/png'] })
    ).toBe('text');
  });
});

describe('deriveMessageTypeForAttachments — la moitié ADDITIVE, et sa limite', () => {
  it('comble le défaut "text"', () => {
    expect(
      deriveMessageTypeForAttachments({ persistedMessageType: 'text', mimeTypes: ['image/png'] })
    ).toBe('image');
    expect(
      deriveMessageTypeForAttachments({ persistedMessageType: null, mimeTypes: ['image/png'] })
    ).toBe('image');
  });

  it('se tait devant une déclaration explicite — MÊME FAUSSE', () => {
    // La raison d'être de ce fichier : un client qui déclare `'image'` sur un
    // lot hétérogène n'est corrigé par PERSONNE. C'est ce silence, et non la
    // duplication en elle-même, qui rend la règle client autoritative.
    expect(
      deriveMessageTypeForAttachments({
        persistedMessageType: 'image',
        mimeTypes: ['image/jpeg', 'application/pdf'],
      })
    ).toBeUndefined();
    expect(
      deriveMessageTypeForAttachments({ persistedMessageType: 'location', mimeTypes: ['image/png'] })
    ).toBeUndefined();
  });

  it('n\'écrit rien quand il n\'y a aucune pièce jointe', () => {
    expect(
      deriveMessageTypeForAttachments({ persistedMessageType: 'text', mimeTypes: [] })
    ).toBeUndefined();
  });
});
