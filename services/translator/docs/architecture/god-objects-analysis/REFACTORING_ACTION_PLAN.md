# Plan d'Action - Refactoring God Objects
**Service**: Translator
**Date**: 2026-01-18
**Priorité**: CRITIQUE
**Effort Total Estimé**: 60 jours-développeur (3 mois à 2 devs)

---

## PHASE 1: CRITIQUE (Sprint 1-2) - 4 semaines

### 🔴 1.1 Voice Clone Service Refactoring (Semaines 1-2)

**Fichier**: `src/services/voice_clone_service.py` (2753 lignes → 6 modules)

#### Jour 1-2: Analyse et Préparation
- [ ] Cartographier toutes les dépendances externes
- [ ] Identifier les tests existants (si existants)
- [ ] Créer une suite de tests de régression complète
- [ ] Documenter les interfaces publiques actuelles
- [ ] Créer les branches Git: `refactor/voice-clone-service`

#### Jour 3-4: Extraction Module 1 - Metadata
**Objectif**: Extraire les classes de métadonnées (SpeakerInfo, RecordingMetadata)

```bash
# Créer la structure
mkdir -p src/services/voice_clone/metadata
touch src/services/voice_clone/metadata/__init__.py
touch src/services/voice_clone/metadata/speaker_info.py
touch src/services/voice_clone/metadata/recording_metadata.py
```

- [ ] Extraire `SpeakerInfo` (lignes 315-360)
- [ ] Extraire `RecordingMetadata` (lignes 361-420)
- [ ] Ajouter tests unitaires (coverage > 90%)
- [ ] Mettre à jour les imports

#### Jour 5-6: Extraction Module 2 - Fingerprinting
**Objectif**: Isoler la logique de cryptographie et empreintes vocales

```bash
mkdir -p src/services/voice_clone/fingerprinting
touch src/services/voice_clone/fingerprinting/__init__.py
touch src/services/voice_clone/fingerprinting/voice_fingerprint.py
touch src/services/voice_clone/fingerprinting/crypto.py
```

- [ ] Extraire `VoiceFingerprint` (lignes 67-314)
- [ ] Séparer la logique cryptographique (SHA-256, checksums)
- [ ] Tests unitaires pour comparaison d'empreintes
- [ ] Tests de sécurité (checksums, collisions)

#### Jour 7-8: Extraction Module 3 - Analysis
**Objectif**: Isoler l'analyseur vocal (VoiceAnalyzer)

```bash
mkdir -p src/services/voice_clone/analysis
touch src/services/voice_clone/analysis/__init__.py
touch src/services/voice_clone/analysis/voice_analyzer.py
touch src/services/voice_clone/analysis/audio_quality.py
touch src/services/voice_clone/analysis/speaker_detector.py
```

- [ ] Extraire `VoiceAnalyzer` (lignes 691-1457)
- [ ] Extraire `AudioQualityMetadata` (lignes 421-492)
- [ ] Séparer la logique de diarization (speaker detection)
- [ ] Tests avec fichiers audio de test
- [ ] Performance benchmarks (doit rester < 2s par analyse)

#### Jour 9-10: Extraction Module 4 - Embedding
**Objectif**: Isoler l'extraction d'embeddings et OpenVoice

```bash
mkdir -p src/services/voice_clone/embedding
touch src/services/voice_clone/embedding/__init__.py
touch src/services/voice_clone/embedding/embedding_extractor.py
touch src/services/voice_clone/embedding/openvoice_wrapper.py
```

- [ ] Extraire logique d'extraction d'embeddings
- [ ] Wrapper propre pour OpenVoice
- [ ] Gestion des téléchargements de checkpoints
- [ ] Tests avec modèles mockés
- [ ] Documentation de l'API OpenVoice

#### Jour 11-12: Extraction Module 5 - Profiles
**Objectif**: Gestion des profils vocaux (CRUD + temporaires + multi-speaker)

```bash
mkdir -p src/services/voice_clone/profiles
touch src/services/voice_clone/profiles/__init__.py
touch src/services/voice_clone/profiles/profile_manager.py
touch src/services/voice_clone/profiles/temp_profiles.py
touch src/services/voice_clone/profiles/multi_speaker.py
```

- [ ] Extraire `TemporaryVoiceProfile` (lignes 624-655)
- [ ] Extraire `MultiSpeakerTranslationContext` (lignes 656-690)
- [ ] Créer `ProfileManager` pour CRUD
- [ ] Tests de gestion de cycle de vie des profils
- [ ] Tests de nettoyage automatique

#### Jour 13-14: Refactoring Core Service
**Objectif**: Service principal devient un orchestrateur léger

```bash
touch src/services/voice_clone/core/__init__.py
touch src/services/voice_clone/core/voice_clone_service.py (300 lignes max)
touch src/services/voice_clone/core/voice_model.py
```

- [ ] Refactorer `VoiceCloneService` (lignes 1458-2753 → 300 lignes)
- [ ] Le service orchestre les modules extraits
- [ ] Supprimer la logique métier (déplacée dans modules)
- [ ] Tests d'intégration complets
- [ ] Documentation API publique

#### Jour 15-16: Tests et Validation
- [ ] Suite de tests de régression complète (run sur ancien + nouveau code)
- [ ] Performance benchmarks (vérifier pas de dégradation)
- [ ] Tests end-to-end avec vrais audios
- [ ] Code review approfondie (2 reviewers minimum)
- [ ] Mise à jour documentation

---

### 🔴 1.2 ZMQ Server Refactoring (Semaines 3-4)

**Fichier**: `src/services/zmq_server.py` (2257 lignes → 4 services)

#### Jour 1-2: Analyse et Préparation
- [ ] Cartographier flux de requêtes ZMQ
- [ ] Identifier tous les types de messages
- [ ] Créer tests de charge (baseline performance)
- [ ] Documenter protocole ZMQ actuel
- [ ] Créer branche: `refactor/zmq-server`

#### Jour 3-4: Extraction Module 1 - Server Core
**Objectif**: Serveur ZMQ pur (networking uniquement)

```bash
mkdir -p src/services/gateway/zmq/server
touch src/services/gateway/zmq/server/__init__.py
touch src/services/gateway/zmq/server/zmq_server.py
touch src/services/gateway/zmq/server/router.py
touch src/services/gateway/zmq/server/connection_manager.py
```

- [ ] Extraire logique ZMQ pure (bind, listen, send, receive)
- [ ] Router pour dispatch des messages
- [ ] Connection manager (gestion connexions clients)
- [ ] Tests avec ZMQ mock
- [ ] Tests de reconnexion automatique

#### Jour 5-6: Extraction Module 2 - Handlers
**Objectif**: Logique métier isolée du networking

```bash
mkdir -p src/services/gateway/zmq/handlers
touch src/services/gateway/zmq/handlers/__init__.py
touch src/services/gateway/zmq/handlers/translation_handler.py
touch src/services/gateway/zmq/handlers/voice_handler.py
touch src/services/gateway/zmq/handlers/transcription_handler.py
touch src/services/gateway/zmq/handlers/audio_handler.py
```

- [ ] Extraire handler de traduction
- [ ] Extraire handler Voice API
- [ ] Extraire handler transcription
- [ ] Extraire handler audio
- [ ] Tests unitaires sans ZMQ (handlers purs)

#### Jour 7-8: Extraction Module 3 - Pool Manager
**Objectif**: Gestion du pool de workers isolée

```bash
mkdir -p src/services/gateway/zmq/pools
touch src/services/gateway/zmq/pools/__init__.py
touch src/services/gateway/zmq/pools/translation_pool.py
touch src/services/gateway/zmq/pools/task_queue.py
```

- [ ] Extraire `TranslationPoolManager` (lignes 114-951)
- [ ] Extraire `TranslationTask` (lignes 89-113)
- [ ] Queue de tâches indépendante
- [ ] Tests de pool (max workers, timeouts)
- [ ] Tests de load balancing

#### Jour 9-10: Extraction Module 4 - Monitoring
**Objectif**: Métriques et health checks isolés

```bash
mkdir -p src/services/gateway/zmq/monitoring
touch src/services/gateway/zmq/monitoring/__init__.py
touch src/services/gateway/zmq/monitoring/health_monitor.py
touch src/services/gateway/zmq/monitoring/metrics_collector.py
```

- [ ] Extraire health checks
- [ ] Extraire métriques CPU/Memory
- [ ] Prometheus metrics export
- [ ] Dashboard Grafana (si temps)
- [ ] Tests de monitoring

#### Jour 11-12: Intégration et Tests
- [ ] Refactorer fichier principal (orchestrateur léger)
- [ ] Tests d'intégration complets
- [ ] Tests de charge (vérifier performance)
- [ ] Tests de failover (resilience)
- [ ] Documentation déploiement

#### Jour 13-14: Validation et Déploiement
- [ ] Tests end-to-end en environnement staging
- [ ] Performance benchmarks vs baseline
- [ ] Code review (2 reviewers)
- [ ] Mise à jour documentation
- [ ] Plan de rollback préparé

---

## PHASE 2: HIGH PRIORITY (Sprint 3-4) - 4 semaines

### 🟠 2.1 Voice API Handler Refactoring (Semaines 5-6)

**Fichier**: `src/services/voice_api_handler.py` (1052 lignes → Command Pattern)

#### Jour 1-2: Design Command Pattern
```bash
mkdir -p src/services/voice_api/handlers
touch src/services/voice_api/handlers/__init__.py
touch src/services/voice_api/handlers/base_handler.py
```

- [ ] Définir interface `BaseHandler` abstraite
- [ ] Documenter pattern Command
- [ ] Créer structure de dispatch

#### Jour 3-5: Extraction Handlers
```bash
touch src/services/voice_api/handlers/translation_handler.py
touch src/services/voice_api/handlers/analysis_handler.py
touch src/services/voice_api/handlers/profile_handler.py
touch src/services/voice_api/handlers/job_handler.py
touch src/services/voice_api/handlers/admin_handler.py
```

- [ ] TranslationHandler: translate, translate_async
- [ ] AnalysisHandler: analyze, compare
- [ ] ProfileHandler: profile_*, CRUD
- [ ] JobHandler: job_status, job_cancel
- [ ] AdminHandler: stats, metrics, health

#### Jour 6-7: Dispatcher et Intégration
```bash
touch src/services/voice_api/dispatcher.py
touch src/services/voice_api/voice_api_handler.py (100L - facade)
```

- [ ] Dispatcher avec registry de handlers
- [ ] Facade légère pour API publique
- [ ] Tests unitaires par handler
- [ ] Tests d'intégration

#### Jour 8: Tests et Documentation
- [ ] Suite de tests complète
- [ ] Documentation des nouveaux handlers
- [ ] Code review
- [ ] Mise en production staging

---

### 🟠 2.2 Translation ML Service Refactoring (Semaines 7-8)

**Fichier**: `src/services/translation_ml_service.py` (1191 lignes → 3 modules)

#### Jour 1-2: Extraction Model Loader
```bash
mkdir -p src/services/translation/ml/models
touch src/services/translation/ml/models/__init__.py
touch src/services/translation/ml/models/model_loader.py
touch src/services/translation/ml/models/batch_processor.py
touch src/services/translation/ml/models/language_detector.py
```

- [ ] Extraire chargement NLLB
- [ ] Extraire batch processing
- [ ] Extraire détection de langue

#### Jour 3-4: Extraction Pipeline Manager
```bash
mkdir -p src/services/translation/ml/service
touch src/services/translation/ml/service/__init__.py
touch src/services/translation/ml/service/translation_ml_service.py
touch src/services/translation/ml/service/pipeline_manager.py
```

- [ ] Extraire gestion pipelines thread-local
- [ ] Optimisations isolées
- [ ] Service principal allégé

#### Jour 5-6: Extraction Optimization
```bash
mkdir -p src/services/translation/ml/optimization
touch src/services/translation/ml/optimization/__init__.py
touch src/services/translation/ml/optimization/cache_manager.py
touch src/services/translation/ml/optimization/memory_optimizer.py
```

- [ ] Extraire cache Redis
- [ ] Extraire optimisations GPU/CPU

#### Jour 7-8: Tests et Validation
- [ ] Tests de performance (batch vs single)
- [ ] Tests de cache
- [ ] Benchmarks mémoire
- [ ] Documentation

---

## PHASE 3: MEDIUM PRIORITY (Sprint 5-8) - 8 semaines

### 🟡 Amélioration Progressive (12 fichiers)

**Approche**: Refactoring léger, amélioration incrémentale

#### Semaine 9-10: TTS Service
- [ ] Extraire model selector
- [ ] Extraire download manager
- [ ] Améliorer structure (déjà bonne)

#### Semaine 11-12: Model Manager, Audio Pipeline
- [ ] Analyser couplage
- [ ] Séparer responsabilités critiques
- [ ] Tests de performance

#### Semaine 13-14: Analytics, Translation Pipeline
- [ ] Séparer analytics/storage
- [ ] Optimiser pipeline
- [ ] Monitoring amélioré

#### Semaine 15-16: Services restants
- [ ] Voice Profile Handler
- [ ] Voice Analyzer Service
- [ ] Redis Service
- [ ] Database Service
- [ ] Performance utils

---

## CHECKLIST GLOBALE PAR PHASE

### ✅ Avant Refactoring
- [ ] Tous les tests existants passent
- [ ] Performance baseline documentée
- [ ] Branche Git créée
- [ ] Code review de l'état actuel
- [ ] Plan de rollback défini

### ✅ Pendant Refactoring
- [ ] Tests unitaires > 80% coverage
- [ ] Tests d'intégration complets
- [ ] Performance maintenue ou améliorée
- [ ] Documentation à jour
- [ ] Code review continu

### ✅ Après Refactoring
- [ ] Tous les tests passent (anciens + nouveaux)
- [ ] Performance benchmarks validés
- [ ] Tests de charge en staging
- [ ] Documentation complète
- [ ] Formation équipe si nécessaire
- [ ] Monitoring post-déploiement (48h)

---

## RÈGLES DE REFACTORING

### 🚫 NE JAMAIS
1. Modifier la logique métier pendant le refactoring
2. Déployer sans tests de régression complets
3. Refactorer plusieurs fichiers en parallèle (phase 1)
4. Ignorer les warnings de performance
5. Skip les code reviews

### ✅ TOUJOURS
1. Écrire les tests AVANT de refactorer
2. Déployer en staging AVANT production
3. Monitorer les métriques post-déploiement
4. Documenter les changements d'architecture
5. Communiquer avec l'équipe

---

## MÉTRIQUES DE SUCCÈS

### Quantitatives
- [ ] Fichiers > 600L: 17 → 5 (-70%)
- [ ] Fichiers > 1000L: 5 → 0 (-100%)
- [ ] Coverage tests: 45% → 85% (+40%)
- [ ] Temps moyen debugging: -50%
- [ ] Performance: ±0% (pas de dégradation)

### Qualitatives
- [ ] Code plus facile à comprendre (sondage équipe)
- [ ] Onboarding réduit de 2 semaines → 1 semaine
- [ ] Moins de bugs en production (-30%)
- [ ] Déploiements plus confiants (moins de rollbacks)

---

## RESSOURCES REQUISES

### Équipe
- 2 développeurs seniors (full-time, 3 mois)
- 1 QA engineer (tests de régression)
- 1 DevOps (déploiement, monitoring)
- 1 Tech Lead (code reviews, architecture)

### Infrastructure
- Environnement staging dédié
- Monitoring avancé (Grafana, Prometheus)
- CI/CD automatisé
- Outils de profiling (performance)

### Temps
- **Phase 1 (Critique)**: 4 semaines
- **Phase 2 (High)**: 4 semaines
- **Phase 3 (Medium)**: 8 semaines
- **Total**: ~3 mois

---

## COMMUNICATION

### Réunions
- **Daily standup** (15 min) - Avancement refactoring
- **Weekly review** (1h) - Démonstration modules refactorés
- **Bi-weekly planning** (2h) - Ajustement priorités

### Reporting
- Dashboard temps réel (Jira/Linear)
- Rapport hebdomadaire (métriques + blockers)
- Post-mortem après chaque phase

---

## PLAN DE ROLLBACK

### Si Problème Critique Détecté
1. **Immédiat** (< 5 min): Rollback vers version précédente
2. **Investigation** (< 1h): Root cause analysis
3. **Fix** (< 24h): Correction en branche séparée
4. **Re-déploiement** (après validation staging)

### Conditions de Rollback
- Performance dégradée > 20%
- Taux d'erreur > 1%
- Tests de charge échoués
- Bugs critiques non-résolus en 24h

---

**Dernière mise à jour**: 2026-01-18
**Responsable**: Tech Lead
**Statut**: ⏳ EN ATTENTE D'APPROBATION
