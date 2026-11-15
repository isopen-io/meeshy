import Foundation

/// **Le registre des TÊTES amorcées d'un store vidéo (#11288).**
///
/// Une tête est le début d'un fichier, demandé par plage pour un réel de la
/// fenêtre lointaine et gardé HORS du cache : elle n'est pas un fichier entier,
/// rien ne doit la servir comme tel. Elle attend ici le transfert qui l'élira,
/// qui la REPREND (`take`) et la complète dans le même fichier lisible.
///
/// Valeur tenue par l'acteur du store, qui seul la lit et l'écrit. Bornée :
/// au-delà de `limit`, la plus ancienne est oubliée — son fichier de transit
/// part avec son `ProgressiveMediaDownload`.
struct ProgressiveHeadLedger {
    struct Head {
        let download: ProgressiveMediaDownload
        /// La réponse de la tête, quand son transfert s'est terminé ; `nil` s'il
        /// a été interrompu. Le transfert qui la reprend l'attend d'abord.
        let response: Task<URLResponse?, Never>
    }

    /// Une tête par réel de la fenêtre lointaine, des deux côtés (N±3…N±10).
    static let defaultLimit = 16

    let limit: Int
    private var heads: [String: Head] = [:]
    private var order: [String] = []

    init(limit: Int = defaultLimit) {
        self.limit = max(1, limit)
    }

    func holds(_ fileKey: String) -> Bool {
        heads[fileKey] != nil
    }

    /// Inscrit la tête de `fileKey` ; rend celles que la borne a fait oublier,
    /// pour que l'appelant annule leur transfert.
    @discardableResult
    mutating func begin(fileKey: String, download: ProgressiveMediaDownload, response: Task<URLResponse?, Never>) -> [Head] {
        let replaced = remove([fileKey])
        heads[fileKey] = Head(download: download, response: response)
        order.append(fileKey)
        let overflow = order.prefix(max(0, order.count - limit))
        return replaced + remove(Set(overflow))
    }

    /// La tête de `fileKey`, rendue au transfert qui la reprend.
    mutating func take(_ fileKey: String) -> Head? {
        remove([fileKey]).first
    }

    /// Oublie la tête de `fileKey` si c'est encore `download` — une tête qui
    /// ne se reprend pas (réponse entière coupée, échec) ne sert à personne.
    mutating func forget(fileKey: String, download: ProgressiveMediaDownload) {
        guard heads[fileKey]?.download === download else { return }
        _ = remove([fileKey])
    }

    @discardableResult
    mutating func remove(_ fileKeys: Set<String>) -> [Head] {
        let removed = fileKeys.compactMap { heads.removeValue(forKey: $0) }
        order.removeAll { fileKeys.contains($0) }
        return removed
    }

    @discardableResult
    mutating func removeAll() -> [Head] {
        remove(Set(order))
    }
}
