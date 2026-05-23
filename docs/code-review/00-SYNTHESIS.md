# Code Review — Synthèse iOS + Backend

**Date :** 2026-05-22
**Périmètre :** iOS (`apps/ios` + `packages/MeeshySDK`), Backend TS (`services/gateway` + `packages/shared`), Translator Python (`services/translator`)
**Méthode :** 3 agents d'exploration en parallèle, rapports croisés.

---

## TL;DR

| Zone | Fichiers scannés | Dead code | Effort cleanup | Verdict |
|------|------------------|-----------|----------------|---------|
| iOS / Swift | ~1308 (.swift) | **1 fichier** (97 LOC) | 1 min | Hygiène excellente |
| Backend TS | 526 (gateway + shared) | **10 fichiers** (~150 KB) + 10 events Socket.IO | 30–60 min | Bonne hygiène, dette de migration à purger |
| Translator Python | 113 (.py) | **3 fichiers critiques** + 1 dataclass + 1 event ZMQ | ~40 min | Bonne hygiène, refactor ML déjà fait |

**Total LOC supprimable de haute confiance : ~5 000 LOC** (essentiellement des backups `.old`/`.backup` côté gateway).

**Aucun chantier de refactoring majeur identifié.** Le repo est globalement bien tenu. Les seuls vrais "sujets" sont :
1. Purger les artefacts de migration laissés en arbre (`.backup`, `.old`, `.before_restore`)
2. Décider du sort des 10+ events Socket.IO `CALL_*` / `MESSAGE_PIN*` (placeholders future-proof ou dead code ?)
3. Résoudre les 2 routes commentées dans `server.ts` (timeout au démarrage de `getEncryptionService`)

---

## 1. iOS / Swift (`01-ios.md`)

### Findings
- **1 fichier orphelin** : `apps/ios/Meeshy/Features/Main/Services/WebRTC/DarkFrameDetector.swift` (97 LOC) — classe qui détecte une caméra obstruée pendant un appel, **zéro call site**. À supprimer.
- **0 fonction inutilisée** — les 27 singletons `.shared` ont tous ≥20 call sites, les 40 protocoles `*Providing` ont tous exactement 1 conformance consommée (pattern MVVM imposé par `CLAUDE.md`).
- **0 doublon fonctionnel** — `MessageSocketManager` vs `SocialSocketManager`, `MessageService` vs `ConversationService` sont des séparations légitimes par domaine.
- **0 code commenté problématique** — les `@available(*, deprecated)` (~15) sont tous des alias de migration intentionnels datés mai 2026.

### Confiance
Haute. Recherche exhaustive sur ~199 k LOC ; un agent dédié sur ~600 fichiers sources + tests.

---

## 2. Backend TypeScript (`02-backend-typescript.md`)

### Findings P0 (zéro risque, suppression directe)

**7 artefacts de backup à supprimer** (~80 KB) :
```
services/message-translation/MessageTranslationService.ts.before_restore  (~40 KB)
services/AttachmentService.ts.old
routes/communities.ts.backup
routes/auth.ts.backup
routes/user-features.ts.old
routes/users.ts.backup
routes/admin.ts.backup
```

**3 routes orphelines à supprimer** (~67 KB) :
```
routes/affiliate-old.ts            (14.7 KB)  remplacé par affiliate.ts
routes/notifications-secured.ts    (~29 KB)   variante jamais importée
routes/health.ts                   (23.2 KB)  remplacé par inline dans server.ts:848
```

### Findings P1 (investigation requise)

**2 routes commentées avec TODO** dans `server.ts:998–1005` :
- `conversationEncryptionRoutes` : "TEMPORAIREMENT COMMENTÉ - timeout au démarrage"
- `encryptionKeysRoutes` : "getEncryptionService prend trop de temps"

→ Soit fixer (init async lazy de `EncryptionService`), soit supprimer définitivement.

**10+ events Socket.IO déclarés et jamais émis** depuis le gateway :
- `MESSAGE_PINNED`, `MESSAGE_UNPINNED` — feature épinglage
- `CALL_MISSED`, `CALL_QUALITY_ALERT`, `CALL_TRANSLATED_SEGMENT`, `CALL_TRANSLATION_REQUESTED/ENABLED`, `CALL_TRANSCRIPTION_RESULT`, `CALL_ALREADY_ANSWERED`, `CALL_SCREEN_CAPTURE_ALERT`

→ Confiance moyenne, peuvent être consommés côté iOS sans émetteur gateway (côté client only). À confirmer avant suppression. Sinon : regrouper dans `FUTURE_EVENTS` documentés.

### Findings P2 (refactoring optionnel)

- 1 stub `@deprecated requireActiveAccount()` dans `middleware/auth.ts`
- Documenter la stratégie cache (`CacheStore` vs `MultiLevelCache` vs `TranslationCache`) dans `services/gateway/CLAUDE.md`

### Confiance
Haute pour les fichiers orphelins (vérification d'imports), moyenne pour les events Socket.IO.

---

## 3. Translator Python (`03-translator-python.md`)

### Findings P0 (zéro risque)

| Fichier | Statut |
|---------|--------|
| `services/translation_ml_service_ORIGINAL_BACKUP.py` | Backup pur, jamais importé |
| `services/quantized_ml_service.py` | Service ML quantifié remplacé, jamais appelé |
| `models/TranslationTask` (`zmq_models.py:20–44`) | Dataclass jamais instanciée — le code utilise dicts ZMQ directs |

### Findings P1

- `services/voice_recognition_service.py` — singleton jamais instancié (confiance moyenne)
- `services/diarization_speechbrain.py` — fallback conditionnel utilisé uniquement si SpeechBrain actif (à **conserver** : c'est un fallback stratégique)
- `services/tts_service.py` — shim de compatibilité, peut être inliné dans `services/tts/tts_service.py` (10 min)
- `services/audio_fetcher.py` — scraper legacy remplacé par audio pipeline
- Event ZMQ `story_text_object` — tentative d'émission échouée ("Socket PUB non disponible")
- ~3-4 endpoints FastAPI faibles : `POST /audio/transcriptions`, `GET /audio/stats`, `POST /admin/ab-test/{id}/start` (TODO visible)

### Findings non-issues

- Caches Redis bien équilibrés (écrivains/lecteurs)
- Pas de doublons fonctionnels (refactor ML/TTS propre)
- Pas de branches mortes (`REDIS_AVAILABLE`, `VOICE_API_AVAILABLE`, `AUDIO_SERVICES_AVAILABLE` correctement gérés)

### Confiance
Haute pour les 2 backups, moyenne pour les endpoints faibles.

---

## 4. Plan d'action consolidé

### Phase A — Suppression immédiate (1 commit, ~10 min, zéro risque)

```bash
# iOS (1 fichier)
git rm apps/ios/Meeshy/Features/Main/Services/WebRTC/DarkFrameDetector.swift

# Backend TS — backups (7)
git rm services/gateway/src/services/message-translation/MessageTranslationService.ts.before_restore
git rm services/gateway/src/services/AttachmentService.ts.old
git rm services/gateway/src/routes/{communities,auth,users,admin}.ts.backup
git rm services/gateway/src/routes/user-features.ts.old

# Backend TS — orphelines (3)
git rm services/gateway/src/routes/affiliate-old.ts
git rm services/gateway/src/routes/notifications-secured.ts
git rm services/gateway/src/routes/health.ts

# Translator (2 backups + 1 service inutilisé)
git rm services/translator/services/translation_ml_service_ORIGINAL_BACKUP.py
git rm services/translator/services/quantized_ml_service.py
git rm services/translator/services/voice_recognition_service.py   # à confirmer
```

**Total : ~14 fichiers, ~150–200 KB de code mort.**

### Phase B — Cleanup après validation (1–2 commits, ~1 h)

1. **TranslationTask** : retirer la dataclass de `zmq_models.py:20–44`
2. **Shim `tts_service.py`** : inliner ou retirer
3. **Routes commentées server.ts:998–1005** : fixer init async ou supprimer définitivement
4. **`requireActiveAccount()`** : supprimer si confirmé sans consommateur

### Phase C — Décisions produit (à valider avant action)

1. **10+ events Socket.IO `CALL_*` / `MESSAGE_PIN*`** : confirmer avec produit/iOS s'ils sont :
   - réservés pour Phase 2 (→ `FUTURE_EVENTS` documentés)
   - déjà consommés côté iOS sans émetteur gateway encore (→ documenter)
   - définitivement abandonnés (→ supprimer)
2. **Audit IDOR/validation** dans `notifications-secured.ts` : décider si les durcissements valent un rebase sur `notifications.ts` avant suppression.

---

## 5. Croisement avec les autres audits parallèles

`main` contient déjà :
- `tasks/ios-bandwidth-audit-2026-05-21.md`
- `tasks/ios-weaknesses-analysis-2026-05-21.md`
- `tasks/ios-improvements-execution.md`

→ produits par une **session Claude parallèle** la veille (21 mai). À comparer avec `docs/bandwidth-analysis/04-ios.md` (mon audit bande passante iOS) avant d'attaquer la Phase 2 du plan bande passante, pour éviter de retravailler les mêmes items.

---

## 6. Métriques de confiance par rapport

| Rapport | Couverture méthodologique | Confiance globale |
|---------|---------------------------|-------------------|
| 01-ios.md | Recherche exhaustive de call sites, vérif protocoles, singletons, @Published | **Haute** |
| 02-backend-typescript.md | Vérif imports, émetteurs Socket.IO, exports shared | **Haute** (fichiers) / **Moyenne** (events) |
| 03-translator-python.md | Trace depuis entry points, croisement events ZMQ | **Haute** |

---

## 7. Ce qui n'a PAS été audité

- `apps/web/` — explicitement exclu (à revoir séparément)
- Tests (`__tests__/`, `*.test.ts`, `tests/`) — gardés
- Code généré Prisma (`packages/shared/prisma/client/`)
- `apps/ios/fastlane/` — CI/release
- Migrations Prisma anciennes
- Code récemment ajouté (< 7 jours)

---

## Conclusion

Le projet est **bien tenu globalement**. Aucun nettoyage critique requis. Le seul vrai pain point est la **dette de migration** côté gateway (les 7 fichiers `.backup`/`.old`) — purger ces fichiers fait gagner ~80 KB et lève l'ambiguïté pour les futurs lecteurs. La purge des routes orphelines (3 fichiers, ~67 KB) est aussi sans risque.

**Recommandation immédiate :** lancer la **Phase A** (14 suppressions) en un seul commit. Phase B et C demandent validation préalable.
