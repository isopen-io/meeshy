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
