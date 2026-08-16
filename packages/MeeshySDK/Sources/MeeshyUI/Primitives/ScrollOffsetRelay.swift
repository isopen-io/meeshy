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
/// `nonisolated` sur le TYPE, pas par membre. `MeeshyUI` compile avec
/// `.defaultIsolation(MainActor.self)` (SE-0466) : sans cette annotation la
/// classe est implicitement `@MainActor`, et Swift 6.2 dote alors sa `deinit`
/// d'une isolation. Sur iOS < 26 cette deinit isolée passe par le shim de
/// rétro-déploiement `swift_task_deinitOnExecutorMainActorBackDeploy`, qui
/// libère DEUX FOIS le scope task-local :
///
///     ___BUG_IN_CLIENT_OF_LIBMALLOC_POINTER_BEING_FREED_WAS_NOT_ALLOCATED
///     ← swift::TaskLocal::StopLookupScope::~StopLookupScope()
///     ← swift_task_deinitOnExecutorMainActorBackDeploy
///     ← ScrollOffsetRelay.__deallocating_deinit
///     ← destroy for ConversationListView
///
/// Le démontage d'une `ConversationListView` (fin d'un test, pop de la pile)
/// tuait donc le processus. Un relais qui ne porte qu'un `CGFloat` n'a rien à
/// démonter sur le main actor : le saut d'exécuteur ne protégeait rien et ne
/// coûtait qu'un crash.
///
/// **Ce relais TRANSPORTE, il ne décide jamais QUAND** (réserve R-g,
/// `tasks/lentille-workshop-execution.md` §8). Il publie chaque écriture, sans
/// fenêtre, sans pas minimal en points, sans coalescence — et c'est ce qui
/// permet à l'élection de la focus card de la Lentille
/// (`LentilleFocusElectionHost`) de suivre le défilement à la cadence de
/// l'affichage, comme son contrat l'exige, en s'abonnant à ce relais plutôt
/// qu'en ouvrant un second observateur de défilement. Y ajouter un écrémage
/// « pour économiser » redéfinirait silencieusement cette cadence pour TOUS les
/// abonnés à la fois. Gardé par `LentilleFocusElectionCadenceTests`.
nonisolated public final class ScrollOffsetRelay: ObservableObject {
    /// `willSet { objectWillChange.send() }` PLUTÔT que `@Published` : le
    /// compilateur refuse `nonisolated` sur une propriété enveloppée
    /// (« 'nonisolated' is not supported on properties with property wrappers »),
    /// et l'annotation doit vivre sur le TYPE pour désisoler la deinit.
    ///
    /// Ce n'est pas un contournement : c'est EXACTEMENT ce que `@Published`
    /// fait — publier sur `willSet`, avant l'écriture. Les consommateurs
    /// s'abonnent à `objectWillChange` via `@ObservedObject`, inchangé.
    public var offset: CGFloat = 0 {
        willSet { objectWillChange.send() }
    }

    public init() {}
}
