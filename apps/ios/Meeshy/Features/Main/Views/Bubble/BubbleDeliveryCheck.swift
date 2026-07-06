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
                .font(MeeshyFont.relative(10, weight: .semibold))
                .foregroundColor(MeeshyColors.warning)
                .accessibilityLabel(Self.label(.offlinePending))
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
                .font(MeeshyFont.relative(10))
                .foregroundColor(tint)
                .accessibilityLabel(Self.label(.sending))
        case .clock:
            Image(systemName: "clock")
                .font(MeeshyFont.relative(10))
                .foregroundColor(tint.opacity(0.7))
                .accessibilityLabel(Self.label(.sending))
        case .slow:
            Image(systemName: "clock.badge.exclamationmark")
                .font(MeeshyFont.relative(10, weight: .semibold))
                .foregroundColor(MeeshyColors.warning)
                .accessibilityLabel(Self.label(.slow))
        case .sent:
            Image(systemName: "checkmark")
                .font(MeeshyFont.relative(10, weight: .semibold))
                .foregroundColor(tint)
                .accessibilityLabel(Self.label(.sent))
        case .delivered:
            doubleCheck(weight: .regular, size: 10, color: tint, width: 16)
                .accessibilityLabel(Self.label(.delivered))
        case .read:
            doubleCheck(weight: .regular, size: 11, color: readTint, width: 17)
                .accessibilityLabel(Self.label(.read))
        case .failed:
            Image(systemName: "exclamationmark.circle.fill")
                .font(MeeshyFont.relative(10, weight: .bold))
                .foregroundColor(MeeshyColors.error)
                .accessibilityLabel(Self.label(.failed))
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

    // MARK: - VoiceOver labels

    /// The delivery status was previously conveyed by glyph shape + colour
    /// alone — sent / delivered / read are a single / grey-double / indigo-double
    /// checkmark that VoiceOver and colour-blind users cannot tell apart. Every
    /// state now gets a distinct spoken label. Exposed as a pure `static` helper
    /// for testability.
    enum DeliveryLabel {
        case offlinePending, sending, slow, sent, delivered, read, failed
    }

    static func label(_ label: DeliveryLabel) -> String {
        switch label {
        case .offlinePending:
            return String(localized: "bubble.delivery.offlinePending", defaultValue: "En attente, hors-ligne", bundle: .main)
        case .sending:
            return String(localized: "bubble.delivery.sending", defaultValue: "Envoi en cours", bundle: .main)
        case .slow:
            return String(localized: "bubble.delivery.slow", defaultValue: "Envoi lent", bundle: .main)
        case .sent:
            return String(localized: "bubble.delivery.sent", defaultValue: "Envoyé", bundle: .main)
        case .delivered:
            return String(localized: "bubble.delivery.delivered", defaultValue: "Distribué", bundle: .main)
        case .read:
            return String(localized: "bubble.delivery.read", defaultValue: "Lu", bundle: .main)
        case .failed:
            return String(localized: "bubble.delivery.failed", defaultValue: "Échec de l'envoi", bundle: .main)
        }
    }
}
