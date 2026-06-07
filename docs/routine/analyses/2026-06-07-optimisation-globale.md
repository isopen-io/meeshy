# Analyse Globale Meeshy — Optimisations & État de l'Art
**Date :** 2026-06-07  
**Branche :** `claude/zen-albattani-BIRq9`  
**Scope :** Gateway, Web, iOS, Translator, Shared, Infrastructure

---

## Résumé Exécutif

Meeshy est une plateforme solide architecturalement, mais présente **8–12 optimisations haute valeur** non encore implémentées qui peuvent réduire :
- **Bande passante** : −30 à −60 %
- **Latence p95** : −20 à −40 %
- **Consommation mémoire** : −30 à −40 %
- **CPU** : −20 à −30 %

### Déjà livré (sprint 2026-06-07)
| Item | Statut |
|------|--------|
| A1 — Compression Brotli/gzip REST | ✅ |
| A2 — WebSocket deflate tuning (threshold 256) | ✅ |
| A3 — Filtre langues REST `?languages=` | ✅ |
| A4 — Trim participants liste conversations | ✅ |
| B1 — Filtre Socket.IO par langue (flag OFF) | ✅ core, 🔴 désactivé |
| D4 — Thumbnails WebP | ✅ |
| Call system messages (rich) | ✅ |

### Manquant critique
Voir sections ci-dessous.

---

## 1. GATEWAY — Problèmes Critiques

### 1.1 N+1 Requêtes dans la boucle de broadcast (CRITIQUE)
**Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts:~1543`

Pour chaque message émis, le code parcourt la liste des participants et fait **une requête `getUnreadCount` par utilisateur** séquentiellement.

```typescript
for (const participant of participants) {
  const unreadCount = await readStatusService.getUnreadCount(participant.id, normalizedId);
  this.io.to(ROOMS.user(roomTarget)).emit(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, {...});
}
```

**Impact :** 100 participants = 100 requêtes DB séquentielles par message. Bloque le broadcast.  
**Fix :** `Promise.all()` sur tous les `getUnreadCount` puis émission batch.

---

### 1.2 Cache ID conversation en mémoire pure (CRITIQUE)
**Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts:~119, ~336`

`conversationIdCache` est un `Map<string, string>` en mémoire sans TTL ni limite :
- Fuite mémoire progressive
- Perdu sur restart (re-queries DB au redémarrage)
- Non partagé entre instances (load-balancer)

**Fix :** Redis avec TTL 24h.

---

### 1.3 SOCKET_LANG_FILTER désactivé (HAUTE VALEUR)
**Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts:1489`

Le filtre B1 (livré, testé, 7 tests verts) reste derrière `process.env.SOCKET_LANG_FILTER === 'true'` qui est OFF. Il faut activer en staging, valider, puis passer en prod.

**Impact :** Un message avec 10 traductions est envoyé **10×** à chaque client alors qu'il n'en lit qu'1-2.

---

### 1.4 JWT non mis en cache (HAUT)
**Fichier :** `services/gateway/src/middleware/auth.ts:~108`

`jwt.verify()` (HMAC-SHA256) est exécuté à **chaque requête** sans mise en cache.  
**Impact :** 1 000 req/s = 1 000 HMAC-SHA256/s inutiles.  
**Fix :** Cache Redis keyed par `sha256(token)` avec TTL 60s.

---

### 1.5 Set de déduplication de traductions non borné (HAUT)
**Fichier :** `services/gateway/src/services/message-translation/MessageTranslationService.ts:78-79`

```typescript
private readonly processedMessages = new Set<string>();
private readonly processedTasks = new Set<string>();
```

`processedMessages` : aucune éviction. Croît indéfiniment.  
`processedTasks` : éviction au-delà de 1 000 uniquement (pop FIFO).  
**Fix :** Map<string, timestamp> avec TTL 1h.

---

### 1.6 Indexes Prisma manquants (HAUT)
**Fichier :** `packages/shared/prisma/schema.prisma`

Manquants :
- `@@index([conversationId, messageSource])` → requêtes messages système (call summaries)
- `@@index([replyToId])` → expansion thread
- `@@index([conversationId, participantId, readAt])` sur `MessageStatusEntry` → comptage non-lus
- `@@index([participantId, conversationId])` sur `MessageStatusEntry`

**Impact :** Scans collection O(N) pour les requêtes les plus fréquentes.

---

### 1.7 StatusService throttling en mémoire (MOYEN)
**Fichier :** `services/gateway/src/services/StatusService.ts:~39`

`activityCache` et `connectionCache` sont en mémoire. Dans une config multi-instances, les throttle states ne sont pas partagés → doubles writes DB.  
**Fix :** Redis avec TTL 10s.

---

### 1.8 Cache auth utilisateur TTL trop long (MOYEN)
**Fichier :** `services/gateway/src/middleware/auth.ts:~144`

TTL 5 min pour les données utilisateur (rôle, langue, flags). Un changement de rôle prend 5 min à se propager.  
**Fix :** TTL 60s avec invalidation sur `PATCH /users/profile`.

---

### 1.9 Redis DeliveryQueue fallback mémoire non borné (HAUT)
**Fichier :** `services/gateway/src/services/RedisDeliveryQueue.ts:~14`

`memoryQueue: Map<string, QueuedMessagePayload[]>` sans limite. Si Redis tombe 1h à 100 req/s → OOM.  
**Fix :** Limite à 10 000 entrées avec eviction FIFO + warning log.

---

## 2. PAYLOAD — Optimisations Restantes

### 2.1 B1 SOCKET_LANG_FILTER à activer
Déjà implémenté, à activer (voir 1.3).

### 2.2 B4 — Timestamps ISO8601 → epoch ms
**Impact :** −16 octets/timestamp. Un message a 3-5 timestamps → −80 octets.  
À 100k msg/s → −8 MB/s.

### 2.3 B5 — Delta présence (snapshots)
**Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts:~396`

À chaque connexion, le gateway envoie un snapshot complet de présence (tous les contacts).  
**Fix :** Envoyer uniquement les deltas online/offline depuis le dernier snapshot.

### 2.4 D2 — Supprimer base64 dans le pipeline TTS interne
**Fichier :** `services/translator/src/services/tts/synthesizer.py:~638`

Voice embeddings transportés en base64 (+33 % overhead).  
ZMQ supporte déjà les frames binaires (`binaryFrames[0]`).

### 2.5 D3 — Embeddings float32 → float16
**Fichier :** `services/translator/src/services/audio_pipeline/audio_message_pipeline.py:~813`

4 KB float32 → 2 KB float16. Quantisation int8 → 1 KB.

### 2.6 D6 — TTS à la demande par langue
**Problème :** TTS généré pour toutes les langues cibles d'une conversation, même si personne ne consomme ces langues.  
**Fix :** Générer le TTS uniquement sur demande client (lazy synthesis).

### 2.7 D1 — Opus pour audio VoIP/TTS
**Fichier :** `services/translator/src/services/audio_pipeline/audio_message_pipeline.py:~365`

Pipeline actuel : M4A → WAV intermédiaire → MP3. Chaque conversion ajoute latence et bytes.  
**Fix :** M4A → Opus 24-32 kbps direct. Économie −60 à −80 % vs MP3.

### 2.8 C1 — MessagePack sur Socket.IO (SOTA)
Remplacement du JSON par MessagePack (−30 à −50 % vs JSON+deflate sur données structurées).  
Requiert `socket.io-msgpack-parser` côté gateway + clients.

---

## 3. iOS — Problèmes Architecture & Performance

### 3.1 ConversationViewModel monolithique (HAUT)
**Fichier :** `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`

20+ champs `@Published`. Un changement de réaction invalide TOUT le graph de vues (incluant `_mediaCaptionMap`, `_allAudioItems`, `_replyCountMap`).  
**Fix :** Décomposer en sous-viewmodels focalisés : `MessagesViewModel`, `TranslationViewModel`, `AudioViewModel`.

### 3.2 Décodage de traductions non sélectif (HAUT)
**Fichier :** `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift:~150-181`

Toutes les traductions sont décodées en mémoire (~99 % inutilisées).  
**Fix :** E2 — décoder uniquement les langues du Prisme (1-4 langues).

### 3.3 Accept-Encoding non garanti (HAUT)
**Fichier :** `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift`

La compression Brotli côté gateway (A1) est inutile si iOS ne déclare pas `Accept-Encoding: br, gzip`.  
**Fix :** E1 — ajouter l'en-tête explicitement.

### 3.4 Consommation de `?languages=` (HAUT)
**Fix :** E3 — aligner les appels SDK avec le paramètre A3 pour ne recevoir que les traductions utiles.

### 3.5 Cache de résolution de langue non mémoïsé (MOYEN)
**Fichier :** `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:~149-177`

`preferredTranslation(for:)` recalculé à chaque rendu pour chaque bulle.  
**Fix :** Cache `[messageId: String]` invalidé sur `preferredLanguageRevision`.

### 3.6 MessagePersistenceActor backpressure manquant (MOYEN)
**Fichier :** `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift`

AsyncStream sans backpressure : synchro de 10k messages → queue en mémoire unbounded.  
**Fix :** Gate de taille + batch GRDB (30-50 messages par transaction au lieu de 1 par 1).

### 3.7 Déduplication uploads concurrent médias (MOYEN)
`CachedAsyncImage` sans déduplication : même URL dans 5 bulles = 5 téléchargements concurrents.  
**Fix :** Request coalescing dans le gestionnaire d'images.

### 3.8 Gestion offline traductions (BAS-MOYEN)
Buffer de requêtes de traduction offline non persisté sur disque.  
App kill → requêtes perdues.

---

## 4. Translator — Pipeline ML

### 4.1 Chargement modèles séquentiel au démarrage (HAUT)
NLLB-200 + Whisper + Chatterbox TTS + backends ≈ 8-12 GB RAM, 5-10 min de startup.  
**Fix :** Lazy loading avec warm-up en arrière-plan (charger NLLB + Whisper, TTS en lazy).

### 4.2 Pas de cache résultats TTS (HAUT)
Même texte synthétisé N fois sans cache.  
**Fix :** Redis avec hash `sha256(text+lang+voice_id)`, TTL 30 jours.

### 4.3 NLLB sans batching (MOYEN)
Traduction 1 message à la fois même si 10 attendent.  
**Fix :** Batch par paire de langues (jusqu'à 32 textes par appel NLLB).

### 4.4 ZMQ sans backpressure (MOYEN)
Si translator est lent, gateway continue d'envoyer sans pause.  
**Fix :** Monitoring profondeur queue ZMQ + retry queue.

### 4.5 Cache traductions par contenu (MOYEN)
Cache actuel keyed par `messageId`, pas par contenu.  
Même phrase "Bonjour" dans 100 conversations = 100 traductions.  
**Fix :** Key = `sha256(text+src_lang+tgt_lang)`.

---

## 5. Infrastructure

### 5.1 Pas de limites mémoire/CPU sur translator (CRITIQUE)
OOM possible sans avertissement.  
**Fix :** `deploy.resources.limits.memory: 8g` dans docker-compose.

### 5.2 Pas de pooling de connexions DB/Redis (MOYEN)
`DATABASE_URL` sans `maxPoolSize`, `minPoolSize`.  
**Fix :** `maxPoolSize=50&minPoolSize=10&waitQueueTimeoutMS=10000`.

### 5.3 Healthcheck delays (BAS)
`start_period: 60s` + `retries: 5` = 3 min de "black hole".  
**Fix :** `start_period: 120s`, `interval: 10s`, `retries: 2`.

---

## 6. Appels WebRTC — Plan SOTA Non Implémenté

Référence : `tasks/calls-sota-plan-2026-06-05.md`

### Étapes manquantes (ordonnées par priorité) :
1. **P0-2** : Retirer `forcePolling(true)` × 3, ajuster pingTimeout/pingInterval
2. **P0-3 + P0-7** : `emitWithAck` pour signaux call, grâce reconnexion 10-15s gateway
3. **P0-1 + P0-8** : Gate macOS complet (CallKit/PushKit), activation audio PRIMAIRE
4. **P0-4** : `pc.restartIce()` réel, accept offers en `.connected`/`.reconnecting`
5. **P0-8 complet** : AVAudioSession routeChange observer
6. **P0-6 + P0-5** : CallService partagé injecté, endCall pre-ACK
7. **P0-9** : Nettoyage dead code CALL-DIAG

---

## 7. Features Manquantes vs Concurrence

| Feature | WhatsApp | Telegram | iMessage | Meeshy | Priorité |
|---------|----------|----------|---------|--------|----------|
| Deep linking `meeshy://` | ✅ | ✅ | ✅ | ❌ | HAUTE |
| Recherche full-text offline | ✅ | ✅ | ✅ | API only | HAUTE |
| Bitrate adaptatif appels | ✅ | ✅ | ✅ | ❌ | MOYENNE |
| Déduplication requêtes traduction | N/A | ✅ | N/A | Partiel | BASSE |
| GIF/Stickers packs | ✅ | ✅ | ✅ | ❌ | BASSE |
| Draft auto-sync offline | ✅ | ✅ | ✅ | Manuel | MOYENNE |
| Liste messages virtuelle (iOS) | ✅ | ✅ | ✅ | LazyVStack | HAUTE |

---

## Score Global

| Couche | Score | Commentaire |
|--------|-------|-------------|
| Architecture Gateway | 7/10 | Solide, quelques fuites mémoire |
| Performance Socket.IO | 6/10 | N+1 queries, cache non distribué |
| Compression/Bande passante | 7/10 | A1-A3 livrés, B/C/D restants |
| iOS Performance | 6/10 | VM monolithique, décod. non sélectif |
| iOS Offline | 6/10 | Optimistic OK, sync background manquant |
| Translator ML | 6/10 | Pas de batching/caching TTS |
| Infrastructure | 6/10 | Pas de limites ressources |
| Appels WebRTC | 6/10 | SOTA plan défini, non exécuté |
