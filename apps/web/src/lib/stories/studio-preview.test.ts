import { describe, expect, test } from 'bun:test';

import { emptyStudioPage, pageWithVisual, pageWithVisualUpload } from './studio-page';
import { studioPreviewDocument } from './studio-preview';

/**
 * L'APERÇU LIT L'URL LOCALE POUR TOUTE LA SESSION (#8534) — l'accusé de
 * montée porte l'URL distante (`fileUrl`), que seule la PUBLICATION lit :
 * l'aperçu qui basculerait dessus rechargerait l'image sous les yeux de
 * l'auteur (le scintillement relevé par le porteur).
 */
describe('studioPreviewDocument — l’URL locale reste celle qu’on peint (#8534)', () => {
  test('un fond PRÊT (montée accusée) se peint toujours depuis son aperçu local', () => {
    const placed = pageWithVisual(emptyStudioPage('page-1', 'text-1', 'fr'), 'visual', {
      file: new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }),
      previewUrl: 'blob:local',
      mediaType: 'image',
      upload: { phase: 'uploading', progress: 0.5 },
      caption: '',
      pose: { x: 0.5, y: 0.5, scale: 1, rotation: 0 },
    });
    const ready = pageWithVisualUpload(placed, 'visual', { phase: 'ready', postMediaId: 'pm-1', fileUrl: 'https://cdn.test/a.jpg' });
    const sources = JSON.stringify(studioPreviewDocument(ready));
    expect(sources).toContain('blob:local');
    expect(sources).not.toContain('https://cdn.test/a.jpg');
  });
});
