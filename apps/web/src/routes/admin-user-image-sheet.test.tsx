import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import type { HttpRequest } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { pathOf, routedTransport } from '@/test-support/routed-transport';

import { AdminUserImageSheet } from './admin-user-image-sheet';

/**
 * **POSER LA PHOTO OU LA BANNIÈRE D'UN MEMBRE** (#8217) — ce que
 * l'administrateur voit et ce qui part : les images PUBLIQUES du membre sont
 * proposées (la passerelle les choisit), en choisir une pose SA référence,
 * retirer pose `none`, et le membre renvoyé remonte à la fiche.
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

const membre = (surcharge: Partial<AdminUserDetail> = {}): AdminUserDetail => ({
  id: 'u-alice',
  username: 'alice',
  displayName: 'Alice',
  firstName: '',
  lastName: '',
  bio: '',
  avatar: '',
  banner: '',
  profileCompletionRate: null,
  email: 'alice@example.test',
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

const CANDIDATES = [
  { id: 'm-1', fileUrl: '/p/1.jpg', thumbnailUrl: '/p/1-t.jpg' },
  { id: 'm-2', fileUrl: '/p/2.jpg', thumbnailUrl: null },
];

async function monter(options: { readonly actuel?: Partial<AdminUserDetail>; readonly candidates?: readonly unknown[]; readonly refus?: boolean } = {}) {
  const t = routedTransport((req: HttpRequest) => {
    if (req.method === 'GET' && pathOf(req) === '/api/v1/admin/users/u-alice/profile-image-candidates') {
      const lignes = options.candidates ?? CANDIDATES;
      return { ok: true, data: lignes, pagination: { total: lignes.length, offset: 0, limit: 30, hasMore: false } };
    }
    if (req.method === 'PUT' && pathOf(req).startsWith('/api/v1/admin/users/u-alice/profile-images/')) {
      if (options.refus) return { ok: false, status: 400, error: 'refus', code: 'PROFILE_IMAGE_NOT_ELIGIBLE' };
      const corps = req.body as { source: string; mediaId?: string };
      const url = corps.source === 'media' ? CANDIDATES.find((c) => c.id === corps.mediaId)?.fileUrl ?? '' : '';
      return { ok: true, data: { ...membre(options.actuel), avatar: url } };
    }
    return undefined;
  });
  const annonces: string[] = [];
  const poses: AdminUserDetail[] = [];
  let fermetures = 0;
  const host = await mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <AdminUserImageSheet
        membre={membre(options.actuel)}
        kind="avatar"
        language="fr"
        deps={{ source: 'gateway', transport: t.transport }}
        isOnline={() => true}
        onAnnounce={(texte) => annonces.push(texte)}
        onSaved={(aJour) => poses.push(aJour)}
        onClose={() => {
          fermetures += 1;
        }}
      />
    </QueryClientProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  return { host, calls: t.calls, annonces, poses, fermetures: () => fermetures };
}

describe('choisir parmi les images publiques du membre', () => {
  test('propose les candidates servies, vignette d’abord', async () => {
    const { host } = await monter();

    const boutons = [...host.querySelectorAll<HTMLButtonElement>('[data-admin-image-candidate]')];
    expect(boutons.map((b) => b.dataset.adminImageCandidate)).toEqual(['m-1', 'm-2']);
    expect(boutons[0]?.getAttribute('aria-label')).toBe('Utiliser l’image 1 sur 2');
  });

  test('en choisir une pose SA référence, remonte le membre et ferme la feuille', async () => {
    const { host, calls, poses, annonces, fermetures } = await monter();

    await mounter.click(host.querySelector<HTMLButtonElement>('[data-admin-image-candidate="m-2"]'));

    const pose = calls().find((req) => req.method === 'PUT');
    expect(pathOf(pose!)).toBe('/api/v1/admin/users/u-alice/profile-images/avatar');
    expect(pose?.body).toEqual({ source: 'media', mediaId: 'm-2' });
    expect(poses.map((m) => m.avatar)).toEqual(['/p/2.jpg']);
    expect(annonces).toContain('Image mise à jour');
    expect(fermetures()).toBe(1);
  });

  test('sans image publique, le dit — et le téléversement reste offert', async () => {
    const { host } = await monter({ candidates: [] });

    expect(host.querySelector('[data-admin-image-candidates-empty]')?.textContent).toBe('Aucune image publique à proposer.');
    expect(host.querySelector('[data-admin-image-upload]')).not.toBeNull();
  });

  test('un refus de la passerelle se dit, et la feuille reste ouverte', async () => {
    const { host, fermetures, poses } = await monter({ refus: true });

    await mounter.click(host.querySelector<HTMLButtonElement>('[data-admin-image-candidate="m-1"]'));

    expect(host.querySelector('[data-admin-image-refused]')?.textContent).toBe('Échec de la mise à jour de l’image');
    expect(poses).toEqual([]);
    expect(fermetures()).toBe(0);
  });
});

describe('retirer l’image', () => {
  test('n’est offert que quand une image est posée, et pose `none`', async () => {
    const sans = await monter();
    expect(sans.host.querySelector('[data-admin-image-remove]')).toBeNull();
    mounter.unmountAll();

    const avec = await monter({ actuel: { avatar: '/actuel.jpg' } });
    await mounter.click(avec.host.querySelector<HTMLButtonElement>('[data-admin-image-remove]'));

    expect(avec.calls().find((req) => req.method === 'PUT')?.body).toEqual({ source: 'none' });
    expect(avec.annonces).toContain('Image retirée');
  });
});

describe('l’aperçu immédiat et le refus de RANG (#8289)', () => {
  async function monterAvecApercu(reponse: 'ok' | 'rang') {
    const t = routedTransport((req: HttpRequest) => {
      if (req.method === 'GET' && pathOf(req) === '/api/v1/admin/users/u-alice/profile-image-candidates') {
        return { ok: true, data: CANDIDATES, pagination: { total: CANDIDATES.length, offset: 0, limit: 30, hasMore: false } };
      }
      if (req.method === 'PUT') {
        return reponse === 'rang' ? { ok: false, status: 403, error: 'Hiérarchie insuffisante' } : { ok: true, data: { ...membre(), avatar: '/p/1.jpg' } };
      }
      return undefined;
    });
    const apercus: (string | null)[] = [];
    const echecs: string[] = [];
    const host = await mounter.mount(
      <QueryClientProvider client={appQueryClient}>
        <AdminUserImageSheet
          membre={membre()}
          kind="avatar"
          language="fr"
          deps={{ source: 'gateway', transport: t.transport }}
          isOnline={() => true}
          onAnnounce={() => {}}
          onSaved={() => {}}
          onPreview={(_kind, url) => apercus.push(url)}
          onFailed={(_kind, message) => echecs.push(message)}
          onClose={() => {}}
        />
      </QueryClientProvider>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    return { host, apercus, echecs };
  }

  test('choisir une image la montre AVANT la réponse de la passerelle', async () => {
    const { host, apercus } = await monterAvecApercu('ok');

    await mounter.click(host.querySelector<HTMLButtonElement>('[data-admin-image-candidate="m-1"]'));

    expect(apercus).toEqual(['/p/1.jpg']);
  });

  test('un 403 dit le RANG, jamais « échec » — et l’aperçu est retiré', async () => {
    const { host, echecs } = await monterAvecApercu('rang');

    await mounter.click(host.querySelector<HTMLButtonElement>('[data-admin-image-candidate="m-1"]'));

    const motif = 'Refusé : votre rôle ne permet pas de modifier ce membre';
    expect(host.querySelector('[data-admin-image-refused]')?.textContent).toBe(motif);
    expect(echecs).toEqual([motif]);
  });

  test('la feuille est CENTRÉE, jamais plein écran', async () => {
    const { host } = await monterAvecApercu('ok');
    expect(host.querySelector('dialog')?.dataset.sheetPresentation).toBe('centered');
  });
});

