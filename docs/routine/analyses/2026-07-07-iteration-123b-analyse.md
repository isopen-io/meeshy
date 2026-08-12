# Iteration 123 — Analyse d'optimisation (2026-07-07)

## Protocole (démarrage)
`main` @ `3883a7e4` (post-merge #1591), working tree propre. Branche `claude/brave-archimedes-uemamv`
recréée depuis `origin/main`. Numérotation : docs `main` jusqu'à **122** → ce cycle prend **123**.

PR ouvertes au démarrage (11, toutes **disjointes** de la cible) : #1585-#1592 (gateway realtime /
notification / calls / typing / reactions, shared time-remaining) + bumps dependabot
(#1532/#1536/#1539/#1542/#1549). La cible retenue est dans `services/translator` (Python), surface
strictement disjointe de toutes les PR en vol.

## Revue d'ingénierie (constat de démarrage)
Le socle TS (shared / gateway / web) est extrêmement mature (122 itérations de polissage ; la plupart
des edge-cases classiques des helpers purs sont déjà traités et commentés, ou déjà backlogués :
F69 `sanitizeFileName`, F70 `deepCleanTranslationOutput`, F75 `generateCommunityIdentifier`,
F87 `sanitizeMongoQuery`, F88 `truncateFilename`). Balayage adversarial (agent d'exploration parallèle,
71 tool-uses) des helpers purs/quasi-purs **en excluant** ces zones et les PR en vol. La surface la
**moins auditée** est celle des utilitaires Python du translator — c'est là que remonte le défaut le
plus net et le plus frais.

## Cible : F89 — plage de caractères involontaire dans la classe de puces de `is_list_item`

### Current state
`services/translator/src/utils/text_segmentation.py` — `TextSegmenter.is_list_item` (l.194, avant fix) :
```python
bullet_pattern = r'^[+-•*→]\s+'
```
Le docstring (l.183-184) décrit l'intention : un ensemble **littéral** de puces `-, •, *, →` (plus `+`).

### Problems identified
- **[LIVE] Le `-` non échappé, placé entre `+` (U+002B) et `•` (U+2022), est interprété par Python comme
  une PLAGE `+`…`•` = tout code point U+002B..U+2022.** Cette plage avale les chiffres (`0-9`), tout
  `A-Z`, tout `a-z`, et l'essentiel de la ponctuation ASCII.
  - Répro (vérifié empiriquement) :
    - `is_list_item("A dog")` → **`True`** (attendu `False` : 'A' + espace tombe dans la plage).
    - `is_list_item("2 apples left")` → **`True`** (attendu `False`).
    - `is_list_item("W hat is this")` → **`True`** (attendu `False`).
    - `is_list_item("; punctuation")` → **`True`** ; `is_list_item("é accent")` → **`True`**.
  - Tout premier caractère ∈ [U+002B..U+2022] suivi d'un espace est classé à tort « élément de liste ».
- **[LIVE] Le défaut a corrompu le raisonnement d'un test existant.** `test_non_list_items` (l.301-302,
  avant fix) portait un commentaire de contournement erroné : « "A regular paragraph" would match Roman
  numeral pattern [IVXLCDM] ». C'est faux à double titre : 'A' n'est pas dans `IVXLCDM` et le pattern
  romain exige un `)`. Le vrai matcher fautif était la plage de puces — misdiagnostic figé dans le test.
- Les tests négatifs existants (`"Hello world"`, `"This is a sentence."`, …) ont tous leur 1er caractère
  suivi d'une **lettre** (non-espace) : le `\s+` post-classe ne se déclenchait jamais → bug non couvert.

### Root cause
Classe de caractères regex écrite sans échapper le `-` interne. En Python `re`, un `-` entre deux
caractères d'une classe dénote une plage ; ici la plage n'était pas voulue (les 5 puces sont des
littéraux). Bug de saisie regex classique, invisible sans un test « lettre/chiffre + espace ».

### Business impact
`is_list_item` est une méthode **publique documentée** de `TextSegmenter` (classe exportée, consommée par
`translation_ml/translation_service.py`). Toute classification « liste » sur une ligne de prose courte
(commençant par une lettre/chiffre + espace) est erronée. Sur le pipeline de traduction segmentée, un
faux positif « list_item » peut altérer le typage/regroupement des segments de prose.

### Technical impact
- Fix 1 caractère : échapper le tiret → `r'^[+\-•*→]\s+'` (classe littérale des 5 puces, plus de plage).
- Commentaire ajouté expliquant *pourquoi* le `-` est échappé (piège de plage U+002B..U+2022).
- Test de régression dédié + correction du commentaire misdiagnostiqué du test négatif.

### Risk assessment
Très faible. Le fix **restreint** strictement le pattern à l'ensemble documenté ; tous les vrais
positifs (`-`, `+`, `•`, `*`, `→` + espace) restent `True`. Aucun chemin authentifié ni ML n'est touché.
Aucune API/dépendance modifiée.

### Proposed improvements (implémenté ce cycle)
- `text_segmentation.py` : `r'^[+-•*→]\s+'` → `r'^[+\-•*→]\s+'` + commentaire.
- `test_19_text_segmentation.py` : nouveau `test_bullet_range_does_not_swallow_prose` (5 négatifs prose +
  5 positifs puces), + `"A regular paragraph" is False` dans `test_non_list_items`, + commentaire corrigé.

### Validation criteria
- [x] `tests/test_19_text_segmentation.py` : **86/86** (85 existants + 1 nouveau), 0.17s.
- [x] Répro empirique avant/après confirmée (buggy `True` → fixed `False` sur A dog / 2 apples / … ;
      les 5 puces littérales restent `True`).
- [x] Diff limité à 2 fichiers (1 ligne de code + commentaire, tests).

### Expected benefits
Correction d'un faux positif de classification sur la surface Python la moins auditée ; suppression d'un
misdiagnostic figé dans la suite de tests ; convergence qualité homogène (le translator rejoint le niveau
de rigueur du socle TS).

### Implementation complexity
Triviale (1 caractère de code, 1 test). Confiance haute (vérifié empiriquement).

### Leçon (à retenir)
Un `-` non échappé au milieu d'une classe de caractères regex crée une **plage** silencieuse. Toujours
placer `-` en début/fin de classe ou l'échapper (`\-`). Un test négatif dont le 1er caractère est suivi
d'une **lettre** ne couvre pas ce bug — il faut un cas « caractère-dans-la-plage + espace ». Se méfier
des commentaires de test qui « expliquent » un faux positif : ils peuvent masquer un vrai défaut.
