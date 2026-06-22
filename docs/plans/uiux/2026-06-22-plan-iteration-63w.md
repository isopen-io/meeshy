# Plan — Itération 63w (web only)

**Surface** : cohérence de thème (design tokens) sur les empty states web.
**Base** : `main` HEAD `4172b8f` (post iter-62wb #847). Branche `claude/practical-fermat-ep7mkb`.

## Objectif
Aligner les deux composants **empty state rendus en production** sur la charte de
tokens CSS HSL (comme le reste de `components/notifications/`), pour un dark/light
mode correct et theme-safe. Surface **orthogonale** au cluster i18n/Badge en vol.

## Étapes
1. [x] Revue analyses/plans + sync `main` (collisions 60we→62wb absorbées).
2. [x] Identifier les outliers couleurs codées en dur (grep `gray-*`/`white` sur
   `components/notifications/` + tous `*Empty*.tsx`).
3. [x] `NotificationEmptyState.tsx` : `gray-*`/`white` → `bg-card`/`muted`/
   `text-muted-foreground`/`text-foreground`/`border-border` (5 groupes).
4. [x] `NotificationEmptyState.tsx` : fix destructuring `isSearching: _isSearching`
   (retire TS2339 latent).
5. [x] `ConversationEmptyState.tsx` : `bg-white/50 dark:bg-gray-950/50` → `bg-card/50` ;
   `text-white` → `text-primary-foreground`.
6. [x] Vérifier tests (`ConversationEmptyState.test` n'assert que `bg-primary`).
7. [x] Docs analyse + plan + `branch-tracking.md`.
8. [ ] Commit, push, PR ; CI verte ; merge `main` ; supprimer la branche.

## Non-objectifs (hors scope, documentés)
- `NotificationTest.tsx` (dev harness) — `bg-gray-500` intentionnel.
- Pas de changement i18n, de comportement, ni de dépendance.
- `v2/EmptyState*`, `EmptyConversations` déjà conformes — ne pas toucher.

## Critères de succès
- 0 couleur `gray-*`/`white` codée en dur sur les empty states de production.
- `bg-primary` conservé (test vert).
- Type-check CI sans TS2339 sur `NotificationEmptyState`.
