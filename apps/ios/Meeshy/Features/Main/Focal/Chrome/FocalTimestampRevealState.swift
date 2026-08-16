import Foundation
import SwiftUI
import MeeshyUI

/// Le révélé des heures pendant le défilement — successeur de la pilule
/// flottante « jour · heure » (`ScrollTimePillOverlay`).
///
/// **Pourquoi ce remplacement.** Le fil portait TROIS chromes temporels
/// concurrents pour une seule information : la pilule « Mercredi · 17:42 »
/// détachée en haut d'écran pendant le défilement, le sticker de jour
/// permanent (`MessageDayStickyOverlay`), et l'heure inscrite en dur sur
/// chaque rangée. La pilule était la moins utile des trois — elle datait un
/// point de l'écran, pas un message. L'heure PAR MESSAGE, elle, répond à la
/// vraie question (« quand celui-ci ? ») ; elle n'a simplement pas à occuper
/// la rangée en permanence.
///
/// **La loi de fenêtre est CONSERVÉE**, pas réécrite : `ScrollTimePillLaw`
/// (`Focal/Core/`, GELÉ) et sa constante `lingerMs = 900` continuent de
/// décider quand la fenêtre est ouverte. Seul le SUPPORT change — un booléen
/// que les rangées lisent, au lieu d'une capsule flottante. C'est très
/// exactement l'amendement A4 de la loi (« une loi, deux libellés ») étendu à
/// un troisième consommateur.
///
/// **Pourquoi un `ObservableObject` et pas un champ de `FocalRowInput`.**
/// Passer le révélé par l'entrée de rangée obligerait à `reconfigureItems`
/// toutes les cellules visibles au début ET à la fin de chaque geste — or le
/// contrat §4.6 réserve la reconfiguration à l'ARRÊT du défilement, et
/// seulement pour DEUX items (ancien et nouvel élu). Un objet observé par la
/// plus petite vue possible (`FocalRevealedTime`, une `Text` et rien d'autre)
/// n'invalide que cette `Text` : le gate `EquatableFocalRow` n'est jamais
/// traversé, la rangée entière n'est jamais réévaluée.
@MainActor
final class FocalTimestampRevealState: ObservableObject {
    /// `true` tant que la fenêtre de la loi est ouverte (défilement en cours
    /// ou dans les `lingerMs` qui suivent).
    @Published private(set) var isRevealed: Bool = false

    private var lawState: ScrollActivityState = ScrollTimePillLaw.initialState()
    private var lastKnownAt: Double = 0

    init() {}

    /// Reçoit un événement de la loi partagée — MILLISECONDES, comme
    /// `ScrollTimePillState` (même piège d'unité : injecter des secondes
    /// élargirait la fenêtre d'un facteur 1 000 et les heures ne
    /// s'effaceraient plus jamais).
    func note(_ event: ScrollActivityEvent) {
        lawState = ScrollTimePillLaw.reduce(state: lawState, event: event)
        switch event {
        case .scrolled(let at): lastKnownAt = at
        case .tick(let at): lastKnownAt = at
        }
        let next = ScrollTimePillLaw.isVisible(state: lawState, at: lastKnownAt)
        if next != isRevealed { isRevealed = next }
    }
}

/// L'heure d'une rangée NON focalisée : masquée au repos, révélée pendant le
/// défilement.
///
/// Seule vue du fil à observer `FocalTimestampRevealState` — et elle ne
/// contient qu'un `Text`. C'est la contrepartie de la règle « leaf views :
/// zéro `@ObservedObject` sur un singleton global » : l'observation est
/// permise ici précisément parce que la feuille est minuscule et que son
/// invalidation ne peut rien entraîner d'autre.
///
/// La rangée ÉLUE ne passe jamais par ici — elle affiche date ET heure en
/// permanence (`FocalRowInput.isFocused`), défilement ou pas.
struct FocalRevealedTime: View {
    let timeString: String
    let tint: Color
    @EnvironmentObject private var reveal: FocalTimestampRevealState

    var body: some View {
        Text(timeString)
            .font(MeeshyFont.relative(10.5))
            .foregroundColor(tint)
            .opacity(reveal.isRevealed ? 1 : 0)
            .animation(.easeInOut(duration: FocalMetrics.Pill.fadeDuration), value: reveal.isRevealed)
            .accessibilityHidden(true)
    }
}
