import SwiftUI
import MeeshySDK
import MeeshyUI

/// Fond de la bulle texte. Stateless — Equatable synthétisé.
/// Was: ThemedMessageBubble.bubbleBackground (lines 1460-1493).
struct BubbleBackground: View, Equatable {
    let isMe: Bool
    let accentHex: String
    let isDark: Bool
    @Environment(\.bubbleSkin) private var skin

    static func == (lhs: BubbleBackground, rhs: BubbleBackground) -> Bool {
        lhs.isMe == rhs.isMe && lhs.accentHex == rhs.accentHex && lhs.isDark == rhs.isDark
    }

    var body: some View {
        // Simplification forte : fonds PLATS (couleur unie) au lieu de dégradés.
        // Un LinearGradient + un overlay stroke dégradé par bulle, c'est 2 passes
        // offscreen par cellule au scroll — un tueur de FPS. Un `.fill(Color)` uni
        // est composité en une passe. `isMe` prend la peau de la conversation
        // (indigo de marque, ou l'accent personnel choisi — #10753) ; les reçus une
        // teinte OPAQUE de l'accent mêlé à la surface, jamais transparente sur un
        // fond photo ou motif, avec un hairline solide discret.
        let other = Color(hex: accentHex)
        RoundedRectangle(cornerRadius: 18)
            .fill(isMe ? skin.sentFill : Color(hex: BubbleSkin.receivedFillHex(accentHex: accentHex, isDark: isDark)))
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .strokeBorder(
                        isMe ? Color.clear : other.opacity(isDark ? 0.34 : 0.26),
                        lineWidth: isMe ? 0 : 1
                    )
            )
            .anchorPreference(key: LongMessageBubbleBoundsKey.self, value: .bounds) { $0 }
    }
}
