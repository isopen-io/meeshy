import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le squelette de démarrage à froid de la conversation
//
// Extrait de `ConversationView.swift` (cohésion).

/// Vertical stack of skeleton bubbles used as the cold-start
/// placeholder. The bubble indices alternate left/right inside
/// `SkeletonMessageBubble` so the column reads like a real
/// conversation thread while the first network/cache pass runs.
struct ConversationMessageSkeleton: View {
    /// La réserve basse du composeur, que le squelette ne doit pas recouvrir.
    let bottomInset: CGFloat

    var body: some View {
        VStack(spacing: MeeshySpacing.md) {
            ForEach(0..<6, id: \.self) { index in
                SkeletonMessageBubble(index: index)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, MeeshySpacing.md + 2)
        .padding(.top, 96) // Precise alignment with background gradient transition
        .padding(.bottom, bottomInset)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(String(localized: "conversation.view.loading_messages", bundle: .main)))
    }
}
