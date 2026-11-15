import Foundation

// MARK: - MES packs, sur MON profil seulement (#16433)

/// La règle qui garde l'accès à MES packs depuis une fiche. Les deux raccourcis qui vivaient en tête de mon profil se
/// sont fondus dans « Mes contenus » (#18590) : « Mes packs » y est une rangée, et la Boutique reste aux Réglages, qui
/// la règlent. La règle, elle, ne change pas.
enum ProfilePackShortcuts {
    /// Le profil d'un autre ne propose jamais MES packs.
    static func isShown(viewerId: String?, profileUserId: String?) -> Bool {
        guard let viewerId, !viewerId.isEmpty else { return false }
        return viewerId == profileUserId
    }
}
