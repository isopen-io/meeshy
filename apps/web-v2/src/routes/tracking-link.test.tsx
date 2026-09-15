import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiFailure, ApiResult } from '@/lib/api/http';
import type { ClickContext } from '@/lib/links/click-context';
import type { TrackingClick, TrackingResolution } from '@/lib/links/tracking-redirect';
import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { TrackingLinkRedirect, type TrackingLinkDeps } from './tracking-link';
import { TrackingLinkDead } from './tracking-link-expired';

/**
 * `/l/:token` RENDU (#6714) — le clic part avec son contexte, la cible sûre
 * s'ouvre, une cible dangereuse ou un lien mort mènent à `/l/:token/expired`,
 * et une passerelle en échec garde le lecteur sur la page avec un geste pour
 * réessayer. `leave` et `go` sont injectés : aucun témoin ne quitte le
 * document.
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

const ok = <T,>(data: T): ApiResult<T> => ({ ok: true, data });
const refused = (status: number, code?: string): ApiFailure => ({ ok: false, status, error: 'refus', ...(code === undefined ? {} : { code }) });
const link = (overrides: Partial<TrackingResolution> = {}): ApiResult<TrackingResolution> =>
  ok({ kind: 'tracking', originalUrl: 'https://example.com/a', isActive: true, ...overrides });

function scripted(clickReply: ApiResult<TrackingClick>, resolution: ApiResult<TrackingResolution>) {
  const recorded: Array<{ readonly token: string; readonly context: ClickContext }> = [];
  const resolved: string[] = [];
  const left: string[] = [];
  const went: Array<{ readonly url: string; readonly replace: boolean }> = [];
  const deps: TrackingLinkDeps = {
    record: async (token, context) => {
      recorded.push({ token, context });
      return clickReply;
    },
    resolve: async (token) => {
      resolved.push(token);
      return resolution;
    },
    context: () => ({ socialSource: 'Direct' }),
    leave: (target) => {
      left.push(target);
    },
    go: (url, replace = false) => {
      went.push({ url, replace });
    },
  };
  return { deps, recorded, resolved, left, went };
}

describe('/l/:token — le clic compté, puis la cible', () => {
  test('une cible sûre : le clic part avec son contexte, puis la page la rejoint', async () => {
    const script = scripted(ok({ originalUrl: 'https://example.com/a' }), link());
    const host = await mount(<TrackingLinkRedirect token="abc123" language="fr" deps={script.deps} />);

    expect(script.recorded).toEqual([{ token: 'abc123', context: { socialSource: 'Direct' } }]);
    expect(script.resolved).toEqual(['abc123']);
    expect(script.left).toEqual(['https://example.com/a']);
    expect(script.went).toEqual([]);
    expect(host.textContent).toContain('Ouverture du lien…');
  });

  test('une cible javascript: ne sort pas : la page mène à l’état du lien mort', async () => {
    const script = scripted(ok({ originalUrl: 'javascript:alert(document.cookie)' }), link({ originalUrl: 'javascript:alert(document.cookie)' }));
    await mount(<TrackingLinkRedirect token="abc123" language="fr" deps={script.deps} />);

    expect(script.left).toEqual([]);
    expect(script.went).toEqual([{ url: '/l/abc123/expired', replace: true }]);
  });

  test('un lien inconnu mène à /l/:token/expired, sans empiler l’historique', async () => {
    const script = scripted(refused(404), refused(404));
    await mount(<TrackingLinkRedirect token="abc123" language="fr" deps={script.deps} />);
    expect(script.went).toEqual([{ url: '/l/abc123/expired', replace: true }]);
  });

  test('un lien expiré ou désactivé aussi', async () => {
    const script = scripted(refused(410, 'LINK_EXPIRED'), link({ isActive: false }));
    await mount(<TrackingLinkRedirect token="abc123" language="fr" deps={script.deps} />);
    expect(script.left).toEqual([]);
    expect(script.went).toEqual([{ url: '/l/abc123/expired', replace: true }]);
  });

  test('une invitation de conversation ouvre la jonction de la v2', async () => {
    const script = scripted(refused(404), link({ kind: 'conversation', originalUrl: null }));
    await mount(<TrackingLinkRedirect token="mshy_abc" language="fr" deps={script.deps} />);
    expect(script.went).toEqual([{ url: '/chat/mshy_abc', replace: true }]);
  });

  test('un jeton hors forme ne consulte pas la passerelle', async () => {
    const script = scripted(ok({ originalUrl: 'https://example.com/' }), link());
    await mount(<TrackingLinkRedirect token="x" language="fr" deps={script.deps} />);
    expect(script.recorded).toEqual([]);
    expect(script.resolved).toEqual([]);
    expect(script.went).toEqual([{ url: '/l/x/expired', replace: true }]);
  });
});

describe('/l/:token — une passerelle en échec a son propre état', () => {
  test('en panne : l’état le dit, et « Réessayer » recompte le clic', async () => {
    const script = scripted(refused(500), refused(502));
    const host = await mount(<TrackingLinkRedirect token="abc123" language="fr" deps={script.deps} />);

    expect(host.querySelector('h1')?.textContent).toBe('Meeshy ne répond pas');
    expect(script.went).toEqual([]);
    const retry = buttonNamed(host, 'Réessayer');
    expect(retry?.style.minHeight).toBe('52px');

    await click(retry);
    expect(script.recorded).toHaveLength(2);
  });

  test('hors ligne : l’état hors ligne, pas un lien mort', async () => {
    const script = scripted(refused(0), refused(0));
    const host = await mount(<TrackingLinkRedirect token="abc123" language="fr" deps={script.deps} />);
    expect(host.querySelector('h1')?.textContent).toBe('Hors ligne');
    expect(host.textContent).toContain('Reconnectez-vous à Internet, puis réessayez.');
    expect(script.went).toEqual([]);
  });
});

describe('/l/:token/expired — le lien mort le dit', () => {
  test('un titre, une explication, et un retour vers Meeshy', () => {
    const html = renderToStaticMarkup(<TrackingLinkDead language="fr" />);
    expect(html).toContain('Ce lien n’est plus disponible');
    expect(html).toContain('Il a expiré, a été désactivé ou n’a jamais existé.');
    expect(html).toContain('href="/"');
    expect(html).toContain('Retour à Meeshy');
    expect(html).toContain('min-height:52px');
  });
});
