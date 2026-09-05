import { compacte } from '@/app/enveloppe/feuille';

import { CHAMP_D_APPEL } from './atomes-feuille';

/**
 * LES RADIOS DE LANGUE SONT `.hors-ecran` (clip-path) — leur `label` associé
 * porte donc SEUL l'état coché et le focus visibles. Un radio et son label ne
 * sont pas frères DIRECTS dans le document (`input#lang-X-N` précède son
 * `.texte`, `label[for=lang-X-N]` vit plus loin dans `.langues`) : `~` ne
 * peut donc pas les relier. `:has()` le peut, par POSITION — un radio et son
 * label partagent le même rang `N` dans deux listes ordonnées identiquement
 * (`textes.map(...)`), donc le Nᵉ `<input>` du fieldset et le Nᵉ `<label>` de
 * `.langues` désignent la MÊME langue. `RANGS_LANGUE_MAX` borne la génération
 * — au-delà, un radio reste fonctionnel (le sélecteur `input:checked+.texte`
 * n'a pas cette limite), seul l'ÉTAT VISUEL du label cesse de suivre.
 */
const RANGS_LANGUE_MAX = 8;
const parRang = (etat: 'checked' | 'focus-visible'): string =>
  Array.from(
    { length: RANGS_LANGUE_MAX },
    (_, i) => `.prisme-multi:has(>input:nth-of-type(${i + 1}):${etat}) .langues label:nth-of-type(${i + 1})`,
  ).join(',');

/**
 * LA FEUILLE DU FIL SOCIAL (`/feed`, #5031) — ce que `cible/feed.png` dessine :
 * un rail de stories qui défile, puis des cartes de publication.
 *
 * ELLE EMPRUNTE L'EN-TÊTE DU FIL (`.fil-tete`, chevron + titre + sous-titre,
 * `app/connecte/fil-feuille.ts`), exactement comme les commentaires — même
 * vocabulaire partout où le lecteur enchaîne (dimension 6).
 *
 * CE QUI LUI EST PROPRE :
 *
 * 1. **Le rail est un couloir qui DÉFILE**, `overflow-x:auto` sur une liste de
 *    liens `<a>` — chacun INDIVIDUELLEMENT focusable. C'est ce qui rend le rail
 *    scrollable AU CLAVIER sans une ligne de JavaScript : Tab atteint chaque
 *    story, et le navigateur fait défiler le couloir pour amener l'élément
 *    focalisé dans la vue (`scrollIntoView` natif au focus — critère de fin).
 * 2. **LA LANGUE D'UNE PUBLICATION SE CHOISIT PAR UN GROUPE DE BOUTONS
 *    RADIO**, jamais par un `<details>` binaire. Le défaut du cycle 123 était
 *    « la zone traductions disponibles est cliquable, et cliquer n'y changeait
 *    rien » — un `role="button"` sur un `<div>`, sans état, sans effet. Un
 *    groupe `<input type="radio">` NE PEUT PAS être inerte : cocher un radio
 *    est un état natif du navigateur, et `input:checked + .texte{display:
 *    block}` (sélecteur de sibling ADJACENT, générique quel que soit le nombre
 *    de langues) en fait un EFFET visible, sans JavaScript. Les radios sont
 *    visuellement masqués par `.hors-ecran` (partagé, `app/enveloppe/
 *    feuille.ts`) — restent au clavier et au lecteur d'écran, jamais retirés
 *    du document.
 * 3. **Les trois gestes (aimer, commenter, reposter) sont des CIBLES pleines**,
 *    `--target-min` au minimum : la directive du porteur demande de GROS
 *    boutons, jamais des icônes de 16 px collées les unes aux autres.
 * 4. **Le repost REPOSTÉ N'EST PLUS UN BOUTON.** La passerelle n'expose aucune
 *    route pour défaire un repost (`routes/posts/interactions.ts`, une seule
 *    route `POST …/repost`) — un contrôle qu'aucun second geste ne peut
 *    accomplir n'est pas un bouton, c'est un ÉTAT (`<span>`, charte règle 7).
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (charte règle 1) — l'exception
 * `aspect-ratio` n'est PAS une valeur de pixel : elle fixe le CADRE d'une image
 * avant son chargement (CLS nul), ce que la charte règle 1 excepte déjà pour
 * `.hors-ecran` et une condition de rupture, pour la même raison — une mesure
 * qui n'est pas un espacement de DESIGN. Témoin : `__tests__/charte.test.ts`.
 */
export const FEUILLE_DU_FIL_SOCIAL = compacte(`
${CHAMP_D_APPEL}
${parRang('checked')}{background:var(--color-primary);border-color:var(--color-primary);color:var(--color-on-primary);font-weight:var(--font-weight-semibold)}
${parRang('focus-visible')}{outline:var(--stroke-focus) solid var(--color-focus);outline-offset:var(--stroke-strong)}
.fil-social{display:flex;flex-direction:column;min-height:100dvh;max-width:var(--shell-width);margin:0 auto}
.fil-social>.fil-tete{flex:none}

.fil-social{position:relative}
.saut{position:absolute;left:var(--space-4);top:calc(var(--space-9) * -1);z-index:20;display:inline-flex;align-items:center;min-height:var(--target-min);padding:0 var(--space-4);border:var(--stroke-strong) solid var(--color-primary);border-radius:var(--radius-pill);background:var(--color-surface);color:var(--color-primary);font-weight:var(--font-weight-semibold);text-decoration:none}
.saut:focus-visible{top:var(--space-2)}

.rail{display:flex;gap:var(--space-4);margin:0;padding:var(--space-2) var(--space-4) var(--space-5);overflow-x:auto;list-style:none;scroll-padding-inline:var(--space-4)}
.rail li{flex:none}
.rail a{display:flex;flex-direction:column;align-items:center;gap:var(--space-2);width:calc(var(--avatar) + var(--space-4));text-decoration:none;color:inherit}
.rail .cercle{display:grid;place-items:center;width:calc(var(--avatar) + var(--space-3));height:calc(var(--avatar) + var(--space-3));border-radius:var(--radius-pill);border:var(--stroke-strong) solid var(--color-border-interactive)}
.rail .cercle[data-vu="0"]{border-color:var(--color-primary)}
.rail .cercle .avatar{width:var(--avatar);height:var(--avatar)}
.rail .nom{max-width:100%;font-size:var(--text-xs);color:var(--color-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.publications{display:grid;gap:var(--space-5);margin:0;padding:0 var(--space-4) var(--space-9);list-style:none}
.post{display:flex;flex-direction:column;gap:var(--space-3);padding:var(--space-4);border:var(--stroke-hair) solid var(--color-border-strong);border-radius:var(--radius-lg);background:var(--color-surface)}
.post .entete{display:flex;align-items:center;gap:var(--space-3)}
.post .dit{display:flex;flex-direction:column;min-width:0}
.post .qui{font-weight:var(--font-weight-semibold);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.post .instant{font-size:var(--text-sm);color:var(--color-text-muted)}

.prisme-multi{margin:0;padding:0;border:0}
.prisme-multi .texte{display:none;margin:0;color:var(--color-text);overflow-wrap:anywhere}
.prisme-multi input:checked+.texte{display:block}
.prisme-multi .langues{display:flex;flex-wrap:wrap;gap:var(--space-2);margin-top:var(--space-3);padding:0;list-style:none}
.prisme-multi .langues label{display:inline-flex;align-items:center;min-height:var(--target-min);padding:0 var(--space-3);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-pill);font-size:var(--text-sm);color:var(--color-text-muted);cursor:pointer}
.post>.texte{margin:0;color:var(--color-text);overflow-wrap:anywhere}

.post .media{margin:0;aspect-ratio:4/3;overflow:hidden;border-radius:var(--radius-lg);background:var(--color-bg-sunken)}
.post .media img,.post .media video{display:block;width:100%;height:100%;object-fit:cover}

.plus{display:flex;align-items:center;justify-content:center;min-height:var(--action-height);margin:0 var(--space-4) var(--space-9);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-lg);color:var(--color-primary);font-weight:var(--font-weight-semibold);text-decoration:none}

.gestes{display:flex;align-items:center;gap:var(--space-5)}
.gestes form{margin:0}
.geste{display:inline-flex;align-items:center;gap:var(--space-2);min-height:var(--target-min);padding:0 var(--space-2);border:0;border-radius:var(--radius-pill);background:transparent;font:inherit;font-size:var(--text-sm);color:var(--color-text-muted);text-decoration:none;cursor:pointer;transition:color 120ms}
.geste svg{flex:none;width:var(--glyph-inline);height:var(--glyph-inline)}
.geste-aime[aria-pressed="true"]{color:var(--color-primary)}
.geste-reposte{color:var(--color-primary)}
`);
