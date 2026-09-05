import { compacte } from '@/app/enveloppe/feuille';

/**
 * LA FEUILLE DE LA BANNIÈRE (#4454) — servie par les DEUX écrans qui tiennent
 * un socket (le fil et `/chats`), et par eux seuls.
 *
 * ELLE EST DANS LE DOCUMENT AVANT LE TOAST, forcément : un module de navigateur
 * ne peut pas ajouter une feuille sans une requête, et le § 8.3 gate ces écrans
 * sur ce qu'ils demandent avant le premier pixel. Cent octets servis d'avance
 * valent mieux qu'un aller-retour au moment où quelque chose arrive.
 *
 * ELLE FLOTTE, DONC ELLE PREND `--color-surface-raised` (charte règle 9) — le
 * cinquième emploi de ce jeton, et le premier qui ne soit pas une surimpression
 * modale : un toast ne prend pas le focus et ne rend rien `inert`, mais il est
 * bien AU-DESSUS du contenu, ce que la règle 9 gouverne.
 *
 * ELLE SE POSE EN HAUT, PAS EN BAS, et c'est une décision d'écran : le bas des
 * deux écrans qui la servent porte le composeur (le fil) ou les deux ronds
 * flottants (`/chats`). Un toast en bas couvrirait un CONTRÔLE — exactement ce
 * que la charte règle 7 b/c interdit aux éléments fixes.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (charte règle 1).
 */
export const FEUILLE_DE_LA_BANNIERE = compacte(`
.banniere{position:fixed;top:var(--space-3);left:var(--space-3);right:var(--space-3);z-index:6;display:flex;align-items:flex-start;gap:var(--space-3);box-sizing:border-box;max-width:var(--shell-width);margin:0 auto;padding:var(--space-3) var(--space-4);border:var(--stroke-hair) solid var(--color-border-strong);border-radius:var(--radius-lg);background:var(--color-surface-raised);color:var(--color-text)}
.banniere-dit{flex:1;min-width:0;display:flex;flex-direction:column;gap:var(--space-1)}
.banniere-titre{font-weight:var(--font-weight-semibold);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.banniere-corps{font-size:var(--text-sm);color:var(--color-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.banniere-reaction{flex:none;font-size:var(--text-lg)}
.banniere-fermer{flex:none;display:inline-flex;align-items:center;justify-content:center;width:var(--target-min);height:var(--target-min);margin:calc(var(--space-2) * -1) calc(var(--space-2) * -1) 0 0;border:0;border-radius:var(--radius-pill);background:none;color:var(--color-text-muted);cursor:pointer}
.banniere-fermer svg{width:var(--glyph);height:var(--glyph)}
`);
