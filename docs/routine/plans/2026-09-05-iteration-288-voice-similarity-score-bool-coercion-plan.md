# Plan — Itération 288 : `_merge_group` propage un flottant, plus un booléen

## Objectifs
Faire respecter le contrat `voice_similarity_score: Optional[float]` dans le seul
site d'agrégation (`_merge_group`), en supprimant la coercition booléenne héritée
d'une migration incomplète. Réutiliser la logique de moyenne pondérée par la durée
déjà présente pour `confidence`.

## Modules affectés
- `services/translator/src/utils/smart_segment_merger.py` (helper + `_merge_group`)
- `services/translator/tests/test_35_voice_audio_utils.py` (2 tests réécrits, 2 ajoutés)

## Phases
1. **RED** — réécrire `test_voice_similarity_score_all_truthy` et
   `test_voice_similarity_score_one_none` pour asserter un flottant préservé /
   pondéré ; ajouter `all_none → None` et un cas de pondération par durée.
   Confirmer l'échec contre le code actuel.
2. **GREEN** — introduire `_duration_weighted_mean(group, value)` pur ; l'utiliser
   pour `confidence` et `voice_similarity_score`. Supprimer `is_current_user`.
3. **REFACTOR** — vérifier que `confidence` reste identique (tests existants verts) ;
   `Callable` importé.

## Dépendances
Aucune. Fonction pure, isolée dans `services/translator`.

## Risques estimés
Faible. Le seul risque est une altération du calcul de `confidence` via le helper
partagé — couvert par `test_zero_total_duration_confidence` et le test de moyenne
pondérée existants.

## Stratégie de rollback
Revert du commit unique ; aucune migration de données, aucun changement de contrat.

## Critères de validation
- `pytest tests/test_35_voice_audio_utils.py -v` vert (dont les 4 cas score).
- `confidence` inchangé.
- `voice_similarity_score` : flottant pondéré, `None` si aucun score, jamais booléen.

## Statut de complétion
- [x] RED — 4 tests échouent contre le booléen (`False`/`True` dans un champ float)
- [x] GREEN — helper `_duration_weighted_mean` ; `voice_similarity_score` flottant pondéré
- [x] Validation — `test_35_voice_audio_utils.py` : 85 passed (vs 83 avant), mêmes 47
  échecs pré-existants (deps ML absentes de l'environnement, sans rapport) ;
  `confidence` inchangé ; `py_compile` OK

## Améliorations futures
- Câbler `merge_short_segments` au pipeline de transcription (issue séparée) —
  aujourd'hui importé mais non appelé.
- Retirer le pansement gateway `voiceSimilarityScore=false → null` une fois la source
  fiable sur toute la matrice (issue séparée — hors périmètre, risque de collision).
