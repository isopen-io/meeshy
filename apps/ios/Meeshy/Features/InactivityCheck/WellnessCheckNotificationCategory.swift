import UserNotifications

/// **« Tout va bien ? » se répond depuis l'écran verrouillé** (#18738). L'extension de notification pose cette catégorie
/// sur le type `wellness_check` ; « Je vais bien » appelle `POST /me/wellness/ok` sans ouvrir l'app
/// (`NotificationActionHandler`), et le toucher de la bannière répond de même.
enum WellnessCheckNotificationCategory {
    static func category(bundle: Bundle) -> UNNotificationCategory {
        let answer = UNNotificationAction(
            identifier: MeeshyNotificationAction.wellnessOk.rawValue,
            title: InactivityCheckWording.wellnessOkAction(bundle: bundle),
            options: []
        )
        return UNNotificationCategory(
            identifier: MeeshyNotificationCategory.wellnessCheck.rawValue,
            actions: [answer],
            intentIdentifiers: [],
            options: []
        )
    }
}
