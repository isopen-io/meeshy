# Iteration 54 — Analyse d'optimisation (2026-07-01)

## Contexte
Suite iter 53 (« Source unique du nom d'affichage (username-first → canonique) — F26b-c », mergée
dans `main` : PR #1161 / `18273037`). Tout le cluster `getUserDisplayName` délègue désormais au
canonique `utils/user-display-name`, **sauf** G5 (`utils/user.ts`, name-first), consigné F26b-b.

La continuité iter 53 désigne **iter 54 = F26b-b** (G5 name-first → canonique + réécriture du test).
Le scout iter 54 révèle un fait décisif qui **change la nature du lot**.

## Constat décisif — `utils/user.ts` est un module MORT

Audit exhaustif des importeurs (tous styles : alias, relatif, dynamique) :

```
grep "utils/user['\"]" → 3 hits seulement :
  __tests__/utils/user.test.ts               (le test du module)
  __tests__/components/conversations/invite-user-modal.test.tsx:58  jest.mock('@/utils/user', …)
  __tests__/components/settings/user-settings.test.tsx:98           jest.mock('@/utils/user', …)
```

**Aucun code de production n'importe depuis `@/utils/user`.** Les 8 exports du module
(`getUserDisplayName`, `getUserFirstName`, `getThreadMemberFirstName`, `formatUserForConversation`,
`formatThreadMemberForConversation`, `getLanguageFlag`, `formatConversationTitle`,
`formatConversationTitleFromMembers`) sont tous **injoignables**.

Vérification des exports encore « nommés » ailleurs (fausse piste) :
- `getUserDisplayName` (19 fichiers) → importé du **canonique** `@/utils/user-display-name`, pas de
  `utils/user`.
- `getLanguageFlag` (8 fichiers) → importé de `@/utils/language-utils` ou `@meeshy/shared/types`,
  pas de `utils/user`.
- Les 6 autres exports : **0 consommateur**.

### Pourquoi c'est mort maintenant
Iter 51 a redirigé les 3 derniers importeurs (`invite-user-modal`, `user-settings`, `app/u/page`)
de `getUserInitials` vers `@/lib/avatar-utils`. C'était le dernier lien vivant vers `@/utils/user`.
Depuis, le module et son doublon `getUserDisplayName` name-first (G5) ne sont plus atteignables.

Corollaire : les 2 `jest.mock('@/utils/user', () => ({ getUserInitials … }))` sont **ineffectifs
depuis iter 51** (ils mockent un module que le composant sous test n'importe plus) — c'est
précisément pourquoi les suites étaient vertes avec le **vrai** `getUserInitials` d'`avatar-utils`.

## Décision iter 54 — lot « Suppression du module mort `utils/user.ts` (clôture cluster) — F26b-b »

Plutôt que flipper l'ordre de résolution d'une fonction morte (sans effet), **supprimer le dead
code** :

| Lot | Quoi | Impact |
|-----|------|--------|
| A | Supprimer `apps/web/utils/user.ts` (module mort, 8 exports, ~180 lignes) | −180 lignes de dead code ; G5 (name-first) disparaît → cluster `getUserDisplayName` 100 % unifié |
| B | Supprimer son test `__tests__/utils/user.test.ts` (teste le module supprimé) | Cohérence |
| C | Supprimer les 2 `jest.mock('@/utils/user', …)` morts (`invite-user-modal.test.tsx`, `user-settings.test.tsx`) — sinon `jest.mock` échoue à résoudre un module inexistant | Nettoyage ; évite un `Cannot find module` |

### Garanties de non-régression
- Aucun code de production ne dépend du module → suppression sans effet fonctionnel.
- Les 2 suites composant tournent déjà avec le **vrai** `getUserInitials` (mock ineffectif) → retirer
  le mock ne change pas leur comportement (à revalider par jest).
- `getLanguageFlag` / `getUserDisplayName` consommés ailleurs proviennent d'autres modules → intacts.

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F26c-d | Initiale d'avatar de `MemberSelectionStep` via `getUserDisplayName(...).charAt(0)` → `getUserInitials` | FAIBLE | Cosmétique ; lot initiales séparé |
| F26c-c | Famille C : widgets dashboard preview + `Avatar` mono-lettre | FAIBLE | Intention distincte |
| F25b | Validateurs téléphone | MOYEN | Contrats incompatibles |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN | Audit + backfill |

## Gain estimé global
Le cluster `getUserDisplayName` est **entièrement unifié** : le dernier holdout (G5 name-first)
n'était que du dead code, supprimé avec tout son module (~180 lignes), son test, et 2 mocks morts.
Surface web plus petite et plus honnête ; plus aucune réimplémentation divergente de résolution de
nom d'affichage dans `apps/web`.
