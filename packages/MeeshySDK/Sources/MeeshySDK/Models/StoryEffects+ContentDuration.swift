import CoreGraphics
import Foundation

extension StoryEffects {
    /// Core "longest data wins" rule, extracted from `StorySlide.contentDerivedDuration()`
    /// so `TimelineProject` (which carries the same three arrays but isn't a
    /// `StorySlide`) can call the identical algorithm during live editing —
    /// see `TimelineViewModel.recomputeSlideDuration()`. Pure function, no
    /// change in behavior versus the code it replaces (design doc 2026-07-18).
    public static func contentDerivedDuration(
        mediaObjects: [StoryMediaObject]?,
        audioPlayerObjects: [StoryAudioPlayerObject]?,
        textObjects: [StoryTextObject]
    ) -> TimeInterval {
        let bgVideoDur = mediaObjects?
            .first(where: { $0.isBackground && $0.kind == .video })?
            .duration
        let bgAudioDur = audioPlayerObjects?
            .first(where: { $0.isBackground == true })?
            .duration
            .map { Double($0) }

        let totalWords = textObjects.reduce(0) { acc, text in
            acc + text.text.split(separator: " ").count
        }
        let textDur: TimeInterval = {
            guard totalWords > StorySlide.longTextThresholdWords else {
                return StorySlide.defaultStaticDuration
            }
            let extraWords = totalWords - StorySlide.longTextThresholdWords
            return StorySlide.defaultStaticDuration
                + Double(extraWords) * StorySlide.longTextSecondsPerWord
        }()

        let mediaWindows = (mediaObjects ?? [])
            .compactMap { media in media.duration.map { (media.startTime ?? 0) + $0 } }
        let audioWindows = (audioPlayerObjects ?? [])
            .compactMap { audio in audio.duration.map { Double($0) + Double(audio.startTime ?? 0) } }
        let longestData = (mediaWindows + audioWindows).max() ?? 0

        let target = max(textDur, StorySlide.defaultStaticDuration, longestData)

        let bgLoopPeriods = [bgVideoDur, bgAudioDur].compactMap { $0 }.filter { $0 > 0.001 }
        let bgResult: TimeInterval = bgLoopPeriods.reduce(target) { effective, period in
            let extended = period >= target ? period : (target / period).rounded(.up) * period
            return max(effective, extended)
        }

        return max(bgResult, longestData)
    }
}
