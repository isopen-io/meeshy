import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminUserGallery } from './admin-user-gallery';

/**
 * LE CARROUSEL DE LA FICHE (#7845) — photo, bannière, images publiées, et une
 * image protégée qui reste une diapositive sans adresse.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadAdminInterfaceCatalog('fr');
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

const membre = (surcharge: Partial<AdminUserDetail> = {}): AdminUserDetail => ({
  id: 'u-membre',
  username: 'membre',
  displayName: 'Le membre',
  firstName: '',
  lastName: '',
  bio: '',
  avatar: '/a.jpg',
  banner: '/b.jpg',
  profileCompletionRate: null,
  email: '',
  phoneNumber: '',
  role: 'USER',
  timezone: '',
  systemLanguage: 'fr',
  regionalLanguage: '',
  customDestinationLanguage: '',
  isActive: true,
  isOnline: false,
  deactivatedAt: null,
  deletedAt: null,
  deletedBy: null,
  lockedUntil: null,
  lockedReason: null,
  failedLoginAttempts: 0,
  lastPasswordChange: null,
  twoFactorEnabledAt: null,
  twoFactorEnabled: false,
  emailVerifiedAt: null,
  phoneVerifiedAt: null,
  lastActiveAt: null,
  createdAt: null,
  updatedAt: null,
  ...surcharge,
});

function transport(medias: readonly unknown[]): HttpTransport {
  const t = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
  t.request = (async (req: HttpRequest): Promise<ApiResult<unknown>> =>
    req.path.includes('/media')
      ? { ok: true, data: medias, pagination: { total: medias.length, offset: 0, limit: 20, hasMore: false } }
      : { ok: false, status: 404, error: req.path }) as HttpTransport['request'];
  return t;
}

const MEDIAS = [
  { id: 'm1', mimeType: 'image/jpeg', fileUrl: '/f/m1.jpg', source: 'post', originalName: 'plage.jpg' },
  { id: 'm2', mimeType: 'video/mp4', fileUrl: '/f/m2.mp4', source: 'post' },
  { id: 'm3', mimeType: 'image/png', fileUrl: null, source: 'message', isProtected: true },
];

async function monter(fiche: AdminUserDetail, medias: readonly unknown[]): Promise<HTMLDivElement> {
  const hote = await mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <AdminUserGallery membre={fiche} language="fr" deps={{ source: 'gateway', transport: transport(medias) }} />
    </QueryClientProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return hote;
}

const diapoCourante = (hote: ParentNode) => hote.querySelector('[data-admin-gallery-slide]')?.getAttribute('data-admin-gallery-slide');

describe('le carrousel d’images d’un membre', () => {
  test('montre la photo, la bannière et les images — pas la vidéo', async () => {
    const hote = await monter(membre(), MEDIAS);
    const vignettes = [...hote.querySelectorAll('[data-admin-gallery-thumb]')].map((n) => n.getAttribute('data-admin-gallery-thumb'));
    expect(vignettes).toEqual(['avatar', 'banner', 'm1', 'm3']);
    expect(diapoCourante(hote)).toBe('avatar');
  });

  test('avance au bouton et au clavier, et boucle en arrière', async () => {
    const hote = await monter(membre(), MEDIAS);
    act(() => hote.querySelector<HTMLButtonElement>('[data-admin-gallery-step="next"]')?.click());
    expect(diapoCourante(hote)).toBe('banner');

    act(() => {
      hote.querySelector('[data-admin-gallery]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(diapoCourante(hote)).toBe('m1');

    act(() => hote.querySelector<HTMLButtonElement>('[data-admin-gallery-thumb="avatar"]')?.click());
    act(() => hote.querySelector<HTMLButtonElement>('[data-admin-gallery-step="previous"]')?.click());
    expect(diapoCourante(hote)).toBe('m3');
  });

  test('une image protégée se dit protégée, sans aucune image chargée', async () => {
    const hote = await monter(membre(), MEDIAS);
    act(() => hote.querySelector<HTMLButtonElement>('[data-admin-gallery-thumb="m3"]')?.click());
    const scene = hote.querySelector('[data-admin-gallery-slide="m3"]');
    expect(scene?.querySelector('img')).toBeNull();
    expect(scene?.textContent).toContain('protégé');
  });

  test('sans photo, bannière ni image, il le dit', async () => {
    const hote = await monter(membre({ avatar: '', banner: '' }), []);
    expect(hote.querySelector('[data-admin-gallery-empty]')).not.toBeNull();
    expect(hote.querySelector('[data-admin-gallery]')).toBeNull();
  });
});
