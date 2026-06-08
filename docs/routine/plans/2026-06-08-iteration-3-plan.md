# Plan d'Implémentation — Itération 3 (2026-06-08)
> Basé sur analyse `docs/routine/analyses/2026-06-08-iteration-3-audit.md`
> Branche : `claude/brave-archimedes-uissi`

---

## Phase A — Gateway

### A1 — Fix N+1 dans links/creation.ts
**Fichier :** `services/gateway/src/routes/links/creation.ts:183-198`

Remplacer la boucle `for + await findUnique` par un `findMany` batch :

```typescript
// APRÈS
const memberUsers = await fastify.prisma.user.findMany({
  where: { id: { in: uniqueMemberIds } },
  select: { id: true, displayName: true, username: true }
});
const memberMap = new Map(memberUsers.map(u => [u.id, u]));
for (const memberId of uniqueMemberIds) {
  const memberUser = memberMap.get(memberId);
  if (memberUser) {
    participantsToCreate.push({
      userId: memberId,
      type: 'user',
      displayName: memberUser.displayName || memberUser.username || 'User',
      role: 'member',
      permissions: defaultPerms
    });
  }
}
```

### A2 — Fusionner les Promise.all du Dashboard
**Fichier :** `services/gateway/src/routes/admin/dashboard.ts:39-109`

Regrouper les 3 blocs `await Promise.all([...])` séquentiels en un seul :

```typescript
const [
  totalUsers, activeUsers, inactiveUsers, adminUsers,
  totalAnonymousUsers, activeAnonymousUsers, inactiveAnonymousUsers,
  totalMessages, totalCommunities, totalTranslations,
  totalShareLinks, activeShareLinks,
  totalReports, totalInvitations,
  newUsers, newConversations, newMessages, newAnonymousUsers
] = await Promise.all([
  // ... 18 counts en parallèle
]);
```

### A3 — Cache Redis 60s pour Dashboard
**Fichier :** `services/gateway/src/routes/admin/dashboard.ts`

Ajouter cache Redis avec TTL 60s :
```typescript
const cacheKey = 'admin:dashboard:stats';
const cached = await fastify.redis?.get(cacheKey);
if (cached) return reply.send(JSON.parse(cached));
// ... compute ...
await fastify.redis?.setex(cacheKey, 60, JSON.stringify(response));
```

---

## Phase B — Web Frontend

### B1 — Aligner staleTime sur Infinity
**Fichiers :**
- `apps/web/hooks/queries/use-message-status-details.ts:32`
- `apps/web/hooks/queries/use-conversation-preferences-query.ts:13,22`
- `apps/web/hooks/v2/use-settings-v2.ts:158`
- `apps/web/hooks/use-preferences.ts:145`

Changer `staleTime: 30_000` et `staleTime: 5 * 60 * 1000` → supprimer (héritage du global Infinity).

---

## Phase C — iOS

### C1 — Grouper @Published Audio Metadata
**Fichier :** `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:150-181`

Créer une struct `AudioMetadata` et remplacer les 5 `@Published` séparés par un seul.

```swift
struct AudioMetadata {
  var translations: [String: [MessageTranslation]] = [:]
  var transcriptions: [String: MessageTranscription] = [:]
  var transcriptionsByAttachment: [String: MessageTranscription] = [:]
  var translatedAudios: [String: [MessageTranslatedAudio]] = [:]
  var translatedAudiosByAttachment: [String: [MessageTranslatedAudio]] = [:]
}

@Published var audioMetadata: AudioMetadata = .init() {
  didSet {
    _mediaCaptionMap = nil
    _allAudioItems = nil
  }
}
```

Puis adapter tous les accès : `messageTranslations[id]` → `audioMetadata.translations[id]`.

---

## Checklist de Validation

- [ ] A1: `links/creation.ts` — plus de `for + await findUnique` per member
- [ ] A2: `dashboard.ts` — un seul `Promise.all` global
- [ ] A3: `dashboard.ts` — cache Redis 60s avec fallback gracieux
- [ ] B1/B2/B3: `staleTime` incohérents supprimés (héritage global Infinity)
- [ ] C1: `ConversationViewModel.swift` — 5 @Published → 1 `audioMetadata`
- [ ] Tests gateway : `pnpm test --filter=gateway`
- [ ] Build iOS : `./apps/ios/meeshy.sh build`
- [ ] Commit + push sur `claude/brave-archimedes-uissi`
- [ ] PR → merge dans main
