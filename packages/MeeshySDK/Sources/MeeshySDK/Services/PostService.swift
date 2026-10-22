import Foundation

public final class PostService: PostServiceProviding, Sendable {
    public static let shared = PostService()
    let api: APIClientProviding
    /// #10502 — les interactions RÉUSSIES par appel direct (réels, profil,
    /// favoris, hashtag) ; la file durable émet les siennes à l'envoi.
    private let socialEvents: SocialEventsV2Hub
    /// L'heure de l'appareil au départ d'un lot de comptage (`context.sentAt`).
    let clock: @Sendable () -> Date
    /// #10501 — de quelle page vient chaque élément d'un listing.
    let listings: ListingContextProviding
    /// #10552 — le consentement d'analyse déclaré par un lot de comptage.
    let consent: SocialEventsConsentSource

    init(
        api: APIClientProviding = APIClient.shared,
        socialEvents: SocialEventsV2Hub = .shared,
        clock: @escaping @Sendable () -> Date = { Date() },
        listings: ListingContextProviding = ListingContextLedger.shared,
        consent: SocialEventsConsentSource = .shared
    ) {
        self.api = api
        self.socialEvents = socialEvents
        self.clock = clock
        self.listings = listings
        self.consent = consent
    }

    func emitInteraction(_ action: SocialInteraction.Action, postId: String, destination: SocialInteraction.ShareDestination? = nil) {
        socialEvents.emit(SocialInteractionEvents.interaction(action, on: SocialTarget(kind: .post, id: postId), destination: destination))
    }
}
