// apps/ios/Meeshy/Core/AccountDataRetention.swift

import Foundation
import MeeshySDK

/// **Quels comptes l'appareil garde-t-il en local** (#8674).
///
/// Changer de compte ne fait plus rien perdre : la base des messages et le
/// cache d'un compte quitté restent sur l'appareil, pour qu'il y revienne sans
/// tout recharger. Ce qu'on garde reste BORNÉ par ce que l'utilisateur voit :
/// les comptes de son sélecteur, plus le compte actif. Tout ce qui appartient
/// à un compte absent du sélecteur — retiré de l'appareil, ou d'un autre
/// environnement — est un orphelin, effacé au démarrage.
///
/// Et au moment de QUITTER un compte, il n'est gardé que si sa session l'est :
/// la déconnexion, la session révoquée par le serveur et le retrait effacent
/// ses jetons AVANT de le quitter, donc ses données partent avec eux.
nonisolated enum AccountDataRetention {

    static func retainedKeys(
        savedAccountIds: [String],
        activeUserId: String?,
        serverOrigin: String?
    ) -> Set<MessageStoreAccountKey> {
        Set((savedAccountIds + [activeUserId].compactMap { $0 })
            .compactMap { MessageStoreAccountKey(userId: $0, serverOrigin: serverOrigin) })
    }

    /// Le compte quitté garde-t-il ses données ? Seulement si l'appareil
    /// garde sa session.
    static func keepsData(
        of leaving: MessageStoreAccountKey?,
        isPreserved: (String) -> Bool
    ) -> Bool {
        guard let leaving else { return false }
        return isPreserved(leaving.userId)
    }
}
