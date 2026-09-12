/**
 * L'image qui accompagne un sujet lancé par l'agent (#6192) : la passerelle
 * résout l'image Open Graph de l'article cité, sous garde SSRF (hôte public,
 * redirections bornées, type image, taille bornée). Tout échec rend null —
 * le message part en texte, jamais bloqué.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

import {
  extractOpenGraphImage,
  isPublicAddress,
  resolveAgentIllustration,
  type FetchLike,
  type LookupLike,
} from '../../../../services/zmq-agent/agent-illustration';

type FakeResponse = {
  status: number;
  headers: Record<string, string>;
  body?: string | Buffer;
};

function fakeFetch(routes: Record<string, FakeResponse | (() => FakeResponse)>): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const impl: FetchLike = async (url) => {
    calls.push(url);
    const route = routes[url];
    if (!route) throw new Error(`unexpected fetch ${url}`);
    const res = typeof route === 'function' ? route() : route;
    const body = res.body ?? '';
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    return {
      status: res.status,
      headers: { get: (name: string) => res.headers[name.toLowerCase()] ?? null },
      arrayBuffer: async () => new Uint8Array(buffer).buffer as ArrayBuffer,
      text: async () => buffer.toString('utf8'),
    };
  };
  return Object.assign(impl, { calls });
}

const publicLookup: LookupLike = async (hostname) => {
  if (hostname === 'intranet.local' || hostname === 'evil.example') return [{ address: '10.0.0.5', family: 4 }];
  if (hostname === 'localhost') return [{ address: '127.0.0.1', family: 4 }];
  return [{ address: '93.184.216.34', family: 4 }];
};

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const ARTICLE = 'https://www.camerounweb.com/faits-divers/bonaberi';
const IMAGE = 'https://cdn.camerounweb.com/photos/bonaberi.jpg';

function articleHtml(image = IMAGE): string {
  return `<html><head><title>Bonabéri</title><meta property="og:image" content="${image}" /></head><body>...</body></html>`;
}

describe('extractOpenGraphImage', () => {
  it('reads og:image whatever the attribute order', () => {
    expect(extractOpenGraphImage('<meta property="og:image" content="https://a.example/x.jpg">', ARTICLE)).toBe('https://a.example/x.jpg');
    expect(extractOpenGraphImage("<meta content='https://a.example/y.jpg' property='og:image'>", ARTICLE)).toBe('https://a.example/y.jpg');
  });

  it('falls back on twitter:image and decodes HTML entities', () => {
    const html = '<meta name="twitter:image" content="https://a.example/z.jpg?w=800&amp;h=600">';
    expect(extractOpenGraphImage(html, ARTICLE)).toBe('https://a.example/z.jpg?w=800&h=600');
  });

  it('resolves a relative image against the page URL', () => {
    expect(extractOpenGraphImage('<meta property="og:image" content="/img/une.png">', ARTICLE)).toBe('https://www.camerounweb.com/img/une.png');
  });

  it('prefers og:image over twitter:image', () => {
    const html = '<meta name="twitter:image" content="https://a.example/t.jpg"><meta property="og:image" content="https://a.example/og.jpg">';
    expect(extractOpenGraphImage(html, ARTICLE)).toBe('https://a.example/og.jpg');
  });

  it('returns null when the page declares no image', () => {
    expect(extractOpenGraphImage('<html><head><title>x</title></head></html>', ARTICLE)).toBeNull();
  });
});

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '192.168.0.10', '172.16.5.5', '172.31.255.255', '169.254.169.254', '0.0.0.0',
    '::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1', '100.64.0.1',
  ])('refuses %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111', '::ffff:93.184.216.34'])('accepts %s', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

describe('resolveAgentIllustration', () => {
  it('fetches the article, follows its og:image and returns the image bytes', async () => {
    const fetchImpl = fakeFetch({
      [ARTICLE]: { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: articleHtml() },
      [IMAGE]: { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': String(JPEG.length) }, body: JPEG },
    });

    const result = await resolveAgentIllustration({ sourceUrl: ARTICLE, fetchImpl, lookup: publicLookup });

    expect(result).not.toBeNull();
    expect(result!.mimeType).toBe('image/jpeg');
    expect(result!.filename).toBe('bonaberi.jpg');
    expect(result!.imageUrl).toBe(IMAGE);
    expect(Buffer.from(result!.buffer).equals(JPEG)).toBe(true);
    expect(fetchImpl.calls).toEqual([ARTICLE, IMAGE]);
  });

  it('uses the source itself when it already is an image', async () => {
    const fetchImpl = fakeFetch({
      [IMAGE]: { status: 200, headers: { 'content-type': 'image/jpeg' }, body: JPEG },
    });
    const result = await resolveAgentIllustration({ sourceUrl: IMAGE, fetchImpl, lookup: publicLookup });
    expect(result?.imageUrl).toBe(IMAGE);
  });

  it('refuses a source that is not http(s) without fetching', async () => {
    const fetchImpl = fakeFetch({});
    expect(await resolveAgentIllustration({ sourceUrl: 'ftp://x.example/a', fetchImpl, lookup: publicLookup })).toBeNull();
    expect(await resolveAgentIllustration({ sourceUrl: 'javascript:alert(1)', fetchImpl, lookup: publicLookup })).toBeNull();
    expect(fetchImpl.calls).toEqual([]);
  });

  it('refuses a source whose host resolves to a private address', async () => {
    const fetchImpl = fakeFetch({});
    expect(await resolveAgentIllustration({ sourceUrl: 'https://intranet.local/secret', fetchImpl, lookup: publicLookup })).toBeNull();
    expect(await resolveAgentIllustration({ sourceUrl: 'http://localhost:3000/api', fetchImpl, lookup: publicLookup })).toBeNull();
    expect(await resolveAgentIllustration({ sourceUrl: 'http://169.254.169.254/latest/meta-data', fetchImpl, lookup: publicLookup })).toBeNull();
    expect(fetchImpl.calls).toEqual([]);
  });

  it('refuses an og:image that points at a private host', async () => {
    const fetchImpl = fakeFetch({
      [ARTICLE]: { status: 200, headers: { 'content-type': 'text/html' }, body: articleHtml('http://evil.example/leak.jpg') },
    });
    expect(await resolveAgentIllustration({ sourceUrl: ARTICLE, fetchImpl, lookup: publicLookup })).toBeNull();
    expect(fetchImpl.calls).toEqual([ARTICLE]);
  });

  it('follows a bounded number of redirects and re-checks every hop', async () => {
    const hop1 = 'https://short.example/abc';
    const fetchImpl = fakeFetch({
      [hop1]: { status: 301, headers: { location: ARTICLE } },
      [ARTICLE]: { status: 200, headers: { 'content-type': 'text/html' }, body: articleHtml() },
      [IMAGE]: { status: 302, headers: { location: 'http://evil.example/leak.jpg' } },
    });
    expect(await resolveAgentIllustration({ sourceUrl: hop1, fetchImpl, lookup: publicLookup })).toBeNull();
    expect(fetchImpl.calls).toEqual([hop1, ARTICLE, IMAGE]);
  });

  it('gives up on a redirect loop instead of following it forever', async () => {
    const a = 'https://loop.example/a';
    const b = 'https://loop.example/b';
    const fetchImpl = fakeFetch({
      [a]: { status: 302, headers: { location: b } },
      [b]: { status: 302, headers: { location: a } },
    });
    expect(await resolveAgentIllustration({ sourceUrl: a, fetchImpl, lookup: publicLookup })).toBeNull();
    expect(fetchImpl.calls.length).toBeLessThanOrEqual(5);
  });

  it('refuses an image whose content-type is not an image', async () => {
    const fetchImpl = fakeFetch({
      [ARTICLE]: { status: 200, headers: { 'content-type': 'text/html' }, body: articleHtml() },
      [IMAGE]: { status: 200, headers: { 'content-type': 'text/html' }, body: '<html>not an image</html>' },
    });
    expect(await resolveAgentIllustration({ sourceUrl: ARTICLE, fetchImpl, lookup: publicLookup })).toBeNull();
  });

  it('refuses an image larger than the byte budget, announced or actual', async () => {
    const announced = fakeFetch({
      [ARTICLE]: { status: 200, headers: { 'content-type': 'text/html' }, body: articleHtml() },
      [IMAGE]: { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '999999999' }, body: JPEG },
    });
    expect(await resolveAgentIllustration({ sourceUrl: ARTICLE, fetchImpl: announced, lookup: publicLookup })).toBeNull();

    const actual = fakeFetch({
      [ARTICLE]: { status: 200, headers: { 'content-type': 'text/html' }, body: articleHtml() },
      [IMAGE]: { status: 200, headers: { 'content-type': 'image/jpeg' }, body: Buffer.alloc(200, 1) },
    });
    expect(await resolveAgentIllustration({ sourceUrl: ARTICLE, fetchImpl: actual, lookup: publicLookup, maxImageBytes: 100 })).toBeNull();
  });

  it('returns null when the article has no image or answers an error', async () => {
    const noImage = fakeFetch({
      [ARTICLE]: { status: 200, headers: { 'content-type': 'text/html' }, body: '<html><head></head></html>' },
    });
    expect(await resolveAgentIllustration({ sourceUrl: ARTICLE, fetchImpl: noImage, lookup: publicLookup })).toBeNull();

    const error = fakeFetch({ [ARTICLE]: { status: 503, headers: {} } });
    expect(await resolveAgentIllustration({ sourceUrl: ARTICLE, fetchImpl: error, lookup: publicLookup })).toBeNull();
  });

  it('returns null instead of throwing when the network fails', async () => {
    const fetchImpl = (async () => { throw new Error('ECONNRESET'); }) as unknown as FetchLike;
    expect(await resolveAgentIllustration({ sourceUrl: ARTICLE, fetchImpl, lookup: publicLookup })).toBeNull();
  });

  it('names the file after the image path and its mime type', async () => {
    const png = 'https://cdn.example/photos/une-du-jour';
    const fetchImpl = fakeFetch({
      [ARTICLE]: { status: 200, headers: { 'content-type': 'text/html' }, body: articleHtml(png) },
      [png]: { status: 200, headers: { 'content-type': 'image/png' }, body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]) },
    });
    const result = await resolveAgentIllustration({ sourceUrl: ARTICLE, fetchImpl, lookup: publicLookup });
    expect(result?.filename).toBe('une-du-jour.png');
  });
});

/**
 * LE DÉFAUT QUE LES DIX-SEPT CAS CI-DESSUS NE POUVAIENT PAS ATTRAPER (#6201).
 *
 * Ils injectent `fetchImpl` ET `lookup`, et les remplacent par une fiction
 * COHÉRENTE. Or les deux trous SSRF vivent précisément dans le DÉSACCORD entre
 * ces deux dépendances : la validation résout une fois, le transport résout une
 * seconde. Deux faux qui s'accordent ne peuvent pas exprimer un désaccord.
 *
 * > La couture qui rend une garde testable est ce qui rend la suite aveugle à
 * > son trou.
 *
 * Ces témoins sont donc écrits sur la COUTURE elle-même — un `lookup` qui rend
 * plusieurs adresses, et un qui change d'avis entre deux appels — et non sur ce
 * qu'elle protège. C'est la seule forme qui distingue « la garde existe » de
 * « la garde couvre toutes les réponses du résolveur ».
 */
describe('agent-illustration — la garde lit TOUTES les adresses du nom (#6201)', () => {
  const PUBLIC_IP = { address: '93.184.216.34', family: 4 } as const;
  const PRIVATE_IP = { address: '10.0.0.5', family: 4 } as const;
  const METADATA_IP = { address: '169.254.169.254', family: 4 } as const;

  /**
   * DEUX ENREGISTREMENTS A, un public et un privé. Aucune course à gagner : il
   * suffit de les publier. L'ordre est celui du DNS, donc l'attaquant le
   * choisit — les deux ordres sont testés, sans quoi le témoin passerait par
   * chance sur l'ordre favorable.
   */
  for (const [nom, adresses] of [
    ['public PUIS privée', [PUBLIC_IP, PRIVATE_IP]],
    ['privée PUIS publique', [PRIVATE_IP, PUBLIC_IP]],
    ['publique PUIS métadonnées cloud', [PUBLIC_IP, METADATA_IP]],
  ] as const) {
    it(`refuse un nom qui résout ${nom} — une seule adresse non publique suffit`, async () => {
      const fetchImpl = fakeFetch({});
      const lookup: LookupLike = async () => adresses;

      const result = await resolveAgentIllustration({ sourceUrl: ARTICLE, fetchImpl, lookup });

      expect(result).toBeNull();
      // Et la requête ne part MÊME PAS : une garde qui refuse après avoir
      // laissé partir la connexion n'a rien gardé.
      expect(fetchImpl.calls).toEqual([]);
    });
  }

  /**
   * LA CONTRE-ÉPREUVE, sans quoi les trois cas ci-dessus passeraient sur un
   * résolveur qui refuserait TOUT : plusieurs adresses, toutes publiques ⇒ la
   * requête part.
   */
  it('CONTRÔLE : plusieurs adresses TOUTES publiques ⇒ la requête part', async () => {
    const fetchImpl = fakeFetch({
      [ARTICLE]: { status: 200, headers: { 'content-type': 'text/html' }, body: articleHtml() },
      [IMAGE]: { status: 200, headers: { 'content-type': 'image/jpeg' }, body: JPEG },
    });
    const lookup: LookupLike = async () => [PUBLIC_IP, { address: '93.184.216.35', family: 4 }];

    const result = await resolveAgentIllustration({ sourceUrl: ARTICLE, fetchImpl, lookup });

    expect(result).not.toBeNull();
    expect(fetchImpl.calls).toEqual([ARTICLE, IMAGE]);
  });

  /**
   * UNE RÉSOLUTION VIDE EST REFUSÉE. `[].every(...)` rend `true` : sans le
   * refus explicite du vide, un nom qui ne résout rien passerait la garde. Ce
   * témoin garde la ligne qui l'empêche — c'est un vert à vide qu'aucun autre
   * cas ne verrait.
   */
  it('refuse un nom dont la résolution est VIDE — `[].every` rend true', async () => {
    const fetchImpl = fakeFetch({});
    const lookup: LookupLike = async () => [];

    expect(await resolveAgentIllustration({ sourceUrl: ARTICLE, fetchImpl, lookup })).toBeNull();
    expect(fetchImpl.calls).toEqual([]);
  });

  /**
   * LE TROU 1 (TOCTOU / rebinding) N'EST PAS TESTABLE ICI, ET C'EST LA VRAIE
   * LEÇON DE #6201.
   *
   * J'ai d'abord écrit un témoin censé constater la dette : un `lookup` rendant
   * une adresse publique au 1er appel et celle des métadonnées au 2e, et
   * `expect(result).not.toBeNull()`. Il a ROUGI — `result` était `null` — et sa
   * cause démonte l'idée même du témoin : les deux appels à `lookup` que la
   * garde fait ne sont pas « validation puis transport », ce sont les
   * validations de DEUX URL (l'article, puis l'image extraite de son HTML). Le
   * second refus venait de la garde qui fonctionne, pas du défaut.
   *
   * Le désaccord validation/transport est INOBSERVABLE tant que `fetchImpl` est
   * injecté, parce qu'un faux transport ne résout AUCUN nom : il n'y a pas de
   * seconde résolution à contredire. Aucun arrangement des faux ne contourne
   * cela — c'est la couture elle-même qui le rend invisible.
   *
   * > Un défaut qui vit dans le DÉSACCORD de deux dépendances injectées ne peut
   * > pas être vu par une suite qui les injecte toutes les deux. Ce n'est pas un
   * > témoin qui manque, c'est un NIVEAU de test : il faut un transport réel
   * > (résolveur local pointant deux A, ou serveur de test) pour l'exercer.
   *
   * La dette est donc portée par #6201 et par ce commentaire, PAS par un test
   * qui affirmerait un comportement. Le jour où l'épinglage au connect est posé
   * (une des trois voies de l'issue), la preuve devra venir d'un test
   * d'intégration — et ce bloc devra le citer.
   */
});
