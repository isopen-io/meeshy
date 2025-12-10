# Migration des Types Video-Call vers /shared Root

**Date**: October 28, 2025
**Status**: ✅ **COMPLETED**
**Commit**: `aebb1898`

---

## 🎯 Objectif

Centraliser tous les types TypeScript liés aux appels vidéo dans `/shared/types/` à la racine du monorepo pour assurer un **typage fort partagé automatiquement** entre frontend, gateway et translator.

---

## ✅ Ce qui a été fait

### 1. Création de `/shared/types/video-call.ts`

Fichier central contenant TOUS les types liés aux appels vidéo:

**Modèles de données (alignés avec Prisma):**
- `CallSession` - Session d'appel
- `CallParticipant` - Participant dans un appel
- `Transcription` - Transcription audio→texte (Phase 2)
- `Translation` - Traduction de transcription (Phase 3)

**État frontend:**
- `CallState` - État Zustand store
- `CallControls` - Contrôles média (mute, video, screen share)
- `ConnectionQuality` - Qualité WebRTC

**Socket.IO Events:**
- `CallInitiateEvent` - Client → Server
- `CallInitiatedEvent` - Server → Client
- `CallJoinEvent`, `CallParticipantJoinedEvent`
- `CallSignalEvent` (WebRTC signaling)
- ... et 10+ autres événements

**WebRTC:**
- `WebRTCSignal` - SDP offer/answer/ICE
- Type guards: `isActiveCall()`, `isP2PCall()`, `determineCallMode()`

**Erreurs:**
- `CallError`
- `CALL_ERROR_CODES` (14 codes d'erreur)

**Types:**
- `CallMode` = 'p2p' | 'sfu'
- `CallStatus` = 'initiated' | 'ringing' | 'active' | 'ended'
- `ParticipantRole` = 'initiator' | 'participant'
- `TranscriptionSource` = 'client' | 'server'

### 2. Export depuis `/shared/types/index.ts`

Ajout de:
```typescript
// Export des types unifiés Phase 6 - Video Calls
export * from './video-call';
```

### 3. Build Package @meeshy/shared

```bash
cd shared
pnpm install
pnpm build
# ✅ Build successful
```

Le package est maintenant distribué automatiquement dans:
- `frontend/node_modules/@meeshy/shared`
- `gateway/node_modules/@meeshy/shared`
- `translator/node_modules/@meeshy/shared`

---

## 📊 Statistiques

- **Fichier**: `shared/types/video-call.ts`
- **Lignes**: 442 lignes
- **Types exportés**: 30+ interfaces/types
- **Constantes**: 2 (CALL_EVENTS, CALL_ERROR_CODES)
- **Fonctions utilitaires**: 4 type guards

---

## 🔧 Utilisation

### Frontend

```typescript
// Avant (INCORRECT)
import type { CallSession } from '@/shared/types/video-call';

// Après (CORRECT)
import type {
  CallSession,
  CallParticipant,
  CallInitiateEvent,
  CALL_EVENTS
} from '@meeshy/shared';
```

### Gateway

```typescript
// Avant (INCORRECT)
import type { CallSession } from '../shared/types/video-call';

// Après (CORRECT)
import type {
  CallSession,
  CallParticipant,
  CallSignalEvent,
  CALL_ERROR_CODES
} from '@meeshy/shared';
```

### Avantages

1. **Single Source of Truth** - Un seul fichier pour tous les types
2. **Typage Fort** - TypeScript compile avec types partagés
3. **Auto-Sync** - Build package distribue automatiquement
4. **No Duplication** - Évite copie de types dans chaque service
5. **Refactoring Safe** - Modifier un type = mise à jour partout

---

## 🗂️ Structure Finale

```
/shared/ (package @meeshy/shared)
├── types/
│   ├── index.ts (export central)
│   ├── video-call.ts ⭐ NEW
│   ├── conversation.ts
│   ├── messaging.ts
│   ├── user.ts
│   └── ... (autres types)
├── utils/
├── client/ (Prisma generated)
├── package.json
└── tsconfig.json
```

**Build Output:**
```
/shared/dist/
├── index.js
├── index.d.ts
├── video-call.d.ts ⭐
└── ... (autres .d.ts)
```

**Distribution Automatique:**
```
/frontend/node_modules/@meeshy/shared/dist/
/gateway/node_modules/@meeshy/shared/dist/
/translator/node_modules/@meeshy/shared/dist/
```

---

## ✅ Prochaines Étapes

### 1. Mettre à jour les imports existants

Chercher et remplacer dans tout le codebase:

```bash
# Frontend
find frontend -name "*.ts" -o -name "*.tsx" | xargs sed -i '' 's/@shared\/types\/video-call/@meeshy\/shared/g'
find frontend -name "*.ts" -o -name "*.tsx" | xargs sed -i '' 's/@\/shared\/types\/video-call/@meeshy\/shared/g'

# Gateway
find gateway/src -name "*.ts" | xargs sed -i '' 's/..\/shared\/types\/video-call/@meeshy\/shared/g'
```

### 2. Supprimer les anciens fichiers (si ils existent)

```bash
# Ces fichiers ne devraient plus exister
rm -f frontend/shared/types/video-call.ts
rm -f gateway/shared/types/video-call.ts
```

### 3. Rebuild tout

```bash
# Rebuild shared (déjà fait ✅)
cd shared && pnpm build

# Rebuild frontend
cd frontend && pnpm build

# Rebuild gateway
cd gateway && pnpm build
```

---

## 🎯 Vérification

Pour vérifier que tout fonctionne:

```typescript
// Dans n'importe quel fichier frontend/gateway
import { CallSession, CALL_EVENTS } from '@meeshy/shared';

const session: CallSession = {
  id: '123',
  conversationId: '456',
  mode: 'p2p',
  status: 'active',
  // ... TypeScript autocomplete fonctionne ✅
};

console.log(CALL_EVENTS.INITIATE); // 'call:initiate' ✅
```

Si TypeScript ne trouve pas les types:
```bash
# Réinstaller les dépendances
cd frontend && pnpm install
cd gateway && pnpm install
```

---

## 📝 Notes Importantes

1. **Ne JAMAIS dupliquer les types** - Toujours importer depuis `@meeshy/shared`
2. **Rebuild shared après modifications** - `cd shared && pnpm build`
3. **Frontend/Gateway auto-sync** - pnpm workspace link automatique
4. **Schema Prisma séparé** - Types TS dans `/shared/types/`, schema dans `gateway/shared/prisma/`

---

## ✅ Commit

```
refactor(shared): centralize video-call types in /shared root

Move video-call TypeScript types to @meeshy/shared package:
- Create shared/types/video-call.ts with all call-related types
- Export from shared/types/index.ts
- Strong typing shared between frontend, gateway, translator
- Auto-distributed via build system

Build: ✅ pnpm build successful
```

**Branche**: `feature/video-calls-base`
**Commit**: `aebb1898`
**Status**: ✅ Pushed to remote

---

🎉 **Migration Complète!** Les types video-call sont maintenant centralisés et partagés automatiquement dans tout le monorepo.
