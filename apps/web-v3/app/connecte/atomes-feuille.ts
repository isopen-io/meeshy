/**
 * LES ATOMES QUE PLUSIEURS ÉCRANS DE LA ZONE PARTAGENT — et rien d'autre.
 *
 * La charte découpe le CSS par ROUTE (règle 7) : la feuille du fil n'est pas
 * servie sur `/chats`, celle de la liste ne l'est pas sur `/chats/:cle`. Deux
 * feuilles disjointes qui déclarent chacune sa `.langue` sont pourtant la
 * JUMELLE que le § 3.2 interdit : le jour où la pastille change de rayon, elle
 * change d'un côté seulement, et la même information se lit de deux façons sur
 * deux écrans qu'un tap sépare.
 *
 * Ces atomes le sont au sens strict : ils disent la même chose partout où on
 * les sert — « ce texte a été traduit, voici depuis quelle langue » (charte
 * règle 22 : le CODE, jamais un drapeau) et « quelqu'un écrit » (règle 27). Ils
 * ne sont pas un thème partagé qu'on aurait remonté par commodité : tout le
 * reste de chaque écran reste chez lui.
 *
 * **CHAQUE ATOME SE SERT UNE FOIS PAR DOCUMENT, ET AUCUN ÉCRAN NE PAIE CELUI
 * QU'IL NE REND PAS.** `PASTILLE_DE_LANGUE` a TROIS lecteurs depuis que la
 * carte du tableau de bord sert l'aperçu au Prisme (`cible/home.png`) : le fil,
 * la liste, le tableau. Le remonter dans `FEUILLE_CONNECTEE`, que les trois
 * documents composent, aurait été le plus court — et aurait fait payer au FIL
 * et à la STORY (mesuré : +52 et +69 o gzip) une pastille que ni l'un ni
 * l'autre ne rend, sur le document déjà le plus lourd du dépôt. La charte
 * règle 7 dit l'inverse : ce qu'un écran n'affiche pas, il ne le paie pas.
 * L'atome s'interpole donc DANS LA FEUILLE DE CHAQUE ÉCRAN qui le rend — une
 * source, trois services, zéro déclaration en double dans un document servi.
 *
 * `apercuDeLigne` est un atome PARAMÉTRÉ par son sélecteur, et c'est la même
 * raison qui l'exige : la ligne de `/chats` et la carte du tableau de bord
 * rendent le même aperçu sous deux racines (`.liste`, `.carte`). Servir un
 * sélecteur groupé depuis la feuille de zone l'aurait fait voyager sur les six
 * documents ; recopier le bloc en aurait fait deux qui divergent au premier
 * changement de gouttière.
 */
export const PASTILLE_DE_LANGUE =
  '.langue{display:inline-flex;align-items:center;gap:var(--space-1);padding:0 var(--space-1);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-xs);letter-spacing:.06em;text-transform:uppercase;color:var(--color-primary)}' +
  // L'ATOME PORTE SON GLYPHE. Le fil dimensionnait celui-ci par une règle
  // VOISINE (`.ligne .meta svg`), qui ne suit pas la pastille hors du fil :
  // servie telle quelle dans la liste, elle rendait un SVG sans dimension —
  // invisible, mesuré à 390 × 844. Un atome qui dépend de son voisinage n'en
  // est pas un.
  '.langue svg{width:var(--glyph-inline);height:var(--glyph-inline)}';

export const TRACE_DE_FRAPPE = '.frappe{margin:0;font-size:var(--text-sm);font-style:italic;color:var(--color-primary)}';

/**
 * L'APERÇU DU DERNIER MESSAGE — la pastille de langue puis le texte, sur une
 * ligne qui se coupe plutôt qu'elle ne pousse (`min-width:0` + ellipse : sans
 * lui, un aperçu long élargit la ligne au lieu de se tronquer).
 *
 * `racine` est `.liste` (la ligne de `/chats`) ou `.carte` (la carte du tableau
 * de bord) : le même bloc, sous la seule racine que l'écran sert. Le fil a un
 * `.citation .apercu` qui n'a rien à voir — un aperçu de message CITÉ —, et
 * c'est la seconde raison de paramétrer plutôt que de dégrouper : un `.apercu`
 * nu lui imposerait un `display:flex` et une couleur qu'il n'a pas demandés.
 */
export const apercuDeLigne = (racine: string): string =>
  `${racine} .apercu{display:flex;align-items:center;gap:var(--space-2);margin-top:var(--space-1);min-width:0;font-size:var(--text-base);color:var(--color-text-muted)}` +
  `${racine} .apercu .langue{flex:none}` +
  `${racine} .apercu .texte{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`;
