import SwiftUI

/// Remet à la bulle l'état de dépliage d'un message long (#8147) par
/// l'environnement : sa chaîne `ThemedMessageBubble` → `BubbleStandardLayout`
/// → `BubbleExpandableText` n'a pas à le transporter.
///
/// Rien d'autre n'est posé (#16463) : le déplié est une bulle ordinaire —
/// ni bloc de verre, ni loupe, ni voisins atténués.
extension View {
    func longMessageExpansion(_ expansion: LongMessageExpansion) -> some View {
        environment(\.longMessageExpansion, expansion)
    }
}
