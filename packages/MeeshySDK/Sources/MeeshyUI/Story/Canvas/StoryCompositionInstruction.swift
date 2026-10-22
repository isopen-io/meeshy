import AVFoundation
import CoreMedia
import CoreVideo
import UIKit
import MeeshySDK

/// Composition instruction carrying the `StorySlide` whose frame at any given
/// `CMTime` is delegated to `StoryRenderer.render` by `StoryAVCompositor`.
/// `languages` is threaded so the baked MP4 reflects the author's chosen
/// export language (Prisme Linguistique).
public final class StoryCompositionInstruction: NSObject,
                                                 AVVideoCompositionInstructionProtocol,
                                                 @unchecked Sendable {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    public let slide: StorySlide
    public let languages: [String]
    public let timeRange: CMTimeRange
    public let watermark: StoryExportWatermark?
    /// `preferredTransform` of the background video track (identity when the
    /// slide has no background video). The custom compositor receives decoded
    /// source frames in their storage orientation, so it must apply this itself.
    public let backgroundVideoTransform: CGAffineTransform
    /// Décalage de la story dans la composition — non nul quand un interlude de
    /// marque la précède. TOUT le rendu de la slide se fait à
    /// `compositionTime - storyStart` : keyframes, transitions et filigrane
    /// restent datés en temps de story.
    public let storyStart: CMTime
    /// Piste portant le substrat de la story (fond vidéo ou substrat synthétique).
    public let storyTrackID: CMPersistentTrackID
    /// Pistes des clips de marque, `nil` quand l'emballage est absent.
    public let introTrackID: CMPersistentTrackID?
    public let outroTrackID: CMPersistentTrackID?
    /// Fenêtres de fondu, en temps de COMPOSITION.
    public let introFade: CMTimeRange?
    public let outroFade: CMTimeRange?
    /// Adresses LOCALES des bitmaps des stickers IMAGE de la slide, keyées par
    /// `postMediaId` (#4852). Un `StorySticker` ne porte pas d'URL — seulement
    /// l'id de son `PostMedia` — et le compositor n'a ni la liste des médias ni
    /// le droit de télécharger : c'est à `StoryExporter` de les rapatrier avant
    /// la composition, comme il le fait pour `mediaURL`. Vide = les stickers
    /// image sortent sous leur repli 🖼️.
    public let stickerImageURLs: [String: URL]
    /// Bitmaps en mémoire remis par l'appelant (`StoryExportInputs.images`,
    /// #8599) — ils priment sur les fichiers de `stickerImageURLs` et sur la
    /// `mediaURL` du fond image.
    public let images: [String: UIImage]
    /// Octets ANIMÉS des stickers (`StoryExportInputs.animations`, #8610).
    public let animations: [String: Data]
    /// Les pistes des vidéos superposées, par id de média (#9877) : leurs
    /// images se lisent dans la composition, en séquence.
    public let overlayTracks: [String: StoryOverlayTrack]
    public let enablePostProcessing: Bool = false
    public let containsTweening: Bool = true
    /// Pistes que ce segment consomme RÉELLEMENT.
    ///
    /// `nil` signifie « toutes les pistes de la composition » : AVFoundation
    /// décode alors les trois pistes (story + interlude + carte de fin) pour
    /// CHAQUE frame, y compris là où deux d'entre elles sont invisibles. Avec
    /// l'emballage composé dans le bake, ça multipliait le coût de l'export.
    /// `StoryExporter` segmente donc la timeline et déclare, segment par
    /// segment, les seules pistes utiles.
    public let requiredSourceTrackIDs: [NSValue]?
    public let passthroughTrackID: CMPersistentTrackID = kCMPersistentTrackID_Invalid

    public nonisolated init(slide: StorySlide, languages: [String] = [],
                            timeRange: CMTimeRange,
                            watermark: StoryExportWatermark? = nil,
                            backgroundVideoTransform: CGAffineTransform = .identity,
                            storyStart: CMTime = .zero,
                            storyTrackID: CMPersistentTrackID = kCMPersistentTrackID_Invalid,
                            introTrackID: CMPersistentTrackID? = nil,
                            outroTrackID: CMPersistentTrackID? = nil,
                            introFade: CMTimeRange? = nil,
                            outroFade: CMTimeRange? = nil,
                            requiredSourceTrackIDs: [NSValue]? = nil,
                            stickerImageURLs: [String: URL] = [:],
                            images: [String: UIImage] = [:],
                            animations: [String: Data] = [:],
                            overlayTracks: [String: StoryOverlayTrack] = [:]) {
        self.overlayTracks = overlayTracks
        self.requiredSourceTrackIDs = requiredSourceTrackIDs
        self.animations = animations
        self.stickerImageURLs = stickerImageURLs
        self.images = images
        self.slide = slide
        self.languages = languages
        self.timeRange = timeRange
        self.watermark = watermark
        self.backgroundVideoTransform = backgroundVideoTransform
        self.storyStart = storyStart
        self.storyTrackID = storyTrackID
        self.introTrackID = introTrackID
        self.outroTrackID = outroTrackID
        self.introFade = introFade
        self.outroFade = outroFade
        super.init()
    }

    /// Les trames que la composition a décodées pour les vidéos superposées.
    nonisolated func overlayFrames(in request: AVAsynchronousVideoCompositionRequest) -> [String: CVPixelBuffer] {
        overlayTracks.compactMapValues { request.sourceFrame(byTrackID: $0.trackID) }
    }

    /// Opacité de la couche STORY au temps de composition `t` : elle se lève
    /// pendant le fondu d'ouverture, tient, puis s'efface sous la carte de fin.
    /// Hors emballage, elle vaut 1 partout.
    nonisolated func storyOpacity(at t: CMTime) -> CGFloat {
        var alpha: CGFloat = 1
        if let fade = introFade, fade.duration > .zero {
            alpha *= Self.progress(t, in: fade)
        }
        if let fade = outroFade, fade.duration > .zero {
            alpha *= 1 - Self.progress(t, in: fade)
        }
        return alpha
    }

    /// Opacité de la carte de fin : nulle avant son fondu, pleine ensuite.
    nonisolated func outroOpacity(at t: CMTime) -> CGFloat {
        guard let fade = outroFade, fade.duration > .zero else { return 0 }
        return Self.progress(t, in: fade)
    }

    /// Fraction `0…1` de `t` dans `range`, bornée aux extrémités.
    nonisolated static func progress(_ t: CMTime, in range: CMTimeRange) -> CGFloat {
        if t <= range.start { return 0 }
        let end = CMTimeAdd(range.start, range.duration)
        if t >= end { return 1 }
        return CGFloat(CMTimeGetSeconds(CMTimeSubtract(t, range.start))
                       / CMTimeGetSeconds(range.duration))
    }
}
