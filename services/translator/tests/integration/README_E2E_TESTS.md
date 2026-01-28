# Tests d'intégration End-to-End du Translator

## Vue d'ensemble

Ce test d'intégration simule complètement le Gateway et teste tous les flux du service Translator de manière isolée.

### Ce qui est testé

1. **Traduction texte simple** (fr → en)
2. **Traduction multi-langues** (fr → en, es, de)
3. **Traduction texte long** (>500 caractères)
4. **Traitement audio complet** (transcription + traduction + TTS)
5. **Audio avec transcription mobile** (iOS/Android)
6. **Transcription seule** (sans traduction)
7. **Gestion d'erreurs** (langues invalides, etc.)
8. **Requêtes concurrentes** (test de charge)

---

## Prérequis

### 1. Service Translator actif

Le Translator doit être en cours d'exécution :

```bash
# Depuis le répertoire racine
cd /Users/smpceo/Documents/v2_meeshy
make start

# Ou juste le Translator
cd services/translator
. .venv/bin/activate
python3 src/main.py
```

**Vérifier que le Translator est actif** :
```bash
curl http://localhost:8000/health
# Devrait retourner: {"status":"healthy",...}
```

### 2. Dépendances Python

```bash
cd services/translator
uv pip install pytest pytest-asyncio pyzmq
```

### 3. Fichier audio de test (optionnel)

Pour les tests audio, créer un fichier de test :

```bash
# Option 1: Enregistrer un message audio avec votre téléphone
# et le transférer vers /tmp/test_audio.m4a

# Option 2: Générer un fichier audio de test avec ffmpeg
ffmpeg -f lavfi -i "sine=frequency=1000:duration=5" /tmp/test_audio.m4a

# Option 3: Utiliser un fichier audio existant
cp path/to/your/audio.m4a /tmp/test_audio.m4a
```

**Note** : Les tests audio seront skippés si le fichier n'existe pas.

---

## Exécution des tests

### Exécuter tous les tests

```bash
cd services/translator
pytest tests/integration/test_translator_e2e.py -v -s
```

**Options** :
- `-v` : Verbose (affiche les noms de tests)
- `-s` : Affiche les logs en temps réel
- `--tb=short` : Traceback court en cas d'erreur

### Exécuter un test spécifique

```bash
# Test de traduction simple uniquement
pytest tests/integration/test_translator_e2e.py::test_text_translation_single_language -v -s

# Test multi-langues
pytest tests/integration/test_translator_e2e.py::test_text_translation_multiple_languages -v -s

# Test audio (si fichier disponible)
pytest tests/integration/test_translator_e2e.py::test_audio_process_with_transcription -v -s
```

### Exécuter sans les tests audio

```bash
pytest tests/integration/test_translator_e2e.py -v -s -k "not audio"
```

### Exécution directe (sans pytest)

```bash
cd services/translator
python3 tests/integration/test_translator_e2e.py
```

---

## Comportement en CI

Les tests e2e sont **automatiquement skippés en CI** grâce au marker `@pytest.mark.e2e` et à la configuration dans `conftest.py`.

### Pour les skip manuellement

```bash
# Skip tous les tests e2e
pytest -m "not e2e"

# Ou avec variable d'environnement
CI=true pytest tests/integration/test_translator_e2e.py
```

---

## Rapport de tests

### Exemple de sortie réussie

```
====================================================================
TEST 1: Traduction texte simple (fr → en)
====================================================================
📤 Envoi translation: 'Bonjour, comment allez-vous aujourd'hui ?...' (fr → ['en'])
📨 Réponse reçue: type=translation_completed, taskId=xxx
✅ Traduction reçue: "Hello, how are you today?"
⏱️ Durée: 234ms

====================================================================
TEST 2: Traduction texte multi-langues (fr → en, es, de)
====================================================================
📤 Envoi translation: 'La technologie évolue rapidement dans le monde moderne....' (fr → ['en', 'es', 'de'])
📨 en: "Technology is evolving rapidly in the modern world."
📨 es: "La tecnología evoluciona rápidamente en el mundo moderno."
📨 de: "Die Technologie entwickelt sich in der modernen Welt schnell."
✅ Toutes les traductions reçues
⏱️ Durée totale: 567ms

...

====================================================================
🎉 TOUS LES TESTS SONT PASSÉS !
====================================================================

✅ Le Translator fonctionne correctement pour:
   • Traduction texte simple
   • Traduction multi-langues
   • Traduction texte long
   • Traitement audio complet
   • Transcription mobile
   • Transcription seule
   • Gestion d'erreurs
   • Requêtes concurrentes

✅ Le système est prêt pour la production !
```

---

## Structure du test

### GatewaySimulator

Classe principale qui simule le comportement du Gateway :

```python
class GatewaySimulator:
    """Simule le Gateway pour tester le Translator"""

    async def connect()
        # Établit les connexions ZMQ PUSH/SUB

    async def send_translation_request(text, source, targets)
        # Envoie une requête type: 'translation'

    async def send_audio_process_request(audio_path, targets)
        # Envoie une requête type: 'audio_process' en multipart

    async def send_transcription_only_request(audio_path)
        # Envoie une requête type: 'transcription_only' en multipart

    async def wait_for_response(task_id, timeout)
        # Attend la réponse du Translator
```

### Architecture ZMQ

```
Test Script (GatewaySimulator)
    ↓ PUSH (port 5555)
Translator (PULL)
    ↓ Traitement
Translator (PUB port 5558)
    ↓ SUB
Test Script (écoute réponses)
```

---

## Dépannage

### Erreur: "Address already in use"

Le Translator n'est pas actif ou les ports sont occupés.

**Solution** :
```bash
# Vérifier les ports
lsof -i :5555
lsof -i :5558

# Redémarrer le Translator
make restart
```

### Erreur: "Timeout après 30000ms"

Le Translator ne répond pas assez vite.

**Solutions possibles** :
- Augmenter le timeout dans le test
- Vérifier les logs du Translator : `tmux attach -t meeshy:translator`
- Vérifier que les modèles ML sont chargés

### Tests audio skippés

Le fichier `/tmp/test_audio.m4a` n'existe pas.

**Solution** :
```bash
# Créer un fichier audio de test
cp path/to/audio.m4a /tmp/test_audio.m4a
```

### Erreur: "name 'TranslationTask' is not defined"

Import manquant dans le Translator (bug corrigé).

**Solution** :
```bash
# Redémarrer le Translator avec le code corrigé
cd services/translator
git pull  # Si le fix est committé
# Ou vérifier que zmq_translation_handler.py contient:
# from .zmq_models import TranslationTask
```

---

## Intégration dans la suite de tests

### pytest.ini

Ajouter dans le fichier `pytest.ini` du projet :

```ini
[pytest]
markers =
    e2e: Tests d'intégration end-to-end (skip en CI)
    unit: Tests unitaires
    integration: Tests d'intégration
```

### GitHub Actions (skip en CI)

Les tests e2e sont automatiquement skippés quand `CI=true` :

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: |
    # Tests unitaires (rapides)
    pytest tests/unit -v

    # Tests d'intégration (skip e2e)
    CI=true pytest tests/integration -v
```

### Exécution locale

```bash
# Tout exécuter (y compris e2e si Translator actif)
pytest tests/ -v

# Skip e2e manuellement
pytest tests/ -m "not e2e" -v
```

---

## Extension du test

### Ajouter un nouveau test

```python
@pytest.mark.asyncio
async def test_my_new_scenario(gateway_simulator: GatewaySimulator):
    """
    Test 9: Mon nouveau scénario
    """
    logger.info("\n" + "="*70)
    logger.info("TEST 9: Mon nouveau scénario")
    logger.info("="*70)

    # 1. Envoyer une requête
    task_id = await gateway_simulator.send_translation_request(
        text="Mon texte à traduire",
        source_language="fr",
        target_languages=["en"],
        model_type="premium"
    )

    # 2. Attendre la réponse
    response = await gateway_simulator.wait_for_response(task_id)

    # 3. Assertions
    assert response is not None
    assert response['type'] == 'translation_completed'
    # ... autres assertions

    logger.info("✅ Test réussi")
```

### Tester d'autres formats audio

```python
@pytest.mark.parametrize("audio_file,mime_type", [
    ("/tmp/test.mp3", "audio/mpeg"),
    ("/tmp/test.wav", "audio/wav"),
    ("/tmp/test.ogg", "audio/ogg"),
])
@pytest.mark.asyncio
async def test_audio_formats(gateway_simulator, audio_file, mime_type):
    """Test différents formats audio"""
    task_id = await gateway_simulator.send_audio_process_request(
        audio_path=audio_file,
        target_languages=["en"]
    )
    response = await gateway_simulator.wait_for_response(task_id, timeout_ms=120000)
    assert response is not None
```

---

## Métriques et performance

### Durées attendues

| Test | Durée attendue | Timeout |
|------|----------------|---------|
| Traduction simple | 200-500ms | 30s |
| Multi-langues (3) | 500-1500ms | 45s |
| Texte long | 1-3s | 60s |
| Audio process | 10-60s | 120s |
| Transcription | 5-30s | 60s |
| Concurrence (10) | 2-5s | 60s |

### Indicateurs de santé

- ✅ **Excellent** : Toutes les réponses < timeout / 2
- ⚠️ **Acceptable** : Quelques réponses proches du timeout
- ❌ **Problème** : Timeouts fréquents → Vérifier les ressources système

---

## Questions fréquentes

### Q: Puis-je exécuter ces tests pendant que le Gateway est actif ?

**R:** Oui ! Le test simule un Gateway indépendant et ne conflictera pas avec le vrai Gateway. Les deux peuvent coexister.

### Q: Les tests modifient-ils la base de données ?

**R:** Non. Les tests envoient des requêtes au Translator mais n'écrivent rien en base. Les taskIds de test (`test_msg_xxx`, `test_conv_xxx`) sont fictifs.

### Q: Combien de temps prennent tous les tests ?

**R:** Environ 1-2 minutes sans audio, 3-5 minutes avec tous les tests audio.

### Q: Puis-je déboguer un test spécifique ?

**R:** Oui, avec le debugger Python :
```bash
python -m pdb tests/integration/test_translator_e2e.py
```

Ou avec breakpoints dans le code :
```python
import pdb; pdb.set_trace()
```

---

## Contributeurs

Pour ajouter de nouveaux tests ou améliorer les existants, suivre ces guidelines :

1. **Nommer clairement** : `test_<scenario>_<cas_specifique>`
2. **Logger abondamment** : Utiliser `logger.info()` pour tracer l'exécution
3. **Assertions explicites** : Messages d'erreur clairs
4. **Timeout généreux** : Mieux vaut un test lent qu'un faux négatif
5. **Documenter** : Docstring expliquant ce qui est testé

---

## Ressources

- Documentation ZMQ Python : https://pyzmq.readthedocs.io/
- Pytest asyncio : https://github.com/pytest-dev/pytest-asyncio
- Architecture ZMQ Meeshy : `/services/gateway/TYPES_REQUETES_ZMQ.md`
- Flux de traduction : `/services/gateway/FLUX_TRADUCTION_MESSAGES.md`
