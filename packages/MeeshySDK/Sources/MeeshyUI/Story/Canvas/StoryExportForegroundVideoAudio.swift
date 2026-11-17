import AVFoundation
import CoreMedia
import MeeshySDK

/// **Le son d'une vidéo posée part dans le fichier** (#18555), tel que le
/// player le joue (`StoryCanvasUIView.applyVolumeAutomation`) : à sa place sur
/// la scène, dans sa fenêtre de source, à son volume, automation et
/// atténuation comprises. Coupée, elle n'apporte aucune piste.
enum StoryExportForegroundVideoAudio {

    /// Ajoute une piste audio par vidéo posée qui sonne, et rend les
    /// paramètres de mix de celles qui ne jouent pas au niveau nominal.
    static func compose(slide: StorySlide,
                        composition: AVMutableComposition,
                        totalDuration: CMTime,
                        storyStart: CMTime) async throws -> [AVMutableAudioMixInputParameters] {
        let slideDucks = StoryExporter.exportCarriesBackgroundAudio(slide: slide)
        var parameters: [AVMutableAudioMixInputParameters] = []
        for media in StoryOverlayVideoTracks.foregroundVideos(of: slide)
        where StoryExportClipPlacement.carriesSound(volume: media.volume, keyframes: media.keyframes) {
            guard let placed = try await insert(media, into: composition, totalDuration: totalDuration,
                                                storyStart: storyStart) else { continue }
            if let mix = mixParameters(for: media, placed: placed, storyStart: storyStart, slideDucks: slideDucks) {
                parameters.append(mix)
            }
        }
        return parameters
    }

    private struct Placed {
        let track: AVMutableCompositionTrack
        let start: CMTime
        let end: CMTime
    }

    private static func insert(_ media: StoryMediaObject, into composition: AVMutableComposition,
                               totalDuration: CMTime, storyStart: CMTime) async throws -> Placed? {
        guard let url = StoryOverlayVideoTracks.sourceURL(of: media) else { return nil }
        let asset = AVURLAsset(url: url)
        guard let source = try? await asset.loadTracks(withMediaType: .audio).first,
              let length = try? await asset.load(.duration), length > .zero,
              let placement = StoryExportClipPlacement.foreground(media, assetDuration: length,
                                                                  storyDuration: totalDuration) else { return nil }
        guard let track = composition.addMutableTrack(withMediaType: .audio,
                                                      preferredTrackID: kCMPersistentTrackID_Invalid) else {
            throw StoryExporterError.sessionCreationFailed
        }
        let end = try placement.insert(source, into: track, storyStart: storyStart)
        return Placed(track: track, start: placement.start, end: end)
    }

    private static func mixParameters(for media: StoryMediaObject, placed: Placed, storyStart: CMTime,
                                      slideDucks: Bool) -> AVMutableAudioMixInputParameters? {
        let isDucking = StoryVolumeResolver.isDucking(slideDucks: slideDucks,
                                                      isDuckingDisabled: media.isDuckingDisabled)
        let automated = (media.keyframes ?? []).contains { $0.volume != nil }
        guard abs(media.volume - 1) > 0.001 || automated || isDucking else { return nil }
        let parameters = AVMutableAudioMixInputParameters(track: placed.track)
        let ramps = StoryExporter.volumeRamps(base: media.volume, keyframes: media.keyframes,
                                              duration: (placed.end - placed.start).seconds,
                                              isDucking: isDucking)
        for (range, from, to) in ramps {
            parameters.setVolumeRamp(fromStartVolume: from, toEndVolume: to,
                                     timeRange: CMTimeRange(start: range.start + storyStart + placed.start,
                                                            duration: range.duration))
        }
        return parameters
    }
}
