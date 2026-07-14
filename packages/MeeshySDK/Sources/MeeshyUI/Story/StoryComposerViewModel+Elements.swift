import SwiftUI
import Combine
import UIKit
import MeeshySDK
import PencilKit

// MARK: - StoryComposerViewModel + Elements

extension StoryComposerViewModel {
    /// Pure resolver for the composer's source language.
    ///
    /// Per CLAUDE.md "Prisme Linguistique", the source language assigned to a
    /// newly authored story element (text, media, audio) MUST come from the
    /// user's in-app content preferences (`systemLanguage` then
    /// `regionalLanguage`), NEVER from the device locale or the active
    /// keyboard. A French speaker typing on an English keyboard still produces
    /// French content; using `UITextInputMode.primaryLanguage` here would
    /// mislabel that content as English and poison the translation pipeline.
    ///
    /// Resolution order matches `MeeshyUser.preferredContentLanguages` and the
    /// gateway's `resolveUserLanguage()`:
    /// 1. `systemLanguage` (primary in-app language)
    /// 2. `regionalLanguage` (secondary in-app language)
    /// 3. Hardcoded `"fr"` fallback.
    nonisolated public static func resolveComposerSourceLanguage(
        user: MeeshyUser?
    ) -> String {
        if let sys = user?.systemLanguage, !sys.isEmpty {
            return sys
        }
        if let reg = user?.regionalLanguage, !reg.isEmpty {
            return reg
        }
        return "fr"
    }

    var detectedKeyboardLanguage: String {
        Self.resolveComposerSourceLanguage(user: AuthManager.shared.currentUser)
    }

    var currentEffects: StoryEffects {
        get { currentSlide.effects }
        set {
            var slide = currentSlide
            slide.effects = newValue
            currentSlide = slide
        }
    }

    /// Ratio (largeur / hauteur) du canvas courant, piloté par l'image de fond :
    /// paysage → 16:9 horizontal, sinon 9:16 vertical par défaut. Lu par le
    /// cadrage du canvas composer (`StoryComposerView+Canvas`) — réactif car
    /// `currentEffects` dérive de `slides` (@Published).
    var currentCanvasRatio: CGFloat {
        CGFloat(currentEffects.canvasAspect.ratio)
    }

    /// Vrai si un média d'arrière-plan REMPLIT tout le canvas (aspectFill : mode
    /// `nil`/auto ou `"fill"`). Faux sans média visuel de fond, ou en mode
    /// `"fit"` (letterbox) : dans ces cas le fond ne couvre pas le canvas et on
    /// matérialise ses contours (directive user 2026-07-14).
    var backgroundFillsCanvas: Bool {
        Self.backgroundFillsCanvas(for: currentEffects)
    }

    /// Résolution pure (testable) : un fond visuel remplit le canvas sauf en
    /// mode `"fit"`. Le double-tap du fond cycle `nil` (auto = aspectFill) →
    /// `"fit"` (aspectFit) → `"fill"` (aspectFill) — seul `"fit"` laisse des
    /// bandes vides. Le fit-mode du fond vit sur `backgroundTransform`.
    static func backgroundFillsCanvas(for effects: StoryEffects) -> Bool {
        guard effects.resolvedBackgroundMedia != nil else { return false }
        return effects.backgroundTransform?.videoFitMode != "fit"
    }

    /// Ratio de canvas à PERSISTER (`nil` = portrait 9:16 par défaut) dérivé du
    /// fond d'un slide : « l'import du fond impose le cadre et forme du Canvas ».
    /// Un fond **image OU vidéo paysage** impose un canvas 16:9 — étendu aux
    /// vidéos 2026-07-11 (rapporté : un fond vidéo paysage restait ignoré,
    /// laissant la vidéo mal centrée/intégrée dans un cadre portrait 9:16 par
    /// défaut). Fond portrait/carré, ou aucun fond, reste vertical.
    static func canvasAspectRatio(forBackgroundOf effects: StoryEffects) -> Double? {
        guard let bg = effects.resolvedBackgroundMedia else { return nil }
        let aspect = StoryCanvasAspect.from(ratio: bg.aspectRatio)
        return aspect == .landscape ? aspect.ratio : nil
    }

    var isContentToolActive: Bool {
        guard let tool = activeTool else { return false }
        switch tool {
        case .media, .audio, .drawing, .text, .texture: return true
        case .filters, .timeline: return false
        }
    }

    var isDrawingActive: Bool { activeTool == .drawing }

    func saveBackgroundTransform() {
        guard let id = slides[safe: currentSlideIndex]?.id else { return }
        backgroundTransformCache[id] = backgroundTransform
    }

    func restoreBackgroundTransform() {
        guard let id = slides[safe: currentSlideIndex]?.id else {
            backgroundTransform = BackgroundTransform()
            return
        }
        backgroundTransform = backgroundTransformCache[id] ?? BackgroundTransform()
    }

    /// The current slide's background bitmap used as the base for filter-tile
    /// previews. Resolves the background media object (modern unified path,
    /// `loadedImages[bgMedia.id]`) first, then falls back to the legacy
    /// slide-level `slideImages` entry. `nil` for colour/gradient-only slides
    /// (the grid then shows its gradient placeholders). Mirrors how
    /// `SlideMiniPreview` and the canvas resolve the background image — passing
    /// only `slideImages[slide.id]` left every photo-backed slide's tiles blank
    /// because modern photos live in `mediaObjects`, not `slideImages`.
    var currentSlideBackgroundImage: UIImage? {
        if let bgId = currentSlide.effects.resolvedBackgroundMedia?.id,
           let img = loadedImages[bgId] {
            return img
        }
        return slideImages[currentSlide.id]
    }

    func setAspectRatio(_ ratio: CGFloat, for mediaId: String) {
        guard ratio.isFinite, ratio > 0 else { return }
        mediaAspectRatios[mediaId] = ratio
    }

    func beginDrag(elementId: String, position: CGPoint, size: CGSize) {
        activeDrag = ActiveDrag(elementId: elementId, position: position, size: size)
    }

    func updateDrag(position: CGPoint) {
        guard var current = activeDrag, current.position != position else { return }
        current.position = position
        activeDrag = current
    }

    func endDrag() {
        activeDrag = nil
    }

    func applyFilter(_ name: String?) {
        selectedFilter = name
        var effects = currentEffects
        effects.filter = name
        effects.filterIntensity = name != nil ? filterIntensity : nil
        currentEffects = effects
    }

    func updateFilterIntensity(_ value: Double) {
        filterIntensity = value
        var effects = currentEffects
        effects.filterIntensity = value
        currentEffects = effects
    }

    var isCanvasZoomed: Bool { canvasScale != 1.0 }

    func resetCanvasZoom() {
        canvasScale = 1.0
        canvasOffset = .zero
    }

    /// Returns the normalized (0-1) canvas position corresponding to the current viewport center.
    /// When zoomed/panned, new elements should appear at the visible center, not at (0.5, 0.5).
    func viewportCenter() -> CGPoint {
        guard canvasSize.width > 0, canvasSize.height > 0, canvasScale > 0 else {
            return CGPoint(x: 0.5, y: 0.5)
        }
        let nx = 0.5 - canvasOffset.width / (canvasScale * canvasSize.width)
        let ny = 0.5 - canvasOffset.height / (canvasScale * canvasSize.height)
        return CGPoint(
            x: max(0.05, min(0.95, nx)),
            y: max(0.05, min(0.95, ny))
        )
    }

    var textCount: Int { currentEffects.textObjects.count }

    var mediaCount: Int {
        (currentEffects.mediaObjects?.count ?? 0) +
        (currentEffects.audioPlayerObjects?.count ?? 0)
    }

    var canAddText: Bool { textCount < 5 }

    var canAddMedia: Bool { mediaCount < 10 }

    var canAddImage: Bool {
        canAddMedia &&
        (currentEffects.mediaObjects?.filter { $0.kind == .image }.count ?? 0) < 5
    }

    var canAddVideo: Bool {
        canAddMedia &&
        (currentEffects.mediaObjects?.filter { $0.kind == .video }.count ?? 0) < 4
    }

    var canAddAudio: Bool {
        canAddMedia &&
        (currentEffects.audioPlayerObjects?.count ?? 0) < 5
    }

    @discardableResult
    func addText() -> StoryTextObject? {
        guard canAddText else { return nil }
        let center = CGPoint(x: 0.5, y: 0.5)
        // fontSize en design units (référentiel 1080-px). 96 design ≈ 36 pt
        // sur iPhone 16 Pro (scaleFactor ≈ 0.38) — taille parfaitement
        // lisible. La valeur précédente de 24 produisait du 9 pt rendu
        // (et un editor inline minuscule au moment de saisir).
        let obj = StoryTextObject(
            text: "",
            x: center.x,
            y: center.y,
            scale: 1.0,
            rotation: 0,
            fontSize: 96,
            textStyle: "classic",
            textColor: "FFFFFF",
            textAlign: "center",
            sourceLanguage: detectedKeyboardLanguage
        )
        var effects = currentEffects
        var texts = effects.textObjects
        texts.append(obj)
        effects.textObjects = texts
        currentEffects = effects
        selectedElementId = obj.id
        bringToFront(id: obj.id)
        activeTool = .text
        // `bringToFront` persists a new `zIndex` onto the stored object — return
        // the post-mutation copy so callers never see a stale `zIndex`.
        return currentEffects.textObjects.first { $0.id == obj.id } ?? obj
    }

    /// C13 — les stickers suivent le modèle moderne : `currentEffects` est la
    /// SEULE source de vérité (parité addText). L'ancien chemin @State View
    /// canvas-authored révertait les mutations VM/canvas au sync suivant.
    /// Décalage en cascade pour que des ajouts successifs ne s'empilent pas
    /// exactement au même point.
    @discardableResult
    func addSticker(emoji: String) -> StorySticker {
        let count = currentEffects.stickerObjects?.count ?? 0
        let offset = Double(count % 5) * 0.04
        let sticker = StorySticker(emoji: emoji, x: 0.5 + offset, y: 0.5 + offset)
        var effects = currentEffects
        var stickers = effects.stickerObjects ?? []
        stickers.append(sticker)
        effects.stickerObjects = stickers
        currentEffects = effects
        bringToFront(id: sticker.id)
        return currentEffects.stickerObjects?.first { $0.id == sticker.id } ?? sticker
    }

    @discardableResult
    func addMediaObject(kind: StoryMediaKind, toSlideId: String? = nil) -> StoryMediaObject? {
        guard canAddMedia else { return nil }
        // Resolve the target slide. If the caller pinned a specific id (e.g., the
        // PhotosPicker started on slide 0 and the user switched to slide 1 mid-load),
        // honour it — without this guard, the new media object would be appended to
        // whichever slide happened to be active when the async task resolved.
        let targetSlideIndex: Int = {
            if let id = toSlideId, let idx = slides.firstIndex(where: { $0.id == id }) {
                return idx
            }
            return currentSlideIndex
        }()
        guard slides.indices.contains(targetSlideIndex) else { return nil }

        let center = CGPoint(x: 0.5, y: 0.5)
        var targetEffects = slides[targetSlideIndex].effects
        // Auto-background uniquement si la slide n'a aucun media visuel (pre-migration
        // inclus : resolvedBackgroundMedia retombe sur le 1er existant). Un fond
        // statique stocké dans `slideImages` (slide-level bg image) compte aussi
        // comme background — sans ce check, un media ajouté APRÈS un setImage(...)
        // serait incorrectement marqué bg, masquerait l'image, et briserait le
        // synthetic-clip injecté par loadCurrentSlideIntoTimeline.
        let hasSlideLevelBgImage = slideImages[slides[targetSlideIndex].id] != nil
        let shouldBeBackground = targetEffects.resolvedBackgroundMedia == nil && !hasSlideLevelBgImage
        let obj = StoryMediaObject(
            postMediaId: "",
            kind: kind,
            placement: "media",
            aspectRatio: 1.0, // TODO Phase 2/3: compute real aspectRatio from asset
            x: center.x,
            y: center.y,
            scale: 1.0,
            rotation: 0,
            volume: 1.0,
            // Bg media loops by default so a short video/asset covers the
            // full slide duration. Without this, `StoryMediaObject.loop`
            // defaults to false → `bgVideo.loop ?? true` in StoryRenderer
            // never falls back to true → AVPlayerLooper never armed → video
            // stops at its native end while the slide progress bar continues
            // (user report 2026-05-27).
            isBackground: shouldBeBackground,
            loop: shouldBeBackground,
            sourceLanguage: detectedKeyboardLanguage
        )
        var medias = targetEffects.mediaObjects ?? []
        medias.append(obj)
        targetEffects.mediaObjects = medias
        slides[targetSlideIndex].effects = targetEffects
        // Selection / z-index state is composer-global; only mutate it when we're
        // actually adding to the currently-visible slide so the UI doesn't jump.
        if targetSlideIndex == currentSlideIndex {
            selectedElementId = obj.id
            bringToFront(id: obj.id)
        }
        return obj
    }

    /// Pin the natural asset duration on a media object so the reader's
    /// visibility window matches the actual playback length. Idempotent: a
    /// later trim from the timeline editor overwrites this baseline.
    func setMediaDuration(id: String, duration: Float, slideId: String? = nil) {
        let targetIndex: Int = {
            if let slideId, let idx = slides.firstIndex(where: { $0.id == slideId }) {
                return idx
            }
            return currentSlideIndex
        }()
        guard slides.indices.contains(targetIndex) else { return }
        var effects = slides[targetIndex].effects
        guard var medias = effects.mediaObjects,
              let mediaIdx = medias.firstIndex(where: { $0.id == id }) else { return }
        medias[mediaIdx].duration = Double(duration)
        effects.mediaObjects = medias
        slides[targetIndex].effects = effects
    }

    /// Set the `mediaURL` on a `StoryMediaObject`. Called after persisting
    /// a composer-loaded UIImage to a temp file so the CALayer canvas
    /// (`StoryMediaLayer.configureImage`) can load it via `file://` URL.
    /// Without this bridge the media object's `mediaURL` stays `nil` and the
    /// layer renders a black rectangle.
    func setMediaURL(id: String, url: String, slideId: String? = nil) {
        let targetIndex: Int = {
            if let slideId, let idx = slides.firstIndex(where: { $0.id == slideId }) {
                return idx
            }
            return currentSlideIndex
        }()
        guard slides.indices.contains(targetIndex) else { return }
        var effects = slides[targetIndex].effects
        guard var medias = effects.mediaObjects,
              let mediaIdx = medias.firstIndex(where: { $0.id == id }) else { return }
        medias[mediaIdx].mediaURL = url
        effects.mediaObjects = medias
        slides[targetIndex].effects = effects
    }

    /// Met à jour l'aspectRatio (width/height) d'un media. Appelé après le
    /// pick PhotosPicker / record une fois que l'asset natural size est
    /// mesurée via `UIImage.size` (image) ou `AVAssetTrack.naturalSize` +
    /// `preferredTransform` (vidéo). Sans ça, l'aspectRatio reste à 1.0 et
    /// la layer est rendue en carré 540x540 (cf. `baseMediaDesignSize`).
    func setMediaAspectRatio(id: String, aspectRatio: Double, slideId: String? = nil) {
        guard aspectRatio.isFinite, aspectRatio > 0 else { return }
        let targetIndex: Int = {
            if let slideId, let idx = slides.firstIndex(where: { $0.id == slideId }) {
                return idx
            }
            return currentSlideIndex
        }()
        guard slides.indices.contains(targetIndex) else { return }
        var effects = slides[targetIndex].effects
        guard var medias = effects.mediaObjects,
              let mediaIdx = medias.firstIndex(where: { $0.id == id }) else { return }
        medias[mediaIdx].aspectRatio = aspectRatio
        effects.mediaObjects = medias
        // « L'import de l'image de fond impose le cadre et forme du Canvas » : dès
        // que la forme réelle du fond est connue (mesure asset après import, ou
        // recadrage), le ratio du canvas suit — paysage → 16:9, sinon 9:16.
        effects.canvasAspectRatio = Self.canvasAspectRatio(forBackgroundOf: effects)
        slides[targetIndex].effects = effects
        // Miroir dans le side-cache si d'autres surfaces le lisent.
        mediaAspectRatios[id] = CGFloat(aspectRatio)
    }

    @discardableResult
    func addAudioObject() -> StoryAudioPlayerObject? {
        guard canAddMedia else { return nil }
        let center = CGPoint(x: 0.5, y: 0.5)
        // Auto-bascule en background si aucun audio n'est déjà en background
        // (ni via isBackground=true, ni via le champ legacy backgroundAudioId).
        let hasExistingBackgroundAudio = currentEffects.resolvedBackgroundAudio != nil
        let obj = StoryAudioPlayerObject(
            postMediaId: "",
            placement: "overlay",
            x: center.x,
            y: min(0.9, center.y + 0.15),
            volume: 1.0,
            waveformSamples: [],
            isBackground: hasExistingBackgroundAudio ? nil : true,
            sourceLanguage: detectedKeyboardLanguage
        )
        var effects = currentEffects
        var audios = effects.audioPlayerObjects ?? []
        audios.append(obj)
        effects.audioPlayerObjects = audios
        currentEffects = effects
        selectedElementId = obj.id
        bringToFront(id: obj.id)
        return obj
    }

    func deleteElement(id: String) {
        // Defensive guard : a locked text object (e.g. the repost-attribution
        // badge from `init(reposting:authorHandle:)`) cannot be deleted from
        // any path — context menu, timeline panel, contextual toolbar, etc.
        // The UI already hides these affordances on locked elements, but a
        // central refusal here closes any future call site we might miss.
        if currentEffects.textObjects.first(where: { $0.id == id })?.isLocked == true {
            return
        }
        var effects = currentEffects
        effects.textObjects.removeAll { $0.id == id }
        effects.mediaObjects?.removeAll { $0.id == id }
        effects.audioPlayerObjects?.removeAll { $0.id == id }
        effects.stickerObjects?.removeAll { $0.id == id }
        // Retirer l'image de fond rend au canvas sa forme verticale par défaut.
        effects.canvasAspectRatio = Self.canvasAspectRatio(forBackgroundOf: effects)
        currentEffects = effects
        if selectedElementId == id { selectedElementId = nil }
        // Si on supprime le texte en cours d'édition flottante, sortir du mode.
        if textEditingMode.activeTextId == id { textEditingMode = .inactive }
        // C9 Inc.3 — retrait PARESSEUX : l'historique global peut restaurer
        // cet élément ; ses ressources partent en staging, pas à la poubelle.
        if let img = loadedImages.removeValue(forKey: id) { retiredImages[id] = img }
        if let url = loadedVideoURLs.removeValue(forKey: id) { retiredVideoURLs[id] = url }
        if let url = loadedAudioURLs.removeValue(forKey: id) { retiredAudioURLs[id] = url }
        mediaAspectRatios.removeValue(forKey: id)
        zIndexMap.removeValue(forKey: id)
    }

    func updateElementLanguage(elementId: String, language: String) {
        var effects = currentEffects

        if let idx = effects.textObjects.firstIndex(where: { $0.id == elementId }) {
            effects.textObjects[idx].sourceLanguage = language
        }

        if var medias = effects.mediaObjects,
           let idx = medias.firstIndex(where: { $0.id == elementId }) {
            medias[idx].sourceLanguage = language
            effects.mediaObjects = medias
        }

        if var audios = effects.audioPlayerObjects,
           let idx = audios.firstIndex(where: { $0.id == elementId }) {
            audios[idx].sourceLanguage = language
            effects.audioPlayerObjects = audios
        }

        currentEffects = effects
    }

    func duplicateElement(id: String) {
        var effects = currentEffects
        if var text = effects.textObjects.first(where: { $0.id == id }) {
            // Locked text objects (repost-attribution badge) are not duplicable —
            // duplicating would create a second editable copy that strips intent.
            if text.isLocked == true { return }
            guard canAddText else { return }
            text.id = UUID().uuidString
            // Offset is 20 design pixels in the 1080x1920 canvas (≈2% x, ≈1% y).
            // Small enough that the clone visibly overlaps its source so the
            // user sees the duplication happened, large enough to be selectable
            // independently. The previous 0.05 (54 design px) was too wide and
            // jumped the clone outside the source's selection rect.
            text.x = min(1.0, text.x + 20.0 / 1080.0)
            text.y = min(1.0, text.y + 20.0 / 1920.0)
            effects.textObjects.append(text)
            selectedElementId = text.id
        } else if var media = effects.mediaObjects?.first(where: { $0.id == id }) {
            guard canAddMedia else { return }
            let newId = UUID().uuidString
            media.id = newId
            // Le clone est TOUJOURS un foreground : dupliquer un média de fond
            // créait un 2e background (invariant « au plus 1 background / slide »
            // violé) qui remplit tout le canvas en ignorant l'offset → clone
            // invisible (l'utilisateur ne voyait rien). Bug 2026-06-01.
            media.isBackground = false
            media.x = min(1.0, media.x + 0.05)
            media.y = min(1.0, media.y + 0.05)
            effects.mediaObjects?.append(media)
            if let img = loadedImages[id] { loadedImages[newId] = img }
            if let url = loadedVideoURLs[id] { loadedVideoURLs[newId] = url }
            selectedElementId = media.id
        } else if var audio = effects.audioPlayerObjects?.first(where: { $0.id == id }) {
            guard canAddMedia else { return }
            let newId = UUID().uuidString
            audio.id = newId
            // Idem média : le clone est foreground, sinon dupliquer l'audio de
            // fond créait un 2e background audio (invariant « 1 audio de fond /
            // slide » violé). Bug 2026-06-01.
            audio.isBackground = false
            audio.x = min(1.0, audio.x + 0.05)
            audio.y = min(1.0, audio.y + 0.05)
            effects.audioPlayerObjects?.append(audio)
            if let url = loadedAudioURLs[id] { loadedAudioURLs[newId] = url }
            selectedElementId = audio.id
        }
        currentEffects = effects
    }

    /// Bascule le statut background pour un media visuel OU un audio.
    /// Contrainte : au plus 1 media visuel en background + 1 audio en background par slide.
    /// Toggle ON sur un élément → les autres du même type sont repassés en foreground.
    /// Toggle OFF → l'élément redevient foreground (aucun autre n'est promu automatiquement).
    func toggleBackground(id: String) {
        var effects = currentEffects

        if let idx = effects.mediaObjects?.firstIndex(where: { $0.id == id }) {
            let current = effects.mediaObjects![idx].isBackground == true
                // Si le media est le background implicite (pas de flag explicite mais
                // positionné par la règle legacy), on considère qu'il est déjà en bg.
                || effects.resolvedBackgroundMedia?.id == id
            let newValue = !current
            if newValue {
                for i in effects.mediaObjects!.indices {
                    effects.mediaObjects![i].isBackground = (i == idx) ? true : false
                }
            } else {
                // Matérialise le flag à `false` pour neutraliser la règle legacy.
                effects.mediaObjects![idx].isBackground = false
            }
            // Promotion → le canvas épouse la forme du nouveau fond ; rétrogradation
            // → retour au canvas vertical par défaut (plus aucune image de fond).
            effects.canvasAspectRatio = Self.canvasAspectRatio(forBackgroundOf: effects)
            currentEffects = effects
            return
        }

        if let idx = effects.audioPlayerObjects?.firstIndex(where: { $0.id == id }) {
            let current = effects.audioPlayerObjects![idx].isBackground == true
            let newValue = !current
            if newValue {
                for i in effects.audioPlayerObjects!.indices {
                    effects.audioPlayerObjects![i].isBackground = (i == idx) ? true : false
                }
                // Toggle ON sur un audio foreground → on retire aussi le bg legacy pour
                // éviter d'avoir 2 audios bg qui jouent en parallèle.
                effects.backgroundAudioId = nil
                effects.backgroundAudioVolume = nil
                effects.backgroundAudioStart = nil
                effects.backgroundAudioEnd = nil
                effects.backgroundAudioVariants = nil
            } else {
                effects.audioPlayerObjects![idx].isBackground = false
            }
            currentEffects = effects
        }
    }

    /// True si l'élément (media ou audio) est actuellement résolu comme background.
    func isBackground(id: String) -> Bool {
        if currentEffects.resolvedBackgroundMedia?.id == id { return true }
        if currentEffects.resolvedBackgroundAudio?.id == id { return true }
        return false
    }

    /// Volume d'un audio (clamp [0, 1]). No-op si l'id ne match aucun audio.
    func setAudioVolume(audioId: String, volume: Float) {
        var effects = currentEffects
        guard var audios = effects.audioPlayerObjects,
              let i = audios.firstIndex(where: { $0.id == audioId }) else { return }
        audios[i].volume = max(0, min(1, volume))
        effects.audioPlayerObjects = audios
        currentEffects = effects
    }

    func selectTool(_ tool: StoryToolMode?) {
        if activeTool == tool {
            activeTool = nil
        } else {
            activeTool = tool
        }
        if tool == .drawing {
            selectedElementId = nil
        }
    }

    func deselectAll() {
        selectedElementId = nil
        activeTool = nil
    }
}
