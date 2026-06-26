import SwiftUI

// MARK: - FeedbackToast Type

public enum FeedbackToastType {
    case success
    case error
    case info

    public var color: Color {
        switch self {
        case .success: return MeeshyColors.success
        case .error: return MeeshyColors.error
        case .info: return MeeshyColors.indigo400
        }
    }

    public var defaultIcon: String {
        switch self {
        case .success: return "checkmark.circle.fill"
        case .error: return "xmark.circle.fill"
        case .info: return "info.circle.fill"
        }
    }
}

// MARK: - FeedbackToast Data

public struct FeedbackToast: Equatable {
    public let id: UUID
    public let message: String
    public let type: FeedbackToastType
    public let icon: String
    public let isTappable: Bool

    public init(message: String, type: FeedbackToastType, icon: String? = nil, isTappable: Bool = false) {
        self.id = UUID()
        self.message = message
        self.type = type
        self.icon = icon ?? type.defaultIcon
        self.isTappable = isTappable
    }

    public static func == (lhs: FeedbackToast, rhs: FeedbackToast) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - FeedbackToast View

public struct FeedbackToastView: View {
    let toast: FeedbackToast

    public init(toast: FeedbackToast) {
        self.toast = toast
    }

    public var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: toast.icon)
                .font(.system(size: MeeshyFont.headlineSize, weight: .semibold))
                .foregroundColor(.white)

            Text(toast.message)
                .font(.system(size: MeeshyFont.subheadSize, weight: .medium))
                .foregroundColor(.white)
                .lineLimit(2)

            if toast.isTappable {
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white.opacity(0.7))
            }
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.vertical, MeeshySpacing.md)
        .background(
            Capsule()
                .fill(toast.type.color.opacity(0.9))
                .shadow(
                    color: toast.type.color.opacity(0.3),
                    radius: MeeshyShadow.medium.radius,
                    y: MeeshyShadow.medium.y
                )
        )
        // Collapse the icon + message (+ chevron) into one VoiceOver element so
        // the toast reads as a single coherent string. The decorative status
        // icon and chevron are dropped via `.ignore`; the spoken announcement
        // itself is posted by `FeedbackToastManager` (see `AdaptiveAccessibility`).
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(toast.message)
        .accessibilityAddTraits(toast.isTappable ? .isButton : [])
    }
}

// MARK: - Notch Reveal

/// Geometry of the "emerge from the notch" reveal used to present the in-app
/// FeedbackToast (action feedback: "post sent", "changes saved"…).
///
/// The toast starts collapsed and slightly pulled up toward the Dynamic Island
/// / notch, then grows down into its resting position; on dismissal it retracts
/// back up toward the notch and fades — a Dynamic-Island-style "pop".
///
/// Constants are `nonisolated` so the (non-`@MainActor`) tests and the
/// `AnyTransition` builder read them under MeeshyUI's MainActor default
/// isolation. `notchOffset` mirrors the toast's top padding (`MeeshySpacing.xxl`
/// = 24) so the collapsed origin lands at the top of the safe area — just under
/// the notch — on every device, with or without a physical notch.
public enum FeedbackToastReveal {
    /// Scale of the collapsed (entering / leaving) state. `< 1` so the toast grows.
    public nonisolated static let collapsedScale: CGFloat = 0.2
    /// Scale anchor: top-center, where the notch / Dynamic Island sits.
    public nonisolated static let anchor: UnitPoint = .top
    /// Upward pull (points), applied as `-notchOffset` on the Y axis, lifting the
    /// collapsed toast toward the notch. Mirrors the toast's top padding.
    public nonisolated static let notchOffset: CGFloat = 24
}

public extension AnyTransition {
    /// Dynamic-Island-style reveal for the in-app FeedbackToast: the toast
    /// emerges from under the notch, grows into place, then retracts back toward
    /// the notch on dismissal. Pair with `.meeshyAnimation(.springBouncy, value:)`
    /// at the call site so the motion is suppressed under Reduce Motion.
    nonisolated static var feedbackToastReveal: AnyTransition {
        .scale(scale: FeedbackToastReveal.collapsedScale, anchor: FeedbackToastReveal.anchor)
            .combined(with: .opacity)
            .combined(with: .offset(y: -FeedbackToastReveal.notchOffset))
    }
}
