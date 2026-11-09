import Foundation
import os

#if canImport(WebRTC)
import WebRTC

/// La porte entre une piste vidéo et la vue qui la rend (#17039).
///
/// `RTCVideoTrack.add` / `remove` attendent le fil de travail de libwebrtc :
/// au démontage d'une vue d'appel, le fil principal y restait jusqu'à 1 s.
/// La piste ne voit donc jamais la vue, seulement cette porte ; l'ajout et le
/// retrait de la porte partent sur `CallEngineQueue`, dans l'ordre.
///
/// - `close()` est SYNCHRONE : dès son retour, la vue ne reçoit plus aucune
///   image ni taille, même si le retrait de la porte n'a pas encore eu lieu ;
/// - la porte tient la vue FAIBLEMENT : retenue par la piste jusqu'au retrait
///   différé, elle ne fait pas survivre une `UIView` (dont la libération doit
///   rester sur le fil principal).
nonisolated final class CallVideoRendererGate: NSObject, RTCVideoRenderer, Sendable {
    private struct Link {
        weak var view: (any RTCVideoRenderer)?
        var track: RTCVideoTrack?
    }

    private let link: OSAllocatedUnfairLock<Link>

    init(target: any RTCVideoRenderer) {
        link = OSAllocatedUnfairLock(uncheckedState: Link(view: target, track: nil))
        super.init()
    }

    /// Ferme la porte : plus rien ne passe vers la vue, dès le retour.
    func close() {
        link.withLockUnchecked { $0.view = nil }
    }

    /// Branche `view` sur `track` par une porte neuve, ajoutée sur la file du moteur.
    static func attach(_ track: RTCVideoTrack, to view: any RTCVideoRenderer) -> CallVideoRendererGate {
        let gate = CallVideoRendererGate(target: view)
        gate.link.withLockUnchecked { $0.track = track }
        CallEngineQueue.run {
            gate.attachedTrack?.add(gate)
        }
        return gate
    }

    /// Ferme la porte sur place, puis la retire de sa piste sur la file du moteur.
    func detach() {
        close()
        CallEngineQueue.run { [self] in
            let track = link.withLockUnchecked { link -> RTCVideoTrack? in
                defer { link.track = nil }
                return link.track
            }
            track?.remove(self)
        }
    }

    private var attachedTrack: RTCVideoTrack? {
        link.withLockUnchecked { $0.track }
    }

    // MARK: - RTCVideoRenderer

    // Les images arrivent du fil de décodage : la vue est appelée SOUS le
    // verrou, pour qu'aucune image en vol ne la touche après `close()`.
    // La conformité est déclarée sur la classe `nonisolated` (comme
    // `CallFrameTap`) : posée dans une extension, l'isolation par défaut du
    // module la rendait `@MainActor`, inutilisable depuis `CallEngineQueue`.
    func setSize(_ size: CGSize) {
        link.withLockUnchecked { $0.view?.setSize(size) }
    }

    func renderFrame(_ frame: RTCVideoFrame?) {
        link.withLockUnchecked { $0.view?.renderFrame(frame) }
    }
}

#endif
