import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import MeeBubbleSticker from './mee-sticker-bubble';

/**
 * LA BULLE REDESSINE MEE ET MEO (#9034) — avec les valeurs envoyées, animé ;
 * un gabarit qu'elle ne connaît pas rend l'image jointe.
 */
describe('MeeBubbleSticker', () => {
  test('un gabarit du catalogue est redessiné avec ses valeurs, et sa chorégraphie', () => {
    const html = renderToStaticMarkup(
      <MeeBubbleSticker sticker={{ templateId: 'mee.instant-plage', slots: { place: 'Biarritz' }, emoji: '🏝️' }} side={160} fallback={<img alt="" />} />,
    );
    expect(html).toContain('data-mee-bubble="instant-plage"');
    expect(html).toContain('Biarritz');
    expect(html).toContain('@keyframes');
    expect(html).not.toContain('<img');
  });

  test('un gabarit inconnu de ce binaire rend l’image jointe', () => {
    const html = renderToStaticMarkup(<MeeBubbleSticker sticker={{ templateId: 'mee.demain' }} side={160} fallback={<img alt="repli" />} />);
    expect(html).toContain('alt="repli"');
    expect(html).not.toContain('data-mee-bubble');
  });
});
