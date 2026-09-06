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
        // **L'objet naît AVEC son adresse** (2026-09-06), avant tout `await`.
        //
        // L'URL est connue dès l'appel ; la forme d'onde et la durée, non —
        // elles demandent de lire le fichier. Les écrire ensemble, à la fin du
        // `Task`, faisait naître l'objet SANS adresse pendant plusieurs
        // dizaines de millisecondes — et c'est exactement la fenêtre où l'hôte
        // déclenche sa pré-montée. Le balayage ne trouvait donc rien à monter,
        // et le son partait avec son chemin LOCAL.
        //
        // > **Ce qu'on sait tout de suite ne s'écrit pas au rythme de ce qu'on
        // > doit calculer.** Le défaut ne se voit pas en lisant la fonction —
        // > tout y est posé, dans le bon ordre, sur le bon acteur. Il ne se
        // > voit qu'en demandant QUAND chaque champ devient lisible par les
        // > autres.
        guard let objet = addAudioObject(role: role) else { return }
        loadedAudioURLs[objet.id] = url
        var initiaux = currentEffects
        if let idx = initiaux.audioPlayerObjects?.firstIndex(where: { $0.id == objet.id }) {
            initiaux.audioPlayerObjects?[idx].mediaURL = url.absoluteString
            currentEffects = initiaux
        }
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
                guard let self else { return }
                let obj = objet
                var effects = self.currentEffects
                if let idx = effects.audioPlayerObjects?.firstIndex(where: { $0.id == obj.id }) {
                    // **L'adresse n'est PAS réécrite ici.** Elle a été posée
                    // à la création, avant tout `await` — et entre-temps la
                    // pré-montée a pu l'adopter, remplaçant le chemin local par
                    // l'URL du serveur. La réécrire depuis ce `Task`, qui
                    // capture l'URL LOCALE, ferait régresser un objet déjà
                    // monté : le son repartirait avec un chemin de disque.
                    //
                    // > Une écriture tardive n'est pas seulement en retard —
                    // > elle est ARMÉE d'une valeur périmée.
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
