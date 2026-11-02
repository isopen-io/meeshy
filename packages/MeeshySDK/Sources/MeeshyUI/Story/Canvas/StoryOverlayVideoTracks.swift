import AVFoundation
import CoreImage
import CoreMedia
import MeeshySDK

/// La piste de composition d'une vidéo superposée, et l'orientation de sa source.
public nonisolated struct StoryOverlayTrack: Sendable, Equatable {
    public let trackID: CMPersistentTrackID
    public let transform: CGAffineTransform

    public init(trackID: CMPersistentTrackID, transform: CGAffineTransform) {
        self.trackID = trackID
        self.transform = transform
    }
}

/// **Les vidéos superposées d'une story se décodent en SÉQUENCE** (#9877).
///
/// Chaque vidéo de premier plan devient une piste de la composition d'export,
/// posée à son début sur la slide et bornée à sa durée (ou à celle du clip).
/// `StoryAVCompositor` en lit l'image par `sourceFrame(byTrackID:)` : décodage
/// matériel, dans l'ordre, au lieu d'un `AVAssetImageGenerator` en accès
/// aléatoire à chaque trame de sortie. Le temps du clip reste celui de l'export
/// précédent — temps de slide moins `startTime` —, donc l'image peinte est la même.
public nonisolated enum StoryOverlayVideoTracks {

    /// Les pistes ajoutées, par id de média. Une vidéo illisible n'en a pas :
    /// le générateur d'images la sert comme avant.
    public static func compose(slide: StorySlide, into composition: AVMutableComposition,
                               storyStart: CMTime) async -> [String: StoryOverlayTrack] {
        var pistes: [String: StoryOverlayTrack] = [:]
        for media in foregroundVideos(of: slide) {
            if let piste = await compose(media, into: composition, storyStart: storyStart) {
                pistes[media.id] = piste
            }
        }
        return pistes
    }

    /// Les pistes qu'un segment de la timeline doit déclarer : les siennes,
    /// puis celles des vidéos superposées, dans un ordre stable.
    public static func requiredTrackIDs(_ base: [CMPersistentTrackID],
                                        overlays: [String: StoryOverlayTrack]) -> [CMPersistentTrackID] {
        base + overlays.values.map(\.trackID).sorted().filter { !base.contains($0) }
    }

    /// L'image d'une trame décodée, redressée et réglée comme celle que le
    /// générateur rendait (`appliesPreferredTrackTransform`, puis #9169).
    public static func frame(from pixelBuffer: CVPixelBuffer, track: StoryOverlayTrack,
                             media: StoryMediaObject) -> CGImage? {
        let redressee = StoryAVCompositor.orientedFrame(CIImage(cvPixelBuffer: pixelBuffer),
                                                        preferredTransform: track.transform)
        return StoryRenderingContext.shared.ciContext.createCGImage(redressee, from: redressee.extent)
            .map { StoryVideoAdjustmentsProcessor.apply(media, to: $0) }
    }

    static func foregroundVideos(of slide: StorySlide) -> [StoryMediaObject] {
        (slide.effects.mediaObjects ?? []).filter { $0.kind == .video && !$0.isBackground && $0.mediaURL != nil }
    }

    private static func compose(_ media: StoryMediaObject, into composition: AVMutableComposition,
                                storyStart: CMTime) async -> StoryOverlayTrack? {
        guard let adresse = media.mediaURL.flatMap(MeeshyConfig.resolveMediaURL) else { return nil }
        let asset = AVURLAsset(url: adresse)
        guard let source = try? await asset.loadTracks(withMediaType: .video).first,
              let longueur = try? await asset.load(.duration), longueur > .zero else { return nil }
        let fenetre = media.duration.map { CMTime(seconds: $0, preferredTimescale: 600) } ?? longueur
        let duree = CMTimeMinimum(longueur, fenetre)
        let debut = CMTimeAdd(storyStart, CMTime(seconds: media.startTime ?? 0, preferredTimescale: 600))
        guard duree > .zero,
              let piste = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)
        else { return nil }
        do {
            try piste.insertTimeRange(CMTimeRange(start: .zero, duration: duree), of: source, at: debut)
        } catch {
            composition.removeTrack(piste)
            return nil
        }
        let orientation = (try? await source.load(.preferredTransform)) ?? .identity
        return StoryOverlayTrack(trackID: piste.trackID, transform: orientation)
    }
}
