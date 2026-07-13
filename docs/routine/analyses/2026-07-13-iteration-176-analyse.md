# Iteration 176 — `resolveParticipantAvatar` : `??` laisse fuir la chaîne vide (avatar local `''` → `<img src="">` au lieu du fallback compte)

## Protocole (démarrage)
`main` @ `1cda66f` (dernier merge : PR #1924 — android/chat message ordering SSOT).
Branche `claude/brave-archimedes-tdzs6r` réinitialisée sur `origin/main` (0/0).
Ce cycle prend **176**.

PRs ouvertes laissées intactes (périmètres à ne pas toucher) : la vague
Dependabot #1905..#1922 (bumps deps web/gateway/translator) et #1842 (TS 6→7).
Aucune ne touche `packages/shared/utils/participant-helpers.ts`.

Cible retenue : **le backlog explicite consigné par l'itération 175** —
`resolveParticipantAvatar` porte la MÊME faiblesse chaîne-vide que les mappers
story/status corrigés au cycle précédent, mais côté **source unique partagée**
(gateway), sur un chemin chaud (avatar de chaque `sender`/participant sérialisé
par les routes conversations + `MessageReadStatusService`).

Environnement : Linux, aucune toolchain Swift/Xcode → surface testable =
TypeScript. `packages/shared` : vitest, 46 suites / 1356 tests.

## Current state
`resolveParticipantAvatar` est la **source unique** de résolution de l'avatar
d'un participant (avatar local par conversation → avatar du compte lié → `null`).
Utilisée sur 10 sites gateway hot-path :
`routes/conversations/{core,search,messages,participants}.ts` (avatar de chaque
`sender`, `replySender`, `original.sender`, participant listé) et
`services/MessageReadStatusService.ts` (avatarURL des lecteurs). Implémentation :

```ts
participant?.avatar ?? participant?.user?.avatar ?? null;
```

## Problems identified
1. **Chaîne vide qui fuit → `<img src="">`.** `??` ne bascule que sur
   `null`/`undefined`. Un participant avec `avatar: ''` (cas réel : avatar
   par-conversation effacé, ou champ vide en base) renvoyait `''` au lieu de
   retomber sur l'avatar du **compte** (`user.avatar`). Le client rendait alors
   un `<img src="">` — que le navigateur résout en **rechargeant l'URL de la page
   courante** (requête réseau parasite + image cassée), exactement le défaut
   corrigé côté web à l'itération 175 (story/status transforms).
2. **Ordre de fallback court-circuité.** Pire qu'une simple valeur vide : la
   présence d'un `avatar: ''` local **masquait** un `user.avatar` valide. Un
   utilisateur avec une photo de compte parfaitement bonne apparaissait sans
   avatar dès qu'un avatar local vide traînait.
3. **Divergence avec la règle produit déjà unifiée.** L'itération 175 a acté que
   « valeur absente = null/undefined **OU vide/blanc** » pour l'identité affichée
   (nom via `getUserDisplayName` avec `.trim()`). L'avatar de cette même source
   unique restait sur la sémantique `??` incohérente.

## Root cause
`??` encode « absent = null/undefined », mais la règle métier d'un avatar est
« absent = null/undefined **OU chaîne blanche** » (une URL vide n'est pas une
URL). Les deux ne coïncident pas ; la coalescence brute laissait donc passer le
cas vide et cassait l'ordre de priorité local→compte.

## Business / Technical impact
- **UX** : perte d'avatar sur des participants/expéditeurs disposant pourtant
  d'une photo de compte, dès qu'un avatar local vide existe — incohérence
  visible partout où la gateway sérialise un `sender`.
- **Réseau** : `<img src="">` déclenche une requête parasite par avatar concerné
  (rechargement de la page courante).
- **Dette** : dernier point de fuite chaîne-vide de la résolution d'identité,
  désormais aligné sur la décision produit unifiée en 175.

## Risk assessment
Très faible. La **signature et le type de retour sont inchangés**
(`string | null`) — aucun des 10 consommateurs gateway n'est impacté. Le seul
changement de comportement (`''`/blanc → fallback compte, puis `null`) est
strictement une amélioration et ne peut pas produire d'avatar là où il n'y en
avait pas légitimement.

## Correctif (TDD)
- **RED** : +2 tests dans `__tests__/utils/participant-helpers.test.ts`
  (avatar local `''`/`'   '` → fallback `user.avatar` ; deux valeurs blanches →
  `null`). Vérifié : les 2 échouent sur le code d'origine (`Received: ""`), les
  6 existants passent.
- **GREEN** : helper local `isNonBlankAvatar` (type guard `typeof === 'string' &&
  trim() !== ''`) + résolution par `[local, compte].find(isNonBlankAvatar) ?? null`.
  Pas de boucle, immuable, composition — conforme au style du repo.

## Validation criteria
- `__tests__/utils/participant-helpers.test.ts` : 8/8.
- Suite `packages/shared` complète : **46 suites / 1356 tests** verts.
- `bun run build` (tsc `--project`) : **exit 0**, `dist` régénéré.

## Backlog (candidats consignés pour une itération future)
- Aucun nouveau point chaîne-vide identifié sur la résolution d'identité après ce
  cycle. La règle « absent = null/undefined OU blanc » est désormais homogène
  entre web (`getUserDisplayName`, story/status) et shared
  (`resolveParticipantAvatar`).
