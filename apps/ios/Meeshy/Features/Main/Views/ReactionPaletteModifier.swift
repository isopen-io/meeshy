import SwiftUI
import MeeshyUI

/// **Le geste qui ouvre la palette, écrit UNE fois pour toutes les surfaces.**
///
/// Le détail d'un post et le lecteur de réels ont le même besoin — appui bref
/// = ❤️, appui long = les six émojis — et deux fichiers **déjà hors budget**.
/// Écrire le geste chez chacun coûtait vingt lignes par surface et deux
/// occasions de diverger : l'un aurait gagné l'action VoiceOver, l'autre le
/// retour haptique, et rien n'aurait rougi.
///
/// Ce que le modificateur porte : le geste, son équivalent VoiceOver — un
/// appui long n'est pas accessible sans lui —, et le placement. Ce qu'il ne
/// porte pas : l'ENVOI. Chaque surface a sa réconciliation (le post a un
/// compteur optimiste, le réel un `heartInFlight`), donc chacune passe son
/// propre rappel.
extension View {
    func reactionPalette(isPresented: Binding<Bool>,
                         isDark: Bool,
                         anchor: Alignment = .trailing,
                         offsetX: CGFloat = 0,
                         offsetY: CGFloat = 0,
                         onPick: @escaping (String) -> Void) -> some View {
        self
            .onLongPressGesture {
                HapticFeedback.medium()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                    isPresented.wrappedValue = true
                }
            }
            // Un appui long est INVISIBLE pour VoiceOver : sans cette action
            // nommée, la palette n'existe pas pour qui navigue au lecteur
            // d'écran — la capacité serait réservée à ceux qui la découvrent.
            .accessibilityAction(named: Text(String(localized: "reactions.more",
                                                    defaultValue: "Plus de réactions",
                                                    bundle: .main))) {
                isPresented.wrappedValue = true
            }
            .overlay(alignment: anchor) {
                PostReactionPalette(isPresented: isPresented,
                                    onPick: onPick,
                                    style: isDark ? .dark : .light)
                    .offset(x: offsetX, y: offsetY)
            }
    }
}
