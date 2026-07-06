# Iteration 118 — Plan d'implémentation (2026-07-06)

## Objectives
Corriger **F85** : `Synthesizer._segment_text` (`services/translator/src/services/tts/synthesizer.py`)
perd silencieusement une phrase/fragment court (< `MIN_SEGMENT_CHARS`) quand il précède une phrase trop
grande pour être fusionnée → mots absents de l'audio TTS synthétisé.

## Affected modules
- `services/translator/src/services/tts/synthesizer.py` — `_segment_text` (2 sites d'écrasement).
- `services/translator/tests/test_20_synthesizer_segmentation.py` — 5 tests neufs.
- Caller (hérité, inchangé) : `synthesize_with_voice` → `tts_service.py` (pipeline audio long-texte).

## Implementation phases
1. **RED** — repro Python verbatim : `"Hi. " + "A"*998 + "."` → `"Hi"` absent. ✅
2. **GREEN** — sites 1 (ligne ~132) & 2 (ligne ~150) : `if current_segment:` avant l'écrasement
   (vider tout buffer non vide) + commentaire. ✅
3. **Test** — `test_20_synthesizer_segmentation.py` (fragment court préservé, ≤ max_chars, fragment
   entre deux longues, texte normal sans perte, texte court). Instance via `__new__`, skip si torch
   absent. ✅
4. **Validation** — repro corrigé GREEN + non-régression 60-phrases ; `py_compile` OK. Test pytest via
   CI translator. ✅

## Dependencies
Aucune. Aucun changement de signature/contrat.

## Estimated risks
Très faible. Au point d'écrasement le buffer est grand en cas normal (comportement inchangé) ; court
seulement dans le cas de bug (désormais préservé). Chaque segment reste ≤ max_chars.

## Rollback strategy
Réversible : restaurer la garde `and len(current_segment) >= MIN_SEGMENT_CHARS` aux deux sites.

## Validation criteria
- [x] RED prouvé (repro Python verbatim).
- [x] GREEN + non-régression (repro).
- [x] `py_compile` source + test.
- [ ] CI « Test Python (translator) » verte (exécution du test 20).

## Completion status
**COMPLET** (côté implémentation + repro). Validation pytest déléguée à la CI (sandbox sans torch).

## Progress tracking
- [x] Analyse (`2026-07-06-iteration-118-analyse.md`).
- [x] Plan (ce fichier).
- [x] Fix `synthesizer.py` (2 sites).
- [x] Test `test_20_synthesizer_segmentation.py`.
- [x] RED→GREEN repro + `py_compile`.
- [ ] Commit + push + PR + CI verte.

## Future improvements
- **F86** (LOW) : dedup traduction premium/basic ignorant le timestamp — intention produit à confirmer.
