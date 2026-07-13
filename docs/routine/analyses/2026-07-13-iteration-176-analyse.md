# Iteration 176 — `resolveParticipantAvatar` : la SOURCE UNIQUE d'avatar laisse passer la chaîne vide (`<img src="">` + fallback compte manqué)

## Protocole (démarrage)
`main` @ `345a7a5` (dernier merge : PR #1923 — android/time relative-time long-framing).
Branche `claude/brave-archimedes-fc80ej` réinitialisée sur `origin/main` (0/0).
Ce cycle prend **176**.

PRs ouvertes laissées intactes (périmètres à ne pas toucher) : #1902/#1900
(android/chat), #1901 (`services/gateway/src/utils/normalize.ts`), #1897
(gateway/reactions), #1842 (dependabot TS 6→7). Aucune ne touche
`packages/shared/utils/participant-helpers.ts`.

Environnement : Linux, aucune toolchain Swift/Xcode → surface testable =
TypeScript (web/gateway/shared). **Cible retenue = le backlog explicitement
consigné par l'itération 175** (« candidats consignés pour une itération
future ») : `packages/shared/utils/participant-helpers.ts` →
`resolveParticipantAvatar`, qui porte la **même faiblesse chaîne-vide** que les
mappers story/status corrigés en 175.

## Current state
`resolveParticipantAvatar` est la **source unique** de résolution de l'avatar
d'un participant (avatar local par-conversation → avatar du compte lié → `null`).
Elle est consommée sur des chemins chauds de la gateway :
`MessageReadStatusService` (read receipts, 3 sites), et les routes
`conversations/{core,search,messages,participants}.ts` (payloads de messages,
senders, reply-senders, participants — ~10 sites).

L'implémentation résolvait le fallback par un `??` brut :

```ts
participant?.avatar ?? participant?.user?.avatar ?? null
```

## Problems identified
1. **Fallback compte manqué.** `??` ne bascule que sur `null`/`undefined`, jamais
   sur une chaîne **vide** ou **blanche**. Un participant dont l'avatar local vaut
   `''` (cas réel : avatar par-conversation effacé, ou colonne stockée `''` au lieu
   de `null`) renvoyait `''` — **sans jamais retomber sur l'avatar du compte
   utilisateur pourtant présent**. L'utilisateur perdait sa photo de profil dans
   les read receipts, les listes de participants et les en-têtes de message.
2. **`<img src="">` parasite.** La chaîne `''` propagée dans les payloads
   (`avatar: ''`, `avatarURL: ''`) est rendue côté clients en `<img src="">`, que
   le navigateur résout en **rechargeant l'URL de la page courante** (requête
   réseau parasite + image cassée) — exactement la même pathologie que celle
   corrigée pour les bulles story/status en itération 175.
3. **Divergence avec le frère SSOT.** `getSenderUserId`
   (`packages/shared/utils/sender-identity.ts`), l'autre extracteur d'identité de
   participant, garde **correctement** les chaînes vides
   (`typeof x === 'string' && x` → une string vide chute vers le fallback).
   `resolveParticipantAvatar`, décision produit centralisée « pour supprimer par
   construction les divergences », en ré-introduisait une par inadvertance.

## Root cause
`??` exprime « valeur absente = null/undefined », mais la règle métier de l'avatar
est « valeur absente = null/undefined **OU vide/blanc** ». Les deux ne coïncident
pas. Le pattern correct existait déjà dans le fichier frère (`getSenderUserId`,
garde de vacuité) mais n'avait pas été appliqué ici.

## Business / Technical impact
- **UX** : perte de la photo de profil (fallback compte non déclenché) dès qu'un
  avatar local vaut `''` — read receipts sans visage, incohérence avec le reste de
  l'app qui affiche bien l'avatar de compte.
- **Réseau** : une requête `<img src="">` parasite par avatar concerné, sur des
  surfaces à forte densité (listes de lecteurs, participants).
- **Dette** : une source « unique » qui diverge de son frère SSOT = piège pour la
  prochaine évolution.

## Risk assessment
Très faible. **Signature et forme de retour inchangées** (`string | null`). Le seul
changement de comportement — avatar local `''`/`'   '` → fallback compte puis
`null` (au lieu de `''`) — est strictement une amélioration : aucun consommateur
n'attend qu'un avatar vide soit renvoyé tel quel (ce serait le bug). Les 6 cas
existants (avatar local non vide prioritaire, fallbacks `null`/`undefined`,
null-safety participant) restent identiques et verts.

## Correctif (TDD)
- **RED** : +4 tests dans `__tests__/utils/participant-helpers.test.ts` (avatar
  local `''` → fallback `user.avatar` ; `'   '` blanc → fallback ; `''` sans user
  → `null` ; local `''` + user `''` → `null`). Vérifié : ces 4 échouent sur le
  code d'origine (`Received: ""`), les 6 existants passent.
- **GREEN** : garde de vacuité `hasAvatarContent(value): value is string`
  (`typeof value === 'string' && value.trim().length > 0`), alignée sur le pattern
  de `getSenderUserId`, appliquée aux deux niveaux (local puis compte) via early
  returns. Chaîne vide/blanche → chute vers le niveau suivant, puis `null`.

## Validation criteria
- [x] `resolveParticipantAvatar({ avatar: '', user: { avatar: 'u.jpg' } })` === `'u.jpg'`
- [x] `resolveParticipantAvatar({ avatar: '', user: null })` === `null`
- [x] Anti-régression : les 6 cas existants restent verts (priorité locale, fallbacks null/undefined, null-safety)
- [x] Suite `packages/shared` complète : **46 fichiers / 1358 tests verts** (vitest)
- [x] `bun run build` (tsc) : compilation OK, `dist/utils/participant-helpers.js` régénéré
- [ ] CI verte (post-push)

## Risques / rollback
Risque négligeable : durcissement d'une garde de vacuité sur une fonction pure,
couverte par tests, signature inchangée. Rollback = revert du commit.

## Backlog (candidats consignés pour une itération future)
- Audit des autres résolveurs de champs affichables partagés (`packages/shared/utils/`)
  pour la même faiblesse `??`-vs-chaîne-vide, afin de converger tous les SSOT
  d'identité/présentation sur la garde de vacuité (`getSenderUserId` comme
  référence).
