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

    /// **Le GESTE, posé sur la cible** — le bouton que l'utilisateur presse.
    ///
    /// Séparé du cadre pour une raison mesurée au simulateur : un overlay
    /// ancré à un bouton de 28 pt comprime la rangée d'émojis, qui s'ouvre
    /// alors en pilule vide. **La cible d'un geste et le cadre de ce qu'il
    /// ouvre ne sont pas le même objet** — le premier doit être petit et
    /// précis, le second large et libre.
    func reactionPaletteTrigger(isPresented: Binding<Bool>) -> some View {
        self
            // `simultaneousGesture` : posé sur un `Button`, un
            // `.onLongPressGesture` ne gagne jamais — le bouton consomme le
            // geste et déclenche son action. Mesuré : l'appui long posait un
            // like au lieu d'ouvrir la palette.
            .simultaneousGesture(
                LongPressGesture(minimumDuration: 0.45).onEnded { _ in
                    HapticFeedback.medium()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        isPresented.wrappedValue = true
                    }
                }
            )
            // Un appui long est INVISIBLE pour VoiceOver : sans action nommée,
            // la palette n'existerait que pour qui la devine.
            .accessibilityAction(named: Text(String(localized: "reactions.more",
                                                    defaultValue: "Plus de réactions",
                                                    bundle: .main))) {
                isPresented.wrappedValue = true
            }
    }

    /// **Le CADRE, posé sur l'hôte** — la barre entière, qui a la largeur.
    func reactionPaletteFrame(isPresented: Binding<Bool>,
                              isDark: Bool,
                              anchor: Alignment = .bottomLeading,
                              offsetX: CGFloat = 0,
                              offsetY: CGFloat = 0,
                              onPick: @escaping (String) -> Void) -> some View {
        overlay(alignment: anchor) {
            PostReactionPalette(isPresented: isPresented,
                                onPick: onPick,
                                style: isDark ? .dark : .light)
                .offset(x: offsetX, y: offsetY)
        }
    }

}
