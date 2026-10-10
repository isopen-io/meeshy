import SwiftUI

// MARK: - Visible, ou sorti de la zone d'écran (#9381)
//
// Une animation qui boucle (le vacillement de la Flamme) doit s'arrêter quand sa
// vue n'est plus à l'écran. `onDisappear` ne le dit PAS dans un `ScrollView` non
// paresseux : tout le contenu est instancié d'emblée, rien n'« apparaît » ni ne
// « disparaît » au défilement — le vacillement tournait donc pour rien, hors champ.
//
// Deux chemins, comme le reste du dépôt (`trackScrollContentOffset`) :
//   · iOS 18+  : `onScrollVisibilityChange`, la mesure native du défilement ;
//   · iOS 16–17 : la frame globale comparée à la fenêtre, lue par préférence —
//     le lecteur par préférence y re-déclenche encore au défilement (il ne le fait
//     plus à partir d'iOS 18, d'où le premier chemin).
// Hors d'un `ScrollView`, le premier chemin ne dit rien : la vue reste « visible ».

enum GameOnScreen {
    /// La vue est à l'écran dès qu'un seul point de sa frame rencontre la fenêtre.
    static func isVisible(frame: CGRect, window: CGRect) -> Bool {
        frame.intersects(window)
    }
}

private struct GameOnScreenKey: PreferenceKey {
    static let defaultValue = true
    static func reduce(value: inout Bool, nextValue: () -> Bool) {
        value = nextValue()
    }
}

/// Porte la bascule de disponibilité SANS l'exposer au type de l'appelant (même
/// motif que `AdaptiveOnChangeModifier`).
private struct GameOnScreenModifier: ViewModifier {
    let onChange: (Bool) -> Void

    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content.onScrollVisibilityChange(threshold: 0.01) { onChange($0) }
        } else {
            content
                .background(
                    GeometryReader { proxy in
                        Color.clear.preference(
                            key: GameOnScreenKey.self,
                            value: GameOnScreen.isVisible(
                                frame: proxy.frame(in: .global),
                                window: CGRect(origin: .zero, size: WindowMetrics.windowSize)
                            )
                        )
                    }
                )
                .onPreferenceChange(GameOnScreenKey.self) { onChange($0) }
        }
    }
}

extension View {
    /// Dit à `onChange` quand la vue entre dans la zone visible ou en sort.
    func gameOnScreen(_ onChange: @escaping (Bool) -> Void) -> some View {
        modifier(GameOnScreenModifier(onChange: onChange))
    }
}
