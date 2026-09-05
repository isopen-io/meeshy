import { compacte } from '@/app/enveloppe/feuille';

import { feuilleQuiMonte, MENU_DE_LIGNE } from './atomes-feuille';

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
 * 5. **Le menu de fermeture (#4933) est le MÊME atome que celui de `/chats`**
 *    (`MENU_DE_LIGNE`) : un `<details class="actions">` par ligne ACTIVE, posé
 *    en FRÈRE du `.lien` — jamais un `<form>` dans un `<a>` (HTML invalide, et
 *    un clic sur « Fermer ce lien » ouvrirait la conversation au passage).
 * 6. **Le menu OUVERT DESCEND, il ne pousse pas la ligne de côté** — une
 *    surcharge propre à cet écran. L'atome pose le `<form>` EN FLUX, ce qui
 *    convient à `/chats` : là, les trois gestes sont des mots seuls dans une
 *    ligne qui occupe déjà toute la largeur. Ici le `<details>` est le FRÈRE
 *    du `.lien` dans une rangée : ouvert, son formulaire — qui porte un
 *    PARAGRAPHE (`FERMETURE.aide`) — prenait sa part de la rangée et écrasait
 *    l'adresse à quelques caractères par ligne (capture à 390 px : « 127.0.0.
 *    1:44637/chat/ms hy_lago s »). Le rendre seulement rétrécissable ne
 *    suffisait pas : le paragraphe et l'adresse se disputent la MÊME rangée.
 *    Le formulaire sort donc du flux et pend SOUS le sommaire, aligné au
 *    BORD DE FIN de ligne, dans la largeur de la ligne — le patron de menu
 *    que le `<li>` (`position:relative`) et l'atome (`.actions{position:
 *    relative}`) préparaient déjà. `inset-inline-end`, jamais `right` : un
 *    panneau ancré par une propriété PHYSIQUE pendrait du mauvais côté, hors
 *    du viewport, dès que le document passe `dir="rtl"` — une propriété
 *    LOGIQUE fait le travail sans une seconde règle. Sans JavaScript :
 *    `<details>` natif, aucun changement.
 *    AUCUNE OMBRE ne l'en détache (règles 14 et 16 : la seule du dépôt est
 *    l'anneau de focus du socle, et `charte.test.ts` les compte) — ce qui le
 *    pose au-dessus est son FOND opaque et son filet, les deux que l'atome
 *    donne déjà.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (charte règle 1). Témoin :
 * `__tests__/charte.test.ts`, où cette feuille entre dans `FEUILLES`.
 */
export const FEUILLE_DES_LIENS = compacte(`
${MENU_DE_LIGNE}
.liens-ecran{display:flex;flex-direction:column;min-height:100dvh;max-width:var(--shell-width);margin:0 auto}
.liens-ecran>.fil-tete{flex:none}

.liens{flex:1 1 0;min-height:0;overflow-y:auto;display:grid;gap:var(--space-2);margin:0;padding:0 var(--space-4) var(--space-9);list-style:none}
.liens>li{position:relative;display:flex;align-items:center;gap:var(--space-2)}
.liens .actions{position:static}
.liens .actions form{position:absolute;z-index:1;top:calc(100% + var(--space-1));inset-inline-end:0;width:min(22rem,100%);margin:0}

.lien{display:flex;flex:1 1 auto;align-items:center;gap:var(--space-3);min-width:0;min-height:var(--target-min);padding:var(--space-3);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-lg);background:var(--color-surface);color:inherit;text-decoration:none}
.lien .tuile{display:flex;align-items:center;justify-content:center;flex:none;line-height:0;color:var(--color-text-muted)}
.lien .tuile svg{width:var(--glyph);height:var(--glyph)}

.lien .dit{display:flex;flex-direction:column;gap:var(--space-1);flex:1 1 auto;min-width:0}
.lien .adresse{color:var(--color-text);overflow-wrap:anywhere}
.lien .meta{display:flex;flex-wrap:wrap;gap:var(--space-1) var(--space-2);font-size:var(--text-sm);color:var(--color-text-muted)}

.lien.ferme{background:var(--color-bg-sunken)}
.lien.ferme .adresse{color:var(--color-text-muted)}
.lien .etat{flex:none;padding:0 var(--space-2);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-pill);font-size:var(--text-sm);color:var(--color-text-muted)}

#carnet>.avis{display:flex;align-items:center;gap:var(--space-2);margin:0 var(--space-4) var(--space-3);padding:var(--space-3);font-size:var(--text-sm);color:var(--color-text-muted)}
#carnet>.avis svg{flex:none;width:var(--glyph-inline);height:var(--glyph-inline)}
#carnet>.avis .motif{min-width:0;overflow-wrap:anywhere}
#carnet>.avis.alerte{border:var(--stroke-hair) solid var(--color-danger);border-radius:var(--radius-lg);color:var(--color-danger)}
`);

/**
 * LA FEUILLE « NOUVEAU LIEN » (`sheet:link`, #5071) — servie dans l'état
 * `/links?nouveau` ET, depuis #5034, dans l'état `/chats/:cle?lien` : DEUX
 * hôtes, UN balisage (`app/connecte/nouveau-lien-vue.ts`), donc une seule
 * feuille. Chacun ne la sert que dans SON état.
 *
 * Elle n'est pas dans `FEUILLE_DES_LIENS` : la charte règle 7 dit que ce qu'un
 * écran n'affiche pas, il ne le paie pas, et `/links` sans état ne rend aucune
 * feuille. C'est le même partage que le plein écran d'un média
 * (`FEUILLE_DU_PLEIN`, servie dans le seul état `?media=`).
 *
 * SA GÉOMÉTRIE VIENT DE L'ATOME (`feuilleQuiMonte`), partagé avec le panneau de
 * profil : une feuille qui monte est la même partout, et la recopier ici en
 * aurait fait une troisième copie — celle qui diverge.
 *
 * LE VOILE EST DESSINÉ, ET IL LE FAUT ICI. Sur le panneau de profil, un module
 * élève le dialogue en modale et `::backdrop` peint le voile ; ici la feuille est
 * SERVIE ouverte (`<dialog open>`, jamais `showModal()`), donc sans
 * `::backdrop` — et le module de `/links` (#5090) ne l'élève pas non plus, il
 * ne fait que la retirer. Sans le `<a class="voile">` servi, la feuille
 * flotterait sur un carnet nu, et le troisième chemin de fermeture n'existerait
 * pas. Corollaire : ce voile est le SECOND nœud de la feuille — qui la retire
 * les retire TOUS LES DEUX (`lib/realtime/feuille-de-lien.ts` › `poseLaRegion`).
 *
 * CE QUI LUI EST PROPRE :
 *
 * 1. **Les groupes de cases sont des `<fieldset>`**, pas des `<div>` : « ce que
 *    les invités peuvent faire » est le NOM du groupe, et sans `<legend>` un
 *    lecteur d'écran annonce « Écrire des messages » sans jamais dire de quoi.
 * 2. **Une case et son libellé sont UNE cible de 44 px** — la ligne entière se
 *    coche, au pouce, d'une main.
 * 3. **Le pied du formulaire est COLLANT** : la feuille défile, le bouton
 *    « Créer » reste atteignable sans avoir à remonter — sur un écran de
 *    téléphone, la liste des permissions le pousse sinon hors de vue.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (charte règle 1).
 */
export const FEUILLE_DU_NOUVEAU_LIEN = feuilleQuiMonte('nouveau-lien') + compacte(`
dialog.nouveau-lien h2{margin:0 0 var(--space-1);font-size:var(--text-xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight)}
dialog.nouveau-lien .tete{display:flex;align-items:flex-start;gap:var(--space-3)}
dialog.nouveau-lien .tete .dit{flex:1;min-width:0}
dialog.nouveau-lien .sous{margin:0;font-size:var(--text-sm);line-height:var(--leading-normal);color:var(--color-text-muted)}
dialog.nouveau-lien .fermer{flex:none;display:inline-flex;align-items:center;justify-content:center;width:var(--target-min);height:var(--target-min);border-radius:var(--radius-pill);border:var(--stroke-hair) solid var(--color-border-strong);color:var(--color-text)}
dialog.nouveau-lien .fermer svg{width:var(--glyph);height:var(--glyph)}
dialog.nouveau-lien form{display:flex;flex-direction:column;gap:var(--space-4);margin:var(--space-4) 0 0}
dialog.nouveau-lien .groupe{display:flex;flex-direction:column;gap:var(--space-2);margin:0;padding:0;border:0}
dialog.nouveau-lien legend{padding:0;font-size:var(--text-sm);font-weight:var(--font-weight-semibold);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:var(--tracking-wide)}
dialog.nouveau-lien .champ{display:flex;flex-direction:column;gap:var(--space-2)}
dialog.nouveau-lien .champ label{font-size:var(--text-sm);font-weight:var(--font-weight-medium)}
dialog.nouveau-lien .champ input{min-height:var(--target-min);padding:var(--space-2) var(--space-3);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-lg);background:var(--color-surface);color:var(--color-text);font:inherit}
dialog.nouveau-lien .aide{font-size:var(--text-sm);color:var(--color-text-muted)}
dialog.nouveau-lien .coche{display:flex;align-items:center;gap:var(--space-3);min-height:var(--target-min);padding:0 var(--space-3);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-lg)}
dialog.nouveau-lien .pied{position:sticky;bottom:0;padding:var(--space-3) 0 0;background:var(--color-surface-raised)}
dialog.nouveau-lien .pied .action{width:100%}
`);
