import SwiftUI
import Combine
import UIKit
import MeeshySDK
import PencilKit

// MARK: - StoryComposerViewModel + Lifecycle

extension StoryComposerViewModel {
    func startMemoryObserver() {
        // Idempotent : un `onAppear` répété écrasait sinon le token précédent
        // sans le retirer — observers zombies accumulés dans NotificationCenter.
        stopMemoryObserver()
        memoryObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.evictNonVisibleSlideMedia() }
        }
    }

    func stopMemoryObserver() {
        if let observer = memoryObserver {
            NotificationCenter.default.removeObserver(observer)
            memoryObserver = nil
        }
    }

    /// Evict cached media for slides not currently visible. Triggered by
    /// `UIApplication.didReceiveMemoryWarningNotification` via `startMemoryObserver`.
    /// Previously only `slideImages` (background thumbnails) and the global thumbnail
    /// cache were purged — `loadedImages` / `loadedVideoURLs` / `loadedAudioURLs` /
    /// `mediaAspectRatios` of foreground media on non-visible slides leaked, which
    /// could keep ~50 MB of UIImages around with 10 slides × 5 photos.
    /// Active-slide caches are preserved; the user is currently editing them and
    /// their re-decoding cost would be visible.
    func evictNonVisibleSlideMedia() {
        let currentSlideId = slides[safe: currentSlideIndex]?.id
        var keepIds = Set<String>()
        if currentSlideId != nil {
            for obj in (currentEffects.mediaObjects ?? []) { keepIds.insert(obj.id) }
            for obj in (currentEffects.audioPlayerObjects ?? []) { keepIds.insert(obj.id) }
        }

        for (index, slide) in slides.enumerated() where index != currentSlideIndex {
            slideImages.removeValue(forKey: slide.id)
            for obj in (slide.effects.mediaObjects ?? []) where !keepIds.contains(obj.id) {
                loadedImages.removeValue(forKey: obj.id)
                loadedVideoURLs.removeValue(forKey: obj.id)
                mediaAspectRatios.removeValue(forKey: obj.id)
            }
            for obj in (slide.effects.audioPlayerObjects ?? []) where !keepIds.contains(obj.id) {
                loadedAudioURLs.removeValue(forKey: obj.id)
            }
        }
        StoryMediaLoader.shared.clearThumbnailCache()
    }

    /// Remove temp video/audio files written during this session.
    func cleanupTempFiles() {
        for (_, url) in loadedVideoURLs {
            try? FileManager.default.removeItem(at: url)
        }
        for (_, url) in loadedAudioURLs {
            try? FileManager.default.removeItem(at: url)
        }
    }

    func reset() {
        slides = [StorySlide()]
        currentSlideIndex = 0
        slideImages = [:]
        selectedElementId = nil
        activeTool = nil
        drawingData = nil
        drawingColor = .white
        drawingWidth = 5
        activeBrushTool = .pen
        activeBrushSmoothing = .raw
        drawingEditingMode = .inactive
        backgroundColor = "#\(StoryBackgroundPalette.randomBackgroundColor())"
        openingEffect = nil
        closingEffect = nil
        retiredImages = [:]
        retiredVideoURLs = [:]
        retiredAudioURLs = [:]
        retiredSlideImages = [:]
        loadedImages = [:]
        loadedVideoURLs = [:]
        loadedAudioURLs = [:]
        loadedVideoCaptions = [:]
        isTimelineVisible = false
        timelinePlaybackTime = 0
        isTimelinePlaying = false
        timelineZoomScale = 1.0
        timelineScrollOffset = 0
        showPhotoPicker = false
        showVideoPicker = false
        showAudioPicker = false
        publishProgress = nil
        errorMessage = nil
        showDraftAlert = false
        canvasScale = 1.0
        canvasOffset = .zero
        zIndexMap = [:]
        nextZIndex = 1
    }
}
