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
 * LES DEUX RACCOURCIS D'EN-TÊTE (`raccourcisEntete`, `espace-vue.ts`) — ce qui
 * REMPLACE, sur les DEUX écrans qui en dotent la barre d'onglets (`/chats` et
 * le TABLEAU DE BORD), le rail `position:fixed` d'origine (charte règle 8
 * b/c). `.entete-chats` met le bloc de titre et les deux raccourcis sur la
 * même ligne ; `.raccourci` est TERTIAIRE (`--target-min`, règle 7), un
 * cercle à filet — la même géométrie qu'un rond flottant, jamais
 * `position:fixed`, donc jamais susceptible de recouvrir quoi que ce soit en
 * dessous, quelle que soit la longueur du contenu ou la position de
 * défilement.
 *
 * DEUX LECTEURS depuis la revue de #5164 : `/chats` l'a adopté en premier
 * (le rail y couvrait le pied de l'enveloppe) ; le TABLEAU DE BORD a suivi à
 * la revue suivante (le même rail, resté `position:fixed` chez lui, couvrait
 * sa carte de conversation mise en avant dès que la liste sert plus de deux
 * lignes). Un atome PARTAGÉ, jamais deux déclarations de la même géométrie.
 */
export const RACCOURCIS_D_ENTETE =
  '.entete-chats{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-3)}' +
  '.raccourcis-entete{display:flex;flex:none;gap:var(--space-2);margin-top:var(--space-1)}' +
  '.raccourci{display:inline-flex;align-items:center;justify-content:center;width:var(--target-min);height:var(--target-min);border-radius:var(--radius-pill);border:var(--stroke-strong) solid var(--color-border-interactive);color:var(--color-primary)}' +
  '.raccourci svg{width:var(--glyph);height:var(--glyph)}';

/**
 * LA PUCE DU PRISME, EN GÉOMÉTRIE — pilule, contour interactif, texte à
 * l'accent (charte règle 12). DEUX LECTEURS depuis #5164 : le fil
 * (`fil-feuille.ts`, qui garde son `.puces` — le `<nav>` qui la centre) et la
 * liste (`liste-feuille.ts`, qui l'aligne à GAUCHE : deux dispositions pour le
 * même atome, jamais deux déclarations de la pilule elle-même). C'ÉTAIT une
 * jumelle en germe : le fil la portait seul, et `/chats` en aurait recopié une
 * SECONDE au premier écran qui la sert à son tour — exactement le motif que
 * `feuilleQuiMonte` et `MENU_DE_LIGNE`, un cran plus haut dans ce fichier,
 * existent pour empêcher.
 *
 * Le balisage vit à côté, dans `app/connecte/prisme-vue.ts` (`puceDuPrisme`) :
 * un seul site pour le MOT et pour la FORME, chacun dans son registre.
 */
export const PUCE_DU_PRISME =
  '.puce{display:inline-flex;align-items:center;gap:var(--space-2);margin:0;min-height:var(--target-min);padding:0 var(--space-3);border:var(--stroke-strong) solid var(--color-border-interactive);border-radius:var(--radius-pill);font-size:var(--text-sm);font-weight:var(--font-weight-semibold);color:var(--color-primary)}' +
  '.puce svg{width:var(--glyph-inline);height:var(--glyph-inline)}';

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
/**
 * `color:var(--color-text)` — l'encre PLEINE, jamais `--color-text-muted`
 * (règle 18, #5164). Un aperçu de conversation n'est pas une précision
 * secondaire comme une heure ou un compte de participants : c'est le CONTENU
 * même que le lecteur vient consulter, sur la carte mise en avant comme sur
 * une ligne plate (`cible/chats.png`).
 */
export const apercuDeLigne = (racine: string): string =>
  `${racine} .apercu{display:flex;align-items:center;gap:var(--space-2);margin-top:var(--space-1);min-width:0;font-size:var(--text-base);color:var(--color-text)}` +
  `${racine} .apercu .langue{flex:none}` +
  `${racine} .apercu .texte{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`;

/**
 * LA GÉOMÉTRIE D'UNE FEUILLE QUI MONTE — un atome PARAMÉTRÉ par sa classe, la
 * même raison qu'`apercuDeLigne` un cran plus haut.
 *
 * TROIS SURIMPRESSIONS LA PARTAGENT et n'en servent qu'UNE chacune : le profil
 * d'un participant (`?profil=`, § 12.10.3), la feuille « nouveau lien »
 * (`/links?nouveau`, #5071) et celle qui viendra. Elles ne sont JAMAIS sur le
 * même document — c'est ce qui permet de paramétrer plutôt que de grouper.
 *
 * ELLE A ÉTÉ EXTRAITE AU MOMENT DE LA TROISIÈME, ET C'EST LE BON MOMENT. Deux
 * copies se surveillent ; trois divergent. Le doc-comment de
 * `profil-feuille.ts` nommait déjà « la géométrie de `dialog.feuille` » comme
 * si elle existait — elle était recopiée. Le jour où le rayon d'une feuille
 * change, il change ici, une fois.
 *
 * CE QUI RESTE CHEZ CHAQUE FEUILLE : son CONTENU. L'atome ne porte que ce qui
 * fait d'un `<dialog>` une feuille qui monte — l'ancrage en bas, la hauteur
 * bornée, le voile, la poignée. Une feuille qui ajouterait ici une règle de son
 * en-tête la ferait payer aux deux autres.
 *
 * `.voile` N'EST PAS PARAMÉTRÉ : c'est le voile, le même partout, et le seul
 * chemin de fermeture qui marche sans JavaScript quand `::backdrop` n'existe
 * pas (un `<dialog open>` non modal n'en pose aucun).
 */
export const feuilleQuiMonte = (classe: string): string =>
  '.voile{position:fixed;inset:0;z-index:4;display:block;background:var(--color-overlay)}' +
  `dialog.${classe}{position:fixed;inset:auto 0 0;z-index:5;box-sizing:border-box;width:100%;max-width:none;max-height:90dvh;overflow:auto;margin:0;padding:0 var(--space-5) var(--space-5);border:0;border-radius:var(--radius-2xl) var(--radius-2xl) 0 0;background:var(--color-surface-raised);color:var(--color-text)}` +
  `dialog.${classe}::backdrop{background:var(--color-overlay)}` +
  `dialog.${classe} .poignee{display:block;position:relative;width:100%;height:var(--target-min);margin:0 0 var(--space-2)}` +
  `dialog.${classe} .poignee::after{content:"";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:var(--glyph-large);height:var(--space-1);border-radius:var(--radius-pill);background:var(--color-border-strong)}`;

/**
 * L'AVIS D'UN ÉCRAN — la ligne discrète qui dit ce qui vient d'avoir lieu
 * (« Tout lu », « Publié. », « Demande acceptée »), sous l'en-tête et au-dessus
 * du contenu.
 *
 * ATOME PARAMÉTRÉ, la même raison qu'`apercuDeLigne` : trois écrans le rendent
 * sous trois racines — `.contacts-ecran`, `.notifs-ecran`, `.composer` — et un
 * sélecteur GROUPÉ le ferait voyager sur les documents qui ne l'affichent pas
 * (charte règle 7). Il était RECOPIÉ à l'identique dans deux feuilles quand le
 * troisième écran est arrivé : deux copies se surveillent, trois divergent.
 *
 * LE `>` EST PORTÉ PAR L'ATOME, pas laissé à l'appelant : l'avis est un enfant
 * DIRECT de l'écran. Sans lui, la règle attraperait le `.avis` d'une
 * surimpression servie dans le même document, qui a sa propre géométrie.
 */
export const avisDEcran = (racine: string): string =>
  `${racine}>.avis{display:flex;align-items:center;gap:var(--space-2);margin:0;padding:var(--space-3) var(--space-4);font-size:var(--text-sm);color:var(--color-text-muted)}` +
  `${racine}>.avis svg{flex:none;width:var(--glyph-inline);height:var(--glyph-inline)}`;

/**
 * LE CHAMP D'APPEL — la barre tapable qui, en tête d'écran, MÈNE à l'écran qui
 * sait faire la chose : « Rechercher partout » sur le tableau de bord (#5093),
 * « Quoi de neuf ? » sur le fil (#4966).
 *
 * ATOME NON PARAMÉTRÉ : les deux écrans le rendent sous le MÊME sélecteur, à la
 * racine de leur document, et il dit la même chose aux deux — « ceci se
 * touche, et vous partez ailleurs ». Le paramétrer par une racine n'ajouterait
 * qu'une indirection.
 *
 * C'EST UN `<a>`, JAMAIS UN `<input>`, sur les deux écrans, et la feuille le
 * SUPPOSE (aucune règle de saisie, de focus de champ, de placeholder) : ce
 * qu'on taperait dans un faux champ serait perdu au moment d'arriver sur
 * l'écran qui sait le traiter. La forme le dit ; le HTML le tient.
 */
export const CHAMP_D_APPEL =
  '.chercher{display:flex;align-items:center;gap:var(--space-3);min-height:var(--action-height-secondary);margin-top:var(--space-6);padding:0 var(--space-4);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-lg);background:var(--color-surface);color:var(--color-text-muted);text-decoration:none}' +
  '.chercher:hover{background:var(--color-tint-primary)}' +
  '.chercher svg{flex:none;width:var(--glyph);height:var(--glyph);color:var(--color-primary)}';

/**
 * LE MENU D'UNE LIGNE — un `<details class="actions">` natif : le `<summary>`
 * (un rond de `--target-min`) et le `<form>` qu'il révèle, chacun de ses
 * `<button>` une cible de `--target-min`.
 *
 * DEUX LECTEURS DEPUIS #4933 : la ligne de `/chats` (trois gestes,
 * `liste-vue.ts`) et la ligne de `/links` (un seul, « Fermer ce lien »,
 * `liens-vue.ts`). C'ÉTAIT UNE JUMELLE avant l'extraction — recopiée à
 * l'identique dans `FEUILLE_DE_LA_LISTE`, et `/links` en aurait porté une
 * SECONDE copie divergente au premier rayon changé. Même raison que
 * `feuilleQuiMonte` : deux copies se surveillent, la troisième aurait divergé.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (charte règle 1).
 */
export const MENU_DE_LIGNE =
  '.actions{flex:none;position:relative}' +
  '.actions>summary{display:flex;align-items:center;justify-content:center;width:var(--target-min);height:var(--target-min);border-radius:var(--radius-pill);color:var(--color-text-muted);list-style:none;cursor:pointer;transition:background-color 120ms,color 120ms}' +
  '.actions>summary::-webkit-details-marker{display:none}' +
  '.actions>summary:hover{background:var(--color-tint-primary);color:var(--color-primary)}' +
  '.actions>summary svg{width:var(--glyph);height:var(--glyph)}' +
  '.actions form{display:grid;margin:var(--space-2) 0;padding:var(--space-2);border:var(--stroke-hair) solid var(--color-border-strong);border-radius:var(--radius-lg);background:var(--color-surface)}' +
  '.actions button{display:flex;align-items:center;gap:var(--space-3);min-height:var(--target-min);padding:0 var(--space-3);border:0;border-radius:var(--radius-lg);background:var(--color-surface);font:inherit;font-size:var(--text-base);color:var(--color-text);text-align:left;cursor:pointer;transition:background-color 120ms}' +
  '.actions button:hover{background:var(--color-bg-sunken)}' +
  '.actions button svg{flex:none;width:var(--glyph-inline);height:var(--glyph-inline)}' +
  '.actions button.grave{color:var(--color-danger)}';
