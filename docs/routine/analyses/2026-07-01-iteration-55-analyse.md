# Iteration 55 — Analyse d'optimisation (2026-07-01)

## Contexte
Suite iter 54 (« Suppression du module mort `utils/user.ts` », mergée dans `main` : PR #1163 /
`e17d494`). Le cluster `getUserDisplayName` est **clos** — la source unique de résolution de nom est
`utils/user-display-name`, et la source unique des **initiales** est `lib/avatar-utils::getUserInitials`
(dérive du nom canonique via le découpeur `utils/initials::getInitials`).

Note parallélisme : un agent concurrent avait produit une itération 54 strictement identique (PR #1164,
fermée sans merge comme doublon). La continuité désigne pour l'itération suivante le sous-cluster
**initiales** encore divergent : **F26c-d**.

## Constat — dernière dérivation d'initiale manuelle : `MemberSelectionStep`

`apps/web/components/conversations/steps/MemberSelectionStep.tsx` produit l'initiale de deux
`AvatarFallback` (l.119 liste des candidats, l.183 badges sélectionnés) via :

```tsx
{getUserDisplayName(user).charAt(0).toUpperCase()}
```

### Problèmes (cohérence + état de l'art)
1. **Réimplémentation locale** de la logique d'initiale, alors que tout le reste du produit
   (`ContactsList`, `user-selector`, `MentionAutocomplete`, `SearchPageContent`, `invite-user-modal`,
   `conversation-participants-drawer`, `app/u`, …) utilise `getUserInitials` de `@/lib/avatar-utils`.
2. **Résultat incohérent** : `charAt(0)` ne rend **qu'une** lettre (`J`), là où le canonique
   `getUserInitials` rend **jusqu'à deux** lettres cohérentes avec le nom (`JD` pour « John Doe »,
   mono-mot → 2 premières lettres). L'avatar de la sélection de membres affichait donc une initiale
   différente de tous les autres avatars du produit.
3. **Robustesse** : `getUserInitials` est null/crash-safe (fallback `'??'`) et partage la **même
   source de résolution de nom** que le libellé affiché — l'initiale correspond toujours au nom.

## Décision iter 55 — lot « Source unique des initiales — F26c-d »

| Cible | Avant | Après |
|-------|-------|-------|
| `MemberSelectionStep` l.119 (liste candidats) | `getUserDisplayName(user).charAt(0).toUpperCase()` | `getUserInitials(user)` |
| `MemberSelectionStep` l.183 (badge sélectionné) | idem | `getUserInitials(user)` |

Import ajouté : `import { getUserInitials } from '@/lib/avatar-utils';`. La fonction locale
`getUserDisplayName` (délégation au canonique) **reste** — elle sert toujours les libellés et
`aria-label` (l.113/131/187/193) ; seule la dérivation d'initiale change.

### Garanties de non-régression
- Aucun test ne verrouille l'initiale mono-lettre : le seul test rendant ce composant
  (`create-conversation-modal.test.tsx`) mocke `AvatarFallback` en passthrough et n'assert **pas** sur
  son contenu. Baseline & après changement : **26/26** vert.
- Changement de comportement **borné et bénéfique** : la sélection de membres affiche désormais des
  initiales cohérentes (2 lettres) avec le reste du produit.

## Baseline runner (parité CI)
- `bun install` OK (postinstall prisma KO réseau, sans impact jest web).
- `create-conversation-modal.test.tsx` : **26/26** avant et après.
- `tsc --noEmit` web : **aucune** erreur sur `MemberSelectionStep` / `avatar-utils`.

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F26c-c | Famille C : widgets dashboard preview + `Avatar` mono-lettre | FAIBLE | Intention distincte (preview décorative, pas identité) |
| F25b | Validateurs téléphone | MOYEN | Contrats incompatibles |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN | Audit + backfill |

## Gain
Sous-cluster **initiales d'avatar** unifié : plus aucune dérivation manuelle `charAt(0)` dans
`apps/web` pour un avatar d'identité — une seule source (`lib/avatar-utils::getUserInitials`), des
initiales cohérentes avec le nom affiché partout. Reste F26c-c (widgets décoratifs, intention
distincte) hors périmètre. Prochain grain : nouveau scout hors cluster nom/initiales (slug/url,
sanitize, date-relative, validateurs) ou F26c-c.
