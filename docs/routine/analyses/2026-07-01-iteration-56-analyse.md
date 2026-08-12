# Iteration 56 — Analyse d'optimisation (2026-07-01)

## Contexte
Suite iter 55 (« Source unique des initiales — MemberSelectionStep → getUserInitials », mergée dans
`main` : PR #1167 / `5967e2f`). Le sous-cluster initiales dans les composants de **conversation** est
clos. Scout iter 56 : dérivations d'initiales manuelles restantes ailleurs (famille C, F26c-c).

## Constat — dérivations d'initiales manuelles résiduelles (scan `apps/web`)

| Emplacement | Dérivation | Type |
|-------------|-----------|------|
| `app/admin/users/page.tsx:351` (ligne desktop) | `user.displayName?.charAt(0) \|\| user.username.charAt(0).toUpperCase()` | **User d'identité** |
| `app/admin/users/page.tsx:401` (carte mobile) | idem | **User d'identité** |
| `components/contacts/**` (ContactsList + 4 tabs) | `getUserDisplayName(x).slice(0, 2).toUpperCase()` | User d'identité (prop) |
| `app/u/[id]/page.tsx:346` | `getUserDisplayName(user).slice(0, 2).toUpperCase()` | User d'identité |
| `components/conversations/details-sidebar/DetailsHeader.tsx:68,83` | `displayName.charAt(0)` | **nom de conversation** (pas User) |
| `components/conversations/conversation-links-section.tsx:237` | `firstName?.charAt(0) \|\| username?.charAt(0)` | creator |

### Choix du lot iter 56 — `app/admin/users/page.tsx` (le plus atomique et net)
Les deux avatars de la page admin/users (tableau desktop + carte mobile) dérivent l'initiale via
`user.displayName?.charAt(0) || user.username.charAt(0).toUpperCase()` :
- **une seule lettre**, et **incohérente** : `displayName?.charAt(0)` n'est pas mis en majuscule
  (seul le fallback `username` l'est) → un `displayName` « alice » affiche « a » minuscule.
- réimplémentation locale ignorant `firstName`/`lastName` et le trim.

`getUserInitials(user)` (`@/lib/avatar-utils`) résout le nom canonique (displayName >
firstName+lastName > username), rend **deux lettres majuscules cohérentes** (`AL`, `JD`), est
null-safe (`'??'`), et partage la source de nom avec le libellé affiché juste à côté
(`{user.displayName || user.username}`).

Les autres cibles (contacts `.slice(0,2)`, `app/u`, DetailsHeader nom-de-conversation) sont reportées :
la famille contacts reçoit `getUserDisplayName` en **prop** (refactor multi-fichiers), et DetailsHeader
opère sur un **nom de conversation**, pas un User → hors périmètre initiales-utilisateur.

## Décision iter 56 — lot « Source unique des initiales — admin/users — F26c-c(a) »

| Cible | Avant | Après |
|-------|-------|-------|
| `app/admin/users/page.tsx:351` | `user.displayName?.charAt(0) \|\| user.username.charAt(0).toUpperCase()` | `getUserInitials(user)` |
| `app/admin/users/page.tsx:401` | idem | `getUserInitials(user)` |

Import ajouté : `import { getUserInitials } from '@/lib/avatar-utils';`. Le `User` de
`@/services/admin.service` est structurellement compatible avec `UserNameSource` (champs de nom).

### Garanties de non-régression
- **Aucun test** ne couvre la page liste `app/admin/users/page.tsx` (seul `[id]/page.test.tsx`
  teste la page détail) → pas de contrat verrouillé.
- `tsc --noEmit` : `getUserInitials(user)` compile sans erreur ; les 2 erreurs pré-existantes
  (`.data` l.66-67) sont **antérieures** (présentes à l'identique sur `main`, décalées de +1 par
  l'import) et non introduites par ce lot.
- Changement **borné et bénéfique** : initiales à 2 lettres majuscules cohérentes avec le libellé.

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F26c-c(b) | Famille contacts (`ContactsList` + 4 tabs) `getUserDisplayName(x).slice(0,2)` → `getUserInitials` | FAIBLE | `getUserDisplayName` passé en prop — refactor multi-fichiers coordonné |
| F26c-c(c) | `app/u/[id]/page.tsx:346` `.slice(0,2)` → `getUserInitials` | FAIBLE | Page profil, à grouper |
| F26c-e | `DetailsHeader` initiale de **nom de conversation** (pas User) | FAIBLE | Hors cluster user-initials ; besoin d'un canonique string dédié |
| F25b | Validateurs téléphone | MOYEN | Contrats incompatibles |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN | Audit + backfill |

## Gain
Page admin/users : initiales d'avatar cohérentes (2 lettres majuscules, source de nom canonique),
correction du bug de casse `displayName?.charAt(0)` non-majusculé, une source unique de plus
(`getUserInitials`). Prochain grain : F26c-c(b) famille contacts (refactor prop coordonné) ou
F26c-c(c) page profil.
