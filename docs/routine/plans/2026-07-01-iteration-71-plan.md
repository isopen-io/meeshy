# Iteration 71 — Plan d'implémentation (2026-07-01)

## Objectif
Sous-lot **F30-f** (cluster exotique) : adopter la source unique `copyToClipboard` dans
`TwoFactorSettings.tsx`, éliminant une fonction locale homonyme (shadowing) qui utilisait `writeText` brut
sans `catch` ni fallback.

## Étapes

### Phase A — Conversion
- [x] Import `copyToClipboard` (`@/lib/clipboard`).
- [x] Renommage de l'helper local `copyToClipboard` → `handleCopy` (async), délégation à la source unique.
      (Renommage impératif : garder le nom aurait recréé le `TS2300` d'iter 70.)
- [x] Mise à jour des 2 `onClick` (secret TOTP, backup codes) → `handleCopy(...)`.

### Phase B — Vérification & livraison
- [x] `tsc --noEmit` : multiset d'erreurs **identique** à la baseline `main` (0 régression).
- [x] `jest TwoFactorSettings` → **14/14** verts.
- [ ] Commit + push `claude/sharp-wozniak-0fc6ol` ; PR vers `main` ; CI verte ; **merge**.

## Continuité
Iter suivante : protocole v3 (détecter doublons d'import), puis F30 sur cluster exotique restant
(`use-message-interactions`, `share-affiliate-modal`, admin links) ou F31 (dédup `truncateText`).
Éviter conversation header / feed (fichiers chauds, forte contention inter-agents).

## Statut (mis à jour en fin d'itération)
- [x] Phase A — conversion + renommage + 2 call sites.
- [x] Phase B — tsc 0 régression + 14/14 ; reste : push + PR + CI + merge.
