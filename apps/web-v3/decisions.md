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
(`ConversationView.swift:569`) et que web-v3 affiche déjà — une ligne dans
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
composant web-v3 aujourd'hui (`focal-row.tsx:119` ne lit `isBlurred` que pour
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
Les 61 vecteurs partagés (24 + 22 + 15) sont rejoués DEPUIS web-v3, À
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
