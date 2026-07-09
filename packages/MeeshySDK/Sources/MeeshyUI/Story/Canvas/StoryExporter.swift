import AVFoundation
import CoreMedia
import CoreVideo
import Foundation
import MeeshySDK

public enum StoryExporterError: Error, Sendable {
    case noBackgroundVideo
    case invalidMediaURL
    case backgroundAssetVideoTrackMissing
    case sessionCreationFailed
    case exportFailed(String)
    case exportCancelled
    /// Raised when the synthetic transparent video track required to drive the
    /// compositor for a static-only slide (text/sticker/drawing without media
    /// video) cannot be generated. This is a hard failure mode — the export
    /// pipeline has no substrate to draw on.
    case syntheticAssetGenerationFailed(String)
}

/// Exports a single `StorySlide` to an MP4 file by driving an `AVMutableComposition`
/// through `StoryAVCompositor` — which produces every export frame using the same
/// `StoryRenderer.render()` consumed by the live composer/viewer canvas.
///
/// Concurrency contract:
///   `export()` MUST NOT be called from `MainActor` synchronously (e.g. via
///   `DispatchQueue.main.sync`). The custom compositor bridges back to main for
///   each frame; if the caller blocks main waiting on `export()`, that bridge
///   deadlocks. Always invoke from a `Task` or a non-main async context.
///
/// Background video selection:
///   The composition's video substrate is chosen in this priority order:
///
///   1. A `mediaObjects` entry with `isBackground == true && kind == .video`,
///      regardless of its `loop` flag. When `loop == true`, the clip is
///      repeated until the slide's effective duration is covered. When
///      `loop == false`, the clip plays once and any tail remaining in the
///      slide is filled with the same transparent substrate used for
///      static-only slides (so the compositor still has a video track to draw
///      on past the end of the underlying clip).
///   2. Otherwise (no video background, or image background only) → a
///      synthetic 1-sec transparent BGRA asset is generated on the fly and
///      inserted as repeated time ranges to cover the slide duration. The
///      compositor's `startRequest(_:)` overwrites every pixel via
///      `layerTree.render(in: context)` each frame, so the synthetic substrate
///      is never visible — only its presence as a video track matters
///      (AVFoundation needs at least one video track to invoke a custom
///      compositor).
public enum StoryExporter {

    /// Exports `slide` to `outputURL` as an MP4 file.
    ///
    /// - Parameters:
    ///   - slide: The slide to render through the AV compositor.
    ///   - outputURL: Destination MP4 path. Overwritten if it already exists.
    ///   - languages: Preferred languages threaded to `StoryRenderer.render`
    ///     so text overlays bake in the chosen language (Prisme Linguistique).
    ///     Empty array bakes the slide's original source text.
    ///   - progress: Optional callback receiving the export progress fraction
    ///     in `0.0...1.0`. Polled at ~10Hz against
    ///     `AVAssetExportSession.progress` while the export is running, then
    ///     invoked one final time with `1.0` after the session reports
    ///     completion. Default `nil` preserves the original API for callers
    ///     that don't need progress.
    ///
    /// Throttling: callers receive AT MOST ~10 callbacks/sec while the export
    /// runs (one every 100ms), plus the terminal `1.0` call on success. Use
    /// this fraction directly to drive a `ProgressView` — no further smoothing
    /// is required for UI bars.
    public static func export(_ slide: StorySlide,
                              to outputURL: URL,
                              languages: [String] = [],
                              progress: (@Sendable (Double) -> Void)? = nil) async throws {
        let composition = AVMutableComposition()
        // Use the deterministic total duration so every element on the slide
        // (text, foreground media, audio, transitions) is fully covered by
        // the MP4. `effectiveSlideDuration` used to only account for looped
        // background videos, which meant a 14s foreground video on a slide
        // whose user-set duration was 12s got truncated to 12s of footage.
        let effective = slide.computedTotalDuration()
        let totalDuration = CMTime(seconds: effective, preferredTimescale: 600)

        // Taille de rendu MP4 selon la forme du canvas figée par l'auteur : un fond
        // paysage impose un canvas 16:9 (1920×1080) ; sinon le vertical 9:16 par
        // défaut (1080×1920, inchangé). Dimensions entières paires (contrainte H.264).
        let canvasRenderSize: CGSize = {
            switch slide.effects.canvasAspect {
            case .portrait:  return CanvasGeometry.designSize   // 1080×1920
            case .landscape: return CGSize(width: CanvasGeometry.designHeight,
                                           height: CanvasGeometry.designWidth) // 1920×1080
            }
        }()

        // Asset référence du background video — capturée pour pouvoir
        // composer **aussi son audio track** dans la pipeline audio mix
        // (section 1.5 ci-dessous). nil quand la slide est static-only.
        var backgroundVideoAsset: (asset: AVURLAsset, bg: StoryMediaObject)?

        // 1. If the slide has a background VIDEO (looped or not), drive the
        //    composition timing from it. The previous predicate required
        //    `loop == true`, which silently dropped non-looped background
        //    videos and produced an MP4 with no real footage — see
        //    fix/story-export-bg-video-no-loop. We now key on `kind == .video`
        //    and branch on `loop` inside the block.
        if let bg = (slide.effects.mediaObjects ?? [])
            .first(where: { $0.isBackground && $0.kind == .video }) {
            guard let urlString = bg.mediaURL,
                  let bgURL = URL(string: urlString) else {
                throw StoryExporterError.invalidMediaURL
            }
            guard let videoTrack = composition.addMutableTrack(
                withMediaType: .video,
                preferredTrackID: kCMPersistentTrackID_Invalid
            ) else {
                throw StoryExporterError.sessionCreationFailed
            }

            let asset = AVURLAsset(url: bgURL)
            guard let assetVideoTrack = try await asset.loadTracks(withMediaType: .video).first else {
                throw StoryExporterError.backgroundAssetVideoTrackMissing
            }
            let assetDuration = try await asset.load(.duration)
            backgroundVideoAsset = (asset, bg)

            if bg.loop {
                // Loop the background video to cover effectiveSlideDuration()
                // (Section 3.6 of the spec: ensures the slide ends on a full
                // repetition). `effectiveSlideDuration()` already rounds the
                // slide length up to a full repetition for looped backgrounds,
                // so the final chunk is always a complete cycle.
                var inserted = CMTime.zero
                while inserted < totalDuration {
                    let remaining = totalDuration - inserted
                    let chunkDuration = CMTimeMinimum(assetDuration, remaining)
                    try videoTrack.insertTimeRange(
                        CMTimeRange(start: .zero, duration: chunkDuration),
                        of: assetVideoTrack,
                        at: inserted
                    )
                    inserted = inserted + chunkDuration
                }
            } else {
                // No-loop background: play the clip once, clipped to the slide
                // duration if the asset is longer. If the asset is shorter than
                // the slide, the remainder is filled with the transparent
                // synthetic substrate so the compositor still has a video
                // track to draw on for the tail (StoryRenderer keeps rendering
                // static content — text, stickers, drawings — past the end of
                // the background clip).
                let playableDuration = CMTimeMinimum(assetDuration, totalDuration)
                try videoTrack.insertTimeRange(
                    CMTimeRange(start: .zero, duration: playableDuration),
                    of: assetVideoTrack,
                    at: .zero
                )

                let tailDuration = totalDuration - playableDuration
                if tailDuration > .zero {
                    try await appendTransparentTail(
                        to: videoTrack,
                        at: playableDuration,
                        duration: tailDuration,
                        size: canvasRenderSize
                    )
                }
            }
        } else {
            // 2. Static-only slide (or image-only background) — synthesise a
            //    transparent video substrate. Image backgrounds are drawn by
            //    StoryRenderer through `layerTree.render(in:)` each frame, so
            //    they don't need a real video track underneath.
            try await ensureVideoTrack(in: composition,
                                       duration: totalDuration,
                                       size: canvasRenderSize)
        }

        // 1.5. Audio mixing. Le MP4 export est destiné au partage externe
        //      (Photos, WhatsApp, AirDrop…) — un viewer sans la story logic
        //      ne peut pas re-jouer l'audio à partir de raw assets. Il faut
        //      donc baker l'audio dans le fichier de sortie. Cette étape
        //      capture l'audio embedded dans le background video (cas le
        //      plus courant pour les vlogs / clips capturés caméra).
        //
        //      **Sources additionnelles non encore couvertes** — les
        //      `audioPlayerObjects` (audios fg + bg + voice) référencent
        //      leurs assets par `postMediaId` plutôt que `mediaURL` direct.
        //      Les inclure dans l'export nécessite d'injecter un resolver
        //      `(postMediaId) -> URL?` dans `StoryExporter.export` (et de
        //      le brancher au StoryItem.media côté caller). Suivi dans
        //      un commit dédié (cf. PR #283).
        let audioMix = try await composeBackgroundVideoAudio(
            slide: slide,
            composition: composition,
            totalDuration: totalDuration,
            backgroundVideoAsset: backgroundVideoAsset
        )

        let videoComposition = AVMutableVideoComposition()
        videoComposition.frameDuration = CMTime(value: 1, timescale: 60) // 60 fps master
        videoComposition.renderSize = canvasRenderSize                    // 1080×1920 (portrait) / 1920×1080 (paysage)
        videoComposition.customVideoCompositorClass = StoryAVCompositor.self
        videoComposition.instructions = [
            StoryCompositionInstruction(
                slide: slide,
                languages: languages,
                timeRange: CMTimeRange(start: .zero, duration: totalDuration)
            )
        ]

        guard let session = AVAssetExportSession(
            asset: composition,
            presetName: AVAssetExportPresetHighestQuality
        ) else {
            throw StoryExporterError.sessionCreationFailed
        }
        session.outputURL = outputURL
        session.outputFileType = .mp4
        session.videoComposition = videoComposition
        session.audioMix = audioMix
        session.shouldOptimizeForNetworkUse = true

        if FileManager.default.fileExists(atPath: outputURL.path) {
            try FileManager.default.removeItem(at: outputURL)
        }

        // Wire optional progress polling at 10Hz against
        // `AVAssetExportSession.progress`. AVFoundation does NOT expose a
        // progress publisher; the only contract is the property. We poll on a
        // detached task at 100ms cadence (≤10 callbacks/sec) and exit as soon
        // as the session terminates so we never invoke the callback past the
        // export's natural lifetime. The `defer { progressTask?.cancel() }`
        // also guards against early throws below.
        let progressTask: Task<Void, Never>? = progress.map { callback in
            Task { @MainActor in
                while !Task.isCancelled {
                    let snapshot = session.progress
                    let status = session.status
                    callback(Double(snapshot))
                    if status == .completed || status == .failed || status == .cancelled {
                        return
                    }
                    try? await Task.sleep(nanoseconds: 100_000_000) // 100ms = 10Hz
                }
            }
        }
        defer { progressTask?.cancel() }

        // iOS 17 ships `AVAssetExportSession.export()` (no args, async, reads
        // outputURL/outputFileType set above). The newer iOS 18 `export(to:as:)`
        // is intentionally avoided here — Package.swift targets iOS 17.
        await session.export()
        switch session.status {
        case .completed:
            // Terminal progress call. The polling task may not have observed
            // a value of exactly 1.0 before AVAssetExportSession reported
            // `.completed` (AVFoundation can flip status before the progress
            // property reaches 1.0), so we emit it explicitly here. This is
            // the contract the spec §3.6 promises to callers driving a
            // ProgressView.
            progress?(1.0)
            return
        case .failed:
            throw StoryExporterError.exportFailed(
                session.error?.localizedDescription ?? "unknown"
            )
        case .cancelled:
            throw StoryExporterError.exportCancelled
        default:
            throw StoryExporterError.exportFailed(
                "Unexpected status \(session.status.rawValue)"
            )
        }
    }

    // MARK: - Audio composition

    /// Composes the audio track of the **background video** (if any) into
    /// the export, applying the media object's `volume` parameter via
    /// `AVMutableAudioMix`. Returns the configured `AVAudioMix`, or `nil`
    /// when there's no audio to mix (silent bg, or static-only slide).
    ///
    /// **Looping** — mirrors the video track logic: when `bg.loop == true`
    /// the audio is repeated to cover the full slide duration ; otherwise
    /// played once with silent tail. AVFoundation handles silence
    /// automatically — we simply don't insert anything past the asset's
    /// natural duration when `loop == false`.
    ///
    /// **Out of scope (V1)** — `audioPlayerObjects` (foreground audios +
    /// background audio entries + voice) are NOT included here. They
    /// reference assets by `postMediaId` and require an external resolver
    /// the exporter doesn't yet receive. Follow-up commit will inject a
    /// resolver via `StoryExporter.export(_:to:..., audioResolver:)` and
    /// extend this helper.
    static func composeBackgroundVideoAudio(
        slide: StorySlide,
        composition: AVMutableComposition,
        totalDuration: CMTime,
        backgroundVideoAsset: (asset: AVURLAsset, bg: StoryMediaObject)?
    ) async throws -> AVMutableAudioMix? {
        guard let entry = backgroundVideoAsset else {
            // Pas de bg video → pas d'audio à composer. Une étape future
            // ajoutera l'audio des `audioPlayerObjects` ici même.
            return nil
        }

        let assetAudioTracks = try await entry.asset.loadTracks(withMediaType: .audio)
        guard let assetAudioTrack = assetAudioTracks.first else {
            // Vidéo muette (clip d'écran, GIF converti, ...) — pas de
            // piste audio à inclure. Pas une erreur.
            return nil
        }

        guard let audioTrack = composition.addMutableTrack(
            withMediaType: .audio,
            preferredTrackID: kCMPersistentTrackID_Invalid
        ) else {
            throw StoryExporterError.sessionCreationFailed
        }

        let assetDuration = try await entry.asset.load(.duration)

        if entry.bg.loop {
            // Loop : insert l'audio en boucle pour couvrir totalDuration,
            // exactement comme la piste vidéo plus haut.
            var inserted = CMTime.zero
            while inserted < totalDuration {
                let remaining = totalDuration - inserted
                let chunkDuration = CMTimeMinimum(assetDuration, remaining)
                try audioTrack.insertTimeRange(
                    CMTimeRange(start: .zero, duration: chunkDuration),
                    of: assetAudioTrack,
                    at: inserted
                )
                inserted = inserted + chunkDuration
            }
        } else {
            // No-loop : on insère une fois, clippé à totalDuration. Le
            // tail est silencieux par défaut (AVFoundation n'a pas besoin
            // qu'on ajoute du silence explicite).
            let playableDuration = CMTimeMinimum(assetDuration, totalDuration)
            try audioTrack.insertTimeRange(
                CMTimeRange(start: .zero, duration: playableDuration),
                of: assetAudioTrack,
                at: .zero
            )
        }

        // AudioMix avec le `volume` du media object (0.0–1.0). Skip si
        // c'est le volume nominal (1.0) pour économiser une struct AVAudioMix
        // — AVFoundation traite la piste sans mix dans ce cas.
        let bgVolume = entry.bg.volume
        if abs(bgVolume - 1.0) < 0.001 {
            return nil
        }
        let mix = AVMutableAudioMix()
        let params = AVMutableAudioMixInputParameters(track: audioTrack)
        params.setVolume(bgVolume, at: .zero)
        mix.inputParameters = [params]
        return mix
    }

    // MARK: - Synthetic video track (static-only slides)

    /// Inserts a synthetic transparent video track into `composition` covering
    /// `duration`. No-op if the composition already has any `.video` track.
    ///
    /// The synthetic asset is a 1-sec BGRA 0x00000000 movie cached in
    /// `CacheCoordinator.video` keyed by render size, then `insertTimeRange`
    /// looped repeatedly to cover the slide's full effective duration. The
    /// pixel content is irrelevant because `StoryAVCompositor.startRequest`
    /// overwrites every pixel of every frame via `layerTree.render(in:)`.
    static func ensureVideoTrack(in composition: AVMutableComposition,
                                 duration: CMTime,
                                 size: CGSize) async throws {
        if !composition.tracks(withMediaType: .video).isEmpty { return }

        let syntheticURL = try await syntheticTransparentAsset(size: size)
        let asset = AVURLAsset(url: syntheticURL)
        guard let assetVideoTrack = try await asset.loadTracks(withMediaType: .video).first else {
            throw StoryExporterError.syntheticAssetGenerationFailed(
                "Generated synthetic asset has no video track"
            )
        }
        let assetDuration = try await asset.load(.duration)
        // Defensive: if the asset somehow ended up empty, we can't loop into it.
        guard assetDuration > .zero else {
            throw StoryExporterError.syntheticAssetGenerationFailed(
                "Synthetic asset has zero duration"
            )
        }

        guard let videoTrack = composition.addMutableTrack(
            withMediaType: .video,
            preferredTrackID: kCMPersistentTrackID_Invalid
        ) else {
            throw StoryExporterError.sessionCreationFailed
        }

        // Loop the short (1 s) substrate until we reach `duration`. Each chunk
        // is clipped to the remaining tail so the composition lands exactly on
        // `duration` — no partial frames past the requested length.
        var inserted = CMTime.zero
        while inserted < duration {
            let remaining = duration - inserted
            let chunkDuration = CMTimeMinimum(assetDuration, remaining)
            try videoTrack.insertTimeRange(
                CMTimeRange(start: .zero, duration: chunkDuration),
                of: assetVideoTrack,
                at: inserted
            )
            inserted = inserted + chunkDuration
        }
    }

    /// Appends repetitions of the cached transparent substrate to an EXISTING
    /// video track, starting at `startTime` and covering `duration`. Used to
    /// pad the tail of a non-looped background video clip that ends before the
    /// slide's effective duration. Mirrors `ensureVideoTrack`'s loop logic but
    /// operates on a caller-owned track so we don't add a second track to the
    /// composition (AVAssetExportSession + custom compositor expects exactly
    /// one video track in this pipeline).
    static func appendTransparentTail(to videoTrack: AVMutableCompositionTrack,
                                      at startTime: CMTime,
                                      duration: CMTime,
                                      size: CGSize) async throws {
        guard duration > .zero else { return }

        let syntheticURL = try await syntheticTransparentAsset(size: size)
        let asset = AVURLAsset(url: syntheticURL)
        guard let assetVideoTrack = try await asset.loadTracks(withMediaType: .video).first else {
            throw StoryExporterError.syntheticAssetGenerationFailed(
                "Generated synthetic asset has no video track"
            )
        }
        let assetDuration = try await asset.load(.duration)
        guard assetDuration > .zero else {
            throw StoryExporterError.syntheticAssetGenerationFailed(
                "Synthetic asset has zero duration"
            )
        }

        var inserted = CMTime.zero
        while inserted < duration {
            let remaining = duration - inserted
            let chunkDuration = CMTimeMinimum(assetDuration, remaining)
            try videoTrack.insertTimeRange(
                CMTimeRange(start: .zero, duration: chunkDuration),
                of: assetVideoTrack,
                at: startTime + inserted
            )
            inserted = inserted + chunkDuration
        }
    }

    /// Returns a file URL to a 1-sec transparent BGRA `.mov` asset of the given
    /// size, generating and caching it on first call. Cache key is the integer
    /// size in pixels so different render sizes coexist.
    ///
    /// The synthetic asset lives in `CacheCoordinator.video`; subsequent calls
    /// return the cached file without re-generating.
    static func syntheticTransparentAsset(size: CGSize) async throws -> URL {
        let cacheKey = "synthetic-transparent-\(Int(size.width))x\(Int(size.height)).mov"

        // Fast path: synchronous nonisolated lookup via CacheCoordinator's
        // static helper (no actor hop). Returns the file URL if present on
        // disk. We can't dot into `shared.video.cachedFileURL` directly from
        // outside the actor — the `.video` property access is isolated.
        if let cached = CacheCoordinator.videoLocalFileURL(for: cacheKey) {
            return cached
        }

        // Cold path: generate the asset off the main actor (AVAssetWriter is
        // synchronous-blocking; we don't want to stall the calling actor while
        // it grinds through ~30 BGRA frames + finishWriting()).
        let generatedURL = try await Task.detached(priority: .userInitiated) {
            try await Self.generateTransparentMov(size: size, duration: 1.0)
        }.value

        // Move the generated file into the cache's address space. We read the
        // bytes back and call `save(_:for:)` so the cache owns the file at the
        // path `cachedFileURL(for:)` resolves to. Then delete the temp source.
        let data: Data
        do {
            data = try Data(contentsOf: generatedURL)
        } catch {
            throw StoryExporterError.syntheticAssetGenerationFailed(
                "Failed to read generated synthetic asset: \(error.localizedDescription)"
            )
        }
        // `save` is async on the actor; the await covers both the property
        // access (`.video`) and the actor-isolated method call.
        await CacheCoordinator.shared.video.save(data, for: cacheKey)
        try? FileManager.default.removeItem(at: generatedURL)

        guard let cached = CacheCoordinator.videoLocalFileURL(for: cacheKey) else {
            throw StoryExporterError.syntheticAssetGenerationFailed(
                "Synthetic asset was generated but cache lookup failed"
            )
        }
        return cached
    }

    /// Generates a single-track BGRA `.mov` of the given size and duration,
    /// every pixel 0x00000000. Used as a substrate for static-only slide
    /// exports — the compositor overwrites every pixel each frame so the
    /// transparent content is never visible.
    ///
    /// Concurrency: this method is `nonisolated` and performs synchronous
    /// AVAssetWriter calls. It MUST be invoked from a `Task.detached` (off
    /// the main actor) so the writer's internal queues don't contend with UI
    /// work. The Swift 6 isolation checker enforces this.
    nonisolated private static func generateTransparentMov(size: CGSize,
                                                           duration: TimeInterval) async throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-synthetic-transparent-\(UUID().uuidString).mov")
        if FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }

        // Track success so the temp file is cleaned up on any failure path.
        // Caller (syntheticTransparentAsset) reads the bytes into Data and
        // pipes them to CacheCoordinator.video.save — the temp source is
        // already cleaned up there on success. The defer here covers the
        // mid-generation throw paths so we don't leak orphan .mov files in
        // /tmp on repeated failures.
        var generationSucceeded = false
        defer {
            if !generationSucceeded {
                try? FileManager.default.removeItem(at: url)
            }
        }

        let writer: AVAssetWriter
        do {
            writer = try AVAssetWriter(url: url, fileType: .mov)
        } catch {
            throw StoryExporterError.syntheticAssetGenerationFailed(
                "AVAssetWriter init failed: \(error.localizedDescription)"
            )
        }

        // H.264 does NOT preserve alpha — the BGRA 0x00000000 frame below
        // encodes as opaque black, not transparent. This is intentional and
        // safe : StoryAVCompositor.startRequest overwrites every pixel via
        // `layer.render(in:)` so the substrate's color is never visible. If
        // a future caller blends WITH the substrate (e.g. alpha punch-through
        // crossfade), switch to AVVideoCodecType.proRes4444 in .mov to get
        // real transparency at the cost of larger files.
        let videoSettings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: Int(size.width),
            AVVideoHeightKey: Int(size.height)
        ]
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
        input.expectsMediaDataInRealTime = false

        let bufferAttributes: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
            kCVPixelBufferWidthKey as String: Int(size.width),
            kCVPixelBufferHeightKey as String: Int(size.height)
        ]
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: input,
            sourcePixelBufferAttributes: bufferAttributes
        )

        guard writer.canAdd(input) else {
            throw StoryExporterError.syntheticAssetGenerationFailed(
                "Cannot add writer input"
            )
        }
        writer.add(input)

        guard writer.startWriting() else {
            throw StoryExporterError.syntheticAssetGenerationFailed(
                writer.error?.localizedDescription ?? "startWriting failed"
            )
        }
        writer.startSession(atSourceTime: .zero)

        let fps: Int32 = 30
        let totalFrames = max(1, Int(duration * Double(fps)))

        for i in 0..<totalFrames {
            // Spin briefly until the input accepts the next frame. AVAssetWriter
            // throttles based on its internal buffer state; sleeping 1 ms keeps
            // CPU low while staying responsive.
            while !input.isReadyForMoreMediaData {
                try await Task.sleep(nanoseconds: 1_000_000)
            }
            guard let pool = adaptor.pixelBufferPool else {
                throw StoryExporterError.syntheticAssetGenerationFailed(
                    "No pixel buffer pool"
                )
            }
            var pb: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &pb)
            guard let pixelBuffer = pb else {
                throw StoryExporterError.syntheticAssetGenerationFailed(
                    "Pixel buffer alloc failed"
                )
            }
            CVPixelBufferLockBaseAddress(pixelBuffer, [])
            if let base = CVPixelBufferGetBaseAddress(pixelBuffer) {
                let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
                let height = CVPixelBufferGetHeight(pixelBuffer)
                // Zero the buffer (BGRA 0x00000000). Note: H.264 discards
                // alpha so this encodes as opaque black, NOT transparent —
                // see top-of-function note. Zeroing prevents undefined memory
                // from bleeding into the encoded MP4.
                memset(base, 0, bytesPerRow * height)
            }
            CVPixelBufferUnlockBaseAddress(pixelBuffer, [])

            let presentationTime = CMTime(value: CMTimeValue(i), timescale: fps)
            adaptor.append(pixelBuffer, withPresentationTime: presentationTime)
        }

        input.markAsFinished()
        await writer.finishWriting()
        guard writer.status == .completed else {
            throw StoryExporterError.syntheticAssetGenerationFailed(
                writer.error?.localizedDescription ?? "Writer did not complete"
            )
        }
        generationSucceeded = true
        return url
    }
}
