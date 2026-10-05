import SwiftUI

/// L'effet Focal d'un message long DÉPLIÉ sur la peau BULLE (#8147).
///
/// La bulle reçoit l'état de dépliage par l'environnement — sa chaîne
/// `ThemedMessageBubble` → `BubbleStandardLayout` → `BubbleExpandableText`
/// n'a pas à le transporter — et, tant qu'elle est dépliée, se pose sur le
/// MÊME bloc de verre que la rangée plate (`FocalGlassBlock`) : un seul
/// dessin de mise en avant pour tous les modes. La loupe et l'atténuation
/// des voisins sont posées par l'hôte, sur les layers.
extension View {
    func longMessageFocus(_ expansion: LongMessageExpansion) -> some View {
        environment(\.longMessageExpansion, expansion)
            .backgroundPreferenceValue(LongMessageBubbleBoundsKey.self) { bubble in
                if expansion.isExpanded {
                    GeometryReader { proxy in
                        let frame = LongMessageExpansionLaw.glassFrame(
                            bubble: bubble.map { proxy[$0] },
                            row: CGRect(origin: .zero, size: proxy.size)
                        )
                        FocalGlassBlock()
                            .frame(width: frame.width, height: frame.height)
                            .offset(x: frame.minX, y: frame.minY)
                    }
                }
            }
    }
}

/// Le cadre de la BULLE, remonté par son fond (`BubbleBackground`) jusqu'à
/// `longMessageFocus` : le verre du déplié l'épouse au lieu de couvrir la
/// rangée entière (#8161). Une préférence traverse le `clipShape` de la
/// bulle, qu'un fond posé sous elle ne pourrait pas déborder ; sans bulle
/// (Rivière, rangée plate), la valeur reste `nil` et le verre retombe sur
/// la rangée.
struct LongMessageBubbleBoundsKey: PreferenceKey {
    static let defaultValue: Anchor<CGRect>? = nil

    static func reduce(value: inout Anchor<CGRect>?, nextValue: () -> Anchor<CGRect>?) {
        value = value ?? nextValue()
    }
}

/// La LOUPE du déplié pour un hôte SwiftUI (la Rivière) — la même échelle,
/// écrêtée par la même loi (`FocalScrollPerspective.loupeScale`), que celle
/// que le fil UIKit pose sur ses layers. La taille n'est mesurée que sur la
/// vue active : les autres ne paient rien.
extension View {
    func longMessageLoupe(isActive: Bool) -> some View {
        modifier(LongMessageLoupe(isActive: isActive))
    }
}

private struct LongMessageLoupe: ViewModifier {
    let isActive: Bool
    @State private var size: CGSize = .zero

    func body(content: Content) -> some View {
        content
            .background {
                if isActive {
                    GeometryReader { proxy in
                        Color.clear
                            .onAppear { size = proxy.size }
                            .onChange(of: proxy.size) { newSize in size = newSize }
                    }
                }
            }
            .scaleEffect(FocalScrollPerspective.loupeScale(isFocused: isActive, reduceMotion: false, size: size))
    }
}
