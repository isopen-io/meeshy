# Plan — Itération 289 : garde de saut de ligne final dans `_ends_with_sentence_boundary`

## Objectifs

Faire respecter la règle de non-fusion sur un saut de ligne FINAL, que
`rstrip()` détruisait avant que le garde ne l'observe.

## Modules affectés

- `services/translator/src/utils/smart_segment_merger.py` — réordonner le test
  `'\n' in text` avant `text.rstrip()`.
- `services/translator/tests/test_35_voice_audio_utils.py` — 3 tests ajoutés.

## Phases

1. **RED** — ajouter :
   - `TestEndsSentenceBoundary.test_trailing_newline_is_a_boundary`
   - `TestEndsSentenceBoundary.test_newline_with_trailing_spaces_is_a_boundary`
   - `TestMergeShortSegments.test_trailing_newline_prevents_merge`
   Vérifier qu'ils échouent contre le code actuel.
2. **GREEN** — déplacer `if '\n' in text: return True` avant `text = text.rstrip()`,
   supprimer le doublon suivant, commenter l'ordre.
3. **REFACTOR** — aucun (fonction déjà minimale).

## Dépendances

Aucune. Fonction pure, isolée ; aucun autre site à modifier.

## Risques estimés

Négligeables. Réordonnancement local sans changement de signature ni de contrat.

## Stratégie de rollback

`git revert` du commit ; le lot est un seul commit atomique (source + tests + docs).

## Critères de validation

- 40/40 tests merger verts (`-k "EndsSentenceBoundary or MergeShortSegments or MergeGroup"`).
- Reproduction empirique : `_ends_with_sentence_boundary("Hello\n")` rend `True`,
  la paire `"a\n"` + `"b"` reste séparée (2 segments).
- Les échecs restants de `test_35` sont uniquement les suites dépendantes de
  librosa/ffmpeg/pyannote absents, inchangés.

## Statut d'achèvement

LIVRÉ. Source corrigée, 3 tests ajoutés (RED→GREEN vérifié), aucune régression.

## Améliorations futures (suivi, hors périmètre)

- `smart_segment_merger.py:105–110` — la fenêtre fixe `text[-4:]` pour détecter un
  émoji final peut couper un cluster de graphèmes long (drapeau, ZWJ, teinte de
  peau) ⇒ candidat de suivi (spéculatif, faible impact).
- `pipeline_cache.py:215` — `get_top_pairs` annoté `list[Tuple[str, str]]` renvoie
  en réalité `(str, int)` (position via `enumerate`) ⇒ dette d'annotation, à
  corriger avec un vérificateur de types.
