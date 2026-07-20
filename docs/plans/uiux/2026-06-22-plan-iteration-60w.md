# Plan — Itération 60w (web)

## Base
- `main` HEAD `684d33f` (post-merge #774→#794, iter-57w→59w).
- Branche de travail : `claude/practical-fermat-r4vwgd` (repivotée après #775 fermée
  — collision ReelPlayer absorbée par #774).

## Objectif
i18n + a11y de la **modale de configuration globale**
`components/settings/config-modal.tsx` (lazy-loadée, live) — 9 chaînes FR figées
(6 onglets visibles + titre + 2 surfaces a11y) en TOUTES langues. Surface
**orthogonale** au cluster feed/reels/modales fortement contesté (recommandation
explicite `branch-tracking.md` « Next iteration 60 »).

## Étapes
1. [x] Resync branche sur `main` HEAD ; retirer les artefacts 57w superseded.
2. [x] Bloc additif `settings.configModal` (9 clés, dont `tabs.*` ×6) ×4 locales.
3. [x] `config-modal.tsx` → `useI18n('settings')` + 9 `t()` (fallbacks EN 2e arg).
4. [x] Mettre à jour `__tests__/.../config-modal.test.tsx` (mock i18n + assertions EN).
5. [x] Vérif : grep FR vide, parité 9 clés ×4, JSON valide ×4.
6. [x] Analyse 60w + `branch-tracking.md`.
7. [ ] Commit + push + PR ; merge dans `main` après CI vert ; supprimer la branche.

## Contraintes
- Bloc dédié `configModal` (PAS réutiliser `settings.tabs.*` — libellés + ensemble
  distincts). Diffs locale strictement additifs (round-trip JSON).
- Fallbacks EN 2e arg sur les 9 `t()` (anti-flash, leçon 50w).
- Aucune autre frontend (iOS/Android hors périmètre).

## Leçon collision (à appliquer chaque run)
`git fetch origin main` + `list_pull_requests` AVANT de coder ; surface
orthogonale ; en cas de PR jumelle déjà mergée → fermer la sienne, repivoter.

## Suite (61w+)
`PhoneResetFlow.tsx:490` (sr-only indicatif), `AttachmentPreviewReply.tsx:205-206`
(title/aria FR), `app/settings/loading.tsx` (server-side i18n), console.error FR,
`next-themes` orphelin, épuration `settings/_archived/`.
