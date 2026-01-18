# Voice Analyzer Tests - Guide de Démarrage Rapide

Guide rapide pour exécuter les tests du VoiceAnalyzerService en 5 minutes.

---

## 1. Installation des Dépendances (2 minutes)

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/translator

# Dépendances de test (requises)
pip install pytest pytest-asyncio pytest-cov

# Dépendances audio (fortement recommandées)
pip install librosa soundfile scipy numpy
```

**Note**: Sans librosa, environ 30% des tests seront skippés (mode dégradé testé mais pas l'analyse complète).

---

## 2. Exécution Rapide (1 minute)

### Test Basique

```bash
./scripts/test-voice-analyzer.sh --mode quick
```

Exécute les tests essentiels sans les tests de performance.

### Tous les Tests

```bash
./scripts/test-voice-analyzer.sh --mode full
```

### Avec Couverture

```bash
./scripts/test-voice-analyzer.sh --mode coverage
```

Génère un rapport HTML de couverture.

---

## 3. Vérifier les Résultats

### Résultat Attendu

```
═══════════════════════════════════════════════════════════════════════════
  VOICE ANALYZER SERVICE - TEST SUITE
═══════════════════════════════════════════════════════════════════════════

🚀 Mode rapide - Tests de base
📁 Répertoire projet: /Users/smpceo/Documents/v2_meeshy/services/translator
📄 Fichier de test: tests/test_voice_quality_analyzer.py
🎯 Mode: quick

========================= test session starts ==========================
platform darwin -- Python 3.12.x, pytest-x.x.x
collected 47 items

tests/test_voice_quality_analyzer.py::test_singleton_pattern PASSED   [  2%]
tests/test_voice_quality_analyzer.py::test_initialize PASSED          [  4%]
tests/test_voice_quality_analyzer.py::test_analyze_success PASSED     [  6%]
...
tests/test_voice_quality_analyzer.py::test_compare_same_voice PASSED  [ 95%]
tests/test_voice_quality_analyzer.py::test_suite_summary PASSED       [100%]

====================== 47 passed in 15.23s ======================

═══════════════════════════════════════════════════════════════════════════
✅ TOUS LES TESTS SONT PASSÉS
═══════════════════════════════════════════════════════════════════════════
```

### Rapport de Couverture

Si vous avez exécuté avec `--mode coverage`:

```bash
open htmlcov/index.html
```

**Objectif**: 90%+ de couverture de code.

---

## 4. Tests Spécifiques

### Tester Seulement l'Analyse

```bash
pytest tests/test_voice_quality_analyzer.py -k "analyze" -v
```

### Tester Seulement la Comparaison

```bash
pytest tests/test_voice_quality_analyzer.py -k "compare" -v
```

### Tester les Edge Cases

```bash
./scripts/test-voice-analyzer.sh --mode edge
```

### Test Unique

```bash
pytest tests/test_voice_quality_analyzer.py::test_analyze_success -v -s
```

L'option `-s` affiche les logs pour debugging.

---

## 5. Générer des Fixtures Audio (Optionnel)

```bash
cd tests/fixtures
python generate_test_audio.py
```

Cela crée 8 fichiers audio de test dans `test_audio_fixtures/`:
- male_voice.wav
- female_voice.wav
- child_voice.wav
- expressive_voice.wav
- monotone_voice.wav
- silence.wav
- white_noise.wav
- short_audio.wav

**Note**: Les tests génèrent automatiquement leurs fixtures, mais vous pouvez utiliser ces fichiers pour des tests manuels.

---

## Résumé des Commandes Clés

| Commande | Description |
|----------|-------------|
| `./scripts/test-voice-analyzer.sh --mode quick` | Tests rapides |
| `./scripts/test-voice-analyzer.sh --mode full` | Tous les tests |
| `./scripts/test-voice-analyzer.sh --mode coverage` | Avec couverture |
| `pytest tests/test_voice_quality_analyzer.py -v` | Exécution directe |
| `pytest ... -k "keyword"` | Filtrer par mot-clé |
| `pytest ... --markers` | Voir les markers |

---

## Troubleshooting Rapide

### ❌ "librosa not found"

```bash
pip install librosa soundfile scipy
```

### ❌ "pytest not found"

```bash
pip install pytest pytest-asyncio pytest-cov
```

### ⚠️ "Tests skipped"

Normal si librosa n'est pas installé. Les tests du mode dégradé passent, mais l'analyse complète est skippée.

### 🐌 Tests lents

Utilisez le mode quick:

```bash
./scripts/test-voice-analyzer.sh --mode quick
```

---

## Documentation Complète

Voir [VOICE_ANALYZER_TESTS.md](VOICE_ANALYZER_TESTS.md) pour:
- Architecture détaillée des tests
- Explication de chaque test
- Guides de contribution
- CI/CD integration
- Debugging avancé

---

## Support

Si vous rencontrez des problèmes:

1. Vérifiez que toutes les dépendances sont installées
2. Consultez [VOICE_ANALYZER_TESTS.md](VOICE_ANALYZER_TESTS.md)
3. Exécutez en mode verbose: `pytest ... -vv --log-cli-level=DEBUG`
4. Vérifiez les logs: les warnings indiquent les dépendances manquantes

---

## Couverture Actuelle

✅ **47+ tests** couvrant:
- analyze() - Extraction complète de caractéristiques
- compare() - Similarité multi-métrique
- Classification vocale (type, genre, âge)
- Edge cases (silence, bruit, fichiers invalides)
- Cache LRU et performance
- Paramètres optimaux de clonage
- Intégration et concurrence

**Objectif de couverture**: 90%+
