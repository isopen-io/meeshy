import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { loadAdminInterfaceCatalog, translateAdmin } from '@/lib/i18n-admin-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { adminMember, pathOf, routedTransport } from '@/test-support/admin-member';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminUserImageCarousel } from './admin-user-carousel';

/**
 * **LE CARROUSEL D'IMAGES D'UN MEMBRE** (#7845 F) — ce qui se voit au DOM :
 * l'ordre (photo, bannière, publications), la navigation (flèches ET clavier),
 * ce qui n'y entre pas (un média protégé, une vidéo), et l'image en grand.
 *
 * Il lit la MÊME clé que l'onglet Médias : le témoin compte les requêtes pour
 * dire qu'un carrousel monté à côté de l'onglet ne relit pas la page.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadAdminInterfaceCatalog('fr');
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
});

const MEDIAS = [
  { id: 'm-photo', originalName: 'plage.jpg', mimeType: 'image/jpeg', fileUrl: 'https://cdn.example.test/plage.jpg', thumbnailUrl: null, source: 'post', isProtected: false },
  { id: 'm-secret', originalName: 'secret.jpg', mimeType: 'image/jpeg', fileUrl: null, thumbnailUrl: null, source: 'message', isProtected: true },
  { id: 'm-video', originalName: 'clip.mp4', mimeType: 'video/mp4', fileUrl: 'https://cdn.example.test/clip.mp4', thumbnailUrl: null, source: 'post', isProtected: false },
];

function transportMedias(medias: readonly unknown[] = MEDIAS) {
  return routedTransport((req) =>
    pathOf(req).endsWith('/media')
      ? ({ ok: true, data: medias, pagination: { total: medias.length, offset: 0, limit: 20, hasMore: false } } as never)
      : undefined,
  );
}

const MEMBRE = adminMember({
  avatar: 'https://cdn.example.test/visage.jpg',
  banner: 'https://cdn.example.test/banniere.jpg',
});

async function monter(membre = MEMBRE, transport = transportMedias()) {
  const host = await mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <AdminUserImageCarousel membre={membre} language="fr" deps={{ source: 'gateway', transport: transport.transport }} />
    </QueryClientProvider>,
  );
  return { host, calls: transport.calls };
}

const diapos = (host: HTMLElement) => [...host.querySelectorAll('[data-admin-carousel-slide]')];

describe('ce que le carrousel montre, et dans quel ordre', () => {
  test('la photo, puis la bannière, puis les images publiées', async () => {
    const { host } = await monter();
    expect(diapos(host).map((d) => d.getAttribute('data-admin-carousel-slide'))).toEqual(['avatar', 'banner', 'm-photo']);
  });

  test('un carrousel NOMMÉ comme tel, et chaque diapositive dit sa place', async () => {
    const { host } = await monter();
    expect(host.querySelector('[aria-roledescription="carousel"]')).not.toBe(null);
    const premiere = diapos(host)[0];
    expect(premiere?.getAttribute('aria-label')).toBe(`1/3 — ${translateAdmin('fr', 'admin.carousel.avatar')}`);
    expect(diapos(host)[2]?.getAttribute('aria-label')).toBe('3/3 — plage.jpg');
  });

  test('un média PROTÉGÉ et une VIDÉO n’y entrent pas — jamais d’image cassée', async () => {
    const { host } = await monter();
    expect(host.querySelector('[data-admin-carousel-slide="m-secret"]')).toBe(null);
    expect(host.querySelector('[data-admin-carousel-slide="m-video"]')).toBe(null);
    expect([...host.querySelectorAll('img')].every((img) => (img.getAttribute('src') ?? '') !== '')).toBe(true);
  });

  test('les images sont chargées PARESSEUSEMENT', async () => {
    const { host } = await monter();
    expect([...host.querySelectorAll('[data-admin-carousel-slide] img')].every((img) => img.getAttribute('loading') === 'lazy')).toBe(true);
  });

  test('pendant la lecture des médias, un squelette — jamais « aucune image »', async () => {
    const enAttente = (async () => ({ ok: false, status: 0, error: 'jamais' })) as unknown as HttpTransport;
    enAttente.request = (() => new Promise(() => undefined)) as HttpTransport['request'];
    const host = await mounter.mount(
      <QueryClientProvider client={appQueryClient}>
        <AdminUserImageCarousel membre={adminMember()} language="fr" deps={{ source: 'gateway', transport: enAttente }} />
      </QueryClientProvider>,
    );
    expect(host.querySelector('[data-admin-carousel-empty]')).toBe(null);
    expect(host.textContent ?? '').not.toContain(translateAdmin('fr', 'admin.carousel.empty'));
  });

  test('une lecture ÉCHOUÉE dit « indisponible », jamais « aucune image »', async () => {
    const { host } = await monter(adminMember(), routedTransport(() => ({ ok: false, status: 500, error: 'panne' })));
    expect(host.querySelector('[data-admin-carousel-empty]')).toBe(null);
    expect(host.textContent ?? '').toContain(translateAdmin('fr', 'admin.carousel.unavailable'));
  });

  test('seule la diapositive COURANTE est opérable — les autres sortent de la tabulation', async () => {
    const { host } = await monter();
    const [premiere, seconde] = diapos(host);
    expect(premiere?.hasAttribute('inert')).toBe(false);
    expect(seconde?.hasAttribute('inert')).toBe(true);
    expect((premiere?.querySelector('button') as HTMLButtonElement | null)?.tabIndex).toBe(0);
    expect((seconde?.querySelector('button') as HTMLButtonElement | null)?.tabIndex).toBe(-1);
  });

  test('aucune image : le carrousel le DIT, il ne rend pas une bande vide', async () => {
    const { host } = await monter(adminMember(), transportMedias([]));
    expect(diapos(host)).toHaveLength(0);
    expect(host.textContent ?? '').toContain(translateAdmin('fr', 'admin.carousel.empty'));
  });
});

describe('la navigation', () => {
  const position = (host: HTMLElement) => host.querySelector('[data-admin-carousel-position]')?.textContent ?? '';

  test('la flèche « suivante » avance, « précédente » recule', async () => {
    const { host } = await monter();
    expect(position(host)).toBe(translateAdmin('fr', 'admin.carousel.position', { index: '1', count: '3' }));

    await mounter.click(host.querySelector('[data-feed-carousel-arrow="forward"]') as HTMLElement | null);
    expect(position(host)).toBe(translateAdmin('fr', 'admin.carousel.position', { index: '2', count: '3' }));

    await mounter.click(host.querySelector('[data-feed-carousel-arrow="backward"]') as HTMLElement | null);
    expect(position(host)).toBe(translateAdmin('fr', 'admin.carousel.position', { index: '1', count: '3' }));
  });

  test('les flèches du CLAVIER font de même', async () => {
    const { host } = await monter();
    const region = host.querySelector('[aria-roledescription="carousel"]') as HTMLElement;
    await act(async () => {
      region.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    await act(async () => {
      region.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(position(host)).toBe(translateAdmin('fr', 'admin.carousel.position', { index: '3', count: '3' }));
    // Au bout, la flèche ne tourne pas en rond : la dernière reste la dernière.
    await act(async () => {
      region.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(position(host)).toBe(translateAdmin('fr', 'admin.carousel.position', { index: '3', count: '3' }));
    await act(async () => {
      region.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(position(host)).toBe(translateAdmin('fr', 'admin.carousel.position', { index: '2', count: '3' }));
  });
});

describe('un défilement que la flèche lance n’est pas un geste', () => {
  const position = (host: HTMLElement) => host.querySelector('[data-admin-carousel-position]')?.textContent ?? '';

  test('le premier `scroll` d’une animation smooth ne ramène pas la bande à la première diapositive', async () => {
    const { host } = await monter();
    const bande = host.querySelector('[data-admin-carousel] ul') as HTMLUListElement;
    Object.defineProperty(bande, 'clientWidth', { configurable: true, get: () => 300 });
    bande.scrollTo = (() => undefined) as typeof bande.scrollTo;

    await mounter.click(host.querySelector('[data-feed-carousel-arrow="forward"]') as HTMLElement | null);
    expect(position(host)).toBe(translateAdmin('fr', 'admin.carousel.position', { index: '2', count: '3' }));

    // L'animation vient de partir : 10 % de la largeur, arrondi à 0.
    bande.scrollLeft = 30;
    await act(async () => {
      bande.dispatchEvent(new Event('scroll'));
      bande.dispatchEvent(new Event('scrollend'));
      await new Promise((r) => setTimeout(r, 160));
    });
    expect(position(host)).toBe(translateAdmin('fr', 'admin.carousel.position', { index: '2', count: '3' }));
  });
});

describe('l’image en grand', () => {
  test('toucher une diapositive ouvre la feuille, image entière', async () => {
    const { host } = await monter();
    expect(document.querySelector('[data-admin-carousel-full]')).toBe(null);

    await mounter.click(host.querySelector('[data-admin-carousel-open="m-photo"]') as HTMLElement | null);

    const grande = document.querySelector('[data-admin-carousel-full] img');
    expect(grande?.getAttribute('src')).toBe('https://cdn.example.test/plage.jpg');
    expect(grande?.className ?? '').toContain('object-contain');
  });
});

describe('une seule lecture pour deux surfaces', () => {
  test('la page de médias déjà en cache n’est pas relue', async () => {
    const premier = await monter();
    expect(premier.calls().filter((c) => pathOf(c).endsWith('/media'))).toHaveLength(1);
    const second = transportMedias();
    await mounter.mount(
      <QueryClientProvider client={appQueryClient}>
        <AdminUserImageCarousel membre={MEMBRE} language="fr" deps={{ source: 'gateway', transport: second.transport }} />
      </QueryClientProvider>,
    );
    expect(second.calls()).toHaveLength(0);
  });
});
