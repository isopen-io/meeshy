import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { AdminSectionScreen } from '@/components/admin/section-screen';
import { OBJECT_ID, servedInvitationFiche } from '@/lib/admin/invitation-fixtures';
import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { adminInvitationKey } from '@/lib/api/admin-invitations';
import { createRouter, navigate } from '@/lib/router';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { resultatServi } from '@/test-support/served-pagination';

import { AdminInvitationPanel } from './admin-invitation';

/**
 * **LA FICHE D'UNE DEMANDE DE CONTACT** (#8876, #6729) — deux membres nommés, le
 * statut interprété, le message, les dates ; jamais l'adresse e-mail. Le seul geste,
 * « Annuler la demande », n'existe que pour une demande en attente : méthode, corps
 * `{ status: 'rejected' }`, confirmation qui dit ce qui va se passer, annonce,
 * relecture, retour arrière quand la passerelle refuse.
 */

const { mount, mounter } = setupAdminKitTests();
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const NOW = new Date('2026-09-30T12:00:00.000Z');
const INVITATION_ID = OBJECT_ID(1);

type Call = { readonly method: string; readonly path: string; readonly body?: unknown };

type Fake = {
  readonly deps: AdminDeps;
  readonly calls: Call[];
  readonly state: { invitation: Record<string, unknown> };
};

type Options = {
  readonly invitation?: Record<string, unknown>;
  readonly fail?: ApiResult<unknown>;
  readonly hold?: Promise<void>;
  readonly read?: () => ApiResult<unknown>;
};

function fakeServer(options: Options = {}): Fake {
  const state = { invitation: options.invitation ?? servedInvitationFiche() };
  const calls: Call[] = [];

  const transport = {
    request: async (request: HttpRequest): Promise<ApiResult<unknown>> => {
      calls.push({ method: request.method, path: request.path, ...(request.body === undefined ? {} : { body: request.body }) });
      if (request.method === 'GET') return options.read?.() ?? resultatServi(state.invitation);
      await options.hold;
      if (options.fail !== undefined) return options.fail;
      const body = typeof request.body === 'object' && request.body !== null && 'status' in request.body ? request.body : {};
      state.invitation = { ...state.invitation, ...body, updatedAt: '2026-09-30T11:30:00.000Z' };
      return { ok: true, data: state.invitation, status: 200 };
    },
  } as unknown as HttpTransport;

  return { deps: { source: 'gateway', transport }, calls, state };
}

function Screen({ deps }: { readonly deps: AdminDeps }) {
  return (
    <AdminSectionScreen section="invitations" language="fr" title="Demandes de contact">
      {() => <AdminInvitationPanel language="fr" invitationId={INVITATION_ID} deps={deps} now={() => NOW} />}
    </AdminSectionScreen>
  );
}

async function open(fake: Fake, identity = BIGBOSS) {
  const { Router } = createRouter(
    { adminInvitation: { pattern: '/admin/invitations/$invitation', screen: async () => ({ default: () => <Screen deps={fake.deps} /> }) } },
    () => <p>absent</p>,
  );
  navigate(`/admin/invitations/${INVITATION_ID}`, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, identity);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-invitation-fiche], [data-admin-error], [data-admin-empty], [data-admin-denied-inline]') === null; attempt += 1) {
    await mounter.settle();
  }
  await mounter.settle();
  return host;
}

const gesture = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-admin-identity] [data-admin-action="cancel-invitation"]');
const confirm = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-admin-confirm] [data-admin-action="confirm"]');
const writes = (fake: Fake) => fake.calls.filter((call) => call.method !== 'GET');
const reads = (fake: Fake) => fake.calls.filter((call) => call.method === 'GET');
const statusBadge = (host: ParentNode) => host.querySelector('[data-admin-identity] [data-admin-raw]')?.textContent ?? '';

describe('la fiche — deux membres nommés, métadonnées interprétées', () => {
  test('le titre, les deux membres, le statut, les dates : des mots, jamais un identifiant ni un ISO', async () => {
    const host = await open(fakeServer());

    const identity = host.querySelector('[data-admin-identity]')?.textContent ?? '';
    expect(identity).toContain('Awa Diop → Jean Dupont');
    expect(identity).toContain('En attente');
    expect(identity).toContain('Demande de contact envoyée');
    expect(host.querySelector('[data-admin-person="sender"]')?.textContent).toContain('Awa Diop');
    expect(host.querySelector('[data-admin-person="sender"]')?.textContent).toContain('@awa');
    expect(host.querySelector('[data-admin-person="receiver"]')?.textContent).toContain('Jean Dupont');
    expect(host.querySelector('[data-admin-person="receiver"]')?.textContent).toContain('@jean');
    expect(host.querySelector('[data-admin-meta="status"]')?.textContent).toContain('Le destinataire n’a pas encore répondu.');
    expect(host.querySelector('[data-admin-meta="sent"] time')?.getAttribute('title')).toContain('2026');
    expectNoRawIdentifiers(host);
  });

  test('le message joint est lu dans la fiche — et seulement là', async () => {
    const host = await open(fakeServer());

    expect(host.querySelector('[data-admin-fiche-section="message"]')?.textContent).toContain('Salut, on s’est croisés hier');
    expect(host.querySelector('[data-admin-stat="message"]')?.textContent).toContain('Avec un message');
  });

  test('sans message, la fiche le dit', async () => {
    const host = await open(fakeServer({ invitation: servedInvitationFiche({ message: undefined }) }));

    expect(host.querySelector('[data-admin-fiche-section="message"]')?.textContent).toContain('Aucun message n’accompagne cette demande.');
    expect(host.querySelector('[data-admin-stat="message"]')?.textContent).toContain('Sans message');
  });

  test('l’adresse e-mail servie par la route n’apparaît nulle part dans l’écran', async () => {
    const host = await open(fakeServer());

    expect(host.textContent).not.toContain('exemple.test');
    expect(host.innerHTML).not.toContain('exemple.test');
  });

  test('l’identifiant n’est écrit que sur la ligne « Identifiant technique », copiable', async () => {
    const host = await open(fakeServer());

    expect(host.querySelector('[data-admin-meta="technicalId"] [data-admin-technical-id]')?.textContent).toBe(INVITATION_ID);
    expect(host.querySelector('[data-admin-meta="technicalId"] [data-admin-action="copy-technical-id"]')).not.toBeNull();
  });

  test('les deux membres mènent à leur fiche ; l’expéditeur mène à TOUTES ses demandes', async () => {
    const host = await open(fakeServer());

    const hrefs = [...host.querySelectorAll('[data-admin-fiche-section="people"] a')].map((link) => link.getAttribute('href'));
    expect(hrefs).toContain(`/admin/users/${OBJECT_ID(2)}`);
    expect(hrefs).toContain(`/admin/users/${OBJECT_ID(3)}`);
    expect(host.querySelector('[data-admin-link="sender-requests"]')?.getAttribute('href')).toBe(`/admin/invitations?senderId=${OBJECT_ID(2)}`);
  });

  test('un compte supprimé depuis se dit « Personne inconnue », sans puce ni identifiant', async () => {
    const host = await open(fakeServer({ invitation: servedInvitationFiche({ receiver: null }) }));

    expect(host.querySelector('[data-admin-person="receiver"]')?.textContent).toContain('Personne inconnue');
    expect(host.querySelector('[data-admin-person="receiver"] a')).toBeNull();
  });

  test('un statut inconnu se dit « Non reconnu », jamais le code', async () => {
    const host = await open(fakeServer({ invitation: servedInvitationFiche({ status: 'blocked' }) }));

    expect(host.querySelector('[data-admin-identity]')?.textContent).toContain('Non reconnu');
    expect(host.querySelector('[data-admin-identity]')?.textContent).not.toContain('blocked');
    expect(gesture(host)).toBeNull();
  });

  test('une demande acceptée dit que les deux membres sont amis', async () => {
    const host = await open(fakeServer({ invitation: servedInvitationFiche({ status: 'accepted' }) }));

    expect(statusBadge(host)).toBe('Acceptée');
    expect(host.querySelector('[data-admin-meta="status"]')?.textContent).toContain('Les deux membres sont amis.');
  });
});

describe('les états dessinés', () => {
  test('squelette tant que la fiche est en vol', async () => {
    const host = await open(fakeServer({ read: () => new Promise<never>(() => undefined) as unknown as ApiResult<unknown> }));

    expect(host.querySelector('[data-admin-invitation-loading]')).not.toBeNull();
  });

  test('404 : « cette demande n’existe plus », avec le retour à la liste — pas une panne', async () => {
    const host = await open(fakeServer({ read: () => ({ ok: false, status: 404, error: 'Invitation non trouvée' }) }));

    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Cette demande n’existe plus');
    expect(host.querySelector('[data-admin-empty] [data-admin-link="back-to-list"]')?.getAttribute('href')).toBe('/admin/invitations');
    expect(host.querySelector('[data-admin-error]')).toBeNull();
  });

  test('403 : un bloc refusé', async () => {
    const host = await open(fakeServer({ read: () => ({ ok: false, status: 403, error: 'Forbidden' }) }));

    expect(host.querySelector('[data-admin-denied-inline]')).not.toBeNull();
  });

  test('erreur : « Réessayer » relit la passerelle', async () => {
    let calls = 0;
    const fake = fakeServer({ read: () => (++calls === 1 ? { ok: false, status: 500, error: 'boom' } : resultatServi(servedInvitationFiche())) });
    const host = await open(fake);

    expect(host.querySelector('[data-admin-error]')).not.toBeNull();

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-error] [data-admin-retry]'));

    expect(host.querySelector('[data-admin-invitation-fiche]')).not.toBeNull();
  });
});

describe('annuler la demande', () => {
  test('le geste n’est dessiné que pour une demande en attente', async () => {
    expect(gesture(await open(fakeServer()))?.textContent).toBe('Annuler la demande');
    mounter.unmountAll();
    appQueryClient.clear();
    expect(gesture(await open(fakeServer({ invitation: servedInvitationFiche({ status: 'accepted' }) })))).toBeNull();
    mounter.unmountAll();
    appQueryClient.clear();
    expect(gesture(await open(fakeServer({ invitation: servedInvitationFiche({ status: 'rejected' }) })))).toBeNull();
  });

  test('« accepter » n’est JAMAIS offert : la route ne crée pas l’amitié', async () => {
    const host = await open(fakeServer());

    const labels = [...host.querySelectorAll('button')].map((button) => button.textContent ?? '');
    expect(labels.some((label) => /accept/i.test(label))).toBe(false);
    expect(host.querySelectorAll('[data-admin-identity] [data-admin-action]')).toHaveLength(1);
  });

  test('la cible du geste fait 44 px', async () => {
    const host = await open(fakeServer());

    expect(gesture(host)?.style.minHeight).toBe('44px');
  });

  test('ouvrir la confirmation n’envoie rien ; elle dit ce qui va se passer', async () => {
    const fake = fakeServer();
    const host = await open(fake);

    await mounter.click(gesture(host));

    expect(writes(fake)).toEqual([]);
    const body = host.querySelector('[data-admin-confirm]')?.textContent ?? '';
    expect(body).toContain('Jean Dupont ne la verra plus en attente');
    expect(body).toContain('Aucune amitié n’est créée');
    expect(body).toContain('journal d’audit');
    expect(confirm(host)?.textContent).toBe('Annuler la demande');
  });

  test('annuler la confirmation ne change rien', async () => {
    const fake = fakeServer();
    const host = await open(fake);
    await mounter.click(gesture(host));

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-confirm] [data-admin-action="cancel"]'));

    expect(writes(fake)).toEqual([]);
    expect(host.querySelector('[data-admin-confirm]')).toBeNull();
  });

  test('confirmer : PATCH { status: "rejected" }, annoncé, relu — la fiche passe « Refusée » et n’offre plus le geste', async () => {
    const fake = fakeServer();
    const host = await open(fake);
    const readsBefore = reads(fake).length;

    await mounter.click(gesture(host));
    await mounter.click(confirm(host));

    expect(writes(fake)).toEqual([{ method: 'PATCH', path: adminEndpoints.invitationsById(INVITATION_ID), body: { status: 'rejected' } }]);
    expect(host.querySelector('[data-admin-announcement]')?.textContent).toBe('Demande annulée');
    expect(reads(fake).length).toBeGreaterThan(readsBefore);
    expect(statusBadge(host)).toBe('Refusée');
    expect(host.querySelector('[data-admin-meta="status"]')?.textContent).toContain('annulée par un administrateur');
    expect(gesture(host)).toBeNull();
    expect(host.querySelector('[data-admin-confirm]')).toBeNull();
  });

  test('effet OPTIMISTE : le statut change avant la réponse, et REVIENT si la passerelle refuse', async () => {
    const release: { open: () => void } = { open: () => undefined };
    const gate = new Promise<void>((resolve) => {
      release.open = resolve;
    });
    const fake = fakeServer({ hold: gate, fail: { ok: false, status: 500, error: 'boom' } });
    const host = await open(fake);
    await mounter.click(gesture(host));

    await act(async () => {
      confirm(host)?.click();
    });
    await mounter.settle();
    expect(appQueryClient.getQueryData(adminInvitationKey(INVITATION_ID))).toMatchObject({ status: 'rejected' });
    expect(statusBadge(host)).toBe('Refusée');

    await act(async () => {
      release.open();
    });
    await mounter.settle();
    await mounter.settle();

    expect(appQueryClient.getQueryData(adminInvitationKey(INVITATION_ID))).toMatchObject({ status: 'pending' });
    expect(statusBadge(host)).toBe('En attente');
    expect(host.querySelector('[data-admin-confirm-error]')?.textContent).toBe('Le serveur n’a pas pu effectuer le geste.');
  });

  test('un refus de droit (403) se dit en mots', async () => {
    const fake = fakeServer({ fail: { ok: false, status: 403, error: 'Forbidden' } });
    const host = await open(fake);
    await mounter.click(gesture(host));
    await mounter.click(confirm(host));

    expect(host.querySelector('[data-admin-confirm-error]')?.textContent).toBe('Vous n’avez pas le droit d’effectuer ce geste.');
    expect(statusBadge(host)).toBe('En attente');
  });

  test('un 404 (la demande a disparu) se lit comme un refus du serveur, sans casser la fiche', async () => {
    const fake = fakeServer({ fail: { ok: false, status: 404, error: 'Invitation non trouvée' } });
    const host = await open(fake);
    await mounter.click(gesture(host));
    await mounter.click(confirm(host));

    expect(host.querySelector('[data-admin-confirm-error]')).not.toBeNull();
    expect(host.querySelector('[data-admin-invitation-fiche]')).not.toBeNull();
  });

  test('hors ligne : le geste est désactivé, le cache reste lisible', async () => {
    const host = await open(fakeServer());
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    try {
      await act(async () => {
        window.dispatchEvent(new Event('offline'));
      });
      await mounter.settle();

      expect(host.querySelector('[data-admin-notice="warning"]')?.textContent).toContain('hors ligne');
      expect(gesture(host)?.disabled).toBe(true);
      expect(host.querySelector('[data-admin-fiche="invitation"]')).not.toBeNull();
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
      await act(async () => {
        window.dispatchEvent(new Event('online'));
      });
    }
  });
});

describe('qui voit la fiche', () => {
  test('sans canManageUsers, le refus unique et aucune requête', async () => {
    const fake = fakeServer();
    const { Router } = createRouter(
      { adminInvitation: { pattern: '/admin/invitations/$invitation', screen: async () => ({ default: () => <Screen deps={fake.deps} /> }) } },
      () => <p>absent</p>,
    );
    navigate(`/admin/invitations/${INVITATION_ID}`, true);
    const host = await mount(<Router wrap={(children) => children} skeleton={null} />, adminIdentityFixture({ role: 'MODERATOR', permissions: { canManageUsers: false } }));
    await mounter.settle();
    await mounter.settle();

    expect(host.textContent).toContain('Espace réservé');
    expect(host.querySelector('[data-admin-invitation-fiche]')).toBeNull();
    expect(fake.calls).toEqual([]);
  });
});
