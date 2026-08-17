# Cycle 61 — trois trames pour un message, trois relectures complètes

## 1. D'où vient la piste

Directement de la piste n°1 du cycle 60, et par un détour instructif. La
question posée était « Android porte-t-il la garde monotone du cycle 60 ? ».
Réponse : **il n'en a pas besoin** — `ConversationListViewModel` n'applique
aucun payload au cache de liste, ses trois abonnements temps réel appellent tous
`refreshSilently()`, une relecture serveur complète. Le serveur reste la source
de vérité de la ligne, donc aucun désordre de diffusion ne peut la faire
reculer.

C'est la réponse à la question posée. Ce n'est pas la fin de l'examen : **la
propriété qui immunise Android est exactement celle qui le ruine.**

## 2. Le défaut — le prix de l'immunité, payé trois fois

### 2.1 Un message entrant vaut TROIS trames

`MessageHandler.broadcastNewMessage` (gateway), pour **un seul** message, émet
vers un même destinataire :

| trame | ligne | destination |
|---|---|---|
| `message:new` | `MessageHandler.ts:1293` | room de conversation |
| `conversation:updated` | `:1353-1399` | room personnelle de chaque participant |
| `conversation:unread-updated` | `:1425` (`_updateUnreadCounts`) | room personnelle de chaque destinataire |

Les trois sortent du **même appel**, pour le **même** message. Ce n'est pas une
course, c'est le contrat : chacune porte une facette (le message, le rang de la
ligne, la pastille).

### 2.2 Android répondait à chacune par une relecture COMPLÈTE

```kotlin
launch { messageSocketManager.unreadUpdated.collect { refreshSilently() } }
launch { messageSocketManager.messageReceived.collect { refreshSilently() } }
launch { messageSocketManager.conversationUpdated.collect { refreshSilently() } }
```

Trois collecteurs indépendants, aucune coordination. Et `refreshSilently()` →
`repository.refresh()` → `ConversationCacheSource.revalidate()` n'est pas une
mise à jour ciblée :

```kotlin
override suspend fun revalidate() {
    when (val result = apiCall { conversationApi.list() }) {   // liste ENTIÈRE
        is NetworkResult.Success -> persist(result.data)
        …
```

et `persist` ouvre une transaction Room `upsertAll` + `deleteNotIn` sur **toute**
la table, dont la ré-émission repeint la liste entière.

**Coût réel : ×3 par message reçu**, en requêtes réseau, en écritures base et en
recompositions — pour un résultat que la **première** des trois portait déjà
intégralement (la réponse `list()` contient l'aperçu, le rang et le compteur).

Dans un groupe actif, l'écran de liste ouvert à 10 messages/minute : **30
`GET /conversations` complets par minute**. C'est la classe PHASE 2
« unnecessary polling / excessive network requests » et PHASE 9 (batterie,
réseau, base) — sur le chemin le plus fréquenté du produit.

### 2.3 Le défaut second, dans le même geste

Les `SharedFlow` de `MessageSocketManager` sont `MutableSharedFlow(replay = 0,
extraBufferCapacity = 64)`, donc `onBufferOverflow = SUSPEND` par défaut. Un
collecteur dont le corps **suspend sur une requête réseau** est un collecteur
lent : au-delà de 64 trames en attente, c'est l'**émetteur** — la dispatch des
trames socket — qui se met à suspendre. Le chemin de réception entier pouvait
donc être freiné par les relectures qu'il déclenchait lui-même.

## 3. Le correctif — une pompe qui fusionne

Un `Channel<Unit>(Channel.CONFLATED)` entre les collecteurs et la relecture.
Les trois collecteurs ne font plus qu'un `trySend(Unit)` ; une seule pompe
consomme :

```kotlin
launch { for (coalescedRequest in refreshRequests) { refreshSilently() } }
launch { messageSocketManager.unreadUpdated.collect { requestRefresh() } }
launch { messageSocketManager.messageReceived.collect { requestRefresh() } }
launch { messageSocketManager.conversationUpdated.collect { requestRefresh() } }
```

`CONFLATED` ne retient que la **dernière** demande en attente : une rafale
arrivée pendant une relecture en vol se fond en **une** relecture de queue.
Une rafale de N trames coûte donc **au plus 2** relectures, jamais N.

### 3.1 Les deux bornes du contrat, dans les deux sens

Ce sont elles qui distinguent ce correctif d'un `debounce`, et il fallait les
deux :

- **Rien n'est retardé.** Le canal est vide au repos : une trame isolée est
  servie **immédiatement**, sans fenêtre d'attente. Un `debounce(300)` aurait
  divisé le trafic tout aussi bien — en payant chaque message d'un retard
  d'affichage, ce que les principes Instant App interdisent. La fusion ne coûte
  du délai qu'à ce qui était déjà redondant.
- **Rien n'est perdu.** Toute trame arrivée pendant une relecture laisse une
  demande en attente, donc une relecture **suivante** la couvrira — la réponse
  en vol avait pu être construite par le serveur avant elle. C'est pourquoi la
  fusion produit 2 et non 1 : le second passage n'est pas du gaspillage, c'est
  la correction de la fenêtre.

`trySend` ne suspend jamais : les collecteurs rendent la main aussitôt, ce qui
ferme aussi le défaut second (§2.3) — la dispatch socket ne peut plus être
freinée par une requête réseau.

### 3.2 Le point de défaillance que la pompe crée, et sa garde

Trois collecteurs indépendants portaient chacun leur `try/catch` (via
`refreshSilently`). Une pompe **unique** transforme ce filet en point de
défaillance unique : une exception qui s'en échapperait ne priverait plus une
famille de trames de sa relecture, mais **toutes**, définitivement. La garde
existait déjà — le correctif ne l'a pas ajoutée — mais elle n'était pas
critique avant, et elle l'est maintenant. Un témoin la verrouille (§4).

## 4. Témoins livrés

Trois, dans `ConversationListViewModelTest`, dont un discriminant.

| témoin | ce qu'il tient |
|---|---|
| `the_three_socket_frames_of_one_incoming_message_collapse_into_a_single_trailing_refresh` | la fusion elle-même |
| `an_isolated_socket_frame_still_refreshes_the_list_without_any_delay` | la borne « rien n'est retardé » — barre la route à une correction par `debounce` |
| `a_failed_refresh_does_not_stop_the_next_socket_frame_from_refreshing` | la garde de §3.2 |

Le premier tient une relecture **en vol** (`CompletableDeferred` rendu par
`coAnswers`), émet les deux trames jumelles pendant ce temps, et mesure deux
fois : pendant (doit rester à 1) puis après libération (doit valoir 2, jamais 1
— rien n'est perdu — jamais 3).

**ROUGE prouvé par lecture du chemin sur `main`** : les deux collecteurs
jumeaux y appellent `refreshSilently()` directement, sans passer par la pompe,
donc le compteur vaut **3** au premier point de mesure là où le témoin exige 1.

## 5. Gates — et la limite honnête de ce cycle

| Gate | Résultat |
|------|----------|
| `assembleDebug` + `testDebugUnitTest` | **délégué à la CI `android.yml`** — voir ci-dessous |
| Portée | Aucun fichier hors `apps/android/feature/conversations` (+ une note de plan) |
| `allWarningsAsErrors` | absent du projet — vérifié, aucune configuration `-Werror` |

**La suite Android n'est pas exécutable dans ce conteneur, et ce n'est pas une
négligence : c'est la raison d'être du workflow `android.yml`.** Son en-tête le
documente — `dl.google.com` est refusé par la politique de sortie des
conteneurs de la routine, donc `sdkmanager` ne peut pas s'amorcer et aucune
tâche Gradle ne tourne. Vérifié deux fois ce cycle, hors ligne puis en ligne :

```
Plugin [id: 'com.android.application', version: '8.13.0'] was not found
  Searched in: Google, MavenRepo, Gradle Central Plugin Repository
```

La CI est donc le gate réel, et elle est déclenchée par ce diff
(`paths: apps/android/**`). **Le cycle n'est pas déclaré vert avant qu'elle ne
le soit** — c'est la condition de merge, pas une formalité.

## 6. Ce qui n'est PAS livré

- **La garde monotone Android** — inutile aujourd'hui (§1) et elle le restera
  tant que le relais `CacheCoordinator` n'existe pas. Portée en **note dans le
  plan de portage** (`apps/android/tasks/audit/part-17.md`), comme le cycle 60
  le demandait explicitement : « le jour où ce relais existera, il naîtra avec
  le défaut ». La note y ajoute la fusion de ce cycle, pour la même raison.
- **iOS / web** — non touchés. Le défaut est propre à la stratégie « relecture
  serveur » qu'Android est seul à suivre.

## 7. Pistes pour le cycle 62

1. **La relecture complète est-elle le bon outil, même fusionnée ?** Ce cycle
   divise le coût par trois sans le questionner : `conversationApi.list()` reste
   une liste ENTIÈRE là où le payload de la trame porte déjà l'aperçu, le rang
   et le compteur. La vraie cible est le relais `CacheCoordinator` du plan
   part-17 (mutation locale ciblée) — gros morceau, et il doit naître avec les
   deux règles maintenant écrites dans son plan.
2. **`ContactsListViewModel` et les autres consommateurs de `MessageSocketManager`**
   — le balayage de ce cycle a montré que `ChatViewModel` et
   `NotificationsViewModel` **replient** leurs événements en état (aucun
   refetch), donc sains. Le balayage n'a pas couvert `feature/contacts`,
   `feature/feed`, `feature/stories`. Même forme à chercher : un `collect` dont
   le corps déclenche une relecture complète.
3. **Le garde de forme des queries infinite OFFSET** (cycle 59 §6) — intacte.
4. **`USER_STATUS` retiré de `CLIENT_EVENTS`** (cycle 59 §7) — intacte.
5. **La file hors-ligne par APPAREIL** (cycle 58 §7) — intacte.
6. **Le mock inerte de `presence.service.test.ts`** (cycle 56 §5) — intacte.
7. **Les deux ÉVÉNEMENTS avant les deux FUSIONS côté iOS** (cycles 51/52/53) —
   bloquée sur l'absence de Xcode, comme Android l'est sur l'absence du SDK.
8. **Les DEUX sockets web** (cycle 58 §8-8) — intacte.

## 8. La constante, onzième cycle consécutif

Les cycles 59 et 60 ont fermé « corrigé d'un côté, pas de l'autre ». Ce cycle
ferme une variante plus retorse : **la propriété qui immunise un client d'un
défaut est celle qui lui en coûte un autre.** Android échappe à la garde
monotone *parce qu'il relit tout* — et relire tout est précisément ce qui le
fait payer trois fois. Il n'y avait pas de bon côté à choisir : l'immunité et
le coût étaient la même ligne de code.

La leçon d'audit : quand un client s'avère immunisé contre le défaut du cycle
précédent, **ne pas classer et passer**. Demander ce que l'immunité coûte.
