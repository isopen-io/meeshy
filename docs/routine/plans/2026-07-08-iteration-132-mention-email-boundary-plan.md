# Iteration 132 — Plan (2026-07-08)

## Cible
**F95** — unifier la frontière gauche de mention (anti-fragment-d'e-mail) sur la SSOT
`NAME_BOUNDARY_LEFT`, dans les cinq regex qui la recompilaient sans elle.

## Files changed
- `packages/shared/utils/mention-parser.ts` — **exporter** `NAME_BOUNDARY_LEFT` (SSOT de la frontière).
- `packages/shared/types/mention.ts` — importer + appliquer la frontière (+ flag `u`) à
  `extractMentions`, `mentionsToLinks`, `MENTION_CONSTANTS.MENTION_REGEX`.
- `services/gateway/src/services/MentionService.ts` — importer + appliquer la frontière (+ flag `u`) à
  `MENTION_REGEX`.
- `apps/web/utils/mention-display.ts` — importer + appliquer la frontière (+ flag `u`) à
  `MENTION_DISPLAY_REGEX` (`resolveDisplayContent`).

## Tests
- `packages/shared/__tests__/mention-extract.test.ts` — 5 cas ajoutés (extractMentions + mentionsToLinks :
  e-mail collé ASCII, accentué/non-latin, mention réelle + fragment voisin).
- `services/gateway/src/__tests__/unit/services/MentionService.test.ts` — **retourner** le test
  `email-like patterns` (entérinait le bug : `toContain('example')`) en `toEqual([])` + 1 cas
  « vraie mention + fragment d'e-mail voisin ».
- `apps/web/__tests__/utils/mention-display.test.ts` — **nouveau** fichier (aucun test préexistant) :
  buildMentionDisplayMap + resolveDisplayContent, dont le cas e-mail collé (RED prouvé
  `bob@Alice Cooper.com`).

## Implementation phases
1. **RED** — ajouter les tests shared ; prouver l'échec contre le code actuel
   (`bob[@alice](/u/alice).com`, `['alice']` au lieu de `[]`).
2. **GREEN** — exporter `NAME_BOUNDARY_LEFT` ; préfixer les quatre regex de
   `${NAME_BOUNDARY_LEFT}` et ajouter `u`. Rebuild `packages/shared/dist` (le gateway/web type-checkent
   contre les `.d.ts` publiés).
3. **REFACTOR** — aucun (la frontière est déjà factorisée dans la SSOT ; on l'expose seulement).

## Dependencies
`NAME_BOUNDARY_LEFT` existait déjà (privé) et est éprouvé par `parseMentions`/`hasMentions`. Le
lookbehind est déjà utilisé partout dans le module (support Node 22 acquis).

## Estimated risks
- Nul sur les vraies mentions : la frontière est zéro-largeur, le charset capturé (`\w-`) et le flag `u`
  ne changent rien pour `\w` (ASCII). Seul un `@` **collé après un caractère de nom** cesse de matcher.
- `matchAll`/`replace` sur regex `g` : `matchAll` clone la regex (pas de fuite de `lastIndex`) — sûr.
- `MENTION_CONSTANTS.MENTION_REGEX` n'a aucun consommateur externe (grep) → changement inerte hors SSOT.

## Rollback strategy
Revert du commit (3 fichiers de prod + 1 export + 3 fichiers de test).

## Validation criteria
- [x] RED prouvé (4 assertions shared + 2 assertions web en échec avant fix).
- [x] shared vitest 1294/1294.
- [x] gateway `MentionService.test.ts` 105/105 (test bug retourné).
- [x] gateway suites mentions (MessagingService/MessageProcessor/posts/messages-advanced) 378/378.
- [x] web `mentions.service.test.ts` 31/31 · web `mention-display.test.ts` 8/8.
- [x] Zéro changement de comportement des vraies mentions.

## Completion status
**COMPLET** — F95 fermé.

## Progress tracking
- [x] Analyse rédigée (`analyses/2026-07-08-iteration-132-mention-email-boundary-analyse.md`).
- [x] Plan rédigé (ce fichier).
- [x] Implémentation + tests (verts).
- [ ] Commit + push + PR + merge.

## Future improvements
- **F96** (backlog) : `apps/web/hooks/composer/useMentions.ts` `MENTION_REGEX = /@([\w-]{0,30})$/`
  (détection au curseur) déclenche l'autocomplétion sur un `@` collé mid-mot (`bob@ali|`). Sémantique
  distincte (token au curseur) → nécessite une décision UX avant d'y appliquer la frontière.
- **F90** (backlog, architecturalement significatif) : message-search — recall des matches de traduction
  plafonné à `take: 200` par fenêtre curseur. Nécessite une décision produit.
