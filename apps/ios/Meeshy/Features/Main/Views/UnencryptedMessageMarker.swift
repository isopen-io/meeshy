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
/// le verdict de `EndToEndPlaintextLaw` sous le régime que le modèle de vue
/// tient (servi + retenu sur l'appareil), et ses traductions SERVIES — dans
/// l'ère chiffrée, celles de l'appareil seulement, aucune du serveur, que le
/// message soit signalé ou authentiquement déchiffré
/// (`ConversationEncryptedEra`). La cellule, le menu d'appui long,
/// son aperçu, la feuille « Plus » et la copie passent par ici, jamais par les
/// dictionnaires du modèle de vue en direct.
enum UnencryptedMessageGate {
    static func isUnencrypted(_ message: Message, in viewModel: ConversationViewModel?) -> Bool {
        guard let viewModel else { return false }
        let regime = viewModel.startupDependencies.encryptedEra.regime(of: viewModel)
        return EndToEndPlaintextLaw.standing(of: message, in: regime).isUnencrypted
    }

    static func translations(of message: Message, in viewModel: ConversationViewModel?) -> [MessageTranslation] {
        guard let viewModel else { return [] }
        return viewModel.startupDependencies.encryptedEra.servedTranslations(for: message.id, in: viewModel)
    }

    static func preferredTranslation(of message: Message, in viewModel: ConversationViewModel?) -> MessageTranslation? {
        viewModel?.preferredTranslation(for: message.id)
    }

    static func translatedAudios(of message: Message, in viewModel: ConversationViewModel?) -> [MessageTranslatedAudio] {
        guard let viewModel else { return [] }
        return viewModel.startupDependencies.encryptedEra.servedTranslatedAudios(for: message.id, in: viewModel)
    }
}
