import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { RailTitleSlot } from './rail-title-slot';
import type { StoryRailProps } from './story-rail';

/* Le rail n'est monté qu'épinglé : au repos, ses props ne sont jamais lues. */
const UNREAD_RAIL = {} as StoryRailProps;

describe('le grand titre rétrécit plutôt que de se couper (#9221)', () => {
  test('comme `minimumScaleFactor(0.55)` iOS : la taille suit la place et la longueur du titre, de 55 % à 100 % du grand titre', () => {
    const html = renderToStaticMarkup(<RailTitleSlot title="Meeshy Chats" pinned={false} railProps={UNREAD_RAIL} />);
    expect(html).toMatch(/data-title-slot[^>]*container-type:inline-size/);
    expect(html).toContain('--title-chars:12');
    expect(html).toContain(
      'font-size:clamp(calc(var(--ios-text-large-title) * 0.55), calc(100cqi / (var(--title-chars) * 0.56)), var(--ios-text-large-title))',
    );
  });
});
