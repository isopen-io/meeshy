import AVFoundation
import CoreMedia

/// Les rampes de volume d'une piste, entre `AVAudioMixInputParameters` et les
/// valeurs pures de `StoryExportJingleMix`.
extension StoryExportBranding {

    /// Pose `ramps` sur `parameters` ; une rampe sans durée est une marche.
    static func setVolumeRamps(_ ramps: [StoryExportJingleMix.Ramp], on parameters: AVMutableAudioMixInputParameters) {
        for ramp in ramps {
            let start = CMTime(seconds: ramp.start, preferredTimescale: 600)
            guard ramp.end > ramp.start else {
                parameters.setVolume(ramp.to, at: start)
                continue
            }
            parameters.setVolumeRamp(fromStartVolume: ramp.from, toEndVolume: ramp.to,
                                     timeRange: CMTimeRange(start: start,
                                                            end: CMTime(seconds: ramp.end, preferredTimescale: 600)))
        }
    }

    /// L'enveloppe que `parameters` tient déjà, dans l'ordre du temps.
    ///
    /// Interrogé dans un intervalle sans rampe, AVFoundation rend la rampe
    /// SUIVANTE : la lecture saute alors à son début. Une marche posée en
    /// dernier s'étend sans fin, et se relit comme une marche.
    static func volumeRamps(of parameters: AVAudioMixInputParameters) -> [StoryExportJingleMix.Ramp] {
        var ramps: [StoryExportJingleMix.Ramp] = []
        var time = CMTime.zero
        for _ in 0..<512 {
            var from: Float = 1
            var to: Float = 1
            var range = CMTimeRange.invalid
            guard parameters.getVolumeRamp(for: time, startVolume: &from, endVolume: &to, timeRange: &range),
                  range.start.isNumeric else { break }
            guard range.start <= time else {
                time = range.start
                continue
            }
            guard range.duration.isNumeric, range.duration > .zero else {
                ramps.append(.init(from: from, to: to, start: range.start.seconds, end: range.start.seconds))
                break
            }
            ramps.append(.init(from: from, to: to, start: range.start.seconds, end: range.end.seconds))
            guard range.end > time else { break }
            time = range.end
        }
        return ramps
    }
}
