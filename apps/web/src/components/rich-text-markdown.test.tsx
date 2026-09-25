import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { internalPathOf } from '@/lib/links/internal-link';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { RichText } from './rich-text';

/**
 * LE MARKDOWN LÉGER ET LES LIENS D'UN MESSAGE, RENDUS (#7849) :
 *  - le code, les liens markdown, les courriels et les blocs rendent les
 *    balises qui portent leur sens ;
 *  - un lien Meeshy vers un écran de l'app NAVIGUE dans l'app, sans nouvel
 *    onglet — dans la coque, il ne part pas vers le navigateur externe ;
 *  - un texte sans bloc garde son `<p>` unique.
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

const click = (anchor: Element | null) =>
  act(() => {
    anchor?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });

describe('RichText — le code et les liens markdown', () => {
  test('`code` rend un <code> littéral', () => {
    const html = renderToStaticMarkup(<RichText text="lance `**bun** @alice`" />);
    expect(html).toContain('>**bun** @alice</code>');
    expect(html).not.toContain('<strong>');
    expect(html).not.toContain('href="/u/alice"');
  });

  test('[texte](url) affiche le texte et suit l’adresse', () => {
    const html = renderToStaticMarkup(<RichText text="lis [la doc](https://exemple.fr/doc)" />);
    expect(html).toContain('href="https://exemple.fr/doc"');
    expect(html).toContain('>la doc</a>');
  });

  test('un courriel est un lien mailto', () => {
    expect(renderToStaticMarkup(<RichText text="contact@meeshy.me" />)).toContain('href="mailto:contact@meeshy.me"');
  });
});

describe('RichText — les liens Meeshy s’ouvrent DANS l’app', () => {
  test('un lien meeshy.me vers un profil pose un href interne, sans nouvel onglet', () => {
    const html = renderToStaticMarkup(<RichText text="vois https://meeshy.me/u/alice" />);
    expect(html).toContain('href="/u/alice"');
    expect(html).not.toContain('target="_blank"');
  });

  test('cliquer un lien meeshy.me navigue sans recharger', () => {
    const host = mount(<RichText text="https://meeshy.me/post/p1" />);
    click(host.querySelector('a'));
    expect(window.location.pathname).toBe('/post/p1');
  });

  test('un lien markdown vers meeshy.me navigue aussi', () => {
    const host = mount(<RichText text="[ma story](https://staging.meeshy.me/story/s1)" />);
    click(host.querySelector('a'));
    expect(window.location.pathname).toBe('/story/s1');
  });

  test('un chemin que l’app ne sert pas reste un lien sortant', () => {
    const html = renderToStaticMarkup(<RichText text="https://meeshy.me/a/b/c/d" />);
    expect(html).toContain('href="https://meeshy.me/a/b/c/d"');
    expect(html).toContain('target="_blank"');
  });
});

describe('internalPathOf — la règle des liens internes', () => {
  const context = { origins: ['https://app.local'], isAppPath: (path: string) => path.startsWith('/u/') };

  test('les hôtes Meeshy et les origines fournies sont internes, avec requête et ancre', () => {
    expect(internalPathOf('https://meeshy.me/u/a?x=1#y', context)).toBe('/u/a?x=1#y');
    expect(internalPathOf('https://app.local/u/a', context)).toBe('/u/a');
  });

  test('un autre hôte, la passerelle ou un autre schéma sortent', () => {
    expect(internalPathOf('https://evil.fr/u/a', context)).toBeNull();
    expect(internalPathOf('https://gate.meeshy.me/u/a', context)).toBeNull();
    expect(internalPathOf('https://meeshy.me.evil.fr/u/a', context)).toBeNull();
    expect(internalPathOf('mailto:a@meeshy.me', context)).toBeNull();
  });
});

describe('RichText — les blocs', () => {
  test('un texte sans bloc garde son <p> unique', () => {
    const html = renderToStaticMarkup(<RichText text={'a\nb'} className="text-bubble" />);
    expect(html.startsWith('<p data-rich-text="" class="text-bubble">')).toBe(true);
  });

  test('titres, listes, citation et bloc de code rendent leurs balises', () => {
    const html = renderToStaticMarkup(
      <RichText text={'# Titre\n- un **gras**\n- deux\n1. premier\n> cité\n```\n**brut**\n```'} />,
    );
    expect(html.startsWith('<div data-rich-text=""')).toBe(true);
    expect(html).toContain('data-md-heading="1"');
    expect(html).toContain('<ul class="list-disc pl-6"><li>un <strong>gras</strong></li><li>deux</li></ul>');
    expect(html).toContain('<ol start="1" class="list-decimal pl-6"><li>premier</li></ol>');
    expect(html).toContain('>cité</blockquote>');
    expect(html).toContain('<code>**brut**</code></pre>');
  });

  test('un titre de message n’entre PAS dans le plan des titres de l’écran', () => {
    expect(renderToStaticMarkup(<RichText text="# Salut" />)).not.toMatch(/<h[1-6]/);
  });

  test('rien d’hostile dans un bloc : le HTML reste du texte', () => {
    const html = renderToStaticMarkup(<RichText text={'> <img src=x onerror=alert(1)>\n```\n<script>x</script>\n```'} />);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
  });
});
