import SwiftUI
import MeeshySDK
import MeeshyUI

/// P18.5 · P18.10 — « nom · durée » de l'appel réduit, sur la bulle (étiquette de
/// verre) comme dans la bannière pendant mon partage (icône d'écran, texte nu) ;
/// hors partage, la bannière compose la même étiquette (P18.3) avec les mêmes noms.
/// Les noms sont ceux de l'en-tête, lus dans la conversation en cache ; la durée
/// se redessine sous `CallDurationClock`, jamais observée.
struct CallReducedCaption: View {
    enum Style: Equatable {
        case glass
        case screenShare
    }

    let callManager: CallManager
    let style: Style
    @State private var names = CallHeaderNames(givenName: nil, groupName: nil)

    var body: some View {
        CallDurationClock { content }
            .task(id: callManager.conversationId) { await refreshNames() }
    }

    private var text: String {
        CallReducedRule.caption(
            title: CallReducedRule.title(
                givenName: names.givenName,
                groupName: names.groupName,
                displayName: callManager.remoteUsername
            ),
            duration: callManager.formattedDuration
        )
    }

    @ViewBuilder private var content: some View {
        switch style {
        case .glass:
            CallTileNameplate(title: text)
                .monospacedDigit()
        case .screenShare:
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: "rectangle.on.rectangle")
                Text(text)
                    .monospacedDigit()
                    .lineLimit(1)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Color.white)
        }
    }

    @MainActor
    private func refreshNames() async {
        names = await Self.names(conversationId: callManager.conversationId)
    }

    /// Les noms de l'en-tête, lus dans la conversation en cache (jamais le réseau) :
    /// la bulle, la capsule de partage et la bannière (P18.3) lisent les mêmes.
    @MainActor
    static func names(conversationId: String?) async -> CallHeaderNames {
        guard let id = conversationId, !id.isEmpty else {
            return CallHeaderNames(givenName: nil, groupName: nil)
        }
        let conversation = await CallConversationCache.shared.cachedConversation(id: id)
        return CallHeaderNames.resolve(conversation: conversation, knownGroupTitle: nil)
    }
}
