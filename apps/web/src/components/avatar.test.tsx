import { readFileSync } from 'node:fs';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { PRESENCE_HERE_HEX, PRESENCE_HEX } from '@meeshy/shared/utils/user-presence';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Avatar } from './avatar';

/**
 * « OFFLINE = AUCUNE PASTILLE » PROUVÉ AU RENDU, PAS DÉDUIT (#5559 T12).
 *
 * `renderToStaticMarkup` (react-dom/server, devDependency) plutôt que
 * preact-render-to-string : sous bun test (hors pipeline Vite, donc hors de
 * l'alias qui redirige le runtime JSX React vers Preact), `avatar.tsx`
 * compile son JSX vers de VRAIS éléments React — comme tout composant de
 * l'application qui doit rester agnostique du runtime (le second mode de
 * build, comparatif, le construit aussi). Marquer ce fichier pour qu'il
 * compile directement vers le runtime JSX Preact (le pragma que porte
 * `src/institutional/page.tsx`, lui jamais monté dans l'application vivante)
 * casserait cette seconde variante ; preact-render-to-string rendrait alors
 * une chaîne VIDE sans erreur sur des éléments React (même précédent).
 * `renderToStaticMarkup` rend le MÊME arbre de composants à une chaîne HTML —
 * c'est ce que ce témoin exige : une preuve de rendu réel, pas une déduction
 * sur les props.
 */
describe('Avatar — pastille de présence', () => {
  test('offline ⇒ AUCUN nœud de pastille', () => {
    const html = renderToStaticMarkup(<Avatar initials="AD" color="#4F46E5" size={44} presence="offline" />);
    expect(html).not.toContain(PRESENCE_HEX.warning);
    expect(html).not.toContain(PRESENCE_HEX.success);
    // Seul le dégradé de fond doit référencer une couleur — aucun second
    // `background-color` (la pastille) ne doit apparaître dans le HTML.
    expect((html.match(/background-color/g) ?? []).length).toBe(0);
  });

  test('away ⇒ une pastille à PRESENCE_HEX.warning', () => {
    const html = renderToStaticMarkup(<Avatar initials="KM" color="#4F46E5" size={44} presence="away" />);
    expect(html).toContain(PRESENCE_HEX.warning);
  });

  test('online ⇒ une pastille à PRESENCE_HEX.success', () => {
    const html = renderToStaticMarkup(<Avatar initials="AD" color="#4F46E5" size={44} presence="online" />);
    expect(html).toContain(PRESENCE_HEX.success);
  });

  test('présence absente (groupe) ⇒ aucun nœud de pastille non plus', () => {
    const html = renderToStaticMarkup(<Avatar initials="ÉQ" color="#4F46E5" size={44} />);
    expect((html.match(/background-color/g) ?? []).length).toBe(0);
  });
});

/**
 * `src` — LE PORTRAIT RÉEL (#5893). `PostMedia.author.avatar`/`Viewer.avatar`
 * sert une URL ; l'avatar ne rendait jusqu'ici QUE des initiales — aucun
 * consommateur (fil, rail, menus flottants) n'avait de photo à montrer.
 */
describe('Avatar — le portrait (`src`)', () => {
  /**
   * UN SEUL VISAGE (#12571) — le dégradé d'initiales n'est qu'un PLACEHOLDER :
   * il est monté tant que la photo charge, puis la règle de frère d'`avatar.css`
   * le masque dès que l'`<img>` porte `data-loaded`. Il reste dans l'arbre pour
   * que `Avatar` demeure appelable comme une fonction PURE
   * (`living-summary.test.tsx#expand`), sans dispatcher de hooks.
   */
  test('src fourni ⇒ une <img> lazy AVANT le placeholder d’initiales, qui ne sert que le temps du chargement', () => {
    const html = renderToStaticMarkup(<Avatar initials="LD" color="#4F46E5" size={44} src="https://cdn.example/lea.jpg" name="Léa Dupont" />);
    expect(html).toContain('<img');
    expect(html).toContain('src="https://cdn.example/lea.jpg"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('linear-gradient');
    expect(html.indexOf('<img')).toBeLessThan(html.indexOf('data-avatar-initials'));
  });

  test('src absent ⇒ le dégradé d’initiales SEUL, comme avant ce lot', () => {
    const html = renderToStaticMarkup(<Avatar initials="LD" color="#4F46E5" size={44} />);
    expect(html).not.toContain('<img');
    expect(html).toContain('linear-gradient');
  });

  test('src vide (chaîne creuse) ⇒ le dégradé, jamais une <img src="">', () => {
    const html = renderToStaticMarkup(<Avatar initials="LD" color="#4F46E5" size={44} src="" />);
    expect(html).not.toContain('<img');
  });

  test('appelable comme une fonction PURE, sans dispatcher de hooks (motif living-summary.test.tsx#expand)', () => {
    // Reproduit exactement l'appel direct qui a fait rougir #5893 : un
    // `type` fonction rappelé à la main, hors de tout rendu React.
    expect(() => (Avatar as (props: unknown) => unknown)({ initials: 'LD', color: '#4F46E5', size: 44, src: 'https://cdn.example/lea.jpg' })).not.toThrow();
  });
});

/**
 * `src` EST UNE RÉFÉRENCE DE MÉDIA, pas une adresse (#6388) — `User.avatar`,
 * `Participant.avatar` et `Community.avatar` portent la CLÉ de stockage depuis
 * #4324, et quelques lignes gardent encore l'adresse héritée d'avant la
 * migration 013. Posées telles quelles en `src`, elles se résolvent contre le
 * DOCUMENT (un `index.html` servi en `200 text/html`) ou contre la RACINE de la
 * passerelle (`net::ERR_FAILED`, puis `workbox … no-response` — mesuré sur
 * `staging.meeshy.me/notifications` le 2026-09-13).
 *
 * La résolution se fait ICI, POINT DE PASSAGE UNIQUE — le même choix que le
 * legacy (`AvatarImage`, `apps/web/components/ui/avatar.tsx`) : dix appelants
 * passent un `src` venu de la passerelle, et aucun d'eux ne doit avoir à se
 * souvenir de la règle. `attachmentSrc` est IDEMPOTENTE, donc un appelant qui
 * résout déjà (`card-model.ts`) ne double rien.
 */
describe('Avatar — `src` traverse la résolution de média (#6388)', () => {
  test('une CLÉ de stockage nue devient la route de flux de la passerelle', () => {
    const html = renderToStaticMarkup(<Avatar initials="LD" color="#4F46E5" size={44} src="2026/09/6aa607/harbor_415810f3.png" />);
    expect(html).toContain('src="https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2F6aa607%2Fharbor_415810f3.png"');
  });

  test('une ADRESSE HÉRITÉE (hôte + clé, sans route) est réparée, jamais servie telle quelle', () => {
    const html = renderToStaticMarkup(
      <Avatar initials="LD" color="#4F46E5" size={44} src="https://gate.meeshy.me/2026/09/6aa607/harbor_415810f3.png" />,
    );
    expect(html).toContain('src="https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2F6aa607%2Fharbor_415810f3.png"');
  });

  test('un `src` DÉJÀ résolu (card-model) traverse inchangé — la résolution est idempotente', () => {
    const resolved = 'https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2Fphoto.png';
    const html = renderToStaticMarkup(<Avatar initials="LD" color="#4F46E5" size={44} src={resolved} />);
    expect(html).toContain(`src="${resolved}"`);
  });

  test('un aperçu local (`blob:`) traverse inchangé — la vignette d’un téléversement en cours', () => {
    const html = renderToStaticMarkup(<Avatar initials="LD" color="#4F46E5" size={44} src="blob:https://staging.meeshy.me/abcd" />);
    expect(html).toContain('src="blob:https://staging.meeshy.me/abcd"');
  });
});

/**
 * **L'`<img>` D'AVATAR EST CELLE QUI MANQUAIT AUX DEUX BOUTS** (#6973).
 *
 * `decoding` : c'est la SEULE `<img>` du dépôt qui ne le portait pas —
 * `media-grid.tsx`, `reel-page.tsx`, `notification-row.tsx` et
 * `communities-parts.tsx` le posent tous. Sans lui, le décodage d'un portrait
 * se fait sur le fil principal, au milieu du défilement d'une liste qui en
 * monte des dizaines (dimension 4, « y a-t-il UNE image perdue pendant le
 * geste ? »).
 *
 * `crossOrigin` : la passerelle rend déjà `Access-Control-Allow-Origin: *` sur
 * la route de flux, mais l'en-tête est INERTE tant que la requête part en
 * `no-cors` — la réponse est alors opaque, et le seau `medias` la garde sans
 * pouvoir distinguer une image d'une page d'erreur. La règle vit dans
 * `lib/net/api-runtime-cache.ts`, aux côtés de ce que le seau garde : c'est la
 * MÊME question, et deux sites en auraient fait deux réponses.
 */
describe('Avatar — ce que l’`<img>` demande au réseau (#6973)', () => {
  test('`decoding="async"` — hors du fil principal, comme les quatre autres `<img>` du dépôt', () => {
    const html = renderToStaticMarkup(<Avatar initials="LD" color="#4F46E5" size={44} src="2026/09/6aa607/photo.png" />);
    expect(html).toContain('decoding="async"');
  });

  test('un portrait servi par la PASSERELLE demande le mode `cors` — sans quoi la réponse est opaque', () => {
    const cle = renderToStaticMarkup(<Avatar initials="LD" color="#4F46E5" size={44} src="2026/09/6aa607/photo.png" />);
    expect(cle).toContain('crossorigin="anonymous"');

    const heritee = renderToStaticMarkup(
      <Avatar initials="LD" color="#4F46E5" size={44} src="https://gate.meeshy.me/2026/09/6aa607/photo.png" />,
    );
    expect(heritee).toContain('crossorigin="anonymous"');

    const resolue = renderToStaticMarkup(
      <Avatar initials="LD" color="#4F46E5" size={44} src="https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2Fphoto.png" />,
    );
    expect(resolue).toContain('crossorigin="anonymous"');
  });

  /**
   * LA RÉGRESSION QUE `crossOrigin` POSÉ PARTOUT AURAIT CAUSÉE : un hôte sans
   * `Access-Control-Allow-Origin` fait ÉCHOUER l'image dès que la requête
   * passe en mode `cors` — et `attachmentSrc` laisse passer les adresses
   * externes inchangées, par décision (`media-url.ts` § « CE QU'IL NE TOUCHE
   * PAS »). L'avatar serait retombé sur ses initiales, silencieusement.
   */
  test('un portrait d’un hôte TIERS ne demande RIEN — son CORS est inconnu', () => {
    const html = renderToStaticMarkup(<Avatar initials="LD" color="#4F46E5" size={44} src="https://cdn.example/lea.jpg" />);
    expect(html).not.toContain('crossorigin');
    // Le magasin STATIQUE (#4625) traverse aussi inchangé.
    const statique = renderToStaticMarkup(
      <Avatar initials="LD" color="#4F46E5" size={44} src="https://static.meeshy.me/u/i/2025/11/photo.png" />,
    );
    expect(statique).not.toContain('crossorigin');
  });

  test('un aperçu local (`blob:`) ne demande rien non plus — il n’a pas d’origine à négocier', () => {
    const html = renderToStaticMarkup(<Avatar initials="LD" color="#4F46E5" size={44} src="blob:https://staging.meeshy.me/abcd" />);
    expect(html).not.toContain('crossorigin');
  });
});

describe('Avatar — le pair est DANS la conversation (#8892)', () => {
  test('here ⇒ une pastille à la couleur primaire Meeshy, jamais verte', () => {
    const html = renderToStaticMarkup(<Avatar initials="KM" color="#4F46E5" size={44} presence="online" here />);
    expect(html).toContain(PRESENCE_HERE_HEX);
    expect(html).not.toContain(PRESENCE_HEX.success);
    expect(html).toMatch(/data-presence="here"/);
  });

  test('here ⇒ la pastille se rend même quand la présence globale est masquée', () => {
    const html = renderToStaticMarkup(<Avatar initials="KM" color="#4F46E5" size={44} here />);
    expect(html).toContain(PRESENCE_HERE_HEX);
  });

  test('sans here ⇒ la pastille garde le ton de présence', () => {
    const html = renderToStaticMarkup(<Avatar initials="KM" color="#4F46E5" size={44} presence="online" here={false} />);
    expect(html).toContain(PRESENCE_HEX.success);
    expect(html).not.toContain(PRESENCE_HERE_HEX);
  });
});


/**
 * **UN SEUL VISAGE, ET LE NOM ACCESSIBLE TOUJOURS LÀ** (#12571) — des
 * interactions réelles (`load`, `error`, changement de `src`) : le rendu
 * statique ne les rejoue pas.
 */
describe('Avatar — la photo REMPLACE les initiales, elle ne les recouvre pas (#12571)', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  let cleanup: (() => void) | null = null;
  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  const mount = (src: string, name: string | null = 'Léa Dupont') => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const draw = (next: string) =>
      act(() => root.render(<Avatar initials="LD" color="#4F46E5" size={44} src={next} {...(name === null ? {} : { name })} />));
    draw(src);
    cleanup = () => {
      act(() => root.unmount());
      container.remove();
    };
    return { container, draw };
  };
  const img = (container: HTMLElement) => container.querySelector('img');
  const fire = (target: Element | null, type: 'load' | 'error') => act(() => void target?.dispatchEvent(new Event(type)));

  test('la photo chargée porte `data-loaded` : la règle de frère masque alors les initiales', () => {
    const { container } = mount('https://cdn.example/a.png');
    expect(img(container)?.hasAttribute('data-loaded')).toBe(false);
    expect(container.querySelector('[data-avatar-initials]')).not.toBeNull();
    fire(img(container), 'load');
    expect(img(container)?.hasAttribute('data-loaded')).toBe(true);
  });

  test('avatar.css masque les initiales QUAND la photo est chargée — la règle de frère existe', () => {
    const css = readFileSync(new URL('../styles/avatar.css', import.meta.url), 'utf8');
    expect(css).toMatch(/img\[data-loaded\]\s*~\s*\[data-avatar-initials\]\s*\{[^}]*visibility:\s*hidden/);
  });

  test('une photo en échec rend les initiales et le nom accessible reste là', () => {
    const { container } = mount('https://cdn.example/a.png');
    fire(img(container), 'error');
    expect(img(container)?.style.display).toBe('none');
    expect(container.querySelector('[data-avatar-initials]')?.textContent).toBe('LD');
    const root = container.querySelector('.avatar-root');
    expect(root?.getAttribute('role')).toBe('img');
    expect(root?.getAttribute('aria-label')).toBe('Léa Dupont');
  });

  test('le nom accessible est porté par la racine AVANT, PENDANT et APRÈS le chargement — jamais deux fois', () => {
    const { container } = mount('https://cdn.example/a.png');
    expect(container.querySelector('.avatar-root')?.getAttribute('aria-label')).toBe('Léa Dupont');
    fire(img(container), 'load');
    expect(container.querySelector('.avatar-root')?.getAttribute('aria-label')).toBe('Léa Dupont');
    expect(img(container)?.getAttribute('alt')).toBe('');
    expect(container.querySelector('[data-avatar-initials]')?.getAttribute('aria-hidden')).toBe('true');
  });

  test('un avatar sans nom reste muet pour le lecteur d’écran', () => {
    const { container } = mount('https://cdn.example/a.png', null);
    expect(container.querySelector('.avatar-root')?.hasAttribute('aria-label')).toBe(false);
    expect(container.querySelector('.avatar-root')?.getAttribute('role')).toBeNull();
  });

  test('après un échec, une NOUVELLE photo s’affiche : le `display:none` posé à la main ne survit pas au changement de src', () => {
    const { container, draw } = mount('https://cdn.example/a.png');
    fire(img(container), 'error');
    expect(img(container)?.style.display).toBe('none');
    draw('https://cdn.example/b.png');
    const next = img(container);
    expect(next?.getAttribute('src')).toBe('https://cdn.example/b.png');
    expect(next?.style.display).not.toBe('none');
    expect(next?.hasAttribute('data-loaded')).toBe(false);
  });

  test('une photo chargée puis remplacée repart du placeholder : `data-loaded` ne se transmet pas à la suivante', () => {
    const { container, draw } = mount('https://cdn.example/a.png');
    fire(img(container), 'load');
    draw('https://cdn.example/b.png');
    expect(img(container)?.getAttribute('src')).toBe('https://cdn.example/b.png');
    expect(img(container)?.hasAttribute('data-loaded')).toBe(false);
  });
});
