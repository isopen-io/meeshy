import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { pathOf, routedTransport } from '@/test-support/routed-transport';

import { AdminUserCreateSheet } from './admin-user-create-sheet';

/**
 * **CRÉER UN COMPTE DEPUIS L'ADMINISTRATION** (#8217) — ce qui part, et ce qui
 * revient : la saisie émondée vers `POST /admin/users`, l'attestation de
 * l'adresse seulement quand elle est cochée, les doublons posés SOUS leur
 * champ, et le membre créé remis à l'écran qui ouvrira sa fiche.
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
afterEach(() => mounter.unmountAll());

const CREE = { id: 'u-new', username: 'amina', displayName: 'Amina Diallo', email: 'amina@example.test', role: 'USER', isActive: true };

async function monter(reponse: ApiResult<unknown> = { ok: true, data: CREE }) {
  const t = routedTransport((req: HttpRequest) => (req.method === 'POST' && pathOf(req) === '/api/v1/admin/users' ? reponse : undefined));
  const crees: AdminUserDetail[] = [];
  const annonces: string[] = [];
  const host = await mounter.mount(
    <AdminUserCreateSheet
      language="fr"
      deps={{ source: 'gateway', transport: t.transport }}
      onAnnounce={(texte) => annonces.push(texte)}
      onCreated={(membre) => crees.push(membre)}
      onClose={() => undefined}
    />,
  );
  return { host, calls: t.calls, crees, annonces };
}

function remplir(host: ParentNode) {
  mounter.type(host, '#admin-create-username', ' amina ');
  mounter.type(host, '#admin-create-firstName', 'Amina');
  mounter.type(host, '#admin-create-lastName', 'Diallo');
  mounter.type(host, '#admin-create-email', 'Amina@Example.test');
  mounter.type(host, '#admin-create-password', 'un secret robuste 2026');
}

describe('créer un compte', () => {
  test('envoie la saisie émondée, SANS attestation par défaut, et remet le membre créé', async () => {
    const { host, calls, crees, annonces } = await monter();
    remplir(host);

    await mounter.submit(host);

    const envoi = calls().find((req) => req.method === 'POST');
    expect(envoi?.body).toEqual({
      username: 'amina',
      firstName: 'Amina',
      lastName: 'Diallo',
      email: 'Amina@Example.test',
      password: 'un secret robuste 2026',
      role: 'USER',
      systemLanguage: 'fr',
    });
    expect(crees.map((m) => m.id)).toEqual(['u-new']);
    expect(annonces).toContain('Compte créé');
  });

  test('cocher l’attestation la fait partir', async () => {
    const { host, calls } = await monter();
    remplir(host);

    await mounter.click(host.querySelector<HTMLInputElement>('[data-admin-create-verified]'));
    await mounter.submit(host);

    expect((calls().find((req) => req.method === 'POST')?.body as Record<string, unknown>).emailVerified).toBe(true);
  });

  test('une saisie incomplète ne part pas', async () => {
    const { host, calls } = await monter();
    mounter.type(host, '#admin-create-username', 'amina');

    await mounter.submit(host);

    expect(calls()).toEqual([]);
    expect(host.querySelector('[data-admin-create-refused]')?.textContent).toBe('Renseignez tous les champs.');
  });
});

describe('les refus se posent sous leur champ', () => {
  test('adresse prise ⇒ sous l’e-mail', async () => {
    const { host, crees } = await monter({ ok: false, status: 409, error: 'taken', code: 'EMAIL_TAKEN' });
    remplir(host);

    await mounter.submit(host);

    expect(host.querySelector('#admin-create-email')?.getAttribute('aria-invalid')).toBe('true');
    expect(host.textContent).toContain('Cette adresse est déjà utilisée par un autre compte.');
    expect(crees).toEqual([]);
  });

  test('pseudonyme pris ⇒ sous le pseudonyme', async () => {
    const { host } = await monter({ ok: false, status: 409, error: 'taken', code: 'USERNAME_TAKEN' });
    remplir(host);

    await mounter.submit(host);

    expect(host.querySelector('#admin-create-username')?.getAttribute('aria-invalid')).toBe('true');
    expect(host.textContent).toContain('Ce pseudonyme est déjà pris.');
  });

  test('mot de passe refusé ⇒ la raison de la passerelle, redite', async () => {
    const { host } = await monter({ ok: false, status: 400, error: 'Password requirements: too guessable' });
    remplir(host);

    await mounter.submit(host);

    expect(host.querySelector('[data-admin-create-refused]')?.textContent).toBe('Création refusée : Password requirements: too guessable');
  });
});
