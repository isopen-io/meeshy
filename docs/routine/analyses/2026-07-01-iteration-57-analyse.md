# Iteration 57 — Analyse d'optimisation (2026-07-01)

## Contexte
Suite iter 56 (« Source unique des initiales — admin/users → getUserInitials », mergée dans `main` :
PR #1170 / `ea749a8`, qui incluait aussi la réparation d'une régression main-HEAD sur `Test gateway`
— mock `createUnifiedAuthMiddleware` manquant dans `profile-extended.test.ts`).

Continuité désignée : **F26c-c(b)** — la **famille contacts** dérive les initiales d'avatar via
`getUserDisplayName(x).slice(0, 2).toUpperCase()` (2 premiers **caractères** du nom, pas les vraies
initiales).

## Constat — 5 composants contacts avec dérivation `.slice(0,2)`

| Fichier | Ligne | Cible |
|---------|-------|-------|
| `components/contacts/ContactsList.tsx` | 91 | `getUserDisplayName(contact).slice(0, 2).toUpperCase()` |
| `components/contacts/tabs/PendingRequestsTab.tsx` | 76 | `getUserDisplayName(otherUser).slice(0, 2)...` |
| `components/contacts/tabs/ConnectedContactsTab.tsx` | 89 | `getUserDisplayName(otherUser).slice(0, 2)...` |
| `components/contacts/tabs/AffiliatesTab.tsx` | 68 | `getUserDisplayName(relation.referredUser).slice(0, 2)...` |
| `components/contacts/tabs/RefusedRequestsTab.tsx` | 77 | `getUserDisplayName(otherUser).slice(0, 2)...` |

### Problèmes (cohérence + état de l'art)
1. **Réimplémentation locale** de la logique d'initiale, 5 fois, alors que la source unique
   `getUserInitials` (`@/lib/avatar-utils`) existe et est déjà utilisée partout ailleurs.
2. **Résultat incohérent** : `.slice(0, 2)` prend les 2 premiers **caractères d'un seul mot**
   (`Jo` pour « John Doe »), là où `getUserInitials` rend les vraies initiales (`JD` : 1ʳᵉ du 1er +
   1ʳᵉ du dernier mot). L'avatar de la liste de contacts affichait donc des initiales différentes
   du reste du produit (Telegram/Discord/Slack affichent les vraies initiales).
3. **Robustesse** : `getUserInitials` est null/crash-safe (`'??'`) et partage la **même source de
   résolution de nom** que le libellé affiché.

## Décision iter 57 — lot « Source unique des initiales — famille contacts — F26c-c(b) »

Dans chacun des 5 composants : ajouter `import { getUserInitials } from '@/lib/avatar-utils';` et
remplacer la dérivation `getUserDisplayName(x).slice(0, 2).toUpperCase()` par `getUserInitials(x)`.

Le **prop** `getUserDisplayName` reste (il sert le libellé et l'`alt` de l'avatar) — seule la
dérivation d'initiale change ; pas de modification de signature ni de parent.

### Garanties de non-régression
- **Aucun test dédié** ne rend `ContactsList` ni les 4 tabs pour asserter les initiales (les 2 tests
  qui matchaient le motif — `conversation-preview`, `UserPresenceLabel` — testent d'autres composants
  et ne rendent pas ces composants).
- `tsc --noEmit` : les 5 appels `getUserInitials(x)` compilent sans erreur ; les 2 erreurs
  `pendingRequest.id` (ContactsList l.126/181) sont **pré-existantes** sur `main` (présentes à
  l'identique, décalées de +1 par l'import) — non introduites par ce lot.
- Changement **borné et bénéfique** : vraies initiales cohérentes avec tout le produit.

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F26c-c(c) | `app/u/[id]/page.tsx:346` `getUserDisplayName(user).slice(0,2)` → `getUserInitials` | FAIBLE | Page profil ; lot séparé |
| F26c-e | `DetailsHeader` initiale de **nom de conversation** (pas User) ; `conversation-links-section` creator | FAIBLE | Hors cluster user-initials |
| F25b | Validateurs téléphone | MOYEN | Contrats incompatibles |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN | Audit + backfill |

## Gain
Famille contacts (5 composants) unifiée sur `getUserInitials` : vraies initiales à 2 lettres
cohérentes avec le reste du produit, ~5 réimplémentations locales `.slice(0,2)` supprimées, une
source unique. Prochain grain : F26c-c(c) `app/u/[id]` (dernière `.slice(0,2)` restante), puis
F26c-e (nom de conversation, canonique string dédié) ou nouveau domaine (slug/url, sanitize,
date-relative, validateurs).
