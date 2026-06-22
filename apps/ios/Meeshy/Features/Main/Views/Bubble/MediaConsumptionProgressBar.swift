import SwiftUI
import MeeshySDK
import MeeshyUI

/// Discreet bottom progress bar showing how far the LOCAL user has already
/// watched a video attachment — the at-a-glance counterpart of the audio
/// waveform's resting tint. Reads the persisted fraction from the SDK
/// `MediaConsumptionStore` building block.
///
/// App-side (not SDK): it reads a NAMED Meeshy store to express a product
/// indicator, per the SDK purity grain test (`packages/MeeshySDK/CLAUDE.md`).
///
/// Prisme spirit: a single thin accent bar, no checkmark, hidden entirely when
/// nothing was watched. Sits below the play affordance; never intercepts taps.
struct MediaConsumptionProgressBar: View {
    let attachmentId: String
    let accentHex: String

    private var fraction: Double {
        MediaConsumptionStore.shared.fraction(for: attachmentId) ?? 0
    }

    var body: some View {
        let f = min(1, max(0, fraction))
        // Nothing meaningful watched → render nothing (no empty track baseline).
        if f > 0.01 {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule(style: .continuous)
                        .fill(Color.black.opacity(0.28))
                    Capsule(style: .continuous)
                        .fill(Color(hex: accentHex).opacity(0.85))
                        .frame(width: max(2, geo.size.width * CGFloat(f)))
                }
            }
            .frame(height: 3)
            .padding(.horizontal, 6)
            .padding(.bottom, 6)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }
}
