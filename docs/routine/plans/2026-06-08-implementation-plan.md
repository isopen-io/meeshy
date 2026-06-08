# Plan d'implémentation — 2026-06-08

Basé sur `docs/routine/analyses/2026-06-08-optimization-audit.md`.

## Phase 1 — Quick wins sans risque (P0)

### 1.1 Supprimer les logs debug en production dans `_broadcastNewMessage`
- **Fichier** : `services/gateway/src/socketio/MeeshySocketIOManager.ts`
- **Action** : Passer `logger.info('🔍 [WEBSOCKET]...')` en `logger.debug`
- **Impact** : Réduction charge I/O disque en production

### 1.2 Trim des métadonnées techniques dans le payload `message:new`
- **Fichier** : `services/gateway/src/socketio/MeeshySocketIOManager.ts`
- **Action** : Dans `_broadcastNewMessage`, filtrer les champs `codec`, `bitrate`, `fps`, `sampleRate`, `segments`, `channels`, `bitDepth`, `format` des attachments avant broadcast
- **Impact** : −20-40 % taille payload pour messages avec pièces jointes

### 1.3 Métriques Redis fallback
- **Fichier** : `services/gateway/src/services/CacheStore.ts`
- **Action** : Ajouter compteurs `redisFallbackCount` et log structuré sur chaque fallback vers memory cache
- **Impact** : Observabilité opérationnelle

---

## Phase 2 — Optimisations réseau (P1)

### 2.1 Activation `SOCKET_LANG_FILTER` par défaut
- **Fichier** : `services/gateway/src/socketio/MeeshySocketIOManager.ts` + `infrastructure/`
- **Action** : Changer le défaut de `SOCKET_LANG_FILTER` de `false` à `true`, documenter dans `.env.example`
- **Prérequis** : Vérifier que le filtre B1 est complet (tests ✅)
- **Impact** : −33 à −80 % taille payload Socket.IO si conversation multilingue

### 2.2 Index Prisma composites
- **Fichier** : `packages/shared/prisma/schema.prisma`
- **Action** : Ajouter :
  ```prisma
  @@index([conversationId, createdAt(sort: Desc)], map: "message_conv_created_desc")
  @@index([conversationId, messageId], map: "status_conv_message")  // MessageStatusEntry
  ```
- **Impact** : Requêtes "dernier message" et "statuts par conversation" plus rapides

### 2.3 React Query persist client (web)
- **Fichier** : `apps/web/app/layout.tsx` ou `apps/web/components/providers/QueryProvider.tsx`
- **Action** : Ajouter `persistQueryClient` avec `createSyncStoragePersister` (localStorage, clé `meeshy-rq-cache`)
- **Impact** : Cold-start affiche données stale instantanément au lieu de spinner

---

## Phase 3 — Optimisations payload (P2)

### 3.1 iOS `?languages=` adoption
- **Fichier** : `packages/MeeshySDK/Sources/MeeshySDK/` (network layer)
- **Action** : Injecter `?languages={preferredLanguages.joined(separator: ",")}` sur les appels `GET /conversations/:id/messages`
- **Impact** : −50 % payload REST messages sur iPhone

### 3.2 Métriques compression + bandwidth
- **Fichier** : `services/gateway/src/middleware/` (nouveau fichier `bandwidth-metrics.ts`)
- **Action** : Middleware Fastify qui log `Content-Encoding`, `Content-Length` original vs compressé sur routes hot (messages, conversations)
- **Impact** : Validation ROI des phases A et B

### 3.3 WebSocket context takeover (mesure + activation)
- **Fichier** : `services/gateway/src/socketio/MeeshySocketIOManager.ts`
- **Action** : Passer `serverNoContextTakeover: false` pour permettre réutilisation du contexte deflate côté serveur (gain +15-20 % ratio sur conversations actives)
- **Garde-fou** : Mesurer la consommation mémoire par socket avant/après

---

## Phase 4 — Audio pipeline (P3)

### 4.1 Codec Opus pour TTS interne
- **Fichier** : `services/translator/src/` (pipeline TTS)
- **Action** : Encoder la sortie TTS en Opus 24 kbps avec `ffmpeg -c:a libopus` avant envoi ZMQ
- **Impact** : −90 % taille des frames audio ZMQ (WAV 30s ~2.9 MB → Opus ~240 KB)

### 4.2 TTS on-demand (pas broadcast toutes langues)
- **Fichier** : `services/translator/src/` + `services/gateway/src/services/message-translation/`
- **Action** : Générer TTS uniquement pour les langues demandées par les participants connectés
- **Impact** : Réduction charge GPU/CPU translator en conversations multilingues

---

## Ordre d'exécution

```
Phase 1 → Phase 2.1 → Phase 2.2 → Phase 2.3 → Phase 3.1 → Phase 3.2 → Phase 3.3 → Phase 4
```

Chaque phase est indépendante et laisse le codebase dans un état fonctionnel.
Les tests existants doivent passer après chaque phase.
