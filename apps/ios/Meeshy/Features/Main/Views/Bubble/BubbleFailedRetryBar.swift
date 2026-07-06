import SwiftUI
import MeeshyUI

/// An orange band glued to the SCREEN-EDGE (trailing) side of a FAILED outgoing
/// message, as an integrated edge tab INSIDE the bubble's rounded rect. The
/// bubble's content + footer are inset to its left, so the timestamp + delivery
/// state stay visible and the bubble right-aligns like every other bubble.
/// Tapping it re-triggers the send.
///
/// Interaction (2026-06-11):
/// - **At rest** the band is steady (no animation): a calm orange strip with a
///   centred `arrow.clockwise` glyph. It does NOT blink while merely displayed.
/// - **On tap** it commits to a resend: the glyph swaps to a spinner and the
///   band starts a gentle blink, signalling "sending…". The blink is gated on
///   Reduce Motion. The band disappears on its own once the message leaves the
///   `.failed` state (the bubble's normal sending indicator takes over); if the
///   send fails again a fresh, steady band reappears.
///
/// Dedicated leaf so the bubble orchestrator stays free of inline logic (bubble
/// architecture rule); the only input is a primitive retry callback. The whole
/// fixed-width strip is the tap target (tall enough to clear 44pt), and a
/// `highPriorityGesture` ensures the tap wins over the bubble's long-press /
/// read-status tap (the conflict that previously opened the status sheet).
struct BubbleFailedRetryBar: View {
    let onRetry: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isRetrying = false
    @State private var blink = false

    var body: some View {
        ZStack {
            Rectangle()
                .fill(MeeshyColors.warning)
                // Steady at rest; only the active-resend blink modulates it.
                .opacity(isRetrying && blink ? 1.0 : 0.92)

            if isRetrying {
                // Resend in flight — the glyph becomes a spinner.
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(.white)
                    .scaleEffect(0.7)
            } else {
                Image(systemName: "arrow.clockwise")
                    .font(MeeshyFont.relative(14, weight: .bold))
                    .foregroundColor(.white)
            }
        }
        .frame(maxHeight: .infinity)
        .contentShape(Rectangle())
        .highPriorityGesture(
            TapGesture().onEnded {
                guard !isRetrying else { return }
                isRetrying = true
                HapticFeedback.light()
                // Blink ONLY once the user has committed to a resend.
                if !reduceMotion {
                    withAnimation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true)) {
                        blink = true
                    }
                }
                onRetry()
            }
        )
        .accessibilityElement()
        .accessibilityLabel(Text(String(localized: "bubble.retry.resend",
                                         defaultValue: "Renvoyer le message",
                                         bundle: .main)))
        .accessibilityValue(isRetrying
            ? Text(String(localized: "bubble.retry.sending",
                          defaultValue: "Renvoi en cours",
                          bundle: .main))
            : Text(""))
        .accessibilityAddTraits(.isButton)
    }
}
