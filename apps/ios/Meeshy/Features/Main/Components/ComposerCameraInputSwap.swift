import AVFoundation

/// Ce qu'une bascule d'objectif touche de la session — `AVCaptureSession` en
/// production, une doublure dans les témoins.
nonisolated protocol ComposerCaptureInputGraph: AnyObject {
    associatedtype Input
    func beginConfiguration()
    func commitConfiguration()
    func removeInput(_ input: Input)
    func canAddInput(_ input: Input) -> Bool
    func addInput(_ input: Input)
}

nonisolated extension AVCaptureSession: ComposerCaptureInputGraph {
    typealias Input = AVCaptureInput
}

/// **Basculer d'objectif ne laisse jamais la session sans image** (#9464).
///
/// L'ancienne bascule retirait TOUTES les entrées vidéo, puis tentait d'ajouter
/// la nouvelle : une entrée qui ne naissait pas, ou que la session refusait,
/// laissait l'aperçu noir et `currentPosition` mentir. La nouvelle entrée naît
/// d'abord ; le retrait et l'ajout se font dans UNE configuration, et un refus
/// remet l'ancienne à sa place.
nonisolated enum ComposerCameraInputSwap {

    enum Outcome: Equatable, Sendable {
        /// La nouvelle entrée est en place.
        case swapped
        /// L'ancienne est restée (ou a été remise) : la position ne change pas.
        case kept
        /// Aucune entrée vidéo : il n'y en avait pas, et la nouvelle a été refusée.
        case none
    }

    static func swap<Graph: ComposerCaptureInputGraph>(in graph: Graph, replacing old: Graph.Input?,
                                                      with new: Graph.Input?) -> Outcome {
        guard let new else { return old == nil ? .none : .kept }
        graph.beginConfiguration()
        defer { graph.commitConfiguration() }
        if let old { graph.removeInput(old) }
        if graph.canAddInput(new) {
            graph.addInput(new)
            return .swapped
        }
        guard let old else { return .none }
        graph.addInput(old)
        return .kept
    }
}
