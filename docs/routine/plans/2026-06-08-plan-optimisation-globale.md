# Plan d'Implémentation — Optimisation Globale
> Date : 2026-06-08 | Basé sur analyse `docs/routine/analyses/2026-06-08-optimisation-globale.md`
> Stratégie : Prioriser par sévérité × effort, de la couche la plus universelle (gateway) vers les clients

---

## Phase 1 — Gateway Critiques (impact immédiat toutes plateformes)

### P1.1 — Fix N+1 Unread Count Queries
**Fichier** : `services/gateway/src/socketio/MeeshySocketIOManager.ts`
**Action** : Remplacer la boucle `for await` par un `groupCount` MongoDB agrégé ou un `findMany` avec aggregation.

```typescript
// AVANT (N+1)
for (const participant of participants) {
  const count = await readStatusService.getUnreadCount(participant.id, conversationId);
}

// APRÈS (1 query)
const unreadCounts = await readStatusService.getUnreadCountsBatch(
  participants.map(p => p.id), conversationId
);
```

Ajouter `getUnreadCountsBatch(participantIds: string[], conversationId: string): Promise<Map<string, number>>` dans `MessageReadStatusService`.

**Tests** : Mettre à jour les tests unitaires de `MeeshySocketIOManager`.

---

### P1.2 — Supprimer Double Fetch Traductions en Broadcast
**Fichier** : `services/gateway/src/socketio/MeeshySocketIOManager.ts:1349-1354`
**Action** : Passer l'objet message déjà en mémoire (avec ses translations) directement à la fonction de broadcast. Supprimer le `findUnique` redondant.

---

### P1.3 — Index Composites Prisma + getUnreadCountsBatch
**Fichier** : `packages/shared/prisma/schema.prisma`
**Action** : Ajouter l'index composite manquant pour les requêtes unread count :

```prisma
model MessageReadStatus {
  @@index([conversationId, participantId])  // déjà existant
  @@index([participantId, readAt])          // NOUVEAU : pour compter non-lus par participant
}
```

---

### P1.4 — Rate Limiting sur REQUEST_TRANSLATION Socket
**Fichier** : `services/gateway/src/socketio/MeeshySocketIOManager.ts:709`
**Action** : Ajouter un rate limiter in-memory (10 req/min par socket) avant de passer à `_handleTranslationRequest`.

---

### P1.5 — Timeout ZMQ sur Envoi
**Fichier** : `services/gateway/src/services/zmq-translation/ZmqRequestSender.ts`
**Action** : Wrapper `connectionManager.send()` avec `Promise.race([send, timeout(5000)])`. Logger + marquer tâche comme failed en cas de timeout.

---

### P1.6 — Déduplication des Langues dans ZmqRequestSender
**Fichier** : `services/gateway/src/services/zmq-translation/ZmqRequestSender.ts`
**Action** : Normaliser et dédupliquer `targetLanguages` avant envoi ZMQ.

---

## Phase 2 — iOS Critiques (sécurité mémoire + UX appels)

### P2.1 — Fix NotificationCenter Observer Duplication dans CallManager
**Fichier** : `apps/ios/Meeshy/Features/Main/Services/CallManager.swift:1580`
**Action** : Appeler `stopScreenCaptureMonitoring()` en début de `startScreenCaptureMonitoring()` pour garantir qu'un seul observateur est actif.

```swift
private func startScreenCaptureMonitoring() {
    stopScreenCaptureMonitoring()  // cleanup first
    screenCaptureObserver = NotificationCenter.default.addObserver(...)
}
```

Même pattern pour `backgroundObserver` et `foregroundObserver`.

---

### P2.2 — Fix Audio Session Lock Coordination
**Fichier** : `apps/ios/Meeshy/Features/Main/Services/CallManager.swift:1789-1900`
**Action** : Extraire un helper `withAudioSessionLock { }` qui garantit lock/unlock atomique et non-réentrant. Fusionner `configureAudioSession()` et `applySpeakerRoute()` dans un seul bloc de configuration.

---

### P2.3 — Fix MessageStore Race Condition (Merge Protecteur)
**Fichier** : `apps/ios/Meeshy/Features/Main/Stores/MessageStore.swift:277-286`
**Action** : Le merge protecteur ne doit conserver un message socket que si son `createdAt > max(records.createdAt)`. Ajouter un test `MessageStoreTests.test_publish_concurrent_socket_rest_preservesForwardOnlyMessages`.

---

### P2.4 — Fix BubbleCallNoticeView Closure Stale
**Fichier** : `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleCallNoticeView.swift`
**Action** : Retirer `onCallBack` de l'implémentation `Equatable` ou passer un identifiant stable (`callId: String`) plutôt que la closure dans la comparaison.

---

### P2.5 — Fix StatusBubble @ObservedObject → @Environment
**Fichier** : `apps/ios/Meeshy/Features/Main/Services/StatusBubbleController.swift:75-94`
**Action** : Séparer la couche d'observation du contenu principal. Utiliser un `EnvironmentKey` pour propager le controller, ou isoler le `StatusBubbleOverlay` dans un `ZStack` top-level du `RootView` (hors du contenu wrappé).

---

### P2.6 — CallManager : Déplacer I/O Socket hors Main Thread
**Fichier** : `apps/ios/Meeshy/Features/Main/Services/CallManager.swift:442-512`
**Action** : Extraire l'emit socket initial + ACK dans un `Task.detached(priority: .userInitiated)`. L'init WebRTC reste en arrière-plan jusqu'à ce que les serveurs ICE soient résolus.

---

### P2.7 — Exponential Backoff sur Reconnexion Socket SDK
**Fichier** : `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift`
**Action** : Implémenter une stratégie de reconnexion avec backoff exponentiel (1s → 2s → 4s → 8s → 30s cap). Réinitialiser au reconnect réussi.

---

## Phase 3 — Web Frontend Performance

### P3.1 — Virtualisation Liste Messages avec @tanstack/react-virtual
**Fichier** : `apps/web/components/conversations/ConversationMessages.tsx` (ou `MessageListView.tsx` web)
**Action** : Implémenter `useVirtualizer` pour la liste de messages. Estimer hauteur initiale à 80px, overscanning 10 items. Gérer le scroll-to-bottom automatique.

```typescript
const virtualizer = useVirtualizer({
  count: messages.length,
  getScrollElement: () => containerRef.current,
  estimateSize: () => 80,
  overscan: 10,
});
```

---

### P3.2 — Images Messages → next/image
**Fichier** : `apps/web/components/attachments/` (ImageAttachment, MessageAttachments)
**Action** : Remplacer tous les `<img>` par `<Image>` de `next/image` avec `loading="lazy"`, dimensions estimées, et format WebP automatique.

---

### P3.3 — Fix Memory Leak Socket Queue
**Fichier** : `apps/web/services/socketio/orchestrator.service.ts`
**Action** : Ajouter un timeout par message dans `pendingMessages` (30s). Nettoyer le timeout si le message est envoyé. Reject automatiquement à expiration.

---

### P3.4 — Memoïser le Tri des Messages
**Fichier** : `apps/web/hooks/queries/use-conversation-messages-rq.ts:173-179`
**Action** : Wrapper le sort dans `useMemo([data?.messages])`.

---

### P3.5 — Fix Déduplication Socket O(1)
**Fichier** : `apps/web/hooks/queries/use-socket-cache-sync.ts:108-144`
**Action** : Construire un `Set` d'IDs depuis les pages existantes avant chaque vérification, au lieu de parcourir le tableau.

---

### P3.6 — React Query staleTime sur les Messages
**Fichier** : `apps/web/hooks/queries/use-messages-query.ts`
**Action** : Ajouter `staleTime: Infinity, refetchOnWindowFocus: false` pour toutes les queries de messages (Socket.IO est source de vérité).

---

### P3.7 — Fix Ref Instable getMessageById
**Fichier** : `apps/web/components/conversations/ConversationMessages.tsx`
**Action** : Remplacer l'assignation manuelle de ref par `useCallback` avec `[translatedMessages]` en dépendance.

---

## Phase 4 — Activation WebSocket Language Filter (B1)

### P4.1 — Enrichir SocketUser avec resolveUserLanguage()
**Fichier** : `services/gateway/src/socketio/MeeshySocketIOManager.ts`
**Action** : À l'authentification socket, appeler `resolveUserLanguage(user, { deviceLocale: user.deviceLocale })` et stocker le jeu complet de langues préférées dans `SocketUser` (pas seulement `language: string` primaire).

### P4.2 — Activer SOCKET_LANG_FILTER en Production
**Action** : Après validation staging (octets émis avant/après, latence groupée), passer `SOCKET_LANG_FILTER=true` dans les configs prod. Documenter la procédure de rollback.

### P4.3 — Étendre Filtre à la Delivery Queue Offline
**Fichier** : `services/gateway/src/socketio/MeeshySocketIOManager.ts:~1517`
**Action** : Appliquer le même filtre langue au payload de delivery queue pour les utilisateurs offline/reconnectés.

---

## Phase 5 — Auth Cache & Securité

### P5.1 — Invalidation Cache Auth sur Changement de Rôle
**Fichier** : `services/gateway/src/routes/admin/users.ts` (ou UserService)
**Action** : Après toute modification de `role`, `isActive`, ou `systemLanguage` d'un utilisateur : appeler `await cache.del(AUTH_CACHE_KEY(userId))`.

### P5.2 — Réduire Payload Cache Auth
**Fichier** : `services/gateway/src/middleware/auth.ts`
**Action** : Ne cacher que les champs nécessaires à la validation d'autorisation (`id`, `role`, `isActive`, `systemLanguage`, `regionalLanguage`) — pas les 40+ champs du modèle User complet.

---

## Récapitulatif par Phase

| Phase | Items | Effort | Impact |
|-------|-------|--------|--------|
| P1 — Gateway Critiques | P1.1–P1.6 | ~1.5 jours | −400ms latence, −70% queries inutiles |
| P2 — iOS Critiques | P2.1–P2.7 | ~2 jours | Stabilité appels, −drain batterie, 0 transcription perdue |
| P3 — Web Performance | P3.1–P3.7 | ~2 jours | Scroll fluide, −50% memory, −30% requêtes REST |
| P4 — B1 Lang Filter | P4.1–P4.3 | ~0.5 jour | −80% bande passante WebSocket par client |
| P5 — Auth Cache | P5.1–P5.2 | ~0.5 jour | Sécurité rôle instantanée, −30% payload cache |

**Total estimé** : ~7 jours de développement | Gain global : 30-40% de latence en moins, 80% bande passante en moins côté socket, stabilité iOS critique.
