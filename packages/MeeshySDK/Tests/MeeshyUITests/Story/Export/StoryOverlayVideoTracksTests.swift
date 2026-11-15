import XCTest
import AVFoundation
import CoreImage
import CoreMedia
import CoreGraphics
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// #9877 — **les vidéos superposées d'une story se décodent en séquence.**
///
/// L'export tirait une image par trame de sortie avec `AVAssetImageGenerator`,
/// en accès aléatoire. Chaque vidéo superposée devient désormais une piste de
/// la composition, lue par `sourceFrame(byTrackID:)` : décodage matériel, dans
/// l'ordre. Le générateur ne reste qu'en repli pour une vidéo illisible.
final class StoryOverlayVideoTracksTests: XCTestCase {

    // MARK: - Pistes de la composition

    func test_compose_addsOneTrackPerForegroundVideo_atItsStartInTheStory() async throws {
        let url = try await Self.video(seconds: 2)
        let slide = Self.slide([
            Self.media(id: "fg", url: url, startTime: 0.5, duration: 1),
            Self.media(id: "fond", url: url, isBackground: true),
            Self.media(id: "photo", url: url, kind: "image"),
        ])
        let composition = AVMutableComposition()

        let pistes = await StoryOverlayVideoTracks.compose(slide: slide, into: composition,
                                                           storyStart: CMTime(seconds: 1, preferredTimescale: 600))

        XCTAssertEqual(Array(pistes.keys), ["fg"], "ni le fond, ni une image ne sont des vidéos superposées")
        let segment = try XCTUnwrap(Self.filledSegments(of: try XCTUnwrap(pistes["fg"]), in: composition).first)
        XCTAssertEqual(segment.target.start.seconds, 1.5, accuracy: 0.01, "posée à son début, en temps de composition")
        XCTAssertEqual(segment.target.duration.seconds, 1, accuracy: 0.05, "bornée à sa durée sur la slide")
    }

    func test_compose_aVideoShorterThanItsWindow_endsWithItsClip() async throws {
        let url = try await Self.video(seconds: 1)
        let slide = Self.slide([Self.media(id: "fg", url: url, startTime: 0, duration: 5)])
        let composition = AVMutableComposition()

        let pistes = await StoryOverlayVideoTracks.compose(slide: slide, into: composition, storyStart: .zero)

        let segment = try XCTUnwrap(Self.filledSegments(of: try XCTUnwrap(pistes["fg"]), in: composition).first)
        XCTAssertEqual(segment.target.duration.seconds, 1, accuracy: 0.05)
    }

    /// Une vidéo illisible n'a pas de piste : le générateur d'images la sert
    /// comme avant, et l'export n'échoue pas pour elle.
    func test_compose_anUnreadableVideo_getsNoTrack() async {
        let slide = Self.slide([Self.media(id: "fg", url: URL(fileURLWithPath: "/nulle/part.mp4"))])

        let pistes = await StoryOverlayVideoTracks.compose(slide: slide, into: AVMutableComposition(), storyStart: .zero)

        XCTAssertTrue(pistes.isEmpty)
    }

    /// Chaque segment de la timeline déclare les pistes superposées : sinon
    /// AVFoundation ne livre pas leurs images au compositeur.
    func test_requiredTrackIDs_appendTheOverlayTracks() {
        let pistes = ["b": StoryOverlayTrack(trackID: 9, transform: .identity),
                      "a": StoryOverlayTrack(trackID: 7, transform: .identity)]

        XCTAssertEqual(StoryOverlayVideoTracks.requiredTrackIDs([1, 2], overlays: pistes), [1, 2, 7, 9])
    }

    // MARK: - Les images servies au compositeur

    /// Une vidéo qui a sa piste est servie par l'image que la composition a
    /// décodée — jamais par le générateur, même quand celui-ci pourrait lire.
    func test_decodeOverlayFrames_servesTheTrackFrame() async throws {
        let url = try await Self.video(seconds: 1)
        let media = Self.media(id: "fg", url: url)
        let trame = try XCTUnwrap(Self.pixelBuffer(width: 40, height: 20))

        let images = StoryForegroundVideoFrameSource().decodeOverlayFrames(
            slide: Self.slide([media]), at: CMTime(seconds: 0.2, preferredTimescale: 600),
            trackFrames: ["fg": trame], tracks: ["fg": StoryOverlayTrack(trackID: 3, transform: .identity)])

        XCTAssertEqual(images["fg"]?.width, 40, "l'image de la piste, pas celle du fichier (64 px)")
        XCTAssertEqual(images["fg"]?.height, 20)
    }

    /// Hors de sa fenêtre, une vidéo qui a sa piste ne se rattrape pas par le
    /// générateur : la composition ne livre rien, rien ne se peint.
    func test_decodeOverlayFrames_aTrackWithoutFrame_paintsNothing() async throws {
        let url = try await Self.video(seconds: 1)
        let images = StoryForegroundVideoFrameSource().decodeOverlayFrames(
            slide: Self.slide([Self.media(id: "fg", url: url)]), at: CMTime(seconds: 0.2, preferredTimescale: 600),
            trackFrames: [:], tracks: ["fg": StoryOverlayTrack(trackID: 3, transform: .identity)])

        XCTAssertNil(images["fg"])
    }

    func test_decodeOverlayFrames_withoutTrack_fallsBackToTheGenerator() async throws {
        let url = try await Self.video(seconds: 1)
        let images = StoryForegroundVideoFrameSource().decodeOverlayFrames(
            slide: Self.slide([Self.media(id: "fg", url: url)]), at: CMTime(seconds: 0.2, preferredTimescale: 600),
            trackFrames: [:], tracks: [:])

        XCTAssertEqual(images["fg"]?.width, 64)
    }

    /// Un clip tourné (portrait filmé couché) sort redressé, comme avec
    /// `appliesPreferredTrackTransform`.
    func test_frame_appliesThePreferredTransform() throws {
        let trame = try XCTUnwrap(Self.pixelBuffer(width: 40, height: 20))
        let quartDeTour = CGAffineTransform(a: 0, b: 1, c: -1, d: 0, tx: 20, ty: 0)

        let image = StoryOverlayVideoTracks.frame(from: trame, track: StoryOverlayTrack(trackID: 1, transform: quartDeTour),
                                                  media: Self.media(id: "fg", url: URL(fileURLWithPath: "/x.mp4")))

        XCTAssertEqual(image?.width, 20)
        XCTAssertEqual(image?.height, 40)
    }

    /// **Parité avec l'export actuel** : à un même instant, l'image lue par la
    /// piste et celle du générateur ont les mêmes couleurs.
    func test_trackFrame_matchesTheGeneratorFrame() async throws {
        let url = try await Self.video(seconds: 1, fill: (40, 160, 220, 255))
        let media = Self.media(id: "fg", url: url)
        let generateur = try XCTUnwrap(StoryForegroundVideoFrameSource().frame(
            for: media, at: CMTime(seconds: 0.1, preferredTimescale: 600)))
        let decodee = try await Self.firstDecodedFrame(of: url)
        let trame = try XCTUnwrap(decodee)
        let piste = try XCTUnwrap(StoryOverlayVideoTracks.frame(from: trame, track: StoryOverlayTrack(trackID: 1, transform: .identity),
                                                                media: media))

        zip(Self.average(of: generateur), Self.average(of: piste)).forEach {
            XCTAssertEqual(Double($0), Double($1), accuracy: 3)
        }
    }

    // MARK: - Fabriques

    private static func video(seconds: TimeInterval,
                              fill: (b: UInt8, g: UInt8, r: UInt8, a: UInt8) = (0, 0, 255, 255)) async throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("overlay-\(UUID().uuidString).mp4")
        try await BackgroundVideoFixture.makeVideo(duration: seconds, size: CGSize(width: 64, height: 64), at: url, fill: fill)
        return url
    }

    private static func media(id: String, url: URL, isBackground: Bool = false, kind: String = "video",
                              startTime: Double? = 0, duration: Double? = nil) -> StoryMediaObject {
        StoryMediaObject(id: id, postMediaId: id, mediaURL: url.absoluteString, mediaType: kind,
                         aspectRatio: 1, isBackground: isBackground, startTime: startTime, duration: duration)
    }

    private static func slide(_ medias: [StoryMediaObject]) -> StorySlide {
        var effects = StoryEffects()
        effects.mediaObjects = medias
        effects.timelineDuration = 3
        return StorySlide(id: UUID().uuidString, effects: effects, duration: 3, order: 0)
    }

    private static func filledSegments(of track: StoryOverlayTrack,
                                       in composition: AVMutableComposition) -> [CMTimeMapping] {
        (composition.track(withTrackID: track.trackID)?.segments ?? [])
            .filter { !$0.isEmpty }
            .map(\.timeMapping)
    }

    private static func pixelBuffer(width: Int, height: Int) -> CVPixelBuffer? {
        var buffer: CVPixelBuffer?
        let attributs: [String: Any] = [kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any]()]
        CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA,
                            attributs as CFDictionary, &buffer)
        return buffer
    }

    private static func firstDecodedFrame(of url: URL) async throws -> CVPixelBuffer? {
        let asset = AVURLAsset(url: url)
        let pistes = try await asset.loadTracks(withMediaType: .video)
        let track = try XCTUnwrap(pistes.first)
        let reader = try AVAssetReader(asset: asset)
        let sortie = AVAssetReaderTrackOutput(track: track, outputSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        ])
        reader.add(sortie)
        reader.startReading()
        return sortie.copyNextSampleBuffer().flatMap(CMSampleBufferGetImageBuffer)
    }

    private static func average(of image: CGImage) -> [UInt8] {
        let ci = CIImage(cgImage: image)
        guard let moyenne = CIFilter(name: "CIAreaAverage", parameters: [
            kCIInputImageKey: ci, "inputExtent": CIVector(cgRect: ci.extent),
        ])?.outputImage else { return [] }
        var octets = [UInt8](repeating: 0, count: 4)
        StoryRenderingContext.shared.ciContext.render(moyenne, toBitmap: &octets, rowBytes: 4,
                                                      bounds: CGRect(x: 0, y: 0, width: 1, height: 1),
                                                      format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
        return Array(octets.prefix(3))
    }
}
