import SwiftUI
import MeeshySDK
import MeeshyUI

/// Fond de la bulle texte. Stateless — Equatable synthétisé.
/// Was: ThemedMessageBubble.bubbleBackground (lines 1460-1493).
struct BubbleBackground: View, Equatable {
    let isMe: Bool
    let accentHex: String
    let isDark: Bool

    var body: some View {
        let other = Color(hex: accentHex)
        RoundedRectangle(cornerRadius: 18)
            .fill(
                isMe ?
                LinearGradient(
                    colors: [MeeshyColors.brandPrimary, MeeshyColors.brandDeep],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ) :
                LinearGradient(
                    colors: [
                        other.opacity(isDark ? 0.35 : 0.25),
                        other.opacity(isDark ? 0.20 : 0.15)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .stroke(
                        isMe ?
                        LinearGradient(colors: [Color.clear, Color.clear], startPoint: .leading, endPoint: .trailing) :
                        LinearGradient(
                            colors: [other.opacity(0.5), other.opacity(0.2)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: isMe ? 0 : 1
                    )
            )
    }
}
