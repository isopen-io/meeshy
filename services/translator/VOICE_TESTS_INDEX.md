# Voice Analyzer Tests - Index de Navigation

Guide rapide pour naviguer dans la documentation et les tests du VoiceAnalyzerService.

---

## 🚀 Démarrage Rapide

**Pour commencer immédiatement:**

1. **[QUICKSTART_VOICE_TESTS.md](QUICKSTART_VOICE_TESTS.md)** - Guide 5 minutes
   - Installation des dépendances
   - Première exécution
   - Commandes essentielles

2. **Exécuter les tests:**
   ```bash
   ./scripts/test-voice-analyzer.sh --mode quick
   ```

---

## 📚 Documentation Complète

### Documentation Principale

| Fichier | Description | Quand l'utiliser |
|---------|-------------|------------------|
| **[QUICKSTART_VOICE_TESTS.md](QUICKSTART_VOICE_TESTS.md)** | Guide rapide 5min | Première utilisation |
| **[VOICE_ANALYZER_TESTS.md](VOICE_ANALYZER_TESTS.md)** | Documentation complète | Référence détaillée |
| **[VOICE_ANALYZER_TEST_SUMMARY.md](VOICE_ANALYZER_TEST_SUMMARY.md)** | Récapitulatif | Vue d'ensemble |

### Documentation Technique

| Fichier | Description |
|---------|-------------|
| [pytest.voice_analyzer.ini](pytest.voice_analyzer.ini) | Configuration pytest |
| [Makefile.voice_tests](Makefile.voice_tests) | Automatisation Make |
| [tests/fixtures/README.md](tests/fixtures/README.md) | Guide fixtures audio |

---

## 🧪 Tests

### Fichiers de Tests

| Fichier | Description | Nb Tests |
|---------|-------------|----------|
| **[tests/test_voice_quality_analyzer.py](tests/test_voice_quality_analyzer.py)** | Suite complète | 47+ tests |

### Catégories de Tests

1. **Initialization** (3 tests) - Singleton, setup, mode dégradé
2. **analyze()** (8 tests) - Extraction caractéristiques vocales
3. **Edge Cases** (4 tests) - Silence, bruit, fichiers invalides
4. **compare()** (5 tests) - Similarité multi-métrique
5. **Classification** (7 tests) - Type voix, genre, âge
6. **Cache** (5 tests) - LRU, performance
7. **Clone Params** (5 tests) - Paramètres optimaux
8. **Integration** (3 tests) - Pipeline complet
9. **Stats & Utils** (4 tests) - Statistiques, cleanup
10. **Error Handling** (3 tests) - Résilience

---

## 🔧 Scripts & Outils

### Scripts d'Exécution

| Script | Description | Usage |
|--------|-------------|-------|
| **[scripts/test-voice-analyzer.sh](scripts/test-voice-analyzer.sh)** | Script bash principal | `./scripts/test-voice-analyzer.sh --mode quick` |
| **[Makefile.voice_tests](Makefile.voice_tests)** | Automatisation Make | `make -f Makefile.voice_tests test` |

### Utilitaires

| Script | Description | Usage |
|--------|-------------|-------|
| [tests/fixtures/generate_test_audio.py](tests/fixtures/generate_test_audio.py) | Génération fixtures audio | `python tests/fixtures/generate_test_audio.py` |

---

## 📖 Guides par Cas d'Usage

### Je veux exécuter les tests rapidement

→ **[QUICKSTART_VOICE_TESTS.md](QUICKSTART_VOICE_TESTS.md)**

```bash
./scripts/test-voice-analyzer.sh --mode quick
```

### Je veux comprendre tous les tests

→ **[VOICE_ANALYZER_TESTS.md](VOICE_ANALYZER_TESTS.md)** - Section "Tests Détaillés"

### Je veux voir la couverture de code

→ **[VOICE_ANALYZER_TESTS.md](VOICE_ANALYZER_TESTS.md)** - Section "Métriques de Couverture"

```bash
./scripts/test-voice-analyzer.sh --mode coverage
open htmlcov/index.html
```

### Je veux ajouter un nouveau test

→ **[VOICE_ANALYZER_TESTS.md](VOICE_ANALYZER_TESTS.md)** - Section "Contribution"

### Je veux générer des fixtures audio

→ **[tests/fixtures/README.md](tests/fixtures/README.md)**

```bash
cd tests/fixtures
python generate_test_audio.py
```

### J'ai un problème avec les tests

→ **[VOICE_ANALYZER_TESTS.md](VOICE_ANALYZER_TESTS.md)** - Section "Troubleshooting"

→ **[QUICKSTART_VOICE_TESTS.md](QUICKSTART_VOICE_TESTS.md)** - Section "Troubleshooting Rapide"

### Je veux intégrer dans CI/CD

→ **[VOICE_ANALYZER_TESTS.md](VOICE_ANALYZER_TESTS.md)** - Section "CI/CD Integration"

```yaml
# GitHub Actions
pytest tests/test_voice_quality_analyzer.py -v --cov
```

---

## 🎯 Commandes Rapides

### Installation

```bash
# Dépendances de test
pip install pytest pytest-asyncio pytest-cov

# Dépendances audio
pip install librosa soundfile scipy numpy
```

### Exécution

```bash
# Tests rapides
./scripts/test-voice-analyzer.sh --mode quick

# Tous les tests
./scripts/test-voice-analyzer.sh --mode full

# Avec couverture
./scripts/test-voice-analyzer.sh --mode coverage

# Tests spécifiques
pytest tests/test_voice_quality_analyzer.py -k "analyze" -v
```

### Makefile

```bash
# Aide
make -f Makefile.voice_tests help

# Tests rapides
make -f Makefile.voice_tests test

# Couverture
make -f Makefile.voice_tests coverage

# Nettoyer
make -f Makefile.voice_tests clean
```

### Fixtures

```bash
# Générer fixtures
cd tests/fixtures
python generate_test_audio.py

# Ou via Makefile
make -f Makefile.voice_tests fixtures
```

---

## 📊 Statistiques

- **47+ tests** au total
- **90%+ couverture** de code ciblée
- **8 types de fixtures** audio
- **5 modes d'exécution** (quick, full, coverage, edge, integration)
- **3 fichiers de documentation** complète
- **2 scripts d'automatisation** (bash + Make)

---

## 🔗 Navigation Rapide

### Par Rôle

**Développeur - Première fois:**
1. [QUICKSTART_VOICE_TESTS.md](QUICKSTART_VOICE_TESTS.md)
2. Exécuter: `./scripts/test-voice-analyzer.sh --mode quick`

**Développeur - Tests approfondis:**
1. [VOICE_ANALYZER_TESTS.md](VOICE_ANALYZER_TESTS.md)
2. [tests/test_voice_quality_analyzer.py](tests/test_voice_quality_analyzer.py)

**Mainteneur - Vue d'ensemble:**
1. [VOICE_ANALYZER_TEST_SUMMARY.md](VOICE_ANALYZER_TEST_SUMMARY.md)
2. [VOICE_ANALYZER_TESTS.md](VOICE_ANALYZER_TESTS.md)

**DevOps - CI/CD:**
1. [VOICE_ANALYZER_TESTS.md](VOICE_ANALYZER_TESTS.md) - Section CI/CD
2. [Makefile.voice_tests](Makefile.voice_tests) - `ci` target

---

## 🆘 Support

### Problèmes Fréquents

| Problème | Solution | Doc |
|----------|----------|-----|
| "librosa not found" | `pip install librosa` | [QUICKSTART](QUICKSTART_VOICE_TESTS.md) |
| "pytest not found" | `pip install pytest` | [QUICKSTART](QUICKSTART_VOICE_TESTS.md) |
| Tests skippés | Installer librosa | [VOICE_ANALYZER_TESTS](VOICE_ANALYZER_TESTS.md) |
| Tests lents | Mode quick | [QUICKSTART](QUICKSTART_VOICE_TESTS.md) |

### Ressources

- **Documentation complète:** [VOICE_ANALYZER_TESTS.md](VOICE_ANALYZER_TESTS.md)
- **Guide rapide:** [QUICKSTART_VOICE_TESTS.md](QUICKSTART_VOICE_TESTS.md)
- **Récapitulatif:** [VOICE_ANALYZER_TEST_SUMMARY.md](VOICE_ANALYZER_TEST_SUMMARY.md)

---

**Dernière mise à jour:** 2026-01-18
