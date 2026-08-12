# Iteration 130 — Plan d'implémentation (2026-07-07)

## Objectives
Fermer F93 : rendre **explicite et verrouillé par des tests** le contrat distinct de `truncateText`
(`maxLength` = budget de **contenu**, ellipse ajoutée par-dessus → sortie jusqu'à `maxLength + 3`), en
contraste avec `truncateFilename` (ne dépasse jamais `maxLength`). Zéro changement de comportement.

## Affected modules
- `apps/web/utils/truncate.ts` — docstring de `truncateText` uniquement (aucune logique modifiée).
- `apps/web/__tests__/utils/truncate.test.ts` — tests de régression épinglant le contrat.

## Implementation phases
1. **Docstring** — documenter le contrat de `truncateText` (budget contenu + ellipse en sus, trim de fin,
   flag `isTruncated`), en contraste explicite avec `truncateFilename`.
2. **Tests** — ajouter des cas épinglant :
   - la sortie dépasse `maxLength` de la longueur de l'ellipse (cœur du contrat) ;
   - la frontière `maxLength + 1` déclenche la troncature ;
   - le trim de l'espace de fin avant l'ellipse ;
   - contraste explicite : même entrée/budget, `truncateFilename` ne dépasse pas `maxLength` alors que
     `truncateText` le dépasse de l'ellipse.
3. **REFACTOR** — aucun.

## Dependencies
Aucune. Fonctions pures, sans import partagé.

## Estimated risks
Nul. Aucun code de production modifié (docstring seule) ; tests additifs.

## Rollback strategy
Revert du commit (2 fichiers, sans état persistant).

## Validation criteria
- [x] Nouveaux tests verts (5 cas ajoutés : frontière `max+1`, dépassement ellipse, trim de fin,
      contraste `truncateFilename`).
- [x] `__tests__/utils/truncate.test.ts` intégralement vert (14/14).
- [x] Zéro changement de comportement runtime (docstring + tests seulement).
- [x] `tsc --noEmit` : 0 erreur sur `utils/truncate.ts` et son test.

## Completion status
**COMPLET** — F93 fermé.

## Progress tracking
- [x] Analyse rédigée (`analyses/2026-07-07-iteration-130-analyse.md`).
- [x] Plan rédigé (ce fichier).
- [x] Implémentation + tests (14/14 verts).
- [ ] Commit + push + PR.

## Future improvements
- **F90** (backlog, architecturalement significatif) : message-search — recall des matches de traduction
  plafonné à `take: 200` par fenêtre curseur ; correction propre = recherche JSON côté DB ou keyset dédié.
  Nécessite une décision produit avant implémentation autonome.
