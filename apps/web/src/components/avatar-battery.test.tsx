import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { Avatar } from './avatar';

/**
 * LA BATTERIE SUR L'AVATAR (#14147) — une icône en haut du cercle pendant un épisode, que le lecteur d'écran
 * entend avec le nom ; hors épisode, rien.
 */

beforeAll(async () => {
  await loadInterfaceCatalog('fr');
});

const critical = { tone: 'critical', level: 4, charging: false, spoken: 'Batterie critique, 4 %' } as const;

const render = (props: Readonly<Record<string, unknown>>) => renderToStaticMarkup(<Avatar initials="AD" color="#6366f1" size={48} name="Ada" {...props} />);

describe('la batterie sur l’avatar', () => {
  test('pendant un épisode, l’icône se pose et se dit avec le nom', () => {
    const html = render({ battery: critical });
    expect(html).toContain('data-avatar-battery="critical"');
    expect(html).toContain('data-battery-glyph="critical"');
    expect(html).toContain('aria-label="Ada, Batterie critique, 4 %"');
  });

  test('hors épisode : ni icône, ni phrase', () => {
    const html = render({});
    expect(html).not.toContain('data-avatar-battery');
    expect(html).toContain('aria-label="Ada"');
  });

  test('sur un avatar minuscule, l’icône ne se pose pas mais l’état se dit encore', () => {
    const html = render({ battery: critical, size: 20 });
    expect(html).not.toContain('data-avatar-battery');
    expect(html).toContain('Batterie critique, 4 %');
  });

  test('un téléphone présumé éteint n’a qu’un contour, sans remplissage', () => {
    const html = render({ battery: { tone: 'off', level: 3, charging: false, spoken: 'Téléphone probablement éteint' } });
    expect(html).toContain('data-avatar-battery="off"');
    expect(html).not.toContain('data-battery-fill');
  });
});
