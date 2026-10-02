import SwiftUI

/// #8989 — la durée d'un appel se redessine ELLE-MÊME, une fois par seconde.
///
/// `CallManager.callDuration` n'est plus publié : publié à 1 Hz, il faisait
/// recalculer chaque seconde tout l'écran d'appel, la pilule flottante et
/// l'en-tête de la conversation, qui observent le gestionnaire entier. Seul ce
/// qu'enveloppe l'horloge relit la durée.
struct CallDurationClock<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            content()
        }
    }
}
