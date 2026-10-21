import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ServedProfileDecorItem } from '@meeshy/shared/types/profile-decor';

import { FeedTopChrome } from '@/routes/feed';
import { StoryRail } from '@/components/story-rail';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { StoryTrayGroup } from '@/lib/view/story-tray';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * **LE RAIL DE STORIES DU FIL EST CELUI DE LA LISTE** (#11033) — demande du
 * porteur : les deux emplacements se comportent pareil, décor ET humeur
 * compris. Le web le tient par UN composant (`StoryRail`) alimenté par UN
 * corpus (`useStoryRailProps`) ; ces témoins le prouvent à l'écran et dans la
 * source, pour qu'aucune jumelle ne revienne.
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('fr');
});
afterAll(() => releaseHappyDomIfRegistered());

const filet: ServedProfileDecorItem = { pack: 'contours-essentiels', item: 'filet', origin: 'builtin', contract: null };

const groupeDecoreEtHumeur = (): StoryTrayGroup => ({
  authorId: 'u-awa',
  author: { id: 'u-awa', displayName: 'Awa', profileDecor: { avatarRing: filet } } as unknown as StoryTrayGroup['author'],
  stories: [{ id: 'st-awa', isViewedByMe: false } as StoryTrayGroup['stories'][number]],
  latestAt: 0,
  hasUnseen: true,
  isMine: false,
  entryStoryId: 'st-awa',
  moodEmoji: '🎉',
  moodPostId: 'mood-awa',
});

const railProps = { groups: [groupeDecoreEtHumeur()], loading: false, language: 'fr' } as const;

describe('le décor ET l’humeur sont rendus aux deux emplacements (#11033)', () => {
  test('le fil : contour équipé et badge d’humeur de l’auteur', () => {
    const html = renderToStaticMarkup(<FeedTopChrome railProps={railProps} inert={false} />);
    expect(html).toContain('data-avatar-ring="filet"');
    expect(html).toContain('data-mood="🎉"');
  });

  test('la liste des conversations : le même rail, le même contour, la même humeur', () => {
    const html = renderToStaticMarkup(<StoryRail variant="grande" inert={false} {...railProps} />);
    expect(html).toContain('data-avatar-ring="filet"');
    expect(html).toContain('data-mood="🎉"');
  });
});

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function sourcesOf(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourcesOf(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const read = (path: string): string => readFileSync(join(SRC, path), 'utf8');

describe('un seul rail de stories, monté sur un seul corpus (#11033)', () => {
  test('le fil et la liste montent StoryRail sur le corpus de useStoryRailProps', () => {
    for (const route of ['routes/feed.tsx', 'routes/conversations.tsx']) {
      const code = read(route);
      expect(code).toContain("import { useStoryRailProps } from '@/lib/view/use-story-rail';");
      expect(code).toMatch(/<StoryRail [^>]*variant="grande"[^>]*\{\.\.\.railProps\}/);
    }
  });

  test('aucun autre écran ne monte un rail de stories à lui', () => {
    const mounts = sourcesOf(SRC)
      .filter((path) => /<StoryRail\b/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SRC, path))
      .sort();
    expect(mounts).toEqual(['components/rail-title-slot.tsx', 'routes/conversations.tsx', 'routes/feed.tsx']);
  });
});
