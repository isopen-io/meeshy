import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadAdminInterfaceCatalog, translateAdmin } from '@/lib/i18n-admin-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { pathOf, routedTransport } from '@/test-support/routed-transport';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminUserPasswordSheet } from './admin-user-password-sheet';

/**
 * **QUATRE NIVEAUX DE MOT DE PASSE, ET UN CHAMP QU'ON PEUT ÉCRIRE** (#8051) —
 * ce que l'administrateur voit et ce qui part : les niveaux viennent de la
 * passerelle, un niveau choisi remplit le champ, le champ se retouche, et
 * c'est la valeur AFFICHÉE qui est appliquée — jamais une autre.
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

const PROPOSITIONS = { simple: 'alice482', easy: 'Alice-4821!', medium: 'Alice.k7Qm!4821', hard: 'Xq4mR9pTw2sKfH7nJbVc' };
const AUTRES = { simple: 'alice739', easy: 'Alice-7392?', medium: 'Alice.Wd3p#7392', hard: 'Ns7kPq2wVb4xZm9tRc3f' };

type Options = {
  readonly propositions?: ReadonlyArray<Record<string, string>>;
  readonly refusDeReset?: string;
  readonly propositionsEnPanne?: boolean;
};

async function monter(options: Options = {}) {
  const tirages = [...(options.propositions ?? [PROPOSITIONS])];
  const t = routedTransport((req) => {
    if (req.method === 'POST' && pathOf(req) === '/api/v1/admin/users/u-alice/password-proposals') {
      if (options.propositionsEnPanne) return { ok: false, status: 500, error: 'Internal server error' };
      const tirage = tirages.length > 1 ? tirages.shift() : tirages[0];
      return { ok: true, data: tirage };
    }
    if (req.method === 'POST' && pathOf(req) === '/api/v1/admin/users/u-alice/reset-password') {
      if (options.refusDeReset !== undefined) return { ok: false, status: 400, error: options.refusDeReset };
      return { ok: true, data: { message: 'Password reset successfully' } };
    }
    return undefined;
  });
  const annonces: string[] = [];
  const copies: string[] = [];
  let fermetures = 0;
  const host = await mounter.mount(
    <AdminUserPasswordSheet
      userId="u-alice"
      language="fr"
      deps={{ source: 'gateway', transport: t.transport }}
      portail={{ copier: async (texte) => void copies.push(texte) }}
      onAnnounce={(texte) => annonces.push(texte)}
      onClose={() => {
        fermetures += 1;
      }}
    />,
  );
  await mounter.settle();
  return { host, calls: t.calls, annonces, copies, fermetures: () => fermetures };
}

const champ = (host: ParentNode) => host.querySelector<HTMLInputElement>('[data-admin-password]');
const puce = (host: ParentNode, niveau: string) => host.querySelector<HTMLButtonElement>(`[data-admin-password-level="${niveau}"]`);
const appliquer = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-admin-password-apply]');
const puceEnfoncee = (host: ParentNode) =>
  [...host.querySelectorAll<HTMLButtonElement>('[data-admin-password-level]')].find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.adminPasswordLevel ?? null;

describe('les quatre niveaux viennent de la passerelle', () => {
  test('propose le niveau difficile à l’ouverture, et les quatre puces dans l’ordre', async () => {
    const { host, calls } = await monter();

    expect(calls().filter((req) => pathOf(req).endsWith('/password-proposals'))).toHaveLength(1);
    expect([...host.querySelectorAll('[data-admin-password-level]')].map((b) => b.textContent?.trim())).toEqual([
      'Simple',
      'Facile',
      'Moyen',
      'Difficile',
    ]);
    expect(puceEnfoncee(host)).toBe('hard');
    expect(champ(host)?.value).toBe(PROPOSITIONS.hard);
  });

  test('choisir un niveau remplit le champ de SA proposition', async () => {
    const { host } = await monter();

    await mounter.click(puce(host, 'simple'));
    expect(champ(host)?.value).toBe(PROPOSITIONS.simple);
    expect(puceEnfoncee(host)).toBe('simple');

    await mounter.click(puce(host, 'medium'));
    expect(champ(host)?.value).toBe(PROPOSITIONS.medium);
    expect(puceEnfoncee(host)).toBe('medium');
  });

  test('« Autre proposition » retire à nouveau et remplace le niveau courant', async () => {
    const { host, calls } = await monter({ propositions: [PROPOSITIONS, AUTRES] });
    await mounter.click(puce(host, 'easy'));

    await mounter.click(host.querySelector<HTMLButtonElement>('[data-admin-password-regenerate]'));

    expect(calls().filter((req) => pathOf(req).endsWith('/password-proposals'))).toHaveLength(2);
    expect(champ(host)?.value).toBe(AUTRES.easy);
    expect(puceEnfoncee(host)).toBe('easy');
  });

  test('sans propositions, les puces se désactivent et le champ reste ouvert à la saisie', async () => {
    const { host } = await monter({ propositionsEnPanne: true });

    expect(puce(host, 'simple')?.disabled).toBe(true);
    expect(host.textContent).toContain(translateAdmin('fr', 'admin.password.proposals.failed'));
    mounter.type(host, '[data-admin-password]', 'MonSecretAMoi2026!');
    expect(appliquer(host)?.disabled).toBe(false);
  });
});

describe('ce qui est affiché est ce qui part', () => {
  test('applique la proposition du niveau choisi, telle quelle, puis ferme', async () => {
    const { host, calls, annonces, fermetures } = await monter();
    await mounter.click(puce(host, 'simple'));

    await mounter.click(appliquer(host));

    const reset = calls().find((req) => pathOf(req).endsWith('/reset-password'));
    expect(reset?.body).toEqual({ newPassword: PROPOSITIONS.simple });
    expect(annonces).toContain(translateAdmin('fr', 'admin.password.done'));
    expect(fermetures()).toBe(1);
  });

  test('écrire dans le champ sort des niveaux, et c’est la saisie qui part', async () => {
    const { host, calls } = await monter();

    mounter.type(host, '[data-admin-password]', 'Alice-choisit-2026');
    expect(puceEnfoncee(host)).toBeNull();

    await mounter.click(appliquer(host));

    const reset = calls().find((req) => pathOf(req).endsWith('/reset-password'));
    expect(reset?.body).toEqual({ newPassword: 'Alice-choisit-2026' });
  });

  test('une saisie sous le plancher n’appelle pas la passerelle', async () => {
    const { host, calls } = await monter();

    mounter.type(host, '[data-admin-password]', 'abc');

    expect(appliquer(host)?.disabled).toBe(true);
    await mounter.click(appliquer(host));
    expect(calls().some((req) => pathOf(req).endsWith('/reset-password'))).toBe(false);
  });

  test('un refus de la passerelle s’affiche sous le champ, et la feuille reste ouverte', async () => {
    const { host, annonces, fermetures } = await monter({ refusDeReset: 'Password requirements: password strength score is 0/4 (minimum: 1/4)' });
    mounter.type(host, '[data-admin-password]', 'aaaaaaaa');

    await mounter.click(appliquer(host));

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('password strength score is 0/4');
    expect(annonces).toContain(translateAdmin('fr', 'admin.password.failed'));
    expect(fermetures()).toBe(0);
  });

  test('copie la valeur AFFICHÉE — la saisie de l’administrateur quand il en a fait une', async () => {
    const { host, copies } = await monter();
    mounter.type(host, '[data-admin-password]', 'Alice-choisit-2026');

    const copier = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === translateAdmin('fr', 'admin.password.copy'));
    await mounter.click(copier ?? null);

    expect(copies).toEqual(['Alice-choisit-2026']);
  });
});
