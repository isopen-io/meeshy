# Dockerfile Variants - Meeshy Translator

Le service Translator propose deux variantes de Dockerfile selon vos besoins en clonage vocal.

## 📋 Tableau comparatif

| Caractéristique | `Dockerfile` (Python 3.11) | `Dockerfile.py310` (Python 3.10) |
|----------------|---------------------------|----------------------------------|
| **Version Python** | 3.11 ✅ | 3.10 |
| **Chatterbox TTS** | ✅ Inclus | ✅ Inclus |
| **ESPnet VITS** | ✅ Inclus | ✅ Inclus |
| **OpenVoice V2** | ❌ Incompatible | ✅ Inclus |
| **Support ML récent** | ✅ Maximum | ⚠️ Limité |
| **Clonage vocal** | Haute qualité (Chatterbox) | Très haute qualité (Chatterbox + OpenVoice) |
| **Langues TTS** | 23 langues | 23 langues |
| **Taille image** | ~2.0 GB | ~2.2 GB |
| **Recommandé pour** | Production générale | Clonage vocal premium |

## 🎯 Quelle version choisir ?

### Utilisez `Dockerfile` (Python 3.11) si :
- ✅ Vous voulez la version la plus récente et stable
- ✅ Le clonage vocal Chatterbox suffit (haute qualité, 23 langues)
- ✅ Vous n'avez pas besoin d'OpenVoice
- ✅ Vous voulez les dernières optimisations ML
- ✅ **Recommandé pour la majorité des cas d'usage**

### Utilisez `Dockerfile.py310` (Python 3.10) si :
- 🎤 Vous avez besoin d'OpenVoice V2 pour l'extraction d'embeddings avancés
- 🎤 Vous voulez la meilleure qualité de clonage vocal possible
- ⚠️ Vous acceptez d'utiliser Python 3.10 (moins récent)

## 🔨 Build Instructions

### Version Python 3.11 (par défaut, recommandée)

```bash
# CPU (recommandé pour développement)
docker build --platform linux/arm64 \
  --build-arg TORCH_BACKEND=cpu \
  -f services/translator/Dockerfile \
  -t isopen/meeshy-translator:latest \
  -t isopen/meeshy-translator:v1.0.0-cpu \
  .

# GPU avec CUDA 12.4
docker build --platform linux/arm64 \
  --build-arg TORCH_BACKEND=gpu \
  -f services/translator/Dockerfile \
  -t isopen/meeshy-translator:gpu \
  .
```

### Version Python 3.10 + OpenVoice

```bash
# CPU avec OpenVoice
docker build --platform linux/arm64 \
  --build-arg TORCH_BACKEND=cpu \
  -f services/translator/Dockerfile.py310 \
  -t isopen/meeshy-translator:py310-cpu \
  -t isopen/meeshy-translator:py310-latest \
  .

# GPU avec OpenVoice
docker build --platform linux/arm64 \
  --build-arg TORCH_BACKEND=gpu \
  -f services/translator/Dockerfile.py310 \
  -t isopen/meeshy-translator:py310-gpu \
  .
```

## 🚀 Utilisation dans docker-compose

### Utiliser la version Python 3.11 (par défaut)

```yaml
services:
  translator:
    image: isopen/meeshy-translator:latest
    # ... reste de la config
```

### Utiliser la version Python 3.10 + OpenVoice

```yaml
services:
  translator:
    image: isopen/meeshy-translator:py310-latest
    environment:
      # Activer OpenVoice (optionnel, détecté automatiquement)
      ENABLE_OPENVOICE: "true"
    # ... reste de la config
```

## 🎤 Backends de clonage vocal disponibles

### Dans Python 3.11 (Dockerfile)
1. **Chatterbox Multilingual** (par défaut)
   - Clonage vocal natif haute qualité
   - 23 langues supportées
   - Apache 2.0 License

2. **ESPnet VITS** (langues africaines)
   - Lingala, Swahili, Wolof, etc.
   - Apache 2.0 License

### Dans Python 3.10 + OpenVoice (Dockerfile.py310)
Tous les backends ci-dessus **PLUS** :

3. **OpenVoice V2** (avancé)
   - Extraction d'embeddings vocaux de très haute précision
   - Séparation voix/contenu linguistique
   - MIT License

## 📝 Notes techniques

### Pourquoi deux versions ?

**OpenVoice V2** dépend de PyAV qui ne compile pas sur Python 3.11+ en raison de changements dans l'API C de Python. Les mainteneurs d'OpenVoice n'ont pas encore migré vers Python 3.11.

### Compatibilité des dépendances

Les deux versions partagent la même base de dépendances :
- PyTorch 2.x
- ESPnet 202412
- Chatterbox TTS 0.1.6
- faster-whisper 1.2.1

La différence principale est l'ajout d'OpenVoice dans la version Python 3.10.

### Performance

Les deux versions ont des performances ML équivalentes. La version Python 3.10 est légèrement plus grosse (~200 MB) en raison de l'inclusion d'OpenVoice.

## 🔄 Migration entre versions

Pour passer d'une version à l'autre :

1. **Arrêtez le conteneur actuel**
   ```bash
   docker compose -p meeshy-local -f infrastructure/docker/compose/docker-compose.local.yml down translator
   ```

2. **Modifiez le docker-compose.yml** pour pointer vers l'image souhaitée

3. **Redémarrez**
   ```bash
   docker compose -p meeshy-local -f infrastructure/docker/compose/docker-compose.local.yml up -d translator
   ```

Les profils vocaux créés avec une version sont compatibles avec l'autre.

## ❓ FAQ

**Q: Puis-je utiliser les deux versions simultanément ?**
R: Oui, mais il faut utiliser des noms de conteneurs différents et des ports différents.

**Q: OpenVoice est-il vraiment meilleur que Chatterbox ?**
R: Pour la plupart des cas, Chatterbox suffit. OpenVoice offre une qualité marginalement supérieure pour l'extraction d'embeddings vocaux très précis.

**Q: Quelle version utilise la production ?**
R: Nous recommandons Python 3.11 (Dockerfile) pour la production, sauf si vous avez un besoin spécifique d'OpenVoice.

**Q: Puis-je mettre à jour vers Python 3.11 plus tard ?**
R: Oui, dès qu'OpenVoice sera compatible avec Python 3.11+, nous migrerons tout vers Dockerfile.
