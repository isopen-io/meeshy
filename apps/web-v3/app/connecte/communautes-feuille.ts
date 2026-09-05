import { compacte } from '@/app/enveloppe/feuille';

import { feuilleQuiMonte } from './atomes-feuille';

/**
 * LA FEUILLE DE `/communities` — ce que `cible/communities.png` dessine, et
 * rien de plus.
 *
 * Elle s'ajoute au chrome, à la feuille connectée et à celle du FIL : l'écran
 * emprunte son en-tête (`.fil-tete`) — le même vocabulaire que `/calls` et
 * `/links` (dimension 6, cohérence de positionnement).
 *
 * CE QUI LUI EST PROPRE, ET POURQUOI :
 *
 * 1. **La TUILE est TEINTÉE par le NOM**, jamais par un type de communauté —
 *    les quatre classes `t1`-`t4` de `.avatar` (`feuille.ts:95-98`)
 *    RÉEMPLOYÉES ici sur `.tuile` : mêmes jetons `--color-avatar-*`, aucun
 *    hex, aucun jeton nouveau (Q6 de la spécification — indigo et rose sur la
 *    cible sont `--color-avatar-1`/`-3`, pas une couleur choisie pour cet
 *    écran).
 * 2. **La ligne est un `<a>` PLEIN**, la même cible tactile que `/calls` : une
 *    communauté s'ouvre au pouce, d'une main.
 * 3. **LE LIEN DE PAGE SUIVANTE N'A AUCUNE RÈGLE ICI** — il porte
 *    `plus-ancien action discrete`, le vocabulaire que le fil, la galerie,
 *    `/notifications` et `/calls` emploient déjà, et dont la règle vit dans
 *    `fil-feuille.ts` (composée dans ce document). Cette feuille en déclarait
 *    une copie sous le nom `.plus` — une seconde règle GLOBALE là où
 *    `social-feuille.ts` en déclarait déjà une autre, divergente, sous le même
 *    nom : la jumelle que la charte interdit, et une collision qui n'attendait
 *    qu'un document servant les deux feuilles.
 * 4. **Les DEUX surimpressions partagent `feuilleQuiMonte`** (la géométrie
 *    d'une feuille qui monte, `atomes-feuille.ts`) — `?ouverte=` (les
 *    conversations d'une communauté) et `?nouvelle` (sa création) ne sont
 *    JAMAIS sur le même document, donc aucune ne paie l'autre.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (charte règle 1). Témoin :
 * `__tests__/charte.test.ts`, où cette feuille entre dans `FEUILLES`.
 */
export const FEUILLE_DES_COMMUNAUTES = compacte(`
.communautes-ecran{display:flex;flex-direction:column;min-height:100dvh;max-width:var(--shell-width);margin:0 auto}
.communautes-ecran>.fil-tete{flex:none}

.communautes{flex:1 1 0;min-height:0;overflow-y:auto;display:grid;align-content:start;gap:var(--space-2);margin:0;padding:0 var(--space-4) var(--space-9);list-style:none}

.communaute a{display:flex;align-items:center;gap:var(--space-3);min-height:var(--target-min);padding:var(--space-3);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-lg);background:var(--color-surface);color:inherit;text-decoration:none}
.communaute a:hover{background:var(--color-tint-primary)}

.communaute .tuile{display:flex;align-items:center;justify-content:center;flex:none;width:var(--avatar);height:var(--avatar);border-radius:var(--radius-lg);color:var(--color-on-avatar)}
.communaute .tuile svg{width:var(--glyph);height:var(--glyph)}
.communaute .tuile.t1{background:var(--color-avatar-1)}
.communaute .tuile.t2{background:var(--color-avatar-2)}
.communaute .tuile.t3{background:var(--color-avatar-3)}
.communaute .tuile.t4{background:var(--color-avatar-4)}

.communaute .dit{display:flex;flex-direction:column;gap:var(--space-1);flex:1 1 auto;min-width:0}
.communaute .nom{color:var(--color-text);font-weight:var(--font-weight-semibold);overflow-wrap:anywhere}
.communaute .meta{font-size:var(--text-sm);color:var(--color-text-muted);overflow-wrap:anywhere}

.communaute .chevron{flex:none;display:flex;align-items:center;color:var(--color-text-muted)}
.communaute .chevron svg{width:var(--glyph-inline);height:var(--glyph-inline)}


${feuilleQuiMonte('communaute-ouverte')}
dialog.communaute-ouverte h2{margin:0;font-size:var(--text-xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight);overflow-wrap:anywhere}
dialog.communaute-ouverte .tete{display:flex;align-items:flex-start;gap:var(--space-3)}
dialog.communaute-ouverte .tete .dit{flex:1;min-width:0}
dialog.communaute-ouverte .fermer{flex:none;display:inline-flex;align-items:center;justify-content:center;width:var(--target-min);height:var(--target-min);border-radius:var(--radius-pill);border:var(--stroke-hair) solid var(--color-border-strong);color:var(--color-text)}
dialog.communaute-ouverte .fermer svg{width:var(--glyph);height:var(--glyph)}
dialog.communaute-ouverte .alerte{margin:var(--space-4) 0 0;padding:var(--space-3);border:var(--stroke-hair) solid var(--color-danger);border-radius:var(--radius-lg);color:var(--color-danger)}
dialog.communaute-ouverte ul{display:flex;flex-direction:column;gap:var(--space-2);margin:var(--space-4) 0 0;padding:0;list-style:none}
dialog.communaute-ouverte li a{display:flex;flex-direction:column;gap:var(--space-1);min-height:var(--target-min);padding:var(--space-3);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-lg);background:var(--color-surface);color:inherit;text-decoration:none}
dialog.communaute-ouverte li a:hover{background:var(--color-tint-primary)}
dialog.communaute-ouverte li .nom{color:var(--color-text);font-weight:var(--font-weight-medium);overflow-wrap:anywhere}
dialog.communaute-ouverte li .meta{font-size:var(--text-sm);color:var(--color-text-muted)}

${feuilleQuiMonte('nouvelle-communaute')}
dialog.nouvelle-communaute h2{margin:0 0 var(--space-1);font-size:var(--text-xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight)}
dialog.nouvelle-communaute .tete{display:flex;align-items:flex-start;gap:var(--space-3)}
dialog.nouvelle-communaute .tete .dit{flex:1;min-width:0}
dialog.nouvelle-communaute .fermer{flex:none;display:inline-flex;align-items:center;justify-content:center;width:var(--target-min);height:var(--target-min);border-radius:var(--radius-pill);border:var(--stroke-hair) solid var(--color-border-strong);color:var(--color-text)}
dialog.nouvelle-communaute .fermer svg{width:var(--glyph);height:var(--glyph)}
dialog.nouvelle-communaute .alerte{margin:var(--space-4) 0 0;padding:var(--space-3);border:var(--stroke-hair) solid var(--color-danger);border-radius:var(--radius-lg);color:var(--color-danger)}
dialog.nouvelle-communaute form{display:flex;flex-direction:column;gap:var(--space-4);margin:var(--space-4) 0 0}
dialog.nouvelle-communaute .champ{display:flex;flex-direction:column;gap:var(--space-2)}
dialog.nouvelle-communaute .champ label{font-size:var(--text-sm);font-weight:var(--font-weight-medium)}
dialog.nouvelle-communaute .champ input,dialog.nouvelle-communaute .champ textarea{padding:var(--space-2) var(--space-3);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-lg);background:var(--color-surface);color:var(--color-text);font:inherit}
dialog.nouvelle-communaute .champ input{min-height:var(--target-min)}
dialog.nouvelle-communaute .champ textarea{min-height:calc(var(--target-min) * 2);resize:vertical}
dialog.nouvelle-communaute .coche{display:flex;align-items:center;gap:var(--space-3);min-height:var(--target-min);padding:0 var(--space-3);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-lg)}
dialog.nouvelle-communaute .pied{position:sticky;bottom:0;padding:var(--space-3) 0 0;background:var(--color-surface-raised)}
dialog.nouvelle-communaute .pied .action{width:100%}
`);
