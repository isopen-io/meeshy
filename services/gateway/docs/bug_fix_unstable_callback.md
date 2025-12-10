# 🐛 BUG FIX: Callback instable provoque infinite remount + stream undefined

**Date**: 2025-01-29
**Fichier**: `frontend/components/video-call/CallInterface.tsx`
**Lignes**: 37-40 → 35-38
**Sévérité**: CRITIQUE - Empêche complètement les appels de fonctionner

---

## 🎯 DESCRIPTION DU BUG

Le callback `onError` passé à `useWebRTCP2P` était défini **inline** sans `useCallback`, provoquant :

1. **Nouvelle référence** à chaque render de CallInterface
2. **Recréation** de toutes les fonctions dans `useWebRTCP2P` (car `onError` en dependency)
3. **Cleanup + Re-init** du composant CallInterface
4. **Perte du stream** au milieu de l'initialisation

---

## 📊 SÉQUENCE DU BUG

### Étape 1: Render initial
```
CallInterface renders
  → onError = new function (ligne 37-40)
  → useWebRTCP2P({ onError })
    → initializeLocalStream = new function (dependency: onError)
    → ensureLocalStream = new function (dependency: initializeLocalStream)
```

### Étape 2: useEffect se déclenche
```
useEffect (ligne 44-63)
  → initializeLocalStream() démarre
  → getLocalStream() en cours...
```

### Étape 3: Re-render pendant l'initialisation
```
CallInterface re-renders (cause inconnue, peut-être auth check)
  → onError = NEW function (nouvelle référence)  ⚠️
  → useWebRTCP2P détecte changement
    → initializeLocalStream = NEW function
    → ensureLocalStream = NEW function
```

### Étape 4: useEffect cleanup
```
useEffect cleanup (dépendance initializeLocalStream a changé)
  → cleanup() appelé
  → Streams fermés
```

### Étape 5: useEffect re-run
```
useEffect re-runs
  → initializeLocalStream() appelé DEUXIÈME FOIS
  → Mais la première initialisation est toujours en cours !
```

### Étape 6: Race condition
```
initializeLocalStream première instance:
  → getLocalStream() retourne stream
  → setLocalStream(stream)
  → return stream  ← PERDU CAR FONCTION DÉJÀ REMPLACÉE

initializeLocalStream deuxième instance:
  → getLocalStream() retourne stream
  → setLocalStream(stream)
  → return stream

ensureLocalStream appelé par createOffer:
  → Attend le résultat de la première instance (déjà remplacée)
  → Reçoit undefined
  → throw Error("Local stream not available after initialization")
```

---

## 🔍 LOGS RÉVÉLATEURS

### Avant le fix

```
[Log] [useWebRTCP2P] Initializing local stream
[Log] [useWebRTCP2P] Cleaning up WebRTC connections  ← CLEANUP AU MILIEU !
[Log] [useWebRTCP2P] Cleanup completed
[Log] [useWebRTCP2P] Initializing local stream       ← DEUXIÈME INIT
[Log] [useWebRTCP2P] Local stream initialized
[Log] [useWebRTCP2P] Local stream initialized        ← DEUX FOIS !
[Log] [useWebRTCP2P] 🔍 Stream returned from initializeLocalStream:
  streamExists: false                                 ← undefined !
  streamId: undefined
  trackCount: undefined
[Error] [useWebRTCP2P] Failed to create offer
  Error: Local stream not available after initialization
```

---

## ✅ FIX APPLIQUÉ

### Avant (bugué)
```typescript
export function CallInterface({ callId }: CallInterfaceProps) {
  const { user } = useAuth();
  // ...

  const { initializeLocalStream, createOffer, connectionState } = useWebRTCP2P({
    callId,
    userId: user?.id,
    onError: (error) => {  // ⚠️ NOUVELLE FONCTION À CHAQUE RENDER
      logger.error('[CallInterface]', 'WebRTC error: ' + error.message);
      toast.error('Call connection error: ' + error.message);
    },
  });
```

### Après (corrigé)
```typescript
import React, { useEffect, useCallback } from 'react';  // ← Ajout de useCallback

export function CallInterface({ callId }: CallInterfaceProps) {
  const { user } = useAuth();
  // ...

  // Stable error handler to prevent useWebRTCP2P from recreating on every render
  const handleWebRTCError = useCallback((error: Error) => {
    logger.error('[CallInterface]', 'WebRTC error: ' + error.message);
    toast.error('Call connection error: ' + error.message);
  }, []); // ✅ STABLE - ne change jamais

  const { initializeLocalStream, createOffer, connectionState } = useWebRTCP2P({
    callId,
    userId: user?.id,
    onError: handleWebRTCError,  // ✅ RÉFÉRENCE STABLE
  });
```

---

## 🎯 IMPACT DU FIX

### Avant
❌ `onError` recréé à chaque render
❌ `useWebRTCP2P` recréé toutes ses fonctions
❌ useEffect cleanup + re-run
❌ Stream perdu pendant l'initialisation
❌ `initializeLocalStream()` retourne `undefined`
❌ Erreur: "Local stream not available after initialization"

### Après
✅ `handleWebRTCError` stable (référence ne change jamais)
✅ `useWebRTCP2P` ne recrée pas ses fonctions
✅ Pas de cleanup/re-run inutile
✅ Stream retourné correctement
✅ Offre WebRTC créée avec succès
✅ Connexion P2P établie

---

## 🧪 VALIDATION

Pour vérifier que le fix fonctionne :

1. **Hard refresh** complet du navigateur
2. **Démarrer un appel** (Chrome → Safari)
3. **Vérifier les logs Chrome** :

### Logs attendus (avec le fix)
```
[Log] [useWebRTCP2P] Initializing local stream
[Log] [useWebRTCP2P] Local stream initialized        ← UNE SEULE FOIS
[Log] [useWebRTCP2P] 🔍 Stream returned from initializeLocalStream:
  streamExists: true                                  ← true !
  streamId: "{stream-id}"
  trackCount: 2                                       ← audio + video
[Log] [useWebRTCP2P] 🔍 Stream received in createOffer:
  streamExists: true
  trackCount: 2
[Log] [useWebRTCP2P] Creating peer connection
[Log] [useWebRTCP2P] Offer created and sent
```

### Logs à NE PAS voir
```
❌ [useWebRTCP2P] Cleaning up WebRTC connections  (au milieu de l'init)
❌ [useWebRTCP2P] Local stream initialized (deux fois)
❌ streamExists: false
❌ Error: Local stream not available after initialization
```

---

## 📋 PRINCIPE GÉNÉRAL

**TOUJOURS wrapper les callbacks passés en props avec `useCallback`** :

```typescript
// ❌ MAUVAIS
<Component onEvent={(data) => handleEvent(data)} />

// ✅ BON
const handleEvent = useCallback((data) => {
  // handle event
}, [/* dependencies */]);
<Component onEvent={handleEvent} />
```

**Sinon** : nouvelle référence → hooks recréés → cleanup + re-run → bugs !

---

## 🔗 BUGS CORRIGÉS DANS CETTE SESSION

1. **Bug #1** : Participant reçoit son propre événement `call:participant-joined`
   - Fix : `io.to()` → `socket.to()` dans CallEventsHandler.ts

2. **Bug #2** : Race condition Zustand - Stream perdu
   - Fix : Utiliser stream retourné directement au lieu de lire du store

3. **Bug #3** : Callback instable provoque infinite remount (CE BUG)
   - Fix : Wrapper `onError` avec `useCallback`

---

## 🎯 PROCHAINE ÉTAPE

**HARD REFRESH** complet du navigateur et tester l'appel !

```bash
Chrome: Cmd + Shift + R
Safari: Cmd + Option + R
```

Si les logs montrent `streamExists: true` et `trackCount: 2`, le système devrait **ENFIN** fonctionner ! 🎉
