import { render } from '@testing-library/react';
import { formatLastMessage } from '../message-formatting';

/**
 * Parité dark-mode : chaque icône de type de pièce jointe affichée dans
 * l'aperçu du dernier message (liste de conversations) doit fournir une
 * variante `dark:` afin de rester lisible sur fond sombre — au même titre
 * que les libellés de texte voisins (ExpandableMessageText).
 */

const renderPreview = (attachment: Record<string, unknown>) =>
  render(<>{formatLastMessage({ attachments: [attachment], content: '' })}</>);

const iconSpan = (container: HTMLElement) =>
  container.querySelector('span.inline-flex') as HTMLElement | null;

describe('formatLastMessage — parité dark-mode des icônes de pièce jointe', () => {
  it('image : text-blue-500 + variante sombre', () => {
    const { container } = renderPreview({ mimeType: 'image/png' });
    const span = iconSpan(container);
    expect(span?.className).toContain('text-blue-500');
    expect(span?.className).toContain('dark:text-blue-400');
  });

  it('vidéo : text-red-500 + variante sombre', () => {
    const { container } = renderPreview({ mimeType: 'video/mp4' });
    const span = iconSpan(container);
    expect(span?.className).toContain('text-red-500');
    expect(span?.className).toContain('dark:text-red-400');
  });

  it('audio : text-purple-500 + variante sombre', () => {
    const { container } = renderPreview({ mimeType: 'audio/mpeg' });
    const span = iconSpan(container);
    expect(span?.className).toContain('text-purple-500');
    expect(span?.className).toContain('dark:text-purple-400');
  });

  it('PDF : text-orange-500 + variante sombre', () => {
    const { container } = renderPreview({ mimeType: 'application/pdf' });
    const span = iconSpan(container);
    expect(span?.className).toContain('text-orange-500');
    expect(span?.className).toContain('dark:text-orange-400');
  });

  it('markdown : text-blue-500 + variante sombre', () => {
    const { container } = renderPreview({ mimeType: 'text/markdown', originalName: 'a.md' });
    const span = iconSpan(container);
    expect(span?.className).toContain('text-blue-500');
    expect(span?.className).toContain('dark:text-blue-400');
  });

  it('code : text-green-500 + variante sombre', () => {
    const { container } = renderPreview({ mimeType: 'application/javascript' });
    const span = iconSpan(container);
    expect(span?.className).toContain('text-green-500');
    expect(span?.className).toContain('dark:text-green-400');
  });

  it('générique : text-gray-500 + variante sombre', () => {
    const { container } = renderPreview({ mimeType: 'application/zip' });
    const span = iconSpan(container);
    expect(span?.className).toContain('text-gray-500');
    expect(span?.className).toContain('dark:text-gray-400');
  });
});

/**
 * Durée vidéo : au même titre que l'audio, une vidéo d'au moins une heure doit
 * factoriser la composante heures (`h:mm:ss.cc`) plutôt que déborder les minutes
 * (`mmm:ss.cc`). formatVideoDuration est testé via l'API publique formatLastMessage.
 */
describe('formatLastMessage — durée vidéo', () => {
  it('vidéo < 1h : format mm:ss.cc sans heures', () => {
    // 5 min 07 s 250 ms
    const { container } = renderPreview({ mimeType: 'video/mp4', duration: 5 * 60_000 + 7_000 + 250 });
    expect(container.textContent).toContain('5:07.25');
  });

  it('vidéo ≥ 1h : factorise les heures (h:mm:ss.cc)', () => {
    // 1 h 12 min 15 s 300 ms
    const { container } = renderPreview({ mimeType: 'video/mp4', duration: 3600_000 + 12 * 60_000 + 15_000 + 300 });
    expect(container.textContent).toContain('1:12:15.30');
    expect(container.textContent).not.toContain('72:15.30');
  });
});
