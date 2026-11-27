import Combine
import Foundation

/// `user:preferences-updated` — **portée communauté** (#16858). Miroir de
/// `UserPreferencesCommunityUpdatedEventData`
/// (`packages/shared/types/socketio-events/preferences.ts`), émis par
/// `PUT/DELETE /user-preferences/communities/:id` sur la room personnelle de
/// l'utilisateur, donc vers ses AUTRES appareils.
///
/// La charge ne porte ni `conversationId` ni `category` : la route la
/// reconnaît à `communityId`. Sans ce discriminant, elle tombait dans le
/// décodeur de la portée catégorie, dont `category` est requis, et l'événement
/// était jeté. Pas de `version` : le consommateur invalide son cache plutôt que
/// de réconcilier un instantané optimiste. `reset == true` (DELETE) porte
/// `preferences == nil` — le client rend ses défauts locaux.
public struct CommunityPreferencesUpdatedEvent: Decodable, Sendable, Equatable {
    public struct Preferences: Decodable, Sendable, Equatable {
        public let isPinned: Bool
        public let isMuted: Bool
        public let isArchived: Bool
        public let isHidden: Bool
        /// `all | mentions | none`, gardé brut : une valeur inconnue d'un
        /// serveur plus récent ne fait pas tomber la trame.
        public let notificationLevel: String
        public let customName: String?
        public let categoryId: String?
        public let orderInCategory: Int?

        public init(
            isPinned: Bool, isMuted: Bool, isArchived: Bool, isHidden: Bool,
            notificationLevel: String, customName: String?, categoryId: String?, orderInCategory: Int?
        ) {
            self.isPinned = isPinned; self.isMuted = isMuted
            self.isArchived = isArchived; self.isHidden = isHidden
            self.notificationLevel = notificationLevel; self.customName = customName
            self.categoryId = categoryId; self.orderInCategory = orderInCategory
        }
    }

    public let userId: String
    public let communityId: String
    public let reset: Bool
    public let preferences: Preferences?

    public init(userId: String, communityId: String, reset: Bool, preferences: Preferences?) {
        self.userId = userId; self.communityId = communityId
        self.reset = reset; self.preferences = preferences
    }
}

/// Le canal de la portée communauté, hors de `MessageSocketManager` (au-delà
/// de son budget de cohésion), comme `CommunityUpdateChannel` : la route
/// socket y publie, un écran de l'app s'y abonne par `live`.
public final class CommunityPreferencesChannel: Sendable {
    public static let shared = CommunityPreferencesChannel()

    private let subject = Locked(uncheckedState: PassthroughSubject<CommunityPreferencesUpdatedEvent, Never>())

    public var updated: PassthroughSubject<CommunityPreferencesUpdatedEvent, Never> {
        subject.mutateUnchecked { $0 }
    }

    public static var live: AnyPublisher<CommunityPreferencesUpdatedEvent, Never> {
        shared.updated.eraseToAnyPublisher()
    }

    public init() {}
}
