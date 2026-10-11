import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { MagicLinkValidation } from '@/components/magic-link-validation';
import type { LoginResponseData } from '@/lib/api/auth';
import type { ApiResult } from '@/lib/api/http';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { landingAfterSession } from '@/lib/session-guard';
import { href } from '@/routes/route-table';
import { landingAfterRegistration } from '@/routes/signup';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * UNE SESSION QUI S'OUVRE MÈNE À LA LISTE, JAMAIS À LA LANDING (#10002,
 * décision porteur : « après connexion, inscription ou entrée invité :
 * `/chats` »). `/` désignait la liste jusqu'à #10002 : un `next` ou un
 * `returnUrl` qui la vise encore (lien d'un e-mail parti avant la bascule) se
 * lit comme elle.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, settle } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'https://meeshy.example/auth/magic-link?token=t' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});
afterEach(() => unmountAll());
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const signedIn: ApiResult<LoginResponseData> = {
  ok: true,
  data: { status: 'verification-required', accountCreated: false, email: 'ada@meeshy.example' },
};

const validatedTo = async (returnUrl: string | null): Promise<readonly string[]> => {
  const visits: string[] = [];
  await mount(<MagicLinkValidation token="t-1" returnUrl={returnUrl} validate={async () => signedIn} go={(path) => visits.push(path)} />);
  await settle();
  return visits;
};

describe('après connexion, la liste (#10002)', () => {
  test('`next` sur `/` (la liste d’avant #10002) mène à la liste, pas à la landing', () => {
    expect(landingAfterSession('/', href('list'))).toBe('/chats');
    expect(landingAfterSession('/c/abc', href('list'))).toBe('/c/abc');
  });

  test('un compte qui vient de s’inscrire avec `next` sur `/` va à l’accueil post-inscription, pas à la landing', () => {
    expect(landingAfterRegistration({ next: '/' })).toBe(href('onboarding'));
    expect(landingAfterRegistration({ next: '/chat/mshy_x' })).toBe('/chat/mshy_x');
  });

  test('un lien magique sans `returnUrl` ouvre /chats', async () => {
    expect(await validatedTo(null)).toEqual(['/chats']);
  });

  test('un lien magique dont le `returnUrl` est `/` ou hostile ouvre /chats', async () => {
    expect(await validatedTo('/')).toEqual(['/chats']);
    expect(await validatedTo('//evil.example')).toEqual(['/chats']);
  });

  test('un `returnUrl` interne reste honoré', async () => {
    expect(await validatedTo('/c/abc')).toEqual(['/c/abc']);
  });
});
