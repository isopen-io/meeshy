import SwiftUI
import MeeshyUI

/// BUG3 — an orange band hugging the LEFT edge of a FAILED outgoing bubble.
/// Tapping it RE-TRIGGERS the send (no status sheet). Dedicated leaf so the
/// bubble orchestrator stays free of inline logic (bubble architecture rule);
/// the only input is a primitive retry callback.
///
/// The visible stripe is thin (5pt) but the tap target is widened with an
/// invisible hit area so it clears the 44pt minimum without widening the bubble.
/// A `highPriorityGesture` ensures the tap wins over the bubble's long-press /
/// read-status tap (the conflict that previously opened the status sheet).
struct BubbleFailedRetryBar: View {
    let onRetry: () -> Void

    var body: some View {
        ZStack(alignment: .leading) {
            Color.clear
                .frame(width: 22)
                .contentShape(Rectangle())
            RoundedRectangle(cornerRadius: 2.5)
                .fill(MeeshyColors.warning)
                .frame(width: 5)
        }
        .frame(maxHeight: .infinity)
        .highPriorityGesture(
            TapGesture().onEnded {
                onRetry()
                HapticFeedback.light()
            }
        )
        .accessibilityElement()
        .accessibilityLabel(Text(String(localized: "bubble.retry.resend",
                                         defaultValue: "Renvoyer le message",
                                         bundle: .main)))
        .accessibilityAddTraits(.isButton)
    }
}
