# apps/web-v3 — décisions

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
- `decision.ts` (`THREAD_RENDERABLE_MODES = ['focal', 'script']`) rend
  `script` DISPONIBLE au même titre que `focal`, quand `river` reste hors de
  ce catalogue de rendu — au même rang que `summary`, sous la loi D-8.

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
Le dossier `apps/web-v3/targets/` (captures clair/sombre, arbres
d'accessibilité, analyses par vue avec tableau iOS → web-v3) est la source de
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
