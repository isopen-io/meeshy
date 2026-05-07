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
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(ThemeManager.shared.textMuted)
                Text("Message supprime")
                    .font(.system(size: 13, weight: .regular))
                    .italic()
                    .foregroundColor(ThemeManager.shared.textMuted)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(
                Capsule()
                    .fill(isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                    .overlay(
                        Capsule()
                            .stroke(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05), lineWidth: 0.5)
                    )
            )
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Message supprime")

            if !isMe { Spacer(minLength: 50) }
        }
        .padding(.horizontal, 16)
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
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.orange)
                Text("Vu et effacé")
                    .font(.system(size: 13, weight: .regular))
                    .italic()
                    .foregroundColor(ThemeManager.shared.textMuted)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(
                Capsule()
                    .fill(Color.orange.opacity(0.08))
                    .overlay(
                        Capsule()
                            .stroke(Color.orange.opacity(0.15), lineWidth: 0.5)
                    )
            )
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Message vu et effacé")

            if !isMe { Spacer(minLength: 50) }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 2)
    }
}
