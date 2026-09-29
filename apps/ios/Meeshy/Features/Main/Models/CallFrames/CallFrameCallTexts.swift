import Foundation
import MeeshySDK

/// Ce que l'écran d'appel sait déjà de la conversation de l'appel, sans rien attendre :
/// son identifiant, le titre de groupe que le maillage a reçu par socket, et si l'appel
/// se tient à plusieurs.
nonisolated struct CallFrameCallContext: Equatable, Hashable, Sendable {
    let conversationId: String?
    let knownGroupTitle: String?
    let isGroupCall: Bool
}

/// **LES TEXTES D'UN CADRE** (#8743, spec § 4.5 et § 5.6) : le nom du groupe tel que
/// l'utilisateur le voit (son nom personnalisé, sinon le titre de la conversation, sinon
/// celui que le maillage connaît), le type de la conversation, la date du jour et
/// l'accent de la conversation.
nonisolated enum CallFrameTextsRule {
    static func texts(conversation: MeeshyConversation?, context: CallFrameCallContext, date: String) -> CallFrameTexts {
        let grouped = conversation.map { Self.isGroup($0.type) } ?? context.isGroupCall
        let name = conversation.flatMap { Self.meaningful($0.userState.customName) ?? Self.meaningful($0.title) } ?? Self.meaningful(context.knownGroupTitle)
        return CallFrameTexts(
            groupName: grouped ? name : nil,
            isGroup: grouped,
            date: date,
            accentHex: conversation.flatMap { Self.accent($0.colorPalette) }
        )
    }

    /// Un direct et un bot sont un tête-à-tête ; tout le reste réunit un groupe.
    static func isGroup(_ type: MeeshyConversation.ConversationType) -> Bool {
        switch type {
        case .direct, .bot: return false
        case .group, .public, .global, .community, .channel, .broadcast: return true
        }
    }

    /// La palette de la conversation porte des hex sans « # » : le cadre les veut préfixés.
    static func accent(_ palette: ConversationColorPalette) -> CallFrameAccent? {
        guard let primary = hex(palette.primary), let secondary = hex(palette.secondary) else { return nil }
        return CallFrameAccent(primary: primary, secondary: secondary)
    }

    static func hex(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let prefixed = trimmed.hasPrefix("#") ? trimmed : "#" + trimmed
        return CallFrameColor.parse(prefixed) == nil ? nil : prefixed
    }

    /// La date du jour, au format court de la langue de l'appareil.
    static func dateText(_ date: Date) -> String {
        date.formatted(date: .abbreviated, time: .omitted)
    }

    private static func meaningful(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
        return trimmed
    }
}
