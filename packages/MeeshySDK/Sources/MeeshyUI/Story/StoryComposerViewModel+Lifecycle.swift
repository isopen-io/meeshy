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

    /// **Une alerte mémoire purge des CACHES, jamais la composition** (#6922).
    ///
    /// Cette fonction retirait de `loadedImages`, `slideImages`,
    /// `loadedVideoURLs` et `loadedAudioURLs` tout ce qui n'était pas sur la
    /// scène courante. Or ces dictionnaires ne sont pas des caches : ce sont les
    /// SEULES références de ce que l'auteur a posé, et la publication les lit
    /// telles quelles (`onPublishAllInBackground`). Une alerte mémoire pendant
    /// la troisième scène d'un post faisait donc partir les deux premières
    /// sans leur photo ni leur vidéo — en silence, sans retour possible.
    ///
    /// Ce qui borne la mémoire désormais, c'est la TAILLE de chaque photo
    /// (`SceneImageDownsampling.workingMaxPixelSize`, la taille publiée). Sous
    /// pression, on ne lâche que ce qui se recalcule : vignettes de scène et
    /// vignettes vidéo.
    func evictNonVisibleSlideMedia() {
        SceneThumbnailCache.shared.removeAll()
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

    /// **`public` depuis le 2026-08-27** : un meuble app qui incruste la scène
    /// doit pouvoir offrir « tout effacer » sans monter l'atelier. Point
    /// d'entrée de BUILDING BLOCK — il remet la composition à zéro et rien
    /// d'autre ; quand l'effacer et ce qu'il faut effacer À CÔTÉ (le média du
    /// document, le lieu, la transcription) reste une décision app.
    public func reset() {
        // **`carriedContentSources` DOIT tomber ici, et ne tombait pas.**
        // C'est le cache d'idempotence d'`applyContentMedia` : « cette URL a
        // déjà été portée dans CETTE composition ». Une composition remise à
        // zéro n'a plus rien porté — le garder faisait qu'après un reset, la
        // MÊME photo re-choisie était silencieusement sautée et n'atteignait
        // jamais la scène. Défaut latent depuis B1 : personne ne l'avait vu
        // parce que le seul appelant de `reset()` était « supprimer tous les
        // slides » dans l'atelier, dont le chemin de reprise passe par le
        // picker de l'atelier et non par `applyContentMedia`.
        carriedContentSources = []
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
        isDrawingImmersive = false
        backgroundColor = "#\(StoryBackgroundPalette.randomBackgroundColor())"
        openingEffect = nil
        closingEffect = nil
        retiredImages = [:]
        retiredVideoURLs = [:]
        retiredStickerAnimations = [:]
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
