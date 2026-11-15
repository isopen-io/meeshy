# Cycle 163 — quatre familles rattrapées sur soixante-quatorze écoutées

*2026-11-15. Branche `claude/exciting-planck-x4li15`, repartie de la tête de
`dev` (`134848579`).*

**Livré** : #18641 — le rejeu de reconnexion du web couvre enfin le fil social,
le rail des stories et les catégories de conversation.
**Ouvert en chemin** : #18644 — deux témoins de présence qui rougissent selon la
CHARGE de la suite, et la divergence de version de bun entre le conteneur et la
CI.

---

## Le relevé qui a ouvert le cycle

Les cycles 104 à 162 ont bâti cinq cliquets autour du CONTRAT socket — les noms,
les émetteurs, les lecteurs, la parité des trois plateformes, les champs morts.
Tous interrogent la même question : *ce qui est déclaré est-il émis et lu ?*

Aucun n'interroge celle-ci : **ce qui est lu EN DIRECT est-il rattrapé APRÈS une
coupure ?**

`onAuthenticated` (`apps/web/src/lib/api/socket.ts`) est le site qui y répond. La
passerelle émet `authenticated` à chaque (ré)authentification ; le socket ne
rejoue rien ; le rejeu périme donc les familles TanStack dont les événements de
l'intervalle n'ont atteint aucun gestionnaire. Mesuré :

| | compte |
|---|---|
| événements serveur écoutés par la connexion | **74** |
| familles périmées au rejeu | **4** |

Les quatre : conversations, cloche, amitié, favoris. Trois manquaient.

| famille | clé | événements |
|---|---|---|
| fil social | `FEED_QUERY_KEY` | les 10 `post:*` |
| rail des stories | `STORY_TRAY_QUERY_KEY` | les 6 `story:*` |
| catégories de conversation | `CONVERSATION_CATEGORIES_QUERY_KEY` | les 4 `category:*` |

## Pourquoi rien ne les rattrapait ailleurs

Trois replis existent, et aucun ne couvre le cas :

- `refetchOnReconnect: true` suit `navigator.onLine`. Une coupure du **seul**
  socket — redémarrage de la passerelle, déploiement — ne le fait pas basculer :
  le navigateur n'a jamais cessé d'être « en ligne ». Le doc-comment de
  `onAuthenticated` écrivait DÉJÀ ce raisonnement, pour les messages.
- `refetchOnWindowFocus` exige de quitter la fenêtre et d'y revenir.
- `staleTime: 30_000` périme sans rejouer : une requête **montée** n'a alors
  aucun déclencheur.

D'où le discriminant qui borne le lot, et il est la seule chose à retenir de sa
géométrie : **ces trois surfaces sont celles qu'on peut REGARDER pendant la
coupure.** Les autres caisses de cartes — favoris, auteur, communauté, hashtag,
commentaires — se rejoignent par une navigation, donc par un montage, donc par
une relecture. Elles se soignent seules. Celles-ci restent montées et fausses.

Aggravant : `gcTime` est à 24 h et le cache est persisté en `localStorage`, donc
la caisse stale survivait à un rechargement de page.

## Ce n'était pas un arbitrage — c'était une parité perdue

Le lot aurait pu se défendre comme un choix de produit (« faut-il rattraper le
fil ? »). Il n'en est pas un : iOS rattrape les trois sur le même signal, depuis
toujours.

| surface | site iOS |
|---|---|
| fil | `FeedViewModel+Socket.swift` → `socialSocket.didReconnect` (rts-01) |
| rail | `StoryViewModel.swift:568`, delta depuis le curseur (rts-02) |
| catégories | `categoryStore.hydrate()`, gardé par `test_didReconnect_rehydratesCategoryStore` |

`apps/web` suit l'interface iOS. La question « quelles surfaces rattraper ? »
avait donc déjà une réponse écrite, testée, dans le dépôt — dans l'autre langue.

> **Avant d'arbitrer une question de produit sur une plateforme, chercher si la
> plateforme de référence l'a déjà tranchée.** Un arbitrage rendu deux fois en
> deux langues produit une divergence que personne ne lit comme une divergence.

## La classe de défaut, et le lot l'a presque rejouée

La liste des familles rattrapées est une ÉNUMÉRATION, et chacune y a été ajoutée
par le lot qui en avait besoin — #6288 la cloche, #6321 l'amitié, #7378 les
favoris. C'est le biais que le dépôt nomme déjà : **on déclare ce qu'on vient
d'ajouter, pas ce qui était déjà là.**

Ce qu'il faut consigner, c'est que la première énumération de CE lot s'est
arrêtée à DEUX familles. Elle cherchait « quelles caisses de cartes
manquent ? » — la forme que le défaut AVAIT. Les catégories n'en sont pas une :
`['conversation-categories']` est une racine à part, servant des onglets, sur le
même écran monté. Elles n'ont été trouvées qu'en relisant ce que la connexion
écoute, événement par événement.

> C'est la leçon 261 vue de l'intérieur : **une énumération porte deux
> affirmations, et la seconde — « ce sont tous les sites » — ne se vérifie
> jamais en cherchant ce qui RESSEMBLE à ce qu'on a déjà trouvé.** Il faut
> repartir de la source (ici : les 74 `socket.on`), pas du premier défaut.

## La forme du correctif

Trois invalidations, et rien d'autre.

- **Le fil s'invalide en `exact`.** `['feed', 'new-count']` est un ENTIER qui
  partage la racine `['feed']`, et TanStack compare par PRÉFIXE. Règle #6974 —
  nommer la famille, jamais balayer la racine ; `card-caches.ts` déclare déjà
  `exact: true` pour ce même voisinage.
- **Le fil des Réels reste dehors**, par décision écrite : `frozen: true`,
  « son ordre est gelé, il ne se relit ni au focus ni à la reconnexion » (D-66).
- **Poids nul** : `feed-realtime.ts` tire déjà `./feed` et `./stories`.

## Deux dimensions mesurées MÛRES, et il faut le dire

Deux balayages lancés avant celui-ci n'ont rien rendu :

- **la file hors ligne du serveur** : les 16 `eventType` de `DRAINED_EVENT` ont
  tous un producteur d'entrées, vérifiés un par un. La correspondance est TOTALE
  au compilateur et vivante en production.
- **le drain** : quatre refus en cascade (adressabilité, appartenance, liveness,
  diffusabilité), isolés par entrée, journalisés par entrée. Rien à y reprendre.

## Ce que le cycle a trouvé À CÔTÉ, et qui coûtera plus cher que le lot

Le correctif tient en trois lignes ; sa VÉRIFICATION a pris l'essentiel du
cycle, et c'est elle qui a rendu le vrai résultat.

La suite complète de `apps/web` n'est pas verte dans le conteneur, et surtout :
**ajouter DEUX témoins — fussent-ils `expect(1).toBe(1)` — fait rougir deux
témoins de pastille de présence dans d'AUTRES fichiers.**

| ce qui est joué (bun 1.3.14, la version de la CI) | verdict |
|---|---|
| `dev` seul, suite complète | 1 fail |
| `dev` **+ deux témoins triviaux** dans `socket.test.ts` | **2 fail de plus** |
| ce lot, **production seule**, témoins au niveau de `dev` | **identique à `dev`** |
| `bun test src/components` seul, sans une ligne du lot | **les 2 mêmes fail** |
| les 225 premiers fichiers / les 295 suivants, séparément | 0 fail |

**Les deux moitiés passent, le tout échoue.** Ce n'est donc pas « un fichier
fautif joué avant » : c'est une dépendance à la CHARGE. `presenceStore` est un
singleton de module, `livePresenceOf` lui donne la priorité sur la charge servie
(#10571, règle voulue), et `bun test` joue les 2520 fichiers dans UN SEUL
processus. Ouvert en **#18644**.

> **La troisième ligne du tableau est la seule qui exonère le lot, et elle a
> coûté une suite complète de plus.** Devant une CI rouge sur des témoins qu'on
> n'a pas touchés, la question n'est pas « ai-je cassé ça ? » mais **« que
> rougit mon changement de PRODUCTION, témoins neutralisés ? »** — la réponse
> sépare le défaut du déplacement de seuil, et rien d'autre ne le fait.

Et un corollaire de méthode qui vaut pour tout ce dépôt : **un balayage par
bissection suppose que l'ordre d'exécution est celui qu'on croit.** Les 225
premiers fichiers « alphabétiquement avant » le témoin fautif sont verts —
`bun test` n'ordonne pas alphabétiquement. Une bissection menée sur un ordre
supposé mesure autre chose que ce qu'elle annonce.

## La divergence de version, qui est un piège armé

Le conteneur des sessions cloud livre **bun 1.4.4** ; `ci.yml` épingle
**1.3.14**. Le `CLAUDE.md` demande que les deux ne divergent jamais, « so local
and CI never diverge ».

Sous 1.4.4, `act-leak-guard.test.ts` échoue — « avec la garde, l'innocent
passe » rend **0 pass au lieu de 3** : la garde des `act()` abandonnés, posée au
#9509 précisément pour empêcher qu'un témoin dépassé rougisse les fichiers
SUIVANTS, **ne protège plus du tout**. Sous 1.3.14 elle passe.

> Un gate qui protège contre une cascade et qui cesse de protéger ne se signale
> pas comme un gate cassé : il se signale comme **les fichiers suivants qui
> rougissent**. C'est-à-dire comme le défaut qu'il devait masquer, attribué à
> quelqu'un d'autre.

## Preuves

| preuve | résultat |
|---|---|
| ROUGE, sens 1 — `FEED_QUERY_KEY` non invalidée à la re-authentification | tombe |
| ROUGE, sens 2 — `CONVERSATION_CATEGORIES_QUERY_KEY`, gestionnaire direct INTACT | tombe pour le rejeu seul |
| sentinelle `['feed', 'new-count']` | reste NON invalidée |
| `socket.test.ts` | 57/57 |
| `tsc --noEmit` (`apps/web`) | EXIT=0 |
| suite complète, production seule | identique à `dev` |

## Suivi ouvert

| # | ce que c'est | état |
|---|---|---|
| #18644 | deux témoins de présence qui rougissent selon la charge ; bun 1.4.4 ≠ 1.3.14 | ouverte |
| #18499 | les 5 canaux montants sourds + les 3 noms hors contrat | inventoriés ; verdict de produit à rendre |
| #18342 | la jumelle descendante (6 événements qu'aucun client ne déclare) | ouverte |
| #18115 | les trois champs morts de `AttachmentUpdatedEvent` | ouverte |
| #18456 | le consommateur iOS de `AttachmentReactionUpdateEvent.userId` | ouverte — demande Xcode |
