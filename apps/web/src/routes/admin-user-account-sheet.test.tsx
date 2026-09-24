import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadAdminInterfaceCatalog, translateAdmin } from '@/lib/i18n-admin-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { adminMember, pathOf, routedTransport } from '@/test-support/admin-member';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminUserAccountSheet } from './admin-user-account-sheet';
import { AdminUserEditSheet } from './admin-user-edit-sheet';

/**
 * **LES DEUX FEUILLES D'ÉCRITURE DU COMPTE** (#7845) — la feuille de sécurité
 * et de vérifications confirme chaque geste avant de l'envoyer ; la feuille
 * d'édition porte désormais les noms, le pseudo, le téléphone, le fuseau, les
 * trois langues et la bannière, et n'envoie que ce qui a changé.
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

const RENVOI = { id: 'u-membre', username: 'membre', displayName: 'Le membre' };

function transport() {
  return routedTransport((req) => (req.method === 'PATCH' && pathOf(req).startsWith('/api/v1/admin/users/u-membre') ? { ok: true, data: RENVOI } : undefined));
}

describe('sécurité et vérifications', () => {
  test('désactiver la double authentification se CONFIRME, puis part en PATCH …/security', async () => {
    const t = transport();
    const annonces: string[] = [];
    await mounter.mount(
      <AdminUserAccountSheet
        membre={adminMember({ twoFactorEnabled: true, twoFactorEnabledAt: '2026-01-01T00:00:00.000Z' })}
        language="fr"
        deps={{ source: 'gateway', transport: t.transport }}
        onClose={() => undefined}
        onSaved={() => undefined}
        onAnnounce={(x) => annonces.push(x)}
      />,
    );
    const bouton = () => document.querySelector('[data-admin-account-action="twoFactorOff"]') as HTMLElement | null;
    await mounter.click(bouton());
    expect(t.calls()).toHaveLength(0);
    await mounter.click(bouton());
    expect(t.calls()[0]?.path).toBe('/api/v1/admin/users/u-membre/security');
    expect(t.calls()[0]?.body).toEqual({ twoFactorEnabled: false });
    expect(annonces).toContain(translateAdmin('fr', 'admin.account.done'));
  });

  test('« Déverrouiller » n’existe que sur un compte verrouillé', async () => {
    await mounter.mount(
      <AdminUserAccountSheet membre={adminMember()} language="fr" onClose={() => undefined} onSaved={() => undefined} onAnnounce={() => undefined} />,
    );
    expect(document.querySelector('[data-admin-account-action="unlock"]')).toBe(null);
  });

  test('poser une preuve n’envoie que celle qui a changé', async () => {
    const t = transport();
    await mounter.mount(
      <AdminUserAccountSheet
        membre={adminMember()}
        language="fr"
        deps={{ source: 'gateway', transport: t.transport }}
        onClose={() => undefined}
        onSaved={() => undefined}
        onAnnounce={() => undefined}
      />,
    );
    await mounter.click(document.querySelector('[data-admin-account-proof="ageVerified"]') as HTMLElement | null);
    const enregistrer = () => document.querySelector('[data-admin-account-action="verifications"]') as HTMLElement | null;
    // Enregistrer des preuves n'est pas un geste destructeur : il ne s'en habille pas.
    expect(enregistrer()?.getAttribute('data-admin-account-tone')).toBe('brand');
    await mounter.click(enregistrer());
    await mounter.click(enregistrer());
    expect(t.calls()[0]?.path).toBe('/api/v1/admin/users/u-membre/verifications');
    expect(t.calls()[0]?.body).toEqual({ ageVerified: true });
  });
});

describe('l’édition du profil', () => {
  test('changer le prénom et la langue principale n’envoie que ces deux champs', async () => {
    const t = transport();
    await mounter.mount(
      <AdminUserEditSheet
        membre={adminMember()}
        language="fr"
        deps={{ source: 'gateway', transport: t.transport }}
        onClose={() => undefined}
        onSaved={() => undefined}
        onAnnounce={() => undefined}
      />,
    );
    mounter.type(document.body, '#admin-edit-firstName', 'Léonie');
    mounter.type(document.body, '#admin-edit-systemLanguage', 'fr');
    const enregistrer = [...document.querySelectorAll('button')].find((b) => b.textContent === translateAdmin('fr', 'admin.edit.save'));
    await mounter.click(enregistrer ?? null);
    expect(t.calls()[0]?.body).toEqual({ firstName: 'Léonie', systemLanguage: 'fr' });
  });
});
