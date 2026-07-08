# Iteration 124 — Plan d'implémentation (2026-07-07)

> Fichier suffixé (`-cjk-emoji-range`) pour éviter le clobber de chemin entre sessions parallèles
> (cf. analyse).

## Objectives
Corriger F90 : `EMOJI_PATTERN` de `smart_segment_merger.py` contient une plage regex involontaire
`\U000024C2-\U0001F251` qui englobe les blocs CJK/Kana/Hangul, faisant détecter tout texte chinois/
japonais/coréen comme « emoji » et désactivant le regroupement de segments courts pour ces langues.

## Affected modules
- `services/translator/src/utils/smart_segment_merger.py` — `EMOJI_PATTERN` (l.60) : remplacer la plage
  fautive par les code points emoji réellement visés + commentaire anti-plage.
- `services/translator/tests/test_35_voice_audio_utils.py` — +3 tests (CJK non-boundary, emoji encadrés
  toujours détectés, fusion CJK end-to-end).

## Implementation phases
1. **RED** — 3 tests exposant le bug : `_ends_with_sentence_boundary("你好") is False` (etc.),
   `merge_short_segments` de 2 caractères CJK → 1 segment. (Vérifié empiriquement rouge sur le pattern
   buggy : CJK renvoyait `True`, fusion donnait 2 segments.)
2. **GREEN** — remplacer `"\U000024C2-\U0001F251"` par
   `"\U0001F100-\U0001F1FF" + "\U0001F200-\U0001F251" + "\U000024C2" + "\U00003297\U00003299"`.
3. **REFACTOR** — commentaire d'avertissement documentant le piège de plage sur place ; test attestant que
   les emoji encadrés voulus (Ⓜ, 🈵, drapeau) restent détectés.

## Dependencies
Aucune. Pas de changement d'API, de signature, ni de dépendance. `EMOJI_PATTERN` n'a qu'un seul
consommateur (`_ends_with_sentence_boundary`). `pytest` installé localement pour la validation.

## Estimated risks
Très faibles. Le pattern est strictement **restreint** à l'ensemble emoji voulu ; couverture emoji
vérifiée sans perte (Ⓜ/🈵/㊗/drapeaux restent `True`).

## Rollback strategy
Revert du commit (2 fichiers source/test + 2 docs). Aucun état persistant ni migration.

## Validation criteria
- [x] Classes cibles `test_35_voice_audio_utils.py` : 39/39 (36 + 3 nouveaux).
- [x] Répro avant/après confirmée (CJK `True`→`False`, fusion `2`→`1`, emoji préservés).
- [x] 47 échecs `TestDetectSpeakers*` = pré-existants (`ModuleNotFoundError: numpy` sandbox), confirmés
      par stash — hors périmètre.
- [x] Diff minimal (1 token regex + commentaire, 3 tests).

## Completion status
**COMPLET** — fix + tests appliqués, classes cibles vertes (39/39). Prêt pour commit + push + PR.

## Progress tracking
- [x] Cible identifiée (revue adversariale, surface Python peu auditée)
- [x] Vérification empirique du bug (plage U+24C2..U+1F251 avale CJK/Kana/Hangul)
- [x] RED / GREEN / REFACTOR
- [x] Analyse + plan documentés
- [ ] Commit + push + PR + merge dans `main`

## Future improvements
Auditer les autres définitions `EMOJI_PATTERN` du repo (notamment `text_segmentation.py` côté translator
et les patterns emoji web/shared) pour la même classe de piège de plage traversant un bloc de script.
Envisager de remplacer les patterns emoji artisanaux par une bibliothèque Unicode emoji maintenue.
