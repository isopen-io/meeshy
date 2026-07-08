# Iteration 123 — Plan d'implémentation (2026-07-07)

## Objectifs
Corriger F89 : la classe de caractères de puces de `TextSegmenter.is_list_item` définit une PLAGE
involontaire `[+-•]` (U+002B..U+2022) au lieu d'un ensemble littéral `{-, +, •, *, →}`, classant à tort
toute prose « lettre/chiffre/ponctuation + espace » comme élément de liste.

## Modules affectés
- `services/translator/src/utils/text_segmentation.py` (1 ligne + commentaire)
- `services/translator/tests/test_19_text_segmentation.py` (test de régression + correction commentaire)

## Phases d'implémentation
1. **RED** — Ajouter `test_bullet_range_does_not_swallow_prose` exposant le faux positif
   (`"A dog"`, `"2 apples left"`, `"; punct"`, `"é accent"` → doivent être `False`) + les 5 puces
   littérales toujours `True`. (Vérifié empiriquement que le pattern buggy renvoie `True` sur la prose.)
2. **GREEN** — Échapper le tiret : `r'^[+-•*→]\s+'` → `r'^[+\-•*→]\s+'`.
3. **REFACTOR** — Commentaire d'intention sur le pattern ; corriger le commentaire misdiagnostiqué de
   `test_non_list_items` + ajouter `"A regular paragraph" is False`.

## Dépendances
Aucune. Pas de changement d'API, de signature, ni de dépendance. `pytest` installé localement pour la
validation (parité CI translator).

## Risques estimés
Très faibles. Le fix restreint le pattern à l'ensemble documenté ; aucun vrai positif ne régresse.

## Stratégie de rollback
Revert du commit (2 fichiers). Aucun état persistant ni migration.

## Critères de validation
- [x] `tests/test_19_text_segmentation.py` : 86/86 vert.
- [x] Diff minimal (2 fichiers, 1 caractère de logique + tests).
- [x] Répro avant/après confirmée.

## Completion status
**COMPLET** — fix + test appliqués, suite verte (86/86).

## Progress tracking
- [x] Cible identifiée (revue adversariale, surface Python la moins auditée)
- [x] Vérification empirique du bug (plage U+002B..U+2022)
- [x] RED / GREEN / REFACTOR
- [x] Analyse + plan documentés
- [ ] Commit + push + merge dans `main`

## Future improvements
Balayer les autres regex du translator (`segment_splitter.py`, `text_segmentation.py`) pour des classes
de caractères contenant un `-` interne non échappé (audit ciblé « range trap »). Étendre l'audit
adversarial systématiquement aux utilitaires Python, historiquement moins couverts que le socle TS.
