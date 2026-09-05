import { compacte } from '@/app/enveloppe/feuille';

import { avisDEcran, MENU_DE_LIGNE, PASTILLE_DE_LANGUE, PUCE_DU_PRISME, rondDEnTete, TRACE_DE_FRAPPE } from './atomes-feuille';

/**
 * LA FEUILLE DU FIL — le même module pour les deux portes (`/chats/:cle`,
 * `/chat/:lien`), et la charte du § 12.5 appliquée règle par règle :
 *
 *   • le fil est PLAT (règle 26) : une ligne = avatar + nom + texte + méta,
 *     jamais une bulle ; mes messages sont la même ligne, sous le nom « Vous » ;
 *     Ce nom-là est LE plus court du fil, et il est devenu un LIEN vers son
 *     propre compte (#5030) : à 40 × 44 px il tombait sous la règle 4, mesuré
 *     au navigateur (`v3-fil-riche.spec.ts` § « aucune cible sous 44 px »),
 *     d'où le `min-width` sur `.nom-lien` — un idiome de CIBLE, pas de texte ;
 *   • un lien SANS destination n'est pas une cible : le gabarit que le module
 *     clone porte les deux « a » du profil en permanence (une bulle peinte doit
 *     mener où mène une bulle servie), et le module RETIRE leur `href` quand
 *     l'auteur n'a pas de compte. `display:contents` leur retire alors leur
 *     BOÎTE, exactement comme la ligne servie qui n'écrit aucune balise — sans
 *     quoi la mesure des cibles compterait un `<a>` que personne ne peut viser.
 *     La raison vit ICI plutôt qu'en commentaire CSS : la feuille est INLINE
 *     dans chaque document, et `compacte()` ne retire pas les commentaires —
 *     sept lignes de prose y coûtaient 303 o gzip par document, mesuré ;
 *   • en-tête et composeur OPAQUES (règle 11) — `--color-bg`, aucun flou de
 *     fond ; ils ne sont plus « collants » : l'écran est une COLONNE de la
 *     hauteur de la fenêtre, et seule la zone des messages défile ;
 *   • quatre rayons (règle 5) : pilule pour le champ, l'envoi, les puces et les
 *     réactions ; `--radius-lg` pour les bandeaux, les pièces, la palette et le
 *     trou ; `--radius-xs` pour `.langue` ;
 *   • un accent, cinq emplois (règle 13) : le cliquable, la pastille de langue,
 *     l'envoi ; JAMAIS un titre ni un filet ;
 *   • le MENU d'une ligne (répondre / modifier / retirer, #5163) et celui de
 *     `/chats` et `/links` sont le MÊME atome (`MENU_DE_LIGNE`) — même rond de
 *     44 px, mêmes boutons de 44 px, même `.grave`. Il part dans
 *     `FEUILLE_DU_MENU`, à côté, et NON dans cette feuille : trois écrans la
 *     partagent sans rendre une seule ligne de fil (`/notifications`,
 *     `/post/:id`, la galerie), et l'y inliner poussait le document de la
 *     galerie au-dessus du plafond dur `documents.document_o` — la raison même
 *     qui tient `FEUILLE_DU_PLEIN` et `FEUILLE_DU_PROFIL` dehors ;
 *   • le mouvement ne déplace rien (règle 24) : une bulle qui ARRIVE ou qui se
 *     CONFIRME change de couleur en 150 ms, elle ne glisse pas ; aucune
 *     `@keyframes` ;
 *   • les états sont DESSINÉS (règles 17 et 21) : envoi en attente (horloge,
 *     encre atténuée — jamais `opacity`), hors ligne, non envoyé avec son
 *     bouton, composeur fermé avec sa raison, trou de messages avec son lien.
 *
 * L'ANCRAGE EN BAS EST UNE MISE EN PAGE. `.messages` est un conteneur à
 * défilement propre en `column-reverse` : son origine de défilement est le
 * BAS, donc le dernier message est à l'écran dès le premier rendu, sans script.
 * Sa liste est servie du plus RÉCENT au plus ancien (`fil-lignes.ts`) : ce qui
 * arrive en cours de chargement se pose AU-DESSUS de ce qui est déjà peint.
 * LE COMPOSEUR RESTE DANS LE CADRE, QUEL QUE SOIT LE CADRE. La colonne fait
 * `100dvh` et ses enfants ne rétrécissent pas (`flex:none`) — sauf DEUX : la
 * zone des messages, qui prend ce qui reste (`flex:1 1 0`) mais jamais moins
 * de deux lignes (`min-height`, `--row-height` × 2), et LES BANDEAUX — celui
 * des droits ouvert (`.bandeau.bien`, la vue `rights`) ET celui d'ÉTAT
 * (`.bandeau.attention` : hors ligne, session expirée) —, qui cèdent
 * l'excédent et DÉFILENT en eux-mêmes, leur résumé toujours atteignable
 * (`min-height` = UNE CIBLE, et rien de plus : le pas de confort qu'il portait en plus était un PLANCHER, donc il
 * refusait de céder les 14 derniers pixels le jour où un bandeau d'ÉTAT s'ajoute
 * — mesuré à 360 × 640, hors ligne : en-tête 66, droits 76, puces 56, bandeau
 * hors ligne 155, frappe 32, composeur 85, messages 160, marges 24 ⇒ 654 pour
 * un cadre de 640. Un plancher de confort n'en est pas un ; le seul plancher
 * d'un bandeau qui défile est ce qu'il faut au doigt pour le rouvrir).
 * LE BANDEAU D'ÉTAT A REJOINT LA MÊME LOI à la revue de #5061 : le composeur
 * porte désormais QUATRE ronds (trombone, micro, position, envoi) et, sous
 * 14 rem de champ disponible, il passe à DEUX rangées — mesuré à 360 × 640,
 * hors ligne : 66 + 44 + 56 + 155 + 32 + 145 + 160 = 658 pour un cadre de 640.
 * Seul le bandeau d'ÉTAT ne cédait pas ; il tenait 155 px pour un titre et une
 * phrase pendant que le composeur passait SOUS le pli. Le faire céder est la
 * loi qui existait déjà à côté, appliquée au voisin qui y avait échappé —
 * jamais un plancher abaissé.
 * Mesuré à 360 × 640 avant cette règle : bandeau 479 px, messages 28 px,
 * composeur de 673 à 758 — SOUS le pli d'un cadre de 640, le corps devenu
 * défilable. L'invité qui venait d'entrer ne voyait ni la conversation ni où
 * écrire. Un cadre qui ne peut pas même tenir ces planchers (un téléphone en
 * paysage, clavier ouvert) laisse le corps défiler plutôt que de rogner le
 * composeur : c'est la seule dégradation que la colonne s'autorise.
 *
 * `.pile`, unique enfant, garde un flux normal et REMPLIT le conteneur dès le
 * premier morceau (`min-height:100%`, la liste étirée dedans) : sondé en Fast
 * 3G, une pile ancrée en bas mais courte GRANDISSAIT vers le haut à chaque ligne
 * reçue (639 → 501 → 208 → 144 px), et Chrome compte comme décalage toute boîte
 * dont le coin haut bouge, même si les lignes déjà peintes restent à leur place
 * — CLS 0,383 contre le gate 0,05 du § 12.6. Une boîte pleine dès l'origine ne
 * bouge plus ; au-delà de la hauteur du conteneur, la croissance passe dans le
 * défilement, que le calcul du décalage compense. Le composeur et la ligne « X
 * écrit… » précèdent la liste dans le DOM (leur hauteur est connue avant que le
 * premier message n'arrive) et sont placés en bas par `order` ; la zone de frappe
 * RÉSERVE sa hauteur pour que « X écrit… » n'emporte rien en apparaissant, et
 * elle prend l'espace libre (`margin-top:auto`) pour que le composeur soit en
 * bas AVANT même que la zone des messages ne soit analysée.
 *
 * LA DERNIÈRE LIGNE DU DOM EST INVISIBLE TANT QU'ELLE PEUT ENCORE ARRIVER. Un
 * document qui arrive par morceaux fait PEINDRE une ligne coupée à la frontière
 * d'un paquet, puis la complète — sa boîte, ancrée en bas, grandit vers le haut
 * et compte comme décalage (sondé : 0,076 après l'ancrage de la pile, pour deux
 * lignes achevées après leur premier rendu). Seule la ligne en cours d'analyse
 * n'a pas encore de suivante : `li:not(:has(~li))` la garde `visibility:hidden`
 * jusqu'à ce que la suivante s'ouvre — donc complète —, et la toute dernière
 * est révélée par `REVELE_LA_DERNIERE_LIGNE`, une règle que le document émet
 * juste après `</ol>` (`fil-vue.ts`). Une ligne qui APPARAÎT n'est pas un
 * décalage. Pas `:last-child` : Blink ne le fait correspondre qu'une fois le
 * parent ENTIÈREMENT analysé (sondé image par image : la dernière ligne restait
 * visible en cours d'analyse), alors que `:has()` s'invalide à chaque frère
 * inséré. Un navigateur sans `:has()` ignore les deux règles et garde le petit
 * décalage — jamais une ligne cachée.
 *
 * Le CADRE INERTE de `/chat/:lien` (état CHOIX, règle 25) est le seul site du
 * dépôt à porter `filter:blur` — sur `.fil-ecran[inert]`, jamais sur un fond.
 *
 * LE CORPS A DEUX COLONNES (#5136, jumelle iOS #5135) — la bulle, et au bas de
 * sa droite la datation (heure + accusé). Elles vivaient dans `.meta`, la ligne
 * posée SOUS le texte, dont `<time>` était le seul contributeur de hauteur :
 * `.reagir-slot` est en `height:0`, `.langue` et `.modifie` sont conditionnels.
 * Cette ligne réservait donc, sous chaque message, la hauteur d'un texte pour
 * deux informations qui se lisent aussi bien à côté.
 *
 * `colonnes` est une classe EXPLICITE, pas un `:has(> .bulle)` : le message
 * système garde son corps d'une seule colonne, et le serveur connaît déjà la
 * distinction — la faire dépendre d'une capacité du navigateur serait payer une
 * incertitude pour rien. `min-width` et non `width` sur `.datation` : la
 * largeur est RÉSERVÉE (les dates s'alignent d'une ligne à l'autre, arbitrage
 * porteur du 2026-09-04) sans jamais tronquer l'heure aux grandes tailles.
 *
 * `5rem`, PAS `3.75rem` (correctif CLS, mesuré) : le SERVEUR rend un relatif
 * (`quand`, `lib/temps.ts` — « il y a 27 min », jusqu'à 74 px mesurés) que le
 * module remonte en heure locale ABSOLUE (`heureLocale` — « 13:10 », ~40 px) —
 * deux formats, DÉLIBÉRÉMENT différents (doc-tête de `lib/temps.ts`). Une
 * réserve dimensionnée sur le SEUL format absolu laissait `.datation`
 * RÉTRÉCIR à l'arrivée du module — un défaut de CLS, jamais un choix.
 *
 * La MÉTA VIDÉE ne réserve plus sa marge. Le sélecteur énumère ce qui ne compte
 * pas — `.reagir-slot` (réservé, `height:0`), `.attente` et `.echec` (masqués
 * par `display:none`, donc invisibles à `:not([hidden])`) — et les états
 * d'envoi la reprennent par la règle suivante, puisqu'ils s'affichent là. Un
 * navigateur sans `:has()` ignore la règle et garde `var(--space-1)` : la
 * dégradation coûte quatre pixels, jamais une ligne.
 *
 * REVUE DE #5061 — le slot VIDE reste à `height:0` (aucune ligne blanche
 * avant que `poseLeBoutonReagir`, `fil-peinture.ts`, n'y insère le bouton),
 * mais un slot qui PORTE le bouton doit réserver sa hauteur : sans ça,
 * `overflow:visible` centre le `button.reagir` (44 px) SUR la ligne nulle de
 * `.meta`, pour moitié au-dessus d'elle — recouvrant le dernier mot du
 * `.texte` qui précède (mesuré sur `rich-capture-{light,dark}.png`).
 * `.reagir-slot:has(>.reagir)` réserve alors `var(--target-min)`, seulement
 * quand le bouton y est déjà, jamais avant : la marge de la ligne ci-dessus
 * n'en dépend pas, seule sa hauteur change. Un navigateur sans `:has()`
 * ignore cette seconde règle et garde `height:0` : la dégradation retrouve
 * l'ancien recouvrement, jamais une exception nouvelle.
 *
 * Aucune COULEUR et aucun PIXEL ne sont écrits (règle 1). Témoin :
 * `__tests__/charte.test.ts`, où cette feuille entre dans `FEUILLES`.
 */
export const FEUILLE_DU_FIL = compacte(`
.fil-ecran{display:flex;flex-direction:column;height:100dvh;max-width:var(--shell-width);margin:0 auto}
.fil-ecran>*{flex:none}
.fil-ecran[inert]{filter:blur(var(--frame-blur))}

.fil-tete{display:flex;align-items:center;gap:var(--space-2);padding:var(--space-2) var(--space-3);background:var(--color-bg);border-bottom:var(--stroke-hair) solid var(--color-border-strong)}
${rondDEnTete('retour')}${rondDEnTete('medias')}
.fil-tete .titre{flex:1;min-width:0}
.fil-tete h1{margin:0;font-size:var(--text-xl);font-weight:var(--font-weight-semibold);line-height:var(--leading-tight);letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fil-tete .sous{margin:0;min-height:calc(var(--text-sm) * var(--leading-normal));font-size:var(--text-sm);color:var(--color-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.etat{flex:none;display:inline-flex;align-items:center;justify-content:center;width:var(--target-min);height:var(--target-min)}
.etat .point{display:block;width:var(--presence-dot);height:var(--presence-dot);border-radius:var(--radius-pill);border:var(--stroke-strong) solid var(--color-text-subtle);transition:background-color 150ms,border-color 150ms}
.etat[data-etat=inconnu] .point{border-style:dashed}
.etat[data-etat=connecte] .point{background:var(--color-success);border-color:var(--color-success)}
.etat[data-etat=hors-ligne] .point{border-color:var(--color-warning)}

.puces{display:flex;flex-wrap:wrap;justify-content:center;gap:var(--space-2);margin:0;padding:var(--space-3) var(--space-4) 0}
${PUCE_DU_PRISME}

.bandeau{margin:var(--space-3) var(--space-4) 0;padding:var(--space-3) var(--space-4);border-radius:var(--radius-lg);border-left:var(--space-1) solid var(--color-success);background:var(--color-tint-success)}
.bandeau.attention{border-left-color:var(--color-warning);background:var(--color-tint-warning)}
.bandeau.refus{border-left-color:var(--color-danger);background:var(--color-tint-danger)}
.bandeau summary,.bandeau .entete{display:flex;align-items:center;gap:var(--space-3);min-height:var(--target-min);list-style:none;cursor:pointer}
.bandeau .entete{cursor:default}
.bandeau summary::-webkit-details-marker{display:none}
.bandeau svg{flex:none;width:var(--glyph);height:var(--glyph)}
.bandeau.bien svg{color:var(--color-success)}
.bandeau.attention svg{color:var(--color-warning)}
.bandeau.refus svg{color:var(--color-danger)}
.bandeau .caret{margin-left:auto;color:var(--color-text-muted)}
.bandeau .caret svg{width:var(--glyph-inline);height:var(--glyph-inline)}
.bandeau b{display:block;font-weight:var(--font-weight-semibold)}
.bandeau p{margin:0;font-size:var(--text-base);color:var(--color-text)}
.bandeau ul{margin:var(--space-2) 0 0;padding:0;list-style:none}
.bandeau li{display:flex;gap:var(--space-3);padding:var(--space-2) 0;border-top:var(--stroke-hair) solid var(--color-border-strong)}
.bandeau li.refuse{color:var(--color-text-muted)}
.bandeau li.refuse svg{color:var(--color-text-subtle)}
.bandeau .verdict{flex:none;display:inline-flex}
.bandeau li.accorde .verdict svg+svg,.bandeau li.refuse .verdict svg:first-child{display:none}
.bandeau .action{margin-top:var(--space-3)}
.fil-ecran .alerte{margin:var(--space-3) var(--space-4) 0}

.fil-ecran>.bandeau.bien,.fil-ecran>.bandeau.attention{flex:0 1 auto;min-height:var(--target-min);overflow:auto}
.messages{order:1;flex:1 1 0;min-height:calc(var(--row-height) * 2);overflow-y:auto;overscroll-behavior:contain;overflow-anchor:none;display:flex;flex-direction:column-reverse;padding:var(--space-4) var(--space-4) var(--space-3)}
.pile{flex:none;display:flex;flex-direction:column;min-height:100%}
.plus-ancien{order:-1;margin:0 auto var(--space-4);display:flex}
.lignes{flex:1 0 auto;margin:0;padding:0;list-style:none;display:flex;flex-direction:column-reverse;gap:var(--space-4)}
.lignes>li:not(:has(~li)){visibility:hidden}
.ligne{display:flex;gap:var(--space-3);align-items:flex-start;border-radius:var(--radius-lg);transition:background-color 150ms}
.ligne.neuve,.ligne:target{background:var(--color-tint-primary)}
.ligne:target{outline:var(--stroke-strong) solid var(--color-border-interactive);outline-offset:var(--space-1)}
.ligne.suite{margin-top:calc(var(--space-3) * -1)}
.ligne.suite .avatar,.ligne.suite .avatar-lien{visibility:hidden}
.ligne .avatar{flex:none}
.ligne .avatar.fantome{background:var(--color-surface);border:var(--stroke-hair) solid var(--color-border-strong);color:var(--color-text-muted)}
.ligne .avatar svg{width:var(--glyph);height:var(--glyph)}
/* L'avatar ouvre le profil d'un auteur (§ 12.10.3) : un cliquable de plus, pas
   une couleur de plus — le nom d'un auteur et son avatar restent sur l'encre. */
.ligne .avatar-lien{flex:none;display:block}
.ligne .corps{flex:1;min-width:0}
.ligne .corps.colonnes{display:flex;align-items:flex-end;gap:var(--space-2)}
.ligne .bulle{flex:1;min-width:0}
.ligne .datation{flex:none;margin:0;display:flex;align-items:center;justify-content:flex-end;gap:var(--space-1);min-width:5rem;font-size:var(--text-xs);color:var(--color-text-subtle);white-space:nowrap}
.ligne .datation svg{width:var(--glyph-inline);height:var(--glyph-inline)}
.ligne .qui{margin:0;display:flex;flex-wrap:wrap;gap:var(--space-2);align-items:baseline;font-weight:var(--font-weight-semibold);line-height:var(--leading-tight)}
/* La cible du NOM atteint 44 px SANS agrandir le TEXTE — le même idiome que
   .original summary (charte règle 4) : min-height centré, jamais un
   padding qui pousserait la ligne suivante. */
.ligne .nom-lien{display:inline-flex;align-items:center;min-height:var(--target-min);min-width:var(--target-min);color:inherit;text-decoration:none}
.ligne .avatar-lien:not([href]),.ligne .nom-lien:not([href]){display:contents}
.ligne.suite .qui{display:none}
.ligne .anonyme{display:inline-flex;align-items:center;gap:var(--space-1);font-size:var(--text-sm);font-weight:var(--font-weight-regular);color:var(--color-text-muted)}
.ligne .anonyme svg{width:var(--glyph-inline);height:var(--glyph-inline)}
.ligne .texte{margin:var(--space-2) 0 0;white-space:pre-wrap;overflow-wrap:anywhere;transition:color 150ms}
.ligne .texte:empty{display:none}
.ligne.envoi-attente .texte,.ligne.envoi-hors-ligne .texte{color:var(--color-text-muted)}
.ligne.supprime .texte,.ligne.protege .texte{color:var(--color-text-muted);font-style:italic}
.ligne .meta{margin:var(--space-1) 0 0;display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-xs);color:var(--color-text-subtle)}
.ligne .meta:not(:has(>:not(.reagir-slot):not(.attente):not(.echec):not([hidden]))){margin-top:0}
.ligne.envoi-attente .meta,.ligne.envoi-hors-ligne .meta,.ligne.envoi-echec .meta{margin-top:var(--space-1)}
.ligne .meta svg{width:var(--glyph-inline);height:var(--glyph-inline)}
.ligne .accuse{display:inline-flex;color:var(--color-primary)}
.accuse .coche,.accuse .coches{display:none;line-height:0}
.accuse[data-accuse=envoye] .coche,.accuse[data-accuse=recu] .coches,.accuse[data-accuse=lu] .coches{display:inline-flex}
.accuse[data-accuse=recu]{color:var(--color-text-subtle)}
.ligne .attente{display:none;align-items:center;gap:var(--space-1)}
.ligne.envoi-attente .attente,.ligne.envoi-hors-ligne .attente{display:inline-flex}
.ligne.envoi-attente .accuse,.ligne.envoi-hors-ligne .accuse,.ligne.envoi-echec .accuse{display:none}
.ligne .echec{display:none;align-items:center;gap:var(--space-2);color:var(--color-danger);font-weight:var(--font-weight-medium)}
.ligne.envoi-echec .echec{display:inline-flex}
.ligne .echec .action{width:auto;min-height:var(--target-min);padding:0 var(--space-3);font-size:var(--text-sm)}
.ligne .reagir-slot{display:inline-flex;align-items:center;justify-content:center;flex:none;width:var(--target-min);height:0;overflow:visible}
.ligne .reagir-slot:has(>.reagir){height:var(--target-min)}
.ligne .reagir{display:inline-flex;align-items:center;justify-content:center;flex:none;width:var(--target-min);height:var(--target-min);margin:0;padding:0;border:0;border-radius:var(--radius-pill);background:transparent;color:var(--color-text-subtle);cursor:pointer;transition:color 150ms,background-color 150ms}
.ligne .reagir:hover{color:var(--color-primary);background:var(--color-tint-primary)}
.ligne .reagir svg{width:var(--glyph);height:var(--glyph)}
.ligne.systeme{justify-content:center}
.ligne.systeme .corps{flex:none;text-align:center;font-size:var(--text-sm);color:var(--color-text-muted)}
${PASTILLE_DE_LANGUE}
.original{margin-top:var(--space-1)}
.original summary{display:inline-flex;align-items:center;gap:var(--space-1);min-height:var(--target-min);font-size:var(--text-sm);color:var(--color-primary);list-style:none;cursor:pointer}
.original summary::-webkit-details-marker{display:none}
.original summary svg{width:var(--glyph-inline);height:var(--glyph-inline)}
.original p{margin:0;color:var(--color-text-muted);white-space:pre-wrap;overflow-wrap:anywhere}
.citations{margin:var(--space-1) 0 0;padding:0;list-style:none;display:grid;gap:var(--space-2)}
.citation{display:block}
.citation .saut{display:flex;align-items:center;gap:var(--space-3);min-height:var(--target-min);padding:var(--space-2) var(--space-3);border-left:var(--space-1) solid var(--color-border-strong);border-radius:var(--radius-lg);background:var(--color-surface);color:inherit;text-decoration:none;transition:background-color 150ms}
.citation a.saut[href]{border-left-color:var(--color-border-interactive)}
.citation a.saut[href]:hover{background:var(--color-tint-primary)}
.citation .vignette{display:flex;align-items:center;justify-content:center;flex:none;width:var(--avatar-small);height:var(--avatar-small);border-radius:var(--radius-xs);background:var(--color-bg-sunken);color:var(--color-text-muted);line-height:0}
.citation[data-genre=story] .vignette{width:var(--avatar);height:var(--avatar)}
.citation .vignette svg{width:var(--glyph-inline);height:var(--glyph-inline)}
.citation .dit{display:grid;min-width:0}
.citation .quoi{font-size:var(--text-sm);font-weight:var(--font-weight-medium);color:var(--color-text-muted)}
.citation .apercu{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--text-base)}
.pieces{margin:var(--space-2) 0 0;padding:0;list-style:none;display:grid;gap:var(--space-2)}
.pieces>li{position:relative;display:grid;gap:var(--space-2);min-width:0}
.pieces .media{position:relative;display:flex;align-items:center;gap:var(--space-3);min-height:var(--target-min);padding:var(--space-2) var(--space-3);border:var(--stroke-strong) solid var(--color-border-interactive);border-radius:var(--radius-lg);background:var(--color-surface);text-decoration:none;color:var(--color-primary);font-size:var(--text-base);font-weight:var(--font-weight-medium)}
.pieces .vignette{display:flex;align-items:center;justify-content:center;flex:none;line-height:0;color:var(--color-text-muted)}
.pieces .vignette svg{width:var(--glyph);height:var(--glyph)}
.pieces .etiquette{display:flex;flex-wrap:wrap;align-items:baseline;gap:var(--space-2);min-width:0}
.pieces .nom-de-piece{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pieces .poids{color:var(--color-text-muted);font-weight:var(--font-weight-regular);font-size:var(--text-sm)}
.pieces>li[data-genre=image] .media,.pieces>li[data-genre=video] .media{flex-direction:column;align-items:stretch;gap:0;padding:0;overflow:hidden}
.pieces>li[data-genre=image] .vignette{aspect-ratio:4/3;background:var(--color-bg-sunken)}
.pieces>li[data-genre=video] .vignette{aspect-ratio:16/9;background:var(--color-bg-sunken)}
.pieces>li[data-genre=image] .vignette svg{width:var(--glyph-large);height:var(--glyph-large)}
.pieces>li[data-genre=image] .nom-de-piece,.pieces>li[data-genre=video] .nom-de-piece{display:none}
.media .lire{display:none}
.pieces>li[data-genre=video] .media .lire{display:flex;align-items:center;justify-content:center;width:var(--action-height);height:var(--action-height);border-radius:var(--radius-pill);background:var(--color-primary);color:var(--color-on-primary);line-height:0}
.pieces>li[data-genre=video] .media .lire svg{width:var(--glyph);height:var(--glyph)}
.lecteur{position:relative;display:block}
.lecteur>summary{display:flex;align-items:center;gap:var(--space-3);min-height:var(--target-min);padding:var(--space-3);border:var(--stroke-strong) solid var(--color-border-interactive);border-radius:var(--radius-lg);background:var(--color-surface);list-style:none;cursor:pointer}
.lecteur>summary::-webkit-details-marker{display:none}
.lecteur[open]>summary{display:none}
.lecteur .lire{display:flex;align-items:center;justify-content:center;flex:none;width:var(--avatar-small);height:var(--avatar-small);border-radius:var(--radius-pill);background:var(--color-primary);color:var(--color-on-primary);line-height:0}
.lecteur .lire svg{width:var(--glyph-inline);height:var(--glyph-inline)}
.lecteur .rail{flex:1;min-width:0;height:var(--space-1);border-radius:var(--radius-pill);background:var(--color-border-interactive)}
.lecteur .etiquette{flex:none}
.lecteur .nom-de-piece{display:none}
.pieces audio{display:block;width:100%;border-radius:var(--radius-lg);background:var(--color-bg-sunken)}
.pieces>li[data-genre=image] .etiquette,.pieces>li[data-genre=video] .etiquette{position:absolute;left:var(--space-3);bottom:var(--space-3);margin:0;padding:0 var(--space-2);border:var(--stroke-hair) solid var(--color-border-interactive);border-radius:var(--radius-pill);background:var(--color-surface)}
.pieces .transcription{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;line-clamp:4;margin:0;padding-left:var(--space-3);border-left:var(--stroke-strong) solid var(--color-border-interactive);font-size:var(--text-base);overflow:hidden}
.fiche{display:inline-flex;align-items:center;gap:var(--space-2);justify-self:start;min-height:var(--target-min);padding:0 var(--space-3);border:var(--stroke-hair) solid var(--color-border-strong);border-radius:var(--radius-pill);font-size:var(--text-sm);font-weight:var(--font-weight-medium);color:var(--color-primary);text-decoration:none}
.fiche svg{width:var(--glyph-inline);height:var(--glyph-inline)}
.pieces .transcrit{display:flex;align-items:center;gap:var(--space-1);margin:0;font-size:var(--text-sm);color:var(--color-text-muted)}
.pieces .transcrit-original{margin:0}
.pieces .transcrit-original summary{display:inline-flex;align-items:center;gap:var(--space-1);min-height:var(--target-min);font-size:var(--text-sm);color:var(--color-primary);list-style:none;cursor:pointer}
.pieces .transcrit-original summary::-webkit-details-marker{display:none}
.pieces .transcrit-original summary svg{width:var(--glyph-inline);height:var(--glyph-inline)}
.pieces .transcrit-original p{margin:0;color:var(--color-text-muted);white-space:pre-wrap;overflow-wrap:anywhere}
.citation .glyphe,.media .glyphe{display:none;line-height:0}
.citation[data-genre=transfert] .glyphe[data-genre=transfert],.citation[data-genre=reponse] .glyphe[data-genre=reponse],.citation[data-genre=story] .glyphe[data-genre=story],.pieces>li[data-genre=image] .glyphe[data-genre=image],.pieces>li[data-genre=audio] .glyphe[data-genre=audio],.pieces>li[data-genre=fichier] .glyphe[data-genre=fichier]{display:inline-flex}
.reactions{display:flex;flex-wrap:wrap;gap:var(--space-2);margin:var(--space-2) 0 0;padding:0;list-style:none}
.reactions form{margin:0}
.reaction{display:inline-flex;align-items:center;gap:var(--space-1);min-height:var(--target-min);min-width:var(--target-min);padding:0 var(--space-3);border:var(--stroke-hair) solid var(--color-border-strong);border-radius:var(--radius-pill);background:var(--color-surface);font:inherit;font-size:var(--text-sm);color:var(--color-text);cursor:pointer;transition:background-color 150ms,border-color 150ms,color 150ms}
.reaction[aria-pressed=true]{border-color:var(--color-border-interactive);background:var(--color-tint-primary);color:var(--color-primary)}
.jour{list-style:none;text-align:center;font-size:var(--text-xs);font-weight:var(--font-weight-semibold);letter-spacing:.08em;text-transform:uppercase;color:var(--color-text-subtle)}
.trou{margin:var(--space-2) 0;padding:var(--space-3);border:var(--stroke-strong) dashed var(--color-border-strong);border-radius:var(--radius-lg);text-align:center;font-size:var(--text-sm);color:var(--color-text-muted)}
.trou a{display:inline-flex;align-items:center;min-height:var(--target-min);font-weight:var(--font-weight-medium)}
.frappe-zone{order:2;margin-top:auto;min-height:var(--space-6);padding:0 var(--space-4)}
${TRACE_DE_FRAPPE}
.nouveaux{position:fixed;left:50%;bottom:calc(var(--action-height) + var(--space-8));transform:translateX(-50%);width:auto;z-index:3;background:var(--color-bg)}

.composeur{order:3;display:flex;flex-wrap:wrap;align-items:flex-end;gap:var(--space-2);margin:0;padding:var(--space-3) var(--space-4) var(--space-4);background:var(--color-bg);border-top:var(--stroke-hair) solid var(--color-border-strong)}
.composeur textarea{flex:1;min-width:0;min-height:var(--action-height-secondary);max-height:calc(var(--action-height-secondary) * 3);padding:var(--space-3) var(--space-4);font:inherit;line-height:var(--leading-normal);color:var(--color-text);background:var(--color-surface);border:var(--stroke-strong) solid var(--color-border-interactive);border-radius:var(--radius-pill);resize:none}
.composeur .joindre{flex:none;display:inline-flex;align-items:center;justify-content:center;width:var(--target-min);height:var(--target-min);margin-bottom:calc((var(--action-height-secondary) - var(--target-min)) / 2);border-radius:var(--radius-pill);color:var(--color-primary);cursor:pointer}
.composeur .joindre svg{width:var(--glyph);height:var(--glyph)}
.composeur .piece-choisie{order:-1;flex-basis:100%;display:flex;align-items:center;gap:var(--space-2);min-height:var(--target-min);font-size:var(--text-sm);color:var(--color-text-muted)}
.composeur .compteur{flex-basis:100%;text-align:right;font-size:var(--text-xs);color:var(--color-text-muted)}
.composeur .compteur.limite,.composeur .refus{color:var(--color-danger)}
.composeur .refus{flex-basis:100%;font-size:var(--text-sm);font-weight:var(--font-weight-medium)}
.composeur .envoyer{flex:none;display:inline-flex;align-items:center;justify-content:center;width:var(--action-height);height:var(--action-height);padding:0;border:0;border-radius:var(--radius-pill);background:var(--color-primary);color:var(--color-on-primary);cursor:pointer;transition:background-color 150ms}
.composeur .envoyer:hover{background:var(--color-primary-strong)}
.composeur .envoyer svg{width:var(--glyph);height:var(--glyph)}
.composeur.ferme{order:3;align-items:center;gap:var(--space-3);min-height:var(--action-height);color:var(--color-text-muted)}
.composeur.ferme svg{flex:none;width:var(--glyph);height:var(--glyph)}
.composeur.ferme p{margin:0;font-size:var(--text-base)}

dialog.palette{padding:var(--space-4);border:var(--stroke-hair) solid var(--color-border-strong);border-radius:var(--radius-lg);background:var(--color-surface);color:var(--color-text)}
dialog.palette::backdrop{background:var(--color-overlay)}
dialog.palette ul{display:flex;flex-wrap:wrap;justify-content:center;gap:var(--space-2);margin:0;padding:0;list-style:none}
dialog.palette .emoji{display:inline-flex;align-items:center;justify-content:center;width:var(--action-height);height:var(--action-height);padding:0;border:var(--stroke-strong) solid var(--color-border-interactive);border-radius:var(--radius-pill);background:var(--color-surface);font:inherit;font-size:var(--text-2xl);cursor:pointer;transition:background-color 150ms}
dialog.palette .emoji:hover{background:var(--color-tint-primary)}
dialog.palette .fermer{margin-top:var(--space-3);width:100%}

@media (min-width:600px){
.nouveaux{width:auto;min-width:0}
}
`);

/**
 * LES TROIS GESTES DU FIL (#5163) — le MENU d'une ligne et le BANDEAU du
 * contexte du composeur —, servis par le SEUL document qui les rend
 * (`documentDuFil`), comme `FEUILLE_DU_PLEIN` et `FEUILLE_DU_PROFIL` : ce
 * qu'un écran n'affiche pas, il ne le paie pas (charte règle 7). TROIS écrans
 * partagent `FEUILLE_DU_FIL` sans rendre une ligne ni un composeur
 * (`/notifications`, `/post/:id`, la galerie) — l'y inliner poussait le
 * document de la galerie AU-DESSUS du plafond dur `documents.document_o`.
 * L'atome du menu vient de `atomes-feuille.ts` — le MÊME que `/chats` et
 * `/links` — et n'est pas réécrit ici.
 */
export const FEUILLE_DES_GESTES = compacte(
  MENU_DE_LIGNE +
    // LE MENU OUVERT NE POUSSE PAS LA BULLE. Sur `/chats` et `/links` la carte
    // du menu s'ouvre DANS le flux — la ligne y est pleine largeur, rien ne la
    // gêne. Ici elle est la TROISIÈME colonne d'une ligne de message : ouverte
    // dans le flux, elle rétrécissait le texte à quatre mots par ligne le temps
    // du geste (mesuré à 390 px, capture `thread-gestes-light.png`). Elle se
    // pose donc AU-DESSUS, ancrée à `.ligne` — PAS à son `<details>`
    // (l'atome le met en `position:relative`, ANNULÉ ici) : les deux
    // s'alignaient au bas de `.corps.colonnes`, la MÊME hauteur que la bulle
    // elle-même, donc le panneau, en s'ouvrant vers le haut, recouvrait le
    // texte de SA PROPRE ligne dès qu'elle était plus courte que le panneau —
    // mesuré (défaut #5163 §4, `menu-m1.png`). Ancré au `.ligne` ENTIER, le
    // panneau s'ouvre au-dessus de la ligne QUI L'A OUVERT, jamais dessus.
    // `.ouvre-bas` (posé par `fil-gestes.ts` quand la ligne est trop proche du
    // haut de la liste pour ouvrir vers le haut) bascule le sens.
    '.ligne{position:relative}' +
    '.ligne .actions{position:static}' +
    '.ligne .actions form{position:absolute;right:0;bottom:100%;margin-bottom:var(--space-2);z-index:2;min-width:12rem;max-width:calc(100vw - 2 * var(--space-4));box-shadow:var(--shadow-sm)}' +
    '.ligne .actions.ouvre-bas form{bottom:auto;top:100%;margin-bottom:0;margin-top:var(--space-2)}' +
    // LE BANDEAU DU CONTEXTE — une ligne À ELLE SEULE au-dessus du champ
    // (`order:-2`, avant l'annonce de pièce) : posé dans le flux du composeur,
    // il se serait glissé À CÔTÉ du `<textarea>` et l'aurait écrasé.
    '.composeur .contexte{order:-2;flex-basis:100%;display:flex;align-items:center;gap:var(--space-2);min-width:0}' +
    '.composeur .contexte .citations{flex:1;min-width:0;margin:0}' +
    '.composeur .contexte .quoi-modif{flex:1;min-width:0;margin:0;font-size:var(--text-sm);font-weight:var(--font-weight-medium);color:var(--color-text-muted)}' +
    '.composeur .contexte .annuler{flex:none}',
);

/**
 * LE MICRO, LA POSITION, ET LE LIEU QU'ELLE PARTAGE (#5061) — servis par
 * `documentDuFil` SEUL, comme `FEUILLE_DES_GESTES` juste au-dessus : ni le
 * composeur ni un message `.lieu` n'existent sur la GALERIE
 * (`app/connecte/medias-vue.ts`, qui inline `FEUILLE_DU_FIL` pour son
 * en-tête et ses pièces, jamais une ligne complète ni un composeur) — les y
 * inliner poussait `documents_de_la_galerie.galerie_o` de 9187 à 9615 o
 * gzip, AU-DESSUS du plafond dur `documents.document_o` (9 216), pour des
 * classes que cet écran ne rend jamais (charte règle 7 : ce qu'un écran
 * n'affiche pas, il ne le paie pas).
 *
 * LE CHAMP GARDE SA LARGEUR (revue de #5061). Deux ronds de 44 px de plus
 * dans une rangée qui en portait déjà deux ramenaient le `<textarea>` à
 * 134 px à 390 px de large — MESURÉ, `clientHeight` 48 pour un `scrollHeight`
 * de 73 : le libellé « Écrire en français… » passait à la ligne et se
 * COUPAIT, sur le seul champ de saisie de l'écran. `min-width` (jamais une
 * largeur fixe) rend la décision à `flex-wrap`, déjà posé sur `.composeur` :
 * sous 14 rem disponibles, le champ et son bouton d'envoi descendent d'une
 * ligne — les trois ronds au-dessus, le champ PLEINE LARGEUR en dessous
 * (charte : gros boutons, page aérée) ; au-dessus, la rangée unique de la
 * cible tient telle quelle. Témoin : `e2e/visual/v3-fil-capture.spec.ts`
 * § « le champ ne coupe jamais son libellé ».
 *
 * `.en-attente` (correctif CLS, revue de #5061/#5034) — le SEUL état que
 * `capture.ts` bascule pour un lecteur dont `ecrire` est déjà VRAI au SSR
 * (`fil-vue.ts` › `micro`/`position`) : `visibility:hidden` retire le bouton
 * du rendu ET de l'arbre d'accessibilité SANS retirer sa BOÎTE — la décision
 * `flex-wrap` ci-dessus (champ qui descend d'une ligne dès que les quatre
 * ronds sont comptés) est donc déjà PRISE au premier pixel, identique avant
 * et après que `capture.ts` confirme la capacité du navigateur. Le contraire
 * — `hidden` natif retiré par le module — faisait la même bascule PENDANT la
 * fenêtre de mesure du CLS (`scripts/mesure-reseau.mjs`, 600 ms après
 * `load`) : `0.116 > 0.05`, gate rouge. `pointer-events:none` l'assortit
 * (un rond invisible ne s'actionne pas), sans conséquence sur les gestes
 * `capture.ts` qui gardent leur propre garde de capacité.
 */
export const FEUILLE_DE_LA_CAPTURE = compacte(`
.composeur textarea{min-width:min(100%,14rem)}
.composeur .micro,.composeur .position{flex:none;display:inline-flex;align-items:center;justify-content:center;width:var(--target-min);height:var(--target-min);margin-bottom:calc((var(--action-height-secondary) - var(--target-min)) / 2);border:0;border-radius:var(--radius-pill);background:transparent;cursor:pointer}
.composeur .micro{color:var(--color-primary)}
.composeur .position{color:var(--color-primary)}
.composeur .micro svg,.composeur .position svg{width:var(--glyph);height:var(--glyph)}
.composeur .micro.actif{color:var(--color-danger)}
.composeur .micro.en-attente,.composeur .position.en-attente{visibility:hidden;pointer-events:none}
.composeur.enregistre textarea,.composeur.enregistre .joindre,.composeur.enregistre .micro,.composeur.enregistre .position,.composeur.enregistre .envoyer{display:none}
.composeur .enregistrement{display:none}
.composeur.enregistre .enregistrement{order:0;flex:1;display:flex;align-items:center;gap:var(--space-3)}
.composeur .annuler-vocal,.composeur .envoyer-vocal{flex:none;display:inline-flex;align-items:center;justify-content:center;width:var(--target-min);height:var(--target-min);border:0;border-radius:var(--radius-pill);cursor:pointer}
.composeur .annuler-vocal{background:var(--color-tint-danger);color:var(--color-danger)}
.composeur .envoyer-vocal{background:var(--color-primary);color:var(--color-on-primary)}
.composeur .annuler-vocal svg,.composeur .envoyer-vocal svg{width:var(--glyph);height:var(--glyph)}
.composeur .duree-vocale{flex:1;text-align:center;font-variant-numeric:tabular-nums;color:var(--color-text-muted)}
.lieu{margin:var(--space-2) 0 0;display:flex;flex-direction:column;gap:var(--space-2);align-items:flex-start;width:100%}
.lieu-lien{display:flex;align-items:center;gap:var(--space-3);min-height:var(--target-min);padding:var(--space-2) var(--space-3);border:var(--stroke-strong) solid var(--color-border-interactive);border-radius:var(--radius-lg);background:var(--color-surface);text-decoration:none;color:var(--color-primary);font-weight:var(--font-weight-medium);width:100%}
.glyphe-lieu{flex:none;display:inline-flex}
.glyphe-lieu svg{width:var(--glyph);height:var(--glyph)}
.texte-du-lieu{display:grid;min-width:0}
.nom-du-lieu{overflow-wrap:anywhere}
.adresse-du-lieu{font-size:var(--text-sm);font-weight:var(--font-weight-regular);color:var(--color-text-muted);overflow-wrap:anywhere}
`);

/**
 * CRÉER UN LIEN DE PARTAGE DEPUIS CE FIL (#5034, § 12.10.5) — servie par
 * `documentDuFil` SEUL, comme `FEUILLE_DE_LA_CAPTURE` juste au-dessus et pour
 * la MÊME raison : l'avis « lien créé » n'a aucun sens sur la GALERIE
 * (`medias-vue.ts`, qui inline `FEUILLE_DU_FIL` pour son en-tête, jamais le
 * corps du fil) — l'y inliner ferait payer à cet écran des classes qu'il ne
 * rend jamais, quand sa marge sous le plafond dur `documents.document_o`
 * (9 216 o) se compte en dizaines d'octets.
 *
 * LE ROND DE LA PUCE « PARTAGER » VIENT DE L'ATOME `rondDEnTete`, celui-là
 * même dont `FEUILLE_DU_FIL` tire « Retour » et « Médias » : le recopier ici
 * en aurait fait la TROISIÈME copie du même corps de règle — celle qui diverge
 * (`atomes-feuille.ts`). Il est APPELÉ ici et non groupé là-bas parce que la
 * galerie inline `FEUILLE_DU_FIL` : un sélecteur groupé lui aurait fait payer
 * 6 o gzip (9 203 vers 9 209, mesuré, plafond dur 9 216) pour une classe
 * qu'elle ne rend jamais.
 *
 * L'avis « lien créé » prend sa géométrie à l'ATOME `avisDEcran`, comme les
 * trois écrans qui le rendaient déjà (`contacts`, `notifs`, `composer`) : une
 * quatrième copie du même corps de règle était le défaut que cet atome existe
 * pour empêcher. Ne reste ICI que ce qui lui est PROPRE — l'adresse du lien,
 * qui se COUPE plutôt qu'elle ne déborde (une adresse longue élargirait sinon
 * la page) et se SÉLECTIONNE D'UN GESTE (`user-select:all`) : sans bouton
 * « Copier » — un contrôle qui n'existerait qu'avec JavaScript, refusé sur les
 * deux hôtes —, c'est le seul moyen d'emporter le lien qu'on vient de créer.
 */
export const FEUILLE_DU_LIEN_DEPUIS_LE_FIL = compacte(
  `${rondDEnTete('partager')}
${avisDEcran('.fil-ecran')}
.fil-ecran>.avis .adresse{user-select:all;overflow-wrap:anywhere;color:var(--color-text)}
`,
);

/** Émise par le document APRÈS `</ol>` : la dernière ligne, désormais complète, se montre. */
export const REVELE_LA_DERNIERE_LIGNE = compacte(`.lignes>li:not(:has(~li)){visibility:visible}`);
