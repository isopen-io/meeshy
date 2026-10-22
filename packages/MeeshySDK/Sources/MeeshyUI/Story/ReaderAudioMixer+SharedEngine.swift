import Foundation
import AVFoundation
import Darwin
import os
import MeeshySDK

/// **Le mixer comme client du moteur PARTAGÉ (#9878).**
///
/// Ce que l'hôte (`ReaderAudioEngineHost`) remet au mixer, et ce que le mixer
/// en fait : replanifier sa passe depuis son ANCRE après un changement de
/// sortie, rattacher ses nodes à un moteur neuf après une réinitialisation des
/// services média. Les membres touchés ici (`entries`, `Entry`,
/// `effectiveVolume`, `cancelVolumeAutomation`) sont `internal` pour cette
/// raison — jamais `public`.
extension ReaderAudioMixer: ReaderAudioEngineClient {
    var claimsRunningEngine: Bool { isPlaying }

    var holdsEngineNodes: Bool { !entries.isEmpty || backgroundEntry != nil }

    func engineDidRestartAfterConfigurationChange() {
        replanFromAnchor()
    }

    func engineWasRebuilt() {
        let format = Self.resolveCanonicalFormat(mixer: engine.mainMixerNode)
        entries = entries.mapValues { entry in
            var rebuilt = entry
            rebuilt.node = attachedPlayerNode(format: format)
            rebuilt.node.volume = effectiveVolume(for: entry)
            return rebuilt
        }
        if var bg = backgroundEntry {
            bg.player = attachedPlayerNode(format: format)
            bg.player.volume = isMuted ? 0 : bg.targetVolume
            backgroundEntry = bg
        }
        replanFromAnchor()
    }

    /// **La passe repart de là où en est la slide, jamais du début du fichier.**
    ///
    /// Les buffers planifiés sont perdus avec le moteur arrêté : on vide les
    /// nodes, on oublie la clé (sinon `play` ne ferait que REPRENDRE une passe
    /// vide), et l'on replanifie sur la MÊME origine — l'écoulé se déduit du
    /// temps réel depuis l'ancre, donc l'entrée se fait en cours de piste
    /// (`scheduleAudio`, `at: nil`) et reste en phase avec le canevas, dont le
    /// playhead n'a pas cessé d'avancer.
    func replanFromAnchor() {
        guard isPlaying, !MediaSessionCoordinator.shared.isCallActive,
              let origin = currentPassOriginHost, let slideKey = startedSlideKey else { return }
        let elapsed = Self.delaySeconds(forHostTime: mach_absolute_time(), relativeTo: origin)
        cancelVolumeAutomation()
        entries.values.forEach { $0.node.stop() }
        backgroundEntry?.player.stop()
        startedSlideKey = nil
        do {
            _ = try play(originHost: origin, slideKey: slideKey, slideElapsed: elapsed)
        } catch {
            MeeshyLog.logger(.media)
                .error("ReaderAudioMixer replan after engine restart failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func attachedPlayerNode(format: AVAudioFormat) -> AVAudioPlayerNode {
        let node = AVAudioPlayerNode()
        engine.attach(node)
        engine.connect(node, to: engine.mainMixerNode, format: format)
        return node
    }
}
