import Foundation

/// Portée d'un marquage « lu » — l'unité, tout le contexte d'une conversation,
/// tout le contexte d'un post/story, ou l'intégralité de la boîte.
///
/// Une seule portée par geste produit : ouvrir une conversation consomme SES
/// notifications, ouvrir une story consomme LES SIENNES. Le type de
/// notification n'est jamais un discriminant d'entité (`story_new_comment` est
/// émis pour n'importe quel contenu commenté) — c'est le contexte qui décide.
public enum NotificationReadScope: Sendable, Equatable {
    case notification(id: String)
    case conversation(id: String)
    case post(id: String)
    /// Une catégorie entière consommée par un écran dédié — l'écran des
    /// demandes d'ajout consomme `friend_request` / `contact_request` /
    /// `friend_accepted` / `contact_accepted`.
    case types([String])
    case all
}

/// Transformations PURES appliquées à l'instantané cache des notifications.
///
/// Elles existent parce que l'état « lu » ne vivait que dans le tableau
/// `@Published` de la liste : le store GRDB gardait `isRead:false`, et
/// `NotificationListViewModel.loadInitial()` lit le cache AVANT le réseau. Avec
/// une fenêtre fraîche de 2 minutes (`CachePolicy.notifications`), rouvrir la
/// cloche juste après avoir tout lu re-servait l'instantané d'avant le marquage
/// — les notifications lues repartaient non lues.
///
/// Stateless et testables isolément ; l'écriture cache elle-même est faite par
/// `NotificationToastManager`, seul propriétaire du store `notifications`.
public enum NotificationCachePatch {

    /// Applique l'état lu aux lignes couvertes par `scope`, en préservant
    /// l'ordre, le nombre, et l'horodatage de lecture des lignes DÉJÀ lues.
    public static func markingRead(
        _ items: [APINotification],
        scope: NotificationReadScope
    ) -> [APINotification] {
        items.map { item in
            guard !item.isRead, matches(item, scope) else { return item }
            return item.withReadState(true)
        }
    }

    /// Retire une ligne (suppression utilisateur ou événement `notification:deleted`).
    public static func removing(_ items: [APINotification], id: String) -> [APINotification] {
        items.filter { $0.id != id }
    }

    private static func matches(_ item: APINotification, _ scope: NotificationReadScope) -> Bool {
        switch scope {
        case .all:
            return true
        case .notification(let id):
            return item.id == id
        case .conversation(let id):
            return item.context?.conversationId == id
        case .post(let id):
            return item.context?.postId == id
        case .types(let types):
            return types.contains(item.type)
        }
    }
}
