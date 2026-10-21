import Foundation
import MeeshySDK

enum StorySlideStructureRules {
    nonisolated static func fingerprint(of slide: StorySlide) -> String {
        let effects = slide.effects
        var parts: [String] = []
        parts.append(contentsOf: effects.textObjects.map { "t:\($0.id)" })
        parts.append(contentsOf: (effects.mediaObjects ?? [])
            .map { "m:\($0.id):\($0.isBackground ? 1 : 0)" })
        parts.append(contentsOf: (effects.stickerObjects ?? []).map { "s:\($0.id)" })
        parts.append(contentsOf: slide.locationObjects.map { "l:\($0.id)" })
        parts.append(contentsOf: (effects.audioPlayerObjects ?? [])
            .map { "a:\($0.id):\($0.isBackground == true ? 1 : 0)" })
        parts.append("bga:\(effects.backgroundAudioId ?? "-")")
        return parts.sorted().joined(separator: "|")
    }
}
