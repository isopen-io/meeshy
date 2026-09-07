import { compacte } from '@/app/enveloppe/feuille';

import { apercuDeLigne, feuilleQuiMonte } from './atomes-feuille';

/**
 * LA FEUILLE « TRANSFÉRER LE MESSAGE » (`sheet:forward`, #5386) — servie dans
 * le seul état `/chats/:cle?transferer=<id>` : ce que le fil n'affiche pas,
 * il ne le paie pas (charte règle 7), le même partage que
 * `FEUILLE_DU_NOUVEAU_LIEN` (`liens-feuille.ts`) pour `?lien`.
 *
 * SA GÉOMÉTRIE VIENT DE L'ATOME (`feuilleQuiMonte`), partagée avec le profil
 * et « nouveau lien » — trois surimpressions, un seul calcul de voile et de
 * poignée.
 *
 * CHAQUE CIBLE EST UN `<button>` PLEINE LARGEUR, PAS UN `<a>` : un
 * formulaire POST, jamais une navigation (§ ci-dessus, `transfert-vue.ts`) —
 * la ligne entière est la cible tactile de 44 px, le même patron que
 * `.lien` (`liens-feuille.ts`) et la ligne de `/chats` (`liste-feuille.ts`).
 * `apercuDeLigne`, l'atome PARAMÉTRÉ déjà partagé par `.liste` et `.carte`,
 * sert ici une TROISIÈME racine (`dialog.transfert .cibles`) sans dupliquer
 * la règle.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (charte règle 1). Témoin :
 * `__tests__/charte.test.ts`, où cette feuille entre dans `FEUILLES`.
 */
export const FEUILLE_DU_TRANSFERT = feuilleQuiMonte('transfert') + compacte(`
dialog.transfert h2{margin:0 0 var(--space-3);font-size:var(--text-xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight)}
dialog.transfert .tete{display:flex;align-items:flex-start;gap:var(--space-3)}
dialog.transfert .tete h2{flex:1;min-width:0}
dialog.transfert .fermer{flex:none;display:inline-flex;align-items:center;justify-content:center;width:var(--target-min);height:var(--target-min);border-radius:var(--radius-pill);border:var(--stroke-hair) solid var(--color-border-strong);color:var(--color-text)}
dialog.transfert .fermer svg{width:var(--glyph);height:var(--glyph)}
dialog.transfert .alerte{margin:0 0 var(--space-3);font-size:var(--text-sm);color:var(--color-danger)}
dialog.transfert .vide{margin:0;font-size:var(--text-sm);color:var(--color-text-muted)}
dialog.transfert form{margin:0}
dialog.transfert .cibles{display:grid;gap:var(--space-1);margin:0;padding:0;list-style:none}
dialog.transfert .cibles button{display:flex;align-items:center;gap:var(--space-3);width:100%;min-height:var(--row-height);padding:var(--space-2) var(--space-2);border:0;border-radius:var(--radius-lg);background:transparent;font:inherit;color:inherit;text-align:left;cursor:pointer}
dialog.transfert .cibles button:hover{background:var(--color-bg-sunken)}
dialog.transfert .cibles .corps{flex:1;min-width:0}
dialog.transfert .cibles .nom{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:var(--font-weight-semibold)}
${apercuDeLigne('dialog.transfert .cibles')}
`);
