# Plan d'Implémentation — Itération 11 (2026-06-08)

**Référence :** `docs/routine/analyses/2026-06-08-iteration-11-analyse.md`
**Branche :** `claude/brave-archimedes-HGWPs-iter11`

---

## Phase A — `setInterval.unref?.()` sur 6 services

**Fichiers :**
- `services/gateway/src/services/EncryptionService.ts:409`
- `services/gateway/src/services/MaintenanceService.ts:96,102`
- `services/gateway/src/services/CallCleanupService.ts:61`
- `services/gateway/src/services/ExpiredStoriesCleanupService.ts:42`
- `services/gateway/src/services/StatusService.ts:379`
- `services/gateway/src/services/TusCleanupService.ts:11`

Ajouter `this.cleanupInterval.unref?.();` (ou équivalent) après chaque `setInterval` assignment.

**Impact :** Shutdown propre immédiat lors des rolling-deploys (SIGTERM → process.exit sans attendre le timer).

---

## Phase B — SocialEventsHandler : supprimer les casts `as any`

**Fichier :** `services/gateway/src/socketio/handlers/SocialEventsHandler.ts`

Remplacer :
```typescript
const visibility = (story as any).visibility ?? 'PUBLIC';
const visibilityUserIds = (story as any).visibilityUserIds ?? [];
logger.info(`... storyId=${(story as any).id} ...`);
```

Par :
```typescript
const visibility = story.visibility;
const visibilityUserIds = story.visibilityUserIds ?? [];
logger.info(`... storyId=${story.id} ...`);
```

Idem pour `post` et `status`. Supprimer les 9 occurrences `as any`.

Note : `story.visibility` est `PostVisibility` (non nullable), le `?? 'PUBLIC'` peut aussi être supprimé.

**Impact :** Type-safety restaurée sur le broadcast social — toute régression de type sera détectée à la compilation.

---

## Phase C — SocialEventsHandler : size cap `friendsCache`

**Fichier :** `services/gateway/src/socketio/handlers/SocialEventsHandler.ts`

Dans `getFriendIds`, avant `this.friendsCache.set(...)`, ajouter un guard :

```typescript
if (this.friendsCache.size >= 500) {
  const now = Date.now();
  for (const [k, v] of this.friendsCache) {
    if (v.expiresAt <= now) this.friendsCache.delete(k);
  }
  // Si toujours > 500 après purge TTL, supprimer la plus ancienne
  if (this.friendsCache.size >= 500) {
    this.friendsCache.delete(this.friendsCache.keys().next().value!);
  }
}
this.friendsCache.set(userId, { ids, expiresAt: Date.now() + this.FRIENDS_CACHE_TTL_MS });
```

**Impact :** Plafonne la mémoire du cache à ~500 entrées × (avg friends list size) — typiquement < 500KB.

---

## Statut

- [x] A — setInterval.unref?.() sur 6 services
- [x] B — Supprimer as any dans SocialEventsHandler
- [x] C — friendsCache size cap
