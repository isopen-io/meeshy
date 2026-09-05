import { compacte } from '@/app/enveloppe/feuille';

/**
 * LA FEUILLE DE L'HISTORIQUE DES APPELS — ce que `cible/calls.png` dessine, et
 * rien de plus.
 *
 * Elle s'ajoute au chrome, à la feuille connectée et à celle du FIL : l'écran
 * emprunte son en-tête (`.fil-tete`, son retour de 44 px, son titre et son
 * sous-titre) — comme la boîte des notifications et le carnet des contacts.
 * Un quatrième vocabulaire d'en-tête sur un écran de la même famille serait la
 * dimension 6 (cohérence de positionnement) perdue entre voisins.
 *
 * CE QUI LUI EST PROPRE, ET POURQUOI :
 *
 * 1. **La ligne est un `<a>` PLEIN**, pas seulement une zone cliquable dedans :
 *    la cible mène chaque ligne vers le fil de sa conversation (Q1 de la
 *    spécification), et une cible tactile de 44 px vaut pour la ligne
 *    ENTIÈRE, pas pour un lien étroit posé sur le texte.
 * 2. **La TUILE porte TROIS teintes, jamais une quatrième** — manqué (danger),
 *    répondu (succès), vidéo (accent) — exactement les jetons `--color-tint-*`
 *    / `--color-*` que la table déclare déjà, jamais une couleur écrite.
 * 3. **La NATURE de l'appel est du TEXTE**, dans `.meta` : « Manqué »,
 *    « Audio », « Vidéo » s'y lisent en toutes lettres avant toute couleur —
 *    la teinte de la tuile CONFIRME, elle ne PORTE pas (même loi que la
 *    pastille des notifications et des contacts).
 * 4. **Le chevron est un ORNEMENT**, `aria-hidden`, jamais le seul indice
 *    qu'une ligne mène quelque part — c'est le `<a>` qui porte l'effet.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (charte règle 1). Témoin :
 * `__tests__/charte.test.ts`, où cette feuille entre dans `FEUILLES`.
 */
export const FEUILLE_DES_APPELS = compacte(`
.appels-ecran{display:flex;flex-direction:column;min-height:100dvh;max-width:var(--shell-width);margin:0 auto}
.appels-ecran>.fil-tete{flex:none}

.appels{flex:1 1 0;min-height:0;overflow-y:auto;display:grid;align-content:start;gap:var(--space-2);margin:0;padding:0 var(--space-4) var(--space-9);list-style:none}

.appel a{display:flex;align-items:center;gap:var(--space-3);min-height:var(--target-min);padding:var(--space-3);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-lg);background:var(--color-surface);color:inherit;text-decoration:none}
.appel a:hover{background:var(--color-tint-primary)}

.appel .tuile{display:flex;align-items:center;justify-content:center;flex:none;width:var(--avatar);height:var(--avatar);border-radius:var(--radius-lg)}
.appel .tuile svg{width:var(--glyph);height:var(--glyph)}
.appel .tuile.manque{background:var(--color-tint-danger);color:var(--color-danger)}
.appel .tuile.repondu{background:var(--color-tint-success);color:var(--color-success)}
.appel .tuile.video{background:var(--color-tint-primary);color:var(--color-primary)}

.appel .dit{display:flex;flex-direction:column;gap:var(--space-1);flex:1 1 auto;min-width:0}
.appel .primaire{color:var(--color-text);font-weight:var(--font-weight-semibold);overflow-wrap:anywhere}
.appel .meta{font-size:var(--text-sm);color:var(--color-text-muted);overflow-wrap:anywhere}

.appel .chevron{flex:none;display:flex;align-items:center;color:var(--color-text-muted)}
.appel .chevron svg{width:var(--glyph-inline);height:var(--glyph-inline)}
`);
