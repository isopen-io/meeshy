import { compacte } from '@/app/enveloppe/feuille';

/**
 * LA FEUILLE DE LA RECHERCHE — ce que `cible/search.png` dessine, moins les
 * deux groupes qu'aucune route ne sert.
 *
 * Elle s'ajoute au chrome, à la feuille connectée et à celle du FIL, dont
 * l'écran emprunte l'en-tête — comme la boîte, les contacts et les liens.
 * Quatre écrans que le lecteur enchaîne partagent un seul vocabulaire
 * d'en-tête (dimension 6).
 *
 * CE QUI LUI EST PROPRE, ET POURQUOI :
 *
 * 1. **Le champ et son bouton tiennent sur UNE ligne, et le champ seul se
 *    rétrécit.** Sans `min-width:0` sur le champ, « Chercher » sort de l'écran
 *    au premier téléphone étroit — le défaut ne se voit qu'en dessous de
 *    360 px, c'est-à-dire précisément sur les appareils que ce produit vise.
 * 2. **Le champ fait 52 px de haut, le bouton une cible pleine.** On tape une
 *    recherche au pouce ; un champ de la hauteur d'une ligne de texte se rate.
 * 3. **Un groupe est une SECTION avec son titre**, pas une rangée dépliante :
 *    la cible dessine des rangées qui mènent ailleurs, mais l'écran de détail
 *    par groupe n'existe pas — montrer les résultats directement évite un
 *    contrôle qui n'ouvre rien (règle 7).
 * 4. **Le compte d'un groupe est en sourdine, à côté de son titre.** Il dit ce
 *    qui est AFFICHÉ ; le mettre en évidence lui donnerait le poids d'un total,
 *    qu'aucune des deux routes ne sert.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (charte règle 1). Témoin :
 * `__tests__/charte.test.ts`, où cette feuille entre dans `FEUILLES`.
 */
export const FEUILLE_DE_LA_RECHERCHE = compacte(`
.recherche-ecran{display:flex;flex-direction:column;min-height:100dvh;max-width:var(--shell-width);margin:0 auto}
.recherche-ecran>.fil-tete{flex:none}

.chercher{display:flex;flex-direction:column;gap:var(--space-2);margin:0;padding:0 var(--space-4) var(--space-4)}
.chercher label{font-size:var(--text-sm);font-weight:var(--font-weight-medium);color:var(--color-text)}
.chercher .ligne{display:flex;align-items:center;gap:var(--space-2)}
.chercher input{flex:1 1 auto;min-width:0;min-height:var(--action-height-secondary);padding:0 var(--space-4);font-size:var(--text-md);font-family:inherit;color:var(--color-text);background:var(--color-surface);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-md)}
.chercher button{flex:none;min-height:var(--target-min)}
.chercher svg{flex:none;width:var(--glyph-inline);height:var(--glyph-inline)}

.trouvailles{flex:1 1 0;min-height:0;overflow-y:auto;display:grid;gap:var(--space-6);margin:0;padding:0 var(--space-4) var(--space-9)}

.groupe{display:grid;gap:var(--space-2)}
.groupe>.entete{display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-2);margin:0}
.groupe>.entete h2{margin:0;font-size:var(--text-md);font-weight:var(--font-weight-semibold);color:var(--color-text)}
.groupe>.entete .compte{flex:none;font-size:var(--text-sm);color:var(--color-text-muted)}
.groupe>ul{display:grid;gap:var(--space-2);margin:0;padding:0;list-style:none}
.groupe>.encore{margin:0;font-size:var(--text-sm);color:var(--color-text-muted)}

.trouvaille{display:flex;align-items:center;gap:var(--space-3);min-height:var(--target-min);padding:var(--space-3);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-lg);background:var(--color-surface);color:inherit;text-decoration:none}
.trouvaille .vignette{display:flex;align-items:center;justify-content:center;flex:none;line-height:0;color:var(--color-text-muted)}
.trouvaille .vignette svg{width:var(--glyph);height:var(--glyph)}
.trouvaille .dit{display:flex;flex-direction:column;gap:var(--space-1);flex:1 1 auto;min-width:0}
.trouvaille .primaire{color:var(--color-text);overflow-wrap:anywhere}
.trouvaille .secondaire{font-size:var(--text-sm);color:var(--color-text-muted);overflow-wrap:anywhere}
`);
