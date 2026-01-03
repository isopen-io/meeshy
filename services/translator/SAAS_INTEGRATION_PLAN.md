# Plan d'Intégration SaaS - Audio Translation API

## Analyse de Couverture

### Légende
- ✅ Implémenté
- ⚠️ Partiellement implémenté
- ❌ Non implémenté

---

## 1. VOICE TRANSLATION

| Endpoint | Statut | Fichier Actuel | Notes |
|----------|--------|----------------|-------|
| `POST /api/v1/voice/translate` | ⚠️ | `audio_api.py:261` | Existe comme `/v1/voice-message` - renommer + adapter |
| `POST /api/v1/voice/translate/async` | ❌ | - | Nécessite Redis + Celery/RQ |
| `GET /api/v1/voice/job/{job_id}` | ❌ | - | Nécessite job queue |
| `DELETE /api/v1/voice/job/{job_id}` | ❌ | - | Nécessite job queue |

**Gap**: Système de jobs async avec webhooks manquant

---

## 2. VOICE PROFILES

| Endpoint | Statut | Fichier Actuel | Notes |
|----------|--------|----------------|-------|
| `GET /api/v1/voice/profile` | ❌ | - | VoiceCloneService a la logique, endpoint manquant |
| `POST /api/v1/voice/profile` | ⚠️ | `audio_api.py:214` | Existe comme `/v1/register-voice` |
| `POST /api/v1/voice/profile/sample` | ❌ | - | `_improve_model()` existe, endpoint manquant |
| `DELETE /api/v1/voice/profile` | ❌ | - | Méthode à créer dans VoiceCloneService |

**Gap**: CRUD complet pour profiles vocaux

---

## 3. FEEDBACK & ANALYTICS

| Endpoint | Statut | Fichier Actuel | Notes |
|----------|--------|----------------|-------|
| `POST /api/v1/voice/feedback` | ❌ | - | Système de feedback qualité à créer |
| `GET /api/v1/voice/stats` | ⚠️ | `audio_api.py:353` | `/v1/audio/stats` - stats globales, pas par user |
| `GET /api/v1/voice/history` | ❌ | - | Nécessite table d'historique |

**Gap**: Système de feedback et historique utilisateur

---

## 4. ADMIN / MONITORING

| Endpoint | Statut | Fichier Actuel | Notes |
|----------|--------|----------------|-------|
| `GET /api/v1/admin/metrics` | ❌ | - | Métriques Prometheus/StatsD |
| `GET /api/v1/admin/queue` | ❌ | - | Status queue Redis |
| `POST /api/v1/admin/ab-test` | ❌ | - | Infrastructure A/B testing |
| `GET /api/v1/health` | ✅ | `health.py` | Complet |

**Gap**: Monitoring admin et A/B testing

---

## 5. SERVICES BACKEND

| Composant | Statut | Fichier | Notes |
|-----------|--------|---------|-------|
| TranscriptionService | ✅ | `transcription_service.py` | faster-whisper + fallback |
| VoiceCloneService | ✅ | `voice_clone_service.py` | OpenVoice V2 embeddings |
| TTSService | ✅ | `tts_service.py` | XTTS synthesis |
| AudioMessagePipeline | ✅ | `audio_message_pipeline.py` | Orchestration complète |
| Redis Cache | ❌ | - | À ajouter |
| Job Queue (Celery/RQ) | ❌ | - | À ajouter |

---

## 6. MODÈLES PRISMA

| Modèle | Statut | Notes |
|--------|--------|-------|
| MessageAudioTranscription | ✅ | Créé |
| MessageTranslatedAudio | ✅ | Créé |
| UserVoiceModel | ✅ | Créé |
| VoiceQualityFeedback | ❌ | À créer |
| TranslationJob | ❌ | À créer pour async |
| TranslationHistory | ❌ | À créer |

---

# Plan d'Implémentation

## Phase 1: Refactoring API (Priorité Haute)

### 1.1 Restructurer les endpoints existants

```python
# Nouveau fichier: src/api/voice_api.py

# Voice Translation
POST   /api/v1/voice/translate          # Renommer de /v1/voice-message
GET    /api/v1/voice/languages          # Langues supportées

# Voice Profiles
GET    /api/v1/voice/profile            # Nouveau
POST   /api/v1/voice/profile            # Renommer de /v1/register-voice
POST   /api/v1/voice/profile/sample     # Nouveau (utilise _improve_model)
DELETE /api/v1/voice/profile            # Nouveau
PUT    /api/v1/voice/profile/settings   # Nouveau
```

### 1.2 Fichiers à modifier/créer

- [ ] `src/api/voice_api.py` - Nouveau routeur API v1
- [ ] `src/services/voice_clone_service.py` - Ajouter delete_profile()
- [ ] `src/api/audio_api.py` - Déprécier anciens endpoints

---

## Phase 2: Système Async avec Jobs (Priorité Haute)

### 2.1 Infrastructure

```yaml
# docker-compose.yml additions
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"

celery-worker:
  build: .
  command: celery -A src.tasks worker --loglevel=info
  depends_on:
    - redis
```

### 2.2 Fichiers à créer

- [ ] `src/tasks/__init__.py` - Configuration Celery
- [ ] `src/tasks/translation_tasks.py` - Tâches async
- [ ] `src/services/job_service.py` - Gestion des jobs
- [ ] `src/services/webhook_service.py` - Callbacks webhooks

### 2.3 Modèle Prisma TranslationJob

```prisma
model TranslationJob {
  id              String   @id @default(cuid())
  userId          String
  status          JobStatus @default(PENDING)
  audioUrl        String
  targetLanguages String[]
  webhookUrl      String?
  result          Json?
  error           String?
  progress        Int      @default(0)
  createdAt       DateTime @default(now())
  startedAt       DateTime?
  completedAt     DateTime?

  user            User     @relation(fields: [userId], references: [id])
}

enum JobStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  CANCELLED
}
```

### 2.4 Nouveaux endpoints

```python
POST   /api/v1/voice/translate/async
# Request: { audio_url, target_languages[], webhook_url? }
# Response: { job_id, status: "pending" }

GET    /api/v1/voice/job/{job_id}
# Response: { job_id, status, progress, result?, error? }

DELETE /api/v1/voice/job/{job_id}
# Response: { cancelled: true }
```

---

## Phase 3: Feedback & Analytics (Priorité Moyenne)

### 3.1 Modèle Prisma VoiceQualityFeedback

```prisma
model VoiceQualityFeedback {
  id                String   @id @default(cuid())
  userId            String
  translationId     String
  rating            Int      // 1-5
  feedbackType      String   // "voice_quality", "translation_accuracy", "speed"
  comment           String?
  createdAt         DateTime @default(now())

  user              User     @relation(fields: [userId], references: [id])
  translatedAudio   MessageTranslatedAudio @relation(fields: [translationId], references: [id])
}
```

### 3.2 Nouveaux endpoints

```python
POST   /api/v1/voice/feedback
# Request: { translation_id, rating, feedback_type, comment? }

GET    /api/v1/voice/stats
# Response: { total_translations, avg_rating, languages_used, voice_quality_score }

GET    /api/v1/voice/history
# Query: ?page=1&limit=20&language=fr
# Response: { translations[], pagination }
```

---

## Phase 4: Admin & Monitoring (Priorité Moyenne)

### 4.1 Métriques Prometheus

```python
# src/metrics.py
from prometheus_client import Counter, Histogram, Gauge

TRANSLATION_REQUESTS = Counter('voice_translation_requests_total', 'Total translation requests')
TRANSLATION_DURATION = Histogram('voice_translation_duration_seconds', 'Translation duration')
ACTIVE_JOBS = Gauge('voice_translation_active_jobs', 'Active translation jobs')
QUEUE_SIZE = Gauge('voice_translation_queue_size', 'Job queue size')
```

### 4.2 Nouveaux endpoints admin

```python
GET    /api/v1/admin/metrics
# Response: Prometheus format or JSON metrics

GET    /api/v1/admin/queue
# Response: { pending, processing, completed_24h, failed_24h }

POST   /api/v1/admin/ab-test
# Request: { name, variants[], traffic_split }
```

---

## Phase 5: Cache Redis (Priorité Haute)

### 5.1 Service Redis

```python
# src/services/cache_service.py

class RedisCacheService:
    # TTLs
    TRANSCRIPTION_TTL = 7 * 24 * 3600      # 7 jours
    TRANSLATION_TTL = 7 * 24 * 3600        # 7 jours
    AUDIO_TTL = 24 * 3600                   # 24 heures
    VOICE_EMBEDDING_TTL = 30 * 24 * 3600   # 30 jours

    async def get_transcription(self, audio_hash: str) -> Optional[dict]
    async def set_transcription(self, audio_hash: str, data: dict)

    async def get_translation(self, text_hash: str, src: str, tgt: str) -> Optional[str]
    async def set_translation(self, text_hash: str, src: str, tgt: str, text: str)

    async def get_audio(self, msg_id: str, lang: str) -> Optional[str]
    async def set_audio(self, msg_id: str, lang: str, url: str)
```

### 5.2 Clés de cache

| Type | Format | TTL |
|------|--------|-----|
| Transcription | `transcription:{sha256(audio)[:16]}` | 7 jours |
| Translation | `translation:{sha256(text)[:16]}:{src}:{tgt}` | 7 jours |
| Generated Audio | `audio:{msg_id}:{lang}` | 24 heures |
| Voice Embedding | `voice:{user_id}:embedding` | 30 jours |

---

## Résumé des Tâches

### Sprint 1 (Phase 1 + 5) - Fondations
1. [ ] Créer `src/api/voice_api.py` avec nouveaux endpoints
2. [ ] Ajouter `delete_profile()` à VoiceCloneService
3. [ ] Créer `src/services/cache_service.py` avec Redis
4. [ ] Mettre à jour `docker-compose.yml` pour Redis
5. [ ] Tests unitaires pour nouveaux endpoints

### Sprint 2 (Phase 2) - Async Processing
1. [ ] Configurer Celery avec Redis broker
2. [ ] Créer modèle Prisma `TranslationJob`
3. [ ] Implémenter `job_service.py`
4. [ ] Implémenter `webhook_service.py`
5. [ ] Endpoints async + job status
6. [ ] Tests d'intégration async

### Sprint 3 (Phase 3) - Feedback & History
1. [ ] Créer modèle Prisma `VoiceQualityFeedback`
2. [ ] Endpoints feedback et history
3. [ ] Agrégation stats par utilisateur
4. [ ] Tests

### Sprint 4 (Phase 4) - Monitoring
1. [ ] Intégration Prometheus
2. [ ] Endpoints admin
3. [ ] Dashboard métriques
4. [ ] Infrastructure A/B testing (optionnel)

---

## Dépendances à Ajouter

```txt
# requirements.txt additions
redis>=5.0.0
celery>=5.3.0
prometheus-client>=0.19.0
```

---

## Estimation

| Phase | Effort | Priorité |
|-------|--------|----------|
| Phase 1: Refactoring API | 2-3 jours | Haute |
| Phase 2: Async Jobs | 3-4 jours | Haute |
| Phase 3: Feedback | 2 jours | Moyenne |
| Phase 4: Admin | 2 jours | Moyenne |
| Phase 5: Redis Cache | 1-2 jours | Haute |

**Total estimé: 10-13 jours de développement**

---

*Document créé le 2026-01-03*
