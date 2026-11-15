# La batterie des Proches et des Sangs — spec de lot (#14147)

> Issue : https://github.com/isopen-io/meeshy/issues/14147 — **elle fait foi**. Ce document
> est la spec de travail du lot ; l'état de chaque tâche vit dans l'issue et ses suivis.
> Date : 2026-11-15. Décisions du porteur : 2026-11-14 (fil « Proposer les features du
> cercle proche ») et 2026-11-15 (lancement).

## 0. Le principe

« Mes Proches et mes Sangs savent quand ma batterie m'empêchera de répondre. » Ce n'est
**jamais un message de conversation** : rien dans `Message`, aucun avis système. Trois
surfaces seulement — un **push** dédié, la **SyncPill** côté client (elle défile ses
annonces puis disparaît, ne persiste jamais), et l'**état** (icône batterie dans l'en-tête
de conversation et sur l'avatar, détail dans la fiche de conversation et le profil, caché
hors épisode). **Le contexte décide** de ce qui interrompt.

## 1. Inventaire de l'existant (mesuré le 2026-11-15 sur `dev`, 134848579)

| Site | Rôle aujourd'hui | Sort dans ce lot |
|---|---|---|
| `packages/shared/utils/relation-levels.ts` | la matrice `RELATION_FEATURES` / `RELATION_FEATURE_MIN_LEVEL`, les listes littérales `RELATION_EMITTER_CONSENT_FEATURES`, `RELATION_CONSENT_FEATURES`, `RELATION_DIRECTED_FEATURES`, relues par les miroirs Swift (`RelationAccess.swift`) et Kotlin (`RelationAccess.kt`) | **À ÉTENDRE** : `device.battery` (min `CLOSE`) et `device.battery.pull` (min `BLOOD`) entrent dans la matrice, dans les deux listes de consentement, et `pull` dans les actions dirigées. Nouvelle table littérale `RELATION_EMITTER_CONSENT_DEFAULT_LEVEL` (le niveau à partir duquel le consentement de l'émetteur est ACCORDÉ PAR DÉFAUT) |
| `packages/shared/utils/relation-access.ts` | la loi pure `resolveRelationAccess` ; l'équipe (`isPlatformTeam`, #16623) y vaut Sang | **À NE PAS TOUCHER** dans sa logique : le consentement reste une ENTRÉE. La résolution « null = défaut du niveau » vit à côté, dans `relation-emitter-consent.ts`, qui appelle la loi |
| `packages/shared/fixtures/relation-access-cases.json` | l'oracle écrit à la main, rejoué par TS, Swift, Kotlin ; le test exige chaque feature autorisée à son seuil ET refusée dessous | **À ÉTENDRE** : cas `device.battery` (Proche avec/sans consentement, Ami refusé, Sang, équipe, bloqué) et `device.battery.pull` (Sang, Proche refusé, soi refusé) |
| `services/gateway/src/services/relations/relationConsent.ts` | le SITE UNIQUE de lecture des colonnes de consentement (`COLUMN`), booléen strict « `true` = accordé » | **À MODIFIER au lot passerelle** : la batterie lit une colonne TRI-ÉTAT ; le site rend la valeur brute (`true`/`false`/`null`) pour `device.battery`, et la décision passe par `resolveEmitterConsent` (partagé). Rien d'autre ne lit la colonne |
| `RelationFeatureSetting` (Prisma) | une ligne par paire orientée `ownerId → otherId`, colonnes booléennes de partage, `…WithdrawnAt` | **À ÉTENDRE** (ce lot) : `batteryShared Boolean?` (tri-état : absent/nul = défaut du niveau, `true` accordé, `false` refusé) et `batteryWithdrawnAt DateTime?`. Champs optionnels, sans migration, rétrocompatibles |
| `services/gateway/src/services/nowPlaying/nowPlayingRelay.ts` + `nowPlayingStore.ts` | relais par lecteur dans `user:<id>`, loi via `pairAccessAmong`, consentement via `relationConsent.ts`, rafraîchi quand le lien change | **MODÈLE À SUIVRE** au lot passerelle (`services/battery/batteryRelay.ts` + `batteryStore.ts`) — pas de second système |
| `packages/shared/types/now-playing.ts` + `now-playing-constants.ts` | forme du contrat : constantes sans Zod d'un côté, schémas Zod de l'autre, types exportés par le baril sans les schémas | **MODÈLE** de `types/battery-constants.ts` + `types/battery.ts` |
| `packages/shared/types/socketio-events/now-playing-event-names.ts` | noms répandus dans `SERVER_EVENTS` / `CLIENT_EVENTS` | **MODÈLE** de `battery-event-names.ts`. **Les noms ne sont PAS répandus dans ce lot** : les gardes `socket-event-emitter-gate` / `socket-event-handler-gate` / `socket-event-orphan-gate` exigent émetteur, écouteur et lecteur le jour où un nom entre dans les cartes — c'est le lot passerelle qui les répand, dans le commit qui pose `socket.on` et l'émission |
| `packages/shared/types/notification.ts` + `utils/notification-type-enum.ts` + `notification-strings.ts` (8 langues) + `notification-banner.ts` + `notification-preferences.ts` | les types de notification | **À ÉTENDRE au lot push** : type `device_battery` (un seul type, le palier dans les métadonnées), chaînes dans les huit langues, préférence `notification.deviceBatteryEnabled` (défaut activé) |
| `Message`, avis système | — | **À NE PAS TOUCHER** : rien de la batterie n'y entre, jamais |

## 2. La loi : qui reçoit quoi

| Feature | Min | Consentement de l'émetteur |
|---|---|---|
| `device.battery` | `CLOSE` | **Proche** : donné une fois, FAUX par défaut, jamais pré-coché. **Sang** : ACCORDÉ par défaut, sans confirmation, retirable par personne ou pour tous |
| `device.battery.pull` (relevé à la demande) | `BLOOD` | le même consentement (`batteryShared`) ; action DIRIGÉE (rien envers soi) ; 1 toutes les 5 min par paire |

**Consentement tri-état par paire** (`RelationFeatureSetting.batteryShared`, écrit par
l'émetteur `ownerId` pour `otherId`) :

- `null` / absent ⇒ **défaut du niveau effectif** : accordé si le niveau atteint
  `RELATION_EMITTER_CONSENT_DEFAULT_LEVEL['device.battery']` (= `BLOOD`), refusé sinon ;
- `true` ⇒ accordé (un Proche l'a reçu explicitement) ;
- `false` ⇒ refusé (même pour un Sang).

**Coupure globale** : `globallyDisabled` (préférence de l'émetteur « Partager ma batterie »,
lot préférences) refuse tout, quel que soit le stocké.

Résolution : `resolveEmitterConsent({ feature, stored, effectiveLevel, globallyDisabled })`
(pur, `packages/shared/utils/relation-emitter-consent.ts`) et
`resolveRelationAccessWithStoredConsent(input)` qui appelle la loi une fois pour lire le
niveau effectif (équipe comprise), puis une seconde fois avec le consentement résolu. Une
feature sans défaut de niveau (écoute, position) garde le sens historique : seul `true`
accorde.

**L'équipe (#16623)** : entre deux comptes ANALYST et au-dessus, la loi rend `BLOOD` — la
batterie s'y applique donc **comme entre Sangs**, accordée par défaut. Témoin : cas
`team-*-device-battery` des fixtures et test de `resolveRelationAccessWithStoredConsent`.

Rien ne part pour : Ami, Proche sans consentement, bloqué dans un sens ou l'autre, compte
désactivé (le lot passerelle exclut les désactivés comme `pairAccessAmong`).

## 3. Le contrat (packages/shared)

### Montant (client → serveur)

- `battery:report` — `BatteryReport` (Zod `batteryReportSchema`, `.strict()`) :
  `{ level: int 0..100, charging: bool, lowPower: bool, measuredAt: ISO, deviceLabel?: string ≤ 60 }`.
  Accusé `BatteryReportAck` : `{ success: true, data: { tracked: boolean } }` ou refus codé.
  `tracked: false` quand l'appareil n'est pas le « téléphone » suivi (deviceType `mobile`
  le plus récemment actif) — le relevé est ignoré, sans erreur.
- `battery:pull` — `{ userId }` → accusé ; codes `BATTERY_PULL_FORBIDDEN` (loi),
  `BATTERY_PULL_TOO_SOON` (5 min par paire).

### Descendant (serveur → client), room `user:<lecteur>`, projection par lecteur

- `battery:changed` — `BatteryChangedEventData` : `{ userId, state: BatteryReaderState, announcement?: BatteryAnnouncement }`.
  `announcement` n'est PRÉSENT que si le canal du lecteur pour ce palier vaut `socket` :
  c'est lui qui fait défiler la SyncPill. Sans annonce, l'état se met à jour en silence.
- `battery:cleared` — `{ userId, announcement?: BatteryAnnouncement }` : l'épisode est clos
  (ou n'est plus servi : lien baissé, consentement retiré) — l'icône disparaît.
- `battery:pull-requested` — à l'ÉMETTEUR, sur ses sockets : « relève maintenant ». Hors
  ligne, le lot passerelle envoie un push silencieux de relevé.

### État servi

`BatteryReaderState` : `{ userId, phase, level, charging, lowPower, estimatedMinutes?, measuredAt, deviceLabel? }`.
`estimatedMinutes` est calculé côté serveur (`batteryEstimatedMinutes`, pente entre deux
relevés en décharge) et absent quand il n'est pas calculable. Servi seulement **pendant un
épisode** (phase ≠ `normal`).

`GET /relations/battery` → `BatterySnapshot` `{ items: BatteryReaderState[] }` (cache-first
côté client ; rattrapage à la connexion).

### Stockage

Redis, clé par émetteur, **TTL 24 h**, aucun historique : l'état d'épisode
(`BatteryEpisodeState`), le dernier relevé, le registre « a reçu le push critique » par
lecteur (même TTL), le verrou de pull par paire (TTL 5 min).

### Codes d'erreur

`BATTERY_INVALID`, `BATTERY_RATE_LIMITED`, `BATTERY_UNAVAILABLE`,
`BATTERY_PULL_FORBIDDEN`, `BATTERY_PULL_TOO_SOON`.

### Rétrocompatibilité

Uniquement des champs et événements NOUVEAUX ; rien n'est retiré. Un ancien client ignore
`battery:*` sans casser (Socket.IO ne délivre rien à qui n'écoute pas ; le push d'un type
inconnu tombe dans le rendu générique déjà en place).

## 4. Les paliers — `batteryEpisodeStep(previous, input, config)` (pur)

Configuration `BATTERY_CONFIG` : seuil 30, paliers 25/20/15/10, critique 5, hystérésis de
clôture 35, extinction 10 min, reprise 30 min, rechargé 80 (débranché au-dessus) ou 100,
fenêtre de conversation 15 min, pull 5 min, TTL 24 h.

Entrées : `reading` (un relevé), `alive` (une connexion, signe de vie sans relevé),
`tick` (horloge serveur, détecte l'extinction). Un relevé plus ancien que le dernier est
ignoré.

| Phase | Entrée | Annonce | Phase suivante |
|---|---|---|---|
| `normal` | relevé ≤ 30 non branché | `low` (premier relevé ≤ 30) ; s'il saute plusieurs paliers, une seule annonce | `low` |
| `low` | relevé franchissant 25/20/15/10 non annoncés | `threshold` (le plus bas franchi) — chacun une seule fois par épisode | `low` |
| `low` / `normal` | relevé ≤ 5 non branché | `critical` | `critical` |
| `critical` | relevé sous le plancher critique | `critical-drop` (chaque point perdu) | `critical` |
| `critical` | `tick` ≥ 10 min sans relevé ni connexion | `probably-off` | `off` |
| `off` | premier relevé | `back-on` (+ `charging` si branché) | selon le niveau |
| `critical` / `off` | branchement | `charging` | `charging` (veille de recharge) |
| `charging` | 100 %, ou débranché > 80 % | `recharged` | `normal` |
| `low` | branchement, ou retour > 35 % | `ended` | `normal` |
| `critical` | retour > 35 % non branché (débranché > 80 % ⇒ `recharged`) | `ended` | `normal` |

**Reprise** : un épisode clos il y a moins de 30 min reprend où il s'était arrêté — les
paliers déjà annoncés ne se répètent pas (oscillation autour de 30 : une annonce).
Au-delà, nouvel épisode.

## 5. Le contexte décide — `batteryReaderChannel(kind, inConversation, receivedCritical)`

Un lecteur est **en conversation** avec l'émetteur si (calcul au lot passerelle) : il a la
conversation directe ouverte (socket dans `conversation:<id>`), OU un message a été échangé
entre eux dans les 15 dernières minutes, OU son dernier message à l'émetteur attend une
réponse.

| Annonce | En conversation | Hors conversation | Hors conversation, push critique reçu |
|---|---|---|---|
| `low`, `threshold`, `critical-drop`, `ended` | `socket` | `none` | `none` |
| `critical` | `socket` | `push` | `push` |
| `probably-off`, `back-on`, `recharged` | `socket` | `push` | `push` |
| `charging` | `socket` | `none` | `push` |

`socket` : l'annonce part dans `battery:changed`/`battery:cleared` → SyncPill. `push` :
type de notification dédié ; app ouverte, le client rend la SyncPill **à la place** du
push (pas de doublon). `none` : l'état se met à jour en silence, rien n'interrompt. Un
lecteur qui a reçu le push critique reçoit toujours la suite (éteint, retour, charge,
rechargé).

## 6. Plateformes

- **iOS** : `UIDevice.batteryLevel` (pas de 5 % — dit, jamais simulé), `batteryState`,
  `ProcessInfo.isLowPowerModeEnabled` ; `BGAppRefreshTask` + push silencieux de relevé.
- **Android** : `BatteryManager`, WorkManager 15 min, FCM.
- **Web** : reçoit et affiche, n'émet pas.

Les miroirs Swift et Kotlin relisent `fixtures/battery-episode-cases.json` (paliers,
canal, consentement par défaut) et les listes littérales de `relation-levels.ts`.

## 7. Lots

1. **Socle partagé** (ce lot) : matrice (`utils/relation-levels.ts`), types + Zod
   (`types/battery-constants.ts`, `types/battery.ts`), noms (`types/socketio-events/battery-event-names.ts`,
   non répandus), `utils/battery-episode.ts` (`batteryEpisodeStep`, `batteryReaderChannel`,
   `batteryReaderInConversation`, `batteryEstimatedMinutes`, `batteryReaderState`),
   `utils/relation-emitter-consent.ts` (`resolveEmitterConsent`,
   `resolveRelationAccessWithStoredConsent`), fixtures (`fixtures/battery-episode-cases.json`,
   cas ajoutés à `fixtures/relation-access-cases.json`), colonnes Prisma `batteryShared` /
   `batteryWithdrawnAt`.
2. Passerelle : `batteryStore` + `batteryRelay` (modèle `nowPlaying`), route snapshot,
   consentement tri-état dans `relationConsent.ts`, détection d'extinction, contexte de
   conversation, répandre les noms d'événements dans les cartes, type de push.
3. Miroirs iOS et Android : cas de la matrice, lecture des fixtures, émission.
4. Web : réception, SyncPill, icône, fiche.

## 8. Miroirs à mettre à jour (suivi immédiat)

Ajouter `device.battery` / `device.battery.pull` à la matrice lue par
`RelationAccess.swift` et `RelationAccess.kt` : leurs tests de parité relisent
`relation-levels.ts` et rougiront tant que ces cas manquent — c'est voulu, ce sont les
lots miroirs qui les soldent.
