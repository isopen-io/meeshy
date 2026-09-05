import { compacte } from '@/app/enveloppe/feuille';

import { feuilleQuiMonte } from './atomes-feuille';

/**
 * LES DEUX RONDS FLOTTANTS ONT ÉTÉ RETIRÉS DES DEUX ÉCRANS (revue de #5164,
 * charte règle 8 b/c) — ce qui remplaçait la barre d'onglets (conception § 11,
 * question 6) est désormais `RACCOURCIS_D_ENTETE` (`atomes-feuille.ts`),
 * rendu par `raccourcisEntete` (`espace-vue.ts`) DANS le flux du document.
 *
 * **POURQUOI LE RAIL `position:fixed` NE TIENT PAS**, quelle que soit la
 * bande réservée sous la dernière ligne : un élément `fixed` reste ancré au
 * coin de la fenêtre à TOUT défilement, pas seulement au repos. Réserver une
 * bande en fin de flux ne protège que le défilement tout en bas (là où la
 * bande, enfin visible, se substitue au contrôle réel) — dès que le contenu
 * réel dépasse une fenêtre, le bas de l'écran AU DÉFILEMENT 0 montre déjà du
 * contenu réel, jamais la bande. `/chats` l'a mesuré en premier (le rail
 * couvrait le pied de l'enveloppe) ; le TABLEAU DE BORD a suivi à la revue
 * suivante (le même rail, resté `fixed` chez lui, couvrait sa carte de
 * conversation mise en avant dès que la liste sert plus de deux lignes — À
 * N'IMPORTE QUEL défilement, pas seulement au repos). La seule sortie qui
 * tienne à n'importe quelle longueur de contenu est de sortir les deux
 * cibles du flottant.
 */

/**
 * LA FEUILLE « ESPACE MEMBRE » — servie par le SERVEUR dans l'état `?espace`,
 * en `<dialog open data-retour>`, sur le tableau de bord comme sur `/chats`.
 *
 * SA GÉOMÉTRIE VIENT DE L'ATOME (`feuilleQuiMonte`), la quatrième surimpression
 * à le partager : ancrage en bas, hauteur bornée, voile, poignée. Ce qui lui
 * est propre tient en une idée — une LISTE DE DESTINATIONS, chacune une cible
 * d'un seul geste.
 *
 * ÉCHAP LA FERME SUR UN SEUL DES DEUX ÉCRANS, ET C'EST MESURÉ. `/chats` sert
 * son module de participation (le temps réel de la liste), donc
 * `prendsLePleinEcran` (`lib/realtime/plein-ecran.ts`) y élève ce
 * `dialog[open][data-retour]` en modale sans qu'une ligne lui soit ajoutée. **Le
 * TABLEAU DE BORD, lui, n'expédie AUCUN script** — `documentDuTableau` ne passe
 * pas de `script`, et c'est sa vertu : 0 Ko de JS sur l'écran d'accueil d'un
 * lecteur en 3G rurale. En charger un pour une touche coûterait un aller-retour
 * à un écran qui n'en paie aucun ; c'est le même arbitrage que la feuille des
 * liens, écrit là-bas mot pour mot. `data-retour` reste posé des DEUX côtés :
 * le jour où le tableau sert un module pour une AUTRE raison, l'élévation est
 * gratuite — une prise que rien n'occupe encore, jamais une promesse non tenue.
 *
 * LE SOCLE, LUI, EST LE MÊME PARTOUT et ne dépend d'aucun script : trois liens
 * ferment la feuille — la croix, le voile et la poignée —, plus le bouton
 * « précédent » du navigateur, que l'état d'adresse rend gratuit.
 *
 * LA RANGÉE PORTE SON GLYPHE À GAUCHE ET SON CHEVRON À DROITE, et le chevron
 * est ce qui ANNONCE qu'on va quelque part (même convention qu'au carrefour des
 * réglages). Toute la ligne est la cible — 44 px au moins, au pouce, d'une
 * main.
 */
export const FEUILLE_DE_L_ESPACE = feuilleQuiMonte('espace') + compacte(`
dialog.espace h2{margin:0 0 var(--space-1);font-size:var(--text-xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight)}
dialog.espace .tete{display:flex;align-items:flex-start;gap:var(--space-3)}
dialog.espace .tete .dit{flex:1;min-width:0}
dialog.espace .tete .sous{display:block;font-size:var(--text-sm);color:var(--color-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
dialog.espace .fermer{flex:none;display:inline-flex;align-items:center;justify-content:center;width:var(--target-min);height:var(--target-min);border-radius:var(--radius-pill);border:var(--stroke-hair) solid var(--color-border-strong);color:var(--color-text)}
dialog.espace .fermer svg{width:var(--glyph);height:var(--glyph)}
dialog.espace .rangs{display:flex;flex-direction:column;gap:var(--space-2);margin:var(--space-4) 0 0;padding:0;list-style:none}
dialog.espace .rangee{display:flex;align-items:center;gap:var(--space-3);min-height:var(--row-height);padding:var(--space-2) var(--space-3);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-lg);color:inherit;text-decoration:none}
dialog.espace .rangee:hover{background:var(--color-tint-primary)}
dialog.espace .rangee .tuile{flex:none;display:inline-flex;align-items:center;justify-content:center;width:var(--avatar-small);height:var(--avatar-small);border-radius:var(--radius-lg);background:var(--color-tint-primary);color:var(--color-primary)}
dialog.espace .rangee .tuile svg{width:var(--glyph);height:var(--glyph)}
dialog.espace .rangee .dit{flex:1;min-width:0}
dialog.espace .rangee .quoi{display:block;font-weight:var(--font-weight-medium)}
dialog.espace .rangee .sous{display:block;margin-top:var(--space-1);font-size:var(--text-sm);color:var(--color-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
dialog.espace .rangee > svg{flex:none;width:var(--glyph);height:var(--glyph);color:var(--color-text-subtle)}
dialog.espace .sortie{margin-top:var(--space-4)}
dialog.espace .sortie button{width:100%;min-height:var(--action-height-secondary);border-radius:var(--radius-pill);border:var(--stroke-strong) solid var(--color-danger);background:var(--color-tint-danger);color:var(--color-danger);font:inherit;font-weight:var(--font-weight-medium);cursor:pointer}
`);
