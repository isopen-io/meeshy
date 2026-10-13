import Foundation

// MARK: - D'où un lecteur ouvre un contenu, et par où il arrive sur son écran (#10483)
//
// Miroir Swift de `packages/shared/types/content-reach.ts` (OPEN_ORIGINS,
// VIEW_PROVENANCES). Les énumérations sont FERMÉES : aucune valeur que la
// passerelle ne connaît pas ne part d'iOS. Toute nouvelle valeur s'ajoute
// d'abord au contrat partagé.

/// Le LISTING où le lecteur a tapé le contenu. L'événement `open` la porte, et
/// la vue de l'écran ouvert la reprend quand sa provenance est `listing`.
public enum OpenOrigin: String, Codable, Sendable, CaseIterable {
    case feed
    case reels
    case profile
    case bookmarks
    case hashtag
    case community
    case nearby
    case sound
    case storyRail = "story_rail"
    case moodAvatar = "mood_avatar"
    case citation
    case search
}

/// Ce qui a amené l'écran DÉTAIL (détail de post, lecteur de réels, lecteur de
/// story) : un listing de l'app, une notification, un lien de partage Meeshy
/// (`?via=`), un lien de suivi (`/l/<jeton>`), un lien venu d'ailleurs sans
/// marque, ou rien de tout cela.
public enum ViewProvenance: String, Codable, Sendable, CaseIterable {
    case listing
    case notification
    case sharedLink = "shared_link"
    case trackingLink = "tracking_link"
    case external
    case direct
}

/// L'ENTRÉE d'un écran détail : sa provenance et, pour un listing seulement,
/// l'origine du tap. L'invariant « une origine n'accompagne qu'un listing »
/// tient par construction : aucune autre fabrique n'en pose.
public struct ContentEntry: Sendable, Equatable, Hashable {
    public let provenance: ViewProvenance
    public let origin: OpenOrigin?

    init(provenance: ViewProvenance, origin: OpenOrigin?) {
        self.provenance = provenance
        self.origin = provenance == .listing ? origin : nil
    }

    public static func listing(_ origin: OpenOrigin) -> ContentEntry {
        ContentEntry(provenance: .listing, origin: origin)
    }

    public static let notification = ContentEntry(provenance: .notification, origin: nil)
    public static let sharedLink = ContentEntry(provenance: .sharedLink, origin: nil)
    public static let trackingLink = ContentEntry(provenance: .trackingLink, origin: nil)
    public static let external = ContentEntry(provenance: .external, origin: nil)
    public static let direct = ContentEntry(provenance: .direct, origin: nil)

    /// La source de l'impression d'ouverture d'un détail. `IMPRESSION_SOURCES`
    /// ne bouge pas : un lien de suivi garde `shared_link`.
    public var detailImpressionSource: String {
        switch provenance {
        case .notification: return "notification"
        case .sharedLink, .trackingLink: return "shared_link"
        case .listing, .external, .direct: return "detail"
        }
    }
}

/// Comment un lot de `SocialEvent` part sur le fil.
///
/// Un serveur antérieur à l'engagement d'ouverture ne connaît pas `open` et
/// refuserait le lot ENTIER (400). Les `open` partent donc dans une requête à
/// eux ; un refus définitif de cette requête les retire SANS rejeu, et jamais
/// il n'emporte une vue ou une impression.
public enum SocialEventsDispatch {

    /// Les requêtes d'un lot, dans l'ordre : vues et impressions d'abord, puis
    /// les engagements d'ouverture, seuls.
    public static func requests(for events: [SocialEvent]) -> [[SocialEvent]] {
        let reach = events.filter { !$0.isOpen }
        let opens = events.filter(\.isOpen)
        return [reach, opens].filter { !$0.isEmpty }
    }

    /// La même partition, enveloppes comprises (#10500).
    public static func requests(for events: [StampedSocialEvent]) -> [[StampedSocialEvent]] {
        let reach = events.filter { !$0.isOpen }
        let opens = events.filter(\.isOpen)
        return [reach, opens].filter { !$0.isEmpty }
    }

    /// Un refus qu'un rejeu ne changerait pas : 401, 403, 4xx hors délai et
    /// débit. Une panne de réseau ou un 5xx se rejoue.
    public static func isPermanentRefusal(_ error: Error) -> Bool {
        guard let meeshyError = error as? MeeshyError else { return false }
        switch meeshyError {
        case .forbidden, .auth, .rejected:
            return true
        case .server(let statusCode, _):
            return (400..<500).contains(statusCode) && ![408, 429].contains(statusCode)
        default:
            return false
        }
    }

    /// Envoie le lot requête par requête et rend ce qui doit être REJOUÉ. Un
    /// refus définitif retire sa requête ; il ne touche pas aux autres.
    ///
    /// Ce qui revient garde son enveloppe : le rejeu part avec les MÊMES
    /// `eventId`, et la passerelle ne le recompte pas (#10500).
    public static func deliver(
        _ events: [StampedSocialEvent],
        credential: SocialEventsCredential,
        through service: PostServiceProviding
    ) async -> [StampedSocialEvent] {
        var unsent: [StampedSocialEvent] = []
        for request in requests(for: events) {
            do {
                _ = try await service.recordSocialEvents(request, credential: credential)
            } catch where isPermanentRefusal(error) {
                continue
            } catch {
                unsent.append(contentsOf: request)
            }
        }
        return unsent
    }

    /// Un lot sans file : l'enveloppe se pose à l'appel.
    public static func deliver(
        _ events: [SocialEvent],
        credential: SocialEventsCredential,
        through service: PostServiceProviding,
        at now: Date = Date()
    ) async -> [SocialEvent] {
        await deliver(events.map { StampedSocialEvent.stamping($0, at: now) }, credential: credential, through: service).map(\.event)
    }
}
