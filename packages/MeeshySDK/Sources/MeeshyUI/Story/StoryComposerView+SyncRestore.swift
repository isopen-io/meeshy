import SwiftUI
import UIKit
import os
import PhotosUI
import UniformTypeIdentifiers
import AVFoundation
import MeeshySDK

// MARK: - StoryComposerView + SyncRestore

extension StoryComposerView {
    /// Décale le canvas vers le haut juste assez pour que le texte édité reste
    /// au-dessus de (clavier + barre d'outils). Basé sur la position normalisée
    /// `y` du modèle — pas de pont de coordonnées UIKit↔SwiftUI.
    func recomputeCanvasShift() {
        guard keyboardHeight > 0,
              let id = viewModel.textEditingMode.activeTextId,
              let textObj = viewModel.currentEffects.textObjects.first(where: { $0.id == id }),
              canvasNaturalFrame.height > 0 else {
            canvasEditShift = 0
            return
        }
        let toolbarHeight: CGFloat = 132   // barre bulles + marge (ajuster au visuel)
        let margin: CGFloat = 24
        // Use the active window's height (NOT UIScreen.main.bounds.height),
        // so split-screen / Stage Manager / iPad multitasking report the
        // window the composer actually lives in instead of the full display.
        let screenHeight = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.windows.first(where: { $0.isKeyWindow })?.bounds.height
            ?? UIScreen.main.bounds.height
        let textCenterY = canvasNaturalFrame.minY
            + CGFloat(textObj.y) * canvasNaturalFrame.height
        let visibleBottom = screenHeight - keyboardHeight - toolbarHeight - margin
        canvasEditShift = max(0, textCenterY - visibleBottom)
    }

    func syncCurrentSlideEffects() {
        viewModel.currentEffects = buildEffects()
    }

    /// Resets every composer-local `@State` that feeds `buildEffects()` or
    /// otherwise mirrors slide content. Must be called immediately after
    /// `viewModel.reset()` (or any other operation that drops all slides)
    /// to prevent the `granularCanvasSync` sync modifiers from re-injecting
    /// orphaned local state into the fresh empty slide.
    ///
    /// Scope: covers every `@State` read by `buildEffects()` plus the
    /// transient picker / editor scratch state. Intentionally does NOT
    /// touch user preferences (`storyLanguage`, `visibility`), the
    /// in-flight loading indicators, or sheet-presentation booleans.
    func resetLocalState() {
        // Canvas-local state (read by buildEffects via canvasSyncFingerprint)
        selectedFilter = nil
        selectedImage = nil
        stickerObjects = []

        // Transitions (read by buildEffects)
        openingEffect = nil
        closingEffect = nil

        // Background audio panel (read by buildEffects)
        selectedAudioId = nil
        selectedAudioTitle = nil
        audioVolume = 0.7
        audioTrimStart = 0
        audioTrimEnd = 0

        // Picker / editor scratch state — would otherwise resurrect
        // half-finished media flows on the freshly reset canvas.
        fgMediaItem = nil
        editingBgImage = nil
        editingElementImage = nil
        editingElementVideo = nil
        confirmedMediaAudioURL = nil
        lostMediaCount = 0
    }

    func restoreCanvas(from slide: StorySlide) {
        let e = slide.effects
        if let bgHex = e.background { viewModel.backgroundColor = "#\(bgHex)" }
        else { viewModel.backgroundColor = "#\(StoryBackgroundPalette.randomBackgroundColor())" }
        selectedImage = viewModel.slideImages[slide.id]
        viewModel.hasBackgroundImage = selectedImage != nil
        stickerObjects = e.stickerObjects ?? []
        selectedFilter = e.filter.flatMap { StoryFilter(rawValue: $0) }
        openingEffect = e.opening
        closingEffect = e.closing
        selectedAudioId = e.backgroundAudioId
        selectedAudioTitle = selectedAudioId != nil ? "Audio" : nil
        audioVolume = e.backgroundAudioVolume ?? 0.7
        audioTrimStart = e.backgroundAudioStart ?? 0
        audioTrimEnd = e.backgroundAudioEnd ?? 0
        // Refonte dessin (2026-05-30) : le dessin est porté par `currentEffects`
        // (`drawingStrokes` moderne + `drawingData` legacy decode-only). Le composer
        // ne maintient plus de `PKCanvasView` local — la capture passe par
        // `StrokeCaptureLayer` et le rendu par `MeeshyStrokeCanvas` / `StoryRenderer`.
        viewModel.drawingData = e.drawingData
        if let bt = e.backgroundTransform {
            viewModel.backgroundTransform = StoryComposerViewModel.BackgroundTransform(
                scale: bt.scale ?? 1.0, offsetX: bt.offsetX ?? 0,
                offsetY: bt.offsetY ?? 0, rotation: bt.rotation ?? 0,
                videoFitMode: bt.videoFitMode
            )
        } else {
            viewModel.backgroundTransform = StoryComposerViewModel.BackgroundTransform()
        }
    }

    func buildEffects() -> StoryEffects {
        let bgHex = selectedImage != nil ? nil : viewModel.backgroundColor.replacingOccurrences(of: "#", with: "")
        let bt = viewModel.backgroundTransform
        let bgTransform = StoryBackgroundTransform(
            scale: bt.scale != 1.0 ? bt.scale : nil,
            offsetX: bt.offsetX != 0 ? bt.offsetX : nil,
            offsetY: bt.offsetY != 0 ? bt.offsetY : nil,
            rotation: bt.rotation != 0 ? bt.rotation : nil,
            videoFitMode: bt.videoFitMode
        )
        // Voice fields are NOT a function of the composer's @State — they live
        // entirely on `viewModel.currentEffects` (set by the voice recorder /
        // TTS pipeline). Re-emitting them here ensures `buildEffects()` is the
        // FULL slide snapshot and not a partial overwrite. Same for
        // `backgroundAudioVariants` (TTS variants per language). Without this,
        // every slide-switch + sync wiped the voice payload.
        let current = viewModel.currentEffects
        return StoryEffects(
            background: bgHex,
            // Read the filter from `currentEffects` (the authoritative source the
            // active filter grid writes via `viewModel.applyFilter`), NOT the
            // View-local `@State selectedFilter` which only the vestigial legacy
            // picker updates. Reading the stale @State made `buildEffects()`
            // overwrite the slide's effects with `filter: nil`, so the Play
            // preview (and publish) lost the effect even though the composer
            // canvas showed it. Bug « effet pas préservé dans le preview » 2026-06-03.
            filter: current.filter,
            filterIntensity: current.filterIntensity,
            stickers: stickerObjects.isEmpty ? nil : stickerObjects.map(\.emoji),
            stickerObjects: stickerObjects.isEmpty ? nil : stickerObjects,
            drawingData: viewModel.drawingData,
            // Refonte dessin (2026-05-30) : `drawingStrokes` est la source de vérité
            // moderne. `buildEffects` reconstruit l'effet from scratch, donc on doit
            // ré-émettre les traits sinon ils sont effacés à chaque sync de slide.
            drawingStrokes: viewModel.drawingStrokes.isEmpty ? nil : viewModel.drawingStrokes,
            backgroundAudioId: selectedAudioId,
            backgroundAudioVolume: selectedAudioId != nil ? audioVolume : nil,
            backgroundAudioStart: selectedAudioId != nil ? audioTrimStart : nil,
            backgroundAudioEnd: selectedAudioId != nil && audioTrimEnd > 0 ? audioTrimEnd : nil,
            voiceAttachmentId: current.voiceAttachmentId,
            voiceTranscriptions: current.voiceTranscriptions,
            opening: openingEffect,
            closing: closingEffect,
            textObjects: current.textObjects,
            mediaObjects: current.mediaObjects,
            audioPlayerObjects: current.audioPlayerObjects,
            backgroundAudioVariants: current.backgroundAudioVariants,
            backgroundTransform: bgTransform.isIdentity ? nil : bgTransform,
            // `slideDuration: nil` — la durée n'est plus stockée dans
            // `effects`. Le viewer la recalcule from-scratch via
            // `StorySlide.computedTotalDuration()` (cf. centralisation
            // 2026-05-28). Évite que les vieilles valeurs persistées
            // (12 s, etc.) écrasent le défaut 6 s pour les statics.
            slideDuration: nil
        )
    }

    /// Persiste le draft (GRDB + fichiers média) sans feedback haptique —
    /// utilisé par l'auto-save background (D1) où un haptic n'a pas de sens.
    func persistDraft() {
        syncCurrentSlideEffects()
        StoryDraftStore.shared.save(slides: viewModel.slides, visibility: visibility)
        StoryDraftStore.shared.saveMedia(
            images: viewModel.loadedImages,
            videoURLs: viewModel.loadedVideoURLs,
            audioURLs: viewModel.loadedAudioURLs
        )
    }

    func saveDraft() {
        persistDraft()
        HapticFeedback.light()
    }

    /// D1 — auto-save au passage en background : une story en cours d'édition
    /// survit au kill de l'app. Gates : contenu réel uniquement (jamais un
    /// composer vide) et pas de publication en vol (`publishTask` actif =
    /// l'upload possède l'état). Un discard explicite postérieur
    /// (`cancelAndDismiss` → `clearAllDrafts`) efface ce qui a été auto-sauvé.
    /// JAMAIS sur onDisappear : le discard fire onDisappear et
    /// re-persisterait le draft que l'utilisateur vient de jeter.
    func autoSaveDraftForBackground() {
        guard composerHasContent, publishTask == nil else { return }
        persistDraft()
    }

    func checkForDraft() {
        if StoryDraftStore.shared.load() != nil {
            showRestoreDraftAlert = true
        } else if UserDefaults.standard.data(forKey: StoryComposerDraft.userDefaultsKey) != nil {
            showRestoreDraftAlert = true
        }
    }

    func restoreDraft() {
        if let stored = StoryDraftStore.shared.load() {
            viewModel.slides = stored.slides.isEmpty ? [StorySlide()] : stored.slides
            viewModel.currentSlideIndex = 0
            visibility = stored.visibility
            let media = StoryDraftStore.shared.loadMedia()
            viewModel.loadedImages.merge(media.images) { _, new in new }
            viewModel.loadedVideoURLs.merge(media.videoURLs) { _, new in new }
            viewModel.loadedAudioURLs.merge(media.audioURLs) { _, new in new }

            // Surface lost media (file purged by OS, deleted via Files app, etc.)
            // explicitly to the user via an alert. The DB rows are also purged
            // so the next restore doesn't repeat the warning.
            if !media.lostElementIds.isEmpty {
                StoryDraftStore.shared.purgeLostMedia(media.lostElementIds)
                lostMediaCount = media.lostElementIds.count
            }
        } else if let data = UserDefaults.standard.data(forKey: StoryComposerDraft.userDefaultsKey),
                  let draft = try? JSONDecoder().decode(StoryComposerDraft.self, from: data) {
            viewModel.slides = draft.slides.isEmpty ? [StorySlide()] : draft.slides
            viewModel.currentSlideIndex = 0
            visibility = draft.visibilityPreference
        }
        if let first = viewModel.slides.first {
            restoreCanvas(from: first)
        }
    }

    func clearAllDrafts() {
        StoryDraftStore.shared.clear()
        UserDefaults.standard.removeObject(forKey: StoryComposerDraft.userDefaultsKey)
    }
}
