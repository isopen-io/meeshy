import Foundation

// MARK: - Les interactions, émises là où la mutation RÉUSSIT (#10502, #10503)
//
// Une interaction v2 ne recompte rien : le compteur, l'état et la
// notification restent l'affaire de la route de mutation. L'événement dit
// seulement QU'elle a eu lieu, quand, et avec quel identifiant de mutation
// (`mutationId` = `clientMutationId`), pour que l'analyse la rattache.

/// Le relais des événements v2 émis par le SDK (services, file de mutations)
/// vers la file de l'app. Sans puits installé, rien ne part : un service
/// utilisé hors de l'app (extension, test) n'émet rien.
public final class SocialEventsV2Hub: Sendable {
    public static let shared = SocialEventsV2Hub()

    private let sinkSlot = Locked<(@Sendable (SocialEventV2) -> Void)?>(nil)

    public init() {}

    public func install(_ sink: @escaping @Sendable (SocialEventV2) -> Void) {
        sinkSlot.mutate { $0 = sink }
    }

    public func emit(_ event: SocialEventV2) {
        let current = sinkSlot.read { $0 }
        current?(event)
    }
}

public enum SocialInteractionEvents {

    public static func interaction(
        _ action: SocialInteraction.Action,
        on target: SocialTarget,
        destination: SocialInteraction.ShareDestination? = nil,
        mutationId: String? = nil,
        occurredAt: Date = Date(),
        surface: SocialSurface? = nil,
        prism: SocialPrism? = nil
    ) -> SocialEventV2 {
        SocialEventV2(
            occurredAt: occurredAt,
            target: target,
            surface: surface,
            prism: prism,
            payload: .interaction(SocialInteraction(action: action, destination: destination, mutationId: mutationId))
        )
    }

    public static func negative(
        _ action: SocialNegative.Action,
        on target: SocialTarget,
        reasonCode: String? = nil,
        visibleMs: Int? = nil,
        occurredAt: Date = Date(),
        surface: SocialSurface? = nil
    ) -> SocialEventV2 {
        SocialEventV2(
            occurredAt: occurredAt,
            target: target,
            surface: surface,
            payload: .negative(SocialNegative(action: action, reasonCode: reasonCode, visibleMs: visibleMs))
        )
    }

    /// La destination d'un partage, depuis la `platform` que la route reçoit.
    public static func shareDestination(platform: String?) -> SocialInteraction.ShareDestination {
        switch platform?.lowercased() {
        case "system", "native", "native_sheet": return .nativeSheet
        case "copy", "copy_link", "clipboard": return .copyLink
        case "conversation", "meeshy", "message": return .conversation
        case "story": return .story
        case "repost": return .repost
        case .some(let value) where !value.isEmpty: return .externalApp
        default: return .other
        }
    }

    /// Le type d'une cible de repost (`PostType` gateway) en genre de cible.
    public static func targetKind(postType: String?) -> SocialTargetKind {
        switch postType?.uppercased() {
        case "REEL": return .reel
        case "STORY": return .story
        case "STATUS": return .status
        default: return .post
        }
    }

    /// L'interaction qu'une mutation de la file durable a ACCOMPLIE — lue à
    /// son envoi réussi, datée de son enfilement (le geste de l'utilisateur).
    /// `nil` : la mutation n'est pas une interaction avec un contenu.
    public static func event(forDelivered record: OutboxRecord) -> SocialEventV2? {
        let decoder = MeeshyCoders.decoder(.persistence)
        switch record.kind {
        case .toggleLikePost:
            guard let payload = try? decoder.decode(ToggleLikePostPayload.self, from: record.payload) else { return nil }
            return interaction(payload.liked ? .react : .unreact, on: SocialTarget(kind: .post, id: payload.postId),
                               mutationId: payload.clientMutationId, occurredAt: record.createdAt)
        case .repostPost:
            guard let payload = try? decoder.decode(RepostPostPayload.self, from: record.payload) else { return nil }
            return interaction(payload.isQuote ? .quote : .repost, on: SocialTarget(kind: .post, id: payload.postId),
                               mutationId: payload.clientMutationId, occurredAt: record.createdAt)
        case .createComment:
            guard let payload = try? decoder.decode(CreateCommentPayload.self, from: record.payload) else { return nil }
            return interaction(.commentSubmit, on: SocialTarget(kind: .post, id: payload.postId),
                               mutationId: payload.clientMutationId, occurredAt: record.createdAt)
        case .blockUser:
            guard let payload = try? decoder.decode(BlockUserPayload.self, from: record.payload) else { return nil }
            return negative(.block, on: SocialTarget(kind: .profile, id: payload.targetUserId), occurredAt: record.createdAt)
        default:
            return nil
        }
    }
}
