# Iteration 125 — Plan d'implémentation (2026-07-07)

> Fichier suffixé (`-emoji-extract-cjk`) pour éviter le clobber de chemin entre sessions parallèles.

## Objectives
Corriger F91 : la branche `[\U000024C2-\U0001F251]` de l'`EMOJI_PATTERN` de `text_segmentation.py` est une
plage traversant les blocs CJK/Kana/Hangul ; `extract_emojis()` extrait donc des phrases entières CJK
comme « emoji » et les retire du flux de traduction → texte chinois/japonais/coréen jamais traduit.

## Affected modules
- `services/translator/src/utils/text_segmentation.py` — `EMOJI_PATTERN`, branche l.32.
- `services/translator/tests/test_19_text_segmentation.py` — +3 tests de régression.

## Implementation phases
1. **RED** — 3 tests : CJK/JP/KO extrait comme emoji (bug) → doit rester intact avec map vide ; mixte
   CJK+emoji → seul l'emoji extrait ; emoji encadrés (Ⓜ/🈵/🅰/🉐/🇫🇷/㊗) toujours extraits. (Vérifié
   empiriquement rouge : `extract_emojis("你好世界")` renvoyait `("🔹EMOJI_0🔹", {0:"你好世界"})`.)
2. **GREEN** — remplacer `[\U000024C2-\U0001F251]` par `[\U0001F100-\U0001F251]` (Enclosed
   Alphanumeric/Ideographic Supplement, sans traverser aucun bloc de script).
3. **REFACTOR** — commentaire d'avertissement détaillé sur place (piège de plage + pourquoi les autres
   code points encadrés sont déjà couverts ailleurs).

## Dependencies
Aucune. Pas de changement d'API/signature/dépendance. `pytest` installé localement pour validation.

## Estimated risks
Très faibles. La branche est resserrée à l'ensemble emoji réellement visé ; les emoji encadrés hors
supplément (Ⓜ, ㊗, ㊙, indicateurs régionaux) sont déjà couverts par d'autres branches — aucune
régression d'extraction emoji (vérifié sur le pattern complet réel).

## Rollback strategy
Revert du commit (1 source + 1 test + 2 docs). Aucun état persistant.

## Validation criteria
- [x] `tests/test_19_text_segmentation.py` : 89/89 (86 + 3).
- [x] Répro avant/après sur le module réel : CJK extrait → CJK préservé ; tous emoji préservés.
- [x] Diff minimal (1 branche regex + commentaire, 3 tests).

## Completion status
**COMPLET** — fix + tests appliqués, suite verte (89/89). Prêt pour commit + push + PR.

## Progress tracking
- [x] Cible identifiée (suite du backlog F90 : audit des autres EMOJI_PATTERN)
- [x] Vérification empirique du bug (extraction CJK sur le module réel)
- [x] RED / GREEN / REFACTOR
- [x] Analyse + plan documentés
- [ ] Commit + push + PR + merge dans `main`

## Future improvements
Remplacer les `EMOJI_PATTERN` artisanaux du repo (translator + web/shared) par une détection Unicode
emoji maintenue (`\p{Emoji}` via le module `regex`, ou table de plages générée). Ajouter un test
garde-fou transverse : aucun pattern emoji ne doit matcher un échantillon CJK/Kana/Hangul. F89/F90/F91
ont épuisé les 3 occurrences connues de ce piège dans le translator ; vérifier web/shared en priorité.
