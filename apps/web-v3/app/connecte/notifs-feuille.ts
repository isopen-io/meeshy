import { compacte } from '@/app/enveloppe/feuille';

/**
 * LA FEUILLE DE LA BOÎTE — ce que `cible/notifs.png` dessine, et rien de plus.
 *
 * Elle s'ajoute au chrome, à la feuille connectée et à celle du FIL : l'écran
 * emprunte à ce dernier son en-tête (`.fil-tete`, son retour de 44 px, son
 * titre et son sous-titre). Réécrire cet en-tête ici aurait fait deux
 * vocabulaires pour un même geste sur deux écrans que le lecteur enchaîne —
 * la dimension 6 (cohérence de positionnement) perdue entre deux voisins.
 *
 * CE QUI LUI EST PROPRE, ET POURQUOI :
 *
 * 1. **La ligne est une RANGÉE à trois zones** — glyphe, texte, pastille —
 *    dont seule la zone de texte se rétrécit (`min-width:0`). Sans cette
 *    déclaration, un titre long pousse la pastille hors de l'écran : c'est le
 *    défaut classique d'une grille flexible, et il ne se voit qu'avec du vrai
 *    contenu.
 * 2. **La ligne ENTIÈRE fait au moins une cible tactile** (`--target-min`), pas
 *    seulement ce qui s'y clique : une notification se lit au pouce sur un
 *    téléphone tenu d'une main.
 * 3. **La pastille CONFIRME l'état, elle ne le PORTE pas.** Le mot « Non lue »
 *    voyage dans `.hors-ecran` (vue), et la ligne non lue se distingue AUSSI
 *    par le poids de son texte primaire — un daltonien, un lecteur d'écran et
 *    un écran au soleil lisent la même chose. Une couleur seule ne dit rien à
 *    trois lecteurs sur quatre.
 * 4. **L'avis de « tout lu » est un `role="status"`** : il paraît sous
 *    l'en-tête, dans le flux, et ne recouvre rien — une action qui ne dit pas
 *    ce qu'elle a fait laisse le doute exactement là où elle prétendait le
 *    lever.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (charte règle 1). Témoin :
 * `__tests__/charte.test.ts`, où cette feuille entre dans `FEUILLES`.
 */
export const FEUILLE_DES_NOTIFS = compacte(`
.notifs-ecran{display:flex;flex-direction:column;min-height:100dvh;max-width:var(--shell-width);margin:0 auto}
.notifs-ecran>.fil-tete{flex:none}

.notifs-ecran>.avis{display:flex;align-items:center;gap:var(--space-2);margin:0;padding:var(--space-3) var(--space-4);font-size:var(--text-sm);color:var(--color-text-muted)}
.notifs-ecran>.avis svg{flex:none;width:var(--glyph-inline);height:var(--glyph-inline)}

.tout-lire{display:flex;justify-content:flex-end;margin:0;padding:0 var(--space-4) var(--space-3)}
.tout-lire button{display:inline-flex;align-items:center;gap:var(--space-2)}
.tout-lire svg{flex:none;width:var(--glyph-inline);height:var(--glyph-inline)}

.notifs{flex:1 1 0;min-height:0;overflow-y:auto;display:grid;gap:var(--space-2);margin:0;padding:0 var(--space-4) var(--space-9);list-style:none}

.notif{display:flex;align-items:flex-start;gap:var(--space-3);min-height:var(--target-min);padding:var(--space-3);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-lg);background:var(--color-surface)}
.notif .vignette{display:flex;align-items:center;justify-content:center;flex:none;line-height:0;color:var(--color-text-muted)}
.notif .vignette svg{width:var(--glyph);height:var(--glyph)}

.notif .dit{display:flex;flex-direction:column;gap:var(--space-1);flex:1 1 auto;min-width:0}
.notif .primaire{color:var(--color-text);overflow-wrap:anywhere}
.notif .secondaire{font-size:var(--text-sm);color:var(--color-text-muted);overflow-wrap:anywhere}
.notif .instant{font-size:var(--text-sm);color:var(--color-text-muted)}

.notif.non-lue{border-color:var(--color-border-interactive);background:var(--color-bg-sunken)}
.notif.non-lue .primaire{font-weight:var(--font-weight-semibold)}
.notif .pastille{flex:none;align-self:center;width:var(--presence-dot);height:var(--presence-dot);border-radius:var(--radius-pill);background:var(--color-primary)}
`);
