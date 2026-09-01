/**
 * LA FEUILLE DU CHROME — les règles vraies de TOUT écran public composé à la
 * main : la gouttière du document, la marque, le retour, les appels à l'action,
 * le titre de section et le pied.
 *
 * Elle se distingue du SOCLE (`app/socle.ts`) par ce qu'elle décrit : le socle
 * porte ce qui est vrai de tout DOCUMENT (marge, fond, anneau de focus), y
 * compris ceux qui n'ont pas de chrome — les deux écrans de `/l/:token` sont
 * cadrés autrement et ne lisent que le socle. Cette feuille-ci porte ce qui est
 * vrai de tout écran du SITE.
 *
 * Les règles viennent de `app/vitrine/feuille.ts`, où la vitrine les portait
 * seule ; les cinq pages institutionnelles en sont les consommatrices
 * suivantes. Les quatre choix qui les rendent « v3 » plutôt que « legacy
 * repeint » sont inchangés, et relevés sur les planches `chats` et `login` :
 *
 *   1. **Une seule teinte d'accent**, `--color-primary`, et elle ne sert qu'à
 *      ce qui est cliquable ou à ce que la phrase met en avant.
 *   2. **Des cartes à filet fin** sur `--color-surface`, rayon `--radius-lg`,
 *      sans ombre — la profondeur vient du contraste de fond.
 *   3. **Une hiérarchie qui repose sur les jetons `--text-*`**, avec
 *      `--leading-tight` sur les titres et `--leading-relaxed` sur les corps.
 *   4. **Des libellés en petites capitales espacées** pour ce qui qualifie,
 *      comme la puce « AUTO · Focal » de la planche `chats`.
 *
 * `.alerte` et `.hors-ecran` y sont montées le jour où un TROISIÈME écran les a
 * demandées — l'accès, la liste et le fil. Une règle qu'un seul écran emploie
 * reste chez lui ; à partir de deux, elle appartient au chrome, sans quoi la
 * troisième feuille en porte une COPIE et la cascade sert la même chose deux
 * fois (le témoin « aucun sélecteur déclaré deux fois » le dirait).
 *
 * Aucune COULEUR n'est écrite (§ 3.2 corollaire 2 : la seconde table de jetons
 * est interdite), et l'ESPACEMENT est en pixels littéraux — il n'existe aucun
 * jeton `--space-*` dans la table servie, et en inventer un ici FABRIQUERAIT
 * cette seconde table.
 */
export const compacte = (feuille: string): string => feuille.replace(/\s*\n\s*/g, '').trim();

export const FEUILLE_DU_CHROME = compacte(`
.enveloppe{max-width:1040px;margin:0 auto;padding:22px 22px 56px}
.marque{display:flex;align-items:center;gap:10px;font-weight:var(--font-weight-semibold);font-size:var(--text-lg);letter-spacing:-.01em}
.marque .jeton{width:26px;height:26px;border-radius:var(--radius-pill);background:var(--color-primary);display:inline-block}
.marque a{color:inherit;text-decoration:none;display:flex;align-items:center;gap:10px}
.marque .retour{margin-left:auto;font-size:var(--text-sm);font-weight:var(--font-weight-medium);color:var(--color-text-muted)}

.cta{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 26px;border-radius:var(--radius-xl);font-weight:var(--font-weight-semibold);text-decoration:none;border:1px solid transparent}
.cta.principal{background:var(--color-primary);color:var(--color-on-primary)}
.cta.secondaire{color:var(--color-text);border-color:var(--color-border-interactive)}

section h2{margin:0 0 8px;font-size:var(--text-2xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight);letter-spacing:-.01em}

.alerte{margin:0 0 22px;padding:12px 16px;border-radius:var(--radius-sm);border-left:3px solid var(--color-danger);background:color-mix(in srgb,var(--color-danger) 12%,transparent);color:var(--color-danger-soft);font-weight:var(--font-weight-medium);font-size:var(--text-sm);line-height:var(--leading-relaxed)}
.hors-ecran{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}

.pied{margin-top:72px;padding-top:22px;border-top:1px solid var(--color-neutral-900);display:flex;flex-direction:column;gap:12px;font-size:var(--text-xs);color:var(--color-text-subtle)}
.pied .devise{margin:0;color:var(--color-text-muted);font-size:var(--text-sm)}
.pied nav{display:flex;flex-wrap:wrap;gap:16px}
.pied a{color:inherit}
.pied .droits{margin:0}
`);
