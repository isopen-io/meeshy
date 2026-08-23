# Plan — Itération 250 : canonicaliser `_findUsersForLanguage` via la SSOT

## Objectives
Router le dernier site de comparaison de codes de langue du gateway
(`_findUsersForLanguage`) par `normalizeLanguageForDedup`, fermant le suivi #1 de
l'itération 249 (audit it. 247).

## Affected modules
- `services/gateway/src/socketio/MeeshySocketIOManager.ts` (méthode + import)
- `services/gateway/src/socketio/__tests__/MeeshySocketIOManager.test.ts` (témoins)

## Implementation phases
1. **RED** — 4 témoins directs (`_findUsersForLanguage` est privé, exercé comme
   dans les 3 témoins pré-existants) : cible taguée vs `resolvedLanguages`
   canonique ; `language` brut vs cible canonique ; cible 639-2 (`'swe'`) ;
   contre-épreuve langues distinctes ⇒ 0.
2. **GREEN** — import `normalizeLanguageForDedup` ; canonicaliser `targetLanguage`
   et le repli `user.language` ; `resolvedLanguages` garde `.includes` (canonique
   par contrat).
3. **Preuve du ROUGE** — revert de la logique (import conservé), 3 témoins
   positifs tombent, restore.

## Dependencies
Aucune. `normalizeLanguageForDedup` existe et est stable (SSOT partagée).

## Estimated risks
Très faibles — idempotence sur codes canoniques, garde anti-troncature de la
SSOT. Méthode sans appelant de production ⇒ zéro risque de régression runtime.

## Rollback strategy
Revert du commit (2 fichiers, changement localisé).

## Validation criteria
- `MeeshySocketIOManager.test.ts` : 392/392.
- `tsc --noEmit` gateway : exit 0.
- 3 témoins positifs prouvés ROUGES sans le fix.

## Completion status
✅ Terminé — analyse + plan + implémentation + preuve du ROUGE + suite verte.

## Progress tracking
- [x] RED (4 témoins)
- [x] GREEN (fix)
- [x] Preuve du ROUGE (revert/restore)
- [x] Suite gateway ciblée verte (392/392)
- [x] tsc gateway exit 0
- [x] Analyse + plan documentés

## Future improvements
Voir § *Future improvements* de l'analyse : web (#1 prochain), backfill base
(#2), arbitrage suppression-vs-câblage du code mort (#3).
