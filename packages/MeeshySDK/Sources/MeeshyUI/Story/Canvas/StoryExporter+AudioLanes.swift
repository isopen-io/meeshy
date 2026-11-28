import AVFoundation
import CoreMedia
import Foundation
import MeeshySDK

extension StoryExporter {
    // MARK: - Audio lanes (audioPlayerObjects)

    /// Adresse jouable d'une piste de la timeline — **point de résolution
    /// UNIQUE** de tous les chemins d'export.
    ///
    /// Deux sources, dans cet ordre :
    /// 1. `resolver` — le composer sert ses fichiers de session, y compris ceux
    ///    qui n'ont pas encore été uploadés. Toujours plus frais.
    /// 2. `audio.mediaURL` — l'adresse persistée (ou hydratée depuis `FeedMedia`
    ///    par `StoryItem.toRenderableSlide`). Résolue via le cache disque, avec
    ///    téléchargement quand il manque : une story relue depuis la liste n'a
    ///    aucune raison d'avoir ses pistes déjà en cache.
    ///
    /// C'est ce repli qui rend l'audio indépendant du site d'appel : aucun
    /// appelant ne peut plus produire un export muet en oubliant de câbler un
    /// resolver.
    static func resolveLaneURL(
        _ audio: StoryAudioPlayerObject,
        resolver: (@Sendable (StoryAudioPlayerObject) -> URL?)?
    ) async -> URL? {
        if let url = resolver?(audio) { return url }
        // `URL(string:)` NU acceptait « /api/v1/static/x.m4a » et rendait une URL
        // sans schéma, que le cache refusait ensuite sans un mot : un son
        // emprunté à la bibliothèque s'exportait en silence. La résolution passe
        // par le point unique, qui recolle l'hôte courant.
        guard let remote = StoryAudioSourceResolver.playableURL(from: audio.mediaURL) else { return nil }
        if remote.isFileURL {
            return FileManager.default.fileExists(atPath: remote.path) ? remote : nil
        }
        return await CacheCoordinator.audioLocalFileURLAwait(for: remote)
    }

    /// Composes the slide's `audioPlayerObjects` (musique, voix — lanes de la
    /// timeline) into dedicated audio tracks, honouring the timeline window
    /// (`startTime`/`duration`), `volume`, `fadeIn`/`fadeOut`.
    ///
    /// RÈGLE PRODUIT : loop = background uniquement. Un audio background avec
    /// `loop == true` est répété jusqu'à couvrir sa fenêtre ; un foreground
    /// portant un flag `loop` hérité joue UNE fois.
    ///
    /// Returns the `AVMutableAudioMixInputParameters` needed by tracks whose
    /// volume/fades differ from nominal — tracks at plain volume 1.0 need no
    /// entry (AVFoundation plays unlisted tracks at nominal volume).
    static func composeAudioLanes(
        slide: StorySlide,
        composition: AVMutableComposition,
        totalDuration: CMTime,
        storyStart: CMTime = .zero,
        resolver: (@Sendable (StoryAudioPlayerObject) -> URL?)?
    ) async throws -> [AVMutableAudioMixInputParameters] {
        var parameters: [AVMutableAudioMixInputParameters] = []

        for audio in slide.effects.audioPlayerObjects ?? []
        where StoryExportClipPlacement.carriesSound(volume: audio.volume, keyframes: audio.keyframes) {
            guard let url = await resolveLaneURL(audio, resolver: resolver) else { continue }
            let asset = AVURLAsset(url: url)
            guard let assetTrack = (try? await asset.loadTracks(withMediaType: .audio))?.first,
                  let assetDuration = try? await asset.load(.duration),
                  assetDuration > .zero,
                  let placement = lanePlacement(audio, assetDuration: assetDuration,
                                                totalDuration: totalDuration) else { continue }

            guard let track = composition.addMutableTrack(
                withMediaType: .audio,
                preferredTrackID: kCMPersistentTrackID_Invalid
            ) else {
                throw StoryExporterError.sessionCreationFailed
            }

            // `start` et `insertedEnd` restent en temps de STORY (les keyframes
            // et fenêtres de l'auteur y sont exprimées) ; seules les POSES dans
            // la composition portent le décalage de l'interlude.
            let insertedEnd = try placement.insert(assetTrack, into: track, storyStart: storyStart)
            if let params = laneMixParameters(audio, track: track, start: placement.start,
                                              insertedEnd: insertedEnd, storyStart: storyStart) {
                parameters.append(params)
            }
        }

        return parameters
    }

    /// La pose d'un son posé : sa fenêtre de source (rognage compris, #18555),
    /// sa place sur la scène, et la boucle — réservée au son de FOND.
    nonisolated static func lanePlacement(_ audio: StoryAudioPlayerObject, assetDuration: CMTime,
                                          totalDuration: CMTime) -> StoryExportClipPlacement? {
        let start = CMTime(seconds: Double(max(0, audio.startTime ?? 0)), preferredTimescale: 600)
        guard start < totalDuration else { return nil }
        let available = totalDuration - start
        let window: CMTime = {
            guard let declared = audio.duration, declared > 0 else { return available }
            return CMTimeMinimum(CMTime(seconds: Double(declared), preferredTimescale: 600), available)
        }()
        let source = StoryExportClipPlacement.sourceWindow(
            audio.trimBounds(sourceDuration: assetDuration.seconds))
        return StoryExportClipPlacement(source: source, start: start, window: window,
                                        loops: audio.isBackground == true && audio.loop == true)
    }

    /// Le mix d'un son posé : volume, automation et fondus. `nil` au niveau
    /// nominal, sans fondu ni automation — AVFoundation joue alors la piste telle quelle.
    static func laneMixParameters(_ audio: StoryAudioPlayerObject, track: AVMutableCompositionTrack,
                                  start: CMTime, insertedEnd: CMTime,
                                  storyStart: CMTime) -> AVMutableAudioMixInputParameters? {
        // Plafond `StoryVolume.maxGain` et non 1.0 : un gain au-delà de
        // 100 % n'est applicable QUE par AVAudioMix, les nodes
        // AVFoundation étant bornés — le brider ici le rendrait inaudible
        // partout.
        let baseVolume = min(StoryVolume.maxGain, max(0, audio.volume))
        let fadeIn = Double(audio.fadeIn ?? 0)
        let fadeOut = Double(audio.fadeOut ?? 0)
        let automation = (audio.keyframes ?? []).filter { $0.volume != nil }
        let needsMix = abs(baseVolume - 1.0) > 0.001 || fadeIn > 0.01 || fadeOut > 0.01
            || !automation.isEmpty
        guard needsMix else { return nil }

        let timelineStart = start + storyStart
        let params = AVMutableAudioMixInputParameters(track: track)
        if automation.isEmpty {
            params.setVolume(baseVolume, at: .zero)
        } else {
            for (range, from, to) in Self.volumeRamps(base: baseVolume,
                                                      keyframes: audio.keyframes,
                                                      duration: insertedEnd.seconds) {
                let shifted = CMTimeRange(start: range.start + timelineStart,
                                          duration: range.duration)
                params.setVolumeRamp(fromStartVolume: from, toEndVolume: to,
                                     timeRange: shifted)
            }
        }
        if fadeIn > 0.01 {
            params.setVolumeRamp(
                fromStartVolume: 0,
                toEndVolume: baseVolume,
                timeRange: CMTimeRange(
                    start: timelineStart,
                    duration: CMTime(seconds: fadeIn, preferredTimescale: 600)
                )
            )
        }
        if fadeOut > 0.01 {
            let rampDuration = CMTime(seconds: fadeOut, preferredTimescale: 600)
            let rampStart = insertedEnd - rampDuration
            if rampStart > start {
                params.setVolumeRamp(
                    fromStartVolume: baseVolume,
                    toEndVolume: 0,
                    timeRange: CMTimeRange(start: rampStart + storyStart,
                                           duration: rampDuration)
                )
            }
        }
        return params
    }
}
