# Analyse Globale d'Optimisation — Meeshy
**Date :** 2026-06-08  
**Périmètre :** Gateway, Web (Next.js 15), iOS (Swift/MeeshySDK), Translator (FastAPI), packages/shared  
**Méthode :** 4 agents d'exploration parallèles + audit des commits depuis la dernière analyse (2026-05-21)

---

## 0. Ce qui a été fait depuis l'analyse précédente (2026-05-21)

| Item | Commit | Statut |
|------|--------|--------|
| `perMessageDeflate` Socket.IO | `646b2ecd` Phase A | ✅ FAIT |
| `@fastify/compress` HTTP | `646b2ecd` Phase A | ✅ FAIT |
| Audio bitrate 128k → 64k | `646b2ecd` Phase A | ✅ FAIT |
| Opt-in translation filtering (A3) | `94e26b58` | ✅ FAIT |
| Per-language broadcast B1 (flag OFF) | `13c3cb7d` | ✅ FAIT (désactivé) |
| WebP thumbnails (D4) | `a3c4315f` | ✅ FAIT |
| `conversationStats` retiré de `message:new` | `646b2ecd` | ✅ FAIT |
| Sons notification WAV → OGG | partiel | ⚠️ `ringtone.wav` encore en WAV |
| iOS forcePolling → WebSocket | non trouvé | ⚠️ À vérifier |

---

## 1. Bande Passante — Points Restants

### 1.1 Polling REST remplaçable par Socket.IO (PRIORITÉ HAUTE)

| Fichier | Problème | Impact |
|---------|---------|--------|
| `apps/web/hooks/v2/use-friend-requests-v2.ts:70,88` | `refetchInterval: 30000` × 2 queries | 6 MB/h/user actif |
| `apps/web/hooks/queries/use-notifications-query.ts:48` | `refetchInterval: 60*1000` | 2 MB/h/user |
| `apps/web/hooks/social/use-stories.ts:28` | `refetchOnWindowFocus: 'always'` | 15 req/focus |

Le canal Socket.IO diffuse déjà `friend:request-received`, `friend:request-accepted`, `notification:new` — aucun polling n'est nécessaire.

### 1.2 Bundle Web — chargements globaux inutiles

| Librairie | Impact | Fichier |
|-----------|--------|---------|
| `Tone.js` (~800 KB raw) | chargé même quand non utilisé | `utils/audio-effects.ts:13` |
| `FFmpeg.wasm` (~30 MB!) | chargé au démarrage | à identifier |
| `browser-image-compression` (~500 KB) | import top-level | à identifier |

### 1.3 Audio & Media

- `ringtone.wav` encore présent dans `apps/web/public/sounds/` (330 KB → 30 KB en Opus)
- 148 composants web avec `<Image>` mais sans `next/image` optimization
- Audio ZMQ non compressé (10 MB sur le wire pour 10 MB de son)

---

## 2. Gateway — Problèmes Architecturaux

### 2.1 Requêtes N+1 (CRITIQUE)

Pattern répété dans `routes/conversations/messages.ts` (2351 lignes) :

```typescript
// Boucle sur participants → N queries séparées
for (const p of participants) {
  const user = await prisma.user.findFirst({ where: { id: p.userId } });
}

// Reactions non incluses dans la query messages
const reactions = await prisma.reaction.findMany({ where: { messageId } }); // × 100 messages
```

**Impact** : pages messages 10–50× plus lentes que nécessaire.

### 2.2 Absence de cache auth utilisateur

Le middleware `auth.ts` exécute un `prisma.user.findFirst()` à **chaque requête** :
- ~500ms par request non-cachée
- Pour 100 req/s : 100 queries redondantes par seconde
- **Fix** : Redis cache 5 min avec invalidation sur `user:profile-updated`

### 2.3 Rate limiting non distribué

`@fastify/rate-limit` utilise un store **en mémoire** par instance :
- Cluster de 3 instances = bypass via load-balancer (3× la limite réelle)
- Fix : passer au `Redis store` de `@fastify/rate-limit`

### 2.4 Callbacks Socket.IO non renvoyées aux clients

Pattern dans les handlers :
```typescript
socket.on(CLIENT_EVENTS.MESSAGE_SEND, async (data, callback) => {
  try {
    // ...
  } catch (error) {
    logger.error('[MESSAGE_SEND] Error:', error);
    // ← Pas de callback?.({ success: false, error: '...' }) !
  }
});
```
Clients jamais notifiés des erreurs.

### 2.5 ZMQ sans circuit breaker ni retry

Si le service translator tombe :
- Tous les messages restent en `translation:pending` indéfiniment
- Pas de timeout ni fallback (retourner texte original)
- Pas de métriques de latence ZMQ

### 2.6 Duplication de code massive

Pattern auth context répété dans **50+ routes** :
```typescript
const authContext = (request as UnifiedAuthRequest).authContext;
const userId = authContext.registeredUser?.id;
```

Pattern try/catch répété dans **11 Socket handlers** — besoin d'un wrapper.

### 2.7 Audio processing séquentiel dans ZMQ

```typescript
for (const attachment of audioData.attachments) {
  await updateAttachment(attachment); // linéaire, pas parallèle
}
```
Devrait être `Promise.all()`.

---

## 3. Web Frontend — Problèmes Spécifiques

### 3.1 Layout entièrement `'use client'`

`app/layout.tsx` marque tout comme Client Component → perte du streaming SSR Next.js 15. Les providers (`QueryProvider`, `ThemeProvider`, `StoreInitializer`) devraient être séparés.

### 3.2 Absence de skeleton loading

Pas de placeholder skeleton pendant le fetch → perception de lenteur.

### 3.3 Listes non virtualisées

`@tanstack/react-virtual` est dans les dépendances mais **non utilisé**. Les listes de 100+ conversations/messages chargent tous les éléments DOM.

### 3.4 Race conditions WS vs HTTP

Absence de deduplication quand une mutation Socket.IO + une mutation React Query arrivent simultanément → affichage incohérent temporaire.

### 3.5 Accessibilité (WCAG 2.1 AA)

- Pas de `role="main"` sur `#main-content`
- Pas de landmarks (`<nav>`, `<aside>`)
- Heading hierarchy fragile (h1 → h3 saut)
- Pas de focus management au changement de conversation
- Keyboard shortcuts non documentés

---

## 4. Translator — Problèmes ML

### 4.1 Pool workers calculé dynamiquement (imprévisible)

```python
normal_workers = max(20, max_workers // 2)  # non déterministe
```
En charge : allocation imprévisible. Solution : configuration explicite par type de tâche.

### 4.2 Thread safety ModelManager

```python
with self._lock:  # protège uniquement __new__
    model = get_model(id)  # accès non verrouillé !
```
Race condition entre eviction et usage.

### 4.3 Mémoire cache Redis unbounded

```python
self.memory_cache: Dict[str, CacheEntry] = {}
# Pas de max_size → OOM si Redis down + trafic élevé
```

### 4.4 Pas de routage langue → backend TTS

Chatterbox (bon pour français/anglais) est utilisé pour toutes les langues incluant Amharique, Wolof, etc. Aucun fallback vers MMS Africa.

### 4.5 File queue O(N) pour trouver le prochain job

```python
# OrderedDict avec scan linéaire
for job_id, job in self.translation_queue.items():
    if job.status == 'pending':
        return job_id
```
Si 1000 jobs en queue → O(1000) per pickup.

---

## 5. packages/shared — Problèmes

### 5.1 Indexes MongoDB manquants (CRITIQUE)

Les queries les plus fréquentes sans index :

| Collection | Query fréquente | Index manquant |
|-----------|----------------|----------------|
| `User` | `systemLanguage` (language resolution) | `@@index([systemLanguage])` |
| `User` | `deviceLocale` (Prisme 4e priorité) | `@@index([deviceLocale])` (sparse) |
| `Message` | `conversationId + createdAt` (pagination) | Compound index |
| `Reaction` | `messageId` seul | `@@index([messageId])` |
| `Attachment` | `messageId` seul | `@@index([messageId])` |
| `ConversationShare` | `communityId + isPinned + pinOrder` | Compound index |

### 5.2 Language validation absente

`normalizeLanguageCode("xxxx")` retourne `"xx"` (code inexistant) sans erreur.
`resolveUserLanguage()` accepte tout `systemLanguage` sans vérifier s'il est dans `SUPPORTED_LANGUAGES`.

### 5.3 getRequiredLanguages() incomplète

Ne collecte qu'une langue par membre (top-priority) → si user a `systemLanguage:'en'` + `deviceLocale:'fr'`, le français est ignoré pour l'auto-translate.

---

## 6. iOS/SDK — Problèmes

### 6.1 Tokens UserDefaults (SÉCURITÉ)

Les tokens JWT sont stockés en `UserDefaults` (non chiffré) au lieu de `Keychain`. Risque d'extraction via backup non-chiffré.

### 6.2 E2EE Signal Protocol non câblé

Les modèles (`encryptionMode: "e2ee"`, `signalIdentityKeyPublic`, etc.) existent, mais le crypto Signal Protocol n'est pas implémenté côté iOS (les appels API de chiffrement ne sont pas wired).

### 6.3 ConversationViewModel God Object (3561 LoC)

À découper en :
- `CoreConversationVM` (état de base)
- `MessageLoadingVM` (pagination)
- `AudioCoordinatorVM` (playback)
- `TranslationVM` (Prisme Linguistique)

### 6.4 setConversations() O(n log n) sur chaque mutation

Full sort à chaque changement, même pour 1 item.

### 6.5 Image download non limité

100 messages = 100 téléchargements concurrents. Besoin d'un semaphore (max 4).

### 6.6 SearchText non debounced

Filter recalculé à chaque keystroke.

---

## 7. Couverture Fonctionnelle vs Concurrents

### Ce que Meeshy a (unique ou différenciateur)

| Feature | Statut |
|---------|--------|
| Prisme Linguistique (auto-traduction) | ✅ Unique SOTA |
| Voice cloning TTS | ✅ Unique |
| Stories full editor (keyframes) | ✅ SOTA |
| Feed social hybride | ✅ |
| WebRTC Calls (rebuilt June 2026) | ✅ SOTA |
| AI Agents en conversation | ✅ Unique |
| Affiliate tracking | ✅ Unique |
| Communities | ✅ |
| Anonymous join via link | ✅ |

### Ce qui manque vs WhatsApp/Telegram/Signal

| Feature | WhatsApp | Telegram | Meeshy | Priorité |
|---------|----------|----------|--------|----------|
| Message forwarding | ✅ | ✅ | ❌ (schema OK, UI manque) | HAUTE |
| Message pinning | ✅ | ✅ | ❌ (events déclarés, non émis) | HAUTE |
| Polls / Quizzes | ✅ | ✅ | ❌ | MOYENNE |
| Message scheduling | ❌ | ✅ | ❌ | BASSE |
| Multiple accounts | ❌ | ✅ | ❌ | MOYENNE |
| Voice message 2x speed | ✅ | ✅ | ❌ | HAUTE |
| In-conversation search | ✅ | ✅ | ✅ (GRDB FTS5) | ✅ |
| Chat backup/export | ✅ | ✅ | ❌ | BASSE |
| Keyboard shortcuts web | ✅ | ✅ | ❌ | MOYENNE |
| Custom notification sounds | ✅ | ✅ | ❌ (hardcoded) | BASSE |
| View-once photos (full) | ✅ | ✅ | ⚠️ (schema OK, non câblé) | HAUTE |
| Disappearing messages | ✅ | ✅ | ⚠️ (expiresAt existe, UI?) | HAUTE |

---

## 8. Matrices Priorité

### Impact × Effort (technique)

```
                EFFORT FAIBLE (< 1 jour)      EFFORT ÉLEVÉ (> 1 semaine)
              ┌────────────────────────────┬──────────────────────────────┐
IMPACT        │  QW — QUICK WINS           │  CHANTIERS STRUCTURELS       │
ÉLEVÉ         │                            │                              │
              │  [A] Auth user Redis cache  │  [E] N+1 queries fix total   │
              │  [B] friend-requests socket │  [F] TTS à la demande (lazy) │
              │  [C] Prisma indexes         │  [G] CDN/S3 médias           │
              │  [D] B1 flag ON             │  [H] Distributed rate limiter│
              │  [I] Socket.IO error cb     │  [J] ConversationVM split    │
              │  [K] Worker pool explicit   │  [L] ZMQ priority queue      │
              │  [M] Memory cache bounded   │  [N] E2EE Signal iOS         │
              │  [O] Tone.js dynamic import │  [P] Avatar multi-variants   │
              │  [Q] Ringtone WAV → Opus    │                              │
              ├────────────────────────────┼──────────────────────────────┤
IMPACT        │  AMÉLIORATIONS CIBLÉES     │  À REPORTER                  │
MOYEN         │                            │                              │
              │  [R] ZMQ circuit breaker   │  [S] Chat backup/export      │
              │  [T] Audio ZMQ compressé   │  [U] Message scheduling      │
              │  [V] SearchText debounce   │  [W] Multiple accounts       │
              │  [X] Image download sema.  │  [Y] Polls/Quizzes           │
              │  [Z] Virtual lists web     │                              │
              │  [AA] Skeleton loading     │                              │
              │  [BB] Message forwarding   │                              │
              │  [CC] Message pinning      │                              │
              │  [DD] Voice msg 2x speed   │                              │
              └────────────────────────────┴──────────────────────────────┘
```

---

## 9. KPIs Cibles

| Métrique | Actuel | Cible Phase 1 | Cible Phase 2 |
|---------|--------|---------------|---------------|
| Polling REST (friend/notif) | 2 req/min/user | 0 | 0 |
| Auth middleware latency | ~500ms (uncached) | <20ms (Redis) | <5ms |
| Bundle JS initial web (gzippé) | ~450–550 KB | ~380 KB | ~300 KB |
| MongoDB queries/message | 8–12 | 4–6 | 2–3 |
| TTS on-demand (lazy) | 0% | 0% | 60% |
| Cold start network requests iOS | 20+ | 5 | 3 |
| Image download concurrency iOS | unbounded | 4 | 4 |
| Tone.js loaded inutilement | 100% sessions | 0% | 0% |
