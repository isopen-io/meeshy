# Cycle 130 — trois écrivains, deux lecteurs : Android n'avait jamais écouté ses propres préférences

Date : 2026-08-28 · Issue : #4127 · Branche : `claude/keen-hamilton-funmhr`

## Le défaut

`UserConversationPreferences` est une ligne **par utilisateur**, pas par appareil.
Épingler, mettre en sourdine, archiver, passer en « mentions seules », renommer,
mettre en favori, étiqueter ou recatégoriser une conversation passe par un
écrivain unique côté passerelle — `writeConversationPreferences`
(`services/gateway/src/services/conversationPreferencesSync.ts`) — qui incrémente
`version` et diffuse l'instantané complet sur la room personnelle du compte :

```ts
broadcastToUser(fastify, userId, SERVER_EVENTS.USER_PREFERENCES_UPDATED, {
  userId, conversationId, version, reset: false, preferences: toPreferencesPayload(row),
});
```

Le web le décode (`applyRemotePreferences`,
`apps/web/stores/conversation-preferences-store.ts`), iOS aussi
(`ConversationStore.applyRemote` via `ConversationStoreSocketBridge`).

**Android n'avait aucun écouteur.** Mesuré : zéro occurrence de
`preferences-updated` sous `apps/android/**/*.kt`, la seule mention du dépôt étant
une case NON cochée d'`apps/android/tasks/inventory-sdk.md`.

Conséquence, sur le geste le plus banal de l'application : épingler une
conversation depuis le web ou l'iPhone ne changeait **rien** sur le téléphone
Android, jusqu'à un rechargement complet sans rapport. Ni immédiatement, ni à la
reconnexion, ni au retour de l'application au premier plan.

## Pourquoi rien ne l'a signalé

**1. La liste se rafraîchit sur trois autres trames — mais aucune n'est émise
par un écrivain de préférences.** `ConversationListViewModel` répond déjà à
`conversation:unread-updated`, `message:new` et `conversation:updated` par une
relecture fusionnée. Le raccourci naturel — « la liste se resynchronise de toute
façon » — est faux ici : `writeConversationPreferences` n'émet **que**
`USER_PREFERENCES_UPDATED`, jamais `conversation:updated`. Il n'existait donc
aucun chemin, ni direct ni indirect.

**2. Le voisin immédiat, lui, était câblé.** `CategorySocketManager` décode les
quatre trames de catégories (`category:created/updated/deleted`,
`categories:reordered`) et le catalogue se replie en direct. Une surface où la
moitié du sujet arrive en temps réel se relit comme une surface faite — c'est la
forme du cycle 123 (« une surface rangée dans "fait" parce que la donnée y
arrivait bien, alors que ce qui manquait était en AVAL »), ici avec la donnée
voisine plutôt que le consommateur aval.

**3. Le pilotage l'avait noté sans le compter.** Une case à cocher dans un
inventaire de parité n'a ni témoin ni gate ; elle disparaît de la vue dès que le
fichier grossit. Le défaut a été trouvé en livrant #4126 — en posant, sur le
détachement de catégorie du cycle 129, la question « qui **applique** ce que
j'émets ? » — et pas en relisant l'inventaire.

## Ce qui change

| site | ce qui change |
|---|---|
| `core/model/…/ConversationPreferencesSocketPayloads.kt` (neuf) | la charge de l'émetteur copiée clé par clé (`ConversationPreferencesWirePayload`, `UserPreferencesConversationUpdatedSocketData`) et **le port pur** `applyRemote`, qui porte tout l'arbitrage |
| `core/model/…/Conversation.kt` | `ApiConversationPreferences.version` — l'arbitre, absent du modèle Android |
| `sdk-core/…/socket/PreferencesSocketManager.kt` (neuf) | l'écouteur de `user:preferences-updated`, discriminant l'arm CONVERSATION de l'union avant décodage |
| `sdk-core/…/socket/RealtimeSessionCoordinator.kt` | le nouveau manager rejoint l'attache de session |
| `sdk-core/…/conversation/ConversationRepository.kt` | `applyRemoteConversationPreferences()` — l'I/O autour du port pur, une transaction Room |
| `feature/conversations/…/ConversationListViewModel.kt` | la collecte : une écriture de cache, **aucune relecture réseau** |

**L'arbitrage vit dans une fonction PURE, pas dans le dépôt.** `applyRemote` rend
`null` pour « ne rien écrire », si bien que chaque règle d'abandon est couverte
en JVM sans base de données, et que le dépôt ne porte que la transaction.

**Le port suit la règle du WEB, pas celle d'iOS, sur un point.** Un événement
`reset: false` sans instantané : le web l'abandonne **sans avancer le compteur**
(« avancer le compteur ferait tomber la PROCHAINE diffusion, celle qui portait
l'état »), iOS avance `version` quand même. Mesuré : la passerelle n'émet cette
forme sur **aucun** chemin — `toPreferencesPayload` est inconditionnel et le
`reset: true` est le seul cas sans instantané. La divergence est donc LATENTE, et
Android prend le côté qui ne peut pas perdre une mise à jour. Suivi ouvert.

**L'instantané atterrit sur `ApiConversation.preferences`**, l'écrasement que
`resolvedPreferences` lit EN PREMIER — le même champ que le chemin optimiste —
donc la ligne se re-range à l'émission Room suivante, sans attendre une relecture,
et la prochaine synchro REST (la vérité du serveur) remplace la charge entière.

## Ce qui N'est délibérément PAS câblé, et pourquoi

Le critère 4 de l'issue demandait de trancher le sort de
`USER_PREFERENCES_REORDERED` et `USER_PREFERENCES_COMMUNITY_REORDERED`. **Ils ne
sont pas écoutés**, et c'est une décision, pas un oubli :

- ils ne portent que `orderInCategory` ;
- `ConversationSections.of` range sur `isPinned` + `categoryId`, rien d'autre ;
- `orderInCategory` a **zéro occurrence** dans `apps/android/**/*.kt`, et Android
  n'expose aucun geste de glisser-déposer.

Un écouteur y décoderait une charge qu'aucune surface ne peut lire — le contrôle
inerte que le cycle 123 a trouvé sur `PostCard` (« cliquer une traduction ne
changeait rien »), pris à l'envers. Un témoin gèle l'absence
(`no reorder listener is registered`) pour que le prochain lecteur doive
l'ajouter plutôt que le supposer présent. **Issue de suivi ouverte** pour le jour
où Android gagne le geste.

Trois clés du fil restent hors du cache pour la même raison — `orderInCategory`,
`readingMode`, `clearHistoryBefore` — mais elles restent DÉCLARÉES sur le type de
fil : le type dit ce que l'émetteur envoie, pas ce que ce client consomme, et une
clé absente du type est une clé que personne ne retrouve le jour où un lecteur
apparaît.

## Gates

| gate | résultat |
|---|---|
| `ConversationPreferencesSocketPayloadsTest` (neuf, `:core:model`) | 10 témoins — décodage clé par clé de la charge RÉELLE de l'émetteur, les quatre règles d'abandon, le reset, l'effacement de colonnes, la base version 0 d'une ligne hydratée par REST |
| `PreferencesSocketManagerTest` (neuf, `:sdk-core`) | 6 témoins — l'arm conversation décodé, les arms catégorie et communauté du MÊME nom d'événement silencieux, une charge malformée sans crash du callback, l'absence d'écouteur de reorder |
| `ConversationRepositoryTest` (+4) | l'écriture Room, l'abandon de version, la conversation non hydratée, **et zéro mutation en file hors ligne** |
| `ConversationListViewModelTest` (+2) | la trame atteint l'écrivain de cache, **et ne déclenche aucune relecture de liste** |
| `RealtimeSessionCoordinatorTest` (+5 assertions) | le manager s'attache à la session, une fois, et se ré-attache après une reconnexion |
| `:app:assembleDebug` + `testDebugUnitTest` | **délégués au workflow `Android`** — `dl.google.com` est refusé par la politique de sortie de ce conteneur (l'en-tête de `.github/workflows/android.yml` le dit et c'est la raison d'être du workflow) ; `sdkmanager` ne peut pas s'amorcer, aucune tâche Gradle ne peut tourner ici |
| gateway / web / iOS | **non modifiés** — la charge de fil est inchangée, ce lot n'ajoute qu'un lecteur |

## Suivi MESURÉ

- **`GET /conversations` ne sert PAS `version`** (`conversationUserPreferencesSelect`
  ne le sélectionne pas), ni `orderInCategory`. Une ligne hydratée par REST repart
  donc du compteur 0 sur les trois clients — bénin tant qu'aucune diffusion n'est
  rejouée, et c'est pourquoi la passerelle démarre son premier upsert à 1. Le
  noter ici parce que la prochaine personne à lire `version` sur cette route
  croira le champ servi.
- **Web et iOS arbitrent différemment un `reset: false` sans instantané**
  (voir ci-dessus). Latent aujourd'hui ; à trancher d'un côté ou de l'autre le
  jour où un écrivain émet cette forme.
- **Android n'a toujours aucun lecteur de préférences de COMMUNAUTÉ ni de la
  catégorie utilisateur** (les deux autres arms de l'union). Distinct de ce lot :
  ni l'un ni l'autre n'a de ligne mise en cache côté Android à corriger — c'est une
  feature absente, pas une synchro cassée.
- **Le geste de glisser-déposer n'existe pas sur Android**, d'où les deux
  événements de réordonnancement non câblés.
