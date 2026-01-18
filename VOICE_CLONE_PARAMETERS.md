# Paramètres de Clonage Vocal - Documentation Complète

## Vue d'ensemble

Ce document décrit **tous les paramètres de clonage vocal** exposés du script iOS vers le backend Gateway → Translator. Ces paramètres permettent un contrôle fin sur la qualité, l'expressivité et les performances du clonage vocal.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PARAMÈTRES DE CLONAGE VOCAL                      │
└─────────────────────────────────────────────────────────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
    ┌────▼────┐            ┌──────▼──────┐         ┌──────▼──────┐
    │ CHATTER │            │ PERFORMANCE │         │   QUALITY   │
    │   BOX   │            │             │         │             │
    └─────────┘            └─────────────┘         └─────────────┘
         │                        │                        │
    • Expressivité          • Parallélisme          • Validation
    • Sampling              • Optimisations         • Retry
    • Créativité            • Ressources            • Seuils
```

## 1. Paramètres Chatterbox TTS

Contrôle fin de la génération vocale et de l'expressivité.

### 1.1 `exaggeration` - Expressivité Vocale

**Description**: Contrôle l'expressivité vocale (prosodie, intonation)

| Propriété | Valeur |
|-----------|--------|
| **Type** | `number` (float) |
| **Range** | `0.0` - `1.0` |
| **Défaut** | `0.5` (équilibré) |

**Valeurs recommandées**:
- `0.0` → Voix monotone, plate (style lecture neutre)
- `0.3` → Légèrement expressif (lecture formelle)
- `0.5` → Expressivité équilibrée (**recommandé**)
- `0.7` → Très expressif (style conversationnel)
- `1.0` → Extrêmement expressif, intonations marquées

**Exemple TypeScript**:
```typescript
const params: VoiceCloneParameters = {
  chatterbox: {
    exaggeration: 0.6  // Voix expressive pour dialogue
  }
};
```

**Exemple Python**:
```python
config = VoiceCloneConfig(
    chatterbox=ChatterboxParams(exaggeration=0.6)
)
```

---

### 1.2 `cfgWeight` - Guidance du Modèle

**Description**: Contrôle la guidance du modèle (Classifier-Free Guidance)

| Propriété | Valeur |
|-----------|--------|
| **Type** | `number` (float) |
| **Range** | `0.0` - `1.0` |
| **Défaut** | `0.5` (anglais), `0.0` (auto pour autres langues) |

**Valeurs recommandées**:
- `0.0` → Peu de guidance, plus créatif (**recommandé pour langues non-anglaises**)
- `0.5` → Équilibre créativité/fidélité (recommandé pour anglais)
- `1.0` → Guidance maximale, très fidèle (peut sonner rigide)

**⚠️ IMPORTANT**: Pour les langues non-anglaises (français, espagnol, etc.), utiliser **`0.0`** pour une meilleure qualité vocale.

**Exemple TypeScript**:
```typescript
// Auto-optimisation (recommandé)
const params: VoiceCloneParameters = {
  chatterbox: {
    autoOptimize: true  // Ajuste cfgWeight automatiquement selon langue
  }
};

// Configuration manuelle
const paramsManual: VoiceCloneParameters = {
  chatterbox: {
    cfgWeight: 0.0,  // Optimal pour français, espagnol, etc.
    autoOptimize: false
  }
};
```

---

### 1.3 `temperature` - Créativité vs Stabilité

**Description**: Contrôle la température de sampling (créativité vs stabilité)

| Propriété | Valeur |
|-----------|--------|
| **Type** | `number` (float) |
| **Range** | `0.1` - `2.0` |
| **Défaut** | `1.0` (équilibré) |

**Valeurs recommandées**:
- `0.1-0.5` → Très stable, prévisible (voix robotique)
- `0.8-1.0` → Équilibre créativité/stabilité (**recommandé**)
- `1.5-2.0` → Très créatif, variable (peut dévier de la voix source)

**Exemple**:
```typescript
const params: VoiceCloneParameters = {
  chatterbox: {
    temperature: 0.95  // Très stable, fidèle à la voix source
  }
};
```

---

### 1.4 `topP` - Nucleus Sampling

**Description**: Filtre les tokens peu probables (Top-P sampling)

| Propriété | Valeur |
|-----------|--------|
| **Type** | `number` (float) |
| **Range** | `0.0` - `1.0` |
| **Défaut** | `0.9` |

**Valeurs recommandées**:
- `0.5` → Très conservateur, moins de variété
- `0.9` → Équilibre variété/qualité (**recommandé**)
- `1.0` → Tous les tokens possibles (plus créatif mais risqué)

---

### 1.5 `minP` - Probabilité Minimum

**Description**: Seuil de probabilité absolue pour filtrage des tokens

| Propriété | Valeur |
|-----------|--------|
| **Type** | `number` (float) |
| **Range** | `0.0` - `1.0` |
| **Défaut** | `0.05` |

**Valeurs recommandées**:
- `0.01` → Très permissif (peut inclure du bruit)
- `0.05` → Équilibre qualité/diversité (**recommandé**)
- `0.1+` → Très strict (peut manquer de naturel)

---

### 1.6 `repetitionPenalty` - Pénalité de Répétition

**Description**: Évite les boucles vocales et répétitions

| Propriété | Valeur |
|-----------|--------|
| **Type** | `number` (float) |
| **Range** | `1.0` - `3.0` |
| **Défaut** | `1.2` (mono), `2.0` (multi, auto-ajusté) |

**Valeurs recommandées**:
- `1.0` → Pas de pénalité (peut répéter)
- `1.2` → Léger (**recommandé pour mono-locuteur**)
- `2.0` → Fort (**recommandé pour multi-locuteurs**)
- `3.0` → Très fort (peut sonner artificiel)

**Auto-ajustement**: Si `autoOptimize: true`, ce paramètre est automatiquement ajusté à `2.0` pour conversations multi-locuteurs.

---

### 1.7 `autoOptimize` - Auto-Optimisation

**Description**: Active l'auto-optimisation basée sur analyse vocale

| Propriété | Valeur |
|-----------|--------|
| **Type** | `boolean` |
| **Défaut** | `true` (**recommandé**) |

**Comportement si `true`**:
- Ajuste automatiquement `exaggeration` basé sur voix source
- Optimise `cfgWeight` selon langue détectée (`0.0` pour non-anglais)
- Adapte `repetitionPenalty` au contexte (mono/multi)

**Exemple**:
```typescript
const params: VoiceCloneParameters = {
  chatterbox: {
    autoOptimize: true,  // Recommandé pour usage général
    exaggeration: 0.5    // Valeur de base, sera ajustée si nécessaire
  }
};
```

---

## 2. Paramètres de Performance

Contrôle des ressources et optimisations système.

### 2.1 `parallel` - Traitement Parallèle

**Description**: Génère tous les audios traduits simultanément

| Propriété | Valeur |
|-----------|--------|
| **Type** | `boolean` |
| **Défaut** | `true` (**recommandé**) |

**Comportement**:
- `true` → Traite toutes les langues en parallèle (plus rapide)
- `false` → Traite séquentiellement (économise mémoire)

**Recommandation**: Utiliser `true` sauf si serveur avec <8GB RAM.

---

### 2.2 `maxWorkers` - Nombre de Workers

**Description**: Nombre maximum de workers parallèles

| Propriété | Valeur |
|-----------|--------|
| **Type** | `number` (integer) |
| **Range** | `1` - `8` |
| **Défaut** | `2` (optimal pour la plupart des serveurs) |

**Valeurs recommandées**:
- `1` → Séquentiel pur (lent mais très économique)
- `2` → Optimal pour serveurs <16GB RAM (**recommandé**)
- `4` → Serveurs 16-32GB RAM
- `8` → Serveurs >32GB RAM (traitement ultra-rapide)

**Exemple**:
```typescript
const params: VoiceCloneParameters = {
  performance: {
    parallel: true,
    maxWorkers: 4  // Serveur puissant
  }
};
```

---

### 2.3 `optimizeModel` - Optimisation Mémoire

**Description**: Active la quantization et optimisations mémoire

| Propriété | Valeur |
|-----------|--------|
| **Type** | `boolean` |
| **Défaut** | `true` (**recommandé**) |

**Comportement**:
- `true` → Utilise quantization (économise 30-40% RAM)
- `false` → Mode précision maximale (consomme plus de RAM)

**Impact**:
- Perte de qualité négligeable (<1%)
- Gain RAM: ~1.5GB économisés sur Chatterbox

---

### 2.4 `useFp16` - Half-Precision

**Description**: Utilise FP16 au lieu de FP32 pour inférence

| Propriété | Valeur |
|-----------|--------|
| **Type** | `boolean` |
| **Défaut** | `false` (qualité maximale) |

**Comportement**:
- `true` → Économise 50% VRAM (légère réduction qualité)
- `false` → FP32 complet (meilleure qualité)

**Recommandation**: Activer uniquement si contraintes VRAM fortes (GPU <6GB).

---

### 2.5 `warmup` - Préchauffage Modèle

**Description**: Préchauffe le modèle au démarrage du service

| Propriété | Valeur |
|-----------|--------|
| **Type** | `boolean` |
| **Défaut** | `true` (**recommandé**) |

**Comportement**:
- `true` → Première génération rapide (~2s)
- `false` → Démarrage service plus rapide, première génération lente (~10s)

---

## 3. Paramètres de Qualité

Validation et retry pour garantir la qualité vocale.

### 3.1 `minSimilarityThreshold` - Seuil de Similarité

**Description**: Seuil minimum de similarité vocale acceptée

| Propriété | Valeur |
|-----------|--------|
| **Type** | `number` (float) |
| **Range** | `0.0` - `1.0` |
| **Défaut** | `0.70` (équilibré) |

**Valeurs recommandées**:
- `0.50` → Très permissif (accepte des voix peu similaires)
- `0.70` → Équilibre qualité/acceptance (**recommandé**)
- `0.85+` → Très strict (peut rejeter des clonages acceptables)

**Comportement**: Si similarité < seuil → retry automatique (si activé) ou fallback sans clonage.

---

### 3.2 `autoRetryOnLowSimilarity` - Retry Automatique

**Description**: Réessaye avec paramètres ajustés si similarité faible

| Propriété | Valeur |
|-----------|--------|
| **Type** | `boolean` |
| **Défaut** | `true` (**recommandé**) |

**Comportement**:
- `true` → Retente avec ajustements (↓temperature, ↑cfg_weight)
- `false` → Accepte le premier résultat (plus rapide)

---

### 3.3 `maxRetries` - Nombre de Retentatives

**Description**: Nombre maximum de retentatives si similarité faible

| Propriété | Valeur |
|-----------|--------|
| **Type** | `number` (integer) |
| **Range** | `0` - `5` |
| **Défaut** | `2` (optimal) |

**Valeurs recommandées**:
- `0` → Pas de retry (rapide, qualité variable)
- `2` → Optimal (balance qualité/délai) (**recommandé**)
- `5` → Maximum (qualité maximale, peut prendre du temps)

---

## 4. Presets Prédéfinis

Pour simplifier l'utilisation, des presets sont fournis.

### 4.1 `balanced` (Défaut Recommandé)

Équilibre qualité/vitesse pour usage général.

```typescript
const params = VOICE_CLONE_PRESET_BALANCED;
// Équivalent à:
{
  chatterbox: {
    exaggeration: 0.5,
    temperature: 1.0,
    topP: 0.9,
    autoOptimize: true
  },
  performance: {
    parallel: true,
    maxWorkers: 2,
    optimizeModel: true,
    useFp16: false
  },
  quality: {
    minSimilarityThreshold: 0.70,
    autoRetryOnLowSimilarity: true,
    maxRetries: 2
  }
}
```

### 4.2 `fast`

Génération rapide, qualité acceptable (pour tests, démo).

```typescript
const params = VOICE_CLONE_PRESET_FAST;
// maxWorkers: 4, useFp16: true, maxRetries: 0
```

### 4.3 `high_quality`

Qualité maximale (plus lent, pour voix professionnelles).

```typescript
const params = VOICE_CLONE_PRESET_HIGH_QUALITY;
// minSimilarityThreshold: 0.80, maxRetries: 3, parallel: false
```

### 4.4 `conversational`

Voix naturelle et expressive (pour dialogues).

```typescript
const params = VOICE_CLONE_PRESET_CONVERSATIONAL;
// exaggeration: 0.7, temperature: 1.1, repetitionPenalty: 1.5
```

### 4.5 `low_resource`

Pour serveurs avec ressources limitées (VPS entrée de gamme).

```typescript
const params = VOICE_CLONE_PRESET_LOW_RESOURCE;
// maxWorkers: 1, useFp16: true, warmup: false, parallel: false
```

---

## 5. Exemples d'Utilisation

### 5.1 TypeScript - Gateway

#### Utilisation d'un Preset

```typescript
import { applyPreset } from './types/translation.types';

// Preset simple
const config = applyPreset('balanced');

// Preset avec surcharges
const customConfig = applyPreset('fast', {
  chatterbox: {
    exaggeration: 0.6  // Override
  }
});

// Envoi au Translator
await zmqClient.sendAudioProcessRequest({
  messageId: '...',
  attachmentId: '...',
  // ...
  voiceCloneParams: customConfig
});
```

#### Configuration Manuelle Complète

```typescript
import { VoiceCloneParameters } from './types/translation.types';

const params: VoiceCloneParameters = {
  chatterbox: {
    exaggeration: 0.6,
    cfgWeight: 0.0,  // Non-anglais
    temperature: 1.0,
    topP: 0.9,
    minP: 0.05,
    repetitionPenalty: 1.5,
    autoOptimize: true
  },
  performance: {
    parallel: true,
    maxWorkers: 2,
    optimizeModel: true,
    useFp16: false,
    warmup: true
  },
  quality: {
    minSimilarityThreshold: 0.75,
    autoRetryOnLowSimilarity: true,
    maxRetries: 2
  }
};

await zmqClient.sendAudioProcessRequest({
  // ...
  voiceCloneParams: params
});
```

#### Configuration Partielle (Défauts Appliqués)

```typescript
// Seuls les paramètres critiques
const minimalParams: VoiceCloneParameters = {
  chatterbox: {
    exaggeration: 0.7  // Voix expressive
  },
  quality: {
    minSimilarityThreshold: 0.80  // Qualité stricte
  }
  // Tous les autres paramètres utilisent les défauts
};
```

### 5.2 Python - Translator

#### Réception et Validation

```python
from config.voice_clone_defaults import validate_params, apply_language_optimizations

# Réception depuis Gateway (ZMQ)
user_params = request_data.get('voiceCloneParams')  # Dict ou None

# Validation et fusion avec défauts
config = validate_params(user_params)

# Optimisations spécifiques langue
config = apply_language_optimizations(config, target_language='fr')

# Utilisation dans le pipeline
result = await pipeline.process_audio_message(
    audio_path=audio_path,
    # ...
    cloning_params=config.to_dict()  # Convertir en dict pour le TTS
)
```

#### Accès aux Paramètres

```python
# Chatterbox params
exaggeration = config.chatterbox.exaggeration
cfg_weight = config.chatterbox.cfg_weight
temperature = config.chatterbox.temperature

# Performance params
parallel = config.performance.parallel
max_workers = config.performance.max_workers

# Quality params
min_sim = config.quality.min_similarity_threshold
max_retries = config.quality.max_retries
```

#### Utilisation des Presets

```python
from config.voice_clone_defaults import get_preset

# Charger un preset
config = get_preset('high_quality')

# Ou créer depuis dict
config = VoiceCloneConfig.from_dict({
    'chatterbox': {'exaggeration': 0.7},
    'quality': {'minSimilarityThreshold': 0.75}
})
```

---

## 6. Validation et Ranges

Tous les paramètres sont **automatiquement validés** et limités aux ranges acceptables.

### Validation TypeScript

```typescript
import { validateChatterboxParams } from './types/translation.types';

const userParams = {
  exaggeration: 1.5,  // Hors range (>1.0)
  temperature: 0.05   // Hors range (<0.1)
};

const validated = validateChatterboxParams(userParams);
// validated.exaggeration === 1.0 (clamped to max)
// validated.temperature === 0.1 (clamped to min)
```

### Validation Python

```python
from config.voice_clone_defaults import validate_params

user_params = {
    'chatterbox': {
        'exaggeration': 1.5,  # Hors range
        'temperature': 0.05   # Hors range
    }
}

config = validate_params(user_params)
# config.chatterbox.exaggeration == 1.0 (clamped)
# config.chatterbox.temperature == 0.1 (clamped)
```

---

## 7. Variables d'Environnement (Optionnel)

Les paramètres peuvent être surchargés via variables d'environnement.

### Configuration Serveur

```bash
# Chatterbox
export VOICE_CLONE_EXAGGERATION=0.6
export VOICE_CLONE_CFG_WEIGHT=0.0
export VOICE_CLONE_TEMPERATURE=1.0
export VOICE_CLONE_TOP_P=0.9

# Performance
export VOICE_CLONE_PARALLEL=true
export VOICE_CLONE_MAX_WORKERS=4
export VOICE_CLONE_USE_FP16=false

# Quality
export VOICE_CLONE_MIN_SIMILARITY=0.75
export VOICE_CLONE_MAX_RETRIES=2
```

### Chargement Python

```python
from config.voice_clone_defaults import load_from_env

# Charge depuis environnement
config = load_from_env()
```

---

## 8. Recommandations par Cas d'Usage

### 8.1 Messages Courts (<30s)

**Preset recommandé**: `fast` ou `balanced`

```typescript
const params = applyPreset('fast');
// Génération rapide, qualité acceptable
```

### 8.2 Messages Longs (>1min)

**Preset recommandé**: `balanced` ou `high_quality`

```typescript
const params = applyPreset('high_quality', {
  quality: {
    maxRetries: 3  // Plus de retries pour qualité
  }
});
```

### 8.3 Conversations Multi-Locuteurs

**Configuration spécifique**:

```typescript
const params: VoiceCloneParameters = {
  chatterbox: {
    exaggeration: 0.7,  // Expressivité importante
    repetitionPenalty: 2.0,  // Éviter répétitions
    autoOptimize: true
  },
  performance: {
    parallel: true,  // Traiter tous les locuteurs ensemble
    maxWorkers: 4
  }
};
```

### 8.4 Voix Professionnelles (Narration, Pub)

**Preset recommandé**: `high_quality`

```typescript
const params = applyPreset('high_quality');
// Quality max, même si plus lent
```

### 8.5 Serveur VPS Basique (<4GB RAM)

**Preset recommandé**: `low_resource`

```typescript
const params = applyPreset('low_resource');
// Sequential, FP16, minimal memory
```

---

## 9. Monitoring et Debugging

### Logs TypeScript (Gateway)

```typescript
// Activer logs détaillés
process.env.LOG_LEVEL = 'debug';

// Les paramètres envoyés sont loggés automatiquement
logger.info(`🔍 Voice clone params:`, voiceCloneParams);
```

### Logs Python (Translator)

```python
import logging
logging.basicConfig(level=logging.DEBUG)

logger.info(f"[PIPELINE] Chatterbox params: {config.chatterbox.to_dict()}")
logger.info(f"[PIPELINE] Performance params: {config.performance.to_dict()}")
logger.info(f"[PIPELINE] Quality params: {config.quality.to_dict()}")
```

### Métriques de Qualité

Le système retourne automatiquement:
- `voiceQuality`: Score de similarité vocale (0.0-1.0)
- `processingTimeMs`: Temps de traitement
- `retryCount`: Nombre de retries effectués

```typescript
// Résultat reçu depuis Translator
const result = {
  voiceQuality: 0.85,  // Excellente similarité
  processingTimeMs: 3200,  // 3.2 secondes
  retryCount: 1  // 1 retry pour atteindre seuil
};
```

---

## 10. Migration depuis l'Ancienne API

### Ancien Format (Legacy)

```typescript
// ❌ ANCIEN - Format simplifié
const oldParams = {
  exaggeration: 0.5,
  cfgWeight: 0.5,
  temperature: 1.0
};
```

### Nouveau Format (Complet)

```typescript
// ✅ NOUVEAU - Format structuré
const newParams: VoiceCloneParameters = {
  chatterbox: {
    exaggeration: 0.5,
    cfgWeight: 0.5,
    temperature: 1.0
  },
  performance: {
    parallel: true,
    maxWorkers: 2
  },
  quality: {
    minSimilarityThreshold: 0.70
  }
};
```

### Compatibilité Ascendante

Les anciens formats sont **automatiquement convertis**:

```python
# Python - Translator
# Format ancien détecté automatiquement
if 'chatterbox' not in user_params:
    # Conversion automatique
    user_params = {
        'chatterbox': user_params
    }

config = validate_params(user_params)
```

---

## 11. FAQ

### Q: Quel preset utiliser par défaut?

**R**: `balanced` pour la plupart des cas. C'est le meilleur compromis qualité/vitesse.

### Q: Comment améliorer la qualité vocale?

**R**:
1. Augmenter `minSimilarityThreshold` → 0.80+
2. Activer `autoRetryOnLowSimilarity` et `maxRetries: 3`
3. Réduire `temperature` → 0.95
4. Utiliser preset `high_quality`

### Q: Comment réduire le temps de traitement?

**R**:
1. Utiliser preset `fast`
2. Activer `useFp16: true`
3. Augmenter `maxWorkers` (si RAM disponible)
4. Désactiver `autoRetryOnLowSimilarity`

### Q: Quelle différence entre `topP` et `minP`?

**R**:
- `topP`: Sélectionne top X% des probabilités cumulées (relatif)
- `minP`: Seuil absolu de probabilité minimum (absolu)

Les deux sont complémentaires pour filtrer les tokens.

### Q: `autoOptimize` fait quoi exactement?

**R**: Analyse la voix source et ajuste:
- `cfgWeight` → 0.0 si langue non-anglaise
- `exaggeration` → selon caractéristiques vocales détectées
- `repetitionPenalty` → 2.0 si multi-locuteurs détectés

---

## 12. Ressources Supplémentaires

### Fichiers de Configuration

- **TypeScript Types**: `/services/gateway/src/types/translation.types.ts`
- **Python Config**: `/services/translator/src/config/voice_clone_defaults.py`
- **ZMQ Interface**: `/services/gateway/src/services/ZmqTranslationClient.ts`

### Documentation Technique

- **Chatterbox TTS**: https://github.com/resemble-ai/chatterbox
- **Architecture Pipeline**: `/services/translator/src/services/audio_message_pipeline.py`
- **Settings Centralisés**: `/services/translator/src/config/settings.py`

### Support

Pour toute question ou problème:
1. Vérifier les logs Gateway + Translator
2. Tester avec preset `balanced` d'abord
3. Ajuster paramètres progressivement
4. Consulter métriques `voiceQuality` retournées

---

## Changelog

### Version 2.0.0 (Janvier 2026)

- ✨ **Exposition complète** des paramètres iOS
- ✨ **Presets prédéfinis** pour cas d'usage courants
- ✨ **Auto-optimisation** basée sur analyse vocale
- ✨ **Validation automatique** des ranges
- ✨ **Support variables d'environnement**
- ✨ **Compatibilité ascendante** avec ancien format

---

**Dernière mise à jour**: 18 janvier 2026
**Auteur**: Équipe Backend Meeshy
**Licence**: MIT
