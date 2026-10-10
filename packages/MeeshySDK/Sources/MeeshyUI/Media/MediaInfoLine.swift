import SwiftUI

/// **La ligne d'informations d'un média plein écran :
/// `largeur × hauteur · poids · durée`** (#9577, directive porteur 2026-10-07).
///
/// Trois segments au plus, séparés par un point médian ; un segment absent ne
/// laisse aucun séparateur orphelin. La durée affiche le temps RESTANT pendant
/// la lecture et la durée totale à l'arrêt.
public nonisolated enum MediaInfoLine {

    public enum Segment: Equatable, Hashable, Sendable {
        case dimensions(String)
        case fileSize(String)
        /// La durée se rend par l'hôte : elle bouge, les deux autres non.
        case duration
    }

    public static let separatorGlyph = "\u{00B7}"
    public static let separator = " \u{00B7} "

    public static func segments(width: Int?,
                                height: Int?,
                                fileSizeLabel: String?,
                                hasDuration: Bool) -> [Segment] {
        var segments: [Segment] = []
        if let width, let height, width > 0, height > 0 {
            segments.append(.dimensions("\(width) \u{00D7} \(height)"))
        }
        if let fileSizeLabel, !fileSizeLabel.isEmpty {
            segments.append(.fileSize(fileSizeLabel))
        }
        if hasDuration { segments.append(.duration) }
        return segments
    }

    /// La ligne en clair — pour un hôte qui la rend d'un bloc, et pour les témoins.
    public static func text(_ segments: [Segment], durationLabel: String?) -> String {
        segments.compactMap { segment -> String? in
            switch segment {
            case .dimensions(let text), .fileSize(let text): return text
            case .duration: return durationLabel
            }
        }
        .joined(separator: separator)
    }

    /// Temps restant pendant la lecture, durée totale à l'arrêt. Jamais négatif.
    public static func displayedDuration(total: Double, elapsed: Double, isPlaying: Bool) -> Double {
        guard isPlaying, elapsed.isFinite else { return max(0, total) }
        return max(0, total - max(0, elapsed))
    }

    /// La durée du moteur dès qu'il la connaît ; d'ici là — ses pistes ne sont
    /// pas chargées, il dit 0 — celle que le média déclare.
    public static func totalDuration(engine: Double, declared: Double) -> Double {
        engine.isFinite && engine > 0 ? engine : max(0, declared)
    }
}

/// **La durée qui décompte** — la feuille qui observe le moteur, pour que la
/// surface qui la monte ne paie pas ses battements de `currentTime`.
///
/// `followsEngine` : cette surface tient le moteur pour CE média. Sinon la durée
/// déclarée s'affiche, fixe — un moteur occupé ailleurs ne décompte pas ici.
/// Le style (police, teinte) vient de l'hôte, par l'environnement.
public struct MediaPlaybackDurationText: View {
    @ObservedObject private var manager: SharedAVPlayerManager
    private let declaredSeconds: Double
    private let followsEngine: Bool

    public init(manager: SharedAVPlayerManager, declaredSeconds: Double, followsEngine: Bool) {
        self.manager = manager
        self.declaredSeconds = declaredSeconds
        self.followsEngine = followsEngine
    }

    private var seconds: Double {
        guard followsEngine else { return max(0, declaredSeconds) }
        return MediaInfoLine.displayedDuration(
            total: MediaInfoLine.totalDuration(engine: manager.duration, declared: declaredSeconds),
            elapsed: manager.currentTime,
            isPlaying: manager.isPlaying)
    }

    public var body: some View {
        Text(formatMediaDuration(seconds))
            .monospacedDigit()
            .lineLimit(1)
            .fixedSize()
    }
}
