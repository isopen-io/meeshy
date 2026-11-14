import SwiftUI
import MeeshyUI

/// Ce que l'export d'une story en vidéo dit derrière son (i) (épure #17584, #18109) : la feuille se
/// nomme « Exporter en vidéo », la précision (un MP4 fidèle à la prévisualisation, pour partager hors
/// Meeshy) répond à la question de l'utilisateur au lieu de se lire au repos.
enum StoryExportShareCopy {
    static var infoNote: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "story.export.share.question", defaultValue: "Que contient l'export ?"),
            text: String(localized: "story.export.share.subtitle",
                         defaultValue: "Génère un MP4 fidèle à la prévisualisation pour le partager hors Meeshy.")
        )
    }
}
