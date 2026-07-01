# Iteration 73 — Plan d'implémentation (2026-07-01)

## Objectif
F31 : corriger le bug `truncateFilename` sur les noms **sans extension / dotfiles** (résultat corrompu et
plus long que l'entrée) et résorber le doublon local `truncateText` de `ConversationDropdown` (Single
Source of Truth).

## Modules affectés
- `apps/web/utils/truncate.ts` (source unique — fix `truncateFilename`)
- `apps/web/__tests__/utils/truncate.test.ts` (durcissement des assertions)
- `apps/web/components/contacts/ConversationDropdown.tsx` (adoption source unique)

## Étapes

### Phase A — Fix + dédup
- [x] `truncateFilename` : détection `hasExtension` via `lastIndexOf('.') > 0` (exclut dotfiles),
      `keep = Math.max(1, maxLength - reserved)` (jamais négatif), pas de `.ext` recollée si absente.
- [x] `ConversationDropdown` : suppression fn locale, import `truncateText` de `@/utils/truncate`,
      2 call sites → `.truncated`.

### Phase B — Vérification & livraison
- [x] `jest truncate.test.ts` : 8/8 (dont sans-extension, dotfile, « jamais plus long que l'entrée »).
- [x] `tsc --noEmit` : 0 erreur sur les 2 fichiers touchés.
- [ ] Commit + push `claude/brave-archimedes-eh1b5d` ; merge vers `main`.

## Risques & rollback
- Risque : **très faible**. Fonction pure, comportement inchangé pour les cas avec extension (chemin
  nominal). Rollback = `git revert` du commit.

## Critères de validation
- Aucune sortie de `truncateFilename` plus longue que l'entrée.
- Comportement identique à l'ancien pour les noms **avec** extension.
- 8/8 tests verts, 0 régression tsc.

## Continuité
Iter suivante : protocole v3 (doublons d'import + `tsc`). Cibles candidates non contestées : F31 (reste —
unifier la sémantique des deux `truncateText`), ou zone backend BE1 (`UserPreferences.application`, nécessite
migration Prisma → planifier hors contention web). Éviter conversation header / feed (fichiers chauds).

## Statut
- [x] Phase A — fix + dédup.
- [x] Phase B — 8/8 + tsc propre ; reste : commit + push + merge.
