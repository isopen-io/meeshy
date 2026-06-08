# Meeshy — Analyse Optimisation État de l'Art
**Date**: 2026-06-08  
**Scope**: Gateway · Web · iOS · Shared · Translator · Infra  
**Méthode**: 5 agents d'analyse parallèles sur l'ensemble du codebase post-merge main

---

## Résumé Exécutif

33 problèmes identifiés, classés par sévérité. Les points critiques concernent :
- **Web** : absence de virtual scrolling (TanStack Virtual installé mais inutilisé), fuites mémoire Socket.IO
- **iOS** : cycles de rétention mémoire, absence d'Equatable sur les cellules de liste, flooding socket
- **Gateway** : N+1 sur autoDeliver, fire-and-forget auth, absence d'index MongoDB
- **Translator** : pas de batching des requêtes NLLB, cold start 2-4s par thread
- **Infra** : flag `SOCKET_LANG_FILTER` implémenté mais désactivé, Redis sans TTL/éviction

Gains estimés si tout corrigé : **−40% bande passante**, **−60% re-renders iOS/web**, **5-8× throughput traduction**, **−30-40% latence queries MongoDB**.

---

## CRITIQUE

### C1 — Virtual Scrolling absent (Web)
**Fichier**: `apps/web/components/common/messages-display.tsx:219-405`  
**Problème**: Toute la liste de messages est dans le DOM (même 1000+ messages). `@tanstack/react-virtual` est installé dans `package.json` mais jamais utilisé.  
**Impact**: LCP/FID dégradés sur les longues conversations ; freeze UI à partir de ~200 messages.  
**Fix**: Remplacer le rendu plat par `useVirtualizer` de TanStack Virtual.

### C2 — Fuite mémoire Socket.IO (Web)
**Fichier**: `apps/web/hooks/use-websocket.ts:113-115`  
**Problème**: Les listeners enregistrés dans un `Set` ne sont jamais unsubscribed au unmount du composant.  
**Impact**: Accumulation non bornée de listeners sur la navigation → crash mémoire sur session longue.  
**Fix**: Ajouter un cleanup `useEffect` retournant `() => unsubscribeAll()`.

### C3 — Cycles de rétention mémoire (iOS)
**Fichier**: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift:175-179`  
**Problème**: 117 appels `DispatchQueue.main.async` avec captures closure incohérentes. Seulement 35 `deinit` pour des centaines d'observers → fuites probables.  
**Impact**: Croissance mémoire non bornée sur session longue, crashes background.  
**Fix**: Migrer vers `Task { @MainActor in ... }`, auditer `[weak self]` systématiquement.

### C4 — Flooding socket iOS + unsafe concurrency
**Fichier**: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift:84-90`  
**Problème**: `typingTimer` et `typingSafetyTimers` marqués `nonisolated(unsafe)` sur une classe `@MainActor`. Invalidations Timer concurrentes sans verrou.  
**Impact**: Race conditions sur indicateurs de frappe, potentiels crashes.  
**Fix**: Migrer les timers dans un acteur dédié ou garantir l'isolation `@MainActor`.

---

## HAUTE PRIORITÉ

### H1 — N+1 dans autoDeliver (Gateway)
**Fichier**: `services/gateway/src/socketio/handlers/MessageHandler.ts:638-690`  
**Problème**: `_autoDeliverToOnlineRecipients()` : 2 `findMany` séquentiels puis boucle appelant `shouldShowReadReceipts()` par participant → N+1 DB.  
**Fix**: Batch `privacyService.shouldShowReadReceiptsMany()` en requête unique.

### H2 — Flag SOCKET_LANG_FILTER non activé (Infra)
**Fichier**: `services/gateway/src/socketio/MeeshySocketIOManager.ts:1489`  
**Problème**: Phase B1 implémentée et testée (`filterMessagePayloadForLanguages()`) mais désactivée par défaut. Réduit payload 10× pour utilisateurs monolingues.  
**Fix**: Activer `SOCKET_LANG_FILTER=true` en staging + mesurer avant/après.

### H3 — Pas de batching traductions NLLB (Translator)
**Fichier**: `services/translator/src/services/zmq_translation_handler.py:78`  
**Problème**: Chaque message ZMQ traité individuellement. Pas d'accumulation avant inférence modèle.  
**Impact**: 5-8× moins de throughput sous charge concurrente.  
**Fix**: `RequestBatcher` (fenêtre 100ms OU 32 requêtes) avant soumission au modèle.

### H4 — Cold start NLLB 2-4s/thread (Translator)
**Fichier**: `services/translator/src/services/translation_ml/translator_engine.py:1-80`  
**Problème**: Pipelines thread-local chargés paresseusement à la première requête.  
**Fix**: Pré-charger le modèle au startup de l'app dans `main.py`.

### H5 — Absence d'Equatable sur cellules iOS
**Fichier**: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift:28-80`  
**Problème**: Vue bubble reçoit 26 paramètres sans `Equatable`. Tout changement `@Published` parent force un re-rendu complet de la liste.  
**Impact**: Liste de messages scintille à chaque frappe de l'interlocuteur.  
**Fix**: Extraire un `BubbleStandardLayoutModel: Equatable` + `.equatable()` sur la vue.

### H6 — Image loading sans lazy/thumbnail (iOS)
**Fichier**: `apps/ios/Meeshy/Core/ImageDownsamplingConfig.swift`  
**Problème**: Config de downsampling existe mais utilisée dans 4 endroits seulement. Images pleine résolution chargées lors du scroll.  
**Fix**: Politique centralisée : thumbnail d'abord → full-res en background.

### H7 — Bundle size web (recharts + pdfjs + tone.js)
**Fichier**: `apps/web/package.json:64-82`  
**Problème**: `recharts` (205KB), `pdfjs-dist` (450KB), `tone.js` (350KB) chargés sur chaque page. Total ~2.3MB bundle initial.  
**Fix**: Dynamic imports `() => import('recharts')` uniquement sur admin/feed pages.

### H8 — Sélecteurs Zustand non granulaires (Web)
**Fichier**: `apps/web/stores/auth-store.ts:65-100`  
**Problème**: Objet auth complet re-rendu quand un seul champ change. Pas de `useShallow` selectors.  
**Fix**: `useShallow` + sélecteurs primitifs dans tous les stores.

---

## MOYENNE PRIORITÉ

### M1 — Fire-and-forget auth middleware (Gateway)
**Fichier**: `services/gateway/src/middleware/auth.ts:136-141, 214-219`  
**Problème**: `userSession.update()` appelé via `.catch()` sans `await`, causant des rejections non gérées.  
**Fix**: `await` dans try/catch ou `Promise.allSettled()`.

### M2 — Double décodage JWT (Gateway)
**Fichier**: `services/gateway/src/middleware/auth.ts:108-111`  
**Problème**: `jwt.verify()` puis `jwt.decode()` sur le même token dans le chemin expiré.  
**Fix**: Mettre en cache le résultat de `jwt.verify()`, réutiliser sur le fallback.

### M3 — Accumulation listeners EventEmitter (Gateway)
**Fichier**: `services/gateway/src/socketio/MeeshySocketIOManager.ts:510-521`  
**Problème**: Listeners TranslationService attachés sans `.once()` ni cleanup → accumulation.  
**Fix**: `.once()` pour événements one-shot, `removeListener()` au disconnect.

### M4 — Absence de pagination AuthHandler (Gateway)
**Fichier**: `services/gateway/src/socketio/handlers/AuthHandler.ts:403-411`  
**Problème**: `_joinUserConversations()` charge TOUTES les conversations sans limite → OOM pour power users (1000+ convs).  
**Fix**: Paginer par lots de 100, émettre les joins en chunks.

### M5 — Fetches en cascade (Web)
**Fichier**: `apps/web/hooks/use-conversation-messages.ts:91-270`  
**Problème**: messages → traductions → réactions chargés séquentiellement. Pas de prefetch au survol.  
**Fix**: `Promise.all()` pour les fetches parallèles + `prefetchQuery` au hover sur ConversationItem.

### M6 — Boundaries Suspense manquantes (Web)
**Fichier**: `apps/web/app/` routes de chat  
**Problème**: Uniquement les routes admin utilisent Suspense. Contenu messages/pièces jointes non streamé.  
**Fix**: `<Suspense fallback={<MessageSkeleton />}>` sur composants de contenu.

### M7 — Strings i18n hardcodées (Web)
**Fichier**: `apps/web/components/common/messages-display.tsx:56-57`  
**Problème**: Textes en dur français (`"Aucun message pour le moment"`), hook i18n disponible mais sous-utilisé. Pas de support RTL.  
**Fix**: Passer tous les textes par le hook i18n existant.

### M8 — Race conditions navigation iOS
**Fichier**: `apps/ios/Meeshy/Features/Main/Navigation/Router.swift`  
**Problème**: Double-tap sur une conversation pousse deux fois. Pas de rate-limiting sur NavigationStack.  
**Fix**: Debounce 300ms sur les pushes de navigation.

### M9 — Cache invalidation non atomique (iOS)
**Fichier**: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:55-80`  
**Problème**: `_messageIdIndex` et `_cachedLastReceivedIndex` non effacés atomiquement avec les mutations de liste.  
**Fix**: Wraper les mutations dans un bloc `@MainActor` avec mise à jour atomique.

### M10 — Index MongoDB composites manquants (Shared)
**Fichier**: `packages/shared/prisma/schema.prisma`  
**Problème**: Requêtes fréquentes sur `(conversationId, createdAt)`, `(userId, createdAt)`, `(recipientId, isRead)` sans index composites.  
**Impact**: COLLSCAN sur millions de messages.  
**Fix**: Ajouter `@@index([conversationId, createdAt])` + `@@index([recipientId, isRead])` sur Message.

### M11 — Redis sans TTL/éviction (Infra)
**Fichier**: `infrastructure/` compose files  
**Problème**: Pas de `maxmemory`, pas de `maxmemory-policy` → Redis peut grossir sans limite.  
**Fix**: `REDIS_MAXMEMORY=256mb`, `maxmemory-policy=allkeys-lru`, TTL 5min sur cache auth.

### M12 — Headers Cache-Control manquants (Gateway)
**Fichier**: `services/gateway/src/routes/*`  
**Problème**: Routes GET lourdes (messages, profils, feed) sans `Cache-Control` ni `ETag`.  
**Fix**: Ajouter `Cache-Control: private, max-age=60` + ETag sur les routes read-heavy.

### M13 — URLSession non configuré (iOS + SDK)
**Fichier**: `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift:1-100`  
**Problème**: Pas de timeout explicite, pas de `multipathServiceType`, pas de `waitsForConnectivity`.  
**Fix**: `timeoutIntervalForRequest = 15`, `multipathServiceType = .handover`, `waitsForConnectivity = true`.

### M14 — CI/CD sans build incrémental (Infra)
**Problème**: Rebuild de tous les services sur tout changement monorepo. Pas de `DOCKER_BUILDKIT=1` + `--cache-from`.  
**Fix**: Layer caching Docker + détection de changement par service.

---

## FAIBLE PRIORITÉ

### L1 — Types ID non brandés (Shared)
`packages/shared/types/` — créer `UserId`, `ConversationId`, `MessageId` branded types.

### L2 — Base64 btoa/atob CPU (Shared)
`packages/shared/encryption/crypto-adapter.ts:122-159` — utiliser `Buffer.from()` côté Node, `libsodium` pour hachage >5MB.

### L3 — AVIF thumbnails (Translator)
`services/translator/src/services/attachments/thumbnail.ts` — variantes AVIF + `srcset` responsive (différé car AVIF indispo dans le container actuel).

### L4 — Audio base64 overhead +33% (Translator)
TTS encore en WAV avec base64 → migration vers Opus binaire différée à refactoring pipeline complet.

### L5 — APIs iOS 17/18 non exploitées
SwiftData pour cache local messages, PhaseAnimator pour transitions bulles, BGTaskScheduler amélioré iOS 17+.

---

## Gaps Concurrentiels (vs WhatsApp/Signal/Telegram)

| Feature | Meeshy | WhatsApp | Signal | Telegram |
|---------|--------|----------|--------|----------|
| Messages éphémères | ❌ | ✅ | ✅ | ✅ |
| Recherche full-text chiffrée | ❌ | ✅ | ❌ | ✅ |
| E2EE médias en transit | Partiel | ✅ | ✅ | Partiel |
| Offline-first sync complet | Partiel | ✅ | ✅ | ✅ |
| Réactions animées | ❌ | ✅ | ❌ | ✅ |
| Statut story multi-médias | ✅ | ✅ | ❌ | ✅ |
| Traduction automatique | ✅ (unique) | ❌ | ❌ | Partiel |
| Clonage vocal | ✅ (unique) | ❌ | ❌ | ❌ |

Différenciateurs Meeshy préservés. Combler les gaps éphémères + recherche = +++ rétention.
