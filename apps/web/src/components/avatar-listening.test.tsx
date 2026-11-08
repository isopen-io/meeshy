import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { Avatar } from './avatar';

/**
 * L'ÉCOUTE DÉFILE SUR L'AVATAR (#16729) — un bandeau sur le bas du cercle, qui
 * porte ce que le serveur a servi, et que le lecteur d'écran entend avec le nom.
 */

beforeAll(async () => {
  await loadInterfaceCatalog('fr');
});

const band = { glyph: '🎵', text: 'Clair de lune · Spotify', spoken: 'En ce moment : Clair de lune · Spotify' };

const render = (props: Readonly<Record<string, unknown>>) => renderToStaticMarkup(<Avatar initials="LP" color="#6366f1" size={90} name="Léa" {...props} />);

describe('le bandeau de l’écoute', () => {
  test('il défile sur l’avatar, le texte servi en deux copies pour une boucle sans saut', () => {
    const html = render({ listening: band });
    expect(html).toContain('data-listening-band');
    expect(html).toContain('data-listening-track');
    expect(html.split('🎵 Clair de lune · Spotify').length - 1).toBe(2);
  });

  test('le lecteur d’écran l’entend avec le nom, une seule fois', () => {
    const html = render({ listening: band });
    expect(html).toContain('aria-label="Léa, En ce moment : Clair de lune · Spotify"');
    expect(html).toMatch(/data-listening-band="" aria-hidden/);
  });

  test('sans écoute : ni bandeau, ni phrase', () => {
    const html = render({});
    expect(html).not.toContain('data-listening-band');
    expect(html).toContain('aria-label="Léa"');
  });

  test('sous 40 px, le bandeau ne se pose pas, mais l’écoute se dit encore', () => {
    const html = render({ listening: band, size: 32 });
    expect(html).not.toContain('data-listening-band');
    expect(html).toContain('En ce moment : Clair de lune · Spotify');
  });
});
