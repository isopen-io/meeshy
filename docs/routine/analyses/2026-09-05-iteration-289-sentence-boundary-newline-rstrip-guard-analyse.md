# Itération 289 — la limite de phrase reconnaît enfin un saut de ligne FINAL

## État actuel (avant ce lot)

`services/translator/src/utils/smart_segment_merger.py` fusionne les segments de
mots courts de Whisper (`merge_short_segments`). Une **règle de non-fusion**,
déclarée dans l'en-tête du module (lignes 19–23) et dans la docstring de
`_ends_with_sentence_boundary` (lignes 80–84), interdit de fusionner à travers une
limite de phrase — dont un **retour à la ligne** (`\n`).

`_ends_with_sentence_boundary` vérifie cette limite ainsi (avant ce lot) :

```python
    if not text:
        return False

    text = text.rstrip()  # Enlever les espaces de fin      # ← ligne 94

    # Vérifier les retours à la ligne
    if '\n' in text:                                        # ← ligne 97
        return True
    ...
```

## Problème identifié

**Un garde placé mais désarmé par la ligne qui le précède.** `text.rstrip()` sans
argument retire TOUTE l'espace blanche de fin — **y compris un `\n` final** —
AVANT que le test `'\n' in text` ne s'exécute. Le commentaire prétend n'enlever
que « les espaces de fin » ; `rstrip()` nu mange aussi le saut de ligne que la
ligne suivante cherche.

Scénario défaillant concret (mesuré) :

- `_ends_with_sentence_boundary("Hello\n")` → après `rstrip()` devient `"Hello"`
  → `'\n' not in "Hello"`, dernier caractère `'o'` non ponctuant, pas d'émoji →
  **rend `False`** alors que le contrat exige `True`.
- Au niveau fusion (`_merge_by_criteria` lit `_ends_with_sentence_boundary(previous_seg.text)`
  ligne 206 pour décider) :

  ```python
  s1 = TranscriptionSegment(text="a\n", start_ms=0,   end_ms=100)
  s2 = TranscriptionSegment(text="b",   start_ms=110, end_ms=200)
  merge_short_segments([s1, s2])
  # pause 10ms < 90ms, "a\n b" = 4 chars ≤ 8, limite NON détectée
  # → fusionne à tort en un seul segment "a\n b", écrasant le saut de ligne
  #   qui devait précisément séparer les deux segments.
  ```

Un segment qui se termine **exactement sur un saut de ligne** — le cas MÊME que la
règle existe pour couper — est le seul que le garde ratait.

## Cause racine

Ordre des opérations : le nettoyage `rstrip()` (justifié pour la détection de
ponctuation qui suit) s'exécute AVANT le test du saut de ligne et détruit la donnée
que ce test observe. Le test « saut de ligne au MILIEU » (`"Hello\nworld"`) passe
parce que `rstrip()` ne touche pas un `\n` interne ; seul le `\n` FINAL disparaît,
d'où un défaut invisible aux tests existants.

## Impact métier / technique

- **Métier :** deux segments de transcription séparés par une fin de ligne se
  retrouvent collés dans le même segment fusionné ; la structure de phrase voulue
  par Whisper (et par la règle de non-fusion) est perdue silencieusement.
- **Technique :** fonction pure dont le comportement contredit son propre contrat
  documenté. Le défaut se propage à tout consommateur de `merge_short_segments`.

## Évaluation du risque

Faible. Fonction pure, synchrone. Le correctif ne fait que DÉPLACER le test du
saut de ligne avant `rstrip()` — aucun changement de signature, de type ni de
contrat. Tous les cas voisins (ponctuation, émoji, saut de ligne au milieu,
espaces de fin, CJK) restent inchangés et couverts.

## Amélioration proposée

Déplacer `if '\n' in text: return True` AVANT `text = text.rstrip()`, et retirer le
test désormais redondant qui le suivait. Le commentaire dit pourquoi l'ordre
compte, pour empêcher la régression inverse.

## Bénéfices attendus

- La règle de non-fusion couvre enfin le saut de ligne FINAL, conformément au
  contrat déclaré.
- Comble une lacune de couverture juste à côté d'un test existant (le saut de
  ligne au milieu était testé, la fin de ligne ne l'était pas).

## Complexité d'implémentation

Triviale : deux lignes réordonnées, trois tests ajoutés (2 unitaires + 1 de
comportement au niveau fusion).

## Critères de validation

- RED : `_ends_with_sentence_boundary("Hello\n") is True` et le test de non-fusion
  échouent contre le code actuel (retournent `False` / fusionnent).
- GREEN : `pytest tests/test_35_voice_audio_utils.py -k "EndsSentenceBoundary or
  MergeShortSegments or MergeGroup"` → 40 passés.
- Aucune régression : les seuls échecs restants de `test_35` sont les suites
  dépendantes de librosa/ffmpeg/pyannote absents de l'environnement, inchangées
  par ce lot.
