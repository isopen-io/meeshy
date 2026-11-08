import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { SharedLocation } from '@/lib/api/shared-locations';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import { metersToPixels } from '@/lib/map/slippy';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SharedLocationsMapView, type SharedLocationPerson } from './shared-locations-map-view';

/**
 * **LA CARTE DES POSITIONS PARTAGÉES, SA VUE (#16984)** — pose ce que le serveur a servi,
 * rien de plus : une épingle avec l'avatar de la personne, le cercle de flou AU RAYON
 * SERVI, une liste qui dit la même chose pour qui n'a pas la carte, et la phrase qui dit
 * que le web ne partage pas la position (spec cercles § 1.5), sans rien simuler.
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  await Promise.all([loadCirclesCatalog('fr'), loadCirclesCatalog('en')]);
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const SIZE = { width: 400, height: 600 };
const VIEW = { center: { latitude: 48.85, longitude: 2.35 }, zoom: 12, ...SIZE };

const location = (overrides: Partial<SharedLocation> = {}): SharedLocation => ({
  userId: 'u-ada',
  latitude: 48.85,
  longitude: 2.35,
  precision: 'neighborhood',
  radiusMeters: 800,
  updatedAt: '2026-11-08T10:00:00.000Z',
  expiresAt: '2026-11-08T11:30:00.000Z',
  ...overrides,
});

const people = (id: string): SharedLocationPerson => ({
  name: id === 'u-ada' ? 'Ada Lovelace' : null,
  initials: id === 'u-ada' ? 'AL' : '?',
  avatar: undefined,
  presence: id === 'u-ada' ? 'online' : undefined,
});

const render = (props: Partial<Parameters<typeof SharedLocationsMapView>[0]> = {}) =>
  renderToStaticMarkup(
    <SharedLocationsMapView
      language="fr"
      locations={[location()]}
      view={VIEW}
      personOf={people}
      formatTime={(iso) => (iso.endsWith('11:30:00.000Z') ? '11:30' : '12:00')}
      online
      onZoom={() => undefined}
      onPan={() => undefined}
      {...props}
    />,
  );

describe('la carte', () => {
  test('pose des tuiles OpenStreetMap décoratives et crédite le fournisseur', () => {
    const html = render();
    expect(html).toContain('https://tile.openstreetmap.org/12/');
    expect(html).toContain('© contributeurs OpenStreetMap');
    expect(html).toContain('role="application"');
    expect(html).toContain('aria-label="Carte des positions partagées avec vous"');
  });

  test('une épingle par partage, nommée pour le lecteur d’écran avec la précision et le terme', () => {
    const html = render();
    expect(html).toContain('data-shared-location-pin="u-ada"');
    expect(html).toContain('aria-label="Ada Lovelace · à un quartier près · jusqu’à 11:30"');
  });

  test('le cercle de flou prend le rayon SERVI, converti en pixels à ce zoom', () => {
    const expected = Math.round(metersToPixels(800, 48.85, 12) * 2);
    const html = render();
    expect(html).toContain(`data-blur-diameter="${expected}"`);
  });

  test('une position exacte (rayon trop petit pour se voir) ne dessine pas de cercle', () => {
    const html = render({ locations: [location({ precision: 'exact', radiusMeters: 10 })] });
    expect(html).not.toContain('data-blur-diameter');
    expect(html).toContain('position exacte');
  });

  test('hors de l’emprise, l’épingle n’est pas posée — mais la liste la garde', () => {
    const far = location({ userId: 'u-loin', latitude: -33.9, longitude: 151.2 });
    const html = render({ locations: [far] });
    expect(html).not.toContain('data-shared-location-pin="u-loin"');
    expect(html).toContain('data-shared-location-row="u-loin"');
  });

  test('l’anneau de présence n’existe que si la présence est servie', () => {
    const html = render({ locations: [location(), location({ userId: 'u-inconnu', latitude: 48.851 })] });
    expect(html.match(/data-presence="online"/g)?.length).toBe(1);
    expect(html).toContain('Quelqu’un');
  });
});

describe('la liste alternative', () => {
  test('dit la même chose que les épingles, pour qui n’a pas la carte', () => {
    const html = render();
    expect(html).toContain('Liste des positions');
    expect(html).toContain('data-shared-location-row="u-ada"');
    expect(html).toContain('Ada Lovelace · à un quartier près · jusqu’à 11:30');
  });
});

describe('les états', () => {
  test('sans partage : la carte reste, et le vide se dit', () => {
    const html = render({ locations: [] });
    expect(html).toContain('Personne ne partage sa position avec vous pour le moment.');
    expect(html).toContain('https://tile.openstreetmap.org/');
  });

  test('le web dit qu’il ne partage pas la position, sans simuler un bouton', () => {
    const html = render();
    expect(html).toContain('Le web ne partage pas votre position');
    expect(html).not.toContain('data-share-my-location');
  });

  test('hors ligne : les positions affichées peuvent être dépassées', () => {
    expect(render({ online: false })).toContain('Hors ligne : les positions affichées peuvent être dépassées.');
    expect(render({ online: true })).not.toContain('Hors ligne');
  });

  test('deux boutons de zoom nommés, cible de 44 px', () => {
    const html = render();
    expect(html).toContain('aria-label="Agrandir la carte"');
    expect(html).toContain('aria-label="Éloigner la carte"');
    expect(html).toContain('min-h-[44px]');
  });

  test('la langue de l’interface change les mots, pas la carte', () => {
    const html = render({ language: 'en' });
    expect(html).toContain('Map of the locations shared with you');
    expect(html).toContain('The web can’t share your location');
  });
});
