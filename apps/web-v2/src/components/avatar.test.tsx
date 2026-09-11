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
