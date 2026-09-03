import { compacte } from '@/app/enveloppe/feuille';

/**
 * LA FEUILLE DES CONTACTS — ce que `cible/contacts.png` dessine, et rien de
 * plus.
 *
 * Elle s'ajoute au chrome, à la feuille connectée et à celle du FIL, dont
 * l'écran emprunte l'en-tête (`.fil-tete`, son retour de 44 px, son titre et
 * son sous-titre) — comme la boîte des notifications. Un troisième vocabulaire
 * d'en-tête sur un écran que le lecteur enchaîne avec les deux autres, ce serait
 * la dimension 6 (cohérence de positionnement) perdue entre voisins.
 *
 * CE QUI LUI EST PROPRE, ET POURQUOI :
 *
 * 1. **La rangée a QUATRE zones** — vignette, texte, action, chevron — et seule
 *    la zone de texte se rétrécit (`min-width:0`). Sans cette déclaration, un
 *    nom long pousse « Accepter » hors de l'écran ; le défaut ne se voit qu'avec
 *    du vrai contenu.
 * 2. **La ligne ENTIÈRE fait une cible tactile** (`--target-min`), et les DEUX
 *    boutons aussi, séparément : on répond à une demande au pouce, d'une main,
 *    et « Accepter » à côté de « Refuser » est le pire endroit du produit pour
 *    une cible étroite.
 * 3. **La pastille de présence a QUATRE teintes déclarées et TROIS rendues.**
 *    `offline` n'a pas de règle ici : la classe n'est jamais posée (vue), et
 *    l'écrire donnerait un point gris sur un avatar — ce que la règle produit
 *    interdit (« offline = pas de pastille », comme WhatsApp). Les teintes
 *    viennent des jetons `--color-presence-*`, jamais d'une valeur écrite.
 * 4. **La seconde ligne PORTE la distinction** entre demande reçue, demande
 *    envoyée et contact. La vignette la confirme ; elle ne la porte pas.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (charte règle 1). Témoin :
 * `__tests__/charte.test.ts`, où cette feuille entre dans `FEUILLES`.
 */
export const FEUILLE_DES_CONTACTS = compacte(`
.contacts-ecran{display:flex;flex-direction:column;min-height:100dvh;max-width:var(--shell-width);margin:0 auto}
.contacts-ecran>.fil-tete{flex:none}

.contacts-ecran>.avis{display:flex;align-items:center;gap:var(--space-2);margin:0;padding:var(--space-3) var(--space-4);font-size:var(--text-sm);color:var(--color-text-muted)}
.contacts-ecran>.avis svg{flex:none;width:var(--glyph-inline);height:var(--glyph-inline)}

.contacts{flex:1 1 0;min-height:0;overflow-y:auto;display:grid;gap:var(--space-2);margin:0;padding:0 var(--space-4) var(--space-9);list-style:none}

.contact{display:flex;align-items:center;gap:var(--space-3);min-height:var(--target-min);padding:var(--space-3);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-lg);background:var(--color-surface)}
.contact .vignette{position:relative;display:flex;align-items:center;justify-content:center;flex:none;line-height:0;color:var(--color-text-muted)}
.contact .vignette svg{width:var(--glyph);height:var(--glyph)}
.contact .pastille{position:absolute;right:0;bottom:0;width:var(--presence-dot);height:var(--presence-dot);border-radius:var(--radius-pill);border:var(--stroke-hair) solid var(--color-surface)}
.contact .pastille.en-ligne{background:var(--color-presence-online)}
.contact .pastille.absent{background:var(--color-presence-away)}
.contact .pastille.inactif{background:var(--color-presence-idle)}

.contact .dit{display:flex;flex-direction:column;gap:var(--space-1);flex:1 1 auto;min-width:0}
.contact .primaire{color:var(--color-text);font-weight:var(--font-weight-medium);overflow-wrap:anywhere}
.contact .secondaire{font-size:var(--text-sm);color:var(--color-text-muted);overflow-wrap:anywhere}

.contact .gestes{display:flex;align-items:center;gap:var(--space-2);flex:none;margin:0}
.contact .gestes button{min-height:var(--target-min);min-width:var(--target-min);display:inline-flex;align-items:center;justify-content:center;gap:var(--space-1)}
.contact .gestes svg{flex:none;width:var(--glyph-inline);height:var(--glyph-inline)}
.contact .etat{flex:none;font-size:var(--text-sm);color:var(--color-text-muted)}
`);
