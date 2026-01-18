# ✅ Migration des Modèles - Terminée

**Date** : 2026-01-18 18:23
**Service** : translator

## 📦 Modèles Déplacés

Les modèles NLLB ont été déplacés de la racine vers `models/huggingface/` :

```bash
# AVANT
models/
├── models--facebook--nllb-200-distilled-600M/  ❌ Racine (mauvais)
└── models--facebook--nllb-200-distilled-1.3B/  ❌ Racine (mauvais)

# APRÈS
models/
└── huggingface/
    ├── models--facebook--nllb-200-distilled-600M/  ✅ Dossier dédié
    ├── models--facebook--nllb-200-distilled-1.3B/  ✅ Dossier dédié
    ├── models--ResembleAI--chatterbox-turbo/
    └── models--bosonai--higgs-audio-v2-generation-3B-base/
```

**Gain** : ~5.5 GB économisés (pas de re-téléchargement)

---

## 🔧 Corrections de Code Appliquées

### 1. Variables d'environnement HuggingFace

**Fichier** : `src/services/translation_ml_service.py`
```python
# AVANT
os.environ['HF_HOME'] = str(_settings.models_path)  # = ./models

# APRÈS
os.environ['HF_HOME'] = str(_settings.huggingface_cache_path)  # = ./models/huggingface
```

### 2. ModelLoader

**Fichier** : `src/services/translation_ml/model_loader.py`
- ✅ Ajout de `self.huggingface_cache`
- ✅ Correction de `configure_environment()`
- ✅ Tous les `cache_dir` utilisent maintenant `self.huggingface_cache`

---

## 🚀 Prochaines Étapes

### 1. Redémarrer le service translator

Le service a été arrêté. Redémarrez-le pour qu'il utilise les nouveaux chemins :

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/translator
python src/main.py
```

**Ou via tmux** :
```bash
tmux attach -t meeshy
# La session devrait déjà être active, appuyez sur Entrée pour relancer
```

### 2. Vérifier les logs

Après le redémarrage, vous devriez voir :

```
[SETTINGS] ✅ Chemin relatif calculé: '/path/to/translator/models'
[TRANSLATOR] 🔍 HF_HOME depuis .env.local: NOT SET
```

Et lors du chargement des modèles, ils devraient être trouvés dans `huggingface/` sans re-téléchargement :

```
✅ Modèle basic chargé depuis cache: models/huggingface/models--facebook--nllb-200-distilled-600M
✅ Modèle premium chargé depuis cache: models/huggingface/models--facebook--nllb-200-distilled-1.3B
```

### 3. Nettoyage optionnel

Une fois que tout fonctionne, vous pouvez nettoyer les anciens modèles :

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/translator
./cleanup_models.sh --dry-run  # Simulation
./cleanup_models.sh             # Nettoyage réel
```

**Modèles à supprimer** :
- `Helsinki-NLP_opus-mt-en-fr/` (~250 MB)
- `Helsinki-NLP_opus-mt-fr-en/` (~250 MB)
- Dossiers non référencés : `embeddings/`, `mms/`, `vits/`, `xet/`

**Gain supplémentaire** : ~500 MB + espaces non référencés

---

## 📊 Structure Finale

```
models/
├── huggingface/              ✅ Cache HuggingFace (~6 GB)
│   ├── models--facebook--nllb-200-distilled-600M/
│   ├── models--facebook--nllb-200-distilled-1.3B/
│   ├── models--ResembleAI--chatterbox-turbo/
│   ├── models--bosonai--higgs-audio-v2-generation-3B-base/
│   ├── facebook/
│   └── ResembleAI/
├── openvoice/                ✅ OpenVoice V2 checkpoints
├── xtts/                     ✅ XTTS v2 (legacy)
├── whisper/                  ✅ Whisper STT models
└── voice_cache/              ✅ Clones vocaux utilisateurs
```

---

## ✅ Validation

Après redémarrage, tester une traduction pour confirmer :

```bash
curl -X POST http://localhost:8000/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world",
    "source_lang": "en",
    "target_lang": "fr",
    "quality": "premium"
  }'
```

**Résultat attendu** : Traduction instantanée sans téléchargement de modèle.

---

## 📝 Notes

- ✅ Code corrigé pour utiliser `huggingface_cache_path`
- ✅ Modèles déplacés (pas de re-téléchargement)
- ✅ Service arrêté proprement
- ⏳ Service à redémarrer pour finaliser la migration
