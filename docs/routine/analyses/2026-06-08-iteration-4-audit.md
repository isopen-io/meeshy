# Analyse Itération 4 — Meeshy Optimisation Globale
**Date :** 2026-06-08 (itération 4)
**Branche :** `claude/brave-archimedes-2c1TP`
**Base :** `main` (commit `949d71b` — uiux iter-3 mergé)

---

## 0. État des itérations précédentes

| Itération | Statut |
|-----------|--------|
| Iter-1 : MeeshyColors, Dynamic Type, i18n, a11y | ✅ MERGÉ |
| Iter-2 perf : N+1 unread fix, socket callbacks, ringtone, iOS threading | ✅ MERGÉ |
| Iter-2 uiux : i18n video-calls, iOS attachment labels | ✅ MERGÉ |
| Iter-3 perf : N+1 batch fix links, dashboard 1-roundtrip, Redis cache, staleTime | ✅ MERGÉ |
| Iter-3 uiux : viewer i18n (PDF/PPTX/Markdown), iOS MeeshyColors brand colors | ✅ MERGÉ |

---

## 1. Problèmes Critiques Confirmés

### A1 — getUnreadCountsForConversations : N×4 requêtes DB — CRITIQUE
**Fichier :** `services/gateway/src/services/MessageReadStatusService.ts:219-244`

```typescript
// ACTUEL — 4 requêtes par conversation (cursor + participant + retry cursor + count)
await Promise.all(conversationIds.map(async (convId) => {
  for (const participantIdOrUserId of participantIds) {
    const count = await this.getUnreadCount(participantIdOrUserId, convId);
    // getUnreadCount = findUnique(cursor) + findFirst(participant) + findUnique(cursor retry) + message.count
```

Pour 30 conversations × 1 participant = **120 requêtes DB** (4 × 30).  
Ce code est appelé à chaque `GET /conversations` (liste des conversations).  
`getUnreadCountsForParticipants` existe (ligne 172) et batch correctement les cursors,  
mais `getUnreadCountsForConversations` ne l'utilise pas — elle appelle `getUnreadCount` individuel.

**Fix :** Nouvelle méthode `getUnreadCountsForUser(userId, conversationIds)` :
- 1 query `participant.findMany` pour tous les participants du user dans toutes les convs
- 1 query `conversationReadCursor.findMany` pour tous les cursors en batch
- N queries `message.count` en parallèle (1 par conversation)
- Total : **2 + N** au lieu de **4 × N**

---

### B1 — iOS TypingUsernames @Published : re-render complet sur frappe — CRITIQUE
**Fichier :** `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:147`

```swift
@Published var typingUsernames: [String] = []
```

ConversationViewModel est observé par toute la hiérarchie de vue de la conversation.  
Quand quelqu'un tape → `typingUsernames` est mis à jour → **toutes les 500+ bulles** réévaluent leur corps.  
La `typingUsernames` est une donnée ultra-volatile (MAJ toutes les ~1s), sans rapport avec les messages.

**Fix :** Extraire vers un `TypingStateStore: ObservableObject` isolé. Seul l'indicateur de frappe s'abonne à ce store — les bulles de messages ne le voient pas.

---

## 2. Problèmes Importants Confirmés

### A2 — Schema Prisma : Index composite manquant pour pagination curseur — IMPORTANT
**Fichier :** `packages/shared/prisma/schema.prisma:521-525` (model Participant)

Index existants : `@@index([userId, isActive])`, `@@index([conversationId])`, `@@index([userId])`

La requête de liste des conversations filtre :
```
participants.some({ userId, isActive: true }) ORDER BY lastMessageAt DESC
```
MongoDB doit d'abord scanner par `userId+isActive` (Participant) puis joindre sur Conversation pour trier par `lastMessageAt`. Il manque un index sur Conversation couvrant `(isActive, lastMessageAt)` pour accélérer le tri post-filtre.

**Fix :** Ajouter `@@index([isActive, lastMessageAt])` sur le modèle Conversation.

---

### B2 — iOS APIClient : URLSession sans cache HTTP — IMPORTANT
**Fichier :** `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift:256-266`

```swift
let config = URLSessionConfiguration.default
// ← Pas de urlCache ni requestCachePolicy configurés
self.urlSession = URLSession(configuration: config, ...)
```

`URLSessionConfiguration.default` utilise `URLCache.shared` par défaut mais avec une politique `useProtocolCachePolicy` — ce qui signifie que les endpoints qui renvoient `Cache-Control: no-cache` ou absence de cache headers sont systématiquement refetchés.  
Le gateway renvoie `ETag` sur les endpoints read-heavy, mais sans `If-None-Match` côté iOS, les 304 ne sont jamais exploités.

**Fix :**
1. Configurer `config.urlCache = URLCache(memoryCapacity: 10_MB, diskCapacity: 50_MB)` dans APIClient
2. Ajouter header `If-None-Match` dans les requêtes GET à partir de l'ETag précédent (cache NSURLRequest)
3. Le gateway expose déjà `ETag` + `sendWithETag` — ce côté est prêt.

---

### C1 — Translator : Pas de timeout par inférence NLLB — IMPORTANT
**Fichier :** `services/translator/src/services/zmq_translation_handler.py:182-420`

Le handler appelle `ml_service.translate_batch_multilingual(...)` sans timeout.  
Si NLLB reçoit un input pathologique (HTML encodé, texte très long, caractères spéciaux), l'inférence peut bloquer indéfiniment. Le queue ZMQ se remplit, le gateway timeout après 20s, mais le translator continue d'utiliser la VRAM jusqu'à OOM.

**Fix :** Wrapper l'appel ML dans `asyncio.wait_for(..., timeout=45.0)` avec retour d'erreur explicite.

---

## 3. Améliorations de Couverture Fonctionnelle

### D1 — Conversations : Curseur utilisateur unique — MINEUR
La méthode `getUnreadCountsForConversations` reçoit un tableau de `participantIds` mais en pratique l'appelant (`core.ts`) n'envoie qu'un seul `userId` résolu via `userParticipantRecords`. Le code gère `for (const participantIdOrUserId of participantIds)` comme si il y en avait plusieurs, mais la boucle s'arrête au premier `count > 0`. La signature peut être simplifiée.

### D2 — ConversationViewModel : Task.detached pour cache ops — MINEUR
**Fichier :** `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:1846,2331,2346,2850`

4 usages de `Task.detached(priority: .utility)` pour des opérations de cache (mergeUpdate, insertOptimistic, deleteExpiredEphemeral). Ces operations sont sur des `actor`s déjà thread-safe. Les `Task.detached` sont corrects mais évitent l'héritage du contexte MainActor. Le risque est minimal car ces tasks ne mutent pas les `@Published`.

---

## 4. Récapitulatif Priorités

| ID | Fichier | Problème | Impact | Effort |
|----|---------|---------|--------|--------|
| A1 | MessageReadStatusService.ts:219-244 | N×4 DB queries dans getUnreadCountsForConversations | CRITIQUE | 30 min |
| A2 | schema.prisma (Conversation model) | Index manquant `(isActive, lastMessageAt)` | IMPORTANT | 5 min |
| B1 | ConversationViewModel.swift:147 | typingUsernames @Published re-render 500+ rows | CRITIQUE | 30 min |
| B2 | APIClient.swift:256-266 | URLSession sans cache HTTP / ETag | IMPORTANT | 20 min |
| C1 | zmq_translation_handler.py:182 | Pas de timeout par inférence NLLB | IMPORTANT | 10 min |

**Economie estimée (prod) :**
- A1 : -90 DB queries par liste de conversations → -200ms latence P95
- B1 : -500+ SwiftUI re-renders par événement frappe → -15ms CPU/typing event
- B2 : Cache HTTP hit → économie bande passante 30-80% sur GET répétés
