@preconcurrency import UserNotifications

/// **La bannière d'une conversation verrouillée par PIN n'offre aucune action
/// rapide** (#12655, décision porteur : le PIN est exigé).
///
/// Depuis l'écran verrouillé, « Répondre » écrirait dans le coffre et
/// « Marquer comme lu » le lirait, sans PIN. L'extension de notification pose
/// cette catégorie sur toute charge scellée, verrouillée, ou dont elle ne peut
/// pas savoir si elle l'est (`NSEAttachmentPolicy.category`) ; toucher la
/// bannière ouvre la conversation, que la porte du routeur garde par le PIN.
enum LockedConversationNotificationCategory {
    static let category = UNNotificationCategory(
        identifier: MeeshyNotificationCategory.lockedConversation.rawValue,
        actions: [],
        intentIdentifiers: [],
        options: []
    )
}
