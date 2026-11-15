import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { Avatar } from './avatar';

/**
 * LE TÉLÉPHONE INJOIGNABLE SUR L'AVATAR (#18737) — un téléphone barré en haut du cercle, que le lecteur d'écran
 * entend avec le nom ; il prend la place de l'icône batterie quand les deux sont servis ; sinon, rien.
 */

beforeAll(async () => {
  await loadInterfaceCatalog('fr');
});

const unreachable = { spoken: 'téléphone injoignable depuis 14:10' } as const;
const critical = { tone: 'critical', level: 4, charging: false, spoken: 'Batterie critique, 4 %' } as const;

const render = (props: Readonly<Record<string, unknown>>) => renderToStaticMarkup(<Avatar initials="AD" color="#6366f1" size={48} name="Ada" {...props} />);

describe('le téléphone injoignable sur l’avatar', () => {
  test('le glyphe se pose et se dit avec le nom', () => {
    const html = render({ unreachable });
    expect(html).toContain('data-avatar-phone-unreachable');
    expect(html).toContain('data-phone-glyph="unreachable"');
    expect(html).toContain('aria-label="Ada, téléphone injoignable depuis 14:10"');
  });

  test('avec une batterie servie, l’injoignable l’emporte : un seul badge, une seule phrase', () => {
    const html = render({ unreachable, battery: critical });
    expect(html).toContain('data-avatar-phone-unreachable');
    expect(html).not.toContain('data-avatar-battery');
    expect(html).toContain('aria-label="Ada, téléphone injoignable depuis 14:10"');
  });

  test('le téléphone répond : ni glyphe, ni phrase', () => {
    const html = render({ battery: critical });
    expect(html).not.toContain('data-avatar-phone-unreachable');
    expect(html).toContain('data-avatar-battery="critical"');
  });

  test('sur un avatar minuscule, le glyphe ne se pose pas mais l’état se dit encore', () => {
    const html = render({ unreachable, size: 20 });
    expect(html).not.toContain('data-avatar-phone-unreachable');
    expect(html).toContain('téléphone injoignable depuis 14:10');
  });
});
