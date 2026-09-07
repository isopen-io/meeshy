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
