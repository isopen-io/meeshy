import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Edited Indicator (was: ThemedMessageBubble.editedIndicator)

/// Badge "modifie" / "Enregistrement…" affiche en overlay top-leading des
/// bulles textuelles. Stateless — Equatable synthetise. `isDark` est porte
/// par les inputs pour declencher un rebuild quand le theme bascule, le
/// reste des couleurs venant de `ThemeManager.shared` lu dans body.
struct BubbleEditedIndicator: View, Equatable {
    let isMe: Bool
    let isSaving: Bool
    let hasEditHistory: Bool
    let isDark: Bool

    var body: some View {
        let theme = ThemeManager.shared
        let metaColor: Color = isMe
            ? Color.white.opacity(0.6)
            : theme.textSecondary.opacity(0.5)

        return HStack(spacing: 3) {
            if isSaving {
                // Saving feedback: arrow-spin glyph instead of pencil so the
                // user sees their edit is still propagating to the server.
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: 8, weight: .semibold))
                    .rotationEffect(.degrees(isSaving ? 360 : 0))
                    .animation(.linear(duration: 1).repeatForever(autoreverses: false), value: isSaving)
                Text("Enregistrement…")
                    .font(.system(size: 9, weight: .medium))
                    .italic()
            } else {
                Image(systemName: "pencil")
                    .font(.system(size: 8, weight: .semibold))
                Text("modifie")
                    .font(.system(size: 9, weight: .medium))
                    .italic()
                if hasEditHistory {
                    // Dot affordance hinting the detail sheet shows history.
                    Circle()
                        .fill(metaColor)
                        .frame(width: 3, height: 3)
                        .opacity(0.7)
                }
            }
        }
        .foregroundColor(metaColor)
    }
}

// MARK: - Pinned Indicator (was: ThemedMessageBubble.pinnedIndicator)

/// Badge "Epingle" affiche au dessus des bulles epinglees. Purement stateless —
/// aucun input requis car `MeeshyColors.pinnedBlue` est theme-invariant. La
/// conformance `Equatable` synthetisee sur un struct sans champs renvoie
/// toujours `true`, ce qui est exactement le comportement souhaite pour
/// preserver le fast-path `.equatable()`.
struct BubblePinnedIndicator: View, Equatable {
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "pin.fill")
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(MeeshyColors.pinnedBlue)
                .rotationEffect(.degrees(45))

            Text("Epingle")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(MeeshyColors.pinnedBlue)
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Message epingle")
    }
}

// MARK: - Forwarded Indicator (was: ThemedMessageBubble.forwardedIndicator)

/// Badge "Transfere" affiche au dessus des bulles transferees. Les inputs
/// sont les champs primitifs extraits de `ForwardReference` afin que la vue
/// reste `Equatable` sans dependre du type SDK (qui n'est pas Equatable).
struct BubbleForwardedIndicator: View, Equatable {
    let isMe: Bool
    let isDark: Bool
    let senderName: String?
    let conversationName: String?

    var body: some View {
        let theme = ThemeManager.shared
        return HStack(spacing: 4) {
            Image(systemName: "arrowshape.turn.up.right.fill")
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(theme.textMuted)

            if let senderName {
                if let conversationName {
                    Text("Transf. de \(senderName) \u{2022} \(conversationName)")
                        .font(.system(size: 10))
                        .italic()
                        .foregroundColor(theme.textMuted)
                        .lineLimit(1)
                } else {
                    Text("Transf. de \(senderName)")
                        .font(.system(size: 10))
                        .italic()
                        .foregroundColor(theme.textMuted)
                        .lineLimit(1)
                }
            } else {
                Text("Transfere")
                    .font(.system(size: 10))
                    .italic()
                    .foregroundColor(theme.textMuted)
            }
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 2)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Delivery Offline/Retry Badge (Phase 4 Task 4.6)

/// Hourglass + retry control surfaced on outgoing bubbles when the user is
/// offline or the outbox flusher has exhausted its retry budget. Stateless +
/// Equatable so it never re-evaluates unless its primitive inputs change.
///
/// Visibility matrix (only rendered when `isMe == true`):
///   - `.sending` + `!isOnline` -> hourglass glyph (offline-pending)
///   - `.failed`                -> tap-to-retry button (arrow.clockwise)
///   - everything else          -> `EmptyView` (no overhead in the bubble row)
struct BubbleDeliveryBadge: View, Equatable {
    let status: MeeshyMessage.DeliveryStatus
    let isMe: Bool
    let isOnline: Bool
    let onRetry: () -> Void

    static func == (lhs: BubbleDeliveryBadge, rhs: BubbleDeliveryBadge) -> Bool {
        lhs.status == rhs.status &&
        lhs.isMe == rhs.isMe &&
        lhs.isOnline == rhs.isOnline
    }

    var body: some View {
        if !isMe {
            EmptyView()
        } else {
            switch status {
            case .sending where !isOnline:
                Image(systemName: "hourglass")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(MeeshyColors.warning)
                    .accessibilityLabel("Pending offline")
            case .failed:
                Button(action: {
                    HapticFeedback.light()
                    onRetry()
                }) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(MeeshyColors.error)
                        .padding(4)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Retry sending")
                .accessibilityHint("Resends this message")
            default:
                EmptyView()
            }
        }
    }
}

// MARK: - Ephemeral Badge (was: ThemedMessageBubble.ephemeralTimerOverlay)

/// Capsule "flame + timer" affichee sous les messages ephemeres pour
/// rappeler le compte a rebours avant expiration.
struct BubbleEphemeralBadge: View, Equatable {
    let timerText: String
    let isDark: Bool

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "flame.fill")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(Color(hex: "FF6B6B"))

            Text(timerText)
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundColor(Color(hex: "FF6B6B"))
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(Color(hex: "FF6B6B").opacity(isDark ? 0.15 : 0.1))
                .overlay(
                    Capsule()
                        .stroke(Color(hex: "FF6B6B").opacity(0.3), lineWidth: 0.5)
                )
        )
        .accessibilityLabel("Message ephemere, expire dans \(timerText)")
    }
}
