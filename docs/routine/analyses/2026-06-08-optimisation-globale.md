# Analyse d'Optimisation Globale — Meeshy
> Date : 2026-06-08 | Branche : main (après merge `b4bee8af`)
> Scope : gateway, web, iOS, SDK, shared packages, architecture

---

## Contexte Sprint Actuel

| Sprint | Statut | Résumé |
|--------|--------|--------|
| Payload Weight Sprint (2026-06-07) | Partiellement livré | A1-A4 ✅, B1 🟡 (derrière flag `SOCKET_LANG_FILTER`) |
| Rich Call System Messages (2026-06-07) | Livré | L1-L5 tous layers, 27 tests pass |

---

## 1. GATEWAY — Issues Critiques

### 1.1 [CRITIQUE] N+1 Queries — Unread Count Loop
**Fichier** : `services/gateway/src/socketio/MeeshySocketIOManager.ts:1543-1550`

Pour chaque message envoyé dans une conversation de N participants, le gateway effectue **N requêtes DB séquentielles** pour calculer le unread count :
```typescript
for (const participant of participants) {   // N participants
  const unreadCount = await readStatusService.getUnreadCount(participant.id, conversationId);
  // ↑ Une requête MongoDB par tour de boucle, séquentielle, bloquante
}
```
**Impact** : Conversation de 20 personnes, 10 msg/min → 200 requêtes/min superflues. Latence broadcast ~400ms à l'échelle.

### 1.2 [CRITIQUE] Double Fetch de Traductions par Broadcast
**Fichier** : `services/gateway/src/socketio/MeeshySocketIOManager.ts:1349-1354`

Le broadcast de message refetch les traductions de MongoDB alors qu'elles sont déjà en mémoire depuis la sauvegarde initiale :
```typescript
// Ligne 1349-1354 : query inutile
const msgWithTranslations = await prisma.message.findUnique({
  where: { id: message.id },
  select: { translations: true }  // ← déjà disponible en mémoire
});
```
**Impact** : +1 requête MongoDB par message envoyé, à tous les niveaux de charge.

### 1.3 [HAUT] WebSocket Language Filter Désactivé (B1 Derrière Flag)
**Fichier** : `services/gateway/src/socketio/MeeshySocketIOManager.ts:1489-1493`

Le filtre de langue socket est implémenté mais désactivé par défaut (`SOCKET_LANG_FILTER=false`). Chaque message est broadcasté avec **toutes les langues** à **tous les clients**, alors que chaque client ne lit qu'1-2 langues.

**Impact** : Conversation 10 langues = 10× la charge réseau par client. À 100 utilisateurs simultanés : ~2.5 MB/min de bande passante inutile.

**Reste à faire pour activer B1** :
- Enrichir `SocketUser.language` via `resolveUserLanguage()` (non pas seulement la langue primaire)
- Mesurer impact staging
- Activer `SOCKET_LANG_FILTER=true` en prod

### 1.4 [HAUT] Double Requête pour Présence Snapshot
**Fichier** : `services/gateway/src/socketio/MeeshySocketIOManager.ts:399-413`

À chaque connexion socket authentifiée : 2 requêtes DB séquentielles au lieu de 1 (participants user → conversations → participants des conversations).

### 1.5 [HAUT] Cache de Traduction Non Isolé par Mode Chiffrement
**Fichier** : `services/gateway/src/services/message-translation/MessageTranslationService.ts:67-91`

La clé de cache translation n'inclut pas le mode E2EE. Risque de collision cache entre message chiffré et non chiffré → fuite potentielle de contenu.

### 1.6 [MOYEN] Pas de Rate Limiting sur `REQUEST_TRANSLATION` Socket
**Fichier** : `services/gateway/src/socketio/MeeshySocketIOManager.ts:709-770`

Un client peut spammer la demande de traduction sans limite, saturant la queue ZMQ.

### 1.7 [MOYEN] Pas de Timeout sur Envoi ZMQ
**Fichier** : `services/gateway/src/services/zmq-translation/ZmqRequestSender.ts:64-101`

Fire-and-forget sans timeout, aucune notification si le service translator est mort.

### 1.8 [MOYEN] Cache Auth : Invalidation Manquante sur Changement de Rôle
**Fichier** : `services/gateway/src/middleware/auth.ts:172-194`

Le cache auth (TTL 5 min) n'est pas invalidé quand le rôle d'un utilisateur change → privilèges élevés/réduits effectifs avec délai.

### 1.9 [MOYEN] Serialisation JSON Lourde dans le Cache Auth
Objets `User` complets sérialisés/désérialisés JSON à chaque requête authentifiée. Les champs `Date` sont re-parsés à chaque hit de cache.

---

## 2. WEB FRONTEND — Issues Critiques

### 2.1 [CRITIQUE] Pas de Virtualisation pour la Liste de Messages
**Fichier** : `apps/web/components/conversations/ConversationMessages.tsx`

Les messages sont tous rendus dans le DOM sans virtualisation. À 100+ messages : 10 000+ nodes DOM, scroll janky, mémoire excessive sur mobile.

`@tanstack/react-virtual` est déjà dans les dépendances — non utilisé pour les messages.

### 2.2 [CRITIQUE] Images sans `next/image` — Pas de Lazy Loading
**Fichier** : `apps/web/components/attachments/MessageAttachments.tsx`

Les images des messages utilisent des balises `<img>` brutes sans lazy loading, sans format WebP/AVIF, sans sizing hints. Toutes les images se chargent immédiatement même hors viewport.

### 2.3 [HAUT] Memory Leak : Socket Queue sans Timeout
**Fichier** : `apps/web/services/socketio/orchestrator.service.ts:78-81`

`pendingMessages` accumule des messages en attente de socket sans timeout de libération. Sur les onglets longue durée avec pertes réseau → fuite mémoire.

### 2.4 [HAUT] Message Sort sans Mémoïsation
**Fichier** : `apps/web/hooks/queries/use-conversation-messages-rq.ts:173-179`

Tri O(n log n) sur le tableau de messages exécuté à chaque render, même si les données n'ont pas changé.

### 2.5 [HAUT] Déduplication Socket O(n²) par Accès
**Fichier** : `apps/web/hooks/queries/use-socket-cache-sync.ts:108-144`

Pour chaque événement message reçu, une boucle parcourt toutes les pages de messages (O(messages × events)). À 100 messages × 100 événements = 10 000 itérations.

### 2.6 [HAUT] React Query : Pas de `staleTime` sur les Messages
**Fichier** : `apps/web/hooks/queries/use-messages-query.ts`

Sans `staleTime: Infinity`, React Query refetch les messages depuis le REST à chaque fois que l'onglet reprend le focus, même si Socket.IO est la source de vérité.

### 2.7 [HAUT] Composants Monolithiques (1000+ lignes)
- `apps/web/components/settings/user-settings.tsx` : 1947 lignes
- `apps/web/components/conversations/ConversationSettingsModal.tsx` : 1359 lignes
- `apps/web/components/conversations/ConversationLayout.tsx` : 1081 lignes

Chargement de tout le bundle même si l'utilisateur n'accède qu'à un onglet.

### 2.8 [MOYEN] Ref Instable pour `getMessageById`
**Fichier** : `apps/web/components/conversations/ConversationMessages.tsx:87-99`

Ref réassignée à chaque render au lieu de `useCallback`. Les convertisseurs Socket.IO gardent une référence stale.

### 2.9 [MOYEN] Indicateur de Frappe : setTimeout sans Nettoyage
**Fichier** : `apps/web/stores/conversation-ui-store.ts:112-126`

Si un utilisateur envoie plusieurs événements de frappe rapidement, les timeouts s'accumulent et peuvent invalider l'indicateur trop tôt ou trop tard.

### 2.10 [MOYEN] i18n : Tous les Paquets de Langue Chargés Simultanément
**Fichier** : `apps/web/locales/`

Utilisateur anglais charge quand même les bundles fr/es/pt. Manque d'import dynamique par langue.

---

## 3. iOS APP — Issues Critiques

### 3.1 [CRITIQUE] CallManager : Observateurs NotificationCenter Dupliqués
**Fichier** : `apps/ios/Meeshy/Features/Main/Services/CallManager.swift:1580-1606`

`startScreenCaptureMonitoring()` enregistre un observateur sans vérifier si le précédent est toujours actif. En cas de reconnexion de call → observateurs multipliés → batterie drainée + scroll janky.

```swift
// PROBLÈME : appelé à chaque transitionToConnected() sans cleanup préalable
func startScreenCaptureMonitoring() {
    screenCaptureObserver = NotificationCenter.default.addObserver(...)
    // Le précédent observateur n'est pas libéré → double-fire
}
```

### 3.2 [CRITIQUE] CallManager : Audio Session Lock/Unlock Non Coordonné
**Fichier** : `apps/ios/Meeshy/Features/Main/Services/CallManager.swift:1789-1900`

Deux blocs `lockForConfiguration/unlockForConfiguration` indépendants peuvent se bloquer mutuellement si appelés en succession rapide (connect → toggle speaker). Risque de deadlock audio 30-60 secondes.

### 3.3 [CRITIQUE] MessageStore : Race Condition sur Merge Protecteur
**Fichier** : `apps/ios/Meeshy/Features/Main/Stores/MessageStore.swift:277-286`

Le merge protecteur (socket + REST simultanés) peut conserver une transcription en mémoire sans la persister → transcription perdue au redémarrage froid.

### 3.4 [CRITIQUE] ConversationSocketHandler : Timers sans Cleanup d'État Partagé
**Fichier** : `apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift:84-90`

`nonisolated(unsafe)` sur `typingSafetyTimers` dict → accès concurrent potentiel. Dict peut croître sans borne dans les groupes larges.

### 3.5 [HAUT] CallManager : I/O Socket sur Main Thread lors de l'Initiation d'Appel
**Fichier** : `apps/ios/Meeshy/Features/Main/Services/CallManager.swift:442-512`

Le setup d'un appel (emit socket + ACK + init caméra) s'exécute entièrement sur `@MainActor` → gel UI de 1-3 secondes au tap "Appeler".

### 3.6 [HAUT] StatusBubble : @ObservedObject Singleton dans un Modifier
**Fichier** : `apps/ios/Meeshy/Features/Main/Services/StatusBubbleController.swift:75-94`

Le modifier `.withStatusBubble()` utilise `@ObservedObject` sur le singleton → 15 écrans redessinés entièrement à chaque affichage d'une bulle de statut.

### 3.7 [HAUT] BubbleCallNoticeView : Closure Stale dans Equatable
**Fichier** : `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleCallNoticeView.swift:23-30`

La closure `onCallBack` est exclue de l'implémentation `Equatable`. Si le parent re-render avec une nouvelle closure, la vue utilise l'ancienne → "Rappeler" peut silencieusement ne rien faire.

### 3.8 [MOYEN] ConversationViewModel : Trop de @Published Propriétés
Chaque message entrant déclenche 8+ publications `@Published` simultanées → 8 re-renders de `ConversationView` par message.

### 3.9 [MOYEN] Router : ViewModels Non Libérés après Pop Navigation
**Fichier** : `apps/ios/Meeshy/Features/Main/Navigation/Router.swift`

50 navigations conversation → 50 `ConversationViewModel` potentiellement retenus en mémoire (~250MB).

### 3.10 [MOYEN] Pas d'Exponential Backoff sur Reconnexion Socket
**Fichier** : `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift`

Reconnexion immédiate en boucle sur coupure réseau → hammer serveur + batterie brûlée en mauvaise connexion.

---

## 4. SHARED PACKAGES & ARCHITECTURE

### 4.1 [HAUT] Index Composites Manquants sur Participant
**Fichier** : `packages/shared/prisma/schema.prisma`

Index `[userId, conversationId, isActive]` manquant → les requêtes présence et unread count ne peuvent pas utiliser d'index composite optimal.

### 4.2 [MOYEN] Types Dupliqués entre iOS et Web
Les types de messagerie (CallSummaryMetadata, etc.) sont définis séparément en Swift et TypeScript sans validation croisée automatique.

### 4.3 [MOYEN] Pipeline Traducteur : Pas de Deduplciation des Langues
**Fichier** : `services/gateway/src/services/zmq-translation/ZmqRequestSender.ts`

Langues dupliquées dans une requête de traduction acceptées sans déduplication → traductions en double en MongoDB.

### 4.4 [INFO] `next.config.ts` : `typescript.ignoreBuildErrors: true`
**Fichier** : `apps/web/next.config.ts`

Masque les erreurs TypeScript en build → erreurs runtime silencieuses en production.

---

## 5. RÉSUMÉ PAR PRIORITÉ

| # | Sévérité | Domaine | Issue | Impact Estimé |
|---|----------|---------|-------|----------------|
| 1 | CRITIQUE | Gateway | N+1 unread count queries | −400ms latence/msg dans les groupes |
| 2 | CRITIQUE | Gateway | Double fetch traductions en broadcast | −1 query/message |
| 3 | CRITIQUE | iOS | NotificationCenter observer duplication | Batterie, jank scroll |
| 4 | CRITIQUE | iOS | Audio session deadlock | Appels silencieux 30-60s |
| 5 | CRITIQUE | iOS | MessageStore race condition | Perte transcriptions après restart |
| 6 | CRITIQUE | Web | Pas de virtualisation liste messages | DOM 10K+ nodes, scroll janky |
| 7 | CRITIQUE | Web | Images sans next/image | Tout chargé au démarrage |
| 8 | HAUT | Gateway | WebSocket lang filter désactivé (B1) | 10× bande passante inutile |
| 9 | HAUT | Gateway | Double requête présence snapshot | +1 query/connexion |
| 10 | HAUT | iOS | I/O socket sur Main Thread (call) | Gel UI 1-3s |
| 11 | HAUT | iOS | StatusBubble @ObservedObject modifier | 15 écrans redraw |
| 12 | HAUT | iOS | BubbleCallNoticeView closure stale | Rappel silencieux |
| 13 | HAUT | Web | Socket queue memory leak | Fuite longue durée |
| 14 | HAUT | Web | Message sort sans memoïsation | Jank render |
| 15 | HAUT | Web | React Query staleTime absent | Requêtes REST inutiles |
| 16 | MOYEN | Gateway | Pas de rate limit REQUEST_TRANSLATION | DDoS vector |
| 17 | MOYEN | Gateway | Pas de timeout ZMQ | Requêtes perdues silencieuses |
| 18 | MOYEN | Gateway | Cache auth invalidation manquante | Délai changement rôle |
| 19 | MOYEN | iOS | Trop de @Published sur ViewModel | 8 redraws/message |
| 20 | MOYEN | iOS | Pas d'exponential backoff reconnexion | Batterie drainée |
| 21 | MOYEN | Web | Déduplication socket O(n²) | CPU spike sur flux rapide |
| 22 | MOYEN | Web | i18n bundles tous chargés | Bande passante inutile |

---

## 6. COUVERTURE FONCTIONNELLE vs CONCURRENCE

### Points Forts Meeshy (différenciants)
- Traduction automatique multi-langue (NLLB-200) — unique sur le marché messaging
- Voice cloning + TTS multilingue (Chatterbox)
- E2EE avec mode hybride/serveur flexible
- Résumé d'appel enrichi (durée, données, qualité réseau)

### Lacunes vs Concurrents (WhatsApp, Signal, Telegram, Discord)

| Feature | WhatsApp | Signal | Telegram | Discord | Meeshy |
|---------|----------|--------|----------|---------|--------|
| Messages éphémères | ✅ | ✅ | ✅ | ❌ | ❓ (schema a `deletedAt` mais pas d'UI timer) |
| Réactions emoji | ✅ | ✅ | ✅ | ✅ | ✅ |
| Threads/replies | ✅ | ✅ | ✅ | ✅ | Partiel (reply uniquement) |
| Mentions @user | ✅ | ❌ | ✅ | ✅ | ❓ |
| Story/Status | ✅ | ❌ | ❌ | ❌ | ✅ |
| Partage d'écran | ❌ | ❌ | ❌ | ✅ | ❓ |
| Résumé appel enrichi | ❌ | ❌ | ❌ | Partiel | ✅ |
| Traduction auto | ❌ | ❌ | ✅ (externe) | ❌ | ✅ (natif) |
| Voice cloning | ❌ | ❌ | ❌ | ❌ | ✅ |
| Poll/Vote | ✅ | ❌ | ✅ | ❌ | ❓ |

**Priorités fonctionnelles recommandées** (dans les prochains sprints) :
1. Messages éphémères (timer) — manque critique vs WhatsApp/Signal
2. Mentions @user dans les messages — base de Discord/Slack
3. Threads (fils de discussion) — Discord/Slack
