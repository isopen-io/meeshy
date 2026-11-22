# Cycle 218 — la PREMIÈRE connexion rattrape la même fenêtre qu'une coupure

Routine « amélioration continue du temps réel », 2026-11-22.
Suite directe du cycle 217 (#20336), dont le § Suivi posait la question qui
ouvre ce cycle.

Deux lots livrés, une même forme — **une liste nommée par la famille qui s'y
trouvait d'abord, et non par la propriété qu'elle porte** :

| lot | plateforme | issue |
|---|---|---|
| le démarrage à froid ne reprenait qu'UN des trois gestes | iOS / MeeshySDK | #20341 |
| un réglage changé ailleurs ne périmait QU'UNE des deux projections | web | #20349 |

PR : #20351.

---

## Lot 1 — iOS (#20341)

### Ce qui était vrai avant

`ConversationStoreSocketBridge.wireCatchUp` portait deux branches pour une
MÊME fenêtre :

| branche | gestes |
|---|---|
| `feeds.didReconnect` | `flushOutbox()` · `categoryStore.hydrate()` · `catchUpServedPreferences()` |
| première hydratation (#18916) | `catchUpServedPreferences()` **seul** |

`didReconnect` n'est émis que `if wasReconnect`, et `hadPreviousConnection`
naît `false`.

### Les quatre affirmations de l'issue, vérifiées une par une

L'issue se déclarait « risque instruit, pas incident constaté ». Chacune a été
mesurée AVANT d'écrire une ligne, et deux ont été **corrigées** :

| affirmation | verdict |
|---|---|
| les deux branches sont celles décrites, `didReconnect` muet au premier connect | **confirmée** — et le plan d'ouverture ne fabrique pas de faux reconnect (`forceReconnect()` = `suspendTransport()` + `establishTransport()`) |
| `flushOutbox` n'a aucun autre déclencheur au démarrage | **confirmée** — deux appelants dans tout le dépôt ; le retour d'avant-plan ne joue que `if returnsFromBackground`, dont le commentaire dit « *Cold launch also lands here with the flag false* ». L'autre outbox (`OutboxFlusher`, `drainOutboxAtBoot`, `OutboxRetryScheduler`) ne recouvre PAS celle-ci |
| les catégories ne sont jamais rejouées au démarrage | **CORRIGÉE** — `loadCategories` → `revalidateCategories` relit bien le serveur au lancement, mais AVANT l'entrée dans les rooms. C'est une **course**, pas une absence |
| la branche d'hydratation est un signal de première connexion | **CORRIGÉE** — c'est « la première liste non vide », qui vient du cache **DISQUE**, donc peut PRÉCÉDER la connexion ; et elle ne tire **jamais** pour un compte sans conversation (`CurrentValueSubject` + `.first { !$0.isEmpty }`) |

> **Une issue bien écrite peut être juste sur le défaut et fausse sur son
> mécanisme.** Les deux corrections ci-dessus ont changé la FORME du correctif,
> pas sa nécessité : sans la quatrième, `categories` aurait été posé sur un
> portier muet pour toute une population.

### Ce que ça coûtait

`flushOutbox` est le geste cher, parce que sa file est PERSISTÉE en SQLite
(« survives app kill ») : la fenêtre d'une session se rattrapait à la
SUIVANTE, ou jamais. Une sourdine posée hors ligne, l'app tuée, puis relancée
sur un réseau sain restait **locale** — l'appareil la montrait comme acquise,
le serveur ne l'avait jamais reçue, et les notifications continuaient
d'arriver.

### Le correctif, et le piège qu'il a fallu éviter

`ConversationWindowCatchUp` déclare la liste une fois ; les deux branches
l'itèrent par un site unique (`performCatchUp`). Le seul prédicat qui les
sépare, `requiresHydratedStore`, porte sa raison — et elle n'est pas de
confort : `applyServedPreferences` jette une conversation inconnue du store
**pendant que le filigrane avance** sur les lignes servies. Jouer ce geste trop
tôt ne le retarde pas d'un tour, il **perd** ses lignes jusqu'au prochain
changement.

**Le déclencheur fusionne DEUX sources, et ce n'est pas une ceinture
gratuite.** `handleTransportConnected` émet `didReconnect` et pose
`isConnected = true` dans deux `Task { @MainActor }` distincts : un `.connect`
re-émis sans `.disconnect` préalable laisse `removeDuplicates()` manger le
front montant alors que `didReconnect` part. **S'en remettre au seul front
aurait REGRESSÉ.** Le doublon d'une reconnexion nominale est coalescé par un
`debounce` de 250 ms, même motif que
`OutboxRetryScheduler.startObservingMutationEnqueued`.

> **Remplacer un déclencheur par son sur-ensemble n'est sûr que si le
> sur-ensemble contient vraiment l'ancien.** Ici `didConnect ⊃ didReconnect`
> est vrai du MODÈLE et faux du CODE, pour une raison de deux hops MainActor.
> La question à poser à tout élargissement de déclencheur : *l'ancien signal
> est-il DÉRIVABLE du neuf, ou seulement conceptuellement inclus ?*

### Le cliquet

`onConnect(storeHydrated:)` et `onFirstHydration(socketConnected:)` sont deux
fonctions PURES, et le cliquet mesure ce qu'aucun témoin de comportement ne
peut voir : **chaque geste part exactement une fois dans les DEUX ordres**
d'arrivée des déclencheurs — union = `allCases`, intersection vide. Un
quatrième geste ne peut donc pas naître dans une seule branche.

### Preuve

`sdk-tests.yml` par `workflow_dispatch`.

**Le ROUGE n'est PAS prouvé par mutation**, et il faut le dire : aucune chaîne
Swift n'est joignable depuis un conteneur Linux (`swift: command not found`).
Les quatre témoins de comportement sont écrits sur une activation qui ne voit
**jamais** `didReconnect` — le seul rang où l'ancienne forme et la nouvelle
rendent des verdicts différents (leçon 261 : un témoin de rang s'écrit sur un
rang AUTRE que le premier) — et deux ne compilent pas contre l'ancienne
signature, qui n'a pas de `didConnect`.

---

## Lot 2 — web (#20349)

### Comment il a été trouvé

En instruisant la portée de `UNQUEUED_FAMILY_VERDICT`, dont l'ensemble calculé
se limite à trois préfixes sur **cinquante**. Sa première affirmation est
VRAIE (recalculée : 22 noms − 19 de `DRAINED_EVENT` = ses 6 entrées) ; c'est la
seconde — « ce sont les seules familles où la question se pose » — qui est
fausse. Le balayage des 44 autres préfixes a rendu **un** écart réel.

### Le défaut

`user:preferences-updated { userId, category }` était bien reçu et bien routé,
et périmait UNE clé pour un document à sept catégories et **deux**
projections. `['me','circle-notify']` est un **FRÈRE** de
`['me','app-preferences']`, pas un descendant : l'invalidation par préfixe ne
l'atteignait jamais.

> **Un appareil CONNECTÉ avait le même écran faux.** Ce n'est donc pas un
> défaut de rattrapage hors ligne — l'événement arrive, il est routé, et il
> périme la clé voisine. Passer « qui est prévenu quand je publie une story »
> de Proche à Sang laissait l'autre appareil afficher Proche jusqu'à **30
> minutes**, sur un réglage de confidentialité.

Second volet : `refetchOnReconnect` ne relit qu'une requête **STALE**, le cache
est PERSISTÉ, et aucune des deux clés n'était dans `CATCH_UP_FAMILIES`. Une clé
à 30 min revient d'un démarrage à froid *fraîche et périmée à la fois*.

### Ce que le doc-comment disait

`app-preferences.ts` justifiait sa fenêtre de 30 min **par** l'événement — « le
réglage arrive à la relecture qui suit, sans attendre la fenêtre ». Vrai d'un
appareil connecté dont la BONNE clé est périmée ; faux ici des deux côtés.

> **Un doc-comment qui justifie une fenêtre par un mécanisme est une
> AFFIRMATION sur ce mécanisme.** Celui-ci était juste quand il a été écrit,
> pour la seule clé qui existait alors.

### Un témoin gelait la lacune

« périme les réglages d'application, **RIEN D'AUTRE** » — sans aucune raison
écrite pour ce « rien d'autre ». Troisième fois en deux cycles que cette forme
exacte apparaît (#20336 en avait retourné deux). Il est **retourné** : son
« rien d'autre » ne porte plus que sur ce qui ne projette pas le document.

### Le discriminant du cliquet est la SOURCE SERVANTE, pas la clé

Un témoin de comportement atteste les clés qu'il NOMME ; une troisième
projection ajoutée demain par un lot qui parlera d'autre chose ne serait nommée
nulle part. Le cliquet balaie donc les modules qui lisent
`GET /me/preferences` et exige que chaque `queryKey:` qu'ils posent appartienne
à l'ensemble. Il prouve d'abord qu'il balaie bien quelque chose — une garde
négative dont le relevé rend `[]` reste verte.

### Preuve du ROUGE (par mutation, à chaque fois)

| mutation | ce qui tombe |
|---|---|
| le gestionnaire ne nomme qu'une clé (production d'avant) | **2 rouges / 19 verts** — les deux témoins qui nomment la clé sœur, et eux seuls |
| les deux clés retirées de `CATCH_UP_FAMILIES` | **5 rouges / 50 verts** — les témoins de rattrapage, et eux seuls |
| une TROISIÈME projection ajoutée sans rejoindre l'ensemble | le cliquet de source, **seul** |
| le gestionnaire renomme une clé au lieu d'itérer | le cliquet de source, **seul** |

### Gates

| gate | résultat |
|---|---|
| `bun test src/lib/api/` | **4693 verts / 0 rouge** (4679 avant) |
| `tsc --noEmit` (web) | **0** |
| `bun run build` | OK |
| `measure-weight.mjs` (budgets de morceaux) | **exit 0** — `me-keys.ts` reste sans dépendance, le morceau `realtime` ne grossit pas |

---

## Ce que le cycle a mesuré SANS le corriger

**Le vrai discriminant d'un verdict `reload-serves-truth` côté web n'est pas le
`staleTime` seul, mais l'appartenance à `CATCH_UP_FAMILIES`** — et ce mécanisme
n'est nommé dans aucune note de `unqueuedFamilyVerdict.ts`. C'est exactement
par ce chemin que #20349 est passé. Issue : **#20353**.

## Suivi

- **#20352** — Android : ce que la première connexion rattrape n'est pas relevé
  (`ChatResyncController`). La question a rendu un défaut sur le web ET sur
  iOS ; trois fois la même cause ne fait pas d'Android un défaut certain, mais
  fait de son silence une mesure manquante. **Le piège de transposition y est
  nommé** : si un écran charge ses données à l'ouverture indépendamment du
  socket, la bonne réponse est « pas de défaut », pas un correctif transposé.
- **#20353** — la portée de `UNQUEUED_FAMILY_VERDICT` (trois préfixes sur
  cinquante) et son discriminant documenté.
- iOS et Android ne sont pas relevés sur le lot 2 : la fenêtre y dépend des TTL
  de `CacheCoordinator`, non mesurés.
- `pack:installation-updated` n'a **aucun écouteur** dans `apps/web` alors
  qu'iOS et Android en ont un (relevé au passage, à instruire séparément : un
  événement sans lecteur est une autre question que celle de la table).

---

## Lot 3 — web : un pack acheté ou GAGNÉ ailleurs n'atteignait pas le navigateur (#20354)

Trouvé au même balayage que le lot 2, et laissé de côté comme « marginal » ;
instruit ensuite, il ne l'était pas. `pack:installation-updated` n'avait
**aucun écouteur** sur le web, quand iOS et Android en ont un. La seule
occurrence du dépôt était un COMMENTAIRE de `stickers/library-sync.ts` qui
CITAIT le traitement d'Android pour justifier la conception de son VOISIN.

**Le rang qui compte est le pack GAGNÉ** : un achat garde un geste local qui
périme les caches, un octroi par trophée n'en a aucun — c'est le seul cas où
le navigateur ne peut rien savoir sans l'événement.

Décision inverse de celle de son voisin, et c'est raisonné : la charge ne
porte ni prix, ni compteur d'installations, ni état d'offre, et surtout
**aucun `userId`** — donc la garde de compte de `library-sync.ts` est
impossible. Les deux sens d'erreur ne se valent pas : périmer sur un
événement étranger coûte une relecture faite sous ses propres jetons ;
ÉCRIRE poserait le pack d'autrui dans mon étagère.

| gate | résultat |
|---|---|
| `bun test` (suite web COMPLÈTE) | **35 144 verts / 1 rouge** — la garde méta `act-leak-guard`, qui lance un `bun test` IMBRIQUÉ, sensible à l'environnement et sans rapport avec le lot |
| `tsc --noEmit` | **0** |
| `bun run build` | OK |
| ROUGE par mutation | 3 fois, chacune ne faisant tomber que le témoin qui la nomme |

## L'incident de méthode du cycle, et il vaut plus que les trois lots

En gatant le lot 3, trois gates ont rougi sur un `dev` PROPRE : 43 rouges,
8 erreurs de type, build en échec. J'ai bisecté les six commits de `dev`,
proprement, et le bisect a DÉSIGNÉ #20327 — reverser ses seuls fichiers
rendait le build vert.

**C'était faux.** `packages/shared` avait bougé sur `dev` et mon `dist` datait
du début de session. Reconstruire `shared` : `tsc` 8 → 0, build vert, suite
43 rouges → 1.

> Un bisect ne distingue pas « ce commit est fautif » de « ce commit est le
> premier à EXIGER l'artefact que je n'ai pas reconstruit ». Les deux rendent
> la même courbe, et retirer le code neuf retire la DEMANDE du type neuf —
> l'innocent signe des aveux.

Trois signaux étaient là et ont été mal lus : un build VERT deux heures plus
tôt au même endroit ; des erreurs nommant un symbole NEUF comme absent d'un
type (la signature exacte d'un `dist` en retard, que le `CLAUDE.md` racine
décrit mot pour mot) ; et une CI de `dev` qui ne contredisait rien parce
qu'elle ne conclut JAMAIS — chaque run y est annulé par le groupe de
concurrence. L'absence de contradiction a été lue comme une confirmation.

Leçon : `tasks/lessons/2026-11-22-un-bisect-confirme-un-faux-coupable-quand-l-artefact-perime-est-la-cause.md`.

## Deux constats d'infrastructure, qui ne sont le défaut de personne

- **La CI de `dev` ne conclut jamais.** Les six derniers runs `CI` sur `dev`
  sont tous `cancelled` : les fusions arrivent plus vite que la CI ne tourne,
  et `cancel-in-progress` tue chaque run. Personne ne sait donc si `dev` est
  vert, et la question « la CI reproduit-elle mon rouge ? » n'a plus de
  réponse — alors que c'est le discriminant que le dépôt prescrit.
- **La file des runners macOS est bouchée.** 37 runs en attente, 4 actifs, le
  plus ancien du **2026-11-11**. Aucun lot iOS n'est prouvable tant qu'elle ne
  se vide pas — ce qui a laissé le lot 1 entrer dans `dev` sans preuve de
  compilation, l'auto-merge n'attendant pas un `workflow_dispatch`.
