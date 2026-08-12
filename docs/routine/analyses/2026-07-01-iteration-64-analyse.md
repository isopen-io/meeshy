# Iteration 64 — Analyse d'optimisation (2026-07-01)

## Contexte — deuxième régression détectée par le protocole renforcé
Suite iter 63 (restauration de `formatCompactNumber`, PR #1208 / `ef737a0`). Au démarrage d'iter 64,
le **protocole renforcé** (vérifier que les sources uniques récentes existent toujours) a détecté une
**seconde régression du même merge parallèle** : **iter 60 (`isExpired`) a été intégralement
revertée**.

### Diagnostic
- `utils/time-remaining.ts` sur `main` n'exportait **plus** `isExpired` (revenu à l'état iter 59 —
  `formatTimeRemaining` seul).
- Les **6** sites consommateurs (`UserActivitySection`, `admin/share-links`, `conversation-links-section`,
  `share-affiliate-modal`, `chat/[id]`, `links` ×2) étaient revenus au prédicat brut
  `new Date(x) < new Date()`.
- **Cause** : le merge parallèle `9a431658` (« corrections du review présence »), forké d'un `main`
  **postérieur à iter 59 mais antérieur à iter 60/61**, a clobberé `time-remaining.ts` (perte de
  l'ajout `isExpired`) et reverté les 6 conversions. Iter 63 n'avait restauré que iter 61
  (format-number) ; iter 60 restait cassée.

Confirmation : iter 59 (`formatTimeRemaining`, StatusBar/StoryViewer) et iter 62 (`truncate`)
**intacts** — le fork de `9a431658` était bien entre iter 59 et iter 60.

## Décision iter 64 — lot « Restauration de `isExpired` (F28b-restore) »

1. Restaurer `isExpired` dans `utils/time-remaining.ts` + ses tests (récupérés depuis `7f727821`,
   commit d'iter 60 — `formatTimeRemaining` y est inchangé, seul `isExpired` est réintroduit).
2. Re-converger les 6 sites (délégations `isExpired(x)` / suppression des fns locales).

### Garanties
- Ré-application **à l'identique** du diff iter 60 (les 6 fichiers étaient revenus byte-pour-byte à
  l'état pré-iter-60, vérifié par grep des chaînes exactes) → sémantique préservée (`null` → `false`).
- `time-remaining.test.ts` : **13/13** (formatTimeRemaining 8 + isExpired 5) ; `UserDetailSections` +
  `conversation-links-section` : **250/250** ; `tsc` sans erreur sur les 6 fichiers touchés (erreurs
  `tracking-links`/`_TrendingUp` **pré-existantes** sur `main`, hors périmètre).

## Leçon renforcée (routine)
Le protocole de démarrage d'itération a **fonctionné** : il a rattrapé une régression qu'iter 63 avait
manquée (iter 63 n'avait vérifié que `format-number`). **Élargir la vérification à TOUTES les sources
uniques récentes** (format-number, time-remaining::{formatTimeRemaining, isExpired}, truncate,
relative-time, avatar-utils) ET à leurs consommateurs, pas seulement au fichier canonique — un util
peut exister tout en ayant perdu un export et ses consommateurs.

## Consignés pour itérations futures

| # | Constat | Impact |
|---|---------|--------|
| F30 | ~17 sites `navigator.clipboard.writeText` → `copyToClipboard` | MOYEN-HAUT |
| F25b | Validateurs téléphone | MOYEN |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN |

## Gain
Seconde régression corrigée : la source unique `isExpired` et les 6 convergences (iter 60) sont
**restaurées** sur `main`. Le domaine expiration (`formatTimeRemaining` + `isExpired`) est de nouveau
complet et unifié.
