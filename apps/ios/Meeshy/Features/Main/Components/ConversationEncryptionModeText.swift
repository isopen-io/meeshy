import Foundation
import MeeshySDK

/// Les mots d'un mode de chiffrement (directive porteur du 2026-11-01) : les
/// mêmes sur l'écran de création et sur la fiche Chiffrement. L'utilisateur lit
/// ce que le mode fait de ses messages, jamais qui détient une clé ni un nom
/// d'algorithme.
extension ConversationCreationEncryption.Mode {
    var label: String {
        switch self {
        case .server:
            String(localized: "conversation.encryption.mode.server.label", defaultValue: "Serveur", bundle: .main)
        case .hybrid:
            String(localized: "conversation.encryption.mode.hybrid.label", defaultValue: "Hybride", bundle: .main)
        case .e2ee:
            String(localized: "conversation.encryption.mode.e2ee.label", defaultValue: "Bout en bout", bundle: .main)
        }
    }

    var summary: String {
        switch self {
        case .server:
            String(localized: "conversation.encryption.mode.server.description",
                   defaultValue: "Vos messages sont chiffrés sur nos serveurs. Traduction, transcription et recherche fonctionnent.",
                   bundle: .main)
        case .hybrid:
            String(localized: "conversation.encryption.mode.hybrid.description",
                   defaultValue: "Chiffré sur nos serveurs, comme Serveur. Le double chiffrement par vos appareils arrive bientôt.",
                   bundle: .main)
        case .e2ee:
            String(localized: "conversation.encryption.mode.e2ee.description",
                   defaultValue: "Seuls vos appareils et ceux des participants lisent les messages. La traduction se fait sur votre appareil.",
                   bundle: .main)
        }
    }
}

extension ConversationCreationEncryption.Unavailability {
    /// Pourquoi le bout en bout paraît « bientôt » sur l'écran de création.
    /// iOS lit le bout en bout : seul le groupe l'attend.
    var reason: String? {
        switch self {
        case .groupsNotYet:
            String(localized: "conversation.encryption.create.e2ee.soonGroups",
                   defaultValue: "Bientôt disponible pour les groupes", bundle: .main)
        case .clientNotYet:
            nil
        }
    }
}
