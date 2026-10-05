import SwiftUI

/// **Les entrées d'un rail sont CONSTRUITES dans le `body`, jamais par la
/// fermeture d'un `ForEach`** (#9135).
///
/// ## Ce que le `.ips` du 2026-10-05 a montré
///
/// SIGTRAP, `BUG IN CLIENT OF LIBDISPATCH: Block was expected to execute on
/// queue [com.apple.main-thread]`, fil `com.apple.SwiftUI.AsyncRenderer` :
///
/// ```
/// _dispatch_assert_queue_fail
/// swift_task_isCurrentExecutorWithFlagsImpl
/// closure #1 in ComposerLeadingRail.doorEntries(_:)
/// ForEachState.item(at:offset:)
/// … ScrollViewLayoutComputer.updateValue()
/// … SizeFittingLayoutComputer.Engine.sizeThatFits(_:)      ← ViewThatFits
/// … ViewGraph.updateOutputsAsync(at:)                       ← rendu asynchrone
/// ```
///
/// Le clavier qui monte ou qui descend change la hauteur offerte au rail ; le
/// `ViewThatFits(in: .vertical)` du rail bascule alors vers son autre candidat
/// et le MESURE. iOS 26 fait cette passe sur le fil de rendu asynchrone, et
/// c'est là que le `ForEach` du candidat fraîchement monté matérialise ses
/// entrées — en appelant sa fermeture. Or cette fermeture, écrite dans une vue
/// de la cible (`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`), hérite de
/// l'isolation du main actor : Swift 6 pose à son entrée un contrôle
/// d'exécuteur, qui trappe hors du fil principal avant la première ligne.
/// D'où les deux signatures de l'issue — toucher « Touchez pour écrire »
/// (le clavier monte), saisir puis replier le clavier de l'éditeur plein écran
/// (`UIInputViewSetPlacementOffScreenDown`, il descend) — et d'où
/// l'intermittence : la passe n'est asynchrone que pour certaines images de
/// l'animation du clavier, et lldb attaché change ce minutage.
///
/// ## La forme
///
/// Le `body` — toujours évalué sur le fil principal — construit chaque entrée
/// et la range dans une `ComposerRailRow` ; le `ForEach` ne reçoit que
/// `composerRailRowContent`, une fonction `nonisolated` qui RELIT l'entrée
/// déjà construite. Plus aucune fermeture isolée n'est appelée par le rendu
/// asynchrone, quel que soit le fil sur lequel SwiftUI matérialise les
/// éléments. Même cause, même correctif que la rangée de statistiques de la
/// carte de conversation (`d551753ae5`, `.ips` du 2026-09-29) — mais un rail
/// porte un nombre d'entrées variable, que la pose à la main ne tenait pas.
///
/// Garde : `ComposerRailAsyncRenderGuardTests`.
nonisolated struct ComposerRailRow<ID: Hashable, Content>: Identifiable {
    let id: ID
    let content: Content
}

/// Le seul contenu qu'un `ForEach` de rail reçoit : l'entrée construite par le
/// `body`, relue sans isolation — appelable depuis n'importe quel fil.
nonisolated func composerRailRowContent<ID: Hashable, Content>(_ row: ComposerRailRow<ID, Content>) -> Content {
    row.content
}
