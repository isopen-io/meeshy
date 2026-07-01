# Iteration 54 — Analyse d'optimisation (2026-07-01)

## Contexte
Suite iter 53 (« Source unique du nom d'affichage (username-first → canonique) — F26b-c », mergée
dans `main` : PR #1161 / `1827303`). Restait consigné **F26b-b** : la dernière copie divergente de
résolution de nom, `apps/web/utils/user.ts::getUserDisplayName`, en ordre **name-first**
(`firstName+lastName` > `displayName` > `username`) — divergent du canonique
`utils/user-display-name.ts` (`displayName` > `firstName+lastName` > `username` > fallback).

Le plan iter 53 désignait iter 54 = converger G5 vers le canonique par délégation **+ réécrire
`utils/user.test.ts`** (flip d'ordre displayName vs firstName+lastName, décision produit assumée),
en supposant « 3 importeurs ».

## Découverte — `utils/user.ts` est du code mort intégral

Cartographie exhaustive des consommateurs (grep sur chaque export + imports par alias/relatif) :

| Export de `utils/user.ts` | Consommateurs en production |
|---------------------------|-----------------------------|
| `getUserDisplayName` | **0** (canonique = `utils/user-display-name`) |
| `getUserFirstName` | **0** |
| `getThreadMemberFirstName` | **0** |
| `formatUserForConversation` | **0** |
| `formatThreadMemberForConversation` | **0** |
| `formatConversationTitle` / `...FromMembers` | **0** |
| `getLanguageFlag` | **0** — les consommateurs importent `utils/language-utils::getLanguageFlag` (module autonome, l.148) |

- **Aucun import** de `@/utils/user` (ni relatif, ni barrel, ni dynamique) hors des tests. Seul
  `__tests__/utils/user.test.ts` importe le module.
- Deux tests le **mockent** (`invite-user-modal.test.tsx`, `user-settings.test.tsx`) via
  `jest.mock('@/utils/user', () => ({ getUserInitials: ... }))`. Ce mock est **stale/inopérant** :
  1. `utils/user.ts` n'exporte **pas** `getUserInitials` ;
  2. les composants réels (`invite-user-modal.tsx`, `user-settings.tsx`) importent `getUserInitials`
     depuis `@/lib/avatar-utils`, jamais depuis `@/utils/user`. Le mock ne recouvre donc rien.

## Décision iter 54 — Suppression (état de l'art : pureté / simplification / mort-code)

Déléguer une fonction que **personne n'appelle** serait cosmétique. La conception propre est de
**supprimer** le module orphelin et son test, et de retirer les deux mocks stale :

| Action | Fichier | Effet |
|--------|---------|-------|
| `git rm` | `apps/web/utils/user.ts` (~200 l.) | Élimine définitivement la dernière copie name-first du résolveur de nom → cluster `getUserDisplayName` **clos** |
| `git rm` | `apps/web/__tests__/utils/user.test.ts` (~287 l.) | Test d'un module mort |
| Edit | `__tests__/.../invite-user-modal.test.tsx` | Retire le `jest.mock('@/utils/user', ...)` stale (10 l.) |
| Edit | `__tests__/.../user-settings.test.tsx` | Retire le `jest.mock('@/utils/user', ...)` stale (4 l.) |

Suppression **sans risque produit** (zéro importeur) et **plus décisive** que la délégation : elle
retire ~490 lignes de code+test mort et 2 mocks trompeurs. Le résolveur canonique
`utils/user-display-name` reste la source unique.

## Baseline runner (parité CI)
- `bun install` OK (postinstall prisma KO réseau, sans impact jest web).
- Baseline vert : `user.test.ts` + `invite-user-modal.test.tsx` + `user-settings.test.tsx` → **91/91**.
- Après suppression : `invite-user-modal.test.tsx` + `user-settings.test.tsx` → **62/62** (les mocks
  stale n'avaient aucun effet — les composants utilisent le vrai `@/lib/avatar-utils`).

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F26c-d | G7 `MemberSelectionStep` initiale d'avatar via `getUserDisplayName(...).charAt(0)` → `getUserInitials` | FAIBLE | Lot initiales séparé |
| F26c-c | Famille C : widgets dashboard preview + `Avatar` mono-lettre | FAIBLE | Intention distincte |
| F25b | Validateurs téléphone | MOYEN | Contrats incompatibles |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN | Audit + backfill |

## Gain
Cluster `getUserDisplayName` **définitivement unifié** : plus aucune copie locale divergente, une
seule source (`utils/user-display-name`). ~490 lignes de mort-code+test supprimées, 2 mocks stale
éliminés (tests moins trompeurs pour la maintenance). Aucun changement de comportement runtime
(module non appelé). Prochain grain naturel : F26c-d (initiale G7) pour finir le sous-cluster
initiales, ou nouveau scout (slug/url, sanitize, date-relative).
