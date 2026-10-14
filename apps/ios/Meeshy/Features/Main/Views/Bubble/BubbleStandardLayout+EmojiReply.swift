import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - BubbleStandardLayout — emoji seul en réponse (#10628)
//
// La carte citée reste une petite carte bulle ; l'emoji, lui, se pose en
// grand SANS bulle dessous, comme un emoji envoyé seul (`emojiOnlyContent`).
extension BubbleStandardLayout {

    @ViewBuilder
    var emojiReplyContent: some View {
        VStack(alignment: content.isMe ? .trailing : .leading, spacing: MeeshySpacing.xs) {
            if let reply = content.reply, detachedStoryCitation == nil {
                quotedReplyView(reply.reference)
                    .padding(.horizontal, MeeshySpacing.mdPlus)
                    .padding(.vertical, MeeshySpacing.sm)
                    .background(bubbleBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 18))
                    .onTapGesture {
                        guard reply.reference.opensQuotedTarget else { return }
                        HapticFeedback.light()
                        if reply.isStory {
                            onStoryReplyTap?(reply.reference.messageId)
                        } else {
                            onReplyTap?(reply.reference.messageId)
                        }
                    }
            }
            emojiOnlyContent
        }
    }
}
