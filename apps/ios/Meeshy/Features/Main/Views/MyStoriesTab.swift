import Foundation

/// Les deux onglets de « Mes stories ».
///
/// Deux onglets COMPLÈTEMENT distincts (directive user 2026-08-01) : ce qui
/// est publié d'un côté, ce qui ne l'est pas de l'autre. Les échecs de
/// publication rejoignent les brouillons — un onglet « Publiées » ne peut pas
/// contenir du non-publié.
enum MyStoriesTab: String, CaseIterable, Identifiable {
    case published
    case drafts

    var id: String { rawValue }

    var title: String {
        switch self {
        case .published:
            return String(localized: "story.mine.tab.published", defaultValue: "Publiées")
        case .drafts:
            return String(localized: "story.mine.tab.drafts", defaultValue: "Brouillons")
        }
    }
}

/// Décide quel onglet s'ouvre en premier, et si un onglet doit montrer son
/// état vide.
enum MyStoriesTabResolver {

    /// L'onglet d'ouverture. On atterrit sur « Brouillons » quand il n'y a
    /// rien de publié mais du travail en attente — c'est exactement la
    /// situation d'un utilisateur dont les publications échouent, et lui
    /// ouvrir un onglet vide serait le laisser sans issue.
    static func initialTab(hasPublishedStories: Bool, hasPendingWork: Bool) -> MyStoriesTab {
        if hasPublishedStories { return .published }
        return hasPendingWork ? .drafts : .published
    }

    static func shouldShowEmptyState(tab: MyStoriesTab,
                                     hasPublishedStories: Bool,
                                     hasDrafts: Bool,
                                     hasActiveUpload: Bool,
                                     hasFailedItems: Bool) -> Bool {
        switch tab {
        case .published:
            return !hasPublishedStories
        case .drafts:
            return !hasDrafts && !hasActiveUpload && !hasFailedItems
        }
    }
}
