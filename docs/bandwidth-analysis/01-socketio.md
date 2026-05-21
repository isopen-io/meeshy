# Analyse de Bande Passante Socket.IO — Meeshy

**Date :** 2026-05-21  
**Périmètre :** Gateway (Fastify/Socket.IO), Web (Next.js), iOS (Swift/MeeshySDK)

---

## Résumé exécutif

L'analyse identifie **18 problèmes** de consommation de bande passante dans le pipeline Socket.IO de Meeshy, allant de la compression totalement absente (critique) à des champs internes diffusés aux clients. Les problèmes les plus graves sont : (1) l'absence de `perMessageDeflate` — jusqu'à 60-70 % de réduction possible sur JSON répétitif ; (2) un payload `message:new` qui embarque les stats de conversation complètes (+ toutes les traductions) à chaque message ; (3) un `conversation:updated` émis individuellement pour chaque participant via N appels `io.to(userRoom)` en boucle (fan-out N×) ; (4) un `read-status:updated` déclenché par le gateway côté serveur *et* par le client web via REST en double ; (5) le champ `path` (chemin serveur interne) inclus dans les événements audio ; (6) les événements de typing sans throttling côté web. La correction des 4 premiers problèmes devrait réduire la bande passante de 50-70 % en charge normale.

---

## 1. Inventaire complet des événements Socket.IO

### 1.1 Événements Server → Client (`SERVER_EVENTS`)

| Événement | Déclencheur | Cible | Payload estimé |
|-----------|-------------|-------|----------------|
| `message:new` | Nouveau message | `ROOMS.conversation(id)` + `ROOMS.user(id)` | 2–15 KB |
| `message:edited` | Édition | `ROOMS.conversation(id)` | 2–15 KB |
| `message:deleted` | Suppression | `ROOMS.conversation(id)` | ~100 B |
| `message:translation` | Traduction texte prête | `ROOMS.conversation(id)` | 0.5–2 KB |
| `message:translated` | Alias traduction | `ROOMS.conversation(id)` | 0.5–2 KB |
| `message:pinned` | Épinglage | `ROOMS.conversation(id)` | ~150 B |
| `message:unpinned` | Dés-épinglage | `ROOMS.conversation(id)` | ~100 B |
| `message:consumed` | View-once consommé | `ROOMS.conversation(id)` | ~150 B |
| `message:pending-delivered` | Drain file offline | socket individuel | ~50 B |
| `typing:start` | Frappe | `ROOMS.conversation(id)` sauf sender | ~200 B |
| `typing:stop` | Arrêt frappe | `ROOMS.conversation(id)` sauf sender | ~200 B |
| `user:status` | Connexion/déconnexion | Toutes conversations du user | ~200 B |
| `presence:snapshot` | Auth socket | socket individuel | 1–50 KB |
| `conversation:new` | Création convo | `ROOMS.user(id)` de chaque participant | ~300 B |
| `conversation:joined` | Rejoint | `ROOMS.conversation(id)` | ~100 B |
| `conversation:left` | Quitte | `ROOMS.conversation(id)` | ~100 B |
| `conversation:join-error` | Accès refusé | socket individuel | ~150 B |
| `conversation:updated` | Nouveau message (bump) | `ROOMS.user(id)` × N participants | ~300 B × N |
| `conversation:unread-updated` | Compteur non lus | `ROOMS.user(id)` | ~100 B |
| `conversation:stats` | Stats | `ROOMS.conversation(id)` | ~500 B |
| `conversation:online-stats` | Stats en ligne | `ROOMS.conversation(id)` | ~500 B |
| `conversation:participant-left` | Quitte | `ROOMS.user(id)` | ~200 B |
| `conversation:participant-banned` | Bannissement | `ROOMS.user(id)` | ~200 B |
| `conversation:closed` | Fermeture | `ROOMS.conversation(id)` | ~150 B |
| `read-status:updated` | Lecture/livraison | `ROOMS.conversation(id)` + `ROOMS.user(id)` × N | ~300 B × N |
| `reaction:added` | Réaction | `ROOMS.conversation(id)` | ~400 B |
| `reaction:removed` | Suppression réaction | `ROOMS.conversation(id)` | ~400 B |
| `reaction:sync` | Sync réactions | socket individuel | ~500 B |
| `audio:translation-ready` | Traduction audio (1 langue) | `ROOMS.conversation(id)` | 1–5 KB |
| `audio:translations-progressive` | Traduction audio progressive | `ROOMS.conversation(id)` | 1–5 KB |
| `audio:translations-completed` | Dernière traduction audio | `ROOMS.conversation(id)` | 1–5 KB |
| `audio:transcription-ready` | Transcription prête | `ROOMS.conversation(id)` | 1–10 KB |
| `authenticated` | Auth | socket individuel | ~200 B |
| `notification:new` | Notification | `ROOMS.user(id)` | ~500 B |
| `notification:read` | Lu | `ROOMS.user(id)` | ~100 B |
| `notification:deleted` | Supprimé | `ROOMS.user(id)` | ~100 B |
| `notification:counts` | Compteurs | `ROOMS.user(id)` | ~100 B |
| `mention:created` | Mention | `ROOMS.user(id)` | ~300 B |
| `attachment-status:updated` | Action pièce jointe | `ROOMS.conversation(id)` | ~200 B |
| `participant:role-updated` | Rôle changé | `ROOMS.conversation(id)` | ~300 B |
| `location:shared` | Localisation partagée | `ROOMS.conversation(id)` | ~400 B |
| `location:live-started` | Live location start | `ROOMS.conversation(id)` | ~300 B |
| `location:live-updated` | Live location update | `ROOMS.conversation(id)` | ~300 B |
| `location:live-stopped` | Live location stop | `ROOMS.conversation(id)` | ~150 B |
| `post:created` | Post créé | `ROOMS.feed(id)` × amis | 2–20 KB |
| `post:updated` | Post modifié | `ROOMS.feed(id)` × amis | 2–20 KB |
| `post:deleted` | Post supprimé | `ROOMS.feed(id)` × amis | ~100 B |
| `post:liked` / `post:unliked` | Like/unlike | `ROOMS.feed(id)` × amis | ~300 B |
| `story:created` / `story:updated` | Story | `ROOMS.feed(id)` × amis filtrés | 2–30 KB |
| `user:preferences-updated` | Préfs mises à jour | `ROOMS.user(id)` | ~100 B |

### 1.2 Événements Client → Server

`message:send`, `message:send-with-attachments`, `message:edit`, `message:delete`, `conversation:join/leave`, `typing:start/stop`, `user:status`, `authenticate`, `translation:request`, `reaction:add/remove/request-sync`, tous les `call:*`, `location:*`, `feed:subscribe/unsubscribe`, `post:join/leave`, `comment:reaction-*`, `post:reaction-*`, `heartbeat`.

---

## 2. Problèmes identifiés — triés par sévérité

---

### CRITIQUE-01 — Pas de compression `perMessageDeflate`

**Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts` ligne 168–192

**Description :** La configuration Socket.IO ne mentionne pas `perMessageDeflate`. Par défaut Socket.IO active la compression WebSocket avec un seuil de 1024 octets — mais *uniquement* si le client et le serveur le négocient. Il n'y a aucune configuration explicite (ni activation forcée, ni paramétrage du niveau/seuil). On ne peut pas confirmer que la compression est active en production.

**Preuve :**
```typescript
this.io = new SocketIOServer<...>(httpServer, {
  path: "/socket.io/",
  transports: ["websocket", "polling"],
  cors: { ... },
  pingTimeout: 10000,
  pingInterval: 25000,
  connectTimeout: 45000,
  allowEIO3: true
  // ← perMessageDeflate ABSENT
});
```

**Taille gaspillée :** Les payloads JSON répétitifs (messages, traductions) se compressent à 30–40 % de leur taille originale. Sur 100k messages/s, l'économie théorique est de 60–70 % de la bande passante sortante.

**Sévérité :** CRITIQUE

**Correction :**
```typescript
this.io = new SocketIOServer<...>(httpServer, {
  // ...existant...
  perMessageDeflate: {
    threshold: 256,          // compresser dès 256B (défaut 1024B)
    zlibDeflateOptions: { level: 6 },
    zlibInflateOptions: { chunkSize: 10 * 1024 },
  }
});
```
Côté iOS `SocketConfig.swift`, vérifier que le client Socket.IO Swift accepte la compression (socket.io-client-swift gère automatiquement `permessage-deflate` si le serveur le propose).

---

### CRITIQUE-02 — Payload `message:new` surchargé : stats de conversation incluses

**Fichier :** `services/gateway/src/socketio/handlers/MessageHandler.ts` lignes 836–896 (`_buildMessagePayload`) et ligne 895

**Description :** Chaque événement `message:new` embarque `meta: { conversationStats: stats }` qui contient `messagesPerLanguage`, `participantsPerLanguage`, `participantCount`, `onlineUsers` (liste d'utilisateurs avec `id`, `username`, `firstName`, `lastName`). Ces stats sont recalculées et envoyées à TOUS les participants de la conversation pour CHAQUE message.

**Preuve :**
```typescript
return {
  // ... champs message ...
  meta: {
    conversationStats: stats  // ← ConversationStatsDTO entier
  }
};
```
`ConversationStatsDTO` contient `onlineUsers: ConversationOnlineUser[]` (chaque user avec `id`, `username`, `firstName`, `lastName`).

**Taille gaspillée :** Dans une conversation de 50 membres, ces stats ajoutent ~2 KB par message. Sur 100k messages/s : 200 MB/s de données inutiles.

**Sévérité :** CRITIQUE

**Correction :** Supprimer `meta.conversationStats` du payload `message:new`. Les stats de conversation doivent être gérées via un événement dédié `conversation:stats` émis seulement quand les stats changent significativement (toutes les 5 secondes max), pas à chaque message.

---

### CRITIQUE-03 — `conversation:updated` : fan-out N×, 1 requête DB par participant

**Fichier :** `services/gateway/src/socketio/handlers/MessageHandler.ts` lignes 578–599

**Description :** Pour chaque nouveau message, le serveur émet un `conversation:updated` vers `ROOMS.user(userId)` pour *chaque* participant actif de la conversation dans une boucle `for...of`. Deux problèmes :
1. Une requête Prisma `findMany` (participants) supplémentaire pour chaque message
2. N appels `io.to(...).emit(...)` en boucle au lieu d'un seul appel chaîné

**Preuve :**
```typescript
const participants = await this.prisma.participant.findMany({
  where: { conversationId: normalizedId, isActive: true },
  select: { userId: true }
});
// ...
for (const p of participants) {
  if (!p.userId) continue;
  this.io.to(ROOMS.user(p.userId)).emit(
    SERVER_EVENTS.CONVERSATION_UPDATED,
    updatePayload
  );
}
```

**Taille gaspillée :** Pour une conversation de 100 participants : 100 émissions distinctes au lieu de 1, et 1 requête DB supplémentaire par message.

**Sévérité :** CRITIQUE

**Correction :** Remplacer la boucle par un seul broadcast vers la `conversation room` :
```typescript
// ✅ Une seule émission
this.io.to(ROOMS.conversation(normalizedId)).emit(
  SERVER_EVENTS.CONVERSATION_UPDATED, updatePayload
);
```
Tous les membres dans la room reçoivent l'event. Pour les membres *hors* de la room conversation (qui n'ont pas joint via `conversation:join`), le `ROOMS.user` reste pertinent — mais le double broadcast actuel est redondant avec `message:new`.

---

### CRITIQUE-04 — Double marquage "delivered" : serveur ET client web REST

**Fichiers :**
- `services/gateway/src/socketio/handlers/MessageHandler.ts` lignes 628–701 (`_autoDeliverToOnlineRecipients`)
- `apps/web/hooks/queries/use-socket-cache-sync.ts` lignes 265–273
- `apps/web/services/socketio/messaging.service.ts` lignes 64–75

**Description :** Le gateway marque automatiquement les messages comme "delivered" pour tous les destinataires en ligne via `_autoDeliverToOnlineRecipients()` puis émet `read-status:updated`. Simultanément, le client web (et le service messaging) appellent `POST /conversations/:id/mark-as-received` en REST pour chaque message entrant d'un autre utilisateur. Cela génère une requête REST + un événement socket supplémentaires pour chaque message reçu.

**Preuve web :**
```typescript
// use-socket-cache-sync.ts:271
apiService.post(`/conversations/${message.conversationId}/mark-as-received`)

// messaging.service.ts:64-75
private markAsReceivedDebounced(conversationId: string): void {
  // ... debounce 500ms
  await conversationsService.markAsReceived(conversationId);
}
```

**Preuve gateway :** `_autoDeliverToOnlineRecipients` s'exécute pour chaque `broadcastNewMessage`.

**Taille gaspillée :** 1 requête HTTP REST + 1 événement socket `read-status:updated` inutile par message reçu, pour tous les clients web en ligne dans la conversation.

**Sévérité :** CRITIQUE

**Correction :** Supprimer le `mark-as-received` REST côté web puisque le gateway le fait déjà via `_autoDeliverToOnlineRecipients`. Le client web n'a besoin d'appeler `mark-as-received` que pour les messages déjà dans le cache (scroll dans l'historique), pas pour les messages reçus en temps réel.

---

### HAUTE-05 — Champ `path` (chemin serveur interne) dans les événements audio

**Fichier :** `packages/shared/types/socketio-events.ts` ligne 552 et `services/gateway/src/socketio/MeeshySocketIOManager.ts` ligne 1018

**Description :** Le type `AudioTranslationEventData` inclut `readonly path?: string` et le gateway l'inclut dans le payload :
```typescript
path: data.translatedAudio.path,  // MeeshySocketIOManager.ts:1018
```
Ce champ `path` est le chemin du fichier sur le système de fichiers du serveur (ex: `/tmp/meeshy-uploads/translated_xyz.mp3`). Il est inutile côté client (le client doit utiliser `url`), représente une fuite d'information sur l'infrastructure, et ajoute du poids inutile.

**Taille gaspillée :** ~50–100 B par événement audio. Information d'infrastructure exposée (risque sécurité).

**Sévérité :** HAUTE (sécurité + bande passante)

**Correction :** Supprimer `path` de `AudioTranslationEventData` dans `socketio-events.ts` et du payload dans `_broadcastTranslationEvent`. Seul `url` doit être envoyé.

---

### HAUTE-06 — `TranslationData` avec `cacheKey` exposé au client

**Fichier :** `packages/shared/types/socketio-events.ts` lignes 1213–1224

**Description :** Le type `TranslationData` (envoyé dans `message:translation` et `message:translated`) inclut :
- `cacheKey: string` — clé de cache interne (ex: `messageId_fr_en`)
- `cached: boolean` — information de debug interne
- `translationModel: string` — information de modèle interne

Ces champs sont des détails d'implémentation qui n'ont aucune utilité côté client final. Le web utilise `translationModel` uniquement pour un label UI conditionnel (`LanguageSelectionMessageView.tsx:191`), mais ce n'est pas une information critique.

**Taille gaspillée :** ~100–200 B par événement de traduction.

**Sévérité :** HAUTE

**Correction :** Supprimer `cacheKey` et `cached` du payload diffusé. Garder `translationModel` uniquement si l'UI en a besoin (à débattre) mais le renommer en quelque chose de plus user-facing comme `quality: 'basic' | 'medium' | 'premium'`.

---

### HAUTE-07 — `message:new` inclut TOUTES les traductions existantes

**Fichier :** `services/gateway/src/socketio/handlers/MessageHandler.ts` lignes 476–491 et `services/gateway/src/socketio/MeeshySocketIOManager.ts` lignes 1230–1262

**Description :** Avant chaque broadcast `message:new`, le gateway fait une requête `prisma.message.findUnique({ select: { translations: true } })` pour récupérer les traductions existantes du message, et les inclut dans le payload. Pour un message venant d'être créé, les traductions sont généralement vides ou en cours de génération, donc ce champ est presque toujours `[]`. Pour les messages édités ou broadcastés depuis le pipeline de traduction, ce champ peut contenir N traductions volumineuses.

**Preuve :**
```typescript
// MessageHandler.ts:476-491
const [translations, stats] = await Promise.allSettled([
  this._getMessageTranslations(message.id),  // ← DB query extra
  conversationStatsService.updateOnNewMessage(...)
]);
// ...
const messagePayload = this._buildMessagePayload(
  message, normalizedId,
  translations.status === 'fulfilled' ? translations.value : [],  // ← inclus dans payload
  ...
);
```

**Taille gaspillée :** Sur un message avec 5 traductions (60 langues × 500 chars = ~30 KB) émis à 100 participants : 3 MB pour un seul message. En pratique les traductions arrivent plus tard via `message:translation` — les inclure dans `message:new` est donc redondant.

**Sévérité :** HAUTE

**Correction :** Ne PAS inclure les traductions dans `message:new`. Elles arrivent ensuite via `message:translation` / `message:translated`. Le client doit merger les traductions à la réception de l'événement dédié (ce qu'il fait déjà via `handleTranslation` dans `use-socket-cache-sync.ts`).

---

### HAUTE-08 — `read-status:updated` fan-out excessif : N rooms enchaînées

**Fichiers :**
- `services/gateway/src/socketio/handlers/MessageHandler.ts` lignes 685–701
- `services/gateway/src/routes/message-read-status.ts` lignes 508–523
- `services/gateway/src/routes/messages.ts` ligne 594

**Description :** L'émission de `read-status:updated` enchaîne `io.to(convRoom).to(userRoom1).to(userRoom2)...` pour tous les participants. Socket.IO garantit la déduplication au niveau socket, mais ce pattern crée un objet de routing potentiellement très grand en mémoire pour les conversations larges. De plus, cet événement est émis à la fois par `_autoDeliverToOnlineRecipients` (à chaque message) ET par les routes REST (`mark-as-received`, `mark-as-read`). Pour chaque message dans une conversation de 50 membres, cela peut générer 50+ targets.

**Taille gaspillée :** Pour une conversation de 100 membres, ~300 B × 100 = 30 KB par message traité.

**Sévérité :** HAUTE

**Correction :** Émettre uniquement vers `ROOMS.conversation(id)`. Tous les clients qui ont joint cette room reçoivent l'événement. Pour les participants hors de la room (avec la conversation en arrière-plan), le compteur `unread-updated` suffit déjà pour mettre à jour leur UI.

---

### HAUTE-09 — `presence:snapshot` peut être volumineux (N contacts)

**Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts` lignes 373–436

**Description :** À chaque authentification socket, le gateway récupère TOUS les participants de TOUTES les conversations de l'utilisateur, déduplique par userId, et envoie un snapshot. Pour un utilisateur avec 100 conversations de 20 participants chacune (estimé ~200 contacts uniques), le snapshot contient 200 objets `{ userId, username, isOnline, lastActiveAt }`. Cela représente ~20 KB d'emblée à chaque connexion.

De plus, la requête Prisma inclut `lastActiveAt` des participants — une info potentiellement sensible selon les préférences de confidentialité.

**Taille gaspillée :** 5–50 KB par connexion selon le nombre de contacts. Sur 10k reconnexions/heure : 500 MB/h.

**Sévérité :** HAUTE

**Correction :** Paginer le snapshot ou le limiter aux contacts récemment actifs (dernières 24h). Envoyer seulement `{ userId, isOnline }` (sans `username` et `lastActiveAt` qui peuvent être obtenus par d'autres moyens).

---

### HAUTE-10 — Typing indicators : aucun throttling côté web

**Fichier :** `apps/web/services/socketio/typing.service.ts` lignes 122–138

**Description :** Le web envoie `typing:start` et `typing:stop` directement sans aucun throttling ni debouncing côté émetteur :
```typescript
startTyping(socket: TypedSocket | null, conversationId: string): void {
  socket.emit(CLIENT_EVENTS.TYPING_START, { conversationId }); // ← pas de throttle
}
```
Alors que côté iOS (`ConversationSocketHandler.swift`), un timer de ré-émission de 3 secondes existe (`typingReemitInterval: 3.0`), le web n'a aucune protection équivalente. Si le composant appelant `startTyping` est déclenché à chaque keystroke, cela génère un événement socket par touche.

**Taille gaspillée :** Un utilisateur tapant vite à 5 touches/seconde génère 5 events/seconde × ~200 B = 1 KB/s. Sur 1000 utilisateurs simultanés en train de taper : 1 MB/s de pure signalisation typing.

**Sévérité :** HAUTE

**Correction :**
```typescript
private lastTypingEmit = 0;
private static readonly TYPING_THROTTLE_MS = 2000;

startTyping(socket: TypedSocket | null, conversationId: string): void {
  const now = Date.now();
  if (now - this.lastTypingEmit < TypingService.TYPING_THROTTLE_MS) return;
  this.lastTypingEmit = now;
  socket.emit(CLIENT_EVENTS.TYPING_START, { conversationId });
}
```

---

### HAUTE-11 — `speakerAnalysis: Record<string, unknown>` dans `TranscriptionReadyEventData`

**Fichier :** `packages/shared/types/socketio-events.ts` ligne 606

**Description :** Le type `TranscriptionReadyEventData.transcription` inclut `speakerAnalysis?: Record<string, unknown>` — un objet non typé qui contient l'analyse détaillée des speakers (pitch, fréquences, caractéristiques vocales). Ces données sont potentiellement très volumineuses (plusieurs KB par locuteur) et sont des données de traitement interne. Elles ne devraient pas être diffusées à tous les clients de la conversation.

**Taille gaspillée :** 2–10 KB par événement de transcription selon le nombre de locuteurs.

**Sévérité :** HAUTE

**Correction :** Supprimer `speakerAnalysis` du payload Socket.IO. Cette donnée doit rester côté serveur ou être disponible via une API REST dédiée si l'UI en a besoin.

---

### MOYENNE-12 — `post:created` et `story:created` : objet `Post` complet diffusé

**Fichier :** `services/gateway/src/socketio/handlers/SocialEventsHandler.ts` lignes 150–196

**Description :** Les événements `post:created`, `post:updated`, `story:created`, `story:updated` envoient l'objet `Post` complet incluant : `reactions`, `reactionSummary`, `repostOf` (post imbriqué), `media` (tableau d'objets), `comments`, `storyEffects` (JSON complexe pour les stories). Une story avec effets peut peser 5–30 KB. Cet objet est diffusé à TOUS les amis de l'auteur.

**Taille gaspillée :** 5–30 KB × N amis par post/story. Pour un utilisateur avec 500 amis connectés : 15 MB par story publiée.

**Sévérité :** MOYENNE

**Correction :** Envoyer un payload minimal `{ postId, authorId, type, createdAt, previewText?, previewMediaUrl? }` et laisser les clients qui ouvrent le feed faire un GET REST pour le contenu complet.

---

### MOYENNE-13 — `_updateUnreadCounts` : N requêtes DB + N émissions par message

**Fichier :** `services/gateway/src/socketio/handlers/MessageHandler.ts` lignes 903–940

**Description :** Pour chaque message envoyé, `_updateUnreadCounts` fait une requête `getUnreadCount(participant.id, conversationId)` pour CHAQUE participant (sauf l'expéditeur), puis émet `conversation:unread-updated` vers `ROOMS.user(roomTarget)` individuel. Pour une conversation de 50 participants, cela génère 49 requêtes DB + 49 émissions socket.

En parallèle, `MeeshySocketIOManager._broadcastNewMessage` (lignes 1395–1446) fait exactement le même traitement, créant une duplication de cette logique entre les deux chemins.

**Taille gaspillée :** 49 requêtes DB + 49 émissions × ~100 B = 5 KB de overhead par message dans une conversation de 50 membres.

**Sévérité :** MOYENNE

**Correction :** Calculer les unread counts en batch (une seule requête agrégée) plutôt que N requêtes individuelles. Ou mieux : déduire le nouveau unreadCount côté client depuis le payload `message:new` (incrementer localement) et n'émettre `unread-updated` que pour les clients hors de la conversation room (hors vue).

---

### MOYENNE-14 — `authenticated` event : inclut `version` (non documenté dans le type)

**Fichier :** `services/gateway/src/socketio/handlers/AuthHandler.ts` lignes 146, 214, 273

**Description :** L'événement `authenticated` envoie `{ success, user, version }` où `user` est un objet simplifié `{ id, language, isAnonymous }`. Cela est bien léger. Cependant, le type `AuthenticatedEventData` dans `socketio-events.ts` définit `user?: SocketIOUser` — un objet MASSIF de 50+ champs (voir `SocketIOUser` lignes 1120–1200 incluant `failedLoginAttempts`, `lastLoginIp`, `lockedReason`, `signalIdentityKeyPublic`, etc.). Si un client envoyait son objet SocketIOUser complet, ce serait ~3-5 KB. L'implémentation actuelle n'envoie que `{ id, language, isAnonymous }` — mais le type suggère qu'on pourrait accidentellement envoyer plus.

**Taille gaspillée :** Risque latent plutôt qu'actif.

**Sévérité :** MOYENNE (risque de régression future)

**Correction :** Restreindre le type `AuthenticatedEventData.user` à un type minimal explicite, ou supprimer `user?: SocketIOUser` en faveur d'un type dédié `AuthenticatedUser`.

---

### MOYENNE-15 — Web : invalidation totale des conversations au `online` event

**Fichier :** `apps/web/hooks/queries/use-socket-cache-sync.ts` lignes 590–607

**Description :** La fonction `useInvalidateOnReconnect` invalide `queryKeys.conversations.all` et `queryKeys.notifications.all` à chaque événement `window.online`. Cela déclenche un re-fetch complet de la liste de conversations et des notifications à chaque reconnexion réseau, même si rien n'a changé. Pour un utilisateur avec 100 conversations et 50 notifications, cela représente 2 requêtes REST + le trafic de réponse (~50 KB chacune).

**Taille gaspillée :** 100 KB par reconnexion réseau. Sur mobile avec connexion instable : fréquent.

**Sévérité :** MOYENNE

**Correction :** N'invalider que les queries marquées `stale` (via `predicateInvalidation`) ou utiliser le timestamp de déconnexion pour ne demander que les changements depuis ce timestamp.

---

### MOYENNE-16 — iOS `syncMissedMessages` : re-fetch de 30 messages à chaque reconnexion

**Fichier :** `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` lignes 2336–2368

**Description :** À chaque reconnexion du socket (`didReconnect`), le handler iOS appelle `syncMissedMessages()` qui récupère les 30 derniers messages via REST (`messageService.list(..., offset: 0, limit: 30)`). Ce comportement est correct dans son principe, mais il s'exécute sans vérifier si la conversation est actuellement ouverte (active) ou en arrière-plan. Pour chaque conversation dont l'utilisateur a une instance `ConversationViewModel` ouverte, une requête REST de 30 messages est déclenchée.

Si l'utilisateur a 5 conversations actives (tabs background), 5 × 30 messages = 5 requêtes REST simultanées à la reconnexion.

**Taille gaspillée :** 5–10 requêtes REST de ~20 KB chacune = 100–200 KB par reconnexion.

**Sévérité :** MOYENNE

**Correction :** Passer un `since` timestamp à l'appel REST pour ne récupérer que les messages reçus pendant la déconnexion, plutôt que les 30 derniers :
```swift
messageService.list(conversationId: conversationId, since: lastMessageTimestamp, limit: 50)
```

---

### BASSE-17 — Logs de debug verbose en production dans `MeeshySocketIOManager`

**Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts` (92 appels logger) et `MessageHandler.ts` (7 appels `console.log` avec `[RT-DIAG]`)

**Description :** De nombreux `console.log` avec `[RT-DIAG]` et des `logger.info` avec logs détaillés (transcription textes, listes d'IDs) sont laissés actifs. Ces logs génèrent du traffic disque/mémoire serveur mais pas directement de bande passante socket. Néanmoins, ils ralentissent le gateway et augmentent indirectement la latence des émissions socket.

**Exemples :**
```typescript
logger.info(`📡 [SocketIOManager] Émission événement '${eventConstant}' vers room '${roomName}' (${clientCount} clients)`);
logger.info(`   📝 Texte: "${data.transcription.text?.substring(0, 100)}..."`);
console.log(`[RT-DIAG] message:new emitted conv=${normalizedId} msg=${message.id}...`);
```

**Sévérité :** BASSE

**Correction :** Conditionner les logs sur `process.env.NODE_ENV !== 'production'` ou sur un flag `LOG_LEVEL=debug`. Supprimer tous les `console.log` en faveur du logger structuré.

---

### BASSE-18 — `heartbeat` client : fréquence non contrôlée

**Fichier :** `packages/shared/types/socketio-events.ts` ligne 303 et `services/gateway/src/socketio/handlers/AuthHandler.ts` lignes 368–384

**Description :** L'événement `heartbeat` client déclenche une mise à jour `lastActiveAt` en DB et un `statusService.updateLastSeen`. Il n'y a pas de throttling côté serveur : si un client envoie des heartbeats trop fréquemment, chaque heartbeat génère une requête `prisma.user.update`. La fréquence recommandée devrait être de 30–60 secondes max. La config Socket.IO a `pingInterval: 25000` (25s) pour les pings WebSocket natifs — le heartbeat applicatif est redondant.

**Taille gaspillée :** Requêtes DB inutiles. L'événement lui-même est minimal (~50 B).

**Sévérité :** BASSE

**Correction :** Throttler `handleHeartbeat` côté serveur (une mise à jour DB max toutes les 30s par userId). Envisager de supprimer le heartbeat applicatif puisque les pings Socket.IO natifs (25s) suffisent pour détecter les déconnexions.

---

## 3. Tableau récapitulatif

| ID | Sévérité | Fichier(s) | Économie estimée |
|----|----------|-----------|-----------------|
| CRITIQUE-01 | CRITIQUE | `MeeshySocketIOManager.ts:168` | 60–70% bande passante totale |
| CRITIQUE-02 | CRITIQUE | `MessageHandler.ts:895` | 2 KB/message × 100k/s |
| CRITIQUE-03 | CRITIQUE | `MessageHandler.ts:578–599` | N requêtes DB par message |
| CRITIQUE-04 | CRITIQUE | `use-socket-cache-sync.ts:271`, `messaging.service.ts:64` | 1 REST call / message reçu |
| HAUTE-05 | HAUTE | `socketio-events.ts:552`, `MeeshySocketIOManager.ts:1018` | ~100 B/event audio + sécurité |
| HAUTE-06 | HAUTE | `socketio-events.ts:1219–1222` | ~200 B/event traduction |
| HAUTE-07 | HAUTE | `MessageHandler.ts:476–491` | 0–30 KB/message |
| HAUTE-08 | HAUTE | `MessageHandler.ts:685–701`, `message-read-status.ts:508` | 30 KB / message (conv 100) |
| HAUTE-09 | HAUTE | `MeeshySocketIOManager.ts:373–436` | 5–50 KB/connexion |
| HAUTE-10 | HAUTE | `typing.service.ts:122–138` | 1 KB/s/utilisateur actif |
| HAUTE-11 | HAUTE | `socketio-events.ts:606` | 2–10 KB/transcription |
| MOYENNE-12 | MOYENNE | `SocialEventsHandler.ts:150–196` | 5–30 KB × N amis |
| MOYENNE-13 | MOYENNE | `MessageHandler.ts:903–940` | 49 queries + 49 émissions |
| MOYENNE-14 | MOYENNE | `AuthHandler.ts:146`, `socketio-events.ts:1120` | Risque latent |
| MOYENNE-15 | MOYENNE | `use-socket-cache-sync.ts:590–607` | 100 KB/reconnexion |
| MOYENNE-16 | MOYENNE | `ConversationViewModel.swift:2336` | 100–200 KB/reconnexion iOS |
| BASSE-17 | BASSE | `MeeshySocketIOManager.ts`, `MessageHandler.ts` | Latence serveur |
| BASSE-18 | BASSE | `AuthHandler.ts:368` | Requêtes DB inutiles |

---

## 4. Plan d'action recommandé

### Priorité immédiate (sprint 1)
1. **CRITIQUE-01** : Activer `perMessageDeflate` — 1 ligne de config
2. **CRITIQUE-02** : Supprimer `meta.conversationStats` du payload `message:new`
3. **HAUTE-05** : Supprimer `path` du payload audio
4. **HAUTE-10** : Ajouter throttle de 2s dans `TypingService.startTyping()`

### Priorité haute (sprint 2)
5. **CRITIQUE-03** : Remplacer la boucle fan-out `conversation:updated` par un emit vers la conversation room
6. **CRITIQUE-04** : Supprimer le `mark-as-received` REST déclenché par `message:new` côté web
7. **HAUTE-07** : Ne pas inclure les traductions dans `message:new`
8. **HAUTE-08** : Simplifier `read-status:updated` vers la conversation room uniquement

### Priorité normale (sprint 3)
9. **HAUTE-06** : Nettoyer `TranslationData` (supprimer `cacheKey`, `cached`)
10. **HAUTE-09** : Réduire le `presence:snapshot` initial
11. **HAUTE-11** : Supprimer `speakerAnalysis` du payload socket
12. **MOYENNE-12** : Envoyer des payloads minimal pour `post:created`/`story:created`
13. **MOYENNE-13** : Batcher les requêtes unread counts
14. **MOYENNE-15** : Reconnexion web : invalidation sélective
15. **MOYENNE-16** : iOS reconnexion : utiliser `since` timestamp

---

## 5. Vérification : ce qui fonctionne bien

- **Rooms ciblées** : Les messages sont correctement broadcastés vers `ROOMS.conversation(id)` plutôt qu'en global broadcast.
- **Typing iOS throttlé** : `ConversationSocketHandler.swift` throttle à 3s.
- **Déduplication web** : `use-socket-cache-sync.ts` déduplique les messages par ID avant insertion.
- **Optimistic updates web** : Le client web met à jour son state local sans attendre une requête REST.
- **Offline queue** : `RedisDeliveryQueue` bufferise les messages pour les utilisateurs hors ligne — pas de re-fetch au reconnect.
- **User rooms multi-device** : `ROOMS.user(id)` correctement utilisé pour le multi-device.
- **Split payload sender/autres** : `broadcastNewMessage` supprime correctement `clientMessageId` pour les non-expéditeurs.
- **Social fan-out** : `SocialEventsHandler` utilise un cache 30s des IDs d'amis.
- **Ping/pong** : `pingInterval: 25000` / `pingTimeout: 10000` sont des valeurs raisonnables.
- **Stats de présence** : `_broadcastUserStatus` respecte les préférences privacy (`showOnlineStatus`, `showLastSeen`).
