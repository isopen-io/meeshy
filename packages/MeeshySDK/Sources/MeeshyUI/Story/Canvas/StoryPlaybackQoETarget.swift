import SwiftUI
import MeeshySDK

// MARK: - Qui déclare la story mesurée (#11287)

/// La cible de la QoE d'un canvas de lecture. Le canvas de story est monté par
/// le lecteur de stories, mais aussi par les cartes du fil, le détail d'un
/// post, les reposts, les réels en scène et la galerie d'une conversation :
/// seul l'HÔTE sait qu'il lit une story publiée. Il le déclare par
/// l'environnement (`readsPublishedStories`) ; le SDK ne devine rien.
public enum StoryPlaybackQoETarget {

    /// `nil` — rien n'est mesuré — sauf quand l'hôte lit des stories publiées,
    /// que ce canvas n'est pas le calque sortant d'un fondu, qu'il ne joue
    /// aucun média préchargé (aperçu du composer) et qu'il porte l'identifiant
    /// de la story (le porteur, jamais l'identité composée d'une scène).
    public static func resolve(
        readsPublishedStories: Bool,
        isOutgoing: Bool,
        playsPreloadedMedia: Bool,
        storyId: String?
    ) -> SocialTarget? {
        guard readsPublishedStories, !isOutgoing, !playsPreloadedMedia,
              let storyId, !storyId.isEmpty else { return nil }
        return SocialTarget(kind: .story, id: storyId)
    }
}

private struct ReadsPublishedStoriesKey: EnvironmentKey {
    static let defaultValue = false
}

public extension EnvironmentValues {
    /// Posé par le lecteur de stories publiées, et par lui seul : les canvas
    /// montés sous lui remontent la qualité de lecture de leur story.
    var readsPublishedStories: Bool {
        get { self[ReadsPublishedStoriesKey.self] }
        set { self[ReadsPublishedStoriesKey.self] = newValue }
    }
}
