# Story Effects, Instant Loading & Translation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rendre les stories instantanées à l'affichage, ajouter des effets visuels d'ouverture/fermeture (4 types), et implémenter réellement la traduction des textes de story via ZMQ.

**Architecture:**
- iOS : Remplace `AsyncImage` par `CachedAsyncImage` (chargement synchrone depuis cache), précharge les slides adjacentes. Ajoute l'enum `StoryTransitionEffect` dans le SDK, applique les effets dans `crossFadeStory()` et `groupTransition()`.
- Backend : Implémente `triggerStoryTextTranslation()` dans `PostService.ts` — envoi ZMQ réel via `ZMQSingleton`, écoute `translationCompleted`, persiste en `Post.translations`. Expose `translations` dans l'API.
- SDK iOS : Décode `translations` depuis l'API dans `APIPost` et mappe dans `toStoryGroups()`.

**Tech Stack:** Swift/SwiftUI, MeeshySDK, TypeScript/Fastify, ZMQ, Prisma/MongoDB.

---

## Tâche 1 : Fix AsyncImage → CachedAsyncImage dans StoryViewerView+Content.swift

**Fichiers:**
- Modifier: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:98-139`

### Step 1: Localiser le bug

Lire `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift` lignes 98–139.
Confirmer que `mediaOverlay()` utilise `AsyncImage`.

### Step 2: Remplacer AsyncImage par CachedAsyncImage

```swift
// AVANT (ligne 100-122)
AsyncImage(url: url) { phase in
    switch phase {
    case .success(let image):
        image.resizable().aspectRatio(contentMode: .fill)
            .frame(width: geometry.size.width, height: geometry.size.height).clipped()
    case .failure:
        coloredMediaFallback(media: media)
    case .empty:
        coloredMediaFallback(media: media).overlay(ProgressView().tint(.white))
    @unknown default:
        coloredMediaFallback(media: media)
    }
}
```

```swift
// APRÈS — utilise l'URL string directement, display synchrone si en cache
CachedAsyncImage(url: media.url) {
    coloredMediaFallback(media: media)
}
.aspectRatio(contentMode: .fill)
.frame(width: geometry.size.width, height: geometry.size.height)
.clipped()
```

Note: `CachedAsyncImage` est dans `MeeshyUI` (déjà importé dans le fichier via `import MeeshyUI`). Il prend `url: String?` pas `URL`.

### Step 3: Build

```bash
./apps/ios/meeshy.sh build
```
Attendu : BUILD SUCCEEDED, aucune erreur de compilation.

### Step 4: Vérifier visuellement

```bash
./apps/ios/meeshy.sh run
```
Ouvrir une story avec image — elle doit apparaître INSTANTANÉMENT si déjà chargée, ou avec un `ProgressView` discret la première fois (jamais de flash blanc).

### Step 5: Commit

```bash
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift
git commit -m "fix(ios): story media — AsyncImage → CachedAsyncImage pour affichage instantané"
```

---

## Tâche 2 : Préchargement des images de story adjacentes

**Fichiers:**
- Modifier: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift` (fonctions `crossFadeStory()` et `onAppear`)
- Modifier: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` (`.onAppear` du viewer)

**Contexte:** `MediaCacheManager.shared.prefetch(_ urlString: String)` démarre un chargement fire-and-forget. Le viewer a accès à `groups`, `currentGroupIndex`, `currentStoryIndex`.

### Step 1: Ajouter la fonction de préchargement dans StoryViewerView+Content.swift

Après `func markCurrentViewed()` (ou en fin de fichier dans l'extension), ajouter :

```swift
/// Précharge l'image de la story à l'index donné dans le groupe actuel.
func prefetchStory(at index: Int) {
    guard index >= 0, index < groups[currentGroupIndex].stories.count else { return }
    let story = groups[currentGroupIndex].stories[index]
    story.media.compactMap(\.url).forEach {
        MediaCacheManager.shared.prefetch($0)
    }
}

/// Précharge toutes les stories du groupe actuel (appelé à l'ouverture du viewer).
func prefetchCurrentGroup() {
    guard currentGroupIndex < groups.count else { return }
    groups[currentGroupIndex].stories.forEach { story in
        story.media.compactMap(\.url).forEach {
            MediaCacheManager.shared.prefetch($0)
        }
    }
}
```

### Step 2: Appeler prefetchCurrentGroup à l'ouverture du viewer

Dans `StoryViewerView.swift`, localiser le `.onAppear` ou l'endroit où le viewer devient visible. Ajouter :

```swift
.onAppear {
    prefetchCurrentGroup()
    markCurrentViewed()
}
```

Si un `.onAppear` existe déjà, y ajouter `prefetchCurrentGroup()`.

### Step 3: Appeler prefetchStory lors de chaque transition

Dans `crossFadeStory()` (ligne ~354 de `StoryViewerView+Content.swift`), après `update()` :

```swift
private func crossFadeStory(update: @escaping () -> Void) {
    isTransitioning = true
    outgoingStory = currentStory
    outgoingOpacity = 1
    contentOpacity = 0
    textSlideOffset = 14

    update()
    markCurrentViewed()
    // Précharger la suivante
    prefetchStory(at: currentStoryIndex + 1)

    withAnimation(.easeOut(duration: 0.35)) {
        outgoingOpacity = 0
        contentOpacity = 1
        textSlideOffset = 0
    }
    restartTimer()
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.38) {
        outgoingStory = nil
        isTransitioning = false
    }
}
```

### Step 4: Build + run

```bash
./apps/ios/meeshy.sh build
```
Attendu : BUILD SUCCEEDED.

### Step 5: Commit

```bash
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift
git commit -m "feat(ios): préchargement des images de story adjacentes pour affichage instantané"
```

---

## Tâche 3 : Ajouter StoryTransitionEffect + fields opening/closing dans StoryEffects (SDK)

**Fichiers:**
- Modifier: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:195–240`

### Step 1: Ajouter l'enum StoryTransitionEffect

Dans `StoryModels.swift`, avant la section `// MARK: - Story Effects` (ligne ~193), ajouter :

```swift
// MARK: - Story Transition Effects

public enum StoryTransitionEffect: String, Codable, CaseIterable, Sendable {
    /// Fondu : opacité 0 → 1 (0.3s easeOut)
    case fade
    /// Zoom doux : scale 0.92 + opacité 0 → 1 (spring)
    case zoom
    /// Glissement vertical : Y+30 + opacité 0 → position normale (spring)
    case slide
    /// Révélation circulaire : clipShape cercle qui s'élargit (0.4s)
    case reveal

    public var label: String {
        switch self {
        case .fade:   return "Fondu"
        case .zoom:   return "Zoom"
        case .slide:  return "Glissement"
        case .reveal: return "Révélation"
        }
    }

    public var iconName: String {
        switch self {
        case .fade:   return "sun.max"
        case .zoom:   return "arrow.up.left.and.arrow.down.right"
        case .slide:  return "arrow.up"
        case .reveal: return "circle.dashed"
        }
    }
}
```

### Step 2: Ajouter les champs opening/closing dans StoryEffects

Dans `StoryEffects` (ligne ~195), ajouter après `voiceTranscriptions`:

```swift
// Effets de transition
public var opening: StoryTransitionEffect?
public var closing: StoryTransitionEffect?
```

### Step 3: Mettre à jour le init de StoryEffects

Ajouter les paramètres `opening: StoryTransitionEffect? = nil, closing: StoryTransitionEffect? = nil` à la fin du `public init(...)` de `StoryEffects`.

Dans le corps du `init`, ajouter :
```swift
self.opening = opening; self.closing = closing
```

### Step 4: Build SDK + app

```bash
./apps/ios/meeshy.sh build
```
Attendu : BUILD SUCCEEDED — les nouveaux champs sont automatiquement encodés/décodés (Codable).

### Step 5: Commit

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift
git commit -m "feat(sdk): StoryTransitionEffect enum + champs opening/closing dans StoryEffects"
```

---

## Tâche 4 : Appliquer les effets de transition dans StoryViewerView+Content.swift

**Fichiers:**
- Modifier: `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:354–407`

**Contexte:** `currentStory?.storyEffects?.opening` = effet de la nouvelle story. `outgoingStory?.storyEffects?.closing` = effet sortant.

### Step 1: Créer les fonctions d'application d'effet

Dans `StoryViewerView+Content.swift`, ajouter avant `crossFadeStory()` :

```swift
// MARK: - Transition Effect Application

/// Applique l'effet d'ouverture de la nouvelle story.
/// Appelé après le swap de contenu, dans withAnimation.
private func applyOpeningEffect(_ effect: StoryTransitionEffect?) {
    switch effect {
    case .fade:
        // Opacité gérée par contentOpacity — rien à faire en plus
        break
    case .zoom:
        // Scale géré via openingScale state
        break
    case .slide:
        // textSlideOffset déjà géré — ajuster à 30 au lieu de 14
        textSlideOffset = 30
    case .reveal, .none:
        break
    }
}
```

**Note :** Pour `zoom` et `reveal`, une approche pragmatique utilise des modificateurs conditionnels sur les layers existants. Voici l'approche complète :

Dans `StoryViewerView.swift`, ajouter deux states :
```swift
@State var openingScale: CGFloat = 1.0       // internal for cross-file extension access
@State var isRevealing = false               // internal for cross-file extension access
```

### Step 2: Modifier crossFadeStory() pour appliquer les effets

```swift
private func crossFadeStory(update: @escaping () -> Void) {
    isTransitioning = true
    outgoingStory = currentStory
    outgoingOpacity = 1
    contentOpacity = 0

    let incomingEffect = currentStory?.storyEffects?.opening  // Lire AVANT update()

    // Préparer l'état initial selon l'effet entrant
    switch incomingEffect {
    case .zoom:
        openingScale = 0.92
        textSlideOffset = 0
    case .slide:
        textSlideOffset = 30
        openingScale = 1.0
    case .reveal:
        isRevealing = false  // déclenche le clip mask
        textSlideOffset = 0
        openingScale = 1.0
    default:  // fade ou nil
        textSlideOffset = 14
        openingScale = 1.0
    }

    update()
    markCurrentViewed()
    prefetchStory(at: currentStoryIndex + 1)

    let animDuration: Double
    let animation: Animation
    switch incomingEffect {
    case .zoom:
        animDuration = 0.4
        animation = .spring(response: 0.4, dampingFraction: 0.75)
    case .slide:
        animDuration = 0.38
        animation = .spring(response: 0.38, dampingFraction: 0.82)
    case .reveal:
        animDuration = 0.4
        animation = .easeOut(duration: 0.4)
    default:
        animDuration = 0.35
        animation = .easeOut(duration: 0.35)
    }

    withAnimation(animation) {
        outgoingOpacity = 0
        contentOpacity = 1
        openingScale = 1.0
        textSlideOffset = 0
        if incomingEffect == .reveal { isRevealing = true }
    }

    restartTimer()
    DispatchQueue.main.asyncAfter(deadline: .now() + animDuration + 0.03) {
        outgoingStory = nil
        isTransitioning = false
        isRevealing = false
    }
}
```

### Step 3: Appliquer openingScale et isRevealing sur la couche contenu

Dans `StoryViewerView+Content.swift`, dans le body qui affiche le contenu (`contentOpacity`), le modifier avec :

```swift
// Dans la couche principale de contenu (celle animée par contentOpacity)
.scaleEffect(openingScale)
// Pour reveal : clipShape circulaire qui s'élargit
.clipShape(
    Circle().scale(isRevealing
        ? 1  // Plein écran
        : (currentStory?.storyEffects?.opening == .reveal ? 0.001 : 1)
    )
)
```

**Note :** Pour garder le code simple, si `storyEffects?.opening` != `.reveal`, ne pas appliquer le clip (scale = 1 en permanence).

Simplification pratique — mettre dans `StoryViewerView+Content.swift` autour du body de contenu :

```swift
.scaleEffect(openingScale)
.opacity(contentOpacity)
// Reveal effect : clip circle expanding
.clipShape(RevealCircleShape(progress: isRevealing ? 1 : (currentStory?.storyEffects?.opening == .reveal ? 0 : 1)))
```

Où `RevealCircleShape` est défini localement :

```swift
private struct RevealCircleShape: Shape {
    var progress: CGFloat
    var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }
    func path(in rect: CGRect) -> Path {
        let radius = max(rect.width, rect.height) * progress * 1.5
        let center = CGPoint(x: rect.midX, y: rect.midY)
        return Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius,
                                     width: radius * 2, height: radius * 2))
    }
}
```

### Step 4: Build + run

```bash
./apps/ios/meeshy.sh build
```
Attendu : BUILD SUCCEEDED.

Tester visuellement avec une story ayant `storyEffects.opening = "fade"` (ou créer une story de test via l'API avec le champ dans storyEffects).

### Step 5: Commit

```bash
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift
git commit -m "feat(ios): appliquer StoryTransitionEffect (fade/zoom/slide/reveal) dans crossFadeStory"
```

---

## Tâche 5 : Sélecteur d'effet de transition dans StoryComposerView

**Fichiers:**
- Modifier: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`

### Step 1: Ajouter le state opening/closing dans StoryComposerView

Dans `StoryComposerView`, après les autres `@State` :

```swift
@State private var openingEffect: StoryTransitionEffect? = nil
@State private var closingEffect: StoryTransitionEffect? = nil
```

### Step 2: Ajouter le case `.transition` dans StoryComposerPanel

Dans `StoryComposerPanel` (ligne 7) :

```swift
public enum StoryComposerPanel: Equatable {
    case none
    case text
    case stickers
    case drawing
    case filter
    case audio
    case background
    case transition   // Nouveau
}
```

### Step 3: Ajouter le bouton dans toolBar

Dans `toolBar`, après le bouton "BG" :

```swift
toolButton(icon: "sparkles", label: "Effet", panel: .transition)
```

### Step 4: Ajouter le panel de sélection dans activeToolPanel

Dans `activeToolPanel`, avant `case .none:` :

```swift
case .transition:
    transitionPicker
        .transition(.move(edge: .bottom).combined(with: .opacity))
```

### Step 5: Implémenter transitionPicker

```swift
private var transitionPicker: some View {
    VStack(spacing: 12) {
        Text("Effet d'ouverture")
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(.white.opacity(0.6))

        HStack(spacing: 12) {
            // Aucun effet
            effectButton(effect: nil, label: "Aucun", icon: "minus.circle", isOpening: true)
            ForEach(StoryTransitionEffect.allCases, id: \.self) { effect in
                effectButton(effect: effect, label: effect.label, icon: effect.iconName, isOpening: true)
            }
        }

        Text("Effet de fermeture")
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(.white.opacity(0.6))

        HStack(spacing: 12) {
            effectButton(effect: nil, label: "Aucun", icon: "minus.circle", isOpening: false)
            ForEach(StoryTransitionEffect.allCases, id: \.self) { effect in
                effectButton(effect: effect, label: effect.label, icon: effect.iconName, isOpening: false)
            }
        }
    }
    .padding(.vertical, 12)
    .padding(.horizontal, 16)
}

private func effectButton(effect: StoryTransitionEffect?, label: String, icon: String, isOpening: Bool) -> some View {
    let isSelected = isOpening ? (openingEffect == effect) : (closingEffect == effect)
    return Button {
        withAnimation(.spring(response: 0.25)) {
            if isOpening { openingEffect = effect } else { closingEffect = effect }
        }
        HapticFeedback.light()
    } label: {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundColor(isSelected ? Color(hex: "FF2E63") : .white.opacity(0.6))
            Text(label)
                .font(.system(size: 9, weight: .medium))
                .foregroundColor(isSelected ? Color(hex: "FF2E63") : .white.opacity(0.4))
        }
        .frame(width: 60, height: 54)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(isSelected ? Color(hex: "FF2E63").opacity(0.15) : Color.white.opacity(0.06))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(isSelected ? Color(hex: "FF2E63").opacity(0.5) : Color.clear, lineWidth: 1)
                )
        )
    }
    .accessibilityLabel(label)
}
```

### Step 6: Inclure opening/closing dans buildEffects()

Dans `buildEffects()` :

```swift
private func buildEffects() -> StoryEffects {
    let bgHex = selectedImage != nil ? nil : colorToHex(backgroundColor)
    return StoryEffects(
        background: bgHex,
        textStyle: textStyle.rawValue,
        textColor: colorToHex(textColor),
        textPosition: nil,
        filter: selectedFilter?.rawValue,
        stickers: stickerObjects.isEmpty ? nil : stickerObjects.map(\.emoji),
        textAlign: alignmentString(textAlignment),
        textSize: textSize,
        textBg: textBgEnabled ? "000000" : nil,
        textOffsetY: nil,
        stickerObjects: stickerObjects.isEmpty ? nil : stickerObjects,
        textPositionPoint: textPosition,
        drawingData: drawingData,
        backgroundAudioId: selectedAudioId,
        backgroundAudioVolume: selectedAudioId != nil ? audioVolume : nil,
        backgroundAudioStart: selectedAudioId != nil ? audioTrimStart : nil,
        opening: openingEffect,   // Nouveau
        closing: closingEffect    // Nouveau
    )
}
```

### Step 7: Build + run

```bash
./apps/ios/meeshy.sh build
```
Attendu : BUILD SUCCEEDED.

Ouvrir le story composer → vérifier que le bouton "Effet" apparaît dans la barre d'outils.

### Step 8: Commit

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift
git commit -m "feat(sdk): sélecteur d'effets de transition opening/closing dans StoryComposerView"
```

---

## Tâche 6 : Implémenter triggerStoryTextTranslation dans PostService.ts

**Fichiers:**
- Modifier: `services/gateway/src/services/PostService.ts:1–10` (imports)
- Modifier: `services/gateway/src/services/PostService.ts:190–216` (méthode stub)

**Contexte:**
- `ZMQSingleton` est importé via `import { ZMQSingleton } from './ZmqSingleton';`
- `ZmqTranslationClient.translateToMultipleLanguages(text, sourceLang, targetLangs, messageId, conversationId, modelType?)` envoie la requête
- `ZmqTranslationClient` émet `translationCompleted` avec `{ messageId, translatedText, targetLanguage, confidenceScore, translatorModel }`
- `Post.translations` schema : `{ "fr": { text, translationModel, confidenceScore, createdAt } }`
- Le `messageId` ZMQ sera `"story:{postId}"` pour distinguer des messages

### Step 1: Ajouter l'import ZMQSingleton en tête de PostService.ts

En haut du fichier, ajouter après les imports existants :

```typescript
import { ZMQSingleton } from './ZmqSingleton';
```

### Step 2: Remplacer l'implémentation stub par la vraie

```typescript
private async triggerStoryTextTranslation(postId: string, content: string, authorId: string): Promise<void> {
  try {
    // 1. Récupérer les langues système des contacts de l'auteur
    const contacts = await this.prisma.conversationMember.findMany({
      where: {
        conversation: { members: { some: { userId: authorId } } },
        userId: { not: authorId },
      },
      include: { user: { select: { systemLanguage: true } } },
      take: 100,
    });

    const targetLanguages = [...new Set(
      contacts
        .map((c) => (c as any).user?.systemLanguage as string | undefined)
        .filter((l): l is string => !!l && l !== 'en')
    )].slice(0, 10);

    if (targetLanguages.length === 0) {
      log.info('StoryTranslation: no target languages found', { postId });
      return;
    }

    // 2. Obtenir le client ZMQ
    const zmqClient = ZMQSingleton.getInstanceSync();
    if (!zmqClient) {
      log.warn('StoryTranslation: ZMQ client not available', { postId });
      return;
    }

    const storyMessageId = `story:${postId}`;
    const sourceLanguage = detectLanguage(content);

    log.info('StoryTranslation: sending ZMQ request', {
      postId, sourceLanguage, targetLanguages
    });

    // 3. Écouter les résultats (fire-and-forget listener par traduction)
    const handleResult = async (event: { messageId: string; translatedText: string; targetLanguage: string; confidenceScore?: number; translatorModel?: string; }) => {
      if (!event.messageId.startsWith('story:')) return;
      if (event.messageId !== storyMessageId) return;

      try {
        // Lire les translations actuelles du post
        const post = await this.prisma.post.findUnique({
          where: { id: postId },
          select: { translations: true },
        });

        const translations: Record<string, unknown> = (post?.translations as Record<string, unknown>) ?? {};
        translations[event.targetLanguage] = {
          text: event.translatedText,
          translationModel: event.translatorModel ?? 'nllb',
          confidenceScore: event.confidenceScore ?? 1,
          createdAt: new Date().toISOString(),
        };

        await this.prisma.post.update({
          where: { id: postId },
          data: { translations: translations as any },
        });

        log.info('StoryTranslation: translation saved', {
          postId, language: event.targetLanguage
        });
      } catch (err) {
        log.warn('StoryTranslation: failed to save result', { err, postId });
      }
    };

    zmqClient.on('translationCompleted', handleResult);

    // 4. Envoyer la requête ZMQ
    await zmqClient.translateToMultipleLanguages(
      content,
      sourceLanguage,
      targetLanguages,
      storyMessageId,
      `story_context:${postId}`,
    );

    // 5. Nettoyer le listener après timeout raisonnable (évite les memory leaks)
    setTimeout(() => {
      zmqClient.off('translationCompleted', handleResult);
    }, 60_000); // 60s timeout

  } catch (error) {
    log.warn('StoryTranslation failed', { err: error, postId });
  }
}
```

### Step 3: Vérifier la signature de translateToMultipleLanguages

Lire `services/gateway/src/services/zmq-translation/ZmqTranslationClient.ts` lignes 340–370 pour confirmer la signature exacte. Ajuster si nécessaire.

### Step 4: Redémarrer le gateway

```bash
# Dans tmux fenêtre 1 (gateway)
# Ctrl+C pour arrêter, puis :
cd /Users/smpceo/Documents/v2_meeshy
pnpm --filter gateway dev
```

Vérifier les logs au démarrage.

### Step 5: Tester via l'API

```bash
TOKEN=$(cat /tmp/meeshy_token.txt)
curl -s -X POST http://localhost:3000/api/v1/posts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"STORY","visibility":"PUBLIC","content":"Bonjour le monde!"}' | jq .
```

Attendre ~5s, puis :

```bash
POST_ID="<id du post créé>"
curl -s http://localhost:3000/api/v1/posts/$POST_ID \
  -H "Authorization: Bearer $TOKEN" | jq .data.translations
```

Attendu : `{ "es": { "text": "...", "translationModel": "nllb", ... } }` (ou autre langue si les contacts utilisent des langues différentes).

### Step 6: Commit

```bash
git add services/gateway/src/services/PostService.ts
git commit -m "feat(gateway): implémenter triggerStoryTextTranslation via ZMQ + persistance Post.translations"
```

---

## Tâche 7 : Exposer translations dans la réponse API + décoder dans iOS SDK

**Fichiers:**
- Modifier: `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift:61–87` (APIPost struct)
- Modifier: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:411–449` (toStoryGroups)

**Contexte:**
- Le gateway retourne déjà `post.translations` dans le `postInclude` (champ `Json?` brut).
- iOS doit décoder `{ "fr": { "text": "...", ... }, "es": {...} }` → `[StoryTranslation]`
- `StoryTranslation` est `{ language: String, content: String }` (déjà défini dans SDK)

### Step 1: Ajouter APIPostTranslationEntry et translations dans APIPost

Dans `PostModels.swift`, avant `public struct APIPost` :

```swift
public struct APIPostTranslationEntry: Decodable {
    public let text: String
    public let translationModel: String?
    public let confidenceScore: Double?
    public let createdAt: String?
}
```

Dans `APIPost`, ajouter après `storyEffects`:

```swift
public let translations: [String: APIPostTranslationEntry]?
```

### Step 2: Mapper translations dans toStoryGroups()

Dans `StoryModels.swift`, la fonction `toStoryGroups()`, ligne ~423 :

```swift
// AVANT
let item = StoryItem(id: post.id, content: post.content, media: media,
                     storyEffects: post.storyEffects,
                     createdAt: post.createdAt, expiresAt: post.updatedAt,
                     repostOfId: post.repostOf?.id, isViewed: false)

// APRÈS
let storyTranslations: [StoryTranslation]? = post.translations.map { dict in
    dict.map { (lang, entry) in StoryTranslation(language: lang, content: entry.text) }
}
let item = StoryItem(id: post.id, content: post.content, media: media,
                     storyEffects: post.storyEffects,
                     createdAt: post.createdAt, expiresAt: post.updatedAt,
                     repostOfId: post.repostOf?.id, isViewed: false,
                     translations: storyTranslations)
```

### Step 3: Build SDK + app

```bash
./apps/ios/meeshy.sh build
```
Attendu : BUILD SUCCEEDED.

### Step 4: Vérifier le Prisme Linguistique sur les stories

L'API de `StoryItem.resolvedContent(preferredLanguage:)` est déjà implémentée (ligne ~336). Une fois les translations mappées, le viewer affiche automatiquement le contenu dans la langue préférée.

Vérifier dans `StoryViewerView+Content.swift` que `currentStory?.resolvedContent(preferredLanguage:)` est bien utilisé (ou `currentStory?.content`). Si `content` est utilisé directement, le remplacer par :

```swift
currentStory?.resolvedContent(preferredLanguage: AuthManager.shared.currentUser?.systemLanguage)
    ?? currentStory?.content
```

### Step 5: Commit

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift
git add apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift
git commit -m "feat(sdk): décoder Post.translations + appliquer Prisme Linguistique sur le texte des stories"
```

---

## Plan complet — Ordre d'exécution recommandé

1. **Tâche 1** : Fix AsyncImage → CachedAsyncImage *(impact visuel immédiat, faible risque)*
2. **Tâche 2** : Préchargement des images adjacentes *(complète la perf)*
3. **Tâche 3** : Enum StoryTransitionEffect + fields SDK *(fondation pour les tâches 4 et 5)*
4. **Tâche 4** : Appliquer effets dans crossFadeStory *(dépend de tâche 3)*
5. **Tâche 5** : Sélecteur d'effets dans StoryComposerView *(dépend de tâche 3)*
6. **Tâche 6** : triggerStoryTextTranslation — ZMQ réel *(indépendant, backend only)*
7. **Tâche 7** : Décoder translations dans iOS SDK *(dépend de tâche 6)*

Les tâches 1–2 et 6 peuvent être parallélisées (iOS vs backend).
