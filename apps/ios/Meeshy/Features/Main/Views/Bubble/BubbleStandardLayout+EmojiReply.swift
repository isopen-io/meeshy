import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - BubbleStandardLayout — emoji seul en réponse (#10628)
//
// La carte citée reste une petite carte bulle ; l'emoji, lui, se pose en
// grand SANS bulle dessous, comme un emoji envoyé seul (`emojiOnlyContent`).
// Une citation de story DÉTACHÉE (vue `3h`) est déjà posée au-dessus du
// contenu par `BubbleStandardLayout` : la carte plate ne la redouble pas.
extension BubbleStandardLayout {

    @ViewBuilder
    var emojiReplyContent: some View {
        VStack(alignment: content.isMe ? .trailing : .leading, spacing: MeeshySpacing.xs) {
            if let reply = content.reply, detachedStoryCitation == nil {
                quotedReplyView(reply.reference)
                    .padding(.horizontal, MeeshySpacing.mdPlus)
                    .padding(.vertical, MeeshySpacing.sm)
                    .background(bubbleBackground)
                    .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lgPlus))
                    .onTapGesture { openQuotedTarget(reply) }
            }
            emojiOnlyContent
        }
    }

    /// Le geste de la carte citée, partagé par la bulle texte et l'emoji en
    /// réponse : une cible qui n'ouvre rien ne vibre pas (loi 4).
    func openQuotedTarget(_ reply: BubbleContent.Reply) {
        guard reply.reference.opensQuotedTarget else { return }
        HapticFeedback.light()
        if reply.isStory {
            onStoryReplyTap?(reply.reference.messageId)
        } else {
            onReplyTap?(reply.reference.messageId)
        }
    }
}
