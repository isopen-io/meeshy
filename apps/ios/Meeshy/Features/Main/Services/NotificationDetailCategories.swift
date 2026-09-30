@preconcurrency import UserNotifications

/// **Les actions qu'appelle le DÉTAIL d'un message** (#8858).
///
/// Une position, une carte de visite et une invitation n'arrivent pas avec
/// les mêmes gestes utiles qu'un message texte : on ouvre un lieu dans Plans,
/// on enregistre un contact, on rejoint une conversation. L'extension choisit
/// la catégorie (`NotificationDetailPolicy.refinedCategory`) ; ces catégories
/// en portent les boutons, et `NotificationActionHandler` les exécute.
///
/// Chaque action qui MÈNE quelque part porte `.foreground` : iOS ouvre l'app,
/// sans quoi le geste s'exécuterait en arrière-plan sans rien montrer.
enum NotificationDetailCategories {

    static func categories(reply: UNNotificationAction, markRead: UNNotificationAction) -> [UNNotificationCategory] {
        [
            // #8859 — un vocal garde les gestes d'un message : l'écoute vit
            // dans la notification déployée, pas dans un bouton.
            UNNotificationCategory(
                identifier: MeeshyNotificationCategory.audio.rawValue,
                actions: [reply, markRead],
                intentIdentifiers: [],
                options: [.customDismissAction]
            ),
            UNNotificationCategory(
                identifier: MeeshyNotificationCategory.location.rawValue,
                actions: [
                    UNNotificationAction(
                        identifier: MeeshyNotificationAction.openInMaps.rawValue,
                        title: String(localized: "notifications.action.openInMaps", defaultValue: "Ouvrir dans Plans"),
                        options: [.foreground]
                    ),
                    reply,
                ],
                intentIdentifiers: [],
                options: [.customDismissAction]
            ),
            UNNotificationCategory(
                identifier: MeeshyNotificationCategory.contact.rawValue,
                actions: [
                    UNNotificationAction(
                        identifier: MeeshyNotificationAction.addContact.rawValue,
                        title: String(localized: "notifications.action.addContact", defaultValue: "Ajouter aux contacts"),
                        options: [.foreground]
                    ),
                    reply,
                ],
                intentIdentifiers: [],
                options: [.customDismissAction]
            ),
            UNNotificationCategory(
                identifier: MeeshyNotificationCategory.invite.rawValue,
                actions: [
                    UNNotificationAction(
                        identifier: MeeshyNotificationAction.joinInvite.rawValue,
                        title: String(localized: "notifications.action.join", defaultValue: "Rejoindre"),
                        options: [.foreground]
                    ),
                    reply,
                ],
                intentIdentifiers: [],
                options: [.customDismissAction]
            ),
        ]
    }
}
