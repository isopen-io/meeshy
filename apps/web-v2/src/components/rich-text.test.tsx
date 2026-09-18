import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { compile, match } from '@/lib/router';
import { ROUTES } from '@/routes/route-table';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { RichText } from './rich-text';

/**
 * **UN `<a>` PRÉSENT NE PROUVE RIEN** (#7032) — ces témoins mesurent ce que
 * l'`href` VAUT, pas qu'il existe :
 *
 *  1. chaque adresse produite s'apparie à une route RÉELLE de `ROUTES` — un
 *     lien vers une adresse absente est un lien qui ment (loi 4), et c'est le
 *     défaut que la v2 portait avant ce lot : ni `/u/$username` ni
 *     `/hashtag/$tag` n'y étaient déclarées ;
 *  2. un clic CHANGE l'adresse (`navigate`), il ne recharge pas le document ;
 *  3. un `<script>`, un `javascript:` et un `[x](javascript:…)` restent du
 *     texte inerte — aucun `href` hostile, aucun nœud actif ;
 *  4. sans hôte qui déclare les hashtags, un `#projet` reste du TEXTE : c'est
 *     le témoin NÉGATIF qui empêche un lot ultérieur d'installer un lien vers
 *     un écran que le serveur ne sert pas.
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

/** L'adresse `url` s'apparie-t-elle à UNE route de la vraie table ? */
const resolvesAgainstRouteTable = (url: string): boolean => {
  const path = url.split('?')[0] ?? url;
  return Object.values(ROUTES).some((route) => match(compile(route.pattern), path) !== null);
};

const hrefsOf = (html: string): readonly string[] => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1] ?? '');

describe('RichText — les adresses produites existent', () => {
  test('la table de routes déclare bien les deux adresses que ce rendu vise', () => {
    expect(resolvesAgainstRouteTable('/u/alice')).toBe(true);
    expect(resolvesAgainstRouteTable('/hashtag/projet')).toBe(true);
  });

  test('l’adresse d’une mention s’apparie à une route RÉELLE', () => {
    const html = renderToStaticMarkup(<RichText text="salut @alice" />);
    const hrefs = hrefsOf(html);
    expect(hrefs).toHaveLength(1);
    expect(hrefs.every(resolvesAgainstRouteTable)).toBe(true);
  });

  test('l’adresse d’un hashtag s’apparie à une route RÉELLE', () => {
    const html = renderToStaticMarkup(<RichText text="on avance sur #Projet" hashtags />);
    expect(hrefsOf(html)).toEqual(['/hashtag/projet']);
    expect(hrefsOf(html).every(resolvesAgainstRouteTable)).toBe(true);
  });

  test('le pseudo voyage en MINUSCULES dans l’adresse, la casse reste à l’écran', () => {
    const html = renderToStaticMarkup(<RichText text="@Alice" />);
    expect(hrefsOf(html)).toEqual(['/u/alice']);
    expect(html).toContain('@Alice');
  });
});

describe('RichText — un clic NAVIGUE', () => {
  test('cliquer une mention change l’adresse sans recharger le document', () => {
    const host = mount(<RichText text="salut @alice" />);
    const anchor = host.querySelector('a');
    expect(anchor).not.toBeNull();
    act(() => {
      anchor?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(window.location.pathname).toBe('/u/alice');
  });

  test('cliquer un hashtag ouvre son écran', () => {
    const host = mount(<RichText text="#projet" hashtags />);
    act(() => {
      host.querySelector('a')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(window.location.pathname).toBe('/hashtag/projet');
  });
});

describe('RichText — le hashtag N’EST PAS cliquable en conversation', () => {
  test('sans `hashtags`, #projet reste du texte — aucun lien', () => {
    const html = renderToStaticMarkup(<RichText text="on avance sur #projet" />);
    expect(html).toContain('#projet');
    expect(html).not.toContain('<a ');
  });

  test('et il n’y a AUCUNE adresse de hashtag dans le rendu d’une conversation', () => {
    const html = renderToStaticMarkup(<RichText text="#a #b #c et @alice" />);
    expect(hrefsOf(html)).toEqual(['/u/alice']);
  });
});

describe('RichText — rien d’hostile ne devient actif', () => {
  test('une balise <script> est ÉCHAPPÉE, jamais montée', () => {
    const html = renderToStaticMarkup(<RichText text="<script>alert(1)</script>" hashtags />);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('un [x](javascript:…) reste du texte : aucun href, aucun schéma exotique', () => {
    const html = renderToStaticMarkup(<RichText text="[clique](javascript:alert('xss'))" hashtags />);
    expect(hrefsOf(html)).toEqual([]);
    expect(html).toContain('javascript:alert'); // présent comme TEXTE échappé
    expect(html).not.toContain('href="javascript:');
  });

  test('aucun href produit ne porte un schéma autre que http(s) ou une adresse interne', () => {
    const html = renderToStaticMarkup(
      <RichText text="javascript:x data:text/html,x vbscript:x https://ok.fr @alice #t" hashtags />,
    );
    for (const href of hrefsOf(html)) {
      expect(href.startsWith('https://') || href.startsWith('http://') || href.startsWith('/')).toBe(true);
    }
    expect(hrefsOf(html)).toContain('https://ok.fr');
  });

  test('un lien externe s’ouvre à part, sans donner la main à la page ouverte', () => {
    const html = renderToStaticMarkup(<RichText text="https://meeshy.me/a" />);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});

describe('RichText — le jeu de mentions validé par le serveur', () => {
  test('fourni, seuls ses pseudos deviennent des liens', () => {
    const html = renderToStaticMarkup(<RichText text="@alice et @inconnue" mentions={['alice']} />);
    expect(hrefsOf(html)).toEqual(['/u/alice']);
    expect(html).toContain('@inconnue');
  });

  test('la comparaison est INSENSIBLE à la casse — sinon @Alice n’est jamais un lien', () => {
    const html = renderToStaticMarkup(<RichText text="@Alice" mentions={['alice']} />);
    expect(hrefsOf(html)).toEqual(['/u/alice']);
  });

  test('un jeu VIDE ne linkifie rien — le serveur s’est prononcé', () => {
    const html = renderToStaticMarkup(<RichText text="@alice" mentions={[]} />);
    expect(hrefsOf(html)).toEqual([]);
  });
});

describe('RichText — les quatre emphases', () => {
  test('**gras** rend un <strong> SANS ses étoiles', () => {
    const html = renderToStaticMarkup(<RichText text="un **mot** fort" />);
    expect(html).toContain('<strong>mot</strong>');
    expect(html).not.toContain('**');
  });

  test('*italique* rend un <em>', () => {
    expect(renderToStaticMarkup(<RichText text="*doucement*" />)).toContain('<em>doucement</em>');
  });

  /**
   * LE SOULIGNÉ REND UN `<u>`, LE BARRÉ UN `<s>` — les balises que le porteur
   * a demandées, et celles qui PORTENT LEUR SENS. Un `<span>` stylé aurait le
   * même pixel et rien d'autre : `<s>` dit « ça ne vaut plus », ce qu'un
   * lecteur d'écran peut annoncer et qu'une feuille de style ne dit pas.
   */
  test('__souligné__ rend un <u> SANS ses tirets bas', () => {
    const html = renderToStaticMarkup(<RichText text="un __mot__ souligné" />);
    expect(html).toContain('<u>mot</u>');
    expect(html).not.toContain('__');
  });

  test('~~barré~~ rend un <s> SANS ses tildes', () => {
    const html = renderToStaticMarkup(<RichText text="~~annulé~~" />);
    expect(html).toContain('<s>annulé</s>');
    expect(html).not.toContain('~~');
  });

  test('les quatre cohabitent dans une même phrase', () => {
    const html = renderToStaticMarkup(<RichText text="**a** *b* __c__ ~~d~~" />);
    expect(html).toContain('<strong>a</strong>');
    expect(html).toContain('<em>b</em>');
    expect(html).toContain('<u>c</u>');
    expect(html).toContain('<s>d</s>');
  });

  /** `snake_case` est le piège nommé par le porteur : aucune balise ne doit
   * naître d'un tiret bas SIMPLE, et le texte doit rester intact. */
  test('snake_case reste du texte nu — aucune balise, aucun caractère perdu', () => {
    expect(renderToStaticMarkup(<RichText text="la variable snake_case reste nue" />)).toBe(
      '<p data-rich-text="">la variable snake_case reste nue</p>',
    );
  });

  test('un lien DANS un gras reste un lien, et une mention DANS un barré aussi', () => {
    const gras = renderToStaticMarkup(<RichText text="**@alice**" />);
    expect(gras).toContain('<strong>');
    expect(hrefsOf(gras)).toEqual(['/u/alice']);

    const barre = renderToStaticMarkup(<RichText text="~~@alice~~" />);
    expect(barre).toContain('<s>');
    expect(hrefsOf(barre)).toEqual(['/u/alice']);
  });
});

describe('RichText — l’arbre d’accessibilité de la rangée plate', () => {
  /**
   * `plainTextHidden` sert la rangée plate (`focal-row.tsx`), dont
   * `aria-label` porte DÉJÀ le texte servi : seules les parties INTERACTIVES
   * restent lisibles, pour qu'un lecteur d'écran trouve les liens sans
   * s'entendre lire la phrase deux fois.
   */
  test('la prose est masquée, les liens ne le sont PAS', () => {
    const html = renderToStaticMarkup(<RichText text="salut @alice, vois https://meeshy.me/a" plainTextHidden />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/<a[^>]*aria-hidden/);
  });

  test('aucun <a> ne se retrouve SOUS un nœud masqué — une violation ARIA ne peut pas s’installer', () => {
    const html = renderToStaticMarkup(<RichText text="salut @alice" plainTextHidden />);
    const hidden = html.slice(html.indexOf('aria-hidden="true"'));
    expect(hidden.slice(0, hidden.indexOf('</span>'))).not.toContain('<a ');
  });

  test('sans la prop, rien n’est masqué', () => {
    expect(renderToStaticMarkup(<RichText text="salut @alice" />)).not.toContain('aria-hidden');
  });
});

describe('RichText — le chemin nominal reste nu', () => {
  test('un texte SANS rien à enrichir ne monte ni lien ni balise d’emphase', () => {
    const html = renderToStaticMarkup(<RichText text="Bonjour tout le monde" className="x" lang="fr" />);
    expect(html).toBe('<p data-rich-text="" class="x" lang="fr">Bonjour tout le monde</p>');
  });
});
