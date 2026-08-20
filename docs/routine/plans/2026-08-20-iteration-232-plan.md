# Iteration 232 — Plan : couleur d'identité par auteur + langue servie exacte (rang Focal)

**Analyse** : `docs/routine/analyses/2026-08-20-iteration-232-analyse.md`
**Branche** : `claude/brave-archimedes-1dkv3w`

## Objectives
1. Restaurer une couleur d'IDENTITÉ par auteur pour le filet de citation Focal (`resolveFocalAuthorAccent`).
2. Nommer la langue RÉELLEMENT servie par ordre de priorité du Prisme, pas par correspondance de valeur
   (`resolveFocalMessageDisplay`).

## Affected modules
- `apps/web/components/conversations/focal/focal-row-utils.ts` (2 fonctions + 1 helper interne)
- `apps/web/components/conversations/focal/__tests__/focal-row-utils.test.ts` (imports + 2 describe)
- `docs/routine/analyses/2026-08-20-iteration-232-analyse.md`
- `docs/routine/plans/2026-08-20-iteration-232-plan.md`

## Implementation phases
1. **RED** — réécrire le describe `resolveFocalAuthorAccent` (parité `colorForName` + deux auteurs
   distincts) ; ajouter un describe `resolveFocalMessageDisplay` (texte+langue, original, court-circuit
   langue d'origine, collision de texte `pt`/`gl`). Prouver l'échec. ✅ RED : 3 rouges.
2. **GREEN** — `resolveFocalAuthorAccent` → `colorForName` ; `resolveFocalMessageDisplay` →
   `focalServedLanguage` (lecture par ordre de priorité). Docstrings corrigées. ✅
3. **Validation** — suite ciblée + dossier focal complet + `tsc --noEmit` (delta nul). ✅

## Dependencies
Aucune. Setup CI-parité en place (`bun install --ignore-scripts`, prisma generate, shared build).

## Estimated risks
Très faible — SSOT existante déjà testée (`colorForName`) ; nouvelle dérivation de langue provablement
équivalente à la loi partagée sur tout cas atteignable (voir analyse). Zéro changement de signature,
format ou contrat ; aucun consommateur touché.

## Rollback strategy
`git revert` du commit unique. Aucune migration, aucun état, aucun changement de schéma/API.

## Validation criteria
- RED : 3 tests rouges avant fix (parité couleur, distinction auteurs, langue servie).
- GREEN : `focal-row-utils.test.ts` 22/22 ; dossier focal 132/132 ; `tsc` sans nouvelle erreur.

## Completion status
**TERMINÉ.** Fix + tests + docs livrés, gates verts.

## Progress tracking
- [x] Analyse + audit anti-doublon (13 PRs)
- [x] Tests RED prouvés (3 rouges)
- [x] Fix GREEN (2 fonctions + helper)
- [x] Suite focal complète (132/132) + typecheck delta nul
- [ ] Commit + push

## Future improvements
- `rebuildInfiniteConversationPages` (`lib/conversations/infinite-cache.ts`) : garde `pages === []`
  manquante (`TypeError` sur `pages[-1]`) — itération dédiée à faible périmètre (zone cache sensible).
- Règle lint interdisant de dériver une langue servie par correspondance de valeur (préférer la lecture
  par ordre de priorité) — candidat outillage, bloqué tant que l'ESLint du repo est cassé (env
  ESLint 10 + eslint-plugin-react).
