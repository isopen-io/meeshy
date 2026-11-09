import SwiftUI

/// L'emoji choisi pour une communauté, posé en coin de sa bannière : le même
/// geste dans l'aperçu de la création et dans le détail, pour que ce qu'on a
/// vu en créant soit ce qu'on retrouve (#6380). Décoratif : le nom de la
/// communauté est déjà lu à côté.
struct CommunityEmojiMark: View {
    let emoji: String

    var body: some View {
        Text(emoji)
            .font(.system(size: 44))
            .rotationEffect(.degrees(-8))
            .offset(x: 8, y: 6)
            .opacity(0.85)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            .padding(.trailing, MeeshySpacing.mdPlus)
            .padding(.top, MeeshySpacing.md)
            .accessibilityHidden(true)
            .allowsHitTesting(false)
    }
}
