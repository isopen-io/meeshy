# Notification Coherence — P1 Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empêcher les notifications push de fuiter du contenu protégé (E2EE, view-once, blur) et ajouter le badge count dans le payload push pour éviter le drift.

**Architecture:** 3 corrections chirurgicales côté gateway dans `MessageProcessor.triggerAllNotifications()` et `NotificationService`. Le contenu de la notification est sanitizé AVANT envoi : E2EE → message générique, view-once/blur → message générique, badge → count autoritaire ajouté au payload.

**Tech Stack:** TypeScript, Node.js, Fastify 5, Socket.IO, APNs/FCM

---

## Plan Review Checklist (vérifié AVANT implémentation)

| Check | Vérifié |
|-------|---------|
| `processedContent` est le plaintext passé aux notifications (lignes 800, 814, 849 de MessageProcessor.ts) | Oui |
| `message.isEncrypted` et `message.encryptionMode` disponibles dans le scope de `triggerAllNotifications` | Oui — `message: Message` est un paramètre |
| `message.isViewOnce`, `message.isBlurred`, `message.effectFlags` disponibles | À vérifier — le Prisma Message model les a |
| `payload.badge` est passé à APNs/FCM mais jamais défini (undefined) | Oui — ligne 360 de PushNotificationService |
| Le gateway tourne en TypeScript strict | Oui — CLAUDE.md confirme |
| Translation : notification envoyée en step 5 AVANT translation en step 8 | Oui — documenté comme known limitation |

## Limitation Documentée

**Les notifications ne montrent PAS le contenu traduit.** La traduction (NLLB-200 via ZMQ) est asynchrone et complète 200-2000ms APRÈS l'envoi de la notification. Modifier ce comportement nécessiterait de retarder la notification ou d'envoyer une mise à jour silencieuse — les deux approches ont des inconvénients majeurs (délai UX / complexité). C'est accepté comme limitation connue.

---

## File Map

| Fichier | Action | Responsabilité |
|---------|--------|----------------|
| `services/gateway/src/services/messaging/MessageProcessor.ts` | Modify | Sanitizer le messagePreview avant passage aux notifications |
| `services/gateway/src/services/notifications/NotificationService.ts` | Modify | Ajouter badge count au payload push |

---

### Task 1: Sanitizer le contenu des notifications pour E2EE, view-once et blur

Dans `MessageProcessor.triggerAllNotifications()`, le `processedContent` est passé tel quel comme `messagePreview` aux 3 types de notifications. Pour les messages protégés, il faut remplacer par un texte générique.

**Files:**
- Modify: `services/gateway/src/services/messaging/MessageProcessor.ts:710-860`

- [ ] **Step 1: Ajouter la sanitization du messagePreview**

Au DÉBUT de `triggerAllNotifications()` (après la ligne de signature, avant tout usage de `processedContent`), ajouter la logique de sanitization :

```typescript
// Sanitize notification preview for protected messages
let notificationPreview = processedContent;

// E2EE: never leak plaintext in push notifications
if (message.isEncrypted || message.encryptionMode === 'e2ee') {
  notificationPreview = '🔒 Message chiffré';
}

// View-once: content should only be seen in-app
if (message.isViewOnce) {
  notificationPreview = '📷 Message éphémère';
}

// Blurred: content is intentionally hidden
if (message.isBlurred || (message.effectFlags && (message.effectFlags & 0x02) !== 0)) {
  notificationPreview = '🔮 Message masqué';
}
```

Note : `effectFlags & 0x02` vérifie le bit `blurred` (valeur 2). Vérifier la valeur exacte dans `packages/shared/types/` ou le Prisma schema.

- [ ] **Step 2: Remplacer `processedContent` par `notificationPreview` dans les 3 appels**

Ligne ~800 (reply notification) :
```typescript
// BEFORE:
messagePreview: processedContent,
// AFTER:
messagePreview: notificationPreview,
```

Ligne ~814 (mention notification) :
```typescript
// BEFORE:
messageContent: processedContent,
// AFTER:
messageContent: notificationPreview,
```

Ligne ~849 (regular message notification) :
```typescript
// BEFORE:
messagePreview: processedContent,
// AFTER:
messagePreview: notificationPreview,
```

- [ ] **Step 3: Vérifier que `message.isEncrypted`, `message.isViewOnce`, `message.isBlurred` existent**

Le paramètre `message` est de type `Message` (Prisma). Vérifier dans le schema Prisma que ces champs existent :
- `isEncrypted Boolean @default(false)`
- `isViewOnce Boolean @default(false)`
- `isBlurred Boolean @default(false)`
- `effectFlags Int @default(0)`
- `encryptionMode String?`

Si `isViewOnce` ou `isBlurred` ne sont pas des champs directs, ils pourraient être dérivés de `effectFlags`. Vérifier et adapter.

- [ ] **Step 4: Vérifier build gateway**

Run: `cd /Users/smpceo/Documents/v2_meeshy/services/gateway && npx tsc --noEmit`
Ou : `cd /Users/smpceo/Documents/v2_meeshy && pnpm --filter gateway build`

- [ ] **Step 5: Commit**

```
fix(gateway): sanitize notification content for E2EE, view-once, and blur messages

Push notifications no longer leak plaintext for encrypted messages,
reveal view-once content, or expose blurred message content.
Generic placeholders are shown instead.
```

---

### Task 2: Ajouter le badge count au payload push

Le payload push ne contient pas de `badge` — le badge iOS ne se met à jour que via les silent pushes qui peuvent être throttled. Ajouter le count autoritaire.

**Files:**
- Modify: `services/gateway/src/services/notifications/NotificationService.ts`

- [ ] **Step 1: Calculer le unread count pour le recipient**

Dans `createMessageNotification()` ou dans la méthode qui appelle `pushService.sendToUser()`, ajouter le calcul du badge. Chercher comment `unreadCount` est calculé côté gateway — il y a probablement un `ConversationReadCursor` ou une méthode de service.

Trouver la méthode qui envoie le push (autour des lignes 373-396 de NotificationService.ts). Le `payload` object accepte un champ `badge: number`.

L'approche la plus simple : utiliser le count global d'unreads pour l'utilisateur. Chercher une méthode comme `getUnreadCountForUser(userId)` ou `MessageReadStatusService.getUnreadCounts()`.

Si une telle méthode n'existe pas facilement, ajouter `unreadCount` au `data` dict du push payload pour que le NSE iOS puisse le lire :

```typescript
data: {
  // ... existing fields
  unreadCount: String(unreadCount),  // NSE reads this
},
```

- [ ] **Step 2: Si aucun service de count global n'est facilement disponible, skip cette tâche**

Le badge count est un "nice to have" — la correction P0 du unreadCount spéculatif est plus impactante. Si le calcul du badge nécessite une query DB supplémentaire par notification (performance concern), documenter comme future improvement.

- [ ] **Step 3: Commit (si implémenté)**

```
feat(gateway): include unread badge count in push notification payload
```

---

## Verification

- [ ] Envoyer un message E2EE → la notification doit afficher "🔒 Message chiffré"
- [ ] Envoyer un message view-once → la notification doit afficher "📷 Message éphémère"
- [ ] Envoyer un message blur → la notification doit afficher "🔮 Message masqué"
- [ ] Envoyer un message normal → la notification affiche le contenu comme avant
