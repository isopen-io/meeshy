# Analyse Itération 3 — Meeshy Optimisation Globale
**Date :** 2026-06-08 (itération 3)
**Branche :** `claude/brave-archimedes-uissi`
**Base :** `main` (commit `fe4a75b` — uiux iter-2 mergé)

---

## 0. État des itérations précédentes

| Itération | Statut |
|-----------|--------|
| Iter-1 : MeeshyColors, Dynamic Type, i18n, a11y | ✅ MERGÉ |
| Iter-2 perf : N+1 unread fix, socket callbacks, ringtone, iOS threading | ✅ MERGÉ |
| Iter-2 uiux : i18n video-calls, iOS attachment labels | ✅ MERGÉ |

---

## 1. Bugs & Inefficiences Confirmés

### 1.1 N+1 Séquentiel dans Création de Conversation — IMPORTANT
**Fichier :** `services/gateway/src/routes/links/creation.ts:183-198`

```typescript
// AVANT — 1 requête par membre (bloquant et séquentiel)
for (const memberId of uniqueMemberIds) {
  const memberUser = await fastify.prisma.user.findUnique({ // ← loop await!
    where: { id: memberId },
    select: { id: true, displayName: true, username: true }
  });
}
```
Pour une conversation à 10 membres = 11 requêtes DB séquentielles (1 creator + 10 members).
**Fix :** Un seul `findMany` + Map.

---

### 1.2 Dashboard Admin — Promise.all Fragmenté — MINEUR → IMPORTANT
**Fichier :** `services/gateway/src/routes/admin/dashboard.ts:39-109`

Trois blocs `await Promise.all([...])` distincts exécutés en séquence (3 roundtrips MongoDB).  
Total : 16 requêtes count → 3 roundtrips au lieu de 1.
**Fix :** Fusionner en un seul `Promise.all` de 16 opérations.

---

### 1.3 staleTime Incohérent — Hooks Webs — MINEUR
**Fichiers :**
- `apps/web/hooks/queries/use-message-status-details.ts:32` → `staleTime: 30_000`
- `apps/web/hooks/queries/use-conversation-preferences-query.ts:13,22` → `staleTime: 5 * 60 * 1000`
- `apps/web/hooks/v2/use-settings-v2.ts:158` → `staleTime: 5 * 60 * 1000`
- `apps/web/hooks/use-preferences.ts:145` → `staleTime: 5 * 60 * 1000`

Selon CLAUDE.md : _"staleTime: Infinity — Socket.IO is primary source of truth"_.  
Ces hooks sur-activent des refetches HTTP alors que Socket.IO gère les mises à jour.  
**Fix :** `staleTime: Infinity` partout (Socket.IO invalide le cache sur mutation).

---

### 1.4 iOS — Cascade de @Published pour Audio Metadata — IMPORTANT
**Fichier :** `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:150-181`

5 `@Published` séparés avec `didSet` invalidant des caches :
```swift
@Published var messageTranslations: [String: [MessageTranslation]] = [:] { didSet { _mediaCaptionMap = nil } }
@Published var messageTranscriptions: [String: MessageTranscription] = [:] { didSet { _allAudioItems = nil } }
@Published var messageTranscriptionsByAttachment: [String: MessageTranscription] = [:] { ... }
@Published var messageTranslatedAudios: [String: [MessageTranslatedAudio]] = [:] { didSet { _allAudioItems = nil } }
@Published var messageTranslatedAudiosByAttachment: [String: [MessageTranslatedAudio]] = [:] { ... }
```
À chaque message audio entrant : jusqu'à 5 publications SwiftUI distinctes → 5 évaluations du view graph.

**Fix :** Regrouper en une struct `AudioMetadata` avec un seul `@Published` (1 publication atomique).

---

### 1.5 Feed Query — refetchOnWindowFocus Globalement 'always' — MINEUR
**Fichier :** `apps/web/lib/react-query/query-client.ts:25`

`refetchOnWindowFocus: 'always'` appliqué à TOUTES les queries (global default).  
Pour les queries de preferences/settings/status qui ont `staleTime: 5min` : à chaque `Alt+Tab` → refetch HTTP inutile.  
**Fix :** Aligner sur `staleTime: Infinity` résout le problème (Infinity + 'always' = refetch uniquement si stale, ce qui n'arrive jamais).

---

## 2. Couverture Fonctionnelle vs Concurrents

### Lacunes identifiées vs Telegram/WhatsApp/Signal

| Feature | WhatsApp | Telegram | Signal | Meeshy |
|---------|----------|----------|--------|--------|
| Message épinglé dans conversation | ✅ | ✅ | ✅ | ❓ |
| Transfert de message | ✅ | ✅ | ✅ | ❓ |
| Programmation de message | ✅ | ✅ | ❌ | ❓ |
| Réponse inline (reply bubble) | ✅ | ✅ | ✅ | ❓ |
| Mention @utilisateur avec preview | ✅ | ✅ | ✅ | ❓ |
| Recherche full-text in-conversation | ✅ | ✅ | ✅ | ❓ |

> Ces features n'ont pas été vérifiées dans le code — elles peuvent exister. À valider dans l'itération 4+.

---

## 3. Architecture — Points de Fluidité

### 3.1 Admin Dashboard Sans Cache Redis
L'endpoint `/api/admin/dashboard` exécute 16 requêtes count à chaque appel, sans aucun cache Redis.  
Pour un dashboard admin consulté fréquemment, ces stats acceptent une fraîcheur de 60s.  
**Fix :** Cache Redis 60s avec invalidation sur mutations critiques.

### 3.2 Mobile — iOS @MainActor Granularité
Certaines mises à jour audio dans `ConversationViewModel` mélangent `.task {}` (MainActor) et `Task.detached`.  
Bien que `Task.detached` ait été remplacé en iter-2 pour `CallManager`, d'autres usages subsistent potentiellement.

---

## 4. Récapitulatif Priorités

| ID | Fichier | Problème | Impact | Effort |
|----|---------|---------|--------|--------|
| A1 | links/creation.ts:183-198 | N+1 loop sequential | IMPORTANT | 15 min |
| A2 | admin/dashboard.ts:39-109 | Promise.all fragmenté (3 roundtrips) | IMPORTANT | 10 min |
| A3 | admin/dashboard.ts | Cache Redis 60s | IMPORTANT | 20 min |
| B1 | use-message-status-details.ts:32 | staleTime: 30_000 → Infinity | MINEUR | 5 min |
| B2 | use-conversation-preferences-query.ts | staleTime: 5min → Infinity | MINEUR | 5 min |
| B3 | use-settings-v2.ts + use-preferences.ts | staleTime: 5min → Infinity | MINEUR | 5 min |
| C1 | ConversationViewModel.swift:150-181 | 5 @Published → 1 AudioMetadata struct | IMPORTANT | 45 min |
