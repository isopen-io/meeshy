import Foundation
import MeeshySDK
import UserNotifications

/// Résout les options de présentation d'une push reçue au PREMIER PLAN en
/// appliquant les préférences de notification locales — avant ce résolveur,
/// `willPresent` affichait bannière + son + badge sans consulter aucun toggle
/// dès que le socket était down.
///
/// Règles :
/// - Socket vivant → le toast in-app (gaté, lui, par `allowsInAppBanner` —
///   règle plus permissive : l'utilisateur est DANS l'app) prend le relais :
///   pas de bannière système, badge seul si activé.
/// - Socket down → bannière système UNIQUEMENT si `allowsNotification` accepte
///   le type (master push, DND, toggle par catégorie) ; `.sound` seulement si
///   « Sons » est actif ; `.badge` seulement si « Badges » est actif.
/// - Le Focus iOS n'est pas re-vérifié ici : le système applique déjà le mode
///   Focus aux bannières natives.
enum NotificationPresentationResolver {

    // Pure (aucun état partagé) : `nonisolated` pour rester appelable depuis
    // les tests nonisolés malgré l'isolation MainActor par défaut de la cible.
    nonisolated static func options(
        socketConnected: Bool,
        prefs: UserNotificationPreferences,
        rawType: String?,
        conversationType: String?,
        conversationId: String? = nil,
        activeConversationId: String? = nil,
        now: Date = Date()
    ) -> UNNotificationPresentationOptions {
        let badge: UNNotificationPresentationOptions = prefs.notificationBadgeEnabled ? [.badge] : []

        // Une push de la conversation qu'on est en train de LIRE ne s'annonce
        // pas : le fil est sous les yeux. Sans cette garde, le retour
        // d'avant-plan (socket pas encore reconnecté) faisait tomber les
        // pushes en attente en bannières sur la conversation affichée — le
        // pendant système du guard `activeConversationId` du toast socket.
        if let conversationId, conversationId == activeConversationId {
            return badge
        }

        if socketConnected {
            return badge
        }

        // Même coercition que le décodage SDK : type inconnu → `.system`.
        let type = rawType.flatMap(MeeshyNotificationType.init(rawValue:)) ?? .system
        let isDirect = conversationType == "direct"
        guard prefs.allowsNotification(type: type, isDirectConversation: isDirect, now: now) else {
            return badge
        }

        var options: UNNotificationPresentationOptions = [.banner, .list]
        options.formUnion(badge)
        if prefs.soundEnabled {
            options.insert(.sound)
        }
        return options
    }
}
