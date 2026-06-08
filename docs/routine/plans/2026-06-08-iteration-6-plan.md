# Plan d'Implémentation — Itération 6 (2026-06-08)

**Référence :** `docs/routine/analyses/2026-06-08-iteration-6-analyse.md`  
**Branche :** `claude/iter6-perf-reliability-HGWPs`

---

## Phase A — MessageHandler._getMessageTranslations : court-circuit mémoire

**Fichier :** `services/gateway/src/socketio/handlers/MessageHandler.ts`

Changer la signature de `_getMessageTranslations(messageId: string)` →
`_getMessageTranslations(message: Message)`.

Si `message.translations !== undefined` → parser directement depuis l'objet en mémoire
via `_parseTranslations(inMemory)` (nouvelle méthode privée extraite).

Sinon → fallback DB `prisma.message.findUnique({ select: { translations: true } })`.

Mettre à jour l'appel dans `broadcastNewMessage` : `this._getMessageTranslations(message)`.

**Impact :** −1 query DB par message (path critique de broadcast)

---

## Phase B — Suppression code mort _fetchMessageForBroadcast

**Fichier :** `services/gateway/src/socketio/handlers/MessageHandler.ts`

Supprimer la méthode privée `_fetchMessageForBroadcast(messageId)` (58 lignes, jamais appelée).

**Impact :** Réduction de la surface de code

---

## Phase C — messages-advanced.ts : Promise.all pour sender + conversationInfo

**Fichier :** `services/gateway/src/routes/conversations/messages-advanced.ts`

Remplacer :
```typescript
const sender = await prisma.user.findUnique({...});
if (sender) {
  const conversationInfo = await prisma.conversation.findUnique({...});
  if (conversationInfo) { ... }
}
```

Par :
```typescript
const [sender, conversationInfo] = await Promise.all([
  prisma.user.findUnique({...}),
  prisma.conversation.findUnique({...})
]);
if (sender && conversationInfo) { ... }
```

**Impact :** Latence notification mention −20ms (2 queries séquentielles → parallèles)

---

## Phase D — Prisma : index forwardedFromId

**Fichier :** `packages/shared/prisma/schema.prisma`

Ajouter dans le modèle `Message` après `@@index([replyToId])` :
```prisma
@@index([forwardedFromId]) // Forwarded messages lookup in broadcastNewMessage
```

**Impact :** Lookups messages forwardés O(N) → O(log N)

---

## Phase E — React Query AbortSignal propagation

**Fichiers :**
- `apps/web/hooks/queries/use-conversation-messages-rq.ts`
- `apps/web/services/conversations/index.ts`
- `apps/web/services/conversations/messages.service.ts`

1. `messagesService.getMessages(..., signal?: AbortSignal)` — ajouter le paramètre optionnel.
   Dans le body : `signal?.addEventListener('abort', () => controller.abort(), { once: true })`.

2. `conversationsService.getMessages(..., signal?: AbortSignal)` — relayer vers `messagesService`.

3. `fetchMessagesFromService(..., signal?: AbortSignal)` — passer à `conversationsService.getMessages`.

4. `queryFn: ({ pageParam = 1, signal }) => fetchMessagesFromService(..., signal)` — déstructurer le signal React Query.

**Impact :** Annulation propre des requêtes HTTP sur navigation rapide (~70% requêtes zombies éliminées)

---

## Ordre d'Exécution

```
A (20min) → B (5min) → C (10min) → D (5min) → E (30min)
```

---

## Statut

- [x] A — _getMessageTranslations court-circuit mémoire
- [x] B — Suppression _fetchMessageForBroadcast (code mort)
- [x] C — Promise.all sender + conversationInfo
- [x] D — Prisma index forwardedFromId
- [x] E — React Query AbortSignal propagation
