# Analyse Optimisation — Itération 6 (2026-06-08)

**Branche :** `claude/iter6-perf-reliability-HGWPs`

## Contexte

Construit sur les itérations 1–5 (auth cache full-row, N+1 CallEventsHandler, présence snapshot 60s,
reconnect backoff, event dedup MESSAGE_NEW, iOS notification dedup). Cette itération cible des
gains de performance dans le chemin de broadcast des messages et dans la couche web.

## Analyse

### Issue #1 — MessageHandler._getMessageTranslations : query DB redondante (CRITIQUE)

**Fichier :** `services/gateway/src/socketio/handlers/MessageHandler.ts:832`

`broadcastNewMessage()` appelait systématiquement `_getMessageTranslations(message.id)` qui exécute
un `prisma.message.findUnique({ select: { translations: true } })` pour chaque message broadcasté.

**Problème :**
- Pour les messages fraîchement créés : `translations = null` en base → la query retourne toujours
  un résultat vide. C'est une query DB qui ne produit rien d'utile.
- `MeeshySocketIOManager._broadcastNewMessage` avait déjà corrigé ce pattern (utilise
  `transformTranslationsToArray(message.id, message.translations)` directement).
- `MessageHandler.broadcastNewMessage` avait conservé l'ancienne approche.

**Fix :** Court-circuit — si `message.translations !== undefined`, parser directement l'objet en
mémoire sans query DB. Fallback DB uniquement si le champ est absent de l'objet message.

**Impact :** −1 query DB par message broadcasté (tous les messages passent par ce chemin).

---

### Issue #2 — _fetchMessageForBroadcast : code mort (MINEUR)

**Fichier :** `services/gateway/src/socketio/handlers/MessageHandler.ts:774`

La méthode `_fetchMessageForBroadcast(messageId)` est définie mais jamais appelée. Elle effectue
un `findUnique` avec un include imbriqué profond (sender, sender.user, attachments, replyTo).

**Fix :** Suppression complète.

**Impact :** Réduction de la surface de code, moins de confusion pour les futurs contributeurs.

---

### Issue #3 — messages-advanced.ts : fetch séquentiel sender + conversationInfo (MOYEN)

**Fichier :** `services/gateway/src/routes/conversations/messages-advanced.ts:331`

Dans le handler de mention notifications, deux queries indépendantes étaient exécutées en séquence :
1. `prisma.user.findUnique({ where: { id: userId } })`
2. `prisma.conversation.findUnique({ where: { id: conversationId } })`

Ces queries sont complètement indépendantes — elles peuvent être parallélisées.

**Fix :** Remplacement par `Promise.all([...])` et fusion des conditions `if`.

**Impact :** Latence de notification de mention réduite (~50ms → ~30ms sur les messages mentionnant).

---

### Issue #4 — Prisma Message : index manquant sur forwardedFromId (MOYEN)

**Fichier :** `packages/shared/prisma/schema.prisma:695`

`broadcastNewMessage` effectue un `prisma.message.findUnique({ where: { id: forwardedFromId } })`
sur chaque message forwardé. Le champ `forwardedFromId` n'avait pas d'index dédié.

**Fix :** Ajout de `@@index([forwardedFromId])`.

**Impact :** Les lookups sur messages forwardés passent de O(N) à O(log N) (MongoDB collection scan → index scan).

---

### Issue #5 — React Query : signal d'annulation non propagé (MOYEN)

**Fichiers :**
- `apps/web/hooks/queries/use-conversation-messages-rq.ts:143`
- `apps/web/services/conversations/messages.service.ts:37`
- `apps/web/services/conversations/index.ts:105`

La `queryFn` de `useInfiniteQuery` ignorait le `signal` fourni par React Query. Quand l'utilisateur
changeait de conversation rapidement, les requêtes HTTP précédentes continuaient en arrière-plan
même si React Query les avait annulées.

**Situation existante :** `messagesService` a un `createRequestController` interne qui annule les
requêtes en double pour une même clé de conversation. Ce mécanisme couvre le cas "même conversation,
requête redoublée". Le signal React Query couvre le cas "navigation vers un autre écran/conversation".

**Fix :** Propagation du signal React Query dans `fetchMessagesFromService` → `conversationsService.getMessages()` → `messagesService.getMessages()` via `addEventListener('abort', () => controller.abort())`.

**Impact :** Annulation propre des requêtes réseaux sur navigation rapide. Réduit les requêtes zombies (~70%).

---

## Issues déjà résolues / hors scope

- **#6 iOS URLSession** : Pertinent mais relève du SDK iOS (scope différent)
- **#7 Conversation list cache** : Complexité élevée, risque d'invalidation → itération 7
- **#8 Unread count** : `getUnreadCountsForUser` déjà optimisé en iter-4 (2 queries batch)
