import Foundation
import MeeshySDK

/// Les mots de la face Actions de ma fiche (#18869, planche `Moi-Actions`).
nonisolated enum ProfileActionsCopy {

    static var title: String {
        String(localized: "profile.actions.title", defaultValue: "Actions", bundle: .main)
    }

    /// « @aissa » sous le titre ; rien sans pseudo.
    static func handle(of user: MeeshyUser?) -> String? {
        guard let username = user?.username.trimmingCharacters(in: .whitespacesAndNewlines),
              !username.isEmpty else { return nil }
        return "@\(username)"
    }

    static var showTitle: String {
        String(localized: "profile.actions.show", defaultValue: "Montrer", bundle: .main)
    }

    static var share: String {
        String(localized: "profile.actions.share", defaultValue: "Partager", bundle: .main)
    }

    static var seenAs: String {
        String(localized: "profile.actions.seenAs", defaultValue: "Voir comme", bundle: .main)
    }

    static var edit: String {
        String(localized: "profile.actions.edit", defaultValue: "Modifier", bundle: .main)
    }

    static var mood: String {
        String(localized: "profile.actions.mood", defaultValue: "Mon statut", bundle: .main)
    }

    static var legend: String {
        String(localized: "profile.actions.legend", defaultValue: "Ma Légende", bundle: .main)
    }

    static var myQR: String {
        String(localized: "profile.actions.myQR", defaultValue: "Mon QR", bundle: .main)
    }

    static var scan: String {
        String(localized: "profile.actions.scan", defaultValue: "Scanner", bundle: .main)
    }

    static var myMap: String {
        String(localized: "profile.actions.myMap", defaultValue: "Ma carte", bundle: .main)
    }

    static var positionTitle: String {
        String(localized: "profile.actions.position", defaultValue: "Ma position", bundle: .main)
    }

    /// Ce que ma position est, en une ligne : en pause sous le fantôme, sinon non partagée ou vue par N personnes.
    static func positionSubtitle(recipients: Int, isGhost: Bool) -> String {
        if isGhost {
            return String(localized: "profile.actions.position.ghost", defaultValue: "En pause — le mode fantôme te masque à tous", bundle: .main)
        }
        guard recipients > 0 else {
            return String(localized: "profile.actions.position.off", defaultValue: "Non partagée — tu n'es visible par personne", bundle: .main)
        }
        return String(format: String(localized: "locationMap.nearby.seenBy", defaultValue: "Visible par %lld personne(s)", bundle: .main), recipients)
    }

    /// « Partager » n'est offert qu'à une position ni partagée ni en pause : sinon la rangée mène à la carte.
    static func positionOffersShare(recipients: Int, isGhost: Bool) -> Bool {
        recipients == 0 && !isGhost
    }

    static var positionShare: String {
        String(localized: "profile.actions.position.share", defaultValue: "Partager", bundle: .main)
    }

    static var ghostSubtitle: String {
        String(localized: "profile.actions.ghost.subtitle", defaultValue: "Masque ma position pour tous, Sang compris", bundle: .main)
    }

    static var ghostFailed: String {
        String(localized: "profile.actions.ghost.failed", defaultValue: "Le mode fantôme n'a pas changé, réessaie", bundle: .main)
    }

    static var sharingTitle: String {
        String(localized: "profile.actions.sharing", defaultValue: "Ce que je partage avec mes proches", bundle: .main)
    }

    static var whoSeesMeTitle: String {
        String(localized: "profile.actions.whoSeesMe", defaultValue: "Qui me voit", bundle: .main)
    }

    static var onlineTitle: String {
        String(localized: "profile.actions.online", defaultValue: "En ligne", bundle: .main)
    }

    static var lastSeenTitle: String {
        String(localized: "profile.actions.lastSeen", defaultValue: "Vu à", bundle: .main)
    }

    static var notifyReturnTitle: String {
        String(localized: "profile.actions.notifyReturn", defaultValue: "Prévenir mes contacts quand je reviens", bundle: .main)
    }

    static var findableTitle: String {
        String(localized: "profile.actions.findable", defaultValue: "Me trouver dans la recherche", bundle: .main)
    }

    static var friendRequestsTitle: String {
        String(localized: "profile.actions.friendRequests", defaultValue: "Recevoir des demandes d'amis", bundle: .main)
    }

    /// « Visible dès le cercle Ami » : le plancher que la loi d'accès donne à cette présence.
    static func visibleFrom(_ level: RelationLevel) -> String {
        let format = String(localized: "profile.actions.visibleFrom", defaultValue: "Visible dès le cercle %@", bundle: .main)
        return String(format: format, CircleLevelNames.title(of: level))
    }

    static var accountTitle: String {
        String(localized: "profile.actions.account", defaultValue: "Mon compte", bundle: .main)
    }

    static var statsTitle: String {
        String(localized: "profile.actions.stats", defaultValue: "Statistiques", bundle: .main)
    }

    /// « 12 480 messages · 86 conversations » ; rien tant que les compteurs ne sont pas servis.
    static func statsSubtitle(_ stats: UserStats?, locale: Locale) -> String? {
        guard let stats else { return nil }
        let format = String(localized: "profile.actions.stats.counts", defaultValue: "%1$@ messages · %2$@ conversations", bundle: .main)
        let style = IntegerFormatStyle<Int>.number.locale(locale)
        return String(format: format, stats.totalMessages.formatted(style), stats.totalConversations.formatted(style))
    }

    static var securityTitle: String {
        String(localized: "profile.actions.security", defaultValue: "Sécurité", bundle: .main)
    }

    /// Ce qui reste à vérifier, le téléphone d'abord : rien quand tout est vérifié.
    static func securitySubtitle(_ user: MeeshyUser?) -> String? {
        guard let user else { return nil }
        if let phone = user.phoneNumber, !phone.isEmpty, user.phoneVerifiedAt == nil {
            return String(localized: "profile.actions.security.phone", defaultValue: "Téléphone à vérifier", bundle: .main)
        }
        if let email = user.email, !email.isEmpty, user.emailVerifiedAt == nil {
            return String(localized: "profile.actions.security.email", defaultValue: "E-mail à vérifier", bundle: .main)
        }
        return nil
    }

    static var settingsTitle: String {
        String(localized: "profile.actions.settings", defaultValue: "Réglages", bundle: .main)
    }

    static var logout: String {
        String(localized: "profile.actions.logout", defaultValue: "Se déconnecter", bundle: .main)
    }

    static var logoutConfirm: String {
        String(localized: "profile.actions.logout.confirm", defaultValue: "Te déconnecter de Meeshy ?", bundle: .main)
    }
}
