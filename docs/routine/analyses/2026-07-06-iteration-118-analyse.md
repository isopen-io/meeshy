# Iteration 118 — Analyse d'optimisation (2026-07-06)

## Protocole (démarrage)
`main` @ `4fb48dc32` (post-merge PR #1557 — F84 pagination anonyme), working tree propre. Branche de
travail `claude/brave-archimedes-fru31a` recréée depuis `origin/main`.

Numérotation : docs d'itération sur `main` jusqu'à **114** → ce cycle prend **115**.

### Revue d'ingénierie (constat de démarrage)
Suite directe : le candidat reporté **F85** (identifié et documenté à l'itération 114, « next Python
PR ») a été implémenté ce cycle. Sous-système translator (Python), disjoint de toutes les zones web/
gateway traitées jusqu'ici.

## Cible : F85 — `Synthesizer._segment_text` perd une phrase/fragment court → mots absents de l'audio TTS

### Current state
`services/translator/src/services/tts/synthesizer.py` → `_segment_text(text, max_chars)` découpe un
texte long (> `MAX_SEGMENT_CHARS` = 1000) en segments pour la synthèse vocale (appelé par
`synthesize_with_voice`, chemin TTS long-texte du pipeline audio). Deux « sites d'écrasement »
(constantes : `MIN_SEGMENT_CHARS = 50`) :
```python
else:  # la phrase ne tient pas dans current_segment
    if current_segment and len(current_segment) >= MIN_SEGMENT_CHARS:   # site 1 (ligne 132)
        segments.append(current_segment)
        current_segment = ""
    if len(sentence) > max_chars:
        for part in sentence.split(','):
            ...
            else:
                if current_segment and len(current_segment) >= MIN_SEGMENT_CHARS:  # site 2 (ligne 150)
                    segments.append(current_segment)
                current_segment = part          # ← écrase (drop si buffer court)
    else:
        current_segment = sentence              # ← écrase (drop si buffer court)
```

### Problems identified
- **[LIVE] Perte de texte silencieuse.** Quand `current_segment` est **non vide mais < 50 car.** et que
  la phrase/part suivante ne peut pas y être ajoutée sans dépasser `max_chars`, la garde
  `len(...) >= MIN_SEGMENT_CHARS` **empêche la sauvegarde** ET le buffer **n'est pas vidé** ; l'écrasement
  (`current_segment = sentence`/`= part`) le **jette**. Trace prouvée (repro Node/Python verbatim) :
  `text = "Hi. " + "A"*998 + "."` → segments `["A…"]` seulement ; **« Hi » absent** de l'audio produit.
  Idem pour un fragment court entre deux phrases longues, et dans le chemin de sous-découpe par virgules.
- Déclencheur : une phrase courte (< 50 car.) immédiatement suivie d'une phrase > ~949 car. sans
  ponctuation interne (passages « run-on », langues/ponctuation clairsemée, URLs). Fréquence modérée,
  perte **certaine** sur cette classe d'entrée.

### Root cause
La garde `MIN_SEGMENT_CHARS` sert à **éviter d'émettre des segments trop courts** (qualité audio). Mais
au point d'écrasement, le buffer court ne peut plus grandir (la vérification de tenue vient d'échouer) :
ne pas le sauvegarder = le perdre. La préférence « pas de segment court » ne doit jamais primer sur la
**préservation du texte**.

### Business impact
Cœur produit Meeshy : le pipeline audio (transcription → traduction → **TTS**) doit restituer fidèlement
le texte traduit en voix. Des mots manquants dans l'audio synthétisé sont une perte de fidélité directe
et invisible (aucune erreur remontée) sur la fonctionnalité voix.

### Technical impact
Correctif local aux deux sites : **vider tout buffer non vide avant de l'écraser** (retirer la garde
`and len(current_segment) >= MIN_SEGMENT_CHARS` aux sites 1 et 2). Le buffer court devient son propre
segment (moindre mal ; la fusion du **dernier** segment court reste gérée en fin de fonction, lignes
171-177). Chaque segment reste ≤ `max_chars`. Aucun changement de signature/contrat.

### Risk assessment
Très faible. Au point d'écrasement, le buffer est **grand** dans le cas normal (une phrase ne « tient
pas » quand le buffer est déjà proche de `max_chars` ≫ 50) → comportement **inchangé** ; il n'est court
que dans le cas de bug, désormais **préservé**. Prouvé par repro verbatim (RED→GREEN) + non-régression
sur un texte 60-phrases.

### Proposed improvements (implémenté ce cycle)
- Sites 1 & 2 : `if current_segment:` (au lieu de `… and len >= MIN_SEGMENT_CHARS`) avant l'écrasement,
  + commentaire du *pourquoi* (perte silencieuse sinon).
- Test pytest neuf `tests/test_20_synthesizer_segmentation.py` (5 cas : fragment court en tête préservé,
  segments ≤ max_chars, fragment court entre deux phrases longues, texte normal sans perte de mots,
  texte court renvoyé tel quel). Instance via `__new__` (méthode pure, pas de modèle chargé) ; skip
  gracieux si la stack TTS (torch/chatterbox) est absente.

### Validation criteria
- [x] RED prouvé d'abord (repro Python, impl copiée verbatim) : `"Hi"` absent de la sortie.
- [x] GREEN (repro corrigé) : `"Hi"` préservé, tous segments ≤ `max_chars`, non-régression 60-phrases.
- [x] `py_compile` OK (source + test). Test pytest exécuté par la CI « Test Python (translator) » (la
      stack ML n'est pas installée dans ce sandbox — parité avec le pattern « CI valide » des PR iOS).

## Backlog reporté (§ futur)
- **F86** (LOW) : `use-message-translations.ts` `processMessageWithTranslations` — dedup ignorant le
  timestamp (une premium plus ancienne peut écraser une basic plus récente). Heuristique, intention
  produit à confirmer.
- Antérieurs : F69, F74, F75, F78, F80, F81, F82b toujours reportés.
