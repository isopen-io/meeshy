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
    /// The optimistic message's `createdAt`, only meaningful while
    /// `status == .sending`. Drives the reveal debounce in `SendingClockGlyph`
    /// so a send that round-trips in under 200ms never flashes a clock icon.
    var sendStartedAt: Date? = nil

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
            SendingClockGlyph(sendStartedAt: sendStartedAt, tint: tint)
        case .clock:
            Image(systemName: "clock")
                .font(MeeshyFont.relative(10))
                .foregroundColor(tint.opacity(0.7))
                .accessibilityLabel(Self.label(.sending))
        case .slow:
            // Spec 2026-07-08 (message-send-failure-retry-flow, règle 2) : un
            // message encore en re-tentative automatique affiche une horloge
            // SIMPLE — le badge exclamation lisait comme un aperçu d'échec
            // alors que l'échec est un état terminal (`.failed`) atteint
            // seulement après épuisement du budget outbox. La teinte warning
            // distingue toujours l'envoi lent/retenté d'un envoi frais.
            Image(systemName: "clock")
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
            Image(systemName: "checkmark").font(MeeshyFont.relative(size, weight: weight))
            Image(systemName: "checkmark").font(MeeshyFont.relative(size, weight: weight)).offset(x: 4)
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

    /// Debounces the "sending" clock glyph — spec §6.2 / backlog B.4: a send
    /// that round-trips in under 200ms must never flash a clock icon the user
    /// has no time to perceive. Hidden while under the threshold, revealed via
    /// a self-cancelling `.task` once the send genuinely lingers. Internal
    /// `@State` is safe here (leaf view, no singleton dependency) and is torn
    /// down automatically when `status` moves off `.sending` and this branch
    /// is no longer instantiated.
    struct SendingClockGlyph: View {
        let sendStartedAt: Date?
        let tint: Color

        static let revealDelay: TimeInterval = 0.2

        @State private var isRevealed: Bool

        init(sendStartedAt: Date?, tint: Color) {
            self.sendStartedAt = sendStartedAt
            self.tint = tint
            _isRevealed = State(initialValue: Self.shouldRevealImmediately(sendStartedAt: sendStartedAt, now: Date()))
        }

        /// Pure decision extracted for testability: does the clock show up
        /// right away (no start time, or the delay has already elapsed —
        /// e.g. the row scrolled into view late), or does it start hidden?
        static func shouldRevealImmediately(sendStartedAt: Date?, now: Date) -> Bool {
            guard let sendStartedAt else { return true }
            return now.timeIntervalSince(sendStartedAt) >= revealDelay
        }

        var body: some View {
            Group {
                if isRevealed {
                    Image(systemName: "clock")
                        .font(MeeshyFont.relative(10))
                        .foregroundColor(tint)
                        .accessibilityLabel(BubbleDeliveryCheck.label(.sending))
                } else {
                    EmptyView()
                }
            }
            .task {
                guard !isRevealed, let sendStartedAt else { return }
                let remaining = Self.revealDelay - Date().timeIntervalSince(sendStartedAt)
                if remaining > 0 {
                    try? await Task.sleep(nanoseconds: UInt64(remaining * 1_000_000_000))
                }
                guard !Task.isCancelled else { return }
                isRevealed = true
            }
        }
    }
}
