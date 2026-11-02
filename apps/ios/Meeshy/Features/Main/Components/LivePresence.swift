import SwiftUI

/// Le SEUL mécanisme par lequel une pastille de présence lue dans
/// `PresenceManager` se repeint (#11412) — sur `user:status`, `presence:snapshot`,
/// la frappe, la coupure du socket ET le passage d'un seuil 1/3/5 que rien
/// d'autre n'annonce.
///
/// Une pastille se résout pendant le `body` de l'hôte (`knownPresenceState`,
/// `resolvedState`, `presenceState(for:served:)`) : sans un `body` réévalué, elle
/// reste figée à l'état de son dernier rendu. Envelopper l'avatar dans
/// `LivePresence { … }` déplace cette résolution dans le `body` de CETTE vue, la
/// seule à observer `PresenceRefreshSignal` (débouncé, jamais `PresenceManager`
/// lui-même) : seul l'avatar se repeint, ni la carte ni la rangée qui le portent.
struct LivePresence<Content: View>: View {
    @ObservedObject private var presencePulse: PresenceRefreshSignal
    let content: () -> Content

    init(presencePulse: PresenceRefreshSignal = PresenceManager.shared.refreshSignal,
         @ViewBuilder content: @escaping () -> Content) {
        self.presencePulse = presencePulse
        self.content = content
    }

    var body: some View {
        content()
    }
}
