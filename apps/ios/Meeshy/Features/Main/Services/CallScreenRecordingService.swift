import AVFoundation
import MeeshySDK
import ReplayKit
import UIKit
import os

// #8437 — l'enregistrement d'un appel par ReplayKit : l'écran de Meeshy (en
// vidéo), le son que l'app JOUE (les voix des autres) et le micro. Le fichier
// brut porte une piste par source ; `finish` les mixe en une seule piste audio
// (un lecteur web ne joue que la première) dans le fichier déposé.
//
// LIMITE À MESURER SUR APPAREIL : pendant un appel WebRTC, la voix distante
// sort par l'unité VoiceProcessingIO ; si ReplayKit n'en livre pas les
// échantillons (`audioApp` muet), l'enregistrement ne contient que le micro —
// le module audio WebRTC dédié (#8259) reste alors la seule voie.
//
// L'audio seul retombe sur la prise micro (`CallRecordingService`) quand
// ReplayKit est indisponible ou refusé : mieux vaut la voix locale que rien.

enum CallScreenCaptureTrack: Equatable, Sendable {
    case video
    case appAudio
    case micAudio
}

struct CallScreenCapturePlan: Equatable, Sendable {
    struct Mixdown: Equatable, Sendable {
        let presetName: String
        let fileType: AVFileType
    }

    let kind: CallRecordingKind

    func track(for type: RPSampleBufferType) -> CallScreenCaptureTrack? {
        switch type {
        case .video: return kind == .video ? .video : nil
        case .audioApp: return .appAudio
        case .audioMic: return .micAudio
        @unknown default: return nil
        }
    }

    /// La piste dont le premier échantillon ouvre le fichier : l'image pour
    /// une vidéo (pas de début noir), n'importe quel son pour l'audio seul.
    var anchors: Set<CallScreenCaptureTrack> {
        kind == .video ? [.video] : [.appAudio, .micAudio]
    }

    var mixdown: Mixdown {
        kind == .video
            ? Mixdown(presetName: AVAssetExportPresetHighestQuality, fileType: .mp4)
            : Mixdown(presetName: AVAssetExportPresetAppleM4A, fileType: .m4a)
    }
}

nonisolated enum CallScreenRecordingError: Error, Equatable {
    case unavailable
    case nothingCaptured
    case mixdownFailed
}

final class CallScreenRecordingService: CallRecordingServiceProviding {
    private let plan: CallScreenCapturePlan
    private let fallback: (any CallRecordingServiceProviding)?
    private let screenRecorder: RPScreenRecorder
    private var writer: CallScreenSampleWriter?
    private var targetURL: URL?
    private var fallbackActive = false
    private let logger = Logger(subsystem: "me.meeshy.app", category: "call-recording")

    nonisolated deinit {}

    init(kind: CallRecordingKind, fallback: (any CallRecordingServiceProviding)? = nil, screenRecorder: RPScreenRecorder = .shared()) {
        self.plan = CallScreenCapturePlan(kind: kind)
        self.fallback = fallback
        self.screenRecorder = screenRecorder
    }

    func start(fileURL: URL) throws {
        guard screenRecorder.isAvailable else {
            try startFallback(fileURL: fileURL, reason: "unavailable")
            return
        }
        let rawURL = fileURL.deletingPathExtension().appendingPathExtension("brut.mov")
        let sampleWriter = try CallScreenSampleWriter(url: rawURL, plan: plan)
        writer = sampleWriter
        targetURL = fileURL
        screenRecorder.isMicrophoneEnabled = true
        let handler: @Sendable (CMSampleBuffer, RPSampleBufferType, Error?) -> Void = { buffer, type, error in
            guard error == nil else { return }
            sampleWriter.append(buffer, type: type)
        }
        let completion: @Sendable (Error?) -> Void = { [weak self] error in
            guard let error else { return }
            Task { @MainActor [weak self] in self?.captureRefused(error, fileURL: fileURL) }
        }
        screenRecorder.startCapture(handler: handler, completionHandler: completion)
        logger.info("call screen recording started (\(self.plan.kind.rawValue, privacy: .public))")
    }

    func stop() -> URL? {
        if fallbackActive { return fallback?.stop() }
        guard writer != nil, let targetURL else { return nil }
        screenRecorder.stopCapture(handler: nil)
        return targetURL
    }

    func finish(_ fileURL: URL) async throws -> URL {
        if fallbackActive {
            fallbackActive = false
            return try await fallback?.finish(fileURL) ?? fileURL
        }
        guard let sampleWriter = writer else { throw CallScreenRecordingError.nothingCaptured }
        writer = nil
        targetURL = nil
        let rawURL = try await sampleWriter.finish()
        defer { try? FileManager.default.removeItem(at: rawURL) }
        try await CallScreenMixdown.export(from: rawURL, to: fileURL, mixdown: plan.mixdown)
        return fileURL
    }

    private func startFallback(fileURL: URL, reason: String) throws {
        guard let fallback else { throw CallScreenRecordingError.unavailable }
        logger.info("call screen recording falls back to the microphone (\(reason, privacy: .public))")
        try fallback.start(fileURL: fileURL)
        fallbackActive = true
    }

    private func captureRefused(_ error: Error, fileURL: URL) {
        logger.error("call screen recording refused: \(error.localizedDescription, privacy: .public)")
        writer?.cancel()
        writer = nil
        targetURL = nil
        try? startFallback(fileURL: fileURL, reason: "refused")
    }
}

/// Écrit les échantillons ReplayKit dans un fichier brut, une piste par
/// source. ReplayKit livre sur ses propres files : tout passe par `queue`.
nonisolated final class CallScreenSampleWriter: @unchecked Sendable {
    private let queue = DispatchQueue(label: "me.meeshy.call-recording.writer")
    private let writer: AVAssetWriter
    private let plan: CallScreenCapturePlan
    private let inputs: [CallScreenCaptureTrack: AVAssetWriterInput]
    private var sessionStarted = false
    private var cancelled = false

    init(url: URL, plan: CallScreenCapturePlan) throws {
        try? FileManager.default.removeItem(at: url)
        writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        self.plan = plan
        var made: [CallScreenCaptureTrack: AVAssetWriterInput] = [:]
        if plan.kind == .video {
            made[.video] = Self.videoInput()
        }
        made[.appAudio] = Self.audioInput()
        made[.micAudio] = Self.audioInput()
        for input in made.values where writer.canAdd(input) {
            writer.add(input)
        }
        inputs = made
    }

    func append(_ buffer: CMSampleBuffer, type: RPSampleBufferType) {
        guard let track = plan.track(for: type), CMSampleBufferDataIsReady(buffer) else { return }
        queue.async { [self] in
            guard !cancelled, let input = inputs[track] else { return }
            if !sessionStarted {
                guard plan.anchors.contains(track), writer.startWriting() else { return }
                writer.startSession(atSourceTime: CMSampleBufferGetPresentationTimeStamp(buffer))
                sessionStarted = true
            }
            guard writer.status == .writing, input.isReadyForMoreMediaData else { return }
            input.append(buffer)
        }
    }

    func finish() async throws -> URL {
        let url = writer.outputURL
        let started: Bool = queue.sync { sessionStarted && !cancelled }
        guard started else { throw CallScreenRecordingError.nothingCaptured }
        queue.sync { inputs.values.forEach { $0.markAsFinished() } }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            writer.finishWriting { continuation.resume() }
        }
        guard writer.status == .completed else { throw CallScreenRecordingError.nothingCaptured }
        return url
    }

    func cancel() {
        queue.sync {
            cancelled = true
            if writer.status == .writing { writer.cancelWriting() }
        }
    }

    private static func videoInput() -> AVAssetWriterInput {
        let bounds = UIScreen.main.nativeBounds
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: Int(bounds.width),
            AVVideoHeightKey: Int(bounds.height),
        ])
        input.expectsMediaDataInRealTime = true
        return input
    }

    private static func audioInput() -> AVAssetWriterInput {
        let input = AVAssetWriterInput(mediaType: .audio, outputSettings: [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 64_000,
        ])
        input.expectsMediaDataInRealTime = true
        return input
    }
}

/// Le fichier déposé : les pistes audio MIXÉES en une (l'export les fond),
/// l'image réencodée en MP4 pour une vidéo.
nonisolated enum CallScreenMixdown {
    static func export(from rawURL: URL, to url: URL, mixdown: CallScreenCapturePlan.Mixdown) async throws {
        try? FileManager.default.removeItem(at: url)
        guard let session = AVAssetExportSession(asset: AVURLAsset(url: rawURL), presetName: mixdown.presetName) else {
            throw CallScreenRecordingError.mixdownFailed
        }
        session.outputURL = url
        session.outputFileType = mixdown.fileType
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            session.exportAsynchronously { continuation.resume() }
        }
        guard session.status == .completed else { throw CallScreenRecordingError.mixdownFailed }
    }
}
