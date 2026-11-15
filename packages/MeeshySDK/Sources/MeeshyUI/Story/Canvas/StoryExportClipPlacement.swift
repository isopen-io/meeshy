import AVFoundation
import CoreMedia
import MeeshySDK

/// **Où un clip de la scène se pose dans la composition d'export** (#18555) :
/// la fenêtre lue dans le fichier, sa place sur la scène et sa boucle — la
/// règle que le player suit déjà (`ReaderAudioMixer` pour les sons,
/// `StoryMediaLayer` pour les vidéos posées). Un son, la piste d'une vidéo
/// posée et son image se posent par cette seule loi.
nonisolated struct StoryExportClipPlacement: Equatable {
    /// La fenêtre lue dans le fichier, rognage compris.
    let source: CMTimeRange
    /// Le début du clip sur la scène, en temps de story.
    let start: CMTime
    /// Le temps que le clip occupe sur la scène.
    let window: CMTime
    /// Une boucle repasse la fenêtre de source jusqu'à couvrir `window`.
    let loops: Bool

    /// La fenêtre de source d'un rognage, en temps de composition.
    static func sourceWindow(_ bounds: MediaTrimBounds) -> CMTimeRange {
        CMTimeRange(start: CMTime(seconds: bounds.start, preferredTimescale: 600),
                    duration: CMTime(seconds: bounds.duration, preferredTimescale: 600))
    }

    /// Une piste coupée (`volume == 0`) n'entre pas dans le mix, sauf si une
    /// automation la fait remonter quelque part sur la scène.
    static func carriesSound(volume: Float, keyframes: [StoryKeyframe]?) -> Bool {
        volume > 0 || (keyframes ?? []).contains { ($0.volume ?? 0) > 0 }
    }

    /// La pose d'une vidéo posée : sa fenêtre de source, bornée par sa durée
    /// sur la scène et, quand elle est donnée, par la fin de la story.
    static func foreground(_ media: StoryMediaObject, assetDuration: CMTime,
                           storyDuration: CMTime? = nil) -> StoryExportClipPlacement? {
        let source = sourceWindow(media.trimBounds(sourceDuration: max(0, assetDuration.seconds)))
        let start = CMTime(seconds: max(0, media.startTime ?? 0), preferredTimescale: 600)
        let declared = media.duration.map { CMTime(seconds: $0, preferredTimescale: 600) } ?? source.duration
        let available = storyDuration.map { CMTimeSubtract($0, start) } ?? declared
        let window = CMTimeMinimum(CMTimeMinimum(source.duration, declared), available)
        guard window > .zero else { return nil }
        return StoryExportClipPlacement(source: source, start: start, window: window, loops: false)
    }

    /// Pose le clip à `storyStart + start` et rend la fin de ce qui sonne ou
    /// se voit, en temps de story.
    @discardableResult
    func insert(_ assetTrack: AVAssetTrack, into track: AVMutableCompositionTrack,
                storyStart: CMTime) throws -> CMTime {
        guard loops, source.duration > .zero else {
            let playable = CMTimeMinimum(source.duration, window)
            try track.insertTimeRange(CMTimeRange(start: source.start, duration: playable),
                                      of: assetTrack, at: storyStart + start)
            return start + playable
        }
        var inserted = CMTime.zero
        while inserted < window {
            let chunk = CMTimeMinimum(source.duration, window - inserted)
            try track.insertTimeRange(CMTimeRange(start: source.start, duration: chunk),
                                      of: assetTrack, at: storyStart + start + inserted)
            inserted = inserted + chunk
        }
        return start + window
    }
}
