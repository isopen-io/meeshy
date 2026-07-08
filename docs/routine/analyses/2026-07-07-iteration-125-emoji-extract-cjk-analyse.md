# Iteration 125 — Analyse d'optimisation (2026-07-07)

> Fichier suffixé (`-emoji-extract-cjk`) pour éviter le clobber de chemin entre sessions parallèles qui
> réutilisent le même numéro d'itération (vécu à l'itération 123).

## Protocole (démarrage)
`main` @ `511280ee` (post-merge de mon itération 124, PR #1622 ; #1623 a aussi mergé la préservation des
docs sanitizer). Working tree propre. Branche `claude/brave-archimedes-uemamv` recréée depuis `origin/main`.

## Revue d'ingénierie (constat de démarrage)
Suite directe du backlog « future improvements » de l'itération 124 : **auditer les autres définitions
`EMOJI_PATTERN` du repo** pour le même piège de plage regex. Le premier candidat évident,
`services/translator/src/utils/text_segmentation.py`, s'avère porteur du **même** piège — mais sur un
chemin **bien plus impactant** que le merger de segments.

## Cible : F91 — `EMOJI_PATTERN` d'extraction avale le CJK/Kana/Hangul → texte CJK jamais traduit

### Current state
`text_segmentation.py` (l.32, avant fix), dans la grande alternation `EMOJI_PATTERN` :
```python
"[\U000024C2-\U0001F251]|"  # Enclosed characters
```
Cette branche est une **plage** U+24C2..U+1F251 qui traverse les blocs CJK Unified Ideographs
(U+4E00..U+9FFF), Hiragana/Katakana (U+3040..U+30FF) et Hangul (U+AC00..U+D7AF).

`EMOJI_PATTERN` alimente `extract_emojis()` (l.97-135), qui fait
`text_without_emojis = EMOJI_PATTERN.sub(replacer, text)` — il **retire** les emoji du texte et les
remplace par des placeholders `🔹EMOJI_X🔹` **avant** traduction (puis `restore_emojis()` les réinsère
après). Utilisé en production :
- `translation_ml/translation_service.py:292` : `... and not self.text_segmenter.extract_emojis(text)[1]`
  (décision de fast-path — faussée pour le CJK, dont la map « emoji » est non vide).
- `text_segmentation.py:318` (`segment_text`) : `text_no_emojis, emojis_map = self.extract_emojis(text)`.

### Problems identified
- **[LIVE, sévérité haute] Le texte CJK/JP/KO source n'est jamais traduit.** Vérifié empiriquement sur le
  module réel :
  - `extract_emojis("你好世界")` → `("🔹EMOJI_0🔹", {0: "你好世界"})` — la phrase chinoise **entière** est
    extraite comme « emoji » et remplacée par un placeholder.
  - `extract_emojis("これはテスト")` → `("🔹EMOJI_0🔹", {0: "これはテスト"})`.
  - `extract_emojis("안녕하세요")` → `("🔹EMOJI_0🔹", {0: "안녕하세요"})`.
  - `extract_emojis("日本語 mixed english")` → `("🔹EMOJI_0🔹 mixed english", {0: "日本語"})` — seul
    « mixed english » atteindrait le modèle ; le japonais est sorti du flux de traduction.
  - Effet net sur `segment_text` : le contenu CJK est retiré, la traduction opère sur des placeholders,
    puis le CJK est **restauré verbatim** → la traduction d'un message chinois/japonais/coréen renvoie le
    texte source **inchangé** (non traduit).

### Root cause
Même famille que F89 (itération 123, `is_list_item`) et F90 (itération 124, `smart_segment_merger`) : une
**plage regex involontaire** dans une classe de caractères emoji construite à la main. Ici la plage
`\U000024C2-\U0001F251` couvre tout le CJK. Les code points encadrés réellement visés par cette branche
(Ⓜ U+24C2, ㊗ U+3297, ㊙ U+3299, indicateurs régionaux U+1F1E0..U+1F1FF) sont **déjà couverts** par
d'autres branches du même pattern (l.33, l.45-46, l.54) — la seule contribution unique légitime de la
branche est l'Enclosed Alphanumeric/Ideographic Supplement (U+1F100..U+1F251).

### Business impact
Fonction cœur du produit (« Prisme Linguistique ») cassée pour trois langues majeures : tout message ou
transcription en chinois/japonais/coréen passant par le chemin de segmentation ressort **non traduit**.
Régression silencieuse (ni erreur, ni log d'échec — le pipeline « réussit » en renvoyant le source).

### Technical impact
- Remplacer la branche fautive par `[\U0001F100-\U0001F251]` (Enclosed Alphanumeric/Ideographic
  Supplement) — aucune plage ne traverse plus un bloc de script.
- Vérifié empiriquement sur le pattern **complet réel** : tout le CJK/JP/KO est préservé ; **tous** les
  emoji restent extraits (Ⓜ, 🈵, 🅰, 🉐, 🇫🇷, ㊗, ㊙, keycaps, ©…) — zéro perte de couverture.

### Risk assessment
Très faible. Resserrement strict d'une branche d'alternation ; les emoji encadrés hors supplément sont
déjà couverts ailleurs (donc aucune régression d'extraction emoji). Aucun schéma/API/dépendance modifié.

### Proposed improvements (implémenté ce cycle)
- `text_segmentation.py` : branche l.32 remplacée + commentaire d'avertissement anti-plage détaillé.
- `tests/test_19_text_segmentation.py` : `test_cjk_text_is_not_extracted_as_emoji` (4 langues → texte
  intact, map vide), `test_cjk_with_real_emoji_extracts_only_the_emoji`, `test_enclosed_emoji_still_extracted`
  (Ⓜ/🈵/🅰/🉐/🇫🇷/㊗ toujours extraits).

### Validation criteria
- [x] `tests/test_19_text_segmentation.py` : **89/89** (86 + 3 nouveaux), 0.23s.
- [x] Répro empirique avant/après sur le module réel (CJK extrait → CJK préservé ; emoji préservés).

### Expected benefits
Rétablit la traduction du chinois/japonais/coréen sur le chemin de segmentation — correction produit à
fort impact. Clôt la 3ᵉ occurrence de la même famille de piège de plage regex (F89/F90/F91).

### Implementation complexity
Faible (1 branche d'alternation + 3 tests). Confiance haute (vérifié empiriquement, zéro perte emoji).

### Leçon (à retenir)
Les patterns emoji artisanaux accumulent les pièges de plage. **F89 → F90 → F91** sont la même erreur sur
trois fichiers. Recommandation forte (backlog) : remplacer ces patterns par une bibliothèque Unicode emoji
maintenue (ex. propriété `\p{Emoji}` via `regex`, ou table de plages générée), et ajouter un test
« garde-fou » unique qui vérifie qu'aucun pattern emoji du repo ne matche un échantillon CJK/Kana/Hangul.
