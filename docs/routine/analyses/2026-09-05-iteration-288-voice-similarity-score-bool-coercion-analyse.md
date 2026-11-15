# Itération 288 — `_merge_group` cesse de coercer `voice_similarity_score` (float) en booléen

## État actuel (avant ce lot)

`services/translator/src/utils/smart_segment_merger.py` fusionne des segments de
mots courts (`merge_short_segments` → `_merge_group`). Le champ fusionné
`voice_similarity_score` est déclaré `Optional[float]` (score de similarité vocale
0→1, cf. `transcription_service.py`, `diarization_service.py`) :

```python
@dataclass
class TranscriptionSegment:
    ...
    voice_similarity_score: Optional[float] = None
```

Mais `_merge_group` calcule, pour un groupe de 2+ segments, un **booléen** et le
stocke dans ce champ flottant :

```python
# is_current_user (True si tous True)
is_current_user = all(s.voice_similarity_score for s in group)   # -> bool
return TranscriptionSegment(
    ...
    voice_similarity_score=is_current_user                        # bool dans un float
)
```

Le chemin mono-segment (`len(group) == 1`) rend `group[0]` intact et conserve le
vrai flottant : selon qu'un segment a été fusionné ou non, le MÊME champ porte un
type DIFFÉRENT.

## Problème identifié

1. **Reliquat de migration incomplète.** `migrate_to_voice_similarity.sh` a renommé
   l'ancien champ `is_current_user: bool` en `voice_similarity_score: Optional[float]`
   par `sed`, mais le CALCUL de `_merge_group` (toujours nommé `is_current_user`,
   toujours `all(...)`) n'a jamais été réécrit. La donnée produite est
   sémantiquement vide : le vrai score du segment fusionné est jeté.

2. **Un champ qui ment sur son type.** `bool` étant sous-classe de `int` en Python,
   le garde de sérialisation `segment_serialization._get_voice_similarity_score`
   (`return score if isinstance(score, (int, float)) else None`) laisse passer
   `True`/`False`, sérialisés en booléen JSON sous `voiceSimilarityScore` — un champ
   que les clients décodent en nombre flottant.

3. **Un symptôme déjà pansé en aval.** Le gateway porte une conversion défensive
   `voiceSimilarityScore=false → null` (témoin
   `services/gateway/src/__tests__/unit/routes/messages-routes.test.ts:969` :
   « attachment transcription with voiceSimilarityScore=false gets converted to
   null »). Ce garde traite le SYMPTÔME ; la cause est ici.

4. **Deux tests qui GRAVENT le bug.** `test_35_voice_audio_utils.py:564-578` assert
   `result.voice_similarity_score is True` et `not result.voice_similarity_score` —
   avec un commentaire qui explique la coercition booléenne. Un test qui atteste le
   comportement fautif ne peut pas tomber sur la régression.

## Cause racine

Migration `is_current_user` → `voice_similarity_score` non terminée dans le seul
site d'AGRÉGATION (`_merge_group`) ; le renommage `sed` a touché la déclaration et
la lecture, pas la logique de réduction.

## Impact métier / technique

- **Métier :** un segment vocal fusionné perd son score de similarité vocale (utilisé
  pour attribuer la voix au locuteur courant / clonage). Valeur remplacée par un
  booléen dénué de sens.
- **Technique :** contrat de fil `voiceSimilarityScore: number|null` violé à la
  source ; le gateway compense, la dette se propage.
- **Portée actuelle :** `merge_short_segments` est IMPORTÉ (`transcription_service.py:33`)
  mais n'est appelé QUE dans le bloc `if __name__ == "__main__"` de démonstration.
  Le défaut est donc un **piège armé** (latent) : correct, testé, isolé, il ne
  frappe le fil client qu'au moment où l'import déjà présent sera câblé au pipeline.
  Le corriger maintenant supprime le piège ET le besoin du pansement gateway.

## Évaluation du risque

Faible. Fonction pure, synchrone, entièrement couverte par des tests unitaires
dédiés. Aucun changement de type partagé ni de contrat de fil (le champ reste
`voiceSimilarityScore: number|null`). Le correctif fait respecter ce contrat au lieu
d'émettre un booléen.

## Amélioration proposée

Propager un flottant REPRÉSENTATIF au lieu du booléen, en réutilisant la logique de
moyenne pondérée par la durée déjà présente pour `confidence` dans la même fonction
(cohérence interne + suppression de duplication) :

- Introduire un helper pur `_duration_weighted_mean(group, value)` qui pondère par la
  durée les segments dont la valeur est non-`None`, avec repli arithmétique en
  durée nulle, et rend `None` si aucune valeur n'est présente.
- L'utiliser pour `confidence` (comportement identique — les confidences sont
  toujours des flottants non-`None`) ET pour `voice_similarity_score`.
- Réécrire les deux tests fautifs en tests de comportement (flottant préservé,
  pondération vérifiée, `None` propagé quand aucun score).

## Bénéfices attendus

- Champ honnête sur son type ; contrat de fil respecté à la source.
- Une seule logique de pondération (DRY), alignée avec la façon dont `confidence`
  est déjà agrégé et avec le site frère `diarization_speechbrain.py:752`.
- Piège armé désamorcé avant qu'il ne frappe le fil client.

## Complexité d'implémentation

Triviale : un helper pur, une fonction modifiée, quatre tests (2 réécrits, 2 ajoutés).

## Critères de validation

- RED : les tests réécrits échouent contre le code actuel (booléen).
- GREEN : `pytest tests/test_35_voice_audio_utils.py` passe ; `voice_similarity_score`
  est un flottant pondéré par la durée, `None` propagé, jamais un booléen.
- `confidence` inchangé (tests existants verts).
- Aucune régression sur la suite translator ciblée.
