import { describe, expect, test } from 'bun:test';

import { fileBadgeOf } from './file-badge';

/**
 * LA CARTE DE FICHIER (#10004) — le badge dit le FORMAT, lu sur le nom puis
 * sur le type : « TXT » pour le texte que World Wide accepte de ses invités
 * (#10001). Jamais un badge vide, jamais un mot de plus de quatre lettres.
 */
describe('le badge de la carte de fichier (#10004)', () => {
  test('un .txt se lit « TXT »', () => {
    expect(fileBadgeOf({ originalName: 'lexique-voyage.txt', mimeType: 'text/plain' })).toBe('TXT');
  });

  test('l’extension prime, en capitales', () => {
    expect(fileBadgeOf({ originalName: 'devis.Pdf', mimeType: 'application/octet-stream' })).toBe('PDF');
  });

  test('sans extension, le texte brut se lit encore « TXT »', () => {
    expect(fileBadgeOf({ originalName: 'notes', mimeType: 'text/plain; charset=utf-8' })).toBe('TXT');
  });

  test('ni extension ni type connu : un badge générique, jamais vide', () => {
    expect(fileBadgeOf({ originalName: 'archive', mimeType: 'application/octet-stream' })).toBe('FILE');
  });

  test('une extension trop longue ou exotique ne déborde pas du badge', () => {
    expect(fileBadgeOf({ originalName: 'carte.geojsonx', mimeType: '' })).toBe('FILE');
    expect(fileBadgeOf({ originalName: 'image.<b>', mimeType: '' })).toBe('FILE');
  });
});
