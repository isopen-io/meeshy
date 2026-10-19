import Foundation

// MARK: - Reel Composition (creation-time classification)

/// Decides, at creation time, whether a post's composition qualifies it as a
/// `REEL`. Règle produit (directive user 2026-08-02, étendue par la directive
/// durée minimale) : un post n'est un réel que s'il porte UNE VIDÉO (>= 3s),
/// UN AUDIO (>= 3s), ou AU MOINS DEUX IMAGES. Une image seule, un document ou
/// un lieu restent un post de base ; une vidéo/audio de moins de 3 secondes
/// (ou de durée inconnue) ne qualifie jamais à elle seule — les images ne sont
/// JAMAIS soumises à cette condition de durée. L'auteur peut toujours forcer
/// un `POST` (toggle Réel⇄Post) ; il ne peut jamais forcer un `REEL` non
/// qualifiant. Pure and stateless so it is testable and shared by every
/// composer path — miroir exact du prédicat gateway
/// (`services/gateway/src/services/posts/reelComposition.ts`).
public enum ReelComposition {
    /// Plancher de durée (ms) pour qu'une vidéo ou un audio qualifie seul —
    /// miroir de `MIN_QUALIFYING_DURATION_MS` côté gateway.
    public static let minQualifyingDurationMs = 3000

    /// `true` when a post with these media kinds qualifies as a reel: a video
    /// or audio of at least `minQualifyingDurationMs`, or at least two images.
    /// Documents and locations never qualify — and neither does a single
    /// image or a video/audio whose duration is too short or unknown.
    public static func qualifiesAsReel(mediaKinds: [(kind: FeedMediaType, durationMs: Int?)]) -> Bool {
        let hasQualifyingVideo = mediaKinds.contains { $0.kind == .video && meetsMinDuration($0.durationMs) }
        let hasQualifyingAudio = mediaKinds.contains { $0.kind == .audio && meetsMinDuration($0.durationMs) }
        // Pas de `count(where:)` : stdlib 6.0 (iOS 18+), le SDK cible iOS 16.
        let imageCount = mediaKinds.lazy.filter { $0.kind == .image }.count
        return hasQualifyingVideo || hasQualifyingAudio || imageCount >= 2
    }

    private static func meetsMinDuration(_ durationMs: Int?) -> Bool {
        guard let durationMs else { return false }
        return durationMs >= minQualifyingDurationMs
    }

    /// MIME-type convenience for the composer, which holds attachments as MIME
    /// strings rather than `FeedMediaType`. Same rule: video (>=3s) || audio
    /// (>=3s) || >= 2 images. `durationsMs` aligns by index with `mimeTypes`;
    /// an index missing from `durationsMs` (including the default `[]`) is
    /// treated as an unknown duration — non-qualifying for that video/audio
    /// entry, but never blocks the other entries (e.g. the >= 2 images rule).
    public static func qualifiesAsReel(mimeTypes: [String], durationsMs: [Int?] = []) -> Bool {
        qualifiesAsReel(mediaKinds: mediaKinds(forMimeTypes: mimeTypes, durationsMs: durationsMs))
    }

    private static func mediaKinds(forMimeTypes mimeTypes: [String], durationsMs: [Int?]) -> [(kind: FeedMediaType, durationMs: Int?)] {
        mimeTypes.enumerated().compactMap { index, mime in
            let m = mime.lowercased()
            let durationMs = index < durationsMs.count ? durationsMs[index] : nil
            if m.hasPrefix("image/") { return (kind: .image, durationMs: durationMs) }
            if m.hasPrefix("video/") { return (kind: .video, durationMs: durationMs) }
            if m.hasPrefix("audio/") { return (kind: .audio, durationMs: durationMs) }
            return nil
        }
    }

    /// The default `PostType` for a new post: `REEL` when its composition
    /// qualifies and the author hasn't forced a plain post, otherwise `POST`.
    public static func defaultType(mediaKinds: [(kind: FeedMediaType, durationMs: Int?)], forcePlainPost: Bool = false) -> PostType {
        (!forcePlainPost && qualifiesAsReel(mediaKinds: mediaKinds)) ? .reel : .post
    }

    /// MIME-type convenience overload of `defaultType`.
    public static func defaultType(mimeTypes: [String], durationsMs: [Int?] = [], forcePlainPost: Bool = false) -> PostType {
        (!forcePlainPost && qualifiesAsReel(mimeTypes: mimeTypes, durationsMs: durationsMs)) ? .reel : .post
    }
}
