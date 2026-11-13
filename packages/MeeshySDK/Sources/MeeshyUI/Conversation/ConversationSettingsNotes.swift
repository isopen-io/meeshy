import Foundation

/// Les notes des réglages de la conversation passées derrière un (i) (épure #17584, #18078) : la rangée
/// NOMME (« Mode lent », « Mode annonce »), le (i) répond à la question que l'utilisateur se pose.
public enum ConversationSettingsNotes {
    public static var slowMode: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "conversation.settings.permissions.slowMode.question", defaultValue: "Que fait le mode lent ?", bundle: .module),
            text: String(localized: "conversation.settings.permissions.slowMode.note", defaultValue: "Un délai entre deux messages d’un même membre.", bundle: .module)
        )
    }

    public static var announcement: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "conversation.settings.permissions.announcement.question", defaultValue: "Que change le mode annonce ?", bundle: .module),
            text: String(localized: "conversation.settings.permissions.announcement.note", defaultValue: "Seuls les admins peuvent écrire : « Qui peut écrire » est alors verrouillé.", bundle: .module)
        )
    }
}
