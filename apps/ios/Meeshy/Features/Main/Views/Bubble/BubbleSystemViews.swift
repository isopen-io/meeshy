import SwiftUI
import MeeshyUI

/// Vues "systeme" affichees a la place du contenu d'une bulle :
/// - `BubbleDeletedView` quand le message a ete supprime
/// - `BubbleBurnedView` quand un message ephemere a ete vu et efface
///
/// Was: ThemedMessageBubble.deletedMessageView (lignes 363-393) +
/// ThemedMessageBubble.burnedMessageView (lignes 395-425).
///
/// Stateless : reposent uniquement sur `isMe` et `isDark`. Equatable trivial.
struct BubbleDeletedView: View, Equatable {
    let isMe: Bool
    let isDark: Bool

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if isMe { Spacer(minLength: 50) }

            HStack(spacing: 6) {
                Image(systemName: "nosign")
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .foregroundColor(ThemeManager.shared.textMuted)
                Text(String(localized: "bubble.system.deleted", defaultValue: "Message deleted", bundle: .main))
                    .font(MeeshyFont.relative(13, weight: .regular))
                    .italic()
                    .foregroundColor(ThemeManager.shared.textMuted)
            }
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.sm)
            .background(
                Capsule()
                    .fill(isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                    .overlay(
                        Capsule()
                            .stroke(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05), lineWidth: 0.5)
                    )
            )
            .accessibilityElement(children: .combine)
            .accessibilityLabel(String(localized: "bubble.system.deleted", defaultValue: "Message deleted", bundle: .main))

            if !isMe { Spacer(minLength: 50) }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, 2)
    }
}

struct BubbleBurnedView: View, Equatable {
    let isMe: Bool
    let isDark: Bool

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if isMe { Spacer(minLength: 50) }

            HStack(spacing: 6) {
                Image(systemName: "flame.fill")
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .foregroundColor(MeeshyColors.warning)
                Text(String(localized: "bubble.system.burned", defaultValue: "Seen and deleted", bundle: .main))
                    .font(MeeshyFont.relative(13, weight: .regular))
                    .italic()
                    .foregroundColor(ThemeManager.shared.textMuted)
            }
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.sm)
            .background(
                Capsule()
                    .fill(MeeshyColors.warning.opacity(0.08))
                    .overlay(
                        Capsule()
                            .stroke(MeeshyColors.warning.opacity(0.15), lineWidth: 0.5)
                    )
            )
            .accessibilityElement(children: .combine)
            .accessibilityLabel(String(localized: "bubble.system.burned.a11y", defaultValue: "Message seen and deleted", bundle: .main))

            if !isMe { Spacer(minLength: 50) }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, 2)
    }
}

/// Centered system notice rendered in place of a chat bubble — used for
/// call-summary messages ("Appel vidéo · 04:32", "Appel audio manqué",
/// "Appel refusé") posted by the gateway when a call ends. Unlike
/// `BubbleDeletedView`/`BubbleBurnedView` (which still align with the sender
/// side), a system notice is always centered with no avatar, matching the
/// iMessage/WhatsApp call-log treatment.
///
/// Stateless: depends only on `text` + `isDark`. The leading phone glyph
/// reflects that calls are today's sole producer of system messages; the
/// content string itself carries the localized label from the gateway.
struct BubbleSystemNoticeView: View, Equatable {
    let text: String
    let isDark: Bool

    var body: some View {
        HStack(spacing: 0) {
            Spacer(minLength: 24)

            HStack(spacing: 6) {
                Image(systemName: "phone.fill")
                    .font(MeeshyFont.relative(11, weight: .semibold))
                    .foregroundColor(ThemeManager.shared.textMuted)
                Text(text)
                    .font(MeeshyFont.relative(12.5, weight: .medium))
                    .foregroundColor(ThemeManager.shared.textMuted)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, 7)
            .background(
                Capsule()
                    .fill(isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
                    .overlay(
                        Capsule()
                            .stroke(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05), lineWidth: 0.5)
                    )
            )
            .accessibilityElement(children: .combine)
            .accessibilityLabel(text)

            Spacer(minLength: 24)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, 3)
    }
}
