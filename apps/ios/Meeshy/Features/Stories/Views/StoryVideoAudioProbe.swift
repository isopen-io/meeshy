import AVFoundation
import Foundation
import os
import MeeshySDK
import MeeshyUI

/// Sonde les vidéos de premier plan d'une slide pour savoir si elles portent une
/// piste audio — de quoi décider si le bouton « son » du rail a une raison
/// d'exister. Sans état : le lecteur garde la table `id → présence` et lui
/// remet chaque vidéo à sonder.
enum StoryVideoAudioProbe {

    /// Nombre de pistes audio de `media`, ou `nil` quand le probe n'a PAS pu
    /// aboutir (URL non résolue, asset injoignable). La distinction est
    /// essentielle : les deux probes sautent toute entrée déjà écrite, donc
    /// enregistrer `false` sur un échec réseau masquait le bouton son pour
    /// toute la session, réouverture comprise.
    @MainActor
    static func trackCount(for media: StoryMediaObject,
                           in story: StoryItem,
                           preloadedVideoURLs: [String: URL]) async -> Int? {
        guard let url = resolveVideoURL(for: media, in: story, preloadedVideoURLs: preloadedVideoURLs) else {
            Logger.media.debug("story sound probe: unresolved URL for \(media.id, privacy: .public)")
            return nil
        }
        do {
            return try await AVURLAsset(url: url).loadTracks(withMediaType: .audio).count
        } catch {
            Logger.media.debug("story sound probe failed for \(media.id, privacy: .public)")
            return nil
        }
    }

    /// Resolves the playable URL for a foreground video — mirrors the order used
    /// by `StoryMediaLayer.resolvedMediaURL`: preloaded composer asset, then the
    /// published `StoryItem.media` remote URL, then the embedded `mediaURL`.
    static func resolveVideoURL(for media: StoryMediaObject,
                                in story: StoryItem,
                                preloadedVideoURLs: [String: URL]) -> URL? {
        if !media.postMediaId.isEmpty {
            if let preloaded = preloadedVideoURLs[media.postMediaId] { return preloaded }
            if let feed = story.media.first(where: { $0.id == media.postMediaId }),
               let urlString = feed.url, let url = MeeshyConfig.resolveMediaURL(urlString) {
                return url
            }
        }
        // #7056 — les deux lectures de ce résolveur passent par
        // `MeeshyConfig.resolveMediaURL`, qui porte la branche « clé de
        // stockage » (`MeeshyConfig.swift:166-172`) et traite `file://` en
        // premier : le cas local reste intact.
        if let urlString = media.mediaURL, let url = MeeshyConfig.resolveMediaURL(urlString) {
            return url
        }
        return nil
    }
}
