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
