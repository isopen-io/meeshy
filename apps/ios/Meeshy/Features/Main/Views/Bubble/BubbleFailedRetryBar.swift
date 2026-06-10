import SwiftUI
import MeeshyUI

/// BUG3 — an orange edge button hugging the SCREEN-EDGE (trailing) side of a
/// FAILED outgoing bubble. Tapping it RE-TRIGGERS the send (no status sheet).
/// Dedicated leaf so the bubble orchestrator stays free of inline logic (bubble
/// architecture rule); the only input is a primitive retry callback.
///
/// Design (2026-06-10): the affordance now reads unambiguously as a *button* —
/// a wider orange band on the trailing edge (the side touching the screen edge
/// for a right-aligned own bubble, so it covers trailing padding rather than the
/// start of the text), a centred `arrow.clockwise` retry glyph, and a gentle
/// brightness/scale pulse that signals interactivity. The pulse is gated on
/// Reduce Motion. The tap target is widened to 44pt with an invisible hit area
/// so it clears the minimum without widening the bubble, and a
/// `highPriorityGesture` ensures the tap wins over the bubble's long-press /
/// read-status tap (the conflict that previously opened the status sheet).
struct BubbleFailedRetryBar: View {
    let onRetry: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false

    var body: some View {
        ZStack(alignment: .trailing) {
            // Comfortable invisible hit area (>= 44pt) without widening the bubble.
            Color.clear
                .frame(width: 44)
                .contentShape(Rectangle())

            // Visible orange edge button with the retry glyph. Clipped by the
            // bubble's rounded rect (the overlay is applied before `clipShape`),
            // so it follows the trailing rounded corners as an integrated edge.
            ZStack {
                Rectangle()
                    .fill(MeeshyColors.warning)
                    .opacity(pulse ? 1.0 : 0.82)
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                    .scaleEffect(pulse ? 1.12 : 1.0)
            }
            .frame(width: 28)
        }
        .frame(maxHeight: .infinity)
        .highPriorityGesture(
            TapGesture().onEnded {
                onRetry()
                HapticFeedback.light()
            }
        )
        .onAppear {
            // Reduce Motion: settle on the emphasised (bright) state without the
            // repeating animation — the button stays prominent, just static.
            guard !reduceMotion else {
                pulse = true
                return
            }
            withAnimation(.easeInOut(duration: 0.85).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
        .accessibilityElement()
        .accessibilityLabel(Text(String(localized: "bubble.retry.resend",
                                         defaultValue: "Renvoyer le message",
                                         bundle: .main)))
        .accessibilityAddTraits(.isButton)
    }
}
