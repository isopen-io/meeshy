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

**Une correction n'est pas un second événement (2026-09-21, #7342).** Éditer un
message, un post ou un commentaire repousse sa notification sous la MÊME
identité, et la passerelle le déclare (`REPRODUCED_PUSH_FIELD`,
`packages/shared/types/reproduced-notification-push.ts`). iOS et Android
reçoivent d'abord une révocation ; le web non (#7308), si bien que le point 4
écartait la version d'après. Le worker (`corriger()`, `public/sw-push.js`)
remplace donc EN PLACE la bannière de cette notification quand elle est encore
affichée, ne fait rien quand elle dit déjà le texte d'après, et **n'en lève
aucune** quand elle ne l'est plus : un message plus récent de la conversation
l'a remplacée (même tag, #7340), le lecteur l'a fermée, ou il lisait
l'application. Le remplacement s'annonce, muet si le son est coupé — comme le
push nominal qui suit la révocation sur iOS.

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

## D-43 · Le roster de frappe est une LOI DE LIBELLÉ partagée, jamais un booléen ; l'adoption d'un `lastMessageId` neuf compose une LIGNE NEUTRE depuis le contrat, jamais une recopie de l'ancienne — 2026-09-12 (#6171)

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

## D-42 · Une pièce VIDÉO rend un repli lisible ; la LECTURE reste hors tranche, à sa propre issue — 2026-09-12 (#6193)

**Le constat.** `kindOf` (`lib/view/message.ts`) sait rendre le verdict `'video'`
depuis toujours ; `Attachments` (`attachment-blocks.tsx`) ne traitait que
`audio` / `image` / `file` et finissait par `return null`. Une pièce vidéo
reçue dans un fil ne rendait donc **rien** : pas de widget, pas de repli, pas
de libellé — la bulle affichait un vide, et rien ne disait qu'un média avait
existé. La vidéo était déclarée HORS TRANCHE par le doc-comment du fichier
(#5805 §9), et c'était un choix défendable ; mais `return null` n'est pas une
mise hors tranche, c'est une perte SILENCIEUSE — les deux se distinguent par
ce que voit l'utilisateur.

**La décision : `VideoFallback` rend le repli MAINTENANT ; la LECTURE reste
hors tranche, et entre dans le LOT SUIVANT (une issue à part).** Le repli
porte ce que le dépôt connaît déjà sans rien décoder : le TYPE (glyphe
`videoCamera` du jeu d'écran `glyphs-thread-states.ts`, déjà chargé avec le
chunk du fil — aucun octet neuf au socle), le NOM d'origine quand il existe,
et la DURÉE (`attachment.duration`, en `m:ss`) quand elle est connue, la
TAILLE servant de dernier recours sinon. Aucun de ces trois champs ne
suppose un poster, un `<video>` ou une visionneuse plein écran — les
construire est un lot distinct (poster, lecture inline, plein écran), suivi
par une issue compagnon plutôt que mêlé à ce correctif borné.

**Pourquoi ne pas construire la lecture ici plutôt que d'ouvrir un suivi.**
La lecture vidéo touche une surface bien plus large que ce fichier —
`<video>` inline, poster généré, visionneuse plein écran, éventuellement le
même pipeline Prisme que l'audio pour une piste sous-titrée — et le mélanger
à un correctif de perte silencieuse aurait fait grossir un lot borné en
chantier ouvert. Le repli, lui, ne ment à personne : il ne prétend jamais
pouvoir lire le fichier, il dit seulement qu'il existe.

**Ce que le repli ne fait PAS, et pourquoi ce n'est pas un mensonge.** Il
n'affiche aucune vignette ni aucune image de prévisualisation — la
génération d'un poster suppose de décoder la première frame, hors de portée
d'un composant qui ne fait que lire les métadonnées déjà servies par
l'API. Un glyphe générique + un nom + une durée ne prétend pas être une
vignette : contrairement à un `<video>` sans `src` ou une image cassée, il
n'affirme rien qu'il ne tienne pas.

## D-44 · Le cache de la Lentille est une suite de PAGES, jamais un tableau — et toute forme persistée qui change bump `CACHE_SCHEMA` — 2026-09-12 (#6195)

**Le constat.** `GET /api/v1/conversations` sert une pagination par curseur COMPLÈTE depuis mai 2026 — `before=<id>` borne sur `lastMessageAt < curseur` (`services/gateway/src/routes/conversations/core-list.ts:237-247`), le corps porte `cursorPagination` SIBLING de `data` (`:916-937`), et le transport de la v3.1 le remontait déjà (`lib/api/http.ts:97`). iOS le consomme (`ConversationService.listPage`, `ConversationListViewModel.loadMore`). **Le web appelait la route UNE fois, sans paramètre** : au-delà de 30 conversations, la Lentille s'arrêtait à sa première page et rien ne le disait.

**La décision.** `['conversations']` devient une requête INFINIE (`useInfiniteQuery`) dont le cache porte `InfiniteData<ConversationsPage>` — plus jamais `readonly Conversation[]`. Les conséquences, toutes assumées et toutes centralisées :

- **UN site lit, UN site patche.** `findCachedConversation()` et `patchConversation()` (`lib/api/conversations.ts`) sont les SEULS à connaître la forme du cache ; `conversation-actions.ts`, `realtime-apply.ts` (quatre patchs), `perform-send.ts` et `conversationQuery().initialData` passent par eux. Un futur changement de forme se paiera dans deux fonctions, pas dans vingt appelants — c'est ce qui a rendu ce lot tenable, et c'est la raison pour laquelle il ne faut jamais lire `getQueryData(CONVERSATIONS_QUERY_KEY)` en direct.
- **L'aplatissement est une FONCTION DE MODULE**, jamais une lambda en ligne : `flattenConversationPages` (`lib/api/conversations-pages.ts`), servie comme `select` — une lambda neuve à chaque rendu empêcherait `QueryObserver` de mémoriser le résultat.
- **La garde « zéro progrès » d'iOS** (`ConversationListViewModel.swift:1858-1895`, écrite après une boucle infinie de mai 2026) est portée dans `nextConversationsCursor()` — le site que TanStack consulte. Six refus : `hasMore` faux, `nextCursor` absent, curseur STAGNANT, page VIDE, et aucun id neuf dans la page arrivée.

**`CACHE_SCHEMA` — la seconde cause de purge, INDÉPENDANTE de l'identité.** Le buster du cache persisté était `${__APP_VERSION__}:${userId}` : il protège du compte SUIVANT sur le même navigateur (D-6), jamais d'un changement de FORME. Un cache écrit avant ce lot et restauré après aurait fait lever `select` sur le `.pages` d'un tableau qui n'en porte pas. `CACHE_SCHEMA` (`lib/api/query-client.ts`) entre dans le buster et se bump **à tout changement de forme persistée**, sans attendre un changement de version ni d'identité. C'est une dette de coordination, pas une commodité : l'oublier rend l'écran blanc au seul lecteur qui avait déjà un cache.

**La sentinelle est GÉNÉRIQUE, et le fil la copiera.** `useLoadMoreSentinel` vit dans `lib/view/`, pas dans `lib/lens/` : un `IntersectionObserver` à `rootMargin` bas = 5 × la hauteur de rangée, qui délègue au navigateur ce qu'iOS calcule à chaque `onAppear` (motif `useOutOfView`, #6103). **Elle n'est armée que si au moins une rangée est RENDUE** (revue-correction) — iOS déclenche `loadMore()` depuis l'`onAppear` d'une rangée, donc un filtre qui n'en rend aucune ne charge rien. Sans cette garde, un filtre vide posait la sentinelle en haut d'un champ vide, immédiatement intersectée, et l'écran vidait le corpus ENTIER du compte en autant de requêtes séquentielles — pour rester vide.

**Le tirer-pour-rafraîchir est une LOI PURE plus un hôte de geste.** `nextPullPhase`/`releasePull` (`lib/view/pull-to-refresh.ts`) sont le miroir vecteur à vecteur de `MeeshyRefreshableScroll.next(pullDistance:threshold:)`, seuil 90 gardé par `check-curve.mjs` (PARTIE 10). **Ce que l'hôte ne reprend PAS d'iOS, et pourquoi** : sur iOS, `distance 0 ⇒ pulling(0)` ne coûte rien, parce que `.refreshable` LIT le décalage d'un défilement qu'il ne bloque pas. Au navigateur, appliquer ce verdict puis `preventDefault()` GÈLE la liste — au sommet du scrollport, où le geste démarre, tout glissement vers le haut était intercepté. **C'est l'hôte du geste qui décide de ne pas appeler la loi**, jamais la loi qui s'écarte d'iOS. Corollaire opposable : le déplacement passe par `transform` (jamais `padding`/`margin`, l'invariant de `check-lens.mjs` § 9) et par DEUX régimes — doigt posé sans transition, retour animé (`pullTransform`).

**Le tirer refait trois corpus EN PARALLÈLE** — conversations (page 1 seule, curseur remis à zéro, fetch-then-replace : un échec laisse le cache exactement comme il l'a trouvé) et le PRÉFIXE `['stories']` (`STORIES_QUERY_PREFIX`, qui couvre plateau ET humeurs d'une invalidation). Un troisième corpus de stories n'aura qu'à DÉRIVER sa clé de ce préfixe pour être rafraîchi avec les deux premiers.

**Le prix, mesuré.** Première peinture 38,09 → 38,41 Ko gzip (plafond 40) : la machinerie infinie de TanStack entre dans le socle parce que `lib/api/query.ts` est partagé par la Lentille et le Fil. Ce n'est PAS « inchangé » — c'est +0,32 Ko pour une capacité que l'écran phare n'avait pas, et il reste 1,59 Ko de marge sous le plafond. **Coût de fonctionnement à connaître** : un rafraîchissement de la requête infinie (focus de fenêtre après 30 s, `invalidateQueries` à la ré-authentification, `conversation-new`) refait AUTANT de requêtes que de pages chargées, séquentiellement. C'est la sémantique de TanStack, et elle correspond à ce qu'iOS persiste (« the deepest scroll position they reached ») — mais un compte profondément défilé paie N allers-retours à chaque focus. Si cela mord, la réponse n'est pas `maxPages` (qui JETTE des pages) mais une synchronisation delta (`GET /api/v1/sync`), à sa propre issue.

## D-45 · Le numéro de build des coques est un fait de CONSTRUCTION, la version un fait de PRODUIT — 2026-09-12 (#6211)

**Le constat.** #6196 a fait dériver `versionName` (Android) et `MARKETING_VERSION` (iOS, Debug ET Release) de `package.json` à chaque `build:shells`, gardé par des témoins sur des chaînes synthétiques. Ce que ce lot mesure en plus, sur la révision réelle : (a) aucun témoin ne lisait les fichiers RÉELS du dépôt — un `npm version` sans rejouer `build:shells` laissait les coques désynchronisées sans qu'aucun test ne rougisse ; (b) `versionCode` (Android) et `CURRENT_PROJECT_VERSION` (iOS) restaient à `1` des deux côtés depuis `cap add`, sans AUCUNE source ; (c) `ios/App/App/Info.plist` n'avait pas de garde de FORME, alors que c'est exactement le défaut qu'#6186 a corrigé côté `apps/ios` (`CFBundleVersion` en littéral depuis le 2026-08-04).

**La décision — deux sources, jamais confondues.**
- **La VERSION** (`versionName` / `MARKETING_VERSION`) reste celle de `package.json` (#6196), RÉÉCRITE dans les deux fichiers SUIVIS (`android/app/build.gradle`, `ios/App/App.xcodeproj/project.pbxproj`) à chaque `build:shells` — parce qu'un build lancé directement dans Xcode ou Android Studio, hors du script, doit encore annoncer la vraie version du produit. Gardée par des témoins qui lisent désormais les fichiers RÉELS du dépôt (`auditAndroidVersionName`/`auditIosMarketingVersion` appliqués à `readFileSync` sur `build.gradle` et `project.pbxproj`), avec leur contre-épreuve sur une version voisine — un témoin qui ne peut jamais tomber ne prouve rien.
- **Le NUMÉRO DE BUILD** (`versionCode` / `CURRENT_PROJECT_VERSION`) est un fait de CONSTRUCTION : sa VALEUR ne se commet jamais, seul son REPLI l'est (voir ci-dessous — les deux fichiers suivis portent bien un `1`, et c'est une absence lisible, pas un numéro). `resolveShellBuildNumber()` retient `MEESHY_SHELL_BUILD_NUMBER` s'il est posé (le jour où une CI construit les coques, elle y met `${{ github.run_number }}` — la règle ne change pas), sinon `git rev-list --count HEAD`. Fail-closed sur un dépôt SUPERFICIEL sans compteur explicite (un `fetch-depth: 1` ne doit jamais fabriquer un build « 1 » en silence) et sur le plafond `versionCode` d'Android (2 100 000 000). Le numéro VOYAGE en argument de ligne de commande jusqu'à `gradle` (`-PmeeshyBuildNumber=<n>`, lu par `versionCode` dans `build.gradle` — `project.findProperty('meeshyBuildNumber') ?: '1'`, gardé en FORME par `auditAndroidVersionCodeForm`) et jusqu'à `xcodebuild` (surcharge `CURRENT_PROJECT_VERSION=<n>` sur la ligne de commande, jamais une réécriture du `.pbxproj`).

**Pourquoi la ligne de commande, pas une réécriture du `.pbxproj`, côté iOS.** Un numéro qui change à CHAQUE construction réécrirait le fichier le plus délicat du dépôt à chaque recette — un diff permanent sur un fichier suivi par deux sessions, la collision garantie que la règle de tranchage du `CLAUDE.md` racine évite déjà ailleurs. La surcharge `xcodebuild` porte aussi `MARKETING_VERSION=<version>`, redondant avec la réécriture d'étape 4.5 : une ceinture qui ne coûte rien et qui rend l'audit de l'artefact opposable à ce que la CONSTRUCTION a effectivement demandé, pas seulement à ce que le fichier projet portait avant qu'`xcodebuild` ne s'exécute.

**L'artefact CONSTRUIT est audité, pas seulement le fichier projet AVANT construction.** `auditBuiltApkVersion` (contre `android/app/build/outputs/apk/debug/output-metadata.json`, écrit par AGP) et `auditBuiltIosAppVersion` (contre l'`Info.plist` de l'`App.app`, converti en JSON par `plutil -convert json`) ferment le second angle mort : un script qui pose la bonne version en ENTRÉE peut encore produire un artefact qui ne la porte pas (cache gradle périmé, mauvaise variante, `xcodebuild` qui ignore la surcharge). Le pilote de `scripts/build-shells.mjs` les appelle après chaque construction native et sort en erreur, jamais en avertissement, sur toute divergence.

**Ce qui EST commis, c'est le REPLI — et il annonce une ABSENCE, jamais un numéro.** Les deux fichiers suivis portent `1` (`?: '1'` dans `build.gradle`, `CURRENT_PROJECT_VERSION = 1;` sur les deux configurations du `.pbxproj`) : c'est ce qu'annonce une construction lancée hors du site unique — Android Studio, Xcode, `./gradlew` à la main. Un repli qui RESSEMBLERAIT à un numéro (`4711`) rendrait ce build indiscernable d'un build numéroté, ce qui est exactement le service que le numéro rend à la recette (« quel commit ai-je sous les doigts ? »). `auditCommittedBuildNumberFallback` lit les DEUX fichiers réels et rougit sur tout repli autre que `1` — la moitié de la doctrine qu'aucune garde ne tenait au premier jet, où la décision affirmait « jamais commis » alors que le repli l'était.

**La forme du `versionCode` gardée couvre la panne CONSTATÉE, pas seulement le nom de la propriété.** Le premier jet écrivait `versionCode (project.findProperty('meeshyBuildNumber') ?: '1').toInteger()` et `auditAndroidVersionCodeForm` ne cherchait que la sous-chaîne `meeshyBuildNumber` : la garde était verte sur une forme que gradle REFUSE (Groovy parse `versionCode (expr).toInteger()` comme `versionCode(expr).toInteger()` — le setter reçoit la chaîne, `.toInteger()` s'applique à son retour, `IllegalArgumentException: Value is null`). La forme juste est l'AFFECTATION (`versionCode = (…)`), et c'est elle que l'audit exige désormais. Leçon de portée générale pour ce dépôt : **quand une construction réelle a déjà nommé la panne, c'est CETTE panne que la garde de forme doit refuser** — sinon le témoin n'enregistre que ce qu'on savait avant de payer. Corollaire : les audits de forme de `build.gradle` retirent d'abord les COMMENTAIRES (`stripGradleComments`), parce qu'un `exec` rend la PREMIÈRE occurrence et qu'une garde satisfaite par une phrase ne garde rien.

**La forme d'`Info.plist` est gardée** (`auditIosInfoPlistVersionForm`, miroir de `BundleVersionVariableGuardTests.swift` — #6186) : les deux clés de version doivent RÉSOUDRE une variable de build (`$(MARKETING_VERSION)`, `$(CURRENT_PROJECT_VERSION)`), jamais porter un nombre en dur. Une garde sur la VALEUR serait vraie le jour où on l'aligne à la main et fausse à la construction suivante ; seule la variable énonce l'invariant.

**Pourquoi pas une date, pourquoi pas App Store Connect.** Un numéro `YYMMDDHHmm` dépasse le plafond `versionCode` d'Android ; `YYMMDDHH` ne distingue pas deux builds de la même heure. ASC n'a pas de sens ici : la coque n'est pas publiée (D-30 (d), « la production reste fermée aux coques ») — il n'y a pas de compteur de magasin à suivre, seulement des builds de recette à distinguer les uns des autres.

**Aucune CI ne construit les coques** (celle qui tourne sur `apps/web-v2`, `ci.yml`, ne fait que `bun run test:coverage` — les gradle/xcodebuild sont uniquement locaux). La preuve d'intégration (§ artefact construit ci-dessus) est donc rejouée à CHAQUE recette locale, pas gagnée une fois pour toutes par un gate. Suivi : #6217 (job CI côté Android — iOS reste local, préférence de machine #5657 non résolue).

## D-46 · Le lecteur de stories est une ROUTE dont l'ordre de lecture est FIGÉ, et « vu » est une union monotone — 2026-09-13 (#5817)

**Le lecteur est une ROUTE (`/story/$post`), pas une couche modale.** Une seule adresse sert les deux intentions d'iOS (`StoryViewerRequestOrigin.swift:18-49`) : `targetingStory` — un lien, une notification, un contenu NOMMÉ — l'ouvre à cette story ; `openingGroup` — une tuile du rail, une ligne de `/stories`, une PERSONNE — calcule l'entrée AVANT de composer le lien (`group.entryStoryId`). Aucun paramètre `?start=first-unviewed` : ce serait le couple de champs que `StoryViewerRequestOrigin` a précisément supprimé parce qu'on en oubliait toujours un.

**Conséquence opposable : `useBackDismiss` ne s'y applique PAS.** Ce hook pousse une entrée d'historique de MÊME URL et la rend au démontage — il est fait pour une couche modale posée sur un écran INCHANGÉ (feuille, menu). Sur une route, il laisserait une entrée fantôme `/story/…` qu'un retour ultérieur ferait réapparaître. Le retour matériel Android, comme le retour du navigateur, remonte l'historique et le routeur re-rend la liste : le mécanisme générique de `/c/$conversation`, mesuré au pilotage (`/story/st-vue-recente` → retour → `/`). La spécification demandait le hook ; c'est la spécification qui avait tort, et la raison est écrite ici pour que la question ne se rejoue pas.

**L'ORDRE DES AUTEURS EST FIGÉ À L'OUVERTURE** (`stableGroupOrder`, `lib/stories/playback.ts`). Le rang d'un groupe dépend de `hasUnseen` — c'est-à-dire d'une donnée que la LECTURE fait basculer. Tout corpus rafraîchi en cours de route (retour de focus fenêtre, `refetch()` après une erreur, une invalidation) reclassait donc les groupes SOUS le lecteur : arrivé au bout d'un auteur, `nextPosition` ne trouvait plus de groupe après lui et FERMAIT au lieu de passer au suivant. Défaut invisible sur fixtures (le corpus bouchonné ne change jamais), certain sur la passerelle. Le CONTENU reste frais ; seul le rang est gelé, et un auteur apparu depuis se range à la suite.

**Corollaire d'invalidation** : `markStoryViewedAction` invalide le PLATEAU SEUL (`STORY_TRAY_QUERY_KEY`), jamais `STORIES_QUERY_PREFIX` — le préfixe couvre le corpus que le lecteur est en train de lire, avec un observateur actif à `staleTime: 0`, ce qui relançait une requête de 50 posts à chaque story affichée.

**« VUE PAR MOI » EST UNE UNION MONOTONE, jamais une priorité** : `isViewedByMe === true` (la passerelle, servi sur les DEUX projections de `PostFeedService.ts`) OU `storyViewedStore` (l'avance optimiste de la session, `lib/api/story-viewed-store.ts`, écrite AVANT l'appel réseau). Un `false` servi par la passerelle est un INSTANTANÉ pris avant le `POST /posts/:id/view` que le lecteur vient d'émettre : le laisser gagner rallumait l'anneau d'une story qu'on venait de regarder (mesuré au pilotage navigateur). Rien ne peut rendre un « vu » local faux — on l'a vraiment vue. Le verdict se PROJETTE sur la story dans `groupStoriesByAuthor`, une fois, pour que `hasUnseen`, `entryStoryId` et tout consommateur lisent le MÊME champ.

**Le voile du chrome est un ÉCART ASSUMÉ avec iOS** (`CHROME_SCRIM_TOP`/`BOTTOM`, `routes/story.tsx`). `StoryViewerView+Header.swift` ne pose ni dégradé ni ombre derrière le nom de l'auteur : mesuré sur les couleurs réelles, le nom tient 4,47:1 sur le fond par défaut (indigo 500 — SOUS AA) et 1,83:1 sur le ciel clair d'une photo ; l'heure, à 75 % d'opacité comme iOS, tombe à 3,24 et 1,59. Avec les voiles : 12,22 / 7,62 et 7,36 / 4,98. D-1 fait d'iOS la référence de la DISPOSITION, de la hiérarchie, des états et des gestes — aucun des quatre n'est touché : le voile ne déplace rien, il rend lisible ce qui y est déjà. **Un contraste sous AA n'est pas une cible dont on hérite** ; c'est un défaut de la cible, à ouvrir côté iOS comme #5681-#5683.

**La progression ne passe pas par l'ÉTAT.** `fillRef` reçoit un `transform: scaleX()` écrit à même le DOM à chaque image, et `aria-valuenow` un `setAttribute` quand le pourcent entier change. Poser la fraction en `useState` re-rendait l'écran ENTIER soixante fois par seconde pour animer trois pixels de haut ; iOS évite exactement cela (granularité 1/300, « évite de committer le `@State` `progress` »). `scaleX` plutôt que `width` : la propriété n'apparaît dans AUCUN objet `style` rendu, donc aucun rendu ne peut l'écraser, et l'animation reste sur le compositeur. **Motif à copier par toute surface future à progression continue** (barre d'envoi, lecture audio) — c'est la forme, pas une astuce locale.

**L'onglet caché ne consomme pas une story.** `requestAnimationFrame` s'arrête en arrière-plan mais `performance.now()` continue : au retour, le premier tick trouvait `ratio >= 1` et avalait la story. Pause sur `visibilitychange`, reprise UNIQUEMENT de la pause qu'on a soi-même posée — une pause voulue (appui long, double-tap) survit au passage en arrière-plan. C'est le miroir web de `scenePhase == .background` (`StoryViewerView.swift:614-622`), qui côté iOS FERME le lecteur ; geler plutôt que fermer préserve la place de lecture, et rien n'est perdu.

**Périmètre non couvert, à leurs issues** : la cascade unitaire `GET /posts/:id` pour une story hors des 50 premières (une story partagée par lien mais absente du corpus rend « introuvable » tout de suite, jamais le contenu d'autrui), le préchargement du média suivant, `textObjects`/canvas riche, réactions, commentaires, kebab, audio et vidéo de fond, swipe vertical de fermeture, republication, l'interlude d'identité inter-groupes.

## D-47 · Un geste du fil ÉCRIT dans le cache que le fil LIT, et une statistique ne devient bouton que le jour où elle a un effet — 2026-09-13 (#6278)

**La carte ne tient AUCUN état de geste.** `FeedPostCard` peint `model.viewer` (`isLikedByMe` / `isBookmarkedByMe` servis) et remet l'intention à son hôte ; `performPostGesture` (`lib/api/feed-gestures.ts`) bascule le cache `FEED_QUERY_KEY` par `applyPostToggle` (`lib/feed/interactions.ts`), le SEUL site qui sache dire « ce post est aimé ». L'optimiste, le rollback et la réconciliation temps réel passent par lui : un `useState` local dans la carte aurait fait diverger le cœur de la même publication entre deux cartes, et entre la carte et le compte. Le compte ne bouge que si l'état bascule, donc un double tap ou une confirmation tardive ne comptent jamais deux fois ; un compte ABSOLU servi (`bookmarkCount` de `/bookmark`, `likeCount` de `post:liked`) remplace l'estimation (`applyServedCount`).

**Le nom du wire est `isLikedByMe`, jamais `isLiked`** (`PostFeedService.ts:1197`, `PostService.ts:872`). Le type du fil déclarait `isLiked` depuis #5893 : un champ qu'aucun serveur n'envoie, invisible tant que personne ne le lisait. Un type de wire écrit sans consommateur n'est pas vérifié — il le devient au premier lecteur, et c'est ce lot.

**Une statistique ne devient bouton que le jour où elle a un effet (loi 4).** « Aimer » et « Enregistrer » sont des `<button aria-pressed>` ; « Commenter », « Repartager » et « Partager » restent des `<span>` tant que leur issue n'est pas livrée — et une carte montée sans hôte (`onGesture` absent) garde ses cinq statistiques, parce qu'un bouton qui ne remet son intention à personne mentirait.

**Les issues, et pourquoi ce ne sont pas celles des réactions de message.** Une panne passagère (réseau, 5xx, 408/425/429) garde l'optimiste et l'ANNONCE, sans promesse de rejeu : la file de reprise est #5868. Un 404 (publication disparue ou hors audience) défait et annonce avec le libellé d'iOS (`feed.like.error`, `post.bookmark.error`). **Un 409 sur « aimer » n'est pas un échec du lecteur** : la passerelle garde une réaction par personne, et le lecteur en a déjà posé une AUTRE depuis une autre surface — c'est le cache qui était périmé, donc l'optimiste est défait et le fil INVALIDÉ, en silence. `X-Client-Mutation-Id` (`cmid_<uuid>`, `middleware/clientMutationId.ts`) part avec chaque geste : le rejeu d'un « aimer » ne diffuse ni ne notifie deux fois (#6293).

**Un geste à la fois par publication et par sens** (miroir `isHeartInFlight`, `FeedPostCard.swift:974`) : un second tap pendant l'appel enverrait un `DELETE` qui croiserait le `POST` encore en route, et l'état final dépendrait de l'ordre d'arrivée côté serveur.

**Le port s'appelle `feed-gestures.ts`, pas `post-gestures.ts`** : la règle racine `post-*` (`.gitignore:203`) ignore tout fichier de ce préfixe à toute profondeur, et le premier `git add` a refusé les deux fichiers. Tout futur fichier du chantier nommé `post-<mot>` tombera dans le même piège.

## D-48 · Une publication se partage sous son adresse CANONIQUE, dans le geste ; le partage est compté après coup, et le détail attend le budget de première peinture — 2026-09-13 (#6278, #6279)

**L'adresse partagée est `https://meeshy.me/feeds/post/<id>`** (`lib/feed/share-url.ts`) — la forme que les deux autres clients reconnaissent déjà : le repli de partage d'iOS (`FeedView.swift:22-29`), revendiquée en lien universel par l'app (`DeepLinkRouter.swift:106`), servie par le legacy en production (`apps/web/app/feeds/post/[postId]`). Origine FIXE, jamais `location.origin` : un lien partagé depuis staging doit s'ouvrir chez son destinataire, pas sur un environnement de recette.

**Pourquoi pas le lien SUIVI qu'iOS demande d'abord** (`POST /posts/:id/share {generateLink:true}` → `shortUrl` `/l/<token>`) : il faut l'ATTENDRE avant d'ouvrir la feuille, et `navigator.share` n'ouvre que pendant l'activation du geste. Une requête réseau entre le tap et la feuille la consomme — Safari rend `NotAllowedError`, et le presse-papier, soumis à la même règle, échoue avec. Le geste le plus fréquent du web (ouvrir la feuille) aurait donc raté précisément là où il compte, le mobile. **Écart assumé avec iOS : l'attribution par lien suivi reste à l'app.** Corollaire mesuré au passage : le `shortUrl` émis sur staging vise `FRONTEND_URL/l/<token>`, une adresse que le chantier ne sert pas — elle n'est de toute façon pas atteignable ici.

**`partagerLien` part DANS le gestionnaire du tap, sans `await` préalable** (`lib/view/invitation.ts`, dont `partagerInvitation` n'est plus qu'un cas). `AbortError` est une DÉCISION — le lecteur a fermé la feuille, aucune copie dans son dos ; tout autre refus de la feuille (`NotAllowedError`) retombe sur le presse-papier. Seules les deux issues muettes s'annoncent : « Lien copié » et l'échec (`feed.share.error`).

**Le partage est COMPTÉ après coup, jamais d'avance** (`recordPostShare`, `lib/api/feed-share.ts`) : `POST /posts/:id/share {platform:'web'}` seulement si le lien est réellement parti (`partage` ou `copie`), jamais sur une annulation. Rien n'étant écrit d'avance, rien ne se défait : un refus ou une panne laisse le compte tel quel, sans annonce — le lien est déjà chez son destinataire. Le compte ABSOLU servi entre au fil par `applyServedCount` (qui porte désormais `share`). « Partager » est un bouton SIMPLE, sans `aria-pressed` : un geste ponctuel n'a pas d'état pressé.

**La route de détail `/post/$post` est PRÊTE mais NON fusionnée** (branche `claude/feed-detail-6278`). Mesuré (`bun run build` + `node scripts/measure-weight.mjs`) : `dev` à 39,98 Ko, `/post/$post` seule à 40,01, avec l'alias `/feeds/post/$post` à 40,03, avec le squelette extrait en composant à 40,05 (un chunk partagé de plus = une entrée de plus dans la table de préchargement). **Toute route neuve ajoute au module d'entrée** — sa ligne de table, sa liste `__vite__mapDeps`, le nom de son chunk — ce qui contredit l'hypothèse « un écran neuf naît à la demande et n'entame pas la marge » (#6279, corrigée sur l'issue). Le plafond n'est pas relevé ici : c'est l'arbitrage de #6279. Le jour où il tombe, la branche porte le port (`publication-detail.ts`, `GET /posts/:id`, cache d'abord depuis le fil), l'écran et les gestes partagés entre le fil et le détail.

## D-49 · La première peinture a un plafond de 90 Ko, arbitré par le porteur — 2026-09-13 (#6279)

**Directive du porteur, 2026-09-13** : « ce n'est pas grave on double le budget pour atteindre 90ko ». `budgets.json › first_paint.kb.value` passe de 40 à **90**, statut « ARBITRÉ PAR LE PORTEUR ». Le seul lecteur de ce plafond est `scripts/measure-weight.mjs`, qui reste le gate.

**La mesure qui la fonde** (`bun run build` puis `node scripts/measure-weight.mjs`, `apps/web-v2`) : `dev` tenait 39,96–39,98 Ko pour un plafond de 40 ; la route de détail d'une publication (#6278) portait la première peinture à 40,01 Ko (une route), 40,03 (avec l'alias `/feeds/post/$post`), 40,05 (squelette extrait en composant). **Chaque route ajoute environ 30 octets gzip au module d'entrée** — sa ligne dans la table, sa liste `__vite__mapDeps`, le nom de son chunk : à 40, AUCUNE route neuve ne passait plus, quelle que soit la sobriété de son écran. L'hypothèse « un écran neuf naît à la demande et n'entame pas la marge » était fausse ; elle a été corrigée sur #6279.

**Ce que le plafond relevé n'autorise pas** : 90 Ko laissent environ 50 Ko de croissance au premier pixel. Ce n'est pas une licence pour faire entrer une dépendance lourde dans le socle — le gate rougit toujours, simplement plus tard, et une remontée structurelle dans `core-*.js` ou `index-*.js` se lit toujours dans le détail par fichier de `measure-weight.mjs`. Les leviers d'allègement chiffrés sur #6279 (#5784 pour la feuille, 9,5 Ko ; le découpage de `core`, 19,7 Ko ; une table des routes hors du module d'entrée) restent ouverts, sans urgence.

**Conséquence immédiate** : la route de détail de #6278 (D-48) n'est plus bloquée, et son alias `/feeds/post/$post` — le lien profond d'iOS et l'adresse que le partage émet — revient avec elle.

## D-50 · La pilule de jour s'efface au REPOS : elle sert pendant le défilement, et rien ne recouvre un fil immobile — 2026-09-13 (#6101)

**Le fait mesuré.** Fil au repos, 390 × 844 : la pilule collante, posée sous la bande à `--day-pill-top`, occupait y = 60..92 et recouvrait le nom d'auteur de la première rangée lisible (« Amina Diallo » au milieu de `c-rattrapage`, le texte du dernier message à l'ouverture en Bulles). 40 échecs sur 2 schémas × 2 gabarits × 4 modes demandés, relevés par `scripts/check-day-pill-rest.mjs` AVANT correction. Aucune rangée ne chevauche sa voisine : c'est l'overlay qui recouvre le flux.

**Les trois réponses de l'issue, et pourquoi la première.**
1. *Elle reste posée par-dessus, comme iOS* — écartée : le défaut est visible de l'utilisateur (dimension 8) et prive un nom de sa lisibilité (dimension 5). « iOS fait pareil » dit que la cible porte le même défaut, pas qu'il est souhaitable.
2. *Le flux lui réserve sa hauteur* — écartée : elle rouvre la bande permanente que #6213 venait de retirer sur retour porteur (« le défilement visible du haut au bas de l'écran ») ; déplacer le couperet n'est pas le retirer.
3. **Elle s'efface au repos et se révèle pendant le défilement — retenue.** C'est pendant le défilement qu'elle sert, et c'est ce que dit la directive iOS du 2026-08-24 (« il doit rester lorsque tous les autres composants disparaissent durant le scroll ») : rester PENDANT le geste, jamais « rester au repos ». Au repos, chaque rangée porte déjà son heure et chaque jour son séparateur en flux. C'est aussi la règle que #6277 a posée pour les disques flottants du Flux — **aucun flottant ne recouvre un texte au repos** — : une même règle pour tout le chrome flottant de la v2.0.

**AMENDEMENT DU 2026-09-20 (#7182) — UNE EXCEPTION, ARBITRÉE PAR LE PORTEUR.** La bannière « N nouvelles publications » du Flux FLOTTE, comme iOS (`FeedView.swift:1200-1235`). La première forme livrée se pliait à l'article — elle prenait sa place dans le flux, en tête de liste — et le porteur a tranché l'inverse.

Ce que l'exception ne dit PAS : que l'article se relâche. Le critère qui la porte est la NATURE de l'objet, et il permet de décider du cas suivant sans redemander. Les flottants que D-50 vise sont **permanents et passifs** — la pilule de jour, les disques du Flux sont là quoi qu'il arrive, et recouvrir devient leur état normal. La bannière est **événementielle et congédiable** : elle n'existe que lorsqu'il y a quelque chose à annoncer, et ne dure que jusqu'au geste qui la fait disparaître. Un flottant qu'un tap retire ne prive personne d'un texte, il le diffère de la durée d'un tap.

Et l'article avait raison sur un point que l'exception conserve : dans le flux, la bannière n'aurait été visible qu'en HAUT du fil — c'est-à-dire là où les publications qu'elle annonce sont déjà sous les yeux, et où son geste (« remonter ») n'a aucun objet. Un contrôle qui n'est visible que là où il ne sert à rien tombe sous la loi 4 par un autre chemin.

Deux garde-fous tiennent l'exception à sa place, tous deux sous témoin : la pilule est **opaque** (une pilule translucide au-dessus d'un texte rendrait les deux illisibles, ce qui changerait un recouvrement assumé en défaut de lisibilité, dimension 5), et la **couche qui la centre ne capte pas le pointeur** (`pointer-events-none` sur la bande, `pointer-events-auto` sur la seule pilule) — sans quoi une bande pleine largeur volerait les gestes de tout ce qui passe dessous, un défaut bien pire que le recouvrement.

**La fenêtre n'est pas inventée** : c'est celle de la pilule jour·heure d'iOS (`ScrollTimePillState.swift`, `lingerMs = 900`), c'est-à-dire la loi PARTAGÉE du révélé (`SCROLL_ACTIVITY_LINGER_MS`, `scene/activity.ts`). Doigt posé qui tire : révélée tant qu'il tient ; levée : effacée 900 ms après le DERNIER défilement (la décélération la prolonge) ; un défilement du CODE — ancrage à l'ouverture, « revenir en bas », saut vers une citation — ne la révèle jamais.

**La forme.** `lib/view/day-pill-reveal.ts` (loi pure `dayPillRevealed`, souscripteur au défileur, projection hors React sur `data-day-pill="revealed"`), consommée par `useThreadChromeSignals` — `routes/thread.tsx` n'a pas bougé. L'état de REPOS est l'ABSENCE d'attribut (`thread-scene.css`) : le premier rendu est juste avant tout abonnement, sans éclair de pilule à l'ouverture, et une panne du souscripteur tombe du côté du repos.

**L'écart avec iOS est un écart d'ÉTAT, ouvert côté iOS** plutôt que reproduit ici : la même pilule y reste visible au repos et y recouvre la même rangée.

**La Rivière n'est pas mesurée** : le fil de la v2.0 ne la rend pas (`THREAD_RENDERABLE_MODES`). Le témoin pose sa clé, relève le mode servi, et la mesurera le jour où elle entre au catalogue de rendu.

## D-51 · Le verre a UN site, deux densités et un flou — et un outil l'interdit ailleurs — 2026-09-13 (#6124)

**Le constat.** `glass-surface.tsx` se déclarait « site unique » en prose ; neuf surfaces réécrivaient flou et opacité à la main — 70 / 78 / 80 / 85 / 88 / 92 %, flous de 12 et 24 px — dont tout le chrome du fil, et les deux seuls consommateurs du composant le contournaient pour leur propre en-tête. Une règle en prose ne tient que là où quelqu'un s'en souvient.

**Le site est `src/styles/glass.css`** (importée par `app.css`) : `glass` et `glass-prominent`, un ton par rôle (`glass-card`, `glass-accent`, surface d'écran par défaut). `GlassSurface` et `GlassBack` en sont des consommateurs comme les autres.

**Les densités sont ARBITRÉES sur une mesure, pas moyennées.** Le fond de repli porte le contraste quand `backdrop-filter` ne s'applique pas ; son pire cas est le fond composé sur du noir OU du blanc pur passant dessous. Relevé au navigateur, flou désactivé, schéma clair / sombre : pilule de jour (day-ink sur card) **3,54** / 4,68 à 70 %, **4,40** / 6,29 à 78 %, 4,64 / 6,78 à 80 %, 6,21 / 10,24 à 92 % ; en-tête ≥ 9,9 dès 80 %. **La pilule de jour, à 70 %, tombait sous AA en clair dès que le flou manquait** — la divergence de matière cachait un défaut de contraste.
- **80 %, `glass`** — le plus bas palier qui tient AA pour toutes les encres du fil dans les deux schémas : bandes d'en-tête (fil, états du fil, progression), repères de jour (pilule ET séparateur en flux, jumeaux d'iOS `MessageDaySeparator` en `.ultraThinMaterial`), contrôle teinté « revenir en bas » (iOS : `adaptiveGlass(tint:)`, le régulier teinté), `GlassBack`, `GlassSurface` non proéminent (78 → 80).
- **94 %, `glass-prominent`** (92 jusqu'au 2026-09-20, #7178) — ce qui se pose SUR un contenu qu'on lit : `GlassSurface` proéminent, l'annonce au-dessus du composeur, la barre de recherche flottante de la liste (85 → 92), les disques flottants (88 → 92, sous leur dégradé).

**AMENDEMENT DU 2026-09-20 (#7178) — 92 % NE TENAIT PAS POUR DU TEXTE.** #7143 a donné son matériau à la bande du composeur, et c'est ce qui a rendu son contraste MESURABLE : le **placeholder** (`--ios-ink-3`, du TEXTE) y tombait à **4,40:1** en clair, sous AA.

Trois remèdes possibles, deux écartés SUR MESURE plutôt que par principe :
- **l'encre** — impossible : `--ios-ink-3` vaut `indigo700.opacity(0.8)`, déjà le cran minimal qu'iOS a arbitré (D-18 bis, #5625 : « 0.79 échoue sur `backgroundTertiary` à 4,496:1 »), et D-4 interdit d'inventer un jeton qui ne descend pas de Swift ;
- **le ton** — `glass-card` DÉGRADE à **4,21:1** (mesuré avant d'être écarté : l'intuition disait l'inverse, puisque c'est le fond sur lequel iOS valide ses 4,76:1 — mais iOS le mesure OPAQUE, pas sous 92 % de verre) ;
- **la densité** — retenue. 92 % → 4,40 · **94 % → 4,55** · 96 % → 4,69 · 100 % → 4,98. **94 est le plus bas palier qui tient**, exactement la méthode des six mesures ci-dessus.

Ce n'est PAS une troisième densité : le site unique en garde deux. Et monter une densité ne peut dégrader aucun autre couple — plus opaque, c'est plus de contraste pour toutes les encres, dans les deux schémas.

**Le placeholder n'a pas été classé `non-text`**, bien que ce fût la sortie la plus facile : « Message… » est du texte, lu par les voyants comme par les lecteurs d'écran. Le reclasser aurait fait passer le gate en changeant la QUESTION, pas la réponse — un assouplissement de seuil déguisé, que cet article interdit.

**Son couple est désormais à `GLASS_CONTRAST_INVENTORY`**, écrit à la main comme son voisin, et pour la même raison : le verre est posé dans `routes/thread.tsx` quand l'encre vit dans `components/composer.tsx`. **Un verre dont le contenu est un composant enfant échappe entièrement à la détection automatique** — c'est le trou par lequel ce défaut est entré.
- **Un flou, 24 px** — celui du site unique ; les puces passent de 12 à 24.

**Ce qui n'est PAS du verre, dit sur place.** La pastille de synchronisation portait un flou sous des fonds PLEINS (erreur, avertissement, carte) : retiré, pas migré. L'inventaire nommé de `scripts/lib/glass-site.mjs` admet trois écarts, chacun avec sa raison : le VOILE du menu de message (un scrim, pas une surface), le fond du bouton d'actions de rangée (dans la gouttière réservée, jamais sur un contenu), la tuile du média masqué (en flux dans la bulle).

**La garde nomme une PROPRIÉTÉ, pas une API** (le piège du cycle 107). Un flou d'arrière-plan (`backdrop-blur-*`, `backdrop-filter`, `backdropFilter`) n'a qu'un usage — du verre ou un voile ; un ton de surface iOS rendu translucide EST le repli du verre ; un élément qui porte une classe de verre et réécrit son fond, ou une densité `--glass-*` posée localement, contourne le site en l'employant. Les trois tombent hors du site, la prose des commentaires ne compte pas, et une entrée d'inventaire devenue fausse — compte trop haut, fichier disparu — tombe aussi (`scripts/glass-site.test.ts`, dans `bun test`).

**La feuille de première peinture ne naît plus de la PROSE** (`app.css`, `@source not` sur `scripts/` et les `*.md`). Mesuré en livrant ce lot : les classes citées dans les gates et les décisions (`backdrop-blur-xl`, `backdrop-filter`) faisaient générer à Tailwind des utilitaires que rien n'emploie, avec leurs `@property`. Première peinture : 39,96 Ko sur `dev`, 40,06 avec le verre avant ce réglage, 39,86 après — le plafond est désormais de 90 Ko (D-49), mais un octet servi avant le premier pixel pour un commentaire n'a pas de raison d'exister.

**Suivi #6308 — la mesure ci-dessus est désormais un GATE, pas seulement une prose.** `scripts/lib/glass-contrast.mjs` REJOUE la formule depuis les fichiers réels (`packages/design-tokens/ios.css` pour les tons/encres, `styles/glass.css` pour les densités) — aucune valeur recopiée, un jeton régénéré ou une densité modifiée change le résultat au prochain `bun test`. `glass-contrast.test.ts` reproduit d'abord le tableau ci-dessus à 70/78/80/92 % sur des valeurs fabriquées (la formule, falsifiée indépendamment du dépôt : baisser à 78 % fait tomber la pilule sous AA en clair), puis audite l'INVENTAIRE NOMMÉ des couples (ton, encre) réellement servis par une surface `glass*` (`GLASS_CONTRAST_INVENTORY` — pilule de jour, en-tête, l'annonce du presse-papiers, la loupe de la recherche flottante ; `--glass-accent` en est exclu, sa valeur variant par conversation). **L'audit a trouvé un défaut réel en cours d'écriture** : le sous-titre de l'en-tête (`thread-header.tsx`, « N participants » / « Chiffré de bout en bout ») peignait `--color-ios-ink-2` — semi-transparente, `color-mix(in srgb, #4338ca 80%, transparent)` en clair — sur la bande de verre à 80 %, pire cas : 3,58:1, sous la barre AA. Corrigé par `--color-ios-ink` (la hiérarchie visuelle reste par la taille, `text-mini`, pas par l'opacité) — la mesure de D-51 ne portait que sur DEUX encres (day-ink, l'encre primaire de l'en-tête) ; ce sous-titre n'y avait jamais figuré.

**Suivi #6367 — l'inventaire était NOMMÉ à la main, jamais DÉRIVÉ des usages : sa clôture reconnaissait déjà « pas d'issue de suivi ouverte », rendant tout futur couple `glass*`/`ink*` invisible tant que personne ne se souvenait d'ajouter son entrée.** `glassInkUsages(text)` rejoue désormais, DEPUIS le JSX réel, la même relation d'héritage que `--glass-tone` en CSS : un tag qui porte `glass`/`glass-prominent` (+ `glass-card` pour le ton, `glass-accent` exclu comme au site) ouvre un CADRE hérité par ses descendants jusqu'à sa fermeture ; toute encre peinte dans ce cadre — sur le tag lui-même ou n'importe quel descendant — forme un couple avec lui. L'alias `--color-*` employé dans le JSX se résout vers le jeton `--ios-*` mesuré via `loadColorAliasMap()`, qui LIT `src/styles/ios.css` (son bloc `@theme inline`) au lieu de recopier la table : un alias absent de ce bloc (`--accent`, `--color-ok/warn/error`) n'est pas un jeton iOS fixe, il sort de la dérivation sans liste d'exclusion à la main. `derivedGlassInkPairs()` balaie tout `apps/web-v2/src/**/*.tsx` et `glassContrastCoverage()` est le GATE : tout couple dérivé absent de `GLASS_CONTRAST_INVENTORY` fait tomber `bun test` — c'est lui qui rougit sur un couple neuf, là où l'inventaire seul ne pouvait que garder ce qu'on y avait déjà écrit.

**Comment un couple NEUF entre sous la garde** — poser une classe `glass`/`glass-prominent` avec une encre `--color-ios-*` fait ROUGIR `glassContrastCoverage` au prochain `bun test`, le message nommant le ton/l'encre/la densité et le(s) fichier(s) : (1) mesurer le ratio au pire cas (`glassWorstCaseContrast`, ou en composant depuis `loadIosSchemes()`/`loadGlassDensities()`) dans les DEUX schémas ; (2) s'il tient AA (texte ≥ 4,5, non-texte ≥ 3), ajouter l'entrée à `GLASS_CONTRAST_INVENTORY` avec son `site`, sa `kind` et, en commentaire, la mesure qui la justifie ; (3) sinon, changer l'encre pour une qui tient (voir le sous-titre de l'en-tête ci-dessus) — jamais assouplir le seuil ni exclure le couple par son nom. **L'audit dérivé a trouvé un second défaut réel en écrivant ce gate** : `thread-states.tsx` (`MinimalHeader`, l'en-tête minimal des écrans refusé/erreur, D-6) peignait le chevron de retour en `--color-ios-brand` nu sur la bande de verre par défaut — 2,78:1 en clair / 2,53:1 en sombre au pire cas, sous la barre AA non-texte (3:1) ; `--color-ios-brand` était déjà connu insuffisant pour du texte lisible ailleurs (`routes/notifications.tsx`, commentaire `BRAND_INK`), jamais mesuré ici parce que cette surface n'avait jamais figuré dans l'audit manuel du 2026-09-13. Corrigé par `--color-ios-ink`, même ton/densité que `thread-header.tsx` (mesuré ≥ 9,9:1 dans les deux schémas à 80 %).

**Portée assumée** : la dérivation lit le JSX (`.tsx`), pas les feuilles CSS — les trois sites de `GLASS_INVENTORY` (`glass-site.mjs`) n'y peignent aucune encre `--ios-ink*`, donc ce n'est pas encore un usage réel à couvrir ; un couple posé un jour depuis une règle CSS (`.foo.glass { color: var(--ios-…) }`) échapperait à `glassInkUsages`, à rouvrir si ce cas apparaît.

## D-52 · L'interface a UN catalogue, sept langues, un chunk par langue — et aucun repli — 2026-09-13 (#6206)

**Le constat.** web-v2 n'avait qu'un embryon de catalogue (`fr`/`en`, trois annonces). Tout le reste de l'interface était en français en dur, y compris le roster de frappe. Ce dernier était déjà rendu injectable par un formateur, mais aucun catalogue ne savait l'alimenter : `translate()` ne rendait que des chaînes plates, et une forme « un nom » ou « deux noms » ne pouvait pas s'y exprimer.

**Les sept langues sont celles du catalogue iOS** : `fr, en, es, pt, de, it, ar`. Le code est la LANGUE, jamais la région (le script d'amorçage réduit `pt-BR` à `pt`, et le portugais servi est celui qu'iOS catalogue sous `pt-BR`). Les noms de clés reprennent ceux d'iOS partout où iOS en a un (`root.menu.*`, `a11y.floating.menu`, `typing.*`) ; les clés propres au web le disent par leur préfixe (`pending.*`).

**La forme.**
- **Le français est la source des clés** (`src/lib/interface-catalogs/catalog-fr.ts`, `as const`) ; `InterfaceCatalogKey` en dérive, et chaque autre langue se déclare `satisfies InterfaceCatalog`. Une clé absente ou en trop ne compile pas. Le témoin `i18n-catalog.test.ts` la mesure aussi à l'exécution (mêmes clés, jamais vide, jamais égal à sa clé, mêmes paramètres). Il est prouvé rouge : une clé retirée de `de` et un paramètre retiré de `ar` le font tomber, avec la langue et la clé nommées.
- **Les paramètres se nomment** (`{name}`) et se placent là où la langue les veut. Leur liste est TYPÉE depuis la valeur française : `translate(l, 'typing.double', { first, second })` compile, et un nom oublié ne compile pas. C'est la troisième voie posée sur l'issue (les entrées qui savent leurs paramètres), sans que le catalogue contienne de fonctions : il reste une donnée.
- **Aucun repli, ni vers le français, ni vers la clé.** Un catalogue lu avant d'être chargé LÈVE : c'est une rupture du contrat de démarrage, pas un état à maquiller. Un `defaultValue` aurait servi du français aux six autres langues en silence.
- **`typingAnnouncement` n'a plus de formateur par défaut.** Un défaut français aurait servi le français à tout appelant oublieux, et aucun témoin écrit en français n'aurait pu le voir.

**Un chunk par langue, attendu EN PARALLÈLE.** Chaque catalogue est un `import()` (`i18n-catalog.ts` § `LOADERS`) ; `budgets.json › on_demand_chunks.interface_catalogs` le garde `dynamic_only`. Le routeur attend le catalogue de la langue résolue AVEC le chunk de l'écran (`createRouter(…, { screenPrerequisite })`, `route-table.tsx`), jamais après : en série, chaque premier écran paierait un aller-retour de plus sur la 3G visée. La coquille fait de même pour les menus flottants (`shell.tsx`). Tout ce qui se rend ensuite lit le catalogue de façon synchrone.

Mesuré : le gate navigateur ne voit qu'UN catalogue téléchargé par cas. Chacun pèse de 0,7 à 0,9 Ko gzip ; les sept ensemble, 5,48 Ko (`measure-weight.mjs`). La première peinture passe de **39,92 à 40,42 Ko (+0,50)** : le chargeur, ses sept `import()` et la résolution de langue. C'est sous le plafond de 90 (D-49).

**Sous `bun test`, le catalogue de la langue du document est préchargé** (`bunfig.toml › [test] preload`). Ce préchargement rejoue le contrat du démarrage pour `fr`. Ce n'est pas un repli : un témoin qui pose une autre langue charge son catalogue lui-même, et une clé absente reste rouge.

**Ce que ce lot ne fait pas, et où c'est suivi.**
- La mise en page reste de gauche à droite en arabe : `lang` est posé, `dir` ne l'est pas (#6311).
- 478 chaînes d'interface restent en dur dans 94 fichiers (#6310), dont le squelette et la page introuvable, qui se rendent avant tout catalogue.
- Un changement de langue (`setInterfaceLanguage`, sans appelant à ce jour) charge le catalogue AVANT de poser la langue. Ce qui est déjà monté garde la sienne jusqu'à son prochain rendu, comme iOS, qui applique le changement au relancement (`settings.interface_language.restart`). L'écran des réglages tranchera s'il recharge.

**Effet de bord mesuré sur un gate.** `check-realtime-events.mjs` ouvre son navigateur en `en-US` pour rendre observable le rang 2 du Prisme. Cette locale résout AUSSI la langue d'interface : le libellé de frappe s'y lit désormais en anglais (« Kwame Mensah and Fatou Bâ are typing »), pendant que le contenu suit le Prisme. Deux résolveurs, deux langues, sur le même écran : c'est exactement la distinction que #6206 devait tenir.

## D-53 · La vérification d'e-mail et la réinitialisation du mot de passe voyagent en QUERY STRING ; le raccordement automatique depuis l'inscription reste hors tranche ; une route neuve grossit structurellement le socle — 2026-09-13 (#5672)

**Le contexte.** iOS ouvre `EmailVerificationView(email:)` en mémoire, depuis l'écran d'inscription — il n'a pas d'URL. Le web n'a pas ce luxe : un lien de vérification ou de réinitialisation arrive dans un ONGLET NEUF, sans aucun état en mémoire. `/auth/verify-email` lit donc `?email=`, `/reset-password` lit `?token=` — même discipline que `/auth/magic-link?token=` (#5816) : un lien reçu par courriel reste valide après un rafraîchissement de la page, jamais une navigation qui dépendrait d'un état posé par l'écran précédent.

**Ce qui N'est PAS fait, et pourquoi ce n'est pas un oubli.** `signup.tsx` n'a PAS été modifié pour rediriger vers `/auth/verify-email` après une inscription réussie. Il porte déjà un effet qui redirige vers `list` dès que `session.status === 'authenticated'` — exactement ce que `register()` pose en construisant la session (#4264). Faire cohabiter ce garde-fou avec une redirection EXPLICITE vers `/auth/verify-email` pose une course entre deux navigations issues du même rendu (l'effet de garde d'un côté, l'appel explicite de l'autre), dont l'issue dépend de l'ordre de notification de `zustand` sous Preact — non vérifiée sur cette session. Router une inscription vers le mauvais écran serait pire que ne pas router du tout. **Suivi ouvert, à sa propre issue** : garder le garde-fou de `signup.tsx` mais le rendre conditionnel à un drapeau posé explicitement (`justRegistered`) avant la navigation vers `/auth/verify-email?email=`, prouvé par un témoin qui monte `SignupScreen`, soumet, et vérifie l'ADRESSE finale.

**Le coût, mesuré — et ce qu'il dit sur le plafond de première peinture.** La marge sous `budgets.json › first_paint.kb` (40 Ko) était déjà à **0,05 Ko** avant ce lot (39,95 Ko mesurés sur l'arbre repris). `route-table.tsx` étant LU par le document lui-même (D-3), toute route ajoutée à `ROUTES` grossit le socle par construction — même minimale (un nom, un motif, une fermeture `import()`) — quel que soit le soin apporté au reste du code. Deux routes neuves ont mesuré +0,11 Ko sur l'entrée (`index-*.js`), poussant la première peinture à 40,06 Ko. Le CSS n'a PAS bougé : les deux écrans ont été écrits pour ne réutiliser QUE des classes Tailwind déjà présentes ailleurs (`rounded-[14px]`, `tracking-wide`) — aucune valeur arbitraire neuve, contrairement à un premier jet qui en portait trois (`tracking-[0.3em]`, deux `max-w-[…px]`), retirées avant mesure finale. Le plafond est monté à **41 Ko** (`budgets.json`, source datée) : la marge était déjà consommée avant ce lot, ce resserrement n'est pas propre à lui et précède structurellement toute feature qui ajoute une route tant que le plafond reste « CIBLE PROPOSÉE, NON ARBITRÉE ».

**Ce qui reste dérivé, jamais une jumelle.** Les quatre ports (`verifyEmail`, `resendVerification`, `verifyResetToken`, `resetPassword`) vivent dans `src/lib/api/auth.ts`, à côté de `login`/`register`/`forgotPassword` — une fabrique, UNE instance de production. La logique interactive est extraite en composants injectables (`components/verify-email-flow.tsx`, `components/reset-password-flow.tsx`, patron `magic-link-flow.tsx`) : la route (`routes/verify-email.tsx`, `routes/reset-password.tsx`) ne fait que lire la query string et la passer — c'est ce qui rend les deux écrans testables sans mock de module.

**Piège de test découvert, à retenir pour tout futur champ contrôlé testé interactivement.** Un champ contrôlé posé avec `onChange` ne réagit PAS, sous ce harnais (`happy-dom` + `createRoot` + `act`), à un témoin qui pose `input.value` puis redispatche un `input` natif — seul `onInput` le voit. `magic-link-flow.tsx#magic-link-email` le faisait déjà ; ce lot généralise l'observation en doc-comment inline sur chaque champ concerné, pour que le prochain écran ne perde pas de temps à chercher pourquoi son bouton reste désactivé alors que la valeur DOM a bien changé.

**Supplanté pour le plafond par D-49.** Ce lot relevait `first_paint.kb` de 40 à 41 Ko sur sa branche ; le porteur a arbitré 90 Ko le même jour (D-49) avant sa fusion. La mesure du coût d'une route reste juste, le plafond cité ici n'est plus celui du dépôt. Décision numérotée D-47 sur la branche du tour, renumérotée D-53 à la fusion (les numéros D-47 à D-52 étaient déjà pris sur `dev`).

## D-54 · La grille de médias suit la géométrie iOS AU LITTÉRAL ; la visionneuse est un chunk à la demande dont la pellicule porte le MESSAGE ; un défaut de POSITION d'un témoin se corrige en CENTRANT, jamais en baissant un seuil — 2026-09-13 (#6169)

**Le contexte.** Le tour 1 (#6221, commits `018573b22e` puis `5e70678d54`) avait déjà LIVRÉ l'essentiel — `MediaGrid` (2/3/4+, arithmétique dérivée de `FocalMediaGridLayout.slots(for:)` ET de `BubbleStandardLayout+Media.swift`, parité DÉCLARÉE entre les deux sources Swift), `MediaViewer` (visionneuse plein écran en chunk `lazy()`), `MediaFilmstrip`, `VideoTile`, `MaskedAttachment` — mais SANS les témoins de COMPORTEMENT que le critère de fin exige (aucune assertion DOM sur `media-13`/`media-14`, ni sur `role=dialog`, le piège de focus ou le retour d'historique), sans la PARTIE de `check-curve.mjs` que le doc-comment de `media-grid-layout.ts` prétendait déjà avoir (« gardé par PARTIE 11 » — zéro ligne), et sur un gate DOM ROUGE (`check-thread-states.mjs`, témoin (n) du média, 84,71 %/56,60 % au lieu de 100 %). Ce tour ferme ces trois manques et deux de plus (le poids du socle, le carrier de la visionneuse) — il ne réécrit RIEN du tour 1.

**La décision — cinq écarts ASSUMÉS avec iOS, chacun avec son issue de suivi, jamais un raccourci silencieux.**
1. *Pellicule du MESSAGE, pas de la conversation.* iOS montre « Média 4 sur 7 » (toute la conversation, mesuré sur Ref-Native) ; le web ne pagine que les pièces DU message ouvert (`items = visual`, le tableau déjà partitionné par `Attachments`). Une pellicule conversation-entière suppose un magasin global (positions de TOUS les messages médias du fil) et trois actions supplémentaires (Enregistrer, Réagir/Répondre/Créer avec ce média) — hors de ce tour. **Issue de suivi #6303**, référence `ConversationView+MediaGallery.swift` / `+Actions.swift`.
2. *Aucune politique de téléchargement, aucun anneau.* iOS gouverne l'auto-téléchargement d'une pièce par `MediaDownloadPolicyEngine` (réseau, taille, préférence) et l'affiche par `DownloadBadgeView` (anneau + poids). Le web charge les octets sans politique — chaque `<img>`/`<video>` porte son `src` dès le montage (lazy natif du navigateur, pas une politique produit). **Issue de suivi #6304** — dimensions non mûres : 2 (performance réseau lent), 9 (compatibilité réseau lent), 13 (complétude). Le karaoké, la vitesse/scrub du vocal et le carrousel multi-pistes suivent en **#6306**.
3. *Pas de pincement à deux doigts.* La loi PURE qui le gouvernerait (`MAX_SCALE`, `media-stage.ts`) est déjà dérivée et testée (C1) ; seule la mécanique `PointerEvent` à deux points manque. Le double-tap (1 ↔ 2,5) reste le chemin complet pour explorer une image en grand — jamais un contournement muet, une AFFORDANCE alternative complète.
4. *La grille, en peau Bulles, est DANS la surface teintée de la bulle* (capture `render/thread-media-grid-bubbles`), alors qu'iOS la pose en FRÈRE de la bulle de texte (`BubbleStandardLayout.swift:794`). Défaut de l'HÔTE `bubble.tsx` (591 lignes), pas de `MediaGrid` — non corrigé ici (hors critère de fin), **issue de suivi #6305**, témoin : `[data-media-grid]` n'est pas descendant de la surface teintée de la bulle. Question ouverte adjacente : #5680 (teinte de la bulle reçue).
5. *Le témoin (n) de `check-media.mjs` centrait sa cible AVANT #6213* (`scrollIntoViewIfNeeded`, bord bas du champ) ; le composeur flottant de #6213 (leçon 599 : « faire flotter ce qui était en flux change ce qui passe SOUS lui ») occulte désormais ce bord. **La correction est de CENTRER la rangée** (`scrollIntoView({ block: 'center' })` + `waitForRowSettled`, la fonction EXPORTÉE de `check-media.mjs` — renommage anglais D-13 de `attendreRangeeStable`), JAMAIS de baisser le seuil de 100 % : le défaut gardé (un glyphe de repli qui peindrait par-dessus l'image) reste PERSISTANT, une attente plus généreuse ne peut donc verdir que ce défaut-là, pas le camoufler.

**Ce qui reste, et ce qui a été TROUVÉ en le fermant.** Le gate DOM neuf (`scripts/lib/check-media-grid.mjs`, G1-G4) a mesuré deux points que la spécification du tour 2 n'avait pas anticipés : (a) `naturalWidth` n'est PAS un témoin fiable pour une tuile de grille portant un `srcset` à descripteur de largeur (`imageVariants`) — le navigateur ajuste `naturalWidth` par la DENSITÉ implicite du candidat choisi (`largeur déclarée / largeur de `sizes``), et une fixture-témoin 1×1 déclarée « 640w » y rapporte `naturalWidth: 0` pour un décodage RÉUSSI (sondé : `drawImage` sur un canvas peint le pixel exact malgré le 0) — le témoin de décodage vérifie donc le PIXEL PEINT (canvas), jamais `naturalWidth`, sur une pièce à variantes ; (b) enchaîner DEUX `history.back()` réels dans la MÊME page (Échap puis un retour matériel simulé) est une COURSE mesurée (intermittente, un run sur deux) — `history.back()` navigue de façon asynchrone au niveau du NAVIGATEUR, pas seulement du DOM, et une réouverture qui le course peut atterrir sur `about:blank` ; le second retour matériel est donc vérifié dans un contexte de page NEUF. Et la spécification affirmait « `history.length` égal au relevé » après Échap — FAUX, vérifié par trois sondes Playwright indépendantes : `history.back()` ne fait JAMAIS décroître `history.length` (il repositionne le curseur sur une entrée déjà comptée, jamais ne l'efface) ; l'entrée poussée à l'ouverture reste comptée pour toujours, exactement ce que `use-back-dismiss.ts` documente déjà (« elle REND son entrée, pour qu'un retour ULTÉRIEUR ne soit pas avalé à la place ») — RENDUE, jamais EFFACÉE. Le témoin vérifie donc `relevé + 1`, l'invariant réel.

Le poids : `first_paint` était mesuré à 40,5 Ko (plafond 41, D-53) avant ce tour, `index-*.css` à 9,54 Ko contre une base #6257 de 9,27. Treize utilitaires Tailwind à valeur ARBITRAIRE ou à OPACITÉ EN SLASH, propres au chunk `media-viewer` (un z-index à 1000, quatre teintes blanc/noir à une opacité en pourcentage, un rayon de coin medium, une hauteur/largeur maximale à 100 %, un ajustement d'image en CONTAIN, une durée de transition de 200 ms, une opacité à 30 %, une hauteur minimale nulle, un côté fixe de 2,5 rem — vérifiés UNIQUES par un grep croisé sur `src/**/*.tsx`), écrivaient leurs règles dans la feuille UNIQUE malgré leur découpage en chunk JS séparé, Tailwind scannant le CODE SOURCE — et tout texte du dépôt que son détecteur automatique atteint — et non le graphe de chunks de Vite. **Ce paragraphe s'INTERDIT d'écrire ces treize noms de classe en toutes lettres** : `app.css` importe Tailwind SANS `source(none)`, donc le détecteur de contenu scanne aussi ce fichier — un nom de classe cité ICI regénérerait la règle que le lot vient de retirer, DANS `decisions.md` lui-même (mesuré, pas supposé : c'est exactement ce qui s'est produit à la première rédaction de ce paragraphe, avant correction). Le détail vit dans le CODE — les règles de `media-viewer.css`, et le `git diff` de `media-viewer.tsx`/`media-filmstrip.tsx` qui les remplace — jamais dans cette prose : un doc-comment `.tsx` qui les nommerait serait scanné lui aussi. Déplacés en classes dédiées dans `media-viewer.css` (même arbitrage que `floating-menus.css`, #6104) : `first_paint` redescend à 40,33 Ko, `index-*.css` à 9,38 Ko ; `budgets.json › on_demand_chunks.media_viewer` monte de 5 à 6 Ko pour absorber le poids que ce chunk vient d'ACCUEILLIR (l'échange voulu, pas une dérive). `MediaCarrier` (auteur, date, cotes, légende du pied de la visionneuse) était un TYPE SANS CONSOMMATEUR câblé — `bubble.tsx`/`focal-row.tsx` ne passaient pas `carrier` à `Attachments` — fermé par `mediaCarrierOf()` (`lib/view/media.ts`), qui VOYAGE la `Served` déjà résolue par l'hôte, JAMAIS une seconde descente (cycle 128). NON mémoïsée dans un `useMemo` malgré ce que le tour 1 attendait : vérifié dans le graphe de props réel, `carrier` n'atteint QUE `MediaViewer` (chunk à la demande, jamais `memo`-isé), JAMAIS `MediaGrid` (le seul descendant `memo`-isé de cette chaîne) — une identité instable sur `carrier` ne fait sauter AUCUNE optimisation existante, et introduire le PREMIER hook de `bubble.tsx` (591 lignes, trois retours anticipés avant le rendu des pièces jointes) pour un gain nul aurait été le risque que ce lot n'avait pas à prendre.

**Ce que la revue a trouvé en plus — la FORME de la grille n'est pas la même dans les deux peaux (revue #6169).** Les deux sources Swift partagent l'arithmétique des cases, et c'est ce partage qui a caché le reste : la BULLE pose UNE boîte noire arrondie dont les écarts sont noirs (`BubbleStandardLayout.swift:814-817`, fond noir puis découpe sur la grille entière), la rangée PLATE arrondit CHAQUE case et ne peint rien entre elles (`FocalAttachmentBlock.swift:203-213`, découpe sur la cellule, aucun fond de conteneur). La capture Ref-Native `targets/thread.media-grid.light.png` le montre : quatre cases arrondies séparées par le fond du fil. `MediaGrid` appliquait la forme de la bulle aux deux peaux — donc à Focal, le mode par DÉFAUT (D-7) : une croix noire sur fond clair. La forme est désormais une DONNÉE que l'hôte déclare (`MediaGridFrame = 'box' | 'tiles'`, `lib/view/media-grid-layout.ts`), OBLIGATOIRE sur `Attachments` — un défaut muet ferait porter à l'une des peaux la forme de l'autre, en silence. Témoins : `focal-row.test.tsx` / `bubble.test.tsx` (l'hôte déclare) et G5 de `scripts/lib/check-media-grid.mjs` (le PIXEL de l'écart et du coin intérieur, rouge sur l'arbre d'avant : écart `0,0,0` sur un fond `251,254,254`). La revue a aussi remplacé le témoin « aucun saut au décodage » (il comparait `top` sur des images déjà décodées et ne pouvait pas rougir) par une mesure de la rangée SANS ses images, falsifiée : hauteur non réservée ⇒ 345 px contre 65.

## D-55 · La cloche filtre CÔTÉ SERVEUR, lit son compte par `/counts`, marque en optimiste — et le bouton flottant porte enfin le vrai compte — 2026-09-13 (#6288, #6219, #6313)

**Le constat.** `/notifications` était un écran d'attente (#6214) et la pastille du bouton flottant avait été refusée faute de source (#6104). iOS sert la cloche par `NotificationListView` : trente lignes « toutes catégories » filtrées EN MÉMOIRE, pagination sous « Toutes » seulement.

**Une catégorie est un filtre de la passerelle, chacune sa liste en cache** (`lib/notifications/categories.ts`, `lib/api/notifications.ts`). `GET /notifications?types=…|unreadOnly=true&cursor=…` — AU CURSEUR, sans `offset`, ce qui retire le `count()` du chemin nominal. Le tri en mémoire d'iOS affiche vide une catégorie dont les lignes sont plus anciennes que la première page ; ici, chaque catégorie pagine. Neuf types qu'iOS oublie (commentaires de story, publications d'ami, `comment_reaction`, créations de conversation) sont rangés là où on les cherche — défaut iOS suivi par #6314. **Cache d'abord pour une catégorie jamais ouverte** : elle se peint avec les lignes de « Toutes » déjà en cache qui lui appartiennent (`placeholderData`), le squelette ne vient que sur un cache vide.

**Le compte vient de `GET /notifications/counts`, jamais de `/unread-count`.** Ce dernier répond `{ success, count }` hors de `data`, que le pont unique `http.ts` ne lit pas : la pastille aurait lu `undefined` pour toujours. `/counts` passe par `sendSuccess`, applique le même prédicat de visibilité que la liste, et sert la forme de `notification:counts` — un seul décodeur pour les deux voies.

**Une ligne décodée est une PROJECTION du type partagé** (`lib/notifications/record.ts`, `Pick` sur `NotificationActor`/`NotificationContext`), jamais `Notification` tel quel : le formateur sert `title: null`, `actor: undefined` et des dates en chaînes. Décodage fail-closed champ par champ ; `state` reste imbriqué pour que les prédicats partagés des marquages en masse (`notification-read-bulk.ts`) s'appliquent sans jumelle. **Le texte servi EST le Prisme** (quatrième famille, résolue serveur) : titre persisté d'abord, puis le NOM de l'acteur — jamais la phrase française de repli d'iOS servie à sept langues.

**Où mène une ligne** (`lib/notifications/target.ts`) : la métadonnée d'entité (`postType`/`contentType`) avant le type, miroir `NotificationContentRouter` ; conversation, story, publication, progression, réglages. Une destination que le web n'a pas (demande de contact) rend `null` : la ligne est un BOUTON qui marque lu, jamais un lien qui mentirait.

**Les gestes sont optimistes, le retour arrière restaure l'INSTANTANÉ** (`notifications-actions.ts`, `notifications-cache.ts`). Une ligne lue a QUITTÉ « Non lues » ; l'y remettre à son rang demanderait de savoir où elle était. Un seul site écrit les listes et le compte, pour le geste comme pour le socket.

**Le temps réel** (`notifications-realtime.ts`, branché par `socket.ts`) suit le contrat de `NotificationService` : `notification:new` avance le compte (la passerelle émet `notification:counts` juste après, qui le remplace) et insère en tête SANS relecture ; `read`, `read-bulk`, `deleted-bulk` ne touchent qu'aux lignes — décrémenter y doublerait le décrément optimiste de l'appareil qui a fait le geste. Le dédoublonnage vit sur la CONNEXION (mémoire bornée à 200 identifiants) : une cloche jamais ouverte n'a aucune liste où reconnaître une rediffusion. Les listes sont marquées périmées sans requête : la charge socket porte le titre de la BANNIÈRE (le nom de l'acteur), la prochaine lecture rend le titre persisté.

**Divergence assumée sur le rail** : iOS écrit en blanc sur la teinte pleine de la puce choisie — 1,9:1 sur le jaune de « Social ». Le texte reste à l'encre, la teinte porte le fond et le filet.

**Le menu d'une ligne** (« Marquer comme lue », « Supprimer ») reprend le véhicule des rangées de la liste (`row-actions.tsx`) : iOS déclare `onMarkRead`/`onDelete` sans rien pour les servir. Fond OPAQUE : la garde du verre n'admet qu'un fond translucide de bouton de rangée, celui de la liste.

**Le couloir** : la première rangée commence sous les disques flottants au repos (`NOTIFICATIONS_TOP_RESERVE`, depuis `floating-corridor.ts`).

**La pastille (#6219)** : `UnreadCornerBadge` revient avec son premier appelant, aux cotes de `NotificationBadge` ; elle est décorative et le BOUTON annonce le compte dans son nom. `use-notification-counts.ts` est un module à part : les menus flottants, préchargés sur chaque écran, n'emportent pas les gestes ni le cache des listes pour afficher un nombre.

**Un barreau de l'échelle ne menait nulle part (#6313, hérité, mesuré sur `dev`)** : `useBackDismiss` rendait « son » entrée d'historique à la fermeture, et un barreau ferme l'échelle APRÈS avoir poussé sa destination — la navigation était défaite. L'entrée posée porte une marque ; le retour n'a lieu que si l'historique est encore dessus.

**Mesuré, `origin/dev` (6e34289a5b) contre l'arbre du lot rebasé dessus** (`bun run build` puis `node scripts/measure-weight.mjs`, deux builds) : première peinture 40,76 → 40,77 Ko. Écran + port de la cloche 10,21 Ko (`budgets.json › notifications`, plafond 12). Catalogues 5,48 → 8,56 Ko pour les sept (33 clés ×7, plafond porté de 7 à 10). `realtime` 3,69 → 4,34 Ko (plafond 5 tenu). `floating_menus` 2,80 → 2,90 Ko (plafond 4). Gate `scripts/check-notifications.mjs`, deux schémas × deux gabarits.

**Ce que ce lot ne fait pas, et où c'est suivi.** Les bannières in-app (#5568). Les neuf types oubliés par iOS (#6314). Ouvrir un fil ne marque pas encore ses notifications lues (#6315). Deux formes de pluriel seulement (#6316). La recette staging et coques (#6317).

## D-56 · Le profil suit `ProfileView` ; ses langues s'enregistrent au geste ; sa frontière est `zod/mini`, NOMMÉ hors du socle ; l'identifiant reste en lecture — 2026-09-13 (#6289, #5562)

**Le constat.** `/me` était un écran d'attente (#6214). iOS sert le profil par `ProfileView.swift` : bannière et avatar, identité, contact, langues du Prisme, statistiques et progression, demandes, membre depuis — c'est l'ordre et la hiérarchie repris (`routes/profile.tsx`, `routes/profile-sections.tsx`). **Le bandeau de statistiques suit l'app native 1.0.9**, qui montre sur son propre profil Messages / Traductions / Langues / Jours (`UserProfileSheet+DetailsTab.swift`), plutôt que les trois cartes de `ProfileView` (Messages / Conversations / Amis). Ses puces ne sont pas cliquables : l'écran détaillé n'existe pas encore (#6327), et une puce qui ne mène nulle part serait un contrôle qui ment.

**La charge de soi est une PROJECTION** (`lib/api/profile.ts`). `GET /api/v1/me` sert `formatUserResponse` : vingt-sept champs, dont l'e-mail, le téléphone, l'IP et le lieu de connexion, les permissions. Le cache de requêtes est persisté dans le `localStorage` ; le décodeur n'y laisse entrer que les champs peints, et les contacts MASQUÉS (première lettre et domaine ; indicatif et deux derniers chiffres, derrière un nombre FIXE de puces pour ne pas dire la longueur du numéro). C'est la règle 1 de `session.ts`, portée au cache.

**La frontière est validée par `zod/mini`, dans les deux sens.** Dépendance ajoutée à `package.json` à la version de `packages/shared` et de la passerelle (4.4.3) : les bornes de longueur y comptent les mêmes unités UTF-16 que `updateUserProfileSchema`. À la sortie, un `PATCH` invalide ne part pas et nomme son champ ; un nom d'affichage vide est refusé (plus strict que la passerelle : un nom effacé ferait afficher l'identifiant à tout le monde). La règle « pas d'emoji dans un prénom » n'est pas encore reprise (#6331). **`zod` est NOMMÉ dans `vite.config.ts § manualChunks`** : la règle par défaut « node_modules ⇒ core » le rangeait dans le socle, et la première peinture passait de 41,12 à 45,43 Ko pour un validateur qu'aucun écran du socle ne lit.

**Un geste écrit le cache ET la session, ensemble** (`lib/api/profile-actions.ts`) — instantané, application, réseau, retour arrière. Écrire le seul cache laisserait le reste du produit dans l'ancienne langue pendant que le profil affiche la nouvelle. **Une langue CONFIRMÉE relit la liste des conversations** : la passerelle ne sert à la liste que les traductions vers le Prisme qu'elle connaît (`buildLastMessagePreviewTranslations`), si bien que les aperçus dont la traduction est déjà là basculent au geste (`useReaderLanguages` lit la session en primitives) et la relecture apporte les autres. Relire avant la confirmation relirait l'ancien Prisme.

**Divergence assumée : une langue s'enregistre au geste**, sans passer par « Modifier ». Choisir dans la feuille (`language-sheet.tsx`, réutilisée telle quelle) suffit — deux gestes, là où iOS en demande quatre pour le réglage qui gouverne tout ce que le produit affiche (dimension 7). Un rang secondaire se retire par un contrôle nommé ; la langue principale, jamais. La feuille parle encore français dans sa recherche (#6328).

**Divergence assumée : le bouton de la bannière se pose en haut**, pas en bas comme iOS. Les deux disques flottants occupent le couloir 126 → 178 px (`floating-corridor.ts`), exactement la hauteur du bas de la bannière ; mesuré par `elementFromPoint` dans `scripts/check-profile.mjs`.

**L'@identifiant et les contacts restent en LECTURE.** Le critère de #6289 citait l'identifiant parmi les champs éditables ; la référence (D-1) l'affiche en lecture, et le changer exige le mot de passe (`PATCH /users/me/username`), comme un e-mail exige sa preuve de possession (`POST /users/me/contact-changes`). Ces parcours ont leur issue (#6326).

**Hors ligne, l'édition est REFUSÉE**, jamais simulée : lecture intacte, « Modifier » et les rangs du Prisme désactivés. iOS met la modification en file ; le web n'a pas de file d'écriture (#6325).

**La photo part recompressée** (`lib/profile/image-recompress.ts`, miroir `ImageCompressor`) : WebP d'abord, JPEG si le navigateur ne sait pas l'écrire, bornes 512 px (avatar) et 1500 px (bannière), jamais pire que l'original. Le ré-encodage retire l'EXIF (dont la position GPS) et applique l'orientation. Le chemin est celui d'iOS : `POST /attachments/upload` (le port du composeur), puis `PATCH /users/me/avatar|banner`. **L'aperçu local vit dans l'état de l'écran, jamais dans le cache** : une URL `blob:` persistée survivrait au rechargement sans rien désigner. Annulation par `AbortController`. La progression réelle et la reprise (#6323), le recadrage (#6324) restent à faire.

**Les demandes d'amis** sont comptées sur une page de 100 (`LIMITE_MAX_DEMANDES`) : la passerelle ne sert aucun compte, et « 100+ » dit la vérité là où un nombre exact demanderait de tout paginer. L'entrée mène à `/discover` (iOS : `peopleDiscovery(.requests)`) ; `/contacts` n'existe pas sur web-v2.

**Le couple de focus des quatre champs** est mesuré par `scripts/check-profile.mjs`, qui reprend les quatre invariants de `check-field-focus.mjs` : ce dernier est tenu par une branche voisine vivante que ce lot ne touche pas.

**Mesuré, `origin/dev` (2bc3a6d3f6) contre l'arbre du lot rebasé dessus** (`bun run build` puis `node scripts/measure-weight.mjs`, deux builds) : première peinture 40,75 → 41,12 Ko (module d'entrée 8,90 → 9,14, feuille 9,28 → 9,42). Écran et port du profil 10,71 Ko (`budgets.json › profile`, plafond 12), `zod` 4,59 Ko (plafond 6). Catalogues 8,70 → 13,91 Ko pour les sept (59 clés ×7, plafond porté de 10 à 15). Gate `scripts/check-profile.mjs`, 122 invariants, deux schémas × deux gabarits ; une photo de 9 926 252 octets part en 20 194.

**Ce que ce lot ne fait pas, et où c'est suivi.** Progression réelle et reprise d'un envoi (#6323). Recadrage (#6324). File d'écriture hors ligne (#6325). Identifiant et contacts modifiables (#6326). Statistiques détaillées (#6327). Feuille des langues traduite (#6328). Recette staging (#6329). Onglets Postes et Conversations (#6330). Emoji refusé sous le champ (#6331).

## D-57 · Les réglages suivent `SettingsView` et n'offrent que ce qui a un effet ; thème et langue d'interface basculent à chaud ; ce que la v2.0 ne porte pas mène au legacy par une rangée qui le dit — 2026-09-13 (#5563)

**Le constat.** `/settings` était un écran d'attente (#6214). iOS sert `SettingsView.swift` : carte de profil, compte, apparence, profil vocal, transcription, notifications, données, outils, bêta, aide, à propos, changer de compte, déconnexion. C'est l'ordre et la hiérarchie repris (`routes/settings.tsx`, `routes/settings-sections.tsx`), limités par une loi : **un contrôle n'existe que s'il a un effet mesurable** — la passerelle l'obéit, ou le web l'applique.

**Ce qui est porté, et l'effet qui le justifie.**
- **Thème** Auto / Clair / Sombre — effet web à chaud (classe de `<html>`, `setThemePreference`), persisté sur l'appareil (`meeshy.scheme`, que le script d'amorçage relit avant la première peinture) et écrit dans `application.theme`, que iOS relit (`ThemeManager.observeRemoteThemeSync`). « Auto » RETIRE le choix stocké : sans ce retrait, `followSystem` ignorerait pour toujours le prochain changement du système. Un refus serveur ne défait pas le thème de l'appareil ; l'écran dit « appliqué sur cet appareil, sans synchronisation ». Le web ne relit pas encore `application.theme` (#6334).
- **Langue de l'interface** Automatique + sept — effet web à chaud : `subscribeInterfaceLanguage` prévient la racine (`main.tsx § InterfaceLanguageRoot`), qui remonte l'arbre sous la nouvelle langue ; l'adresse, le cache et la session vivent hors de l'arbre. Le catalogue est chargé AVANT la notification. **Deux divergences assumées** : iOS attend le relancement ; et « Automatique » suit le NAVIGATEUR, là où iOS suit la langue principale du compte — le script d'amorçage s'exécute avant toute session. Cette règle a une seule définition, écrite deux fois dans le même fichier (la chaîne `INLINE_INTERFACE_LANGUAGE_BOOTSTRAP` et la fonction `resolveInterfaceLanguageCode`) : `interface-language-choice.test.ts` exécute les deux sur les mêmes cas. Rien n'est écrit dans `application.interfaceLanguage` — iOS non plus (défaut `en`, relu par personne).
- **Langues de traduction** : une rangée vers `/me`, jamais une seconde édition (D-56).
- **Confidentialité** — statut en ligne, dernière connexion, accusés de lecture, indicateur de frappe : obéis par `PresenceVisibilityService`, `socketio/presence-audience.ts`, `MessageReadStatusService`, `MeeshySocketIOManager` et `PrivacyPreferencesService`. **Divergence assumée : une section, pas une feuille** — iOS range cinq sections derrière une rangée ; quatre bascules ne valent pas un geste de plus à chaque visite. Ce que coûte une bascule se lit sous elle (la réciprocité des accusés de lecture), pas derrière un (i).
- **Notifications poussées et sons** : la porte `pushEnabled` et la sourdine `soundEnabled` de `PushNotificationService`.
- **Progression** (`/me/progression`), **conditions**, **politique de confidentialité**, **version** (le littéral de construction `__APP_VERSION__`).
- **Déconnexion** : confirmation dans un `<dialog>`, purge de la session d'abord, puis `POST /api/v1/auth/logout` (`auth.ts#logout`), puis `/login`.

**Ce qui n'est pas affiché, faute d'effet.** Les vibrations : aucun lecteur serveur hors défauts et validation, et le web ne fait vibrer aucun appareil. Le téléchargement automatique des médias : le fil peint ses images par `<img loading="lazy">` dans des fichiers tenus par la branche du lecteur média (#6333). Les autres rangées d'iOS (profil vocal, transcription, stockage, favoris, enregistrées, statistiques, affiliation, bêta, aide, licences, bloqués, changer de compte) attendent chacune leur décision (#6336).

**Le port** (`lib/api/app-preferences.ts`) lit `GET /api/v1/me/preferences?fields=…` pour ces sept valeurs et rien d'autre : le cache de requêtes est persisté, et un type faux rend la lecture ILLISIBLE plutôt qu'une valeur devinée — une bascule de confidentialité affichée à tort « désactivée » ferait croire au lecteur qu'il est caché. L'écriture `PATCH /api/v1/me/preferences` se range par catégorie. **Le geste est optimiste** (`app-preferences-actions.ts`) et **le retour arrière ne défait que les clés du geste refusé** : deux bascules rapprochées gardent chacune leur effet. Hors ligne, les bascules sont désactivées (#6325) ; le thème et la langue, qui ne dépendent d'aucun réseau, restent actifs.

**Le legacy** (`lib/view/legacy-link.ts`) : origine ABSOLUE `https://meeshy.me` — une adresse relative mène à la page introuvable sur staging (qui ne sert que la v2.0) et dans les coques ; les onglets s'ouvrent par leur fragment (`/settings#security`, `#privacy`, `#notification`, `#media`, `#message`), la suppression de compte par `/account/deletion`. Nouvel onglet, et la rangée le DIT (« Version classique, nouvel onglet »). À la bascule, les fragments de `/settings` tomberont sous l'adresse que la v2.0 réclame (#6335).

> **Mise à jour 2026-09-15 : le legacy est DÉCOMMISSIONNÉ (#6702), et ce paragraphe décrit un état qui n'existe plus.** Rien ne sert plus `https://meeshy.me/settings#…` hors de la v2. `lib/view/legacy-link.ts` est supprimé, et les entrées non portées (sécurité, confidentialité fine, notifications fines, médias, messages, export) sont **masquées** plutôt que laissées vers une adresse morte, chacune avec son issue de portage (#6720 à #6725). « Supprimer le compte » mène à `/account/deletion`, servie par la v2 (#6715), dans le même onglet. `settings.test.tsx` et `check-settings.mjs` exigent zéro lien vers une autre origine.

**Le couloir.** `SETTINGS_TOP_RESERVE = FLOATING_CORRIDOR_BOTTOM − SETTINGS_HEADER_HEIGHT` : au repos, la carte de profil commence sous les deux disques, comme la cloche et le Flux. Mesuré à la première capture : sans cette réserve, les disques couvraient l'avatar et le chevron de la carte, et le test d'atteignabilité restait vert parce que le CENTRE de la carte était libre.

**`GroupedSection`** (`components/grouped-section.tsx`) : la section et l'icône de rangée du profil sont extraites au moment où les réglages en ont eu besoin ; le profil les emploie, au même balisage (`check-profile.mjs`, 122 invariants).

**Mesuré** (`bun run build` puis `node scripts/measure-weight.mjs`) : première peinture 41,63 Ko, contre 41,12 mesurés par #6289 sur le commit de base (+0,51 — la racine abonnée à la langue, la résolution « Automatique », la préférence de thème). Écran et port des réglages 9,31 Ko (`budgets.json › settings`, plafond 11). Catalogues 13,91 → 18,81 Ko pour les sept (45 clés ×7, plafond porté de 15 à 20). `grouped-section` 0,5 Ko partagé ; le chunk du profil passe de 10,71 à 10,63. Gate `scripts/check-settings.mjs` : 152 invariants, deux schémas × deux gabarits.

**Ce que ce lot ne fait pas, et où c'est suivi.** Téléchargement automatique des médias (#6333). Thème relu depuis un autre appareil (#6334). Réglages du legacy atteignables après la bascule (#6335). Rangées iOS absentes (#6336). Confirmation du périmètre par le porteur (#6337). File d'écriture hors ligne (#6325). Mise en page de droite à gauche en arabe (#6311).

## D-58 · Un disque flottant DÉPLACÉ peut recouvrir le contenu qui défile — parité iOS assumée, aucune loi d'escamotage — 2026-09-13 (#6300, #6277, #6215)

**Statut : proposée, le porteur tranche.** #6300 est une `décision-produit` qui lui est assignée ; elle reste ouverte jusqu'à sa confirmation. Rédigée sous le numéro D-56 sur `claude/eager-planck-nk1dg4` (`c35368f826`), renumérotée à la fusion : `dev` avait déjà attribué D-56 au profil et D-57 aux réglages.

**Le constat mesuré.** #6300 relève qu'un disque flottant déplacé par l'utilisateur (#6215) reste posé à l'endroit choisi pendant que le contenu défile en dessous — sur l'émulateur Android (coque web-v2) comme sur le simulateur iOS natif, un disque descendu à mi-hauteur finit par recouvrir un texte de carte. La question posée : accepter (parité iOS, le déplacement est la réponse) ou donner une loi d'escamotage pendant le défilement, sur le modèle de `ScrollMotion.hiddenWhileScrolling` déjà appliqué à d'autres boutons iOS.

**Ce que #6277 a déjà tranché, et ce qu'il n'a jamais couvert.** La règle « aucun disque flottant ne recouvre un texte ni un contrôle » ne vaut qu'AU REPOS — l'écran tel qu'il s'ouvre, les deux disques à leur pose par défaut (`"0,0"` / `"1,0"`). `scripts/check-floating-clearance.mjs` l'écrit en toutes lettres depuis #6277 : « Un disque que l'utilisateur a DÉPLACÉ se pose où il l'a voulu, au-dessus d'un contenu qui défile — aucune mise en page ne l'évite, iOS pas plus que le web, et c'est précisément pourquoi le disque se déplace (#6215). » #6300 ne découvre donc pas un défaut neuf : il redemande, sur preuve fraîche, si cette exclusion tient toujours.

**Vérification côté iOS — elle tient, et l'écart serait dans le sens inverse.** `RootView.swift:393-397` ne masque `draggableFloatingButtons` (`FreeFloatingButtonsContainer`) que pendant un Reel plein écran ou une route profonde (`!router.isDeepRoute && reelsPresenter.launch == nil`) — jamais pendant un défilement. `ScrollMotion.hiddenWhileScrolling()` existe bien dans la base (`RootViewComponents.swift:444`, `FeedView.swift:683`) mais s'applique à d'AUTRES boutons — `nearbyButton`/`reelsButton`, des entrées de header, pas les disques déplaçables. Appliquer cette loi aux disques du web ne rapprocherait donc pas de la parité iOS : ce serait une divergence NEUVE, un comportement qu'iOS n'a jamais eu.

**Décision proposée — Accepter (option 1 de l'issue).** Un disque déplacé continue de survoler le contenu qui défile, sur les deux plateformes, sans exception. Écartée : *escamoter pendant le défilement* — elle désaligne le web d'iOS au lieu de les aligner, et retire au disque déplacé la moitié de sa raison d'être (rester à portée du pouce PENDANT qu'on lit). Écartée aussi : *estomper au-dessus d'un texte* — elle demanderait une détection de superposition en continu pendant le scroll, un coût de fluidité (dimension 4) pour un défaut qu'iOS porte identiquement et qu'aucun retour utilisateur ne signale.

**Critère de fin.** Aucun code ne change : le témoin `check-floating-clearance.mjs` couvre déjà exactement cette exclusion (`exigeRepos`, appelé uniquement au repos, jamais après un `defile()` sur un disque déplacé) et documente la même raison depuis #6277. Cette entrée formalise la décision proposée ; #6300 se ferme dessus quand le porteur la confirme.

## D-59 · La visionneuse lit une vidéo comme iOS : la piste au couloir bas, le play/pause au centre, et la barre est un chunk qu'une visionneuse de photos ne télécharge jamais — 2026-09-13 (#6359)

**Le constat.** Sur « Meeshy Poc-Web-V31 », le porteur a relevé qu'il n'y avait « pas d'action » dans la visionneuse. Mesure faite : elle ne rendait qu'un bouton, « Fermer ». Une vidéo s'y jouait sans barre, et le couloir bas portait une ligne de progression `aria-hidden`, sans effet. C'était un contrôle qui ment (loi 4).

**La cible est iOS, et elle se lit dans deux fichiers.** `ConversationMediaGalleryView+Transport.swift` pose la barre du SDK `VideoTransportControls(controls: [.scrubber, .mute, .speed, .pip], placement: .corridor)` au couloir bas. Le play/pause (`cadreCenterPlayPause`) reste au centre du média, plus transparent. La progression RAPPORTE et descend au couloir ; le play/pause COMMANDE et reste là où l'œil est. Tant que la vidéo n'a pas de durée, seule la durée de la pièce jointe s'affiche : une piste qu'on ne peut pas parcourir serait sans effet, et un « 0:00 » faux se croit.

**Trois couches, une responsabilité chacune.**
- `lib/view/media-transport.ts` est la LOI PURE : temps `m:ss`, paliers de vitesse (1× à 2×, localisés), fraction sous le doigt, saut clavier de 10 s (`MediaStageSeek.step`).
- `lib/view/use-media-playback.ts` est la MÉCANIQUE : position, durée, `seek`, muet, vitesse, image dans l'image. Tout est additif pour les tuiles du fil et les vocaux. `tracksTime` est OPT-IN : seule la visionneuse suit la position à la seconde, et une tuile du fil ne se re-rend pas chaque seconde pour un chiffre qu'elle ne montre pas.
- `components/media-transport.tsx` est la SURFACE.

**La vidéo suit le doigt.** Chaque `pointermove` d'un geste en cours déplace réellement la lecture, et le relâcher conclut. C'est la forme que `VideoTransportControls.seekBar` a prise sur le retour porteur du 2026-09-13, et que la directive « gestes progressifs et annulables » exige. Mesuré au navigateur : doigt encore posé à 80 %, la lecture est à 5,601 s pour 5,60 attendus.

**Un portail doit arrêter ses événements.** La page vidéo rend la barre dans le couloir bas par `createPortal`. Mais un événement React remonte l'arbre des COMPOSANTS, pas celui du DOM : toucher le muet atteignait le clic de scène et basculait le plateau en plein cadre (le chrome disparaissait sous le doigt), et Espace sur un bouton de la barre déclenchait le raccourci lecture/pause. Une garde autour du portail arrête clic, pointeur, Espace et Entrée. Le premier témoin écrit pour ce défaut ne pouvait pas échouer : deux clics, deux bascules qui s'annulent, une seule lecture à la fin. Il lit désormais l'opacité après chaque geste.

**La barre est un chunk à la demande.** Montée en statique, elle portait le chunk `media_viewer` de 4,10 à 6,47 Ko, au-delà de sa cible de 6. Sortie en `lazy()`, `media_viewer` mesure 4,50 Ko et `media_transport` 2,72 Ko (plafond 4, `dynamic_only`) : une visionneuse de photos, le cas majoritaire, ne la télécharge pas. Écarté : relever le plafond de `media_viewer`. Le poids aurait été payé par chaque ouverture de photo pour un contrôle qu'elle n'affiche jamais.

**Écarts assumés avec iOS.** Ni AirPlay ni boucle : le web n'a pas l'un, et iOS ne pose pas l'autre dans ce couloir. L'image dans l'image n'est offerte que si le navigateur l'offre (`document.pictureInPictureEnabled`).

**Ce que ce lot ne fait pas, et où c'est suivi.**
- Le double tap latéral ±10 s d'iOS (`MediaStageSeek`, #6163) : #6369. Au clavier, le saut de 10 s existe déjà sur le curseur.
- La première peinture passe de 41,65 à 42,12 Ko. `i18n-catalog` et `preload-helper` sortent du chunk d'entrée : cause mesurée pour le premier, à bissecter pour le second. Suivi en #6368.
- La colonne d'actions (Enregistrer, Réagir, Répondre) : #6303. Le vocal plein écran : #6306.

## D-60 · Ses communautés se lisent comme iOS : la liste, le détail et la création sont servis ; membres, invitation, réglages, rejoindre/quitter et publications attendent chacun leur issue — 2026-09-13 (#6364)

**Le constat.** `/communities` était un écran d'attente (#6214). iOS ouvre `CommunityListView` depuis le cinquième barreau, puis pousse `communityDetail`, `communityCreate`, `communitySettings`, `communityMembers` et `communityInvite` (`Router.swift`, `RootRouteDestination.swift`).

**Le périmètre V4.0.0 tranché.** Sont servis les trois gestes du chemin nominal, que la passerelle sert entièrement (`services/gateway/src/routes/communities/core.ts`) : voir les siennes (`/communities`), en ouvrir une (`/communities/:id`, l'adresse du legacy reprise, D-5, par id OU identifiant), en créer une (`/communities/new`, adresse neuve, déclarée AVANT le détail dans `route-table.tsx` : le routeur rend la première adresse qui correspond, et `new` serait lu comme un identifiant). Ne sont PAS servis, et aucun de leurs contrôles n'est dessiné (loi 4) : les membres (#6375), l'invitation et l'ajout de membres à la création (#6376), les réglages du créateur (#6377), rejoindre et quitter (#6378), l'onglet des publications du détail (#6379). Le cœur « réagir à la communauté » du détail iOS n'a aucun effet et n'est pas repris. Recette connectée sur staging et dans les coques : #6381.

**Le port est une projection** (`lib/api/communities.ts`). La route de liste charge `members[].user.isOnline` et le créateur ; celle des conversations charge la ligne entière des participants. Le cache de requêtes est persisté : seuls les champs peints y entrent, et la présence d'autrui n'y entre jamais. Le brouillon de création est validé par `zod/mini` avec les bornes de `createCommunityRequestSchema` avant qu'un octet ne parte ; un refus se nomme sous son champ, un 409 sous l'identifiant.

**Cache d'abord, à trois niveaux.** La liste se peint depuis le cache persisté ; le squelette ne vient que sur un cache vide. Une recherche se peint AUSSITÔT depuis la liste en cache filtrée comme la passerelle filtre (`cachedSearchPlaceholder`), puis la réponse complète la première page — iOS vide la grille le temps de la requête. Le détail se peint depuis la carte déjà reçue (`findCachedCommunity`, par id ou identifiant) et se revalide en fond.

**Divergence assumée avec la doctrine optimiste : la création attend la passerelle.** L'identité d'une communauté (son `id`, son identifiant `mshy_…` qu'un conflit peut refuser) est attribuée par le serveur : une carte posée avant la réponse mènerait à un détail inexistant et disparaîtrait sur un 409. Le retour instantané est le bouton, qui passe « Création… » au geste ; la réponse écrit ENSEMBLE le détail et la tête de la liste (`community-actions.ts`), et l'écran de création est REMPLACÉ par le détail — le retour ramène à la liste, comme `router.pop()` puis `push(detail)` d'iOS. Hors ligne, rien ne part (#6325).

**Divergences assumées avec iOS.**
- **Le texte blanc des cartes tient AA** : le repli de bannière est la teinte ASSOMBRIE et un voile descend sous le texte. iOS pose la teinte à 80 % puis 40 % d'opacité, et un nom blanc sur une communauté jaune y descend sous 2:1. Le gate mesure le pixel le plus clair réellement peint sous chaque texte.
- **Une recherche sans réponse nomme ce qu'elle cherchait** ; iOS réaffiche l'état vide générique (« Aucune communauté », « Créer »), qui dit faux quand l'utilisateur en a.
- **Le sélecteur d'emoji de la création n'est pas repris** : sur iOS, l'emoji choisi n'est ni envoyé ni conservé (#6380).
- **Aucun segment à un seul onglet** : « Conversations » est une section tant que les publications ne sont pas servies (#6379).
- 403 et 404 rendent le même refus (D-6).

**Le couloir.** En-tête (64) et recherche (56) finissent au-dessus des disques ; la première carte commence sous eux au repos (`COMMUNITIES_TOP_RESERVE`, 58). Le détail et la création sont des routes profondes (`isDeepRoute`) : ni l'un ni l'autre ne porte les disques, et `floating-gate.ts` n'a pas bougé.

**Mesuré** (`bun run build` puis `node scripts/measure-weight.mjs`, deux builds sur le même arbre, la base reprenant `route-table.tsx` et `routes/communities.tsx` d'`origin/dev` — les autres fichiers du lot n'entrent pas dans le socle) : première peinture 42,20 → 42,32 Ko (plafond 90), et 42,35 Ko une fois le lot rebasé sur `origin/dev` 7bf367f591. Chunks, sur l'arbre rebasé : `communities` 8,57 Ko (plafond 10), `community_detail` 1,15 (3), `community_create` 1,81 (3). Catalogues 24,54 Ko pour les sept (46 clés ×7, plafond porté de 20 à 26). Gate `scripts/check-communities.mjs` : 164 invariants, deux schémas × deux gabarits ; ses textes de carte sont mesurés sous les LIGNES de texte réellement posées (une boîte d'élément englobait l'anneau blanc de l'avatar et rendait 1,27:1 à tort).

**Ce que ce lot ne fait pas, et où c'est suivi.** Membres (#6375). Invitation (#6376). Réglages (#6377). Rejoindre et quitter (#6378). Publications du détail (#6379). Emoji de la création iOS (#6380). Recette connectée (#6381). File d'écriture hors ligne (#6325). Deux formes de pluriel seulement (#6316).

## D-61 · Le journal d'appels est un écran SEUL à `/calls`, pas l'onglet d'un hub ; il ne montre pas « Rappeler » tant que le web n'appelle pas ; la direction se lit par un glyphe ET un libellé — 2026-09-13 (#6362)

**Le constat.** `/calls` était un écran d'attente (#6214). Sur iOS, le troisième barreau ouvre `Route.contacts(.calls)` : l'onglet **Appels** de `ContactsHubView`, un hub à trois onglets — Appels, Clavier, Contacts — sous un en-tête repliable (`ContactsHubView.swift`, `CallsTab.swift`).

**L'adresse tranchée : un écran seul, `/calls`.** Trois raisons, mesurées sur ce que web-v2 sert.
- **Les deux autres onglets n'ont rien à montrer ici.** Le Clavier compose un numéro pour appeler : web-v2 n'a aucune pile d'appel (0 fichier de `src` ne mentionne `RTCPeerConnection`), un clavier y serait un contrôle qui ment (loi 4). L'annuaire Contacts n'est pas servi par web-v2 (`/contacts` est au legacy, `parity.md` ; ses contacts sont suivis par #6286). Un hub dont un seul onglet a un effet est un segment à un seul onglet — refusé dès D-60.
- **La table des destinations l'a prévu.** `FloatingDestination.route` est un champ DISTINCT de `key` précisément pour qu'Appels puisse devenir un onglet de `/contacts` le jour où le hub aura trois onglets servis, sans que l'échelle, son ordre ni son témoin ne bougent (`floating-menu.ts`).
- **Parité de ce qui se voit.** Le titre que l'utilisateur lit sur iOS est celui de l'onglet, « Appels » ; l'en-tête web porte le même titre et le même retour. Ce qui manque est la barre d'onglets elle-même, et c'est ce qu'on ne peut pas remplir.

**Ce qui est servi** (`GET /api/v1/calls/history`, `calls-consultation.ts`, `CallService.listHistory`) : les appels terminés des trois derniers mois, du plus récent au plus ancien ; le filtre « Tous » / « Manqués » (`filter=missed`, côté serveur) ; chaque ligne avec avatar, nom (rouge s'il est manqué), direction, glyphe vidéo, heure relative et durée `M:SS` / `H:MM:SS` ; le défilement par curseur (iOS s'arrête à la première page de 30) ; tirer pour rafraîchir. **Une ligne ouvre le FIL de sa conversation.** iOS ouvre une feuille de détail (`CallDetailSheet`) dont le geste principal est le rappel ; son contenu (date absolue, données échangées, numéro) est suivi par #6383.

**« Rappeler » ne s'affiche pas.** iOS pose au bout de chaque ligne un bouton qui lance un appel vocal ou vidéo (`CallRowDialButton`). Le web n'appelle pas : le bouton n'aurait aucun effet, il n'est pas dessiné, et un témoin (`calls.test.tsx`) comme le gate (`check-calls.mjs`) verrouillent son absence. L'appel depuis le web, et avec lui « Rappeler », est suivi par #6382.

**Divergence assumée : la direction ne se dit jamais par la couleur seule** (WCAG 1.4.1). iOS rend reçu et manqué avec le même glyphe (`arrow.down.left`), le manqué seulement en rouge, et ne nomme la direction qu'à VoiceOver. Ici chaque direction a son glyphe (`arrow-down-left` reçu, `arrow-up-right` émis, `phone-x` manqué) ET son libellé visible (« Reçu », « Émis », « Manqué »). L'annonce au lecteur d'écran recompose tout ce que la ligne montre, comme `rowAccessibilityLabel` d'iOS : nom, direction, type, heure, durée.

**Divergence assumée : la capsule choisie est l'indigo 600**, pas le 500 d'iOS — un texte blanc sur l'indigo 500 descend à 4,47:1, sous AA.

**Le port est une projection** (`lib/api/calls.ts`). La charge porte le numéro du pair, sa présence et les octets échangés ; le cache de requêtes est persisté et rien de cela n'y entre. La présence d'autrui n'entre jamais dans un cache persisté (D-60) : iOS peint la pastille du pair depuis `PresenceManager`, web-v2 ne la peint pas tant qu'une source VIVANTE ne la sert pas (#6384). Une direction inconnue se lit « reçu », comme `CallDirection(raw:)` ; une date illisible écarte la ligne.

**Cache d'abord.** Le journal se peint depuis le cache persisté ; le squelette ne vient que sur un cache vide. « Manqués » jamais ouvert se peint AUSSITÔT depuis « Tous » en cache (`seededCallHistory`) : la passerelle dérive la direction de la même façon pour les deux filtres, donc les lignes `missed` de la liste complète sont celles que le filtre servira — sauf si la liste en cache est TRONQUÉE et n'en porte aucune, où un vide dessiné mentirait (le squelette reste). Le filtre vit dans l'adresse (`?filtre=missed`), comme la catégorie de la cloche (D-55). Hors ligne, le journal reste et le dit ; à cache vide, l'erreur dit « hors ligne » quand c'est la cause.

**Pas de temps réel.** Un appel qui se termine pendant que l'écran est ouvert n'apparaît qu'au rafraîchissement ou au retour sur l'écran — iOS charge son journal à l'apparition de l'onglet et au tirer, sans abonnement non plus.

**Le couloir.** En-tête (64) et filtre (52) finissent au-dessus des disques ; la première ligne commence sous eux au repos (`CALLS_TOP_RESERVE`). `/calls` porte les disques (`floating-gate.ts` n'a pas bougé).

**Ce que ce lot ne fait pas, et où c'est suivi.** Lancer et rappeler un appel depuis le web (#6382). Le détail d'un appel (#6383). La pastille de présence vivante (#6384). Recette connectée sur staging dans les coques (#6385). L'heure relative courte, encore en unités françaises dans les sept langues — lentille, cloche et journal (#6386).

## D-62 · Découvrir des personnes se sert à `/discover` avec les trois onglets d'iOS ; les demandes reçues sont UNE source que l'onglet, le profil et le barreau lisent ; aucune présence n'y est peinte — 2026-09-14 (#6363)

**Le constat.** `/discover` était un écran d'attente (#6214). iOS ouvre `PeopleDiscoveryView(initialTab: .discover)` depuis le quatrième barreau : un en-tête avec retour, trois onglets soulignés — Découvrir (`DiscoverTab`), Demandes (`RequestsTab`), Bloqués (`BlockedTab`) — et le compte des demandes reçues sur « Demandes ».

**Ce qui est servi, et d'où.**
- **Découvrir** : inviter par e-mail (`POST /invitations/email`, adresse validée par `z.email()` avant l'envoi ; 409 « déjà sur Meeshy » se nomme sous le champ) ; rechercher (`GET /directory/people`, deux caractères, 350 ms sans frappe) ; chaque personne rendue porte le geste de `ConnectionActionView` selon ce qu'elle EST — Ajouter, En attente (qui annule), Refuser/Accepter, Contact, Bloqué, rien pour soi.
- **Demandes** : Reçues et Envoyées (`GET /directory/friend-requests?direction=received|sent&status=pending`, pages de cent), accepter, refuser, annuler (`PATCH …/:id {action}`). Le filtre vit dans l'adresse (`?demandes=sent`), l'onglet aussi (`?onglet=requests|blocked`) : le profil ouvre la découverte, et le retour rend l'onglet.
- **Bloqués** : `GET /directory/blocks`, « Débloquer » demande confirmation (un `<dialog>` modal, comme l'`alert` d'iOS), `DELETE /directory/blocks/:userId`.
La route dépréciée `/friend-requests` n'est jamais appelée.

**Une source par fait.** Trois paniers (`lib/api/friend-requests.ts`) : reçues en attente, envoyées en attente, acceptées dans les deux sens. L'état d'une personne dans la recherche se lit dans ces paniers et dans les bloqués (`relationshipIndexOf`, ordre d'`UserRelationshipResolver` : soi, bloqué, contact, envoyée, reçue). Le compte du **profil** (`RequestsSection`) lisait sa propre requête (`profile.ts › loadPendingRequests`) : il projette désormais le panier des reçues (`pendingRequestsOf`), le même que l'onglet et que la pastille du barreau (#6321). Deux lectures parallèles auraient dit deux nombres, et une acceptation n'aurait fait baisser que l'un des deux.

**Les gestes sont optimistes, avec retour arrière, et idempotents** (`lib/api/friend-actions.ts`). Accepter ou refuser retire la ligne du panier au tap — le compte de l'onglet, le profil et la pastille baissent avant la réponse ; accepter pose la personne parmi les contacts ; envoyer pose une demande provisoire que la réponse remplace ; un refus de la passerelle restaure l'instantané puis revalide la famille `['friends']`. Un second geste sur la même demande (ou la même personne) pendant que le premier est en vol rend la MÊME promesse : un double tap est une requête. Chaque issue s'annonce dans une région `role="status"` visible quatre secondes.

**Divergence assumée : hors ligne, rien ne part.** iOS met accepter, refuser et envoyer en file (`OfflineQueue`). Le web n'a pas de file d'écriture (#6325) : un geste appliqué localement qui ne partirait jamais serait un contrôle qui ment. Le geste ne change rien et le dit (« Hors ligne : rien n'a été envoyé. »).

**Aucune présence n'est peinte, même quand la charge en porte.** `/directory/friend-requests` charge `isOnline`/`lastActiveAt` des deux parties (gatées par `servirParties`, donc servies pour un ami), et une recherche pourrait un jour demander `?expand=presence`. `decodePerson` ne garde que `id`, `username`, `displayName`, `avatar` : la présence n'entre ni dans le cache persisté (D-60) ni dans un avatar. Témoins : `users-search.test.ts`, `friend-requests.test.ts`, `discover.test.tsx` (une charge avec `isOnline: true` ne rend aucun `data-presence`), et le gate compte zéro point dans tous les états. La présence VIVANTE d'un ami accepté est suivie par #6399.

**Divergences d'encre assumées (AA).** Capsules pleines et pastille d'onglet à l'indigo 600 (texte blanc sur le 500 d'iOS à 4,47:1). Disque « Accepter » au vert assombri (coche blanche sur le vert d'iOS à 2,5:1 en sombre). Voile des capsules d'état à 9 % au lieu de 15 % (« Contact » mesuré à 4,49:1 en clair sur un voile à 14 %). Sous 360 de large, le glyphe d'onglet cède la place au nom (« Demandes » et sa pastille se tronquaient à 320).

**Ce que l'écran n'offre pas (loi 4), et où c'est suivi.** Inviter par SMS et retrouver son carnet d'adresses — pas de compositeur SMS ni de carnet dans un navigateur (#6394). Les suggestions à requête vide — aucune route ne les sert, iOS non plus en réalité (#6395). Ouvrir le profil d'une personne — web-v2 n'a pas de profil d'autrui (#6396). La route voisine « À proximité », `NearbyDiscoveryView` (#6397). La recette connectée sur staging dans les coques (#6398).

**Le couloir.** En-tête (64) et onglets (52) finissent au-dessus des disques ; le contenu commence sous eux au repos (`DISCOVER_TOP_RESERVE`, 62). `/discover` porte les disques (`floating-gate.ts` n'a pas bougé).

**Mesuré** (`bun run build` puis `node scripts/measure-weight.mjs`) : première peinture 42,56 Ko (plafond 90) ; chunk `discover` 9,05 Ko (plafond 11) ; port `friend_requests` 1,32 Ko (plafond 3, borné à part parce que la pastille du barreau l'emporte dans le chunk des menus) ; catalogues 31,41 Ko pour les sept (65 clés × 7, plafond porté de 28 à 33). Gate `scripts/check-discover.mjs` : 156 invariants, deux schémas × deux gabarits. `useSettled` quitte `routes/communities.tsx` pour `lib/view/use-settled.ts`, que les deux recherches partagent.

**Le barreau « Découvrir » porte le compte (#6321).** iOS déclare deux compteurs sur l'échelle (`RootMenuLadderEntry.swift:78-84`) ; le second, `pendingFriendRequests`, arrive avec sa source. `DISCOVER_DESTINATION.badge = 'pendingFriendRequests'`, résolu par `usePendingFriendRequestCount` sur le panier `received` — la même entrée que l'onglet et le profil : un refus ou une acceptation fait baisser la pastille dans la même image, avant la réponse. La pastille est celle du barreau « Notifications » (`UnreadRungBadge`, blanche à l'encre de la teinte assombrie), décorative ; le barreau annonce « Découvrir, N demandes reçues ». À zéro, rien n'est peint et le nom redevient « Découvrir ». La page porte cent lignes : au-delà, « 99+ », dans la pastille comme dans le nom. Le temps réel tient le compte : `friend-request:new|cancelled|accepted|rejected` et toute RE-authentification invalident la famille `['friends']` (`socket.ts`), dont la clé vit dans `lib/api/friends-keys.ts`, un module sans dépendance, pour que le chunk `realtime` n'emporte ni le port ni `zod`. Mesuré : `floating_menus` 3,22 Ko (plafond 4), `realtime` 4,48 Ko (plafond 5), catalogues 31,58 Ko (plafond 33) ; `check-discover.mjs` lit le barreau à « 3 » puis à « 1 » après les deux gestes (172 invariants), `check-notifications.mjs` compte désormais les barreaux porteurs par adresse (« Notifications » et « Découvrir »).

## D-63 · « Mes liens » sert le hub et les liens de PARTAGE comme iOS ; les trois autres familles attendent leur issue ; ni « Supprimer » ni « Slug URL », qui ne tiennent pas leur promesse — 2026-09-14 (#6361)

**Le constat.** `/links` était un écran d'attente (#6214). iOS ouvre `LinksHubView` depuis le premier barreau : une bannière, puis quatre cartes — liens de partage (`ShareLinksView`, `ShareLinkDetailView`, `CreateShareLinkView`), de suivi (`TrackingLinksView`), de communauté (`CommunityLinksView`), affiliés (`AffiliateView`).

**Le périmètre tranché.** Le hub (`/links`) et la famille des liens de PARTAGE, entière : la liste et ses agrégats (`/links/share`), le détail (`/links/share/:linkId` — copier, partager, désactiver / activer) et la création (`/links/share/new`, déclarée AVANT le détail dans `route-table.tsx`). Adresses neuves : le legacy sert `/links` d'un seul tenant. Le hub ne dessine que la carte servie — une carte vers un écran d'attente serait un contrôle qui ment (loi 4) : suivi (#6408), affiliation (#6409), liens de communauté (#6410).

**Un lien d'un autre compte ne se sert jamais.** `GET /api/v1/links` filtre `createdBy` côté passerelle ; le détail se lit DANS cette liste (`findShareLink`, pages chargées jusqu'à trouver le linkId — `shareLinkDetailState` ne dit le refus qu'après la dernière), jamais par `GET /links/:identifier`, qui rend la conversation, ses participants et ses messages. Un linkId inconnu et le lien d'un autre compte rendent le MÊME refus. **Le port est une projection** (`lib/api/links.ts`) : onze clés du socle, ni créateur, ni conversation, ni politique d'accès dans le cache persisté ; de la réponse de `PATCH`, seul `isActive` passe.

**Les agrégats viennent de la même réponse.** `?include=summary` sur la première page, lu dans `meta.summary` : le transport HTTP transmet désormais `meta` (`http.ts`, non typé, validé par le port). L'alias déprécié `/links/stats` n'est jamais appelé.

**Désactiver est optimiste, avec retour arrière** (`link-actions.ts`) : la pastille, la barre d'actions, la ligne et le compte des actifs changent au geste ; un refus restaure l'instantané puis revalide ; un double tap est une requête. **Créer attend la passerelle** (arbitrage de D-60) : le linkId est attribué par le serveur ; la réponse écrit le lien en tête de liste et l'écran de création est REMPLACÉ par son détail. Hors ligne, rien ne part et l'écran le dit (#6325).

**Divergences assumées avec iOS.**
- **« Supprimer » n'est pas dessiné.** `DELETE /links/:linkId` ne fait que désactiver (`admin.ts`), alors qu'iOS le confirme « irréversible » (#6411).
- **Le « Slug URL » n'est pas dessiné.** `createLinkSchema` ne déclare pas `identifier`, que zod retire en silence : l'aperçu d'iOS promet une adresse qui ne sera jamais celle du lien (#6412).
- **« Activer » n'existe que s'il rend le lien utilisable** — ni sur une conversation fermée ni sur un lien expiré, dont la CAUSE se lit (`inactiveReason`, servie par la passerelle, qu'iOS n'affiche pas).
- **« Inactif » s'écrit sur la ligne** (WCAG 1.4.1) ; iOS ne le dit qu'à VoiceOver.
- **« Compte requis » éteint ET grise** pseudonyme, e-mail et naissance : l'écran montre ce qui part.
- **Une ligne est un lien ÉTIRÉ** (pseudo-élément), pas un lien qui contient le bouton « copier » — un contrôle imbriqué est invalide en HTML ; le texte est posé au-dessus du pseudo-élément pour rester atteignable à son centre.
- **La limite d'utilisations se saisit** (entier de 1 à 10 000, refus nommé sous le champ) plutôt qu'au `Stepper`.
- **La bannière du hub promet ce que le web sert** (« Invitez qui vous voulez dans vos conversations »), pas « suivez et monétisez ».

**L'adresse partagée est l'origine PUBLIQUE.** Dans une coque, `location.origin` est virtuelle : `webOriginOf` (`lib/links/web-origin.ts`, sans dépendance) dérive `https://staging.meeshy.me` de `https://gate.staging.meeshy.me`, miroir `MeeshyConfig.webOrigin`. La feuille de partage d'un fil (`list-header.tsx`) composait ses liens sur `window.location.origin` : elle passe par la même règle, et charge le port AU GESTE (`import()`) — importé en statique, il pesait 2,6 Ko gzip sur l'écran d'accueil.

**Le couloir.** L'en-tête du hub (64) finit au-dessus des disques ; la bannière commence sous eux au repos (`LINKS_HUB_TOP_RESERVE`, 114). Liste, détail et création sont des routes profondes, sans disques (`floating-gate.ts` n'a pas bougé).

**Mesuré** (`bun run build` puis `node scripts/measure-weight.mjs`) : première peinture 43,12 Ko (plafond 90). Chunks : `links` 9,58 Ko (hub, port, pièces ; plafond 11), `share_links` 1,18 (3), `share_link_detail` 1,03 (3), `share_link_create` 3,83 (5), `link_gestures` 1,21 (3). Catalogues 40,02 Ko (99 clés × 7, plafond porté de 33 à 42). `floating_menus` 4,90 Ko : la table des destinations, dont `/links` était le dernier importeur hors menus, est repliée dans leur chunk — base mesurée le lot mis de côté à 3,22 Ko, plafond porté à 6, retrait de l'écran d'attente devenu sans usage suivi par #6416. Gate `scripts/check-links.mjs` : 264 invariants, deux schémas × deux gabarits. `check-interface-language.mjs` ouvre toujours `/links`, désormais le hub ; ses six barreaux attendaient « Découvrir » sans le compte des demandes reçues — rouge HÉRITÉ de #6321, mesuré sur la base (78 ok, 6 échecs), corrigé ici.

**Ce que ce lot ne fait pas, et où c'est suivi.** Liens de suivi (#6408). Affiliation (#6409). Liens de communauté (#6410). Suppression réelle (#6411). Slug choisi (#6412). Recette connectée sur staging dans les coques (#6413). Écran d'attente sans usage (#6416). Deux formes de pluriel seulement (#6316).

## D-64 · Un geste qui REMPLACE ce qu'il touche retient le second tap d'un double tap ; un geste en vol ne ment pas ; une requête EN PAUSE se dit hors ligne — 2026-09-14 (#6417, #6418, #6419)

**Le constat** (relecture adversariale des quatre écrans de barreau, mesurée sur le `dist` fixtures dans Chromium tactile). Un geste optimiste remplace sa cible dans l'image qui suit : la demande refusée quitte la liste et la suivante remonte sous le doigt, « Ajouter » devient « En attente » (qui annule), « Désactiver » devient « Activer » à la même place. Deux taps à 120 ms ont refusé DEUX personnes, envoyé puis annulé une demande, désactivé puis réactivé un lien. Le témoin « un double tap n'émet qu'une requête » ne l'attrapait pas : il appelait deux fois le MÊME geste sur la MÊME cible.

**La porte** (`lib/view/tap-gate.ts`). Tout tap posé moins de 350 ms après le tap précédent — retenu ou non — est retenu : le délai de double tap d'Android (300) et d'iOS, sous le temps qu'il faut pour viser une autre ligne. Chaque écran a la sienne (`useTapGate`). Elle garde Accepter, Refuser, Annuler, Ajouter (`/discover`) et Désactiver / Activer (`/links/share/:id`). Pas Débloquer : il passe par une confirmation modale, un double tap n'y retire personne, et une porte avalerait une confirmation rapide.

**Un geste en vol ne ment pas** (#6418). Une demande provisoire porte un identifiant FABRIQUÉ (`optimiste:<userId>`) : l'annuler attend l'enregistrement puis annule la vraie, et aucun `PATCH` ne part vers un identifiant que la passerelle ne connaît pas. Une bascule de lien CONTRAIRE à celle en vol ne part pas et rend `busy`, que l'écran n'annonce pas — rendre la promesse en vol faisait dire « Lien activé » sur un lien désactivé.

**Une requête en pause se dit hors ligne** (#6419, `lib/view/cold-state.ts`). TanStack Query met en PAUSE une requête dès l'événement `offline` : ni données, ni erreur. Lu comme « chargement », c'était un squelette sans fin avec `aria-busy`. `coldStateOf` rend `ready` (des données, même en pause), `error`, `offline` (en pause, cache vide) ou `loading`. À cache froid, l'annonce dit ce qui se passera au retour du réseau (`calls.offline.cold.body`, `discover.offline.cold.body`), jamais « le journal du dernier chargement » : rien n'a été chargé. La requête repart seule à l'événement `online`.

**Mesuré.** `check-discover`, `check-links` et `check-calls` rejouent le double tap (deux clics au même point, 120 ms) et la coupure à cache froid telle qu'une coque la voit (`navigator.onLine`, événement `offline`, chunks disponibles). Sur un build où la porte vaut 0 ms et la pause se lit « chargement », `check-calls` rompt 8 invariants et `check-discover` / `check-links` échouent ; sur l'arbre livré, les trois sont verts. Catalogues 40,25 Ko (plafond 42), `calls` 4,85 Ko (6), `discover` 9,3 Ko (11).

**Suivi hors lot.** Relations au-delà de la première page de cent (#6421). Onglets au clavier (#6422). Pastille « Hors ligne » sur la bande des onglets et filtres (#6401).

## D-65 · Le menu flottant droit mène à l'administration pour qui en a la permission SERVIE ; le barreau vient EN DERNIER ; l'échelle resserre son pas plutôt que de sortir de l'écran — 2026-09-14 (#6458)

**Directive porteur (2026-09-14)** : « Le menu droite doit avoir un élément pour accéder à l'espace administration qui a été intégré à présent ! » L'espace est servi depuis #6432 (`/admin`, `/admin/users`) ; l'échelle n'avait aucun barreau qui y mène.

**Extension web assumée.** iOS n'a pas d'administration : `RootMenuLadderEntry.swift` garde ses six `case`, et `MENU_LADDER` reste leur miroir exact (le témoin d'ordre n'a pas bougé). Le septième barreau vit à part (`ADMIN_DESTINATION`, `lib/view/floating-menu.ts`) et `menuLadderFor({ canAccessAdmin })` rend l'échelle du lecteur : `MENU_LADDER` lui-même sans le droit, les six puis l'administration avec. Il n'est jamais monté puis masqué — un lien caché resterait dans le parcours de tabulation.

**La place : la DERNIÈRE.** Les six barreaux d'iOS gardent leur rang, donc leur place sous le doigt : un administrateur qui passe de l'app native au web retrouve « Réglages » là où il l'a laissé, et un lecteur sans le droit voit exactement iOS. La destination la plus rare est la plus lointaine du disque. L'insérer avant « Réglages » aurait déplacé la roue dentée pour les seuls administrateurs — deux géographies selon le rôle.

**Même mot, même icône** (dimension 6). Le nom est `admin.title` — celui de l'écran et de la rangée des Réglages, déjà dans les sept catalogues : une clé `root.menu.admin` aurait été une seconde écriture du même mot. Le glyphe est `key`, celui de la même rangée ; il vit au socle, zéro octet de glyphe. La teinte est un JETON de la palette dérivée d'iOS, `--ios-indigo-800` : la famille de la marque que la rangée porte, assez sombre pour ne pas se confondre au coin de l'œil avec « Appels » (indigo 500).

**La garde : la matrice SERVIE, fail-closed.** `useAdminAccess` (`lib/view/use-admin-access.ts`) rend `true` seulement pour une session ouverte dont `GET /me/permissions` a été servi avec `canAccessAdmin` — le prédicat `canEnterAdmin` (`lib/admin/sections.ts`), que l'écran et la rangée des Réglages lisent aussi. Inconnue, en vol, 403, panne, matrice sans le droit, session refermée : aucun barreau, et rien ne le dit (une erreur affichée apprendrait à un visiteur ordinaire qu'un espace lui est refusé). Le barreau n'est qu'une DÉCOUVERTE : `/admin` refait sa garde, on y entre aussi par un lien profond. Aucune lecture sans session (un 401 fermerait une session inexistante) ni sous `fixtures` (l'administration n'a volontairement pas de démonstration).

**Une seule lecture.** Les quatre `useQuery` de la matrice — écran, liste des comptes, rangée des Réglages, barreau — partagent `adminIdentityQueryOptions` (`lib/api/admin.ts`) : même clé, cinq minutes de fraîcheur, aucun nouvel essai. Une matrice déjà lue ouvre le barreau sans requête ; la persistance du cache la rend dès le démarrage suivant ; le client vide ce cache à chaque changement d'identité (`query-client.ts`), la matrice d'un compte ne survit pas à sa déconnexion.

**Sept barreaux ne tenaient pas à 320 × 568 au pas d'iOS.** Depuis la pose par défaut : 152 + 61 + 6 × 58 + 23 = 584 > 568 — le dernier barreau sortait de l'écran EN SILENCE, le clavier y menant un focus invisible. `ladderPitch` (`lib/view/floating-pose.ts`) garde le pas d'iOS (58) tant que l'échelle tient et le RESSERRE sinon, jamais sous un air de quatre (50) ; la place est mesurée à l'ouverture et à la rotation (`ladderRooms`, du centre du disque au bord du cadre, marge 8, barre d'état lue sur le témoin de position `start`). Six barreaux gardent 58 partout où la charte mesure. Sept à 320 × 568 : 54 en descendant, 56 en montant ; 50 et 53 sous une barre d'état de 20.

**Ce que la loi ne sauve pas, et où c'est suivi.** Un disque DÉPLACÉ à mi-hauteur d'un écran court (320 × 568, `y` ≈ 0,5) n'a d'aucun côté la place de six barreaux, même à l'air minimal : l'échelle y sortait déjà de l'écran avant ce lot, hérité de la loi de la moitié d'iOS. Suivi par une issue dédiée.

**Mesuré.** `scripts/check-admin-rung.mjs` (`check:admin-rung`, composite et CI) sur un `dist` gateway, la matrice interceptée et toute autre requête abandonnée : sans session aucune lecture ; avec le droit, deux schémas × deux gabarits, sept barreaux entièrement dans l'écran aux deux poses, atteignables en leur centre, quatre d'air au moins ; `Entrée` ouvre, `Fin` pose le focus sur l'administration, `Bas` revient au premier, `Entrée` mène à `/admin` et referme l'échelle sur UNE seule lecture de la matrice ; sans le droit, sur 403 et en vol, les six d'iOS.

## D-66 · Les Réels sont une ADRESSE (`/reels?seed=`) servie par la route unifiée ; l'ordre du fil est gelé à l'ouverture ; le défilement est celui du navigateur ; un seul lecteur joue — 2026-09-14 (#6457)

**Directive porteur (2026-09-14)** : les Réels « sont aussi accessibles dans l'entête de la page des feeds par un bouton en haut à droite », « parmi les postes il y a les réels », et « en touchant un réel on ouvre le feed de réel avec balayage haut bas pour passer au réel suivant comme sous iOS ». Référence : `ReelsPlayerView.swift`, `ReelsViewModel.swift`, `ReelsPresenter`.

**Une adresse, deux intentions.** `/reels` est `ReelsPresenter.presentFresh()` (le bouton de l'en-tête du Flux, `feed.header.reels`, glyphe `monitor-play` pour `play.rectangle.on.rectangle.fill`) ; `/reels?seed=<id>` est `present(posts:startId:)` (toucher une carte de réel). Une route plutôt qu'une couche : le retour du navigateur et le retour matériel d'Android (qui recule l'historique de la WebView) la quittent sans code dédié ; le bouton retour recule s'il y a un historique et remplace l'adresse par `/feed` sinon (lien profond ouvert seul). Les disques flottants n'y sont pas : `floating-gate.ts` est une liste fermée, `reels` n'y entre pas — iOS présente les Réels par-dessus toute la navigation. La carte du Flux devient un LIEN couvrant la carte (`draggable={false}`) sous le voile, la puce et l'identité (`pointer-events-none`), la rangée des gestes restant au-dessus : aimer ne l'ouvre pas.

**La route unifiée, pas l'alias.** `GET /social/posts?scope=reels&seed=` et non `/posts/feed/reels` : les deux lisent `chargerReels`, mais le second porte `Deprecation` — un client neuf n'adopte pas une adresse que la passerelle annonce en retrait. La page est filtrée à la frontière (`servedReels`, `lib/api/reels.ts`) : un élément sans identifiant, sans date ou d'un autre type que `REEL` ne passe pas, comme `FeedPost.reels(from:)` le fait sur iOS.

**L'ordre est gelé à l'ouverture, la donnée reste vivante — et c'est un écart ASSUMÉ avec iOS.** `ReelsViewModel.fetch(reset:)` remplace sa liste au premier retour de la passerelle, or le fil d'affinité EXCLUT la graine (`PostFeedService.getReels`, « le seed est déjà affiché par le client ») : la liste remplacée ne la contient plus et le lecteur saute au premier réel servi, sous le doigt. Ici `composeReelThread` (`lib/reels/thread.ts`) pose l'ENTRÉE — la graine, puis les réels déjà reçus par le Flux — et AJOUTE la suite servie derrière, dédoublonnée : rien ne bouge au-dessus du réel regardé. Chaque réel se peint depuis sa donnée la plus récente (Flux observé sans être rechargé, détail de la graine, pages servies). Une graine inconnue du cache (lien profond) montre le squelette le temps d'être lue : la poser en tête après coup déplacerait le réel regardé. Le fil des réels ne se relit ni au retour du focus ni à la reconnexion ; il se relit à l'ouverture, où le réel regardé est l'entrée.

**Cache d'abord.** Un réel touché dans le Flux se peint au premier rendu, sans requête (mesuré : aucun squelette observé, 50 ms clic → réel, chunk compris). Les gestes (aimer, enregistrer) passent par l'UNIQUE `performPostGesture` : il lit l'état et bascule le Flux, TOUS les fils de réels (`REELS_QUERY_ROOT`, toutes graines) et le détail ensemble, et les défait ensemble sur refus — le « J'aime » posé dans les Réels se voit au retour dans le Flux.

**Le défilement est celui du navigateur.** `scroll-snap-type: y mandatory` et `scroll-snap-stop: always` : le geste reste sur le compositeur, l'élan porte au réel suivant et l'arrêt l'y retient (mesuré au gate par un balayage tactile LANCÉ d'un tiers de page : exactement une page, aucune tâche longue). Aucun suivi du doigt réécrit en JavaScript, aucune transition sur une transformation. Le réel visible se lit sur la position (`activeIndexOf`), une fois par image. Au clavier, flèches et Page haut/bas valent le balayage, le réel atteint prend le focus (son nom annonce « Réel de <auteur>, n sur N ») ; sous `prefers-reduced-motion` le déplacement est instantané ; Échap referme.

**Un seul lecteur joue, trois au plus sont montés.** `useReelPlayback` (`lib/view/use-reel-playback.ts`) compose `useMediaPlayback` et le coordinateur de l'application — sans une ligne de lecture recopiée : le réel qui DEVIENT visible joue, celui qui sort se met en pause, la décision ne se prend qu'au changement de visibilité (une pause voulue par un tap survit aux rendus), un échec de lecture ne se relance jamais seul, l'onglet masqué suspend. `pageModeOf` monte le `<video>` du réel visible et de ses deux voisins ; les autres ne portent qu'une affiche ; un démontage relâche le coordinateur et coupe l'élément (témoin happy-dom, et au gate : zéro lecteur après le retour). La vidéo n'est pas recadrée (`object-contain`, `.resizeAspect` côté iOS). Le son part COUPÉ tant que la page n'a reçu aucune activation (`navigator.userActivation`) — un navigateur refuse une lecture sonore sans geste, jamais une lecture muette — et ouvert après un tap dans le Flux ; le rail le commande.

**Le rail n'offre que ce qui a un effet** (loi 4) : aimer, enregistrer, partager (`usePostGesture`), le son pour un réel qui se lit, et le tap sur la scène (lecture/pause). Commenter et repartager n'ont pas d'effet sur le web : ils ne sont pas montés. Les images d'un réel se parcourent d'un balayage horizontal, leurs points disent la page lue. L'auteur, la légende (Prisme, `resolveFeedCardModel`) et les compteurs sont blancs sur un voile bas mesuré AU PIXEL sur la mire du corpus : 10,4 à 12,6 (AA 4,5).

**Hors ligne.** Avec des réels, la pastille de synchronisation de la coquille dit la coupure, seule : une annonce propre à l'écran s'y superposait (mesuré à 320 × 568) — elle a été retirée. À cache froid, l'état est dessiné (« Hors ligne », « Les réels se chargeront dès le retour du réseau. »), ni squelette ni `aria-busy`, et le fil se charge seul au retour du réseau.

**Plein écran sous l'encoche.** La racine `h-dvh` ne porte pas `pt-safe` (exemption motivée dans `safe-area.test.ts`) : le média court sous l'encoche comme `.ignoresSafeArea()`, chaque chrome porte son propre inset.

**Mesuré.** `scripts/check-reels.mjs` (`check:reels`, composite et CI), 125 invariants sur le `dist` fixtures, deux schémas × deux gabarits : bouton de l'en-tête en haut à droite et atteignable ; toucher ouvre SUR le réel, sans squelette ni disque ; un seul réel joue, deux ou trois lecteurs montés ; balayage tactile suivant/précédent à une page exacte, sans tâche longue ; flèches ; « J'aime » au geste et au retour dans le Flux ; AA au pixel ; cibles 44 ; hors ligne chaud et froid ; retour navigateur et bouton retour, aucun lecteur orphelin ; lien profond sur sa graine (légende servie en français, rang 1) ; mouvement réduit. Poids : chunk `reels` 4,99 Ko (plafond 7), `post_gestures` 2,75 Ko (plafond 4, sorti du chunk `feed` qui passe à 4,06), catalogues 42,58 Ko (plafond 44), première peinture 43,56 Ko.

**Ce qui reste, et où c'est suivi.** Le mode immersif à l'appui long (#6483), les commentaires et le repartage depuis le rail (#6484), le temps réel du lecteur — `post:liked`, `post:deleted` (#6485) —, l'engagement — vue, impression, temps regardé (#6486) — et l'appui long du disque du Flux qui ouvre ce même lecteur sans graine (#6456).

## D-67 · Hors production, les rangées non portées des réglages deviennent INERTES plutôt que de mener vers la production réelle — 2026-09-13 (#6354, décision-produit)

**Le constat mesuré.** Recette sur staging (`gate.staging.meeshy.me`), émulateur Android, coque web-v2 2.0.2 : un toucher sur « Delete account — Classic version, new tab » ouvrait Chrome sur `https://meeshy.me/account/deletion` — la suppression de compte de la PRODUCTION, potentiellement sous un compte qui n'est pas celui de staging. `legacyHref()` (`lib/view/legacy-link.ts`) pose `LEGACY_ORIGIN` en constante ABSOLUE, pour une bonne raison (une adresse relative mènerait à la page introuvable sur staging et dans les coques) — mais sans regarder QUEL environnement l'ouvre.

**Les trois voies posées par l'issue, et pourquoi la troisième est retenue.**
1. *Staging reçoit un legacy à lui* — écartée : aucun hôte n'existe (`legacy.staging.meeshy.me` / `app.staging.meeshy.me` / `v1.staging.meeshy.me` ne répondent pas, mesuré par `curl`, code 000), et en créer un redéploierait toute l'ancienne stack pour sept liens de repli. Un coût d'infra pour une fonctionnalité que la v2.0 va, par construction, remplacer écran par écran.
2. *L'origine du legacy se déclare au build comme `VITE_API_BASE`* — écartée : il n'existe littéralement rien à déclarer côté staging (voie 1 rejetée), donc une variable de plus n'aurait aucune valeur non-production à prendre.
3. **Un build hors production ne rend aucun lien vers le legacy — retenue.** C'est la seule réponse qui ne suppose PAS l'existence d'un legacy de staging, et elle suit la loi 4 déjà en vigueur sur cette section (« rien n'est offert qui n'a un effet ») : une rangée qui mènerait ailleurs qu'où elle le dit n'a pas un effet, elle a le MAUVAIS effet.

**Le test est `apiConfig.base`, jamais un nom d'hôte lu à la volée.** `legacyReachable(apiBase)` (`lib/view/legacy-link.ts`) compare l'origine de la passerelle du build à `PRODUCTION_ORIGIN` (`https://gate.meeshy.me`, exportée de `lib/api/config.ts`) — une loi PURE, testable sans construction, même motif que `resolveApiConfig(env)`. `SettingsScreen` la résout une fois (`legacyReachable(apiConfig.base)`) et la descend en prop à `AccountSection`, `PrivacySection`, `NotificationsSection`, `DataSection` : chaque section reste un composant PUR (primitives en props), rien n'y relit `import.meta.env`.

**La rangée reste NOMMÉE, elle perd seulement son effet.** Hors production, `LegacyRow` rend le même libellé et la même icône dans un `<div aria-disabled="true" data-legacy-unavailable>` — jamais un `<a href>` — avec une légende qui le dit (`settings.legacy.unavailable`, sept langues) au lieu de « Version classique, nouvel onglet ». Un réglage qui disparaîtrait purement et simplement rejouerait exactement le défaut que la section entière corrige depuis #5563 (« un réglage qu'on ne trouve plus est un réglage perdu ») — ici la bonne réponse n'est pas de le rendre introuvable, mais de dire pourquoi il ne mène nulle part.

**Vérifié par construction, pas seulement par témoin.** `bun run build` avec `VITE_API_BASE=https://gate.staging.meeshy.me` puis un navigateur réel sur `/settings` : zéro `a[data-legacy]`, sept rangées `[data-legacy-unavailable]`, et **aucune occurrence de `meeshy.me` dans le texte affiché**. Le gate `check-settings.mjs` (construction PAR DÉFAUT, `apiConfig.base` de production) reste vert à l'identique : les sept rangées continuent de mener au legacy dans un nouvel onglet — cette décision ne change rien pour la production, qui reste servie par `apps/web` jusqu'à la bascule.

> **Mise à jour 2026-09-15 : décision close par la décommission du legacy (#6702).** Plus aucun build, de production ou non, ne rend de lien vers le legacy. `legacyReachable` et `lib/view/legacy-link.ts` sont supprimés, et les rangées non portées sont masquées, chacune avec son issue de portage (#6720 à #6734, #6335). La suppression de compte est servie par la v2 (`/account/deletion`, #6715). La question « quel environnement ouvre ce lien ? » ne se pose plus, puisqu'aucun lien ne quitte la v2.

**Ce que ce lot ne fait pas.** Aucun nouvel hôte de staging n'est créé (voie 1, écartée ci-dessus). La recette manuelle sur l'émulateur Android (mentionnée dans l'issue) reste à rejouer par le porteur avec ce correctif ; la preuve automatisée ici est le build ciblé + navigateur réel décrit au paragraphe précédent, qui reproduit exactement les conditions mesurées (origine de passerelle non-production, aucune adresse relative en jeu).

## D-68 · Le disque du Flux est une BASCULE dont le nom suit la destination ; son appui long ouvre les Réels ; le clic du relâché est avalé à la fenêtre ; le clavier a son appui long — 2026-09-14 (#6456)

**Directive porteur (2026-09-14)** : « Le menu menant vers les feed est un menu toggle (affiche le feed ou le chat, l'icône change en fonction), le longpress dessus affiche les réels directement ! » Référence : `RootView.draggableFloatingButtons` (`onLeftTap: showFeed.toggle()`, `onLeftLongPress: ReelsPresenter.shared.presentFresh()`), `FreeFloatingButton` (`LongPressGesture(minimumDuration: 0.5)`).

**La bascule est une loi pure sur la route.** `feedDiscDestination(routeKey)` (`lib/view/floating-menu.ts`) rend `CONVERSATIONS_DESTINATION` (route `list`) sur le Flux et `FEED_DESTINATION` partout ailleurs où les disques paraissent. La coquille passe sa clé de route aux menus (`<FloatingMenus routeKey>`), qui restent montés d'une route à l'autre : le disque ne quitte jamais le document et ne bouge pas d'un pixel pendant la bascule (mesuré). Le disque reste un LIEN : son `href`, son nom et son glyphe sont ceux de la destination du tap, jamais de l'écran courant. Un disque « Flux » posé sur le Flux annoncerait un geste sans effet.

**Le glyphe du retour est la marque.** iOS peint `AnimatedLogoView` dans ce disque quand le Flux est ouvert ; le web peint `BrandMark` (les trois traits, 28 de côté, trait de 3), au repos, sans la respiration continue, pour la raison que `brand-mark.tsx` donne déjà. Le nom est `root.menu.conversations`, avec les valeurs de `tab.conversations` d'iOS dans les sept langues. `MenuGlyph` gagne un troisième jeu, `marque`, et la marque vit dans son propre chunk partagé (0,35 Ko), jamais dans celui des menus.

**Un seul seuil pour trois gestes.** L'appui long est décidé par la machine PURE de `long-press.ts` (`pressReducer` : 500 ms, 6 px), la même que le menu d'un message ; le glisser part au-delà de `FLOATING_DRAG_THRESHOLD`, et un témoin garde l'égalité des deux seuils (`floating-drag.test.ts`), plutôt qu'un import qui aurait tiré React dans la loi pure lue par le chrome du Flux. Au-delà de 6 px, l'appui long est annulé ET le glisser commence : aucune bande de distances où le disque ne ferait rien. Déclenché, l'appui long abandonne la course (le disque ne bouge plus) et navigue.

**Le clic du relâché est avalé à la FENÊTRE.** Mesuré au navigateur sur un appui tactile : l'appui long a déjà changé d'écran sous le doigt, le disque est démonté, et le clic que Chromium synthétise au relâché, une milliseconde après `pointerup` mais dans une tâche séparée, retombait sur la scène des Réels, dont le tap met la lecture en pause. `consumeClick` ne pouvait rien pour lui : il n'est interrogé que par un élément qui n'existe plus. `swallowReleaseClick` (`use-floating-drag.ts`) arme, en capture sur la fenêtre, l'avalement du SEUL clic qui suit le relâché de ce geste, dans une fenêtre de 350 ms ; un nouvel appui, une annulation ou une touche désarme. Un clic volontaire suivant n'est jamais mangé (témoin). Le gate a rougi quatre fois sur le `dist` d'avant ce correctif, une par gabarit, sur ce seul invariant.

**Le menu contextuel du système.** Un lien tenu au doigt ouvre, sur Android, la bulle « ouvrir dans un onglet ». Pendant un appui principal, `contextmenu` VAUT l'appui long et il est avalé ; pendant ou juste après un geste, il est avalé ; hors de tout appui (clic droit de la souris), le menu du navigateur reste, avec l'ouverture en nouvel onglet. Chromium sans tête n'émet pas de `contextmenu` pour un appui tactile synthétique : le gate PUBLIE le compte (0) au lieu de s'en prévaloir, la loi est prouvée par `floating-menus.test.tsx`.

**Le clavier a son appui long, parce que l'indice l'annonce.** L'indice (`a11y.floating.feed.hint`, « Appui long pour lancer les Réels », relié par `aria-describedby`, hors du lien pour ne pas entrer dans son nom) décrirait sinon au clavier un geste qu'il ne peut pas faire. `Maj+F10` et la touche de menu ouvrent les Réels (`aria-keyshortcuts="Shift+F10"`) : ce sont les deux déclencheurs de l'appui long du menu d'un message, écrits une fois (`isContextMenuKey`, `long-press.ts`). Même geste, même effet (dimension 6). Le bouton « Lancer les Réels » de l'en-tête du Flux (#6457) reste la porte découvrable : un seul bouton, réutilisé.

**Ce qui diverge d'iOS, assumé.** iOS garde le libellé « Flux » et l'indice « Ouvre le flux d'actualité » quel que soit l'état, et ne donne à VoiceOver aucune action nommée pour l'appui long. Le web ne recopie pas ce défaut ; iOS le corrige par #6494. Aucun retour haptique : le web n'en a pas.

**Mesuré.** `scripts/check-feed-disc.mjs` (`check:feed-disc`, composite et CI), 212 invariants sur le `dist` fixtures, deux schémas × deux gabarits : face « Flux » sur la liste (adresse, nom, indice, raccourci, glyphe, 44 atteignables) ; tap tremblé de 2 px ⇒ Flux, disque jamais retiré du document, même place, face « Conversations » avec la marque ; tap sur le Flux ⇒ liste ; appui long souris depuis la liste ET depuis le Flux ⇒ `/reels` pendant l'appui, une seule adresse empilée, aucun clic au relâché, place mémorisée intacte, retour à la même place ; appui long tactile ⇒ `/reels` sans clic au relâché ; `Maj+F10` ⇒ `/reels` ; glisser tenu 750 ms ⇒ rien d'empilé, disque sous le pointeur à 1,5 px près, accroché au bord droit, place retrouvée au rechargement ET après la bascule ; « Lancer les Réels » en haut à droite de l'en-tête ; un réel ouvert depuis une carte ramène au Flux au même défilement, disque « Conversations » ; aucune erreur de page, aucun défilement horizontal. `check-floating-clearance` reste vert. Poids, sur l'arbre rebasé : chunk `floating_menus` 6,00 Ko (plafond porté de 6 à 7), catalogues 42,99 Ko (plafond 44), première peinture 43,66 Ko.

## D-69 · `/login` s'ouvre sur le lien magique et l'inscription se déplie barreau par barreau — la porte et les champs suivent la directive du 2026-09-13/14 (#6404, #6405)

**Directive porteur, en trois temps.** « Avec connexion par magic link comme connexion par défaut pour le moment ! On met l'e-mail on reçoit un email (préciser dans l'interface de regarder les spams si aucun email ne parvient dans la minute) !! Proposer l'option se connecter avec identifiant (email, téléphone, pseudo) et mot de passe ! » Puis, sur l'inscription : « Normalement c'est déjà développé, facilite juste la mise en place et modification des champs calculés automatiquement, assure-toi d'avoir un composant moderne et agréable à voir, les champs apparaissent uniquement au fur et à mesure ! »

**La porte vit dans l'ADRESSE.** `/login` nu rend le lien magique ; `/login?methode=motdepasse` rend le formulaire identifiant + mot de passe, second facteur compris ; une valeur inconnue retombe sur la porte par défaut. Le retour arrière rend le choix, un lien le partage, une recette ouvre l'une ou l'autre — la même règle que la catégorie de la cloche. `loginMethodFromSearch` est la loi, `LoginDoors` le rendu : l'écran exporté n'ajoute que la lecture de l'adresse, ce qui rend les deux portes prouvables sans monter le routeur, ses chunks paresseux et son préalable de catalogue.

**UNE machine pour deux hôtes.** `MagicLinkPanel` (`components/magic-link-panel.tsx`) porte la saisie, l'envoi, le compte à rebours, le renvoi et les erreurs ; `magic-link-flow.tsx` n'est plus que le chrome de l'écran plein `/auth/magic-link` — l'adresse que l'e-mail vise (`MagicLinkService.ts:548`) et que les liens déjà envoyés ouvrent, donc jamais retirée. Recopier la machine dans l'écran de connexion en aurait fait deux, divergentes au premier correctif.

**Les indésirables sont NOMMÉS pendant l'attente.** `POST /auth/magic-link/request` rend 200 même pour une adresse inconnue (`MagicLinkService.ts:133-137`, anti-énumération) : l'écran ne peut ni promettre l'envoi ni le démentir. Ce qu'il peut, et ce que la directive demande mot pour mot, c'est nommer la première cause d'un e-mail jamais reçu et dire au bout de combien de temps s'en inquiéter. La note est à l'étape d'ATTENTE, jamais derrière un (i) : c'est le seul moment où l'on attend quelque chose qui peut ne jamais paraître. *(Supplanté le 2026-09-15 par D-71 : la note reste à l'étape d'attente, repliée derrière un (i) « Rien reçu ? ».)*

**L'identifiant DIT ce qu'il accepte** — « E-mail, téléphone ou pseudo ». `AuthService.authenticate` cherchait déjà par les trois (`AuthService.ts:155-158`) ; seul le libellé, qui disait « Identifiant », empêchait de le savoir. Rien n'est ajouté côté passerelle : une capacité existante devient visible.

**L'inscription se déplie, et ne se replie JAMAIS.** Trois barreaux (`lib/view/signup-rungs.ts`) : l'ADRESSE ouvre le formulaire (tout en découle — l'identité dérivée de #6479, le lien de validation) ; une adresse valide ouvre le NUMÉRO ; le numéro RÉPONDU ouvre le reste (identité, mot de passe facultatif, langue, bouton, mentions). **« Répondu » n'est pas « rempli »** : le numéro est facultatif, et exiger des chiffres en ferait une obligation déguisée — taper, quitter le champ ou toucher « Je continue sans numéro » valent réponse. La loi est MONOTONE : revenir corriger son adresse ne fait pas s'effondrer la moitié du formulaire sous les doigts, ce qui serait le contraire de ce que la directive demande. Elle rend l'objet précédent à l'identique quand rien ne s'ouvre, ce qui permet à l'écran de dériver l'état PENDANT le rendu — un effet aurait peint une image de plus avec l'ancien état, et le barreau serait paru un battement après la frappe qui l'ouvre.

**Ce qui n'est pas un champ n'est pas un barreau.** Le « X » et « Déjà un compte ? Se connecter » restent visibles dès la première seconde : ce sont des SORTIES, et remplir une adresse pour faire paraître le lien qui mène ailleurs serait absurde. La jauge de trois segments et « Étape N sur 3 » rachètent le prix du dépliage : un formulaire qui s'ouvre sans dire combien il reste a l'air sans fin.

**`RungReveal` ne monte rien tant que le barreau n'est pas paru** — un bloc replié mais monté laisserait ses champs dans la tabulation, dans l'envoi et dans l'arbre d'accessibilité. L'animation est une ENTRÉE (la loi étant monotone, il n'y a pas de sortie à animer) et emploie le ressort déjà en place (`.signup-spring`, grille `0fr → 1fr`, coupée par `prefers-reduced-motion`).

**`onChange` → `onInput` sur les trois champs de l'inscription et la saisie de `DerivedIdentity`** : sous `happy-dom`, React ne voit pas un `input.value = X` suivi d'un événement `input` quand le champ pose `onChange` (leçon 603, qui annonçait ce jour : « le jour où il gagne un témoin interactif, il tombera dans le même panneau »).

**Mesuré.** `bun test` 3757 verts (288 fichiers) ; `type-check` et `build` verts ; première peinture 43,76 Ko ; navigateur réel (390×844, sombre) sur `dist` : trois états de l'inscription et les deux portes capturés, zéro erreur de page.

**Ce que ce lot ne fait pas.** L'inscription SANS mot de passe à partir de l'e-mail et du numéro seuls (la « simplifiée » de la directive) demande une route que la passerelle n'a pas : `registerRequestSchema` exige `email` + `password` et un nom, et le lien magique ne crée aucun compte. La décision de produit et son implémentation sont portées par #6405.

## D-70 · Une publication s'affiche dans l'agencement choisi par son auteur ; le fil et le détail annoncent `X-Canvas-Caps: 3` pour le recevoir — 2026-09-15 (#6514)

**Le choix est à l'AUTEUR, et il voyage.** iOS (#6502) laisse choisir, au moment de publier, entre carrousel, défilement continu (`reel`), hero, vague (`wave`) et sinusoïde (`sine`). La valeur vit dans le document canvas v3 (`storyEffects.layout`, `MosaicLayoutModeSchema`), sans champ serveur. La calculer chez le lecteur, d'après le nombre de médias ou la largeur, donnerait deux mises en page pour un même post.

**La loi est DÉRIVÉE, et un gate la tient.** `lib/feed/mosaic-layout.ts` reprend `MosaicLayoutMode` (`CanvasV3.swift`) et la géométrie `MosaicLayout` (`MosaicLayout.swift`) en fractions de la boîte : plafond de quatre tuiles, « +N » sur la dernière seule, rapports de boîte déclarés par mode, légende là où la place le permet (grande tuile du hero, tuiles du défilement), bornée en MOTS. `scripts/lib/curve-mosaic-layout.mjs` (PARTIE 12 de `check-curve`) confronte 19 cotes aux trois sources Swift et au schéma partagé. Une mutation de quatre cotes dérivées produit 5 défauts et une sortie 1.

**Le repli est le carrousel, qui était le rendu d'avant.** `layout` absent (tout le corpus antérieur au 2026-09-06), inconnu (écrit par un client plus récent), ou blob non marqué `v >= 3` : carrousel. Un média seul reste un carrousel, même en hero, parce qu'une mosaïque d'un élément n'en est pas une.

**Une tuile montre un MÉDIA, pas une scène.** iOS monte le player de la scène dans chaque tuile ; ce client ne rend pas encore les scènes. Le média de la publication, dans l'ordre servi, est ce qu'il sait peindre. `FeedMediaSurface` sort de la carte : la page d'un carrousel, l'affiche d'un réel et la tuile d'une mosaïque sont trois hôtes pour une seule surface. Le défilement continu déborde volontairement à droite ; son conteneur défile, reçoit le focus clavier et porte un nom (`feed.post.media.mosaic`).

**Pourquoi l'en-tête.** Sans `X-Canvas-Caps`, la passerelle traite le lecteur en client ancien (table O17, `negotiateWireStoryEffects`). Elle omet `storyEffects` d'un post à média et remplace celui d'un post sans média par une sentinelle v1. L'agencement n'arriverait donc jamais. Le fil (`loadFeedPage`) et le détail (`loadPost`) annoncent le niveau 3, comme iOS et Android. Le lecteur de stories ne l'annonce PAS : il lit encore la forme v1 (`storyEffects.background`), et l'annoncer lui retirerait ses fonds. CORS n'a rien à ouvrir, puisque `@fastify/cors` reflète les en-têtes demandés quand `allowedHeaders` n'est pas posé.

**Mesuré.** `bun test` : 3849 verts (294 fichiers). `type-check`, `build`, `check-curve`, `measure-weight`, `check-utilities`, `check-git-tracking`, `check-feed-disc` (220 invariants), `check-floating-clearance` et `check-reels` sont verts. Poids : première peinture 43,78 Ko ; catalogues 45,6 Ko pour un plafond de 46 ; chunk `feed` 4,48 Ko. En navigateur réel sur `dist` (390 et 320 px de large), `POST_HERO` pose une grande tuile de 0,62 et deux satellites de 0,366 × 0,493, soit exactement les cotes Swift. La boîte mesure 0,82, aucun défilement horizontal, zéro erreur de page.

**Ce que ce lot ne fait pas.** Android. Son décodeur (`CanvasV3.kt`) ne déclare pas `layout`, et le pont v3 → v1 (`StoryEffectsWireSerializer` → `StoryEffects.rendering`) le perd. Le fil pose donc toujours `MediaCollage.solve(images.size)`. Le suivi est tenu par #6514, qui reste ouverte.

## D-71 · La connexion et l'inscription disent « par e-mail » : la baguette reste, le mot « magique » part, le « comment » passe derrière un (i) — 2026-09-15 (#6626)

**Directive porteur.** « Moins de détails sur la page de connexion et d'enregistrement ; utiliser des (i) pour pouvoir informer sur le mode de fonctionnement si naturellement ce n'est pas clair. L'utilisateur a besoin de savoir qu'il va se connecter par email et non de savoir que c'est magic-mail… Garder la baguette magic mais être clair et simple. » Elle supplante deux choix antérieurs, écrits pour de bonnes raisons : la note des indésirables en clair pendant l'attente (D-69, #6404) et l'avertissement de validation en clair sous l'adresse de l'inscription (#6479).

**Le vocabulaire est celui des trois clients, pas une improvisation web.** Porte mot de passe : « Se connecter par e-mail », baguette en tête. En-tête de l'écran plein : « Connexion par e-mail ». Panneau : « Votre adresse e-mail », bouton « Recevoir le lien », renvoi « Renvoyer le lien ». Attente : « E-mail envoyé », « Ouvrez le lien reçu à » + l'adresse. Les (i) : « Comment ça marche », « Rien reçu ? », « Pourquoi un lien ». L'écran d'un lien invalide dit « Un lien de connexion expire après 10 minutes ». Les routes (`/auth/magic-link`), les fichiers et les identifiants ne changent pas : le mot disparaît de ce que l'utilisateur LIT ou ENTEND, pas du code.

**Un (i), un seul composant.** `components/info-hint.tsx` : `useInfoHint` (l'identifiant qui relie le bouton à sa note, et l'état ouvert), `InfoHintButton`, `InfoHintText`. Le (i) vivait dans `Field` et, recopié à la main, sous le téléphone de l'inscription. La connexion en demandait deux de plus HORS de tout champ : à côté du titre, et sous le compte à rebours. Une troisième et une quatrième copie auraient dérivé au premier correctif. `Field` et le téléphone passent donc par lui. Replié ne veut pas dire absent : la note reste dans le DOM en `sr-only`, et un champ la cite par `aria-describedby`.

**« Rien reçu ? » garde son libellé LU à côté du glyphe** (`showsLabel`). Posé seul sous le compte à rebours, loin de tout champ ou titre, un (i) muet ne dirait pas de quoi il parle. Les deux autres (i) sont collés à ce qu'ils expliquent (un titre, un champ), et restent muets. Le texte de la note abandonne « après une minute » : c'est le texte imposé, identique sur les trois clients.

**Défaut trouvé en posant le (i) de l'adresse : `aria-invalid` se déduisait de `aria-describedby`.** L'adresse et le mot de passe de l'inscription posaient `aria-invalid={describedBy !== undefined}`. Tant que seul le refus était cité, c'était juste. Dès qu'un champ cite aussi la note de son (i), il s'annonce « invalide » avant la première lettre. Le mot de passe, qui a son (i) depuis #6441, le faisait déjà. `aria-invalid` suit désormais le REFUS du champ. Deux témoins le tiennent (`signup-identity.test.tsx`, `signup-rungs.test.tsx`).

**Le témoin lit ce qui est PERÇU, pas seulement le texte.** `test-support/perceivable-text.ts` joint le `textContent` et les `aria-label`/`title` : un « magique » retiré du texte mais resté dans un nom accessible serait encore dit à voix haute. Il court sur les deux portes de `/login`, l'écran plein, l'attente, le lien invalide et l'inscription.

---

## D-72 · L'inscription montre le contact d'emblée et n'a plus d'étapes ; `/login` se réduit à la baguette ; `?methode=password` ; `/forgot-password` prend la forme de `/login` ; un code de parrainage s'entre et un lien le pose — 2026-09-14 (#6582, #6583, #6584)

**Cette décision REDÉCOUPE D-69, elle ne l'annule pas.** La porte par défaut
reste le lien magique, la machine reste unique (`MagicLinkPanel`), la note sur
les indésirables reste, la monotonie du dépliage reste. Ce qui change, ce sont
trois choix de D-69 que le porteur a relus le lendemain.

### L'inscription — deux barreaux, et plus aucune étape

Directive : « il faut mettre dès le départ le numéro et l'e-mail à montrer, et
lorsqu'on a fini de mettre l'e-mail, faire apparaître les détails de son
identité DIRECTEMENT […] En gros pas d'étape 1 sur N à afficher : tout se fait
intuitivement dans la page de création de compte. »

`SIGNUP_RUNGS` passe de trois à deux : `contact` (l'adresse ET le numéro, dès
l'ouverture) puis `identity` (identité dérivée, mot de passe, parrainage,
langue, bouton, mentions) dès que l'adresse est valide. **Le numéro remonte
parce que le replier en faisait une ÉTAPE à franchir plutôt qu'un champ à
laisser vide** — avec, en prime, un bouton « Je continue sans numéro » pour
sortir d'une porte qu'on venait soi-même de fermer. Il disparaît avec lui.

La jauge de trois segments et « Étape N sur N » tombent aussi, et c'est
cohérent : elles avaient été ajoutées pour RACHETER l'impression de formulaire
sans fin que le dépliage créait. Un dispositif dont il faut compenser l'effet
coûte plus qu'il ne rapporte (leçon 612).

`SignupAnswers` n'a plus qu'une observation (`emailValid`) : le numéro ne
conditionne plus rien, donc `phoneAnswered` — et les trois gestes qui le
levaient — n'ont plus de raison d'être. La loi reste PURE, MONOTONE, et rend
l'objet précédent à l'identique quand rien ne s'ouvre, ce qui permet toujours
de dériver l'état pendant le rendu.

### Le mot de passe se PROUVE facultatif, et dit ce qu'il change

« (facultatif) » quitte le libellé : *le fait que le bouton créer mon compte
fonctionne est suffisant pour dire qu'on peut créer le compte sans mot de
passe*. La mention décrivait ce que le contrôle montre déjà. Ce qui la remplace
n'est pas une mention mais une CONSÉQUENCE, VISIBLE et non derrière un (i),
parce qu'elle CHANGE selon l'état : mot de passe valide ⇒ « votre compte sera
actif immédiatement, il restera seulement à valider votre adresse » ; champ
vide ⇒ « votre compte restera à configurer ».

Un mot de passe qui tient `PASSWORD_MIN` entoure son champ de
`var(--color-success)` — le jeton de la table PARTAGÉE, qui porte déjà une
valeur par schéma (`#10b981` sombre, `#047857` clair) : aucune couleur n'est
fabriquée et aucune variante `light:` n'est nécessaire. Mesuré sur la carte :
7,3:1 en sombre, 5,3:1 en clair. Le signal ne tient pas à la seule couleur
(règle 17) : le bord épaissit comme au focus, et la phrase ci-dessus paraît
avec lui. `Field` porte la nouvelle prop `valid` et l'expose en
`data-field-state`, mesurable sans lire une chaîne de style ; un refus gagne
toujours sur elle.

### `/login` — la baguette, une phrase, un champ, un bouton

Directive : « à la connexion la page doit être sans titre sauf la baguette
magique ; laisser juste "nous vous enverrons un lien de connexion sécurisé par
mail", le champ e-mail et le bouton. » Le blason « Meeshy » et le titre
« Entrez votre adresse email » disaient deux fois ce que la page EST, à
quelqu'un qui vient de cliquer « Se connecter ». Ils tombent — sur cette porte
seulement : la porte du MOT DE PASSE garde son blason (elle n'a pas de
baguette) et le second facteur aussi (savoir de QUI vient une demande de code
n'est pas un ornement).

Le bouton dit « Recevoir le lien » sur les deux hôtes.

*(À LA FUSION avec `dev`, le 2026-09-15 : ce paragraphe est tenu à MOITIÉ. Le
BLASON tombe, comme écrit ci-dessus — D-71 ne le redemande pas. Le TITRE DE
SECTION revient : D-71, d'une directive POSTÉRIEURE d'un jour, en a fait
« Votre adresse e-mail » et lui a accroché le (i) « Comment ça marche », qui
porte désormais tout le mode de fonctionnement — y compris la phrase « nous
vous enverrons un lien… » que ce lot voulait garder en clair. Un titre qui
HÉBERGE la mécanique ne redit plus le champ, et cette directive-là a été relue
deux fois sur ce titre même (la place du (i), la césure de « e-mail ») : elle
a été vue, pas subie. `MagicLinkPanel` avait gagné une prop `heading` pour
taire ce titre sur `/login` ; plus personne ne la posait à faux, donc elle est
retirée plutôt que laissée morte.)*

### `?methode=password` — ce qu'on cesse d'écrire, on ne cesse pas de le lire

`motdepasse` a été l'adresse de cette porte pendant toute la vie de #6404 :
elle est dans des signets, des liens partagés et la recette. La valeur ÉMISE
devient `password` ; la valeur LUE s'élargit aux deux. La retirer de la lecture
renverrait ces adresses sur le lien magique, c'est-à-dire sur un écran que
personne n'a demandé.

### `/forgot-password` prend la forme de `/login`

L'écran portait une barre de titre — un « X » et « Mot de passe oublié » —
héritée de la feuille modale iOS. Sur le web ce n'est pas une feuille mais une
PAGE, atteinte par un lien de `/login`, d'où le bouton « retour » du navigateur
ramène déjà : la barre disait son nom à qui venait de cliquer son nom. Il prend
le halo, la colonne centrée, une enveloppe pour toute en-tête, la phrase, le
champ, le bouton, puis le retour en pied. Sa TEINTE reste `--color-ios-brand`
(`MeeshyForgotPasswordView.swift:309`) : les deux écrans ne font pas la même
promesse. Il gagne la note sur les indésirables — même attente qu'un lien
magique — et la constante devient PARTAGÉE (`lib/view/auth-copy.ts`) plutôt que
recopiée. Sa demande est INJECTABLE (`ForgotPasswordDeps`), comme celle du
panneau du lien magique.

*(À LA FUSION avec `dev`, le 2026-09-15, puis SOLDÉ dans le même mouvement :
D-71 a replié la note du panneau derrière le (i) « Rien reçu ? » et en a changé
le texte — deux phrases pour une même attente avaient donc commencé à diverger,
l'une disant « après une minute » que l'autre venait d'abandonner. La question
de produit n'en était pas une : les deux écrans attendent le MÊME e-mail, et
« moins de détails » ne peut pas vouloir dire replié ici et en clair là.
`/forgot-password` porte donc le même (i), et `lib/view/auth-copy.ts` ne tient
plus une phrase mais des CHAÎNES (`HOW_IT_WORKS_*`, `NOTHING_RECEIVED_*`) que
les deux hôtes composent — jamais un `InfoHint`, qui porte un tracé et ferait
descendre `lib/view` dans `components`.)*

### Le parrainage — entrer un code, et un lien qui le pose

Question porteur : « Qu'en est-il de la page référer ? Ou de la possibilité
d'entrer le code du référer lors de l'inscription ? »

**Relevé d'abord : la passerelle porte déjà tout, `apps/web-v2` n'en consommait
rien.** `GET /affiliate/validate/:token` (public), `POST /affiliate/register`
(authentifié, qui noue la relation sur l'APPELANT — le `referredUserId` du
corps est explicitement ignoré, c'est la garde anti-forge), le code intrinsèque
`ref_…` de chaque compte (#3690) et la page d'atterrissage legacy
`/signup/affiliate/[token]`.

**`POST /auth/register` n'est pas touché, et c'est le point d'appui.** La
relation se noue APRÈS le compte, sur la session que l'inscription vient
d'établir (#4264) — donc sans qu'une ligne de la passerelle change.

Le champ est REPLIÉ derrière « J'ai un code de parrainage » : la très grande
majorité des inscriptions n'en ont pas, et un champ de plus imposé à tout le
monde est la surcharge que le porteur a déjà refusée (#6441). Un lien
d'invitation l'ouvre tout seul, rempli — `/signup/affiliate/:token` REDIRIGE
vers `/signup?ref=…` plutôt que de rendre un second écran d'inscription, qui
serait la jumelle divergente que le legacy paie déjà. `?ref=` et `?parrain=`
sont lus dans cet ORDRE, fixé pour que deux clés présentes donnent le même
résultat à tout le monde. Le code est lu sur `window.location` à
l'initialisation d'un état, jamais par `useSearch()` : ce dernier exige le
contexte du routeur, et l'inscription est montée telle quelle par ses témoins.

**La règle de fond : un code d'invitation n'est JAMAIS une condition d'entrée.**
Un jeton expiré, une limite atteinte, une passerelle qui répond 500 — aucun ne
doit empêcher de créer un compte : ce serait punir l'invité de la défaillance
de l'hôte. Le refus se dit en encre ordinaire, sans `role="alert"` ni teinte
d'erreur, le bouton reste actif, et un échec RÉSEAU retombe au silence plutôt
que d'accuser un jeton dont on ne sait rien. La conversion part sans être
attendue.

**Ce que le LEGACY avait déjà, et qui est repris** (retour porteur 2026-09-15 :
« la version legacy avait déjà des développements dans ce sens, il faut veiller
à réutiliser ou simplement ne rien perdre »). Trois trouvailles dans `apps/web` :

1. **Le jeton SURVIT à la navigation.** `app/signup/affiliate/[token]/page.tsx`
   l'écrit en `localStorage` et en cookie 30 jours ;
   `use-registration-submit.ts` le relit au moment de créer le compte. Sans
   cette moitié, seul le cas RARE comptait — s'inscrire sans jamais quitter la
   page d'arrivée — et le cas NOMINAL d'un lien partagé (cliquer, regarder,
   s'inscrire le lendemain) perdait le parrainage. `lib/view/referral-memory.ts`
   le reprend sous LA MÊME CLÉ (`meeshy_affiliate_token`) : le jour où
   `apps/web-v2` prend la place d'`apps/web`, les jetons déjà posés dans les
   navigateurs sont relus plutôt que jetés, et une ligne écrite par le legacy —
   le jeton NU, sans objet ni date — est comprise telle quelle. L'ÉCHÉANCE, en
   revanche, est corrigée : le legacy borne son cookie à 30 jours et laisse la
   copie locale sans date, donc un jeton y survit indéfiniment ; ici la date est
   portée par la valeur, il n'y a qu'un support à faire périr. L'adresse gagne
   toujours sur la mémoire — un nouveau lien remplace un ancien.
2. **`?affiliate=` est la clé du legacy** (`middleware.ts:63` la capte sur
   n'importe quelle adresse). Des liens la portant sont déjà dans la nature :
   elle rejoint `ref` et `parrain` dans `REFERRAL_SEARCH_KEYS`.
3. **Ce que le legacy fait pour RIEN n'est pas recopié** :
   `use-registration-submit.ts` pose `body.affiliateToken` sur
   `POST /auth/register`. Mesuré — ni la route, ni `registration.service.ts`, ni
   `registerRequestSchema` ne lisent ce champ ; seul `POST /affiliate/register`,
   après le compte, noue quoi que ce soit. Reprendre la ligne aurait recopié une
   croyance, pas un comportement.

**Deux parcours du legacy restent SANS équivalent**, inventoriés plutôt que
perdus : la récupération de compte par TÉLÉPHONE (six étapes, `components/auth/recovery/`)
et la reprise d'un numéro déjà rattaché (`phoneTransferToken`, que la passerelle
sert déjà par `routes/auth/phone-transfer.ts`, et devant quoi le chantier
s'arrête sur une phrase). #6650 les porte — bloquants pour la bascule.

**Ce que ce lot ne fait pas** : la page depuis laquelle on INVITE (son code,
ses jetons de campagne, ses filleuls, ses statistiques) n'existe toujours pas
dans `apps/web-v2` — c'est un écran avec ses quatre états et ses trois lectures
de passerelle, porté par #6585.

### Ce que D-69 disait et qui n'est plus vrai

Sa dernière ligne annonçait l'inscription sans mot de passe comme bloquée par
la passerelle. C'est FAUX depuis #6424/#6441 : `registerRequestSchema` porte
`required: ['email']` — ni nom, ni téléphone, ni mot de passe ne sont exigés,
et `composeRegisterBody` OMET les clés absentes. L'inscription simplifiée de la
directive du 2026-09-13 est donc livrée ; #6405 se ferme avec ce lot.

### Mesuré

`bun test` 3815 verts (294 fichiers) ; `type-check` et `build` verts ; gate
composite vert.

## D-73 · Les pages d'accès montent UNE colonne, celle de la connexion ; la croix des pages qui en gardent une vit dans la colonne ; « Mot de passe oublié » sert aussi à créer un mot de passe — 2026-09-15 (#6643)

**Directive porteur.** « Les pages doivent être responsives et même sur tablette ou ordinateur avoir le style de la page de connexion (au centre), la page de récupération de mot de passe doit permettre de setter le mot de passe même si on a jamais eu de mot de passe ! Les pages d'inscription, reset de mot de passe 2FA, MFA doivent être centrés même hors smartphone ! »

**Mesuré avant**, sur `dev` b6b7e227ca, à 1440×900 et 834×1194 : la connexion (ses deux portes et le second facteur), l'accueil et le mot de passe oublié (depuis D-72) tenaient une colonne de 384 px centrée. L'inscription, le nouveau mot de passe, l'écran plein du lien par e-mail (demande, envoyé, validation, lien invalide) et la vérification d'e-mail s'étalaient sur toute la largeur. Les trois écrans centrés RECOPIAIENT la même racine ; les autres ne l'avaient jamais eue.

**UNE géométrie.** `components/auth-column.tsx` : `AuthColumn` porte le FOND (plein écran, halo d'ambiance, marges de sécurité, défilement) et la COLONNE (`w-full max-w-sm`, centrée). L'écran ne passe que l'agencement DANS la colonne. La connexion, l'accueil et le mot de passe oublié y migrent sans changement visuel : mêmes classes, même halo. Les autres pages y gagnent le halo, parce que la directive demande le STYLE de la connexion, pas seulement sa largeur.

**La croix vit DANS la colonne.** D-72 a retiré la barre du mot de passe oublié : c'est une page atteinte par un lien, que le retour du navigateur referme, et elle garde sa forme. Les quatre pages qui gardent une croix — inscription, nouveau mot de passe, lien par e-mail, vérification d'e-mail — la posent dans la colonne (`AuthColumnBar`). iOS la pose au bord de l'écran (`safeAreaInset(edge: .top)`), au-dessus d'un formulaire que `iPadFormWidth()` borne. Sur un écran de 1 440 px, la même pose la mettrait à plus de 500 px de ce qu'elle ferme, seule dans un coin. Dans la colonne, elle se lit avec son titre et la page entière tient au centre. Sur téléphone la colonne occupe l'écran, donc la croix ne bouge pas. L'inscription est la seule page d'accès qui dépasse un écran : sa colonne borne sa hauteur (`min-h-0`) et le formulaire défile sous la barre. La croix reste en place, comme sur iOS et comme avant.

**Le témoin mesure la géométrie, pas un marqueur.** `scripts/check-access-column.mjs` (gate composite et job « Peaux web-v2 ») prend pour colonne le plus petit ancêtre commun de ce qui se lit ou se touche, hors `aria-hidden` et hors texte `sr-only`. Il couvre 18 pages et états, dont le second facteur, « E-mail envoyé », le mot de passe enregistré et la validation d'un lien, servis par des réponses simulées. À 1440×900 et 834×1194, chaque colonne est centrée à 1 px près et jamais plus large que celle de la connexion. À 390×844, elle garde sa largeur de tablette. La connexion elle-même ne dépasse pas 384 px. Rouge sur `dev` b6b7e227ca (36 échecs), vert après. Les témoins DOM (`test-support/auth-column.ts`) tiennent la moitié structurelle : une colonne par écran, et tout dedans, croix comprise. Le gate navigateur ne lit pas `data-auth-column`.

**« Mot de passe oublié » dit qu'il sert aussi à créer un mot de passe.** La passerelle envoie le lien à un compte qui n'en a jamais eu (#6642). L'écran garde la forme de D-72 (enveloppe, phrase, champ, bouton, retour en pied) et change sa phrase : « Recevez par e-mail un lien pour choisir un nouveau mot de passe. » Un (i) « Jamais eu de mot de passe ? » la suit, dont la question se LIT à côté du glyphe : c'est exactement celle que se pose la personne concernée. Il déplie « Ce même lien vous permet d’en créer un. ». L'envoi rend l'écran de la connexion par e-mail (`components/email-sent-notice.tsx` : « E-mail envoyé », « Ouvrez le lien reçu à … », « Rien reçu ? ») au lieu de « Si un compte existe avec …, un lien de réinitialisation vient d’être envoyé » : deux phrases pour le même fait, et la seconde parlait de réinitialiser à qui n'avait rien à réinitialiser. La page du lien dit « Nouveau mot de passe », « Enregistrer le mot de passe », « Mot de passe enregistré ». Aucun texte perçu, noms accessibles compris, ne dit « réinitialisation » ni « magique ». Vocabulaire commun avec iOS (#6644) et Android (#6645).

**Ce que ce lot ne fait pas.** Ces écrans restent en français en dur, quelle que soit la langue d'interface : ils n'entrent dans aucun catalogue, et #6310 tient ces chaînes avec les autres. Le comportement serveur est porté par #6642.

## D-74 · Rejoindre sans compte passe par la porte CANONIQUE, et un invité est une SESSION, pas un état d'écran — 2026-09-16 (#5561)

**Directive porteur.** « Il faut implementer rejoindre en anonyme […] en priorité ! »

**La porte.** `POST /api/v1/links/:key/members`, en authentification OPTIONNELLE — la MÊME que celle d'un compte, avec un autre corps. L'alias `POST /anonymous/join/:linkId` n'est PAS appelé : déprécié depuis le 2026-08-30, il exige en plus un prénom et un nom (`linkJoinProfileSchema`) que la porte canonique ne demande pas. Deux champs de moins à faire remplir à quelqu'un qui veut lire un fil.

**Le jeton d'invité est la PREUVE du régime, dans les deux sens.** `joinLinkAsMember` refusait déjà une réponse PORTANT un `sessionToken` (`JOINED_AS_GUEST` : la passerelle est retombée en invité sur un Bearer expiré). Son miroir existe désormais : `joinLinkAsGuest` refuse une réponse qui n'en porte PAS (`MEMBER_NOT_GUEST`). La porte étant en auth optionnelle, un Bearer encore valide dans le transport ferait entrer le COMPTE sous son nom pendant que l'écran croit créer un invité — rendre une session d'invité qui n'existe pas mènerait le lecteur dans un fil où il n'est pas celui qu'il croit.

**Un invité est une branche du magasin de session** (`status: 'guest'`), pas un drapeau d'écran. Il porte `sessionToken` (régime `X-Session-Token`, jamais `Authorization`), son participant, son pseudo, sa conversation et SON lien — ce dernier parce que `GET /links/:identifier/messages` rend 403 à la session d'un autre lien. `credentialFromSession` sert donc les deux régimes, `resolveViewer` rend une identité (id non nul : ses propres bulles sont les siennes), et la garde de route ne l'admet que sur `thread` — toutes les autres routes privées exigent un COMPTE, et l'y laisser entrer peindrait des écrans qu'un 401 défait en silence.

**L'horizon d'une session d'invité est posé côté CLIENT** (`GUEST_SESSION_HOURS = 24`, la valeur du legacy). La porte ne sert aucun `expiresIn` ; sans horizon l'entrée serait CORROMPUE au sens du module (règle 2). C'est une GARDE, jamais une vérité : le serveur reste l'autorité, un 401 ferme la session avant l'échéance.

**Les deux familles de refus ne se confondent pas**, et c'est le cœur de l'issue. `input` — corrigeable ICI : le formulaire est GARDÉ, le message se pose sur son champ, et un pseudo libre proposé par la passerelle (`suggestedNickname`, 409) est PRÉ-REMPLI. `link` — rien ne le corrigera : le formulaire est RETIRÉ, un bandeau dit la cause, les deux sorties restent avec leur `next`. Les confondre fait réessayer quelqu'un dont le lien est mort, ou abandonner quelqu'un dont le pseudo était juste pris. **`LANGUAGE_NOT_ALLOWED` est rangé dans `input` malgré son 403** : la langue est un champ de ce formulaire, et le visiteur peut en choisir une autre.

**Le refus de SAISIE se connaît AVANT l'aller-retour** (`validateGuestDraft`, miroir `validateCommunityDraft`). La passerelle rend un 400 sans nommer le champ quand une exigence n'est pas satisfaite : deviner lequel après coup serait faux une fois sur trois.

**La projection de l'invitation s'élargit de six valeurs, et c'est une exception RAISONNÉE.** `GuestTerms` porte `requireAccount`, les trois `require*`, `allowedLanguages` et `allowAnonymousMessages`. Le reste du port retient tout ce que la charge transporte parce que rien de la CONVERSATION ne doit atteindre le client avant le choix ; ces six-là ne disent rien de la conversation — elles décrivent la PORTE. Compteurs, membres, identifiants et langues PARLÉES restent dehors. Fail-closed dans les deux sens, et les deux sens n'ont pas la même direction : une EXIGENCE absente est supposée (on demande le pseudo), une PERMISSION absente est refusée (on ne promet ni l'entrée ni l'écriture) — demander un champ de trop coûte une frappe, promettre une porte fermée coûte le visiteur.

**Mesuré.** `meeshy.me/chat/mshy_IM3PNq5H` servait déjà l'invitation avant ce lot (200, deux visites avec service worker, aucune erreur de page) : il ne manquait que la porte sans compte.

## D-75 · Un direct porte le nom de l'autre, même s'il a un titre stocké — 2026-09-16 (#6790)

**Signalement porteur.** « Actuellement les conversations direct ont pour titre X & Y au lieu d'avoir le display name de l'interlocuteur (cette erreur est sur iOS aussi). »

**Aucune concaténation `&` n'existe dans le dépôt** — balayage de `packages/`, `services/gateway/src`, `apps/web-v2/src`, `apps/web/`, `apps/ios`, `packages/MeeshySDK`, `apps/android`. `generateDefaultConversationTitle` est juste. Le titre est **stocké**, et les clients l'affichent fidèlement.

**La cause est le LEGACY** : `apps/web/components/conversations/create-conversation-modal.tsx:102-130` composait un titre CÔTÉ CLIENT et l'envoyait — chaîne `autoGeneratedTitles.betweenTwoUsers`, soit « {user1} et {user2} » (fr), « {user1} and {user2} » (en), « {user1} y {user2} » (es), « {user1} e {user2} » (pt). La v2 n'en écrit aucun (`createDirectConversation` poste `{ type, participantIds }`). Le legacy étant décommissionné (#6702), le stock existant demeure mais ne grossit plus.

**La précédence dépend désormais du TYPE.** Un GROUPE a un titre propre ; un DIRECT n'en a pas — il porte le nom de l'autre. `titleOf` lit donc, pour un direct : nom du pair, puis titre stocké en dernier recours ; pour un groupe : titre stocké, puis nom d'un membre servi. `customName` (renommage local du lecteur) prime toujours sur les deux, `identifier` ferme la marche. Le doc-comment d'origine affirmait déjà « elle porte le nom de l'autre » ; la règle ne le faisait pas.

**Ignorer plutôt que nettoyer.** Le correctif ne touche aucune donnée : il change une précédence d'affichage. Nettoyer les titres en base éviterait qu'un quatrième client réintroduise le défaut, et reste porté par #6790.

**Le témoin porte sur la PRÉCÉDENCE, pas sur la chaîne.** Chercher « et » verdirait sur un titre stocké d'une autre forme — le même défaut produit quatre chaînes différentes selon la langue du legacy.

## D-76 · L'administration a DEUX adresses : `/adm` pour la nouvelle, `/admin` réservée à l'ancienne — 2026-09-16 (#6795)

**Directive porteur.** « On ne s'occupe pas des limites quand il s'agit d'intégrer les commandes admin d'avant, tu peux même avoir les deux chemins dans la v2 `/adm/` pour la route d'administration nouvelle qui implémentera petit à petit les vues de l'ancienne et brancher toute l'ancienne dans `/admin` ! » puis « N'est-ce pas possible de copier dans v2 tous les composants requis par admin de legacy et monter sur Traefik qu'un seul container ? »

**UN SEUL CONTENEUR, et c'est la bonne option.** Le double montage (v2 + legacy derrière Traefik) a été instruit puis écarté sur deux mesures : le legacy authentifie son administration par un **cookie** `meeshy_session` (base64 de `{role, canAccessAdmin, userId}`, posé par `auth-manager.service.ts:360`) que la v2 ne pose pas — son middleware redirige vers `/signup` sans lui ; et il est en `output: 'standalone'` **sans `basePath`**, donc il sert `/_next/*` à la RACINE, ce qu'un routeur `PathPrefix(/admin)` seul casserait. Porter les composants dans la v2 supprime les deux : le droit s'y lit déjà par `GET /me/permissions`.

**`/adm` est la NOUVELLE administration ; `/admin` est réservée à l'ANCIENNE.** Les deux vivent dans le même bundle. La route KEY reste `admin`/`adminUsers` pour la première, `adm`/`admUsers` pour la seconde : le déplacement ne touche donc ni la garde de session, ni la table des barreaux, ni `lib/admin/sections.ts`, qui raisonnent tous par CLÉ et non par chemin.

**Aujourd'hui `/admin` sert les mêmes écrans que `/adm` — c'est un PONT, pas la cible.** Déplacer `/admin` avant que l'ancienne n'y soit portée laisserait une adresse morte, et un signet d'administrateur mène aujourd'hui à `/admin`. Un seul `import()` alimente les deux (motif `post`/`postDeepLink`), pour qu'elles ne puissent pas diverger d'écran le temps du pont.

**Les quatre routes sont PRIVÉES, déclarées dans `session-guard.ts`.** Une route que cette loi ne connaît pas est publique par défaut : `/adm` ajoutée à la seule table aurait ouvert une porte d'administration à un visiteur sans session, sans qu'aucun témoin ne rougisse — l'écran se serait peint, puis le serveur aurait refusé.

**Ce que le portage coûte, mesuré le 2026-09-16** : 99 fichiers, 25 551 lignes hors témoins, 82 en `'use client'` ; 21 primitives Radix/shadcn, 83 imports `lucide-react`, 35 `sonner`, 4 `recharts` — la v2 n'en a AUCUNE. Seuls 34 imports sont réellement liés à Next (22 `next/navigation`, 12 `next/dynamic`), c'est-à-dire la partie mécanique. **Le point dur est le RUNTIME** : la v2 est construite sur Preact (`preact/compat`), et il faut trancher entre amener Radix tel quel ou réécrire les 21 primitives contre le design system dérivé d'iOS. Arbitrage ouvert sur #6795.

**Ce qui ne se porte PAS tel quel** : 2 884 lignes de page — 24 % de la surface — n'appellent aucune API (`/admin/moderation`, `/admin/audit-logs`, `/admin/analytics`, `/admin/reports`, `/admin/invitations` rendent des données en dur ; `/admin/settings` ne sauvegarde rien). Elles se rebâtissent contre les endpoints RÉELS, qui existent et n'ont jamais eu de consommateur. Et **les journaux d'audit n'ont aucune API de LECTURE** : `AdminAuditLog` n'est qu'écrit, `canViewAuditLogs` ne garde aucune route.

## D-77 · L'administration se RÉÉCRIT sur le design system v2, et les membres passent en premier — 2026-09-16 (#6819)

**Directive porteur, qui tranche l'arbitrage laissé ouvert par D-76.** « il faut réecrire toutes les pages d'administration sur la v2 en commencant par la gestion des membres, edition reset de mot de passe, suppression soft et hard, suivi des medias crées, des conversations, historique de connexion ! »

**RÉÉCRIRE, et non importer Radix.** D-76 posait deux voies et n'en choisissait aucune : amener les 21 primitives Radix/shadcn et les faire tenir sur `preact/compat`, ou les réécrire contre le design system dérivé d'iOS. La seconde est retenue. Elle coûte plus cher à l'écriture et moins cher ensuite : la v2 n'acquiert aucune dépendance dont la compatibilité avec son socle devrait être re-prouvée à chaque montée, et l'administration finit par ressembler au reste de l'application au lieu de former un îlot visuel importé d'un autre cadre.

**Les MEMBRES d'abord**, avec sept capacités nommées par le porteur : éditer un membre, réinitialiser son mot de passe, le supprimer en DOUX puis en DÉFINITIF, suivre ses médias, suivre ses conversations, lire son historique de connexion.

**La règle de périmètre, qui gouverne tout ce lot : une capacité que la passerelle ne sert pas n'est pas dessinée.** Trois mesures la fondent, toutes faites avant d'écrire quoi que ce soit — 24 % de l'ancienne administration n'appelle aucune API (D-76) ; les journaux d'audit n'ont aucune route de lecture (D-76) ; et sur les 135 clés de préférences déclarées, **86 n'ont aucun lecteur, nulle part** (#6721 à #6724, dont `message` 0/16, `document` 0/16 et `video` 0/17). Un geste sans effet est PIRE qu'un geste absent : le second se voit, le premier se croit rendu. Chaque capacité est donc instruite — route, rôle requis, forme servie, effet réel — et celle qui n'est pas servie devient une issue de passerelle, jamais un bouton inerte.

**Ce que la v2 sert déjà, et qui borne le reste à écrire** : trois lectures seulement — `GET /me/permissions` (l'adresse CANONIQUE ; `/admin/me/permissions` en est l'alias déprécié, #4350), `GET /admin/dashboard` et `GET /admin/users?offset=&limit=&search=`. La LISTE des membres existe donc ; c'est le DÉTAIL d'un membre qui manque, et avec lui les sept gestes.

**Un indice de contrat à ne pas perdre** : `AdminUserRow` décode `isActive` mais **aucun `deletedAt`**. La suppression douce n'a aujourd'hui aucune existence dans la forme que la v2 lit — si la passerelle la sert, le décodeur devra l'admettre ; si elle ne la sert pas, c'est la passerelle qu'il faut ouvrir, pas l'écran qu'il faut peindre.

**Le découpage se décide maintenant, pas quand le fichier débordera.** Les trois fichiers d'administration totalisent 558 lignes, loin du plafond de 1 200 ; le détail d'un membre et ses sept capacités le consommeront. Une extension par surface, un type par fichier, les sous-vues chez elles — ajouter à un fichier déjà hors budget est interdit, donc on extrait avant d'ajouter.

## D-78 · Le fil rend des SCÈNES, pas des médias : la tuile qui monte un player est la règle, le média n'est que le repli — 2026-09-17 (cadrage `scenes-fil`)

**Ce que D-70 avait posé, et qui se révise.** D-70 tranchait « une tuile montre un MÉDIA, pas une scène » en disant explicitement que ce n'était pas la cible mais l'état du jour (« ce client ne rend pas encore les scènes »). Ce tour clôt cette réserve : `FeedCardModel` gagne un champ `scene?: { document: CanvasV3; carrier }`, résolu par `parseCanvasDocument` (infra-1) à partir de `storyEffects`, et c'est LUI que la carte, le carrousel et chaque tuile de mosaïque montent en premier — le média (`FeedMediaSurface`, D-70) reste le repli quand `storyEffects` est absent, invalide, ou `v < 3`.

**Vérifié en LIVE sur staging, pas seulement lu dans le Swift.** L'app iOS native (build 1822/1.0.9, `Meeshy Ref-Native`, drapeaux bêta confirmés ON — `.cache/web-v2-workflow/cibles/settings.beta-proof.dark.png`) sert déjà de vrais posts à scènes sur `gate.staging.meeshy.me` — un corpus de fixtures posé par le porteur (auteur affiché « Demo », comptant des posts « RÉCEPT A/B/C » et jusqu'à 9 scènes par post, un par layout : `carousel`, `hero`, `wave`, `sine`, `reel`). Le post à 3 scènes (`RÉCEPT C`, id `6aaa972f…`) se rend en CARROUSEL : compteur `1 / 3` en haut à droite de la tuile, flèche `Next scene` en incrustation, pastilles de pagination sous la carte — capturé clair `.cache/web-v2-workflow/cibles/scenes-fil.feed.light.png` et sombre `…dark.png`. C'est la confirmation que le comportement décrit par la spec (carrousel par défaut, mosaïque sur `layout` explicite) est bien ce qui tourne aujourd'hui, pas une intention non vérifiée.

**Une scène SANS média est un cas RÉEL, pas hypothétique.** Le corpus staging porte un post (`6a9cb55b…`) dont les 6 scènes n'ont AUCUN objet `media` — texte seul sur un fond de couleur. `ObjectV3Schema` (`packages/shared/types/canvas-v3.ts`) l'autorise déjà (`payload` permissif, aucune exigence d'un objet `media`) : le critère de fin de `scenes-fil` (« la carte texte-seul rend `[data-feed-scene]` avec le texte dans la langue du lecteur ») a donc un fixture réel à copier dans `fixtures-feed.ts`, pas seulement une hypothèse d'auteur.

**Coût.** Le rendu carrousel actuel EST déjà la cible visuelle (D-70 ne change pas de forme, seulement de CONTENU des tuiles) : aucune reprise de layout n'est requise, seule la source de la tuile change de média à scène. La mosaïque (hero/wave/sine, plafond 4 tuiles) reste gouvernée par `mosaic-layout.ts`, inchangé — chaque tuile y monte désormais le `ScenePlayer` de SA scène (infra-1) au lieu de `FeedMediaSurface`.

## D-79 · Le moteur de scène est un module UNIQUE, `src/lib/canvas/` + `src/components/scene-player.tsx` ; son MODE ne gouverne que le son, la boucle et le chrome — jamais la géométrie — 2026-09-17 (cadrage `infra-1`)

**Pourquoi pas `src/lib/scene/`.** Ce répertoire existe déjà et porte l'élection Focal (`activity.ts`, la loi qui élit une rangée de conversation au défilement soutenu — sans rapport avec le canvas). Loger le moteur au même endroit collisionnerait deux notions homonymes (« scene » = rangée élue vs. « scene » = objet CanvasV3) sous un seul répertoire. `src/lib/canvas/` (lois pures : `parseCanvasDocument`, `fitScene`, `objectPose`, `playerConfig`…) + `src/components/scene-player.tsx` (le composant) séparent les deux sans renommer l'existant.

**Le mode ne change QUE trois choses, jamais la géométrie.** Miroir direct de `ScenePlayerMode.swift` (`ScenePlayerConfig` : `startsPaused` toujours vrai, `isMuted`/`locksMute` = `card`, `loops` = `card`|`reel`, `showsChrome` = `reader`|`reel`). `fitScene({viewport, ratio})` — aspect-fit uniforme, centré — rend la MÊME boîte quels que soient `card`/`reader`/`story`/`preview`/`reel` : c'est ce qui permet à `scenes-plein-ecran` de dire « la boîte plein écran a le même rapport que la boîte de carte » sans code dupliqué, et à `reels-scene` de réutiliser le même ajustement en plein cadre.

**Ce qui a été VU en direct sur iOS, et qui reste une question ouverte pour l'implémentation web plutôt qu'une divergence tranchée.** La visionneuse plein écran d'un même post (« Scene 1 » du post `RÉCEPT C`) a rendu, à deux ouvertures successives depuis le fil, DEUX présentations différentes : une fois avec le texte de l'objet (« C1 pano ») et le bandeau légende + drapeaux de traduction (`scenes-plein-ecran.feed-scene.light.png`), une fois avec seulement un badge de dimensions (« 1 600 × 400 ») et des poignées de recadrage aux coins, sans légende ni texte (`scenes-plein-ecran.feed-scene.dark.png`). Aucune des deux captures n'est un artefact de session (mêmes coordonnées de tap, même post, même compte, à deux minutes d'écart) : SOIT deux chemins de présentation coexistent côté iOS pour la même scène (visionneuse de lecture vs. outil de recadrage/édition, ce dernier accessible par erreur depuis un geste voisin), SOIT c'est une race de chargement (le texte de l'objet arrive après la capture). Le mode `preview` de `playerConfig` doit donc être vérifié CONTRE les deux comportements avant d'être considéré clos, plutôt que de n'en copier qu'un.

**Coût.** Le module est chargé À LA DEMANDE (`import()`, motif D-54) : la première peinture du fil ne grossit pas tant qu'aucune carte à scène n'est visible.

**Mesuré (#6898, livraison).** `infra-1` n'avait PAS atterri au démarrage de ce tour (`ls src/lib/canvas src/components/scene-player.tsx` ⇒ `No such file`, aucune branche vivante ne les écrivait — `git branch -r --contains` vide) : `scenes-fil` a donc écrit le contrat MINIMAL de D-79 lui-même, aux noms déjà posés ci-dessus — `src/lib/canvas/document.ts` (`parseCanvasDocument`, tolérant selon § 3.3 : `transform` par défauts `{1,0,1}`, rejette seulement `v !== 3` ou `scenes` absent/vide), `carrier.ts` (`SceneCarrier`, `carrierMediaIdentity` élargie aux DEUX clés `postMediaId`/`mediaId` et aux DEUX plans `content`/`bg` — le défaut iOS qui laisse `RECETTE C` sans légende n'est PAS reproduit ici, question 9.6), `config.ts` (`playerConfig`, cinq modes), `fit.ts` (`fitScene`, la primitive d'ajustement UNIQUE, dont `scene-framing.ts#cappedContentSize` délègue). Le Prisme d'un objet texte (question 9.1) est sous `src/lib/canvas/text.ts` (`resolveSceneText`), faute d'un `infra-1` où le loger ailleurs.

`src/lib/feed/scene-framing.ts` dérive `SceneFraming.swift`/`SceneCarouselLayout` (7 cotes, gardées `scripts/lib/curve-scene-framing.mjs`, PARTIE 13 de `check-curve.mjs`) : `focus`, `cardAspect`, `imageAspect`, `cardFocus`, `clampedCardAspect`, `carouselAspect`. `scene-motion.ts` dérive `SceneMotion.swift`. `scene-caption.ts` porte la légende de la scène REGARDÉE (jamais le texte du post). `autoplay-election.ts` + `use-feed-autoplay.ts` (magasin `zustand/vanilla`, motif `typing-store.ts`) portent l'élection : un `IntersectionObserver` UNIQUE par écran (`routes/feed.tsx`, `routes/post.tsx`), un booléen par carte (`useIsActiveScene`).

**Un défaut de fenêtrage CORRIGÉ EN COURS DE LOT, noté pour la trajectoire.** La première forme sizait la boîte de contenu d'une scène par une astuce CSS (`aspect-ratio` + `flex` + `max-width/height:100%`) : MESURÉ comme ambigu dans Chromium — un enfant flex sans largeur/hauteur explicite et sans taille de contenu propre (le cas exact d'une boîte de scène, dont le contenu est lui-même en pourcentage) s'y résout en 0×0. `src/lib/view/use-element-size.ts` (un `ResizeObserver` par réf de rappel, motif `use-out-of-view.ts`) mesure la boîte réelle et `fitScene` calcule la taille exacte — plus aucune ambiguïté CSS. **Une SECONDE panne, plus grave, a suivi le même correctif** : les réfs de rappel posées sur `[data-feed-scene-box]` dans `feed-post-card.tsx#FeedPostVisual` étaient des fermetures INLINE (`ref={(n) => registerScene(model.id, n)}`), recréées à CHAQUE rendu — React désinscrit puis réinscrit la cible à chaque bascule d'élection (le rendu que `useIsActiveScene` déclenche déjà), la réinscription relance l'observation, dont la notification relance l'élection : une BOUCLE SANS FIN, mesurée en direct — deux scènes cinématiques adjacentes jouaient SIMULTANÉMENT, chacune alternant plusieurs centaines de fois par seconde. Corrigé par `useCallback` (motif déjà appliqué dans le hook lui-même et dans ses propres témoins, oublié au SITE D'APPEL) : la leçon que `use-out-of-view.ts` documente déjà pour SA propre réf ne protège pas les appelants qui n'en tiennent pas compte à leur tour.

**Revue-correction (#6898), ce que la première forme laissait passer — chacun avec son témoin rouge avant le correctif.**
1. **Le texte du post DESCENDAIT dans la scène.** `resolveMedia` prête le contenu du post à un média SEUL sans légende (`captionOrigin: 'post'`, #6864) ; `resolveSceneCaption` ne regardait pas l'origine et `FeedPostCard` masquait alors le texte AU-DESSUS (même chaîne que la légende prêtée) — le cas nominal d'un post vidéo à une scène perdait son texte et le montrait en bandeau étiqueté `media`. Témoins : `feed-post-card.test.tsx`, `scene-caption.test.ts`, invariant de gate sur `post-scene-clip-a` (qui porte désormais un texte).
2. **Le carrousel n'était pas plafonné comme iOS.** `SceneCardHeightCap(naturalAspect: boxAspect) { pages }` centre le carrousel ENTIER — piste, flèches, compteur — à son rapport naturel dans la boîte plafonnée : les bandes sont LATÉRALES. La première forme posait la piste à pleine largeur de boîte, et le gate avait été réécrit (`content.height < box.height`, centre VERTICAL) pour épouser cette géométrie au lieu du critère (`|centreX − centreCarte| ≤ 1`, `content.width < box.width`), mesuré APRÈS le clic qui décale la page d'une largeur. Le critère est rétabli, mesuré au repos, et une mutation qui rend la zone pleine largeur le fait rougir.
3. **Deux chromes et deux géométries de mosaïque.** `FeedMediaCarousel` gardait bandes de 44 sans cercle, compteur et pastilles internes ; `FeedSceneMosaic` recopiait la boîte de `FeedMediaMosaic`. Le chrome (`feed-carousel-chrome.tsx`) et la boîte (`feed-mosaic-frame.tsx`) sont désormais UNIQUES, pour les deux natures — « que ce soit mosaïque de média ou de scène c'est la même chose » (`PostSceneMosaic.swift`, `fleches`).
4. **L'élection se figeait.** Un `IntersectionObserver` ne notifie qu'au franchissement d'un seuil : deux cartes entièrement visibles traversaient l'écran sans notification, la distance de leur ENTRÉE restait lue, et la vidéo élue pouvait être celle qui sortait par le haut. La distance se remesure quand le défilement s'arrête (`scrollend`, délai relancé à défaut) — jamais par trame.
5. **Le moteur peignait autre chose qu'iOS.** Texte à 16 px fixes (iOS : `fontSize` × largeur / 1080, défaut 64 — `CanvasGeometry.swift:5`, `CanvasV3Migration.swift:877`) ; fond toujours AJUSTÉ (iOS : `aspectFill` sauf `videoFitMode: "fit"` sur le porteur de fond, `StoryBackgroundLayer.swift:512`) — la cible `RECETTE C` montre un panorama plein cadre, pas une bande ; `mediaURL` hérité posé tel quel en `src` au lieu de passer par `attachmentSrc` (#5668) ; tracé du haut-parleur barré recopié au lieu de `glyphs-feed.ts`.
6. **Un fichier de test RÉÉCRIT de mémoire.** `fixtures-feed.test.ts`, écrasé puis « restauré », avait perdu quatre témoins d'origine sous d'autres noms et des assertions affaiblies (`Object.keys(translations)).toEqual(['fr'])`, `fileUrl` en `data:video/`, …). Le fichier est repris VERBATIM de `HEAD`, les six témoins du lot ajoutés à la suite.
7. **Le gate lisait un moteur chargé à la demande sans l'attendre**, et mesurait « une seule vidéo à la fois » sur un instant. Il attend désormais `[data-scene-text]`/`[data-scene-player]`, échantillonne chaque trame sur 2,1 s (une boucle d'élection réintroduite le fait rougir : « jusqu'à 2 vidéos en lecture SIMULTANÉE »), et prouve le clavier (←) et la molette horizontale.

**Preuve.** `bun test` : 4586 verts / 351 fichiers. `bun run type-check` et `bun run build` : verts. `node scripts/check-feed-scenes.mjs` : 78/78 invariants, clair et sombre. `check-feed-media.mjs` (19), `check-reels.mjs`, `check-feed-disc.mjs` (220), `check-utilities.mjs`, `check-curve.mjs` (PARTIE 13, 7 cotes — une mutation de `MINIMUM_SIDE` la fait rougir) : verts. `measure-weight.mjs` : première peinture 46,51 Ko, `feed` 8,83, `scene_player` 1,83, `post_gestures` 4,31, `interface_catalogs` 53,76 (plafond porté à 55) — `budgets.json`.

**Ce que ce lot NE fait PAS**, assumé (§ 9 de la spécification) : le plein écran d'une scène (`scenes-plein-ecran` — LIVRÉ depuis par #6902, D-85 : `onOpenScene` ouvre la visionneuse EN PLACE, il ne navigue plus) ; le carrousel des MÉDIAS partage le chrome mais ne glisse pas encore au doigt (question 9.2, issue #6911) ; le son du détail reste muet (question 9.4, issue #6912) ; les `<video>` de posts SIMPLES n'entrent pas dans l'élection (question 9.5, issue #6913) ; `carrierMediaIdentity` élargi aux deux clés n'est pas reporté côté iOS (question 9.6, issue #6894 déjà ouverte) ; le moteur minimal ne peint ni stickers, ni dessins, ni lieux, ni transitions — seulement fond (couleur, image, vidéo), médias et textes (tracké par #6901, « web-v2 a UN moteur de scène », déjà ouverte) ; les types `CanvasDocument` restent DÉCLARÉS dans `lib/canvas/document.ts` plutôt que dérivés de `@meeshy/shared/types/canvas-v3` — MESURÉ : `Pick`/`Omit` sur les types que zod y infère rendent requis `opening`, `closing`, `carrierAspect`, et les types exacts (`KeyframeV3[]`, `BackgroundSoundV3`) exigeraient la validation que ce parseur tolérant refuse ; une garde de compilation (`CanvasTypesFollowShared`) fait rougir `tsc` dès qu'un type local invente un champ que le schéma partagé ne connaît pas, ou qu'une ancre, un plan ou un transform s'en écarte (falsifiée : un champ `langue` ajouté ⇒ `TS2344`). `CANVAS_V3_WRITE_STRICT` (question 9.7) a sa propre issue gateway PRÉEXISTANTE, #3964.

**Revue-correction (2026-09-17, post-livraison), quatre constats reçus, deux corrigés, deux réfutés avec preuve.**
1. **CORRIGÉ — une scène vidéo de FOND non élue peignait une boîte transparente sous `preload="none"`**, retombant sur `var(--color-ios-card)` (la couleur de la carte) : indiscernable d'une scène absente, et le texte blanc de la scène y devenait illisible en clair. `SceneCarrierMedia` porte désormais `poster` (`thumbnailSrc ?? placeholder`, le MÊME repli que `FeedMediaSurface`), reporté en attribut `poster` sur le `<video>` de `BackgroundLayer` ET `MediaLayer` (même défaut, même helper — `posterSrcOf`, `scene-player.tsx`) ; les fixtures `post-scene-clip-a`/`b` gagnent un `thumbHash` réel (sans lui, aucun fixture n'aurait pu prouver le défaut NI le correctif). `check-feed-scenes.mjs` vérifie désormais que les deux `<video>` portent un `poster` non vide sous `prefers-reduced-motion` (78 → 82 invariants). Témoins neufs : `feed-scene-surface.test.tsx` (2, RED avant le champ `poster`). `bun test` 4588 verts (+2) / 351 fichiers, `type-check` et `build` verts, `measure-weight.mjs` : `scene_player` 1,89 Ko (plafond 3, inchangé).
2. **CORRIGÉ (process) — trois des six issues de suivi § 9 nommées par la revue n'existaient pas** (9.2 carrousel médias, 9.4 son du détail, 9.5 élection vidéo posts simples) : ouvertes (#6911, #6912, #6913). Les trois autres EXISTAIENT déjà avant la revue et sont désormais citées ci-dessus par leur numéro (9.6 → #6894, 9.7 → #3964, la question des stickers/dessins/transform → #6901) — la revue les avait manquées faute d'un `gh issue list` avant de conclure à leur absence.
3. **RÉFUTÉ — « le moteur ne peint pas tous les objets (stickers, dessins, lieux, transform, transitions) » n'est pas un défaut silencieux de ce lot.** C'est un cas ASSUMÉ et autorisé PAR LA SPÉCIFICATION elle-même (§ 5.0 ligne 220 : « si `infra-1` n'a pas atterri, `scenes-fil` écrit le MINIMUM… fond couleur/image/vidéo + textes, SANS timeline ni transitions »), mesuré vrai au démarrage du lot (`ls src/lib/canvas` ⇒ `No such file`), documenté ci-dessus dans « Ce que ce lot NE fait PAS », ET déjà tracké par une issue dédiée (#6901, ouverte le même jour). Peindre stickers/dessins/lieux/transform maintenant reviendrait à faire, sous couvert de « correction », le lot `infra-1` entier (D-79) sans son propre cadrage ni sa propre revue — précisément l'inverse de la livraison incrémentale. Preuve que la classification « majeur, à corriger dans CE lot » est erronée : la spécification qui gouverne ce travail AUTORISE explicitement cette forme réduite dans ces conditions.
4. **RÉFUTÉ (partiellement) — « aucune capture de coque, gate jamais rejoué »**, corrigé par l'exécution : `MEESHY_TARGET=capacitor bunx vite build && bunx cap sync`, `./gradlew assembleDebug` installé et lancé sur l'émulateur `Meeshy_Poc_Web-v31` (Android 16, `me.meeshy.app`), et `xcodebuild` installé sur le simulateur dédié `Meeshy Poc-Web-V2` (138B8B8D…, iOS 26.1) — captures `/feed` obtenues sur les DEUX (Android : liste, carrousel scène 1/3, mosaïque 4 tuiles avec report « +1 » ; iOS : clair ET sombre, bascule à chaud confirmée). Les DEUX coques rendent correctement scènes-texte, carrousel et mosaïque. Le glissement tactile de la piste et l'interaction exacte avec le retour matériel Android restent NON mesurés dans cette passe (candidat à `scenes-fil` § 9.2 / une recette dédiée, pas remesuré ici faute de temps) — ce point du constat original reste OUVERT, noté pour la trajectoire plutôt que refermé par excès de confiance.

**Complété (#6901, 2026-09-17).** Le moteur MINIMAL ci-dessus (fond, texte, pose figée) gagne les SIX couches et la loi temporelle que la revue avait renvoyées à cette issue — même décision, même module, son périmètre s'achève :
- `document.ts` : `v` devient un ENTIER `>= 3` (miroir `isCanvasV3OrNewer`, `mark >= 3` — Q1 tranchée `Number.isInteger` en plus, une version fractionnaire n'a jamais existé côté fil), keyframes typés canal par canal (`CanvasKeyframe`, un canal non fini est jeté, jamais l'objet entier).
- `fit.ts` : `fitScene` rend `{width,height,offsetX,offsetY}` — le CENTRAGE, jusque-là laissé à chaque hôte SwiftUI/CSS, est désormais une primitive UNIQUE ; `sceneRatio(scene)` rend TOUJOURS `9/16` (décision porteur 2026-09-17, #6896/#6904, D-80 — `carrierAspect` reste une mémoire d'édition lue par personne au RENDU).
- `config.ts` : `hostMute({config, requestedMute})` applique enfin le VERROU `locksMute` du mode `card` — un hôte ne pouvait auparavant que DEMANDER le muet, jamais se le voir refuser par le mode lui-même (défaut D5, mesuré et corrigé).
- `pose.ts` (NEUF) : `objectPose(object, t)` — ancre `band` PEINTE à `0.08/0.92` (`CanvasBandAnchorY`, DISTINCTE des `0.12/0.88` de `scene-framing.ts` qui cotent la BOÎTE DE CADRAGE, pas le point rendu — deux questions, iOS porte les deux valeurs), fenêtre temporelle en porte NETTE, fondus qui REMPLACENT l'opacité keyframe quand ils existent (jamais un produit des deux), interpolation canal par canal avec l'easing du keyframe BAS, position écrasée seulement si `x` ET `y` sont TOUS DEUX résolus.
- `timeline.ts` (NEUF) : `hasTimedObjects`/`sceneDurationSeconds`, RÉUTILISANT `hasTimeWindow` de `scene-motion.ts` plutôt que de le recopier (dette CONSIGNÉE : ce module dépend donc du chunk `feed`, comme `background-sound.ts` le payait déjà — un lot de rangement séparé pourrait un jour déplacer `scene-motion` sous `lib/canvas/`, § 9 Q6 de la spécification).
- `media-size.ts`, `sticker.ts`, `place.ts`, `drawing.ts` (NEUFS) : la taille EFFECTIVE d'un média posé (65 % du petit côté, miroir `StoryMediaLayer.baseMediaDesignSize`, via `effectiveMediaRatio`) ; le repli du composer pour un sticker sans emoji (jamais un rejet) ; le libellé d'un lieu (nom, adresse, repli localisé `scene.place.here`, sept catalogues) ; le poids d'un trait (miroir `StrokeWidthMapping`, le plancher AVANT le plafond).
- `components/scene-clock.ts` (NEUF) : UNE boucle `requestAnimationFrame` par player, `enabled` SEULEMENT si la scène est temporisée — aucun `setState` par trame (Zero Unnecessary Re-render), les abonnés écrivent `style` sur leur propre `ref`.
- `components/scene-object-frame.tsx` (NEUF) : le SEUL site qui pose `data-scene-object={kind}` et applique la pose (position, transform, opacité, `hidden`) — les six couches le montent, aucune ne réécrit sa propre géométrie. Deux modes : `anchored` (cinq couches) et `fullBleed` (le dessin, plein cadre, sans ancre à pourcenter).
- `components/scene-object-{text,media,sticker,place,drawing,audio}.tsx` (NEUFS) : `scene-player.tsx` (372 → 213 lignes) DÉCOUPÉ AVANT d'ajouter (budget, une extension par surface) ; `SceneCanvas` reste le SEUL `switch` par `kind` du moteur.
- `fixtures-feed.ts` : `POST_SCENE_DECORATED` exerce CINQ des sept couches d'un coup — fond image, texte, sticker, lieu, dessin ; le média POSÉ et l'audio d'OVERLAY n'ont que des témoins (`media-size.test.ts`, T-E3, T-E11), jamais de vecteur NAVIGATEUR (revue-correction : le doc-comment disait « les six » et en listait cinq) ; sa fin de texte (`timing.end: 2`) laisse `sceneDurationSeconds` la RETROUVER sans `timelineDuration` posé sur la scène — la boucle du mode `card` anime le texte en continu, l'EFFET qu'un gate navigateur observe (deux relevés à 700 ms qui diffèrent), jamais son seul câblage.

**LIMITE D'ENVIRONNEMENT MESURÉE ET CONSIGNÉE (dans les témoins, pas ici en silence) :** `happy-dom` (les témoins `bun test`) REJETTE toute valeur CSS en unité `cqw` à l'assignation (`el.style.width = '65cqw'` ⇒ `el.style.width === ''`, aucun attribut `style` ne survit même à la sérialisation) — confirmé par une sonde isolée. Les témoins DOM de `scene-player.test.tsx` ne peuvent donc prouver que le CÂBLAGE (la boîte existe, porte `overflow:hidden`, le glyphe est peint) ; l'ARITHMÉTIQUE exacte (65/32,5/50 %) est prouvée par `lib/canvas/media-size.test.ts` et `sticker.test.ts` ; le rendu RÉEL en `cqw` se regarde au navigateur (`check-feed-scenes.mjs`, captures — vérifié visuellement le 2026-09-17, les six couches peignent correctement aux DEUX schémas).

**Ce qui reste hors tranche, assumé** (§ 0 et § 9 de la spécification `infra-1`) : le plein écran d'une scène de post (`scenes-plein-ecran`, RÉSERVÉ à l'époque de ce lot — livré depuis par #6902, D-85) ; le transport/seek d'une timeline (#6906, iOS d'abord) ; le mouvement d'un sticker (« propriété, pas kind », #4911) ; le son de bibliothèque (`sound.source.t === 'library'`) ; `backgroundStyle.glass` d'un texte (question produit ouverte, un `backdrop-filter` par texte coûterait un compositing par objet et diverge selon la coque). `carrierAspect` n'est plus lu par AUCUN lecteur web (D-80 s'applique aussi ici) — la loi de `SceneFullscreenFraming.swift` qui le lisait encore côté iOS est PÉRIMÉE par la même décision porteur, hors périmètre de ce lot.

**Preuve.** `bun test` : 4972 verts / 378 fichiers (dont 26 témoins DOM neufs pour les couches et l'horloge, 43 pour les lois pures `pose`/`timeline`/`media-size`/`drawing`/`sticker`/`place`, 4 pour `T-F`). `bun run type-check` et `bun run build` : verts. `node scripts/check-feed-scenes.mjs` : 96/96 invariants (82 → 96 : les cinq kinds de `post-scene-decorated` + l'EFFET des keyframes, SANS le mesurer sous `prefers-reduced-motion` — l'élection d'autoplay du fil n'élit aucune carte sous ce réglage, loi PRÉEXISTANTE et déjà gardée par les invariants clip-a/clip-b). `check-story-scene.mjs` (105), `check-curve.mjs` (PARTIE 13, 7 cotes), `check:tokens`, `check:tokens-resolved` : verts. `measure-weight.mjs` : première peinture 47,56 Ko (plafond 90 — la hausse de 47,25 vient d'un lot VOISIN, #6936, jamais de celui-ci), `scene_player` 5,03 Ko (plafond porté à 7, arrondi supérieur 6 + 1). `check-story-studio.mjs` : 4 échecs sur la saisie du studio (`scrollHeight` double de `clientHeight`), d'abord rapportés comme PRÉEXISTANTS parce qu'aucun fichier du studio n'avait bougé — **conclusion FAUSSE, retirée à la revue-correction** : le défaut venait du lot, dans le moteur, et l'argument « `git diff` vide sur `story-compose*.tsx` » ne pouvait pas le voir. Le studio MESURE la boîte que le moteur peint (`textBox` sur `[data-scene-text]`) : en descendant le texte d'un cran, sous `SceneObjectFrame`, `max-w-[85%]` cessait de se résoudre contre la SCÈNE et se résolvait contre le CADRE, dont la largeur est auto — la boîte valait 85 % du texte, mesuré 65,72 px pour 77,33 px. Rétablir le référentiel (`maxWidth: '85cqw'`) rend le gate vert (97/97) sans toucher un fichier du studio.

> **Un gate rouge qu'aucun fichier du lot ne touche peut être à lui.** La bonne question n'est pas « ai-je modifié ce que ce gate lit ? » mais « ce gate MESURE-t-il quelque chose que j'ai déplacé ? » — ici, la boîte peinte par le moteur. La seule épreuve est la FALSIFICATION : reposer la ligne suspecte et regarder le gate rougir.

**Complété (revue-correction, 2026-09-17).** Huit défauts corrigés dans le même module, chacun avec son témoin : la boîte du texte (ci-dessus, invariant navigateur NOMMÉ, `check-feed-scenes` 96 → 108) ; un objet `audio` de FOND était rendu en couche par le player alors que les hôtes l'élisent et le jouent déjà (`electBackgroundTrack`) — la même piste partait deux fois, en écho, et le doc-comment de la couche AFFIRMAIT un filtre qui n'existait pas (T-E12) ; `fadeFactor` rendait `undefined` au MILIEU de la fenêtre, donc l'enveloppe ne remplaçait l'opacité keyframe que pendant ses RAMPES, contre `StoryRenderer.fadeOpacity` et contre le doc-comment du module (T-D4b) ; `useEffect` posé APRÈS le `return null` de `scene-object-media`/`-audio`, dont le `src` dépend du PORTEUR (nombre de hooks variable : exception sous React, effet jamais rejoué sous Preact — web-v2 n'a pas d'eslint pour le voir) ; `useSceneClock` rendait une poignée NEUVE par rendu, et son identité est une dépendance d'effet chez les six couches, donc chaque rendu du player les réabonnait toutes ; le critère de fin « la géométrie rendue identique pour les 5 modes » n'avait AUCUN témoin (T-E13) ; `fitScene` gagnait `offsetX`/`offsetY` « pour que trente hôtes ne recopient pas le centrage » et le SEUL appelant qui le recopiait (`stories/framing.ts:62`) n'était pas migré, pendant que `sceneRatio()` n'avait aucun consommateur et que `scene-player.tsx` gardait un `9 / 16` littéral ; la pastille de lieu portait une épingle de 14 px FIXES dans un gabarit entièrement en `cqw` (`PLACE_ICON_EM = 0.82`, miroir legacy, plus `lineHeight: 1`/`fontWeight: 600`).

**Ce que la revue-correction avait RAPPORTÉ sans le corriger est désormais RÉSOLU (défaut 1, contre-revue #6901, même jour) : les bandes d'un fond AJUSTÉ s'habillent DANS LE MOTEUR, plus dans le seul hôte de story.** `POST_SCENE_DECORATED` était la PREMIÈRE fixture de fil en `videoFitMode: 'fit'`, et montrait le défaut : `BackgroundLayer` peignait `object-contain` sans aucun sol, donc les bandes laissaient voir l'aplat de CARTE. iOS sert le remplissage PAR DÉFAUT (`MeeshyScenePlayer.servesLetterboxFill = true`, et `FeedSceneAutoplay.swift:159` n'en passe aucune) ; le web ne le posait que dans l'hôte de story (`story-scene-layer.tsx`, `data-scene-letterbox`) — donc jamais dans le fil.

Le correctif déplace la loi vers son SITE UNIQUE : `SceneCanvas` (`scene-player.tsx`) calcule le placeholder ThumbHash (la MÊME cascade `letterboxHashes`/`letterboxIsServed` que l'hôte de story écrivait déjà) et le passe à `BackgroundLayer`, qui le peint SOUS le média — que l'hôte soit le fil ou la story. `servesLetterboxFill` (miroir `MeeshyScenePlayer.servesLetterboxFill`, défaut `true`) est l'UNIQUE dérogation, exercée par le lecteur de story en verdict `imageOnly` (#6636 : rogner un calque qu'on continue de peindre paierait un flou que personne ne voit) — l'hôte de story a donc retiré son propre `data-scene-letterbox` (le double-peint qu'un déplacement mal fait aurait pu introduire) et relaie `servesLetterboxFill={verdict.verdict !== 'imageOnly'}`. Les quatre témoins existants de `story-scene-layer.test.tsx` passent SANS modification — confirmation que `servesLetterboxFill` reproduit exactement le comportement qu'ils attendaient déjà.

**La question laissée ouverte — « quel sol pour une scène SANS aucun `thumbHash` ? » (noir, `payload.background` déclaré, ou l'accent de la publication) — reste TRANCHÉE PAR PARITÉ, pas par une nouvelle règle inventée ici.** `POST_SCENE_DECORATED` gagne un `thumbHash` réel sur son fond (`bg1.payload.thumbHash`) : SANS lui, la fixture n'exerçait que le cas où AUCUNE source n'existe nulle part — un cas qu'iOS lui-même ne couvre pas (`StoryLetterboxFill.source(hasStampedBitmap:hashes:) → .none` ⇒ `refreshLetterboxFill` ne pose AUCUN calque, guard `let image = fillImage(...) else { return }`) : la bande y reste transparente et laisse voir ce qu'il y a derrière, sur les DEUX plateformes. Un média RÉEL porte quasi toujours un ThumbHash (généré à l'upload) — la fixture exerce donc désormais le cas NOMINAL. Ce N'EST PAS une esquive : c'est le même arbitrage que `MeeshyScenePlayer.servesLetterboxFill` lui-même, qui ne DEVINE jamais une couleur de secours quand aucune matière n'existe. Si le produit veut un jour un plancher pour ce cas résiduel (probablement rarissime sur le corpus réel), c'est une décision qui touchera les DEUX plateformes à la fois — elle se CONSIGNE ici, elle ne se résout pas en silence côté web seul.

## D-80 · Le lecteur de story rend ses scènes v3 par le moteur partagé, dans les bornes 9:16 de la scène, et n'y embarque rien qu'une story v1 paierait — 2026-09-17 (#6899, revue-correction)

**La porte.** `routes/story.tsx` lit `parseCanvasDocument(storyEffects)` : un document v3 monte `routes/story-scene-layer.tsx`, CHARGÉ À LA DEMANDE (motif D-54) ; sinon le chemin v1 (`StoryMediaLayer`) est inchangé. Les trois ports (`loadStoryTray`, `loadStoryFeed`, `loadStoryPost`) annoncent `X-Canvas-Caps: 3` DANS LE MÊME lot que le rendu — l'en-tête seul ferait tomber la sentinelle v1 des stories v3 sans média (`storyEffectsV3.ts:744-796`). Mesuré sur `gate.staging.meeshy.me` le 2026-09-17 : sept stories sur huit du compte de recette sont des documents v3 — c'est le chemin NOMINAL, pas une rareté.

**La géométrie, et pourquoi elle est une transformation.** `lib/stories/framing.ts#readerCardFraming` porte `StoryCanvasFraming.resolve` avec les cotes de `readerCanvasFraming` (en-tête `topInset + 72`, bas 64, côtés 8, coins 22 compensés par l'échelle) : la scène garde ses bornes INTRINSÈQUES (l'ajustement 9:16 du viewport entier) et la carte n'est qu'une échelle + un décalage vertical. Le verdict d'image seule, la mesure des textes et les bandes se calculent TOUS dans ces bornes — le repère où le moteur peint — et l'appui long (`.free`, plein bord) ne les change pas : il ne passe que par le compositeur. **9:16 figé**, jamais `carrierAspect` : décision porteur du 2026-09-17 sur #6896 (le `readerCanvasRatio` iOS du 13/09 se réaligne par #6904 ; ce lecteur naît aligné). Les onze cotes sont gardées par `scripts/lib/curve-story-reader.mjs` (PARTIE 14 de `check-curve.mjs`, falsifiée : `READER_SIDE_INSET = 12` ⇒ rouge). **Réaligné le 2026-09-18 par #6904 : neuf cotes.** Le rayon cadré se lit dans la loi `SceneShape.cardedCornerRadius` (le plateau iOS la cite au lieu d'écrire 22) et le sol flou dans `SceneFloorView` (partagé par la story, la galerie et le réel) ; `image-only.ts` n'a plus de source Swift — iOS a retiré `StoryImageOnlyPresentation`, API sans appelant — et ses deux tolérances sont une loi web gardée par `image-only.test.ts`, la parité de cette présentation restant une question ouverte à part.

**L'image seule garde ses objets.** `StoryViewerView+ImageOnly.swift:13-21` : « le canvas garde sa taille : les objets posés dans l'image restent à leur place » — la CARTE est rognée au rectangle de l'image, le moteur reste monté. La première forme du lot ne montait que l'`<img>` et PERDAIT le texte que l'auteur avait posé dans l'image. Seule une story sans aucun occupant (`sceneOccupants`, `lib/stories/image-only.ts`) monte l'image nue, sans charger le moteur. Sur le corpus réel, le fond est porté par DEUX objets (un `bg` sans image qui porte le cadrage, un `content` + `isBackground` qui porte l'image) : l'objet vide n'est ni un occupant ni la source de la bande (`letterboxHashes` lit le fond ÉLU, `backgroundMedia`).

**L'attente et la durée.** Le moteur gagne le contrat d'un hôte qui attend sa scène (`muted`, `onContentReady`, `onDurationKnown`, `onPlaybackBlocked`, miroir de `MeeshyScenePlayer.init`) ; le fil n'en passe aucun. Un placeholder ThumbHash couvre la carte jusqu'à « prêt » ; la barre, le son et la vidéo de fond ne partent qu'à ce signal (`pendingBackgroundActivation`). Sans lui, la première forme laissait une scène à fond image à 0 % pour toujours. Côté lecteur, « prêt », la durée du média et la disponibilité du son portent l'IDENTITÉ de leur story au lieu d'être remis à zéro par l'effet « à chaque story » : les effets d'un enfant passant avant ceux du parent, une couche déjà chargée qui se déclare prête à son montage était écrasée par la remise à zéro de la story qu'elle venait d'ouvrir. Une valeur étiquetée se pose par une mise à jour qui RENVOIE l'état précédent quand rien ne change : `StoryMediaLayer` annonce la durée depuis une réf de rappel en ligne, rappelée à chaque rendu, et un objet neuf par annonce bouclait sans fin (mesuré : `check-feed-media` figé sur `/story/st-video`, moteur de rendu à 100 %). `timelineDuration` est AUTORITAIRE (`computedTotalDuration`, PRIORITÉ 0, « un média plus long est rogné ») — jamais `configuredMs`, qui porte la sémantique du legacy `slideDuration` (plancher 6 s et arrondi aux cycles).

**Le son.** `electBackgroundTrack` élit la piste (objet `audio` `isBackground`, sinon `document.sound` d'origine) ; volume, fenêtre source (`bounds`) et départ différé (`startTime`, sur l'horloge de LECTURE) sont appliqués. Le muet est une préférence VIEWER (`isGlobalMuted = false`) ; un refus de la politique de lecture automatique le pose à vrai, pour que le bouton dise la vérité — mesuré : Chromium refuse aussi un `<audio>` MUET sans geste (l'exception « muted autoplay » ne vaut que pour la vidéo), et accepte la même lecture dès qu'une capture a précédé : le gate exige donc la COHÉRENCE bouton/piste, jamais un des deux états. Le bouton (ligne auteur, rail droit hors tranche #5817) n'existe que si `sceneHasControllableSound` — jamais sur `isDocumentAudible`, vrai pour un son de bibliothèque non servi ou une vidéo de premier plan que le moteur joue muette.

**La clé des médias.** La passerelle sert `fileUrl` (`mediaSelect`), jamais `url` : `storyMediaUrl` lit les deux, pour le chemin v1 comme pour le porteur. Une entrée de porteur SANS adresse n'est plus posée (elle masquait le `mediaURL` de l'objet et rendait `<img src="">`) ; `objectMediaSrc` (`lib/canvas/carrier.ts`) est désormais le site unique moteur/lecteur. Une couleur de scène se lit par `hexColorCss` : le corpus écrit `textColor: "FFFFFF"` sans dièse, déclaration CSS invalide que le navigateur ignorait.

**Preuve.** `bun test` 4715 verts / 361 fichiers, `type-check` et `build` verts ; `check-story-scene.mjs` (NEUF, 105 invariants, clair et sombre, 390×844 et 430×932 : placeholder peint au pixel moteur retenu, carte centrée ±1 px, texte au rang 2 avec `lang`, bouton son cohérent et piste qui avance au toucher, appui long qui gèle piste et barre, image seule avec texte lisible, image nue sans moteur, épingle de 3 s à plus de 55 % en 2 s, v1 intact) — falsifié par cinq mutations, chacune rouge (placeholder jamais peint, épingle non autoritaire, moteur qui ne signale jamais prêt, image seule qui ignore ses occupants, carte centrée dans le viewport plutôt que dans le plateau). `check-feed-scenes` 82, `check-feed-media` 19, `check-list-actions`, `check-lens`, `check-reels`, `check-interface-language`, `check-curve` verts. Poids : `story_reader` 6,29 Ko (plafond 8), `story_scene` 4,87 (plafond 6), `scene_player` 1,96 (plafond 3), première peinture 46,6.

**Ce que ce lot NE fait PAS**, assumé : les fondus du son de fond (question 9.3, pas de rampe `<audio>.volume` sans `AudioContext`) ; le son de BIBLIOTHÈQUE (`GET /sounds/:id`, question 9.2) ; le gel de la barre pendant un buffer vidéo (9.6) ; le chemin v1 posé sur le plateau comme la scène (9.1) ; l'état « média indisponible » DESSINÉ pour un fond de scène en échec (le signal « prêt » part pour ne pas bloquer la diapositive, la carte montre la bande) ; les stickers, lieux et dessins (#6901, fail-closed : canvas) ; la recapture de la cible iOS drapeaux ON (aucune story v3 accessible sur Ref-Native) ; la recette des coques (lecture de la piste après geste dans WKWebView et WebView Android).

## D-81 · Le studio de story monte ses médias par un client TUS MAISON, publie un document composé par UN composeur typé, et ne rejoue pas `CanvasV3Schema` à l'exécution — 2026-09-17 (#6900, revue-correction)

**Le client TUS.** `lib/api/post-media-upload.ts` (~1,8 Ko gzip, chunk à la demande `post_media_upload`, chargé à la PREMIÈRE sélection de fichier) plutôt que `tus-js-client` (~8 Ko, XHR, reprise sur `localStorage`) : le protocole est celui de `TusUploadManager.swift` — `POST /api/v1/uploads` (201 + `Location`), `PATCH` par tranches, `HEAD` sur 409, UNE nouvelle création sur 404/410 (`TUS_SESSION_LOST` au second). Tranches de 2 Mio lues par `File.slice` (jamais le fichier entier en mémoire) et délai de garde de 120 s PAR requête : 10 Mo demandent ~200 s sur Fast 3G. Métadonnées en UTF-8 → base64 (`@tus/utils` décode en UTF-8 ; `btoa` seul mutilait « été.jpg » et levait sur un nom arabe). **Aucune panne ne rejette la promesse** : réseau, annulation, délai, refus serveur sont des `ApiResult` — la publication ATTEND l'accusé d'une montée en vol, et une promesse rejetée la laissait suspendue. Un invité est refusé AVANT le premier octet (`POST_MEDIA_REQUIRES_ACCOUNT`, `tus-handler.ts:326-333`), et l'écran le dit avant toute composition. Pas de reprise après rechargement : le brouillon garde les médias déjà PRÊTS, jamais un fichier.

**UN composeur.** `composeStoryCanvas` (`lib/stories/story-document.ts`) écrit l'aperçu ET la publication ; ils ne diffèrent que par l'ADRESSE d'un média (URL locale / `postMediaId` + `fileUrl`). Fond en `plane: 'content'` + `isBackground`, `mediaType` en mot (`CanvasV3Migration.swift:776-780` ne lit un `bg` que comme une couleur). Une story SANS visuel porte un objet `bg` de couleur (`StoryBackgroundPalette.colors[0]`, `0F0C29`) : le texte du composer est blanc, et le lecteur web peint sinon l'aplat CLAIR de la carte. Une vidéo de fond sous un son de fond est muette (question 9.10).

**Pas de `CanvasV3Schema` à l'exécution.** Il est déclaré avec le `zod` COMPLET ; Rollup range tout `zod` sous un seul chunk, celui de la vingtaine d'écrans en `zod/mini` — mesuré 5,53 → 18,75 Ko pour eux, et séparer `zod/v4/classic` n'en retirait que 4,49 (le noyau partagé grossit avec ce que le complet utilise). Le document ne vient d'aucune saisie structurelle : CHAQUE forme que le composeur peut produire est prouvée contre `CanvasV3Schema` par `story-document.test.ts`. La garde `MEDIA_NOT_CLAIMED` reste rejouée par le port avant tout envoi ; `CANVAS_INVALID` reste jugé par la passerelle et son refus se dit.

**Le brouillon.** Un par LECTEUR (`meeshy.draft.story.<viewerId>`) — un `postMediaId` n'est réclamable que par son monteur (`mediaOwnership.ts:101-106`) — persisté à CHAQUE changement avec la langue composée (Prisme) ; un succès le purge. Hors ligne, l'intention de publier est ARMÉE et part au retour du réseau.

**Preuve.** Recette API sur `gate.staging.meeshy.me` le 2026-09-17 avec le compte de recette : image JPEG de 4,36 Mo en TROIS tranches + son AAC, publication, `GET /api/v1/posts/6aac12eb58f2172f13599f22` avec `X-Canvas-Caps: 3` ⇒ `storyEffects.v === 3`, `scenes[0].objects.length === 3` (fond `content`/`isBackground`/`image`, son `audio`/`isBackground`, texte `fg`), `media` porte les deux `postMediaId`. **Non fait** : la lecture côte à côte sur « Meeshy Ref-Native » (le compte connecté n'est pas l'auteur ni son ami : « contenu indisponible ») ; le gate navigateur `check-story-studio.mjs` ; la recette des coques (sélecteur natif dans WKWebView et WebView Android).

## D-82 · Une version neuve ATTEND qu'on la demande : `registerType: 'prompt'`, l'application inscrit son worker, et la purge NOMME ce qu'elle efface — 2026-09-17 (#6936)

**Le worker neuf n'active plus rien tout seul.** `VitePWA` passait `registerType: 'autoUpdate'`, ce qui posait `skipWaiting: true` + `clientsClaim: true` (`vite-plugin-pwa/dist/index.js:874-877`) : un déploiement activait le worker neuf EN SILENCE sous une page qui continuait de faire tourner l'ancien JavaScript, et cette activation retirait du précache les chunks de l'ancienne version — un écran chargé à la demande pouvait alors ne plus se charger, sans que le lecteur ait jamais appris qu'une version existait. En `prompt`, le worker neuf reste EN ATTENTE, la page l'annonce et c'est le clic qui lui envoie `SKIP_WAITING` — le message que le modèle de Workbox câble précisément quand `skipWaiting` est faux, et l'API que le legacy utilisait déjà (`apps/web/public/sw.js:233-238`). `clientsClaim` reste VRAI : sans lui, la première visite n'est contrôlée par personne, ce que `check-institutional.mjs` exige.

**L'application inscrit son worker, `registerSW.js` disparaît.** `injectRegister: false` : le script injecté n'inscrivait que le worker, sans détection ni annonce. L'inscription vit dans `main.tsx` (sur le `load`, après la première peinture, hors coque et hors développement) et porte les trois déclencheurs de vérification du legacy — démarrage, retour au premier plan (`focus` ET `visibilitychange`), battement horaire qui ne part jamais d'un onglet caché. `nginx.conf` perd l'en-tête d'un fichier qui n'existe plus.

**La purge NOMME ce qu'elle efface.** `lib/sw-caches.ts` déclare une fois les seaux que l'application possède (`api`, `medias`, `meeshy-cache-*` hérités du legacy) ; `vite.config.ts` les CRÉE depuis cette même source, `query-client.ts` les purge au changement d'identité, le contrôleur de mise à jour à l'application d'une version. **Le précache de Workbox n'en fait PAS partie** : son nom ne porte pas la version, le worker EN ATTENTE y a déjà écrit les entrées de la version neuve, et son activation supprime celles qui ne sont plus au manifeste — le détruire depuis la page ferait partir la version neuve avec l'ancienne, et Workbox ne répare un précache manquant que sous intégrité SRI (`PrecacheStrategy._handleFetch`). Côté `localStorage`, seule la clé `meeshy.query-cache` est retirée : la session, le schéma, la langue d'interface et les brouillons vivent dans le même magasin et doivent survivre (« en préservant la session », directive porteur).

**`discardPersisted()` ARRÊTE la persistance, il ne fait pas que retirer la clé.** `persist` est câblée sur `pagehide` et `visibilitychange`, tous deux déclenchés PAR le rechargement : sans ce verrou, la clé effacée était réécrite dans la milliseconde, avec le même `buster`. Mesuré par le gate navigateur, qui journalise la SUITE des gestes sur cette clé — le dernier avant le rechargement doit être un retrait (mutation : trois écritures apparaissent après lui).

**TROIS ÉCARTS ASSUMÉS avec le legacy**, chacun pour un défaut mesuré chez lui : le rechargement au `controllerchange` est conditionné à une page DÉJÀ contrôlée (le legacy recharge aussi à la première installation, sous le premier visiteur) ; un rechargement de SECOURS part si le `controllerchange` n'arrive pas (un bouton sans effet serait un contrôle mort) ; le socket n'est pas déconnecté avant de partir (la v2 n'efface la session que sur `auth:token-expired`/`auth:session-revoked` servis par le serveur, jamais sur une coupure de transport — et le legacy DÉCONNECTE dès la DÉTECTION, donc un lecteur qui répond « Attendre » y perd le temps réel pour le reste de sa session : `connection.service.ts:47-50` puis la garde `isAppUpdating` de `connect()`).

**LA COQUE CAPACITOR N'A PAS DE MISE À JOUR EN VOL, et n'en aura pas par ce chemin.** Elle n'émet aucun service worker (`check-shell-dist.mjs`), embarque ses actifs (`webDir: 'dist'`, aucun `server.url`) et reçoit une version neuve par son magasin d'applications. Le contrôleur ne s'y inscrit pas (`__SHELL__`), la bannière ne peut donc pas y apparaître, et son cache de requêtes persisté se purge sur le `buster` — donc à chaque version publiée, `package.json` étant la source de la version des coques (`scripts/sync-shell-version.mjs`). Ce que la coque ne sait pas faire : annoncer une mise à jour disponible sur le magasin (suivi ouvert).

**La bannière suit la géographie d'iOS, pas celle du legacy** : une carte flottante sous l'encoche, au-dessus du chrome (comme `RootChromeLayer`), pas une bande pleine largeur collée au document. Elle est MASQUÉE hors ligne — priorité de la coupure, reprise du legacy, et un rechargement hors ligne rendrait la coquille du cache au lieu de la version neuve. Aucune animation d'entrée : la charte n'autorise qu'un `@keyframes`, déjà pris par l'indicateur de frappe.

## D-83 · Ma cellule du rail porte DEUX portes séparées, et l'humeur a son adresse — 2026-09-17 (#6150)

Directive porteur du 2026-09-17, mot pour mot : « mettre le bouton (+) au dessus de gauche de l'avatar de l'auteur pour créer une nouvelle story et (bulle pensant) en bas droite pour créer un mood ou afficher le smiley animé du mood en cours comme sous iOS ! Ce flow doit pas etre lourd ».

**Elle SUPERSÈDE le corps d'origine de #6150**, qui faisait dépendre ces deux portes du lot « composeur de publication à trois formes » (directive 2026-09-10). Le (+) vise `storyCompose`, une route qui EXISTE ; la pastille vise une composition d'humeur MINIMALE, neuve. Attendre le composeur partagé laissait le rail sans aucune porte pour un lecteur qui n'a rien publié.

**UNE entrée « soi », SÉPARÉE des groupes — et c'est structurel, pas cosmétique.** Un `StoryTrayGroup` naît d'au moins UNE story (`groupStoriesByAuthor` ne pousse un groupe qu'à partir d'une ligne) : un lecteur qui n'a rien publié n'en a aucun, donc sans `selfRailEntry` (`lib/view/story-rail-self.ts`) les deux portes n'existeraient que pour qui a déjà publié. C'est la règle d'iOS mot pour mot — `LentilleRailPolicy.shouldRender(selfEntry:entries:)` : « faire disparaître le seul chemin vers "mes stories" et "mon statut" parce que personne d'autre n'a publié serait une régression, pas une épure ». Elle ferme au passage l'écart que `withMoods` nommait dans son propre doc-comment (« un auteur qui n'a QU'un statut, sans story, n'a pas encore de pastille »), **pour le lecteur seulement** : l'écart reste entier pour les autres auteurs (suivi ouvert).

**Ma cellule n'est peinte que sur le GRAND plateau**, et le retrait de mon groupe des « autres » y est LIÉ. La bande épinglée ne porte ni légende ni boutons (décision iOS déjà écrite dans `story-rail.tsx` : `PinnedStoryTrailBand` rend des anneaux seuls dans 60 pt) ; retirer mon groupe là-bas aussi aurait fait DISPARAÎTRE ma story de la bande — le rail aurait montré moins que lui-même en défilant.

**DEUX contrôles, jamais un geste qui devine.** Trois nœuds frères dans un conteneur positionné — l'avatar (lien vers ma story, seulement si j'en ai une), le (+), la pastille — jamais imbriqués : un bouton dans un `<a>` produit un arbre d'accessibilité invalide, et taper la pastille ouvrirait AUSSI la story. C'est pourquoi iOS monte deux `Button(.plain)` frères dans un `ZStack` plutôt qu'un `label:`.

**Le piège des deux pastilles sur un même avatar se mesure, il ne se raisonne pas.** Chacune mesure ~26 px et se touche sur 44 ; leurs centres sont à 68 px l'un de l'autre sur chaque axe, donc les deux carrés ne peuvent pas se recouvrir. `check-story-self-rail.mjs` mesure l'INTERSECTION des rectangles rendus, pas leur existence : deux cibles qui se chevauchent sont un seul bouton pour le doigt et deux pour le lecteur d'écran, et aucune assertion de DOM ne l'attrape.

**En RTL la géographie MIROITE — c'est le sens de la directive, pas une liberté.** « haut-gauche » et « bas-droite » nomment un DÉBUT et une FIN de ligne : en arabe le (+) se pose en haut à DROITE. Les deux pastilles sont en `start-0` / `end-0`, jamais `left` / `right`, et le gate le vérifie en `ar` — une pose physique passerait tous les autres invariants et échouerait sur celui-là (mutation jouée : elle rougit ces quatre invariants, et eux seuls).

**MAIS `apps/web-v2` NE POSE `dir="rtl"` NULLE PART** (mesuré le 2026-09-17, #6945). `index.html` porte `<html lang="fr">` sans `dir`, et ni le script inline de langue ni `interface-language.ts` ne le touchent : choisir l'arabe change les LIBELLÉS et laisse la mise en page en LTR. Trois des quatre surfaces qui se croient RTL-conscientes sont donc du code MORT — les variantes `rtl:` de `feed-carousel-chrome.tsx`, le `:dir(rtl)` de `summary.css` et la lecture de `getComputedStyle().direction` de `feed-scene-carousel.tsx` (qui rend toujours `ltr`) — écrites juste, jamais atteintes, et chaque lot suivant les lit comme une preuve que le RTL marche. `check-story-self-rail.mjs` pose donc `dir` LUI-MÊME et l'avoue dans son doc-comment : ce qu'il prouve est que cette géographie-ci miroite d'elle-même le jour où l'application posera `dir`, pas que l'application le pose.

**DEUX écarts assumés avec iOS**, chacun avec sa raison :

1. **L'emoji de l'humeur RESPIRE, alors qu'iOS le fige sur soi.** `LentilleRailSelfEntryView` monte `MeeshyMoodBadge(animates: false)` — la pastille « moi » vit hors de la borne d'animation du rail, et « un contrôle qui respire est du bruit ». La directive demande explicitement « le smiley animé du mood en cours » : on la suit, en portant la BORNE avec l'animation (`.mood-breathe`, `styles/app.css` : 2 s × 4 ≈ la `breathingDuration` de 8 s, puis la pastille se pose). Porter le ressort sans sa borne aurait porté le défaut que l'audit de chauffe du 2026-08-26 a corrigé chez iOS. `prefers-reduced-motion` l'éteint — c'est le portillon `shouldAnimate(animates:reduceMotion:)`, écrit une fois dans la feuille pour que nul site d'appel ne l'oublie.
2. **Un SECOND `@keyframes` entre dans la feuille.** `app.css` se disait « l'UNIQUE @keyframes du POC (règle 32) » ; la mesure dit qu'il y en avait déjà cinq (`floating-menus.css`, `thread-menu.css` × 3). La règle était donc déjà relâchée dans les faits, et c'est cela qu'il faut dire plutôt que d'ajouter une sixième exception en silence.

**La pastille ouvre TOUJOURS la composition, elle ne montre pas de bulle.** L'ambiguïté vient de la demande (« créer un mood OU afficher le smiley ») ; iOS tranche, et on le suit : sur SOI, `onMoodTap` est câblé à `StoryTrayCopy.changeMood`, et `StatusBubbleOverlay` sert les AUTRES (pastille décorative, `MeeshyMoodBadge(onTap:)` avec sa position d'ancrage). Une bulle sur ma propre humeur est une issue de suivi, pas une moitié livrée ici.

**Les deux boutons flottants du rail RESTENT tous les deux** (« créer une story » et « tout voir »). Le (+) de l'avatar les double SUR la story, et c'est délibéré : le disque flottant est la porte du plateau (il survit au défilement du rail et ne dépend pas de l'existence d'une cellule « soi »), la pastille est la porte de MON entrée. Les retirer aurait supprimé un chemin sans que la directive le demande — « ce qui existe et complète la cible s'agrège, ne se supprime pas ».

**`/status/new` est une ADRESSE, pas un mode de `/stories/new`.** Une humeur n'est pas une story : `Post.type = 'STATUS'`, corpus distinct côté passerelle (`?scope=statuses`), ni scène, ni durée, ni média — et le bouton système « retour » doit refermer la composition d'humeur seule. L'écriture est `POST /api/v1/posts` (`postRoutes` sous `API_PREFIX`, `core.ts:370`), la LECTURE `GET /api/v1/social/posts?scope=statuses` : deux adresses voisines, deux verbes, et les confondre rend un 404 qu'aucun témoin de vue ne voit.

**L'écriture optimiste est SYNCHRONE — défaut trouvé par son propre témoin.** `performPreferenceEdit` attend `cancelQueries` avant d'écrire ; sur un réglage invisible, un tour de boucle ne se voit pas. Ici ce tour sépare le doigt de l'emoji : `performMoodPost` écrit d'abord et LANCE l'annulation sans l'attendre. Un refus remet exactement l'instantané ; hors ligne, rien ne part et l'écran le dit avant le geste.

**Les fixtures MÉMORISENT l'humeur posée** (`recordFixtureMood`, `lib/api/status.ts`, pendant de `storyViewedStore`) : sans ce magasin d'onglet, `loadStatusMoods` reservait le corpus littéral à la première invalidation et l'humeur APPARAISSAIT puis DISPARAISSAIT — l'écriture optimiste était juste, le corpus qui la remplaçait ne la connaissait pas, et aucun gate navigateur ne pouvait prouver le parcours complet.

**Le cliquet de poids a servi de revue, et c'est le signal à retenir.** `measure-weight.mjs` a rougi — « interface_catalogs » 59,02 Ko > plafond 59 Ko — et le dépassement pointait deux clés que la revue aurait dû attraper seule : `status.compose.back` DOUBLAIT `pending.back` (« Revenir aux conversations », déjà employée par `StoriesHeader` pour le même retour) et `status.compose.published` n'était appelée nulle part. Les retirer était juste ; qu'un cliquet l'ait découvert avant nous ne l'est pas. Après retrait : 58,93 Ko — **70 octets de marge pour sept langues**, donc la prochaine feature qui ajoute trois libellés fera rougir ce gate et devra arbitrer sous la pression de son propre lot. C'est une décision de projet (#6949), pas quelque chose qu'une session de feature doit trancher.

**Ce que ce lot NE fait PAS**, assumé et suivi par issues : la bulle d'humeur ancrée (`StatusBubbleOverlay`, largeur `min(250, conteneur − 48)`, bascule au-dessus de l'ancre sous 45 % de hauteur) ; le composeur d'humeur complet d'iOS (`ComposerMoodSurface.swift`, 1 108 lignes) — ici douze emojis et un mot de 80 caractères ; un emoji LIBRE hors de la grille ; la pastille d'humeur d'un auteur qui n'a QU'un statut et pas de story (l'écart de `withMoods`, entier pour les autres) ; l'avatar RÉEL dans ma cellule (initiales, comme le reste du rail) ; le retrait d'une humeur posée. Suivis : #6945 (`dir="rtl"`), #6946 (l'humeur d'un auteur sans story), #6947 (la bulle d'humeur), #6948 (emoji libre et retrait), #6949 (le cliquet des catalogues), #6950 (le témoin de fixture éphémère qui mesure la durée de la suite).

**Deux rouges de la suite complète ne viennent pas de ce lot, et il faut dire pourquoi.** `bun test` complet (5 175 témoins, 396 fichiers, 250 s) rend deux échecs qui passent tous deux ISOLÉMENT :

- `fixtures.test.ts § EPHEMERAL_WITNESS_ID : expiresAt dans le futur` — la fixture pose `expiresAt: minutesAgo(-2)`, calculé au CHARGEMENT du module. Une suite de 250 s dépasse mécaniquement ce seuil de 2 minutes avant d'atteindre le témoin : il ne mesure plus une fixture, il mesure la DURÉE de la suite. Aucun diff ne peut le sauver, et il touche zéro fichier de ce lot ;
- `feed-scenes.test.tsx § les cartes post-scene-* rendent [data-feed-scene]` — domaine du moteur de scènes (#6940, #6941, les rouges connus du tour parallèle).

Les deux sont à relever, pas à corriger ici : un lot de rail qui « réparerait » une fixture de protection éphémère masquerait le vrai défaut, qui est que le témoin dépend du temps.

**Et la cause est MESURÉE, pas déduite** (#6950) : deux runs de la suite complète, même arbre, même diff, à quelques minutes d'écart — **250 s machine chargée ⇒ 5 173 pass / 2 fail** ; **32 s machine libre ⇒ 5 286 pass / 0 fail**. À 32 s le témoin reste sous le seuil des 2 minutes, à 250 s il l'a franchi avant d'être atteint. Les deux échecs sont donc une fonction de la CHARGE, et ils passeront au rouge définitif le jour où la suite dépassera 2 minutes en CI. **Un rouge qui disparaît sur une machine libre n'est pas un rouge résolu** — c'est un témoin dont la borne a cessé de mesurer ce qu'il annonce.

## D-84 — Le studio de story est un PLATEAU : plusieurs objets, des gestes, et treize polices chargées à la demande (#6943, #6944, #6951)

> **AMENDÉ LE 2026-09-21 PAR #6951 — « aucune police web » n'est plus vrai, et l'arbitrage qui le posait était fondé sur la MAUVAISE raison.** Les dix-huit familles sont désormais servies. Ce que la section « L'arbitrage qui gouverne tout le reste » dit ci-dessous reste l'histoire exacte de #6943, et se lit désormais avec cet amendement. La suite de D-84 — le plateau, les gestes, la géographie, la légende — est INCHANGÉE.
>
> ### Ce que la mesure a corrigé dans l'arbitrage
>
> #6943 a différé les treize familles pour une raison de **budget**. La raison était réelle mais pas la principale : **les treize polices d'iOS sont TOUTES propriétaires** — Zapfino et Snell Roundhand (Linotype), Papyrus, Marker Felt, American Typewriter et Bradley Hand (ITC/Letraset), Didot, Futura Condensed, Avenir Next Condensed, Arial Rounded MT (Monotype/Linotype), Chalkboard SE et Noteworthy (Apple), Savoye LET (Letraset). Une application iOS a le droit de les UTILISER, parce qu'elles sont sur l'appareil ; un serveur web n'a le droit de les SERVIR à personne. **Aucun budget n'aurait débloqué ce lot** : « attendre leur budget » désignait un obstacle qui n'était pas celui qui bloquait.
>
> **Décision** — chaque famille reçoit un **substitut de même caractère, redistribuable** (OFL 1.1 ou Apache 2.0), sous-ensemblé au latin. Ce n'est pas la police d'iOS ; c'est sa famille. L'auteur qui écrit en `calligraphy` voulait une calligraphie, et le web en rend une — là où il ne rendait, jusqu'ici, rien du tout. La table, la provenance vérifiable et les licences : `src/lib/canvas/story-fonts.ts` et `src/styles/fonts/NOTICE.md`.
>
> | famille | police iOS | substitut servi | octets |
> |---|---|---|---|
> | `handwriting` | SnellRoundhand | Parisienne 400 | 22 332 |
> | `calligraphy` | Zapfino | Italianno 400 | 25 292 |
> | `cartoon` | ChalkboardSE-Bold | Comic Neue 700 | 12 800 |
> | `futuristic` | Futura-CondensedExtraBold | Saira Condensed 800 | 12 060 |
> | `fantasy` | Papyrus | Metamorphous 400 | 13 876 |
> | `curve` | SavoyeLetPlain | Tangerine 400 | 16 248 |
> | `tag` | MarkerFelt-Wide | Permanent Marker 400 | 29 296 |
> | `retro` | AmericanTypewriter | Cutive 400 | 15 332 |
> | `elegant` | Didot | Prata 400 | 11 916 |
> | `poster` | AvenirNextCondensed-Heavy | Anton 400 | 12 004 |
> | `bubble` | ArialRoundedMTBold | Fredoka 600 | 16 464 |
> | `note` | Noteworthy-Bold | Patrick Hand 400 | 14 224 |
> | `brush` | BradleyHandITCTT-Bold | Caveat 700 | 51 068 |
>
> ### Le poids : conditionnel par NATURE, et c'est ce qu'on garde
>
> 252 912 octets pour les treize, **et aucun lecteur ne les paie ensemble.** Une `@font-face` ne coûte que ses lignes de CSS tant qu'aucun caractère de son `unicode-range` n'est peint : mesuré, la feuille entière pèse **554 octets gzip -9**. Un lecteur qui n'ouvre aucune story ne télécharge rien ; celui qui en ouvre une en `handwriting` paie 22 Ko, une fois. Médiane par famille : 15 332 octets.
>
> **La première peinture ne bouge pas : 49,55 Ko pour un plafond de 90** (49,53 avant le lot ; les 0,02 Ko sont le nom d'un chunk, pas une police). `interface_catalogs` 75,03 → 76 Ko pour un plafond de 141 — les treize libellés payés sept fois.
>
> Les TROIS façons de rendre ce coût inconditionnel sont gardées par `measure-weight.mjs`, parce qu'aucune ne se voit dans un plafond :
> 1. une `@font-face` qui atteint la feuille CRITIQUE ;
> 2. **le précache du service worker** — et c'est le défaut que le gate a réellement attrapé : `globPatterns` nommait `woff2` depuis toujours, un motif qui ne coûtait rien tant qu'aucune police n'existait. Les treize sont arrivées DANS ce motif, et Workbox les inscrivait au manifeste : **247 Ko téléchargés à l'INSTALLATION par chaque visiteur, plus de quatre fois la première peinture entière**, pour des polices que la plupart ne verront jamais. Un précache ANNULE la mécanique même sur laquelle ce budget repose. Exclusion : `vite.config.ts › globIgnores`, gardée sur le `sw.js` PRODUIT et non sur la ligne de config ;
> 3. un fichier qui disparaît ou change sans que personne ne le dise — d'où un cliquet **exact** (`budgets.json › story_fonts.bytes`), sans la marge que les chunks voisins portent : un chunk grossit à chaque ligne de code, un BINAIRE ne dérive pas. Le seul geste qui bouge ce nombre est une substitution délibérée, et une marge la laisserait passer en silence.
>
> ### Le repli ne ment pas
>
> Derrière chaque famille vient **la pile NATIVE et rien d'autre** (`storyFontStack`) — jamais `cursive`, `fantasy` ou `serif`, qui rendraient une police d'allure voisine et feraient croire que le fichier a chargé. `font-display: swap` : le texte est peint tout de suite dans la police système, puis échangé ; si le fichier n'arrive jamais, le rendu est exactement celui d'avant ce lot. `block` laisserait le texte invisible jusqu'à trois secondes, `optional` renoncerait à la police pour toute la première visite — les deux ont été écartés, pas oubliés.
>
> ### Ce qui N'EST PAS servi, et il faut le dire
>
> - **L'ARABE.** Aucun des treize substituts ne le dessine — les polices d'iOS non plus. Un texte arabe reste peint par la police système, et son `unicode-range` garantit qu'il ne télécharge même pas le fichier. C'est la seule des sept langues qui ne reçoit pas la typographie de l'auteur.
> - **La FIDÉLITÉ au dessin d'iOS.** Un substitut rend la FAMILLE, pas la police : une story composée sur iPhone en `calligraphy` ne s'affiche pas identiquement sur le web. C'est irréductible tant que ces polices sont propriétaires, et c'est la seule dimension typographique qui reste divergente.
> - **La graisse déclarée par iOS.** `StoryTextStyle.fontWeight` dit 700 pour `note` parce que sa police EST Noteworthy-**Bold** ; réclamer 700 d'un substitut qui n'a que du 400 ferait graisser le glyphe par le navigateur — un faux gras que personne n'a dessiné. La graisse servie est celle du FICHIER. Un `fontWeight` explicite de l'auteur reste honoré, inchangé.
> - **Hors ligne.** Une story jamais vue en ligne rend son texte dans la police système : les fichiers sont hors du précache (point 2 ci-dessus). Arbitrage assumé — le repli est propre, et 247 Ko payés par tous pour ce cas ne le sont pas.
>
> ### Où les preuves vivent
>
> `story-fonts.test.ts` tient l'inventaire (une face par famille, le fichier de la table, le poids EXACT de chaque fichier, `swap`, `unicode-range`, le repli, le NOTICE) ; `story-compose-styles.test.ts` tient l'égalité **offert = peint** — « une famille à moitié servie est pire que son absence » ; `check-story-plateau.mjs` le prouve au NAVIGATEUR, famille par famille, sur le `getComputedStyle().fontFamily` du texte rendu ET sur `document.fonts.check` — parce qu'une `@font-face` dont l'URL casse laisse une chaîne parfaitement conforme. **Ce dernier témoin a été falsifié avant d'être cru** : un fichier corrompu le faisait mourir en `uncaughtException` sans nommer la famille, ce que la falsification a corrigé — un gate qui plante n'est pas un gate qui accuse.

### L'arbitrage initial de #6943, conservé pour l'histoire

**Décision** — le studio livré par #6900 avait trois valeurs (un fond, un son de fond, UN texte d'`id` littéral `'text'`). Il porte désormais **N objets texte**, chacun avec sa **pose**, sa **langue** et son **style** ; **deux** portes visuelles (le fond, et un **calque** d'avant-plan en `plane: 'fg'`) ; **un son** dont le plan décide du rôle ; et une **légende par média**. La directive porteur du 2026-09-17 nommait ces cinq manques.

### L'arbitrage qui gouverne tout le reste : aucune police web — PÉRIMÉ, voir l'amendement #6951 en tête de D-84

**Depuis #4850, un `textStyle` ne choisit QU'UNE POLICE** — ni couleur, ni fond, ni contour, ni lueur. Et seize des dix-huit familles de `StoryTextStyle.swift` nomment une police **embarquée dans l'app iOS** (Zapfino, Papyrus, Noteworthy, SnellRoundhand…). Les reproduire sur le web veut dire charger des WOFF2, et le poids de première peinture est déjà au-dessus de son plafond. **Ce lot ne télécharge aucun octet de police** : cinq familles sont servies parce qu'elles n'en exigent aucune — `bold` et `neon` (les DEUX qu'iOS rend déjà sur la police système, `fontName == nil`), `classic` et `italic` (Georgia), `typewriter` (Courier). Les treize autres attendent leur budget, une issue de suivi.

**Ce que cet arbitrage n'a rien coûté.** L'axe qui porte tout le visuel — `textEffect`, vingt-cinq valeurs — est une **table d'ombres en `em`**, donc du CSS pur : `lib/canvas/text-effect.ts` en est la copie exacte du legacy `apps/web/lib/story-text-effect.ts`. S'y ajoutent à coût nul la couleur (la palette de quatorze d'iOS), la graisse, l'alignement, la pastille, le cadre et le contour des glyphes. **Le vocabulaire visuel d'iOS est donc servi presque entier ; c'est la TYPOGRAPHIE, et elle seule, qui attend.**

> **La table est le QUATRIÈME miroir** (iOS `StoryTextEffect.swift`, Android `StoryTextEffect.kt`, `apps/web`, et celui-ci). Le mutualiser demanderait de toucher le legacy gelé ; il disparaîtra avec lui. Tant que les deux coexistent, toute évolution touche les quatre.

### Un style ÉCRIT doit être PEINT — sinon il est pire qu'absent

`scene-object-text.tsx` ne peignait que la couleur, la taille et une pastille. Un studio qui écrit `textEffect` dans un document que le moteur ignore **ANNONCE une apparence qu'il ne sert pas** — le défaut exact du cycle 123 (`StoryViewer`, la puce qui annonçait une langue que le corps ne rendait pas), et pire qu'une surface non câblée. D'où `lib/canvas/text-appearance.ts`, un module PUR `payload → CSS` que le moteur consomme, et un invariant du gate navigateur qui lit le `getComputedStyle` du texte peint, pas le document.

### La géographie : les poignées sont la SEULE exception, et elle est nommée

« Aucun contrôle ne se pose sur le canvas ; les rails vivent dans les couloirs » (`apps/ios/CLAUDE.md` § 1, #4561/#4633). Tenu : couloir GAUCHE = les trois portes et les objets posés ; couloir DROIT = les dimensions (ajouter un texte, ouvrir les contrôleurs) ; zone BASSE = les contrôleurs de l'outil ouvert, **fermés par défaut** pour que la scène garde sa hauteur. Les deux **poignées** (déplacer ; échelle + rotation) sont posées sur la scène, et c'est assumé : **une poignée de manipulation directe n'est pas un rail** — elle ne porte aucun réglage, elle EST l'objet qu'on saisit.

**Tout ce que le pointeur fait, le clavier le fait** (dimension 5) : les poignées sont des `<button>` de 44 px, `keyboardPose` y traduit flèches (× 10 avec Maj), `+`/`−` et `[`/`]`, et le rail droit double ces gestes en cibles VISIBLES. Un plateau qui ne s'exploite qu'à la souris n'est pas livré.

**60 fps pendant le geste** : la pose se peint directement en `style` sur l'élément que le moteur a rendu — **exactement les propriétés que `SceneObjectFrame.applyPose` écrit** (`left`, `top`, `transform`) —, et l'état n'est touché qu'au relâchement. Deux formules de pose auraient divergé au premier ajustement de bornes, et le geste aurait peint ailleurs que le rendu.

### Trois pièges d'implémentation qu'aucun témoin unitaire ne voyait

1. **Les effets de mise en page d'un ENFANT tournent avant ceux de son parent.** La poignée recevait d'abord une `ref` vers l'élément peint, que l'hôte remplissait dans son propre `useLayoutEffect` : elle mesurait donc `null` et **ne s'affichait jamais** tant qu'un second rendu n'était pas provoqué par ailleurs. Elle retrouve désormais son élément elle-même, par `[data-scene-object-id]` (attribut ajouté à `SceneObjectFrame` : avec un seul texte, `[data-scene-object]` suffisait ; avec plusieurs, il désigne le premier venu).
2. **Playwright résout ses routes dans l'ORDRE INVERSE de leur enregistrement.** Un attrape-tout `**/api/v1/**` posé APRÈS la route de publication l'avalait, et le gate disait « aucun POST n'est parti » alors que l'écran publiait parfaitement — un faux rouge qui accuse le code.
3. **`0.2 × 3` rend `0.6000000000000001`.** Une valeur CSS n'a pas à porter la queue binaire d'un produit ; le retrait de pastille est arrondi au millième.

### La légende d'un média (#6944) — un TROISIÈME contenu

`PostMedia.caption`, ni `Post.content` ni `alt`. Le contrat portait **tout le chemin sauf le rendu** : la passerelle l'accepte (`mediaCaption`), l'écrit et la traduit depuis #6280, et la SERT sur une story (`trayStorySelect` → `mediaInclude` → `mediaSelect`) ; `StoryTrayMedia` ne la DÉCLARAIT pas, donc le décodeur la jetait et **aucune légende n'atteignait aucun lecteur**. C'est la question du cycle 122 — « qui AFFICHE ce que le résolveur élit ? » — restée sans réponse pendant deux lots.

Trois précautions tenues :
- la descente passe par le site EXISTANT (`resolveMediaCaption`, `lib/api/prism.ts`), jamais réécrite, et le texte rendu porte son `lang=` — **deux contenus, deux langues**, sur deux lignes du pied du lecteur ;
- **la règle de dérivation de `caption.ts` ne s'y applique PAS** : elle efface un `Post.content` qui n'est que la concaténation des calques ; une légende de média a SON sujet, et y redire le texte de la scène est un choix de l'auteur ;
- un témoin prouve que **la carte du fil ne montre pas deux fois le même texte** — une story sans `content` et sans légende de média n'affiche AUCUNE légende, le repli de `709e35b51e` ne rendant rien.

Et le commentaire de `stories-publish.ts` qui documentait `content` comme « **LA LÉGENDE** » est corrigé : c'était faux, et c'est précisément la confusion que le porteur a levée.

### Les deux cliquets de poids, et ce que ça dit de #6949

`interface_catalogs` 59 → **65** (mesure 63,40 : les 53 clés du vocabulaire d'un objet posé) ; `story_studio` 7 → **13** (mesure 11,62). La discipline du dépôt est suivie à la lettre — remesurer, porter à `ceil(mesure) + 1 Ko`, écrire la mesure et ce qui l'explique. La première peinture ne bouge pas : 48,13 Ko pour 90.

**Ce lot valide l'inquiétude de D-83 et de #6949.** Le lot du rail « soi » laissait 70 octets de marge sur sept langues ; le lot suivant — celui-ci — a demandé 4,4 Ko d'un coup. **La piste est déjà ÉPROUVÉE** : #6871/#6834 a sorti les 83 clés `admin.*` vers un second catalogue à la demande (−6 Ko). Les 88 clés `story.studio.*` ne servent qu'à ceux qui COMPOSENT une story : le même geste s'y applique, et c'est une issue de suivi, pas quelque chose qu'un lot de feature tranche sous la pression de son propre diff.

### Ce que ce lot NE fait PAS, assumé

Un seul fond et un seul calque (pas N visuels) ; un seul son ; six effets NOMMÉS sur vingt-cinq et huit couleurs sur quatorze (une clé traduite se paie sept fois — les dix-neuf autres effets restent LISIBLES d'un document venu d'iOS, que le moteur peint déjà, ils ne sont simplement pas PROPOSÉS) ; ~~treize familles typographiques~~ (SOLDÉ par #6951, voir l'amendement en tête) ; les formes de cadre `diamond`/`cloud`/`speech` (un tracé SVG) ; `glass` (un compositing par texte, question produit ouverte depuis #6901) ; le pincement à deux doigts ; l'appui long ouvrant un menu contextuel d'objet (`StoryCanvasContextAction`, sept entrées) ; la timeline d'un objet. Chacun une issue de suivi.

---

## D-85 — Toucher une scène du fil ouvre la MÊME visionneuse que les pièces jointes, jamais un second plein écran (#6902)

**Décision** — une scène de publication s'ouvre en plein écran comme une NATURE DE PAGE de plus dans `MediaViewer` (D-54, D-59) : le lot d'un post est composé par `lib/feed/gallery-lot.ts` en pièces SYNTHÉTIQUES (`mimeType = application/x-meeshy-scene`, `fileUrl` vide, aucun octet à télécharger) plus une carte `scenes` — et **la nature d'une page se lit sur cette carte, jamais sur le MIME** (miroir `PostGalleryLot.swift:16-20`). `useSceneGallery` est l'hôte, monté par le fil ET le détail ; `?scene=N` est honoré à l'entrée du détail, borné au nombre de scènes.

**Pourquoi pas une couche à part.** iOS a eu DEUX plein écrans pour une scène, et `SocialSceneFullscreenView` a été retiré par #6709 sur directive porteur. Une seconde couche web aurait redemandé le retour matériel, le piège à focus, `#root` inert, la pellicule et les gestes de plateau — cinq mécaniques déjà écrites et gardées par 29 témoins.

**Ce qui distingue une page SCÈNE d'une page média, et seulement cela** : elle prend le **viewport entier** (le critère de #6902 : centre au centre du viewport, ±1 px, à l'échelle uniforme 9:16 figée — D-80), son pied **n'affiche ni format, ni cotes, ni poids** (« une scène n'a ni format, ni dimensions, ni poids », `ConversationMediaGalleryView.swift:1080-1084`), sa **légende vient de la page** (`resolveSceneCaption`, `carrierFallback: true` — le texte du post tient lieu de légende ICI, nulle part ailleurs), et elle porte **ses deux contrôles** : lecture/pause si la scène BOUGE, son si le document en PORTE.

### Le viewport entier se prend par un DÉCALAGE, jamais par `position: fixed`

La première forme posait `position: fixed` sur la page scène. Le plateau reçoit un `transform` pendant un glissement de fermeture (`media-viewer.tsx#onPointerMove`), **et un ancêtre transformé devient le bloc conteneur de tout descendant `fixed`** : mesuré au navigateur, la boîte passait de 390 × 693 à 371 × 660 et remontait de 16 px au PREMIER pixel de doigt, puis revenait d'un coup au relâchement — sur chaque tap portant un peu de gigue verticale. `fullStageBox` (`lib/view/media-stage.ts`, miroir `MediaStageFraming.full`) décale la boîte de la hauteur du couloir haut ; la page reste EN FLUX et suit le doigt SANS changer de taille.

> **Un gate de GÉOMÉTRIE mesure une pose au REPOS.** Celui de #6902 mesurait le rapport et le centre d'une couche immobile, et il était vert sur la forme défectueuse. Ce qu'un geste fait à la géométrie ne se voit qu'en mesurant PENDANT le geste.

### Muette à l'ouverture, et ce qui l'annonce doit être VRAI

`mode="story"` porte `isMuted: false` : sans muet d'hôte, `hostMute(undefined)` rend `false` et ouvrir une scène depuis un fil SILENCIEUX jouait son audio à plein volume — pendant que le doc-comment du fichier affirmait « démarrage MUET ». La page tient son muet (`useState(true)`) et un bouton l'ouvre. Le témoin lit la pastille du MOTEUR (`data-scene-sound="muted"`), l'EFFET, jamais l'étiquette du bouton.

### Une page qui prend le viewport emporte le pied avec elle

L'auteur, la date (70 % d'opacité) et la légende étaient dessinés pour tomber sur le NOIR du plateau. Une page scène occupe tout le viewport : ils tombent désormais sur la couleur de la scène, et sur une scène claire la date passe sous AA. La cible iOS peint un voile sous ce bloc ; le web le peint aussi, **sur une page scène seulement** — deux gates de conversation lisent la mise en page des pages image/vidéo.

### Ce que ce lot NE fait PAS, assumé

« Répondre », « Créer avec ce média », le menu ⋯ et la rangée de drapeaux de la cible (aucun effet câblé côté web aujourd'hui, loi 4) ; l'immersif qui COUVRE le viewport (`coverScale` est une fonction EN PLUS, leçon 618 — qui l'appelle décide) ; `coversEveryVisual` (la carte a déjà tranché, D-78) ; la position léguée par la carte (#6580) ; la reprise d'une scène TERMINÉE (`useSceneClock` repart de sa durée, le bouton de lecture la rejoue donc sans effet visible) ; les chaînes françaises EN DUR de la galerie, antérieures à D-52. Chacun une issue de suivi.

## D-86 — Un réel composé se rejoue comme sa scène : la scène décide avant le média, le mode `reel` boucle avec le son, le son de fond a UN site, l'horloge d'un mode à chrome accepte la durée de repli de l'hôte, et le porteur du fil dit son MIME (2026-09-18, #6903)

**Décision** — le lecteur des Réels demandait « quels médias ce réel porte-t-il ? » (`reelDisplayOf`) et jouait la vidéo brute ; un réel composé porte une SCÈNE dont la vidéo n'est que le fond, et le son de fond vit sur la timeline de la scène. `reelStageOf` (`lib/reels/scene.ts`, miroir `ReelSceneRouting`) pose la question juste — « porte-t-il une scène ? » — une fois pour la page : un réel à scène monte `ReelSceneStage` (chargé à la demande) même si `media` porte aussi une vidéo. Le moteur n'est pas réécrit : `ScenePlayer` en mode `reel` (`loops: true`, `isMuted: false`, `showsChrome: true`, déjà posé par #6899) rejoue la scène 0 en boucle, plein cadre 9:16 centré (D-80), et publie sa position (`onTime`).

**Mesuré** — `bun test` : 5363 tests verts (406 fichiers, +35 sur ce lot) ; `check-reels.mjs` : 161 invariants verts (clair+sombre × 390×844+320×568), section 14 nouvelle (le réel composé) : `[data-scene-player]` monté, jamais de `<video data-reel-media>` brut, scène centrée au pixel près, lecture MUETTE qui avance sans activation, aucun lecteur ni piste ne survit au retour ; `check-story-scene.mjs`/`check-feed-scenes.mjs`/`check-feed-media.mjs`/`check-story-studio.mjs` inchangés verts ; `measure-weight.mjs` : `first_paint` inchangé (48,16 Ko) ; `reels` 5,22→5,88 Ko (plafond 7, inchangé) ; `scene_player` 4,44→4,62 Ko (plafond 7, inchangé) ; `story_scene` 4,87→3,92 Ko EN BAISSE (l'extraction de `BackgroundTrackAudio`) ; deux chunks NOUVEAUX, `reel_scene_stage` (1,84 Ko, plafond 3) et `background_track_audio` (0,61 Ko, plafond 2, partagé par le lecteur de story ET les Réels, sans `dynamic_only` — ce sont SES DEUX IMPORTATEURS qui restent lazy, pas lui).

### Le porteur du fil ne disait pas son MIME, et l'élection du son de fond en dépend

`document.sound: { source: { t: 'original' } }` élit « le premier média AUDIO du porteur », PAR LE MIME (`electBackgroundTrack`, `background-sound.ts:80`). `card-model.ts` construisait le porteur d'une scène SANS `mimeType` (« le player rend d'après sa propre charge canvas, jamais d'après le porteur » — vrai pour la géométrie, faux pour l'ÉLECTION du son, qui lit le porteur). Un post OU un réel composé du fil n'avait donc JAMAIS de son de fond ; le porteur de STORY le reportait déjà. `FeedCardMedia.mimeType?` (additif) ferme le trou — témoin qui NOMME le trou qu'il ferme (`background-sound.test.ts` : un porteur sans `mimeType`, construit à la main, rend toujours `null`).

### Le son de fond a désormais UN site, pas trois

`BackgroundTrackAudio` était un composant LOCAL de `story-scene-layer.tsx` ; le studio a déjà sa jumelle simplifiée (dette consignée ci-dessous) et le lecteur des Réels en aurait été la TROISIÈME — le motif exact qui a fait diverger les trois familles de résolveurs du Prisme en trois cycles (CLAUDE.md racine). Extrait tel quel vers `src/components/background-track-audio.tsx`, consommé par les deux lecteurs ; le lecteur de story reste vert sans qu'un seul de ses témoins ne bouge. Gagne un effet de démontage DÉDIÉ (dépendances vides) : la piste se pause à sa disparition RÉELLE, jamais à chaque changement de `playing`/`muted` (déjà couvert par l'effet existant) — sans cette distinction, un hôte qui REMONTE la piste à chaque tour de boucle (`onLoop`, ci-dessous) l'aurait pausée deux fois par tour.

### L'horloge d'un mode à CHROME accepte une durée de REPLI, et signale ses tours

Un réel composé par le studio (fond vidéo + texte) n'a ni `timing` ni `timelineDuration` : `useSceneClock` ne s'activait que si la scène portait un objet TEMPORISÉ (T-E5) — jamais le cas ici. `ScenePlayer` gagne deux props ADDITIVES (D-79 : le mode ne gouverne que son/boucle/chrome, jamais la géométrie ni — jusqu'ici — l'existence de l'horloge) : `fallbackDurationSeconds` (la durée que l'HÔTE connaît, miroir `computedTotalDuration()`, IGNORÉE dès qu'une durée est DÉCLARÉE, et hors d'un mode à chrome — **une carte ne paie jamais cette horloge**, T-E5 conservé et prouvé des deux côtés) et `onLoop` (émis au wrap d'un mode qui boucle, miroir `loopPass`). `ReelSceneStage` REMONTE la piste de son de fond à chaque `onLoop` (nouvelle `key`) — jamais le PLAYER (Zero Unnecessary Re-render) : le canvas ne se repeint pas, seul le `<audio>` repart de `startOffsetMs`.

### La progression s'écrit sur une ref, jamais un état React

`ReelSceneStage` observe `onTime` et écrit `scaleX(...)` directement sur la ref de la barre — miroir `ReelSceneClock` observé par la SEULE barre, « la page ne se ré-évalue pas à chaque image ». Sans durée connue, AUCUNE barre : un contrôle qui ne bougerait jamais est un contrôle qui ment (loi 4).

### Ce que ce lot ne fait pas, assumé et CONSIGNÉ

Le studio garde sa jumelle `<audio data-story-studio-sound loop>` (`story-compose.tsx:705`, un aperçu qui boucle sans `bounds` ni `startOffsetMs`) — hors tranche (D-84), dette CONSIGNÉE : issue de suivi « l'aperçu du studio joue son son de fond par `BackgroundTrackAudio` ». `borrowedSoundTrack` (un réel SANS scène ni média, son de bibliothèque) : `source.t === 'library'` n'est pas servi côté web — issue compagnon « la bibliothèque de sons est branchée au lecteur ». Aucune télémétrie de visionnage de réel, vidéo comprise — hors tranche du web entier, pas une dette de ce lot. Le cadrage 9:16 figé (D-80) reste en écart assumé avec la capture de référence iOS (un réel d'IMAGES paysage, `carrierAspect` — périmé côté iOS depuis #6896/#6904) : une capture de référence d'un VRAI réel composé, drapeaux ON, sur `Meeshy Ref-Native`, reste à faire (issue de suivi « capture cible reels-scene, clair et sombre »). Le bouton muet vit sur le RAIL (site unique du son des Réels web), pas dans une rangée d'info à la `BackgroundSoundBadge` — que le web n'a pas (issue de suivi « le réel dit quel son il joue »).

### Revue-correction (2026-09-18) — trois défauts mesurés à l'écran, et un son qu'on ne pouvait pas couper

La forme livrée montait le moteur, le tap et la barre DANS la boîte 9:16. Mesuré au navigateur sur 390×844 (`dist/`, `/reels?seed=reel-scene-loop`) : la boîte occupe `y 75 → 768`, et trois choses en découlaient.

1. **Le tap ne couvrait que la boîte.** Un tap dans les bandes noires (75 px en haut, 76 px en bas) restait SANS EFFET — mesuré : `playing` inchangé après un clic à `(195, 40)`. Le réel VIDÉO du même écran prend la page entière (`ReelPlayable`, `inset-0` de l'`<article>`) et iOS met en pause au tap de contenu (`ReelsPlayerView.swift:891-894`) : même geste, deux comportements sur un même écran (dimension 6). Le bouton `[data-reel-surface]` est désormais une SŒUR de la boîte, dans le cadre pleine page.
2. **La barre de progression atterrissait à 76 px du bas**, contre la rangée auteur, au lieu du bas de page où iOS la pose (à la place de `ReelScrubBar`, sous la rangée auteur et le rail, `ReelsPlayerView.swift:656-664`) et où le réel vidéo du web la pose déjà. Mesuré : `y=766` contre `y=841` pour un réel vidéo. Même remède : sœur de la boîte, `bottom-0` du cadre.
3. **Le muet était dit DEUX fois, et le second se posait sur un compteur.** La pastille du moteur (`[data-scene-sound="muted"]`, 26×26 à `354,733`) recouvrait le bouton partage du rail (44×63 à `334,705`) et son compteur, pendant que le bouton son du rail portait déjà le même glyphe et le même état. `ScenePlayerConfig.showsMuteBadge` (DONNÉE, jamais une branche chez l'appelant) est `false` pour le seul mode `reel` : la pastille reste là où le moteur est SEUL à pouvoir dire le muet (carte, lecteur de story, aperçu du studio).

**Et le quatrième, que ce lot rendait atteignable :** `payload.muted` est la déclaration « cette vidéo n'a pas de son pour le lecteur » — c'est déjà ce qu'en tirent `sceneHasControllableSound` (« un fond VIDÉO NON DÉCLARÉ muet ») et `isDocumentAudible`. Le RENDU ne lisait que le muet de l'hôte. Une scène dont l'auteur a coupé le fond et qui ne porte AUCUNE piste de fond sonnait donc dès l'ouverture d'un réel (`soundOn = hasUserActivation()`, vrai dès qu'on y vient d'un tap dans le Flux) **sans qu'aucun bouton ne puisse la couper** — la loi venait précisément de dire au rail qu'il n'y avait rien à couper. La loi et le rendu lisent désormais la MÊME déclaration (`scene-object-background.tsx`). Un son sans commande est l'inverse exact d'un contrôle inerte ; il se cherche du même côté.

**Et le cinquième, qui frappait DÉJÀ tous les réels du web :** le VOILE BAS (`ReelPage`, 65 % de la hauteur, jusqu'à 0,85 d'opacité au ras du bas) est peint APRÈS la barre de progression, et l'effaçait. Mesuré au pixel sur la capture produite : rempli `rgb(15,15,36)` contre piste `rgb(12,12,12)` — deux teintes qu'aucun œil ne sépare, pour un contrôle dont le seul travail est de se voir. Ce n'est pas une dette de ce lot (elle date du lecteur lui-même, #6457) mais elle vidait de sens ce qu'il livre. `z-10` sur les deux barres — celle de la scène ET celle du réel VIDÉO, même remède au même endroit : le voile reste sur le MÉDIA, où il sert la lisibilité du blanc, la barre passe au-dessus. Remesuré : rempli `rgb(99,102,241)` (l'accent de l'auteur, franc) contre piste `rgb(77,77,77)`, écart 164 sur 255.

**Un témoin de ce lot était NON DÉTERMINISTE, et c'est mesuré, pas supposé.** « Sans activation, le son du réel composé démarre coupé » a rougi 2 fois sur 5 exécutions, sur des cellules différentes. Cause : `hasUserActivation()` lit `navigator.userActivation.hasBeenActive` AU PREMIER RENDU, et Chromium piloté l'arme autour de la première peinture — mesuré `hasBeenActive: true` sur 10 contextes NEUFS interrogés juste après le montage, alors que le rendu y avait lu `false`. Le gate POSE désormais la condition qu'il prétend éprouver (`addInitScript`, `userActivation` figé à « aucun geste ») au lieu de parier sur une course. Trois exécutions consécutives vertes ensuite.

Témoins : `config.test.ts` (`showsMuteBadge` vrai partout SAUF `reel`), `scene-player.test.tsx` (la pastille par mode ; `payload.muted` tient contre un hôte qui OUVRE le son, avec son jumeau sans la déclaration), `reel-scene-stage.test.tsx` (l) et (m) (tap et barre SŒURS de la boîte), et `check-reels.mjs` § 14 (aucune pastille de moteur ; la surface de tap A LA TAILLE de la page ; la bande noire reçoit bien le tap ; la barre collée au bas de la page ; la barre PEINTE se distingue de sa piste, décodée dans un canvas ; le bouton son OUVRE la piste de fond pendant que le fond coupé par l'auteur reste muet). Les quatre témoins ont été FALSIFIÉS un à un (code cassé ⇒ rouge, restauré ⇒ vert).

## D-87 — L'horloge d'un gate Playwright vit dans UN module ; `install` seul dérive sous contention, `install` PUIS `pauseAt` ne dérive jamais (2026-09-19, #7054)

**Décision** — tout gate qui simule le temps (`page.clock`) passe par `scripts/lib/paused-chronology.mjs` (`pausedChronology(page, { time })`, `advanceBy`/`factBefore`) ; plus aucun gate ne pose `install(time)` seul et ne lit un fait après un `waitForTimeout` mural. Trois modules, trois rôles distincts, aucune jumelle : l'HORLOGE (`paused-chronology.mjs`), l'ATTENTE D'UN FAIT observable (`await-fact.mjs`), la STABILISATION d'une valeur qui peut être annulée par un effet différé (`settle-value.mjs`, désormais réservée aux trois lectures de focus héritées de la leçon 634). `advanceBy` est une PROJECTION d'`advanceTo` — jamais une seconde implémentation — et `factBefore` est le seul chemin qui avance l'horloge en cherchant un fait.

**La cause, mesurée dans le bundle Playwright 1.62.1 lui-même** (doc-comment en tête de `paused-chronology.mjs`, sondé sur le dist de cette branche) : `install(time)` pose l'horloge truquée mais NE LA MET PAS EN PAUSE — `_replayLogOnce()` et `_syncRealTime()` la font dériver du temps MURAL écoulé à chaque `Date.now()`/`performance.now()` lu par la page, rafraîchie par un minuteur toutes les ≤ 100 ms réelles. Sous charge (load average 22 à 61, #7054), le mur qui sépare `goto` d'une lecture « T+4 s » peut dépasser l'écart entre deux traductions attendues à des rangs différents (3 500 ms vs 4 200 ms) : la chronologie DÉPASSE la lecture et le témoin de rang 2 obtient le rang 1 — un gate intermittent, jamais reproductible à la main. `install` PUIS `pauseAt(time)`, DANS CET ORDRE, coupe la synchronisation murale : mesuré, un `sleep` mural de 3 s ne déplace `Date.now()` de la page d'aucune milliseconde sous cette forme, contre une dérive intégrale sous `install` seul.

**Pourquoi ce n'était pas visible plus tôt.** Un délai fixe qui « marche » peut payer une course sans la nommer (leçon 634) ; ici c'est l'inverse — l'horloge FEINTE elle-même n'était pas réellement figée, et seule une machine sous forte contention le révèle. Dix runs verts sur une machine calme ne prouvent rien sur ce défaut ; la preuve retenue est la mesure du comportement du bundle, pas un compte de runs.

**Ce que ça coûte — dette CONSIGNÉE, pas soldée, mesurée au 2026-09-19.** Les cinq modules de `check-thread-states.mjs` passent tous par `pausedChronology` (la garde `no-fixed-delays.test.ts` dérive leur liste des imports réels de l'hôte), mais `lib/check-message-states.mjs` mesure encore 600 ms de MUR dans `assertStableHeights` (`waitForTimeout`, quatre appels) — laissé sciemment, ce témoin deviendrait trivial sous pause et attend sa conversion à un budget d'essais. Hors de ce gate, `lib/instant.mjs` (`pageÀInstantFigé`, sept hôtes dans `check-reading-mode.mjs`) et `check-lens.mjs` posent encore `page.clock.install` en direct, sans `pauseAt`. Et le nommage D-13 antérieur subsiste dans `lib/check-realtime-events.mjs` (`bulleVue`, `substitut`, `urlServie`, `vuOrdinaire`, `vuProtege`) et `lib/instant.mjs` — à solder par une passe dédiée sur `scripts/`, jamais au fil d'un lot qui réécrit ces fichiers pour une autre raison.

Détail : `tasks/lessons.md` § Leçon 635.

## D-88 — Le rail d'actions du lecteur de stories : la loi d'iOS en entier, le rendu borné par TROIS gardes structurelles (2026-09-19)

**Décision** — le lecteur de stories porte le rail d'actions d'iOS. La LOI est portée en entier — `StoryActionRailPlan.resolve` et son GEL (`apps/ios/.../StoryViewerView+Sidebar.swift:45-73`, `:216-232`, `:578-645`) deviennent `src/lib/stories/action-rail.ts`, pure, éprouvée hors DOM sur les cinq portes, la FIXATION et les deux remontées à sens unique. Le RENDU (`components/story-action-rail.tsx`) n'en montre qu'une partie, et il le fait par **trois gardes qui se composent, toutes structurelles** :

1. **la loi** — `storyActionRailButtons(plan)`, dans l'ordre unique `STORY_ACTION_RAIL_ORDER` ;
2. **le gestionnaire** — l'hôte remet-il une action ? C'est la généralisation du `canReply: onReplyToStory != nil` d'iOS ;
3. **le tracé** — le glyphe existe-t-il dans ce chunk ?

Un bouton n'est peint que si les trois répondent oui, et il est alors **absent du DOM**, jamais `disabled` : un contrôle désactivé annonce une action que le produit ne rend pas. Aucune branche à oublier au rendu ; la contre-épreuve (`story-action-rail.test.tsx`) mesure les trois absences séparément.

**Pourquoi la loi entière alors que le rendu en sert quatre** — parce que la loi est ce qui se PÉRIME quand iOS bouge, et qu'une loi partielle ne se compare à rien. Les quatre actions câblées aujourd'hui sont celles qui ont un EFFET mesurable côté web : **le son** (déménagé de la ligne auteur vers la TÊTE du rail, arbitrage #4508 — « le son est le SEUL élément du rail qui décrit ce qui est en train de SE PASSER »), **réagir** (`POST|DELETE /api/v1/posts/:postId/like`), **répondre** et **commentaires** (la même feuille, une seule zone de saisie — spécification porteur du 2026-05-28). Les cinq autres — republier, vues, partager, enregistrer, traductions — demandent chacune une surface que le web n'a pas encore ; elles restent dans la loi et hors du rendu. **Chacune a son issue, ouverte le 2026-09-19** — une dette annoncée sans issue n'existe pas : traductions #7114, republier #7115, les trois surfaces AUTEUR #7116 (vues + les deux faces de l'export, à livrer ENSEMBLE parce que la loi les rend indissociables), l'envol de la réaction #7117.

**Ce que ça coûte** — `story_reader` passe de 6,29 à **9,62** Ko gzip (plafond 11, mesuré, source dans `budgets.json`). Le FIL de commentaires n'y entre pas : il est chargé à la demande (D-54). *(Chiffre REMESURÉ quatre fois le 2026-09-19 : 9,32 annoncé par le lot, 9,36 à la remesure sur l'arbre du rail inerte, 9,56 après la première revue-correction qui y fait entrer D-91, la région vivante du lecteur et le retour du focus, 9,62 après la seconde qui y fait entrer D-92 et l'adaptateur `issue → annonce`. Sans conséquence sur le verdict, et c'est justement pourquoi il fallait le corriger à chaque fois — un chiffre servi qui n'est pas le chiffre mesuré ne rougit nulle part, et la remesure suivante se comparerait à une référence inventée.)*

**Le plafond de 11 n'est PAS arbitré** — `budgets.json` le dit dans son `status` (« CIBLE — REMESURÉE PAR LE RAIL D'ACTIONS DU LECTEUR, NON ARBITRÉE »), comme `interface_catalogs` porté de 65 à 67. Relever un plafond de poids pour y faire entrer son propre lot est le geste symétrique de « baisser un seuil pour passer » : il n'est pas interdit, mais il n'est pas au pouvoir de la session qui en a besoin. Le re-baisser rendrait le gate rouge sans rien corriger ; le porteur tranche, et la question a désormais SA PLACE : **#7121**, `décision-produit`, avec la mesure du jour et les deux réponses possibles. Elle vivait jusqu'ici dans un commentaire de #7112, ce qui n'est pas un endroit où une décision se prend (§ « Pilotage du développement » du `CLAUDE.md` racine : une décision produit ouverte est une ISSUE, jamais une question qui traîne dans un doc). *Note de cadrage mesurée en seconde revue : `NON ARBITRÉE` est porté par **38 des 39** entrées de `budgets.json` — la seule exception est `first_paint` (#6279, D-49). L'étiquette n'est donc pas un signal propre à ce lot ; ce qui l'est, c'est la CROISSANCE de +53 % en un lot.*

**Contradiction tranchée** — la consigne du tour disait de réutiliser `lib/api/reactions.ts`. Ce port sert `POST /api/v1/reactions` avec un `messageId` : c'est le port des réactions d'un **message de conversation**. Une story est une **publication** ; sa réaction passe par `POST|DELETE /posts/:id/like`, la route que le Flux emploie déjà. La réutilisation juste est donc celle de la ROUTE et de la grammaire d'issues de `feed-gestures.ts`, pas celle du module nommé. Et une seconde différence interdit la fusion pure et simple : `scope=stories` sert `currentUserReactions: string[]` là où le Flux sert `isLikedByMe: boolean` (`PostFeedService.ts:511` contre `postIncludes.ts`). Lire le booléen sur une story le trouverait toujours absent — chaque tap aurait posé une réaction sans jamais pouvoir la retirer, le bouton de retrait devenant inerte. C'est cette LECTURE, et elle seule, qu'écrit `lib/stories/reaction.ts`.

## D-89 — Une story EST une publication : un seul fil de commentaires, un seul port, un seul cache (2026-09-19)

**Décision** — le fil de commentaires est UNE surface (`components/comment-thread.tsx` = `comment-list.tsx` + `comment-composer.tsx` + sa requête) que DEUX hôtes montent : le détail d'une publication (`/post/$post`, sous l'ancre `#commentaires`) et le lecteur de stories (`components/story-comments-sheet.tsx`, chargé à la demande). Le port est `lib/api/publication-comments.ts` — `GET|POST /api/v1/posts/:postId/comments` (`services/gateway/src/routes/posts/comments.ts:66,179`) — et le cache est `['posts', <id>, 'comments']` : un commentaire posé depuis une story apparaît dans le détail de la publication **sans relecture**.

Le fondement est que la passerelle ne fait pas la différence : une story est une publication éphémère, elle porte le même fil sur la même route. Lui écrire un second port aurait produit deux implémentations qui divergent au premier ajustement — la forme exacte des trois familles de résolveurs du Prisme (CLAUDE.md racine, cycles 118-123).

**Le Prisme n'est pas réécrit** : une rangée de commentaire descend par `resolveFeedText` (`lib/feed/text.ts` → `served()`, `lib/api/prism.ts`), la même descente que le corps d'une carte du fil, `PostComment.translations` portant la forme `{ langue: { text, … } }` d'un post. Et ce que le résolveur ÉLIT, la rangée l'AFFICHE avec son `lang=` — le témoin de rang se pose sur un commentaire **anglais traduit en français**, jamais sur un fil monolingue où la règle juste et le court-circuit rendent le même verdict.

**Le compteur de commentaires d'une carte du fil cesse d'être inerte** : il conduit à `/post/$post#commentaires`. `repostCount` reste, lui, une STATISTIQUE — la republication ouvre un composeur prérempli que le web n'a pas, et son témoin mesure désormais l'**absence** de rôle bouton, pour qu'un lot à venir ne le rende pas cliquable sans lui donner d'effet.

**Ce que ce lot NE fait PAS, assumé** : aimer / répondre à / éditer / supprimer un commentaire, ses médias et sa citation (`quotedPostMedia`), les réponses imbriquées (`GET …/comments/:id/replies`), l'événement socket `comment:added` (la liste ne se met pas à jour toute seule pendant qu'on la regarde), et la file de reprise d'un commentaire posé hors ligne (#5868, qui couvre déjà les réactions). **Les cinq sont l'issue #7118** (ouverte le 2026-09-19) : ils partagent une surface et un port, les découper en cinq issues aurait produit cinq lots se disputant le même fichier.

**Une faute trouvée en chemin, et consignée** : `--color-ios-bg` **n'existe dans aucune feuille** du chantier (`src/styles/ios.css` déclare `--color-ios-surface`). Une variable CSS inexistante ne rougit nulle part : la feuille de commentaires s'est peinte TRANSPARENTE et son texte est tombé sur la photo de la story — illisible, vu à la capture, invisible à tout témoin de DOM. Deux autres sites du dépôt portent la même faute (`components/derived-identity.tsx:125` et `:187`) : **issue #7119**, ouverte le 2026-09-19 après REMESURE (zéro déclaration dans `src/` comme dans `packages/design-tokens/` ; le seul jeton voisin qui existe est `--color-ios-surface`). Elle porte aussi la garde qui empêche le retour — `check-utilities.mjs` pose déjà cette question aux CLASSES (« toutes portées par la feuille qui les sert ») ; personne ne la pose aux VARIABLES.

**Et un défaut de RUNTIME que son témoin a attrapé** : le composeur lisait `onChange`. Sous le runtime Preact (D-2), `onChange` d'un champ est l'événement NATIF `change`, qui ne part qu'à la PERTE DU FOCUS — le bouton d'envoi serait resté désactivé pendant toute la frappe. `onInput` partout, et c'est la convention déjà écrite du dépôt (`legende-plan.test.tsx`).

## D-90 — Ce qu'on MASQUE devient INERTE : l'opacité retire ce que l'œil voit, jamais ce que le doigt touche (2026-09-19, #7112)

**Décision** — toute surface que la v3.1 masque **sans la démonter** porte `inert`, et **perd son `aria-label` avec lui**. Jamais `aria-hidden` seul, jamais un couple `aria-hidden` + `tabindex="-1"` tenu enfant par enfant.

**Le fait qui fonde la règle : c'est la TROISIÈME fois que le dépôt paie exactement ce défaut.**

| site | ce qui restait atteignable | où |
|---|---|---|
| le grand rail de stories derrière la bande épinglée | ses liens, dans la tabulation ET dans l'arbre d'accessibilité, sous le MÊME `aria-label` que la bande | #6103, puis son enveloppe un cran plus haut (revue du 2026-09-12) |
| l'aperçu CLONÉ du cluster d'actions d'un message | les `<button>` des drapeaux du pied, focalisables malgré `aria-hidden` | D-29 |
| le rail d'actions du lecteur de stories masqué par la feuille de commentaires | quatre boutons cliquables et tabulables PAR-DESSUS la feuille, dont « Commentaires » recouvrant le bouton d'envoi du composeur | ce lot |

**Le motif est toujours le même, et c'est pour ça qu'il se répète** : l'auteur masque ce qu'il VOIT (`opacity: 0`) et pose `aria-hidden` pour l'annonce — deux gestes qui adressent l'œil et l'oreille, aucun qui adresse le **doigt** ni le **clavier**. Un `pointer-events-none` sur le conteneur n'y suffit pas dès qu'un enfant le ré-active, et c'est le cas nominal : le rail des stories doit laisser passer le geste de plateau ENTRE ses boutons, donc chaque bouton porte `pointer-events-auto`. La protection posée sur le PARENT était défaite par l'ENFANT, exactement comme l'`inert` du `<ul>` de `story-rail` était défait par son enveloppe — la même leçon, dans les deux directions.

**Pourquoi `inert` et rien d'autre.** Il retire le sous-arbre des **DEUX** arbres — tabulation et accessibilité — en un geste, sur un seul nœud, et l'inertie s'hérite : rien à tenir d'accord au premier enfant ajouté. `aria-hidden` ne parle qu'à l'un des deux, et **posé sur un sous-arbre focusable il est une faute nommée** (`aria-hidden-focus`) : un `Tab` amène le focus dans une région que le lecteur d'écran a reçu l'ordre de taire. Il DISPARAÎT donc partout où `inert` arrive, plutôt que de le doubler.

**Et le libellé tombe avec la région.** Une région inerte n'a rien à annoncer ; garder son nom, c'est laisser l'étiquette dans l'arbre pendant que son contenu en sort — soit précisément le doublon que la garde existe pour empêcher.

**Où le poser** : sur le nœud le **plus haut** que le composant rende. `StoryActionRail` n'en rend qu'un, un seul `inert` suffit ; `StoryRail` a dû le poser sur le `<ul>` **et** sur son enveloppe, parce que deux boutons vivaient chez le parent, hors de portée de l'attribut. **La question à poser n'est pas « l'attribut est-il posé ? » mais « qu'est-ce qui reste atteignable à côté de ce qu'il couvre ? »**

**Le témoin se pose sur l'EFFET, pas sur l'attribut** — `.focus()` sur un enfant d'un sous-arbre inerte ne doit pas le rendre actif (happy-dom l'applique : mesuré sur `story-rail.test.tsx:213` et `story-action-rail.test.tsx`). Un témoin qui n'assertait que la présence de l'attribut verdirait sur un `inert` posé au mauvais nœud — c'est-à-dire sur les deux défauts du tableau ci-dessus.

## D-91 — Un raccourci d'ÉCRAN cède la touche au nœud qui a le focus : un `preventDefault` posé sur `window` vole la frappe d'un contrôle (2026-09-19, #7112)

**Décision** — tout écran qui écoute le clavier sur `window` (le lecteur de stories, les Réels, et les trente surfaces qui suivront) interroge `shortcutYieldsToTarget()` (`lib/view/shortcut-scope.ts`) avant d'agir : si le nœud visé est un contrôle ou une région éditable, **la touche ne lui appartient pas**. Échap fait seule exception — fermer depuis un champ reste juste, et la couche qui veut le garder l'intercepte en phase de CAPTURE.

**Le fait qui fonde la règle : TROIS symptômes sans parenté apparente, une seule cause, et aucun visible à un témoin de DOM.** Le lecteur de stories a reçu une zone de saisie le jour où D-89 lui a donné son fil de commentaires ; son écouteur de `window`, lui, n'avait pas changé depuis #5817.

| symptôme, mesuré au navigateur | ce qui le produisait |
|---|---|
| taper « a b c » dans le composeur rendait **« abc »** | « Espace = pause » appelait `preventDefault()` sur chaque espace |
| une flèche pendant la frappe **avançait la story** — ce qui ferme la feuille (`setCommentsOpen(false)` au changement de story) et emporte le brouillon | `ArrowLeft`/`ArrowRight` ne regardaient pas qui avait le focus |
| **Espace n'activait AUCUN bouton du lecteur** — ni la croix, ni le rail ; seul Entrée marchait | le `click` d'un `<button>` naît du `keyup` d'Espace, qu'un `preventDefault` de `keydown` supprime |

Le troisième est le plus intéressant : il ne vient d'aucun champ de saisie, ne se voit sur aucune capture, et produit un **contrôle à moitié inerte** — la forme d'inertie que la loi 4 du dépôt interdit, dans sa variante la plus discrète. Il était là depuis l'origine du lecteur ; c'est l'arrivée d'un composeur qui a rendu la famille visible.

**Pourquoi une loi de POSSESSION et non une liste de touches.** Une liste (« ne pas prendre Espace quand un champ a le focus ») aurait dû grandir à chaque champ, à chaque touche, à chaque écran — c'est-à-dire jamais. La question juste se pose dans l'autre sens : *le nœud qui a le focus réclame-t-il CETTE touche ?* Elle se répond une fois, par deux sélecteurs, et elle couvre les trois symptômes ci-dessus comme ceux qu'un écran futur apportera.

**Et la cession est FINE, ce qui est le vrai cœur de la loi.** Une cession EN BLOC — « un contrôle a le focus ⇒ l'écran se tait » — corrige les trois symptômes et en FABRIQUE un quatrième : cliquer le bouton « muet » le FOCALISE (comportement natif du navigateur), et les flèches cesseraient d'avancer la story jusqu'au prochain clic ailleurs — un raccourci mort, pour corriger un vol de frappe. On rend donc exactement ce que la cible réclame : une zone de SAISIE réclame TOUTE touche (lettres, espace, flèches qui déplacent le curseur) ; un contrôle d'ACTIVATION — bouton, lien — ne réclame qu'Espace et Entrée, les deux touches dont son `click` natif est tiré. Le gate porte la CONTRE-ÉPREUVE de cette finesse (« une flèche alors qu'un bouton a le focus doit rester un raccourci d'écran ») : sans elle, rien n'empêcherait de rendre la cession grossière, et le quatrième symptôme entrerait en silence.

**Ce que ça coûte** — `story_reader` passe de 9,36 à **9,56** Ko gzip (mesuré, plafond 11 inchangé) ; la loi elle-même est PARTAGÉE avec le chunk `reels`, donc elle n'y pèse pas en entier. Le lecteur y gagne aussi sa région `role="status"` et le retour du focus (voir ci-dessous).

**Le témoin vit dans le GATE NAVIGATEUR**, et les symptômes s'y mesurent SÉPARÉMENT (`check-story-scene.mjs`, point 7) : un `if` autour des suivants les aurait fait DISPARAÎTRE du décompte quand le premier tombe, et une absence de témoin n'est pas un témoin vert. FALSIFIÉ DEUX FOIS, sur 130 invariants : la garde retirée, 12 rougissent (3 symptômes × 4 configurations) ; la cession rendue grossière, 4 rougissent (la contre-épreuve des flèches) — le total ne bouge dans aucun des deux cas.

**Deux corrections de la même passe, même famille.**

1. **L'issue d'une réaction de story ne s'entendait nulle part.** `performStoryReaction` distingue « parti » / « posé mais non confirmé » / « refusé et défait » et rend deux clés de catalogue ; l'hôte les JETAIT (`void storyReactionAction(...)`), et **aucun site du dépôt ne les lisait** — une loi qui calcule une valeur que personne ne lit. Un refus permanent retirait donc le cœur sans un mot, indiscernable d'un second tap. Le remède est celui que les Réels emploient déjà sur la MÊME grammaire (`usePostGesture` → `reels.tsx`) : une région `role="status"` unique, posée à la RACINE du lecteur — une région live démontée entre l'annonce et sa lecture n'est jamais annoncée, et le corpus change sous elle à chaque avance.
2. **`aria-modal="true"` retiré de la feuille de commentaires.** Il ANNONÇAIT une modale que rien n'appliquait : la croix du lecteur restait atteignable au clavier (mesuré) pendant que l'attribut ordonnait au lecteur d'écran de faire comme si elle n'existait pas — c'est mot pour mot la raison écrite dans `components/sheet.tsx:11-19`, et le dépôt avait déjà payé ce défaut (`auth-screens.test.tsx:142`). La modalité serait en outre le MAUVAIS produit : iOS garde délibérément l'arrière-plan interactif sous son overlay de commentaires (« user can still tap React / Reply / mute while comments are visible », `StoryViewerView+Canvas.swift:1640-1645`).

**UN TROISIÈME DÉFAUT, ET C'EST LE TÉMOIN QUI L'A TROUVÉ — `inert` ÉJECTE LE FOCUS QU'IL CONTIENT.** La feuille de commentaires PREND le focus à son montage (sans quoi la touche suivante irait au plateau, qui navigue) et ne le rendait pas : à la fermeture, il retombait sur `<body>`, et au clavier on repartait du haut du document pour retrouver le bouton qu'on venait d'actionner. Le correctif évident — la feuille mémorise `document.activeElement` à son montage et le restaure à son démontage — a rendu **`BODY`** au gate. La raison est en AMONT : l'hôte rend le rail `inert` à l'ouverture (D-90), et un sous-arbre inerte ÉJECTE le focus qu'il contient ; le bouton était donc déjà flouté avant que l'effet de la feuille ne tourne.

> **Celui qui DÉTRUIT le focus est le seul à pouvoir le rendre.** La couche qui arrive après ne peut plus savoir d'où l'on vient — elle ne lit qu'un `<body>` qui a l'air d'une absence normale. La mémoire vit donc chez l'hôte, POSÉE AVANT l'ouverture (`returnFocusRef`, `routes/story.tsx`), et la restitution APRÈS la fermeture, quand l'inertie est levée. C'est un effet de bord de D-90 que D-90 ne pouvait pas prévoir : on l'a écrit pour ce que le doigt touche, il se paie sur ce que le clavier perd.

**Et une citation d'iOS corrigée dans le même mouvement** : `story.tsx` justifiait le retrait du rail devant la feuille par « iOS lui cède de même la place ». iOS fait l'INVERSE. Le retrait reste juste — notre feuille est OPAQUE et occupe la place du rail, deux contrôles superposés n'étant qu'un seul contrôle pour le doigt — mais c'est un **écart assumé**, pas un emprunt. Sous D-1, une citation fausse de la référence est pire qu'une absence de citation : elle se propage au lot suivant qui la croit vérifiée.

**La JUMELLE est fermée dans la même passe** : `routes/reels.tsx` porte le même écouteur de `window` et le même `preventDefault`. Elle ne montre AUCUN symptôme aujourd'hui — cet écran n'a pas de zone de saisie — et c'est exactement ce qui était vrai du lecteur de stories avant que D-89 lui donne son composeur. La loi étant fine, l'appliquer là-bas est un no-op mesuré (`check-reels.mjs` vert, inchangé) qui coûte une ligne et ferme la porte : un écran qui écoute `window` interroge la cession, sans attendre le champ qui rendra son absence visible.

---

## D-92 — Une couche de SAISIE réclame le GESTE comme elle réclame la TOUCHE (2026-09-19, #7112)

**Décision** — la cession de D-91, écrite pour le clavier, est **énoncée une seule fois pour les DEUX entrées** : `screenGestureYields` rejoint `shortcutYieldsToTarget` dans `src/lib/view/shortcut-scope.ts`. Un écran qui écoute le geste sur sa scène se tait quand une couche de saisie est ouverte, et quand la cible du geste est dans une couche qui le réclame (`data-claims-gesture`).

**Le fait qui fonde la règle : D-91 avait fermé la porte du clavier et laissé grande ouverte celle du doigt, sur le MÊME symptôme.** La feuille de commentaires du lecteur de stories n'occupe que 293 px du bas ; **551 px de scène NUE restent au-dessus, et leurs trois bandes de geste étaient vivantes**. Un tap sur un bord y vaut « reprendre » (`decideTouchDown`, `lib/stories/gesture.ts` — `isPaused && zone !== 'center' ⇒ 'resume'`), la lecture repartait SOUS la feuille, la diapositive suivante arrivait, `setCommentsOpen(false)` fermait le fil — **et le commentaire à moitié écrit partait avec**. C'est mot pour mot le symptôme 2 de D-91 (« une flèche pendant la frappe détruit le brouillon »), survivant par l'autre entrée.

L'invariant que l'hôte s'écrivait à lui-même était violé littéralement — `routes/story.tsx` : « sans cela la story avancerait sous le fil qu'on est en train de lire, et le composeur changerait de publication à mi-phrase ». **La pause posée à l'ouverture est un `useState` semé UNE fois ; `resume()` la défait sans que rien ne la ré-affirme.** Une garde qui se pose une fois n'est pas une garde : c'est un état initial.

> **Une protection écrite pour une ENTRÉE ne couvre pas la seconde, même quand les deux servent le même invariant.** Le clavier et le pointeur atteignent le même `resume()` par deux chemins qui ne se ressemblent en rien — l'un par `keydown` sur `window`, l'autre par `pointerdown` sur la scène. Chercher la jumelle d'une cession au moment où on l'écrit coûte une ligne ; la trouver deux revues plus tard coûte un brouillon perdu par utilisateur.

**Deux motifs de cession, et le second n'est pas une commodité.** `layerOpen` est une cession d'ÉTAT : la couche est ouverte, le geste de l'écran se tait PARTOUT, y compris loin d'elle — l'utilisateur écrit, et ce que l'écran ferait de son geste détruirait ce qu'il écrit. `[data-claims-gesture]` est une cession de POSITION : la feuille se protégeait déjà par `stopPropagation()` sur ses propres gestionnaires, ce qui est juste mais **INVISIBLE à l'hôte** — la deuxième couche posée un jour sur la même scène oubliera l'appel, et rien ne rougira. L'attribut rend la revendication lisible depuis l'hôte, seul à savoir ce que son geste FAIT ; `stopPropagation` reste la seconde barrière.

**Le témoin est un gate de NAVIGATEUR, et il ne pouvait pas être autre chose** — `check-story-scene.mjs` point 7 bis : taper dans le composeur, puis DEUX taps au bord de la scène nue (reprendre, puis naviguer), et exiger que la story n'ait pas bougé, que la pause tienne, que la feuille soit là et que le texte soit intact. Rouge avant le correctif sur les quatre configurations, avec la mesure exacte de la revue — `st-amie-2 → {"story":"st-vue-recente","pause":null,"sheet":false,"text":null}` — vert après (138 invariants). **Il mesure la CAUSE, pas son délai** : attendre les six secondes de la diapositive rendrait un gate lent et fragile ; ce qui se mesure est que la lecture n'a pas repris.

**Et il se RELÈVE de son propre rouge.** Sans cela, la feuille emportée faisait mourir les témoins suivants sur un `page.click` en timeout de 30 s — un rouge qui accuse la croix du lecteur, et le message du vrai témoin jamais imprimé. Même discipline que le symptôme *a* de D-91 : une absence de témoin n'est pas un témoin vert.

**LA COQUE A ÉTÉ EXERCÉE, ET C'EST LA SEULE PREUVE QUI COMPTE ICI.** Le raisonnement disait que les deux moteurs portent `inert` largement (WKWebView iOS 26.1 ≫ Safari 15.5, WebView Android API 36 ≫ Chrome 102) — mais **un raisonnement n'est pas une mesure**, et aucun gate de coque n'exerce un COMPORTEMENT d'écran : `check-shell-dist` et `check-capacitor-config` ne lisent que le `dist/` embarqué et la configuration. Recette du 2026-09-19, sur les DEUX coques, `MEESHY_TARGET=capacitor` + `cap sync` :

- **iOS** (simulateur « Meeshy Poc-Web-V2 », le simulateur DÉDIÉ à la coque — `listapps` rend `/App.app`, `idb ui describe-all` un SEUL nœud `AXApplication`, donc bien une WKWebView) : feuille ouverte, trois taps sur la scène nue (bord gauche, bord droit deux fois), 8 s d'attente → **même story, barre de progression figée, feuille et commentaires intacts**. Le rail est retiré sous la feuille, et la rangée du composeur laisse ses ~43 pt sous elle (la marge basse de la coque est honorée).
- **Android** (émulateur `Meeshy_Poc_Web-v31`, API 36 arm64, schéma SOMBRE) : brouillon « brouillon de recette » tapé dans le composeur, trois taps sur la scène nue, 9 s d'attente → **même story, barre figée, feuille ouverte, et le brouillon INTACT**, bouton d'envoi armé. C'est le scénario exact du défaut, joué sur le moteur qui le subirait.

Captures : `.cache/web-v2-workflow/recette/stories/coque-{ios,android}-0{1,2,3}-*.png`. **Ce qui RESTE ouvert** : aucun gate automatisé n'exerce un écran dans une coque — la recette est manuelle, et elle le restera tant qu'aucun harnais QEMU/simulateur ne tourne en CI. C'est une dette de MESURE, pas de code.

## D-93 — Le profil public : sections empilées, un aller-retour, et un compteur ABSENT n'est pas un compteur à ZÉRO (2026-09-19, #7083)

**La cible de `/u/:handle` est `UserProfileSheet`** (`packages/MeeshySDK/Sources/MeeshyUI/Profile/`, 741 + 326 + 454 + 128 + 293 l), **pas** `ProfileView.swift` : celui-là rend le profil de SOI, en ÉDITION (`@State isEditing`, `PhotosPicker`, la section CONTACT qui affiche e-mail et téléphone) et son miroir web existe déjà — c'est `/me`. Se tromper d'écran de référence aurait porté l'édition sur la fiche d'autrui.

**UN aller-retour, pas trois.** `?expand=stats,relation` (`services/gateway/src/routes/directory/person.ts:170`, `:279-294`) sert l'identité, les onze compteurs et l'état relationnel ensemble — le doc-comment de la route dit qu'elle existe pour ça. Le port ne demande **jamais** `presence` : `isOnline`/`lastActiveAt` ne sont servis qu'à un ami accepté (loi du 2026-08-25), et le décodeur ne les lit pas — un client qui ne décode rien ne peut pas fabriquer un point vert. `PUBLIC_PROFILE_STALE_TIME` descend de 5 min à **60 s**, la fenêtre que la route DÉCLARE (`Cache-Control: max-age=60`) : la charge ne porte plus une identité seule, mais une RELATION qu'un tiers peut changer.

**Sections empilées, pas les trois onglets d'iOS.** (a) L'onglet « Conversations » est hors périmètre, et une barre à trois onglets dont un ne mène nulle part est un contrôle qui ment (loi 4) ; (b) `/me` a posé l'idiome `<section aria-labelledby>` dans la v3.1, et deux profils qui se feuilletteraient différemment feraient sentir un changement d'application (dimension 6) ; (c) iOS porte des onglets parce que sa fiche est une `sheet` sans place — la route web est une page pleine.

**AMENDÉ PAR #7124 — Conversations est arrivé, et la barre NE vient PAS avec.** La raison (a) tombe : l'onglet existe, et une barre à trois onglets mènerait désormais quelque part trois fois. Les raisons (b) et (c) tiennent, et elles sont STRUCTURELLES — elles ne dépendaient pas du périmètre. S'y ajoute ce que le lot a mesuré en le lisant : la barre d'iOS est INDISSOCIABLE de la chorégraphie qui l'ÉPINGLE sous un en-tête repliable (`pinnedTabBar`, `+Header.swift:204-230`, qui prend `offset` en argument et se décale de `ProfileHeaderMetrics.collapsedBar × progress`), et cette chorégraphie est un lot à part. Poser la barre sans son épinglage livrerait une moitié que l'autre lot réécrirait. **« Ce que vous partagez déjà » est donc une QUATRIÈME section empilée**, entre les publications et les compteurs : elle répond à « où nous sommes-nous déjà parlé ? », une question de relation, pas de mesure.

**UN COMPTEUR ABSENT N'EST PAS UN COMPTEUR À ZÉRO — écart ASSUMÉ avec iOS.** `servedUserStats` (`routes/user-stats.ts:220-225`, `:245-251`) SUPPRIME quatre compteurs pour un lecteur tiers ; iOS les décode en `Int` et la fiche d'autrui annonce « 0 Messages, 0 Traductions », une valeur FAUSSE présentée comme mesurée. La v3.1 décode chaque compteur en `number | null` et ne peint QUE ce qui est servi ; `0` servi et `null` absent sont les deux moitiés du seuil, tenues par `user-profile-sections.test.tsx`. Une issue compagnon porte l'écart côté iOS.

**Le blocage n'entre PAS sur le fil.** `relationAvec` (`person.ts:72-93`) n'a pas de valeur `blocked` — bloquer n'efface pas la ligne d'amitié, et le serveur continue de servir `friend` ou `none`. Écrire `'blocked'` dans `relation` inventerait une sixième valeur que la revalidation suivante effacerait : un geste qui « marche » puis se défait tout seul. Le blocage se lit dans `BLOCKED_USERS_QUERY_KEY`, la MÊME source que « Découvrir », que `performBlock`/`performUnblock` écrivent au geste.

~~**L'identifiant de la demande en cours manque au fil, et on ne l'invente pas.**~~ **AMENDÉ PAR #7122 — l'identifiant est SERVI, et il ne reste plus un seul panier derrière cette fiche.** `relationAvec` lisait `{ status, senderId }` et jetait `id` ; l'écran chargeait donc le panier `GET /directory/friend-requests?direction=…&status=pending` dès que la relation était en attente, et désarmait Accepter / Refuser / Annuler le temps du vol — un aller-retour de plus, sur la route dont le doc-comment dit qu'elle existe pour les fondre en un, pour une colonne que la ligne PORTAIT déjà.

La passerelle sert `relationRequestId` sur `expand=relation` (`services/gateway/src/routes/directory/person.ts`) : l'`id` de la ligne `friendRequest` quand la relation est `pending_sent` ou `pending_received`, **`null` sinon — jamais l'absence du champ**, `null` et « clé absente » se lisant pareil en JavaScript. **La surface de lecture ne bouge pas d'un pouce** : même `where`, même ligne, une colonne de plus dans le `select` — un identifiant de demande n'atteint donc que ses DEUX parties, et le témoin qui le garde ÉVALUE la clause plutôt que de supposer la borne (retirer le `where` le fait tomber).

Côté client, `bucketNeededFor` et la requête qu'il gardait ont disparu, l'état « geste en attente de sa ligne » avec eux : `pendingRequestFrom` (`lib/profile/relation.ts`) bâtit la ligne depuis le FIL — le sens de la demande se lit sur `relation`, les deux parties sur le sujet de l'écran et le lecteur. **`createdAt` n'est pas sur le fil et c'est assumé** : il ne sert qu'à l'insertion optimiste dans le panier des acceptées, que la réponse de la passerelle remplace aussitôt — le même arbitrage que la ligne provisoire de `performSendRequest`. **Et le geste optimiste écrit les DEUX champs** (`patchProfileRelations`) : « Ajouter » pose l'identifiant PROVISOIRE, puis celui de la passerelle ; accepter, refuser, annuler l'éteignent. Sans cela, « Annuler » aurait disparu juste après « Ajouter » — le contrôle absent au lieu du contrôle mort, mais le même geste perdu. **Un identifiant tout de même absent (passerelle plus ancienne) ne GRISE plus le geste : il ne l'OFFRE pas** (`actionsFor`), parce qu'il n'y a plus d'attente au bout de laquelle il s'armerait.

**Les gestes patchent TOUTE entrée de profil qui porte l'identifiant touché.** La fiche est mise en cache par HANDLE, et une même personne y entre sous plusieurs clés (son pseudo depuis une mention, son identifiant depuis une notification). Le patch et son retour arrière vivent dans `friend-actions.ts` — le site UNIQUE des gestes d'amitié — jamais dans l'écran : un second site aurait fait diverger la pastille de « Découvrir » et la fiche au premier geste.

**`/^\/u\//` se RESSERRE, il ne disparaît pas.** `location /u/` sert les médias hérités du legacy (`nginx.conf:61-64`) ET, par `try_files`, la fiche de la v2. Le critère « la route n'est plus NETWORK_ONLY » se tient par deux motifs plutôt que par une suppression : un pseudo ne porte ni point ni barre (`usernamePatternSource`), un téléversement en porte toujours. Le FICHIER part au réseau, la FICHE revient à la coquille — et `network-only-navigations.test.ts` énumère les deux familles explicitement, parce que se tromper de sens casse chaque avatar hérité, en silence, pour les seuls lecteurs qui REVIENNENT.

**Trois écarts de STYLE, chacun mesuré.** Le `@pseudo` est teinté par l'ENCRE DE MARQUE, pas par l'accent dérivé de l'identifiant (`authorAccentColor` prend n'importe quelle teinte : 4,22 mesuré en sombre, sous AA) — l'accent reste peint là où il ne porte aucun texte, le dégradé de bannière et l'avatar. Un bouton PLEIN se peint sur `--ios-indigo-600` et son texte est blanc (`--color-ios-brand` rendait 4,47, sous AA dans les deux schémas). La tuile « Stories » affiche son compte et **n'est pas un bouton** : iOS l'ouvre parce qu'il a l'écran, la v3.1 ne l'a pas.

**Différé, chacun sous son issue compagnon** (#7124 ; l'onglet Conversations est LIVRÉ, « Signaler » aussi — #7187) : l'en-tête qui se replie et sa barre compacte, la carte Voix, la bannière en plein écran, et « Renvoyer la demande » (`resendRequest` supprime puis recrée — il repart le débit de la cible et perd la trace de la demande initiale ; « Annuler » puis « Ajouter » donne le même résultat en deux gestes explicites).

**CE QUE LA REVUE A CORRIGÉ, et la loi que chaque correctif écrit.**

1. **Un filtre CLIENT ne mure jamais une pagination SERVEUR.** Le premier jet retirait « Charger plus » dès qu'un filtre était actif (`posts.hasNextPage && filter === 'all'`). Mesuré au navigateur : la tuile annonçait **2 Réels** — un compte SERVEUR, servi par `expand=stats` — au-dessus d'une liste d'**UN**, et le seul geste qui atteignait le second disparaissait à l'instant du tap. iOS n'arrête pas non plus sa sentinelle sous un filtre (`ProfileUserPostsList.swift:246-252`). **Quand un COMPTE et une LISTE viennent de deux sources, le contrôle qui les réconcilie doit rester offert dans tous les états du filtre.**
2. **Le vide d'un FILTRE n'est pas le vide d'un COMPTE.** `ProfilePostsEmpty` rendait « Aucune publication · Rien de public à lire » quel que soit le filtre — faux au moment même où la tuile voisine annonce des publications, et sans le seul geste qui en sort. Il porte maintenant les deux textes d'iOS (`filteredEmptyState`, `:498-510`) et son propre glyphe.
3. **Un panier JAMAIS LU s'amorce, il ne s'ignore pas.** `withBlockedFirst` rendait `undefined` quand le cache des bloqués était vide, et `setQueryData(key, undefined)` **n'écrit rien** : « Bloquer » partait sur le réseau sans que l'écran bouge. Sa jumelle `withRequestFirst` amorçait déjà le sien — c'est l'asymétrie entre deux jumelles qui faisait le défaut, et les trois témoins voisins SEMAIENT tous le cache avant le geste, donc aucun ne pouvait le voir.
4. **Rendre une entrée à son NÉANT demande `removeQueries`, pas `setQueryData`.** Corollaire du point 3, et il était déjà vrai pour les demandes d'amitié : `undefined` signifie « ne pas mettre à jour ». Un geste qui amorçait un panier laissait donc son amorce derrière lui quand la passerelle refusait — une liste d'UNE ligne, fabriquée par un geste RATÉ, présentée comme la liste entière.
5. **L'encre de marque tombait sous AA sur les boutons de CONTOUR, dans les DEUX schémas.** Le lot avait mesuré que `--color-ios-brand` (= `--ios-indigo-500`) rend 4,47 et l'avait remplacé par `--ios-indigo-600` sur les boutons PLEINS — sans l'appliquer aux autres. Mesuré à la revue : **« Écrire » 3,84 en clair / 4,06 en sombre**, « Charger plus » 4,47 / 4,45, « Réessayer » du bloc publications de même. « Écrire » est le geste que l'audience de cet écran vient chercher. Ils portent désormais `BRAND_INK`, la seule encre de marque MESURÉE lisible (le `@pseudo` la porte déjà) — une CLASSE, parce qu'elle bascule avec le schéma, donc le `style` inline ne doit pas poser `color`. Après : 5,41 / 6,07 et 6,29 / 6,67. **Et le gate mesurait deux boutons sur quatre — les deux qu'il sautait étaient exactement ceux qui échouaient** : une liste d'encres nommée à la main ne mesure que ce que son auteur soupçonne ; `check-profile.mjs` nomme maintenant les quatre, et relève celle de « Charger plus » TANT QU'IL EXISTE (la dernière page le retire, et une mesure faite plus bas rendrait `null` — un vert sur une couleur jamais regardée).
6. **Trois jetons recopiés au lieu d'être importés.** `INK`, `INK_2` et `BRAND_INK` étaient réécrits littéralement alors que `grouped-section` les exporte et que `/me` les importe (`profile-sections.tsx:14-17`) — et **une table de libellés portait trois clés que le rendu écrasait**, nommant des ÉTATS (« Contact », « Bloqué », « En attente ») là où le bouton peint des GESTES. Un piège pour la main suivante, qui les aurait crues servies.

## D-94 — Un libellé d'accessibilité ne prononce QUE ce que la rangée PEINT, et la matrice qui en décide est la LOI, jamais un `if` recopié (2026-09-19, #7092)

**Décision** — `composeMessageLabel` (`lib/view/message-a11y-label.ts`) interroge `rendersContent(protection, phase)` (`lib/reading-mode/protection.ts`) — **la même loi que le rendu** (`protected-content.tsx:183-190`) — pour décider de TOUT ce qui décrit le corps de la rangée : le texte servi, l'inventaire des pièces jointes, le lieu, **et la citation**. La branche `protection === 'veiled'` qu'il portait disparaît ; le fichier PERD une décision au lieu d'en gagner une.

**Le défaut** : une rangée `withheld` (la passerelle a RETENU le contenu) ou `veiled` AU REPOS ne monte aucun `Quote` — l'une rend `ProtectionNotice`, l'autre son substitut — pendant que le libellé annonçait « réponse à Amina Diallo » avant le placeholder. L'œil lisait « Contenu retenu », l'oreille entendait le nom de la personne citée. C'est le **second vocabulaire** que le doc-comment de `PROTECTED_LABEL` existe pour interdire, pris en défaut sur un autre segment que le texte : ni fuite ni régression (la passerelle sert ce nom sans condition), mais deux récits du même état.

**Pourquoi la loi et pas un `if`.** Rejouer « quand monte-t-on les enfants ? » par une condition recopiée dans le composeur ferait la jumelle exacte que `lib/reading-mode/protection.ts` interdit dans son propre doc-comment — et une jumelle que ses témoins ne verraient pas, puisqu'ils interrogent la loi, pas ses copies. La citation se prononce donc **dans la branche** qui dit déjà que les enfants sont montés, à sa place iOS (après l'auteur, avant le corps).

**La phase entre dans la signature, avec son défaut fermé.** `phase` vaut `{ phase: 'hidden' }` par défaut, et c'est la VÉRITÉ de l'appelant d'aujourd'hui : `thread-modes.tsx:378` pose `aria-label` sur le nœud PARENT de `ProtectedContent`, qui tient la phase en état local — une rangée voilée y est donc au repos au moment où le libellé se compose. Le jour où cette phase remontera, le paramètre dit déjà quoi en faire ; d'ici là il tient la branche **fermée**, jamais ouverte par défaut.

**Ce que coûte la règle** : un paramètre de plus sur une fonction très appelée, et un témoin de contre-épreuve OBLIGATOIRE. Un témoin écrit sur le seul cas au repos verdirait sur la suppression pure et simple du segment ; celui qui tient la règle est **`veiled` dans la phase qui MONTE ses enfants**, où la rangée peint la citation et le libellé doit la reprendre. Rouge mesuré avant le correctif : 3 échecs sur `message-a11y-label.test.ts`, la contre-épreuve verte des deux côtés.

*Note de traçabilité (2026-09-20)* — cette décision a d'abord été gravée sous `#7132` par le commit `b5815693ea` ; `#7132` est un incident CORS de téléversement, sans rapport. La décision et son lot appartiennent à **#7092**. Le même commit a gravé une SECONDE citation fausse (`#7133` pour D-95 et D-96, corrigée en `#7135` le même jour) : **un point d'étape qui cite plusieurs issues les mêle toutes ensemble ou aucune** — corriger celle qu'on a vue ne dit rien de l'autre, et la recherche qui l'attrape part du COMMIT, jamais du numéro déjà repéré.

*Suivi de revue-correction (2026-09-20)* — **le défaut fermé n'est pas gratuit, et son prix a été sous-estimé deux fois.** Le paragraphe ci-dessus dit « d'ici là il tient la branche FERMÉE, jamais ouverte par défaut », ce qui est juste comme direction de garde et faux comme bilan : joué au navigateur, une rangée `veiled` RÉVÉLÉE n'atteint **aucune** technologie d'assistance. **Deux** masques se composent, pas un — (1) le libellé retombe sur « Contenu masqué », la phase n'étant pas remontée ; (2) le texte peint est `aria-hidden`, par `plainTextHidden` (#7032), dont le contrat (« le texte servi est déjà dans `aria-label` ») est précisément rompu par (1). Sur une **vue unique**, le tap CONSOMME le message et la fenêtre se referme après 5,6 s : le contenu est brûlé sans avoir jamais été lisible, irréversiblement. Le correctif se décide donc des DEUX côtés à la fois — soit le libellé porte le texte, soit le DOM le rend — jamais les deux, jamais aucun. **#7142**, recadré à cette gravité, porte le lot ; le site du second masque (`focal-row.tsx`) porte désormais le repère qui y conduit. La leçon de forme : *une garde fail-closed ferme une fuite et OUVRE un silence ; les deux se mesurent, et sur la même surface.*

*Second suivi, trouvé au même passage et sans rapport avec ce lot* — **#7143** : la bande du composeur ne porte AUCUN matériau (`background: rgba(0,0,0,0)`, `backdrop-filter: none`), là où la bande d'en-tête porte le verre du site unique (D-51) ; depuis que #6213 a fait flotter les deux bords, le fil se peint lisible sous le rail et le champ **au repos**, ce que D-50 interdit déjà pour tout le chrome flottant de la v2.0 et que `check-day-pill-rest.mjs` ne garde que pour la pilule de jour. Le remède est le verre, jamais un dégradé de masquage (#6537, directive porteur du 2026-09-14).

## D-95 — Les gestes d'une rangée de commentaire : un port, des rappels, et un refus qui s'annonce SUR SA RANGÉE (2026-09-19, #7135)

**Décision** — aimer, modifier et supprimer un commentaire vivent dans **`lib/api/comment-gestures.ts`**, un port calqué sur `feed-gestures.ts` (plan → optimiste → appel → issue). `comment-list.tsx` et `comment-row.tsx` n'en reçoivent que des **rappels** ; l'hôte (`comment-thread.tsx`) tient le réseau, et garde la **REQUÊTE** de chaque geste refusé — pas seulement son message — pour que « Réessayer » rejoue exactement le geste qui a échoué.

**Trois conséquences qui ne se négocient pas :**

1. **AIMER est offert à tous ; MODIFIER et SUPPRIMER, à l'auteur seul** — le reflet EXACT de la passerelle, pas une politesse d'interface. `PATCH` et `DELETE …/comments/:commentId` (`services/gateway/src/routes/posts/comments.ts:500-523`) ne gardent PAS l'audience du post mais le contrôle d'**auteur** du service, « parce que le droit de retirer ce qu'on a publié ne peut pas dépendre de quelqu'un d'autre ». Offrir ces boutons ailleurs serait un contrôle qui ment (loi 4) : un 403 au premier tap.
2. **Un refus PERMANENT défait l'optimiste À L'IDENTIQUE.** Le compteur retrouve sa valeur en reprenant la rangée **LUE au départ**, jamais en re-soustrayant 1 — entre le tap et le refus, un écho peut l'avoir bougé. Et une rangée supprimée revient **dans SA page, à SON indice** : une réinsertion « en tête » passe tous les témoins de rendu et se voit au premier usage, le commentaire d'il y a trois jours remontant au-dessus de celui de la minute.
3. **Une rangée EN VOL n'offre aucun geste** — son `id` est temporaire, la passerelle ne le connaît pas.

**L'échec est VISIBLE, et sur sa rangée** : `role="alert"` + « Réessayer », jamais une annonce globale. La rangée est revenue à son état d'avant ; sans ce constat, le lecteur ne distingue pas « refusé » de « mon tap n'a pas été pris ».

**Une panne PASSAGÈRE ne défait rien** (réseau, 5xx, 408/425/429 — `outcomeOf`) : l'optimiste tient, l'état est ANNONCÉ, et aucune promesse de rejeu n'est faite — la file de reprise est #5868. Pour une suppression, cela vaut aussi : remettre la rangée ferait clignoter ce que l'utilisateur vient de retirer, pour une panne qui se résout d'elle-même le plus souvent ; la prochaine lecture du fil tranche.

**Ce que ça coûte** : un module de plus plutôt qu'une addition à `publication-comments.ts` (déjà à son budget) et à `comment-list.tsx` (qui ne charge rien, par contrat — c'est ce qui la rend partageable entre `/post/$post` et le lecteur de stories). Répondre, les réponses imbriquées, les médias, l'écho socket `comment:added` et la file hors-ligne restent à #7118, que ce lot N'ÉPUISE PAS.

*Note de traçabilité (2026-09-20)* — gravée d'abord sous `#7133` par le commit `b5815693ea` ; `#7133` est « Une scène composée se partage hors de Meeshy », sans rapport. Le lot est **#7135**, fermé le 2026-09-19 — et `comment-row.tsx`, `comment-gestures.ts` et `comment-list.test.tsx` portaient DÉJÀ `#7135` dans leurs revues-corrections : le même fichier renvoyait à deux issues pour un seul travail.

## D-96 — Un jeton de couleur référencé par du code doit être DÉCLARÉ par une feuille (2026-09-19, #7135)

**Décision** — tout `var(--color-…)` écrit **sans repli** dans un `.ts`/`.tsx` du chantier nomme un jeton qu'une feuille déclare (`src/styles/*.css`, `packages/design-tokens/*.css`). La garde est `src/styles/declared-tokens.test.ts`.

**Le fait qui fonde la règle** : `--color-ios-fill-2` était référencé par les **trois** surfaces du fil de commentaires (le champ du composeur, le champ d'édition, les trois barres du squelette) et **n'était déclaré nulle part**. Une propriété CSS dont la `var()` ne résout pas est INVALIDE : elle est simplement absente. Les trois champs n'avaient donc **aucun fond, dans les deux schémas** — mesuré à la capture, pas par un témoin. `--color-ios-separator` (composeur de story) faisait pire dans l'autre sens : `border-t` sans couleur valide retombe sur `currentColor`, donc un filet à l'encre du texte là où une hairline était voulue. `--color-ios-bg` (`derived-identity.tsx`) privait de fond un champ et ses pastilles de suggestion.

**Pourquoi aucun gate ne le voyait.** `tsc` ne connaît pas les noms de variables CSS ; `check:utilities` juge les **classes**, pas les styles en ligne ; `check:tokens` et `check:tokens-resolved` prouvent que les jetons DÉRIVÉS de Swift existent et se peignent — aucun des deux ne part du code pour remonter à la feuille. C'est la forme exacte d'une garde d'**inventaire** : elle lit ce que le code référence et ce que les feuilles déclarent, sans rien savoir des valeurs (D-4 tient : les valeurs viennent de Swift, cette garde ne les juge pas).

**Ce que la garde NE juge pas, et pourquoi c'est écrit** : `var(--x, #fff)` PEINT quoi qu'il arrive. Nommer là un jeton inexistant est une dette de vocabulaire, pas la panne silencieuse que la garde existe pour attraper ; deux sites sont dans ce cas (`--color-ios-on-brand`, `--color-ios-danger`) et ont leur propre suivi. Les y faire entrer ferait de la garde un registre d'exemptions — exactement ce qui empêche une garde d'être crue.

**Contre-épreuve incluse** : la garde vérifie qu'elle LIT bien quelque chose (plus de 20 jetons déclarés, plus de 20 référencés). Sans elle, une liste vide pourrait tout aussi bien signifier « la lecture n'a rien lu ». Rouge mesuré en réintroduisant `--color-ios-fill-2` ; vert après restauration.

*Note de traçabilité (2026-09-20)* — gravée d'abord sous `#7133` (sans rapport, voir D-95). Cette garde a été trouvée au critère (6) de **#7135** — « captures clair ET sombre, REGARDÉES » —, ce qui est la démonstration de ce que vaut ce critère : aucun gate du dépôt ne voyait la panne, et l'œil l'a vue du premier coup.

## D-97 — Un plafond de poids posé sur DIRECTIVE n'a pas de témoin : il ne survit que par la ligne qui l'inscrit, et ce qu'il coûte s'écrit avec lui (2026-09-20, #7140)

**Décision** — le plafond `interface_catalogs` de `budgets.json` passe de **70 à 141 Ko**, sur directive porteur du 2026-09-20 (mot pour mot : « Monte le ceil en doublant un minimum »). 141 = 2 × 70,27 — la mesure du jour — arrondi au Ko supérieur, donc au moins le double dans les DEUX lectures possibles de la consigne : le double de la MESURE comme le double du PLAFOND précédent.

**Pourquoi.** Les sept catalogues pesaient **70,27 Ko** pour un plafond de 70 : un dépassement de **0,27 Ko** faisait rougir `measure-weight.mjs`, donc `bun run gate`, donc le job `quality` — dont presque tous les autres travaux du workflow dépendent. Un cliquet qui bloque une chaîne entière pour 270 octets ne protège plus rien : il arbitre à la place du porteur, sous la pression du lot qui a le malheur de passer.

**Ce que cette valeur N'EST PAS.** Les trois plafonds précédents (57,23 → 63,40 → 69,26) étaient chacun DÉRIVÉS d'une mesure — arrondi au Ko supérieur + 1 Ko de marge, la discipline de tous les chunks voisins. Celui-ci ne l'est pas. **Une valeur posée sur directive ne peut pas avoir de témoin** : aucun gate ne peut vérifier qu'elle est juste, puisqu'elle n'est dérivée de rien. Elle ne survit que par le `status`/`source` de son entrée dans `budgets.json` — c'est la raison pour laquelle cette entrée est longue, et elle doit le rester.

**Ce que ça coûte, dit franchement.** Le cliquet ne mord plus avant que les sept catalogues n'aient DOUBLÉ. Toute la croissance d'ici là passera **en silence**, et la seule trace d'une hausse sera celle que son lot écrit à la main dans `budgets.json` — une discipline de rédaction remplace une mesure automatique. C'est le prix assumé d'un gate qui rougissait pour 0,27 Ko ; il se paie en vigilance, et une session qui ajoute des clés sans REMESURER ni ATTRIBUER sa hausse vient de dépenser cette marge sans que personne ne puisse le savoir. La remesure du même jour sous ce plafond, **sans y toucher**, donne 70,79 Ko, dont 0,52 Ko attribués aux cinq clés des gestes de commentaire (#7135), par deux mesures prises sur le MÊME arbre.

**Ce que ça ne tranche PAS.** La piste structurelle — un catalogue de plus, chargé à la demande, sur le patron éprouvé d'`interface_catalogs_admin` (−6 Ko sur son lot) — reste ouverte à **#7121**. Le doublement en retire l'URGENCE, jamais la raison. Et son seuil de rentabilité est une FAMILLE entière de clés (les 88 `story.studio.*`), pas quelques clés : à cinq, elle coûte au LECTEUR une requête HTTP de plus à l'ouverture d'une publication pour ~0,07 Ko dans sa langue — la dimension 2 payée pour satisfaire un exercice de comptabilité.

**La première peinture ne bouge pas** : 49 Ko pour un plafond de 90 (D-49, le seul plafond ARBITRÉ du fichier). Ces clés vivent dans les catalogues chargés à la demande, ce que `dynamic_only` garde — et c'est cette séparation, pas le plafond, qui protège l'écran d'ouverture.

## D-98 — Un écouteur temps réel n'IMPORTE pas le cache qu'il met à jour : le chunk `realtime` ne doit tirer aucun cache de route (2026-09-20, cadrage du lot « la liste des commentaires se met à jour toute seule »)

**Décision** — `realtime-apply.ts` (chunk `realtime`) ne peut importer **aucun module de cache propre à une route** : ni `lib/api/publication-comments.ts`, ni un port de fil, ni un modèle de carte. Il ne connaît que `QueryClient`, les **clés** de requête et des **mises à jour pures** déclarées **là où le cache vit**. Un septième couple `isCommentAdded` / `applyCommentAdded` se pose donc ainsi : la GARDE de forme et la clé restent dans `realtime-apply.ts` ; la FONCTION PURE qui insère la rangée et fait bouger le compteur vit dans `lib/api/publication-comments.ts` et lui est passée, jamais importée statiquement depuis le chunk temps réel.

**Pourquoi.** Mesure du 2026-09-20 (`bun run build` puis `node scripts/measure-weight.mjs`) : chunk `realtime` = **4,8 Ko** gzip -9 pour un plafond de **5**. La marge est de **0,2 Ko** — moins qu'une garde de forme et sa fonction d'application réunies. Et le dépassement ne serait pas le vrai dégât : importer `publication-comments.ts` (382 lignes, le port + le cache + les pages) depuis `realtime-apply.ts` ferait fusionner deux chunks que Rollup tient séparés aujourd'hui, et **tout lecteur qui ouvre une conversation téléchargerait le fil de commentaires d'une publication** — un code qu'il ne montrera jamais. Le chunk `realtime` est chargé en `import()` juste après la première peinture (D-49, S 7 de #5793) : c'est le chunk le plus proche du chemin critique parmi ceux qui ne sont pas comptés dedans.

**Ce que ça généralise.** `budgets.json` portait déjà le corollaire pour les corpus de RECETTE (« toute nouvelle dépendance PARTAGÉE entre le chunk `realtime` et un chunk de recette exige un `manualChunk` nommé »). Le défaut trouvé ici est le même mécanisme avec un autre voisin : **un chunk de ROUTE**. La règle se dit donc dans les deux sens — le temps réel ne tire pas une route, une route ne tire pas le temps réel — et la direction de l'import est ce qui la rend vérifiable : `dynamic_only` garde déjà le second sens, cette décision garde le premier.

**Ce que ça coûte.** Une indirection de plus à chaque nouvel événement social branché : la garde d'un côté, la mise à jour de l'autre, et un point de couture à écrire. C'est le prix d'un chunk qui reste petit ; il se paie une fois par famille d'événement, pas une fois par lot.

**Ce que ça ne tranche PAS.** Où vit l'ABONNEMENT lui-même. `socket.ts` branche aujourd'hui les six couples existants ; rien n'interdit qu'un écouteur de commentaires soit branché par la route qui les affiche, si sa durée de vie doit être celle de l'écran. La question se tranche sur la DURÉE DE VIE attendue (un compteur de fil doit bouger même hors de l'écran ⇒ `socket.ts` ; une liste ouverte seulement ⇒ la route), jamais sur le poids.

## D-99 — `PrismPastille` est la pastille UNIQUE de TOUT contenu traduit : une surface de contenu sans elle est un défaut, jamais un choix (2026-09-20, cadrage du focus feed)

**Décision** — toute surface qui rend un contenu que le Prisme a pu traduire — message, **corps de publication**, **rangée de commentaire**, aperçu, légende — monte `PrismPastille` (`components/message-blocks.tsx`). Aucune seconde pastille ne s'écrit, aucune variante locale : la composante rend déjà les deux formes que la loi exige, `<span data-prism-indicator>` quand l'hôte n'a pas de prise de langue et `<button data-prism-toggle aria-pressed>` quand il en a une, et elle rend `null` d'elle-même quand `servedLanguage === originalLanguage`.

**Pourquoi.** Mesuré le 2026-09-20 : `grep -rn "PrismPastille\|data-prism" src/components/comment-row.tsx src/routes/post.tsx src/components/feed-post-card.tsx` rend **vide**. La publication et ses commentaires sont la seule surface de contenu traduit de l'application sans pastille — pendant que le fil en porte deux (`bubble.tsx`, `focal-focus-overlays.tsx`). La rangée de commentaire sert pourtant déjà la BONNE traduction et pose déjà `lang` : la voix est juste, l'information est muette. C'est exactement la forme du cycle 122 du `CLAUDE.md` racine (« qui AFFICHE ce que le résolveur élit ? ») avec sa suite du cycle 123 sur `PostCard` — un contrôle de Prisme inerte ou absent là où le texte, lui, a bien changé.

**La cible iOS le dit en un seul coup d'œil** (captures du 2026-09-20 sur « Meeshy Ref-Native », drapeaux ON). L'en-tête d'une carte du Flux porte, sous le nom de l'auteur, une rangée de DEUX contrôles : le drapeau de la langue d'ORIGINE (« Afficher en English ») et le glyphe de traduction (« Traductions »). La rangée d'un commentaire porte la MÊME grammaire, augmentée du drapeau de la langue SERVIE : `Scenes Tester · 🇬🇧 🇫🇷 ✎ · maintenant`. Et le premier contrôle DISPARAÎT quand la langue servie est la langue d'origine — c'est la règle que `PrismPastille` applique déjà en rendant `null`, donc aucun gate n'a à la réécrire.

**Ce que ça coûte.** Le chunk `feed` mesure **11,04 Ko** pour un plafond de **12** : la marge est d'environ **1 Ko**. `PrismPastille` vit dans `message-blocks.tsx` (636 lignes), un module du FIL — le tirer tel quel dans le chunk `feed` y ferait entrer ce qui l'accompagne. Si la mesure franchit 12, **la pastille s'extrait dans son propre module partagé** ; le plafond ne se relève pas (leçon de D-97 : un cliquet qui cède sous la pression du lot qui passe n'arbitre plus rien).

**Ce que ça ne tranche PAS.** La FORME exacte de l'exploration sur le feed. iOS offre deux contrôles (un drapeau qui bascule vers l'original, un glyphe qui ouvre la liste des langues) ; le web n'a aujourd'hui que la bascule. Servir la liste complète des langues sur une carte de fil est une question de produit, pas une conséquence de cette décision.

## D-100 — La loi d'audience de la republication se LIT dans `@meeshy/shared`, jamais ne se re-porte : sa table a SIX entrées, pas trois (2026-09-20, cadrage du lot « republier une story »)

**Décision** — le sélecteur d'audience du composeur de republication borne ses choix par `allowedRepostVisibilities()` (`packages/shared/utils/repost-audience.ts`), importée, et par `repostVisibilityInheritsAudienceList()` pour `EXCEPT` / `ONLY`. **Aucun portage TypeScript n'est écrit** : la loi est DÉJÀ en TypeScript partagé, c'est la même fonction que la passerelle applique dans `PostService.repostPost` (403 `REPOST_AUDIENCE_WIDENING`), et iOS n'en est que le miroir (`packages/MeeshySDK/Sources/MeeshyUI/Story/StoryRepostAudience.swift`). D-14 le dit déjà pour les types et trois lois ; celle-ci en est une quatrième.

**Pourquoi la précision sur la TABLE.** Le cadrage de ce lot demandait un témoin sur « source `PUBLIC` → {PUBLIC, FRIENDS, PRIVATE} ». La loi réelle rend **les six** audiences depuis `PUBLIC` (`PUBLIC, COMMUNITY, FRIENDS, EXCEPT, ONLY, PRIVATE`), `[PRIVATE]` depuis `PRIVATE`, et `[original, PRIVATE]` partout ailleurs — et son doc-comment explique POURQUOI ce n'est pas un rang numérique : `COMMUNITY` et `FRIENDS` sont **incomparables**, un rang autoriserait des élargissements réels ayant l'air de réductions. Un témoin écrit sur la table à trois entrées serait VERT sur une loi FAUSSE, et figerait une jumelle divergente — exactement ce que la dimension 11 interdit. **La table du témoin est celle de la fonction importée, relue à sa source, jamais celle d'un énoncé de cadrage.**

**Ce que ça coûte.** `@meeshy/shared/utils/repost-audience` entre dans le chunk du composeur de republication. Mesure à faire au lot : `story_reader` est à **9,7 Ko** pour un plafond de **11**, et ce plafond est lui-même **sous arbitrage** (#7121, croissance +53 % en un lot) — deux travaux de stories visent cette marge de 1,3 Ko dans le même tour. Si elle ne suffit pas, le lot s'arrête et pose la question ; il ne relève pas le plafond.

**Ce que ça ne tranche PAS.** Ce que le rail du Flux fait de `repostCount`. Il reste une statistique INERTE et son témoin d'ABSENCE de rôle bouton reste vert : ce lot serait le seul à avoir le droit de le lever, et seulement en même temps qu'un effet — il ne le lève pas.

## D-101 — Un identifiant que le client doit RENVOYER voyage avec l'état qui offre le geste, jamais dans un panier à re-charger (2026-09-20, cadrage du lot « accepter, refuser, annuler »)

**Décision** — quand une charge sert un ÉTAT qui autorise un geste (`relation: 'pending_sent' | 'pending_received'`), elle sert **dans la même charge** l'identifiant que ce geste devra renvoyer (`relationRequestId`). Le client n'ouvre plus un second panier pour le retrouver, et ne désactive plus les gestes le temps du vol. La règle est réciproque : un champ SERVI doit être **déclaré par le schéma de réponse** — `fast-json-stringify` supprime sans un mot un champ produit et non déclaré — et **épinglé** partout où la route énumère ses champs (projection `fields`, calcul d'ETag).

**Pourquoi.** `GET /directory/people/:handle?expand=relation` lit déjà la ligne d'amitié (`services/gateway/src/routes/directory/person.ts:96-104`) et **jette son `id`** : le `select` ne demande que `{ status, senderId }`. La v3.1 contourne en chargeant `GET /directory/friend-requests?direction=…&status=pending` (`lib/profile/relation.ts`, `bucketNeededFor`) — zéro requête dans le cas nominal, mais dans le cas EN ATTENTE les trois gestes restent éteints tant que le panier vole. Une attente visible pour un identifiant que le serveur tenait déjà en main. Le doc-comment de la route dit lui-même qu'elle existe pour « fondre les allers-retours en un » ; il en restait un.

**La confidentialité ne change pas, et c'est ce qu'il faut FIGER.** La ligne lue est déjà bornée aux demandes dont le lecteur est PARTIE (`OR: [{senderId: viewerId, receiverId: cibleId}, {senderId: cibleId, receiverId: viewerId}]`) : aucune requête entre tiers n'est atteignable par cette route. Servir l'`id` n'ouvre donc rien — mais **la garde qui le rend vrai n'a pas de témoin aujourd'hui**, et un `select` qui gagne un champ est exactement le moment où une garde tacite se perd. Le témoin s'écrit sur le cas TIERS, pas sur le cas nominal (leçon 261 : un témoin de rang s'écrit sur un rang autre que le premier).

**Ce que ça coûte.** Un champ de plus sur une charge déjà servie, et `bucketNeededFor` disparaît avec son panier — du code client RETIRÉ, pas ajouté (dimensions 2 et 11). Le prix est ailleurs : ce lot touche la passerelle, donc il suit les cinq conditions du chantier (témoin qui échoue d'abord, correctif minimal, suite rejouée sur le périmètre, son issue, sa preuve).

## D-102 — La phase de révélation REMONTE par un canal, jamais par les peaux (2026-09-20, #7142)

`ProtectedContent` tient la phase (`useState`) ; `aria-label` se pose deux
niveaux plus haut, sur `[data-row]` (`thread-modes.tsx`). Entre les deux vivent
`FocalRow` et `Bubble`, toutes deux `memo`.

**Un rappel passé en prop aurait dû être relayé par CHAQUE peau** — deux relais
à tenir en accord, donc deux chemins qui divergent, c'est-à-dire exactement ce
que le critère « la phase remonte par UN SEUL mécanisme, partagé par les deux
peaux » interdit. `RevealPhaseChannel`
(`lib/reading-mode/reveal-phase-channel.tsx`) laisse les deux peaux
**inchangées** : elles ne savent rien de la remontée, donc elles ne peuvent pas
en diverger.

Le canal ne porte QUE l'émission — sa valeur est une fonction stable, donc
publier ne re-rend aucun consommateur. Le REGISTRE vit chez l'hôte, seul à se
re-rendre, et il ne garde **que ce qui s'écarte du défaut** : `hidden` n'y entre
jamais (sinon chaque rangée voilée visible coûterait un re-rendu au montage pour
n'apprendre que ce qu'on supposait), et `until` n'entre pas dans la comparaison
(le libellé ne lit la phase qu'à travers `rendersContent`, qui ne regarde que son
NOM).

**Coût mesuré AVANT d'être payé**, parce que l'issue le posait en préalable :
trois changements d'état par révélation — et non « un par tic de brouillard »,
`FOG_DURATION_MS` étant une durée consommée par un `setTimeout`, jamais un
`setInterval`. À 18,9 µs par `composeMessageLabel` et 20 rangées visibles, une
révélation coûte ≈ 1,1 ms, soit moins de 7 % du budget d'UNE image, réparti sur
trois instants séparés de secondes.

Un canal absent est un **silence, pas une panne** (`publish` par défaut est un
no-op) : `ProtectedContent` est monté par des hôtes qui n'ont aucun nom
accessible à tenir, et ce mécanisme n'a donc pas à être câblé partout.

## D-103 — Le texte d'un message est prononcé par le libellé de la rangée, sur les DEUX peaux (2026-09-20, #7142)

`plainTextHidden` (#7032, réponse au défaut majeur 1/4 de la revue #5935) masque
la prose non interactive parce que le texte servi est DÉJÀ dans
`aria-label={rowLabel}`. Il n'avait jamais été porté sur `bubble.tsx` — mesuré
sur un message SANS aucune protection :

```
focal   : libellé porte le texte = true | DOM expose le texte = false
bubbles : libellé porte le texte = true | DOM expose le texte = TRUE
```

L'arbre d'accessibilité de la peau Bulles portait donc le texte **deux fois**,
pour tout message, depuis toujours — invisible parce qu'aucun témoin ne jouait la
règle sur les deux peaux.

**Il fallait le corriger dans le lot de #7142, et pas après** : alimenter la
phase rend le libellé porteur du texte sur une rangée révélée, donc le critère
« le libellé OU le DOM, jamais les deux, jamais aucun » serait devenu VRAI sur
Focal et FAUX sur Bulles. Un lot qui livre son critère sur une peau et le brise
sur l'autre n'a pas livré, et la divergence entre peaux est elle-même le défaut
(dimension 6 : même geste, même effet).

Conséquence de forme, assumée : la bulle rend désormais
`<strong><span aria-hidden="true">…</span></strong>` — la MÊME forme que la
rangée plate depuis #7032. La balise qui porte le SENS reste `<strong>`/`<em>`,
jamais un `<span>` stylé.

**La règle générale** : une règle d'accessibilité qui ne s'applique qu'à une peau
n'est pas une règle, c'est un accident. Un témoin qui ne joue qu'une peau ne peut
pas le voir — c'est en jouant les DEUX que celui-ci est tombé.

## D-104 — Le badge d'icône compte les conversations non lues, jamais les messages ; la divergence avec iOS se documente, elle ne se corrige pas ici (2026-09-21, #7221)

D-L1 (`docs/superpowers/specs/2026-09-21-lecture-et-accuses-design.md` § 3) :
« le badge d'icône compte les CONVERSATIONS non lues (hors muettes), comme
l'app iOS et comme WhatsApp ». `countUnreadConversations`
(`src/lib/view/use-app-badge.ts`) l'applique à la lettre : une conversation
avec des non-lus pèse **1**, quel que soit son nombre de messages — le
compte se déduit d'`effectiveUnreadOf`/`effectiveFlagsOf`
(`lib/conversation-store.ts:121-129`), les mêmes lois que la Lentille, jamais
relues en parallèle (un second compte y désynchroniserait l'optimiste).

**La revue a trouvé que le code iOS de référence ne fait pas ce que D-L1 lui
prête** : `ConversationReadLedger.total(excludingOpen:excludingMuted:)`
(`packages/MeeshySDK/…/Store/ConversationReadLedger.swift:275-279`) **somme les
messages non lus**, pas les conversations — alors que son propre
doc-comment (`NotificationCoordinator.recomputeTotal:395-398`) dit
« comptent les AUTRES conversations ». Le relevé § 2 du document de chantier
répète l'affirmation du doc-comment, pas ce que le code fait.

**Cette divergence reste HORS PÉRIMÈTRE de W4** (web-v2 seul) : elle
engage la chaîne iOS (I1, #7222) et G3 (#7218, `aps.badge`), qu'un
arbitrage tranchera une seule fois pour les trois. Issue #7236, label
`décision-produit`, ouverte pour que I1 et G3 ne gravent pas chacun sa
propre formule avant que le porteur choisisse. web-v2 reste conforme à
D-L1 tel qu'écrit ; le jour où l'arbitrage change D-L1, ce fichier et
`use-app-badge.ts` se corrigent ensemble.

## D-105 — Le fil s'ouvre sur « — N messages non lus — », en couleur primaire ; deux bornes du signal restent ouvertes (2026-09-21, #7202)

D-L1/D-L2/D-L3 (`docs/superpowers/specs/2026-09-21-lecture-et-accuses-design.md`
§ 3) : le fil s'ouvre TOUJOURS sur le séparateur de non-lus quand il y en a,
le séparateur porte la teinte PRIMAIRE (jamais une couleur neutre), et
l'ouverture ne se rejoue pas au fil de la session (D-L2 gouverne l'ouverture,
pas les arrivées en direct — celles-ci restent la loi de `pin-to-bottom.ts`
et `unread-below.ts`, D-33). `unreadBoundaryOf` (`lib/view/unread-boundary.ts`)
compose une garde devant `firstUnreadBoundary` (S1, #7215) : zéro signal de
lecture ⇒ pas de frontière plutôt que « tout est non lu depuis toujours » —
un seul signal, quel qu'il soit, suffit à laisser la loi partagée trancher.
`threadOpenScrollDecision` (`lib/view/unread-separator.ts`) décide du saut ;
`<UnreadSeparator>` rend le libellé pluriel (`thread.unread-separator.one`/
`.other`) dans les sept langues.

**Deux bornes assumées, non corrigées dans ce lot, chacune une issue
compagnon (même milestone)** :

1. **#7272 — la fenêtre chargée.** `useMessages` ne sert que les 50 derniers
   messages ; si `firstUnreadId` n'y est pas, `threadOpenScrollDecision`
   replie sur l'ancrage en bas, SANS séparateur ni indication — cas nominal
   au-delà de ~50 non-lus. Trois familles de correctif possibles (pagination
   vers le haut, pastille ancrée en haut qui pagine au toucher, ou borne
   assumée à écrire explicitement dans D-L2) : aucune n'est mineure, un
   arbitrage produit tranche avant qu'un lot l'attaque.
2. **#7273 — le détail ne sert pas `currentUserJoinedAt`.** Une conversation
   JAMAIS ouverte n'a aucun `ConversationReadCursor` ; `GET
   /conversations/:id` ne sert alors aucun des trois signaux du curseur, et
   `currentUserJoinedAt` (le quatrième) est réservé à la liste (`GET
   /conversations`). Les quatre signaux manquent à la fois pour ce chemin de
   production légitime — la garde du zéro-signal (ci-dessus, #7215/#7202)
   est nécessaire pour ne pas fabriquer une fausse frontière, mais son effet
   de bord retire aussi le séparateur au cas où D-L2 sert le plus : une
   conversation réellement jamais ouverte.

Dimensions mûres : 6 (cohérence — même teinte primaire que le reste du
prisme de lecture), 7 (ouverture sans geste), 9 (sept langues), 11 (loi
UNIQUE `unreadBoundaryOf`/`threadOpenScrollDecision`, témoins dédiés).
Dimension 13 (complétude) restante : les deux bornes ci-dessus.

## D-106 — Les conversations en commun : un port BORNÉ, hors de la famille de la Lentille (2026-09-21, #7124)

**Aucune route à écrire.** `GET /api/v1/conversations?withUserId=<id>&limit=50` rend les conversations dont le LECTEUR **et** le sujet sont tous deux membres actifs (`services/gateway/src/routes/conversations/core-list.ts:193-210`) — le filtre qu'iOS appelle depuis le premier jour (`ConversationService.listSharedWith`, `UserProfileSheet.swift:325`). Le web ne fait que le nommer.

**Un module à part, `lib/api/shared-conversations.ts`, et pas `conversations.ts`.** La QUESTION n'est pas la même. `conversations.ts` sert LA Lentille : une liste paginée, persistée, revalidée par le temps réel, dont la clé de cache est la vie entière de l'écran d'accueil. Celle-ci est une lecture BORNÉE, portée par un SUJET. Sa clé est `['profile', 'shared-conversations', <id>]` — **hors** de la famille `['conversations']`, sans quoi une invalidation de la Lentille rejouerait autant de requêtes que de fiches visitées.

**Pas de pagination, et c'est une décision.** iOS demande cinquante lignes et s'arrête ; le nombre de conversations partagées avec UNE personne est petit par construction. Un « Charger plus » promettrait une profondeur que la question n'a pas.

**Trois écarts assumés avec l'onglet d'iOS.** (1) Le bouton « Envoyer un message » n'est pas repris — la fiche l'offre déjà (« Écrire », section CONNEXION), et iOS le répète parce que ses onglets se cachent l'un l'autre ; deux boutons pour un geste sont le doublon que D-11 interdit. (2) Une rangée est un `<Link>`, pas une zone tapable : la destination est une ADRESSE, qu'on doit pouvoir ouvrir dans un onglet et copier. (3) Aucune rangée grisée « interactions désactivées » — la fiche d'un compte bloqué ne monte pas la section du tout, là où iOS la rend à 35 % d'opacité ; un contenu à 35 % reste du contenu servi.

**L'APERÇU du dernier message n'est pas peint**, et c'est délibéré : il demanderait la descente du Prisme, l'horloge, la sourdine, les coches — la ligne de la Lentille entière. iOS ne peint que l'avatar et le nom.

**LE PLAFOND DE POIDS DU CHUNK MONTE, ET C'EST LE DÉCOUPAGE QUI A ÉTÉ REFUSÉ.** La section porte le chunk `user_profile` de **6,68 à 7,36 Ko** gzip -9 (7 535 o, mesurés par `scripts/measure-weight.mjs` sur l’arbre fusionné sur `origin/dev` 3248baddc6), au-delà du plafond de 7. La piste évidente — sortir la section en `lazy(() => import(…))` — a été **implémentée et mesurée** plutôt qu'écartée par principe : elle marche (`user_profile` retombe à 7,25 Ko, un `user-profile-conversations-<hash>.js` de 1,5 Ko apparaît) et **elle ne paie pas**. Cet écran EST DÉJÀ un chunk à la demande : le découpage n'économise rien à la première peinture et ajoute un **aller-retour** au moment où la section s'affiche. Sur le préréglage réseau du dépôt (`budgets.json § network.profile`, Fast 3G : 188 743 bps, 562,5 ms de latence), 0,68 Ko de plus dans un chunk déjà demandé coûte quelques millisecondes ; un aller-retour de plus en coûte cinq cents — **on dégraderait la dimension 2 au nom de la dimension 2**. Le plafond passe donc à **9** (7,36 arrondi au Ko supérieur, + 1 Ko de marge — la discipline que `profile` et `discover` suivent), et le champ `source` est **réécrit en entier** : son statut était `CIBLE — MESURÉE PAR #7083, NON ARBITRÉE`, c'est-à-dire la photographie d'un écran à TROIS sections, et elle nommait encore `lib/api/author-posts.ts` que le chunk ne porte plus (il vit dans `feed`) tout en ignorant les trois pièces extraites par #7152. **Un budget dont la justification décrit un état périmé est pire qu'un budget faux : il fait croire qu'il a été pensé.**

**Piège MESURÉ pendant l'essai de découpage, consigné pour qui le rejouerait** : un `import` **statique** vers le module différé — ici le squelette d'attente du `Suspense`, que l'hôte doit rendre — le **ramène dans le chunk de l'hôte** et laisse à sa place un **talon de 145 octets**. Le chunk apparaît dans le relevé, le gate voit deux fichiers, et rien n'a maigri d'un octet. Le squelette d'attente doit vivre chez l'HÔTE (`user-profile-states.tsx`), jamais dans le module qu'il attend.

**Le lecteur de la LIGNE n'est pas celui du GESTE.** `titleOf` a besoin d'un identifiant pour savoir qui est « l'autre » dans un direct ; lui passer la chaîne vide fait de la PREMIÈRE partie l'autre — mesuré au navigateur : la rangée de `/c/c-direct-kwame` portait « Vous ». L'écran résout donc `resolveViewer({ source, session })` — le site unique, fixtures comprises, que la Lentille et le fil emploient déjà — pour la RANGÉE, et garde `viewerId` (l'identité de COMPTE, `null` sans session) pour les gestes, qui ne doivent rien inventer. **Un témoin de pièce ne peut pas voir quelle identité l'ÉCRAN sert au composant** : c'est `check-profile.mjs` qui l'attrape, et il le mesure désormais explicitement.

## D-107 — « Vue unique » a une bascule dans le composeur de CONVERSATION, gatée sur une image en attente ; écart assumé avec iOS (2026-09-22, #7354)

**iOS ne l'offre pas en conversation.** `UniversalComposerBar+Toolbar.swift:37-40` ne monte `viewOnceToggleButton` que si `showViewOnce`, et `ConversationView+Composer.swift:215` le pose à `previewMode` : le composeur de prévisualisation de notification seul. Le web suivait cette règle (`compose-protection.ts`, `composer.tsx`) : la LOI savait composer `isViewOnce`, aucun contrôle ne l'armait. Conséquence mesurée à la recette du 2026-09-21 : W5 (`consumeViewOnceOptimistic`, #7224) n'avait AUCUN chemin d'entrée depuis le web.

**La forme retenue.** Le GESTE est celui d'iOS (`+Protections.swift:199-241` : capsule tapée, libellé « Vue unique » seulement une fois armée, teinte `indigo600` partagée avec « Flou », rang entre flou et effets) ; l'EMPLACEMENT diverge. La capsule n'existe que si une pièce jointe IMAGE est en attente — un texte marqué vue unique n'a aucun rendu qui le dise (loi 4) — et elle redescend si la dernière image part, et après chaque envoi. Glyphe : `eye` (Phosphor) pour `1.circle`, sans pendant dans le socle.

**`message:consumed` est MONOTONE côté client.** L'événement et la réponse REST de la consommation voyagent sur deux canaux ; `applyMessageConsumed` (`realtime-apply.ts`) n'abaisse jamais `viewOnceCount`, sans quoi un événement en retard ramènerait une vue brûlée à `veiled` et la rouvrirait. Seul le rollback optimiste de `view-once.ts` abaisse le compte.

**À trancher côté iOS, pas ici** : exposer la même bascule en conversation (parité inverse). Le miroir Kotlin natif est gelé (directive 2026-09-16) et ne reçoit rien.

## D-108 — L'échéance d'un éphémère part de la RÉCEPTION, et un seul chrome la rend pour tous les modes (2026-09-22, #7454)

Directive porteur 2026-09-22 : « les messages avec temps décompté ne doivent
décompter que lorsque l'utilisateur l'a reçu », et « il est important de
s'assurer que cette feature a un décompte en Script, Focal ou bulle **ou tout
autre affichage plus tard** ». Contrat du fil : #7451.

**La règle vit dans `packages/shared`, pas ici.** `ephemeralDeadline()`
(`utils/ephemeral-deadline.ts`) retient la plus PROCHE de l'échéance SERVIE
(`expiresAt` par lecteur sur REST, `message:countdown-started` sur le socket)
et de la RÉCEPTION locale + `ephemeralDuration`. Jamais la plus tardive : des
deux erreurs d'horloge possibles, une seule est acceptable — montrer le message
un instant de MOINS que promis, jamais un instant de plus.

**La réception, elle, ne peut pas y vivre** : c'est un état du client, et ses
deux chemins (`message:new`, le rendu du fil) n'ont aucun ancêtre React commun
— le socket vit hors de l'arbre. D'où un registre de module
(`lib/view/ephemeral-reception.ts`), borné à 1 000 entrées, première-vue-gagne.
Il est volontairement EN MÉMOIRE : un rechargement de page ne peut qu'ALLONGER
l'échéance locale, et c'est exactement ce que la règle refuse de retenir dès
que le serveur sert la sienne.

**Un seul chrome, et il est OBLIGATOIRE au type.** `ProtectionChrome`
(`components/protection-chrome.tsx`) rend le décompte ET la désignation de la
vue unique ; `FocalRow` et `Bubble` déclarent `ephemeralDeadline` en prop
REQUISE. Avant ce lot, chaque peau câblait son propre `EphemeralBadge` : un
mode ajouté demain aurait eu un fil complet, aucun décompte, et aucun témoin
rouge. `thread-modes-protection-chrome.test.tsx` énumère désormais
`ConversationReadingModeSchema.options` — table exhaustive au TYPE, re-croisée
à l'exécution parce que `bun test` n'applique aucun typage.

**`river` n'a pas de peau à lui, et c'est ce qui rend la garde utile** :
`ThreadModes` aiguille sur `usesFlatRow`, donc tout ce qui n'est ni `summary`
ni plat retombe sur `<Bubble>` — un mode neuf y retombera pareillement, avec le
chrome. `summary` porte l'autre moitié de la règle : un éphémère échu n'entre
pas dans le corpus qu'il résume, sans quoi un texte DÉRIVÉ garderait en vie,
sur le même écran, un message disparu du fil.

**Deux pictogrammes, parce que deux sens.** Le dépôt se contredisait comme iOS
(#7452) : `flame` désignait la VUE UNIQUE dans la liste et l'ÉPHÉMÈRE dans la
bulle. Le vocabulaire retenu est celui du COMPOSEUR — là où l'utilisateur
CHOISIT la protection : `flameFill` + rouge pour l'éphémère, `eye` + indigo
pour la vue unique. Le libellé suit jusqu'à la CLÉ : la désignation lit
`composer.viewOnce.label`, la chaîne même que la bascule affiche — une clé
jumelle porterait aujourd'hui les mêmes sept traductions et divergerait au
premier lot qui n'en relit qu'une.

**UNE horloge.** `secondClock` (`lib/view/interval-clock.ts`) existait déjà ;
`EphemeralBadge` ouvrait un `setInterval` par message affiché.

**Ce que ce lot NE touche PAS : le chemin d'ENVOI.** Faire parler les clients
en DURÉE plutôt qu'en échéance traverse le cliquet d'égalité de clés du
gateway (`socket-event-schemas.ts`, § `SendDoorRatchet`) et appartient à
#7451. Ici, seul ce qui REVIENT du serveur change.
Dimensions mûres : 4 (une horloge, zéro minuterie par bulle), 5 (sept langues,
`aria-label` « éphémère, disparaît dans N »), 6 (un pictogramme par sens, en
parité de vocabulaire avec le composeur), 11 (une règle, un chrome, un
registre), 13 (les cinq modes énumérés, et le suivant).

## D-109 — Le compteur d'un éphémère ne paraît que dans sa dernière minute, et sa destruction se voit (2026-09-22, #7468)

Précision du porteur, arrivée pendant que la PR de D-108 était en vol :
« l'éphémère est la flamme avec la configuration de durée par défaut ! Ce qu'il
faudrait c'est d'afficher le compteur de l'éphémère dans la conversation
uniquement quand on est déjà à 1 min et moins de sa destruction. Et sa
destruction doit avoir un effet visuel si on est dans la conversation au moment
de la destruction. »

**Le seuil est une loi PARTAGÉE, pas un réglage de peau.**
`ephemeralCounterVisible` (`@meeshy/shared/utils/ephemeral-deadline`) est la
suite de la règle d'échéance : l'une dit QUAND, l'autre à partir de quand on
l'ÉCRIT. iOS la reprend (#7467) ; un seuil recopié dans deux peaux divergerait
au premier ajustement. Elle gouverne DEUX choses que rien d'autre ne relie — ce
que l'œil voit, et ce qui s'abonne à l'horloge.

**Deux régimes, un seul à la fois.** Au-delà de la minute, aucune horloge ne bat
pour ce message : un SEUL `setTimeout` dort jusqu'au franchissement du seuil.
Sous le seuil, l'horloge partagée reprend. Le passage se fait tout seul — le
minuteur repose le reste, la fenêtre bascule, l'effet se rejoue dans l'autre
régime.

**L'œil est soulagé, jamais l'oreille.** Le libellé accessible donne TOUJOURS le
temps restant. Privé des chiffres, un lecteur d'écran n'aurait aucun autre
chemin vers l'échéance — et la flamme seule ne dit pas « dans douze minutes ».
C'est aussi pourquoi les deux écritures diffèrent : `countdownDigits` rend
`0:38` pour la puce, `formatRemaining` rend `38s` pour la voix.

**La phase de destruction est PURE et SANS ÉTAT, et c'est ce qui ferme la
course.** `destructionPhaseOf` (`lib/view/ephemeral-destruction.ts`) tranche
entre `visible`, `destroying` et `gone` en comparant l'échéance à MAINTENANT.
Entre l'échéance et le tic suivant de l'horloge, l'écran peut se rendre pour une
raison étrangère — une frappe, un défilement qui bouge le virtualiseur. Une
phase lue d'un ensemble alimenté par le seul rappel du chrome aurait coupé la
rangée net à ce rendu-là, sans effet : le défaut même qu'on corrige. **Et passée
la fenêtre, `gone` : on n'assiste pas à une destruction passée** — un fil
rouvert des heures plus tard ne rejoue pas la combustion de chaque éphémère
échu.

**L'annonce précède le retrait, des deux côtés.** `message:expired` annonce la
destruction sur-le-champ et ne retire la ligne du cache qu'après la fenêtre ;
sinon la rangée disparaîtrait d'une image à l'autre, par le chemin qui
deviendra le plus fréquent une fois #7451 fusionné. `forgetEphemeral` attend
lui aussi : oublier la réception tout de suite ferait repasser la puce « en
attente de réception » sur un message en train de brûler.

**L'effet se pose sur le nœud de RANGÉE**, jamais dans une peau : `thread-modes`
l'applique au `<div role="article">` qui enveloppe la rangée plate ET la bulle,
si bien qu'un mode ajouté demain l'a sans rien câbler — même doctrine que le
chrome de D-108.

**Le repli des voisins vient de la GRILLE**, pas d'un `max-height` deviné :
`grid-template-rows: 1fr → 0fr` anime une hauteur RÉELLE, que le
`ResizeObserver` du virtualiseur suit à chaque image. Les rangées suivantes
remontent à mesure, au lieu de sauter quand la ligne quitte la liste.

**`prefers-reduced-motion` : un fondu, et rien d'autre** — pas même le repli.
Un repli EST un mouvement, et c'est précisément ce que ce réglage demande
d'éviter ; la rangée garde donc sa place jusqu'au retrait.

Dimensions mûres : 4 (aucune horloge avant la dernière minute ; le repli suit le
virtualiseur au lieu de le bousculer), 5 (le temps reste dit à l'oreille,
`prefers-reduced-motion` honoré), 8 (la disparition se comprend), 13 (les cinq
modes, par le nœud commun).
