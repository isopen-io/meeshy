# Stories — Design Complet

**Date :** 2026-02-26
**Statut :** Approuvé

---

## Périmètre

Refonte complète du cycle de vie des stories : création fidèle, rendu pixel-perfect, son d'arrière-plan (bibliothèque réelle + enregistrement live + réutilisation), audio vocal transcrit/traduit, traduction automatique des textes (Prisme Linguistique).

---

## Section 1 — Rendu Pixel-Perfect (Viewer)

**Problème actuel :** `StoryViewerView` affiche le texte en `VStack` centré et les stickers en `HStack` plat — les positions normalisées x/y stockées dans `StoryEffects` ne sont pas exploitées.

**Solution :** Nouveau composant partagé `StoryCanvasReaderView` (MeeshyUI) qui reconstruit le canvas via `ZStack` + `GeometryReader` :

```
StoryCanvasReaderView
  └── ZStack (fullscreen)
      ├── backgroundLayer    — couleur / gradient / image + filtre CI
      ├── DrawingOverlayView — data: storyEffects.drawingData (readonly)
      ├── StoryTextCanvasLayer
      │     • position : storyEffects.textPositionPoint (normalisé → .position())
      │     • font, couleur, bg, alignement — identiques au composer
      │     • contenu : traduction préférée OU texte original
      └── StickerCanvasLayer
            • ForEach(stickerObjects) → .position(x * w, y * h)
            • rotation + scale appliqués (readonly, pas de drag)
```

Utilisé par `StoryViewerView` (lecture) et aligné avec `StoryCanvasView` (écriture).

---

## Section 2 — Infrastructure Gateway (audio stories)

### Nouveau modèle Prisma `StoryBackgroundAudio`

```prisma
model StoryBackgroundAudio {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  uploaderId  String   @db.ObjectId
  uploader    User     @relation(fields: [uploaderId], references: [id])
  fileUrl     String
  title       String
  duration    Int      // secondes
  usageCount  Int      @default(0)
  isPublic    Boolean  @default(true)
  createdAt   DateTime @default(now())
}
```

### Endpoints

| Méthode | URL | Description |
|---------|-----|-------------|
| `POST` | `/stories/audio` | Upload multipart (max 60s, mp3/m4a/wav) |
| `GET` | `/stories/audio?q=&limit=20&cursor=` | Bibliothèque publique (tri: usageCount DESC) |
| `POST` | `/stories/audio/:audioId/use` | Incrémente usageCount |

### Extension `storyEffects` JSON (sans migration)

```json
{
  "backgroundAudioId":     "...",   // ID StoryBackgroundAudio
  "backgroundAudioVolume": 0.7,     // 0.0 → 1.0
  "backgroundAudioStart":  12.5,    // trim start (secondes)
  "voiceAttachmentId":     "...",   // ID attachment (enregistrement vocal)
  "voiceTranscriptions": [
    { "language": "fr", "content": "Bonjour depuis Paris..." },
    { "language": "en", "content": "Hello from Paris..." }
  ]
}
```

### Pipeline traduction textuelle (Prisme)

À la création d'une STORY avec `content` non vide :
1. Gateway récupère les langues cibles (UserPreferences.systemLanguage des contacts)
2. ZMQ → translator (NLLB-200 multi-langue)
3. Résultat stocké dans `Post.translations` (format identique à `Message.translations`)
4. Traitement async — story visible immédiatement

---

## Section 3 — Son d'Arrière-Plan

### Composer — Panel `StoryAudioPanel` (remplace StoryMusicPicker)

3 onglets :
- **Bibliothèque** : sons de la communauté (API réelle, triés par popularité)
- **Enregistrer** : hold-to-record, max 60s, toggle « Partager ce son »
- **Mes sons** : sons uploadés par l'utilisateur

Quand un son est sélectionné : slider de volume + trim bar (identique au trim actuel).

### Viewer — Indicateur discret

```
♫ Titre du son           ← bottom-left, waveform animée
```

Tap → bottom sheet :
- Artwork + titre + « Son de @username »
- Bouton **« Créer une story avec ce son »** → ouvre Composer pré-rempli

---

## Section 4 — Audio Vocal Traduit (Prisme Vocal)

### Composer

Bouton `🎤 Voix` dans la toolbar principale. Tap → press-hold pour enregistrer, relâcher pour terminer. Waveform preview, bouton discard. Vidéo depuis galerie → audio extrait dans le même pipeline.

### Pipeline

Identique aux audio attachments de messages :
```
Publish → gateway store fichier → ZMQ → Whisper (transcription)
       → NLLB (langues contacts) → storyEffects.voiceTranscriptions
```

### Viewer

- Indicateur `🎤 (langue)` en haut à droite si vocal présent
- Lecture auto dans la langue système du viewer (si traduction dispo) sinon original
- Transcription en overlay caption animé (2 lignes max, bas du canvas)

---

## Section 5 — Traduction Textuelle Automatique (Prisme)

- `StoryTextCanvasLayer` résout la langue via `resolveUserLanguage()` (même logique que `ThemedMessageBubble`)
- Traduction affichée **à la position exacte originale** — layout identique
- Indicateur `translate` 12pt en bas à gauche du bloc texte
- Tap → bottom sheet léger (story visible derrière) : voir original + changer de langue

---

## Section 6 — UX Composer Épurée

### Toolbar (5 boutons primaires, était 7)

```
[ 📷 Média ]  [ Aa Texte ]  [ ✦ Effets ]  [ ♫ Son ]  [ 🎤 Voix ]
```

**✦ Effets** révèle un panel secondaire (slide-up) :
```
[ 😀 Stickers ]  [ ✏️ Dessin ]  [ 🎨 Filtres ]  [ 🖼 Fond ]
```

**♫ Son** révèle `StoryAudioPanel` (3 onglets)
**🎤 Voix** → press-hold immédiat

Un seul panel actif à la fois. Dismiss par swipe down ou retap.
Animation : `.spring(response: 0.35, dampingFraction: 0.8)`

---

## Architecture des Agents

```
Phase 1 — Fondation (séquentiel, bloquant)
  sdk-models  → packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift
                Étend StoryEffects + StoryItem + ajoute StoryVoiceTranscription
                + StoryBackgroundAudioEntry

Phase 2 — Implémentation (3 agents parallèles en worktrees)
  ├── gateway-audio  → packages/shared/prisma/schema.prisma
  │                    services/gateway/src/routes/posts/audio.ts (NEW)
  │                    services/gateway/src/services/PostService.ts
  │                    services/gateway/src/routes/posts/index.ts
  │
  ├── ios-viewer     → packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasReaderView.swift (NEW)
  │                    apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift
  │                    apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift
  │
  └── ios-composer   → packages/MeeshySDK/Sources/MeeshyUI/Story/StoryAudioPanel.swift (NEW)
                       packages/MeeshySDK/Sources/MeeshyUI/Story/StoryVoiceRecorder.swift (NEW)
                       packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
                       packages/MeeshySDK/Sources/MeeshyUI/Story/StoryMusicPicker.swift → supprimé

Phase 3 — Intégration (séquentiel)
  Merge des 3 worktrees → clean build → vérification E2E
```

### Règle de séparation des fichiers
Aucun fichier n'est touché par deux agents en parallèle :
- `StoryViewerView*` → uniquement `ios-viewer`
- `StoryComposerView.swift` + nouveaux composants audio → uniquement `ios-composer`
- `schema.prisma` + fichiers gateway → uniquement `gateway-audio`
- `StoryModels.swift` → uniquement Phase 1 (avant les worktrees)
