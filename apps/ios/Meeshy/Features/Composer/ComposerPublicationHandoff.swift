import Foundation

/// **Quelle publication la file vient d'accepter** (#13415) — écrit par la
/// porte qui enfile, lu par le meuble aussitôt après l'acceptation, pour
/// ranger son brouillon dans le tiroir de CETTE publication au lieu de
/// l'effacer. Tout se passe sur le fil principal, dans l'ordre
/// `onPublishDocument` → `take()`.
@MainActor
enum ComposerPublicationHandoff {
    private static var accepted: String?

    static func record(_ clientMutationId: String) {
        accepted = clientMutationId
    }

    static func take() -> String? {
        defer { accepted = nil }
        return accepted
    }
}
