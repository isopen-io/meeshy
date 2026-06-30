# Iteration 47 — Plan d'implémentation (2026-06-30)

## Objectif
Lot « Source unique de la résolution d'avatar participant (F24) ». Centraliser la règle
*avatar local → avatar user → null* dans un helper pur partagé, remplacer les **10 sites
canoniques** gateway iso-comportement, et **corriger le bug de cohérence `notSeenBy`**
(`MessageReadStatusService.ts:868`, fallback `participant.avatar` manquant).

Fichiers cibles :
- `packages/shared/utils/participant-helpers.ts` (nouveau) + `packages/shared/utils/index.ts`
- `packages/shared/__tests__/utils/participant-helpers.test.ts` (nouveau, vitest)
- `services/gateway/src/services/MessageReadStatusService.ts` (3 sites, dont fix 868)
- `services/gateway/src/routes/conversations/{core,search,messages,participants}.ts` (7 sites)
- `services/gateway/src/__tests__/unit/services/MessageReadStatusService.test.ts` (test RED 868)

## Étapes (TDD : RED → GREEN)

### Phase A — shared : helper pur + tests (RED→GREEN)
- [ ] Écrire `participant-helpers.test.ts` (vitest) :
      - `avatar` local présent → renvoie l'avatar local (même si `user.avatar` présent) ;
      - `avatar` local absent (`null`/`undefined`), `user.avatar` présent → renvoie `user.avatar` ;
      - les deux absents → `null` ; entrée `null`/`undefined` → `null` ;
      - `user` à `null` → ne casse pas.
- [ ] Implémenter `resolveParticipantAvatar` :
      `(p?: { avatar?: string|null; user?: { avatar?: string|null }|null } | null) => p?.avatar ?? p?.user?.avatar ?? null`.
- [ ] Exporter depuis `utils/index.ts` (`export * from './participant-helpers.js'`).
- [ ] `bunx vitest run __tests__/utils/participant-helpers.test.ts` → vert.

### Phase B — gateway : test RED du bug notSeenBy
- [ ] Ajouter dans `getMessageReadStatus` un cas : participant actif, sans curseur, ≠ sender,
      `avatar:'local.jpg'`, `user:null` → `result.notSeenBy[0].avatarURL === 'local.jpg'`.
      Doit ÉCHOUER sur le code actuel (renvoie `null`).

### Phase C — gateway : implémentation (GREEN)
- [ ] `import { resolveParticipantAvatar } from '@meeshy/shared/utils/participant-helpers';`
      dans les 5 fichiers cibles.
- [ ] Remplacer les 10 expressions canoniques `X.avatar ?? X.user?.avatar ?? null` par
      `resolveParticipantAvatar(X)`. Inclut `notSeenBy:868` (le fallback local réapparaît).
- [ ] `bun run test -- MessageReadStatusService` → 140/140 (139 existants + 1 nouveau) vert.

### Phase D — Vérification & livraison
- [ ] `cd packages/shared && bun run build` (dist à jour pour le build prod gateway).
- [ ] Sanity gateway jest sur les suites routes touchées si elles existent.
- [ ] Commit + push `claude/sharp-wozniak-4p9870` ; PR vers `main` ; CI verte ; merge.

## Hors périmètre (consigné dans l'analyse)
F24b (CallEventsHandler/MeeshySocketIOManager — ordre/`||` divergents), F24c (web
UserConversationsSection), F2 (staging), F10 (backfill), F23b (audit sémantique).

## Continuité
Iter 48+ : **F24b** (migration des sites à sémantique divergente après décision produit sur
l'ordre local/user et le traitement de `""`) ; puis F24c (web) ; F2/F10 dès fenêtre staging.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — `resolveParticipantAvatar` (`participant?.avatar ?? participant?.user?.avatar ?? null`),
      exporté via `utils/index.ts` → `@meeshy/shared`. vitest **6/6** (local d'abord, fallback user,
      null final, null-safe entrée `null`/`undefined`, `user:null`).
- [x] Phase B — test RED gateway : participant non-vu `avatar:'local.jpg'`/`user:null` →
      `notSeenBy[0].avatarURL` attendu `'local.jpg'`. Échoue sur le code actuel (`null`).
- [x] Phase C — 10 substitutions iso-comportement (`MessageReadStatusService` ×3 dont fix 868 ;
      `core.ts`, `search.ts`, `participants.ts`, `messages.ts` ×5) par `resolveParticipantAvatar`.
      gateway jest : `MessageReadStatusService` **140/140** (139 + 1 nouveau), `messages-routes`
      **169/169**, `conversation-core` + `conversations-search-routes` + `participants` +
      `message-sender-user-select` **192/192**. Aucune régression.
- [x] Phase D — `packages/shared` dist rebuild (`dist/utils/participant-helpers.js`). Reste :
      push `claude/sharp-wozniak-4p9870` + CI verte + merge `main`.

## Résultat
Bug de cohérence d'avatar `notSeenBy` corrigé (prouvé par test RED→GREEN) et 10 réécritures
manuelles de la règle d'avatar unifiées sur une source pure unique. Sites à sémantique divergente
(`||`, ordre inversé) consignés F24b/F24c pour audit produit dédié.
