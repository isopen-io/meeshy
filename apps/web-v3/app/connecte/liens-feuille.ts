import { compacte } from '@/app/enveloppe/feuille';

/**
 * LA FEUILLE DES LIENS — ce que `cible/links.png` dessine, et rien de plus.
 *
 * Elle s'ajoute au chrome, à la feuille connectée et à celle du FIL, dont
 * l'écran emprunte l'en-tête — comme la boîte et les contacts. Trois écrans que
 * le lecteur enchaîne partagent un seul vocabulaire d'en-tête (dimension 6).
 *
 * CE QUI LUI EST PROPRE, ET POURQUOI :
 *
 * 1. **L'adresse se COUPE, elle ne déborde pas.** Un identifiant de lien n'a
 *    aucune espace : sans `overflow-wrap:anywhere`, une adresse longue élargit
 *    la ligne et fait défiler la PAGE horizontalement — le défaut que la cible
 *    montre elle-même, où « meeshy.me/chats/demo-sept » passe à la ligne.
 * 2. **La ligne ENTIÈRE fait une cible tactile** (`--target-min`) : on ouvre un
 *    lien au pouce, d'une main.
 * 3. **Un lien FERMÉ se dit en TEXTE, jamais par une teinte seule.** L'étiquette
 *    porte le mot ; le fond en sourdine ne fait que le confirmer. Un daltonien,
 *    un lecteur d'écran et un écran au soleil lisent la même chose.
 * 4. **La méta est une rangée qui PEUT passer à la ligne** (`flex-wrap`) :
 *    « 4 ont rejoint · 4 / 50 · Expire le … » tient sur un grand écran et
 *    s'empile sur un petit, sans jamais pousser quoi que ce soit dehors.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (charte règle 1). Témoin :
 * `__tests__/charte.test.ts`, où cette feuille entre dans `FEUILLES`.
 */
export const FEUILLE_DES_LIENS = compacte(`
.liens-ecran{display:flex;flex-direction:column;min-height:100dvh;max-width:var(--shell-width);margin:0 auto}
.liens-ecran>.fil-tete{flex:none}

.liens{flex:1 1 0;min-height:0;overflow-y:auto;display:grid;gap:var(--space-2);margin:0;padding:0 var(--space-4) var(--space-9);list-style:none}

.lien{display:flex;align-items:center;gap:var(--space-3);min-height:var(--target-min);padding:var(--space-3);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-lg);background:var(--color-surface);color:inherit;text-decoration:none}
.lien .tuile{display:flex;align-items:center;justify-content:center;flex:none;line-height:0;color:var(--color-text-muted)}
.lien .tuile svg{width:var(--glyph);height:var(--glyph)}

.lien .dit{display:flex;flex-direction:column;gap:var(--space-1);flex:1 1 auto;min-width:0}
.lien .adresse{color:var(--color-text);overflow-wrap:anywhere}
.lien .meta{display:flex;flex-wrap:wrap;gap:var(--space-1) var(--space-2);font-size:var(--text-sm);color:var(--color-text-muted)}

.lien.ferme{background:var(--color-bg-sunken)}
.lien.ferme .adresse{color:var(--color-text-muted)}
.lien .etat{flex:none;padding:0 var(--space-2);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-pill);font-size:var(--text-sm);color:var(--color-text-muted)}
`);
