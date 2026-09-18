import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { PRESENCE_HEX } from '@meeshy/shared/utils/user-presence';

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
   * SANS ÉTAT LOCAL (revue-correction #5893) — le dégradé d'initiales reste
   * TOUJOURS monté, la photo le RECOUVRE : c'est ce qui permet à `Avatar`
   * de rester appelable comme une fonction PURE par
   * `living-summary.test.tsx#expand`, sans dispatcher de hooks.
   */
  test('src fourni ⇒ une <img> lazy POSÉE SUR le dégradé d’initiales, jamais à sa place', () => {
    const html = renderToStaticMarkup(<Avatar initials="LD" color="#4F46E5" size={44} src="https://cdn.example/lea.jpg" name="Léa Dupont" />);
    expect(html).toContain('<img');
    expect(html).toContain('src="https://cdn.example/lea.jpg"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('linear-gradient');
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
