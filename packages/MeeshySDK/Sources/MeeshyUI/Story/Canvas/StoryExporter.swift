import AVFoundation
import CoreMedia
import CoreVideo
import Foundation
import MeeshySDK
import UIKit

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
    ///   - inputSlide: The slide to render through the AV compositor. Ses médias
    ///     sont d'abord ramenés à des fichiers locaux par `hydratingLocalMedia`.
    ///   - outputURL: Destination MP4 path. Overwritten if it already exists.
    ///   - languages: Preferred languages threaded to `StoryRenderer.render`
    ///     so text overlays bake in the chosen language (Prisme Linguistique).
    ///     Empty array bakes the slide's original source text.
    ///   - watermark: Optional watermark baked bottom-trailing over every
    ///     frame (see `StoryExportWatermark`). `nil` exports unbranded.
    ///   - audioResolver: Optional resolver mapping each
    ///     `StoryAudioPlayerObject` (lanes musique/voix, référencées par
    ///     `postMediaId`) to a playable local URL. `nil` skips lane audio —
    ///     only the background video's embedded audio is baked. Unresolved
    ///     entries are omitted silently (parity with the preview engine).
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
    ///   - branding: emballage de marque composé DANS cette passe (interlude
    ///     d'identité en tête, carte de fin en queue). `nil` exporte la story
    ///     nue. Les clips du plan sont déjà encodés et mémoïsés : ils sont
    ///     insérés comme pistes, jamais re-rendus — c'est ce qui permet de
    ///     supprimer la passe de ré-encodage que `StoryExportBranding.wrap`
    ///     imposait (mesurée ~2,5 s sur une story de 10 s).
    ///   - stickerImageSources: adresses BRUTES des images de stickers, keyées
    ///     par `postMediaId` (#4852) — le produit de `stickerImageSources(for:media:)`.
    ///     Un `StorySticker` ne porte pas d'URL et la slide n'a pas la liste des
    ///     médias : sans cet index, l'export peignait 🖼️ à la place du sticker.
    ///     Résolues ici en fichiers locaux par le même chemin que `mediaURL`.
    ///     `[:]` = les stickers image sortent sous leur repli.
    public static func export(_ inputSlide: StorySlide,
                              to outputURL: URL,
                              languages: [String] = [],
                              watermark: StoryExportWatermark? = nil,
                              branding: StoryExportBranding.Plan? = nil,
                              audioResolver: (@Sendable (StoryAudioPlayerObject) -> URL?)? = nil,
                              stickerImageSources: [String: String] = [:],
                              progress: (@Sendable (Double) -> Void)? = nil) async throws {
        // Keep the export alive if the app is backgrounded mid-render — the same
        // net `TusUploadManager` gives uploads. A story export runs a few seconds
        // to ~1 min; `beginBackgroundTask` grants roughly 30 s of extra runtime
        // after the app leaves the foreground, covering the common case. This is
        // the single choke point every export path (viewer, timeline, save)
        // flows through. On hosts without a live UIApplication the id is
        // `.invalid` and the end call is skipped.
        let backgroundTaskId = UIApplication.shared.beginBackgroundTask(withName: "story-export")
        defer {
            if backgroundTaskId != .invalid {
                Task { @MainActor in UIApplication.shared.endBackgroundTask(backgroundTaskId) }
            }
        }

        // Tous les visuels sont ramenés à des `file://` locaux AVANT la moindre
        // composition. C'est la seule étape du pipeline qui a le droit d'être
        // asynchrone : la piste vidéo de fond est posée juste en dessous, et le
        // compositor décode le fond image frame par frame, sur le main actor et
        // de façon synchrone — ni l'un ni l'autre ne peut télécharger quoi que ce
        // soit. Placée DANS la fenêtre de `beginBackgroundTask` pour qu'un
        // téléchargement survive au passage en arrière-plan.
        let slide = await hydratingLocalMedia(inputSlide)
        let stickerImageURLs = await resolvingStickerImageURLs(stickerImageSources)

        let composition = AVMutableComposition()
        // Use the deterministic total duration so every element on the slide
        // (text, foreground media, audio, transitions) is fully covered by
        // the MP4. `effectiveSlideDuration` used to only account for looped
        // background videos, which meant a 14s foreground video on a slide
        // whose user-set duration was 12s got truncated to 12s of footage.
        let effective = slide.computedTotalDuration()
        // Durée de la STORY seule. `totalDuration` ci-dessous couvre en plus
        // l'emballage de marque quand il y en a un.
        let storyDuration = CMTime(seconds: effective, preferredTimescale: 600)

        // Décalage de la story dans la composition : l'interlude d'identité la
        // précède quand une identité a été résolue. Tout ce qui est daté plus
        // bas — pistes vidéo, pistes audio, rampes de volume — est posé à
        // `storyStart + t`, jamais à `t`.
        let storyStart = branding?.storyStart ?? .zero
        let storyEnd = CMTimeAdd(storyStart, storyDuration)

        // Début de la carte de fin : elle mord sur les dernières secondes de la
        // story, sans jamais empiéter sur le fondu d'ouverture (deux rampes
        // d'opacité qui se chevauchent sur la même couche ne se multiplient pas).
        let outroFade: CMTimeRange? = branding.map { plan in
            let overlap = CMTime(seconds: StoryExportBranding.outroOverlap, preferredTimescale: 600)
            let raw = CMTimeSubtract(storyEnd, overlap)
            let floor = CMTimeMaximum(.zero, CMTimeAdd(plan.introFade.start, plan.introFade.duration))
            let start = CMTimeMaximum(raw, floor)
            return CMTimeRange(start: start, duration: CMTimeSubtract(storyEnd, start))
        }
        let totalDuration: CMTime = {
            guard let plan = branding, let fade = outroFade else { return storyDuration }
            return CMTimeAdd(fade.start, plan.outroDuration)
        }()

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
        // `preferredTransform` of the background video track — the custom
        // compositor receives decoded frames in storage orientation and applies
        // this itself so camera-captured (rotated) clips render upright.
        var backgroundVideoTransform: CGAffineTransform = .identity

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
            backgroundVideoTransform = (try? await assetVideoTrack.load(.preferredTransform)) ?? .identity

            if bg.loop {
                // Loop the background video to cover effectiveSlideDuration()
                // (Section 3.6 of the spec: ensures the slide ends on a full
                // repetition). `effectiveSlideDuration()` already rounds the
                // slide length up to a full repetition for looped backgrounds,
                // so the final chunk is always a complete cycle.
                var inserted = CMTime.zero
                while inserted < storyDuration {
                    let remaining = storyDuration - inserted
                    let chunkDuration = CMTimeMinimum(assetDuration, remaining)
                    try videoTrack.insertTimeRange(
                        CMTimeRange(start: .zero, duration: chunkDuration),
                        of: assetVideoTrack,
                        at: storyStart + inserted
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
                let playableDuration = CMTimeMinimum(assetDuration, storyDuration)
                try videoTrack.insertTimeRange(
                    CMTimeRange(start: .zero, duration: playableDuration),
                    of: assetVideoTrack,
                    at: storyStart
                )

                let tailDuration = storyDuration - playableDuration
                if tailDuration > .zero {
                    try await appendTransparentTail(
                        to: videoTrack,
                        at: storyStart + playableDuration,
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
                                       at: storyStart,
                                       duration: storyDuration,
                                       size: canvasRenderSize)
        }

        // 1.5. Audio mixing. Le MP4 export est destiné au partage externe
        //      (Photos, WhatsApp, AirDrop…) — un viewer sans la story logic
        //      ne peut pas re-jouer l'audio à partir de raw assets. Il faut
        //      donc baker l'audio dans le fichier de sortie. Cette étape
        //      capture l'audio embedded dans le background video (cas le
        //      plus courant pour les vlogs / clips capturés caméra).
        //
        //      Les `audioPlayerObjects` (audios fg + bg + voice) référencent
        //      leurs assets par `postMediaId` : quand l'appelant fournit
        //      `audioResolver`, ils sont composés en pistes dédiées avec
        //      fenêtre timeline + volume + fades + loop (bg uniquement).
        let bgVideoAudioMix = try await composeBackgroundVideoAudio(
            slide: slide,
            composition: composition,
            totalDuration: storyDuration,
            storyStart: storyStart,
            backgroundVideoAsset: backgroundVideoAsset
        )
        var mixParameters: [AVAudioMixInputParameters] =
            bgVideoAudioMix?.inputParameters ?? []
        // Inconditionnel : `audioResolver` est une OPTIMISATION (le composer sert
        // ses fichiers locaux pas encore uploadés), jamais la condition
        // d'existence de l'audio. Le gater ici rendait muets tous les chemins qui
        // n'ont pas de resolver à offrir — « Partager » et « Enregistrer dans
        // Photos », qui exportent des stories dont l'audio n'existe QUE derrière
        // une URL. Le repli par `mediaURL` vit dans `composeAudioLanes`.
        mixParameters += try await composeAudioLanes(
            slide: slide,
            composition: composition,
            totalDuration: storyDuration,
            storyStart: storyStart,
            resolver: audioResolver
        )

        // Signatures sonores de la marque + atténuation de la story sous la
        // carte de fin — l'équivalent audio de ce que `wrap` posait dans sa
        // propre passe, désormais mixé ici.
        var brandVideoTracks: (intro: CMPersistentTrackID?, outro: CMPersistentTrackID?) = (nil, nil)
        if let plan = branding {
            brandVideoTracks = try await composeBrandVideo(
                plan: plan, composition: composition, outroFade: outroFade)
            mixParameters += try await composeBrandAudio(
                plan: plan,
                composition: composition,
                outroFade: outroFade,
                storyAudioTracks: composition.tracks(withMediaType: .audio),
                storyParameters: mixParameters
            )
        }
        let audioMix: AVAudioMix? = {
            guard !mixParameters.isEmpty else { return nil }
            let mix = AVMutableAudioMix()
            mix.inputParameters = mixParameters
            return mix
        }()

        let videoComposition = AVMutableVideoComposition()
        // Même cadence que les passes de marque qui ré-encodent ce fichier
        // ensuite : un master plus rapide qu'elles verrait la moitié de ses
        // frames — les plus coûteuses du pipeline — jetées au ré-échantillonnage.
        videoComposition.frameDuration = StoryExportFrameRate.frameDuration
        videoComposition.renderSize = canvasRenderSize                    // 1080×1920 (portrait) / 1920×1080 (paysage)
        videoComposition.customVideoCompositorClass = StoryAVCompositor.self
        let storyTrackID = composition.tracks(withMediaType: .video)
            .first?.trackID ?? kCMPersistentTrackID_Invalid

        // Segmentation de la timeline. Une instruction unique couvrant tout
        // laisserait `requiredSourceTrackIDs` à nil, et AVFoundation décoderait
        // les TROIS pistes à chaque frame — y compris la carte de fin pendant
        // le corps de la story, où elle est invisible. Chaque segment ne
        // déclare donc que les pistes qu'il consomme vraiment.
        func instruction(_ range: CMTimeRange, tracks: [CMPersistentTrackID]) -> StoryCompositionInstruction {
            StoryCompositionInstruction(
                slide: slide,
                languages: languages,
                timeRange: range,
                watermark: watermark,
                backgroundVideoTransform: backgroundVideoTransform,
                storyStart: storyStart,
                storyTrackID: storyTrackID,
                introTrackID: brandVideoTracks.intro,
                outroTrackID: brandVideoTracks.outro,
                introFade: branding?.introFade,
                outroFade: outroFade,
                requiredSourceTrackIDs: tracks.map { NSNumber(value: $0) },
                stickerImageURLs: stickerImageURLs
            )
        }

        var instructions: [StoryCompositionInstruction] = []
        if let plan = branding {
            let introEnd = CMTimeAdd(plan.introFade.start, plan.introFade.duration)
            let outroStart = outroFade?.start ?? totalDuration
            // 1. Interlude + levée de la story.
            if introEnd > .zero, let introID = brandVideoTracks.intro {
                instructions.append(instruction(
                    CMTimeRange(start: .zero, duration: introEnd),
                    tracks: [introID, storyTrackID]))
            }
            // 2. Corps de la story — la piste story SEULE.
            let bodyStart = CMTimeMaximum(introEnd, .zero)
            if outroStart > bodyStart {
                instructions.append(instruction(
                    CMTimeRange(start: bodyStart, duration: CMTimeSubtract(outroStart, bodyStart)),
                    tracks: [storyTrackID]))
            }
            // 3. Carte de fin.
            if let outroID = brandVideoTracks.outro, totalDuration > outroStart {
                instructions.append(instruction(
                    CMTimeRange(start: outroStart, duration: CMTimeSubtract(totalDuration, outroStart)),
                    tracks: [storyTrackID, outroID]))
            }
        }
        if instructions.isEmpty {
            instructions = [instruction(CMTimeRange(start: .zero, duration: totalDuration),
                                        tracks: [storyTrackID])]
        }
        videoComposition.instructions = instructions

        if FileManager.default.fileExists(atPath: outputURL.path) {
            try FileManager.default.removeItem(at: outputURL)
        }

        try await encode(composition: composition,
                         videoComposition: videoComposition,
                         audioMix: audioMix,
                         to: outputURL,
                         renderSize: canvasRenderSize,
                         totalDuration: totalDuration,
                         progress: progress)
    }

    // MARK: - Encodage final

    /// Encode la composition dans `outputURL` avec un **débit plafonné**.
    ///
    /// Remplace `AVAssetExportSession`, qui n'expose aucun réglage d'encodage :
    /// ses presets bornent la définition, jamais le bitrate — mesuré, un export
    /// en pleine définition montait à 58,8 Mbps, soit 441 Mo la minute (cf.
    /// `StoryExportVideoSettings`). `AVAssetReader` + `AVAssetWriter` est le seul
    /// couple qui accepte un `AVVideoAverageBitRateKey`.
    ///
    /// Le compositor custom reste au centre du dispositif :
    /// `AVAssetReaderVideoCompositionOutput` honore
    /// `videoComposition.customVideoCompositorClass` exactement comme la session
    /// d'export le faisait — les tests pixel du dépôt en sont la preuve, ils
    /// noirciraient s'il cessait d'être appelé.
    ///
    /// ⚠️ Le pompage se fait sur des files DÉDIÉES, jamais sur la principale :
    /// `StoryAVCompositor.startRequest` repasse par `DispatchQueue.main.sync`
    /// pour chaque frame, et pomper depuis la file principale l'interbloquerait.
    static func encode(composition: AVMutableComposition,
                       videoComposition: AVMutableVideoComposition,
                       audioMix: AVAudioMix?,
                       to outputURL: URL,
                       renderSize: CGSize,
                       totalDuration: CMTime,
                       progress: (@Sendable (Double) -> Void)?) async throws {
        let reader: AVAssetReader
        let writer: AVAssetWriter
        do {
            reader = try AVAssetReader(asset: composition)
            writer = try AVAssetWriter(url: outputURL, fileType: .mp4)
        } catch {
            throw StoryExporterError.sessionCreationFailed
        }
        writer.shouldOptimizeForNetworkUse = true

        // --- Vidéo : la composition passe par le compositor, la sortie est
        //     ré-encodée au débit visé.
        let videoTracks = composition.tracks(withMediaType: .video)
        guard !videoTracks.isEmpty else { throw StoryExporterError.sessionCreationFailed }
        let videoOutput = AVAssetReaderVideoCompositionOutput(
            videoTracks: videoTracks,
            videoSettings: [
                kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA)
            ])
        videoOutput.videoComposition = videoComposition
        videoOutput.alwaysCopiesSampleData = false
        guard reader.canAdd(videoOutput) else { throw StoryExporterError.sessionCreationFailed }
        reader.add(videoOutput)

        let videoInput = AVAssetWriterInput(
            mediaType: .video,
            outputSettings: StoryExportVideoSettings.video(for: renderSize))
        videoInput.expectsMediaDataInRealTime = false
        guard writer.canAdd(videoInput) else { throw StoryExporterError.sessionCreationFailed }
        writer.add(videoInput)

        // --- Audio : l'`AVAudioMix` (volumes, rampes, automation, atténuation)
        //     est appliqué par le lecteur, qui rend du PCM ; l'écrivain ré-encode
        //     en AAC. Sans piste audio, on n'ajoute rien — un MP4 muet est valide.
        let audioTracks = composition.tracks(withMediaType: .audio)
        var audioOutput: AVAssetReaderAudioMixOutput?
        var audioInput: AVAssetWriterInput?
        if !audioTracks.isEmpty {
            let output = AVAssetReaderAudioMixOutput(
                audioTracks: audioTracks,
                audioSettings: StoryExportVideoSettings.audioReaderSettings)
            output.audioMix = audioMix
            output.alwaysCopiesSampleData = false
            if reader.canAdd(output) {
                let input = AVAssetWriterInput(
                    mediaType: .audio,
                    outputSettings: StoryExportVideoSettings.audio)
                input.expectsMediaDataInRealTime = false
                if writer.canAdd(input) {
                    reader.add(output)
                    writer.add(input)
                    audioOutput = output
                    audioInput = input
                }
            }
        }

        guard writer.startWriting() else {
            throw StoryExporterError.exportFailed(
                writer.error?.localizedDescription ?? "startWriting failed")
        }
        guard reader.startReading() else {
            writer.cancelWriting()
            throw StoryExporterError.exportFailed(
                reader.error?.localizedDescription ?? "startReading failed")
        }
        writer.startSession(atSourceTime: .zero)

        // La progression suit l'horodatage des frames vidéo effectivement
        // écrites, étranglée à 10 Hz — même contrat que le sondage de
        // `AVAssetExportSession.progress` qu'elle remplace (cf.
        // `StoryExporter_ProgressTests`).
        let reporter = progress.map { ExportProgressReporter(total: totalDuration, emit: $0) }

        let videoPair = PumpPair(input: videoInput, output: videoOutput)
        let audioPair: PumpPair? = audioInput.flatMap { input in
            audioOutput.map { PumpPair(input: input, output: $0) }
        }

        async let videoDone: Void = pump(videoPair, label: "video", reporter: reporter)
        async let audioDone: Void = {
            guard let audioPair else { return }
            await pump(audioPair, label: "audio", reporter: nil)
        }()
        _ = await (videoDone, audioDone)

        if reader.status == .failed {
            writer.cancelWriting()
            throw StoryExporterError.exportFailed(
                reader.error?.localizedDescription ?? "reader failed")
        }
        if Task.isCancelled {
            writer.cancelWriting()
            reader.cancelReading()
            throw StoryExporterError.exportCancelled
        }

        await writer.finishWriting()
        switch writer.status {
        case .completed:
            progress?(1.0)
        case .cancelled:
            throw StoryExporterError.exportCancelled
        default:
            throw StoryExporterError.exportFailed(
                writer.error?.localizedDescription ?? "writer did not complete")
        }
    }

    /// Transfère tous les échantillons de `output` vers `input`, puis clôt
    /// l'entrée. `requestMediaDataWhenReady` rappelle sur la file fournie tant que
    /// l'écrivain accepte de la donnée ; on rend la main dès que le lecteur est à
    /// sec.
    private nonisolated static func pump(_ pair: PumpPair,
                                         label: String,
                                         reporter: ExportProgressReporter?) async {
        // `nonisolated(unsafe)` : AVAssetWriterInput/AVAssetReaderOutput predate
        // Swift concurrency and aren't marked Sendable, but `requestMediaDataWhenReady`
        // is Apple's own documented contract for exactly this cross-queue usage —
        // the callback below is the ONLY place either is touched, always on `queue`.
        nonisolated(unsafe) let input = pair.input
        nonisolated(unsafe) let output = pair.output
        let queue = DispatchQueue(label: "me.meeshy.story.export.\(label)")
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            let box = ContinuationBox(continuation)
            input.requestMediaDataWhenReady(on: queue) {
                while input.isReadyForMoreMediaData {
                    // `Task.isCancelled` n'aurait aucun sens ici : ce bloc tourne
                    // sur une file GCD, hors de tout contexte de tâche Swift, et
                    // renverrait invariablement `false`. L'annulation est relue
                    // par l'appelant une fois le pompage terminé — même portée
                    // qu'avec `AVAssetExportSession`, qui allait lui aussi
                    // jusqu'au bout.
                    guard let sample = output.copyNextSampleBuffer() else {
                        input.markAsFinished()
                        box.resumeOnce()
                        return
                    }
                    if input.append(sample) {
                        reporter?.observe(CMSampleBufferGetPresentationTimeStamp(sample))
                    } else {
                        // L'écrivain a basculé en échec : inutile d'insister, le
                        // statut est relu par l'appelant.
                        input.markAsFinished()
                        box.resumeOnce()
                        return
                    }
                }
            }
        }
    }

    // MARK: - Marque composée dans le bake

    /// Insère les pistes VIDÉO de l'emballage de marque et retourne leurs
    /// identifiants, que l'instruction de composition transmet au compositor.
    ///
    /// Les clips sont déjà encodés et mémoïsés (`StoryExportBranding`) : ils
    /// entrent ici comme pistes à décoder, pas comme frames à re-rendre.
    static func composeBrandVideo(
        plan: StoryExportBranding.Plan,
        composition: AVMutableComposition,
        outroFade: CMTimeRange?
    ) async throws -> (intro: CMPersistentTrackID?, outro: CMPersistentTrackID?) {
        var introID: CMPersistentTrackID?
        var outroID: CMPersistentTrackID?

        if let clip = plan.introClip {
            let asset = AVURLAsset(url: clip)
            if let track = try await asset.loadTracks(withMediaType: .video).first,
               let composed = composition.addMutableTrack(
                   withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) {
                let duration = try await asset.load(.duration)
                try composed.insertTimeRange(
                    CMTimeRange(start: .zero, duration: duration), of: track, at: .zero)
                introID = composed.trackID
            }
        }

        if let fade = outroFade {
            let asset = AVURLAsset(url: plan.outroClip)
            if let track = try await asset.loadTracks(withMediaType: .video).first,
               let composed = composition.addMutableTrack(
                   withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) {
                try composed.insertTimeRange(
                    CMTimeRange(start: .zero, duration: plan.outroDuration),
                    of: track, at: fade.start)
                outroID = composed.trackID
            }
        }

        return (introID, outroID)
    }

    /// Mixe les deux signatures sonores de la marque et atténue les pistes de
    /// la story sous la carte de fin — l'équivalent audio de ce que la passe
    /// `StoryExportBranding.wrap` posait auparavant.
    /// - Parameter storyParameters: les paramètres DÉJÀ construits pour les
    ///   pistes de la story. L'atténuation de fin est posée dessus plutôt que
    ///   sur un second objet : `AVAudioMix` n'honore qu'une seule entrée par
    ///   piste, un doublon effacerait silencieusement le volume de l'auteur.
    static func composeBrandAudio(
        plan: StoryExportBranding.Plan,
        composition: AVMutableComposition,
        outroFade: CMTimeRange?,
        storyAudioTracks: [AVMutableCompositionTrack],
        storyParameters: [AVAudioMixInputParameters]
    ) async throws -> [AVMutableAudioMixInputParameters] {
        var parameters: [AVMutableAudioMixInputParameters] = []

        // Signature d'ouverture : elle s'estompe sur le fondu vers la story.
        if let jingle = plan.introJingle, plan.introFade.duration > .zero {
            let asset = AVURLAsset(url: jingle)
            if let track = try await asset.loadTracks(withMediaType: .audio).first,
               let composed = composition.addMutableTrack(
                   withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
                let duration = try await asset.load(.duration)
                try composed.insertTimeRange(
                    CMTimeRange(start: .zero, duration: duration), of: track, at: .zero)
                let params = AVMutableAudioMixInputParameters(track: composed)
                params.setVolumeRamp(fromStartVolume: 1, toEndVolume: 0,
                                     timeRange: plan.introFade)
                parameters.append(params)
            }
        }

        guard let fade = outroFade else { return parameters }

        // Signature de fermeture, décalée à la 2ᵉ phase quand une identité est
        // peinte (le logo termine alors la vidéo en silence).
        let asset = AVURLAsset(url: plan.outroJingle)
        if let track = try await asset.loadTracks(withMediaType: .audio).first,
           let composed = composition.addMutableTrack(
               withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
            let duration = try await asset.load(.duration)
            try composed.insertTimeRange(
                CMTimeRange(start: .zero, duration: duration),
                of: track, at: fade.start + plan.outroJingleOffset)
            parameters.append(AVMutableAudioMixInputParameters(track: composed))
        }

        // La story s'éteint pendant que la carte de fin entre. On complète les
        // paramètres existants quand la piste en a déjà (volume auteur,
        // automation, fades) et on n'en crée que pour les pistes nominales.
        let existingIDs = Set(storyParameters.map(\.trackID))
        for track in storyAudioTracks where !existingIDs.contains(track.trackID) {
            let params = AVMutableAudioMixInputParameters(track: track)
            params.setVolumeRamp(fromStartVolume: 1, toEndVolume: 0, timeRange: fade)
            parameters.append(params)
        }
        for case let params as AVMutableAudioMixInputParameters in storyParameters {
            params.setVolumeRamp(fromStartVolume: 1, toEndVolume: 0, timeRange: fade)
        }
        return parameters
    }

    // MARK: - Encodage : utilitaires de pompage

    /// Couple lecteur/écrivain d'un même flux, transporté jusqu'à sa file de
    /// pompage.
    ///
    /// `AVAssetWriterInput` et `AVAssetReaderOutput` ne sont pas `Sendable`, mais
    /// chaque couple n'est touché QUE par la file série qui lui est propre —
    /// `requestMediaDataWhenReady(on:)` sérialise ses rappels, et aucun autre
    /// site ne les manipule après la mise en place. C'est précisément le cas
    /// d'usage d'un `@unchecked Sendable` : la sécurité est structurelle, pas
    /// vérifiable par le compilateur.
    private nonisolated struct PumpPair: @unchecked Sendable {
        let input: AVAssetWriterInput
        let output: AVAssetReaderOutput
    }

    /// Garantit qu'une continuation n'est reprise qu'UNE fois.
    ///
    /// `requestMediaDataWhenReady` rappelle son bloc tant que l'entrée réclame de
    /// la donnée : la fin de flux peut donc être atteinte plusieurs fois si deux
    /// rappels se chevauchent. Reprendre deux fois une `CheckedContinuation` est
    /// une erreur fatale, pas un avertissement.
    private nonisolated final class ContinuationBox: @unchecked Sendable {
        private let lock = NSLock()
        private var continuation: CheckedContinuation<Void, Never>?

        init(_ continuation: CheckedContinuation<Void, Never>) {
            self.continuation = continuation
        }

        func resumeOnce() {
            lock.lock()
            let pending = continuation
            continuation = nil
            lock.unlock()
            pending?.resume()
        }
    }

    /// Traduit l'horodatage des frames écrites en fraction de progression,
    /// étranglée à 10 Hz.
    ///
    /// Reprend le contrat que le sondage de `AVAssetExportSession.progress`
    /// offrait (`StoryExporter_ProgressTests`) : au plus ~10 appels par seconde,
    /// valeurs dans `0…1`, l'appelant émettant lui-même le `1.0` terminal.
    /// Appelé depuis la file de pompage, d'où le verrou.
    private nonisolated final class ExportProgressReporter: @unchecked Sendable {
        private let lock = NSLock()
        private let totalSeconds: Double
        private let emit: @Sendable (Double) -> Void
        private var lastEmission: TimeInterval = 0

        init(total: CMTime, emit: @escaping @Sendable (Double) -> Void) {
            self.totalSeconds = max(0.001, CMTimeGetSeconds(total))
            self.emit = emit
        }

        func observe(_ presentationTime: CMTime) {
            let now = ProcessInfo.processInfo.systemUptime
            lock.lock()
            let due = now - lastEmission >= 0.1
            if due { lastEmission = now }
            lock.unlock()
            guard due else { return }
            let fraction = CMTimeGetSeconds(presentationTime) / totalSeconds
            emit(min(1.0, max(0.0, fraction)))
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
        storyStart: CMTime = .zero,
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
                    at: storyStart + inserted
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
                at: storyStart
            )
        }

        // Atténuation automatique. `assetAudioTrack` prouve déjà que la vidéo
        // a du son : il ne reste qu'à savoir si une musique la concurrence.
        let isDucking = StoryVolumeResolver.isDucking(
            slideDucks: Self.exportCarriesBackgroundAudio(slide: slide),
            isDuckingDisabled: entry.bg.isDuckingDisabled
        )

        // AudioMix avec le volume du media object, automation comprise. Skip
        // seulement quand la piste joue au niveau nominal SANS automation NI
        // atténuation — AVFoundation traite alors la piste sans mix.
        let bgVolume = entry.bg.volume
        let hasAutomation = (entry.bg.keyframes ?? []).contains { $0.volume != nil }
        if abs(bgVolume - 1.0) < 0.001 && !hasAutomation && !isDucking {
            return nil
        }
        let mix = AVMutableAudioMix()
        let params = AVMutableAudioMixInputParameters(track: audioTrack)
        // `totalDuration` : la piste de fond couvre toute la slide (bouclée si
        // nécessaire), c'est donc l'étendue sur laquelle la rampe constante
        // doit s'appliquer quand il n'y a pas d'automation.
        for (range, from, to) in Self.volumeRamps(base: bgVolume,
                                                  keyframes: entry.bg.keyframes,
                                                  duration: totalDuration.seconds,
                                                  isDucking: isDucking) {
            // Les rampes sont calculées en temps de STORY ; la piste, elle, est
            // posée à `storyStart` quand un interlude la précède.
            let shifted = CMTimeRange(start: range.start + storyStart, duration: range.duration)
            params.setVolumeRamp(fromStartVolume: from, toEndVolume: to, timeRange: shifted)
        }
        mix.inputParameters = [params]
        return mix
    }

    /// `true` quand le fichier produit contiendra réellement un audio de FOND
    /// susceptible d'être couvert par la piste de la vidéo.
    ///
    /// Gate volontairement plus étroit que celui du lecteur, qui interroge
    /// `resolvedBackgroundAudio` : `composeAudioLanes` n'exporte que les
    /// `audioPlayerObjects` réels, jamais l'audio de fond LEGACY que le lecteur
    /// sait synthétiser. Atténuer pour une musique absente du fichier rendrait
    /// l'export plus sourd que la preview, sans rien dégager.
    nonisolated static func exportCarriesBackgroundAudio(slide: StorySlide) -> Bool {
        (slide.effects.audioPlayerObjects ?? []).contains { $0.isBackground == true }
    }

    /// Traduit une automation de volume en rampes `AVAudioMix`.
    ///
    /// `AVMutableAudioMixInputParameters` ne connaît que des segments
    /// linéaires : une courbe s'exprime donc comme une suite de rampes entre
    /// points consécutifs. Sans keyframe — ou avec un seul — une rampe
    /// constante unique suffit.
    ///
    /// Contrairement aux nodes AVFoundation, `AVAudioMix` n'est pas borné à
    /// 1.0 : c'est ici que le gain au-delà de 100 % devient réellement audible.
    ///
    /// Retourne des triplets `(intervalle, volume de départ, volume d'arrivée)`.
    nonisolated static func volumeRamps(base: Float,
                                        keyframes: [StoryKeyframe]?,
                                        duration: Double,
                                        isDucking: Bool = false)
    -> [(CMTimeRange, Float, Float)] {
        // L'atténuation multiplie CHAQUE niveau, base comme points : elle
        // s'applique par-dessus l'automation, jamais à sa place — un clip
        // poussé à 200 % puis atténué reste plus fort qu'un clip nominal.
        let clamp: (Float) -> Float = {
            StoryVolumeResolver.ducked(min(StoryVolume.maxGain, max(0, $0)),
                                       isDucking: isDucking)
        }
        let points = (keyframes ?? [])
            .compactMap { kf -> (time: Float, value: Float)? in
                guard let v = kf.volume else { return nil }
                return (kf.time, clamp(v))
            }
            .sorted { $0.time < $1.time }

        let clampedBase = clamp(base)
        guard points.count >= 2 else {
            let level = points.first?.value ?? clampedBase
            let range = CMTimeRange(start: .zero,
                                    duration: CMTime(seconds: duration, preferredTimescale: 600))
            return [(range, level, level)]
        }

        var ramps: [(CMTimeRange, Float, Float)] = []
        for (a, b) in zip(points, points.dropFirst()) {
            let start = CMTime(seconds: Double(a.time), preferredTimescale: 600)
            let end = CMTime(seconds: Double(b.time), preferredTimescale: 600)
            ramps.append((CMTimeRange(start: start, end: end), a.value, b.value))
        }
        return ramps
    }

    // MARK: - Audio lanes (audioPlayerObjects)

    /// Adresse jouable d'une piste de la timeline — **point de résolution
    /// UNIQUE** de tous les chemins d'export.
    ///
    /// Deux sources, dans cet ordre :
    /// 1. `resolver` — le composer sert ses fichiers de session, y compris ceux
    ///    qui n'ont pas encore été uploadés. Toujours plus frais.
    /// 2. `audio.mediaURL` — l'adresse persistée (ou hydratée depuis `FeedMedia`
    ///    par `StoryItem.toRenderableSlide`). Résolue via le cache disque, avec
    ///    téléchargement quand il manque : une story relue depuis la liste n'a
    ///    aucune raison d'avoir ses pistes déjà en cache.
    ///
    /// C'est ce repli qui rend l'audio indépendant du site d'appel : aucun
    /// appelant ne peut plus produire un export muet en oubliant de câbler un
    /// resolver.
    static func resolveLaneURL(
        _ audio: StoryAudioPlayerObject,
        resolver: (@Sendable (StoryAudioPlayerObject) -> URL?)?
    ) async -> URL? {
        if let url = resolver?(audio) { return url }
        // `URL(string:)` NU acceptait « /api/v1/static/x.m4a » et rendait une URL
        // sans schéma, que le cache refusait ensuite sans un mot : un son
        // emprunté à la bibliothèque s'exportait en silence. La résolution passe
        // par le point unique, qui recolle l'hôte courant.
        guard let remote = StoryAudioSourceResolver.playableURL(from: audio.mediaURL) else { return nil }
        if remote.isFileURL {
            return FileManager.default.fileExists(atPath: remote.path) ? remote : nil
        }
        return await CacheCoordinator.audioLocalFileURLAwait(for: remote)
    }

    /// Composes the slide's `audioPlayerObjects` (musique, voix — lanes de la
    /// timeline) into dedicated audio tracks, honouring the timeline window
    /// (`startTime`/`duration`), `volume`, `fadeIn`/`fadeOut`.
    ///
    /// RÈGLE PRODUIT : loop = background uniquement. Un audio background avec
    /// `loop == true` est répété jusqu'à couvrir sa fenêtre ; un foreground
    /// portant un flag `loop` hérité joue UNE fois.
    ///
    /// Returns the `AVMutableAudioMixInputParameters` needed by tracks whose
    /// volume/fades differ from nominal — tracks at plain volume 1.0 need no
    /// entry (AVFoundation plays unlisted tracks at nominal volume).
    static func composeAudioLanes(
        slide: StorySlide,
        composition: AVMutableComposition,
        totalDuration: CMTime,
        storyStart: CMTime = .zero,
        resolver: (@Sendable (StoryAudioPlayerObject) -> URL?)?
    ) async throws -> [AVMutableAudioMixInputParameters] {
        var parameters: [AVMutableAudioMixInputParameters] = []

        for audio in slide.effects.audioPlayerObjects ?? [] {
            guard let url = await resolveLaneURL(audio, resolver: resolver) else { continue }
            let asset = AVURLAsset(url: url)
            guard let assetTrack = (try? await asset.loadTracks(withMediaType: .audio))?.first,
                  let assetDuration = try? await asset.load(.duration),
                  assetDuration > .zero else { continue }

            let start = CMTime(seconds: Double(max(0, audio.startTime ?? 0)),
                               preferredTimescale: 600)
            guard start < totalDuration else { continue }
            let available = totalDuration - start
            let window: CMTime = {
                guard let declared = audio.duration, declared > 0 else { return available }
                return CMTimeMinimum(
                    CMTime(seconds: Double(declared), preferredTimescale: 600),
                    available
                )
            }()
            let loopsAsBackground = audio.isBackground == true && audio.loop == true

            guard let track = composition.addMutableTrack(
                withMediaType: .audio,
                preferredTrackID: kCMPersistentTrackID_Invalid
            ) else {
                throw StoryExporterError.sessionCreationFailed
            }

            // `start` et `insertedEnd` restent en temps de STORY (les keyframes
            // et fenêtres de l'auteur y sont exprimées) ; seules les POSES dans
            // la composition portent le décalage de l'interlude.
            let timelineStart = start + storyStart
            let insertedEnd: CMTime
            if loopsAsBackground {
                var inserted = CMTime.zero
                while inserted < window {
                    let remaining = window - inserted
                    let chunk = CMTimeMinimum(assetDuration, remaining)
                    try track.insertTimeRange(
                        CMTimeRange(start: .zero, duration: chunk),
                        of: assetTrack,
                        at: timelineStart + inserted
                    )
                    inserted = inserted + chunk
                }
                insertedEnd = start + window
            } else {
                let playable = CMTimeMinimum(assetDuration, window)
                try track.insertTimeRange(
                    CMTimeRange(start: .zero, duration: playable),
                    of: assetTrack,
                    at: timelineStart
                )
                insertedEnd = start + playable
            }

            // Plafond `StoryVolume.maxGain` et non 1.0 : un gain au-delà de
            // 100 % n'est applicable QUE par AVAudioMix, les nodes
            // AVFoundation étant bornés — le brider ici le rendrait inaudible
            // partout.
            let baseVolume = min(StoryVolume.maxGain, max(0, audio.volume))
            let fadeIn = Double(audio.fadeIn ?? 0)
            let fadeOut = Double(audio.fadeOut ?? 0)
            let automation = (audio.keyframes ?? []).filter { $0.volume != nil }
            let needsMix = abs(baseVolume - 1.0) > 0.001 || fadeIn > 0.01 || fadeOut > 0.01
                || !automation.isEmpty
            guard needsMix else { continue }

            let params = AVMutableAudioMixInputParameters(track: track)
            if automation.isEmpty {
                params.setVolume(baseVolume, at: .zero)
            } else {
                // L'automation prime sur le niveau statique ; les rampes sont
                // décalées de `start`, position du clip dans la timeline.
                for (range, from, to) in Self.volumeRamps(base: baseVolume,
                                                          keyframes: audio.keyframes,
                                                          duration: insertedEnd.seconds) {
                    let shifted = CMTimeRange(start: range.start + timelineStart,
                                              duration: range.duration)
                    params.setVolumeRamp(fromStartVolume: from, toEndVolume: to,
                                         timeRange: shifted)
                }
            }
            if fadeIn > 0.01 {
                params.setVolumeRamp(
                    fromStartVolume: 0,
                    toEndVolume: baseVolume,
                    timeRange: CMTimeRange(
                        start: timelineStart,
                        duration: CMTime(seconds: fadeIn, preferredTimescale: 600)
                    )
                )
            }
            if fadeOut > 0.01 {
                let rampDuration = CMTime(seconds: fadeOut, preferredTimescale: 600)
                let rampStart = insertedEnd - rampDuration
                if rampStart > start {
                    params.setVolumeRamp(
                        fromStartVolume: baseVolume,
                        toEndVolume: 0,
                        timeRange: CMTimeRange(start: rampStart + storyStart,
                                               duration: rampDuration)
                    )
                }
            }
            parameters.append(params)
        }

        return parameters
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
                                 at startTime: CMTime = .zero,
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
                at: startTime + inserted
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
