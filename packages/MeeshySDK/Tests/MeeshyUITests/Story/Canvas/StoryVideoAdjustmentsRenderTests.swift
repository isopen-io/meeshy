import XCTest
import AVFoundation
import CoreImage
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Les réglages d'une VIDÉO posée sont peints trame par trame, par la même
/// chaîne que l'image** (#9169). Le player de lecture et l'aperçu du composer
/// les reçoivent par la composition vidéo de leur item ; l'export, par les
/// trames qu'il décode. Les deux chemins passent par
/// `StoryVideoAdjustmentsProcessor` : ce qu'on voit est ce qui part (loi 6).
final class StoryVideoAdjustmentsRenderTests: XCTestCase {

    // MARK: - Fabriques

    private func video(_ reglages: ImageAdjustments?, url: URL? = nil) -> StoryMediaObject {
        var media = StoryMediaObject(id: "clip", mediaURL: url?.absoluteString, kind: .video, aspectRatio: 1)
        media.adjustments = reglages
        return media
    }

    private func gris(_ niveau: CGFloat = 0.4) -> CIImage {
        CIImage(color: CIColor(red: niveau, green: niveau, blue: niveau)).cropped(to: CGRect(x: 0, y: 0, width: 8, height: 8))
    }

    private func luminance(_ cg: CGImage?) throws -> Int {
        let image = try XCTUnwrap(cg)
        var pixel = [UInt8](repeating: 0, count: 4)
        let contexte = try XCTUnwrap(CGContext(data: &pixel, width: 1, height: 1, bitsPerComponent: 8,
                                               bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(),
                                               bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        contexte.draw(image, in: CGRect(x: -CGFloat(image.width) / 2, y: -CGFloat(image.height) / 2,
                                        width: CGFloat(image.width), height: CGFloat(image.height)))
        return (Int(pixel[0]) + Int(pixel[1]) + Int(pixel[2])) / 3
    }

    private func luminance(_ image: CIImage) throws -> Int {
        try luminance(CIContext().createCGImage(image, from: image.extent))
    }

    // MARK: - Le modèle, par le ViewModel

    @MainActor
    func test_reglerUneVideoPosee_ecritLeReglageSurElle() throws {
        let vm = StoryComposerViewModel()
        let clip = try XCTUnwrap(vm.addMediaObject(kind: .video))
        vm.setMediaObjectAdjustment(id: clip.id, .saturation, to: 0.3)
        XCTAssertEqual(vm.mediaObjectAdjustments(id: clip.id)[.saturation], 0.3)
    }

    @MainActor
    func test_unFlouPoseSurUneVideo_nEstPasEcrit() throws {
        let vm = StoryComposerViewModel()
        let clip = try XCTUnwrap(vm.addMediaObject(kind: .video))
        vm.setMediaObjectAdjustment(id: clip.id, .blur, to: 0.8)
        vm.setMediaObjectAdjustment(id: clip.id, .sharpness, to: 0.8)
        XCTAssertNil(vm.currentEffects.mediaObjects?.first { $0.id == clip.id }?.adjustments,
                     "Un réglage qu'une vidéo ne peint pas n'a rien à faire au fil.")
    }

    // MARK: - Ce qu'une vidéo peint

    func test_uneImage_nEstPasPeinteParLeCheminVideo() {
        var image = StoryMediaObject(id: "i", kind: .image, aspectRatio: 1)
        image.adjustments = ImageAdjustments(exposure: 1)
        XCTAssertNil(StoryVideoAdjustmentsProcessor.paintedAdjustments(for: image))
    }

    func test_uneVideoSansReglage_neCoutePasUneTrame() {
        XCTAssertNil(StoryVideoAdjustmentsProcessor.paintedAdjustments(for: video(nil)))
        XCTAssertNil(StoryVideoAdjustmentsProcessor.paintedAdjustments(for: video(.neutral)))
    }

    func test_unFlouPorteParLaCharge_nEstJamaisPeintSurUneVideo() {
        XCTAssertNil(StoryVideoAdjustmentsProcessor.paintedAdjustments(for: video(ImageAdjustments(sharpness: 1, blur: 1))),
                     "La charge ne décide pas du coût d'un rendu vidéo.")
        XCTAssertEqual(StoryVideoAdjustmentsProcessor.paintedAdjustments(for: video(ImageAdjustments(contrast: 1.2, blur: 1))),
                       ImageAdjustments(contrast: 1.2))
    }

    func test_unFondVideo_nEstPasPeint() {
        var fond = video(ImageAdjustments(exposure: 1))
        fond.isBackground = true
        XCTAssertNil(StoryVideoAdjustmentsProcessor.paintedAdjustments(for: fond),
                     "Le fond ne peint pas encore les réglages (#9496) — ni image, ni vidéo.")
    }

    // MARK: - Une trame

    func test_uneExpositionPositive_eclaircitLaTrame() throws {
        let source = gris()
        let reglee = StoryVideoAdjustmentsProcessor.frame(source, ImageAdjustments(exposure: 1.5))
        XCTAssertGreaterThan(try luminance(reglee), try luminance(source) + 20)
        XCTAssertEqual(reglee.extent, source.extent, "La trame garde son cadre.")
    }

    func test_unFlouSeul_rendLaTrameTelleQuelle() {
        let source = gris()
        XCTAssertTrue(StoryVideoAdjustmentsProcessor.frame(source, ImageAdjustments(blur: 1)) === source)
    }

    func test_leContexteDeRendu_estPartageEntreLesTrames() {
        XCTAssertTrue(StoryVideoAdjustmentsProcessor.context === StoryVideoAdjustmentsProcessor.context,
                      "Aucun CIContext n'est créé par trame.")
    }

    // MARK: - L'export décode des trames RÉGLÉES

    func test_lExport_peintLesReglagesDansLaTrameDecodee() async throws {
        let url = try await Self.writeGrayClip()
        let source = StoryForegroundVideoFrameSource()
        let t = CMTime(seconds: 0.1, preferredTimescale: 600)
        let brute = source.frame(for: video(nil, url: url), at: t)
        let reglee = StoryForegroundVideoFrameSource().frame(for: video(ImageAdjustments(exposure: 1.5), url: url), at: t)
        XCTAssertGreaterThan(try luminance(reglee), try luminance(brute) + 20,
                             "La pièce rendue porte le réglage que l'aperçu montrait.")
    }

    // MARK: - La lecture : la composition de l'item

    func test_laComposition_peintLeReglageDansLesTramesLues() async throws {
        let url = try await Self.writeGrayClip()
        let asset = AVURLAsset(url: url)
        let composition = try await StoryVideoAdjustmentsProcessor.composition(for: asset,
                                                                                adjustments: ImageAdjustments(exposure: 1.5))
        let brut = AVAssetImageGenerator(asset: asset)
        let regle = AVAssetImageGenerator(asset: asset)
        regle.videoComposition = composition
        let t = CMTime(seconds: 0.1, preferredTimescale: 600)
        let avant = try luminance(brut.copyCGImage(at: t, actualTime: nil))
        let apres = try luminance(regle.copyCGImage(at: t, actualTime: nil))
        XCTAssertGreaterThan(apres, avant + 20, "Le player lit la même composition : il voit la trame réglée.")
    }

    @MainActor
    func test_laCouche_poseLaCompositionSurSonItem_puisLaRetireAuNeutre() async throws {
        let url = try await Self.writeGrayClip()
        let layer = StoryMediaLayer()
        let geometrie = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        layer.configure(with: video(ImageAdjustments(saturation: 0.2), url: url), geometry: geometrie,
                        mode: .edit, resolver: { _ in url })
        try await Self.attendre { layer.avPlayer?.currentItem?.videoComposition != nil }

        layer.configure(with: video(nil, url: url), geometry: geometrie, mode: .edit, resolver: { _ in url })
        try await Self.attendre { layer.avPlayer?.currentItem?.videoComposition == nil }
    }

    @MainActor
    func test_laCouche_neComposeRienPourUneVideoSansReglage() async throws {
        let url = try await Self.writeGrayClip()
        let layer = StoryMediaLayer()
        layer.configure(with: video(nil, url: url), geometry: CanvasGeometry(renderSize: CGSize(width: 412, height: 732)),
                        mode: .edit, resolver: { _ in url })
        try await Task.sleep(nanoseconds: 300_000_000)
        XCTAssertNil(layer.avPlayer?.currentItem?.videoComposition,
                     "Une vidéo sans réglage passe par le compositeur natif — zéro coût par trame.")
    }

    // MARK: - Outils

    @MainActor
    private static func attendre(_ condition: @MainActor () -> Bool, timeout: TimeInterval = 5) async throws {
        let limite = Date().addingTimeInterval(timeout)
        while !condition() {
            guard Date() < limite else { return XCTFail("Condition jamais atteinte") }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
    }

    /// Un clip gris de 64×64, 10 trames à 30 i/s.
    private static func writeGrayClip() async throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("gris-\(UUID().uuidString).mp4")
        let side = 64
        let writer = try AVAssetWriter(url: url, fileType: .mp4)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: side,
            AVVideoHeightKey: side
        ])
        input.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
            kCVPixelBufferWidthKey as String: side,
            kCVPixelBufferHeightKey as String: side
        ])
        writer.add(input)
        guard writer.startWriting() else { throw writer.error ?? NSError(domain: "GrayClip", code: 1) }
        writer.startSession(atSourceTime: .zero)
        for frame in 0..<10 {
            while !input.isReadyForMoreMediaData { try await Task.sleep(nanoseconds: 1_000_000) }
            guard let pool = adaptor.pixelBufferPool else { throw NSError(domain: "GrayClip", code: 2) }
            var created: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &created)
            guard let buffer = created else { throw NSError(domain: "GrayClip", code: 3) }
            CVPixelBufferLockBaseAddress(buffer, [])
            let base = CVPixelBufferGetBaseAddress(buffer)!.assumingMemoryBound(to: UInt8.self)
            let bytesPerRow = CVPixelBufferGetBytesPerRow(buffer)
            for offset in stride(from: 0, to: bytesPerRow * side, by: 4) {
                base[offset] = 100
                base[offset + 1] = 100
                base[offset + 2] = 100
                base[offset + 3] = 255
            }
            CVPixelBufferUnlockBaseAddress(buffer, [])
            adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(frame), timescale: 30))
        }
        input.markAsFinished()
        await writer.finishWriting()
        guard writer.status == .completed else { throw writer.error ?? NSError(domain: "GrayClip", code: 4) }
        return url
    }
}
