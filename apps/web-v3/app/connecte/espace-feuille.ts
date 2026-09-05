import { compacte } from '@/app/enveloppe/feuille';

import { feuilleQuiMonte } from './atomes-feuille';

/**
 * LES DEUX ACTIONS FLOTTANTES — ce qui remplace la barre d'onglets (conception
 * § 11, question 6). Servies par le TABLEAU DE BORD et par `/chats`, les deux
 * seuls écrans que la table de navigation de la planche en dote
 * (`MeeshyWebV3.dc.html:867-868`).
 *
 * ELLES SONT SÉPARÉES DE LA FEUILLE, et c'est la charte règle 7 : les ronds
 * voyagent sur les deux documents à l'état de REPOS, la feuille seulement dans
 * l'état `?espace`. Les fondre en une constante aurait fait payer la géométrie
 * du dialogue à tout lecteur qui ne l'ouvre pas.
 *
 * **LE `<nav>` RESTE DANS LE FLUX, LES DEUX RONDS EN SORTENT.** C'est ce qui
 * tient la clause b/c de la règle 7 — « au repos, aucun élément fixe ne couvre
 * un CONTRÔLE » : le conteneur réserve, sous la dernière ligne du document,
 * exactement la bande que les ronds occupent. Un conteneur lui-même `fixed`
 * aurait laissé le dernier bouton de la page dessous, et la seule parade
 * connue — `pointer-events:none` sur la bande — rend la zone traversable au
 * DOIGT sans la rendre atteignable au CLAVIER, où l'ordre de tabulation, lui,
 * ne saute rien.
 *
 * **ILS SUIVENT LA COQUILLE, PAS LE HUBLOT.** `left`/`right` sont bornés par
 * `max(…)` contre la demi-largeur de `--shell-width` : sur un écran large, deux
 * ronds collés aux bords de la fenêtre flotteraient à des centimètres du
 * contenu qu'ils commandent. Sur mobile, la borne est la gouttière — le cas
 * nominal, et celui de la cible.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (charte règle 1). Les deux
 * diamètres viennent de la table : 56 px pour l'action primaire
 * (`--action-height`), 52 px pour celle de contour (`--action-height-secondary`),
 * ce que la planche prescrit mot pour mot (`:550-556`).
 */
export const FEUILLE_DES_FLOTTANTES = compacte(`
.flottantes{position:relative;height:calc(var(--action-height) + var(--space-6));margin:0}
.flottante{position:fixed;bottom:var(--space-5);z-index:3;display:grid;place-items:center;border-radius:var(--radius-pill);text-decoration:none}
.flottante.gauche{left:max(var(--space-5),calc(50% - var(--shell-width) / 2 + var(--space-5)));width:var(--action-height-secondary);height:var(--action-height-secondary);border:var(--stroke-strong) solid var(--color-border-interactive);background:var(--color-surface);color:var(--color-primary)}
.flottante.droite{right:max(var(--space-5),calc(50% - var(--shell-width) / 2 + var(--space-5)));width:var(--action-height);height:var(--action-height);background:var(--color-primary);color:var(--color-on-primary)}
.flottante svg{width:var(--glyph);height:var(--glyph)}
`);

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
`);
