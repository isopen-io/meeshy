# Analyse Optimisation — Itération 5 (2026-06-08)

**Méthode :** 4 agents d'exploration parallèles (gateway, web, iOS/shared, translator)  
**Base :** Itérations 1-4 complètes — résumé de ce qui reste à faire

---

## Contexte : Itérations Précédentes

Déjà implémenté (iter 1-4) :
- ✅ perMessageDeflate Socket.IO + @fastify/compress HTTP
- ✅ Audio bitrate 64k + WebP thumbnails
- ✅ Opt-in translation filtering + per-language broadcast (B1 ON)
- ✅ Batch unread counts + typing isolation + HTTP cache (ETag)
- ✅ NLLB timeout (gateway side) + analytics Redis cache
- ✅ MessageSearch UI + PinnedMessageBanner + forwarded indicator
- ✅ Dynamic Type + MeeshyColors + i18n audio iOS
- ✅ Auth JWT cache + slim user Redis cache

---

## 1. Gateway — Problèmes Critiques Restants

### 1.1 Auth middleware : 2e query Prisma sur cache hit (CRITIQUE)

**Fichier :** `services/gateway/src/middleware/auth.ts:210`

Quand `cachedSlim` est trouvé (cache hit Redis), le code fait ENCORE une query Prisma pour les champs "extra" (`email`, `firstName`, `lastName`, `displayName`, `avatar`, `customDestinationLanguage`, `isOnline`, `lastActiveAt`). Cette 2e query annule le gain du cache.

**Fix :** Étendre le cache pour inclure TOUS les champs nécessaires → 0 Prisma query sur cache hit.

**Impact :** −50% de queries DB auth sur trafic haut (~300ms → <5ms sur cache hit)

### 1.2 N+1 dans CallEventsHandler (CRITIQUE)

**Fichier :** `services/gateway/src/socketio/CallEventsHandler.ts`

Boucle sur les participants avec `prisma.user.findUnique()` dans chaque itération. Pour 50 participants = 50 queries MongoDB séquentielles.

**Fix :** Batch `prisma.user.findMany({ where: { id: { in: participantIds } } })` + Map lookup O(1).

**Impact :** Appels vidéo : 50 queries → 1 query

### 1.3 Message deduplication absente

**Fichier :** `services/gateway/src/socketio/handlers/MessageHandler.ts`

`clientMessageId` (UUID idempotency key) est généré mais jamais vérifié contre les messages existants. Un retry réseau crée un message dupliqué.

**Fix :** Check `prisma.message.findFirst({ where: { clientMessageId } })` avant insert.

**Impact :** Élimine les messages dupliqués sur retry réseau

### 1.4 Presence snapshot non cachée

**Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts`

`_emitPresenceSnapshot` recalcule tout à chaque connexion (2 queries Prisma). Sur reconnexion répétée (mobile instable) → surcharge.

**Fix :** Cache mémoire 60s par userId, invalidé sur changement de conversation.

### 1.5 Attachment translation delta manquant

Chaque traduction progressive envoie le FULL attachment (50-100KB) même pour une nouvelle langue.

**Fix :** Émettre uniquement la langue nouvelle + attachmentId (delta).

---

## 2. Translator — Problèmes Persistants

### 2.1 Timeout asyncio.wait_for manquant sur inférence NLLB

**Fichier :** `services/translator/src/services/zmq_translation_handler.py`

L'inférence ML n'a pas de timeout → deadlock si texte pathologique (incident prod documenté dans lessons.md #13).

**Fix :** `asyncio.wait_for(ml_service.translate(...), timeout=45.0)`

### 2.2 Memory cache unbounded

**Fichier :** `services/translator/src/services/`

Si Redis tombe, le fallback dict Python n'a pas de limite → OOM avec trafic élevé.

**Fix :** Limiter à `CACHE_MAX_ENTRIES=10000` + LRU eviction simple.

---

## 3. iOS — Problèmes de Performance

### 3.1 Notification dedup push+socket absente

**Fichier :** `packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationToastManager.swift`

APN + Socket.IO envoient la même notification → 2 toasts pour 1 événement.

**Fix :** Set d'IDs récents avec fenêtre 2s.

### 3.2 Bubble Rendering sans Equatable

Les vues de bulles ne sont pas Equatable → SwiftUI les re-évalue inutilement.

---

## 4. Web — UX Feature Gap

### 4.1 Voice message : pas de contrôle de vitesse

WhatsApp, Telegram : 1×, 1.5×, 2× sur les messages vocaux.  
Meeshy : vitesse fixe 1×.

**Impact UX :** Feature gap notable pour les messages longs.

### 4.2 Tone.js eager import

`utils/audio-effects.ts` importe Tone.js en top-level (800KB). N'est utilisé que dans les appels vidéo.  
`use-audio-effects.ts` fait déjà un import lazy — mais `audio-effects.ts` lui-même exécute `import * as Tone` au module load.

---

## 5. Shared — Types et Prisma

### 5.1 Notification index manquant

Manque `@@index([userId, isRead])` sur le modèle `Notification` → comptage unread lent.

### 5.2 Message pagination index

Manque `@@index([conversationId, createdAt(sort: Desc)])` dédié pour la pagination.

---

## Matrice Priorité

| # | Problème | Impact | Effort | Priorité |
|---|---------|--------|--------|----------|
| 1.1 | Auth 2e query Prisma sur cache hit | Élevé | 30min | P0 |
| 1.2 | N+1 CallEventsHandler | Élevé | 1h | P0 |
| 1.3 | Message dedup clientMessageId | Élevé | 45min | P0 |
| 2.1 | NLLB timeout asyncio | Critique | 15min | P0 |
| 3.1 | Notification dedup iOS | Moyen | 1h | P1 |
| 4.1 | Voice speed control web | Moyen | 2h | P1 |
| 1.4 | Presence snapshot cache | Moyen | 1h | P1 |
| 5.1 | Notification index Prisma | Faible | 5min | P2 |
| 5.2 | Message pagination index | Faible | 5min | P2 |
| 2.2 | Memory cache bounded | Moyen | 30min | P2 |
| 1.5 | Attachment delta | Moyen | 2h | P2 |
