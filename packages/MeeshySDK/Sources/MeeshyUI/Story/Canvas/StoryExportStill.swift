import AVFoundation
import Foundation
import MeeshySDK
import UIKit

/// **Une scène FIXE et MUETTE sort en IMAGE, jamais en vidéo** (#13871 ; miroir
/// de `StoryExportTimelinePlan.still` d'Android, qui remet `SceneExportJob.still`,
/// et d'`isStill` du web, `scene-export-plan.ts`) : une seule slide, aucun son,
/// et rien qui bouge — ni objet temporisé, fondu ou animé, ni vidéo.
///
/// L'image est tirée du MÊME moteur que la vidéo (`StoryExporter`), à la seule
/// différence que la slide n'y dure qu'une seconde et sans transition
/// (`pinned(_:)`) : calques, langue, filtres et filigrane sortent tels que la
/// vidéo les aurait gravés, et rien ne se réimplémente.
public nonisolated enum StoryExportStill {
    public static let bakeDuration: TimeInterval = 1

    private static let frameTime: TimeInterval = 0.5
    private static let jpegQuality: CGFloat = 0.92

    public static func isStill(_ slides: [StorySlide]) -> Bool {
        guard slides.count == 1, let effects = slides.first?.effects else { return false }
        return !sounds(effects) && !moves(effects)
    }

    /// La slide à rendre pour en tirer l'image : une seconde, sans transition
    /// d'entrée ni de sortie (l'image ne doit pas tomber au milieu d'un fondu).
    public static func pinned(_ slide: StorySlide) -> StorySlide {
        var still = slide
        still.effects.timelineDuration = bakeDuration
        still.effects.opening = nil
        still.effects.closing = nil
        return still
    }

    /// Le JPEG d'une image du MP4 rendu, dans un temporaire que l'appelant
    /// possède ; `nil` quand la vidéo ne se lit pas.
    @concurrent
    public static func frame(ofVideoAt url: URL) async -> URL? {
        let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        generator.appliesPreferredTrackTransform = true
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = CMTime(seconds: frameTime, preferredTimescale: 600)
        guard let frame = try? await generator.image(at: CMTime(seconds: frameTime, preferredTimescale: 600)).image,
              let data = UIImage(cgImage: frame).jpegData(compressionQuality: jpegQuality) else { return nil }
        let output = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-still-\(UUID().uuidString).jpg")
        guard (try? data.write(to: output, options: .atomic)) != nil else { return nil }
        return output
    }

    private static func sounds(_ effects: StoryEffects) -> Bool {
        !(effects.audioPlayerObjects ?? []).isEmpty
            || effects.backgroundAudioId != nil
            || effects.voiceAttachmentId != nil
    }

    private static func moves(_ effects: StoryEffects) -> Bool {
        let media = effects.mediaObjects ?? []
        let stickers = effects.stickerObjects ?? []
        guard !media.contains(where: { $0.kind == .video }),
              !stickers.contains(where: { $0.animation != nil }),
              !effects.textObjects.contains(where: { !($0.keyframes ?? []).isEmpty }),
              !media.contains(where: { !($0.keyframes ?? []).isEmpty }) else { return true }
        let windows = effects.textObjects.map { Window(start: $0.startTime, duration: $0.duration, fadeIn: $0.fadeIn, fadeOut: $0.fadeOut) }
            + stickers.map { Window(start: $0.startTime, duration: $0.duration, fadeIn: $0.fadeIn, fadeOut: $0.fadeOut) }
            + media.filter { !$0.isBackground }
                .map { Window(start: $0.startTime, duration: $0.duration, fadeIn: $0.fadeIn, fadeOut: $0.fadeOut) }
            + effects.locationObjects
                .map { Window(start: $0.startTime, duration: $0.duration, fadeIn: $0.fadeIn, fadeOut: $0.fadeOut) }
        return windows.contains(where: \.isTimed)
    }

    private struct Window {
        let start: Double?
        let duration: Double?
        let fadeIn: Double?
        let fadeOut: Double?

        var isTimed: Bool {
            (start ?? 0) > 0 || duration != nil || (fadeIn ?? 0) > 0 || (fadeOut ?? 0) > 0
        }
    }
}
