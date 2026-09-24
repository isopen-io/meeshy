import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SocketIOMessage } from '@meeshy/shared/types/socketio-events/message';

import { decodeMessage } from '@/lib/api/decode';
import type { FeedPost } from '@/lib/api/feed-pages';
import { message } from '@/lib/api/fixtures-base';
import { rawMessageFromSocket } from '@/lib/api/realtime-apply';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { compile, match } from '@/lib/router';
import { ROUTES } from '@/routes/route-table';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { RichText } from './rich-text';

/**
 * **UN LIEN DE SUIVI S'OUVRE PAR `/l/<token>`** (#7827) — la route qui compte
 * le clic puis redirige (`routes/tracking-link.tsx`). Deux formes arrivent de
 * la passerelle :
 *
 *  1. `m+<token>`, écrit à la place d'un `[[url]]` / `<url>` — rendu comme un
 *     lien INTERNE, avec un libellé lisible plutôt que le code brut ;
 *  2. une URL BRUTE dont `{ url, token }` voyage dans `metadata.trackingLinks`
 *     (REST) ou hissé en `trackingLinks` (socket) — le TEXTE affiché reste
 *     l'adresse, seul le lien SUIVI passe par `/l/<token>`.
 *
 * Et la donnée doit ARRIVER jusqu'au rendu : un décodeur qui la jette rend la
 * loi inatteignable une couche plus haut (#7328).
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root !== null) {
    const mounted = root;
    act(() => mounted.unmount());
  }
  container?.remove();
  root = null;
  container = null;
  window.history.replaceState(null, '', '/');
});

function mount(node: React.ReactNode): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const mounted = root;
  act(() => {
    mounted.render(node as never);
  });
  return container;
}

const hrefsOf = (html: string): readonly string[] => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1] ?? '');

const resolvesAgainstRouteTable = (url: string): boolean =>
  Object.values(ROUTES).some((route) => match(compile(route.pattern), url) !== null);

const TRACKED = [{ url: 'https://meeshy.me/notes', token: 'Tok123' }] as const;

describe('RichText — le lien court m+<token>', () => {
  test('pointe vers /l/<token>, une adresse que la table de routes sert', () => {
    const html = renderToStaticMarkup(<RichText text="regarde m+Ab12cd" />);
    expect(hrefsOf(html)).toEqual(['/l/Ab12cd']);
    expect(hrefsOf(html).every(resolvesAgainstRouteTable)).toBe(true);
  });

  test('montre un libellé LISIBLE, jamais le code brut « m+… »', () => {
    const html = renderToStaticMarkup(<RichText text="regarde m+Ab12cd" />);
    expect(html).toContain('meeshy.me/l/Ab12cd');
    expect(html).not.toContain('m+Ab12cd');
  });

  test('est un lien INTERNE : pas de nouvel onglet, et un clic change l’adresse sans recharger', () => {
    const host = mount(<RichText text="regarde m+Ab12cd" />);
    const anchor = host.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('target')).toBeNull();
    act(() => {
      anchor?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(window.location.pathname).toBe('/l/Ab12cd');
  });
});

describe('RichText — l’URL brute suivie', () => {
  test('garde son texte, mais son lien passe par /l/<token>', () => {
    const html = renderToStaticMarkup(<RichText text="lis https://meeshy.me/notes." trackingLinks={TRACKED} />);
    expect(hrefsOf(html)).toEqual(['/l/Tok123']);
    expect(html).toContain('https://meeshy.me/notes</a>.');
  });

  test('sans trackingLinks, la même URL reste un lien externe direct', () => {
    const html = renderToStaticMarkup(<RichText text="lis https://meeshy.me/notes" />);
    expect(hrefsOf(html)).toEqual(['https://meeshy.me/notes']);
  });
});

describe('la donnée ARRIVE jusqu’au rendu', () => {
  const base = { id: 'm1', conversationId: 'c1', senderId: 'u1', content: 'lis https://meeshy.me/notes', originalLanguage: 'fr' };

  test('REST : decodeMessage lit metadata.trackingLinks', () => {
    const decoded = decodeMessage(
      message({
        ...base,
        translations: [],
        createdAt: new Date('2026-09-24T10:00:00Z'),
        metadata: { trackingLinks: [...TRACKED] },
      }),
    );
    expect(decoded.trackingLinks).toEqual([...TRACKED]);
  });

  test('decodeMessage écarte une forme hostile sans lever, et n’invente pas de champ vide', () => {
    const hostile = decodeMessage(
      message({
        ...base,
        translations: [],
        createdAt: new Date('2026-09-24T10:00:00Z'),
        trackingLinks: [{ url: 'https://x.io', token: '../admin' }],
        metadata: { trackingLinks: 'nope' },
      }),
    );
    expect('trackingLinks' in hostile).toBe(false);
  });

  test('socket : message:new porte `trackingLinks` hissé, et le décodage le garde', () => {
    const raw: SocketIOMessage = {
      ...base,
      messageType: 'text',
      createdAt: '2026-09-24T10:00:00.000Z' as unknown as Date,
      trackingLinks: [...TRACKED],
    };
    expect(decodeMessage(rawMessageFromSocket(raw)).trackingLinks).toEqual([...TRACKED]);
  });

  test('publication : le texte de la carte porte les liens suivis du post', () => {
    const post: FeedPost = {
      id: 'p1',
      type: 'POST',
      createdAt: '2026-09-24T10:00:00.000Z',
      content: 'lis https://meeshy.me/notes',
      metadata: { trackingLinks: [...TRACKED] },
    };
    const model = resolveFeedCardModel(post, { preferredLanguages: ['fr'], now: new Date('2026-09-24T10:05:00Z') });
    expect(model.text?.trackingLinks).toEqual([...TRACKED]);
  });
});
