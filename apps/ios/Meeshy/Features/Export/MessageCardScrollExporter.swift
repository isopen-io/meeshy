import Foundation
import AVFoundation
import UIKit
import MeeshySDK
import MeeshyUI

/// Une vidéo qui s'anime SOUS la carte qui défile : celle du message, ou le
/// fond choisi — elle boucle tant que le texte passe.
nonisolated struct MessageCardScrollVideo: Sendable {
    let id: String
    let file: URL
}

/// **UN MESSAGE LONG QUI DÉFILE EN VIDÉO** (#18671) — la carte est mise en
/// page UNE fois sans plafond, le texte à sa taille naturelle, puis chaque
/// image la décale sous la fenêtre du format, à la vitesse choisie. Le fond,
/// son voile et le filigrane « Meeshy @pseudo » restent fixes.
///
/// H.264, 30 images par seconde, toujours hors du MainActor ; l'annulation de
/// la tâche arrête l'encodage à l'image suivante.
nonisolated enum MessageCardScrollExporter {

    enum Failure: Error {
        case nothingToScroll
        case frame
        case writer(Error?)
    }

    static func export(
        input: MessageCardInput,
        pictures: MessageCardPictures,
        speed: MessageCardScrollSpeed,
        videos: [MessageCardScrollVideo],
        progress: @escaping @Sendable (Double) -> Void
    ) async throws -> URL {
        let layout = MessageCardRenderer.scrollLayout(input)
        let viewport = layout.viewportHeight ?? layout.height
        guard let plan = MessageCardScrollPlan.of(contentHeight: layout.height, viewportHeight: viewport, speed: speed) else {
            throw Failure.nothingToScroll
        }
        let pixels = (width: even(layout.width), height: even(viewport))
        let clips = await loops(videos)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-scroll-\(UUID().uuidString)")
            .appendingPathExtension(MessageCardOutput.video.fileExtension)
        let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
        writer.shouldOptimizeForNetworkUse = true
        let writerInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: pixels.width,
            AVVideoHeightKey: pixels.height,
        ])
        writerInput.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: writerInput, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32ARGB),
            kCVPixelBufferWidthKey as String: pixels.width,
            kCVPixelBufferHeightKey as String: pixels.height,
        ])
        guard writer.canAdd(writerInput) else { throw Failure.writer(nil) }
        writer.add(writerInput)
        guard writer.startWriting() else { throw Failure.writer(writer.error) }
        writer.startSession(atSourceTime: .zero)
        do {
            for index in 0..<plan.frameCount {
                try Task.checkCancellation()
                let time = plan.time(ofFrame: index)
                let painted = await frames(of: clips, at: time, over: pictures)
                let image = autoreleasepool {
                    MessageCardRenderer.scrollFrame(layout, input: input, pictures: painted, offset: plan.offset(at: time),
                                                    pixelWidth: pixels.width, pixelHeight: pixels.height)
                }
                guard let image, let buffer = MessageCardMotionExporter.pixelBuffer(from: image, width: pixels.width, height: pixels.height) else {
                    throw Failure.frame
                }
                while !writerInput.isReadyForMoreMediaData {
                    try await Task.sleep(for: .milliseconds(4))
                }
                adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(index), timescale: CMTimeScale(MessageCardScrollPlan.fps)))
                progress(Double(index + 1) / Double(plan.frameCount))
            }
        } catch {
            writer.cancelWriting()
            try? FileManager.default.removeItem(at: url)
            throw error
        }
        writerInput.markAsFinished()
        writer.endSession(atSourceTime: CMTime(seconds: plan.duration, preferredTimescale: 600))
        await writer.finishWriting()
        guard writer.status == .completed else { throw Failure.writer(writer.error) }
        return url
    }

    private struct Loop {
        let id: String
        let generator: AVAssetImageGenerator
        let duration: Double
    }

    private static func loops(_ videos: [MessageCardScrollVideo]) async -> [Loop] {
        var loops: [Loop] = []
        for video in videos {
            let asset = AVURLAsset(url: video.file)
            guard let length = try? await asset.load(.duration), length.seconds.isFinite, length.seconds > 0 else { continue }
            let generator = AVAssetImageGenerator(asset: asset)
            generator.appliesPreferredTrackTransform = true
            generator.maximumSize = CGSize(width: 1080, height: 1920)
            let tolerance = CMTime(seconds: 0.5 / MessageCardScrollPlan.fps, preferredTimescale: 600)
            generator.requestedTimeToleranceBefore = tolerance
            generator.requestedTimeToleranceAfter = tolerance
            loops.append(Loop(id: video.id, generator: generator, duration: length.seconds))
        }
        return loops
    }

    /// Les images des vidéos à l'instant `time`, chacune bouclée sur sa durée.
    private static func frames(of loops: [Loop], at time: Double, over pictures: MessageCardPictures) async -> MessageCardPictures {
        var painted = pictures
        for loop in loops {
            let moment = CMTime(seconds: time.truncatingRemainder(dividingBy: loop.duration), preferredTimescale: 600)
            if let still = await MessageCardMotionExporter.still(from: loop.generator, at: moment) {
                painted = painted.replacing(loop.id, with: still)
            }
        }
        return painted
    }

    private static func even(_ value: Double) -> Int {
        let rounded = Int(value.rounded())
        return rounded - rounded % 2
    }
}
