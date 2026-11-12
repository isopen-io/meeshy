import SwiftUI
import MeeshySDK
import MeeshyUI

/// P18.5 · P18.10 — « nom · durée » de l'appel réduit, sur la bulle (étiquette de
/// verre) comme dans la bannière pendant mon partage (icône d'écran, texte nu).
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
        guard let id = callManager.conversationId, !id.isEmpty else {
            names = CallHeaderNames(givenName: nil, groupName: nil)
            return
        }
        let conversation = await CallConversationCache.shared.cachedConversation(id: id)
        names = CallHeaderNames.resolve(conversation: conversation, knownGroupTitle: nil)
    }
}
