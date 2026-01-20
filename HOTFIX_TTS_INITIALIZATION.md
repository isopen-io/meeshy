# HOTFIX - Service TTS Non Initialisé

**Date:** 2026-01-19
**Priorité:** 🔥 CRITIQUE
**Impact:** La traduction audio échoue après 120 secondes d'attente

---

## 🔍 Problème Identifié

### Symptômes
```
[TTS] ⏳ Attente d'un modèle TTS (téléchargement en cours)...
[TTS] ⏳ Attente modèle TTS... (10s)
[TTS] ⏳ Attente modèle TTS... (20s)
...
[TTS] ⏳ Attente modèle TTS... (120s)
[PIPELINE] ❌ Erreur traduction en: Aucun backend TTS disponible après 120s.
```

### Chaîne de Traduction Audio
- ✅ Transcription Whisper fonctionne (audio → texte)
- ✅ Traduction ML fonctionne (français → anglais)
- ❌ **TTS échoue** : Aucun backend disponible

---

## 🐛 Cause Racine

**Le service TTS n'est JAMAIS initialisé au démarrage du translator.**

### Fichier Problématique
`services/translator/src/main.py` - Ligne ~230

### Code Actuel (INCORRECT)
```python
if UNIFIED_TTS_AVAILABLE:
    try:
        tts_model_name = self.settings.tts_model
        # ... vérifications licence ...

        unified_tts_service = get_unified_tts_service()  # ❌ Obtention du service
        active_model = unified_tts_service.model_manager.active_model
        model_name = active_model.value if active_model else tts_model.value
        logger.info(f"[TRANSLATOR] ✅ Service TTS unifié configuré: {model_name}")

        # ❌ MANQUE: await unified_tts_service.initialize()
```

### Conséquence
Sans `initialize()`, le service TTS :
1. ❌ Ne cherche JAMAIS de modèle local disponible
2. ❌ Ne lance JAMAIS de téléchargement en arrière-plan
3. ❌ `active_backend` reste à `None` indéfiniment
4. ❌ `synthesize_with_voice()` attend 120s puis timeout

---

## ✅ Solution

### Code Corrigé
```python
if UNIFIED_TTS_AVAILABLE:
    try:
        tts_model_name = self.settings.tts_model
        # ... vérifications licence ...

        unified_tts_service = get_unified_tts_service()

        # ✅ AJOUTER: Initialiser le service TTS
        logger.info(f"[TRANSLATOR] 🔄 Initialisation du service TTS ({tts_model_name})...")
        tts_init_success = await unified_tts_service.initialize()

        if tts_init_success:
            active_model = unified_tts_service.model_manager.active_model
            model_name = active_model.value if active_model else tts_model_name
            logger.info(f"[TRANSLATOR] ✅ Service TTS unifié initialisé: {model_name}")
        else:
            logger.warning("[TRANSLATOR] ⚠️ Service TTS initialisé en mode pending (téléchargement en cours)")
```

---

## 📝 Patch à Appliquer

### Fichier
`services/translator/src/main.py`

### Localisation
Après la ligne `unified_tts_service = get_unified_tts_service()`

### Modification
```python
# AVANT (ligne ~235-237)
unified_tts_service = get_unified_tts_service()
active_model = unified_tts_service.model_manager.active_model
model_name = active_model.value if active_model else tts_model.value
logger.info(f"[TRANSLATOR] ✅ Service TTS unifié configuré: {model_name}")

# APRÈS
unified_tts_service = get_unified_tts_service()

# Initialiser le service TTS
logger.info(f"[TRANSLATOR] 🔄 Initialisation du service TTS ({tts_model_name})...")
tts_init_success = await unified_tts_service.initialize()

if tts_init_success:
    active_model = unified_tts_service.model_manager.active_model
    model_name = active_model.value if active_model else tts_model_name

    if active_model:
        logger.info(f"[TRANSLATOR] ✅ Service TTS initialisé avec modèle: {model_name}")
    else:
        logger.info("[TRANSLATOR] ⏳ Service TTS démarré en mode pending (téléchargement en cours)")
else:
    logger.error("[TRANSLATOR] ❌ Échec initialisation service TTS")
```

---

## 🔄 Comportement Attendu Après Fix

### Logs de Démarrage
```
[TRANSLATOR] 🔄 Initialisation du service TTS (chatterbox)...
[TTS] Service configuré: model=chatterbox, device=auto, output=./generated/audios
[ModelManager] Recherche de modèles locaux disponibles...
[ModelManager] ✅ Modèle Chatterbox trouvé dans cache HuggingFace
[ModelManager] 🔄 Chargement de Chatterbox...
[ModelManager] ✅ Chatterbox chargé en 2.5s
[TRANSLATOR] ✅ Service TTS initialisé avec modèle: chatterbox
```

### OU (si aucun modèle local)
```
[TRANSLATOR] 🔄 Initialisation du service TTS (chatterbox)...
[TTS] Service configuré: model=chatterbox, device=auto, output=./generated/audios
[ModelManager] Recherche de modèles locaux disponibles...
[TTS] ⚠️ Aucun modèle TTS disponible localement
[TTS] 📥 Démarrage des téléchargements en arrière-plan...
[ModelManager] 📥 Téléchargement prioritaire de chatterbox...
[ModelManager] 📥 Téléchargement du modèle depuis HuggingFace Hub...
[TRANSLATOR] ⏳ Service TTS démarré en mode pending (téléchargement en cours)
# ... téléchargement en arrière-plan ...
[ModelManager] ✅ Premier modèle prêt: chatterbox
```

### Lors de la Synthèse Vocale
```
[TTS] Synthèse vocale: "Hello everyone, this is an audio recording..." (lang=en)
[TTS] ✅ Audio généré: /path/to/output.mp3 (duration=9s)
[PIPELINE] ✅ Job terminé: mshy_20260119... (8500ms)
```

---

## 🧪 Test de Validation

### 1. Vérifier que le service démarre
```bash
cd services/translator
python -m src.main
```

**Logs attendus :**
```
[TRANSLATOR] 🔄 Initialisation du service TTS (chatterbox)...
[TRANSLATOR] ✅ Service TTS initialisé avec modèle: chatterbox
```

### 2. Tester la traduction audio
Envoyer un message audio via le gateway et vérifier :
- ✅ Transcription réussie
- ✅ Traduction réussie
- ✅ **TTS réussit sans timeout**
- ✅ Audio traduit généré

### 3. Vérifier le temps de synthèse
Le TTS devrait prendre ~5-15 secondes (pas 120s) :
```
[PIPELINE] ✅ Job terminé: mshy_... (8500ms)  # ✅ BON
# Au lieu de:
[PIPELINE] ❌ Erreur traduction: ... après 120s  # ❌ MAUVAIS
```

---

## 📊 Impact

### Avant le Fix
- ❌ Traduction audio échoue systématiquement
- ❌ Timeout après 120 secondes
- ❌ Service TTS inutilisable

### Après le Fix
- ✅ Traduction audio fonctionne de bout en bout
- ✅ TTS prêt au démarrage ou téléchargement en arrière-plan
- ✅ Temps de synthèse : ~5-15 secondes (au lieu de 120s timeout)

---

## 🚨 Urgence

**PRIORITÉ CRITIQUE** - Bloque complètement la fonctionnalité de traduction audio.

### Actions Immédiates
1. Appliquer le patch dans `main.py`
2. Redémarrer le service translator
3. Tester avec un message audio
4. Valider que le timeout de 120s n'apparaît plus

---

## 📚 Contexte Technique

### Architecture TTS Unifiée
Le `UnifiedTTSService` est un **singleton** qui :
1. Gère plusieurs backends (Chatterbox, Higgs Audio, XTTS, MMS, VITS)
2. Télécharge les modèles à la demande depuis HuggingFace
3. Sélectionne automatiquement le meilleur backend par langue

### Logique d'Initialisation
```python
async def initialize(self, model: TTSModel = None) -> bool:
    # ÉTAPE 1: Chercher un modèle local
    local_model = await self.model_manager.find_local_model(model)

    if local_model:
        # Charger immédiatement
        await self.model_manager.load_model(local_model)
        # Télécharger autres modèles en arrière-plan
        asyncio.create_task(self.model_manager.download_models_background(model))
        return True

    # ÉTAPE 2: Aucun modèle local → téléchargement en arrière-plan
    asyncio.create_task(self.model_manager.download_and_load_first_available(model))
    return True  # Service démarre en mode "pending"
```

**Sans l'appel à `initialize()`, aucune de ces étapes n'est exécutée !**

---

**Créé par:** Claude Sonnet 4.5
**Date:** 2026-01-19
**Fichier source:** `/Users/smpceo/Documents/v2_meeshy/services/translator/src/main.py`
