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
        // Simplification forte : fonds PLATS (couleur unie) au lieu de dégradés.
        // Un LinearGradient + un overlay stroke dégradé par bulle, c'est 2 passes
        // offscreen par cellule au scroll — un tueur de FPS. Un `.fill(Color)` uni
        // est composité en une passe. `isMe` reste sur l'indigo de marque (indigo500),
        // les reçus sur une teinte unie de la couleur d'accent de la conversation,
        // avec un hairline solide discret pour rester lisibles sur le fond.
        let other = Color(hex: accentHex)
        RoundedRectangle(cornerRadius: 18)
            .fill(isMe ? MeeshyColors.brandPrimary : other.opacity(isDark ? 0.28 : 0.16))
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .strokeBorder(
                        isMe ? Color.clear : other.opacity(isDark ? 0.34 : 0.26),
                        lineWidth: isMe ? 0 : 1
                    )
            )
    }
}
