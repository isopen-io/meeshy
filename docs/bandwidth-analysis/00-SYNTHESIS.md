# Synthèse Audit Bande Passante — Meeshy

**Date :** 2026-05-21  
**Sources :** 6 rapports d'audit (Socket.IO, REST API, Web Frontend, iOS, Translator interne, Media Storage)  
**Périmètre :** Gateway, Web (Next.js), iOS (Swift/MeeshySDK), Translator (FastAPI), Infrastructure

---

## 1. Executive Summary

### Constat global

L'audit couvre **77 problèmes distincts** classés sur 6 axes. Les gaspillages mesurés atteignent **15–25 MB/utilisateur/jour** pour un profil mobile actif (50 conversations, 100 messages/jour, 10 vocaux/jour), et potentiellement **plusieurs GB/heure côté serveur** pour le pipeline TTS non conditionné.

#### Ventilation par catégorie

| Catégorie | Gaspillage estimé/user/jour | Priorité |
|-----------|---------------------------|----------|
| Compression absente (HTTP + Socket.IO) | 2–4 MB | Immédiate |
| Audio re-encodé 128 kbps vs 64 kbps source | 2,4 MB | Immédiate |
| Avatars 512 px servis pour vignettes 40 px | 1,5–3 MB | Court terme |
| TTS systématique sans demande client (GPU waste) | Plusieurs GB/h serveur | Immédiate |
| Payloads Socket.IO surchargés (stats, traductions) | 5–20 KB/message | Immédiate |
| iOS long-polling forcé au lieu de WebSocket | 100–200 KB/jour + latence ×3 | Court terme |
| Prefetch cold start iOS (20 conversations) | 300 KB/démarrage | Immédiate |
| Bundle JS web (Tone.js, locales, devtools) | 700 KB–1 MB/session | Immédiate |
| Images non compressées côté client | 1–3 MB/session | Court terme |
| Traductions vers toutes les langues (vs langue active) | 30–50 % requêtes NLLB | Court terme |

#### Bilan global estimé avant/après optimisations complètes

| Métrique | Avant | Après Phase 1+2 | Après Phase 3 |
|----------|-------|-----------------|---------------|
| Payload moyen `message:new` | 4–15 KB | 0,5–2 KB | 0,3–1 KB |
| Taille bundle JS initial (web) | ~3,5 MB raw | ~2 MB raw | ~1,5 MB raw |
| Bande passante socket idle iOS | ~2,8 MB/h | ~0,3 MB/h | ~0,1 MB/h |
| Requêtes MongoDB/message | 8–15 | 3–5 | 1–2 |
| TTS généré sans demande | 100% | ~20% | ~0% |

---

### Top 5 Quick Wins (< 1 jour d'effort, impact maximal)

| # | Action | Économie estimée | Fichier |
|---|--------|-----------------|---------|
| QW1 | Activer `perMessageDeflate` Socket.IO | 60–70 % trafic socket | `MeeshySocketIOManager.ts:168` |
| QW2 | Supprimer `meta.conversationStats` du payload `message:new` | 2 KB/message × 100k/s | `MessageHandler.ts:895` |
| QW3 | Ajouter middleware `compress` Traefik production | 2–4 MB/user/jour | `infrastructure/docker/compose/config/dynamic.yaml` |
| QW4 | Guard `NODE_ENV` sur ReactQueryDevtools | 200 KB/session web | `QueryProvider.tsx:4` |
| QW5 | Audio re-encodage 128 kbps → 64 kbps | 2,4 MB/user/jour | `UploadProcessor.ts:184` |

---

### Top 5 Chantiers Structurels (> 1 semaine, transformations majeures)

| # | Chantier | Impact | Périmètre |
|---|----------|--------|-----------|
| S1 | TTS à la demande (lazy) + cache Redis | Plusieurs GB/h serveur économisés | `audio_message_pipeline.py`, clients iOS/Web |
| S2 | WebSocket natif iOS (remplacer `forcePolling`) | Trafic socket iOS ÷3–5 + latence | `MessageSocketManager.swift`, `SocialSocketManager.swift` |
| S3 | CDN/S3 pour médias (Cloudflare R2) | 60–80 % bande passante sortante audio/images | `MediaStorage.ts`, interface prête |
| S4 | Avatars multi-variantes (40/80/512 px) + Next.js Image | 3–4 MB/session web économisés | `ImageProcessingService.ts`, ~30 composants web |
| S5 | Traductions conditionnées aux préférences (`translateToSystemLanguage`) | 30–50 % requêtes NLLB en moins | `MessageTranslationService.ts:651` |

---

## 2. Plan d'action priorisé en 3 phases

### Phase 1 — Quick wins (1–3 jours, déploiement immédiat)

Cible : **80 % du gain avec 20 % de l'effort**.

| # | Problème | Fichier:ligne | Économie estimée | Effort | Risque |
|---|----------|---------------|-----------------|--------|--------|
| 1.1 | Compression WebSocket absente (`perMessageDeflate`) | `MeeshySocketIOManager.ts:168` | 60–70 % trafic socket | 30 min | Faible — option additionnelle |
| 1.2 | `meta.conversationStats` dans `message:new` | `MessageHandler.ts:895` | 2 KB/message | 1h | Faible — suppression champ |
| 1.3 | Middleware `compress` absent sur Traefik | `dynamic.yaml` (middleware section) | 2–4 MB/user/jour | 15 min | Faible — config YAML |
| 1.4 | ReactQueryDevtools en production | `QueryProvider.tsx:4,32` | 200 KB/session | 10 min | Nul — guard `NODE_ENV` |
| 1.5 | Audio re-encodé à 128 kbps (source 64 kbps) | `UploadProcessor.ts:184–239` | 2,4 MB/user/jour | 30 min | Faible — changer flag ffmpeg |
| 1.6 | Locales importées statiquement dans connection.service | `connection.service.ts:20–23` | 200–250 KB bundle JS | 30 min | Faible — dynamic import |
| 1.7 | Supprimer `path` (chemin serveur) des événements audio | `socketio-events.ts:552`, `MeeshySocketIOManager.ts:1018` | Sécurité + 100 B/event | 20 min | Nul — suppression champ |
| 1.8 | Throttle typing indicators web (aucun throttle actuel) | `typing.service.ts:122–138` | 1 KB/s/utilisateur actif | 30 min | Faible — debounce 2s |
| 1.9 | N+1 notifications en boucle séquentielle | `conversations/core.ts:696–715` | 1→N aller-retours MongoDB | 1h | Faible — `updateMany` |
| 1.10 | Sons notification WAV → Opus/OGG | `apps/web/public/sounds/*.wav` | 330 KB/session web | 20 min | Nul — remplacement fichiers |

**Diff conceptuels clés :**

- **1.1** : Ajouter `perMessageDeflate: { threshold: 256, zlibDeflateOptions: { level: 6 } }` dans le constructeur `MeeshySocketIOServer`.
- **1.2** : Supprimer la ligne `meta: { conversationStats: stats }` de `_buildMessagePayload`. Les stats arrivent via `conversation:stats` séparé.
- **1.3** : Ajouter `compress: {}` dans `middlewares` et référencer dans les routers `gateway` et `frontend` de `dynamic.yaml`.
- **1.5** : Changer `-b:a 128k` en `-b:a 64k` dans `amplifyAudio()`. Séparer le gain (+9 dB) du bitrate cible.
- **1.9** : Remplacer `for (notif) { await prisma.notification.update(...) }` par `prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } })`.

---

### Phase 2 — Optimisations ciblées (1–2 semaines)

| # | Problème | Fichier:ligne | Économie estimée | Effort | Risque |
|---|----------|---------------|-----------------|--------|--------|
| 2.1 | Traductions incluses dans `message:new` (DB query + payload) | `MessageHandler.ts:476–491` | 0–30 KB/message | 2h | Moyen — changer contrat payload |
| 2.2 | `read-status:updated` fan-out N rooms | `MessageHandler.ts:685–701` | 30 KB/message (conv 100) | 2h | Moyen — routing simplifié |
| 2.3 | `conversation:updated` boucle N participants | `MessageHandler.ts:578–599` | N requêtes DB/message | 1h | Faible — broadcast room |
| 2.4 | Double `mark-as-received` (gateway + client web) | `use-socket-cache-sync.ts:271`, `messaging.service.ts:64` | 1 REST call/message reçu | 2h | Moyen — sync client/serveur |
| 2.5 | Participants sans limite sur `GET /conversations/:id` | `conversations/core.ts:617–648` | Jusqu'à 225 KB/appel | 1h | Faible — ajouter `take: 50` |
| 2.6 | `translations: true` inconditionnel dans `messageSelect` | `conversations/messages.ts:539` | 30 KB/page messages | 2h | Moyen — conditionner sur param |
| 2.7 | Polling friend requests (2 × 30s, limit 100) | `use-friend-requests-v2.ts:70,88` | 6 MB/h/user actif | 2h | Faible — Socket.IO event |
| 2.8 | iOS prefetch 20 conversations cold start | `ConversationListViewModel.swift:1408` | 300 KB/cold start | 3h | Faible — supprimer appel |
| 2.9 | Pull-to-refresh iOS invalide images + thumbnails | `ConversationListViewModel.swift:1196` | 500 KB–2,5 MB/refresh | 1h | Faible — retirer du scope |
| 2.10 | Tone.js (~800 KB) dans chemin critique message-composer | `utils/audio-effects.ts:13` | 250 KB bundle | 2h | Faible — dynamic import |
| 2.11 | `@fastify/compress` absent côté Fastify | `gateway/server.ts` | 3–5× sur JSON (filet de sécurité) | 30 min | Faible — plugin additionnel |
| 2.12 | Traduction vers toutes les langues (ignore préférences) | `MessageTranslationService.ts:651–656` | 30–50 % requêtes NLLB | 4h | Moyen — lire flags `translateTo*` |
| 2.13 | `presence:snapshot` trop volumineux à chaque auth socket | `MeeshySocketIOManager.ts:373–436` | 5–50 KB/connexion | 3h | Faible — paginer/réduire champs |
| 2.14 | `refetchOnWindowFocus: 'always'` global React Query | `query-client.ts:25` | 10–15 requêtes burst/focus | 30 min | Faible — changer config |
| 2.15 | Image compression seuil 100 MB (jamais déclenché) | `media-compression.ts` | 1–3 MB/image uploadée | 1h | Faible — changer constante |

**Diff conceptuels clés :**

- **2.1** : Retirer `translations` du payload `message:new`. Les clients gèrent déjà `message:translation` pour le merge (via `handleTranslation` dans `use-socket-cache-sync.ts`).
- **2.3** : Remplacer `for (p of participants) { io.to(ROOMS.user(p.userId)).emit(...) }` par `io.to(ROOMS.conversation(id)).emit(...)`.
- **2.7** : Supprimer `refetchInterval: 30000` et invalider via event `friend:request-received` / `friend:request-accepted`.
- **2.12** : Dans `_extractConversationLanguages`, ne collecter `systemLanguage` que si `participant.user.translateToSystemLanguage !== false` (et idem pour `regionalLanguage`).

---

### Phase 3 — Refonte structurelle (> 2 semaines)

| # | Problème | Fichier:ligne | Économie estimée | Effort | Risque |
|---|----------|---------------|-----------------|--------|--------|
| 3.1 | TTS à la demande (lazy) — actuellement systématique | `translation_stage.py:551–588` | Plusieurs GB/h GPU + réseau | 2 semaines | Élevé — refonte pipeline |
| 3.2 | WebSocket iOS (remplacer `forcePolling(true)`) | `MessageSocketManager.swift:1068`, `SocialSocketManager.swift:368` | Trafic socket ÷3–5 | 1 semaine | Élevé — stabilité transport |
| 3.3 | CDN/S3 médias (Cloudflare R2) | `MediaStorage.ts` (interface prête) | 60–80 % bande sortante audio/images | 3 semaines | Moyen — migration infra |
| 3.4 | Avatars multi-variantes (40/80/512 px) + next/image | `ImageProcessingService.ts:1`, ~30 composants web | 3–4 MB/session web | 1 semaine | Moyen — touche composants UI |
| 3.5 | Re-transcription Whisper sur TTS (redondant) | `translation_stage.py:590–668`, `retranscription_service.py` | CPU ×N passes Whisper/message | 1 semaine | Élevé — qualité timestamps |
| 3.6 | Chatterbox conditionals base64 → frame binaire ZMQ | `audio_message_pipeline.py:823`, `MessageTranslationService.ts:1030` | 33 % sur 50–200 KB | 3 jours | Moyen — protocol ZMQ |
| 3.7 | VoiceProfile audio base64 → multipart ZMQ | `types.ts:387`, `VoiceProfileService.ts:234` | 33 % sur 1–3 MB/profil | 2 jours | Moyen — protocol ZMQ |
| 3.8 | Delta sync socket avec `updatedSince` (iOS reconnect) | `ConversationViewModel.swift:2336–2368` | 100–200 KB/reconnexion | 3 jours | Faible — paramètre REST |
| 3.9 | ETags sur endpoints JSON (`GET /conversations`, `/messages`) | `conversations/core.ts:545`, `messages.ts:1155` | 200 → 304 sur données inchangées | 1 semaine | Faible — header additionnel |
| 3.10 | Cache TTS Redis dans synthesizer | `synthesizer.py:407` | 0,5–2 MB/user/jour | 3 jours | Faible — cache Redis existant |
| 3.11 | Format thumbnails JPEG → WebP | `MetadataManager.ts:66–86` | 0,3–0,8 MB/user/jour | 1 jour | Faible — changement format |
| 3.12 | Protocole binaire delta pour messages (post-MVP) | Architecture globale | TBD | > 1 mois | Très élevé |

**Diff conceptuels clés :**

- **3.1** : Le pipeline produit uniquement transcription texte + traduction texte. Un endpoint `POST /api/v1/attachments/:id/tts?lang=fr` génère le TTS via ZMQ uniquement au premier clic "écouter". Résultat mis en cache Redis 30 jours via `AudioCacheService` (déjà en place).
- **3.2** : Diagnostiquer le bug Starscream (timeout 35s) — probablement lié à la config `pingTimeout: 10000` du gateway. Tester `.forceWebsockets(true)` + vérification headers `Upgrade`. Alternative : `URLSessionWebSocketTask` natif iOS 13+.
- **3.3** : `MediaStorage` expose déjà `S3CompatibleMediaStorage` en commentaire. Activer, configurer les URLs présignées, et mettre à jour les endpoints de téléchargement pour rediriger vers le CDN.
- **3.5** : Le texte traduit est connu à l'avance. Générer un segment `{ text: translated_text, startMs: 0, endMs: duration_ms }` au lieu de lancer Whisper sur l'audio TTS produit.

---

## 3. Cross-cutting Concerns

Problèmes transverses identifiés dans plusieurs rapports simultanément.

### 3.1 Compression manquante à tous les niveaux

Le même problème apparaît dans **4 rapports différents** :

| Couche | Problème | Rapport | Fichier |
|--------|----------|---------|---------|
| Socket.IO (WebSocket) | `perMessageDeflate` absent | 01 | `MeeshySocketIOManager.ts:168` |
| HTTP Fastify | `@fastify/compress` non installé | 02 | `gateway/server.ts` |
| Traefik production | Middleware `compress` absent | 06 | `dynamic.yaml` |
| iOS URLSession | `Accept-Encoding` non garanti | 04 | `APIClient.swift:255` |

**Conséquence :** Les réponses JSON transitent en clair à chaque couche. Un payload de 40 KB JSON passe à ~8 KB avec gzip (ratio 5×). La correction des 3 premières couches est triviale (config) et couvre 100 % du trafic.

**Règle transverse :** Toute nouvelle route gateway doit avoir la compression activée par défaut via `@fastify/compress` + Traefik comme double filet. Ne pas supposer que le proxy compresse.

### 3.2 Over-fetching pattern (Prisma include / champs non filtrés)

Pattern récurrent : `include:` sans `take:` ou `select:` minimal.

| Endpoint | Over-fetching | Impact |
|----------|--------------|--------|
| `GET /conversations/:id` | `participants` sans `take:` | Jusqu'à 250 KB pour 500 membres |
| `GET /conversations/:id/messages` | `translations: true` inconditionnel | 30 KB/page pour conv multilingue |
| `GET /notifications` | `message.attachments` include complet | 24 KB pour 20 notifs |
| `message:new` socket | Traductions + stats dans le payload | 2–30 KB/event |
| iOS `GET /conversations` | `participants` complets + `recentMessages` | 50–200 KB/listing |

**Règle transverse :** Toute query Prisma sur une collection doit définir un `select:` minimal. L'`include:` non plafonné est interdit sur les endpoints paginés. Créer des `select` nommés (`messageListSelect`, `participantPreviewSelect`) dans `packages/shared/`.

### 3.3 Polling vs Realtime Push

Plusieurs composants polent REST alors que Socket.IO diffuse déjà l'information :

| Composant | Polling actuel | Event Socket.IO disponible |
|-----------|---------------|--------------------------|
| `use-friend-requests-v2.ts` | 30s × 2 queries | `friend:request-received`, `friend:request-accepted` |
| `use-notifications-query.ts` | 60s unread count | `notification:new`, `notification:counts` |
| `AgentLiveTab.tsx` | 15s | Admin uniquement — visibilityState guard suffisant |
| iOS `PresenceService.refreshKnownUsers()` | Chaque foreground | `presence:snapshot` (déjà émis à reconnect) |

**Règle transverse :** Aucun composant ne doit avoir de `refetchInterval` pour des données déjà pushées via Socket.IO. La règle d'or : si un événement Socket.IO couvre le cas, l'invalider via `queryClient.invalidateQueries()` sur l'event — pas en polant.

### 3.4 Cache-First non respecté (violation CLAUDE.md mandate)

Le CLAUDE.md impose explicitement **Cache-First, Network-Second** et **Stale-While-Revalidate**. Violations identifiées :

| Violation | Fichier | Impact |
|-----------|---------|--------|
| `prefetchTopConversationMessages()` iOS — 20 fetches réseau même si cache stale chaud | `ConversationListViewModel.swift:960` | 300 KB/cold start |
| `invalidatePullRefreshScope()` — invalide `images` (TTL 1 an) | `ConversationListViewModel.swift:1196` | 2,5 MB/refresh |
| `refetchOnWindowFocus: 'always'` — refetch même si données fraîches | `query-client.ts:25` | 15 requêtes burst |
| iOS `syncMissedMessages()` — 30 messages sans `since` timestamp | `ConversationViewModel.swift:2336` | 100–200 KB/reconnexion |

**Règle transverse :** Le pull-to-refresh ne doit invalider que les métadonnées de conversation (timestamps, unread counts), jamais les assets binaires (images, audio) dont le TTL est géré indépendamment. Les assets sont invalidés uniquement par événement cible (`user:profile-updated` → invalider avatar).

### 3.5 Prisme Linguistique — traductions vers toutes les langues au lieu des langues actives

Violation du principe Prisme Linguistique sur 3 couches :

| Couche | Problème | Fichier |
|--------|----------|---------|
| Gateway — extraction langues | Ignore `translateToSystemLanguage`/`translateToRegionalLanguage` | `MessageTranslationService.ts:651` |
| iOS — stockage traductions | Stocke toutes les `targetLanguage` reçues | `ConversationViewModel.swift:2620` |
| REST messages | `translations: true` inconditionnel | `conversations/messages.ts:539` |

**Impact cumulé :** Un message dans une conversation de 10 personnes avec 4 langues distinctes génère 4 traductions NLLB, 4 fichiers TTS, 4 re-transcriptions Whisper — même si 3 utilisateurs sont hors ligne et 2 ont désactivé la traduction régionale. Corriger le seul point `MessageTranslationService.ts:651` réduit de 30–50 % le volume NLLB/TTS.

**Règle transverse :** `resolveUserLanguage()` est la source de vérité (CLAUDE.md). La liste des langues cibles doit être calculée en fonction des participants **actifs** avec leurs préférences **activées**, pas l'union de toutes les langues de tous les membres.

---

## 4. Métriques de succès

### Avant/Après par catégorie

| Catégorie | Avant | Après Phase 1 | Après Phase 1+2 | Après Phases 1+2+3 |
|-----------|-------|--------------|-----------------|---------------------|
| Payload moyen `message:new` (socket) | 4–15 KB | 1–3 KB | 0,5–1 KB | 0,3–0,8 KB |
| Taille bundle JS initial web (gzippé) | ~900 KB | ~650 KB | ~500 KB | ~400 KB |
| Bande passante socket iOS idle | ~2,8 MB/h | ~2,8 MB/h | ~1,5 MB/h | ~0,3 MB/h |
| Requêtes MongoDB par message entrant | 8–12 | 5–7 | 3–5 | 1–2 |
| TTS généré sans demande client | ~100 % | ~100 % | ~60 % | ~5 % |
| Bande passante audio stockage/user/jour | ~4 MB | ~2 MB | ~2 MB | ~0,8 MB |
| KB/session web (hors médias) | ~3–5 MB JS | ~2 MB JS | ~1,5 MB JS | ~1 MB JS |

### KPIs à instrumenter

#### Web (instrumentation via Next.js + Datadog/Sentry)

```
web_vitals_lcp_ms           → cible < 1500ms (mobile 4G)
web_vitals_fid_ms           → cible < 100ms
initial_bundle_size_kb      → cible < 400 KB gzippé
socket_event_size_bytes{event="message:new"}  → cible < 1500 B
api_response_size_bytes{route="/conversations"} → cible < 10 KB
cache_hit_rate{layer="react-query"}  → cible > 80 %
```

#### Gateway (Fastify hooks + Prometheus)

```
http_response_size_bytes{route, method}        → comparer avant/après compress
socket_emit_size_bytes{event}                  → surveiller dérives payload
db_query_count_per_request{route}              → détecter N+1
translation_requests_total{lang, skipped_pref} → mesurer économie préférences
tts_on_demand_cache_hit_rate                   → cible > 70 % (Phase 3)
```

#### iOS (MetricKit + custom telemetry)

```
network_bytes_received_per_session
cold_start_network_requests_count   → cible ≤ 3 (vs 20+ actuellement)
socket_transport_type{polling|websocket}  → cible 100% websocket
pull_to_refresh_bytes_downloaded    → cible < 50 KB (vs 2,5 MB)
```

#### Infrastructure (Traefik + Grafana)

```
traefik_entrypoint_bytes_out_total          → baseline + progression
compression_ratio{service}                 → cible > 3× sur JSON
cdn_cache_hit_rate (Phase 3)               → cible > 85 %
```

---

## 5. Matrice Priorité (Impact × Effort)

```
                    EFFORT FAIBLE          EFFORT ÉLEVÉ
                  (< 1 jour)             (> 1 semaine)
                ┌─────────────────────────┬──────────────────────────┐
  IMPACT        │  QUICK WINS             │  CHANTIERS               │
  ÉLEVÉ         │                         │  STRUCTURELS             │
  (> 1 MB/day   │  [1.1] perMessageDeflate│  [3.1] TTS à la demande  │
  ou critique   │  [1.2] Stats message:new│  [3.2] WebSocket iOS     │
  serveur)      │  [1.3] Traefik compress │  [3.3] CDN/S3 médias     │
                │  [1.5] Audio 64kbps     │  [3.4] Avatars multi-size│
                │  [2.3] Conv:updated room│  [3.5] Whisper re-transc.│
                │  [2.7] Stop polling amis│                          │
                │  [2.8] iOS cold start   │                          │
                │  [2.9] PTR invalide img │                          │
                ├─────────────────────────┼──────────────────────────┤
  IMPACT        │  AMÉLIORATIONS          │  A ÉVITER / REPORTER     │
  MOYEN         │  CIBLÉES                │                          │
  (< 1 MB/day   │  [1.4] Devtools guard   │  [3.9] ETags JSON        │
  ou UX)        │  [1.6] Locales dynamic  │  [3.10] Cache TTS synth  │
                │  [1.8] Typing throttle  │  [3.6] ZMQ base64 binary │
                │  [1.9] N+1 notif        │  [3.11] WebP thumbnails  │
                │  [1.10] WAV → Opus      │  [3.12] Binary protocol  │
                │  [2.4] Double delivered │                          │
                │  [2.11] Fastify compress│                          │
                │  [2.14] refetchOnFocus  │                          │
                │  [2.15] Compress seuil  │                          │
                └─────────────────────────┴──────────────────────────┘

Légende : [phase.numéro] = référence section 2
```

### Top 15 actions placées dans la matrice

| Rang | Action | Quadrant | Phase |
|------|--------|----------|-------|
| 1 | `perMessageDeflate` Socket.IO | Quick Win | 1.1 |
| 2 | Traefik `compress` middleware | Quick Win | 1.3 |
| 3 | TTS à la demande | Chantier structurel | 3.1 |
| 4 | Audio 64 kbps vs 128 kbps | Quick Win | 1.5 |
| 5 | Supprimer stats de `message:new` | Quick Win | 1.2 |
| 6 | WebSocket iOS | Chantier structurel | 3.2 |
| 7 | iOS cold start prefetch supprimé | Quick Win | 2.8 |
| 8 | Pull-to-refresh ne purge plus images | Quick Win | 2.9 |
| 9 | Avatars multi-variantes | Chantier structurel | 3.4 |
| 10 | Traductions conditionnées aux préférences | Ciblé | 2.12 |
| 11 | Stop polling friend requests | Ciblé | 2.7 |
| 12 | `conversation:updated` → broadcast room | Ciblé | 2.3 |
| 13 | CDN/S3 médias | Chantier structurel | 3.3 |
| 14 | `translations` conditionnel dans messages | Ciblé | 2.6 |
| 15 | ReactQueryDevtools guard | Quick Win | 1.4 |

---

## Références croisées

| Action | Rapport source | Rapport impacté |
|--------|---------------|-----------------|
| `perMessageDeflate` | 01-socketio (CRITIQUE-01) | 04-ios (P1 — améliore headers polling aussi) |
| Traefik compress | 06-media (P03) | 02-rest-api (§8) — double filet |
| TTS à la demande | 05-translator (P1) | 06-media (P07) — cache synthesizer |
| Traductions préférences | 05-translator (P1) | 04-ios (P6) — filtre côté iOS aussi |
| Avatars multi-tailles | 06-media (P04) | 02-rest-api (§16) + 03-web (M4) |
| iOS WebSocket | 02-rest-api (§10) | 04-ios (P1) — même problème, deux rapports |
| Compression Fastify | 02-rest-api (§8) | 06-media (P03) — Traefik en complément |
| `translations` conditionnel | 02-rest-api (§6) | 04-ios (P6) + 05-translator (P1) |
