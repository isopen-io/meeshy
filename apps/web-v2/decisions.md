# apps/web-v2 — décisions

Les choix d'architecture et de produit de la v4 web, avec leur raison et leur
date. Convention du dépôt : chaque répertoire actif tient son `decisions.md`.

**Ce fichier ne pilote rien** — l'état d'une tâche vit dans son issue. Il
répond à « pourquoi c'est comme ça », pas à « où on en est ».

---

## D-1 · La v4 suit l'interface iOS — 2026-09-07 (#5491)

`apps/ios` et `packages/MeeshySDK` sont la référence de disposition, de
hiérarchie, d'états et de gestes. **Pas la planche web de la v3.**

Conséquence directe : la palette vient de `MeeshyColors.swift`, pas de
`tokens.css` (voir D-4).

## D-2 · Le runtime est Preact, l'API est React — 2026-09-06

`preact/compat` par alias Vite. Le code applicatif est du React ; seul le
runtime change, et `MEESHY_RUNTIME=react` construit l'autre pour comparer.

**Mesuré, code source identique** : première peinture **24,53 Ko** gzip contre
**74,90 Ko** — soit **1,06 s** contre 3,25 s sur Fast 3G. L'écart est le
double de toute la première peinture : ce n'est pas un réglage, c'est le poste
dominant.

Coût assumé : un shim maison pour `use()`, que `preact/compat` n'expose pas
(`src/lib/react-shim.js`).

## D-3 · Le routeur est écrit sur mesure — 2026-09-07 (#5447)

TanStack Router pesait **25,13 Ko gzip — 49 % de la première peinture**, plus
de trois fois le runtime entier. **Ce poids est incompressible, mesuré** :
retirer toutes ses options rend un chunk au **hash identique**.

`src/lib/router.tsx` rend ~**1,4 Ko** : paramètres de chemin typés depuis le
motif, paramètres de recherche, découpage par route, préchargement à
l'intention, restauration du défilement.

Perdu, et assumé : chargeurs de route, états « pending » de navigation,
validation des paramètres de recherche, routes imbriquées au-delà d'un niveau.
Les trois premiers sont couverts par TanStack Query, qui reste.

## D-4 · La palette est DÉRIVÉE de Swift, jamais recopiée — 2026-09-07 (#5445)

`packages/design-tokens/ios.css` est **généré** depuis `MeeshyColors.swift` et
`DesignTokens.swift`. Le web ne porte aucune valeur iOS écrite à la main.

Deux gates, qui prouvent deux choses différentes : `check:tokens` (le CSS n'a
pas dérivé de Swift) et `check:tokens-resolved` (**le navigateur peint bien ces
valeurs**). Le second n'est pas redondant — un nom mal orthographié rend une
couleur **vide**, pas une erreur.

`tokens.css` (la table de la v3) **mourra avec la v3** : il n'y a pas de rôles
à unifier, il y a une table qui s'éteint.

## D-5 · On garde la nomenclature du legacy, on AJOUTE — 2026-09-07 (#5553)

Aucune redirection. Les quatre adresses de conversation du legacy
(`/conversation/:id`, `/conversations/[[...id]]`, `/chat/:id`,
`/groups/:identifier`) restent servies telles quelles. La v4 ajoute
**`/c/:conversation`** (le membre) et **`/chat/:share_link`** (le lien public).

Coût assumé : un vieux lien continue d'ouvrir l'ancienne application. **Deux
produits vivants sur un domaine** — moins grave qu'un lien perdu, plus
difficile à diagnostiquer. Le point se rouvre au décommissionnement (#5496).

Vérifié depuis : `/chat/:id` du legacy **est déjà** l'adresse d'un lien de
partage (`apps/web/app/chat/[id]/page.tsx:21` lit un `linkId`). Les deux sont
la même route ; `/chat/*` passe en bloc à la v4.

## D-6 · `/c/` ne révèle rien d'une conversation dont on n'est pas membre — 2026-09-07 (#5560)

| visiteur | comportement |
|---|---|
| membre | le fil |
| sans compte | sortie immédiate vers `/` |
| connecté, conversation directe | redirection immédiate vers `/` |
| connecté, groupe | modale pour valider qu'on rejoint |

Garde **fail-closed**, testée sur la **charge servie** et non sur le rendu : un
écran qui redirige après avoir reçu le fil a déjà tout donné.

**Reste ouvert** : la modale de groupe implique-t-elle que tout compte
connaissant un identifiant peut rejoindre ? La lecture sûre — la modale
n'apparaît que pour un groupe qu'on a le DROIT de rejoindre, tout autre cas
retombant sur `/`, **indistinguable d'un groupe inexistant** — attend
confirmation.

## D-7 · Le mode de lecture par défaut est FOCAL — 2026-09-07 (#5566)

La loi de décision ouvre en `focal`, pas en `bulles`. Un utilisateur qui ouvre
une conversation pour la première fois voit donc la **rangée plate**, pas des
bulles.

C'est un écart assumé avec iOS **en pratique** — pas en droit : la loi iOS dit
la même chose, mais son drapeau étant désactivé, ses utilisateurs voient des
bulles. La v4 applique la loi telle qu'elle est écrite.

> **Amendée le 2026-09-08 par D-20.** Ce n'est plus un écart : la cible est
> l'app iOS drapeaux activés, où le fil s'ouvre en Focal. Le seul réglage est
> le paramètre de construction `VITE_READING_MODES` (#5674).

## D-8 · `summary` et `river` sont hors périmètre, et la loi retombe sur `focal` — 2026-09-07 (#5566)

La loi élit `summary` au-delà de 25 non-lus, ou après 24 h d'absence avec ≥ 10
non-lus. La v4 ne sait pas le rendre : elle **retombe sur `focal`**.

Règle générale : **ne jamais afficher un mode qu'on ne sait pas rendre.** Le
mode reste listé et désactivé dans le menu, avec sa raison — « un mode
indisponible n'est jamais un écran vide ».

## D-9 · La lentille est la SEULE peau de liste, activée par défaut — 2026-09-07 (#5567)

Pas de drapeau, pas de peau alternative, pas de coexistence. Formulation du
porteur : *« il n'est prévu que d'implémenter la lentille sur la V4,
correctement »* — c'est le PLAN, et il ne comporte qu'une peau.

Le « correctement » n'est pas un adverbe de politesse : il porte une exigence.
Une lentille à moitié faite — la rangée plate sans la perspective, ou la
perspective sans le double `frame(height:)` — rend une liste qui SAUTE au
défilement. Elle serait alors pire que la peau en cartes qu'elle remplace, qui
au moins ne bouge pas. **Cette feature n'a pas de demi-livraison** : soit le
flux ne bouge jamais, soit on garde les cartes.

Conséquence sur le POC : `src/components/ligne-conversation.tsx` rend
aujourd'hui la peau en CARTES (`ThemedConversationRow`) — **elle est à
remplacer**, pas à conserver à côté.

Écart assumé avec iOS, où le drapeau `lentille_list` est désactivé par défaut :
les utilisateurs iOS ne voient pas la lentille, les utilisateurs web la verront.

> **Amendée le 2026-09-08 par D-20.** Ce n'est plus un écart : la cible est
> l'app iOS drapeaux activés, où la Lentille EST la liste — avec tout ce que le
> drapeau monte (sections et stickers, pont ✦, magnification actionnable, scène
> qui s'aplatit au repos, rail de stories). Sans drapeau, la v3.1 n'a aucun
> retour arrière : le « pas de demi-livraison » ci-dessus vaut pour chaque
> écart listé dans `targets/lentille.md`.

## D-10 · La v4 écrit le mode de lecture vers le serveur — 2026-09-07 (#5566)

Sur iOS le canal est **descendant seulement** : `user:preferences-updated`
écrit dans le magasin local, mais aucun site iOS ne POSTe le mode. Le gateway
accepte pourtant l'écriture (`routes/conversation-preferences.ts`, valeurs
`auto|focal|script|resume|riviere`).

**La v4 devient le premier client qui écrit** : un mode choisi sur le web suit
alors sur iOS. La persistance locale reste par `(conversation, lecteur)`.

## D-11 · Jamais deux notifications pour un même événement — 2026-09-07 (#5568)

Application ouverte ⇒ **bannière in-app seulement**, jamais de notification
système en plus.

Sur le web, trois sources peuvent tirer pour un même contenu : le socket, le
service worker (push), et une bannière déjà affichée. La règle :

1. le **service worker** n'émet que des notifications **système**, et seulement
   si aucun client visible n'est ouvert (`clients.matchAll({type:'window'})`) ;
2. le **socket** est la seule source de bannière in-app ;
3. la **conversation ouverte** ne lève aucune bannière — le message est marqué
   lu directement ;
4. une **déduplication par identifiant** couvre la course résiduelle entre push
   et socket. iOS purge après 2 s.

Le point 1 est propre au web : sur iOS, le système sait que l'application est au
premier plan. Dans un navigateur, c'est au service worker de le demander.

## D-12 · Le renommage du 2026-09-07 — `web-v4` devient `web-v3`, l'ancienne v3 devient `web-old-version3`

Directive du porteur : *« Décommissionne web-v3 en web-old-version3 et nomme le web-v4
en web-v3, comme ça tout fonctionne avec ce qui sera développé. Ce sera la v3.1,
car le début de v3 qui était en développement a été juste annulé. »*

| avant | après | ce que c'est |
|---|---|---|
| `apps/web-v3` | **`apps/web-old-version3`** | l'ancienne refonte, **annulée**, jamais servie en production |
| `apps/web-v4` | **`apps/web-v3`** | le chantier, version **3.1.0** |

Raison : tout ce que le dépôt nomme `web-v3` — filtres de CI, images Docker,
cibles du `Makefile`, zone Traefik — désigne alors le chantier vivant, sans
qu'il faille dupliquer chaque réglage. La numérotation reprend à **3.1** parce
que la v3 en développement est annulée, pas livrée.

**Ce que le renommage a demandé, et qui n'était pas gratuit** : la directive de
gel du `CLAUDE.md` racine disait « `apps/web-v3` est GELÉE ». Laissée telle
quelle, elle aurait gelé **la nouvelle application** — l'inverse exact de son
intention. Même piège pour les gardes des deux workflows. Ils ont été réécrits
en premier, avant tout le reste.

**Ce qui NE bouge pas, délibérément** : les noms de service, d'image et de
variables d'environnement du déploiement (`FRONTEND_V3_IMAGE`,
`meeshy-frontend-v3`, la zone `/__v3/`). Seuls les CHEMINS ont été repointés
vers `web-old-version3`, pour que le déploiement en cours ne bouge pas d'un octet. La
nouvelle application recevra sa propre configuration Docker quand elle sera
prête à être servie. **Elle l'a reçue depuis** : `apps/web-v3/Dockerfile`
(nginx statique) et le service `web-v31` de `docker.yml`, sous l'image
`meeshy-web-v31` — un nom provisoire, que le décommissionnement (#5496)
rendra à `meeshy-web-v3`.

> **Piège de lecture, à connaître.** Les journaux — `tasks/lessons.md`,
> `tasks/*.md`, `docs/product/MeeshyWebV3Design/` — contiennent des centaines de
> chemins `apps/web-v3/...` qui désignent l'**ancienne** application. Les
> réécrire falsifierait ce qui était vrai au moment où ils ont été écrits ; ce
> sont des journaux, pas de la documentation. **Avant le 2026-09-07,
> `apps/web-v3` veut dire `apps/web-old-version3`.** Les chemins des documents de
> CONCEPTION, eux, ont été repointés — eux prescrivent, ils ne racontent pas.

**Un trou ouvert par le renommage, déclaré** : l'étape de lint bloquante de la
CI visait l'ancienne application. Le nom `@meeshy/web-v3` désignant maintenant
la nouvelle, qui n'a **pas de configuration ESLint**, l'étape a été retirée
plutôt que laissée à rendre une case verte qui ne linte rien. Le type-check
bloquant et les gates (jetons dérivés, poids) tiennent la place. **L'ESLint de
la v3.1 est un suivi.**


## D-13 · Le code de la v3.1 est nommé en ANGLAIS — 2026-09-07 (directive porteur)

**La règle.** Tout ce qui est un NOM dans le dépôt est en anglais : fichiers,
répertoires, identifiants, types, propriétés, jetons CSS, classes utilitaires,
clés JSON, scripts npm, valeurs d'énumération internes. Ce qui est de la PROSE
reste en français : commentaires, messages de gate, documents de décision,
messages de commit — et les **textes affichés à l'utilisateur**, qui relèvent
de l'internationalisation, pas du nommage.

**Pourquoi la frontière est là.** Un commentaire s'adresse à l'équipe, qui
travaille en français ; un identifiant s'adresse au compilateur, à l'outillage,
et à quiconque relit le dépôt sans le parler. Mélanger les deux dans un même
symbole (`resolutionDuPrisme`, `HAUTEUR_DE_CASE`) coûte à chaque lecture et à
chaque `grep`.

**Ce que la bascule a coûté, mesuré.** 5 634 lignes, cinq couches
(fichiers · identifiants · jetons CSS · classes utilitaires · clés JSON), et
**+1,2 Ko sur la première peinture** — les noms anglais retenus sont plus longs
que les français qu'ils remplacent, et les noms de variables CSS voyagent dans
la feuille. C'est sous le plafond (40 Ko) et c'est le prix admis.

**Trois défauts que le renommage a FABRIQUÉS, et ce qui les a attrapés.** Aucun
n'aurait rougi au type-check :

| défaut | pourquoi invisible | attrapé par |
|---|---|---|
| le service worker plantait à l'installation (`ROUTES_INSTITUTIONNELLES` non renommé dans une interpolation) | un SW qui échoue ne casse que la DEUXIÈME visite | `check-institutional.mjs` |
| la scène de la lentille ne trouvait plus une seule ligne (`[data-ligne]` contre `data-row`) | un sélecteur qui ne matche rien rend une liste inerte, pas une erreur | `check-lens.mjs` |
| le script de thème inline lisait `meeshy.schema` quand le module écrivait `light` sous `meeshy.scheme` | l'éclair blanc ne se voit qu'au démarrage à froid d'un utilisateur ayant déjà choisi | relecture — **aucun témoin ne le couvre**, c'est un suivi |

La cause commune est UNE : **les chaînes de caractères sont la moitié du
programme.** Un renommage qui ne traite que le code renomme la déclaration et
laisse l'usage — sélecteur, clé de stockage, interpolation, nom de classe. Le
premier passage a masqué les littéraux pour protéger la prose française, et
c'est exactement ce masquage qui a laissé passer les trois.

**Le témoin ajouté.** `scripts/check-utilities.mjs` ferme la dernière classe de
défaut, la plus silencieuse : une classe Tailwind qui ne correspond à aucun
jeton n'émet **aucune règle** — pas d'erreur, pas d'avertissement, juste un
élément peint par défaut. Le gate n'oppose pas les classes à une liste de
jetons déclarés (il faudrait alors tenir à la main les utilitaires natifs de
Tailwind, qui dérivent à chaque version) mais **à la feuille produite** :
Tailwind n'émet que ce qu'il a reconnu. Vérifié par mutation (rc=1 sur une
classe falsifiée).

## D-14 · Les types ET trois lois viennent de `@meeshy/shared` — 2026-09-07 (#5493)

**Ce qui disparaît.** `src/lib/api/model.ts` (la projection locale du domaine) et
la copie de `resolvePrismTranslation()` qui vivait dans `prism.ts`. Les deux
étaient documentées comme provisoires ; elles ont vécu le temps du POC.

**Ce qui les remplace.**

| ce que la v3.1 réutilise | d'où | ce qu'elle réécrivait |
|---|---|---|
| `Conversation`, `Message`, `Participant`, `Attachment`, `MessageTranslation` | `@meeshy/shared/types/*` | une projection à d'autres noms (`sentAt`, `author`, `unread`) |
| `resolvePrismTranslation`, `buildTranslationRecord` | `utils/conversation-helpers` | une copie de la descente du Prisme |
| `resolveUserLanguagesOrdered` | idem | `[...new Set(['fr', locale])]` — un prisme sans normalisation |
| `getUserPresenceStatus`, `PRESENCE_HEX` | `utils/user-presence` | une union de présence et trois couleurs recopiées |
| `conversationAccentPalette` | `utils/conversation-colors` | une palette de QUATRE teintes, inventée |
| `messageTypeFromMimeTypes` | `utils/attachment-message-type` | un `kind` porté par la fixture |

**Le coût, mesuré — et il tombe au bon endroit.**

| | avant | après |
|---|---|---|
| première peinture | 26,43 Ko | **26,33 Ko** |
| à la demande | 26,68 Ko | **30,24 Ko** |

Le code partagé atterrit ENTIÈREMENT dans les morceaux de route. C'est
exactement ce que le découpage par route achète, et c'est pourquoi le plafond
de `budgets.json` porte sur la première peinture et non sur le total : payer
3,6 Ko pour ne plus tenir six jumelles est un bon échange ; les payer avant le
premier pixel n'en aurait pas été un.

**Ce que l'accent a changé de visible.** La palette de quatre teintes a disparu
au profit de `primary = blend(langue × 0,30, type × 0,30, thème × 0,40)`. Les
captures changent : deux plateformes affichaient deux accents pour un même fil,
elles n'en affichent plus qu'un.

**Ce qui reste dérivé, et pourquoi ce n'est pas une jumelle.** `isMine`,
`unreadCount`, les initiales, le titre d'une conversation directe et l'état de
coche ne sont pas des champs du domaine : ce sont des LECTURES. `isMine` dépend
de qui regarde — le graver rendrait la charge fausse dès qu'un second lecteur
la lit. La coche n'est pas un état mais une conclusion tirée de
`deliveredCount` / `readCount` / `recipientCount`, en TOUT OU RIEN comme iOS :
annoncer « lu » sur un groupe de dix parce qu'une personne a ouvert le fil
serait un mensonge d'interface. Ces dérivations vivent dans `src/lib/view/`.

**Ce que la chaîne de construction a dû apprendre.** `@meeshy/shared` sert son
`dist/`, donc il se CONSTRUIT avant la v3.1 — dans le `Dockerfile` (qui le
copie désormais) et dans les deux travaux de CI qui bâtissent la v3.1 hors
turbo. Le garde `check-ci-build-order.mjs` du dépôt n'est pas aveugle à ce
lien : retirer l'étape lui fait nommer le job, le scénario et la ligne.

**Ce qui n'a PAS changé.** La seconde moitié de #5493 — le transport réel — n'est
pas faite : les données restent des fixtures. Mais elles sont désormais écrites
dans la FORME que la passerelle rend, donc le jour où le transport arrive,
`fixtures.ts` disparaît sans qu'aucun composant ne bouge.

## D-15 · Le fil est virtualisé, et son ancrage bas est un mécanisme — 2026-09-07 (#5560)

**Pourquoi.** Cinq cents bulles montées, mesurées et repeintes à chaque image
de défilement donnent un fil qui met deux secondes à s'ouvrir puis saccade.
C'est le cas où une WebView Android d'entrée de gamme lâche (#5446), et la
charte du dépôt classe une lenteur comme un **bug**, pas comme une dette.

**Ce qui est réutilisé.** `@tanstack/react-virtual`, la bibliothèque que le
legacy emploie déjà (`apps/web/components/conversations/hooks/useVirtualizedList.ts`).
Ce hook-là n'est PAS repris : c'est un réglage de 37 lignes, pas une loi — le
copier aurait fait une jumelle sans rien partager d'utile.

**Le coût, mesuré.**

| | avant | après |
|---|---|---|
| première peinture | 26,33 Ko | **26,36 Ko** |
| à la demande | 30,24 Ko | **37,50 Ko** |

Le virtualiseur pèse 7,09 Ko gzip — **à la demande**, jamais avant le premier
pixel. Ça n'a pas été gratuit : la règle par défaut du découpage
(`node_modules ⇒ core`) l'aurait mis dans le socle, faisant passer la première
peinture à **31,44 Ko** pour un module que seul le fil monte. Et nommer le seul
paquet React ne suffisait pas : `@tanstack/virtual-core` porte l'essentiel du
calcul et restait dans le socle. Les deux sont nommés ; le gate de poids garde
la porte.

**L'ancrage bas est un mécanisme, pas un appel.** Un seul `scrollToIndex` vise
le bas d'une hauteur ESTIMÉE, puis les cellules montées se mesurent et la
hauteur change sous lui : le fil s'ouvrait « en bas » d'un fil dont le dernier
message n'était pas rendu. On se ré-ancre donc sur une vingtaine d'images, et
on **désarme à la première intention de l'utilisateur** (`wheel`, `touchstart`,
`keydown`) — sans ce désarmement, remonter son historique dans la demi-seconde
qui suit l'ouverture serait impossible, ce qui est pire que de s'ouvrir au
mauvais endroit.

**Deux pièges de mise en page, trouvés à la mesure et invisibles autrement.**

1. `justify-content: flex-end` sur le conteneur défilant : un enfant plus haut
   que lui déborde par le **haut**, et ce débordement-là **n'est pas
   atteignable au défilement**. Relevé : un `<ol>` de 46 175 px dans un
   `<main>` dont `scrollHeight` valait 708 — sa hauteur visible. Le fil entier
   était injoignable, sans erreur, sans avertissement. L'ancrage se fait
   désormais par `margin-block-start: auto`.
2. `flexShrink: 0` sur la liste : un enfant flex de hauteur explicite est
   **comprimé** dès que la somme dépasse la place. C'est le MÊME défaut que la
   Lentille avait payé sur ses rangées, revenu parce qu'il ne se voit ni au
   type-check ni à l'œil.

**Le banc est une variante de CONSTRUCTION.** La virtualisation ne se prouve
pas sur sept messages. `MEESHY_BENCH=500 bun run build` pose `__BENCH__` en
littéral ; le build servi vaut `0`, la branche devient `if (0 > 0)`, rolldown
l'élimine, et le gate de poids le prouve. Un paramètre d'URL aurait fait entrer
du code de banc dans le bundle : pour mesurer la légèreté, on l'aurait dégradée.

## D-16 · Les états du fil, et ce qu'ils refusent de promettre — 2026-09-07 (#5560)

**Quatre états dessinés** : conversation sans historique, coupure réseau,
message écrit hors ligne, reprise d'un envoi échoué.

**L'état vide est un ÉTAT.** Un fil sans historique qui rend du blanc se lit,
sur un réseau lent, comme un chargement qui ne finit pas — l'interprétation la
plus naturelle et la plus fausse. Il fallait aussi qu'il soit ATTEIGNABLE : le
POC servait la même liste de messages à toute adresse `/c/:id`, donc l'écran
vide était du code que personne, témoin compris, ne pouvait afficher. Une
conversation sans messages entre désormais dans la fixture, et `messagesOf()`
rend un tableau vide comme le fera la passerelle avant sa première page.

**La coupure s'ANNONCE, elle ne BLOQUE pas.** L'application lit parfaitement
depuis son précache : un voile ou une modale puniraient l'utilisateur pour un
état où tout ce qu'il veut lire est déjà là. Le bandeau ne dit qu'une chose,
celle qu'il ne peut pas deviner : ce qu'il ÉCRIT ne partira pas maintenant.

**`navigator.onLine === false` est fiable, `true` ne l'est pas.** Le système
sait qu'aucune interface n'est disponible ; il ne sait pas si la passerelle
répond — un portail captif ou une antenne saturée laissent le drapeau à `true`.
On s'en sert donc pour annoncer une coupure CERTAINE, jamais pour promettre
qu'un envoi passera. `useSyncExternalStore` plutôt qu'un état miroir : sur un
réseau qui coupe toutes les minutes, le rendu de décalage arrive.

**Ce que l'interface refuse de promettre.** Un message écrit hors ligne est
marqué NON ENVOYÉ tout de suite — pas d'horloge qui tourne sur un envoi qui ne
partira pas. Et « Réessayer » alors que l'appareil est toujours coupé **laisse
le message en échec** : repasser en « en attente » ferait tourner cette même
horloge pour rien, et l'utilisateur croirait que c'est parti. En ligne, l'état
reste « en attente » et n'ira pas plus loin : sans transport (#5493), aucune
confirmation n'existe, et peindre « remis » serait un mensonge. **Le manque se
VOIT plutôt que de se cacher.**

**La bande de reprise est DANS la bulle**, parti d'iOS et meilleur que
l'alternative : un bandeau global dirait « un envoi a échoué » sans dire
LEQUEL, ce qui est inutilisable sur un fil de cinquante messages.

**L'état local ne touche pas le domaine.** « en attente » et « échoué » ne sont
pas des champs de `Message` — le serveur ne les sert pas et ne les connaît pas.
Ce sont des opinions de CE client sur une charge, elle, partageable ; les
confondre ferait voyager l'échec d'un appareil jusqu'à l'écran d'un autre.
Ils vivent donc dans une carte à côté de la liste, jamais dedans.

## D-17 · Les actions de rangée passent par un MENU, et leur état est un OVERRIDE — 2026-09-07 (#5559)

**Le véhicule des actions est un menu ancré, pas un swipe.** iOS sert
épingler / sourdine / lu–non-lu / archiver par deux glissements
(`ConversationListView.swift:945-1040`) ET par un menu contextuel
(`ConversationListView+Rows.swift:113-216`) : le menu est donc un véhicule
CONFORME, pas une invention web. Il prend ici le geste primaire, pour deux
raisons qui ne se discutent pas au cas par cas : le web n'a pas de vocabulaire
de glissement horizontal qui ne se dispute pas avec le défilement de liste et
le retour-geste des coques Capacitor ; et un bouton donne gratuitement le
clavier et le lecteur d'écran, qu'un glissement ne donne jamais.

**Le bouton d'actions est TOUJOURS tabulable et jamais `aria-hidden`.** Seule
son APPARENCE est conditionnelle. La première forme le réservait à la rangée
magnifiée — or la magnification est élue par la POSITION DE DÉFILEMENT, que
personne ne pilote au clavier : les actions de toutes les autres rangées
n'existaient donc pas pour qui n'a ni souris ni écran. Un contrôle qu'on VOIT
au survol et qu'aucune technologie d'assistance ne peut atteindre est pire
qu'un contrôle absent, parce que rien ne le signale.

**Le menu suit le patron ARIA du menu déjà écrit** (`ReadingModeChip`) —
tabindex roulant, flèches, `Home`/`End`, focus qui entre à l'ouverture et
revient au bouton à la fermeture. Deux menus dans une même application, deux
comportements clavier, et le témoin de l'un ne dit plus rien de l'autre :
c'est la jumelle que ce dépôt paie deux fois à chaque fois qu'il l'ouvre.

**L'épinglage se VOIT sur la rangée.** iOS n'en a pas besoin : il range les
épinglées dans une SECTION nommée. La v3.1 a troqué les sections contre des
chips de filtre, et rien ne restait alors pour DIRE l'épinglage — « Épingler »
une conversation déjà en tête ne changeait strictement rien à l'écran. Une
action dont l'effet n'est pas observable est une action inerte, quel que soit
l'état qu'elle a bien changé en mémoire.

**L'état de ces actions est un OVERRIDE, jamais une persistance.**
`isPinned` / `isMuted` / `isArchived` viennent du fil (`userPreferences`,
`GET /conversations`) et `unreadCount` du serveur : le magasin ne porte que la
CORRECTION optimiste qu'un appel confirmera ou effacera, contrairement au mode
de lecture (D-10) qui, lui, est un choix COLLANT du lecteur. Un magasin qui
persisterait ces trois drapeaux les ferait survivre à leur propre démenti par
le serveur.

## D-18 · Les coques Capacitor sont versionnées — 2026-09-08 (#5604)

**Ce qui se committe.** Les DEUX projets natifs générés par `bunx cap add android`
et `bunx cap add ios` (`android/`, `ios/`), avec leurs réglages : le
`SceneDelegate`/`AppDelegate` du gabarit, `android/app/src/main/java/me/meeshy/app/MainActivity.java`
(surcharge du retour matériel, ci-dessous), les icônes et splashs du travail
`assets` posés dans `android/app/src/main/res/` et
`ios/App/App/Assets.xcassets/`. La directive porteur fait de l'APK un livrable
UTILISATEUR (pas seulement un POC) et ces fichiers portent des réglages
qu'aucune commande ne rejoue — contrairement à ce que le `.gitignore` du POC
promettait (« regénérées, jamais éditées à la main ») : elles LE SONT
désormais.

**Ce qui ne se committe JAMAIS.** La copie du dist embarquée par `cap sync`
(`android/app/src/main/assets/public/`, `ios/App/App/public/`) — un PRODUIT de
build, régénéré à chaque `cap sync` ; `.gradle/`, `android/**/build/`,
`local.properties`, `ios/App/Pods/` (si CocoaPods est un jour choisi),
`ios/App/Build/` (produits `xcodebuild`, voir ci-dessous). Les `.gitignore`
GÉNÉRÉS à l'intérieur des coques (`android/.gitignore`, `ios/.gitignore`) en
sont l'autorité pour leur propre arbre ; `scripts/check-git-tracking.mjs` reste
`OUT_OF_SCOPE` sur `android`/`ios` — leur cycle est le leur.

**La règle de correctif.** Un défaut de coque se cherche D'ABORD côté coque
(fichier natif versionné) ; côté application SEULEMENT si la coque ne peut pas
le porter, et alors derrière une constante de construction éliminée du build
web (motif `__BENCH__`, `vite.config.ts`) — jamais un `import '@capacitor/app'`
nu dans le code partagé avec le web.

**SYMROOT : PAS de réglage projet, contrairement à ce que la spécification
attendait.** Poser `SYMROOT = "$(PROJECT_DIR)/Build"` dans
`project.pbxproj` (les deux configurations, Debug et Release) — comme fait une
première fois puis DÉFAIT — casse la résolution de paquets Swift avec
« *Packages are not supported when using legacy build locations, but the
current project has them enabled* ». Cause : Capacitor 8 génère l'iOS shell sur
**SPM** (`ios/App/CapApp-SPM/Package.swift`), pas CocoaPods — la spécification
supposait un `Podfile`, absent du gabarit 8.5.1. Un SYMROOT DÉCLARÉ dans le
`.pbxproj` bascule Xcode en « legacy build locations », incompatible avec la
résolution de paquets locaux. **La machine porte déjà le réglage qu'il fallait**
— préférence globale `com.apple.dt.Xcode` (`IDEBuildLocationStyle=Custom`,
`IDECustomBuildLocationType=RelativeToWorkspace`,
`IDECustomBuildProductsPath=Build/Products`), la MÊME que celle qui fait déjà
atterrir `apps/ios/Meeshy.xcodeproj` sous `Build/Products/` sans qu'aucune
ligne de son propre `.pbxproj` ne le déclare. `xcodebuild` sans aucun réglage
de coque produit donc déjà `ios/App/Build/Products/Debug-iphonesimulator/App.app`,
et ce chemin ne dépend d'AUCUN fichier versionné — seulement de la machine de
build. Ce point mérite un suivi côté CI/outillage (les runners partagent-ils ce
même réglage, ou un `-derivedDataPath` explicite doit-il l'y remplacer ?),
hors du périmètre de ce travail.

**Le CocoaPods de la spécification ne s'applique pas.** Le gabarit Capacitor
8.5.1 ne génère aucun `Podfile` : `bunx cap add ios` écrit directement
`CapApp-SPM/Package.swift`, résolu par des chemins LOCAUX vers `node_modules`
(zéro réseau). La question 6 de la spécification (« CocoaPods ou SPM ? ») se
tranche donc par le gabarit lui-même, sans repli à documenter.

**Défaut 3b (retour matériel Android) corrigé CÔTÉ COQUE, comme prescrit.**
`BridgeActivity` (Capacitor 8) ne surcharge PLUS `onBackPressed()` par défaut
(retiré du cœur depuis Capacitor 3) : un seul appui matériel FERMAIT
l'application entière depuis un fil, quel que soit l'historique JS du routeur
(`pushState` pourtant réel). `MainActivity.java` ajoute un
`OnBackPressedCallback` : `WebView.canGoBack()` → `goBack()` ; sinon,
comportement système par défaut. Vérifié sur l'AVD : fil → liste (1er retour,
app au premier plan) → sortie (2e retour, attendu).

**Défaut 3c (bascule clair/sombre à chaud) corrigé côté APPLICATION** — c'est
le web/PWA qui portait le bug, pas la coque : `followSystem()`
(`src/lib/scheme.ts`) existait mais n'était appelée nulle part. `main.tsx`
l'appelle désormais au démarrage. Un second défaut, plus fin, y a été trouvé
en même temps (T1) : `followSystem()` appliquait la préférence système en
appelant `setScheme()`, qui PERSISTE en `localStorage` — un suivi automatique
se transformait ainsi en choix explicite dès le premier changement système, et
plus AUCUN changement suivant n'était honoré. `applyScheme()` (peint, sans
persister) en est désormais le seul geste ; `setScheme()` reste réservé au
choix EXPLICITE de l'utilisateur. Vérifié en DIRECT sur le simulateur :
`xcrun simctl ui … appearance dark` puis `light`, sans relancer l'app, les
deux fois répercutées.

**Défaut 3a (safe-area) corrigé — et la loi des encoches tient désormais en UNE
phrase.** Le défaut n'était PAS en bas : il était en HAUT, et il coupait le bas.
La coquille (`body`) portait `padding-top: env(safe-area-inset-top)` pendant que
les écrans plein-cadre (`conversations.tsx`, `thread.tsx`) sont des `h-dvh`,
c'est-à-dire 100dvh = la hauteur visible ENTIÈRE. La boîte du document valait
donc `100dvh + inset-haut`, et l'excès partait sous le bord bas de l'écran : la
barre de recherche et le composeur — tous deux pourtant correctement repliés de
`max(env(safe-area-inset-bottom), 8px)` sur leur propre bord — étaient poussés
hors du cadre d'EXACTEMENT la hauteur de l'encoche HAUTE.

Mesuré au simulateur `Meeshy Poc-Web-V31`, par une sonde `getComputedStyle` sur
des boîtes de hauteur `env(…)` injectée dans le dist embarqué :

| | avant | après |
|---|---|---|
| `env(safe-area-inset-top)` | **62** | 62 |
| `env(safe-area-inset-bottom)` | **34** | 34 |
| `window.innerHeight` | 874 | 874 |
| `documentElement.scrollHeight` | **936** (= 874 + 62) | **874** |

Ces valeurs invalident la première lecture de ce défaut, qui concluait que
`env(safe-area-inset-*)` se résolvait à ZÉRO sur ce simulateur et rangeait le
symptôme en « défaut d'environnement, non vérifiable ici ». Elles ne sont pas
nulles ; c'est la SOMME qui débordait. La leçon de méthode : **un inset qui
« ne fait rien » de visible en bas peut être un inset qui agit en HAUT** — la
mesure discriminante n'est pas la valeur de `env(…)` mais la comparaison
`scrollHeight` / `innerHeight`, qui nomme l'excès et sa hauteur exacte.

**La loi, désormais UNE et symétrique.** L'inset est porté par le CADRE de
l'écran (`pt-safe` sur la racine `h-dvh` — `box-sizing: border-box` le fait
tenir DANS les 100dvh au lieu de s'y ajouter) et par le BORD FIXE bas
(`pb-safe`), **jamais par la coquille**, qui n'en porte plus aucun. C'est le
modèle iOS que la v3.1 suit (D-1) : aucune barre de navigation système, chaque
écran dessine son propre en-tête flottant et respecte lui-même ses encoches —
et c'est le motif que les quarante surfaces restantes copieront. Les deux
utilitaires `pt-safe` / `pb-safe` (`app.css`) sont l'écriture UNIQUE de cette
loi : `max(env(safe-area-inset-bottom), 8px)` était jusque-là recopié à la main
dans `composer.tsx` et `conversations.tsx`, et l'inset haut une troisième fois,
au mauvais endroit. Vérifié en capture sur la liste ET sur le fil, clair et
sombre.

Cette loi est GARDÉE, pas seulement écrite : `src/routes/safe-area.test.ts`
exige que toute racine `h-dvh`/`min-h-dvh` de `src/routes/` porte `pt-safe`
(liste d'exemptions motivées, vide à ce jour) et que le bloc `body` d'`app.css`
ne pose plus aucun `padding-*: env(safe-area-*)`. C'est un témoin de
CONVENTION — que la classe PEIGNE est prouvé par `check-utilities.mjs`, qui
oppose chaque classe employée à la feuille réellement produite, et la mesure
finale reste la recette simulateur (`scrollHeight` vs `innerHeight`). Le défaut
étant invisible sur un navigateur de bureau (inset nul) et ne se voyant qu'en
coque, chacune des quarante surfaces restantes le rejouerait autrement en
silence.

**Splash Android 12+ : `windowSplashScreenBackground` était manquant.** Depuis
API 31 le système peint lui-même l'écran de lancement et IGNORE
`android:background` du thème — les onze `drawable*/splash.png` générés ne
servent plus que API 24-30. Sans cet attribut le fond retombait sur le
`colorBackground` du thème : mesuré `#1E1F25` en mode sombre, blanc en mode
clair, jamais la marque. `values/colors.xml` (`splash_background`) +
`styles.xml` le posent ; mesuré après correctif : `#0B0C14`, système en mode
CLAIR compris.

## D-19 · `script` n'est PAS `river` — deux modes distincts, un seul hors périmètre — 2026-09-08

La spécification du lot « thread/style » (préparation de cible, tour du
2026-09-08) posait la question en ouvert : *« script = rivière ? à trancher
en lisant le catalogue `@meeshy/shared/types/reading-modes` »*. Le catalogue,
et le code déjà écrit, la tranchent déjà — cette entrée le rend CITABLE au
lieu de laisser la question rouverte à chaque lecture de la spécification.

**Non : `script` et `river` (Rivière) sont deux valeurs DISTINCTES du même
type `ConversationReadingMode`.** La preuve est à trois endroits qui
s'accordent :
- le gateway valide `auto|focal|script|resume|riviere` — **cinq** valeurs
  (D-10, `routes/conversation-preferences.ts`) ;
- `catalog.ts` leur donne des titres et des sous-titres séparés (« Script » /
  « Rangée plate, densité uniforme » vs « Rivière » / « Les couloirs de la
  conversation ») et les traite par des branches différentes de `menuRows()` ;
- `decision.ts` (`THREAD_RENDERABLE_MODES = ['focal', 'script', 'summary']`
  depuis D-24 — la citation d'origine, `['focal', 'script']`, est périmée)
  rend `script` DISPONIBLE au même titre que `focal`, quand `river` reste
  hors de ce catalogue de rendu, sous la loi D-8.

**Ce que ça tranche pour la suite.** `script` n'est donc pas une question
ouverte ni une variante de `river` : c'est le second mode de la RANGÉE PLATE
(`usesFlatRow`, `decision.ts`), déjà EN PÉRIMÈTRE de la v3.1, qui partage
`FocalRow` avec `focal` et n'en diffère que par l'absence de perspective au
défilement (`useThreadPerspective(scroller, mode === 'focal')`,
`thread.tsx:195`) — mécanisme déjà câblé, distinct du travail qui reste à
faire sur la colonne méta (`FocalMetaColumn.swift:62-76`,
`showsDeliveryChecks`, non encore extraite en fonction nommée testée dans
`src/lib/reading-mode/meta.ts`). `river` reste hors périmètre (D-8), sans
lien avec cette clarification.

## D-20 · La cible est l'app iOS DRAPEAUX ACTIVÉS — et la v3.1 n'a ni drapeau ni programme bêta — 2026-09-08 (#5672)

Directive porteur, le 2026-09-08 : *« Il faut re-analyser la vue de Meeshy avec
les dernières Features activées car c'est la cible : la vue Lentille, messages
Focal, Scripts et Bulle ! Il faut refaire une analyse avant implémentation. »*
Puis : *« dans cette version pas besoin de ceci ! par défaut la lentille est là
et la conversation focal aussi avec possibilité des choix en script ou bulle »*
— et, sur le drapeau en dur de `decision.ts` : *« s'il est déjà possible de
désactiver autant mettre un paramètre de configuration pour désactiver la focal
par défaut »*.

**Ce que la cible EST.** iOS porte trois drapeaux indépendants — `lentille_list`,
`reading_modes`, `riviere_mode` (`Lentille/Core/LentilleFeatureFlag.swift:82-186`)
— qu'un seul interrupteur allume, Réglages › Bêta (`BetaFeaturesPreference`,
clé `meeshy.pref.beta_features_enabled`), et qu'une installation neuve a ÉTEINTS.
La référence de la v3.1 est l'app iOS **avec ces trois drapeaux ON** : la liste
Lentille (sections, stickers, pont ✦, magnification actionnable, scène qui
s'aplatit au repos, rail de stories), le fil en rangée plate (Focal avec son
élection, Script), Bulles comme choix. Toute capture prise drapeaux éteints
montre l'ANCIEN produit (liste en cartes `ThemedConversationRow`, fil en
bulles sans puce de mode) et ne vaut rien comme cible. Précision du même jour
(`targets/bulle.md`) : la bulle iOS n'a PAS de queue dans les deux
configurations — rayon 18 uniforme, `BubbleBackground.swift:20-23` — ce que
la capture drapeaux éteints montrait comme « queue » était un texte stylé,
pas la peau de bulle — le run `wf_81ad007f-ceb` l'a fait, et son
propre rapport l'écrivait (« preuve vivante que le drapeau iOS est désactivé »).
Le dossier `apps/web-v2/targets/` (captures clair/sombre, arbres
d'accessibilité, analyses par vue avec tableau iOS → web-v2) est la source de
vérité des phases Cadrer, Concevoir et Spécifier ; il PRIME sur toute
spécification antérieure.

**Ce que ça change à D-7 et D-9.** Les deux disaient « écart assumé avec iOS,
où le drapeau est désactivé ». Le FAIT reste vrai ; le STATUT change : ouvrir
en Focal et servir la Lentille ne sont plus des écarts mais la conformité, et
tout ce que le drapeau ON monte entre au périmètre de parité (`targets/*.md`,
§ écarts). La phrase « écart assumé avec iOS où le drapeau est désactivé »
n'est plus recevable dans une décision ni une spécification.

**Ce que ça ne change pas.** La v3.1 n'a ni toggle utilisateur ni programme
bêta : la Lentille EST la liste (D-9), le fil S'OUVRE en Focal (D-7),
l'utilisateur CHOISIT Script ou Bulles par la puce. Le seul réglage est un
paramètre de CONSTRUCTION, `VITE_READING_MODES` (`on` par défaut, `off` ⇒ le
fil s'ouvre en bulles sans puce, miroir exact du drapeau iOS `reading_modes`,
#5674), lu au seul endroit qui lit l'environnement, `src/lib/api/config.ts`.

**Ce que ça coûte.** Sans drapeau, la v3.1 n'a aucun retour arrière à chaud —
`VITE_READING_MODES=off` est un retour au déploiement, pas un interrupteur.
Le « pas de demi-livraison » de D-9 vaut donc pour chaque écart listé dans
`targets/` : une Lentille sans sections ou un Focal sans élection n'est pas
« en avance », c'est un écart.

## D-21 · Résumé et Rivière entrent au périmètre, chacun sous sa condition — 2026-09-08 (#5672)

Directive porteur, le 2026-09-08 : *« Si c'est possible d'avoir résumé et
rivière tout de suite alors les intégrer. »* D-8 les tenait hors périmètre
comme un seul cas ; les deux analyses de faisabilité (`targets/resume.md`,
`targets/riviere.md`) montrent qu'ils n'ont ni le même coût ni les mêmes
dépendances. **D-8 est remplacée** : `summary` et `river` entrent au
catalogue de rendu de la v3.1 (`THREAD_RENDERABLE_MODES`) dès que leur
condition est levée, dans cet ordre.

**Le Résumé Vivant — OUI, sous trois conditions.** Le digest est calculé
LOCALEMENT depuis les messages chargés par trois lois pures
(`DeterministicDigestBuilder`, `EpisodeSegmenter`, `FaceRampRanking` —
`Focal/Summary/`, 1 477 lignes Swift dont près de la moitié de doc-comments),
sans aucun endpoint ; le panneau agent (`GET /conversations/:id/analysis`,
`requiredAuth`) reste optionnel et son échec un no-op, comme sur iOS. Aucun
miroir TypeScript n'existe (amendement A2 : « pas de miroir ») ; 52 cas de test
iOS se transcrivent tels quels. Conditions : (1) un corpus de fixtures qui
rende le mode ATTEIGNABLE — 26 non-lus ou 10 non-lus après 24 h d'absence,
là où la fixture actuelle en a 2 ; (2) `scripts/check-reading-mode.mjs`
inversé dans le même commit, puisqu'il exige aujourd'hui « Résumé
désactivé » ; (3) le cadrage des dates par la langue du lecteur, pas
`'fr-FR'` en dur. Le masquage pour un invité est une décision de LOI
(`resolveCapabilities`), pas une impossibilité de calcul.

**La Rivière — OUI, sous une condition.** La loi des couloirs vit déjà en
TypeScript partagé (`packages/shared/utils/river-lanes.ts`, 1 044 lignes,
61 vecteurs inter-plateformes que l'iOS rejoue) : portage zéro. La donnée
d'éligibilité n'est pas `activeParticipantCount` (que la passerelle sert
`null` à dessein) mais `conversation.memberCount`, ce qu'iOS lit
(`ConversationView.swift:569`) et que web-v2 affiche déjà — une ligne dans
`decision.ts`. Aucun endpoint : c'est le mode le plus compatible avec le
précache, et le seul accordé aux invités. Une peau React complète existe
dans le legacy (`apps/web/components/conversations/riviere/`), jamais montée :
elle se PORTE (Preact, jetons dérivés), elle ne s'importe pas. La condition
unique est **D-15** : la peau legacy monte toutes les bulles et mesure
chacune ; le tracé doit être virtualisé comme iOS le fait
(`RiverCanvasRankPlacement`, `RiverLaneCanvas.swift:38-51`), sans quoi il
disparaît dès qu'on quitte le haut du fil. Manquent ensuite les gestes
tactiles, la poignée du temps et son échelle (aucun miroir web), le mapping
messages → loi, l'avis système, l'identité vivante et les badges hors-champ.

**L'ordre.** La conformité de la Lentille et de la rangée plate (Focal,
Script) et de la Bulle passe d'abord : c'est ce que voit chaque conversation
à l'ouverture. Puis le Résumé, que l'orchestrateur élit de lui-même dès 26
non-lus. Puis la Rivière, choisie à la main et réservée aux groupes d'au
moins cinq membres. `river` et `summary` restent LISTÉS et motivés au menu
tant que leur condition n'est pas levée — jamais un mode qu'on ne sait pas
rendre (la règle de D-8 survit, sa portée non).

**Ce que ça coûte.** Deux chunks À LA DEMANDE (budgets.json) : ni le Résumé
ni la Rivière ne pèsent sur la première peinture. Et un défaut à solder au
passage : le troisième libellé de `catalog.ts` (« S'ouvrira à N personnes
actives — M aujourd'hui ») est inatteignable tant que `current` vaut `null`
alors que le nombre est affiché trois lignes plus haut.

## D-22 · Focal se distingue de Script par une ÉLECTION, pas par une courbe de perspective — 2026-09-08

**Ce que D-19 décrivait comme câblé** — `useThreadPerspective(scroller, mode === 'focal')`
(`thread.tsx:195`, `src/lib/reading-mode/scene.ts`) — pose `opacity` et
`transform: scale()` en continu sur CHAQUE rangée hors d'une bande centrale
(`perspective.ts:46-52`, constantes 380/0,40/0,82). C'est la mécanique que
`FocalScrollPerspective.swift` portait avant le lot Magnificence : iOS l'a
**retirée le 2026-08-24** (`apps/ios/decisions.md:328`) et l'a remplacée par
une ÉLECTION — un id élu par le centre de la région visible avec hystérésis
95 (`FocalFocusCurve.threadFocusBandHysteresis`), armée par un geste soutenu
(≥ 1 200 pt/s OU ≥ 4 000 ms, jamais sur un défilement programmé) et aplatie
4,5 s après le dernier tick. Seules DEUX rangées se reconfigurent par
transition (l'ancienne élue, la nouvelle) : carte teintée, chip d'identité
agrandi, tampon de date — jamais une échelle ni une opacité posée sur tout le
fil. `targets/focal-script.md` § 3.7, 4.2 et 10 (écart 1) documentent la cible
capturée le 2026-09-08 ; aucune rangée du fil n'y porte `transform: scale`
ni `opacity < 1` hors du cycle de révélation heure/coches.

**Ce qui change.** La scène reste HORS React (une passe `rAF`, comme
`scene.ts` aujourd'hui) mais n'écrit plus `opacity`/`transform` en continu :
elle pose un attribut `data-elected` sur au plus une rangée et une classe de
carte, gouvernés par l'armement du geste utilisateur — même famille de
désarmement que l'ancrage bas (D-15 : `wheel`/`touchstart`/`keydown`, jamais
`scrollTo` programmé). Le révélé des heures/coches (`FocalTimestampRevealState`,
`FocalMetaRow.swift:88-95`) suit la MÊME source d'activité que l'élection —
un seul état d'activité pour les deux, pas deux minuteurs indépendants.

**Ce que ça ne change pas.** `script` reste le second mode de la rangée plate,
sans élection à aucun moment (D-19) ; `FocalRow` reste partagée par les deux
modes ; le mécanisme reste hors du chemin de rendu React pour la même raison
que `scene.ts` l'était (fréquence de défilement).

**Ce que ça coûte.** `scripts/check-reading-mode.mjs` § 10 exige aujourd'hui
« transform posée en Focal / absente en Script » — cette assertion s'INVERSE
dans le même commit que le rebranchement (elle devient : aucune rangée ne
porte de `transform: scale` ni `opacity < 1` de perspective continue, une
seule porte `data-elected="true"` après un défilement soutenu). `perspective.test.ts`
gèle une loi qui n'est plus celle qu'on rebranche : il reste comme point de
rebranchement documenté, pas comme gate du nouveau mécanisme — le nouveau
mécanisme a son propre témoin (`election.test.ts`).

**LIVRÉ (#5648, 2026-09-08).** Trois lois pures neuves : `src/lib/scene/activity.ts`
(la source d'activité UNIQUE — révélé + armement, réutilisée par le futur
`lens/scene.ts`), `src/lib/reading-mode/election.ts` (`focusLine`,
`electThreadFocus` — réutilise `lens/law.ts::electFocus`, `armingLaw.isArmed`,
`velocityOf`), `src/lib/reading-mode/stamp.ts` (`focusStampLabel`, port de
`FocalFocusTimestamp.label`). `src/lib/reading-mode/scene.ts` réécrit
(`useThreadScene`, hors React, horloge `performance.now()` injectée) —
`useThreadPerspective` disparaît, `thread.tsx` l'appelle et pose
`sceneStyleVars()` sur `<main>`. `src/components/focal-focus-overlays.tsx`
(nouveau) porte les quatre superpositions de l'élue (`FocusCard`,
`FocusIdentity`, `FocusStrip`, `FocusStamp`), extraites de `focal-row.tsx`
(`memo`, prop `elected`, `data-elected`). `message-blocks.tsx::Flags` prend
un `limit` (3 sur la ligne basse ordinaire, 5 sur la bande de l'élue).
Fixture `c-salon-riviere` (40 messages, 5 participants) ajoutée : seule
conversation du jeu qui défile assez pour armer la scène.

Gates : `bun test` (57 témoins neufs, tous verts), `node scripts/check-curve.mjs`
(PARTIE 2 étendue, PARTIE 3 + PARTIE 4 neuves — 10 cotes supplémentaires
dérivées de `FocalScrollPerspective.swift`), `node scripts/check-reading-mode.mjs`
(§ 10 inversé, § 13 neuf — révélé Focal/Script, § 5 étendu — élection sous
`prefers-reduced-motion`), `bun run build`, `bun run type-check` — tous
verts. Mesure : première peinture 30,09 Ko (plafond 40 Ko `budgets.json`),
en hausse de ~3,7 Ko sur les 26,38 Ko relevés le 2026-09-07 — la CSS globale
de la scène (`app.css`, non route-splittée) en porte l'essentiel ; le chunk
`thread-*.js` lui-même n'a quasiment pas grossi (~11,2 Ko gzip, contre
~11,46 Ko avant ce lot), confirmé par grep du bundle (`data-elected`,
`focus-card` présents dans `thread-*.js`, absents de `core-*.js`).

**Dimensions mûres** : 1 (sécurité — sans objet, aucune donnée sensible),
2 (performance — zéro écriture DOM par rangée/frame, une lecture de
géométrie par frame, React traversé une fois par changement d'élu), 4
(fluidité — élection posée sans saut de hauteur, transitions coupées sous
mouvement réduit), 7 (facilité d'usage — même geste qu'iOS arme la scène),
11 (maintenabilité — trois lois pures testées, un seul hook, une seule
source d'activité partageable avec la Lentille #5694), 12 (simplicité —
toute la complexité de l'armement/révélé vit dans `scene/activity.ts`,
l'utilisateur ne voit qu'une carte qui apparaît).
**Dimensions restantes, chacune sa propre issue à ouvrir** : 8 (UX — la bande
de focus DÉBORDE de ~25 px sous le début de la dernière ligne de texte dès
qu'elle porte plus d'une capsule ; la géométrie est celle d'iOS au pixel
près — `overhang = chipHeight/2 + innerMargin`, cote DÉRIVÉE et gardée — et
la cible `thread.focal.scene.*` montre le même débord avec sa capsule
unique : c'est un défaut de la CIBLE, à porter à `targets/README.md`
§ défauts iOS, jamais une divergence à inventer côté web), 13 (complétude —
trois éléments de la cible restent hors périmètre : le fond animé de la
conversation, la pilule de jour flottante, le bouton « revenir en bas »,
chacun à sa propre issue compagnon, § 9 question 5 de la spécification).

**REVUE-CORRECTION (#5648, même jour).** Neuf défauts pris sur la première
livraison, tous corrigés dans la passe, chacun avec sa preuve :
1. **BLOQUANT — bande de focus INATTEIGNABLE.** Chaque rangée est un contexte
   d'empilement (`transform` du virtualiseur) et les rangées se peignent dans
   l'ordre du DOM : les superpositions qui débordent vers le BAS passaient
   sous la rangée suivante. `document.elementFromPoint` au centre du drapeau
   rendait la rangée d'après — le contrôle était présent, fonctionnel et
   inatteignable au doigt. `zIndex: 1` sur la SEULE rangée élue
   (`thread.tsx`) ; témoin `check-reading-mode.mjs` §10.
2. **BLOQUANT — la bande FRANCHISSAIT la garde de voile.** Elle montait sous
   une loi à elle et non sous `mountsBottomLine`, dont la garde nommée est
   « jamais de drapeau en clair sur un message VOILÉ » : la langue d'origine
   d'un message protégé partait sur la carte de l'élue. La bande monte
   désormais sous la MÊME loi que la ligne basse qu'elle remplace.
3. **MAJEUR — `aria-hidden` sur un conteneur à boutons FOCALISABLES.** La
   ligne basse ordinaire étant démontée sur l'élue, ces boutons sont les
   SEULS contrôles de Prisme de la rangée : les masquer retirait au lecteur
   d'écran la mention même que le message est traduit. `aria-hidden` levé.
4. **MAJEUR — DEUX pastilles d'avatar et deux noms.** L'en-tête d'identité
   s'effaçait, son AVATAR non (colonne de grille distincte, hors de
   l'en-tête). iOS efface l'en-tête ENTIER (`FocalRow.swift:269`).
5. **MAJEUR — ancrage horizontal faux.** Les quatre superpositions étaient
   ancrées sur la colonne de CONTENU alors qu'iOS les pose sur le corps de
   la rangée, gouttière d'avatar comprise : carte s'arrêtant à droite de
   l'avatar, chip d'identité 41 px à droite de la pastille qu'il remplace,
   bande tombant SOUS le texte au lieu de la gouttière. `--focus-text-indent`
   les y ramène ; mesuré carte à `row+6`, chips à `row+20`, exactement iOS.
6. **MAJEUR — `--scene-flatten-ms` sans lecteur.** Les 450 ms d'aplatissement
   étaient ATTENDUS puis la carte disparaissait d'un coup : aucune règle CSS
   ne lisait la variable, `data-scene` n'avait aucun consommateur. Mesuré
   après correction : `scene='idle'`, opacité 0,88 en cours de transition
   `0.45s`.
7. **MAJEUR — `memo` inopérant.** `place(messages)` était rappelé à chaque
   rendu et `jumpToMessage` recréé : deux props neuves par rendu sur CHAQUE
   rangée, donc la promesse « deux rangées re-rendent, jamais toutes » était
   fausse par construction. `useMemo`/`useCallback` sur la chaîne complète
   (`placed`, `jumpToMessage`, l'objet rendu par `useThreadScene`).
8. **MAJEUR — l'intention ne se refermait jamais.** Après la fin de la
   fenêtre de révélé, `intent` restait ouvert : le premier défilement
   programmé non annoncé (ancrage navigateur, `scrollIntoView`) comptait
   comme un geste. Refermée avec la session, comme `didEndDecelerating`.
9. **MINEURS** — capsule de chip VIDE quand `PrismPastille` rend `null` ;
   heure de la nouvelle élue en fantôme derrière son tampon (280 ms de fondu
   là où iOS reconfigure d'un coup) ; heure annoncée DEUX fois au lecteur
   d'écran (`opacity: 0` ne retire rien de l'arbre) ; `padding-inline: 7px`
   en dur dans une feuille qui déclare n'en porter aucun ; `dataset.revealed`
   réécrit à chaque événement de défilement ; en-tête de
   `check-reading-mode.mjs` décrivant encore la courbe retirée.

**Et le CORPUS lui-même était en cause** : les 40 messages du Salon Rivière
n'avaient AUCUNE traduction, donc `mountsBottomLine` était toujours faux et
la bande de focus ne naissait jamais dans le gate — il « armait, élisait,
aplatissait » sans jamais faire naître la moitié de ce que l'élection
AJOUTE. Chaque message est désormais traduit, un sur cinq écrit en anglais
(la seule condition qui fasse naître la pastille du Prisme), et le gate
EXIGE d'abord que l'élue porte une bande avec des contrôles — sans quoi les
trois témoins qui suivent ne prouveraient rien.

## D-23 · Un message protégé a UN site de rendu, partagé par la rangée plate et la bulle — 2026-09-08

`isBlurred`, `isViewOnce`, `expiresAt` et `deletedAt` ne sont lus par AUCUN
composant web-v2 aujourd'hui (`focal-row.tsx:119` ne lit `isBlurred` que pour
décider si la ligne basse se monte ; `bubble.tsx` ne lit aucun des quatre).
Un message flouté ou à vue unique s'affiche donc **en clair** sur les deux
peaux — la régression que `targets/focal-script.md` § 6 et `bulle.md` § 3.11
documentent comme « absent et dangereux », au rang de la dimension 1
(sécurité) de la charte du dépôt : à corriger avant que le fil lise de
vraies données, pas après.

**Le site est UNIQUE.** iOS a DEUX apparitions du même cycle —
`FocalProtectedContent.swift:20-48` (rangée plate) et
`BubbleStandardLayout.swift:568,966-981,1591-1600` +
`BubbleBlurRevealLifecycle.swift` (bulle) — qui partagent la même loi : flou,
`allowsHitTesting(false)`, tap → révélation 5 s → re-flou, `consumeViewOnce`
pour la vue unique. La v3.1 n'écrit CETTE loi qu'une fois —
`src/lib/reading-mode/protection.ts`, une machine à états pure
(`hidden → revealed(until) → hidden | consumed`) testée sans DOM — et UN
composant de présentation, `components/protected-content.tsx`, monté par
`focal-row.tsx` ET `bubble.tsx`. Écrire le cycle deux fois (une horloge de
révélation par peau) est le défaut que D-14 (une loi, plusieurs clients)
interdit déjà pour le Prisme ; il s'applique ici à l'intérieur d'un seul
client.

**Ce que ça ne couvre pas.** La teinte de la bulle reçue (mélange expéditeur
à 70 % d'indigo, `ThemedMessageBubble.swift:383-390`) reste une question
produit ouverte (#5680) ; ce travail n'y touche pas. Les autres états
manquants de la bulle (supprimé, système, appel, sticker — `bulle.md` § 6.6,
§ 9) restent hors périmètre : seuls les QUATRE états de protection
(flouté, vue unique, éphémère, supprimé) sont couverts par ce travail.

**Ce que ça a coûté** (`node scripts/measure-weight.mjs`, avant/après) :
`first_paint` 29,79 → 29,82 Ko gzip — INCHANGÉ au sens du plafond (`budgets.json`
40 Ko) ; `on_demand` 67,55 → 71,56 Ko gzip, soit +4,01 Ko pour cinq modules
neufs (`protection.ts`, `protected-content.tsx`, `view-once.ts`,
`thread-protection.css`, l'extension de `meta.ts`) et cinq glyphes (`flame`,
`flame-fill`, `prohibit`, `eye-slash`, `timer`) — mesuré après revue. Le seuil
de JUSTIFICATION que la spécification s'était donné (4 Ko, D-23 §7) est franchi
de 10 o, du fait du cinquième glyphe ajouté en revue pour lever l'ambiguïté
`flame` éphémère / `flame` vue unique : ce n'est pas un plafond de
`budgets.json` (seul `first_paint`, 40 Ko, en est un, et il reste à 29,82) mais
la ligne est dite ici plutôt que tue — le prochain lot du fil justifie son
ajout ou extrait. `bun run gate` : 492 témoins `bun test`,
`check-curve.mjs` PARTIE 5, `check-utilities.mjs`, `check-thread-states.mjs`
§5 (41 assertions × 2 peaux) tous verts.

**Les DIVERGENCES avec iOS, assumées et documentées** (D-23 §1.4, questions
tranchées § 9 de la spécification #5676) :
1. Le contenu voilé N'EST PAS dans le DOM avant révélation (iOS « rend puis
   obscurcit » ; le web substitue un texte dérivé de la seule LONGUEUR,
   `surrogateOf`) — le DOM est la surface de fuite sur le web, pas sur iOS.
2. `isViewOnce` SANS `isBlurred` est voilé (forme SDK `declaredProtection`,
   fail-closed) — Focal iOS ne voile que sur `isBlurred`.
3. Un seul rayon de flou, 18 px (Focal) — la bulle iOS en porte 20.
4. **`burned` REJOINT `veiled`, jamais le tombstone plat** — écart majeur
   trouvé en TDD (§4.8) : router `burned` vers le tombstone dès la
   consommation (comme `FocalRow.swift:66`) coupait la fenêtre de révélation
   de 5 s à l'instant même où le serveur répond, avant qu'elle ne s'écoule.
   Le web garde le comportement de la BULLE iOS (`ThemedMessageBubble.swift:305-324`,
   contenu visible pendant la fenêtre, tombstone après) sur LES DEUX peaux —
   un défaut suspecté de la cible Focal, à ouvrir en issue iOS (jamais
   recopié ici).
5. Le drapeau de rang 1 (langue préférée) est gardé par l'existence d'une
   traduction — iOS l'ajoute sans condition car le tap y DEMANDE une
   traduction, transport que le web n'a pas encore (loi 4 : pas de contrôle
   inerte).
6. Brouillard simplifié : une transition d'opacité 400 ms sur un voile
   radial, au lieu des trois phases iOS (0,4/0,4/0,5 s).
7. Pas de préférence de durée de révélation — constante 5 s, la préférence
   viendra avec l'écran Réglages.
8. Échec de consommation VISIBLE (`role="status"`, 2,5 s) — iOS reste muet.

**Issue iOS à ouvrir** (divergence 4) : « Focal : le tombstone d'une vue
unique coupe la fenêtre de révélation payée par le lecteur ».

### Ce que la revue a corrigé, et ce que ça enseigne — 2026-09-08

Sept défauts, tous portés par des témoins neufs ; deux tiennent d'une même
racine — **un témoin peut décrire exactement la bonne règle et ne jamais
pouvoir la contredire.**

1. **La garde « aucun drapeau sur un message voilé » n'était tenue par AUCUN
   témoin.** Mesuré : `isVeiled: isProtected` remplacé par `isVeiled: false`
   dans les DEUX peaux laissait `bun test` à 488/488 et
   `check-thread-states.mjs` entièrement vert. Deux causes se
   superposaient — le témoin visait un message SANS traduction (`languageBand`
   rend `[]` et `PrismPastille` se tait déjà quand la langue servie EST
   l'originale, `message-blocks.tsx:60`), et le seul message voilé ET traduit
   n'était pas `tail` (`mountsBottomLine` exige `isLastInGroup`, donc la ligne
   basse ne montait pas de toute façon). Corrigé sur les trois plans : `prot-4`
   change d'expéditeur pour rendre à `prot-3` sa place de fin de groupe, un
   test de fixture épingle cette PLACE (pas seulement le champ), et deux
   témoins de composant (`bubble.test.tsx`, `focal-row.test.tsx`) rendent la
   garde falsifiable hors DOM. Les quatre rougissent maintenant à la
   suppression de la garde.
2. **`rendersContent`/`showsAffordance` étaient une loi que personne
   n'appelait** : déclarées « SEULE source du quand rendre les enfants »,
   testées, et re-écrites en `if` dans `protected-content.tsx`. Une jumelle
   d'autant plus dangereuse qu'elle avait ses propres témoins verts. Le
   composant appelle désormais la loi.
3. **Le brouillard ne peignait jamais.** `.protected-fog` naissait à
   `opacity: 0` sans qu'aucune règle ne l'en fasse sortir, et son parent était
   `static` — un `position: absolute` calé sur un ancêtre quelconque. La
   divergence 6 ci-dessus était donc ANNONCÉE et non APPLIQUÉE.
   `.protected-revealed { position: relative }` lui donne son bloc conteneur ;
   `@starting-style` lui donne son déclencheur sans un second `@keyframes` (la
   charte n'en autorise qu'un, règle 32) ni un rendu de plus. Sur un moteur
   sans `@starting-style`, la révélation est instantanée — jamais cassée.
   Aucun gate ne peut le tenir (une transition CSS vit sur l'horloge du
   compositeur, que `page.clock` ne simule pas) : mesuré à la main,
   1 → 0,90 → 0,59 → 0,08 → 0 sur 400 ms.
4. **L'indice VoiceOver était annoncé par personne.** iOS sert DEUX chaînes
   (`bubble.content.hidden` + `.hint`) ; sur le web, `aria-label` REMPLACE le
   contenu dans le calcul du nom accessible, donc le `<span class="sr-only">`
   du bouton-voile était inatteignable. `aria-describedby` le rend à sa
   fonction de description.
5. **Le tombstone plat était indenté deux fois.** `FocalDeletedRow` pose
   `.padding(.leading, indent)` parce qu'iOS n'a pas de gouttière ; la rangée
   web vit DÉJÀ dans la colonne 2 d'une grille large de `TEXT_INDENT`. Mesuré :
   texte à x=112 quand toute autre parole du fil commence à x=71. Corrigé,
   re-mesuré à 71.
6. **Le voile occupait deux fois la place de ce qu'il cachait.** `▇` (U+2587)
   avance d'un cadratin, une lettre latine d'un demi : un bloc par caractère
   faisait tenir sur TROIS lignes un message qui en occupe UNE, et la
   révélation faisait sauter le fil. `SURROGATE_ADVANCE_RATIO` vise la LARGEUR
   du contenu — ce qu'iOS obtient gratuitement en floutant le vrai texte.
7. **Les glyphes de la ligne de liste confondaient deux états.** `flame`
   servait l'éphémère ET la vue unique dans la même colonne, quand iOS
   distingue `timer` (éphémère) de `flame` (vue unique)
   (`LentilleConversationRow.swift:578-584`), et le nom de l'expéditeur, que
   `senderLabel` sert AVANT le glyphe sur les deux formes protégées, avait
   été retiré. Un nom n'est pas le contenu protégé.

**Le témoin de fuite interroge le DOM ENTIER, pas `innerText`** : une fuite
peut voyager dans un attribut (`title`, `alt`, `data-*`) qu'`innerText` ne
montre pas, et c'est le DOM qui est la surface de fuite du web (divergence 1).

Le chiffre de poids ci-dessus est celui d'APRÈS revue.

## D-24 · Le Résumé Vivant est RENDU — les trois lois vivent dans `src/lib/summary/`, la fenêtre partielle est une DONNÉE — 2026-09-08 (#5695)

D-21 posait trois conditions à l'entrée de `summary` au catalogue de rendu
web ; les trois sont tenues. `THREAD_RENDERABLE_MODES` (`decision.ts`) porte
désormais `['focal', 'script', 'summary']` — un inscrit à plus de 25
non-lus (ou absent > 24 h avec ≥ 10 non-lus) ouvre son fil sur le Résumé
Vivant, calculé LOCALEMENT depuis les messages déjà chargés, sans aucun
endpoint pour le digest lui-même.

**Domicile des trois lois — (A), PROVISOIRE (§9 question 1 de la
spécification).** `src/lib/summary/{episodes,digest,face-ramp,assembly,types}.ts`
transcrit `EpisodeSegmenter.swift` / `DeterministicDigestBuilder.swift` /
`FaceRampRanking.swift` ligne à ligne. COMPTÉ (revue, `bun test src/lib/summary/`) :
56 témoins purs — 13 segmentation (les 11 d'iOS + 2 sur le rang du cadrage),
19 digest (les 17 d'iOS + 2), 12 rampe (les 12 d'iOS), 12 assemblage — plus
9 témoins de RENDU (`living-summary.test.tsx`) et 3 de citation
(`composer.test.tsx`). Le chiffre « 40 des 52 » de la première rédaction
n'avait été compté nulle part. L'amendement A2
(`LivingSummaryModels.swift:4-9`, « pas de mirroir TypeScript ») a été pris
quand aucun second client TS n'existait ; la v3.1 en est un. Ce domicile
bascule en (B) — `packages/shared/utils/living-summary.ts` — quand un
second consommateur TypeScript (Android) lira ces lois ; une issue
`décision-produit` porte l'arbitrage.

**Le corpus « rattrapage » (`c-rattrapage`, `fixtures-catchup.ts`) déclare sa
fenêtre PARTIELLE.** `hasOlderMessagesOf(conversationId)` mime
`cursorPagination.hasMore` (`messages-list.ts:724,764-771`) — c'est la SEULE
source de `windowCoversUnread`, jamais un booléen posé à la main dans un
composant. `c-salon-riviere` garde `unreadCount: 3` : un corpus DISTINCT
pour chaque gate, jamais deux fixtures jumelles qui dériveraient l'une de
l'autre. `fixtures.ts` ayant franchi son budget de taille (1000-1200
lignes), le socle commun (`minutesAgo`, les cinq personnes, `message()`/
`translation()`, les défauts) a été EXTRAIT vers `fixtures-base.ts` — une
extraction PURE, `bun test` restant vert avant l'ajout du corpus.

**Neuf écarts déclarés, chacun à son site :**
1. Mentions par `parseMentions` (`packages/shared/utils/mention-parser.ts`,
   frontières Unicode), restreint au seul lecteur — amélioration de
   l'heuristique iOS (sous-chaîne `@username`), biais faux négatif conservé.
2. `MediaTally.links` compte les URL `https?://` du contenu — `trackedLinkMap`
   n'existe pas dans `@meeshy/shared` ; issue compagnon pour le porter au
   domaine. Rien n'affiche `media` cette itération (iOS non plus).
3. `DigestMediaKind.location` reste inatteignable depuis une pièce jointe
   réelle — `AttachmentType` partagé n'a pas ce cas.
4. Le chevron « avancer » des épisodes est `caretLeft` retourné par la classe
   `.glyph-forward` (`scaleX(-1)` en LTR, identité sous `:dir(rtl)`) — jamais
   un nom de côté physique dans un identifiant.
5. Tap ouvre le menu du chip (écart déjà assumé, `reading-mode-chip.tsx`).
6. `windowCoversUnread` mime `cursorPagination.hasMore` (ci-dessus).
7. Le cadrage des dates lit `READER_LOCALE` (rang 1 du Prisme,
   `reader.ts`) — jamais `navigator.language` seul (règle 2 du Prisme).
8. Le tap d'un visage de la Rampe PRÉ-ADRESSE le composeur : citation posée
   PAR LE PRISME (`served()`, jamais `content` brut) ET `replyToId` gravé à
   l'envoi.
9. Le panneau agent (`GET /conversations/:id/analysis`) est inobservable en
   source `fixtures` (aucun appel réseau, comme un invité) — même no-op
   silencieux qu'iOS. Type local minimal (`conversation-analysis.ts`) :
   `packages/shared` n'a pas de type pour cette route ; issue compagnon.

**Le dixième écart, non prévu par D-21 : le port n'utilise PAS `useQuery`.**
La spécification #5695 suggérait `@tanstack/react-query` (comme le port
lui-même le nomme). MESURÉ après implémentation : un second consommateur
lazy de `useQuery` (`progression.tsx` étant le premier) fait que Rollup
partage son code entre les deux chunks — et le `manualChunks` de
`vite.config.ts` force TOUT module `@tanstack/react-query` dans le chunk
`data`, référencé par `main.tsx` (`QueryClientProvider`), donc CRITIQUE.
`summary-host.tsx` appelle donc `loadConversationAnalysis` par un effet nu
(`useEffect`/`useState`), qui réplique le contrat utile (`enabled`/`retry:
false`, no-op silencieux sur erreur) sans le runtime partagé. Issue compagnon
à ouvrir : séparer le chunk `data` par point d'entrée avant qu'un troisième
consommateur lazy de `useQuery` ne reproduise le même défaut.

**LA MESURE DE POIDS, REFAITE EN REVUE — le chiffre de la première rédaction
n'avait pas de référence.** Elle citait « 32,71 Ko avant ce lot » sans qu'aucune
construction de l'arbre d'AVANT ne l'ait rendu (la valeur enregistrée,
29,79 Ko, était bien stale). La revue a construit l'arbre `HEAD` dans un
répertoire à part (mêmes `node_modules`, `packages/design-tokens` restauré à
`HEAD`) et mesuré : **33 415 o gzip -9, soit 32,63 Ko avant le lot ; 33 565 o,
soit 32,78 Ko après**, corrections de revue comprises — **+150 o (+0,15 Ko)**,
au-dessus de la tolérance de ±0,1 Ko que le critère de fin nommait. Le coût est
ENTIER dans la feuille GLOBALE (+134 o) et il est STRUCTUREL : Tailwind 4 émet
ses utilitaires dans l'UNIQUE feuille de l'application quel que soit le chunk
qui les pose (13 règles neuves : `-top-1`, `max-w-[48px]`, `min-h-11`,
`text-[10px]`…), et la table de jetons générée (`packages/design-tokens/ios.css`,
D-4) est globale par construction (5 déclarations neuves). Aucune feature
n'atteindra donc « première peinture inchangée » tant que la feuille n'est pas
découpée par point d'entrée — c'est CE découpage, pas l'inline-style au cas par
cas, qui est la suite à ouvrir. Le plafond du gate (`budgets.json first_paint.kb`
= 40) reste tenu avec 7,2 Ko de marge. Le chunk `summary` mesure 5,81 Ko, sous
son plafond de 7.

**Les jetons du Résumé (six littéraux Swift, `HORS_TABLE_IOS` /
`HORS_TABLE_PAR_SCHEMA` de `generate-from-ios.mjs`) vivent dans
`src/styles/summary.css`, PAS `ios.css`** — la même mesure de poids l'exige :
`ios.css` est importé PARTOUT, `summary.css` seulement par
`summary-skeleton.tsx` (statique dans le chunk du fil, lui-même lazy). Les
VALEURS restent générées (D-4) ; seule leur NOMINATION locale change de
domicile — un précédent pour toute future feature dont les jetons ne
servent qu'un chunk à la demande.

**Corrections de revue (2026-09-08), chacune avec son témoin :**
- **La ligne « Sur les N derniers messages » ne tenait pas AA.** `indigo500`
  en texte de 12 px vaut **4,45:1 en sombre, 4,47:1 en clair** — sous la barre
  de 4,5 que le gate pose déjà pour la citation. Le témoin ne pouvait pas le
  voir : son sélecteur `[data-summary] p` rendait le PREMIER `p`, la ligne de
  COMPTES (8,79:1) — un témoin qui ne mesure pas ce qu'il nomme. Sélecteur
  nommé (`[data-partial-window]`) et encre servie par `--color-day-ink`, le
  jeton GÉNÉRÉ (D-4, `MessageDaySeparator.swift`) que le dépôt sert déjà pour
  de l'indigo lisible dans les DEUX schémas : **13,34:1 en sombre, 7,9:1 en
  clair**. La teinte iOS reste juste sur un fond NOIR plein ; elle ne l'est pas
  sur les deux fonds du web.
- **« Reprendre le fil » n'était pas en bas.** `sticky bottom-4` seul ne colle
  que si le contenu DÉBORDE ; mesuré, `main.scrollHeight === clientHeight` et
  le bouton flottait 153 px au-dessus du composeur. `mt-auto` (+ `sticky`)
  reproduit le `VStack { Spacer(); … }` d'iOS ; témoin : la distance
  bouton→bas de la zone de lecture est bornée à 32 px.
- **La citation pré-adressée ne disait pas sa langue.** `served()` rend la
  PAIRE ; seul `text` voyageait jusqu'au composeur, donc un extrait résolu par
  le Prisme se prononçait avec la voix du document (cycle 122). `replyTo`
  porte `language`, le composeur pose `lang` — comme `bubble.tsx:180` et
  `focal-row.tsx:263`. Témoins : `composer.test.tsx` (écrit sur `en`, pas sur
  le rang 1) et le gate.
- **L'inset horizontal valait 30 px** (les 14 px de `<main>` + les 16 px du
  conteneur) contre 16 sur iOS : `px-0.5` rend exactement 16.
- **« 1 message t'attendent »** — le patron unique d'iOS ne s'accorde pas ; ce
  libellé n'a d'autre voix qu'un lecteur d'écran, il s'accorde ici.
- **L'indice d'épisode n'était pas prouvé** : le gate ne collectait que
  `aria-label`/`textContent`, jamais les `aria-describedby`, d'où un motif
  écrit en alternative avec « · » — vrai par le seul titre. Le gate résout
  désormais les descriptions.

**Ce qui reste, déclaré, pas oublié :** le curseur de lecture
(`markCaughtUpFromSummaryOrRiver`) n'a aucun transport web — issue `staging`
quand `POST …/read` sera câblé. Le troisième libellé de `catalog.ts` pour
`river` était inatteignable à l'écriture de cette entrée — **D-25 (#5696)
l'atteint** : `threadCapabilities` lit désormais `memberCount`, jamais
`null` fabriqué. Les coques (QEMU, simulateur) n'ont pas été rejouées avec
ce lot — le build Capacitor seul a été vérifié.

## D-25 · La loi de la Rivière est câblée : `memberCount` est l'éligibilité, `grantedModes` ⟂ `availableModes`, la raison a quatre formes — 2026-09-08 (#5696)

`threadCapabilities` (`decision.ts`) lit désormais `memberCount:
number | null` (obligatoire) et le passe à `resolveCapabilities` comme
`activeParticipantCount` — le même rapprochement qu'iOS
(`ConversationView.swift:569`, `memberCount ?? 0`) : ce n'est PAS un
décompte d'actifs (G-123, toujours absent), c'est l'effectif du groupe, un
faux POSITIF possible que la loi de forme absorbe elle-même (`river-lanes.ts`
sérialise sous trois voix). `isRiverFlagEnabled: true` est un LITTÉRAL, pas
une lecture de config — D-20 : la v3.1 n'a ni drapeau ni programme bêta.

`ThreadCapabilities` porte désormais DEUX catalogues, pour deux questions
distinctes : `grantedModes` (ce que la LOI accorde — `river` y entre dès
`memberCount >= 5`) et `availableModes` (`grantedModes ∩
THREAD_RENDERABLE_MODES` — ce que CET écran sait dessiner). `river` reste
listé au menu, désactivé, HORS `THREAD_RENDERABLE_MODES` — ce travail ne
rend rien à l'écran.

La raison Rivière du menu (`catalog.ts`) a désormais QUATRE formes, pas
trois : aux trois de la loi partagée (`neverEligible` / `belowThreshold` à
compte connu ou inconnu) s'ajoute une forme PROPRE au web —
« Bientôt disponible » — pour un groupe déjà ÉLIGIBLE que
`THREAD_RENDERABLE_MODES` ne rend pas encore. Sans elle, un groupe à 5
membres afficherait « S'ouvrira à 5 personnes actives — 5 aujourd'hui » —
une porte annoncée fermée alors que la loi l'a ouverte, exactement le
libellé FAUX qu'iOS montre quand `riviere_mode` est OFF sur un groupe
éligible (`ReadingModeLensSheet.swift:91-99`, un défaut de la cible, jamais
reproduit ici).

`src/lib/river/` porte désormais le `Core` de la Rivière — `geometry.ts`
(le mapping `Message` → loi, miroir de `RiverConversationMapping.swift`),
`columns.ts`/`focus.ts` (portés tels quels du legacy web, arithmétique pure
de pixels), `metrics.ts` (les cotes, dérivées de `lentille-tokens.json` →
`RiverMetrics.swift`, gardées par `scripts/check-river-metrics.mjs`, un
fichier À PART de `check-curve.mjs` parce que la Rivière a TROIS sources).
Les 61 vecteurs partagés (24 + 22 + 15) sont rejoués DEPUIS web-v2, À
TRAVERS le mapping — pas seulement la loi nue. L'ouverture du Salon
Rivière (`RIVER_OPENING_MESSAGES`, `fixtures-river-opening.ts`) est le corpus qui
ATTEINT les couloirs (`layout: 'lanes'`, `voiceCount: 9`) là où les 40
messages seuls (deux voix strictes) ne le peuvent pas — une page PLUS
ANCIENNE de la même conversation, servie aux seuls témoins de la loi
(`messagesOf`/`hasOlderMessagesOf` inchangés, D-24 : une page, pas une
fixture jumelle).

Ce travail n'ajoute AUCUN chunk et ne change PAS la première peinture
(mesuré : 32,78 Ko, identique à l'octet — `src/lib/river/**` n'est importé
par aucun module de production, et le paquet ne contient ni `resolveRiverLanes`
ni `SILENCE_WINDOW_LADDER_MS`). Le corpus d'ouverture, lui, PARTAIT : né
d'appels à `message()` au niveau du module, Rollup ne pouvait pas l'élaguer et
`dist/assets/reader-*.js` embarquait « riv-open » chez chaque lecteur. Il vit
depuis la revue-correction dans `fixtures-river-opening.ts`, module SANS
importateur de production — le chunk `reader` retombe de 11 736 à 11 092 o
gzip (mesuré). **Un corpus qu'aucune route ne sert ne doit jamais entrer dans
un fichier que le paquet atteint.** `river` reste hors `THREAD_RENDERABLE_MODES`
: le rendu de la Rivière (le plan virtualisé, D-15) est un travail séparé.

## D-26 · La liste et le fil lisent la passerelle : cache = forme du fil, `select` décode, `ApiResult` dans les ports, rollback à l'iOS, persistance par utilisateur — 2026-09-09 (#5650)

**Le périmètre, en une phrase** : UN adaptateur TanStack Query (`lib/api/query.ts`), UNE forme d'erreur (`ApiError`, `client.ts`), un rollback prouvé (`conversation-actions.ts`), une garde de session qui mord (`SessionGate`, câblée sur `appQueryClient`) — la source `fixtures` reste servie par le MÊME chemin (`apiConfig.source`).

**F1 — le cache tient la forme du FIL, `select` la DÉCODE.** La passerelle sert des chaînes ISO là où `@meeshy/shared` déclare `Date` ; un décodage dans `queryFn` seul serait défait par la persistance JSON. `lib/api/decode.ts` (`toDate`, `decodeConversation`, `decodeMessage`) est la fonction de MODULE que `select` référence — mémorisée par TanStack, idempotente sur une vraie `Date`.

**F2/F3 — un port par ressource, source-aware, en fabriques `{queryKey, queryFn, select}`.** `lib/api/conversations.ts` (`loadConversations`, `loadConversation`, `conversationsQuery`, `conversationQuery` — ce dernier pose `initialData` depuis la liste en cache) et `lib/api/messages.ts` (`loadMessages`, `messagesQuery` — renverse `createdAt DESC` du wire en ASCENDANT). `unwrap` (`client.ts`) reste le SEUL pont `ApiResult` → exception, pour que TanStack observe l'échec.

**F4 — les mutations de rangée suivent `ConversationStore.apply` d'iOS.** `conversation-actions.ts::performRowAction` : instantané → override optimiste (`conversationStore`) → appel (`preferences.ts`, en source `gateway` seule) → `completed` (2xx) ⇒ le cache prend la valeur CONFIRMÉE du corps de réponse et l'override est retiré (`clearOverride`, nouveau sur `conversation-store.ts`) ; `failedPermanent` (4xx) ⇒ rollback (override retiré, cache intact) ; `failedTransient` (réseau, 5xx) ⇒ l'override RESTE. Pas d'outbox ce tour — issue compagnon « file de reprise hors ligne des actions de rangée ».

**F5 — persistance par `dehydrate`/`hydrate`, restauration SYNCHRONE.** `lib/api/query-client.ts::createAppQueryClient` : hydrate depuis `localStorage` (clé `meeshy.query-cache`) AVANT tout rendu si le `buster` (`${__APP_VERSION__}:${userId ?? 'anonymous'}`) correspond, sinon purge ; `persist()` débouncé (250 ms) sur chaque écriture de cache, forcé sur `visibilitychange: hidden`/`pagehide` ; la session PURGE le cache dès que l'identité change (déconnexion ou changement de compte — garde D-6). **Ordre critique découvert en écrivant ce module** : les imports ES s'évaluent avant le corps de `main.tsx`, donc `sessionStore.getState().restoreSession()` doit tourner DANS `query-client.ts` avant de composer le `buster`, sinon un lecteur authentifié qui recharge verrait son cache persisté rejeté (buster `…:anonymous` construit avant restauration ≠ buster `…:<id>` du cache écrit à la session précédente) — la garde D-6 se déclencherait à tort. `main.tsx` importe désormais `appQueryClient` et a perdu son `new QueryClient` inline.

**F6 — le Prisme du lecteur vient de la session en source `gateway`.** `SessionUser` (session.ts) gagne `systemLanguage`/`regionalLanguage` (optionnels) et `customDestinationLanguage: string | null | undefined` (la charge servie porte `null` sur un compte sans destination personnalisée — `User.customDestinationLanguage` ne le déclare pas, un écart déjà présent ailleurs dans le dépôt). `lib/reader.ts::resolveReaderLanguages` et `lib/view/use-reader.ts::useReaderLanguages` (le hook, abonné aux TROIS PRIMITIVES séparément — jamais à `session.user` en bloc, leçon Prisme cycle 123) remplacent `READER_LANGUAGES`/`READER_LOCALE` dans `conversations.tsx`/`thread.tsx`.

**F7 — le scope du magasin de mode de lecture est dérivé du viewer.** `lib/reading-mode/scope.ts::readingModeScopeOf` (`u_<id>` ou `'local'`) remplace la constante `READING_MODE_SCOPE = 'local'` figée de `thread.tsx`.

**F8 — un id inconnu ne rouvre plus la première conversation.** `thread.tsx:94`'s repli `?? CONVERSATIONS[0]!` a disparu : `useThreadData(id)` rend `status: 'refused'` (`ApiError` 403/404) pour un id inexistant ou hors-membre, dans LES DEUX sources — `ThreadRefused` (nouveau, `components/thread-states.tsx`, D-6 : aucun titre, aucun compte de membres, même corps pour 403 et 404). `scripts/capture.mjs:27` visait `/c/c-equipe`, un id absent des fixtures — corrigé en `/c/c-deploiement`.

**F9 — aucune fixture dans le socle.** `query-client.ts` n'importe ni `fixtures.ts` ni les ports ; ils vivent dans les chunks de route. Mesuré : première peinture 34,87 Ko (était 32,78 avant ce lot — le coût de `dehydrate`/`hydrate` + la garde de session, sous le plafond de 40). `grep -c fixtures dist/assets/index-*.js` rend 1, PAS zéro — mais c'est le littéral `'fixtures'`/`'gateway'` de `resolveSource()` (`config.ts`, préexistant à ce lot), jamais une donnée : `grep -c "Amina\|Kwame\|Fatou\|u-viewer"` (des noms de personnes des fixtures) rend 0 dans `index-*.js` ET `core-*.js`. Le critère littéral de la spécification est trop large ; l'INTENTION (aucune DONNÉE de fixture dans le socle) est tenue.

### Le second bandeau de découverte : trois défauts de layout mesurés, jamais devinés

1. **Le rail d'accès rapide SAUTAIT** (`conversations.tsx`) : `conversations` vaut `[]` pendant le chargement, donc le rail (avatars 72 px) se peignait VIDE puis sautait à sa hauteur réelle une fois les données arrivées — ~98 px de saut mesuré par `check-gateway-build.mjs`. La hauteur est réservée par une TUILE FANTÔME (`RailPlaceholderTile`, la MÊME boîte rendue `visibility: hidden`), jamais par un `minHeight` écrit à la main — voir la revue-correction plus bas.
2. **Le squelette de liste ne portait aucun bandeau de section** alors que `LensSection` en rend un INCONDITIONNELLEMENT (`lens-sticker.tsx:100-104`, `<h2>` + `marginTop: lentilleTokens.list.row.marginVertical`) : ~32 px de saut résiduel. `SkeletonSectionStub` (`lens-skeleton.tsx`) reproduit la MÊME boîte (mêmes classes, mêmes tokens `lentilleTokens.list.sticker`, texte `visibility: hidden` plutôt qu'un calcul de hauteur de ligne inventé) — l'`offsetTop` de la première rangée est désormais IDENTIQUE au pixel près avant/après (259,25 = 259,25, mesuré après la revue-correction du rail — 271,25 avant, la différence étant les 12 px de slack que le `minHeight` codé en dur laissait).
3. **La scène de perspective du fil (`reading-mode/scene.ts::useThreadScene`) restait DÉFINITIVEMENT inerte** après un chargement transitoire : son effet lit `frame.current` une fois, au moment où l'effet s'exécute (`[frame, mode]`) ; pendant `status: 'pending'`, `<main ref={scroller}>` n'existe pas encore (F8 : plus de repli synchrone), donc l'effet bail-out sur `element === null` — et comme `mode` résout souvent à la MÊME valeur ('focal') avant et après le chargement, l'effet ne se rejouait JAMAIS. Mesuré : `check-reading-mode.mjs`, « après un défilement soutenu, exactement une rangée élue » ⇒ 0. Le hook prend désormais un paramètre `ready` que l'HÔTE déclare (`thread.tsx` passe `placed.length > 0`) : il RE-DÉCLENCHE l'effet au commit où le cadre apparaît, sans une seule image d'attente — voir la revue-correction plus bas.

### Le troisième bandeau : deux bogues de décodage trouvés en JOUANT LA RECETTE contre `gate.staging.meeshy.me` réel (compte `cible-web-trois`), pas sur les fixtures

La spécification demandait la recette manuelle « Chrome local ». Aucun outil de navigation interactive n'était disponible pour cette session, donc la recette a été rejouée par un script Playwright piloté (`bunx vite --port 5173` avec `VITE_DATA_SOURCE=gateway`, proxy réel vers `gate.staging.meeshy.me`) — connexion réelle, cache réel, DOM réel :

- **`Conversation.lastMessage` est parfois `null` EXPLICITE**, pas seulement absent — une conversation du compte cible n'a aucun premier message. `decodeConversation` ne gardait que `undefined` ⇒ `decodeMessage(null)` levait sur `raw.sender`, et **l'écran de liste ENTIER tombait en erreur pour la présence d'UNE SEULE conversation vide** (« Cannot read properties of null (reading 'sender') », capturé à l'écran). `previewKindOf` (`lib/view/conversation.ts`) portait le MÊME défaut, préexistant à ce lot mais jamais atteint tant que les fixtures ne servaient que des `lastMessage` définis. Les deux gardent désormais `null` au même titre que `undefined`.
- **`Message.translations` est ABSENT sur l'aperçu embarqué** (`Conversation.lastMessage`, `GET /conversations`) alors que `@meeshy/shared` le déclare `required` — ce type décrit le `Message` COMPLET (`GET …/messages`), pas l'aperçu allégé. `decodeMessage` faisait `raw.translations.map(...)` sans garde ⇒ même défaut, même symptôme. Fixé (`raw.translations ?? []`), et `sender.lastActiveAt` reçoit la même garde `null`/`undefined` par précaution (mesuré ABSENT sur l'aperçu, `null` probable ailleurs sur ce compte).

**La leçon commune, au-delà des deux correctifs** : un TYPE partagé qui déclare un champ `required` décrit la forme COMPLÈTE d'un objet ; une passerelle qui EMBARQUE une projection allégée de ce même type (ici `Conversation.lastMessage`) ne respecte pas cette promesse, et rien au compilateur ne le signale — seul un appel RÉEL contre des données RÉELLES l'a révélé. Les fixtures, qui ne construisent QUE des `Message` complets via `message()`, ne pouvaient PAS lever ce défaut : c'est structurellement un angle mort des témoins `bun test`, jamais réductible à « écrire plus de cas ».

Preuve de la recette (compte `cible-web-trois`, id `6a9fa8396248cfa007f2ab16`), après les deux correctifs : `/` sans session ⇒ `/login`, zéro requête `/api/v1/conversations` ; connexion réelle (`POST /auth/login` 200) ⇒ `/` liste RÉELLEMENT 10 conversations du compte (le compte en porte 10 aujourd'hui, pas 9 — `targets/seed.md` a dérivé depuis sa rédaction, à mettre à jour par une session ultérieure), « Voyage Lisbonne » (épinglée) en tête ; ouvrir le Salon Rivière (`/c/6a9fb2ec6248cfa007f2b198`) rend RÉELLEMENT le Résumé Vivant (26+ non-lus sur ce compte ⇒ D-21) avec les VRAIS comptes (« 40 messages · 2 personnes ») — comportement CORRECT, pas un défaut : le fil s'ouvre en Focal seulement sous le seuil de non-lus. `PUT /user-preferences/conversations/:id` (épingler/désépingler) et le refus 403 `'Not a member of this conversation'` sur un id étranger ont été rejoués en direct par requête HTTP nue (hors navigateur, pour ne pas re-solliciter `/auth/login` sous limite de débit) et confirment exactement les corps que `conversation-actions.test.ts` bouchonne.

**Ce qui n'a PAS pu être mesuré ce tour** : le geste « bloquer `/user-preferences/*` puis épingler » et le rechargement `⌘R` observés à l'œil dans un Chrome INTERACTIF (aucun poste de navigation graphique disponible pour cette session — la recette a tourné par script Playwright, équivalent fonctionnel mais pas un Chrome ouvert par un humain) ; la connexion RÉPÉTÉE au compte de recette a franchi la limite de débit de `POST /auth/login` sur `gate.staging.meeshy.me` après le quatrième essai (429), ce qui a borné le nombre de scénarios rejouables dans CETTE session — une session ultérieure dispose d'un jeton encore valide 24 h (voir le commentaire de `http.ts::DEFAULT_TIMEOUT_MS`) si elle a besoin de continuer sans se reconnecter.

### Le délai de garde (§7.3) — MESURÉ, pas deviné

`GET /conversations` : 1,662 / 1,668 / 1,857 / 1,634 / 1,516 s (5 tirs, compte `cible-web-trois`) — p95 (5e tir) 1,516 s, pire cas observé 1,857 s. `GET /conversations/:id` : 0,298-0,320 s. `GET …/messages?limit=50` : 0,603-0,694 s. Règle retenue : `p95 × 3 < 15 000 ms` ⇒ `DEFAULT_TIMEOUT_MS` reste `15_000` (5,6 s de marge sur le pire cas mesuré) ; le doc-comment de `http.ts` a perdu « PROVISOIRE ».

### ETag / 304 — laissé au navigateur, aucun code écrit

`GET /conversations` sert `Cache-Control: private, no-cache` + `ETag` (`core-list.ts:906`) : c'est le NAVIGATEUR qui pose `If-None-Match` sur la requête suivante et sert 200 depuis SON cache HTTP sur un 304 — le transport (`http.ts`) ne pose jamais `If-None-Match` lui-même (un 304 SANS CORPS rendrait `envelope.success !== true`, donc un échec). Rien à câbler ; noté ici pour que ce ne soit pas redécouvert.

### Ce qui reste, décidé HORS PÉRIMÈTRE (issues compagnon)

- **Pagination** (liste `limit`/`offset`, fil `before`) — `lentille.md` écart 10, ce tour sert une seule page (30 conversations / 50 messages).
- **`?languages=`** sur le fil (opt-in bande passante) — le seed est monolingue, la clé de requête devrait porter le prisme.
- **Écriture serveur de D-10** (`pushPreference`, mode de lecture) — le scope de session (F7) en est le prérequis, livré ici ; l'écriture reste un travail à part.
- **`consumeViewOnce` côté `gateway`** — `consume()` (`thread.tsx`) écrit le cache local pour la session courante ; la confirmation serveur (`lib/api/view-once.ts`) et le refetch sont un travail séparé.
- **File de reprise hors ligne des actions de rangée** — un 4xx défait déjà l'optimiste (prouvé), un `failedTransient` le garde SANS le rejouer (pas d'outbox web ce tour, contrairement à iOS).
- **`GET /me` au démarrage** pour rafraîchir une session restaurée SANS les trois langues (persistée avant ce lot) — le lecteur provisoire sert de repli, la prochaine connexion les écrit.
- **`targets/seed.md` a dérivé** : le compte `cible-web-trois` porte 10 conversations sur staging aujourd'hui, pas 9 (une seconde « Salon Rivière » sans premier message, née d'une session parallèle) — à corriger par la prochaine session qui touche ce document, pas par ce lot.

### La revue-correction de D-26 (2026-09-09) — sept défauts pris sur le diff, avec leur témoin

1. **`messagesQuery` re-décodait toute la page à CHAQUE rendu, et rendait une référence NEUVE.** Sa `select` était une lambda écrite EN LIGNE dans la fabrique : `useBaseQuery` rappelle `observer.getOptimisticResult(options)` à chaque rendu et `QueryObserver#createResult` ne réutilise son résultat mémorisé que si `options.select === this.#selectFn` (`query-core/queryObserver.js:219`). Le partage structurel ne rattrapait rien — `replaceEqualDeep` compare les `Date` par IDENTITÉ, et décoder une chaîne ISO en fabrique une nouvelle à chaque passage. `threadData.messages` changeait donc d'identité à chaque rendu, ce qui défaisait `useMemo`, `place()` et toute la mémoïsation du fil VIRTUALISÉ, à 60 images par seconde de défilement. `decodeMessagesPage` est désormais une fonction de MODULE, comme `decodeConversations` l'était déjà. **Le témoin ne tombe que sur la source `gateway`** (`messages.test.ts` § « identité du résultat entre deux rendus ») : en `fixtures`, `toDate` rend la MÊME instance de `Date` et le partage structurel masque le défaut — un corpus qui ne peut pas faire échouer un test ne peut pas le valider.

2. **Le seau `api` du service worker n'était purgé par RIEN** (D-6). Câbler la passerelle a fait entrer, pour la première fois, des réponses `/api/**` dans le `runtimeCaching` de VitePWA (NetworkFirst, 200 entrées, SEPT jours) et des médias dans `medias` (trente jours) : la liste et les messages d'un lecteur vivent désormais sur le DISQUE, resservis dès que le réseau dépasse trois secondes ou tombe. Le `buster` par identité protégeait soigneusement le cache TanStack et son entrée `localStorage`, et laissait ces seaux-là intacts — la liste du compte PRÉCÉDENT restait servable au compte suivant sur le même appareil. `purgeReaderCaches` (`query-client.ts`) les supprime sur le MÊME signal d'identité ; le seau de précache (le shell, identique pour tous) survit. *« Une protection de contenu se mesure sur tout ce que la charge TRANSPORTE »* — CLAUDE.md § Prisme, cycle 125.

3. **La garde de construction de `VITE_DATA_SOURCE` faisait DEUX travaux, un seul a été rendu.** Celle de #5605 refusait `gateway` parce que la valeur n'était pas câblée ; elle refusait AUSSI, sans le dire, toute valeur INCONNUE. `resolveSource` (`config.ts:79-81`) rend `fixtures` pour tout ce qui n'est pas exactement `gateway` : après sa suppression, `VITE_DATA_SOURCE=gatway` construisait en silence un déploiement de PRODUCTION servant des FIXTURES. La garde est réécrite avec son nouveau sens (`fixtures` | `gateway` | absente), et le doc-comment de `VITE_READING_MODES` — qui CITE cette garde comme précédent — redevient vrai.

4. **`decodeMessage` levait sur `replyTo: null` et RECOPIAIT les `null` qu'il croyait retirer.** La garde `null` posée sur `Conversation.lastMessage` était derrière un `{ ...raw }` : l'étalement REPOSAIT la clé à `null`, que la garde conditionnelle ne pouvait plus retirer — et aucun témoin ne le prouvait (retirer la garde laissait la suite verte). Le porteur JUMEAU, `Message.replyTo`, décodé par le même appel récursif dans la même expression, n'était pas gardé du tout : `replyTo: null` (la forme servie quand le message cité a disparu — `sender: replySender ? … : null`, `messages-list-query.ts:718-745`, prouve que ce `null` existe dans cette charge) faisait tomber le fil ENTIER. Les trois porteurs (`lastMessage`, `replyTo`, `sender`) sont maintenant DÉFAITS de la source avant recomposition : la clé est absente, jamais `null`, et aucune vue n'a plus à connaître un troisième état que son type ne déclare pas. Trois témoins dans `decode.test.ts`.

5. **L'échec de la liste s'annonçait « Chargement des conversations »** : `aria-busy` était posé sur `list.data === undefined`, donc AUSSI sur l'échec — un `role="alert"` à l'intérieur d'une région occupée n'est pas annoncé. `loading` (cache vide ET pas d'erreur) gouverne désormais l'annonce ; témoin dans `check-gateway-build.mjs`.

6. **`RAIL_HEIGHT = 130` creusait un trou de 118 px sur le premier écran d'un nouvel arrivant** et laissait 12 px de slack permanent quand le rail était plein (mesuré : `offsetTop` 271,25 avec la cote codée en dur, 259,25 avec la tuile fantôme). Un compte sans conversation, ou dont tout est archivé, ne peint plus de rail du tout — ni région étiquetée vide pour le lecteur d'écran, ni bande blanche. Deux témoins dans `check-gateway-build.mjs`, tous deux falsifiés contre l'ancien code.

7. **Trois états dessinés étaient ÉPARPILLÉS sur toute la hauteur** (`ListError`, `ThreadRefused`, `ThreadError`) : `grid flex-1 place-items-center` centre chaque enfant DANS SA RANGÉE et répartit les rangées implicites sur la hauteur — icône en haut, titre au tiers, bouton en bas. `content-center` les tasse. Et `ListError` affichait `error.message`, c'est-à-dire la CHAÎNE PLATE de la passerelle (« Internal server error ») : de l'anglais technique sur le premier écran d'un lecteur francophone, avec le risque d'y voir passer un nom d'interne. Une phrase de PRODUIT la remplace, comme iOS (`ConversationListView.swift:1761-1793` sert un sous-titre fixe, jamais l'erreur brute).

**Deux points restés ouverts, hors de ce diff :** `useThreadScene` reçoit son signal d'attache par un paramètre `ready` déclaré par l'hôte plutôt que par une boucle `requestAnimationFrame` — celle-ci se reprogrammait SANS BORNE (son propre doc-comment la disait « bornée ») et tournait à 60 Hz pour rien sur un fil REFUSÉ, un état TERMINAL où le cadre n'apparaîtra jamais. Et `otherUnread` (`thread.tsx`) OBSERVE le cache partagé (`useConversationsSnapshot`, `enabled: false` — jamais une requête de plus) au lieu d'en prendre un instantané au premier rendu : sur un lien direct vers `/c/:id`, où le cache est encore vide, le compteur restait à zéro pour toujours.

## D-27 · Un lien profond charge la coquille mais casse ses propres actifs — la base RACINE pour les deux variantes — 2026-09-09 (#5725)

> **Le corps ci-dessous est le PREMIER état de cette décision, conservé tel
> quel. Son correctif — une balise `<base href="/">` — a été RENVERSÉ le même
> jour en revue (#5812) : il réparait les actifs et cassait toutes les URL
> réduites à un fragment. Lire le « Complément 2026-09-09 bis » en fin de
> section avant de s'y fier.**

Le travail « lien profond vers un fil » (#5725) partait d'un diagnostic
hérité et FAUX : le commentaire de `vite.config.ts` affirmait que la coque
Capacitor « charge le bundle depuis le système de fichiers » et qu'un chemin
absolu « casserait » — d'où la base relative (`./assets/…`) de la variante B.
Lire les sources RÉELLES de `@capacitor/android` 8.5.1 (`WebViewLocalServer.java`,
champ `html5mode`, VRAI par défaut) et `@capacitor/ios` 8.5.1 (`Router.swift`,
`CapacitorRouter.route(for:)`, INCONDITIONNEL) montre que les DEUX coques
servent déjà nativement `index.html` pour tout chemin sans extension : `/c/<id>`
n'est PAS un 404 natif, et les deux coques servent une origine VIRTUELLE
(`https://localhost/…` Android, `capacitor://localhost/…` iOS), jamais un
`file://` littéral — le motif « chemins absolus casseraient » ne décrit rien
de ce mécanisme.

**Le vrai défaut est un cran plus bas.** `index.html` écrit ses actifs en
chemins RELATIFS (`./assets/x.js`) ; servi en réponse à une navigation
DIRECTE vers `/c/<id>` (lien profond, restauration, App Link), le NAVIGATEUR
résout `./assets/x.js` contre le chemin NAVIGUÉ — `https://localhost/c/assets/x.js`,
qui n'existe pas. `index.html` arrive (corps non vide, quelques centaines
d'octets), son script JAMAIS : une coquille inerte, jamais le fil. Mesuré
empiriquement (Playwright + serveur qui rejoue le repli html5mode) : SANS
correctif, `#root` monte 0 enfant et 4 requêtes d'actifs échouent en 404 ;
AVEC, `#root` monte son arbre complet et le fil rend (bodyLen 31 → 25 325).
Confirmé une seconde fois sur le vrai AVD `Meeshy_Poc_Web-v31` (APK debug,
`location.href = '/c/c-deploiement'` piloté par CDP réel via le socket
`webview_devtools_remote_*`) : le fil rend intégralement (Amina Diallo, le
message cité, le composeur) et sur le simulateur iOS dédié `Meeshy Poc-Web-V31`
(build Xcode réel de la coque, capture jointe `targets/shells.avd-deeplink.png`
côté Android — la preuve iOS est la même mécanique, `Router.swift`
inconditionnel, qui ne dépend d'aucun drapeau).

**La décision : une balise `<base href="/">`, injectée UNIQUEMENT dans le
build `MEESHY_TARGET=capacitor` (`vite.config.ts` § `capacitorBaseHref`),
jamais un changement de la `base` globale de Vite.** Elle fixe la résolution
de TOUT le document sur la racine, quel que soit le chemin navigué, sans
réécrire un seul `href`/`src` généré par Vite — le contrat « actifs en
chemins relatifs » que `check-shell-dist.mjs` garde reste vrai ailleurs dans
le document ; l'audit retire désormais cette seule balise avant de juger le
reste (elle est l'UNIQUE href absolue tolérée, et sa présence — exactement
`href="/"`, une fois — est elle-même un critère du gate). Variante A (web)
n'y touche pas : sa base est déjà absolue (`/`), donc déjà correcte pour tout
chemin navigué — la garde `forCapacitor` isole le changement, prouvé par la
mesure de poids inchangée (34,96 Ko avant premier pixel, aucun `<base>` dans
`dist/index.html`).

**Ce que ça ne règle PAS, et qui reste hors de ce travail.** L'ENTRÉE native
du lien profond — Universal Links (iOS, `CFBundleURLTypes`/associated
domains) et App Links (Android, `<intent-filter>` dans `AndroidManifest.xml`)
— n'existe encore sur AUCUNE des deux coques (vérifié : aucun schéma, aucun
filtre déclaré). Ce travail répare la MOITIÉ « une fois que le WebView est
pointé sur `/c/<id>`, le fil rend » ; la moitié « comment le système
d'exploitation pointe le WebView là-dessus » (gérer l'intent/l'activity
Android, `scene(_:continue:)`/`application(_:continue:)` iOS, puis appeler
`location.href` ou le routeur JS) est un travail SÉPARÉ, à ouvrir en issue
compagnon — sans lui, un App Link réel ne parvient toujours pas jusqu'au
WebView, même si celui-ci sait désormais correctement répondre une fois
atteint.

**Complément 2026-09-09 (#5812) — ce que ce point d'étape affirmait de trop,
et ce qui le corrige.**

1. **La capture citée ci-dessus (`targets/shells.avd-deeplink.png`) n'a
   jamais existé** (`ls targets/ | grep shell` vide, `git status` propre au
   moment de l'écrire) — une absence DÉDUITE écrite comme si elle était
   mesurée. Les preuves de coque de ce travail vivent HORS dépôt
   (`<racine>/.cache/web-v2-workflow/recette/`, produites par
   `scripts/shell-deeplink-probe.mjs`) et sont JOINTES à l'issue plutôt que
   versionnées : `targets/` reste réservé aux captures iOS NATIVES drapeaux
   ON (`targets/captures.md`), jamais aux captures de la coque testée.
2. **« La preuve iOS est la même mécanique » était une DÉDUCTION, pas une
   MESURE — et la mesure a trouvé une ASYMÉTRIE que la déduction ne pouvait
   pas voir.** `capacitor.config.ts` expose `resolveCapacitorConfig(env)`,
   qui pose `server.appStartPath` (clé Capacitor ≥ 7.3 TYPÉE,
   `@capacitor/cli/dist/declarations.d.ts:617`) sous
   `MEESHY_SHELL_START_PATH` — un paramètre de RECETTE, jamais posé au
   déploiement. **Côté Android, ça marche tel quel** : `Bridge.java`
   (`appUrl += appUrlPath`) ne fait qu'une concaténation de chaîne, ensuite
   servie par le même repli `html5mode` que toute autre navigation — mesuré
   sur l'AVD `Meeshy_Poc_Web-v31`, l'app démarre directement dans « Équipe
   déploiement ». **Côté iOS, `appStartPath` seul CRASHE la coque** :
   `CAPBridgeViewController.loadWebView()` (`@capacitor/ios` 8.5.1) garde
   `FileManager.default.fileExists(atPath: bridge.config.appStartFileURL.path)`
   — un chemin de FICHIER LITTÉRAL sous `public/` — et appelle
   `fatalLoadError()` (`exit(1)`, un arrêt PROPRE, donc AUCUN rapport de
   crash dans `CrashReporter`) si rien n'existe à cet exact chemin, AVANT
   même d'atteindre `Router.swift` — dont le repli SPA (`route(for:)`,
   toujours actif sur toute navigation POST-chargement) n'entre jamais en
   jeu pour CE premier chargement. Reproduit sur le simulateur
   `Meeshy Poc-Web-V31` : `⚡️ ERROR: Unable to load …/App.app/public//c/c-deploiement`,
   process disparu sans écran. Un placeholder local (fichier vide sous
   `ios/App/App/public/c/c-deploiement`, jamais commité — `ios/.gitignore`
   généré exclut déjà `public/`, régénéré par `cap sync` à chaque
   synchronisation) suffit à satisfaire la garde ; `Router.swift` réécrit
   ensuite CE chemin vers `/index.html` sans jamais lire le placeholder.
   **`MEESHY_SHELL_START_PATH` reste donc un paramètre de recette
   ASYMÉTRIQUE : autonome sur Android, il exige un placeholder manuel sous
   iOS avant chaque recette — une limitation de `@capacitor/ios` 8.5.1 pour
   un `appStartPath` de route CLIENT (jamais un fichier réel), non
   documentée en amont.** La preuve simulateur, une fois le placeholder posé,
   est un chargement direct RÉEL (capture jointe, thread « Équipe
   déploiement » rendu en schéma clair) — plus une inférence depuis le seul
   comportement Android.
3. **L'audit ne prouvait, avant ce complément, que « non vide » — pas
   « le fil ».** Mesuré : un écran REFUSÉ (D-6, `bodyLen 1627`) et un écran
   INTROUVABLE (`NotFound`, `bodyLen 479`) passaient tous deux le seuil
   `bodyLen > 0 && #root non vide`. `readDeepLinkSnapshot()` /
   `auditDeepLinkPage(snapshot, { expect })` (`scripts/check-shell-dist.mjs`)
   exigent désormais la preuve POSITIVE (`main#contenu` + `textarea`, repères
   structurels du fil, `src/routes/thread.tsx:730-731`,
   `src/components/composer.tsx:122`) pour `expect: 'thread'`, et la preuve
   NÉGATIVE (`!hasThreadMain`) pour `expect: 'refused'` — un id inconnu doit
   monter le refus, jamais le fil (D-6). `auditDeepLink()` joue désormais
   LES DEUX cas (`/c/c-deploiement` et `/c/zzz-inconnu`) sur le même dist
   servi.
4. **Ce qui reste séparé, avec ses issues :** l'entrée système (Universal
   Links iOS / App Links Android, #5819) ; la cible d'un lien profond perdue
   quand `SessionGate` redirige vers `/login` (#5820) ; le prérendu
   institutionnel qui ignore `--outDir` — SOLDÉ au « Complément ter »
   ci-dessous (#5821, la lecture en dur de `../dist` ne demeure plus).

**Complément 2026-09-09 bis (revue #5812) — le correctif de D-27 réparait les
actifs et cassait toutes les autres URL relatives : la `base` de Vite, jamais
une balise `<base>`.**

1. **Mesuré sur le dist de la coque, Chromium réel, repli SPA :** avec
   `<base href="/">`, depuis `/c/c-deploiement`, le lien d'évitement
   `<a href="#contenu">` de `src/components/shell.tsx` — le PREMIER contrôle
   du clavier, présent sur CHAQUE écran — résolvait vers
   `http://…/#contenu` ; l'activer QUITTAIT le fil pour la liste
   (`hasThreadMain: true → false`, `hasComposer: true → false`). Une balise
   `<base>` déplace la résolution de TOUTE URL relative du document, et les
   URL réduites à un fragment en font partie (elle atteindrait demain
   `<use href="#…">`, `url(#filtre)`, toute ancre de page). Le défaut ne
   frappait que les deux coques, jamais le web : exactement la divergence que
   la variante B existe pour éviter.
2. **Le correctif retenu est la BASE elle-même** : `base: '/'` pour les deux
   variantes (`vite.config.ts`). Le motif « des chemins absolus casseraient »
   décrivait un `file://` que D-27 avait déjà réfuté — les deux coques
   montent une origine VIRTUELLE À LA RACINE (`https://localhost/…`,
   `capacitor://localhost/…`), donc `/assets/x.js` résout correctement quel
   que soit le chemin navigué, exactement comme en variante A. D-27 avait
   conservé la base relative pour ne pas contredire la clause 1 de
   `check-shell-dist.mjs` — c'est-à-dire pour préserver la garde d'une
   contrainte que la même décision venait de démontrer inexistante.
   `auditShellDist` affirme désormais l'inverse : actifs root-absolus, AUCUNE
   balise `<base>`.
3. **Le gate ne pouvait pas voir ce défaut** : il NAVIGUAIT sans jamais
   ACTIVER un contrôle. `readDeepLinkSnapshot` rapporte désormais l'URL
   RÉSOLUE du lien d'évitement et l'URL du document ; `auditDeepLinkPage`
   refuse, pour les deux attentes, un lien d'évitement qui quitte l'écran
   chargé. Trois témoins falsifiés (clause `<base>`, clause d'évitement sur
   le fil, la même sur le refus).
4. **La sonde de recette ne fonctionnait pas.** `shell-deeplink-probe.mjs`
   passait par `chromium.connectOverCDP()` : contre la WebView Android
   (Chrome 133) la poignée de main échoue — « Protocol error
   (Browser.setDownloadBehavior): Browser context management is not
   supported », une WebView exposant une cible `page` et jamais un navigateur
   complet. Réécrite en CDP BRUT sur le `webSocketDebuggerUrl` de la page
   (aucune dépendance), elle rend l'instantané et la capture. Un outil de
   recette qu'on ne lance pas est un contrôle inerte de plus.
5. **La garde de `MEESHY_SHELL_START_PATH` portait sur une ROUTE** (`/c/…`) ;
   elle porte désormais sur la FORME : `/` initial simple (Android
   `Bridge.java` concatène sans séparateur) et AUCUNE extension de fichier
   (iOS ne réécrit vers `index.html` que les chemins sans extension,
   `CapacitorRouter.route(for:)`). Les 40+ surfaces à porter emploieront la
   même recette sans modifier ce fichier LIVRÉ.
6. **`capacitor.config.ts` et son témoin sont entrés dans `tsc --noEmit`** :
   `tsconfig.json` n'incluait que `src`, `vite.config.ts` et `scripts` — le
   fichier venait d'acquérir de la logique et un témoin, tous deux hors du
   type-check. Falsifié (une annotation fausse fait rougir le gate).

**Preuves de coque, avec la base racine** — AVD `Meeshy_Poc_Web-v31`, APK
debug, CDP réel : `/c/c-deploiement` → `hasThreadMain: true`,
`hasComposer: true`, `skipLinkTarget: https://localhost/c/c-deploiement#contenu`
(il RESTE sur le fil) ; `/c/zzz-inconnu` → refus (D-6). Simulateur
`Meeshy Poc-Web-V31` (54438823), build Xcode réel, `MEESHY_SHELL_START_PATH`
+ placeholder iOS : la coque démarre directement dans le fil. Captures hors
dépôt (`<racine>/.cache/web-v2-workflow/recette/`), jointes à l'issue.

**Complément 2026-09-09 ter (revue #5812) — le prérendu institutionnel
écrivait dans la sortie de L'AUTRE variante ; le gate ne pouvait pas le voir
parce qu'il ne regarde que le document racine, jamais les pages qu'il a fait
écrire à côté (SOLDE #5821).**

1. **Mesuré, sans aucune dépendance à un dist stale :** `MEESHY_TARGET=
   capacitor bunx vite build --outDir dist-probe-review` produisait un
   `dist-probe-review/` SANS `about/`, `contact/`, `partners/`, `privacy/`
   ni `terms/` — les cinq pages atterrissaient dans `dist/` (l'autre
   variante, pas reconstruite par cette commande), dont le `about/index.html`
   ressortait avec la date de mtime d'un build ANTÉRIEUR à celui qui venait
   de tourner. `scripts/prerender-institutional.tsx:44` lisait
   `join(HERE, '../dist')` inconditionnellement ; le greffon qui l'invoque
   (`vite.config.ts`, `prerenderInstitutionalPages`) tourne pour LES DEUX
   variantes, sans jamais lui dire où le build en cours écrit réellement.
2. **Le correctif est un site UNIQUE de résolution, jamais deux lectures
   indépendantes de `--outDir`.** `scripts/lib/resolve-dist-dir.mjs`
   (`resolveDistDir(here, argv)`, PURE, témoin sans build) décide : un
   troisième `argv` non vide gagne, sinon repli `../dist`. Le greffon capture
   `config.build.outDir` par `configResolved` et le relaie en argument de
   ligne de commande au script préchauffé (`spawnSync(…, [
   'scripts/prerender-institutional.tsx', dist])`) — la même donnée que Vite
   a déjà résolue, jamais redevinée côté script.
3. **Le gate ne pouvait pas voir ce défaut** : ses quatre clauses portent
   toutes sur `index.html` et la liste des fichiers du dist audité, mais
   aucune ne vérifiait que les pages institutionnelles S'Y TROUVENT — un
   `dist-capacitor/` totalement dépourvu d'`about/index.html` passait les
   quatre. `auditShellDist` (`scripts/check-shell-dist.mjs`) gagne une
   cinquième clause : les cinq routes de `INSTITUTIONAL_ROUTES`
   (`scripts/lib/institutional-routes.mjs`) doivent apparaître en SUFFIXE
   (`${route}/index.html`) dans la liste des fichiers du dist audité — un
   dist auquel il manque une seule page nomme précisément celle-là, jamais
   un « quelque chose manque » vague. Trois témoins ajoutés
   (`check-shell-dist.test.ts`) : zéro page présente, une seule absente, les
   cinq présentes — plus quatre témoins pour `resolveDistDir` (absence
   d'argument, `argv` court, argument explicite relatif/absolu, chaîne vide
   qui ne doit PAS déguiser une absence).
4. **Vérifié sur le dist réel, pas seulement sur les fonctions pures** :
   `node scripts/check-shell-dist.mjs` lancé SEUL dans un arbre SANS `dist/`
   préexistant (le scénario que #5821 nommait) passe désormais — la
   construction `--outDir dist-capacitor` qu'il pilote écrit ses cinq pages
   au bon endroit du premier coup, la cinquième clause le confirme, et
   `dist-capacitor/` reste effacé derrière lui. La variante A
   (`bun run build`, sans `--outDir`) continue de recevoir ses cinq pages
   dans `dist/`, inchangée.

**Complément 2026-09-12 (#6027) — la garde qui LEVAIT pour iOS cède la place
à un mécanisme : la coque iOS SERT `MEESHY_SHELL_START_PATH`, comme Android.**

1. **Le défaut résiduel, mesuré.** L'asymétrie du complément bis ci-dessus
   (« autonome sur Android, il exige un placeholder manuel sous iOS ») avait
   été refermée en apparence par une garde qui LEVAIT systématiquement pour
   `MEESHY_SHELL_SYNC_TARGET=ios` (revue #5774) — un refus sûr, mais qui
   rendait `bunx cap sync ios` avec ce paramètre TOUJOURS indémarrable, plutôt
   que de le rendre possible. Le critère de #6027 demandait l'un OU l'autre
   (servir, ou refuser en NOMMANT la cause) ; ce lot livre la forme « sert ».
2. **Le mécanisme retenu : un hook Capacitor, pas une classe Swift.**
   `CAPBridgeViewController.loadWebView()` est `public final` (`@capacitor/ios`
   8.5.1, lu) — aucune sous-classe ne peut intercepter sa garde
   `FileManager.fileExists`. `scripts/shell-start-path-hook.mjs` déclare
   quatre scripts npm (`capacitor:copy:before`, `capacitor:copy:after`,
   `capacitor:sync:before`, `capacitor:sync:after` — lus par
   `@capacitor/cli/dist/common.js::runPlatformHook` depuis le `package.json`
   de la racine du paquet) et pose le placeholder littéral sous
   `ios/App/App/public/<chemin>` APRÈS que `copyWebDir` (`tasks/copy.js`,
   `remove(nativeAbsDir)` puis `copy`) a réécrit ce dossier — le même effet
   que `Bridge.java` sur Android, obtenu autrement.
3. **Pourquoi QUATRE clés pour DEUX phases, mesuré sur le VRAI code de la
   CLI.** `sync()` (`tasks/sync.js`) enveloppe son appel à `copy()` dans un
   `try { … } catch (e) { logger.error(e) }` — une erreur levée PAR un hook
   `capacitor:copy:*` pendant `cap sync` est donc AVALÉE (code de sortie 0
   quand même). `capacitor:sync:before` et `capacitor:sync:after`, eux, sont
   appelés directement dans `sync()`, HORS de ce `try/catch` : une levée y
   remonte jusqu'à `syncCommand`, qui l'escalade en `FatalException`
   (`errors.js::fatal`) — code de sortie non nul. Le refus (cible déclarée ≠
   plateforme réellement synchronisée, fournie par `CAPACITOR_PLATFORM_NAME`)
   vit donc en phase `before`, où `sync:before` le rend LOUD ; le placement
   vit en phase `after`, où `copy:after` le fait tôt (juste après l'écriture
   de `public/`) et `sync:after` le REJOUE (idempotent) — si la première pose
   avait échoué en silence sous `copy:after`, la seconde le REMONTE. Les deux
   clés `copy:*` restent nécessaires pour `cap copy` employé SEUL (qui
   n'exécute jamais les hooks `sync:*`). Mesuré en direct (`bunx cap sync
   android` sans variable : quatre lignes `skip` ; `MEESHY_SHELL_SYNC_TARGET=ios
   bunx cap sync android` avec la variable posée : refus en `sync:before`,
   AVANT toute écriture, RC 1 ; `bunx cap sync ios` avec la variable et la
   cible alignées : placeholder posé par `copy:after`, confirmé « déjà
   présent » par `sync:after`, RC 0 ; `bunx cap sync ios` SANS variable
   ensuite : `public/` réécrit par `copyWebDir`, placeholder disparu,
   `appStartPath` retiré de `capacitor.config.json` synchronisé, `git status`
   propre — `ios/App/App/public` et `capacitor.config.json` synchronisé n'ont
   jamais été des chemins suivis par git).
4. **`capacitor.config.ts` ne connaît plus la plateforme visée pour refuser.**
   `resolveCapacitorConfig` pose `server.appStartPath` pour Android ET iOS,
   avertit (`console.warn`) sur les deux, et ne lève plus que sur la FORME
   (barre initiale, extension) ou sur `MEESHY_SHELL_SYNC_TARGET` absente/
   invalide — jamais sur la cible elle-même. La validation « cible déclarée
   == plateforme réellement synchronisée » s'est déplacée dans le hook
   (`planStartPathHook`), seul site à recevoir `CAPACITOR_PLATFORM_NAME` — une
   donnée que la CLI ne fournit qu'AU MOMENT du hook, jamais au chargement de
   `capacitor.config.ts`.
5. **Le gate ne pouvait pas voir une régression qui retirerait le hook sans
   toucher `capacitor.config.ts`.** `cap config --json` (lecture seule) rend
   `server.appStartPath` pour iOS dès que `resolveCapacitorConfig` l'accepte
   — que le hook soit câblé ou non. `scripts/check-capacitor-config.mjs` gagne
   trois preuves qui referment cet angle mort quand iOS SERT le chemin :
   `auditHookDeclaration` (les quatre clés de `package.json` pointent vers le
   bon script et la bonne phase, `ios.webDir` — rendu par `cap config --json`
   — vise le dossier natif attendu) et un rejeu RÉEL du hook dans un dossier
   temporaire (jamais `ios/` du dépôt), qui pose puis refuse comme la CLI le
   ferait. Une forme « iOS refuse en nommant `CAPBridgeViewController.loadWebView`
   » reste admise par ce gate (le critère de #6027 l'autorise), mais un refus
   MUET, comme une forme « sert » non ARMÉE, le fait rougir.
6. **Le rejeu se juge sur le FICHIER POSÉ, jamais sur le code de sortie du
   hook (revue #6027).** La première forme du gate ne vérifiait que « le hook
   sort 0 » — or `skip` est son issue la plus FRÉQUENTE et sort 0 lui aussi.
   Falsifié : `planStartPathHook` rendu `skip` en phase `after` laissait
   `check-capacitor-config.mjs` VERT, en imprimant « le hook qui le pose sous
   public/ est ARMÉ » pendant que rien n'était posé — le défaut même de #6027,
   restauré sous un témoin qui affirmait le contraire. Le gate exige
   désormais l'EXISTENCE du placeholder dans son dossier temporaire, puis
   rejoue la phase `after` une SECONDE fois (idempotence de `copy:after` puis
   `sync:after` dans un même `cap sync`).
7. **Une TROISIÈME garde de FORME : aucun segment `..` (revue #6027).**
   Depuis ce lot, `MEESHY_SHELL_START_PATH` n'est plus seulement une URL —
   le hook en DÉRIVE un chemin de fichier que `path.join` NORMALISE :
   `/c/../../../tmp/x` posait le placeholder dans `apps/web-v2/tmp/x`, HORS
   de `public/`, pendant que le journal annonçait « placeholder posé » et que
   la coque sortait quand même. La garde vit dans `capacitor.config.ts` avec
   les deux autres gardes de forme — elle couvre les DEUX plateformes et
   refuse AVANT toute écriture, ce qu'aucune garde en aval ne peut faire ; le
   hook ne la redouble donc pas (un seul site).
8. **Les quatre clés `capacitor:*` sont le POINT D'EXTENSION UNIQUE des
   hooks Capacitor de ce paquet.** Un futur lot qui aurait besoin d'agir sur
   `copy`/`sync` s'y CHAÎNE (`node scripts/shell-start-path-hook.mjs <phase>
   && node scripts/<autre>.mjs`) plutôt que de remplacer la valeur d'une clé :
   `auditHookDeclaration` compare la valeur à l'IDENTIQUE et rougirait — c'est
   voulu, la substitution silencieuse d'un hook est exactement ce que ce gate
   surveille. Le jour où un second hook existe, c'est la comparaison qui
   s'assouplit (préfixe attendu), jamais le gate qu'on retire.
9. **Ce qui reste hors de ce lot, avec son issue.** L'entrée système
   (Universal Links / App Links, #5819) — ce lot arme un lien profond POSÉ
   par la recette, pas reçu du système d'exploitation.

Sites : `scripts/shell-start-path-hook.mjs` (`IOS_NATIVE_WEB_DIR`,
`planStartPathHook`, `applyStartPathPlan`), les quatre clés `capacitor:*` de
`package.json`, `scripts/check-capacitor-config.mjs` (`replayStartPath`,
`judgeStartPathReplay`, `auditHookDeclaration`, `replayHookRoundtrip`).
Témoins : `capacitor.config.test.ts` (inversion de la régression #5774),
`scripts/shell-start-path-hook.test.ts` (20 cas), `scripts/check-capacitor-config.test.ts`
(11 cas) — gate rejoué ROUGE (clé renommée, puis refus rendu muet) PUIS VERT
à chaque mutation.

## D-28 · Un message part par REST avec son `clientMessageId`, se confirme par greffe de l'accusé, et se relance à la main — 2026-09-09 (#5813)

**Amende D-16** : sa clause « en ligne, l'état reste "en attente"… sans transport (#5493) » n'est plus vraie — le transport existe. Les DEUX autres clauses de D-16 (hors ligne ⇒ échec immédiat sans horloge ; « Réessayer » hors ligne laisse en échec) restent inchangées et gardées par `check-thread-states.mjs`.

**`POST /api/v1/conversations/:id/messages` rend 200, pas 201** (`services/gateway/src/routes/conversations/messages-send.ts:391`, `response.ts:38`) — le critère de recette de l'issue disait 201 ; c'est une erreur du critère, corrigée en commentaire de clôture. Le corps envoyé est le sous-ensemble TEXTE de `SendMessageBodySchema` : `{ content, originalLanguage, clientMessageId, replyToId? }`. `clientMessageId` (`cid_<uuid v4>`, `src/lib/api/client-message-id.ts` — implémentation LOCALE sur `crypto.getRandomValues`, jamais `@meeshy/shared/utils/client-message-id` qui importe `crypto` de Node) est l'identifiant d'IDEMPOTENCE : un second `POST` avec le même `(conversationId, clientMessageId)` rend le message EXISTANT (`MessagingService.ts:151-201`), ce qui rend « Réessayer » sûr même quand la première tentative a atteint le serveur et perdu son accusé.

**Le message local vit dans un OUTBOX (`src/lib/send/outbox-store.ts`, `zustand/vanilla`, mémoire seule), HORS du cache TanStack** — jamais un doublon : un 2xx greffe l'accusé (`confirmedMessageOf`) sur le local et l'écrit DIRECTEMENT dans `messagesQueryKey(id)` (`upsertConfirmed`, remplace par `id` OU `clientMessageId` s'il existe déjà — un écho socket arrivé avant l'accusé REST, cas #5494 — sinon append en queue), puis retire l'entrée d'outbox. Un 4xx/5xx/réseau/timeout laisse l'entrée `failed` avec sa cause (`ApiFailure`) ; « Réessayer » (`retrySend`) rejoue l'appel avec le MÊME `clientMessageId` et la MÊME `originalLanguage` — **aucune régénération au renvoi**, la langue composée ne doit jamais être réécrite en silence (Prisme).

**`send/perform-send.ts` est le SITE UNIQUE de la règle** — débounce du double-tap à 600 ms (miroir `ConversationViewModel.swift:81`), annulation du refetch en vol AVANT d'écrire le confirmé (`cancelQueries` avant `setQueryData`), patch de la liste (`patchConversation`, `lastMessage`/`lastMessageAt`/`lastMessageOriginalLanguage` posés, `lastMessageTranslations` RETIRÉ — jamais posé à `undefined`, `exactOptionalPropertyTypes`). `src/lib/view/use-send.ts` n'est qu'un abonnement à l'outbox, SANS RÈGLE — le hook que trente écrans copieront doit rester juste maintenant.

**Reprise MANUELLE seule ce lot** — pas d'outbox persistante ni de rejeu automatique (iOS `OfflineQueue`/`OutboxFlusher`, backoff, 5 tentatives) : issue compagnon « une file de reprise hors ligne rejoue les envois à la reconnexion ». Le bandeau hors ligne cesse de promettre un rejeu (« vos messages ne partiront pas maintenant », plus « … partiront à la reconnexion »). ~~`originalLanguage` à l'envoi = rang 1 du Prisme du lecteur (`useReaderLanguages().languages[0]`), jamais une détection on-device (issue compagnon : composeur avec détection + barre de langue).~~ **FAUX depuis #5828 — voir D-37** : la langue d'origine est composée PAR MESSAGE (détection locale → choix → rang 1 du Prisme du lecteur), jamais le rang 1 seul. Aucun toast sur un refus permanent (403 `USER_BLOCKED`) — la bande de reprise porte la cause EN CLAIR (« Non envoyé — envoi refusé pour cette conversation »), en info-bulle (`title`) et dans l'annonce `aria-live`. Cette phrase de D-28 décrivait d'abord un `title` qui n'existait pas : `lastError` était capturé sur l'entrée d'outbox et lu par PERSONNE — le défaut du cycle 122 du `CLAUDE.md` racine, « qui AFFICHE ce qu'il élit ? ». `sendFailureReason` (`src/lib/send/failure-reason.ts`) en est le site unique et ne sert JAMAIS `failure.error` tel quel : c'est la prose de la passerelle, écrite pour un développeur et pas toujours en français (« You are not a participant of this conversation », mesuré sur `gate.staging.meeshy.me` le 2026-09-09). Hors ligne, aucune cause n'est dite : le bandeau de coupure la porte déjà (revue-correction).

**L'horloge d'envoi (`send/send-clock.ts`) ne clignote qu'après 200 ms** — miroir `BubbleDeliveryCheck.swift:128-141` : composant FEUILLE (`SendingClock`, `message-blocks.tsx`), jamais une seconde horloge portée par la rangée (même doctrine que D-23 pour l'éphémère).

**Une annonce `aria-live="polite"`** (un seul nœud, entre l'en-tête et `<main>`) dit « Message non envoyé » / « Message envoyé ». Les DEUX signaux sont projetés de l'outbox, et ils sont DISTINCTS : l'échec se lit sur le compte d'entrées `failed`, la confirmation sur `confirmed[conversationId]`, un compteur MONOTONE que seul `remove` (le geste du 2xx) incrémente. Les dériver tous deux du compte de `failed` — sa BAISSE valant « envoyé » — annonçait « Message envoyé » au DÉBUT d'une reprise, avant tout appel réseau, puis « Message non envoyé » quand elle échouait ; et un envoi réussi du premier coup, qui ne fait jamais varier ce compte, n'annonçait rien. Le compteur est indexé PAR CONVERSATION comme `entries`, pour que les surfaces d'envoi à venir n'annoncent jamais la confirmation d'un fil voisin (revue-correction).

**Un envoi ÉCHOUÉ ne peint AUCUN accusé** — `checkStatusOf(message, localDelivery)` (`src/lib/view/message.ts`) est le site UNIQUE que les deux peaux appellent, et il rend `null` sur `'failed'`. Un local en échec porte `deliveredCount: 0`, que `deliveryOf` lit — à raison — comme « envoyé » : la coche ✓ s'affichait donc à côté de la bande « Non envoyé · Réessayer », `title="envoyé"` compris. Deux affirmations contraires sur le même message. iOS ne peint jamais l'accusé d'un `.sendFailed` (`BubbleFooter.swift:186-197`). Le défaut préexistait à D-16 mais n'était atteignable que HORS LIGNE ; le transport le rend atteignable EN LIGNE, sur tout 4xx/5xx (revue-correction).

**Aucune exception ne laisse un message sur l'horloge** — `dispatch` rattrape tout ce que `attempt` pourrait lever et pose `failed`. `performSend` est appelé en `void` par le hook : un rejet y resterait non traité et l'entrée d'outbox garderait `pending` pour toujours, une horloge qui tourne sans reprise possible — le mensonge d'interface que `check-thread-states.mjs` existe pour interdire. Direction de l'erreur choisie par le COÛT DE RÉPARATION : un « Réessayer » de trop se rejoue (l'appel est idempotent par `clientMessageId`), une horloge figée ne se répare pas (revue-correction).

**La carte du débounce se PURGE** (`pruneDebounce`, `perform-send.ts`) : sa clé porte le texte entier du message et sa valeur ne vaut que 600 ms — sans purge, une session gardait en mémoire chaque message jamais écrit (dimension 3, « aucun cache non borné »).

Sites uniques réutilisés, aucune jumelle : `outcomeOf` (extrait de `conversation-actions.ts` vers `api/outcome.ts`), `patchConversation` (extrait vers `api/conversations.ts`), `messagesQueryKey`/`decodeMessagesPage`, `httpTransport`/`ApiError`, `useOnline`, `LocalDelivery`/`deliveryOf`.

**Mesuré sur la passerelle RÉELLE** (recette du 2026-09-09, compte `cible-web-trois`, `POST https://gate.staging.meeshy.me/api/v1/conversations/6a9fb2ec6248cfa007f2b198/messages`) : **HTTP 200**, `data` porte `id` / `conversationId` / `createdAt` / `clientMessageId` / `senderId` / `content` / `messageType` — exactement ce que `projectAck` exige et lit. **`deliveredCount` et `readCount` sont ABSENTS de l'accusé** : les quatre colonnes agrégées ne sont plus stockées sur `Message` (`packages/shared/prisma/schema.prisma`, § « STATUTS AGRÉGÉS — PLUS AUCUN N'EST STOCKÉ ») et se calculent À LA LECTURE, servies par `GET …/messages` seul. Le critère de recette qui demandait un « `deliveredCount` réel » sur l'accusé demandait donc une chose que la passerelle ne sert pas : `confirmedMessageOf` retombe sur `0`, `deliveryOf` rend `'sent'` (une coche), et la page suivante sert les compteurs vrais (`deliveredCount: 0, readCount: 0, recipientCount: 4`, mesurés). Un SECOND `POST` avec le même `clientMessageId` rend le MÊME `id` et `isDuplicate: true`, et `GET …/messages` ne montre qu'UNE occurrence — « Réessayer » est donc sûr même quand la première tentative a atteint le serveur. Sans jeton : `401` ; avec un jeton valide sur une conversation dont on n'est pas membre : `403` « You are not a participant of this conversation », rien du contenu ne fuit (D-6).

**Mesuré** : le lot vit entièrement dans le CHUNK DU FIL (`src/lib/send/*`, `use-send.ts`, `sendAction`/`retrySendAction` dans `api/query.ts`) — aucun octet n'atteint le chunk `core`/`index` partagé avec la liste (vérifié en isolant le diff : premher paint à 34,96 Ko sans le lot, 34,98 Ko avec, sur l'état courant de `dev` — le chiffre de 32,78 Ko de `budgets-measured.json`, daté du 2026-09-08, ne reflète plus la branche, qui a intégré d'autres lots depuis).

## D-29 · Un message a ses actions : un cluster unique (rail + aperçu cloné + liste), des effets optimistes, et rien d'inerte — 2026-09-09 (#5814)

**Trois portes, UN site d'ouverture.** L'appui long (500 ms, 6 px de tolérance — miroir `MessageListView.swift:348`, la durée venant du critère de #5814), le clic droit (`contextmenu`) et la touche Menu (`ContextMenu`, `Shift+F10`) appellent le MÊME `openMenuFor`. `useLongPress` (`src/lib/view/long-press.ts`) vit **une fois** dans `routes/thread.tsx` et lit `event.currentTarget.dataset.row` : jamais une instance par rangée virtualisée. Ses six gestionnaires sont mémoïsés — ils sont étalés sur chaque rangée montée, et l'écran se re-rend à chaque tick d'horloge et à chaque frame de scène.

**L'aperçu est un CLONE du DOM vivant**, jamais un second rendu React : pixels identiques par construction (un message voilé reste voilé), zéro état dupliqué. `data-message`/`data-row`/`id`/`tabindex` sont retirés du clone — une seule ancre par message dans le document, ce dont les gates dépendent.

**La géométrie est une loi PURE** — `placeMessageMenuCluster` (`src/lib/view/popover.ts`), port de `MessageOverlayMenu.swift:230-289`. Ses cotes vivent dans `src/lib/view/message-menu-metrics.ts` et sont **gardées** par `check-curve.mjs` PARTIE 7 (rail 52, gap 12, menu-gap 6, marge 16, largeur 240, rangée 44, chrome 20, et les 6/20 emojis comparés à `defaultEmojis`). Le plancher de réduction (`max(0.4, …)`) et `nlEmojiWidth = 300` ne sont pas gardables — dit en commentaire, jamais contourné par une regex permissive.

**Ce que chaque entrée FAIT** (loi 4 : un contrôle existe s'il a un effet, mesuré par `check-thread-states.mjs` § 6) : Copier écrit le texte **servi** dans `navigator.clipboard` · Traduire ouvre le panneau des langues et change le texte **et** l'attribut `lang` de la rangée · Composer pré-adresse le composeur · Sélectionner remplace le composeur par la barre de sélection · Plus… ouvre « Détails du message » · le rail pose une réaction optimiste. **Aucune entrée sans transport n'est listée** : `edit`, `saveMedia`, `callDetail`, Transférer, Supprimer, Épingler, Signaler n'ont pas de port web-v2 — issues compagnons, jamais un bouton mort.

**Traduire est une INSERTION AU RANG 0 du Prisme, pas un second résolveur** — `served({ preferredLanguages: [forcé, ...langues] })` (D-14). Un seul `resolvePrismTranslation` dans tout le dépôt ; la rangée sert le texte ET pose `lang`, les deux venant de la même paire.

**Les réactions parlent à la passerelle telle qu'elle est** : `POST /api/v1/reactions` (`services/gateway/src/routes/reactions.ts:72-92`) et `DELETE /api/v1/reactions/:messageId/:emoji` (`:279-296`), les deux `requiredAuth` `allowAnonymous: true`. `performReaction` (`src/lib/api/reactions.ts`) est le site unique : plan (`isReactionAllowed` de `@meeshy/shared`, jamais réécrite) → optimiste → appel → issue. **201 ⇒ confirmé · 200 ⇒ la réaction existait déjà, le `+1` optimiste est DÉFAIT · 4xx ⇒ rollback · réseau/5xx ⇒ l'optimiste RESTE** (D-26 F4, `outcomeOf`). « Mes réactions » sont une mémoire de SESSION (`reaction-store.ts`) : `reactionSummary` est un compte `{emoji: n}`, la passerelle ne dit pas QUI — issue compagnon pour lire `GET /reactions/:messageId` au chargement, et une autre pour la file de reprise hors ligne.

**Décisions d'ARIA, prises en revue et opposables** :
- **UN SEUL `role="menu"` dans le document.** Le panneau des langues est un `role="group"` de `menuitemradio` — un `menu` imbriqué dans un `menu` est invalide (un sous-menu doit pendre d'un `menuitem` porteur d'`aria-haspopup`), et le critère de fin dit « UN menu ».
- **`aria-modal` ne retient rien tout seul** : `Tab`/`Shift+Tab` sont piégés dans le cluster. Sans ce piège, le focus sortait vers les rangées du fil — focalisables (`tabIndex=0`) et pourtant derrière un voile opaque. iOS retire l'arbre entier (`.isModal`) ; le web fait tenir le focus.
- **Aucun `aria-pressed` sur une capsule de réaction** ni **aucun `aria-selected` sur une rangée**. Ces attributs ne sont définis que sur `role="button"` et sur `option`/`row`/`gridcell`/`tab`/`treeitem` : posés sur des `div`/`span` sans rôle, ils annonçaient un bouton bascule que rien ne bascule et un état que rien ne porte — le contrôle qui ment, sur chaque capsule et chaque rangée du fil. La capsule dit « — la vôtre » hors écran ; la sélection vit sur une **coche `role="checkbox"` réelle**, qui est aussi le seul chemin CLAVIER vers la bascule (le clic sur la rangée entière n'est qu'une commodité de souris).
- **Une touche se passe par sa VALEUR** (`useRovingMenu.handleKey`), jamais par un événement recopié : `{ ...event, key }` perd `preventDefault`, méthode de PROTOTYPE — mesuré, `TypeError`, et le rail était inerte au clavier sans qu'aucun témoin ne rougisse.

**Questions tranchées** : le voile FLOUTE (parité avec la capture cible, `.contextMenu` natif iOS 26 — l'overlay maison d'iOS < 26 ne floute pas) · le rail porte **6 emojis + ＋** (iOS en défile 20 ; les 20 vivent dans la feuille « Ajouter une réaction ») · « Composer » **pré-adresse le composeur** dans la v3.1, là où iOS ouvre l'atelier de story — divergence de vocabulaire assumée, à rejuger quand l'atelier existera · la coche de la bulle vit DANS la gouttière de 50 px que la bulle réserve déjà, jamais en débord du fil.

**Revue-correction (2026-09-09) — treize défauts trouvés, neuf corrigés dans le même lot, sept issues compagnons ouvertes (#5863-#5869), une refutée.**

- **Le drapeau du pied et le sous-menu Traduire partagent DÉSORMAIS UNE SEULE loi.** Avant ce correctif, taper un drapeau du pied (`Flags`/`PrismPastille`, `focal-row.tsx`/`bubble.tsx`) ouvrait un panneau `SecondaryText` LOCAL à la rangée — un état séparé de `useMessageMenu.displayLanguages`, que le sous-menu Traduire lit pour cocher sa langue. Cliquer le drapeau révélait une traduction SOUS le texte pendant que le sous-menu continuait de cocher la langue précédente : deux réponses à « quelle langue je lis ? ». `SecondaryText` est RETIRÉ (dette éteinte, plus aucun consommateur) ; le pied appelle désormais `onPickLanguage` — la MÊME fonction que le sous-menu, via `useMessageMenu.onPickLanguage` (devenu une BASCULE : reposer la langue déjà imposée l'efface). Ce mouvement clôt de lui-même la moitié « rang 0 » de l'issue compagnon (f) de la spécification (« les drapeaux du pied appliquent `displayLanguage` ») — **aucune issue n'a donc été ouverte pour elle**. La portée PAR GROUPE (iOS l'applique à toute la suite via `onSetActiveDisplayLanguageForGroup`, `FocalRow.swift:1082` ; web-v2 reste par rangée) demeure l'écart 4 tracé dans `targets/focal-script.md` § 10 — hors périmètre de ce correctif.
- **L'aperçu du menu est désormais SOULEVÉ** — `filter: drop-shadow` (halo à l'accent + ombre noire, miroir `MessageOverlayMenu.swift:414-441`) posé sur l'HÔTE du clone, jamais sur le clone ; une surface opaque s'ajoute SEULEMENT sur la rangée plate (Focal/Script, détectée par `[data-reading-mode]` dans le DOM cloné), qui n'a ni fond ni rayon propres — une bulle porte déjà les siens.
- **Le clone porte `inert`**, pas seulement `aria-hidden` : ses `<button>` (drapeaux du pied) restaient focalisables au clavier malgré `aria-hidden`. Le menu NOMME son sujet (`aria-label` = auteur + extrait SERVI, gardé par la protection D-23 via `copyableTextOf` — jamais `servedOf` en direct, qui aurait fui un extrait protégé).
- **Le retour matériel Android ferme désormais le menu, pas l'écran** — `useBackDismiss` (`src/lib/view/use-back-dismiss.ts`), extrait du mécanisme `pushState`/`popstate` de `Sheet` pour que toute couche modale future le partage. `.message-menu-cluster` porte aussi `-webkit-touch-callout: none`/`user-select: none` (pas seulement `[data-row]`) : la WebView Android démarrait une sélection de texte native SUR la liste d'actions quand le doigt s'y trouvait au relâchement.
- **« Composer » et « Sélectionner » focalisent réellement** — le composeur au montage d'une citation (transition `replyTo` indéfini → défini), la barre de sélection sur « Annuler » à son montage : `focusTakenRef` tenait sa promesse sans qu'aucun preneur n'existe.
- **Une seule région live, la dernière annonce gagne** — `useLiveAnnouncer` (`src/lib/view/use-live-announcer.ts`) remplace `announcement || messageMenu.actionNotice` : `useSend.announcement` n'était JAMAIS remis à vide, masquant toute annonce du menu après le premier envoi confirmé pour le reste de la session. Le refus d'une réaction, « Message copié », « Message protégé » ont maintenant un rendu VISIBLE (pilule au-dessus du composeur, `aria-hidden` — le même texte est déjà lu par la région masquée), pas seulement chuchoté à VoiceOver.
- **Une réaction posée hors ligne est ANNONCÉE** (`REACTION_PENDING_MESSAGE`, `reactions.ts`) plutôt que de rendre silencieusement `{ ok: true }` — indiscernable d'une confirmation. La FILE de reprise elle-même reste hors périmètre (#5868).
- **`reactionStore.mine` survit désormais sur la MÊME horloge que le cache des messages persisté** (`query-client.ts` : un champ `reactions` voyage dans le MÊME JSON, sous le MÊME `buster`, purgé au même changement d'identité, D-6) — sans quoi un compte de réactions persisté (`reactionSummary`) survivait à un rechargement pendant que « qui a réagi » repartait à vide : la réaction restait affichée mais plus reconnue comme sienne, un second tap la DOUBLAIT, et le retrait devenait définitivement inerte.
- **`routes/thread.tsx` est redescendu sous le seuil de découpage** (1092 → ~1026 lignes) — l'en-tête du fil (retour, non-lus ailleurs, puce de mode, appel, recherche, avatar, bandeau hors ligne) vit désormais dans `components/thread-header.tsx`, motif `Sheet`/`FocusStrip` (composant sans état propre) : c'est l'extraction que l'étape 0 de la spécification prévoyait avant tout ajout.
- **Défaut « aucune recette en coque » REFUSÉ** : la revue elle-même cite des captures Android (`AND-1` à `AND-9`) et iOS (`IOS-1` à `IOS-5`) prises sur l'AVD `Meeshy_Poc_Web-v31` et le simulateur `Meeshy Poc-Web-V31` — résolutions `1080×2400`/`1206×2622` confirmées, exactement ce qui a permis de mesurer les défauts « retour matériel » et « sélection native » ci-dessus. Le sur/sous-dossier `render/` cité en preuve ne contient QUE des captures web (Playwright) ; les captures d'appareil vivent ailleurs (`.cache/web-v2-workflow/recette/thread/`) — l'absence dans UN dossier n'est pas l'absence de la recette.

## D-30 · Les coques parlent à la passerelle par des origines NOMMÉES, en DONNÉE — 2026-09-09 (#5815)

**(a) Les deux origines de coque sont une donnée d'exploitation, jamais un motif ni un défaut de `cors-origins.ts`.** Une WebView Capacitor envoie un en-tête `Origin` — contrairement à une app native, qu'aucun CORS ne protège (§ doc-comment du module) — et c'est l'origine VIRTUELLE de la coque, lue dans les sources installées de `@capacitor` 8.5.1 : iOS `capacitor://localhost` (`CAPInstanceDescriptor.m:10-11`), Android `https://localhost` (`CapConfig.java:38-39`, confirmé par `capacitor.config.ts:116` `androidScheme: 'https'`). Ni motif ni schéma générique dans `resolveAllowedOrigins` — la règle reste une égalité stricte de chaîne, et les deux origines rejoignent `CORS_ORIGINS`/`ALLOWED_ORIGINS` du staging comme n'importe quelle autre origine déclarée. **Ce que la liste élargie expose, mesuré (revue)** : `credentials: true` est posé sur les deux portes, mais la passerelle n'a AUCUN cookie (`grep -rn 'cookies\|@fastify/cookie' services/gateway/src` hors témoins = 0) — l'authentification est exclusivement `Authorization: Bearer` / `X-Session-Token`, des en-têtes qu'une page tierce servie sur `https://localhost` ne peut pas fabriquer. Élargir la liste n'ouvre donc l'accès à aucune donnée authentifiée ; une origine de coque n'obtient que ce qu'un `curl` sans `Origin` obtient déjà.

**(b) La liste vit dans le compose du dépôt ET sur l'hôte, à l'identique — deux preuves distinctes.** `infrastructure/docker/compose/docker-compose.staging.yml` porte les deux origines, gardé par `services/gateway/src/__tests__/unit/config/cors-origins.test.ts` (`describe` « les coques Capacitor de la v3.1 sont des origines NOMMÉES du staging ») qui LIT le fichier du dépôt comme texte et vérifie l'effet sur les deux portes (HTTP `@fastify/cors` réel, Socket.IO). L'hôte (`/opt/meeshy/staging/docker-compose.yml:217-218`) est patché à la main (sauvegarde datée, `sed` chirurgical sur les deux lignes, `docker compose up -d --no-deps gateway-staging`) — le témoin garde le dépôt, le `curl` des quatre origines (les deux coques, une tierce refusée, `staging.meeshy.me` intact) garde l'hôte. Aucun cliquet CI ne relie les deux ; une dérive future se détecte par la même recette `curl`.

**(c) `build-shells.mjs` est le site UNIQUE de la construction des coques — il refuse plus qu'il ne construit.** Trois fonctions pures (`resolveShellBuildEnv`, `auditSyncedShellConfig`, `auditShellBundle`) referment, dans l'ordre, une base d'API relative, une source `fixtures`, un chemin de recette synchronisé (M1, fuite mesurée le 2026-09-09 sur `android/app/src/main/assets/capacitor.config.json`), et le simulateur de RÉFÉRENCE (leçon 554, écrite dans le code — jamais seulement dans un prompt). `check:shell-dist`/`check-gateway-build.mjs` restent des gates DISTINCTS (construction `fixtures`/`gateway` en variante isolée) ; `build-shells.mjs` ne remplace ni n'étend leur contrat, il construit une coque de RECETTE contre une passerelle réelle, hors `bun run gate` (gradle/Xcode, hors CI Linux).

**(d) La production reste fermée aux coques jusqu'à la livraison de l'APK (#5651).** `DEFAULT_ALLOWED_ORIGINS` ne porte ni l'une ni l'autre origine (témoin dédié) ; `/opt/meeshy/production/.env` n'est pas touché par ce travail. Le jour de la livraison : même paire d'origines, même témoin étendu, patch de `.env` de production plutôt que du compose.

**(e) AUCUNE FIXTURE NE VOYAGE DANS UNE CONSTRUCTION `gateway` — corrigé en revue, pas différé.** `auditShellBundle`, écrit avec le reste de ce lot, a trouvé les marqueurs de fixture dans `thread-*.js` et `use-reader-*.js` MÊME sous `VITE_DATA_SOURCE=gateway` : la commande de construction livrée par ce travail SORTAIT EN ERREUR avant `cap sync`. Un gate qu'on contourne pour livrer n'est pas un gate — la correction est donc à la racine, et elle tient en deux LITTÉRAUX de construction (jamais un seuil abaissé, jamais une liste d'exceptions) :

1. **`__FIXTURES__`** (`vite.config.ts` § `define`) — `false` sous `VITE_DATA_SOURCE=gateway`. Les cinq ports qui lisent une fixture (`conversations.ts`, `messages.ts`, `reactions.ts`, `viewer.ts`, `routes/thread.tsx`) s'écrivent `__FIXTURES__ && source === 'fixtures'` : la valeur d'EXÉCUTION `apiConfig.source` reste la source de vérité du COMPORTEMENT — le littéral ne fait que DIRE à la construction ce qu'elle sait déjà, pour qu'elle puisse élaguer. Les deux ne peuvent pas diverger dangereusement : le seul écart possible (`VITE_DATA_SOURCE` posée dans un `.env` invisible de `process.env`) rend `__FIXTURES__` VRAI, donc garde les fixtures — du poids en trop, jamais une branche élaguée sous les pieds d'une exécution qui l'attend.
2. **La règle d'élagage** (`build.rollupOptions.treeshake.moduleSideEffects`) DÉCLARE les six `src/lib/api/fixtures*.ts` sans effet de bord. Sans elle, `__FIXTURES__` seul ne suffisait pas — mesuré : `CONVERSATIONS` (« Voyage Lisbonne ») disparaissait bien, mais `fixtures-base`/`fixtures-river` restaient, leurs jeux de données étant bâtis par des `.map(…)` au niveau module qu'un bundler suppose effectifs. Règle NOMMÉE et non `"sideEffects": false` de `package.json`, qui l'affirmerait de toute l'application (magasins, amorçage du schéma, CSS importée pour son seul effet) ; vérifié qu'une règle ne renverse PAS le défaut des modules non appariés (sonde : règle non appariée ⇒ les fixtures reviennent).

Mesure : `use-reader-*.js` (le morceau que la LISTE et le FIL chargent tous deux) passe de 46,53 à 26,21 Ko, **16,53 → 10,03 Ko gzip** ; à-la-demande du dist `gateway` 109,06 Ko contre 115,33 Ko en `fixtures` ; première peinture inchangée (35,79 Ko). Le gate qui le TIENT est `check-gateway-build.mjs` — le seul du dépôt qui construise en `gateway` — et il balaie TOUT le dist, jamais un motif de nom : un morceau neuf s'appellerait autrement, et c'est lui qu'il faut attraper.

**(f) Un nom de FIXTURE écrit en dur dans un composant est le même défaut, une couche plus haut.** Le gate ci-dessus a trouvé un dernier marqueur dans `thread-*.js` qui ne venait d'AUCUN import : l'indicateur de frappe portait `initials="AD"` et « Amina écrit » en LITTÉRAL. Sans effet aujourd'hui (`typing` vaut `false` en `gateway`, `query.ts:91`), mais le jour du socket (#5494) tout lecteur aurait vu « Amina écrit » pour n'importe quel correspondant. Il DÉRIVE désormais son nom et ses initiales du premier participant autre que le lecteur, et ne se rend pas du tout quand il n'y en a pas — on n'invente pas de copie générique, la forme iOS est « <Auteur> écrit » (`ConversationListViewModel.swift:966`).

## D-31 · Le libellé d'accessibilité d'un message a UN site : `composeMessageLabel`, la présence suit `presenceOf`, « Sans compte » reste TEXTUEL faute de glyphe extrait — 2026-09-10 (#5774, travail 2/3)

**Le constat.** `[data-row]` (`routes/thread-modes.tsx`) est déjà l'ancre PARTAGÉE des deux peaux (rangée plate ET bulle, D-17/D-29) et portait `role="article"` + `aria-label={"Message de " + auteur}` — un lecteur d'écran annonçait l'auteur et RIEN d'autre : ni le texte SERVI, ni une citation, ni un média, ni un accusé, ni un badge. Miroir cassé de `MessageAccessibilityLabelComposer.compose` (`FocalRow.swift:36-93`), qui compose ces neuf segments dans un ordre fixe.

**La règle.** `composeMessageLabel` (`src/lib/view/message-a11y-label.ts`) est le SITE UNIQUE de cette composition, appelé une fois par rangée montée, quelle que soit la peau — jamais un second calcul dans `FocalRow`/`Bubble`. Il reçoit le texte SERVI par le Prisme (`served(...).text`, avec le MÊME `displayLanguage` que la rangée peint — D-14, un témoin de rang s'écrit sur un rang ≠ 1) et `checkStatusOf(message, localDelivery)` (D-28) — jamais un recalcul local de l'un ou l'autre. Ordre iOS : auteur (absent sur un message à SOI, jamais remplacé par « Vous ») → citation (« réponse à … ») → texte → pièces jointes comptées par catégorie → heure → accusé (SEULEMENT sur un message à soi — iOS ne peint jamais l'accusé d'un message reçu) → modifié → épinglé → éphémère → réactions.

**La présence de tête de groupe** vient de `presenceOf` (`view/conversation.ts`, D-1 « offline = pas de pastille ») posée sur l'`Avatar` de `FocalRow` — la MÊME fonction qui nourrit déjà l'en-tête du fil, jamais une seconde lecture de `isOnline`/`lastActiveAt`.

**« Sans compte » reste TEXTUEL, pas iconographique — un ÉCART ASSUMÉ.** *(SOLDÉ le 2026-09-10 par D-32 §1 : le glyphe `mask-happy` a été extrait, le badge textuel n'existe plus. Le paragraphe qui suit est conservé pour l'HISTOIRE — il ne décrit plus le code.)* iOS pose un fantôme `theatermasks.fill` avant le nom d'un participant `anonymous` (`FocalIdentityHeader.swift:99-161`). `scripts/extract-glyphs.mjs` n'a pas ce tracé au catalogue, et l'extraire (lecture du symbole SF depuis Xcode, ajout au jeu `glyphs.ts`, gate `check-utilities.mjs`) est un travail séparé — issue compagnon ouverte plutôt qu'une icône approximée à la main (ce que D-4 interdit : aucune géométrie non dérivée). En attendant, un badge textuel « Sans compte » précède le nom — même POSITION, même effet pour un lecteur d'écran, glyphe manquant seul.

**Ce qui reste HORS de ce lot** (issues compagnons) : l'anneau de story et l'humeur (`moodEmoji`) de `FocalIdentityHeader` n'ont NI l'un ni l'autre de champ dans `@meeshy/shared` `Participant` (vérifié : `storyState`/`moodEmoji` absents du schéma) — capacité non exposée par la passerelle, jamais inventée côté client (règle « Conformité à la passerelle » du prompt de tour). La portée PAR GROUPE de « Traduire » sur toute une suite de rangées (écart déjà tracé par D-29/`targets/focal-script.md` §10) n'est pas non plus dans ce lot.

## D-32 · L'identité de rangée est complète pour ce que le MESSAGE transporte ; ce qu'il ne transporte pas est résolu par un service d'écran, jamais inventé — 2026-09-10 (#5935)

**Ce que ce lot complète, au-dessus de D-31.**

1. **« Sans compte » devient ICONOGRAPHIQUE.** Le suivi de D-31 est soldé : `mask-happy` (`@phosphor-icons/core/regular`, extrait par `scripts/extract-glyphs.mjs` dans son propre jeu d'écran `glyphs-thread-identity.ts` — jamais le socle, un sans-compte reste un cas RARE) remplace le badge textuel, colorée `var(--ios-purple-500)` (dérivée de `MeeshyColors.swift` via `ios.css`, D-4). Phosphor ne publie pas `theatermasks` : l'écart de TRACÉ avec iOS (un masque de théâtre, pas deux) est ASSUMÉ — la POSITION (avant le nom), le RÔLE (`role="img"`) et le NOM ACCESSIBLE (« Sans compte », porté par l'attribut `aria-label`, jamais un second texte visible) sont, eux, identiques à iOS.

2. **La présence gagne le pied de la BULLE.** `bubble.tsx` posait un avatar de pied SANS `presence` — la seule des trois surfaces d'identité (rangée plate, pied de bulle, `FocusIdentity`) qui l'omettait. `presenceOf(message.sender)` (la MÊME fonction que `FocalRow`, D-1 « offline = pas de pastille ») la comble : parité 1.3 de la référence iOS (`BubbleStandardLayout.swift:1195-1203`, `SenderIdentity`).

3. **`data-identity` est l'ANCRE DE GATE de la ligne d'identité.** Elle n'avait aucun marqueur stable ; `scripts/lib/check-identity.mjs` (extrait de `check-reading-mode.mjs`, hors budget de taille) en dépend pour mesurer la hauteur réservée (34 px, `AVATAR_FRAME`) et pour distinguer une tête de groupe d'une continuation. Posée SEULEMENT sur `head` — une continuation n'a pas d'en-tête à mesurer.

4. **RECTIFICATION DE D-31 — l'anneau de story et l'humeur SONT servis, mais pas sur `sender`.** D-31 affirmait une capacité NON exposée par la passerelle ; c'est FAUX à la lettre, VRAI à la forme. Mesuré sur `services/gateway/src/routes/posts/feed.ts` : `GET /api/v1/social/posts?scope=stories&projection=tray` (alias déprécié `GET /api/v1/posts/feed/stories`) sert l'état d'anneau (via `isViewedByMe` sur les posts `STORY` d'un auteur, loi iOS `.none`/`.unread`/`.read` dans `StoryViewModel+Viewing.swift:314-318`) et `?scope=statuses` (alias `GET /api/v1/posts/feed/statuses`) sert `moodEmoji` sur les posts `STATUS`. **Ni l'un ni l'autre ne voyage sur `Message.sender` ni sur `Participant`** (vérifié : `core-selects.ts`, `messages-list-query.ts`, `packages/shared/types/participant.ts` — zéro hit) : côté iOS, `MessageListViewController.swift:1613-1616` les résout par DEUX services d'écran indexés par `userId` (`StoryViewModel.storyRingState(forUserId:)`, `StatusViewModel.statusForUser(userId:)`), jamais depuis la charge du message elle-même. Câbler ces deux signaux côté web-v2 est donc un travail de SERVICE D'ÉCRAN (deux requêtes supplémentaires par fil, ou un enrichissement de `sender` à discuter côté gateway) — pas un champ absent à réclamer, et pas dans ce lot : issue compagnon.

5. **DÉCOUVERTE — la moitié « présence NON servie » du critère de fin n'est reproductible NULLE PART dans le navigateur, avec les fixtures actuelles.** La spécification visait `riv-open-5` (Bruno, hors ligne) sur `/c/c-salon-riviere` ; mesuré : `fixtures-river-opening.ts` (qui porte `riv-open-5`) déclare dans son propre doc-comment n'être « IMPORTÉ PAR AUCUN MODULE DE PRODUCTION », et `messagesOf('c-salon-riviere')` — ce que la route sert réellement — ne l'inclut jamais. Dans `RIVER_MESSAGES` (les 40 messages RÉELLEMENT servis), l'auteur alterne STRICTEMENT entre `viewer` et `amina` (`fixtures-river.ts`) : Bruno n'y prononce AUCUN message, sa seule fonction étant de porter `memberCount` à 5 (doc-comment de `bruno`, `fixtures-base.ts`). Élargir `RIVER_MESSAGES` casserait `fixtures-river.test.ts` (« deux voix en stricte alternance ⇒ serialized/belowMinimum ») — un corpus d'une autre loi (#5696). `scripts/lib/check-identity.mjs` documente ce constat en tête de fichier et se limite, pour cette moitié, à la preuve UNITAIRE déjà tenue (`bubble.test.tsx`, `focal-row.test.tsx:408-410`) — le même repli que le critère de fin admet déjà explicitement pour le cas « Sans compte » (« sinon le témoin unitaire suffit »). Suivi : une issue compagnon donne à UN participant réellement `offline` un message SERVI par une conversation existante, pour que ce cas redevienne mesurable au navigateur.

**Ce que la revue-correction a ajouté au lot (2026-09-10).** Cinq défauts pris sur la SURFACE et la CONCEPTION, corrigés avec leurs témoins :

6. **Le nom d'un message à SOI est un LITTÉRAL ; sa COULEUR reste un écart, MESURÉ.** `FocalIdentityHeader.swift:87-92` porte DEUX lois que la première rédaction avait laissées.

   La première est portée : `displayName = isMe ? "Toi" : senderDisplayName` — iOS échange le TEXTE contre le littéral de soi mais garde `senderDisplayName` pour les INITIALES de l'avatar. web-v2 n'avait qu'UN nom : invisible sur fixture (`viewer.displayName === 'Vous'`), la donnée réelle de la passerelle aurait affiché au lecteur son PROPRE nom en tête de ses propres messages dès `VITE_DATA_SOURCE=gateway` (directive du tour). D'où `senderAvatarName` (la personne, pour les initiales) et `senderName` (« Vous », pour le texte — la prose du web vouvoie).

   La seconde ne l'était PAS, et c'était une décision : `nameColor = isMe ? MeeshyColors.indigo500 : …`. Servie (`--ios-indigo-500`, #6366f1) sur la ligne d'identité de 13 px, elle MESURE **4,47:1 en clair et 4,45:1 en sombre** (Chromium, `scripts/lib/contrast.mjs`, `/c/c-deploiement`, les deux schémas) — **sous la barre AA de 4,5:1**, et le gras 800 n'ouvre pas l'exemption « grand texte » (13 px < 18,5 px). L'encre primaire tenait 15,99:1 / 17,79:1 mais rendait la tête d'un message à soi indiscernable de celle d'un autre. **SOLDÉ le 2026-09-10 (revue #5935, §11 ci-dessous)** par la méthode D-18/#5625 : `--ios-self-name-ink` (`packages/design-tokens/scripts/generate-from-ios.mjs`, `HORS_TABLE_PAR_SCHEMA`) sert indigo700 en clair / indigo200 en sombre — la MÊME paire que `--ios-day-ink`, mais NOMMÉE pour sa fonction propre (un séparateur de jour et un nom de soi ne sont pas la même chose). Mesuré 7,90:1 (clair) / 13,34:1 (sombre), gardé par `check-identity.mjs` (contraste réel, pas le nom du jeton) et par `focal-row.test.tsx` (le jeton NOMMÉ, pour qu'une régression vers `--color-ios-ink` — qui tient AA aussi — rougisse quand même). **iOS lui-même reste à ce contraste** : c'est un défaut de la CIBLE, famille #5681-#5683, pas un retard du web. Issue compagnon côté iOS.

7. **`data-presence` est l'ancre de la pastille, jamais son NOMBRE D'ENFANTS.** Le gate mesurait « `.avatar-root` a 2 enfants ⇒ la présence est servie » : l'anneau de story et le badge d'humeur du §4 ci-dessus en auraient fait 3, et le gate serait passé au ROUGE en annonçant « présence absente » — un témoin qui ment sur la CAUSE coûte plus qu'un témoin absent. `Avatar` pose l'ÉTAT servi sur la pastille ; le gate lit l'ancre ET la couleur calculée (`rgb(52, 211, 153)` / `rgb(251, 191, 36)`), ce que le critère de fin demandait littéralement (« ⇒ point vert ») et que le compte d'enfants ne prouvait pas.

8. **L'horloge de la présence est celle de la rangée.** `focal-row.tsx` et `bubble.tsx` déclarent tous deux, sur leur prop `now`, « Horloge injectable — jamais `Date.now()` lu directement (déterminisme des témoins) » ; `presenceOf(message.sender)` la lisait quand même. Les deux passent désormais `nowMs`.

9. **Le fantôme mesure `nameSize × 0.8`, pas `0.8em` du conteneur.** Mesuré au navigateur en rendant réellement un participant `anonymous` : 12,8 px contre les 10,4 px d'iOS, l'`em` se résolvant sur la police HÉRITÉE (16 px) et non sur celle du nom (13 px). `text-title` sur le glyphe rétablit la dérivation. Mesures : glyphe 10,39 px, `rgb(168, 85, 247)` (le jeton `--ios-purple-500` résout bien — un jeton absent aurait rendu la couleur héritée sans rougir nulle part), contraste 3,96:1 en clair et 5,03:1 en sombre, au-dessus de la barre 3:1 des objets graphiques. **Aucune fixture ne porte de participant `anonymous`** : ce glyphe n'est rendu par AUCUN gate navigateur et n'apparaît sur AUCUNE capture livrée — sa seule preuve permanente reste unitaire. Suivi avec celui du §5.

10. **Un commentaire faisait ÉCHOUER un gate.** `check-utilities.mjs` était ROUGE sur `dev` depuis `e273e00074` : le doc-comment de `lib/view/thread-chrome.ts` citait un `className="flex\n * justify-center py-1.5"` replié sur deux lignes, et l'étoile de continuation entrait dans la citation — une classe `*` « sans règle dans la feuille ». Le commentaire ne cite plus le `className` en entier.

**Ce qu'une SECONDE revue-correction a trouvé, et corrigé (2026-09-10).** Cinq défauts, sur le titre même du lot (« la rangée se lit d'un seul libellé ») et sur ses gardes :

11. **LE TITRE ÉTAIT FAUX, ET MESURÉ FAUX — corrigé.** `role="article"` + `aria-label` sur `[data-row]` (`thread-modes.tsx`) ne réduit PAS son sous-arbre : un lecteur d'écran annonçait le libellé COMPOSÉ puis RELISAIT le nom, le texte servi et l'heure (arbre AX réel, CDP `Accessibility.getFullAXTree`, `/c/c-deploiement` : `[article]` PUIS `[StaticText]`/`[paragraph]`/`[time]`, aucun `ignored`) — chaque message était énoncé DEUX FOIS sur l'écran PHARE. `[data-identity]`, le `<p>` du texte servi et `.focal-meta` (heure + accusé) portent désormais `aria-hidden` (`focal-row.tsx`) ; les CONTRÔLES (pastille du Prisme, drapeaux, citation, réactions) restent HORS du masque, atteignables et ANNONCÉS — vérifié par re-capture de l'arbre AX après correctif : ses seuls nœuds non `ignored` sous l'`article` sont désormais les `<button>`. **« Sans compte » entre dans `composeMessageLabel`** (`message-a11y-label.ts`, segment AVANT le nom, jamais pour soi) pour ne rien perdre de ce que le glyphe annonçait seul avant le masque — le web fait alors MIEUX qu'iOS, qui perd cette information par `.combine`. Gardé par `check-identity.mjs` (point a : les trois nœuds sont `aria-hidden` sur CHAQUE rangée, aux deux schémas) et par `focal-row.test.tsx` (quatre témoins : identité, texte, méta, et « les contrôles restent HORS du masque »).

12. **LA COULEUR DU NOM DE SOI — SOLDÉE, voir §6 ci-dessus (édité).** `--ios-self-name-ink` (indigo700 clair / indigo200 sombre) remplace l'encre primaire pour un message à soi ; le nom de soi est de nouveau DISTINGUABLE au premier coup d'œil, sous AA aux deux schémas (7,90:1 / 13,34:1).

13. **DEUX SURFACES LIVRÉES N'ÉTAIENT COUVERTES PAR AUCUN GATE NAVIGATEUR, FAUTE DE FIXTURE — corrigé.** Ni le glyphe « Sans compte » (aucun participant `anonymous` dans le corpus) ni la garde de confidentialité « présence NON servie ⇒ AUCUNE pastille » (aucun message servi n'avait de sender `offline`) n'étaient mesurables au navigateur — seule une preuve unitaire les couvrait, malgré le suivi explicite du §5 et du §9 ci-dessus. Deux messages RÉELLEMENT servis résolvent les deux à la fois, dans `c-deploiement` (la conversation que `check-identity.mjs` ouvre) : `m5b` (`bruno`, `fixtures-base.ts`, déjà `offline` depuis deux heures) et `m6b` (`anonymousGuest`, nouveau, `type: 'anonymous'`, PREMIER participant anonyme du corpus). `conversation.memberCount` reste À **3** (`assertRiverBelowThreshold`, `lib/check-river-menu.mjs`, en dépend mot pour mot) — `bruno` et `anonymousGuest` élargissent `participants` (le roster) sans peser sur l'effectif ACTIF affiché, un écart que la passerelle réelle admet déjà (un participant reparti ou anonyme peut avoir laissé un message sans compter dans l'effectif). Gardé par `check-identity.mjs` (présence absente sur `m5b`, glyphe + libellé sur `m6b`) et par la SUITE COMPLÈTE (`bun test`, 1644 témoins verts).

14. **UN GATE NE POUVAIT PAS ROUGIR POUR LA RAISON QU'IL NOMMAIT — corrigé.** L'assertion (d) de `check-identity.mjs` comparait `[data-identity].getBoundingClientRect().height` au `min-height: 34px` que `focal-row.tsx` vient LUI-MÊME d'écrire en style inline sur ce nœud — qui ne CONTIENT PAS l'avatar (`identityContainsAvatar: false`, mesuré : l'avatar vit dans une gouttière FRÈRE). Falsifié : supprimer TOUS les `[data-presence]` du DOM laisse les six hauteurs mesurées identiques avant et après (`34,34,34,34,34,34`) — l'assertion ne pouvait PAR CONSTRUCTION jamais rougir. Une SECONDE mesure (d2) compare désormais l'EXTENSION RÉELLE de la gouttière (`.avatar-root` + sa pastille de présence en débord) à `AVATAR_FRAME` (34, en dur — la valeur DÉRIVÉE que le gate garde), sur un corpus qui porte maintenant à la fois des têtes AVEC pastille (`m1`, `m4`) et SANS (`m5b`, `m6b`, depuis le §13). Falsifiabilité VÉRIFIÉE en local : `AVATAR_SIZE` porté à 40 (`metrics.ts`, expérience jetée) fait ROUGIR d2 (« mesuré 40.00 px » contre le plafond 34), ce que l'ancienne assertion ne pouvait pas faire.

15. **UN DEUXIÈME CORRECTIF A FAILLI RETOMBER DANS LE MÊME PIÈGE.** Élargir `conversation.memberCount` de `c-deploiement` de 3 à 5 (pour que `bruno`/`anonymousGuest` « comptent » comme membres) aurait cassé `assertRiverBelowThreshold`, qui dépend MOT POUR MOT de « S'ouvrira à 5 personnes actives — **3** aujourd'hui » pour prouver que la Rivière reste sous son seuil sur CETTE conversation, par opposition à `c-salon-riviere` (déjà éligible). Trouvé en REJOUANT le gate composite (`check-reading-mode.mjs`) après le premier essai, pas en le devinant — un rappel que `bruno` porte déjà une fonction ANALOGUE ailleurs (« cinquième membre du Salon Rivière » sans y prononcer un mot, `fixtures-base.ts`) : un participant qui parle sans peser sur l'effectif n'est pas une invention de ce lot.

Preuve de bout en bout de ce paragraphe : `bun run type-check` (0 erreur), `bun test` (1644/1644 verts), `bun run build`, et `node scripts/check-reading-mode.mjs` sur le DIST construit — zéro `ECHEC`, deux schémas, `c-deploiement` — rejoués après CHAQUE correctif.

## D-33 · Le chrome du fil s'escamote au geste tenu, revient 4,5 s après, et le retour en bas porte le compte réel de non-lus — 2026-09-10 (#5774)

**Le constat.** Le fil web-v2 gardait en-tête et composeur opaques pendant tout défilement, n'avait ni pilule de jour collante ni bouton de retour en bas — trois éléments qu'iOS porte (`ConversationView`, `EdgeHiddenChrome`, `MessageDayStickyOverlay`, `ConversationScrollControlsView`) et que D-19 avait explicitement laissés hors périmètre (§ 13 « restantes »).

**La règle.** UN signal partagé « le geste est tenu » — doigt posé OU liste tirée, `use-thread-chrome-signals.ts` — nourrit un état de chrome DÉRIVÉ (`src/lib/view/thread-chrome.ts`, cotes dérivées des jetons iOS) que `components/thread-chrome.tsx` peint. Les DEUX attributs qui pilotent l'escamotage vivent HORS React : mutation DOM directe sur `style.opacity`/`pointerEvents`, jamais un `useState` — au rythme du défilement (jusqu'à 8 images mesurées par geste), un état React aurait re-rendu la scène complète à chaque frame (dimension 4, Zero Unnecessary Re-render). La pilule de jour est peinte sur le FOND du fil (`thread-backdrop`), pas dans le flux des messages — elle reste collante sans recalcul de position au scroll.

`src/lib/view/unread-below.ts` compte les messages arrivés SOUS le pli (hors de la fenêtre visible) et `src/lib/view/pin-to-bottom.ts` porte la loi UNIQUE du retour en bas — extraite pour n'avoir qu'un site, alors que le geste existait déjà en double avant ce lot (« Reprendre le fil » de D-19 § revue-correction). Le bouton porte un libellé COMPTÉ (« 3 messages non lus, Défiler vers le bas ») quand `unread-below > 0`, un libellé simple sinon.

**La garde de confidentialité, trouvée EN CORRIGEANT ce lot.** Le libellé accessible du bouton composait le texte SERVI du dernier message masqué dans son `aria-label` — un message à VUE UNIQUE ou CHIFFRÉ aurait fui dans l'annonce du lecteur d'écran sans jamais s'afficher à l'écran (même famille que le cycle 123/124 du `CLAUDE.md` racine : « que transporte le résolveur à côté de ce qu'il affiche ? »). Fermé à sa racine par un site UNIQUE, `composeMessageLabel` (D-31), qui PREND déjà la protection — le bouton ne compose plus son propre libellé, il délègue.

**Ce qui est gardé.** `scripts/check-thread-chrome.mjs` mesure au navigateur réel (opacité, `pointer-events`, position, `scrollTop`) dans les DEUX schémas — pas une assertion sur la présence d'une classe. `check-thread-virtualization.mjs` reste vert (le chrome n'ajoute aucune mutation DOM par frame au-delà des deux attributs ci-dessus). `scripts/check-capacitor-config.mjs`, ajouté dans le même lot, rejoue le VRAI chargeur CJS de la CLI Capacitor (`bunx cap ls`) — la revue avait vu ce fichier casser sur un `import.meta` que `bun test` ne pouvait pas voir (module ESM interprété par un harnais qui ne le transpile pas).

**Ce qui reste hors de ce lot** (issues compagnons, dimension 13) : la porte `searchOpen` de la loi de chrome n'est atteignable par aucun état DOM tant que le bouton « Rechercher » de `thread-header.tsx` n'a pas d'`onClick` (la recherche du fil elle-même n'est pas câblée) ; le libellé À COMPTE du bouton n'est exercé par aucune fixture navigateur tant que le socket `message:new` (#5494) n'alimente pas `unread-below` en direct — seule une arrivée SOUS la fenêtre au chargement le déclenche aujourd'hui ; la teinte de la pastille « revenir en bas » diverge d'iOS (seuil de luminance 0,6 côté web contre le seuil d'égalité de contraste côté iOS, qui reste sous AA) — corrigée du côté web, à porter en issue compagnon iOS plutôt qu'à régresser ici.

**Mesuré.** Le lot vit dans le chunk du fil : première peinture inchangée à 36,85 Ko gzip, 6 requêtes ; `check-curve.mjs` PARTIE 22 cotes de la rangée plate + chrome, verte.

## D-34 · Un message a un CORPS et des BADGES résolus par deux lois pures ; un message système sort du groupement d'auteur — 2026-09-10 (#5936)

**Le constat.** Un message épinglé, transféré ou modifié se rendait comme un texte ordinaire (aucun badge), un sticker/lieu/emoji seul comme du texte brut, un message système comme une bulle d'auteur normale, et une réponse citant une story sans sa citation.

**La règle — deux sites, jamais un troisième.** `src/lib/view/message-badges.ts` résout les badges de métadonnées (épinglé, transféré, modifié) dans un ORDRE FIXE et les porte dans le libellé d'accessibilité (`composeMessageLabel`, D-31) — jamais un second calcul dans `FocalRow`/`Bubble`. `src/lib/view/message-body.ts` résout le CORPS : sticker, lieu, emoji seul (agrandi — la forme iOS d'un message qui n'est QUE des emojis), citation de story — rendu par `message-body-blocks.tsx`. `src/components/system-notice.tsx` rend la notice système CENTRÉE, hors regroupement d'auteur : `src/lib/grouping.ts` gagne un troisième critère (jamais à travers un message système), le seul que `MessageDayGrouping.swift:97` porte et que web-v2 n'avait pas encore.

**Le transfert échoue FERMÉ.** `ForwardBadgePolicy` est une liste blanche de types connus — un type de transfert inconnu ou absent rend « Transféré » SANS nom, jamais un nom mal résolu qui prétendrait connaître l'origine.

**La teinte suit la SURFACE, pas l'expéditeur.** Corps nu, rangée plate, bulle boîtée portent chacun leur propre teinte de corps — comme `BubbleFooter.compactMetaColor` le tranche côté iOS — là où le code précédent dérivait la couleur du message de l'expéditeur, un mélange qui ne correspond à AUCUNE des deux surfaces.

**Détection d'emoji seul optimisée en cours de revue.** La première forme parcourait la chaîne caractère par caractère avec une expression régulière Unicode complète ; mesurée 29,33 µs par message. Remplacée par une forme qui rejette au premier caractère non-emoji (`O(1)` en longueur de message pour tout message qui N'EST PAS un emoji seul, le cas dominant) : **1,47 µs**, ×20.

**Ce qui reste hors de ce lot** (issues compagnons) : la méta du fil (heure, badges) reste SOUS AA (2,21:1 rangée plate, 3,02:1 sur l'indigo) — fidèle à iOS, qui l'avoue dans son propre doc-comment, donc à corriger dans les DEUX produits par un jeton dérivé plutôt qu'ici ; l'état VIDE d'une citation de story n'est pas dessiné (iOS s'en tire par un repli producteur, « 📷 Story », que le décodeur du dépôt n'applique pas) ; le lien de LIEU ouvre `maps.apple.com` en `target="_blank"` — le seul lien externe du dépôt, jamais rejoué sur coque QEMU/simulateur ; côté passerelle, le lieu et la citation de story restent inertes sur l'événement socket `message:new`, faute de hoist serveur — issue gateway compagnon à ouvrir.

**Mesuré.** Poids avant le premier pixel INCHANGÉ (36,91 Ko), tout le code neuf dans le chunk `thread` (34,73 Ko gzip). Aucune hauteur ne bouge après montage (`<img>` du sticker à `width`/`height` posés avant décodage, scène de story en `aspect-ratio` — `assertStableHeights` sur 9 témoins × 4 runs peau/schéma).

## D-35 · Le renommage du 2026-09-10 — `web-v3` devient `web-v2`, en version 2.0.0 (#6042)

Directive du porteur : le legacy `apps/web` reste en production ; le chantier s'appelle `apps/web-v2` et deviendra `apps/web` quand il sera mûr en staging. Le legacy est en 1.x : l'application qui lui succédera prend la version majeure suivante, **2.0.0**. La « v3.1 » ne correspondait à aucune version servie.

| avant | après |
|---|---|
| `apps/web-v3`, `@meeshy/web-v3` 3.1.3 | **`apps/web-v2`**, **`@meeshy/web-v2` 2.0.0** |

Le déplacement est parti SEUL dans son commit, avant toute réécriture, pour que git suive chaque fichier comme un renommage à 100 %. Les chemins, le nom du paquet, les jobs de CI, les gardes, les lockfiles (régénérés) et les pointeurs de commentaire du gateway, d'iOS et du SDK ont suivi au commit suivant. Le dossier de captures local devient `.cache/web-v2-workflow` ; les captures déjà prises sous l'ancien nom ne sont pas déplacées.

**Ce qui NE bouge pas, délibérément** :
- les identifiants de DÉPLOIEMENT — `web-v31` et `web_v31` dans `docker.yml`, l'image `isopen/meeshy-web-v31`, le service `frontend-staging`. L'hôte de staging tire l'image depuis son propre compose ; les renommer est un geste d'hôte, suivi par #6043 ;
- le label GitHub `web-v3` (104 issues, dont celles de l'ancienne refonte) et les noms de branches cités par les dossiers de cibles (`claude/web-v3-parite`) : ce sont des identifiants PUBLIÉS, pas des chemins ;
- le nom du workflow `meeshy-web-v3-bout-en-bout`, qu'on invoque par ce nom — ses chemins, eux, désignent `apps/web-v2` ;
- D-12 ci-dessus, qui raconte le renommage précédent avec les noms de son jour.

> **Piège de lecture, qui se superpose à celui de D-12.** Dans les journaux (`tasks/`, CHANGELOG), `apps/web-v3` désigne l'ancienne refonte AVANT le 2026-09-07, et ce chantier entre le 2026-09-07 et le 2026-09-10. Ils ne sont pas réécrits.

## D-36 · Le rail de la Lentille compacte dans l'EN-TÊTE, jamais sur place — la géographie iOS reprise pour de vrai (2026-09-12, #6103, décision #6070)

`#5946` avait fait compacter le rail SUR PLACE (72 → 30 px), hors flux, superposé à une tuile fantôme toujours GRANDE réservant la hauteur — un correctif qui tenait l'invariant « aucune rangée ne bouge » mais créait une bande VIDE (~130 px) entre l'en-tête et les filtres une fois défilé, que la cible iOS n'a pas. #6070 posait deux règles candidates ; celle-ci tranche : **le grand rail vit DANS la vue défilante et en SORT normalement**, comme tout contenu (`ConversationListView.swift:1659-1671`) ; **une bande compacte, la MÊME cellule (`ConversationRail`, `variant="pinned"`), prend la place du TITRE dans l'en-tête** une fois le grand rail sorti (`PinnedStoryTrailBand`, `StoryTrayView.swift:656-671`) — jamais les deux peints en même temps.

| | |
|---|---|
| observation | `useOutOfView` (`lib/view/use-out-of-view.ts`) — un `IntersectionObserver` sur le grand rail, racine = le scrollport ; AUCUN `scrollTop` lu à la main (contrairement à `useScene`, qui a besoin d'une valeur continue) |
| la cible arrive par une réf de RAPPEL | corrigé en revue : un `RefObject` en dépendance d'effet ne rend pas, et le grand rail QUITTE le DOM dès que son corpus visible est vide (échec à cache vide, dernière conversation archivée). Mesuré sur la première forme : `pinned` restait `true` sur un rail disparu ⇒ titre effacé (`opacity: 0`, `aria-hidden`) au-dessus d'une bande qui ne peint rien — un en-tête VIDE. **Pas de cible ⇒ pas d'épinglage**, et l'effet suit chaque commit. Témoins : `use-out-of-view.test.tsx` (la règle), `check-gateway-build.mjs` bloc 5 (ce que l'écran d'échec montre) |
| bascule | `resolveOutOfView` (`lib/view/out-of-view.ts`) — hystérésis à deux seuils, JAMAIS un seul point (`PINNED_RAIL_REVEAL_RATIO = 0`, `PINNED_RAIL_RELEASE_RATIO = 0,25`, `lib/lens/pinned-rail.ts`) |
| croisement titre ↔ bande | un fondu d'OPACITÉ seul (règle 32 — jamais la géométrie), `HIDDEN_CHROME_EASE_OUT_MS` (250 ms, réutilisé du chrome du fil — c'est aussi du chrome), coupé par `motion-reduce:` |
| focus | `ListHeader` mémorise la conversation focalisée dans la bande AVANT son démontage (`onFocusCapture`, jamais `document.activeElement` après coup, déjà réinitialisé) et le reporte sur la tuile jumelle du grand rail, qui n'a lui jamais quitté le DOM |
| cible tactile | `RailTile` porte désormais `min-width`/`min-height: 44px` avec marge NÉGATIVE compensant exactement l'écart à la cellule — jamais en élargissant `[data-rail-tile]`, que `check-lens.mjs` mesure pour la compaction. La FENTE du titre porte le plancher jumeau (`min-h-11`, `ListHeader`) : sans lui la bande, dont `overflow-x-auto` rend les DEUX axes défilants, débordait d'un pixel d'un `h1` de 42 px (mesuré `scrollHeight` 43 / `clientHeight` 42). L'en-tête reste à 64 px, déjà fixé par le bouton Progression |

Deux extractions accompagnent la reprise (le fichier de route reculait plutôt qu'il n'avançait) : `components/conversation-rail.tsx` (une cellule, deux géographies — `grande`/`pinned` — et l'exclusion des archivées, un seul site) et `components/list-header.tsx` (la bascule). `check-lens.mjs` § 7 et `check-gateway-build.mjs` bloc 4 (réancré DANS le scrollport, `#contenu.top` invariant peuplé/vide) portent la preuve.

## D-37 · La langue d'origine d'un message est composée PAR MESSAGE — détection locale, puis choix, puis rang 1 du Prisme du LECTEUR ; jamais le rang 1 seul — 2026-09-12 (#5828)

`thread.tsx:255` posait `originalLanguage: readerLocale` — le rang 1 du Prisme du LECTEUR, figé une fois pour tout l'écran — et la passerelle FAIT CONFIANCE à cette revendication (`MessagingService.ts:328-336`, elle ne détecte que si le client omet la clé) : un lecteur `['fr','en']` qui écrivait en anglais étiquetait son propre message `fr`, corrompant le pipeline NLLB pour TOUS les destinataires. Cette phrase de D-28 (« `originalLanguage` à l'envoi = rang 1 du Prisme du lecteur… ») devient donc FAUSSE et se lit désormais à la lumière de celle-ci.

**La loi, miroir pur de `ConversationViewModel+Send.swift:66-71`** (`composeLanguage`, `src/lib/send/compose-language.ts`) : un CHOIX manuel explicite (la pastille) → une DÉTECTION suffisamment sûre (`≥ 4` lettres, confiance `≥ 0,86`, miroir `LanguageDetection.swift` + `ComposerLanguageResolver.confidenceFloor`) → le rang 1 du Prisme du lecteur (repli, jamais le résultat) → `'fr'`. Chaque candidat est normalisé ET revalidé contre le catalogue supporté (`isSupportedLanguage`) — un code que la passerelle refuserait (`CommonSchemas.language`) ne peut jamais sortir de cette fonction.

**Le détecteur est un PORT injectable** (`src/lib/send/language-detector.ts`) : l'API expérimentale `LanguageDetector` du navigateur SEULEMENT si `availability() === 'available'` (jamais un téléchargement de modèle déclenché par une frappe), sinon une heuristique locale SANS DÉPENDANCE (`stopword-language-detector.ts`, ~1,16 Ko gzip -9, chargée en chunk À LA DEMANDE) — écriture Unicode (arabe/kana/hangeul/han) puis mots-outils des six langues latines de la liste rapide iOS. `tinyld` (33 485 octets gzip -9, mesuré) est REJETÉ, même à la demande.

**Le hook `useComposeLanguage`** (`src/lib/view/use-compose-language.ts`) porte l'ÉTAT vivant : debounce 300 ms, verrou à 10 mots (au-delà, la détection est définitive POUR CE MESSAGE), jeton de génération (un verdict d'une frappe périmée est jeté), et une langue COURANTE qui ne redescend jamais d'elle-même au rang 1 du lecteur.

**Le rang COURANT est le quatrième, et il manquait (revue-correction).** `ComposerLanguageResolver.resolve` rend `nil` = « current already wins » et son doc-comment le dit — « pill stays where it was (no flicker on 2-3 char noise) » (`ComposerModels.swift:141-142`) : ni un texte vidé (`TextAnalyzer.swift:104-119` vide la DÉTECTION, pas la pastille), ni un texte trop court, ni un envoi (`textAnalyzer.reset()` laisse `composerState.selectedLanguage`) ne ramènent iOS au Prisme du lecteur. La première forme web ne rendait COLLANT que le choix MANUEL : après un message anglais détecté, un « ok » de suite repartait étiqueté `fr` — le défaut de #5828 rejoué un message plus tard. Un verdict ADOPTÉ pose désormais la langue courante, comme `applyDetectedLanguage` (`UniversalComposerBar+Layout.swift:340-347`). Ordre servi : choix épinglé → détection adoptée → langue courante → rang 1 du lecteur → `'fr'`. Témoins : `use-compose-language.test.tsx` (« setText("") : la dernière langue ADOPTÉE reste », « après une détection anglaise, "ok" reste en », « une détection SOUS le plancher ne devient PAS le rang courant »), `composer.test.tsx` (« après un envoi détecté en anglais, un "ok" de suite part ENCORE en "en" »).

**Les six langues annoncées sont les six langues SERVIES — mesurées (revue-correction).** Les tables de mots-outils promettaient « les SIX langues latines de la liste rapide iOS » et les témoins n'en couvraient que DEUX (fr, en) plus les écritures : mesuré, l'espagnol, l'italien et le portugais rendaient `null` sur **quinze phrases ordinaires sur quinze**. Cause : la déduplication ne protège que des collisions DÉCLARÉES — un mot que deux langues emploient mais qu'une seule table nomme devient une PREUVE pour celle-là (`ma` italien seul, `qui` français seul, `lo` italien seul), et le reste des tables était trop maigre pour atteindre les deux coups exigés. Discipline posée : **un mot partagé se déclare dans CHAQUE langue qui l'emploie** (mieux vaut le perdre que le compter faux). Portée mesurée sur trente phrases : fr 5/5, en 5/5, de 5/5, it 4/5, es 3/5, pt 1/5, **zéro verdict faux** — l'espagnol et le portugais partagent l'essentiel de leurs mots-outils, et `LATIN_MIN_HITS` reste à 2 : un silence retombe sur le rang 1 du lecteur (le comportement d'avant #5828), un verdict FAUX corromprait le pipeline NLLB de tous les destinataires. Le témoin porte un CLIQUET (plancher par langue, jamais un plafond) et l'invariant de sûreté sur les trente phrases, silences compris. Poids : 1,16 → 1,95 Ko gzip -9, plafond 3 inchangé.

**Le détecteur CASCADE, il ne parie pas (revue-correction).** `defaultLanguageDetector` rendait l'adaptateur navigateur dès que l'objet `LanguageDetector` EXISTAIT — or cet adaptateur rend `null` tant que `availability() !== 'available'`, l'état NOMINAL de Chrome tant que le modèle n'est pas téléchargé : l'app n'avait alors AUCUNE détection, en silence, sur le navigateur même de la recette (motif « le mécanisme est écrit, testé, et jamais activé »). L'heuristique locale est désormais le SECOND étage de tous les cas — API absente, `'downloadable'`, sonde en erreur, verdict `und`. `Composer` l'expose par une pastille (`composer-language-pill.tsx`, ≥ 44×44, encre `--color-ios-ink` DANS LES DEUX SCHÉMAS — `--accent` comme encre a été mesuré À 1,99:1 sur un lavis à 15 %, sous la barre AA) et une feuille RÉUTILISÉE (`language-sheet.tsx`, `title`/`selected` désormais paramétrables) — jamais une jumelle.

**La rangée haute est ANCRÉE EN TÊTE, et le bouton s'élargit à sa capsule (revue-correction).** iOS range ses outils dans le groupe MENANT — `◎ 👁 ✦ 😐 [🇫🇷 FR ⌄]`, la pastille à x≈158 pt APRÈS quatre icônes, `topToolbar` finissant par `Spacer()` + le compteur (capture `ref-native-02-thread.png`) : l'ancrer à droite plaçait la seule occupante d'aujourd'hui à l'opposé de sa place iOS et condamnait les quatre contrôles à venir. Et la première forme du bouton (`grid size-11`, 44×44 FIXE) laissait sa capsule de ~62 px DÉBORDER : rectangle du `<button>` inchangé, donc cible, `opacity` et non-recouvrement tous verts pendant que le chevron SORTAIT DE L'ÉCRAN (mesuré 334 → 406 px pour un cadre de 390, dans les deux schémas). `min-h-11 min-w-11` fait coïncider la cible et la peinture ; `check-thread-chrome.mjs § 6` mesure désormais la RÉUNION bouton+descendants contre le cadre, jamais le seul rectangle du bouton — **une cible qui mesure 44×44 ne prouve pas que ce qu'on VOIT tient dans l'écran**.

`useSend`/`performSend` reçoivent désormais la langue PAR MESSAGE (`send(text, attachments, replyTo, language)`), jamais figée par écran ; `perform-send.ts` reste inchangé (il transmet ce qu'on lui donne). Témoins : `compose-language.test.ts`, `stopword-language-detector.test.ts`, `language-detector.test.ts`, `use-compose-language.test.tsx`, ajouts à `composer.test.tsx`/`auth-screens.test.tsx`, `check-thread-chrome.mjs § 6` (le pixel : une bulle envoyée en anglais porte `lang="en"`, deux schémas).

## D-38 · Le rail de la Lentille porte des STORIES, et l'entrée « moi » n'existe que quand elle dit quelque chose — 2026-09-12 (#5652)

Le rail en tête de liste montrait des CONVERSATIONS (un raccourci vers le fil) : ce n'est pas l'objet d'iOS. `StoriesVivantsRail` (`apps/ios/Meeshy/Features/Main/Lentille/Chrome/StoriesVivantsRail.swift`) rend les STORIES — « moi » d'abord, puis ≤ 6 auteurs — et son écart était le n° 7 de `targets/lentille.md`. La bascule est faite : `components/stories-rail.tsx` remplace `conversation-rail.tsx` + `rail-tile.tsx` (supprimés) dans les DEUX géographies, la loi est un miroir vecteur à vecteur de `LentilleRailPolicy` (`lib/lens/rail-policy.ts` : troncature `list.rail.maxEntries`, masquage si vide, anneau accentué ssi `isLive || hasUnviewed`), et le corpus vient de `GET /api/v1/social/posts?scope=stories&projection=tray` + `?scope=statuses` (`lib/api/stories.ts`, décodage par `select`, erreur ≠ vide).

| | |
|---|---|
| cotes | `list.rail.{size,ring,paddingVertical,maxEntries}` (48 / 3,5 / 8 / 6) lues dans `packages/shared/design/lentille-tokens.json` À L'EXÉCUTION — aucun littéral dans la peau (D-4). La cote COMPACTE (`.storyTrayCompact` = 36) n'a pas de jeton généré : elle est GARDÉE par extraction Swift dans `check-curve.mjs` (PARTIE 5 bis), jamais laissée en littéral libre |
| ce que la peau SERT | la couverture de la dernière story (`previewUrl ?? avatarUrl`, initiales EN DESSOUS comme repli — jamais un cercle vide, jamais un `src=""`) et le badge d'humeur DÉCORATIF (`aria-hidden`, `pointer-events: none`, diamètre `ring × 2 + tags.emojiSize`). Sans eux, deux ports descendaient leur cascade pour ZÉRO pixel (cycle 122 du `CLAUDE.md`) |
| ce qu'elle ne peint PAS | le tap sur une pastille (viewer `/story/:postId`), le tap sur « moi », les badges (+) et d'humeur COMME BOUTONS (composeurs) : aucune porte n'existe, donc aucun contrôle — la forme qu'iOS rend lui-même quand `onSelect == nil` (règle #5765). Issues compagnons |
| **l'entrée « moi »** | iOS la rend dès qu'un compte est connecté PARCE QUE c'est un bouton à deux portes. Sans ces portes, une pastille « moi » sans story ni humeur ne porte NI information NI geste, et vole la bande que l'écran de démarrage doit récupérer (mesuré : `check-gateway-build.mjs` bloc 4, décalage vide 163 px contre 139 px peuplé). `useStoryRail` ne la compose donc que quand elle porte une story ACTIVE ou une humeur — la LOI, elle, reste le miroir exact d'iOS, c'est l'ADAPTATEUR qui déclare ce qu'on montre. **Elle redevient inconditionnelle le jour où le composeur de story lui rend son geste** |
| temps réel | `story:created/updated/deleted/viewed` et `status:created/updated/deleted` invalident une clé-préfixe chacun (`api/socket.ts`) — jamais une reconstruction locale du regroupement, dont `decodeStoryGroups` est le site unique |

**Les deux boutons d'en-tête ont leur effet** (miroir `ConversationListView+Overlays.swift:1056-1087`) : « Créer un lien de partage » ouvre une feuille des conversations ÉLIGIBLES (`lib/view/share-link-eligibility.ts`, miroir `canCreateShareLink` — direct jamais, groupe ≥ modérateur), crée le lien (`POST /api/v1/links`) et l'annonce dans une région live ; « Nouvelle conversation » ouvre `/conversations/new` (recherche par `GET /api/v1/directory/people` — la route CIBLE, pas l'alias en sursis `/users/search`, dont le schéma ne sert même pas `avatar` ; création par `POST /api/v1/conversations`). Les cercles sont à `size-11` (44) et non aux 40 d'iOS : la charte du dépôt ne recopie pas un écart de cible sous la cible tactile.

Preuves : `rail-policy.test.ts`, `stories.test.ts`, `stories-rail.test.tsx`, `list-header.test.tsx`, `query.test.tsx` (l'entrée « moi »), `socket.test.ts`, `check-curve.mjs` (la cote 36), `check-lens.mjs` § 7 (cotes lues dans le jeton, une seule région « Stories », 0 focalisable dans la bande), `check-list-actions.mjs` § 10 (« 0 contrôle sans gestionnaire » : feuille ouverte + retour annoncé, routes montées, rail sans contrôle mais avec anneau/humeur), `check-gateway-build.mjs` (stub `/social/posts` + AUCUNE fuite vers la production).

## D-39 · Une pièce jointe s'élit par son CONTENU — `electDescription` pour le texte, `electAudio` pour le texte ET la piste, d'UNE seule descente — 2026-09-12 (#5805)

**Le constat.** Le fil rendait les pièces jointes sans descendre le Prisme : l'`alt` d'une image et la transcription d'un vocal restaient dans la langue de l'expéditeur, et la piste jouée n'était jamais la piste traduite — la classe de défaut que le `CLAUDE.md` racine nomme « une descente indépendante peut servir un texte français au-dessus d'une piste espagnole » (cycle 128).

**La règle.** `src/lib/view/media.ts` sépare l'élection par ce que la pièce EST, jamais par où elle s'affiche : `electDescription` élit le TEXTE (image, fichier) ; `electAudio` élit le texte ET la piste d'un vocal, la piste étant résolue à partir de la LANGUE DU TEXTE SERVI (`resolveAudioTrack`, jamais une seconde descente). `attachment-blocks`, `bubble` et `focal-row` consomment la MÊME élection, en rangée plate comme en bulle ; `lang=` suit systématiquement la langue servie.

**Trouvé en revue — deux fonctions, pas une.** La première forme livrait un `electMedia` unique que l'image appelait aussi : une image recevait une « piste audio servie » dont l'URL était son propre PNG, et le dépouillement `transcriptTranslationTracks` tournait à chaque rendu de chaque image pour une valeur jetée. Un nom qui promet une piste et rend un fichier image est une seconde langue pour la même chose (directive porteur 3b) — la frontière retenue est donc le CONTENU, pas l'écran.

**La seconde forme d'URL de pièce jointe, trouvée en revue.** `resolveAttachmentSrc` (`media-url.ts`) ne savait résoudre que la forme déjà « chemin » (`/2026/09/…`) ; la passerelle sert AUSSI une clé de stockage NUE (`2026/09/<id>/photo.png`, sans barre initiale) — mesuré le 2026-09-12 sur `gate.staging.meeshy.me` : quatre pièces nues sur cinq. Rendue telle quelle, le navigateur la résolvait contre le chemin du DOCUMENT, où le SPA répond `200 text/html` — un échec de RÉSOLUTION déguisé en fichier corrompu, indiscernable à l'écran d'une pièce réellement abîmée. La clé nue passe désormais par la route de flux mesurée (`GET /api/v1/attachments/file/*`, `services/gateway/src/routes/attachments/download.ts:266-273`) — `resolveAttachmentSrc` reste le site UNIQUE de la résolution et couvre enfin les DEUX formes réelles.

**Ce qui est gardé.** `measure-weight.mjs` cherche désormais le vocabulaire du lecteur audio (`"Lire l'audio"`) DANS les fichiers critiques eux-mêmes : sa présence prouverait que le lecteur a atteint la première peinture au lieu du chunk de route, quelle que soit la marge de poids restante — un gate de SOMME ne dit rien sur l'EMPLACEMENT. `scripts/lib/check-media.mjs` porte deux témoins de rang (sur un rang AUTRE que le premier) et, depuis #6135 (revue-correction), rend dans son message d'ÉCHEC les cinq premières couleurs du cœur échantillonné et l'état complet de l'`<img>` (`complete`, `naturalWidth`, rect contre celui de la figure, styles calculés) — avant, une couleur dominante et un compte de teintes ne permettaient pas de distinguer un glyphe posé par-dessus d'une image absente ou d'un voile translucide, et trois hypothèses avaient dû être falsifiées À LA MAIN faute de ce relevé.

**Ce qui reste hors de ce lot** (issues compagnons, dimension 9/13) : les DEUX coques (Android QEMU, simulateur iOS dédié) n'ont pas rejoué cette correction alors qu'elle les vise directement — une coque parle par `capacitor://localhost`, où une clé nue ne pouvait rien charger avant #5805 ; grille 2/3/4+ et badge `+N`, vidéo, visionneuse plein écran, karaoké segment par segment, vitesse, scrub, carrousel multi-pistes, ThumbHash restent hors périmètre.

**Mesuré.** 36,91 Ko avant le premier pixel (plafond 40) — le lecteur audio vit dans le chunk de ROUTE, gardé (jamais affirmé) par le témoin de littéral ci-dessus.

## D-40 · UNE connexion socket.io par IDENTITÉ, chargée APRÈS la première peinture ; l'application des événements sur le cache est une COUCHE PURE séparée du transport — 2026-09-12 (#5793)

**Le constat.** Aucune liaison temps réel : la liste et le fil ne bougeaient qu'au rechargement, `typing` n'existait QUE sous fixtures (`query.ts:91`, `apiConfig.source === 'fixtures'`) et valait `false` dès que la donnée réelle était branchée (D-26/D-27).

**La règle.** `src/lib/net/socket.ts` porte une fabrique INJECTABLE (`SocketFactory`) — `createSocketIOClient` sur `socket.io-client` en production, `createFixturesSocketClient` (`fixtures-realtime.ts`) sous fixtures, pour que les gates restent sans réseau. `src/lib/api/realtime.ts` tient l'AMORÇAGE : une connexion PAR IDENTITÉ (`connectedToken` comme clé — un jeton différent, changement de compte sur le même navigateur D-6, reconstruit la connexion plutôt que de la réutiliser à tort), ouverte quand `sessionStore` passe `authenticated`, fermée sur `anonymous`. `realtime-apply.ts` est une couche PURE d'application des événements (`message:new`, `conversation:unread-updated`…) sur le cache TanStack — jamais un second moteur de cache. `typing-store.ts` est un magasin de frappe BORNÉ (minuteur 15 s), consommé par la Lentille (`lens-row.tsx`, `sameRowProps` compare `typist` pour ne re-rendre QUE la rangée concernée) et le fil (`typing-dots.tsx`, atome partagé miroir de `LentilleTypingDots`).

**Trouvé en revue — un budget qui NOMME un chunk « jamais dans le socle » ne le garantit pas.** `budgets.json` déclarait le chunk `realtime` `dynamic_only: true` en toutes lettres pendant que `routes/thread.tsx` l'importait STATIQUEMENT via `view/use-typing-emitter.ts` (qui importait le POSSESSEUR de la connexion au lieu du port `api/typing-emit.ts`) : ouvrir une conversation aurait exigé 17 Ko gzip de plus (`socket.io-client` inclus) que ce que la première peinture mesurait. `measure-weight.mjs` porte désormais une vérification d'ARÊTE — il relit les `import … from "./…"` statiques de CHAQUE fichier produit et échoue si un chunk marqué `dynamic_only` a un importeur statique, quelle que soit la promesse du libellé.

**La sécurité de la poignée de main.** Le jeton voyage dans l'option `auth` de socket.io, jamais dans une URL ni un en-tête impossible ; `auth:token-expired`/`auth:session-revoked` produisent le MÊME geste qu'un 401 HTTP. Aucun diff sous `services/gateway` ni `packages/shared`.

**Ce qui reste hors de ce lot** (issues compagnons, dimension 3/5/9/13) : rien n'a été profilé sur ce que la connexion retient après un changement d'identité ou une longue session (le magasin de frappe n'est borné que par son minuteur) ; l'indicateur de frappe n'est annoncé à aucun lecteur d'écran (verser « X écrit » dans la région live du fil doublerait une annonce déjà visible — D-11) ; aucune session n'a ouvert de connexion depuis une coque (QEMU, simulateur dédié) — une coque viserait la PRODUCTION (`apiConfig.base`), jamais essayé ; `conversation:updated` (Prisme d'aperçu résolu serveur), `message:translation` (un message reçu reste dans la langue de l'expéditeur jusqu'au prochain refetch) et le roster multi-frappeurs (une seule personne annoncée par conversation) manquent encore au fil ; un lien direct `/c/<identifier>` désaccorde le paramètre de route et l'ObjectId attendu par le socket.

**Mesuré.** `socket.io-client` + dépendances : 12,41 Ko gzip (chunk `socketio`, vendor, plafond 14) ; amorçage temps réel propre (`realtime.ts` et ses dépendances, hors vendor) : 4,41 Ko gzip (chunk `realtime`, plafond 6, `dynamic_only`). Première peinture INCHANGÉE (37,05 Ko, sous le plafond 40) : les deux chunks sont chargés en `import()` après le premier rendu, jamais dans le socle — désormais gardé par l'arête d'import, pas seulement affirmé. Aucune requête réseau déclenchée par une écriture socket (compteur de `fetch` = 0, témoin).

## D-41 · La protection déclarée sur une PIÈCE JOINTE masque la PIÈCE, pas le message — et sa loi descend dans `packages/shared` — 2026-09-12 (#6189)

**Le constat.** `MessageAttachment` porte ses PROPRES `isViewOnce` / `isBlurred` /
`effectFlags`, indépendants de ceux du message qui la porte. Le gateway compose
depuis toujours le verdict des deux niveaux par un OU (`routes/posts/core.ts` :
`protectedPreview(message) !== null || maskedAttachment(attachment)`), iOS lit la
déclaration de la pièce (`FocalAttachmentBlock.swift:130`), et `apps/web-v2` ne
la lisait **nulle part** : sonde du 2026-09-12, une pièce `isViewOnce: true` sur
un message ordinaire rendait son `<img>` et l'URL du fichier en clair
(`url_en_clair=true img=true voile=false`). C'est la jumelle du cycle 125 —
« une protection de contenu se mesure sur tout ce que la charge TRANSPORTE ».

**Trois décisions, et leurs raisons.**

**1. La loi descend dans `packages/shared/utils/attachment-protection.ts`.** Elle
vivait dans `services/gateway/src/services/notifications/NotificationService.ts`,
donc hors de portée des clients — c'est CE domicile, et non un oubli de câblage,
qui rendait la garde web impossible à écrire. Une loi qui gouverne trois clients
ne peut pas habiter un service (§ Single Source of Truth). Le gateway la
RÉEXPORTE, et seulement la réexporte : un second corps serait deux lois pour une
règle (`tasks/lessons.md` § 586). Effet de bord mesuré, et bienvenu :
`NotificationService.ts` passe de 6 108 à 6 089 lignes contre un cliquet de 6 119.

**2. Le masque porte sur la PIÈCE, jamais sur le message entier.** Voiler tout le
bloc de contenu quand une seule pièce est déclarée serait plus restrictif — donc
tentant — mais cacherait un TEXTE que rien ne protège, et divergerait d'iOS, qui
voile le bloc de la pièce. La question se pose donc **pièce par pièce** : une
pièce déclarée parmi cinq est la seule retenue. Deux fautes symétriques sont
gardées par témoin : `attachments.some(masked)` retiendrait les cinq,
`attachments[0]` en laisserait sortir quatre.

**3. Le substitut ne transporte que le TYPE, et sa taille est FIXE.** Ne sortent
ni le fichier, ni son URL, ni sa vignette, ni son NOM d'origine, ni sa TAILLE, ni
sa durée — la liste du cycle 125. Sort le type (photo, vocal, fichier), qui ne
dit rien du contenu et rend le substitut lisible, comme la bannière serveur qui
sert « 👁️ 🖼️ ». La tuile est un carré de 140 pt : réserver le ratio réel
éviterait un saut de mise en page (dimension 4), mais ferait sortir une mesure de
la pièce — et un carré ne saute pas non plus, puisqu'il ne dépend de rien qui
arrive plus tard.

**Ce que ce lot NE fait pas, délibérément.** Aucune affordance de révélation. La
fenêtre de 5 s d'iOS (`isRevealed`) suppose une consommation serveur PAR PIÈCE
que le web n'appelle pas encore ; un bouton qui ne révèle rien serait un contrôle
inerte, ce que la loi 4 interdit. Le suivi est dans #6189.

**Et `EPHEMERAL` ne masque pas une pièce** — le masque est exactement
`VIEW_ONCE | BLURRED`. L'éphémère se juge au niveau MESSAGE, sur son horloge
(`protectionOf` → `expired`) : une pièce d'un message éphémère encore valide se
lit normalement. Une loi écrite `effectFlags !== 0` passerait tous les autres
témoins et retiendrait ces médias-là ; c'est pourquoi le témoin de discrimination
existe.

## D-42 · Le roster de frappe est une LOI DE LIBELLÉ partagée, jamais un booléen ; l'adoption d'un `lastMessageId` neuf compose une LIGNE NEUTRE depuis le contrat, jamais une recopie de l'ancienne — 2026-09-12 (#6171)

**Le constat.** #6171 croyait manquer trois familles entières (`conversation:updated`, `message:translation`, le roster) ; la revue de #5793 en avait déjà livré la couche pure des deux premières. Ce qui manquait vraiment, mesuré : (G1) `thread.tsx` ne rendait que `typists[0]` — le magasin (`typing-store.ts`) porte déjà PLUSIEURS entrées par conversation, seule la LECTURE tronquait ; (G2) un `message:new` ne rétractait pas la frappe de son auteur ; (G3) l'adoption d'un `lastMessageId` AUTRE que celui connu remplaçait la carte serveur sans jamais réviser `lastMessage.content`, laissant la ligne décrire un original PÉRIMÉ sous une traduction NEUVE ; (G8) l'ancrage du fil à l'apparition de la cellule de frappe était clé sur l'identité du premier frappeur, donc se rejouait à chaque relève de meneur.

**La loi de libellé (G1).** `src/lib/view/typing-roster.ts` — deux fonctions PURES, miroir `TypingIndicatorBubble.label` (iOS) : `typingAnnouncement(names)` (0 → `''`, 1 → « X écrit », 2 → « X et Y écrivent », 3+ → « Plusieurs personnes écrivent », JAMAIS une énumération) et `typingLead(entries)` (la PREMIÈRE entrée, le meneur — jamais un tri par nom). Elle vit dans `lib/view/` parce qu'elle sera réutilisée par le bouton « revenir en bas » et la Rivière (issues compagnons) — une seule loi, jamais une réécrite par surface. La cellule elle-même est extraite dans `components/typing-roster-cell.tsx` pour rester testable par `renderToStaticMarkup` (motif `thread-chrome.tsx`), et `routes/thread.tsx` reçoit désormais `useThreadTyping()` (`lib/view/use-thread-typing.ts`, extrait de l'écran à 950 lignes) qui distribue le ROSTER ENTIER, plus jamais `typists[0]`.

**L'ancrage sur l'APPARITION, pas sur l'identité (G8).** L'effet qui pousse le fil en bas à la première frappe est désormais clé sur `hasTypists = typists.length > 0` (un booléen dont l'identité ne change qu'aux transitions 0↔1+), jamais sur `typistId` : un keepalive qui relève le meneur (0→1 autre) ou un second frappeur qui rejoint (1→2) ne rejoue plus l'ancrage.

**La ligne neutre (G3).** `neutralLastMessageFromPreview()` (`realtime-apply.ts`) compose un `Message` complet depuis `ConversationUpdatedEventData` quand `next.lastMessage?.id !== data.lastMessageId` — miroir `LastMessageFacet.adoptLastMessage` (iOS). Chaque champ vient soit de la charge, soit d'un défaut que le CONTRAT lui-même déclare (« clé absente = un FAIT », doc-comment de `ConversationUpdatedEventData`) : ce n'est pas « inventer ce que la source ne porte pas » (leçon du dépôt), c'est composer depuis ce qu'elle transporte réellement. `messageType` (le seul champ que le contrat ne transporte pas) est dérivé du `mimeType` de la première pièce jointe — documenté comme non consommé par le rendu actuel de la Lentille, jamais deviné en silence.

**La rétractation par `message:new` (G2).** `api/socket.ts` retire la frappe de SON AUTEUR après `applyMessageNew`, sur les DEUX espaces d'ids que le contrat admet (`senderId`, `sender?.userId`) — jamais dans `realtime-apply.ts`, qui reste une couche PURE sans dépendance au magasin de frappe (D-40).

**Le corpus dédié.** `fixtures-live.ts` (`c-live`, « Recette temps réel ») et une chronologie DONNÉE dans `fixtures-realtime.ts` (`LIVE_SCHEDULE`, rejouée par `setTimeout` depuis `connect()`) — jamais dans `c-deploiement`, mesuré par trois autres gates à un instant fixe. Le bouchon distingue désormais deux familles d'événements dans UNE table : `kind: 'once'` (`atMs`) et `kind: 'repeat'` (`everyMs`, le keepalive d'Amina).

**Mesuré.** `bun test` : 2150/2150 verts. `check-thread-states.mjs` (nouveau : `lib/check-realtime-events.mjs`, deux runs clair/sombre) : le rang du lecteur bascule sans requête `/messages` (compteur de fetch = 0), l'adoption sert le français au rang 1 avec `lang="fr"`, le roster affiche « Kwame Mensah écrit » puis « Kwame Mensah et Fatou Bâ écrivent » (avatar du MENEUR) puis retombe un par un à l'expiration. Chunk `realtime` : 5,81 Ko gzip (plafond 6, `dynamic_only` toujours vrai) ; première peinture inchangée (38,04 Ko, plafond 40).

**Ce qui reste hors de ce lot** (issues compagnons, § 9 de la spécification) : le bouton « revenir en bas » et la pastille de synchronisation ne portent pas encore la frappe (la loi `typingAnnouncement` est écrite pour qu'ils la réutilisent) ; la tenue PLATE de la cellule reste avec libellé visible tant que #6172 (région live) n'est pas tranchée.

**Revue-correction (2026-09-12) — ADOPTER N'EST PAS REMONTER, et adopter JETTE la carte.** Deux moitiés de l'adoption manquaient, et c'est l'adoption elle-même qui les a rendues mordantes :

1. **La garde monotone du RANG** — `acceptsLastMessageAt()` (`realtime-apply.ts`). `lastMessageAt` s'écrivait SANS condition : deux `message:new` arrivés dans le désordre faisaient REDESCENDRE une conversation vivante dans la liste, qui trie sur ce champ. Le contrat l'exige nommément des clients (« Les clients tiennent une garde monotone sur le groupe d'aperçu … Les émetteurs message-driven l'omettent délibérément : **ce sont eux que la garde monotone protège** », doc-comment de `previewRecalculated`, `packages/shared`), et iOS la tient par son `>` strict (`ConversationListViewModel.swift:1100`) avec pour UNIQUE exception le drapeau `previewRecalculated` (`:1214-1216`). Le défaut PRÉEXISTAIT à #6171 ; l'adoption l'a aggravé en faisant descendre aussi le CONTENU. Le témoin qui compte est celui du RECUL : à horodatage qui AVANCE, la garde juste et l'absence de garde rendent le même verdict (forme du témoin de rang, leçon 261).
2. **L'adoption JETTE la carte de l'ancien message** — `lastMessageTranslations`/`lastMessageOriginalLanguage` sont retirées AVEC le message quitté, comme `adoptLastMessage` remet à neutre les treize champs de la facette (`LastMessageFacet.swift:170-182`) ; les blocs tri-état les reposent ensuite depuis la charge. Sans ce retrait, un évènement nommant un AUTRE message sans son groupe Prisme laissait la ligne servir la traduction de l'ANCIEN par-dessus l'original du NOUVEAU — le mélange exact que le tri-état existe pour empêcher. Les trois émetteurs réels posent toujours les trois clés (`null` quand il n'y a pas de carte), donc rien ne change pour eux : ce qui disparaît est la dépendance à l'ORDRE des blocs, et c'est elle que les prochains écrans recopieraient.

Deux témoins de forme corrigés dans la même passe : le témoin de rangée (`lens-row.test.tsx`, T6) restait VERT sans l'adoption (il lisait `lastMessageTranslations`, qui se patche de toute façon) — il rend désormais un GROUPE et vérifie le préfixe d'auteur, seul rendu qui vienne de la ligne neutre ; et le gate navigateur exigeait `contrast !== null` là où la ligne 2 mesure 4,98:1 en clair et 9,98:1 en sombre — il exige l'AA, mesuré AVANT que la frappe ne prenne la ligne 2. `INSTANT` y est importé d'`instant.mjs` au lieu d'être recopié (une quatrième définition de l'instant des gates).

**Le budget `realtime` est à 5,90 Ko pour un plafond de 6,00** — et ce qui l'a rempli n'est pas la connexion mais le CORPUS DE RECETTE (`fixtures-live.ts` + `LIVE_SCHEDULE`), élagué d'un build `VITE_DATA_SOURCE=gateway` mais compté par `measure-weight.mjs`, qui mesure la variante fixtures. Le plafond n'a PAS été remonté : la prochaine chronologie va dans un chunk à elle (suivi).
