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
# Cycle 163 — la porte était juste, et c'est l'argument qui la neutralisait

*2026-11-15. Branche `claude/exciting-planck-hg95mt`, repartie de la tête de
`dev` (`1348485794`).*

**Livré** : #18649 — le quatrième discriminant de la porte d'émission, et les
deux sites qui la contournaient par leurs arguments.

---

## Ce que le cycle a cherché d'abord, et pourquoi il l'a abandonné

Le relevé d'ouverture visait la direction que les six cliquets du contrat socket
ne gardent pas : **l'ÉMETTEUR contre le CONTRAT**. Les gardes de forme (#18070,
cycles 156–158) confrontent toutes le contrat au DÉCODEUR d'un miroir ; aucune
ne demande si la passerelle POSE ce qu'elle promet. Et le dépôt nomme lui-même
le trou restant :

> **Et le trou que le typage ne peut pas boucher** : un champ NOUVEAU, ajouté à
> un émetteur et à aucun contrat, redevient invisible au premier spread. Ce
> trou-là se ferme par un BALAYAGE, jamais par un type.

Un seul événement est gardé ainsi — `conversation-updated-declared-fields.ts`,
UN sur 176. La généralisation avait l'air d'être le lot.

**Mesure, par l'API du compilateur** (programme réel du gateway, 1 573 fichiers,
177 canaux déclarés résolus avec leurs propriétés) : 793 appels `.emit(`, dont
**531 sont le chokepoint générique de `serverEmit.ts`** — 3 × 177 par
construction, l'effacement que le dépôt a nommé et borné une fois. Restent
**262 sites réels, et ZÉRO champ non déclaré.**

Puis la question qui a tué la piste : *ce balayage aurait-il attrapé le cas
historique de sa propre classe ?* `_seq` — le curseur que trois clients lisent
et qu'aucun contrat ne déclarait (cycle 108) — a été retiré du contrat pour
voir. **Le balayage est resté vert** : `_seq` est estampillé par `emitWithSeq`,
donc à l'intérieur du chokepoint, précisément là où l'instrument ne voit rien.

> **Un cliquet qui ne peut pas attraper l'instance canonique de la classe qu'il
> annonce ne vaut pas mieux que pas de cliquet** — « une porte annoncée plus
> stricte qu'elle n'est vaut moins que pas de porte », et personne n'ira
> vérifier derrière. Le balayage a été JETÉ, pas gelé : c'est la décision du
> cycle 107, reprise pour la même raison.

Et une première rédaction, en expressions régulières, avait rendu **trois faux
positifs** sur `LocationHandler` avant d'être confrontée au fichier : elle
résolvait le PREMIER `const eventData` du fichier pour tous les sites, alors
qu'il y en a cinq, chacun ANNOTÉ — donc chacun déjà vérifié par le compilateur.
L'instrument a été refait sur l'API du compilateur avant toute conclusion.

## Ce que ce détour a mis sous les yeux

Parmi les 9 appels dont le NOM d'événement n'est pas un littéral, un seul ne
ressemblait à rien de connu :

```
src/services/together/togetherRelay.ts:89 | OTHER | never | arg=event as never
```

Un cast vers `never`. En ouvrant, la forme complète :

```ts
const emitTo = (io: TogetherIo | undefined, userIds: readonly string[], event: string, data: unknown): void => {
  io?.to(ROOMS.user(userId)).emit(event as never, data as never);
};
```

Et sa jumelle, trouvée par le même relevé :

```ts
// event is always SERVER_EVENTS.TYPING_STOP — cast bypasses union exhaustiveness check
emitter.emit(event as keyof ServerToClientEvents, data as any);
```

## Pourquoi aucun cliquet ne pouvait les voir

Les cycles 104, 105 et 108 ont fermé trois façons de contourner la porte
d'émission. **Les trois discriminants portent sur le RECEVEUR de `.emit(`** :

| forme fermée | ce que le balayage cherche | sur quoi |
|---|---|---|
| une interface qui RÉÉCRIT la signature | `emit(ev: string` / `emit: (ev: string` | le porteur |
| un CAST du porteur vers un type nu | idem | le porteur |
| le `Server` NU de socket.io | `import type { Server }` + `.emit(` | le porteur |

Les deux sites ci-dessus importent la **BONNE** porte — `ServerEmitIO`, dérivée
de `ServerToClientEvents`. `server-emit-door-sweep` était **vert**.

`as never` est assignable à tout : le couple `(événement, charge)` n'est
confronté ni sur le NOM ni sur la FORME. C'est exactement la liberté du `Server`
nu du cycle 108 — obtenue autrement, donc invisible. Les quatre émissions
d'« Ensemble » (`together:invited`, `together:started`, `together:synced`,
`together:ended`) voyageaient hors de tout contrat, **sur un canal qui n'a aucun
sérialiseur** pour rattraper un écart.

> La règle du cycle 105 — « chercher une forme fautive par son NOM de
> déclaration, c'est manquer tous les sites qui l'obtiennent autrement » —
> s'appliquait au porteur. Elle vaut identiquement de l'ARGUMENT. **Un cliquet
> qui garde un receveur ne dit rien de ce qu'on lui remet.**

## Le commentaire qui annulait sa propre contrainte

Le second site ÉNONÇAIT en prose ce que son cast empêchait de vérifier :
« event is always SERVER_EVENTS.TYPING_STOP ». C'est une AFFIRMATION, et le
dépôt exige qu'elle se mesure (cycle 94). Mesurée : **vraie** — `broadcastFn`
n'est appelé qu'une fois, avec `SERVER_EVENTS.TYPING_STOP` et un `typingEvent`
déjà annoté `TypingEvent`.

Une contrainte vraie n'a donc aucune raison de rester en prose : elle est
devenue le TYPE du paramètre, et le cast a disparu.

## Le discriminant, et le premier qu'il a fallu narrower

Premier relevé, sur « un `as` au premier niveau d'un argument de `.emit(` » :
**44 sites**, dont **40** de la forme `{ code, message } as CallError` — un
littéral casté vers le type que le canal DÉCLARE. Celui-là ne décorrèle rien :
`as` exige la comparabilité, et la porte vérifie le couple ensuite.

Les compter aurait mesuré la **popularité d'un idiome** au lieu d'une propriété.
Le discriminant ne retient donc que les cibles qui EFFACENT, ancrées en fin
d'argument de premier niveau :

| forme | compté ? | pourquoi |
|---|---|---|
| `event as never` / `data as any` | **oui** | plus aucune confrontation |
| `event as keyof ServerToClientEvents` | **oui** | corrélation effondrée (cycle 104) |
| `{ … } as CallError` | non | cast vers le type DÉCLARÉ |
| `{ id: id as any }` | non | cast de CHAMP, autre question |
| `as any` sur le 3e argument | non | ni canal ni charge |

**44 → 4** : deux sites, leurs deux arguments chacun.

## La réparation : narrower, jamais déplacer le cast

- `emitTo` prend `<E extends ServerEventName>(…, event: E, data: ServerEventPayload<E>)`
  et passe par `emitServerEvent` — la corrélation se vérifie au site d'appel, sur
  un nom CONCRET, et l'unique effacement sanctionné reste où le dépôt l'a borné.
- `broadcastFn` déclare `typeof SERVER_EVENTS.TYPING_STOP` et `TypingEvent`.

## Ce que la mesure dit, et ce qu'elle ne dit pas

**Les quatre charges d'« Ensemble » étaient JUSTES** contre leurs types déclarés :
`tsc --noEmit` rend `EXIT=0` une fois les casts retirés. La discipline tenait.

Ce lot ne répare donc **aucune panne** — et il faut le dire ainsi plutôt que de
laisser entendre une fuite : il rend VÉRIFIABLE ce qui ne l'était pas, et rien
n'aurait rougi le jour de la première divergence. C'est la famille
`conversation:join-error` (huit sites d'émission, deux consommateurs, jamais au
contrat), prise avant le défaut plutôt qu'après.

## Preuves

| preuve | résultat |
|---|---|
| ROUGE, sens 1 — `FEED_QUERY_KEY` non invalidée à la re-authentification | tombe |
| ROUGE, sens 2 — `CONVERSATION_CATEGORIES_QUERY_KEY`, gestionnaire direct INTACT | tombe pour le rejeu seul |
| sentinelle `['feed', 'new-count']` | reste NON invalidée |
| `socket.test.ts` | 57/57 |
| `tsc --noEmit` (`apps/web`) | EXIT=0 |
| suite complète, production seule | identique à `dev` |
| `tsc --noEmit` gateway, casts retirés | **EXIT=0** |
| ROUGE 1 — champ inconnu dans la charge | `TS2561 … 'endedAtt' does not exist in type 'TogetherEndedEventData'` |
| ROUGE 2 — couple DÉCORRÉLÉ (`ended` sous `invited`) | `TS2353 … 'reason' does not exist in type 'TogetherInvitedEventData'` |
| ROUGE 3 — autre canal via le rappel narrowé | `TS2345 … '"typing:start"' is not assignable to '"typing:stop"'` |
| ROUGE 4 — cast réintroduit en production | le cliquet tombe en NOMMANT `services/together/togetherRelay.ts` |
| `server-emit-door-sweep.test.ts` | **9/9** (6 avant) |
| suites touchées (`together`, `status`, manager, `serverEmit`, `typing`) | **51 suites, 1 189 témoins** |

## Suivi ouvert

| # | ce que c'est | état |
|---|---|---|
| #18644 | deux témoins de présence qui rougissent selon la charge ; bun 1.4.4 ≠ 1.3.14 | ouverte |
| #18499 | les 5 canaux montants sourds + les 3 noms hors contrat | inventoriés ; verdict de produit à rendre |
| #18342 | la jumelle descendante (6 événements qu'aucun client ne déclare) | ouverte |
| #18115 | les trois champs morts de `AttachmentUpdatedEvent` | ouverte |
| #18456 | le consommateur iOS de `AttachmentReactionUpdateEvent.userId` | ouverte — demande Xcode |

**Mesuré MÛR ce cycle, et c'est un résultat** : la direction émetteur → contrat
sur les CHAMPS. 262 sites réels, zéro champ non déclaré. Elle n'est pas pour
autant GARDÉE — le seul instrument qui la verrait ne voit pas à travers le
chokepoint, et aucun cliquet n'a été posé pour cette raison. Y revenir
demanderait de gouverner `emitWithSeq` et `emitServerEvent` eux-mêmes, ce qui
est un lot distinct.
