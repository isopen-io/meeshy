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

    /// Snapshot des champs de `StoryEffects` dont le CANVAS composer (View
    /// `@State` + props ViewModel dédiées) est l'auteur. Tout champ ABSENT
    /// d'ici est, par construction, conservé tel quel depuis `currentEffects`
    /// par `mergeEffects` — c'est le renversement qui ferme la classe de bug
    /// « champ autoritaire oublié par buildEffects » (voice 2026-05, filter
    /// 2026-06-03, drawingStrokes 2026-05-30, timelineDuration/clipTransitions
    /// E2 2026-07-03).
    struct CanvasAuthoredState {
        var backgroundHex: String?
        var stickerObjects: [StorySticker] = []
        var drawingData: Data?
        var drawingStrokes: [StoryDrawingStroke] = []
        var backgroundAudioId: String?
        var audioVolume: Float = 1.0
        var audioTrimStart: TimeInterval = 0
        var audioTrimEnd: TimeInterval = 0
        var opening: StoryTransitionEffect?
        var closing: StoryTransitionEffect?
        var backgroundTransform: StoryBackgroundTransform?
    }

    /// Cœur PUR de `buildEffects()` : copie intégrale de `current` (aucun
    /// champ ne peut plus être perdu silencieusement) puis écrase UNIQUEMENT
    /// les champs pilotés par le canvas. Les champs pilotés ailleurs — filter
    /// (grid → `applyFilter`), voice (recorder/TTS), textObjects/mediaObjects/
    /// audioPlayerObjects (canvas objets), timelineDuration/clipTransitions
    /// (Timeline), thumbHash (publish) — traversent sans ré-émission manuelle.
    static func mergeEffects(current: StoryEffects, canvas: CanvasAuthoredState) -> StoryEffects {
        var effects = current
        effects.background = canvas.backgroundHex
        effects.stickers = canvas.stickerObjects.isEmpty ? nil : canvas.stickerObjects.map(\.emoji)
        effects.stickerObjects = canvas.stickerObjects.isEmpty ? nil : canvas.stickerObjects
        effects.drawingData = canvas.drawingData
        effects.drawingStrokes = canvas.drawingStrokes.isEmpty ? nil : canvas.drawingStrokes
        effects.backgroundAudioId = canvas.backgroundAudioId
        effects.backgroundAudioVolume = canvas.backgroundAudioId != nil ? canvas.audioVolume : nil
        effects.backgroundAudioStart = canvas.backgroundAudioId != nil ? canvas.audioTrimStart : nil
        effects.backgroundAudioEnd = canvas.backgroundAudioId != nil && canvas.audioTrimEnd > 0
            ? canvas.audioTrimEnd : nil
        effects.opening = canvas.opening
        effects.closing = canvas.closing
        effects.backgroundTransform = canvas.backgroundTransform.flatMap { $0.isIdentity ? nil : $0 }
        // `slideDuration = nil` — la durée n'est plus stockée dans `effects`.
        // Le viewer la recalcule via `StorySlide.computedTotalDuration()`
        // (centralisation 2026-05-28) ; `timelineDuration` reste, lui, la
        // valeur AUTORITAIRE posée par la Timeline et traverse par copie.
        effects.slideDuration = nil
        return effects
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
        return Self.mergeEffects(
            current: viewModel.currentEffects,
            canvas: CanvasAuthoredState(
                backgroundHex: bgHex,
                stickerObjects: stickerObjects,
                drawingData: viewModel.drawingData,
                drawingStrokes: viewModel.drawingStrokes,
                backgroundAudioId: selectedAudioId,
                audioVolume: audioVolume,
                audioTrimStart: audioTrimStart,
                audioTrimEnd: audioTrimEnd,
                opening: openingEffect,
                closing: closingEffect,
                backgroundTransform: bgTransform
            )
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
