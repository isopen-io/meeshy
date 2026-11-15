import Foundation

/// Ce que la porte d'une story demande au tray : où vit une story, et la
/// charger si le tray l'ignore.
@MainActor
protocol StoryTrayResolving: AnyObject {
    func groupId(forStoryId storyId: String) -> String?
    func ensureStoryLoaded(postId: String) async -> Bool
}

extension StoryViewModel: StoryTrayResolving {
    func groupId(forStoryId storyId: String) -> String? {
        groupIndex(forStoryId: storyId).map { storyGroups[$0].id }
    }
}

/// **La seule porte d'une story nommée, pour toutes les entrées** (#7807, #7808).
///
/// Le correctif #4903 vivait dans la racine iPhone seulement : l'iPad ouvrait
/// le groupe sans `postId` (donc sur une AUTRE story du groupe) et tombait sur
/// le détail du post dès que le tray ignorait la story ; un lien tapé dans
/// l'app ouvrait toujours le détail. Chaque racine ne fournit plus que SA
/// façon d'ouvrir un détail.
///
/// - Le `postId` VOYAGE jusqu'au lecteur (`targetingStory`) : il a servi à
///   trouver le groupe, il doit encore désigner la story.
/// - **Absent du tray ne veut pas dire absent** : un lien reçu désigne presque
///   toujours une story que ce cache ignore. `ensureStoryLoaded` est
///   cache-first et écarte les stories mortes ; le détail du post reste le
///   repli pour une story réellement expirée ou supprimée.
@MainActor
struct StoryDoor {
    let tray: StoryTrayResolving
    let viewer: StoryViewerCoordinating

    func open(postId: String, showPostDetail: () -> Void) async {
        if let groupId = tray.groupId(forStoryId: postId) {
            viewer.present(.targetingStory(postId: postId, inGroup: groupId))
            return
        }
        guard await tray.ensureStoryLoaded(postId: postId),
              let groupId = tray.groupId(forStoryId: postId) else {
            showPostDetail()
            return
        }
        viewer.present(.targetingStory(postId: postId, inGroup: groupId))
    }
}
