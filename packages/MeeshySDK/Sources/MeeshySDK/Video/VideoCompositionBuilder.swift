import Foundation
import AVFoundation
import CoreImage

/// Turns a `VideoEditDocument` into a playable / exportable `AVComposition`.
///
/// The same plan drives both the live preview (`AVPlayerItem`) and the final
/// export (`AVAssetExportSession`) so the user always sees exactly what will
/// be written to disk.
public enum VideoCompositionBuilder {

    /// Bundle of composition objects ready for playback or export.
    ///
    /// `@unchecked Sendable`: the composition is fully built before the plan
    /// is returned and is never mutated afterwards, so handing it across
    /// isolation domains is safe in practice.
    public struct Plan: @unchecked Sendable {
        public let composition: AVComposition
        public let videoComposition: AVVideoComposition?
        public let audioMix: AVAudioMix?
        public let duration: CMTime

        public init(
            composition: AVComposition,
            videoComposition: AVVideoComposition?,
            audioMix: AVAudioMix?,
            duration: CMTime
        ) {
            self.composition = composition
            self.videoComposition = videoComposition
            self.audioMix = audioMix
            self.duration = duration
        }
    }

    private static let timescale: CMTimeScale = 600

    // MARK: - Probe

    /// Reads duration / orientation / audio presence from a source file and
    /// returns a pristine document describing it.
    public static func probe(url: URL) async throws -> VideoEditDocument {
        let asset = AVURLAsset(url: url)
        let videoTracks: [AVAssetTrack]
        do {
            videoTracks = try await asset.loadTracks(withMediaType: .video)
        } catch {
            throw VideoEditError.sourceUnreadable
        }
        guard let videoTrack = videoTracks.first else {
            throw VideoEditError.noVideoTrack
        }

        let duration = (try? await asset.load(.duration)) ?? .zero
        let naturalSize = (try? await videoTrack.load(.naturalSize)) ?? CGSize(width: 1080, height: 1920)
        let preferredTransform = (try? await videoTrack.load(.preferredTransform)) ?? .identity
        let oriented = naturalSize.applying(preferredTransform)
        let displaySize = CGSize(width: abs(oriented.width), height: abs(oriented.height))

        let hasAudio = ((try? await asset.loadTracks(withMediaType: .audio)) ?? []).isEmpty == false

        return VideoEditDocument(
            sourceURL: url,
            sourceDuration: max(0, CMTimeGetSeconds(duration)),
            naturalWidth: displaySize.width > 0 ? displaySize.width : 1080,
            naturalHeight: displaySize.height > 0 ? displaySize.height : 1920,
            hasAudioTrack: hasAudio
        )
    }

    // MARK: - Build

    public static func build(document: VideoEditDocument) async throws -> Plan {
        guard !document.segments.isEmpty, document.editedDuration > 0.05 else {
            throw VideoEditError.emptyTimeline
        }

        let asset = AVURLAsset(url: document.sourceURL)
        let videoTracks = (try? await asset.loadTracks(withMediaType: .video)) ?? []
        guard let sourceVideo = videoTracks.first else {
            throw VideoEditError.noVideoTrack
        }
        let sourceAudio = ((try? await asset.loadTracks(withMediaType: .audio)) ?? []).first
        let nominalFrameRate = (try? await sourceVideo.load(.nominalFrameRate)) ?? 30
        let preferredTransform = (try? await sourceVideo.load(.preferredTransform)) ?? .identity

        let composition = AVMutableComposition()
        guard let videoTrack = composition.addMutableTrack(
            withMediaType: .video,
            preferredTrackID: kCMPersistentTrackID_Invalid
        ) else {
            throw VideoEditError.compositionFailed("video track allocation")
        }
        let audioTrack: AVMutableCompositionTrack? = sourceAudio == nil ? nil : composition.addMutableTrack(
            withMediaType: .audio,
            preferredTrackID: kCMPersistentTrackID_Invalid
        )

        var cursor = CMTime.zero
        for segment in document.segments {
            let sourceRange = CMTimeRange(
                start: CMTime(seconds: segment.start, preferredTimescale: timescale),
                duration: CMTime(seconds: segment.sourceDuration, preferredTimescale: timescale)
            )
            guard sourceRange.duration > .zero else { continue }

            do {
                try videoTrack.insertTimeRange(sourceRange, of: sourceVideo, at: cursor)
            } catch {
                throw VideoEditError.compositionFailed("video insert: \(error.localizedDescription)")
            }

            if let audioTrack, let sourceAudio {
                do {
                    try audioTrack.insertTimeRange(sourceRange, of: sourceAudio, at: cursor)
                } catch {
                    audioTrack.insertEmptyTimeRange(
                        CMTimeRange(start: cursor, duration: sourceRange.duration)
                    )
                }
            }

            let insertedRange = CMTimeRange(start: cursor, duration: sourceRange.duration)
            if abs(segment.speed - 1) > 0.001, segment.speed > 0 {
                let scaledDuration = CMTimeMultiplyByFloat64(
                    sourceRange.duration,
                    multiplier: 1.0 / segment.speed
                )
                videoTrack.scaleTimeRange(insertedRange, toDuration: scaledDuration)
                audioTrack?.scaleTimeRange(insertedRange, toDuration: scaledDuration)
                cursor = cursor + scaledDuration
            } else {
                cursor = cursor + sourceRange.duration
            }
        }

        guard cursor > .zero else {
            throw VideoEditError.emptyTimeline
        }

        // Carry the source orientation so playback / export stay upright even
        // when no CIFilter video composition is attached.
        videoTrack.preferredTransform = preferredTransform

        let videoComposition = makeVideoComposition(
            document: document,
            composition: composition,
            frameRate: nominalFrameRate > 1 ? nominalFrameRate : 30
        )
        let audioMix = makeAudioMix(document: document, audioTrack: audioTrack, totalDuration: cursor)

        return Plan(
            composition: composition,
            videoComposition: videoComposition,
            audioMix: audioMix,
            duration: cursor
        )
    }

    // MARK: - Video composition

    private static func makeVideoComposition(
        document: VideoEditDocument,
        composition: AVComposition,
        frameRate: Float
    ) -> AVVideoComposition? {
        // No look edits → skip the CIFilter pass entirely; orientation is
        // already handled by the composition track's preferred transform.
        let hasLookEdits = !document.crop.isFull
            || document.rotationQuarterTurns % 4 != 0
            || !document.color.isIdentity
            || document.filter != .none
        guard hasLookEdits else { return nil }

        let geometry = VideoRenderGeometry.make(
            naturalSize: document.naturalSize,
            crop: document.crop,
            rotationQuarterTurns: document.rotationQuarterTurns
        )
        let color = document.color
        let filter = document.filter

        let videoComposition = AVMutableVideoComposition(
            asset: composition
        ) { request in
            let rendered = VideoFrameRenderer.render(
                request.sourceImage,
                geometry: geometry,
                color: color,
                filter: filter
            )
            request.finish(with: rendered, context: nil)
        }
        videoComposition.renderSize = geometry.renderSize
        let fps = min(60, max(15, frameRate))
        videoComposition.frameDuration = CMTime(
            value: 1,
            timescale: CMTimeScale(fps.rounded())
        )
        return videoComposition
    }

    // MARK: - Audio mix

    private static func makeAudioMix(
        document: VideoEditDocument,
        audioTrack: AVMutableCompositionTrack?,
        totalDuration: CMTime
    ) -> AVAudioMix? {
        guard let audioTrack else { return nil }
        let settings = document.audio
        let parameters = AVMutableAudioMixInputParameters(track: audioTrack)
        let volume = Float(settings.effectiveVolume)
        parameters.setVolume(volume, at: .zero)

        if settings.fadeIn > 0.01, !settings.isMuted {
            parameters.setVolumeRamp(
                fromStartVolume: 0,
                toEndVolume: volume,
                timeRange: CMTimeRange(
                    start: .zero,
                    duration: CMTime(seconds: settings.fadeIn, preferredTimescale: timescale)
                )
            )
        }
        if settings.fadeOut > 0.01, !settings.isMuted {
            let fade = CMTime(seconds: settings.fadeOut, preferredTimescale: timescale)
            let start = CMTimeSubtract(totalDuration, fade)
            if start > .zero {
                parameters.setVolumeRamp(
                    fromStartVolume: volume,
                    toEndVolume: 0,
                    timeRange: CMTimeRange(start: start, duration: fade)
                )
            }
        }

        let mix = AVMutableAudioMix()
        mix.inputParameters = [parameters]
        return mix
    }
}

// MARK: - Frame renderer

/// Applies the per-frame geometry + look. Stateless and synchronous so it can
/// run inside the `AVVideoComposition` CIFilter handler on the render thread.
enum VideoFrameRenderer {
    static func render(
        _ source: CIImage,
        geometry: VideoRenderGeometry,
        color: VideoColorAdjustment,
        filter: VideoFilterPreset
    ) -> CIImage {
        let canvas = CGRect(origin: .zero, size: geometry.renderSize)
        var image = source.transformed(by: geometry.transform).cropped(to: canvas)

        if !color.isIdentity {
            if let controls = CIFilter(name: "CIColorControls", parameters: [
                kCIInputImageKey: image,
                kCIInputBrightnessKey: color.brightness,
                kCIInputContrastKey: color.contrast,
                kCIInputSaturationKey: color.saturation
            ]), let output = controls.outputImage {
                image = output
            }
        }

        if let name = filter.ciFilterName,
           let effect = CIFilter(name: name, parameters: [kCIInputImageKey: image]),
           let output = effect.outputImage {
            image = output
        }

        return image.cropped(to: canvas)
    }
}

extension VideoFilterPreset {
    /// Maps a preset to a zero-configuration CoreImage photo-effect filter.
    /// These are guaranteed-available, parameter-free and cheap.
    var ciFilterName: String? {
        switch self {
        case .none:    return nil
        case .vivid:   return "CIPhotoEffectChrome"
        case .warm:    return "CIPhotoEffectTransfer"
        case .cool:    return "CIPhotoEffectProcess"
        case .mono:    return "CIPhotoEffectMono"
        case .noir:    return "CIPhotoEffectNoir"
        case .vintage: return "CIPhotoEffectInstant"
        case .fade:    return "CIPhotoEffectFade"
        }
    }
}
