import Foundation

// MARK: - Export Rail Button (Enregistrer)

/// Résolution PURE du bouton Enregistrer du rail auteur — testée sans
/// instancier de vue. Membership = `showsExport` (== `isOwnStory`, voir
/// `StoryActionRailPlan.resolve`) ; pendant un job de sauvegarde, le bouton
/// cède la place à l'anneau de progression.
///
/// **L'anneau, lui, se montre sur TOUTE story en cours d'export** (#13871) :
/// le menu « … » enregistre ou image la story d'un autre, et sans anneau le
/// lecteur ne voyait ni la progression ni le moyen d'annuler. Il apparaît
/// parce que le lecteur vient d'agir, jamais de lui-même en cours de lecture.
///
/// Le bouton « Partager » (export vidéo) n'en fait plus partie (#9953) : le
/// menu « … » l'offre à tout lecteur sous « Partager ▸ Exporter en vidéo ».
nonisolated struct StoryExportRailButtons: Equatable {
    let showsSaveButton: Bool
    let showsSaveProgressRing: Bool

    static func resolve(showsExport: Bool, saveProgress: Double?) -> StoryExportRailButtons {
        StoryExportRailButtons(
            showsSaveButton: showsExport && saveProgress == nil,
            showsSaveProgressRing: saveProgress != nil
        )
    }
}
