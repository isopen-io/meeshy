import AVFoundation
import Foundation
import os

// #8064 — ce qui CAPTE un appel enregistré, sur l'appareil de celui qui l'a
// demandé et seulement quand tous ont consenti (la passerelle en décide).
//
// LIMITE ASSUMÉE : iOS n'enregistre que la voix LOCALE. Le SDK WebRTC public
// n'expose pas son module audio (ADM, voir `P2PWebRTCClient`) : l'audio
// DISTANT est rendu directement par l'unité VoiceProcessingIO, sans point où
// le taper. Le mixage des voix distantes demande un ADM personnalisé — suivi
// ouvert à part. Le web, lui, mélange les deux (`call-recording-runtime.ts`).
//
// Même tap que `CallTranscriptionService` : un `AVAudioEngine` indépendant du
// pipeline WebRTC, garde de format `AudioTapFormatReadiness` (#7002), bloc
// `@Sendable` explicite (le bloc s'exécute hors du fil principal).

nonisolated enum CallRecordingCaptureError: Error, Equatable {
    case tapFormatUnavailable
}

protocol CallRecordingServiceProviding: AnyObject {
    func start(fileURL: URL) throws
    /// Rend le fichier quand quelque chose a été capté, `nil` sinon.
    func stop() -> URL?
    /// #8437 — rend le fichier PRÊT à déposer : une capture qui écrit en
    /// asynchrone (ReplayKit) y termine son fichier et y mixe ses pistes.
    func finish(_ fileURL: URL) async throws -> URL
}

extension CallRecordingServiceProviding {
    func finish(_ fileURL: URL) async throws -> URL { fileURL }
}

final class CallRecordingService: CallRecordingServiceProviding {
    private let engine = AVAudioEngine()
    private var file: AVAudioFile?
    private var fileURL: URL?
    private let logger = Logger(subsystem: "me.meeshy.app", category: "call-recording")

    nonisolated deinit {}

    func start(fileURL: URL) throws {
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard AudioTapFormatReadiness.mayInstall(sampleRate: format.sampleRate, channelCount: format.channelCount) else {
            throw CallRecordingCaptureError.tapFormatUnavailable
        }
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: format.sampleRate,
            AVNumberOfChannelsKey: format.channelCount,
            AVEncoderBitRateKey: 64_000,
        ]
        let output = try AVAudioFile(
            forWriting: fileURL,
            settings: settings,
            commonFormat: format.commonFormat,
            interleaved: format.isInterleaved
        )
        nonisolated(unsafe) let capturedFile = output
        let tapBlock: @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void = { buffer, _ in
            try? capturedFile.write(from: buffer)
        }
        input.installTap(onBus: 0, bufferSize: 4096, format: format, block: tapBlock)
        engine.prepare()
        do {
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
            throw error
        }
        file = output
        self.fileURL = fileURL
        logger.info("call recording capture started")
    }

    func stop() -> URL? {
        guard let output = file, let url = fileURL else { return nil }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        let frames = output.length
        if #available(iOS 18.0, *) { output.close() }
        file = nil
        fileURL = nil
        logger.info("call recording capture stopped (frames=\(frames))")
        guard frames > 0 else {
            try? FileManager.default.removeItem(at: url)
            return nil
        }
        return url
    }
}
