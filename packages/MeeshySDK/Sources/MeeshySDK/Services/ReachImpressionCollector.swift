import Foundation

/// Une surface qui SIGNALE ce qu'elle affiche (#10483), sans savoir comment
/// c'est compté. L'app y branche sa file persistée ; le SDK fournit
/// `ReachImpressionCollector` pour les surfaces qu'il monte seul.
public protocol ReachImpressionRecording: AnyObject {
    @MainActor func record(_ postId: String)
    @MainActor func flushNow() async
    /// #10501 — l'affichage d'une carte DANS un listing, à son rang rendu.
    /// Rend l'`eventId` de l'impression, que la mesure de visibilité de la
    /// carte rappelle ; `nil` quand la surface ne mesure pas.
    @MainActor func recordListed(_ postId: String, position: Int?, isVideo: Bool) -> String?
    /// La part visible de la carte a changé (0 = hors écran).
    @MainActor func noteVisible(fraction: Double, of eventId: String)
    /// La carte a quitté l'écran : sa mesure se clôt.
    @MainActor func noteGone(_ eventId: String)
}

public extension ReachImpressionRecording {
    /// Défaut : une surface qui ne mesure pas la visibilité compte
    /// l'impression, et rien d'autre.
    @MainActor func recordListed(_ postId: String, position: Int?, isVideo: Bool) -> String? {
        record(postId)
        return nil
    }
    @MainActor func noteVisible(fraction: Double, of eventId: String) {}
    @MainActor func noteGone(_ eventId: String) {}
}

/// Le collecteur minimal d'une surface du SDK : les affichages s'accumulent
/// pendant que la surface est montée et partent en UN lot à sa sortie, par la
/// porte `POST /social/events`. Un envoi refusé est perdu — c'est un compteur
/// d'audience, pas une écriture de l'utilisateur.
@MainActor
public final class ReachImpressionCollector: ReachImpressionRecording {
    nonisolated deinit {}

    private let source: String
    private let surface: ReachSurface
    private let postService: PostServiceProviding
    private let clock: @MainActor () -> Date
    /// Chaque affichage garde l'heure où il a eu lieu, pas celle du départ.
    private var pending: [StampedSocialEvent] = []

    public init(
        source: String,
        surface: ReachSurface,
        postService: PostServiceProviding = PostService.shared,
        clock: @escaping @MainActor () -> Date = { Date() }
    ) {
        self.source = source
        self.surface = surface
        self.postService = postService
        self.clock = clock
    }

    public func record(_ postId: String) {
        guard !postId.isEmpty else { return }
        pending.append(.stamping(.impression(postId: postId, source: source, surface: surface), at: clock()))
    }

    public func flushNow() async {
        let batch = pending
        guard !batch.isEmpty else { return }
        pending.removeAll()
        _ = try? await postService.recordSocialEvents(batch, credential: .account)
    }
}
