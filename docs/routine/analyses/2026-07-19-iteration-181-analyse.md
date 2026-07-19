# Iteration 181 — `deviceLocale` middleware : cache de debounce non borné (fuite mémoire par utilisateur distinct)

## Protocole (démarrage)
`main` @ `b158a9b` (derniers merges : #2055/#2052/#2050 android/status, #2044
web/i18n normalize codes, #2037 ios/a11y…). Branche
`claude/brave-archimedes-q76pfd` réinitialisée sur `origin/main`. Ce cycle prend
**181**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (gateway/shared). Les PR iOS ouvertes (#2040→#2056) sont pilotées par
d'autres sessions et hors périmètre. Point de départ : **revue Priorité 1**
(fonctionnalités récentes) sur la surface gateway TS — le middleware
`deviceLocale` (Prisme étendu 2026-05-26) est l'ajout serveur récent le plus
directement testable.

## Current state
`services/gateway/src/middleware/deviceLocale.ts` persiste opportunément la locale
appareil (`X-Device-Locale`) dans `User.deviceLocale`, avec un **debounce
par utilisateur de 5 min** implémenté par une `Map` de processus :

```ts
const DEBOUNCE_MS = 5 * 60 * 1000;
const lastUpdateByUserId = new Map<string, number>();  // userId → last write ts
// ...
lastUpdateByUserId.set(userId, now);   // ← une entrée par utilisateur, jamais évincée
```

Le hook est un `preHandler` **global** : il s'exécute sur **chaque requête
authentifiée** de **chaque route**. La `Map` reçoit donc une entrée pour tout
utilisateur enregistré ayant émis au moins une requête portant `X-Device-Locale`.

## Problems identified
1. **Fuite mémoire non bornée (scalabilité).** `lastUpdateByUserId` n'est
   **jamais purgée**. Elle accumule une entrée par utilisateur distinct pour
   **toute la durée de vie du process gateway**. Sur une plateforme visée à
   100k+ utilisateurs (et une gateway à long uptime), la `Map` croît linéairement
   avec le nombre cumulé d'utilisateurs actifs — ~100k entrées ≈ ~10 Mo, 1M ≈
   ~100 Mo — sans plafond. C'est une fuite lente mais réelle.
2. **Entrées mortes conservées.** Une entrée dont l'horodatage dépasse
   `DEBOUNCE_MS` ne peut **plus jamais** supprimer une écriture (la garde
   `now - last < DEBOUNCE_MS` échoue toujours pour elle). Elle est donc du poids
   mort pur : la conserver n'apporte rien mais coûte de la mémoire.

## Root cause
Le debounce a été conçu pour la **correction fonctionnelle** (ne pas marteler la
DB) sans stratégie d'éviction : la `Map` est un cache qui **grandit mais ne
rétrécit jamais**. Le cycle de vie d'une entrée (utile seulement pendant
`DEBOUNCE_MS` après sa dernière écriture) n'était pas exploité pour la libérer.

## Business / Technical impact
- **Mémoire / scalabilité (serveur)** : empreinte du process qui croît de façon
  monotone avec la base d'utilisateurs cumulée — pression GC accrue, risque
  d'OOM sur un uptime long, coût RAM en production.
- **Observabilité** : une croissance mémoire lente et diffuse est difficile à
  diagnostiquer ; la borner par construction supprime une classe entière de
  faux positifs d'investigation.
- **Correctness** : inchangée — le debounce reste strictement identique tant que
  la `Map` est sous le plafond.

## Risk assessment
Très faible. Aucune signature publique ni type de retour modifié. La purge
n'évince que des entrées **expirées** (comportement strictement préservé : elles
ne pouvaient plus supprimer d'écriture). Le plafond dur (`MAX_TRACKED_USERS =
10_000`) ne se déclenche que si >10k utilisateurs distincts écrivent **dans la
même fenêtre de 5 min** — cas pathologique où le seul effet est **une** écriture
`User.update` supplémentaire (idempotente) pour un utilisateur évincé. La purge
est **amortie** (déclenchée uniquement au franchissement du plafond, jamais sur
le chemin chaud nominal). Les 14 tests existants restent verts.

## Proposed improvements / Correctif (TDD)
- **RED** : +3 tests (`deviceLocale.test.ts`, bloc « bounded debounce cache ») —
  (a) éviction des entrées expirées au franchissement du plafond ; (b) borne dure
  respectée même quand toutes les entrées sont fraîches ; (c) pas de purge sous le
  plafond (amortissement, pas d'éviction eager). Nouveaux seams de test
  `_deviceLocaleCacheSize()` / `_DEVICE_LOCALE_MAX_TRACKED_USERS`.
- **GREEN** :
  1. `MAX_TRACKED_USERS = 10_000` + `pruneStaleDebounceEntries(now)` : balaye les
     entrées `now - ts >= DEBOUNCE_MS` puis, si toujours au plafond, évince les
     plus anciennement insérées (ordre d'insertion `Map`).
  2. Chemin d'écriture : avant `set`, si l'utilisateur est nouveau **et** la
     `Map` a atteint le plafond, déclencher la purge. Le hot path nominal (map
     sous plafond) ne paie aucun coût O(n).

## Expected benefits
- Empreinte mémoire du middleware **bornée par construction** (≤
  `MAX_TRACKED_USERS` entrées) quelle que soit la base d'utilisateurs cumulée.
- Élimination d'une fuite mémoire lente sur une fonctionnalité récente.
- Debounce fonctionnellement inchangé sous charge nominale.

## Implementation complexity
Faible — 1 constante + 1 fonction de purge amortie + 1 garde sur le chemin
d'écriture, dans un seul fichier déjà couvert par tests.

## Validation criteria
- `services/gateway` : `deviceLocale.test.ts` **17/17** verts (3 nouveaux, 14
  préexistants inchangés).
- `tsc --noEmit` : 0 nouvelle erreur sur les lignes touchées.

## Backlog (candidats consignés pour une itération future)
- `MeeshySocketIOManager.ts:752` — ordre de résolution différent
  (`username ?? displayName ?? …`, sémantique « présence key ») : hors périmètre,
  à ne PAS uniformiser sans analyse dédiée.
- F69 (`sanitizeFileName` overlong sans extension) : latent, 0 appelant.
# Iteration 181 — `ReactionService.getMessageReactions` : fallback compte court-circuité (avatar/displayName du réacteur) → réacteurs enregistrés affichés « Anonymous »

## Protocole (démarrage)
`main` @ `612872b` (derniers merges : #2048 android/status StatusRepository,
#2046 android/status mood-core, #2044 web/i18n normalize language codes — itér.
180). Branche `claude/brave-archimedes-fopjm9` réinitialisée sur `origin/main`
(l'itération 180 a été mergée). Ce cycle prend **181**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (gateway/shared/web). Reconnaissance menée par sous-agent Explore sur
la famille de bugs « SSOT non branchée » (avatar/displayName résolus à la main
au lieu des helpers `resolveParticipant*`, fuite chaîne-vide, invariants
d'agrégat) que les itérations 177-180 ont uniformisée.

## Current state
`services/gateway/src/services/ReactionService.ts` → `getMessageReactions()`
enrichit chaque réacteur agrégé (popup emoji, feuille « qui a réagi ») avec un
`username` + `avatar`. La requête Prisma des participants (`:209-214`)
sélectionnait `{ id, displayName, avatar, userId }` — elle porte le `userId`
mais **ne joignait PAS le compte `user`**. L'enrichissement émettait ensuite :

```ts
username: participant?.displayName ?? 'Anonymous',
avatar: participant?.avatar ?? null,
```

Or `Participant.displayName` / `Participant.avatar` sont des **overrides locaux
par conversation**, `null` dans le cas nominal : un utilisateur enregistré
s'appuie sur son compte (`User.displayName` / `User.avatar`). Le pendant correct
est à un répertoire de là — `routes/conversations/messages.ts:1178-1179,
1214-1215, 2320-2321, 2636-2637` joint `user` et délègue à
`resolveParticipantDisplayName` / `resolveParticipantAvatar`
(`packages/shared/utils/participant-helpers.ts`, SSOT #1925 / itér. 178-179).

## Problems identified
1. **Fallback compte court-circuité (SSOT non branchée).** Pour un réacteur
   enregistré dont `Participant.displayName`/`avatar` local est `null` (cas
   nominal), l'agrégat émettait `username: 'Anonymous'` + `avatar: null` au lieu
   du nom/avatar du compte — alors que le **même** utilisateur apparaît
   correctement nommé dans le fil de messages voisin. La donnée de repli n'était
   même pas **chargée** (pas de jointure `user`).
2. **Fuite chaîne-vide.** `?? 'Anonymous'` / `?? null` ne bascule que sur
   `null`/`undefined` : un `displayName: ''` local émettait un nom vide, un
   `avatar: ''` émettait `''` → `<img src="">` (rechargement parasite de la page
   courante), exactement le défaut éliminé partout ailleurs par la
   normalisation blank des helpers.
3. **Divergence de surface.** Deux vues de la même donnée participant→compte
   (fil de messages vs popup/feuille de réactions) affichaient deux identités
   différentes pour le même réacteur.

## Root cause
`getMessageReactions` réimplémentait la résolution identité participant à la
main (`?? 'Anonymous'` / `?? null`) sans joindre le compte lié, au lieu de
déléguer à la source unique `resolveParticipant*` déjà utilisée pour la même
famille de données dans les routes conversation/message. C'était le **dernier
émetteur d'identité participant côté gateway** encore branché à la main —
`getMessageStatusDetails` (itér. 178), les 7 sites `displayName` conversation
(itér. 179) et `getMessageReadStatus` étaient déjà migrés.

## Business / Technical impact
- **UX** : dans une conversation de groupe, la liste « a réagi 👍 » affichait
  « Anonymous » (et aucun avatar) pour des membres pourtant enregistrés et
  nommés ailleurs — perte de confiance, impossibilité de reconnaître qui a
  réagi. Chemins chauds : REST `GET /reactions` (`reactions.ts:518-523`) et sync
  socket `reaction:*` (`socketio/handlers/ReactionHandler.ts:343`).
- **Technique** : `<img src="">` parasite sur les avatars blancs ; incohérence
  d'identité entre deux surfaces API de la même entité (le gateway est la SSOT
  consommée par iOS/Android/web).

## Risk assessment
Très faible. Type de retour inchangé (`ReactionAggregation`). Les helpers
`resolveParticipant*` sont idempotents et déjà en production sur les chemins de
messages/read-status ; pour un participant sans compte lié (anonyme) le résultat
est identique (`resolveParticipantDisplayName` → `null` → `'Anonymous'`,
`resolveParticipantAvatar` → `null`). La jointure `user` ajoute deux scalaires à
un `findMany` déjà borné par les `participantIds` de la page. Les 78 tests
`ReactionService` pré-existants + 508 tests des 15 suites réaction restent verts.

## Correctif (TDD)
- **RED** : +5 tests (`ReactionService.test.ts`, describe `getMessageReactions`)
  — fallback compte quand local `null` ; priorité local > compte ; blank local
  traité comme absent (jamais `''`) ; `'Anonymous'` / `null` quand ni participant
  ni compte ; assertion que le `select` joint `user`. 3/5 échouent sur le code
  d'origine (fallback, blank, jointure), 2 sont des gardes.
- **GREEN** :
  1. Import `resolveParticipantAvatar` / `resolveParticipantDisplayName` depuis
     `@meeshy/shared/utils/participant-helpers`.
  2. `select` participant enrichi de `user: { select: { displayName: true,
     avatar: true } }` — la donnée de repli est désormais chargée.
  3. Enrichissement : `username: resolveParticipantDisplayName(participant) ??
     'Anonymous'` ; `avatar: resolveParticipantAvatar(participant)`.

## Expected benefits
- Parité stricte d'identité réacteur ↔ identité message pour tous les réacteurs
  enregistrés.
- Fin des `'Anonymous'` fantômes et des `<img src="">` sur les popups/feuilles
  de réaction.
- Un émetteur d'identité participant de moins réécrit à la main dans la gateway.

## Implementation complexity
Faible — jointure `user` + délégation à deux helpers existants sur un seul site.

## Validation criteria
- `ReactionService.test.ts` **83/83** verts (5 nouveaux).
- Suites consommatrices `ReactionHandler|reactions` **508/508** verts (15 suites).
- ts-jest type-check du service OK (aucune nouvelle erreur ; la baseline TS2347
  ligne 407 dépend de `prisma generate`, hors périmètre).

## Backlog (candidats consignés pour une itération future)
- **CommentReactionService.ts:247-248** (`user?.displayName ?? 'Anonymous'` /
  `avatar ?? null`) : niveau compte seul (pas d'override local), donc pas de
  fallback manquant — mais fuite chaîne-vide `''` restante. Aucun fichier de
  test co-localisé → itération dédiée (RED d'abord).
- **routes/conversations/stats.ts:77-78** et **participants.ts:541** : mêmes
  fuites chaîne-vide `''` (niveau compte seul). Impact moindre (panneau stats /
  toast transitoire).
- `MeeshySocketIOManager.ts:752` — ordre de résolution « présence key » distinct,
  à NE PAS uniformiser sans analyse dédiée.
