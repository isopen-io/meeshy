import SwiftUI
import UIKit
import os
import PhotosUI
import UniformTypeIdentifiers
import AVFoundation
import MeeshySDK

// MARK: - StoryComposerView + Publication

extension StoryComposerView {
    // MARK: - Pickers
    var transitionPicker: some View {
        Text(String(localized: "story.composer.transitions", defaultValue: "Transitions", bundle: .module))
            .foregroundColor(.white)
    }

    func publishAllSlides() {
        // Pré-calcul des thumbHashes (image + vidéo) avant le hand-off vers
        // l'uploader background. La génération vidéo est async via
        // `AVAssetImageGenerator.image(at:)` (iOS 16+) ; on cap chaque média
        // à 5s puis on continue avec thumbHash = nil pour ne pas bloquer.
        publishTask?.cancel()
        publishTask = Task { @MainActor in
            // `defer` garantit le reset de @publishTask même si la Task est
            // annulée mid-flight (handleDismiss / quit pendant le compute des
            // thumbHashes). Sans ça, `publishTask != nil` reste true et le
            // bouton publier reste disabled si l'utilisateur réessaye.
            defer { publishTask = nil }
            syncCurrentSlideEffects()
            let snapshot = await snapshotAllSlides()
            guard !Task.isCancelled else { return }
            clearAllDrafts()
            HapticFeedback.success()
            let mode = PostVisibility(rawValue: visibility) ?? .public
            let ids = mode.requiresUserSelection ? visibilityUserIds : []
            onPublishAllInBackground(snapshot.slides, snapshot.bgImages, viewModel.loadedImages, viewModel.loadedVideoURLs, viewModel.loadedAudioURLs, storyLanguage, visibility, ids)
        }
    }

    func snapshotAllSlides() async -> (slides: [StorySlide], bgImages: [String: UIImage]) {
        var slides = viewModel.slides
        let idx = viewModel.currentSlideIndex
        if idx < slides.count {
            slides[idx].effects = buildEffects()
        }
        // NB : on n'écrit plus `effects.slideDuration` à chaque publish
        // depuis la centralisation 2026-05-28. La durée est entièrement
        // dérivée from-scratch côté lecteur par
        // `StorySlide.computedTotalDuration()` (bg media duration loop /
        // texte long / défaut 6s). Le champ `effects.slideDuration` reste
        // dans le schema pour compat backend mais le viewer ne le lit
        // plus — il est ignoré. Si un jour on veut une vraie surcharge
        // explicite par l'auteur, ce sera un champ dédié (ex:
        // `effects.authorPinnedDuration`) lu en priorité dans
        // `computedTotalDuration`.
        // ThumbHash composite par slide (bg + texte + média + stickers) — sync.
        for i in slides.indices {
            let bgImage = viewModel.slideImages[slides[i].id]
            slides[i].effects.thumbHash = StorySlideRenderer.computeThumbHash(
                slide: slides[i],
                bgImage: bgImage,
                loadedImages: viewModel.loadedImages
            )

            // ThumbHash per-media foreground.
            // - Images : sync via `UIImage.toThumbHash()` (~5-15 ms par image).
            // - Vidéos : on prend d'abord le thumbnail cached dans `loadedImages`
            //   si présent (issu de `mediaAddedFromPicker`), sinon génération
            //   async via `AVAssetImageGenerator` (iOS 16+).
            guard var medias = slides[i].effects.mediaObjects else { continue }
            var videoJobs: [(j: Int, url: URL)] = []

            for j in medias.indices where medias[j].thumbHash == nil {
                let mediaId = medias[j].id
                if let cached = viewModel.loadedImages[mediaId] {
                    medias[j].thumbHash = cached.toThumbHash()
                    continue
                }
                if medias[j].kind == .video,
                   let url = viewModel.loadedVideoURLs[mediaId] {
                    videoJobs.append((j, url))
                }
            }

            if !videoJobs.isEmpty {
                await withTaskGroup(of: (Int, String?).self) { group in
                    for job in videoJobs {
                        group.addTask {
                            let hash = await Self.computeVideoThumbHash(url: job.url)
                            return (job.j, hash)
                        }
                    }
                    for await (j, hash) in group {
                        medias[j].thumbHash = hash
                    }
                }
            }

            slides[i].effects.mediaObjects = medias
        }
        return (slides, viewModel.slideImages)
    }

    /// Génère un thumbHash à partir de la première frame d'une vidéo locale.
    /// Utilise l'API async iOS 16+ d'`AVAssetImageGenerator`. Timeout interne
    /// implicite (l'extraction d'une frame à t=0.1s d'une vidéo locale
    /// prend typiquement < 200 ms). Retourne `nil` si l'extraction échoue —
    /// le placeholder du reader tombera alors sur le fond noir / le bg slide.
    nonisolated static func computeVideoThumbHash(url: URL) async -> String? {
        let asset = AVURLAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 100, height: 100)
        let time = CMTime(seconds: 0.1, preferredTimescale: 600)
        do {
            let (cgImage, _) = try await generator.image(at: time)
            return UIImage(cgImage: cgImage).toThumbHash()
        } catch {
            return nil
        }
    }

    /// Règle PURE « le composer porte du contenu » — source unique partagée
    /// par l'alerte de sortie (`handleDismiss`) et l'auto-save de draft au
    /// passage en background (D1). Testable sans UI.
    static func composerHasContent(
        slides: [StorySlide],
        slideImageIds: Set<String>,
        hasStickerObjects: Bool,
        hasDrawingData: Bool,
        hasDrawingStrokes: Bool
    ) -> Bool {
        slides.contains { slide in
            slide.content != nil
                || slideImageIds.contains(slide.id)
                || slide.effects.background != nil
                || !slide.effects.textObjects.isEmpty
                || !(slide.effects.mediaObjects ?? []).isEmpty
                || !(slide.effects.drawingStrokes ?? []).isEmpty
        } || hasStickerObjects || hasDrawingData || hasDrawingStrokes
    }

    var composerHasContent: Bool {
        Self.composerHasContent(
            slides: viewModel.slides,
            slideImageIds: Set(viewModel.slideImages.keys),
            hasStickerObjects: !stickerObjects.isEmpty,
            hasDrawingData: viewModel.drawingData != nil,
            hasDrawingStrokes: !viewModel.drawingStrokes.isEmpty
        )
    }

    func handleDismiss() {
        if composerHasContent { showDiscardAlert = true }
        else { publishTask?.cancel(); publishTask = nil; clearAllDrafts(); onDismiss() }
    }

    func saveDraftAndDismiss() {
        saveDraft()
        onDismiss()
    }

    func cancelAndDismiss() {
        publishTask?.cancel()
        publishTask = nil
        clearAllDrafts()
        onDismiss()
    }

    // DEPRECATED: Replaced by StoryMediaLoader.shared.videoThumbnail(url:) — async, cached, off main thread.
    // Kept for backward compatibility with external callers.
    static func generateVideoThumbnail(url: URL) -> UIImage? {
        let asset = AVURLAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 400, height: 400)
        return try? UIImage(cgImage: generator.copyCGImage(at: .zero, actualTime: nil))
    }
}
