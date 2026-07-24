import Foundation

/// Chasse paginée BORNÉE d'un commentaire ciblé par une notification.
///
/// Les commentaires top-level sont paginés du plus récent au plus ancien
/// (curseur `lt`) : un commentaire notifié au-delà de la première page
/// n'était jamais atteint (audit routage 2026-07-24, F6). Plutôt qu'une API
/// « around » (qui créerait un trou dans la liste et une double sémantique
/// de curseur côté client), on suit le curseur existant page par page
/// jusqu'à ce que la cible soit chargée — liste contiguë, « Charger plus »
/// et le cache restent cohérents.
///
/// Borné (`maxPages`) pour ne pas aspirer un fil viral entier : au-delà du
/// cap, l'appelant abandonne le ciblage (la liste reste utilisable, le
/// commentaire est simplement plus bas).
enum CommentTargetHunter {

    nonisolated static let defaultMaxPages = 15

    /// Retourne `true` si la cible est présente à l'issue de la chasse.
    /// `isPresent`/`hasMore` sont relus à chaque itération ; `loadNextPage`
    /// doit faire progresser le curseur (sinon la boucle s'arrête au cap).
    nonisolated static func hunt(
        maxPages: Int = defaultMaxPages,
        isPresent: () -> Bool,
        hasMore: () -> Bool,
        loadNextPage: () async -> Void
    ) async -> Bool {
        var pages = 0
        while !isPresent(), hasMore(), pages < maxPages {
            await loadNextPage()
            pages += 1
        }
        return isPresent()
    }
}
