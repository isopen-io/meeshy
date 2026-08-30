# Itération 279 — iOS relit ses préférences à la reconnexion socket (parité des 3 miroirs)

Issue : #4231 · famille #4197 (Android, cycle 132) / #4209 (web, cycle 133-135) · leçon 310.

## État actuel

Le double des préférences user-level que les surfaces rendent (bulles, écran
verrouillé via l'App Group) doit se rattraper sur DEUX déclencheurs :
- ÉPHÉMÈRE : la diffusion `user:preferences-updated`, entendue seulement si le
  client est présent quand elle passe ;
- PÉRENNE : la connexion socket elle-même, qui couvre l'ouverture de session ET
  le rattrapage après coupure — un abonnement enregistre un écouteur, il ne
  demande jamais d'arriéré (leçon 310).

| client | déclencheur PÉRENNE de reconnexion | site |
|---|---|---|
| Android | oui (cycle 132, #4197) | `PreferencesSyncCoordinator` — `connectionState.filter { CONNECTED }` |
| web | oui (cycle 133-135, #4209) | `startMirroredPreferenceRehydration` — `onStatusChange` |
| **iOS** | **NON** | — |

`UserPreferencesManager` (`packages/MeeshySDK/.../Services/UserPreferencesManager.swift`)
relit via `fetchFromBackend()` sur trois déclencheurs seulement :
`observeAuth()` (login), `observeForeground()` (`willEnterForeground`, étranglé à
5 min), `observeRemotePreferenceBroadcast()` (diffusion catégorie, #4201).

## Problèmes identifiés

Aucun des trois déclencheurs iOS ne couvre **une reconnexion socket survenue
alors que l'app reste au premier plan** : redéploiement gateway (healthcheck
~30 s), bascule WiFi↔cellulaire, coupure réseau transitoire. Sans changement de
cycle de vie, `observeAuth`/`observeForeground` ne fire pas ; la diffusion émise
pendant la coupure n'est jamais rejouée. Le bloc reste périmé INDÉFINIMENT
jusqu'au prochain aller-retour d'app ou à une nouvelle diffusion.

Le bloc `notification` étant miroité dans l'App Group lu par `NSEPreferencesGate`,
« périmé » vaut aussi écran verrouillé : un iPhone resté ouvert continue de
sonner selon l'ancienne règle après que l'utilisateur a coupé ses notifications
depuis un autre appareil.

## Causes racines

`didReconnect` (`MessageSocketManager`), le hook de rattrapage-reconnexion déjà
consommé par `ConversationSyncEngine`, `FeedViewModel`, `StoryViewModel`,
`PostDetailViewModel`, n'a jamais été branché à `UserPreferencesManager`. Le lot
#4201 a livré le déclencheur VIF (la diffusion) sans le déclencheur PÉRENNE que
la même leçon 310 imposait — exactement le demi-travail que le cycle 133 a
identifié côté web (« un lecteur correct sur un déclencheur éphémère est une
synchronisation à moitié faite »). iOS était le troisième miroir, resté hors de
l'énumération des deux passes précédentes.

## Impact métier

Parité produit « même compte, mêmes réglages sur les trois clients » rompue sur
iOS pendant toute fenêtre socket-coupé-app-ouverte. Sur `notification`, l'écart
est audible (sonneries) et visible sur l'écran verrouillé. Classe exacte du
demi-travail #4197/#4209, sur le client qui restait.

## Impact technique

Un `@Published` de préférence lu par la messagerie et l'App Group reste sur une
valeur serveur périmée sans qu'aucun témoin ne rougisse — le trajet de la
diffusion (#4201) est juste, mais il ne couvre qu'une des deux fenêtres.

## Évaluation du risque

Faible. Le correctif mirroite EXACTEMENT le seam d'injection déjà testé de
`observeRemotePreferenceBroadcast` et réutilise `fetchFromBackend()` tel quel —
qui porte déjà la garde d'authentification, le veto `pendingCategories` (via
`applyRemote`) et la politique « un échec réseau ne remet rien à zéro ». Aucune
API publique ne change. Le déclencheur `didReconnect` ne fire que sur
reconnexion réelle (garde `hadPreviousConnection`), donc pas de lecture sur le
premier connect ni sur un CONNECTED répété.

## Améliorations proposées

Brancher `UserPreferencesManager` sur `MessageSocketManager.shared.didReconnect`
via un nouveau déclencheur `observeSocketReconnection()` (no-arg, wired en
`init()`), délégant à un seam injectable `observeSocketReconnection(_ publisher:
AnyPublisher<Void, Never>)` qui `sink` → `Task { await fetchFromBackend() }`.
Pas d'étranglement 5 min (parité web/Android : la reconnexion est la preuve
d'une fenêtre manquée, comme la diffusion). Pas de debounce (un `didReconnect`
par reconnexion réelle, `fetchFromBackend` idempotent).

## Bénéfices attendus

Le double iOS acquiert sa seconde source PÉRENNE ; les trois miroirs
convergent ; l'écran verrouillé cesse de servir une règle de notification
périmée après un redéploiement gateway.

## Complexité d'implémentation

Faible : ~15 lignes de production (deux méthodes + un appel `init()`) et une
suite de tests miroir des tests de la diffusion (relecture, veto écho,
garde d'auth).

## Critères de validation

- `test_socketReconnect_refetchesPreferences` : une émission de `didReconnect`
  déclenche exactement un `getAllPreferences`.
- `test_socketReconnect_echoOfOwnPendingEdit_doesNotUndoTheGesture` : le veto
  `pendingCategories` protège un geste local en vol.
- `test_socketReconnect_notAuthenticated_doesNotRefetch` : la garde d'auth vaut.
- Gate iOS : `sdk-tests.yml` (MeeshySDKTests) vert en CI — la suite Swift ne peut
  pas tourner dans l'environnement Linux de la routine ; validée via CI.
