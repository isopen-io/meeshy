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
