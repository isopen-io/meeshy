# Iteration 179 — `displayName` de participant : fuite chaîne-vide + fallback compte court-circuité (SSOT non branchée)

## Protocole (démarrage)
`main` @ `7ad6e3e` (derniers merges : PR #2021 android/feed mentions, #2019
badge comment-count, #2016 comment reactions…). Branche
`claude/brave-archimedes-x0inyh` réinitialisée sur `origin/main`. Ce cycle prend
**179**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (gateway/shared). Point de départ : **backlog Finding 2** consigné par
l'itération 178, jugé actionnable après vérification de l'impact client.

## Current state
La sérialisation `sender.displayName` des routes conversation/message résolvait le
nom d'affichage via une coalescence brute répétée à la main sur **7 sites** :

```ts
displayName: sender.displayName ?? sender.user?.displayName ?? null,
avatar:      resolveParticipantAvatar(sender),   // ← déjà branché sur la SSOT
```

- `routes/conversations/core.ts:622`
- `routes/conversations/search.ts:205`
- `routes/conversations/messages.ts:1178` (message), `:1214` (replyTo),
  `:1279` (forwarded original), `:2320` (thread), `:2636` (search)

Sur **chacune** de ces lignes, l'`avatar` voisin passe déjà par la source unique
`resolveParticipantAvatar` (#1925), mais le `displayName` de la même structure
restait sur `??`.

## Problems identified
1. **Fallback compte court-circuité.** `Participant.displayName === ''` (chaîne
   vide, ≠ null) fait que `??` retourne `''` sans jamais atteindre
   `sender.user?.displayName`. Un participant sans `displayName` local mais avec
   un `User.displayName` valide voyait donc son nom de compte **masqué** — exact
   pendant du bug avatar corrigé par #1925.
2. **Fuite chaîne-vide dans la réponse API.** Le gateway renvoyait
   `displayName: ''`. Le client web l'absorbe (`getUserDisplayName` teste
   `.trim()`), mais le gateway est la **SSOT de l'API** ; iOS/Android ne partagent
   pas ce helper et reçoivent une chaîne vide au lieu du nom de compte ou du
   fallback `username`.
3. **Divergence de sémantique (SSOT non respectée).** `avatar` et `displayName`
   d'une même structure `sender` appliquaient deux règles d'« absence »
   différentes (`resolveParticipantAvatar` blank-aware vs `??` null-only), la règle
   de résolution étant réécrite à la main sur 7 sites — dette et risque de dérive.

## Root cause
Lors de l'extraction de la SSOT avatar (#1925), seule la ligne `avatar` a été
rebranchée ; la ligne `displayName` sœur est restée sur l'ancien `??`. Aucun
helper partagé n'existait pour le niveau `displayName` (local → compte), donc la
règle produit — « absent = null/undefined **OU** chaîne blanche, local puis
compte » — n'était encodée nulle part de façon réutilisable.

## Business / Technical impact
- **UX (clients non-web)** : nom de compte perdu (affichage vide) pour tout
  `sender` disposant d'un `User.displayName` mais sans `displayName` local blanc,
  sur messages, réponses, messages forwardés, résultats de recherche et aperçus de
  conversation.
- **Cohérence** : `avatar` et `displayName` d'une même entité désormais résolus par
  la même famille de helpers blank-aware, aux mêmes points.
- **Dette** : 7 réécritures manuelles d'une décision produit remplacées par un
  appel unique.

## Risk assessment
Très faible. Type de retour inchangé (`string | null`). Le seul changement de
comportement (`''`/blanc → fallback compte puis `null`) est strictement une
amélioration : il ne peut produire un nom là où il n'en existait pas légitimement.
Aucune requête Prisma modifiée (les relations `user { displayName }` étaient déjà
chargées et lues par l'ancien `??`). Miroir exact d'un pattern déjà en production
depuis #1925.

## Proposed improvements / Correctif (TDD)
- **RED** : +8 tests (`packages/shared/__tests__/utils/participant-helpers.test.ts`)
  pour `resolveParticipantDisplayName` — priorité local, fallback compte
  (null/undefined/blanc), double-blanc → null, user null, participant null.
- **GREEN** :
  1. `packages/shared/utils/participant-helpers.ts` — nouveau
     `resolveParticipantDisplayName(participant)` miroir strict de
     `resolveParticipantAvatar` : `[displayName local, displayName compte]
     .find(isNonBlank) ?? null`. Le prédicat blank-aware `isNonBlankAvatar` est
     généralisé en `isNonBlank` et partagé par les deux résolveurs (zéro
     duplication).
  2. Les **7 sites** gateway : `displayName: sender.displayName ?? … ?? null` →
     `displayName: resolveParticipantDisplayName(sender)`, avec import étendu dans
     `core.ts` / `search.ts` / `messages.ts`.

## Expected benefits
- Parité stricte avatar ↔ displayName sur toutes les surfaces de sérialisation
  `sender`.
- Fallback compte restauré pour les clients natifs.
- Une seule source de vérité pour la règle « displayName local → compte ».

## Implementation complexity
Faible — 1 helper + 7 substitutions mécaniques vers un helper testé.

## Validation criteria
- `packages/shared` : `participant-helpers.test.ts` **16/16** verts (8 nouveaux) ;
  `bun run build` (tsc) OK.
- `services/gateway` : `tsc --noEmit` **0 erreur** (client Prisma régénéré).
- Suites routes conversation : **15 suites / 166 tests** verts.
- Suites `messages|search` : **19 suites / 615 tests** verts.

## Backlog (candidats consignés pour une itération future)
- **Finding 3 (itér. 178)** : `apps/web/utils/user-language-preferences.ts:42-75` —
  `getUserLanguageChoices` émet des codes lowercasés mais NON normalisés
  (`'pt-br'`) comme cibles de traduction, divergeant de
  `resolveUserPreferredLanguage` (`'pt'`). Passer chaque pref par
  `normalizeLanguageCode` avant d'émettre `code`.
- `MeeshySocketIOManager.ts:752` — ordre de résolution différent
  (`username ?? displayName ?? …`, sémantique « présence key ») : hors périmètre
  de ce helper, à ne PAS uniformiser sans analyse dédiée.
- F69 (`sanitizeFileName` overlong sans extension) : latent, 0 appelant.
# Iteration 179 — Avatar de participant : deux surfaces (`call:initiated` replay + dashboard) divergent de la source unique `resolveParticipantAvatar`

## Protocole (démarrage)
`main` @ `eb7e162` (dernier merge : PR #2029 — Android feed comment @-mention
autocomplete + shared mention SSOT). Branche `claude/brave-archimedes-imqi9q`
réinitialisée sur `origin/main` (le cycle précédent, itér. 178, a été mergé).
Ce cycle prend **179**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (gateway/shared/web). Recherche menée par sous-agent Explore sur les
fonctions calculant avatar / displayName / résolution de langue / stats agrégées,
à la chasse aux fuites `??`/`||` de chaîne vide et aux divergences de sémantique
entre fonctions lisant la même donnée que la source unique.

## Current state
La source unique `resolveParticipantAvatar` (packages/shared/utils/participant-helpers.ts,
introduite #1925) définit l'ordre canonique : **avatar local du participant → avatar
du compte lié → `null`**, une chaîne vide/blanche étant traitée comme absente. Elle
est branchée dans `routes/conversations/*` et `MessageReadStatusService`. **Deux
autres surfaces ne l'utilisaient pas :**

1. **`services/gateway/src/socketio/CallEventsHandler.ts`** — trois sites (lignes
   1552, 1679, 2031, dans `call:check-active` replay, `call:initiate` success,
   `call:join` broadcast) résolvaient l'avatar par
   `p.participant?.user?.avatar || p.participant?.avatar` — **ordre inversé**
   (compte d'abord). Dans le *même* littéral d'objet, `displayName` était pourtant
   local-first (`p.participant?.displayName || p.participant?.user?.displayName`),
   et l'émetteur frère `MeeshySocketIOManager.ts:1898/2188` fait correctement
   `senderParticipant.avatar || senderParticipant.user?.avatar`.

2. **`services/gateway/src/routes/users/preferences.ts`** — endpoint
   `GET /users/me/dashboard-stats`, transform `recentConversations` (ligne 298) :
   `avatar: conv.avatar ?? otherUser?.avatar ?? null`. `??` ne bascule que sur
   `null`/`undefined` → un `conv.avatar` blanc (`''`/`'   '`) passait verbatim.
   **De plus le champ `avatar` n'était pas déclaré dans le response schema Fastify**,
   donc fast-json-stringify le supprimait silencieusement : avatar calculé mais
   jamais livré au client (calcul mort + feature manquante).

## Problems identified
1. **Avatar inversé pendant les appels.** Un participant avec un avatar local
   par-conversation voyait son avatar de **compte** affiché dans le banner
   d'appel entrant et la roster in-call — le bon `displayName` à côté du mauvais
   avatar.
2. **Fuite chaîne-vide → `<img src="">`.** `||` (call) et `??` (dashboard)
   laissaient fuir `''`/`'   '`, que le navigateur résout en rechargeant l'URL
   de la page courante (requête parasite + image cassée) — le défaut exact
   éliminé partout ailleurs par #1925/#1903.
3. **Avatar de conversation jamais livré (dashboard).** Le champ calculé était
   strippé par le response schema : dead code côté serveur, feature absente côté
   client.
4. **Divergence de sémantique (SSOT non respectée).** Quatre points de résolution
   d'avatar réécrivant la règle produit à la main, avec deux bugs distincts
   (ordre inversé + fuite blanc), au lieu de déléguer à la source unique.

## Root cause
Les trois sites `CallEventsHandler` et le transform dashboard ont été écrits avant
(ou sans rebranchement sur) l'extraction de `resolveParticipantAvatar` (#1925).
Le `||`/`??` encode « absent = null/undefined » là où la règle métier d'une URL
d'avatar est « absent = null/undefined OU chaîne blanche », et l'ordre compte-first
contredit la priorité produit local-first. Le champ dashboard non déclaré au schema
est un oubli classique de fast-json-stringify (strip silencieux des props non
déclarées).

## Business / Technical impact
- **UX** : mauvais avatar (compte au lieu du local) pendant tous les appels ;
  avatar cassé (`<img src="">`) quand l'avatar local est blanc ; avatar de
  conversation absent du dashboard.
- **Réseau** : `<img src="">` déclenche une requête parasite par avatar concerné.
- **Dette** : quatre points de résolution d'avatar hors de la source unique,
  désormais alignés ; un response schema complété.

## Risk assessment
Faible. Les changements source délèguent à un helper déjà couvert (8 cas unitaires)
et déjà utilisé dans 5 fichiers frères avec le même pattern. Le seul changement de
comportement observable est (a) l'ordre local-first pendant les appels, (b) le
blanc traité comme absent, (c) le champ `avatar` désormais livré par le dashboard
(nullable, rétro-compatible : un client qui l'ignore n'est pas affecté).

## Proposed improvements (implémentées)
- `CallEventsHandler.ts` : import + délégation `resolveParticipantAvatar(p.participant)`
  aux trois sites (check-active / initiate / join).
- `preferences.ts` : délégation `resolveParticipantAvatar({ avatar: conv.avatar, user: otherUser })`
  + déclaration `avatar: { type: 'string', nullable: true }` dans le response schema
  `recentConversations`.

## Validation criteria
- `tsc --noEmit` gateway : **0 erreur**.
- Nouveau `CallEventsHandler-avatar-resolution.test.ts` (3 cas, pilote le replay
  `call:check-active`) : local-first, fallback compte sur blanc, jamais de blanc.
- `preferences-dashboard.test.ts` +2 cas : fallback other-user sur `conv.avatar`
  blanc, jamais de blanc livré.
- Mutation-check : réintroduire l'ancien code fait échouer exactement les tests
  correspondants (2 call + 2 dashboard).
- Suites de régression : `CallEventsHandler` 474/474, suites `preferences*` vertes.

## Expected benefits
Avatar de participant cohérent (local-first, blank-safe) sur toutes les surfaces ;
zéro `<img src="">` parasite ; avatar de conversation effectivement livré au
dashboard ; quatre divergences SSOT supprimées par construction.

## Implementation complexity
Faible : 2 fichiers source (4 lignes de logique + 1 import + 1 ligne de schema),
2 fichiers de test.
