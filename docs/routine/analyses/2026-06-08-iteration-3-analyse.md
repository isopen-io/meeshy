# Analyse Globale — Itération 3 (2026-06-08)
**Branche de base :** `main` @ `05abff79`  
**Objectif :** Identifier les optimisations restantes après les 2 premières itérations

---

## 0. Bilan des itérations précédentes

### Itération 1 (2026-06-07) — Déjà fait
| Item | Status |
|------|--------|
| perMessageDeflate Socket.IO | ✅ |
| @fastify/compress HTTP | ✅ |
| Audio bitrate 128k → 64k | ✅ |
| Auth user Redis cache (5 min) | ✅ |
| Per-language broadcast B1 (flag OFF) | ✅ implémenté, désactivé |
| WebP thumbnails | ✅ |
| Opt-in translation filtering A3 | ✅ |
| MongoDB indexes (systemLanguage, deviceLocale, Message compound) | ✅ |
| React Query persistence IndexedDB | ✅ |
| Hover prefetch ConversationItem | ✅ |
| Translation cache LRU 500 entries | ✅ |
| iOS searchText debounce 150ms | ✅ |
| TTS audio cache Redis (7 jours TTL) | ✅ |
| Parallel multi-language TTS (asyncio.gather) | ✅ |
| Redis memory cache bounded (MAX=500) | ✅ |

### Itération 2 (2026-06-08) — Déjà fait
| Item | Status |
|------|--------|
| N+1 unread count fix | ✅ |
| Socket.IO error callbacks (15 handlers) | ✅ |
| stories refetchOnWindowFocus: false | ✅ |
| ringtone.wav supprimé | ✅ |
| iOS Task.detached → Task (CallManager) | ✅ |

---

## 1. Ce qui reste — Analyse détaillée

### 1.1 Bundle Web — Tone.js static import (HAUTE PRIORITÉ)

**Fichier:** `apps/web/utils/audio-effects.ts:12`  
**Problème:** `import * as Tone from 'tone'` est un import statique en top-level. Tone.js pèse ~800KB et est bundlé dans le chunk principal MÊME quand les effets audio ne sont pas utilisés (ex. utilisateur qui ne fait jamais d'appel vidéo).  
**Impact mesuré:** −800KB du bundle critique + First Load JS réduit  
**Correction:** Dynamic import à l'initialisation de chaque effet

---

### 1.2 Admin Dashboard — 15 count() queries sans cache (HAUTE PRIORITÉ)

**Fichier:** `services/gateway/src/routes/admin/dashboard.ts:39-140`  
**Problème:** 15+ appels `prisma.*.count()` + 4 appels supplémentaires pour "activité récente 24h" — tous sans aucun cache Redis. Chaque chargement du dashboard génère ~19 queries MongoDB.  
**Impact:** ~500-1000ms de latence dashboard, saturation du pool MongoDB en charge  
**Correction:** Cache Redis 10 min (TTL configurable), invalidé manuellement sur demande admin

---

### 1.3 MessageHandler — Block list sans cache (HAUTE PRIORITÉ)

**Fichier:** `services/gateway/src/socketio/handlers/MessageHandler.ts:164-169`  
**Problème:** À chaque envoi de message dans une conversation directe, une query `user.findMany({ blockedUserIds: { has: userId } })` est exécutée. Le statut de blocage change rarement mais est vérifié ~100 fois/jour.  
**Impact:** Latence d'envoi de message +30-100ms, queries DB inutiles  
**Correction:** Cache Redis `blocks:{userId}:{peerId}` TTL 5 min, invalidé sur `user:blocked`/`user:unblocked`

---

### 1.4 Schema: `hasTranslations` Boolean manquant (MOYENNE PRIORITÉ)

**Fichier:** `packages/shared/prisma/schema.prisma:665`  
**Problème:** Le dashboard compte les messages traduits via `where: { translations: { not: { equals: null } } }` — cela fait un scan complet de la collection Message (pas indexable sur champ JSON nullable).  
**Impact:** Query dashboard O(N messages) à chaque chargement  
**Correction:** Ajouter `hasTranslations Boolean @default(false)` + `@@index([hasTranslations])`, mise à jour lors de l'enregistrement de traductions

---

### 1.5 iOS — AnyView dans AudioBubbleRouter (MOYENNE PRIORITÉ)

**Fichier:** `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioBubbleRouter.swift`  
**Problème:** Utilisation de `AnyView?` comme type de slots (`topContent: AnyView?`, `bottomContent: AnyView?`). AnyView efface l'identité de type, empêchant la comparaison structurelle de SwiftUI.  
**Impact:** Re-renders inutiles lors du scroll dans la liste de messages  
**Correction:** Remplacer AnyView par des enums concrètes ou `@ViewBuilder`

---

### 1.6 Web — Framer Motion bundle global (MOYENNE PRIORITÉ)

**Fichier:** `apps/web/next.config.ts`  
**Problème:** `framer-motion` (11.18.2) importé statiquement dans de nombreux composants. Sur les pages sans animation complexe, ajoute ~150KB inutilement.  
**Impact:** Bundle size sur pages sans animation  
**Correction:** Lazy load des composants Framer Motion via `dynamic()`

---

### 1.7 Gateway — conversationId cache en mémoire seule (BASSE PRIORITÉ)

**Fichier:** `services/gateway/src/utils/conversation-id-cache.ts`  
**Problème:** Cache en mémoire Node.js uniquement, non partagé entre instances. Sur cluster 3 instances, chaque instance doit re-chercher en DB au redémarrage.  
**Impact:** Cache miss systématiques après restart, légère latence  
**Correction:** Migrer vers Redis (TTL 24h, données immutables)

---

### 1.8 Web — Error Boundaries manquants (BASSE PRIORITÉ)

**Spec MUST:** Chaque feature doit avoir son propre ErrorBoundary.  
**Statut:** Non vérifié systématiquement  
**Impact:** Un crash dans la liste de messages crash toute l'app  
**Correction:** Wraper les features critiques (MessageList, ConversationList) dans ErrorBoundary

---

## 2. Couverture Fonctionnelle vs Concurrents

### Manque identifié vs WhatsApp/Telegram

| Feature | Status | Effort |
|---------|--------|--------|
| Message forwarding UI | ⚠️ Schema prêt, pas d'UI | 2-3h |
| Message pinning UI | ⚠️ Events déclarés, non câblés | 2-3h |
| View-once photos (câblage) | ⚠️ Schema prêt | 2h |
| Disparaissing messages UI | ⚠️ expiresAt existe | 3h |
| Polls/Quizzes | ❌ Pas de schema | 5h |
| Custom notification sounds | ❌ Hardcodé | 2h |

---

## 3. Priorité × Impact (Iteration 3)

```
RAPIDE + IMPACT ÉLEVÉ:
  [A] Tone.js dynamic import        → −800KB bundle
  [B] Admin dashboard Redis cache   → −90% latence dashboard
  [C] Block list Redis cache        → −50ms message send
  [D] hasTranslations boolean+index → fixes dashboard scan O(N)

EFFORT MOYEN + IMPACT MOYEN:
  [E] AnyView → @ViewBuilder iOS    → scroll fluide
  [F] Error Boundaries web          → stabilité
  [G] conversationId cache → Redis  → multi-instance

EFFORT ÉLEVÉ + IMPACT ÉLEVÉ (future iteration):
  [H] Message forwarding UI
  [I] Message pinning UI
  [J] View-once photos
```

---

## 4. Décision: B1 SOCKET_LANG_FILTER

Le flag B1 (`SOCKET_LANG_FILTER=true`) est implémenté mais délibérément maintenu OFF en attente de validation staging. Sans données de mesure staging, il ne sera PAS activé dans cette itération. La variable d'environnement reste le mécanisme d'activation.
