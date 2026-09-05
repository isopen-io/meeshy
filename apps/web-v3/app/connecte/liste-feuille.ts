import { compacte } from '@/app/enveloppe/feuille';

import { feuilleQuiMonte } from './atomes-feuille';

import { apercuDeLigne, PASTILLE_DE_LANGUE, TRACE_DE_FRAPPE } from './atomes-feuille';

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
 *   • la ligne porte DEUX étages — nom + méta, puis l'aperçu du dernier message
 *     avec sa pastille de langue. C'est ce second étage qui fait la différence
 *     entre une liste de noms et une liste de CONVERSATIONS ;
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
 * Aucune COULEUR et aucun PIXEL ne sont écrits (règle 1 / § 3.2 corollaire 2).
 * Témoin : `__tests__/charte.test.ts`, où cette feuille entre dans `FEUILLES`.
 */
export const FEUILLE_DE_LA_LISTE = compacte(`
${PASTILLE_DE_LANGUE}
${TRACE_DE_FRAPPE}
.liste{margin-top:var(--space-6)}
.liste>ul{margin:0;padding:0;list-style:none;border-top:var(--stroke-hair) solid var(--color-border-strong)}
.liste>ul>li{position:relative;border-bottom:var(--stroke-hair) solid var(--color-border-strong);overflow:hidden}

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

.actions{flex:none;position:relative}
.actions>summary{display:flex;align-items:center;justify-content:center;width:var(--target-min);height:var(--target-min);border-radius:var(--radius-pill);color:var(--color-text-muted);list-style:none;cursor:pointer;transition:background-color 120ms,color 120ms}
.actions>summary::-webkit-details-marker{display:none}
.actions>summary:hover{background:var(--color-tint-primary);color:var(--color-primary)}
.actions>summary svg{width:var(--glyph);height:var(--glyph)}
.actions form{display:grid;margin:var(--space-2) 0;padding:var(--space-2);border:var(--stroke-hair) solid var(--color-border-strong);border-radius:var(--radius-lg);background:var(--color-surface)}
.actions button{display:flex;align-items:center;gap:var(--space-3);min-height:var(--target-min);padding:0 var(--space-3);border:0;border-radius:var(--radius-lg);background:var(--color-surface);font:inherit;font-size:var(--text-base);color:var(--color-text);text-align:left;cursor:pointer;transition:background-color 120ms}
.actions button:hover{background:var(--color-bg-sunken)}
.actions button svg{flex:none;width:var(--glyph-inline);height:var(--glyph-inline)}
.actions button.grave{color:var(--color-danger)}

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
dialog.nouvelle-conv .champ input{min-height:var(--target-min);padding:var(--space-2) var(--space-3);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-lg);background:var(--color-surface);color:var(--color-text);font:inherit}
dialog.nouvelle-conv .aide{font-size:var(--text-sm);color:var(--color-text-muted)}
dialog.nouvelle-conv .groupe{display:flex;flex-direction:column;gap:var(--space-2);margin:0;padding:0;border:0}
dialog.nouvelle-conv legend{padding:0;font-size:var(--text-sm);font-weight:var(--font-weight-semibold);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:var(--tracking-wide)}
dialog.nouvelle-conv .carnet{display:flex;flex-direction:column;gap:var(--space-2);max-height:40dvh;overflow-y:auto;margin:0;padding:0;list-style:none}
dialog.nouvelle-conv .coche{display:flex;align-items:center;gap:var(--space-3);min-height:var(--target-min);padding:0 var(--space-3);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-lg)}
dialog.nouvelle-conv .pied{position:sticky;bottom:0;padding:var(--space-3) 0 0;background:var(--color-surface-raised)}
dialog.nouvelle-conv .pied .action{width:100%}
`);
