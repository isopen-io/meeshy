# Solution : Barre de progression basée sur la durée de l'audio traduit

## 🎯 Problème

Lorsque l'utilisateur sélectionne une langue traduite dans la liste des langues d'un audio, la barre de progression reste basée sur la durée de l'audio **original** au lieu de s'adapter à la durée de l'audio **traduit** sélectionné.

Cela crée une incohérence :
- Si l'audio traduit est plus long → la barre atteint 100% avant la fin
- Si l'audio traduit est plus court → la lecture se termine avant que la barre n'atteigne 100%

## ✅ Solution implémentée

### Modifications effectuées

#### 1. **Hook `useAudioTranslation`** (`apps/web/hooks/use-audio-translation.ts`)

**Ajout d'un nouveau retour : `currentAudioDuration`**

```typescript
// Lignes 180-199
const currentAudioDuration = useMemo(() => {
  if (selectedLanguage === 'original') {
    return undefined; // Laisse useAudioPlayback utiliser attachmentDuration
  }

  const translatedAudio = translatedAudios.find(t => t.targetLanguage === selectedLanguage);
  if (translatedAudio?.durationMs) {
    const durationSeconds = translatedAudio.durationMs / 1000;
    console.log('🎵 [useAudioTranslation] Durée audio traduit:', {
      language: selectedLanguage,
      durationMs: translatedAudio.durationMs,
      durationSeconds
    });
    return durationSeconds;
  }

  return undefined; // Fallback vers attachmentDuration
}, [selectedLanguage, translatedAudios]);
```

**Retour mis à jour :**

```typescript
// Ligne 347
return {
  // ... autres propriétés
  currentAudioDuration, // Durée en secondes de l'audio actuellement sélectionné
  // ...
};
```

#### 2. **Composant `SimpleAudioPlayer`** (`apps/web/components/audio/SimpleAudioPlayer.tsx`)

**Récupération de `currentAudioDuration` depuis le hook :**

```typescript
// Ligne 77
const {
  // ... autres propriétés
  currentAudioDuration, // Durée de l'audio actuellement sélectionné
  // ...
} = useAudioTranslation({...});
```

**Passage de la durée dynamique à `useAudioPlayback` :**

```typescript
// Lignes 109-110
useAudioPlayback({
  audioUrl: currentAudioUrl,
  attachmentId: attachment.id,
  // Utiliser la durée de l'audio traduit si disponible, sinon celle de l'original
  attachmentDuration: currentAudioDuration ?? (attachment.duration ? attachment.duration / 1000 : undefined),
  mimeType: attachment.mimeType,
});
```

### Architecture de la solution

```
┌─────────────────────────────────────────────────────────────┐
│ SimpleAudioPlayer                                           │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ useAudioTranslation                                  │  │
│  │                                                      │  │
│  │  selectedLanguage: 'fr' ────┐                       │  │
│  │  translatedAudios: [        │                       │  │
│  │    { language: 'fr',        │                       │  │
│  │      durationMs: 45000 } ───┼─► currentAudioDuration│  │
│  │  ]                          │    = 45 seconds       │  │
│  └──────────────────────────────┴───────────────────────┘  │
│                                  │                          │
│                                  ▼                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ useAudioPlayback                                     │  │
│  │                                                      │  │
│  │  attachmentDuration: 45 (au lieu de 60 original)    │  │
│  │  duration: 45 ──────────┐                           │  │
│  │  currentTime: 22.5 ─────┼─► progress = 50%          │  │
│  └──────────────────────────┴───────────────────────────┘  │
│                                  │                          │
│                                  ▼                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ AudioProgressBar                                     │  │
│  │                                                      │  │
│  │  ████████████████████░░░░░░░░░░░ 50%                │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 Flow de fonctionnement

1. **Utilisateur clique sur une langue traduite** (ex: "Français")
   ```
   → setSelectedLanguage('fr')
   ```

2. **`useAudioTranslation` recalcule**
   ```typescript
   currentAudioUrl → URL du fichier traduit en français
   currentAudioDuration → 45 secondes (durationMs / 1000)
   ```

3. **`useAudioPlayback` reçoit la nouvelle durée**
   ```typescript
   attachmentDuration: 45 // au lieu de 60 (original)
   ```

4. **L'audio est rechargé avec la nouvelle URL**
   - Le `useEffect` dans `useAudioPlayback` détecte le changement d'URL
   - `loadAudio()` est appelé
   - La metadata du nouveau fichier audio est chargée

5. **La barre de progression se recalcule automatiquement**
   ```typescript
   progress = (currentTime / duration) * 100
   // Exemple: (22.5 / 45) * 100 = 50%
   ```

## 📊 Source de données

Les durées des audios traduits proviennent de :

### Backend (Prisma DB)
```typescript
interface AttachmentTranslation {
  url?: string;          // URL du fichier traduit
  durationMs?: number;   // ✅ Durée en millisecondes
  segments?: TranscriptionSegment[];
  // ...
}
```

### Socket.IO (Temps réel)
```typescript
interface SocketIOTranslatedAudio {
  readonly url: string;
  readonly durationMs?: number;  // ✅ Durée en millisecondes
  readonly segments?: readonly TranscriptionSegment[];
  // ...
}
```

La durée est calculée côté backend lors de la génération TTS et stockée dans la base de données.

## 🎨 Optimisations React appliquées

### Vercel React Best Practices suivies :

1. **`rerender-derived-state`** : Utilisation de `useMemo` pour calculer `currentAudioDuration`
   ```typescript
   const currentAudioDuration = useMemo(() => {
     // Calcul basé sur selectedLanguage et translatedAudios
   }, [selectedLanguage, translatedAudios]);
   ```

2. **`rerender-dependencies`** : Dépendances primitives dans les hooks
   - `selectedLanguage` (string)
   - `translatedAudios` (array stable via useState)

3. **Performance** : Pas de re-render inutile
   - Le calcul ne se déclenche que si `selectedLanguage` ou `translatedAudios` changent
   - Les autres composants ne sont pas affectés

## ✅ Tests à effectuer

1. **Sélection langue originale** → Barre progresse correctement avec durée originale
2. **Sélection langue traduite** → Barre progresse correctement avec durée traduite
3. **Changement de langue pendant lecture** → Progression se réajuste immédiatement
4. **Audio traduit plus long** → Barre atteint 100% exactement à la fin
5. **Audio traduit plus court** → Barre atteint 100% exactement à la fin
6. **Seek (curseur)** → Position correcte par rapport à la durée actuelle
7. **Temps restant** → Affichage correct basé sur la durée actuelle

## 🚀 Prochaines étapes possibles

- [ ] Ajouter une animation de transition lors du changement de durée
- [ ] Afficher un indicateur visuel pendant le rechargement de l'audio
- [ ] Précharger les audios traduits pour un changement instantané
- [ ] Persister la langue sélectionnée dans localStorage

## 📝 Fichiers modifiés

1. `apps/web/hooks/use-audio-translation.ts`
   - Ajout de `currentAudioDuration` calculé avec `useMemo`
   - Ajout dans l'interface de retour `UseAudioTranslationReturn`
   - Ajout dans le return du hook

2. `apps/web/components/audio/SimpleAudioPlayer.tsx`
   - Récupération de `currentAudioDuration` depuis `useAudioTranslation`
   - Passage dynamique à `useAudioPlayback` avec opérateur nullish coalescing (`??`)

---

**Date de création** : 2026-01-20
**Status** : ✅ Implémenté et prêt pour test
