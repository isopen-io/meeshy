import Foundation
import MeeshySDK

/// Les quatre onglets de « Mes stories » (C7a, 2026-08-23 — la File et
/// l'Archive existaient déjà comme MATIÈRE avant d'avoir un onglet : la
/// première était entassée dans « Brouillons » (uploads actifs + échecs de
/// publication), la seconde mélangée à « Publiées » (stories actives ET
/// expirées confondues). Cette enum ne fait que leur donner une place à part
/// — aucune donnée nouvelle, seulement une meilleure étagère.
///
/// Chaque onglet reste COMPLÈTEMENT distinct (directive user 2026-08-01) :
/// « Publiées » ne contient que des stories actives et publiées, « Brouillons »
/// que du contenu local jamais envoyé, « File » que du travail réseau en cours
/// ou en échec, « Archive » que des stories publiées et déjà expirées.
enum MyStoriesTab: String, CaseIterable, Identifiable {
    case published
    case queue
    case drafts
    case archive

    var id: String { rawValue }

    var title: String {
        switch self {
        case .published:
            return String(localized: "story.mine.tab.published", defaultValue: "Publiées")
        case .queue:
            return String(localized: "story.mine.tab.queue", defaultValue: "File")
        case .drafts:
            return String(localized: "story.mine.tab.drafts", defaultValue: "Brouillons")
        case .archive:
            return String(localized: "story.mine.tab.archive", defaultValue: "Archive")
        }
    }
}

/// Décide quel onglet s'ouvre en premier, quels onglets sont visibles, et si
/// un onglet doit montrer son état vide.
enum MyStoriesTabResolver {

    /// Ce que « Publiées », « Archive » et la sélection montrent : les stories
    /// que le serveur connaît. Une story encore en attente (#15127) n'a qu'un
    /// id local ; elle vit dans « File », où seule l'horloge dit l'attente.
    static func sentStories(_ stories: [StoryItem]) -> [StoryItem] {
        stories.filter { !PendingStoryMarker.isPending(storyId: $0.id) }
    }

    /// L'onglet d'ouverture. On atterrit sur « File » quand rien n'est publié
    /// mais qu'un upload ou un échec de publication attend une action — c'est
    /// exactement la situation d'un utilisateur dont les publications
    /// échouent, et lui ouvrir un onglet vide serait le laisser sans issue.
    /// Faute de travail réseau, on atterrit sur « Brouillons » plutôt que de
    /// laisser un contenu local invisible ; « Archive » n'est jamais un
    /// atterrissage initial, c'est un onglet d'historique consulté à la
    /// demande.
    static func initialTab(hasPublishedStories: Bool, hasQueueWork: Bool, hasDraftWork: Bool) -> MyStoriesTab {
        if hasPublishedStories { return .published }
        if hasQueueWork { return .queue }
        return hasDraftWork ? .drafts : .published
    }

    /// Onglets à afficher dans le picker segmenté. « Publiées » et
    /// « Brouillons » restent toujours visibles, avec leur propre état vide —
    /// c'est le comportement historique. « File » et « Archive » n'apparaissent
    /// QUE lorsqu'ils ont de la matière : un onglet segmenté vide en
    /// permanence serait une régression d'UX par rapport aux deux onglets
    /// pleins qui existaient avant eux (loi 4 — pas de matière, pas d'onglet).
    static func visibleTabs(hasQueueWork: Bool, hasArchivedStories: Bool) -> [MyStoriesTab] {
        var tabs: [MyStoriesTab] = [.published]
        if hasQueueWork { tabs.append(.queue) }
        tabs.append(.drafts)
        if hasArchivedStories { tabs.append(.archive) }
        return tabs
    }

    static func shouldShowEmptyState(tab: MyStoriesTab,
                                     hasPublishedStories: Bool,
                                     hasDrafts: Bool,
                                     hasActiveUpload: Bool,
                                     hasFailedItems: Bool,
                                     hasArchivedStories: Bool) -> Bool {
        switch tab {
        case .published:
            return !hasPublishedStories
        case .queue:
            return !hasActiveUpload && !hasFailedItems
        case .drafts:
            return !hasDrafts
        case .archive:
            return !hasArchivedStories
        }
    }
}

/// Une story optimiste, pas encore publiée : son id est local
/// (`pending_<uuid>#<slide>`), aucun appel serveur ne le porte (#15127). Le
/// préfixe sert aussi à la réconcilier et à la préserver à travers un refetch
/// réseau (`StoryViewModel.fetchStoriesFromNetwork`).
nonisolated enum PendingStoryMarker {
    static let prefix = "pending_"

    static func isPending(storyId: String) -> Bool {
        storyId.hasPrefix(prefix)
    }

    /// L'adresse d'une story pour le serveur : `nil` tant qu'elle attend dans
    /// la file — ni salle, ni session d'engagement, ni route ne la portent.
    static func serverId(of storyId: String?) -> String? {
        guard let storyId, !isPending(storyId: storyId) else { return nil }
        return storyId
    }

    /// L'item de file qui porte une story en attente se retrouve par son id
    /// temporaire (`pending_<uuid>`), ce qui précède le numéro de slide.
    static func tempStoryId(of storyId: String) -> String? {
        guard isPending(storyId: storyId) else { return nil }
        return storyId.split(separator: "#", maxSplits: 1).first.map(String.init)
    }
}
