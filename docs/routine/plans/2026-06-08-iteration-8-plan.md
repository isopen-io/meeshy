# Plan d'Implémentation — Itération 8 (2026-06-08)

**Référence :** `docs/routine/analyses/2026-06-08-iteration-8-analyse.md`
**Branche :** `claude/brave-archimedes-OnFYZ`

---

## Phase A — Type Safety : VoiceCharacteristics interface

**Fichier :** `packages/shared/types/attachment-transcription.ts`

Remplacer `readonly voiceCharacteristics?: any` par interface stricte `VoiceCharacteristics`
avec toutes les sous-structures documentées :

```typescript
export type VoiceCharacteristics = {
  readonly pitch?: {
    readonly mean_hz: number; readonly std_hz: number;
    readonly min_hz: number; readonly max_hz: number; readonly range_hz: number;
  };
  readonly classification?: {
    readonly voice_type: string;
    readonly estimated_gender?: string;
    readonly estimated_age_range?: string;
  };
  readonly spectral?: {
    readonly centroid_hz: number; readonly bandwidth_hz: number;
    readonly rolloff_hz: number; readonly flatness: number;
    readonly brightness: number; readonly warmth: number;
    readonly breathiness: number; readonly nasality: number;
  };
  readonly energy?: {
    readonly mean: number; readonly std: number;
    readonly dynamic_range_db: number; readonly silence_ratio: number;
  };
  readonly quality?: {
    readonly harmonics_to_noise: number;
    readonly jitter: number;
    readonly shimmer: number;
  };
  readonly prosody?: { readonly speech_rate_wpm: number };
  readonly mfcc?: { readonly mean: readonly number[]; readonly std: readonly number[] };
  readonly metadata?: {
    readonly sample_rate: number; readonly bit_depth: number;
    readonly channels: number; readonly codec: string;
    readonly duration_seconds: number; readonly analysis_time_ms: number;
    readonly confidence: number;
  };
};
```

Remplacer dans `SpeakerInfo`:
```typescript
readonly voiceCharacteristics?: VoiceCharacteristics;
```

**Impact :** Élimine 1 usage de `any` dans shared package, détection compile-time des
incompatibilités de schéma translator ↔ gateway ↔ frontend.

---

## Phase B — Rate Limiter : userId-keyed

**Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts`

Dans le handler `CLIENT_EVENTS.REQUEST_TRANSLATION` (ligne ~598) :
```typescript
// AVANT
const rateLimitKey = `translation_request:${socket.id}`;

// APRÈS
const userId = this.socketToUser.get(socket.id);
if (!userId) { socket.emit(SERVER_EVENTS.ERROR, { message: 'Not authenticated' }); return; }
const rateLimitKey = `translation_request:${userId}`;
```

Dans le handler `disconnect` (ligne ~736), cleanup ciblé :
```typescript
// AVANT
this.socketRateLimits.delete(`translation_request:${socket.id}`);

// APRÈS : ne supprimer que si c'est le dernier socket de cet user
const disconnectUserId = this.socketToUser.get(socket.id);
if (disconnectUserId) {
  const remainingSockets = this.userSockets.get(disconnectUserId) ?? new Set();
  // Retirer ce socket de userSockets AVANT de vérifier (déjà fait par authHandler.handleDisconnection)
  if (remainingSockets.size === 0) {
    this.socketRateLimits.delete(`translation_request:${disconnectUserId}`);
  }
}
```

**Impact :** Protection effective multi-device. Limite par user, non par socket.

---

## Phase C — Presence Snapshot Cache : invalidation disconnect

**Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts`

Dans le handler `disconnect` après `clearTypingThrottle` :
```typescript
if (disconnectedUserId) {
  this.statusHandler.invalidateIdentityCache(disconnectedUserId);
  this.statusHandler.clearTypingThrottle(disconnectedUserId);
  this.presenceSnapshotCache.delete(disconnectedUserId); // +1 ligne
}
```

**Impact :** Supprime les snapshots périmés. Reconnexion immédiate = snapshot frais
recomputed depuis DB. TTL 60s ne masque plus les transitions offline→online.

---

## Phase D — AuthHandler : console.* → logger

**Fichier :** `services/gateway/src/socketio/handlers/AuthHandler.ts`

1. Ajouter import logger : `import { enhancedLogger } from '../../utils/logger-enhanced.js';`
2. Créer instance : `const logger = enhancedLogger.child({ module: 'AuthHandler' });`
3. Remplacer tous les `console.warn(...)` → `logger.warn(...)`
4. Remplacer tous les `console.error(...)` → `logger.error(...)`
5. Remplacer tous les `console.log(...)` → `logger.info(...)`

**Impact :** PII redaction appliquée. Logs indexables dans ELK. Cohérence avec le reste
du codebase.

---

## Phase E — Web : Message Dedup TTL 30s → 5min

**Fichier :** `apps/web/services/socketio/messaging.service.ts`

Localiser le `setTimeout` de nettoyage `recentMessageIds` et changer `30_000` → `300_000`.

**Impact :** Élimination des doublons après reconnexion longue (> 30s).

---

## Phase F — Web : Typing Timeout Cleanup

**Fichier :** `apps/web/stores/conversation-ui-store.ts`

1. Ajouter `typingTimeouts: Map<string, ReturnType<typeof setTimeout>>` dans l'état du store
   (non-persisté, uniquement runtime)
2. Dans `addTypingUser` : clear le timeout existant pour la clé `${conversationId}:${userId}`
   avant d'en créer un nouveau
3. Dans `removeTypingUser` : delete la clé de `typingTimeouts`
4. Exposer `clearTypingTimeouts(conversationId)` pour nettoyage propre lors du changement
   de conversation

**Impact :** Zéro timeout orphelin en mémoire. Pas de mise à jour de store pour une
conversation non active.

---

## Statut

- [x] A — VoiceCharacteristics interface (packages/shared)
- [x] B — Rate limiter userId-keyed (gateway)
- [x] C — Presence snapshot cache invalidation (gateway)
- [x] D — AuthHandler logger (gateway)
- [x] E — Message dedup TTL (web)
- [x] F — Typing timeout cleanup (web)
