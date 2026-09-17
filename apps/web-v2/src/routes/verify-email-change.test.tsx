import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { EmailChangeResult } from '@/lib/api/email-change';
import type { ApiFailure, ApiResult } from '@/lib/api/http';
import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { VerifyEmailChangePage, type VerifyEmailChangeDeps } from './verify-email-change';

/**
 * `/settings/verify-email-change?token=` RENDU (#6715) — le jeton se consomme
 * UNE fois, sous session : la passerelle vérifie le changement en attente du
 * compte CONNECTÉ. Sans session, la page ne dépense pas le jeton et dit quoi
 * faire ; chaque refus a son motif.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(unmountAll);

const refused = (status: number, error = 'refus'): ApiFailure => ({ ok: false, status, error });

function scripted(...replies: ReadonlyArray<ApiResult<EmailChangeResult>>) {
  const verified: string[] = [];
  const deps: VerifyEmailChangeDeps = {
    verify: async (token) => {
      verified.push(token);
      return replies[Math.min(verified.length, replies.length) - 1] ?? refused(500);
    },
  };
  return { deps, verified };
}

describe('/settings/verify-email-change — le jeton, sous session', () => {
  test('sans session : le jeton n’est pas dépensé, et la page dit pourquoi', async () => {
    const script = scripted({ ok: true, data: { email: 'awa@nouveau.example' } });
    const host = await mount(<VerifyEmailChangePage token="tok" signedIn={false} language="fr" deps={script.deps} />);

    expect(script.verified).toEqual([]);
    expect(host.querySelector('h1')?.textContent).toBe('Connectez-vous pour continuer');
    expect(host.querySelector('a[href="/login"]')?.textContent).toBe('Se connecter');
  });

  test('connecté : le jeton est consommé une fois, et la nouvelle adresse est dite', async () => {
    const script = scripted({ ok: true, data: { email: 'awa@nouveau.example' } });
    const host = await mount(<VerifyEmailChangePage token="tok" signedIn language="fr" deps={script.deps} />);

    expect(script.verified).toEqual(['tok']);
    expect(host.querySelector('h1')?.textContent).toBe('Adresse e-mail modifiée');
    expect(host.textContent).toContain('Vous vous connectez désormais avec awa@nouveau.example.');
    expect(host.querySelector('a[href="/settings"]')?.textContent).toBe('Ouvrir les réglages');
  });

  test('sans jeton : aucun appel, un motif', async () => {
    const script = scripted();
    const host = await mount(<VerifyEmailChangePage token={null} signedIn language="fr" deps={script.deps} />);

    expect(script.verified).toEqual([]);
    expect(host.textContent).toContain('Ce lien ne porte pas de code de confirmation.');
  });
});

describe('/settings/verify-email-change — un refus motivé', () => {
  test('un lien expiré', async () => {
    const host = await mount(
      <VerifyEmailChangePage token="tok" signedIn language="fr" deps={scripted(refused(400, 'Verification token has expired')).deps} />,
    );
    expect(host.querySelector('h1')?.textContent).toBe('Adresse non modifiée');
    expect(host.textContent).toContain('Ce lien a expiré.');
  });

  test('une adresse prise entre-temps', async () => {
    const host = await mount(
      <VerifyEmailChangePage token="tok" signedIn language="fr" deps={scripted(refused(400, 'This email address is no longer available')).deps} />,
    );
    expect(host.textContent).toContain('Cette adresse est désormais utilisée par un autre compte.');
  });

  test('hors ligne : « Réessayer » relance la vérification', async () => {
    const script = scripted(refused(0), { ok: true, data: { email: null } });
    const host = await mount(<VerifyEmailChangePage token="tok" signedIn language="fr" deps={script.deps} />);

    expect(host.querySelector('h1')?.textContent).toBe('Hors ligne');
    await click(buttonNamed(host, 'Réessayer'));

    expect(script.verified).toEqual(['tok', 'tok']);
    expect(host.textContent).toContain('Votre nouvelle adresse e-mail est confirmée.');
  });
});
