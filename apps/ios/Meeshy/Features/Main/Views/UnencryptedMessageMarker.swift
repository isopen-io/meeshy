import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le marqueur d'un message arrivé en clair dans une conversation chiffrée**
/// (#11380) — la face visible de `EndToEndPlaintextLaw`. Le fil le pose sous la
/// bulle ou la rangée, l'aperçu d'appui long sous la rangée, la ligne de liste
/// en tête de son texte. Il ne scelle rien : il dit que le serveur a lu ce
/// message et que rien ne prouve son auteur.
nonisolated enum UnencryptedMessageCopy {
    static let symbol = "lock.open.fill"

    static var notice: String {
        String(
            localized: "message.unencrypted.notice",
            defaultValue: "Message non chiffré — son auteur n'est pas vérifié",
            bundle: .main
        )
    }
}

struct UnencryptedMessageMarker: View {
    let isDark: Bool

    var body: some View {
        Label {
            Text(UnencryptedMessageCopy.notice)
        } icon: {
            Image(systemName: UnencryptedMessageCopy.symbol)
        }
        .font(.caption2.weight(.medium))
        .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark))
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.top, MeeshySpacing.xs)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(UnencryptedMessageCopy.notice))
        .accessibilityIdentifier("message.unencrypted.marker")
    }
}

/// Pose le marqueur sous le contenu d'un message signalé — et laisse le
/// contenu intact, sans conteneur ajouté, pour tous les autres.
struct UnencryptedMessageMarking: ViewModifier {
    let isUnencrypted: Bool
    let isDark: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if isUnencrypted {
            VStack(alignment: .leading, spacing: 0) {
                content
                UnencryptedMessageMarker(isDark: isDark)
            }
        } else {
            content
        }
    }
}

/// **Ce que les surfaces du FIL lisent d'un message pour le servir** (#11380) :
/// le verdict de `EndToEndPlaintextLaw` sur le régime de la conversation
/// chargée, et ses traductions — aucune pour un message arrivé en clair dans
/// une conversation chiffrée, car une traduction du serveur peut dire autre
/// chose que le texte qu'elle prétend traduire. La cellule, le menu d'appui
/// long, la feuille « Plus » et la copie passent par ici, jamais par le
/// dictionnaire du modèle de vue en direct.
enum UnencryptedMessageGate {
    static func isUnencrypted(_ message: Message, in viewModel: ConversationViewModel?) -> Bool {
        EndToEndPlaintextLaw.standing(
            of: message, conversationEncryptionMode: viewModel?.currentConversation?.encryptionMode
        ).isUnencrypted
    }

    static func translations(of message: Message, in viewModel: ConversationViewModel?) -> [MessageTranslation] {
        guard !isUnencrypted(message, in: viewModel) else { return [] }
        return viewModel?.messageTranslations[message.id] ?? []
    }

    static func preferredTranslation(of message: Message, in viewModel: ConversationViewModel?) -> MessageTranslation? {
        guard !isUnencrypted(message, in: viewModel) else { return nil }
        return viewModel?.preferredTranslation(for: message.id)
    }

    static func translatedAudios(of message: Message, in viewModel: ConversationViewModel?) -> [MessageTranslatedAudio] {
        guard !isUnencrypted(message, in: viewModel) else { return [] }
        return viewModel?.messageTranslatedAudios[message.id] ?? []
    }
}
