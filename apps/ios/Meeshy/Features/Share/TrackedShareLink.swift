import Foundation
import MeeshySDK

/// **Le lien suivi de l'utilisateur pour un contenu** (#14310, #14311) — la
/// SEULE frappe des deux gestes de partage d'une carte : « Envoyer » (la feuille
/// Meeshy, `LiveShareDispatcher.resolvedLink`) et « Partager » (la feuille du
/// système, menu « ⋯ » du lecteur de story).
///
/// `POST /posts/:id/share` avec `generateLink` crée le lien s'il n'existe pas
/// et le RETROUVE sinon : un lien par contenu et par partageur, et le compteur
/// de partages ne monte qu'une fois. La loi d'audience vit dans
/// `ShareCard.mintsTrackedLink` ; la passerelle la vérifie à son tour.
@MainActor
enum TrackedShareLink {
    /// D'où part le lien — une étiquette de mesure, jamais une règle.
    enum Gesture: String {
        case send = "meeshy"
        case shareOut = "system"
    }

    /// Le lien suivi, ou `nil` : la loi le refuse, le réseau manque, ou la
    /// passerelle n'a rien rendu. L'appelant garde alors l'adresse directe.
    static func mint(
        for card: ShareCard,
        gesture: Gesture,
        service: PostServiceProviding = PostService.shared,
        isOnline: Bool = NetworkMonitor.shared.isOnline
    ) async -> URL? {
        guard card.mintsTrackedLink, isOnline else { return nil }
        guard let result = try? await service.share(postId: card.contentId, platform: gesture.rawValue, generateLink: true),
              let short = result.shortUrl else { return nil }
        return URL(string: short)
    }

    /// Ce que « Partager » emporte : le lien suivi, sinon l'adresse directe.
    static func outgoingURL(for card: ShareCard, service: PostServiceProviding = PostService.shared,
                            isOnline: Bool = NetworkMonitor.shared.isOnline) async -> URL? {
        await mint(for: card, gesture: .shareOut, service: service, isOnline: isOnline) ?? card.url
    }
}
