import Foundation
import AVFoundation
import MeeshySDK

extension StoryComposerViewModel {

    /// **Poser un son venu d'AILLEURS** — collé, ou remis par une surface qui
    /// n'est pas l'atelier (#4092).
    ///
    /// ## Pourquoi ce corps a quitté la vue
    ///
    /// Il vivait dans `StoryComposerView+Media` sous le nom
    /// `addRecordingToBackground`. Rien ne l'y retenait : les quatre gestes
    /// qu'il enchaîne — analyser la forme d'onde, lire la durée, poser l'objet,
    /// étendre la slide — sont des mutations de MODÈLE. Le `Task` et le
    /// `MainActor.run` qui l'entourent sont de la plomberie de concurrence, pas
    /// de la présentation.
    ///
    /// Sa place dans une vue était le seul obstacle à coller un son depuis le
    /// composer unifié. C'est la même histoire qu'`eraseStrokes` : un helper
    /// écrit dans la vue qui l'a demandé le premier, et qui y reste par inertie.
    ///
    /// ## Ce que la forme d'onde vaut, et ne vaut pas
    ///
    /// Elle est COSMÉTIQUE : son échec rend des barres plates, jamais un refus
    /// de poser. Un son collé dont l'analyse échoue reste un son collé — refuser
    /// la pose pour un dessin d'onde inverserait la hiérarchie entre le contenu
    /// et sa représentation.
    public func attachPastedAudio(url: URL, role: ComposerAudioRole? = nil) {
        Task { [weak self] in
            let samples: [Float]
            do {
                samples = try await WaveformCache.shared.samples(from: url)
            } catch {
                samples = []
            }
            let asset = AVURLAsset(url: url)
            var mediaDuration: Float?
            if let cmDur = try? await asset.load(.duration) {
                let secs = CMTimeGetSeconds(cmDur)
                if secs > 0, secs.isFinite { mediaDuration = Float(secs) }
            }
            await MainActor.run {
                guard let self, let obj = self.addAudioObject(role: role) else { return }
                self.loadedAudioURLs[obj.id] = url
                var effects = self.currentEffects
                if let idx = effects.audioPlayerObjects?.firstIndex(where: { $0.id == obj.id }) {
                    effects.audioPlayerObjects?[idx].waveformSamples = samples
                    if let dur = mediaDuration {
                        effects.audioPlayerObjects?[idx].duration = dur
                    }
                    self.currentEffects = effects
                }
                if let dur = mediaDuration {
                    self.autoExtendDuration(forElementEnd: dur)
                }
            }
        }
    }
}
