import AVFoundation
import Foundation

/// **Un mixeur qui n'a rien planifié n'a aucun nœud à arrêter** (#18511).
/// Le lecteur arrête chaque mixeur voisin à chaque story qui devient visible ;
/// la plupart n'ont jamais joué.
nonisolated enum ReaderAudioStopPolicy {
    static func mustStopNodes(hasScheduledPass: Bool) -> Bool {
        hasScheduledPass
    }
}

/// **L'arrêt des nœuds, hors du fil principal** (#18511) : `stop()` d'un
/// `AVAudioPlayerNode` interroge la latence de sortie du serveur audio, un
/// aller-retour synchrone relevé à 0,6–0,7 s. Il part sur une file série ; le
/// prochain geste sur ces nœuds (lecture, pause, démontage) attend d'abord
/// qu'il soit fait, pour qu'un arrêt en retard ne vide jamais une passe neuve.
nonisolated struct ReaderAudioNodeRetirement {
    static let queue = DispatchQueue(label: "me.meeshy.reader-audio.node-stop", qos: .userInitiated)

    private(set) var isPending = false

    mutating func retire(_ stops: @escaping @Sendable () -> Void) {
        isPending = true
        Self.queue.async(execute: stops)
    }

    mutating func settle() {
        guard isPending else { return }
        Self.queue.sync {}
        isPending = false
    }
}

extension ReaderAudioMixer {
    /// Arrête les nœuds de la passe planifiée sans bloquer l'appelant.
    func retireScheduledNodes() {
        guard ReaderAudioStopPolicy.mustStopNodes(hasScheduledPass: startedSlideKey != nil || currentPassOriginHost != nil) else { return }
        let nodes = entries.values.map(\.node) + [backgroundEntry?.player].compactMap { $0 }
        guard !nodes.isEmpty else { return }
        nodeRetirement.retire { nodes.forEach { $0.stop() } }
    }
}
