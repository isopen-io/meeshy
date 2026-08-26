# Iteration 241 — Deux primitives de rôle (`hasMinimumRole`, `hasMinimumMemberRole`) étaient les seules à ne PAS normaliser la casse

## Protocole (démarrage)
`main` @ `d3686997` (dernier commit : `merge(composer): lot B sur main - SDK CanvasV3 complet`).
Branche `claude/brave-archimedes-gtr9c0` réalignée sur `origin/main` (0 avance / 0 retard au départ).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité : `bun install --ignore-scripts` (3863 paquets), puis
`npx prisma generate --generator client` + `bun run build` dans `packages/shared`. Suite
`packages/shared` vitest verte au départ (2328/2328), suite `role-types` verte (98 tests).

**Audit anti-doublon** (6 PRs ouvertes au départ : #3241 iOS, #3242/#3243 messages-schemas
`playbackStretch`, #3245 storyEffectsV3, #3247 focal-row-utils, #3248 Android). **Aucune PR
ouverte ne touche `packages/shared/types/role-types.ts` ni sa suite de tests** — zéro
chevauchement de fichier. La cible n'est PAS dans le thème « invariant temporel `end ≥ start` »
saturé par 4 PRs (#3242/#3243/#3245 + les jumeaux mergés) : c'est une **classe de défaut
différente** (normalisation de casse au niveau des primitives de rôle).

## Sélection : **Priorité 2 — feature modernisée (échelle de rôles unifiée) dont deux primitives portent un défaut de cohérence latent**

Le module `role-types.ts` est la source de vérité des rôles (global + membre). Il expose une
famille d'aides : `isGlobalAdmin`, `isGlobalModerator`, `isMemberAdmin`, `isMemberModerator`,
`isMemberCreator`, `hasModeratorPrivileges`, `normalizeGlobalRole`, `isGlobalUserRole`,
`isMemberRole`. **Toutes normalisent la casse de leur entrée SAUF deux** — `hasMinimumRole`
(global) et `hasMinimumMemberRole` (membre), et donc leurs wrappers `isGlobalModerator` /
`isMemberModerator` qui délèguent sans re-normaliser.

## Current state (avant correctif)

### 1) `hasMinimumRole` (global, `role-types.ts:70`)

```ts
export function hasMinimumRole(userRole, requiredRole): boolean {
  /* v8 ignore next 2 -- TypeScript types ensure roles are always in GLOBAL_ROLE_HIERARCHY; || 0 unreachable */
  const userLevel = GLOBAL_ROLE_HIERARCHY[userRole as GlobalUserRole] || 0;
  const requiredLevel = GLOBAL_ROLE_HIERARCHY[requiredRole as GlobalUserRole] || 0;
  return userLevel >= requiredLevel;
}
```

`GLOBAL_ROLE_HIERARCHY` a des clés **UPPERCASE** (`BIGBOSS`, `ADMIN`, `MODERATOR`, …). Un rôle
en autre casse (`'moderator'`) indexe la map comme `undefined → 0` → traité comme non
privilégié. Le commentaire `v8 ignore` affirme même que le `|| 0` est « unreachable » parce
que « TypeScript types ensure roles are always in GLOBAL_ROLE_HIERARCHY » — **prémisse fausse
au runtime** : le cast `as GlobalUserRole` est une fiction de compilation, la valeur réelle
peut venir d'une chaîne persistée ou d'un call site non typé.

### 2) `hasMinimumMemberRole` (membre, `role-types.ts:133`)

```ts
const userLevel = MEMBER_ROLE_HIERARCHY[userRole as MemberRole] || 0;
```

Problème miroir : `MEMBER_ROLE_HIERARCHY` a des clés **lowercase** (`creator`, `admin`,
`moderator`, `member`). Un rôle UPPERCASE (`'ADMIN'`) indexe `undefined → 0`.

### Asymétrie prouvée dans le même fichier

| helper | normalise ? | test « case insensitive » |
|--------|-------------|---------------------------|
| `isGlobalAdmin` (l.281) | ✅ `.toUpperCase()` | ✅ l.187 |
| `isMemberAdmin` (l.298) | ✅ `.toLowerCase()` | ✅ l.206 |
| `isMemberCreator` (l.314) | ✅ `.toLowerCase()` | ✅ l.224 |
| `hasModeratorPrivileges` (l.196) | ✅ `.toUpperCase()` | ✅ l.140 |
| **`isGlobalModerator` (l.291)** | ❌ | ❌ **absent** |
| **`isMemberModerator` (l.307)** | ❌ | ❌ **absent** |

L'absence des tests « case insensitive » sur les deux modérateurs est exactement ce qui a
laissé le défaut survivre : les frères l'avaient, les deux modérateurs non.

## Problems identified

1. **Deux primitives de rôle ne foldent pas la casse alors que toute leur famille le fait.**
   `isGlobalModerator('moderator') === false`, `isMemberModerator('ADMIN') === false` —
   un rôle valide, dans la mauvaise casse, se voit refuser un privilège qu'il possède.
2. **Fail-closed silencieux.** L'échec ne lève rien : la fonction retourne `false` (niveau 0).
   Un modérateur/admin dont le rôle arrive dans une casse inattendue perd silencieusement ses
   privilèges — p. ex. `PresenceVisibilityService.resolveForTarget` (`isGlobalModerator(viewer.role)`,
   gateway) rendrait `HIDDEN` là où le modérateur doit voir `FULL`.
3. **La fragilité est déjà connue et contournée.** `apps/web` pré-lowercase à DEUX call sites
   (`utils/participant-helpers.ts:37`, `hooks/use-participant-management.ts:25`) avant d'appeler
   `hasMinimumMemberRole` — preuve que des appelants ont dû compenser le défaut à la main. Un
   contournement dispersé n'est pas une garantie : le prochain appelant qui l'oublie obtient une
   réponse fausse.
4. **Commentaire `v8 ignore` à la prémisse fausse.** « TypeScript types ensure roles are always
   in GLOBAL_ROLE_HIERARCHY » décrit une invariance qui n'existe pas au runtime — précisément la
   confiance excessive qui a produit le bug.

## Root causes
- Les deux `hasMinimum*` ont été écrites en indexant directement la map par le cast de type,
  en supposant que le type statique garantit l'appartenance et la casse. Leurs frères ont
  chacun ajouté un `.toUpperCase()`/`.toLowerCase()` explicite ; ces deux-là ne l'ont jamais
  reçu, et leurs wrappers `is*Moderator` délèguent sans compenser. Le trou de test (pas de cas
  « case insensitive » sur les deux modérateurs) a scellé l'omission.

## Business impact
- **Latent, fail-closed, silencieux.** Aucun crash ni corruption : un privilège est refusé à
  tort. Pour le global, `viewer.role` est typé `GlobalUserRoleType` et la colonne Prisma est un
  enum UPPERCASE — donc en pratique le chemin présence ne déclenche pas AUJOURD'HUI. Mais la
  primitive est un **building block partagé exporté** que n'importe quel call site (chaîne
  persistée membre lowercase/UPPERCASE, futur consommateur, test) peut appeler ; sa robustesse
  ne doit pas dépendre de la discipline de casse de chaque appelant. Pour le membre, le défaut
  est **activement contourné** en prod web — donc réel.
- Gain : **cohérence + robustesse** d'une frontière de permission. Les six aides de la famille
  portent désormais la même garantie de casse, gelée par test.

## Technical impact
- **Zéro régression sur les entrées valides.** Un rôle déjà dans la bonne casse est inchangé
  par `.toUpperCase()`/`.toLowerCase()`. Toutes les assertions `toBe(false)` existantes portent
  sur des rôles réellement inférieurs (AGENT, member, stranger, USER, AUDIT, ANALYST) qui
  restent `false` après normalisation — vérifié par la suite complète.
- **Fail-closed préservé pour les rôles INCONNUS.** Le fix `.toUpperCase()`/`.toLowerCase()`
  n'utilise PAS `normalizeGlobalRole` (qui rétrograderait un rôle inconnu vers `USER=10` au lieu
  de `0`). Un `'GUEST'` reste niveau 0 → non privilégié. Gelé par un nouveau test.
- **Types inchangés.** Signatures identiques, `z.infer` sans objet ici.
- **Coverage :** l'annotation `v8 ignore` globale est resserrée du couple de lignes à la seule
  ligne `requiredLevel` (toujours un enum valide en interne) ; la ligne `userLevel || 0` est
  désormais couverte par un test « unknown role → false ».

## Risk assessment
- **Faible.** `hasMinimumRole` n'a d'autre appelant que `isGlobalModerator` (grep). 3 call sites
  pour `isGlobalModerator` (présence). `hasMinimumMemberRole` : `isMemberModerator` + 2 sites web
  qui pré-lowercasent déjà (double-lowercase idempotent, aucun changement pour eux) + tests.
  Le changement est purement ADDITIF (il ne fait que reconnaître plus d'entrées) : aucun résultat
  actuellement `true` ne bascule à `false`.
- **Rollback :** retirer les deux `.toUpperCase()`/`.toLowerCase()` et les tests ajoutés.

## Proposed improvements
1. **RED** : ajouter dans `role-types.test.ts` les tests « case insensitive » manquants pour
   `isGlobalModerator`, `isMemberModerator`, `hasMinimumRole`, `hasMinimumMemberRole` (miroir
   exact des tests des frères `isGlobalAdmin`/`isMemberAdmin`). 6 tombent rouges sur `main`.
2. **GREEN** : case-fold l'entrée dans les deux primitives (`.toUpperCase()` côté global,
   `.toLowerCase()` côté membre), en conservant `|| 0` pour le fail-closed des rôles inconnus.
   Corriger le commentaire `v8 ignore` à la prémisse fausse. Ajouter un test « unknown role →
   false » pour couvrir le `userLevel || 0` global désormais atteignable.

## Expected benefits
- **Cohérence de la famille.** Les six aides de rôle folded la casse à l'identique, gelé par test.
- **Robustesse d'une frontière de permission** : la normalisation vit dans la primitive, plus
  dans la mémoire de chaque appelant (les 2 contournements web deviennent redondants).
- **Fail-closed préservé** pour les rôles réellement inconnus.

## Implementation complexity
- **Trivial.** 1 fichier de production (2 primitives, +2 `.toXCase()` + docstrings + annotation
  resserrée), 1 fichier de test (+7 tests). Aucun changement de type, aucun changement de
  comportement pour les entrées valides.

## Validation criteria
- [x] RED : 6 tests « case insensitive » tombent rouges sur `main`.
- [x] GREEN : `role-types.test.ts` → 105/105 (98 + 7).
- [x] Suite `packages/shared` vitest complète → 2335/2335 (2328 + 7), 96 fichiers.
- [x] Gateway consommateur (`isGlobalModerator` en présence) : `[Pp]resence|role` → 53/53 (7 suites).
- [x] `tsc --noEmit` propre sur `packages/shared` ET `services/gateway`.
- [x] Aucun test existant ne dépendait de la casse-sensibilité buguée (grep exhaustif).
- [ ] CI verte sur la PR (gate lint/bun réel).

## Améliorations futures (hors périmètre de cette itération)
- **Retrait des 2 contournements web** (`participant-helpers.ts:37`,
  `use-participant-management.ts:25`) : le `.toLowerCase()` de call site est désormais
  redondant (la primitive normalise). Retrait sûr mais touche `apps/web` + ses tests — à faire
  dans une passe web-ready dédiée pour garder cette itération atomique sur `packages/shared`.
- **SSOT du set « rôles globaux privilégiés »** (candidat 3 du scan) : la liste
  `['MODERATOR','ADMIN','BIGBOSS']` est recopiée à la main dans
  `conversation-helpers.ts:346` (`canEditMessage`) et `messageEditAdmission.ts:59`
  (`PRIVILEGED_GLOBAL_ROLES`). Maintenant que `isGlobalModerator` folde la casse, elle devient
  un drop-in sûr pour ces deux sites (CREATOR est un rôle MEMBRE, absent de
  `GLOBAL_ROLE_HIERARCHY` → correctement non privilégié). Refactor à peser séparément (touche
  deux chemins de permission bien testés — risque MOYEN, valeur SSOT).
