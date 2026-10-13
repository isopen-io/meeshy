import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * **CHAQUE ÉCRAN DE LECTURE DIT CE QU'IL A MONTRÉ** (#10401) — garde
 * d'INVENTAIRE, complément des témoins de comportement de
 * `lib/view/reading-telemetry.test.tsx` (qui mesurent la carte, le réel et la
 * séance) : un écran qui oublie de câbler sa source ne rougit nulle part, la
 * carte restant irréprochable. Elle ne mesure que ce qu'elle nomme — la
 * source de chaque hôte et la séance des deux écrans plein cadre.
 */
const here = dirname(fileURLToPath(import.meta.url));
const source = (file: string) => readFileSync(join(here, file), 'utf8');

describe('les hôtes de la carte nomment leur source d’impression', () => {
  const HOSTS: readonly (readonly [string, string, string])[] = [
    ['hashtag.tsx', 'search', 'hashtag'],
    ['bookmarks.tsx', 'profile', 'bookmarks'],
    ['user-profile-posts.tsx', 'profile', 'profile'],
  ];
  for (const [file, expected, surface] of HOSTS) {
    test(`${file} compte en \`${expected}\` depuis \`${surface}\``, () => {
      expect(source(file)).toContain(`impressionSource="${expected}"`);
      expect(source(file)).toContain(`impressionSurface="${surface}"`);
    });
  }

  test('le fil garde la source par défaut de la carte (`feed`)', () => {
    expect(source('feed.tsx')).not.toContain('impressionSource=');
  });
});
