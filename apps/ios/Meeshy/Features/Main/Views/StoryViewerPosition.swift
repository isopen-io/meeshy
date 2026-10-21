import MeeshySDK

/// **La position du lecteur de stories se tient par IDENTITÉ, pas par rang.**
///
/// `StoryViewerView` reçoit `groups` frais à chaque rendu, alors que ses deux
/// index (`currentGroupIndex`, `currentStoryIndex`) sont des `@State` posés une
/// fois. Or la liste bouge sous le lecteur ouvert : tri après `story:created`,
/// `story:viewed`, `story:updated` ; purge des stories supprimées ou expirées
/// (socket, tombstones de la synchro, balayage de 60 s du plateau).
/// - Une INSERTION ou un TRI faisait passer le lecteur à un autre auteur au
///   même rang — sans marquer vue, sans réarmer le minuteur ; une réaction
///   partait alors sur une story que l'utilisateur n'avait pas choisie.
/// - Une story RETIRÉE avant la courante sautait silencieusement la suivante.
/// - Deux groupes retirés d'un coup laissaient l'index au-delà de la fin :
///   « auteur précédent » lisait `groups[index - 1]` hors bornes → plantage.
///
/// Pur, sans vue : chaque règle se teste sans lecteur monté.
nonisolated enum StoryViewerPosition {

    /// Ce qui suffit pour retrouver une position : l'auteur et ses stories.
    struct GroupShape: Equatable, Sendable {
        let id: String
        let storyIds: [String]
    }

    struct Landing: Equatable, Sendable {
        let group: Int
        let story: Int
    }

    static func shapes(of groups: [StoryGroup]) -> [GroupShape] {
        groups.map { GroupShape(id: $0.id, storyIds: $0.stories.map(\.id)) }
    }

    /// La position, dans `new`, de la story montrée à `position` dans `old`.
    /// - La story existe encore : sa position, où qu'elle soit passée.
    /// - Elle a disparu, son auteur reste : la story qui la suivait (même rang,
    ///   borné à la dernière).
    /// - L'auteur a disparu : l'auteur qui occupe désormais son rang (borné), à
    ///   sa première story.
    /// - Plus rien : `nil`.
    static func reanchor(from old: [GroupShape], to new: [GroupShape], at position: Landing) -> Landing? {
        guard let fallbackGroup = new.indices.last else { return nil }
        guard old.indices.contains(position.group) else {
            return clamped(position, in: new)
        }
        let anchoredGroup = old[position.group]
        let anchoredStory = anchoredGroup.storyIds.indices.contains(position.story)
            ? anchoredGroup.storyIds[position.story] : nil

        if let groupIndex = new.firstIndex(where: { $0.id == anchoredGroup.id }),
           !new[groupIndex].storyIds.isEmpty {
            let stories = new[groupIndex].storyIds
            if let anchoredStory, let storyIndex = stories.firstIndex(of: anchoredStory) {
                return Landing(group: groupIndex, story: storyIndex)
            }
            return Landing(group: groupIndex, story: min(max(0, position.story), stories.count - 1))
        }
        return Landing(group: min(max(0, position.group), fallbackGroup), story: 0)
    }

    /// « Auteur précédent » depuis `groupIndex` : le groupe d'avant, posé sur sa
    /// dernière story. L'index borné d'abord — il peut dépasser une liste qui a
    /// rétréci depuis qu'il a été posé.
    static func previousGroupLanding(storyCounts: [Int], from groupIndex: Int) -> Landing? {
        let target = min(groupIndex - 1, storyCounts.count - 1)
        guard target >= 0 else { return nil }
        return Landing(group: target, story: max(0, storyCounts[target] - 1))
    }

    /// L'auteur SUIVANT, s'il existe dans la liste que la transition tient en main.
    static func nextGroupIndex(after groupIndex: Int, groupCount: Int) -> Int? {
        let next = groupIndex + 1
        guard next >= 0, next < groupCount else { return nil }
        return next
    }

    static func storyId(at position: Landing, in groups: [GroupShape]) -> String? {
        guard groups.indices.contains(position.group),
              groups[position.group].storyIds.indices.contains(position.story) else { return nil }
        return groups[position.group].storyIds[position.story]
    }

    private static func clamped(_ position: Landing, in groups: [GroupShape]) -> Landing? {
        guard let last = groups.indices.last else { return nil }
        let group = min(max(0, position.group), last)
        let story = min(max(0, position.story), max(0, groups[group].storyIds.count - 1))
        return Landing(group: group, story: story)
    }
}
