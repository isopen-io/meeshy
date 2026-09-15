import Foundation
import MeeshySDK
import MeeshyUI

// =============================================================================
//  Règles PURES de lecture d'un réel — extraites de `ReelsPlayerView.swift` (#6745)
// =============================================================================
//
//  L'hôte est hors budget et la règle interdit d'y ajouter : on extrait d'abord,
//  on ajoute ensuite. Ce qui sort ici est exactement ce que le lot étend — la
//  porte d'autoplay, la politique de télémétrie, la classification des médias —
//  et aucune de ces règles ne dépend d'une vue.

// MARK: - Reel media open-autostart gate (pure)

/// The single open-autostart gate shared by a reel's audio AND video paths
/// (WS3.1): an active reel starts its media only once the liquid reveal has
/// completed and no call owns the audio session. Extracted as a pure function so
/// the truth table is unit-testable. `ReelVideoView.drive()` encodes the
/// identical condition for the video engine, so both media kinds start in
/// lockstep.
enum ReelMediaAutostart {
    nonisolated static func shouldStart(isActive: Bool, revealCompleted: Bool, isCallActive: Bool) -> Bool {
        isActive && revealCompleted && !isCallActive
    }

    /// Idempotency guard for the audio open-autostart (F4/F6): only (re)start the
    /// engine when it is not already loaded with this url. `currentUrl` and `url`
    /// MUST be compared in the SAME normalized form the engine stores — for a
    /// `file://` url `AudioPlaybackManager.playLocal` stores `URL.absoluteString`,
    /// which can differ from the raw string, so the caller normalizes first. Keeps
    /// a re-render / reveal flip from restarting in-place audio.
    nonisolated static func shouldLoadAudio(currentUrl: String?, url: String) -> Bool {
        currentUrl != url
    }
}

// MARK: - Reel Watch Attachment Policy (pure)

/// `finalizeReelSession` reads the SHARED video engine (`SharedAVPlayerManager`)
/// only when the reel actually being finalized is a video reel — pure,
/// testable gate mirroring `ReelMediaAutostart`.
enum ReelWatchAttachmentPolicy {
    nonisolated static func shouldAttachVideoWatch(mediaType: FeedMediaType?) -> Bool {
        mediaType == .video
    }
}

// MARK: - Reel Scene Routing (pure)

/// **Un réel composé se rejoue comme sa scène** (#6745).
///
/// La page du lecteur demandait « quels médias ce réel porte-t-il ? » et jouait
/// sa vidéo brute. Un réel composé porte une SCÈNE dont la vidéo n'est que le
/// fond : c'est la scène qui dit si cette vidéo parle, et c'est sur SA timeline
/// que joue le son de fond. La question juste est donc « porte-t-il une
/// scène ? », posée ici une fois pour la page, le son et la télémétrie.
enum ReelSceneRouting {
    /// Le document que le réel rejoue, ou `nil` pour un réel de médias.
    static func sceneDocument(for reel: FeedPost) -> CanvasV3? {
        guard let document = reel.storyEffects?.canvasV3, !document.scenes.isEmpty else { return nil }
        return document
    }

    /// La piste de fond que la PAGE joue elle-même : seulement pour un réel
    /// « son emprunté » sans scène ni média. Un réel à scène en est exclu — la
    /// scène joue déjà ce son, et le lecteur l'entendrait deux fois, décalé.
    static func borrowedSoundTrack(for reel: FeedPost) -> StoryAudioPlayerObject? {
        guard sceneDocument(for: reel) == nil,
              reel.primaryReelDisplayMedia == nil,
              let effects = reel.storyEffects else { return nil }
        let track = effects.resolvedBackgroundAudio
            ?? effects.audioPlayerObjects?.first(where: { !($0.mediaURL ?? "").isEmpty })
        guard let track, !(track.mediaURL ?? "").isEmpty else { return nil }
        return track
    }

    /// Le temps du moteur vidéo partagé n'appartient à un réel à scène que si
    /// ce moteur porte SA vidéo : la scène n'emprunte le player partagé que pour
    /// son média porteur déjà chargé, et ouvre le sien sinon. Lire le moteur sans
    /// cette preuve attribuerait au réel le visionnage d'une autre vidéo.
    static func attachesSharedVideoWatch(for reel: FeedPost, loadedAttachmentId: String?) -> Bool {
        guard let document = sceneDocument(for: reel) else {
            return ReelWatchAttachmentPolicy.shouldAttachVideoWatch(mediaType: reel.primaryReelDisplayMedia?.type)
        }
        guard let carrier = MeeshyScenePlayer.carrierMediaIdentity(in: document, sceneIndex: 0) else { return false }
        return loadedAttachmentId == carrier
    }
}

/// La progression d'un réel composé : sa position sur la timeline de la scène,
/// bornée à la barre quoi que le player rapporte.
enum ReelSceneProgress {
    nonisolated static func fraction(elapsed: Double, duration: Double) -> Double {
        guard duration > 0 else { return 0 }
        return min(1, max(0, elapsed / duration))
    }
}

// MARK: - Reel Media Layout

/// Pure classification of a reel's media into the surface that should render it.
/// App-side: it encodes the product decision of HOW a reel composes its media
/// (single video, image carousel, rich audio, or images + independent audio),
/// derived solely from the post's media. `resolve` is total and order-preserving.
///
/// Not yet wired into `mediaLayer` (which still shows `primaryReelMedia`): it is
/// the tested foundation for the deferred images+audio mixed-media composition.
enum ReelMediaLayout: Equatable {
    /// No playable/visual media (documents only, or empty).
    case empty
    /// A single video drives the reel — video wins over every other kind.
    case video(FeedMedia)
    /// One or more images, no audio: a full-screen image carousel.
    case images([FeedMedia])
    /// One or more audios, no images and no video: the rich audio surface.
    case audioOnly([FeedMedia])
    /// Images (full-screen carousel background) with one or more audios.
    case imagesWithAudio(images: [FeedMedia], audios: [FeedMedia])

    /// Classifies `media` into a layout. Video has top priority; otherwise the
    /// presence of images and/or audios decides. Documents are ignored
    /// (never a reel surface), so a post carrying only those resolves to `.empty`.
    static func resolve(media: [FeedMedia]) -> ReelMediaLayout {
        if let video = media.first(where: { $0.type == .video }) { return .video(video) }
        let images = media.filter { $0.type == .image }
        let audios = media.filter { $0.type == .audio }
        switch (images.isEmpty, audios.isEmpty) {
        case (true, true): return .empty
        case (false, true): return .images(images)
        case (true, false): return .audioOnly(audios)
        case (false, false): return .imagesWithAudio(images: images, audios: audios)
        }
    }

    static func == (lhs: ReelMediaLayout, rhs: ReelMediaLayout) -> Bool {
        switch (lhs, rhs) {
        case (.empty, .empty):
            return true
        case let (.video(a), .video(b)):
            return a.id == b.id
        case let (.images(a), .images(b)):
            return a.map(\.id) == b.map(\.id)
        case let (.audioOnly(a), .audioOnly(b)):
            return a.map(\.id) == b.map(\.id)
        case let (.imagesWithAudio(ai, aa), .imagesWithAudio(bi, ba)):
            return ai.map(\.id) == bi.map(\.id) && aa.map(\.id) == ba.map(\.id)
        default:
            return false
        }
    }
}
