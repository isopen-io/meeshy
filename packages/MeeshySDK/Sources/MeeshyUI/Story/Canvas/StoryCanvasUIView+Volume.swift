import UIKit
import AVFoundation
import MeeshySDK

// MARK: - StoryCanvasUIView + Volume

extension StoryCanvasUIView {

    /// Réapplique le volume de chaque média sonore de la slide pour la position
    /// `time` du playhead (secondes, depuis le début de la slide).
    ///
    /// Appelée à chaque tick du display-link : le corps doit rester une poignée
    /// de comparaisons. Les couches et le mixer ignorent une écriture identique
    /// (`didSet` gardé par `oldValue != volume`), donc réaffecter à 60 Hz ne
    /// coûte rien tant qu'aucune valeur ne change.
    func applyVolumeAutomation(at time: Float) {
        let effects = slide.effects
        let slideDucks = shouldDuckVideoAudio(effects: effects)

        // Vidéo de fond.
        if let bg = effects.mediaObjects?.first(where: { $0.isBackground }) {
            let resolved = StoryVolumeResolver.effectiveVolume(
                base: bg.volume,
                keyframes: bg.keyframes,
                at: time - Float(bg.startTime ?? 0)
            )
            backgroundLayer.volume = StoryVolumeResolver.ducked(
                resolved,
                isDucking: StoryVolumeResolver.isDucking(
                    slideDucks: slideDucks, isDuckingDisabled: bg.isDuckingDisabled)
            )
        }

        // Vidéos d'avant-plan : chaque couche porte son propre média.
        forEachMediaLayer { layer in
            guard let media = layer.media, media.kind == .video, !media.isBackground else { return }
            let resolved = StoryVolumeResolver.effectiveVolume(
                base: media.volume,
                keyframes: media.keyframes,
                at: time - Float(media.startTime ?? 0)
            )
            layer.volume = StoryVolumeResolver.ducked(
                resolved,
                isDucking: StoryVolumeResolver.isDucking(
                    slideDucks: slideDucks, isDuckingDisabled: media.isDuckingDisabled)
            )
        }

        applyAudioMixerVolumes(at: time)
    }

    /// Pousse les volumes du MODÈLE (clips audio fg + bg) dans le
    /// `ReaderAudioMixer`, résolus à l'instant `time`.
    ///
    /// Deux appelants :
    /// - `applyVolumeAutomation` (tick 60 Hz du reader, mode `.play`) ;
    /// - `rebuildLayers` en `.edit` (éditeur sonore) — le reconfigure du mixer
    ///   est gaté sur la COMPOSITION (`slideAudioRevision`), donc un mute /
    ///   changement de volume seul ne le franchit pas, et l'`.edit` n'a pas de
    ///   display-link : sans cette poussée au rebuild, la boucle du composer
    ///   continuait de jouer une piste que l'auteur venait de couper.
    func applyAudioMixerVolumes(at time: Float) {
        let effects = slide.effects

        // Clips audio d'avant-plan — jamais atténués : l'atténuation vise la
        // piste des VIDÉOS, qui est ce qui couvre la musique.
        for audio in effects.resolvedForegroundAudioPlayers {
            let resolved = StoryVolumeResolver.effectiveVolume(
                base: audio.volume,
                keyframes: audio.keyframes,
                at: time - (audio.startTime ?? 0)
            )
            audioMixer.setVolume(resolved, for: audio.id)
        }

        // Audio de fond — la piste qu'on cherche justement à rendre audible.
        if let bgAudio = effects.resolvedBackgroundAudio {
            let resolved = StoryVolumeResolver.effectiveVolume(
                base: bgAudio.volume,
                keyframes: bgAudio.keyframes,
                at: time - (bgAudio.startTime ?? 0)
            )
            audioMixer.setBackgroundVolume(resolved)
        }
    }

    /// `true` quand la slide porte un audio de fond ET au moins une vidéo dont
    /// la piste audio existe réellement — la situation exacte où la vidéo
    /// couvre la musique.
    ///
    /// Une vidéo muette (sans piste, ou pas encore sondée) ne déclenche rien :
    /// atténuer sur une hypothèse ferait baisser une musique sans raison.
    func shouldDuckVideoAudio(effects: StoryEffects) -> Bool {
        guard effects.resolvedBackgroundAudio != nil else { return false }
        return videoHasAudioTrack.values.contains(true)
    }

    /// `true` quand l'asset porte au moins une piste audio.
    ///
    /// `nonisolated static` : le sondage ne touche aucun état de la vue et doit
    /// pouvoir tourner hors du main actor. Un asset illisible répond `false` —
    /// on n'atténue pas sur une base incertaine.
    nonisolated static func assetHasAudioTrack(url: URL) async -> Bool {
        let asset = AVURLAsset(url: url)
        do {
            let tracks = try await asset.loadTracks(withMediaType: .audio)
            return !tracks.isEmpty
        } catch {
            return false
        }
    }

    /// Sonde une fois chaque vidéo de la slide et mémorise le résultat.
    /// Idempotente : une entrée déjà connue n'est jamais re-sondée.
    func probeVideoAudioTracks() {
        let medias = (slide.effects.mediaObjects ?? []).filter { $0.kind == .video }
        for media in medias where videoHasAudioTrack[media.id] == nil {
            let localURL = readerContext.localAudioURLResolver?(media.id)
            let remoteURL = readerContext.postMediaURLResolver?(media.postMediaId)
            guard let url = localURL ?? remoteURL else { continue }
            let id = media.id
            Task { @MainActor [weak self] in
                let hasAudio = await Self.assetHasAudioTrack(url: url)
                self?.videoHasAudioTrack[id] = hasAudio
            }
        }
    }
}
