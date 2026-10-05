import AVFoundation
import CoreGraphics
import CoreMedia
import CoreVideo
import Foundation
import os

// #8625 — filmer le montage rendu en direct. Les images viennent du rendu du
// gabarit (`CallMontageRenderer`, le même que la photo), le son du micro.
//
// LIMITE ASSUMÉE — la même que `CallRecordingService` : le SDK WebRTC public
// n'expose pas son module audio, et les voix DISTANTES sortent par l'unité
// VoiceProcessingIO sans point où les taper. La vidéo porte donc la voix
// LOCALE ; mixer les voix distantes demande l'ADM personnalisé (#8259).

nonisolated struct CallMontageAudioFormat: Equatable, Sendable {
    let sampleRate: Double
    let channels: Int
}

nonisolated struct CallMontageAudioChunk: @unchecked Sendable {
    let buffer: CMSampleBuffer
}

nonisolated struct CallMontageVideoFrame: @unchecked Sendable {
    let image: CGImage
}

/// Ce qui capte le son de la vidéo : le micro en production.
@MainActor
protocol CallMontageAudioSourcing: AnyObject {
    var format: CallMontageAudioFormat? { get }
    func start(onSample: @escaping @Sendable (CallMontageAudioChunk) -> Void) -> Bool
    func stop()
}

/// Filmer le montage : ouvrir un fichier, y poser chaque image rendue, le
/// fermer et le rendre prêt à déposer dans la photothèque.
@MainActor
protocol CallMontageRecordingProviding: AnyObject {
    func start(canvas: CGSize) throws
    func append(_ frame: CGImage)
    func finish() async -> URL?
    func cancel()
}

final class CallMontageRecorder: CallMontageRecordingProviding {
    private let audioSource: (any CallMontageAudioSourcing)?
    private let directory: URL
    private let clock: @Sendable () -> CMTime
    private var writer: CallMontageMovieWriter?
    private var listensToAudio = false
    private let logger = Logger(subsystem: "me.meeshy.app", category: "call-montage-recording")

    nonisolated deinit {}

    init(
        audioSource: (any CallMontageAudioSourcing)? = CallMontageMicrophoneTap(),
        directory: URL = FileManager.default.temporaryDirectory,
        clock: @escaping @Sendable () -> CMTime = { CMClockGetTime(CMClockGetHostTimeClock()) }
    ) {
        self.audioSource = audioSource
        self.directory = directory
        self.clock = clock
    }

    func start(canvas: CGSize) throws {
        cancel()
        let url = directory.appendingPathComponent("meeshy-montage-\(UUID().uuidString).mp4")
        let movie = try CallMontageMovieWriter(url: url, size: canvas, audio: audioSource?.format)
        writer = movie
        guard movie.hasAudio, let audioSource else { return }
        let forward: @Sendable (CallMontageAudioChunk) -> Void = { chunk in movie.appendAudio(chunk) }
        listensToAudio = audioSource.start(onSample: forward)
        if !listensToAudio { logger.info("montage recording without sound: microphone unavailable") }
    }

    func append(_ frame: CGImage) {
        writer?.appendVideo(CallMontageVideoFrame(image: frame), at: clock())
    }

    func finish() async -> URL? {
        stopListening()
        guard let movie = writer else { return nil }
        writer = nil
        return await movie.finish()
    }

    func cancel() {
        stopListening()
        writer?.cancel()
        writer = nil
    }

    private func stopListening() {
        guard listensToAudio else { return }
        listensToAudio = false
        audioSource?.stop()
    }
}

/// Le micro, par un `AVAudioEngine` indépendant du pipeline WebRTC — le même
/// tap que `CallRecordingService`, gardé par `AudioTapFormatReadiness` (#7002).
final class CallMontageMicrophoneTap: CallMontageAudioSourcing {
    private let engine = AVAudioEngine()
    private var isTapped = false

    nonisolated deinit {}

    var format: CallMontageAudioFormat? {
        let input = engine.inputNode.outputFormat(forBus: 0)
        guard AudioTapFormatReadiness.mayInstall(sampleRate: input.sampleRate, channelCount: input.channelCount) else { return nil }
        return CallMontageAudioFormat(sampleRate: input.sampleRate, channels: Int(input.channelCount))
    }

    func start(onSample: @escaping @Sendable (CallMontageAudioChunk) -> Void) -> Bool {
        guard !isTapped else { return true }
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard AudioTapFormatReadiness.mayInstall(sampleRate: format.sampleRate, channelCount: format.channelCount) else { return false }
        let tapBlock: @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void = { buffer, when in
            let time = when.isHostTimeValid
                ? CMClockMakeHostTimeFromSystemUnits(when.hostTime)
                : CMClockGetTime(CMClockGetHostTimeClock())
            guard let sample = CallMontageAudioSample.make(from: buffer, at: time) else { return }
            onSample(CallMontageAudioChunk(buffer: sample))
        }
        input.installTap(onBus: 0, bufferSize: 4096, format: format, block: tapBlock)
        engine.prepare()
        do {
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
            return false
        }
        isTapped = true
        return true
    }

    func stop() {
        guard isTapped else { return }
        isTapped = false
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
    }
}

/// Un tampon PCM du micro devient un échantillon que l'écrivain AAC accepte,
/// daté sur l'horloge hôte — la même que celle des images.
nonisolated enum CallMontageAudioSample {
    static func make(from buffer: AVAudioPCMBuffer, at time: CMTime) -> CMSampleBuffer? {
        guard buffer.frameLength > 0 else { return nil }
        var description: CMAudioFormatDescription?
        guard CMAudioFormatDescriptionCreate(
            allocator: kCFAllocatorDefault,
            asbd: buffer.format.streamDescription,
            layoutSize: 0,
            layout: nil,
            magicCookieSize: 0,
            magicCookie: nil,
            extensions: nil,
            formatDescriptionOut: &description
        ) == noErr, let description else { return nil }
        var timing = CMSampleTimingInfo(
            duration: CMTime(value: 1, timescale: CMTimeScale(buffer.format.sampleRate)),
            presentationTimeStamp: time,
            decodeTimeStamp: .invalid
        )
        var sample: CMSampleBuffer?
        guard CMSampleBufferCreate(
            allocator: kCFAllocatorDefault,
            dataBuffer: nil,
            dataReady: false,
            makeDataReadyCallback: nil,
            refcon: nil,
            formatDescription: description,
            sampleCount: CMItemCount(buffer.frameLength),
            sampleTimingEntryCount: 1,
            sampleTimingArray: &timing,
            sampleSizeEntryCount: 0,
            sampleSizeArray: nil,
            sampleBufferOut: &sample
        ) == noErr, let sample else { return nil }
        guard CMSampleBufferSetDataBufferFromAudioBufferList(
            sample,
            blockBufferAllocator: kCFAllocatorDefault,
            blockBufferMemoryAllocator: kCFAllocatorDefault,
            flags: 0,
            bufferList: buffer.audioBufferList
        ) == noErr else { return nil }
        return sample
    }
}

nonisolated enum CallMontageRecordingError: Error, Equatable {
    case writerUnavailable
}

/// L'écrivain du fichier : H.264 pour l'image, AAC pour le son. Les images
/// et le son arrivent de fils différents : tout passe par `queue`.
nonisolated final class CallMontageMovieWriter: @unchecked Sendable {
    private let queue = DispatchQueue(label: "me.meeshy.call.montage-writer", qos: .userInitiated)
    private let writer: AVAssetWriter
    private let video: AVAssetWriterInput
    private let adaptor: AVAssetWriterInputPixelBufferAdaptor
    private let audio: AVAssetWriterInput?
    private let width: Int
    private let height: Int
    private var sessionStart: CMTime?
    private var lastVideoTime: CMTime?
    private var isClosed = false

    var hasAudio: Bool { audio != nil }

    init(url: URL, size: CGSize, audio format: CallMontageAudioFormat?) throws {
        try? FileManager.default.removeItem(at: url)
        let assetWriter = try AVAssetWriter(outputURL: url, fileType: .mp4)
        let pixelWidth = Self.evenDimension(size.width)
        let pixelHeight = Self.evenDimension(size.height)
        let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: pixelWidth,
            AVVideoHeightKey: pixelHeight,
        ])
        videoInput.expectsMediaDataInRealTime = true
        guard assetWriter.canAdd(videoInput) else { throw CallMontageRecordingError.writerUnavailable }
        assetWriter.add(videoInput)
        let audioInput = format.flatMap { Self.audioInput(for: $0, in: assetWriter) }
        writer = assetWriter
        width = pixelWidth
        height = pixelHeight
        video = videoInput
        audio = audioInput
        adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: videoInput, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: pixelWidth,
            kCVPixelBufferHeightKey as String: pixelHeight,
        ])
    }

    private static func audioInput(for format: CallMontageAudioFormat, in writer: AVAssetWriter) -> AVAssetWriterInput? {
        let input = AVAssetWriterInput(mediaType: .audio, outputSettings: [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: format.sampleRate,
            AVNumberOfChannelsKey: min(max(format.channels, 1), 2),
            AVEncoderBitRateKey: 96_000,
        ])
        input.expectsMediaDataInRealTime = true
        guard writer.canAdd(input) else { return nil }
        writer.add(input)
        return input
    }

    static func evenDimension(_ value: CGFloat) -> Int {
        let pixels = value.isFinite ? Int(value) : 0
        return max(2, pixels - pixels % 2)
    }

    func appendVideo(_ frame: CallMontageVideoFrame, at time: CMTime) {
        queue.async { [self] in
            guard !isClosed else { return }
            if sessionStart == nil {
                guard writer.startWriting() else { return }
                writer.startSession(atSourceTime: time)
                sessionStart = time
            }
            guard writer.status == .writing, video.isReadyForMoreMediaData else { return }
            if let lastVideoTime, CMTimeCompare(time, lastVideoTime) <= 0 { return }
            guard let buffer = Self.pixelBuffer(from: frame.image, pool: adaptor.pixelBufferPool, width: width, height: height) else { return }
            if adaptor.append(buffer, withPresentationTime: time) { lastVideoTime = time }
        }
    }

    func appendAudio(_ chunk: CallMontageAudioChunk) {
        queue.async { [self] in
            guard !isClosed, let audio, let sessionStart, writer.status == .writing, audio.isReadyForMoreMediaData else { return }
            guard CMTimeCompare(CMSampleBufferGetPresentationTimeStamp(chunk.buffer), sessionStart) >= 0 else { return }
            audio.append(chunk.buffer)
        }
    }

    func finish() async -> URL? {
        let wrote: Bool = queue.sync {
            let wrote = !isClosed && lastVideoTime != nil && writer.status == .writing
            isClosed = true
            guard wrote else {
                if writer.status == .writing { writer.cancelWriting() }
                return false
            }
            video.markAsFinished()
            audio?.markAsFinished()
            return true
        }
        guard wrote else {
            try? FileManager.default.removeItem(at: writer.outputURL)
            return nil
        }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            writer.finishWriting { continuation.resume() }
        }
        guard writer.status == .completed else {
            try? FileManager.default.removeItem(at: writer.outputURL)
            return nil
        }
        return writer.outputURL
    }

    func cancel() {
        queue.sync {
            isClosed = true
            if writer.status == .writing { writer.cancelWriting() }
        }
        try? FileManager.default.removeItem(at: writer.outputURL)
    }

    private static func pixelBuffer(from image: CGImage, pool: CVPixelBufferPool?, width: Int, height: Int) -> CVPixelBuffer? {
        var made: CVPixelBuffer?
        if let pool { CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &made) }
        if made == nil {
            let attributes = [
                kCVPixelBufferCGImageCompatibilityKey: true,
                kCVPixelBufferCGBitmapContextCompatibilityKey: true,
            ] as CFDictionary
            CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, attributes, &made)
        }
        guard let buffer = made else { return nil }
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        guard let context = CGContext(
            data: CVPixelBufferGetBaseAddress(buffer),
            width: CVPixelBufferGetWidth(buffer),
            height: CVPixelBufferGetHeight(buffer),
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
        ) else { return nil }
        context.draw(image, in: CGRect(x: 0, y: 0, width: CVPixelBufferGetWidth(buffer), height: CVPixelBufferGetHeight(buffer)))
        return buffer
    }
}
