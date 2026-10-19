import AVFoundation
import CoreMedia
import CoreVideo
import Foundation

// Extrait de `StoryExporter.swift` : l'ENCODAGE final (lecteur de composition →
// écrivain MP4 au débit plafonné) est une responsabilité distincte de la
// COMPOSITION des pistes que `StoryExporter.export` assemble en amont.

enum StoryExportEncoder {

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
}
