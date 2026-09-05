import { compacte } from '@/app/enveloppe/feuille';

import {
  apercuDeLigne,
  feuilleQuiMonte,
  MENU_DE_LIGNE,
  PASTILLE_DE_LANGUE,
  PUCE_DU_PRISME,
  RACCOURCIS_D_ENTETE,
  TRACE_DE_FRAPPE,
} from './atomes-feuille';

/**
 * LA FEUILLE DE `/chats` — la liste des conversations, et elle seule.
 *
 * Elle est SÉPARÉE de `FEUILLE_CONNECTEE` (charte règle 7 : « une feuille par
 * zone ; ce que la vitrine n'affiche pas, elle ne le paie pas ») parce que
 * `/chats` est le seul écran qui porte un aperçu au Prisme, une ligne de
 * frappe, un menu par ligne et un balayage. Le tableau de bord — qui partage
 * l'avatar, la carte et l'état vide — n'en paierait pas un octet utile.
 *
 * CE QUE LA CIBLE (`cible/chats.png`) DEMANDE, ET QUE LA CHARTE TRANCHE :
 *
 *   • DEUX PUCES D'ACTION, de même rang (`.action.contour`, 52 px), côte à
 *     côte — « Créer un lien » et « Conversation » — remplacent l'action
 *     primaire unique d'avant #5164 : deux effets distincts méritent deux
 *     contrôles distincts (règle 11 : un contrôle qui n'a qu'un effet ne se
 *     déguise pas en deux) ;
 *   • LA PUCE DU PRISME est posée à GAUCHE, au-dessus de la liste — l'atome
 *     `PUCE_DU_PRISME` (`atomes-feuille.ts`) est PARTAGÉ avec le fil, seule sa
 *     disposition diffère (le fil la centre, la liste l'aligne à gauche) ;
 *   • LA PREMIÈRE CONVERSATION NON LUE, DANS L'ORDRE SERVI, EST UNE CARTE
 *     mise en avant (`li.vedette` : fond `--color-surface`, rayon
 *     `--radius-xl`, aperçu sur deux lignes — l'avatar garde `--avatar`, la
 *     cible ne l'agrandit pas) — les autres restent des lignes
 *     PLATES. La règle qui l'élit (`vedetteDe`, `lib/contenu/liste.ts`) est
 *     PARTAGÉE avec le module de participation (`lib/realtime/liste-peinture.ts`) :
 *     une conversation qui remonte en tête AVEC des non-lus la devient EN
 *     DIRECT, sans qu'aucune règle ne soit réécrite au repeint ;
 *
 * CE QUE LA CARTE MISE EN AVANT CHANGE, ET CE QU'ELLE NE CHANGE PAS :
 *
 *   • le FOND (`--color-surface`), le RAYON (`--radius-xl`), la hauteur de la
 *     ligne, et surtout L'APERÇU SUR SA PROPRE LIGNE, pleine largeur, qui se
 *     lit sur DEUX lignes plutôt que de couper à trois mots — voilà la mise en
 *     avant. La ligne passe pour cela en GRILLE : `.corps` en `display:contents`
 *     rend ses trois fentes (`.tete`, `.meta`, `.apercu`) directement
 *     positionnables, sans qu'un seul nœud ne change dans le document servi ni
 *     dans ce que le module repeint. Une ligne PLATE, elle, reste en flex ;
 *   • l'AVATAR NE GROSSIT PAS. `cible/chats.png` est capturée à
 *     `deviceScaleFactor: 2` (`compare-rendu.js:194-195`) : le disque « ÉL »
 *     y mesure 92 px D'APPAREIL, soit 46 px CSS — `--avatar` (48 px), le même
 *     que les lignes plates. Le chiffre BRUT lu comme des pixels CSS avait
 *     produit un jeton `--avatar-large: 96px` et un avatar DEUX FOIS trop
 *     grand, qui écrasait l'aperçu en colonne étroite ;
 *   • l'HEURE se tait (`.quand`) : la carte met en avant le CONTENU, pas la
 *     récence. `data-quand` reste posé sur le `li` — le re-tri du module ne
 *     lit rien de ce que la feuille cache ;
 *   • la GOUTTIÈRE est portée par la GLISSIÈRE, jamais par le `li` : les deux
 *     pistes du balayage sont `inset:0` sur le `li`, donc un `padding` posé là
 *     leur laissait peindre leurs teintes dans les deux marges de la carte AU
 *     REPOS (mesuré sur `rendu/chats.dark.png`) ;
 *   • aucun FILET au-dessus d'elle : le filet haut de `.liste>ul` n'existe que
 *     pour une première ligne PLATE.
 *
 * ET LE SÉLECTEUR DE LA RÉGION DU PRISME EST `.puces` NU : cette région est
 * servie AVANT `<section class="liste">`, jamais dedans — `.liste .puces` ne
 * désignait rien, et l'alignement à gauche n'était que le défaut d'un
 * conteneur sans règle.
 *
 *   • la ligne porte DEUX étages — nom + méta, puis l'aperçu du dernier message
 *     avec sa pastille de langue. C'est ce second étage qui fait la différence
 *     entre une liste de noms et une liste de CONVERSATIONS ; l'aperçu prend
 *     l'ENCRE PLEINE (`--color-text`, règle 18) sur les deux dispositions —
 *     `apercuDeLigne` le pose sur `.liste` ET sur `.carte` (`app/connecte/
 *     feuille.ts`) depuis le même site, jamais deux fois ;
 *   • la pastille de langue et la trace de frappe viennent des ATOMES partagés
 *     avec le fil (`atomes-feuille.ts`) : le même code, la même forme, sur les
 *     deux écrans qu'un tap sépare ;
 *   • le menu de chaque ligne est un `<details>` NATIF (règle 25) : il s'ouvre
 *     au clavier, s'annonce au lecteur d'écran et marche sans un octet de
 *     JavaScript. C'est le chemin ÉQUIVALENT du balayage, exigé par le
 *     § 12.10.4 — jamais un chemin de repli au rabais ;
 *   • le balayage ne DÉCLARE aucune transition géométrique (règle 24) : le
 *     glissement suit le doigt, posé par le module en style direct, et rien ne
 *     s'anime quand le doigt part. Ce qui bouge sous la main n'est pas du
 *     mouvement décoratif ;
 *   • `touch-action: pan-y` rend le défilement VERTICAL au navigateur (le fil
 *     de la page reste fluide sous le pouce) et ne nous laisse que l'horizontal ;
 *     `user-select: none` empêche le glisser-déposer de SÉLECTION, qui ANNULE le
 *     balayage sous la souris et le stylet — mesuré : `dragstart` puis
 *     `pointercancel` dès le troisième pixel, et le geste ne se produisait
 *     jamais ailleurs qu'au doigt ;
 *   • les deux PISTES révélées par le balayage sont peintes sur des teintes de
 *     la table (`--color-tint-primary`, `--color-tint-danger`) et portent leur
 *     mot : un fond coloré seul ne dit rien à qui ne distingue pas les
 *     couleurs ;
 *   • la région `aria-live` des gestes est SERVIE même vide (une région créée
 *     après coup n'est annoncée par aucun lecteur d'écran) — et `:empty` lui
 *     retire sa hauteur : sans cette ligne, un écran qui n'a rien à dire
 *     ouvrait un trou d'une LIGNE entière entre l'accroche et la première
 *     conversation, mesuré à 390 × 844.
 *
 * `RACCOURCIS_D_ENTETE` (`.entete-chats` / `.raccourcis-entete` /
 * `.raccourci`, atome partagé avec le TABLEAU DE BORD depuis la revue
 * suivante — `atomes-feuille.ts`) — remplace les deux ronds flottants par
 * deux raccourcis de 44 px DANS l'en-tête, parce que la mesure a trouvé les
 * liens du pied de l'enveloppe couverts par le rail au repos ET à
 * mi-défilement. `.entete-chats` met le titre et les deux raccourcis sur la
 * même ligne ; `.raccourci` est tertiaire (`--target-min`, règle 7), un
 * cercle à filet — la même géométrie qu'un rond flottant, jamais
 * `position:fixed`.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (règle 1 / § 3.2 corollaire 2).
 * Témoin : `__tests__/charte.test.ts`, où cette feuille entre dans `FEUILLES`.
 */
export const FEUILLE_DE_LA_LISTE = compacte(`
${PASTILLE_DE_LANGUE}
${TRACE_DE_FRAPPE}
${MENU_DE_LIGNE}
${PUCE_DU_PRISME}
${RACCOURCIS_D_ENTETE}

.actions-rapides{display:flex;gap:var(--space-3);margin-top:var(--space-5)}
.actions-rapides .action{flex:1;width:auto;padding:0 var(--space-3);font-size:var(--text-sm);white-space:nowrap}
.actions-rapides svg{flex:none;width:var(--glyph);height:var(--glyph)}

.puces{display:flex;justify-content:flex-start;margin:var(--space-5) 0 0}

.liste{margin-top:var(--space-4)}
.liste>ul{margin:0;padding:0;list-style:none;border-top:var(--stroke-hair) solid var(--color-border-strong)}
.liste>ul:has(>li.vedette:first-child){border-top:0}
.liste>ul>li{position:relative;border-bottom:var(--stroke-hair) solid var(--color-border-strong);overflow:hidden}

.liste>ul>li.vedette{margin-bottom:var(--space-4);border-bottom:0;border-radius:var(--radius-xl);background:var(--color-surface)}
.liste>ul>li.vedette .glissiere{padding:0 var(--space-3);background:var(--color-surface)}
.liste>ul>li.vedette a.ligne{display:grid;grid-template-columns:auto minmax(0,1fr) auto;column-gap:var(--space-3);row-gap:var(--space-1);align-items:center;padding:var(--space-4) 0}
.liste>ul>li.vedette .corps{display:contents}
.liste>ul>li.vedette .avatar{grid-area:1/1/3/2;align-self:center}
.liste>ul>li.vedette .tete{grid-area:1/2/2/3}
.liste>ul>li.vedette .meta{grid-area:2/2/3/3;margin-top:0}
.liste>ul>li.vedette .compte{grid-area:1/3/3/4}
.liste>ul>li.vedette .apercu{grid-area:3/1/4/4;margin-top:var(--space-2)}
.liste>ul>li.vedette .frappe{grid-area:4/1/5/4}
.liste>ul>li.vedette .nom{font-size:var(--text-md)}
.liste>ul>li.vedette .quand{display:none}
.liste>ul>li.vedette .apercu .texte{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

.piste{position:absolute;inset:0;display:flex;align-items:center;padding:0 var(--space-4);font-size:var(--text-sm);font-weight:var(--font-weight-semibold)}
.piste.avant{justify-content:flex-start;background:var(--color-tint-primary);color:var(--color-text)}
.piste.apres{justify-content:flex-end;background:var(--color-tint-danger);color:var(--color-text)}

.glissiere{position:relative;display:flex;align-items:center;gap:var(--space-1);background:var(--color-bg);touch-action:pan-y;-webkit-user-select:none;user-select:none}
/* L'avatar ouvre le profil de l'autre personne d'un tête-à-tête (§ 12.10.3),
   séparé du a.ligne qui mène au fil — deux cliquables, jamais un lien dans
   un lien. */
.glissiere .avatar-lien{flex:none;display:block;padding-left:var(--space-1)}
.liste a.ligne{flex:1;display:flex;align-items:center;gap:var(--space-3);min-width:0;min-height:var(--row-height);padding:var(--space-2) 0;color:inherit;text-decoration:none}
.liste .corps{flex:1;min-width:0}
.liste .tete{display:flex;align-items:baseline;gap:var(--space-2)}
.liste .nom{flex:1;min-width:0;font-weight:var(--font-weight-semibold);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.liste .quand{flex:none;font-size:var(--text-xs);color:var(--color-text-subtle)}
.liste .meta{display:block;margin-top:var(--space-1);font-size:var(--text-sm);color:var(--color-text-subtle)}
${apercuDeLigne('.liste')}
.liste .frappe{margin-top:var(--space-1)}
.liste .muet{flex:none;display:inline-flex;color:var(--color-text-subtle)}
.liste .muet svg{width:var(--glyph-inline);height:var(--glyph-inline)}
.liste li[data-nonlus="0"] .compte{display:none}
.liste .compte .valeur{display:block}

.defaite{display:flex;align-items:center;gap:var(--space-3);min-height:var(--row-height);padding:var(--space-2) 0;font-size:var(--text-base);color:var(--color-text-muted)}
.defaite:empty{min-height:0;padding:0}
.defaite .quoi{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.defaite .action{width:auto;min-height:var(--target-min);padding:0 var(--space-4);font-size:var(--text-sm)}

.manque{margin:var(--space-4) 0 0;padding:var(--space-3);border:var(--stroke-strong) dashed var(--color-border-strong);border-radius:var(--radius-lg);text-align:center;font-size:var(--text-sm);color:var(--color-text-muted)}
.manque a{display:inline-flex;align-items:center;min-height:var(--target-min);font-weight:var(--font-weight-medium)}

@media (min-width:600px){
.defaite .action{flex:none}
}
`);

/**
 * LA FEUILLE « NOUVELLE CONVERSATION » (`sheet:conv`, #5072) — servie
 * SEULEMENT dans l'état `/chats?nouvelle`.
 *
 * Elle n'est pas dans `FEUILLE_DE_LA_LISTE` : ce qu'un écran n'affiche pas, il
 * ne le paie pas (charte règle 7). Sa géométrie vient de l'atome
 * (`feuilleQuiMonte`), partagé avec le panneau de profil et la feuille des
 * liens — trois surimpressions, une seule géométrie.
 *
 * LA LISTE DES CONTACTS DÉFILE DANS LA FEUILLE, pas la feuille entière : un
 * carnet de quarante personnes pousserait sinon le bouton « Créer » hors de
 * vue, et le lecteur ne saurait pas qu'il existe. Le pied reste COLLANT pour la
 * même raison.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (charte règle 1).
 */
export const FEUILLE_DE_LA_NOUVELLE_CONV = feuilleQuiMonte('nouvelle-conv') + compacte(`
dialog.nouvelle-conv h2{margin:0 0 var(--space-1);font-size:var(--text-xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight)}
dialog.nouvelle-conv .tete{display:flex;align-items:flex-start;gap:var(--space-3)}
dialog.nouvelle-conv .tete .dit{flex:1;min-width:0}
dialog.nouvelle-conv .fermer{flex:none;display:inline-flex;align-items:center;justify-content:center;width:var(--target-min);height:var(--target-min);border-radius:var(--radius-pill);border:var(--stroke-hair) solid var(--color-border-strong);color:var(--color-text)}
dialog.nouvelle-conv .fermer svg{width:var(--glyph);height:var(--glyph)}
dialog.nouvelle-conv form{display:flex;flex-direction:column;gap:var(--space-4);margin:var(--space-4) 0 0}
dialog.nouvelle-conv .champ{display:flex;flex-direction:column;gap:var(--space-2)}
dialog.nouvelle-conv .champ label{font-size:var(--text-sm);font-weight:var(--font-weight-medium)}
dialog.nouvelle-conv .champ input{min-height:var(--target-min);padding:var(--space-2) var(--space-3);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-md);background:var(--color-surface);color:var(--color-text);font:inherit}
dialog.nouvelle-conv .aide{font-size:var(--text-sm);color:var(--color-text-muted)}
dialog.nouvelle-conv .groupe{display:flex;flex-direction:column;gap:var(--space-2);margin:0;padding:0;border:0}
dialog.nouvelle-conv legend{padding:0;font-size:var(--text-sm);font-weight:var(--font-weight-semibold);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:var(--tracking-wide)}
dialog.nouvelle-conv .carnet{display:flex;flex-direction:column;gap:var(--space-2);max-height:40dvh;overflow-y:auto;margin:0;padding:0;list-style:none}
dialog.nouvelle-conv .coche{display:flex;align-items:center;gap:var(--space-3);min-height:var(--target-min);padding:0 var(--space-3);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-lg)}
dialog.nouvelle-conv .pied{position:sticky;bottom:0;padding:var(--space-3) 0 0;background:var(--color-surface-raised)}
dialog.nouvelle-conv .pied .action{width:100%}
`);
