import Foundation
import AVFoundation
import MeeshySDK

/// **La boucle du mixer de lecture : UNE loi pour le premier plan et le fond (#9867).**
///
/// Les deux slots avaient chacun leur rebouclage, et ils avaient divergé : le
/// fond se réarmait à chaque fin de passe, le premier plan replanifiait sa
/// deuxième passe sans handler — la troisième n'était jamais planifiée et le
/// clip se taisait après deux tours.
///
/// La loi tient en deux règles :
/// 1. **une passe d'avance.** Au départ, la passe qui joue ET la suivante sont
///    remises au node ; la fin de la passe N arme la passe N+2. Le réarmement
///    traverse le fil principal (le node et le fichier ne sont pas `Sendable`),
///    et c'est cette avance qui lui laisse une passe entière de marge : un fil
///    principal occupé pendant un geste ne creuse plus de trou audible.
/// 2. **un handler ne réarme que SA passe, sur SON node.** `node.stop()` rend
///    tous les handlers en attente ; un `stop()` suivi d'un `play()` immédiat
///    les verrait arriver sur une passe neuve et doublerait la boucle. L'époque
///    de lecture (`playbackEpoch`) et l'identité du node les écartent.
nonisolated enum ReaderLoopLaw {
    static func shouldRearm(capturedEpoch: UInt64, liveEpoch: UInt64,
                            capturedNode: ObjectIdentifier, liveNode: ObjectIdentifier?) -> Bool {
        capturedEpoch == liveEpoch && capturedNode == liveNode
    }
}

/// Le slot d'une boucle — `Sendable`, donc transportable par le handler de fin
/// de passe, qui ne peut pas capturer le node lui-même.
nonisolated enum ReaderLoopSlot: Hashable, Sendable {
    case foreground(String)
    case background
}

/// Ce qu'une passe de boucle remet au node, lu sur le slot vivant.
struct ReaderLoopSource {
    let node: AVAudioPlayerNode
    let file: AVAudioFile
    let trimBounds: MediaTrimBounds?
}

extension ReaderAudioMixer {

    /// Lance la boucle d'un slot : la première passe (éventuellement entrée en
    /// cours de piste, #6580) puis, derrière elle, une passe entière d'avance.
    /// Si la première passe n'a rien planifié (ouverture au-delà de la fin du
    /// clip), la boucle ne démarre pas — même règle que `scheduleAudio`.
    func scheduleLoop(_ slot: ReaderLoopSlot, elapsedInClip: Double, at scheduleAt: AVAudioTime?) {
        guard let source = loopSource(for: slot) else { return }
        let rearm = loopRearmHandler(slot, node: source.node)
        guard scheduleAudio(node: source.node, file: source.file, trimBounds: source.trimBounds,
                            elapsedInClip: elapsedInClip,
                            at: scheduleAt, completionHandler: rearm) else { return }
        scheduleAudio(node: source.node, file: source.file, trimBounds: source.trimBounds,
                      elapsedInClip: 0,
                      at: nil, completionHandler: rearm)
    }

    private func loopRearmHandler(_ slot: ReaderLoopSlot, node: AVAudioPlayerNode) -> @Sendable () -> Void {
        let epoch = playbackEpoch
        let nodeId = ObjectIdentifier(node)
        return { @Sendable [weak self] in
            // `_ =` : discarde le handle du `Task` pour que la closure rende `Void`.
            _ = Task { @MainActor [weak self] in
                self?.rearmLoop(slot, epoch: epoch, nodeId: nodeId)
            }
        }
    }

    /// Arme UNE passe de plus, au début de la fenêtre — `elapsedInClip: 0`
    /// écrit à dessein : l'écoulé de la slide ne vaut que pour l'entrée.
    private func rearmLoop(_ slot: ReaderLoopSlot, epoch: UInt64, nodeId: ObjectIdentifier) {
        let live = loopSource(for: slot)
        guard ReaderLoopLaw.shouldRearm(capturedEpoch: epoch, liveEpoch: playbackEpoch,
                                        capturedNode: nodeId,
                                        liveNode: live.map { ObjectIdentifier($0.node) }),
              let source = live else { return }
        scheduleAudio(node: source.node, file: source.file, trimBounds: source.trimBounds,
                      elapsedInClip: 0,
                      at: nil, completionHandler: loopRearmHandler(slot, node: source.node))
    }
}
