import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiFailure, ApiResult } from '@/lib/api/http';
import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { EmailNotificationsPage, type EmailNotificationsPageDeps } from './settings-notifications';

/**
 * `/settings/notifications` RENDU (#6715) — le lien de désabonnement des
 * diffusions. La page DIT l'état, et un seul geste le retourne : optimiste,
 * défait sur un refus. Arriver sur la page ne désabonne pas — un pré-chargeur
 * de lien ne doit rien changer (#4183).
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click, settle } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(unmountAll);

const ok = (data: boolean): ApiResult<boolean> => ({ ok: true, data });
const refused = (status: number): ApiFailure => ({ ok: false, status, error: 'refus' });

function scripted(loads: ReadonlyArray<ApiResult<boolean>>, save: (enabled: boolean) => Promise<ApiResult<boolean>> = async (enabled) => ok(enabled)) {
  const loaded: number[] = [];
  const saved: boolean[] = [];
  const deps: EmailNotificationsPageDeps = {
    load: async () => {
      loaded.push(loaded.length);
      return loads[Math.min(loaded.length, loads.length) - 1] ?? refused(500);
    },
    save: async (enabled) => {
      saved.push(enabled);
      return save(enabled);
    },
  };
  return { deps, loaded, saved };
}

describe('/settings/notifications — l’état, puis un geste', () => {
  test('sans session : rien n’est lu, et la page dit pourquoi', async () => {
    const script = scripted([ok(true)]);
    const host = await mount(<EmailNotificationsPage signedIn={false} language="fr" deps={script.deps} />);

    expect(script.loaded).toEqual([]);
    expect(host.querySelector('h1')?.textContent).toBe('Connectez-vous pour continuer');
    expect(host.querySelector('a[href="/login"]')).not.toBeNull();
  });

  test('abonné : l’état est dit, et un geste désabonne — arriver ne change rien', async () => {
    const script = scripted([ok(true)]);
    const host = await mount(<EmailNotificationsPage signedIn language="fr" deps={script.deps} />);

    expect(host.querySelector('h1')?.textContent).toBe('E-mails de Meeshy');
    expect(host.textContent).toContain('Vous recevez les annonces');
    expect(host.textContent).toContain('Les e-mails de sécurité de votre compte continuent d’arriver.');
    expect(script.saved).toEqual([]);

    await click(buttonNamed(host, 'Ne plus recevoir ces e-mails'));

    expect(script.saved).toEqual([false]);
    expect(host.textContent).toContain('Vous ne recevez plus');
    expect(buttonNamed(host, 'Recevoir de nouveau ces e-mails')?.style.minHeight).toBe('52px');
  });

  test('le geste se voit avant la réponse', async () => {
    const pending: Array<(reply: ApiResult<boolean>) => void> = [];
    const script = scripted([ok(true)], () => new Promise((resolve) => pending.push(resolve)));
    const host = await mount(<EmailNotificationsPage signedIn language="fr" deps={script.deps} />);

    await click(buttonNamed(host, 'Ne plus recevoir ces e-mails'));
    expect(host.textContent).toContain('Vous ne recevez plus');

    await act(async () => {
      pending.forEach((resolve) => resolve(ok(false)));
    });
    await settle();
    expect(host.textContent).toContain('Vous ne recevez plus');
  });

  test('un refus défait le geste, et le dit', async () => {
    const script = scripted([ok(true)], async () => refused(500));
    const host = await mount(<EmailNotificationsPage signedIn language="fr" deps={script.deps} />);

    await click(buttonNamed(host, 'Ne plus recevoir ces e-mails'));

    expect(host.textContent).toContain('Vous recevez les annonces');
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Le changement n’a pas abouti. Réessayez.');
  });

  test('hors ligne à la lecture : « Réessayer » relit', async () => {
    const script = scripted([refused(0), ok(false)]);
    const host = await mount(<EmailNotificationsPage signedIn language="fr" deps={script.deps} />);

    expect(host.querySelector('h1')?.textContent).toBe('Hors ligne');
    await click(buttonNamed(host, 'Réessayer'));

    expect(script.loaded).toHaveLength(2);
    expect(host.textContent).toContain('Vous ne recevez plus');
  });
});
