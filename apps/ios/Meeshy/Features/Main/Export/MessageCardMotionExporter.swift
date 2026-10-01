import Foundation
import AVFoundation
import ImageIO
import UniformTypeIdentifiers
import UIKit
import MeeshySDK
import MeeshyUI

/// Où une carte animée trouve ce qui bouge : la vidéo dont chaque image
/// remplace le poster, et la piste son posée sous la vidéo.
struct MessageCardMotionSource: Sendable {
    let videoFile: URL?
    let videoID: String?
    let audioFile: URL?
}

/// **UNE CARTE « IMAGINE » QUI BOUGE** (#8692, premier jet) — la même carte,
/// peinte image par image par le MÊME moteur (`MessageCardRenderer.frame`) :
///
/// - une VIDÉO jointe se joue dans son cadre — chaque image de la carte reçoit
///   l'image de la vidéo au même instant de l'EXTRAIT choisi ;
/// - un SON fait avancer sa représentation au VRAI temps écoulé (les barres
///   jouées s'allument, le minuteur compte, le spectre danse, la phrase dite
///   se surligne), et sa piste — coupée à l'extrait — est posée sous la vidéo (#8979).
///
/// Un GIF est écrit par ImageIO, une vidéo par `AVAssetWriter` (H.264), puis
/// assemblée avec sa piste par `AVAssetExportSession`. Toujours appelé HORS du
/// MainActor ; l'annulation de la tâche arrête l'encodage à l'image suivante.
nonisolated enum MessageCardMotionExporter {

    enum Failure: Error {
        case unsupported
        case frame
        case writer(Error?)
        case mux(Error?)
    }

    /// - Parameter progress: appelé à chaque image, de 0 à 1 — jamais sur le MainActor.
    static func export(
        input: MessageCardInput,
        pictures: MessageCardPictures,
        plan: MessageCardMotionPlan,
        source: MessageCardMotionSource,
        progress: @escaping @Sendable (Double) -> Void
    ) async throws -> URL {
        let size = MessageCardRenderer.size(of: input)
        let pixels = plan.pixelSize(width: Double(size.width), height: Double(size.height))
        let generator = source.videoFile.map { file -> AVAssetImageGenerator in
            let generator = AVAssetImageGenerator(asset: AVURLAsset(url: file))
            generator.appliesPreferredTrackTransform = true
            generator.maximumSize = CGSize(width: 1080, height: 1080)
            let tolerance = CMTime(seconds: 0.5 / plan.fps, preferredTimescale: 600)
            generator.requestedTimeToleranceBefore = tolerance
            generator.requestedTimeToleranceAfter = tolerance
            return generator
        }
        switch plan.output {
        case .gif:
            return try await writeGIF(input: input, pictures: pictures, plan: plan, pixels: pixels, generator: generator, videoID: source.videoID, progress: progress)
        case .video:
            let silent = try await writeVideo(input: input, pictures: pictures, plan: plan, pixels: pixels, generator: generator, videoID: source.videoID, progress: progress)
            guard let track = source.audioFile ?? source.videoFile else { return silent }
            return try await mux(video: silent, soundFrom: track, startingAt: plan.start)
        case .image:
            throw Failure.unsupported
        }
    }

    // MARK: - Images

    /// L'image `index` de la carte, à l'instant où elle s'affiche : la vidéo donne son image du même instant de l'extrait.
    private static func frame(
        _ index: Int,
        input: MessageCardInput,
        pictures: MessageCardPictures,
        plan: MessageCardMotionPlan,
        pixels: (width: Int, height: Int),
        generator: AVAssetImageGenerator?,
        videoID: String?
    ) async throws -> CGImage {
        try Task.checkCancellation()
        var painted = pictures
        if let generator, let videoID {
            let time = CMTime(seconds: plan.start + plan.time(ofFrame: index), preferredTimescale: 600)
            nonisolated(unsafe) let sequentialGenerator = generator
            if let still = try? await sequentialGenerator.image(at: time).image {
                painted = pictures.replacing(videoID, with: still)
            }
        }
        let moment = input.at(time: plan.time(ofFrame: index))
        let rendered = autoreleasepool {
            MessageCardRenderer.frame(moment, pictures: painted, pixelWidth: pixels.width, pixelHeight: pixels.height)
        }
        guard let rendered else { throw Failure.frame }
        return rendered
    }

    private static func temporaryURL(_ output: MessageCardOutput) -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-imagine-\(UUID().uuidString)")
            .appendingPathExtension(output.fileExtension)
    }

    // MARK: - GIF

    private static func writeGIF(
        input: MessageCardInput,
        pictures: MessageCardPictures,
        plan: MessageCardMotionPlan,
        pixels: (width: Int, height: Int),
        generator: AVAssetImageGenerator?,
        videoID: String?,
        progress: @escaping @Sendable (Double) -> Void
    ) async throws -> URL {
        let url = temporaryURL(.gif)
        guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.gif.identifier as CFString, plan.frameCount, nil) else {
            throw Failure.writer(nil)
        }
        let loop = [kCGImagePropertyGIFDictionary as String: [kCGImagePropertyGIFLoopCount as String: 0]]
        CGImageDestinationSetProperties(destination, loop as CFDictionary)
        let delay = [kCGImagePropertyGIFDictionary as String: [kCGImagePropertyGIFDelayTime as String: 1 / plan.fps]]
        for index in 0..<plan.frameCount {
            let image = try await frame(index, input: input, pictures: pictures, plan: plan, pixels: pixels, generator: generator, videoID: videoID)
            CGImageDestinationAddImage(destination, image, delay as CFDictionary)
            progress(Double(index + 1) / Double(plan.frameCount))
        }
        guard CGImageDestinationFinalize(destination) else { throw Failure.writer(nil) }
        return url
    }

    // MARK: - Vidéo

    private static func writeVideo(
        input: MessageCardInput,
        pictures: MessageCardPictures,
        plan: MessageCardMotionPlan,
        pixels: (width: Int, height: Int),
        generator: AVAssetImageGenerator?,
        videoID: String?,
        progress: @escaping @Sendable (Double) -> Void
    ) async throws -> URL {
        let url = temporaryURL(.video)
        let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
        let writerInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: pixels.width,
            AVVideoHeightKey: pixels.height,
        ])
        writerInput.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: writerInput,
            sourcePixelBufferAttributes: [
                kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32ARGB),
                kCVPixelBufferWidthKey as String: pixels.width,
                kCVPixelBufferHeightKey as String: pixels.height,
            ]
        )
        guard writer.canAdd(writerInput) else { throw Failure.writer(nil) }
        writer.add(writerInput)
        // `startSession` après un `startWriting` refusé lève une exception
        // Objective-C qu'aucun `catch` Swift ne rattrape (#7004).
        guard writer.startWriting() else { throw Failure.writer(writer.error) }
        writer.startSession(atSourceTime: .zero)
        for index in 0..<plan.frameCount {
            let image: CGImage
            do {
                image = try await frame(index, input: input, pictures: pictures, plan: plan, pixels: pixels, generator: generator, videoID: videoID)
            } catch {
                writer.cancelWriting()
                throw error
            }
            while !writerInput.isReadyForMoreMediaData {
                try await Task.sleep(nanoseconds: 4_000_000)
            }
            guard let buffer = pixelBuffer(from: image, width: pixels.width, height: pixels.height) else {
                writer.cancelWriting()
                throw Failure.frame
            }
            adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(index), timescale: CMTimeScale(plan.fps.rounded())))
            progress(Double(index + 1) / Double(plan.frameCount))
        }
        writerInput.markAsFinished()
        writer.endSession(atSourceTime: CMTime(seconds: plan.duration, preferredTimescale: 600))
        await writer.finishWriting()
        guard writer.status == .completed else { throw Failure.writer(writer.error) }
        return url
    }

    private static func pixelBuffer(from image: CGImage, width: Int, height: Int) -> CVPixelBuffer? {
        var buffer: CVPixelBuffer?
        let attributes: [String: Any] = [
            kCVPixelBufferCGImageCompatibilityKey as String: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
        ]
        guard CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32ARGB, attributes as CFDictionary, &buffer) == kCVReturnSuccess,
              let pixelBuffer = buffer else { return nil }
        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }
        guard let context = CGContext(
            data: CVPixelBufferGetBaseAddress(pixelBuffer),
            width: width, height: height,
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
        ) else { return nil }
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        return pixelBuffer
    }

    // MARK: - Piste son

    /// Pose la piste son de `soundFrom` sous la vidéo muette — à partir de `start`,
    /// sur la durée de la vidéo. Sans piste son (une vidéo muette), la vidéo
    /// muette est la réponse juste.
    private static func mux(video: URL, soundFrom source: URL, startingAt start: Double) async throws -> URL {
        let composition = AVMutableComposition()
        let videoAsset = AVURLAsset(url: video)
        let soundAsset = AVURLAsset(url: source)
        guard let picture = try await videoAsset.loadTracks(withMediaType: .video).first,
              let pictureTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
            throw Failure.mux(nil)
        }
        let length = try await videoAsset.load(.duration)
        try pictureTrack.insertTimeRange(CMTimeRange(start: .zero, duration: length), of: picture, at: .zero)
        guard let sound = try await soundAsset.loadTracks(withMediaType: .audio).first,
              let soundTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
            return video
        }
        let soundLength = try await soundAsset.load(.duration)
        let from = CMTimeMinimum(CMTime(seconds: max(0, start), preferredTimescale: 600), soundLength)
        let heard = CMTimeMinimum(length, CMTimeSubtract(soundLength, from))
        guard heard > .zero else { return video }
        try soundTrack.insertTimeRange(CMTimeRange(start: from, duration: heard), of: sound, at: .zero)
        guard let session = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
            throw Failure.mux(nil)
        }
        let url = temporaryURL(.video)
        session.outputURL = url
        session.outputFileType = .mp4
        await session.export()
        guard session.status == .completed else { throw Failure.mux(session.error) }
        try? FileManager.default.removeItem(at: video)
        return url
    }
}
