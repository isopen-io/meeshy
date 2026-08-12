# Fidélité des snapshots/thumbnails de story (Published + Drafts)

Date : 2026-08-03

## 1. Contexte / Problème

L'écran « My Stories » (onglets Published / Drafts, grille `MyStoriesView`) doit afficher un
vrai aperçu visuel de chaque story — fond **et** texte stylé (police, graisse, taille,
couleur) — au lieu d'un simple aplat de couleur de fond.

Deux lacunes distinctes, confirmées en lisant le code :

1. **Fidélité du texte dans le composite existant.** Un mécanisme de « cover composite
   local-first » existe déjà (`StoryCoverThumbnail`, `StoryViewModel.swift`) et alimente
   l'anneau de story de l'auteur dans le tray (`StoryTrayView`). Il est produit par
   `StorySlideRenderer.renderComposite` → `drawTextObject`
   (`packages/MeeshySDK/Sources/MeeshyUI/Story/StorySlideRenderer.swift:236-289`), qui
   **ignore `fontFamily`** (toujours police système) et **ignore le poids dérivé du
   `textStyle`** (bold/neon/typewriter/handwriting/etc. — toujours `.bold` par défaut sauf
   override explicite). Couleur, taille, rotation, alignement et fond de texte solide sont
   en revanche déjà corrects dans ce chemin.
2. **Aucun composite pour les brouillons.** `StoryDraftStore.coverFileURL`
   (`packages/MeeshySDK/Sources/MeeshySDK/Store/StoryDraftStore.swift:992-1008`) sélectionne
   juste le premier fichier image brut de media trouvé pour la première slide — **aucun
   texte, dessin, sticker n'est jamais rendu**. Une slide texte-seul sur fond couleur
   (aucun fichier image en base) retombe sur l'aplat `backgroundHex`, exactement ce que
   montre la capture utilisateur.

Le vrai rendu pixel-parfait (police custom, poids dérivé du style, réserve d'encre
anti-clipping, fonds glass) existe déjà ailleurs : `StoryRenderer.render` +
`StoryTextLayer` (`packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/`), utilisé par le
canvas d'édition live et par l'export vidéo (`StoryAVCompositor`) — mais jamais pour
produire une image statique.

Second constat, confirmé par les échanges avec l'utilisateur et par
`StoryViewModel.swift:8-17` (commentaire `StoryCoverThumbnail`) : la « Phase 2 » d'upload
d'une vraie image composite baked au backend n'a jamais été livrée. Ce que voient les
AUTRES utilisateurs de vos stories est aujourd'hui reconstruit **localement, chez eux**, à
partir des mêmes `StoryEffects` JSON (`StoryViewModel.receiverCoverPlan` /
`receiverCoverCandidates`), via le même renderer approximatif. Le thumbHash (~28 octets,
calculé et propagé à la publication par `StoryThumbHashEnricher.enrich`) est un flou de
secours, pas une image.

## 2. Objectifs

- La grille « My Stories » (Published **et** Drafts) affiche un aperçu qui respecte
  fidèlement police, graisse, taille et couleur du texte réellement appliqué dans
  l'éditeur.
- Le mécanisme est généré **côté client**, sans changement backend/Prisma (cohérent avec
  la règle RAW-publish / Prisme Linguistique : jamais de rendu baké envoyé au serveur).
- Cohérence : My Stories, le tray (anneau de l'auteur), et le composite optimiste à la
  publication utilisent tous la **même** source de rendu — plus de divergence possible.

## 3. Non-objectifs (portée exclue, décision utilisateur)

- **Pas de rendu pixel-parfait pour le contenu des AUTRES utilisateurs** dans le tray
  (`receiverCoverPlan`/`receiverCoverCandidates`) ni pour le thumbHash partagé
  (`StoryThumbHashEnricher.enrich`). Ces deux chemins reçoivent uniquement le correctif
  ciblé de résolution de police (section 4.2) — cohérent avec leur rôle de placeholder
  bon marché, et avec le choix explicite de limiter le coût CPU du pipeline CALayer au
  contenu personnel.
- **Pas de backfill** des stories déjà publiées avant ce changement. Les stories sont
  éphémères (expiration existante, `group.isFullyExpired()`) ; les nouvelles publications
  et les brouillons retouchés obtiennent le nouveau composite, le reste expire
  naturellement.
- **Pas d'upload d'image composite au backend** (« Phase 2 » citée dans le code reste hors
  périmètre).

## 4. Architecture & Développement

### 4.1 Nouveau primitif SDK — `StoryStaticSnapshot`

Nouveau fichier : `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryStaticSnapshot.swift`.

Réutilise entièrement la machinerie déjà existante du pipeline pixel-parfait — **aucune
nouvelle abstraction d'images à inventer** :

- `CanvasGeometry(renderSize:)` — déjà `nonisolated`, trivial à construire pour une taille
  cible (ex. `StoryCoverThumbnail.renderSize` = 270×480).
- `ComposerImageCacheReader` (déjà défini, `internal`, dans
  `StoryCanvasRepresentable.swift:18-25`) — wrapper synchrone d'un `[String: UIImage]`.
  C'est le type que `StoryBackgroundLayer`/`StoryMediaLayer` détectent explicitement
  (`imageCache as? ComposerImageCacheReader`, `StoryBackgroundLayer.swift:552`,
  `StoryMediaLayer.swift:428`) pour **primer les bitmaps de façon SYNCHRONE** au moment de
  la construction du layer — contrairement au chemin `ImageCacheReader` générique
  (`cachedImage(for:) async`) qui peuplerait `contents` plus tard via un `Task`, trop tard
  pour un rendu statique one-shot. C'est ce détail qui rend un snapshot synchrone fiable
  sans période de course.
- `StoryRenderer.render(slide:into:at:mode:imageCache:contentsScale:)` (déjà `@MainActor`,
  `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift:114-126`) — construit
  l'arbre `CALayer` complet (texte via `StoryTextLayer`, media, stickers, dessin, pastille de
  lieu). Mode `.edit` (tout est toujours visible, pas de fenêtre de timing) et `time: .zero`.
  `contentsScale: 1.0` comme le fait déjà `StoryAVCompositor` pour un rendu qui correspond à
  la résolution design demandée sans upsampling.

```swift
@MainActor
public enum StoryStaticSnapshot {
    /// Rend une slide en image statique via le pipeline pixel-parfait
    /// (StoryRenderer/StoryTextLayer) — même rendu que le canvas live et l'export vidéo.
    /// `loadedImages` doit contenir toutes les images déjà décodées nécessaires (fond +
    /// premier plan), keyées comme le sont `StoryComposerViewModel.loadedImages`
    /// (id d'objet media / postMediaId) — PAS le format `"slide-bg-<slideId>"` utilisé par
    /// la file de publication offline (à re-clé si besoin au point d'appel).
    public static func render(slide: StorySlide,
                              loadedImages: [String: UIImage],
                              size: CGSize) -> UIImage? {
        let geometry = CanvasGeometry(renderSize: size)
        let imageCache = ComposerImageCacheReader(images: loadedImages, version: 0)
        let layer = StoryRenderer.render(slide: slide, into: geometry, at: .zero,
                                         mode: .edit, imageCache: imageCache,
                                         contentsScale: 1.0)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in layer.render(in: ctx.cgContext) }
    }
}
```

**Vérifié — pas d'action requise pour le cas moderne.** Les call sites actuels de
`renderComposite` passent un `bgImage: UIImage?` séparé de `loadedImages`, mais
`StorySlideRenderer.swift:93-95` montre que ce paramètre ne sert QUE le chemin fond legacy
(pré-`mediaObjects`) ; le fond moderne (`slide.effects.resolvedBackgroundMedia`) est déjà lu
depuis `loadedImages[bgMedia.id]` — exactement la clé (id de l'objet media) que
`StoryBackgroundLayer`/`ComposerImageCacheReader` consultent aussi. `StoryStaticSnapshot`
n'a donc besoin d'aucun remappage de clé pour le cas courant : passer directement
`viewModel.loadedImages` suffit. Le seul angle mort est le fond legacy pré-`mediaObjects`
(un `UIImage` unique hors dictionnaire, sans id media) — marginal sur des stories actuelles,
à vérifier au premier essai si un vieux brouillon legacy traîne encore.

### 4.2 Correctif ciblé — `StorySlideRenderer.drawTextObject`

Fichier : `packages/MeeshySDK/Sources/MeeshyUI/Story/StorySlideRenderer.swift:236-289`.

Remplacer :
```swift
let compositeWeight = textObj.parsedFontWeight?.uiFontWeight ?? .bold
var attrs: [NSAttributedString.Key: Any] = [
    .font: UIFont.systemFont(ofSize: fontSize, weight: compositeWeight),
    ...
]
```
par un appel à `StoryTextFontResolver.resolveFont(forTextObject:size:)`
(`packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryTextFontResolver.swift:14-18` — déjà
public, pur, partagé avec `StoryTextLayer`) :
```swift
let attrs: [NSAttributedString.Key: Any] = [
    .font: StoryTextFontResolver.resolveFont(forTextObject: textObj, size: fontSize),
    ...
]
```
`fontSize` reste calculé exactement comme aujourd'hui (ligne 245-246) — seule la résolution
de la police change. Couleur, alignement, rotation, fond de texte solide : inchangés (déjà
corrects). Ce correctif profite automatiquement à `StoryThumbHashEnricher.enrich` **et** à
`receiverCoverPlan`/`receiverCoverCandidates` puisqu'ils appellent tous
`StorySlideRenderer.renderComposite`/`computeThumbHash`.

### 4.3 Couverture de publication (contenu personnel, pixel-parfait)

Fichier : `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift`, 3 sites qui
produisent aujourd'hui la cover optimiste locale via `StorySlideRenderer.renderComposite` :
- `insertOptimisticOfflineStories` (ligne ~1545)
- publish en ligne, boucle par slide (ligne ~2030)
- reprise/drain de la queue offline (ligne ~2249)

Remplacer l'appel `StorySlideRenderer.renderComposite(slide:bgImage:loadedImages:size:)` par
`StoryStaticSnapshot.render(slide:loadedImages:size:)`, en conservant strictement le même
point de stockage (`CacheCoordinator.shared.thumbnails.store(jpeg, for:
StoryCoverThumbnail.cacheKey(storyId:))`) — aucun changement de cache/clé, uniquement le
renderer sous-jacent.

### 4.4 Couverture de brouillon (nouveau — contenu personnel, pixel-parfait)

Fichier : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+SyncRestore.swift`,
fonction `autosaveDraftAfterMutation()` (ligne 342-369) — hook débouncé existant (2.5 s,
`StoryComposerViewModel.autosaveTrigger`), déjà gaté par `mayOverwriteStoredDraft`.

Juste après l'appel `StoryDraftStore.shared.save(...)` (ligne 351-356), ajouter :
```swift
if let cover = StoryStaticSnapshot.render(slide: slidesStampedWithThumbHash().first ?? viewModel.slides[0],
                                          loadedImages: viewModel.loadedImages,
                                          size: StoryCoverThumbnail.renderSize),
   let jpeg = cover.jpegData(compressionQuality: 0.85) {
    Task {
        await CacheCoordinator.shared.thumbnails.store(
            jpeg, for: StoryCoverThumbnail.cacheKey(storyId: viewModel.draftId))
    }
}
```
« Première slide dans l'ordre » — même convention que l'ancienne heuristique
`coverFileURL`, pas d'ambiguïté nouvelle à trancher côté UX. Le cache est réutilisé sous la
clé du **draftId** (`StoryCoverThumbnail.cacheKey` ne prend qu'un id opaque — aucun risque
de collision avec un id de post publié, espaces d'UUID distincts).

`autoSaveDraftForBackground()` (ligne 306-309, passage en arrière-plan) appelle aussi
`persistDraft()` — vérifier au moment du code si ce chemin partage assez d'état
(`viewModel.loadedImages`/`slides`) pour bénéficier du même hook sans duplication, ou s'il
suffit que le prochain autosave débouncé rattrape la cover.

### 4.5 Lecture par la grille — `MyStoriesView` / `MyStoryCard`

Fichier : `apps/ios/Meeshy/Features/Main/Views/MyStoryCard.swift`.

**Published** (`MyStoriesView.publishedCardModel`, ligne ~358-374) : aujourd'hui ne lit que
`story.storyEffects?.thumbHash` et `story.media.first?.thumbnailUrl` — **ne consulte jamais**
le cache local-first que le tray utilise déjà. Ajouter la même résolution que
`StoryTrayView.latestStoryThumbnailURL` (ligne 353-368) :
`CacheCoordinator.thumbnailLocalFileURL(for: StoryCoverThumbnail.cacheKey(storyId: story.id))`
en priorité, avant le thumbHash/thumbnailUrl distant. Idéalement factoriser cette résolution
dans une fonction partagée (`StoryCoverThumbnail.preferredCoverURLString` existe déjà et est
« pure + testable ») plutôt que de dupliquer l'ordre de priorité une troisième fois.

**Drafts** (`MyStoriesView.draftCardModel`, ligne ~485-497) : remplacer/compléter
`localCoverPath: draft.coverFileURL?.path` par une lecture du cache
`CacheCoordinator.thumbnailLocalFileURL(for: StoryCoverThumbnail.cacheKey(storyId: draft.id))`
en priorité, avec repli sur l'ancienne heuristique `draft.coverFileURL` uniquement si le
cache est vide (ex. tout premier autosave pas encore écrit, ou brouillon créé avant ce
changement).

### 4.6 Aucun changement backend / Prisma

Aucun champ nouveau requis. `storyEffects` (JSON) et `PostMedia.thumbnailUrl`/`thumbHash`
existants suffisent. Le composite pixel-parfait reste local au device (cohérent avec RAW
publish / Prisme Linguistique — jamais de rendu baké envoyé au backend).

## 5. Séquence (contenu personnel)

```
Édition (brouillon)          Publication (en ligne ou offline)
  autosave débouncé 2.5s        StoryStaticSnapshot.render (pixel-parfait)
  → StoryStaticSnapshot.render  → CacheCoordinator.thumbnails[story-cover:<postId>]
  → CacheCoordinator.thumbnails
     [story-cover:<draftId>]

My Stories (Published / Drafts)          Tray (anneau auteur)
  cache local-first (nouveau pour           cache local-first (déjà branché,
  Published, remplace l'heuristique         aucun changement)
  brute pour Drafts)
  → fallback thumbHash/thumbnailUrl
  → fallback aplat backgroundHex
```

## 6. Tests

- **SDK** (`MeeshyUITests`) : `StoryStaticSnapshot.render` — vérifier que le `CALayer`
  produit correspond à `StoryRenderer.render(mode: .edit)` pour une slide donnée (même
  entrée que les tests existants de `StoryTextLayer` : `fontFamily` custom, `textStyle` non
  bold, couleur, rotation).
- **SDK** : non-régression `StorySlideRenderer.drawTextObject` après le remplacement de la
  résolution de police — cas `fontFamily` custom, cas `textStyle` sans override de poids.
- **App** : hook d'autosave brouillon → cover rendue et cachée sous la bonne clé
  (`story-cover:<draftId>`), guardée par `mayOverwriteStoredDraft` comme le reste de
  l'autosave.
- **App** : `MyStoryCard`/`MyStoriesView` — ordre de priorité de résolution de la cover
  (cache local > thumbHash > thumbnailUrl distant > aplat couleur), pour Published et pour
  Drafts séparément.

## 7. Hors périmètre (rappel)

- Rendu pixel-parfait pour les stories d'AUTRES utilisateurs affichées dans votre tray.
- Upload backend d'une image composite baked (« Phase 2 »).
- Backfill des stories déjà publiées.
