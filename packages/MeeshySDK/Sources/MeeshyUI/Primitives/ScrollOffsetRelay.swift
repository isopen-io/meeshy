import SwiftUI
import Combine

/// Canal d'offset de scroll qui découple le producteur (callback de scroll,
/// muté à chaque frame) des consommateurs (header collapsible, bande
/// accessoire) sans invalider l'écran entier.
///
/// Anti-pattern remplacé : un `@State CGFloat` sur la vue racine de l'écran —
/// chaque tick de scroll ré-exécutait le body COMPLET (liste de N lignes,
/// reconstruction des actions par ligne, diff Equatable) à ~120 Hz. Sur la
/// liste de conversations d'un compte à ~100 conversations, ce churn
/// nourrissait la famine du main thread derrière les kills
/// `0x8BADF00D` scene-update (device 2026-06-10 → 2026-07-05).
///
/// Usage : la vue racine détient l'instance dans un `@State` (référence
/// stable, PAS `@StateObject` — le but est justement que la racine ne
/// s'abonne pas) et écrit `relay.offset` depuis son callback de scroll.
/// SEULE la sous-vue header l'observe via `@ObservedObject` et se re-rend
/// à chaque tick.
public final class ScrollOffsetRelay: ObservableObject {
    @Published public var offset: CGFloat = 0

    public init() {}
}
