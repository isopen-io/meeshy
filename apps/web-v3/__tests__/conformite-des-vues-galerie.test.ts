/**
 * @jest-environment node
 */

/**
 * `scripts/conformite-des-vues.ts` monte la chaîne (passerelle de bouchon +
 * `next start`) pour que `compare-rendu.js` puisse mesurer les vues du
 * MEMBRE. Gate 9 (`--vues vitrine,media`) échouait sur `media` avec une
 * grille VIDE : la conversation par défaut (`CONVERSATION_DU_LECTEUR`,
 * `equipe-lagos`) que sert `passerelleDeBouchon()` ne porte que quatre
 * messages texte, et `lib/api/medias.ts` est une PROJECTION PURE du fil —
 * sans pièce jointe dans le fil, aucune tuile à projeter, quand
 * `cible/media.png` en dessine une pleine.
 *
 * `doitEnrichirLaGalerie` est la décision, PURE et testée ici sans monter la
 * moindre chaîne : elle enrichit quand `media` est demandée, et se TAIT
 * quand `thread` ou `profilMembre` — qui visent la MÊME conversation
 * (`jetons-de-vues.json` → `thread.cle` = `profilMembre.cle` = `media.cle` =
 * `equipe-lagos`) mais dont la cible ne dessine PAS cette galerie — sont
 * demandées dans la MÊME exécution : un enrichissement inconditionnel leur
 * ferait comparer un fil à quatre messages contre un fil qui en porte huit
 * de plus, cassant une comparaison qui n'a rien demandé.
 */
import { doitEnrichirLaGalerie } from '@/scripts/conformite-des-vues';

describe('doitEnrichirLaGalerie', () => {
  it('enrichit quand `media` est seule demandée', () => {
    expect(doitEnrichirLaGalerie(['media'])).toBe(true);
  });

  it('enrichit quand `media` est demandée aux côtés de vues sans rapport', () => {
    expect(doitEnrichirLaGalerie(['vitrine', 'media'])).toBe(true);
  });

  it('ne fait rien quand `media` n’est pas demandée', () => {
    expect(doitEnrichirLaGalerie(['vitrine'])).toBe(false);
    expect(doitEnrichirLaGalerie(['thread'])).toBe(false);
    expect(doitEnrichirLaGalerie([])).toBe(false);
  });

  it('se tait quand `thread` partage la même exécution — même conversation, cible différente', () => {
    expect(doitEnrichirLaGalerie(['media', 'thread'])).toBe(false);
  });

  it('se tait quand `profilMembre` partage la même exécution, pour la même raison', () => {
    expect(doitEnrichirLaGalerie(['media', 'profilMembre'])).toBe(false);
  });
});
