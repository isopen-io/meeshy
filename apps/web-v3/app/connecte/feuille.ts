import { compacte } from '@/app/enveloppe/feuille';

import { apercuDeLigne, CHAMP_D_APPEL, PASTILLE_DE_LANGUE } from './atomes-feuille';

/**
 * La feuille de la zone CONNECTÉE — le tableau de bord, la liste des
 * conversations et le cadre du fil, qui partagent un vocabulaire : des CARTES
 * pour ce qu'on reprend, des LIGNES pour ce qu'on parcourt, et une carte VIDE
 * dessinée pour ce qui manque.
 *
 * CE QUE LA CHARTE Y A CHANGÉ (conception § 12.5, directive du 2026-09-01) —
 * « les pages EXISTANTES de la v3 sont TERNES : il faut les STYLISER, sans les
 * alourdir » :
 *
 * 1. **Les espacements viennent des neuf pas de la table** (règles 1 et 8). Ils
 *    étaient en pixels littéraux — `48px 0 8px` de salutation, `14px` de
 *    gouttière, `20px` de carte, `32px`, `40px`, `10px`, `6px`, `2px` — c'est-à-
 *    dire une échelle inventée par écran, la seconde table du corollaire 2 sous
 *    un autre nom. Une carte de tableau de bord et une carte de vitrine se
 *    lisent sur le même écran d'un lecteur qui vient de se connecter.
 * 2. **`--color-neutral-900` a cédé la place à `--color-border-strong`**
 *    (règle 10). Un filet se déclare par son RÔLE : prendre un cran de la rampe
 *    neutre marche dans le schéma où on l'a regardé et se retourne dans l'autre.
 *    Et la distinction filet ≠ contour est désormais PORTÉE : une carte
 *    d'information prend le filet fin, une carte CLIQUABLE prend le contour de
 *    `--color-border-interactive`. C'est l'élément qui décide, pas une classe de
 *    plus — `li.carte` informe, `a.carte` se clique.
 * 3. **L'avatar dit QUI, sur les quatre teintes de la table** (règle 11). La
 *    pastille était peinte à l'accent, dilué en `color-mix` : toutes les
 *    conversations avaient la même couleur, donc la couleur ne disait rien, et
 *    elle prenait l'accent que la règle 13 réserve à cinq emplois.
 * 4. **L'état vide est DESSINÉ** (règle 18) : contour pointillé, glyphe de
 *    40 px, titre, phrase — et une action primaire seulement là où elle a un
 *    EFFET. C'était un bloc de texte centré dans une carte pleine, qui se lisait
 *    comme du contenu.
 * 5. **Les titres de section QUALIFIENT** : petites capitales espacées, comme
 *    « REPRENDRE » et « MES LIENS » de la cible `home.png`. Le `--text-2xl` du
 *    chrome faisait de chaque intertitre un second `h1`.
 *
 * PORTAGE TOUR 3 (jugement du 2026-09-02, § 12.5 renuméroté — voir « À
 * corriger dans le dépôt tel qu'il est ») :
 *
 * 6. **`.carte-vide` porte `--radius-xl`, pas `--radius-lg`** (règle 9 : « `xl`
 *    héros, carte mise en avant, carte d'état vide »).
 * 7. **Son contour pointillé prend `--color-border-interactive`, jamais
 *    `--color-border-strong`** (règle 16 : « État vide et `trou` : pointillé
 *    `--stroke-strong` `--color-border-interactive` »). Le filet des cartes
 *    PLEINES ne tient pas le sens d'un contour qui le porte SEUL.
 * 8. **`.carte-vide p` prend l'encre pleine `--color-text`, jamais
 *    `--color-text-muted`** (règle 18, qui NOMME `.carte-vide p` dans la liste
 *    des sélecteurs interdits au gris) : c'est le texte pour lequel on ouvre
 *    l'état, pas une méta qu'on peut ne pas lire.
 * 9. **`.carte-vide h1,.carte-vide h3`** (issue #4967, `storyFail`) : le
 *    gabarit d'écran sans contenu que `carteVide()` réserve à un `<h3>` (une
 *    carte au milieu d'une liste) sert aussi un DOCUMENT ENTIER
 *    (`documentDeMessage`, `app/enveloppe/vue.ts`), qui pose toujours un
 *    `<h1>` — chaque document en veut exactement un. Le SÉLECTEUR se partage,
 *    pas la balise : deux niveaux de titre, une seule règle visuelle.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (§ 3.2 corollaire 2, charte
 * règle 1). Témoin : `__tests__/charte.test.ts`.
 */
export const FEUILLE_CONNECTEE = compacte(`
.bonjour{padding-top:var(--space-6)}
.bonjour h1{margin:0 0 var(--space-2);font-size:var(--text-3xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight);letter-spacing:-.02em}
.bonjour p{margin:0;max-width:var(--measure);color:var(--color-text-muted)}
.bonjour p+p{margin-top:var(--space-3)}

.chiffres{display:grid;gap:var(--space-3);margin:var(--space-6) 0 0;padding:0;list-style:none;grid-template-columns:1fr 1fr}
.chiffres li{padding:var(--space-4);border:var(--stroke-hair) solid var(--color-border-strong);border-radius:var(--radius-lg);background:var(--color-surface)}
.chiffres .valeur{display:block;font-size:var(--text-3xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight);letter-spacing:-.02em}
.chiffres .quoi{display:block;margin-top:var(--space-1);font-size:var(--text-base);font-weight:var(--font-weight-medium)}
.chiffres .precision{display:block;font-size:var(--text-xs);letter-spacing:.06em;text-transform:uppercase;color:var(--color-text-subtle)}

.section{margin-top:var(--space-7)}
.section .tete{display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);min-height:var(--target-min)}
.section h2{margin:0;font-size:var(--text-sm);font-weight:var(--font-weight-semibold);letter-spacing:.08em;text-transform:uppercase;color:var(--color-text-muted)}

.cartes{display:grid;gap:var(--space-3);margin:var(--space-3) 0 0;padding:0;list-style:none}
.carte{display:flex;align-items:center;gap:var(--space-4);min-height:var(--row-height);padding:var(--space-4);border:var(--stroke-hair) solid var(--color-border-strong);border-radius:var(--radius-lg);background:var(--color-surface);color:inherit;text-decoration:none}
a.carte{border-width:var(--stroke-strong);border-color:var(--color-border-interactive);transition:background-color 120ms,border-color 120ms}
a.carte:hover{background:var(--color-tint-primary)}
.carte .corps{flex:1;min-width:0}
.carte .nom{display:block;font-weight:var(--font-weight-semibold);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.carte .meta{display:block;margin-top:var(--space-1);font-size:var(--text-base);color:var(--color-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.carte .tuile{display:inline-flex;align-items:center;justify-content:center;flex:none;width:var(--avatar);height:var(--avatar);border-radius:var(--radius-md);background:var(--color-tint-primary)}
.carte .tuile svg{width:var(--glyph);height:var(--glyph)}

.avatar{display:grid;place-items:center;flex:none;width:var(--avatar);height:var(--avatar);border-radius:var(--radius-pill);font-size:var(--text-base);font-weight:var(--font-weight-semibold);color:var(--color-on-avatar)}
.avatar.t1{background:var(--color-avatar-1)}
.avatar.t2{background:var(--color-avatar-2)}
.avatar.t3{background:var(--color-avatar-3)}
.avatar.t4{background:var(--color-avatar-4)}

.compte{flex:none;display:grid;place-items:center;min-width:var(--space-6);height:var(--space-6);padding:0 var(--space-2);border-radius:var(--radius-pill);font-size:var(--text-sm);font-weight:var(--font-weight-semibold);background:var(--color-primary);color:var(--color-on-primary)}

.carte-vide{margin-top:var(--space-3);padding:var(--space-5);border:var(--stroke-strong) dashed var(--color-border-interactive);border-radius:var(--radius-xl);text-align:center}
.carte-vide svg{width:var(--glyph-large);height:var(--glyph-large);color:var(--color-text-muted)}
.carte-vide h1,.carte-vide h3{margin:var(--space-2) 0 var(--space-1);font-size:var(--text-lg);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight)}
.carte-vide p{margin:0 auto;max-width:var(--measure);color:var(--color-text)}
.carte-vide .action{margin-top:var(--space-5)}

.acces{margin-top:var(--space-7)}
.acces nav{display:flex;flex-wrap:wrap;gap:var(--space-3);margin-top:var(--space-4)}
.acces nav form{flex:1 1 100%;margin:0}

.fil{margin-top:var(--space-7)}
.fil ul{margin:var(--space-3) 0 0;padding:0;list-style:none;border-top:var(--stroke-hair) solid var(--color-border-strong)}
.fil li{border-bottom:var(--stroke-hair) solid var(--color-border-strong)}
.fil a.ligne{display:flex;align-items:center;gap:var(--space-4);min-height:var(--row-height);padding:var(--space-2) 0;text-decoration:none;color:inherit}
.fil .corps{flex:1;min-width:0}
.fil .nom{display:block;font-weight:var(--font-weight-medium);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fil .meta{display:block;margin-top:var(--space-1);font-size:var(--text-sm);color:var(--color-text-subtle)}

@media (min-width:600px){
.cartes{grid-template-columns:1fr 1fr}
.carte-vide .action{width:auto}
}
`);

/**
 * LA FEUILLE DU TABLEAU DE BORD — ce que la CARTE de reprise sert, et que rien
 * d'autre dans la zone ne rend.
 *
 * Elle est SÉPARÉE de `FEUILLE_CONNECTEE` pour la raison même qui a séparé
 * celle de `/chats` (charte règle 7) : la feuille de zone voyage sur les SIX
 * documents de la zone — le fil, son état `?media=`, la galerie des médias, le
 * choix de `/chat/:lien`, la story —, et l'aperçu au Prisme n'est rendu que
 * par DEUX d'entre eux. Y remonter la pastille et le bloc d'aperçu coûtait
 * 52 o gzip au fil et 69 o à la story (mesuré), sur le document déjà le plus
 * lourd du dépôt, pour des règles qu'aucun des deux n'applique.
 *
 * ELLE PORTE AUSSI LE CHAMP DE RECHERCHE, et pour la même raison : « Rechercher
 * partout » est posé en tête du seul tableau de bord (`MeeshyWebV3.dc.html:74`,
 * table de navigation `:867` — « search, Recherche, champ »). Aucun autre écran
 * de la zone ne le rend, aucun autre ne le paie.
 *
 * Les deux règles viennent des ATOMES (`atomes-feuille.ts`), qu'elle partage
 * avec `/chats` : la pastille de langue est la même sur les deux écrans qu'un
 * tap sépare, et `apercuDeLigne` en est le bloc, servi ici sous la racine de la
 * carte.
 */
export const FEUILLE_DU_TABLEAU = compacte(`
${PASTILLE_DE_LANGUE}
${apercuDeLigne('.carte')}
${CHAMP_D_APPEL}
`);
