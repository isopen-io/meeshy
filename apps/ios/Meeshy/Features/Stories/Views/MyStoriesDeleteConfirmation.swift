import Foundation

/// I9/I10 — TOUTE suppression dans « Mes stories » demande confirmation, avec
/// un libellé qui décrit la conséquence RÉELLE de chaque cible :
/// - story publiée : disparaît pour tout le monde (mais existait au serveur) ;
/// - brouillon : dernier état local d'un travail jamais publié ;
/// - échec de publication : la DERNIÈRE copie du travail (médias locaux
///   inclus) — la spec du parcours promet « sans jamais perdre de travail ».
/// Une seule source pour les trois alertes : des copies recopiées par vue
/// divergeraient au premier renommage.
enum MyStoriesDeleteConfirmation {

    enum Target: CaseIterable, Equatable {
        case publishedStory
        case draft
        case failedItem
    }

    static func title(for target: Target) -> String {
        switch target {
        case .publishedStory:
            return String(localized: "story.mine.delete.title",
                          defaultValue: "Supprimer la story ?")
        case .draft:
            return String(localized: "story.mine.drafts.delete.title",
                          defaultValue: "Supprimer le brouillon ?")
        case .failedItem:
            return String(localized: "story.mine.failed.delete.title",
                          defaultValue: "Supprimer cette story non publiée ?")
        }
    }

    static func message(for target: Target) -> String {
        switch target {
        case .publishedStory:
            return String(localized: "story.mine.delete.message",
                          defaultValue: "Cette action est définitive. La story ne sera plus visible par personne.")
        case .draft:
            return String(localized: "story.mine.drafts.delete.message",
                          defaultValue: "Cette action est définitive. Le brouillon et ses médias seront supprimés.")
        case .failedItem:
            return String(localized: "story.mine.failed.delete.message",
                          defaultValue: "Cette story n'a jamais été publiée : c'est sa dernière copie, elle sera définitivement perdue. « Reprendre » permet plutôt de la convertir en brouillon.")
        }
    }
}
