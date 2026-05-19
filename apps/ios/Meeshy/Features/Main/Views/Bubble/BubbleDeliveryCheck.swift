import SwiftUI
import MeeshySDK
import MeeshyUI

/// The single delivery-status glyph used by every bubble footer. Covers all
/// `DeliveryStatus` cases plus the offline-pending hourglass. Replaces
/// `BubbleMediaDeliveryCheckmark` and the per-site re-implementations.
struct BubbleDeliveryCheck: View, Equatable {
    let status: MeeshyMessage.DeliveryStatus
    /// When the device is offline and the send is still in flight, an
    /// hourglass replaces the clock.
    let isOffline: Bool
    /// Primary glyph colour (theme-aware on a `.row`, white on an `.overlay`).
    let tint: Color
    /// `.read` glyph colour — always a theme-adaptive indigo (never white,
    /// never bold): indigo400 in dark mode / on the dark overlay capsule,
    /// indigo600 in light mode. Computed by the caller.
    let readTint: Color

    private var isInFlight: Bool {
        switch status {
        case .sending, .clock, .slow: return true
        default: return false
        }
    }

    var body: some View {
        if isOffline, isInFlight {
            Image(systemName: "hourglass")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(MeeshyColors.warning)
                .accessibilityLabel("En attente hors-ligne")
        } else {
            glyph
        }
    }

    @ViewBuilder
    private var glyph: some View {
        switch status {
        case .invisible:
            EmptyView()
        case .sending:
            Image(systemName: "clock")
                .font(.system(size: 10))
                .foregroundColor(tint)
        case .clock:
            Image(systemName: "clock")
                .font(.system(size: 10))
                .foregroundColor(tint.opacity(0.7))
        case .slow:
            Image(systemName: "clock.badge.exclamationmark")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(MeeshyColors.warning)
        case .sent:
            Image(systemName: "checkmark")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(tint)
        case .delivered:
            doubleCheck(weight: .regular, size: 10, color: tint, width: 16)
        case .read:
            doubleCheck(weight: .regular, size: 11, color: readTint, width: 17)
                .accessibilityLabel("Lu")
        case .failed:
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(MeeshyColors.error)
        }
    }

    private func doubleCheck(weight: Font.Weight, size: CGFloat, color: Color, width: CGFloat) -> some View {
        ZStack(alignment: .leading) {
            Image(systemName: "checkmark").font(.system(size: size, weight: weight))
            Image(systemName: "checkmark").font(.system(size: size, weight: weight)).offset(x: 4)
        }
        .foregroundColor(color)
        .frame(width: width)
    }
}
