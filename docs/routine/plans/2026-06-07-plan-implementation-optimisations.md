# Plan d'Implémentation — Optimisations Globales Meeshy
**Date**: 2026-06-07  
**Basé sur**: `docs/routine/analyses/2026-06-07-analyse-optimisations-globales.md`  
**Branche de travail**: `claude/zen-albattani-O9cIm`

---

## Vue d'Ensemble des Phases

| Phase | Nom | Durée estimée | Impact |
|-------|-----|---------------|--------|
| **P1** | Quick Wins Gateway (critique) | 1-2h | −80% requêtes DB, −60% logs |
| **P2** | Broadcast per-language ON | 1h | −60% bande passante WS |
| **P3** | Indexes Prisma manquants | 30min | −30% query time MongoDB |
| **P4** | Translator — TTS cache + batch | 2-3h | +3× throughput TTS |
| **P5** | Web — Store split + Mermaid lazy | 2h | −25% re-renders web |
| **P6** | iOS — AnyView + CacheResult audit | 2-3h | UX fluidité iOS |

---

## Phase 1 — Quick Wins Gateway (CRITIQUE)

### P1.1 — Supprimer `console.log` diagnostique en production

**Fichier**: `services/gateway/src/socketio/handlers/MessageHandler.ts` ligne 952  
**Action**: Remplacer par `logger.debug(...)` conditionnel

### P1.2 — Batcher les requêtes `getUnreadCount`

**Fichier**: `services/gateway/src/socketio/handlers/MessageHandler.ts` lignes 937–953  
**Action**: 
1. Ajouter `getUnreadCounts(participantIds[], conversationId)` dans `MessageReadStatusService`
2. Un seul `findMany` MongoDB avec `groupBy` ou plusieurs `findUnique` en `Promise.all` avec une seule passe `updateMany`
3. Remplacer le `Promise.all(participants.map(async p => readStatusService.getUnreadCount(p.id, ...)))` par le batch

**Implémentation**:
```typescript
// MessageReadStatusService — nouvelle méthode
async getUnreadCounts(
  participantIds: string[],
  conversationId: string
): Promise<Map<string, number>> {
  const cursors = await this.prisma.conversationReadCursor.findMany({
    where: { participantId: { in: participantIds }, conversationId },
    select: { participantId: true, unreadCount: true }
  });
  const map = new Map(cursors.map(c => [c.participantId, c.unreadCount]));
  // Participants sans cursor = 0 (jamais lu)
  for (const id of participantIds) {
    if (!map.has(id)) map.set(id, 0);
  }
  return map;
}
```

```typescript
// MessageHandler — utiliser le batch
const unreadCounts = await readStatusService.getUnreadCounts(
  participants.map(p => p.id),
  conversationId
);
await Promise.all(participants.map(async (participant) => {
  const roomTarget = participant.userId ?? participant.id;
  const unreadCount = unreadCounts.get(participant.id) ?? 0;
  this.io.to(ROOMS.user(roomTarget)).emit(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, {
    conversationId,
    unreadCount
  });
}));
```

### P1.3 — Indexes Prisma composites (dans cette phase car 0 risque)

**Fichier**: `packages/shared/prisma/schema.prisma`  
**Action**: Ajouter les indexes manquants sur `Message`

---

## Phase 2 — Broadcast Per-Language (Feature flag → ON)

**Contexte**: Le commit `B1 — per-language message:new broadcast (flag-gated, OFF)` a implémenté la fonctionnalité mais l'a laissée désactivée par précaution.

**Action**:
1. Localiser le feature flag dans le gateway
2. Vérifier la compatibilité avec le client web et iOS (les clients doivent bien gérer un payload filtré)
3. Activer le flag par défaut (ou via env var `BROADCAST_PER_LANGUAGE=true`)
4. S'assurer que le fallback existe si `userLanguages` est vide (broadcast complet)

---

## Phase 3 — Indexes Prisma

**Fichier**: `packages/shared/prisma/schema.prisma`

```prisma
model Message {
  // Indexes existants OK, ajouter:
  @@index([conversationId, createdAt])  // lastMessages query
  @@index([senderId, conversationId])   // user's messages in conv
}

model User {
  // Ajouter:
  @@index([lastActiveAt])               // active users ranking
  @@index([systemLanguage])             // users by language
}
```

---

## Phase 4 — Translator Optimisations

### P4.1 — Cache TTS audio

**Fichier**: `services/translator/src/services/` (TTS service)  
**Action**: Wrapper Redis cache autour de `synthesize()`

```python
async def get_or_synthesize(text: str, voice_id: str, model: str) -> bytes:
    import hashlib
    key = f"audio:tts:{hashlib.sha256(f'{text}:{voice_id}:{model}'.encode()).hexdigest()}"
    cached = await redis_client.get(key)
    if cached:
        return base64.b64decode(cached)
    audio = await tts_engine.synthesize(text, voice_id, model)
    await redis_client.setex(key, 604800, base64.b64encode(audio).decode())
    return audio
```

### P4.2 — Cache voice fingerprint

**Action**: Mettre en cache le fingerprint computé par userId (TTL 90j)

### P4.3 — Chargement parallèle des modèles au démarrage

**Action**: Remplacer la boucle séquentielle par `asyncio.gather()`

---

## Phase 5 — Web Optimisations

### P5.1 — Lazy load Mermaid diagrams

**Fichier**: `apps/web/components/markdown/MermaidDiagram.tsx`  
**Action**: `dynamic(() => import('./MermaidDiagram'), { ssr: false })`

### P5.2 — Split `conversation-ui-store.ts`

**Action**:
1. Créer `apps/web/stores/typing-indicator-store.ts`
2. Créer `apps/web/stores/composer-state-store.ts`  
3. Créer `apps/web/stores/read-status-store.ts`
4. Migrer les champs correspondants
5. Mettre à jour les imports dans tous les composants consommateurs

---

## Phase 6 — iOS Optimisations

### P6.1 — Supprimer AnyView (10 fichiers)

**Action**: Remplacer `AnyView(...)` par `@ViewBuilder` dans:
- `ConversationView.swift`
- `StoryViewerView.swift` 
- `PostDetailView.swift`
- `FeedCommentsSheet.swift`
- 6 autres fichiers identifiés

### P6.2 — CacheResult dans ConversationListViewModel

**Action**: Auditer et corriger les ViewModels qui ne font pas de stale-while-revalidate

---

## Ordre d'Exécution (autonome)

```
P1.2 (batch unread counts) → P1.3 (indexes Prisma) → P1.1 (console.log)
→ P2 (per-language ON) → P4.1 (TTS cache) → P4.3 (parallel model load)
→ P5.1 (Mermaid lazy) → P5.2 (store split) → P6.1 (AnyView fix)
```

Les phases P1, P2, P3 sont gateway-only et peuvent être exécutées sans coordination cross-service.  
Les phases P4 sont translator-only.  
Les phases P5/P6 sont frontend-only.

---

## Tests de Non-Régression

Pour chaque phase:
1. Exécuter les tests unitaires du service modifié
2. Vérifier que les types TypeScript compilent sans erreur
3. Pour P1.2: vérifier que les unread counts sont corrects sur une conversation multi-participants
4. Pour P2: vérifier que les clients web et iOS affichent correctement les messages traduits

---

## Métriques de Succès

| Métrique | Avant | Cible |
|---------|-------|-------|
| Requêtes DB / message envoyé | N participants | 1 batch |
| Volume logs stdout/s | Élevé (console.log) | Réduit (-80%) |
| Taille payload WS message:new | ~15KB (10 langues) | ~3KB (langue cible) |
| Démarrage translator | ~20s | ~12s (-40%) |
| Cache hit rate TTS | 0% | >30% (textes répétés) |
| Bundle web (Mermaid) | +300KB initial | Lazy-loaded (0 initial) |
