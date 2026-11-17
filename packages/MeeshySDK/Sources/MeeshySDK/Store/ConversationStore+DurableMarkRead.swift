import Foundation

extension ConversationStore {

    /// « Marquer comme lu » qui survit au réseau coupé (ios-systeme-4, #19104).
    ///
    /// Le geste de bannière ne postait qu'un `markRead` nu : hors réseau, la frontière de lecture
    /// LOCALE masquait l'échec sur l'appareil, le serveur ne l'apprenait jamais et le `aps.badge`
    /// du push suivant rallumait l'icône. Ce chemin passe par `apply(.markAsRead)` — optimiste,
    /// file SQLite persistante, rejeu au retour au premier plan : le même que la liste.
    ///
    /// Au lancement à froid en arrière-plan le store n'est pas hydraté (`apply` lèverait
    /// `unknownConversation`) : la ligne se relit d'abord du cache de liste.
    ///
    /// - Returns: `true` si le store a pris le geste en charge (envoyé, en file, ou refusé en 4xx
    ///   — un refus se rejouerait à l'identique) : l'appelant ne poste PAS une seconde fois.
    ///   `false` si la conversation est introuvable : l'appelant garde son POST direct.
    public func markReadDurably(_ convId: String) async -> Bool {
        if conversation(id: convId) == nil {
            await hydrateFromCache()
        }
        guard conversation(id: convId) != nil else { return false }
        try? await apply(.markAsRead, for: convId)
        return true
    }
}
