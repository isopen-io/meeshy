import SwiftUI

/// Le cadre du contrôle de lecture (lecture / pause) d'une pièce média, émis
/// par le lecteur qui la rend : le bouton d'`AudioPlayerView`, le bouton de
/// lecture et le lecture/pause en surimpression de `MeeshyVideoPlayer` en ligne.
///
/// Signal opaque, comme `MediaScrubbingPreferenceKey` : le SDK ne décide rien.
/// L'hôte qui en a besoin le lit — l'aperçu d'appui long de l'app n'y perce
/// son masque que pour les pièces qu'il laisse lire (#11339) ; ailleurs,
/// personne ne le lit. Le BOUTON seul, jamais le lecteur entier : les
/// emplacements du lecteur (citation, pied, drapeaux de langue), sa forme
/// d'onde et la surface de la vidéo restent hors du cadre.
public struct MediaPlayControlAnchor {
    public let attachmentId: String
    public let bounds: Anchor<CGRect>

    public init(attachmentId: String, bounds: Anchor<CGRect>) {
        self.attachmentId = attachmentId
        self.bounds = bounds
    }
}

public struct MediaPlayControlAnchorKey: PreferenceKey {
    public static let defaultValue: [MediaPlayControlAnchor] = []
    public static func reduce(value: inout [MediaPlayControlAnchor], nextValue: () -> [MediaPlayControlAnchor]) {
        value += nextValue()
    }
}

extension View {
    /// Déclare cette vue comme LE contrôle de lecture de la pièce `attachmentId`.
    public func mediaPlayControlAnchor(attachmentId: String) -> some View {
        anchorPreference(key: MediaPlayControlAnchorKey.self, value: .bounds) { bounds in
            [MediaPlayControlAnchor(attachmentId: attachmentId, bounds: bounds)]
        }
    }
}
