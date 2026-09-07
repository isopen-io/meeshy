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

`src/lib/routeur.tsx` rend ~**1,4 Ko** : paramètres de chemin typés depuis le
motif, paramètres de recherche, découpage par route, préchargement à
l'intention, restauration du défilement.

Perdu, et assumé : chargeurs de route, états « pending » de navigation,
validation des paramètres de recherche, routes imbriquées au-delà d'un niveau.
Les trois premiers sont couverts par TanStack Query, qui reste.

## D-4 · La palette est DÉRIVÉE de Swift, jamais recopiée — 2026-09-07 (#5445)

`packages/design-tokens/ios.css` est **généré** depuis `MeeshyColors.swift` et
`DesignTokens.swift`. Le web ne porte aucune valeur iOS écrite à la main.

Deux gates, qui prouvent deux choses différentes : `check:jetons` (le CSS n'a
pas dérivé de Swift) et `verifie:jetons` (**le navigateur peint bien ces
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

## D-12 · Le renommage du 2026-09-07 — `web-v4` devient `web-v3`, l'ancienne v3 devient `web-v3-old`

Directive du porteur : *« Décommissionne web-v3 en web-v3-old et nomme le web-v4
en web-v3, comme ça tout fonctionne avec ce qui sera développé. Ce sera la v3.1,
car le début de v3 qui était en développement a été juste annulé. »*

| avant | après | ce que c'est |
|---|---|---|
| `apps/web-v3` | **`apps/web-v3-old`** | l'ancienne refonte, **annulée**, jamais servie en production |
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
vers `web-v3-old`, pour que le déploiement en cours ne bouge pas d'un octet. La
nouvelle application recevra sa propre configuration Docker quand elle sera
prête à être servie — elle n'a pas encore de `Dockerfile`.

> **Piège de lecture, à connaître.** Les journaux — `tasks/lessons.md`,
> `tasks/*.md`, `docs/product/MeeshyWebV3Design/` — contiennent des centaines de
> chemins `apps/web-v3/...` qui désignent l'**ancienne** application. Les
> réécrire falsifierait ce qui était vrai au moment où ils ont été écrits ; ce
> sont des journaux, pas de la documentation. **Avant le 2026-09-07,
> `apps/web-v3` veut dire `apps/web-v3-old`.** Les chemins des documents de
> CONCEPTION, eux, ont été repointés — eux prescrivent, ils ne racontent pas.

**Un trou ouvert par le renommage, déclaré** : l'étape de lint bloquante de la
CI visait l'ancienne application. Le nom `@meeshy/web-v3` désignant maintenant
la nouvelle, qui n'a **pas de configuration ESLint**, l'étape a été retirée
plutôt que laissée à rendre une case verte qui ne linte rien. Le type-check
bloquant et les gates (jetons dérivés, poids) tiennent la place. **L'ESLint de
la v3.1 est un suivi.**
