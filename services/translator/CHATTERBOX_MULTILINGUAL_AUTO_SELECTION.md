# Chatterbox Multilingual Auto-Sélection

## Vue d'ensemble

Le backend Chatterbox implémente une **auto-sélection intelligente** du modèle (monolingual vs multilingual) selon la langue cible, inspirée du script iOS.

## Logique d'auto-sélection (lignes 345-350)

```python
# Normaliser le code langue (ex: fr-FR -> fr)
lang_code = language.split('-')[0].lower() if language else 'en'

# Déterminer si on utilise le modèle multilingue
use_multilingual = (
    lang_code != 'en' and
    lang_code in self.MULTILINGUAL_LANGUAGES and
    self._available_multilingual
)
```

### Conditions pour utiliser le modèle Multilingual:
1. ✅ Langue **n'est PAS** l'anglais (`lang_code != 'en'`)
2. ✅ Langue **est dans** `MULTILINGUAL_LANGUAGES` (23 langues supportées)
3. ✅ Modèle multilingual **est disponible** (`_available_multilingual`)

### Langues supportées par Multilingual:
```python
MULTILINGUAL_LANGUAGES = {
    'ar', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi',
    'it', 'ja', 'ko', 'ms', 'nl', 'no', 'pl', 'pt', 'ru', 'sv',
    'sw', 'tr', 'zh'
}
```

## Ajustement automatique du `cfg_weight` (ligne 439)

**RÈGLE CRITIQUE**: Pour le clonage cross-langue (non-anglais), `cfg_weight=0.0` améliore considérablement la qualité vocale.

```python
if use_multilingual:
    # Pour le clonage cross-langue, cfg_weight=0 réduit le transfert d'accent
    effective_cfg = 0.0 if lang_code != 'en' else cfg_weight
```

### Logique du cfg_weight:

| Scénario | Modèle | cfg_weight effectif | Raison |
|----------|--------|---------------------|--------|
| Anglais avec multilingual | Multilingual | Valeur fournie (ex: 0.5) | Clonage dans langue native |
| Français avec multilingual | Multilingual | **0.0** (forcé) | Clonage cross-langue |
| Espagnol avec multilingual | Multilingual | **0.0** (forcé) | Clonage cross-langue |
| Anglais avec monolingual | Monolingual | Valeur fournie (ex: 0.5) | Modèle standard |

**IMPORTANT**: Même si l'utilisateur passe `cfg_weight=0.5` pour une langue non-anglaise, le backend **force automatiquement** `cfg_weight=0.0` pour optimiser la qualité du clonage cross-langue.

## Paramètres de génération

### Paramètres par défaut (lignes 281-289):
```python
DEFAULT_PARAMS = {
    "exaggeration": 0.5,      # 0.0-1.0: Expressivité vocale
    "cfg_weight": 0.5,        # 0.0-1.0: Guidance du modèle
    "temperature": 0.8,       # 0.0-2.0: Créativité/aléatoire
    "repetition_penalty": 1.2,  # 1.0-3.0: Pénalité répétition (mono)
    "repetition_penalty_multilingual": 2.0,  # 1.0-3.0: Pénalité répétition (multi)
    "min_p": 0.05,           # 0.0-1.0: Probabilité minimum sampling
    "top_p": 1.0,            # 0.0-1.0: Nucleus sampling
}
```

### Ajustement automatique `repetition_penalty`:
```python
if repetition_penalty is None:
    repetition_penalty = (
        self.DEFAULT_PARAMS["repetition_penalty_multilingual"]  # 2.0 pour multi
        if use_multilingual
        else self.DEFAULT_PARAMS["repetition_penalty"]  # 1.2 pour mono
    )
```

## Exemple d'utilisation

### Cas 1: Français (auto-sélection multilingual)
```python
await backend.synthesize(
    text="Bonjour, comment allez-vous?",
    language="fr",
    speaker_audio_path="reference.wav",
    exaggeration=0.5,
    cfg_weight=0.5  # Sera automatiquement forcé à 0.0
)
```

**Résultat**:
- ✅ Modèle: `ChatterboxMultilingualTTS`
- ✅ `cfg_weight` effectif: **0.0** (forcé)
- ✅ `repetition_penalty`: **2.0** (défaut multilingual)

### Cas 2: Anglais (modèle monolingual par défaut)
```python
await backend.synthesize(
    text="Hello, how are you?",
    language="en",
    speaker_audio_path="reference.wav",
    exaggeration=0.5,
    cfg_weight=0.5  # Conservé à 0.5
)
```

**Résultat**:
- ✅ Modèle: `ChatterboxTTS` (monolingual)
- ✅ `cfg_weight` effectif: **0.5** (conservé)
- ✅ `repetition_penalty`: **1.2** (défaut monolingual)

### Cas 3: Anglais avec multilingual explicite
```python
backend._available_multilingual = True
await backend.initialize_multilingual()

await backend.synthesize(
    text="Hello, how are you?",
    language="en",
    speaker_audio_path="reference.wav",
    cfg_weight=0.7  # Conservé car en=anglais
)
```

**Résultat**:
- ✅ Modèle: `ChatterboxTTS` (monolingual - anglais privilégie mono)
- ✅ `cfg_weight` effectif: **0.7** (conservé)
- ⚠️ Note: L'anglais utilise préférentiellement le modèle **monolingual**

## Avantages de cette approche

1. **Transparence**: L'utilisateur n'a pas à connaître les détails techniques
2. **Qualité optimale**: Les paramètres sont automatiquement ajustés pour chaque langue
3. **Simplicité**: Une seule méthode `synthesize()` pour toutes les langues
4. **Fallback intelligent**: Si multilingual indisponible, utilise monolingual
5. **Performance**: Charge uniquement les modèles nécessaires

## Tests

### Test de clonage multilingue (test_chatterbox_voice_clone.py):
```python
await backend.synthesize(
    text=text,
    language=lang_code,  # 'fr', 'es', 'de', etc.
    speaker_audio_path=voice_sample_path,
    output_path=output_path,
    exaggeration=0.5,
    cfg_weight=0.5  # Sera forcé à 0.0 pour non-EN
)
```

**Comportement attendu**:
- Langues non-anglaises: `cfg_weight` forcé à **0.0**
- Anglais: `cfg_weight` conservé à **0.5**

## Conformité avec le script iOS

Cette implémentation suit **exactement** la logique du script iOS (lignes 483-602):

```python
# Script iOS (référence)
use_multilingual = (
    language in MULTILINGUAL_LANGUAGES and
    language != 'en' and
    self._check_multilingual()
)

if use_multilingual:
    # IMPORTANT: cfg_weight = 0.0 pour non-anglais!
    effective_cfg = 0.0 if language != 'en' else cfg_weight
```

**✅ Implémentation conforme au script iOS**
