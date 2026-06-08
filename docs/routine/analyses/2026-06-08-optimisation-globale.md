# Analyse Globale — Optimisations & État de l'Art
**Date :** 2026-06-08  
**Scope :** Codebase complète (gateway, web, translator, shared, MeeshySDK)  
**Méthode :** Analyse statique multi-agents + exploration directe

---

## 1. CRITIQUE — Blocages Production

### 1.1 N+1 unreadCount dans le broadcast Socket.IO
**Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts:1550`

```typescript
// PROBLÈME : await séquentiel dans un for...of
for (const participant of participants) {
  const unreadCount = await readStatusService.getUnreadCount(participant.id, normalizedId);
  this.io.to(ROOMS.user(roomTarget)).emit(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, …);
}
```

Groupe de 10 participants = 10 requêtes DB séquentielles pour chaque message reçu.  
`getUnreadCountsForConversations()` (version batché) **existe déjà** dans `MessageReadStatusService` mais n'est pas utilisée ici.

**Impact :** Latence O(n) par message sur le hot path → spike de charge DB à chaque envoi.

---

### 1.2 pingTimeout < pingInterval (déconnexions fantômes)
**Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts:195-196`

```typescript
pingTimeout:  20000,  // 20 s
pingInterval: 25000,  // 25 s — intervalle > timeout !
```

Socket.IO envoie un ping toutes les 25 s, mais déclare le client mort après 20 s. Sous charge WebRTC (CPU saturé), la réponse arrive systématiquement trop tard → faux `ping timeout` → reconnexion inutile → UX dégradée.

**Fix immédiat :** `pingTimeout: 60000` (valeur standard Socket.IO recommandée).

---

### 1.3 Retry ZMQ avec le même taskId (doublons silencieux)
**Fichier :** `services/gateway/src/services/zmq-translation/ZmqTranslationClient.ts`

Sur timeout (30 s), la requête est re-soumise avec le **même `taskId`**. Si la première requête était simplement lente (translator surchargé), les deux arrivent → double traduction sauvegardée → message affiché deux fois côté client.

**Fix :** Générer un nouveau `taskId` à chaque retry ; tracker `(originalTaskId, attempt)` pour la déduplication.

---

### 1.4 TypeScript & ESLint ignorés au build
**Fichier :** `apps/web/next.config.ts`

```typescript
eslint:     { ignoreDuringBuilds: true },
typescript: { ignoreBuildErrors:  true },
```

Des erreurs de type réelles sont masquées en production. Le CI ne bloque pas sur des bugs de typage.

**Fix :** Activer les deux, traiter les erreurs existantes.

---

## 2. HAUTE PRIORITÉ — Expérience Utilisateur & Architecture

### 2.1 Conversation list : offset pagination non scalable
**Fichier :** `services/gateway/src/routes/conversations/core.ts`

L'API `/conversations` utilise `skip/take` (offset). Avec 500 conversations, `skip=480` force MongoDB à scanner 480 documents. Les messages supportent la pagination cursor (`before=<timestamp>`) mais pas les conversations.

**Fix :** Implémenter cursor pagination sur conversations (`after=<conversationId>&direction=older`).

---

### 2.2 Instanciation multiple de services (pas de DI)
**Pattern trouvé dans :** `routes/messages.ts`, `socketio/handlers/MessageHandler.ts`, `server.ts`

`AttachmentService`, `TrackingLinkService`, `MentionService` sont instanciés 3-5 fois chacun. Chaque instance charge sa propre référence Prisma + caches internes.

**Fix :** Singletons exportés depuis un module `services/index.ts` ; injection par constructeur pour les tests.

---

### 2.3 Fichiers monolithiques (cognitive load & testabilité)

| Fichier | Lignes | Split suggéré |
|---------|--------|---------------|
| `NotificationService.ts` | 3 089 | Push / Socket / Email / Preferences |
| `MessageTranslationService.ts` | 2 968 | Text / Audio / Cache / Queue |
| `MeeshySocketIOManager.ts` | 1 928 | Connection / Broadcast / CallEvents |
| `server.ts` | 1 474 | Bootstrap / Plugins / Routes / Jobs |

---

### 2.4 MeeshySocketIOManager broadcast non-parallelisé
**Fichier :** `MeeshySocketIOManager.ts` — plusieurs handlers font des `await` séquentiels sur des opérations indépendantes (chercher les participants, calculer présence, émettre).

---

### 2.5 Indexes DB manquants
**Fichier :** `packages/shared/prisma/schema.prisma`

Indexes composites absents ou insuffisants :

```prisma
// Participant — filtre "membres actifs d'une conversation"
@@index([conversationId, userId, isActive])

// Message — timeline utilisateur
@@index([senderId, createdAt(sort: Desc)])

// Notification — nettoyage expiry
@@index([userId, expiresAt])

// MessageReadCursor — calcul unread (hot path)
@@index([participantId, conversationId])
```

---

### 2.6 ETag/Cache-Control partiellement appliqué
**Fichier :** `services/gateway/src/utils/etag.ts` existe et est utilisé sur certaines routes, mais absent sur :
- `GET /conversations/:id` (conversation detail)
- `GET /notifications`
- `GET /users/:id/profile`
- `GET /posts/feed`

---

### 2.7 Absence d'auto-détection de langue (translator)
**Fichier :** `services/translator/src/`

Le champ `originalLanguage` est fourni par le client. Si absent ou incorrect, la traduction échoue silencieusement. `fasttext` (lid.176.bin, 917 Ko) permettrait une détection côté translator en < 1 ms.

---

## 3. FEATURES MANQUANTES VS CONCURRENCE

### Comparaison WhatsApp / Telegram / Signal / Discord

| Feature | Meeshy | Concurrent | Priorité |
|---------|--------|------------|----------|
| Scheduled messages | ❌ | Telegram ✓ | Haute |
| Polls / surveys | ❌ | Telegram, Discord ✓ | Haute |
| Message threads (replies groupées) | Partiel | Discord, Slack ✓ | Haute |
| Réactions avec liste "Qui a réagi" | ❌ UI | WhatsApp, Telegram ✓ | Moyenne |
| Pinned messages par conversation | ❌ | WhatsApp, Telegram ✓ | Moyenne |
| Stories reactions (emoji quick-reply) | ❌ | WhatsApp, Instagram ✓ | Moyenne |
| Message self-destruct (view-once) | Partiel | WhatsApp, Signal ✓ | Implémenté |
| QR code join pour groupes | ❌ | WhatsApp, Telegram ✓ | Basse |
| Channels (broadcast 1→N) | ❌ | Telegram, WhatsApp ✓ | Basse |
| Slow mode (anti-spam conv) | ❌ | Telegram, Discord ✓ | Basse |

### Features différenciantes Meeshy (avance concurrence)
- ✅ Traduction automatique multi-langue temps réel (NLLB-200)
- ✅ Clonage vocal (Chatterbox TTS)
- ✅ Diarisation (multi-speaker audio)
- ✅ E2EE (Signal Protocol)
- ✅ Anonymous chat (session sans compte)

---

## 4. BANDWIDTH & PERFORMANCE RÉSEAU

### 4.1 Compression HTTP — état actuel
`@fastify/compress` est enregistré globalement avec `threshold: 1024`. Brotli > gzip > deflate.  
Compression **active** sur les réponses JSON. Médias marqués `compress: false` (correct).  
**Manque :** Vérification que les routes conversation/messages n'overrident pas accidentellement.

### 4.2 Socket.IO — payload optimisation
Les événements Socket.IO envoient des objets message complets à chaque émission. Pas de diff/patch.  
**Opportunity :** Pour `typing:start/stop` et `status:update`, les payloads sont déjà minimalistes (✓).  
Pour `message:new`, inclure uniquement les champs nécessaires ; lazy-fetch des traductions audio.

### 4.3 Audio pipeline — buffering vs streaming
**Fichier :** `services/translator/src/services/audio_message_pipeline.py`

L'audio est uploadé en entier avant transcription. Whisper supporte le streaming chunked. Gain de latence perçue : 2-4 s sur messages > 30 s.

### 4.4 Reactions payload surdimensionné
À chaque réaction ajoutée, `reaction:added` envoie l'objet reaction + sender complet.  
**Fix :** Envoyer `{ conversationId, messageId, emoji, count, senderId }` uniquement.

---

## 5. WORKFLOW & FLUX UTILISATEUR

### 5.1 Message send path (web)
Flux actuel : `Mutation → Socket.IO WS → Gateway → DB → ZMQ → Translator → PUB → Gateway → Socket → Client`

Optimistic update ✓ implémenté via `createOptimisticMessage()`.  
**Friction :** Le message optimiste n'a pas d'indicateur de traduction pending — l'utilisateur ne sait pas que la traduction est en cours.

### 5.2 Reconnexion Socket.IO
Après reconnexion, le client refetch toutes les conversations + messages manqués.  
`refetchOnReconnect: 'always'` configuré dans React Query (✓).  
**Manque :** Le gateway ne push pas les events manqués pendant la déconnexion (delivery queue existe mais n'est pas exhaustive sur les events non-message).

### 5.3 Presence (online/offline)
Le statut en ligne se met à jour via Socket.IO uniquement.  
**Gap :** Si l'utilisateur ferme l'onglet sans déconnexion propre (crash navigateur), le statut reste "online" jusqu'au prochain pingTimeout (60 s après le fix).

---

## 6. SÉCURITÉ

### 6.1 Sanitisation incomplète
`DOMPurify` est importé dans `services/gateway/src/utils/sanitize.ts` et appliqué aux contenus de messages.  
**Manque :** Titres de conversation, displayNames, et métadonnées de notification ne passent pas systématiquement par `sanitize()`.

### 6.2 Rate limit WS par user-global (pas par socket)
Un attaquant avec 10 onglets peut multiplier le débit par 10 sur le même `userId` si le rate limit est par user sans comptage par socket.

---

## 7. EXPLOITATION DES RESSOURCES SYSTÈME

### 7.1 Gateway — Node.js single process
Le gateway tourne en single process. `cluster` ou `pm2 cluster mode` permettrait d'exploiter tous les cores.  
Blocker : Socket.IO rooms partagées → nécessite Redis adapter (`@socket.io/redis-adapter`) déjà pris en charge par Redis existant.

### 7.2 Translator — modèles non partagés entre workers
50 workers Python (asyncio threads), mais les modèles ML (NLLB 6 GB, Whisper 3 GB) sont chargés une seule fois en mémoire process-level grâce à Python GIL pour les I/O — **OK pour un processus unique**.  
**Opportunity :** Quantification INT8 par défaut pour NLLB (3 GB → 1.5 GB, -5% qualité).

### 7.3 React — Virtualisation listes
`@tanstack/react-virtual` est importé comme dépendance.  
**Vérifier :** La liste de messages et la conversation list utilisent-elles la virtualisation ? Messages peuvent atteindre 10K+ éléments dans une conversation.

---

## 8. UNIFICATION DES COMPORTEMENTS PAR SYSTÈME

### Web
- Service Worker (next-pwa) : configuré mais fonctionnalité offline non vérifiée sur toutes les routes.
- Dark mode via `next-themes` : cohérent avec le design system.
- i18n : client-side uniquement (en/fr/es/pt) — SEO des pages publiques non localisé.

### iOS (MeeshySDK)
- `resolveUserLanguage()` partagé avec gateway ✓ (via packages/shared)
- Cache L1 mémoire + L2 GRDB SQL — patterns cohérents.
- Reconnexion socket : exponential backoff ✓ via `SocketReconnectionPolicy`.

### Gateway
- Langue résolue via `resolveUserLanguage()` from `@meeshy/shared` ✓
- Réponse format unifié `sendSuccess()/sendError()` — quelques routes ancienne utilisent encore `reply.send()` directement.

---

## 9. SYNTHÈSE PRIORITAIRE

| # | Problème | Sévérité | Effort | ROI |
|---|----------|----------|--------|-----|
| 1 | N+1 unreadCount socket broadcast | CRITIQUE | 1h | ⭐⭐⭐⭐⭐ |
| 2 | pingTimeout < pingInterval | CRITIQUE | 30min | ⭐⭐⭐⭐⭐ |
| 3 | ZMQ retry same taskId | CRITIQUE | 2h | ⭐⭐⭐⭐⭐ |
| 4 | TS/ESLint ignorés au build | HAUT | 4h | ⭐⭐⭐⭐ |
| 5 | Indexes DB manquants | HAUT | 1h | ⭐⭐⭐⭐⭐ |
| 6 | ETag sur routes manquantes | HAUT | 2h | ⭐⭐⭐⭐ |
| 7 | Cursor pagination conversations | HAUT | 4h | ⭐⭐⭐⭐ |
| 8 | Duplicate service instantiation | MOYEN | 3h | ⭐⭐⭐ |
| 9 | Scheduled messages | HAUT feature | 8h | ⭐⭐⭐⭐ |
| 10 | Polls / surveys | HAUT feature | 8h | ⭐⭐⭐⭐ |
| 11 | Auto-détection langue translator | MOYEN | 4h | ⭐⭐⭐ |
| 12 | Socket.IO Redis adapter (cluster) | MOYEN | 4h | ⭐⭐⭐ |
| 13 | Pinned messages | MOYEN feature | 6h | ⭐⭐⭐ |
| 14 | Réactions — "qui a réagi" UI | MOYEN feature | 4h | ⭐⭐⭐ |
| 15 | Reply.send() → sendSuccess() unification | BAS | 2h | ⭐⭐ |

**Total estimé :** ~58 h de développement  
**Impact bande passante estimé :** -30 à -50% sur hot paths (unread batch + ETag 304)  
**Impact latence estimé :** -40% perception (pingTimeout + ZMQ fix + DB indexes)
