/**
 * LA FEUILLE DU CHROME — les règles vraies de TOUT écran public composé à la
 * main : la gouttière du document, la marque, le retour, les actions, le titre
 * de section et le pied.
 *
 * Elle se distingue du SOCLE (`app/socle.ts`) par ce qu'elle décrit : le socle
 * porte ce qui est vrai de tout DOCUMENT (marge, fond, anneau de focus,
 * mouvement), y compris ceux qui n'ont pas de chrome — les deux écrans de
 * `/l/:token` sont cadrés autrement et ne lisent que le socle. Cette feuille-ci
 * porte ce qui est vrai de tout écran du SITE.
 *
 * CE QUE LA CHARTE Y A CHANGÉ (conception § 12.5, directive du 2026-09-01)
 *
 * 1. **`.cta` est devenu `.action`, et il porte TROIS rangs** (règle 4) :
 *    `primaire` 56 px, `contour` 52 px, `discrete` 44 px, toutes pleine largeur
 *    sur mobile et de largeur automatique au-delà de 600 px. L'ancien `.cta`
 *    n'en avait qu'un — 52 px, quel que soit le rôle — et un écran qui voulait
 *    une action secondaire l'obtenait en changeant sa COULEUR, pas sa taille :
 *    deux boutons de même poids visuel côte à côte, ce que la directive appelle
 *    « terne ».
 * 2. **Les espacements viennent de la table** (règles 1 et 8). Ils étaient en
 *    pixels littéraux, avec la raison écrite ici même : « il n'existe aucun
 *    jeton `--space-*` dans la table servie ». C'était vrai, et c'était la
 *    seconde table du corollaire 2 sous un autre nom — chaque feuille inventait
 *    22, 26, 18, 14, 10. Les neuf pas existent maintenant.
 * 3. **`--color-neutral-900` a cédé la place à `--color-border-strong`**
 *    (règle 10). Un filet se déclare par son RÔLE : prendre un cran de la rampe
 *    neutre marche dans le schéma où on l'a regardé, et se retourne dans
 *    l'autre — la rampe claire est l'inverse de la sombre.
 * 4. **`.alerte` prend `--color-danger` et le voile `--color-tint-danger`**
 *    (règle 14). `--color-danger-soft` sur un plan clair rend 3,61:1, sous les
 *    4,5:1 dus à du texte : mesuré, donc interdit.
 *
 * Les quatre choix qui rendent l'ensemble « v3 » plutôt que « legacy repeint »
 * sont inchangés, et relevés sur les planches `chats` et `login` :
 *
 *   1. **Une seule teinte d'accent**, `--color-primary`, et elle ne peint que
 *      les cinq emplois de la règle 13 — le cliquable, la pastille de langue, le
 *      compte de non-lus, la tuile de marque, et UN mot de l'accroche.
 *   2. **Des cartes à filet fin** sur `--color-surface`, rayon `--radius-lg`,
 *      sans ombre — la profondeur vient du contraste de fond, jamais d'un flou.
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
 * Aucune COULEUR et aucun PIXEL ne sont écrits (§ 3.2 corollaire 2, charte
 * règle 1) : la seule exception est l'idiome `.hors-ecran` (1px/−1px, la seule
 * façon de masquer un nœud sans le retirer de l'arbre d'accessibilité) et la
 * CONDITION du point de rupture. Témoin : `__tests__/charte.test.ts`.
 */
export const compacte = (feuille: string): string => feuille.replace(/\s*\n\s*/g, '').trim();

export const FEUILLE_DU_CHROME = compacte(`
.enveloppe{max-width:var(--shell-width);margin:0 auto;padding:var(--space-5) var(--space-5) var(--space-8)}
a{color:var(--color-primary)}

.marque{display:flex;align-items:center;gap:var(--space-3)}
.marque a{display:inline-flex;align-items:center;gap:var(--space-3);min-height:var(--target-min);color:inherit;text-decoration:none;font-size:var(--text-lg);font-weight:var(--font-weight-semibold);letter-spacing:-.01em}
.marque .tuile{display:inline-flex;align-items:center;justify-content:center;flex:none;width:var(--space-6);height:var(--space-6);border-radius:var(--radius-lg);background:var(--color-primary);color:var(--color-on-primary)}
.marque .tuile svg{width:var(--glyph-inline);height:var(--glyph-inline)}
.marque .retour{display:inline-flex;align-items:center;margin-left:auto;min-height:var(--target-min);font-size:var(--text-sm);font-weight:var(--font-weight-medium);color:var(--color-text-muted);text-decoration:none}

.action{display:inline-flex;align-items:center;justify-content:center;gap:var(--space-2);width:100%;min-height:var(--action-height);padding:0 var(--space-5);border:var(--stroke-strong) solid transparent;border-radius:var(--radius-pill);font-size:var(--text-md);font-weight:var(--font-weight-semibold);font-family:inherit;line-height:var(--leading-tight);text-align:center;text-decoration:none;cursor:pointer;transition:background-color 120ms,border-color 120ms,color 120ms}
.action.primaire{background:var(--color-primary);color:var(--color-on-primary)}
.action.primaire:hover{background:var(--color-primary-strong)}
.action.contour{min-height:var(--action-height-secondary);background:transparent;color:var(--color-primary);border-color:var(--color-border-interactive)}
.action.contour:hover{border-color:var(--color-primary)}
.action.discrete{width:auto;min-width:var(--target-min);min-height:var(--target-min);padding:0 var(--space-3);background:transparent;color:var(--color-text);font-weight:var(--font-weight-medium)}

section h2{margin:0 0 var(--space-2);font-size:var(--text-2xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight);letter-spacing:-.01em}

.alerte{margin:0 0 var(--space-5);padding:var(--space-3) var(--space-4);border-radius:var(--radius-lg);border-left:var(--space-1) solid var(--color-danger);background:var(--color-tint-danger);color:var(--color-text);font-weight:var(--font-weight-medium);font-size:var(--text-base)}
.hors-ecran{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}

.pied{margin-top:var(--space-8);padding-top:var(--space-5);border-top:var(--stroke-hair) solid var(--color-border-strong);display:flex;flex-direction:column;gap:var(--space-2);font-size:var(--text-sm);color:var(--color-text-muted)}
.pied .devise{margin:0}
.pied nav{display:flex;flex-wrap:wrap;gap:var(--space-2)}
.pied a{display:inline-flex;align-items:center;min-height:var(--target-min);min-width:var(--target-min);text-decoration:none}
.pied .droits{margin:0;color:var(--color-text-subtle)}

@media (min-width:600px){
.action{width:auto;min-width:var(--action-width)}
}
`);
