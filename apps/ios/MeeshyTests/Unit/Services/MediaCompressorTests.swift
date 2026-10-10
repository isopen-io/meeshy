import XCTest
import ImageIO
import AVFoundation
import CoreMedia
import MeeshyUI
@testable import Meeshy

@MainActor
final class MediaCompressorTests: XCTestCase {

    private func makeSUT() -> MediaCompressor {
        MediaCompressor.shared
    }

    // MARK: - compressImage (UIImage -> JPEG)

    func test_compressImage_producesJPEGResult() async {
        let sut = makeSUT()
        let image = makeTestImage(width: 100, height: 100)

        let result = await sut.compressImage(image)

        XCTAssertEqual(result.mimeType, "image/jpeg")
        XCTAssertFalse(result.data.isEmpty)
    }

    func test_compressImage_fileExtension_returnsJpg() async {
        let sut = makeSUT()
        let image = makeTestImage(width: 100, height: 100)

        let result = await sut.compressImage(image)

        XCTAssertEqual(result.fileExtension, "jpg")
    }

    func test_compressImage_smallImage_doesNotResize() async {
        let sut = makeSUT()
        let image = makeTestImage(width: 500, height: 500)

        let result = await sut.compressImage(image, maxDimension: 2048)

        XCTAssertFalse(result.data.isEmpty)
        XCTAssertEqual(result.mimeType, "image/jpeg")
    }

    func test_compressImage_largeImage_producesOutput() async {
        let sut = makeSUT()
        let image = makeTestImage(width: 4000, height: 3000)

        let result = await sut.compressImage(image, maxDimension: 2048)

        XCTAssertFalse(result.data.isEmpty)
        XCTAssertEqual(result.mimeType, "image/jpeg")
        XCTAssertNotNil(UIImage(data: result.data))
    }

    func test_compressImage_wideImage_producesOutput() async {
        let sut = makeSUT()
        let image = makeTestImage(width: 5000, height: 1000)

        let result = await sut.compressImage(image, maxDimension: 2048)

        XCTAssertFalse(result.data.isEmpty)
        XCTAssertEqual(result.mimeType, "image/jpeg")
        XCTAssertNotNil(UIImage(data: result.data))
    }

    func test_compressImage_tallImage_producesOutput() async {
        let sut = makeSUT()
        let image = makeTestImage(width: 1000, height: 5000)

        let result = await sut.compressImage(image, maxDimension: 2048)

        XCTAssertFalse(result.data.isEmpty)
        XCTAssertEqual(result.mimeType, "image/jpeg")
        XCTAssertNotNil(UIImage(data: result.data))
    }

    /// **#6922 — une image réduite partait TROIS fois plus grande.** Le rendu
    /// de `downsample(cgImage:)` prenait l'échelle de l'écran : une photo de
    /// 4 000 px « réduite » à 2 048 points sortait à 6 144 px sur un écran ×3,
    /// soit un bitmap transitoire de 113 Mo par image et un JPEG plus lourd que
    /// l'original. Le plafond se compte en PIXELS.
    func test_compressImage_largeImage_encodesAtTheCapInPixels() async throws {
        let image = makeTestImage(width: 4000, height: 1000)

        let result = await makeSUT().compressImage(image, maxDimension: 2048)

        XCTAssertEqual(try pixelSize(of: result.data), CGSize(width: 2048, height: 512))
    }

    /// Le composer tient ses photos à la taille que la publication envoie
    /// (`SceneImageDownsampling.workingMaxPixelSize`) : si l'un bouge sans
    /// l'autre, la scène montrerait plus — ou moins — que ce qui part.
    func test_compressImage_defaultCap_isTheComposerWorkingSize() async throws {
        let image = makeTestImage(width: 5000, height: 1000)

        let result = await makeSUT().compressImage(image)

        let taille = try pixelSize(of: result.data)
        XCTAssertEqual(max(taille.width, taille.height), SceneImageDownsampling.workingMaxPixelSize)
    }

    private func pixelSize(of data: Data) throws -> CGSize {
        let source = try XCTUnwrap(CGImageSourceCreateWithData(data as CFData, nil))
        let proprietes = try XCTUnwrap(CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any])
        let largeur = try XCTUnwrap(proprietes[kCGImagePropertyPixelWidth] as? NSNumber)
        let hauteur = try XCTUnwrap(proprietes[kCGImagePropertyPixelHeight] as? NSNumber)
        return CGSize(width: largeur.doubleValue, height: hauteur.doubleValue)
    }

    // MARK: - compressImageData — MIME Detection

    func test_compressImageData_jpegMagicBytes_detectsJPEG() async {
        let sut = makeSUT()
        let jpegData = makeJPEGData()

        let result = await sut.compressImageData(jpegData)

        XCTAssertEqual(result.mimeType, "image/jpeg")
    }

    func test_compressImageData_pngMagicBytes_detectsPNG() async {
        let sut = makeSUT()
        let pngData = makePNGData()

        let result = await sut.compressImageData(pngData)

        XCTAssertEqual(result.mimeType, "image/png")
    }

    func test_compressImageData_gifMagicBytes_detectsGIF() async {
        let sut = makeSUT()
        let gifData = makeGIFMagicBytes()

        let result = await sut.compressImageData(gifData)

        XCTAssertEqual(result.mimeType, "image/gif")
    }

    func test_compressImageData_webpMagicBytes_detectsWebP() async {
        let sut = makeSUT()
        let webpData = makeWebPMagicBytes()

        let result = await sut.compressImageData(webpData)

        XCTAssertEqual(result.mimeType, "image/webp")
    }

    func test_compressImageData_unknownBytes_defaultsToJPEG() async {
        let sut = makeSUT()
        var unknownData = Data(repeating: 0x00, count: 20)
        unknownData[0] = 0xAA

        let result = await sut.compressImageData(unknownData)

        XCTAssertEqual(result.mimeType, "image/jpeg")
    }

    // MARK: - compressImageData — GIF/WebP pass-through

    func test_compressImageData_gifData_passesThrough() async {
        let sut = makeSUT()
        let gifData = makeGIFMagicBytes()

        let result = await sut.compressImageData(gifData)

        XCTAssertEqual(result.data, gifData)
        XCTAssertEqual(result.mimeType, "image/gif")
    }

    func test_compressImageData_webpData_passesThrough() async {
        let sut = makeSUT()
        let webpData = makeWebPMagicBytes()

        let result = await sut.compressImageData(webpData)

        XCTAssertEqual(result.data, webpData)
        XCTAssertEqual(result.mimeType, "image/webp")
    }

    // MARK: - compressImageData — JPEG format preservation

    func test_compressImageData_jpegFormat_preservesMimeType() async {
        let sut = makeSUT()
        let jpegData = makeJPEGData()

        let result = await sut.compressImageData(jpegData)

        XCTAssertEqual(result.mimeType, "image/jpeg")
        XCTAssertFalse(result.data.isEmpty)
    }

    // MARK: - compressImageData — HEIC transcoded to web-safe JPEG

    /// A photo shot on iPhone with "High Efficiency" enabled arrives here as
    /// real HEIC bytes. The web client cannot render HEIC inline — the
    /// output MUST be actual JPEG (mime AND bytes), not HEIC data wearing a
    /// `.jpg` extension.
    func test_compressImageData_heicMagicBytes_transcodesToRealJPEG() async {
        let sut = makeSUT()
        let heicData = makeHEICData()

        let result = await sut.compressImageData(heicData, maxDimension: 2048)

        XCTAssertEqual(result.mimeType, "image/jpeg")
        XCTAssertEqual(result.fileExtension, "jpg")
        XCTAssertFalse(result.data.isEmpty)
        let magic = [UInt8](result.data.prefix(3))
        XCTAssertEqual(magic, [0xFF, 0xD8, 0xFF], "output bytes must be a real JPEG stream, not renamed HEIC")
        XCTAssertNotNil(UIImage(data: result.data))
    }

    // MARK: - compressImageData — HEIC downsample failure must not mislabel bytes

    /// If ImageIO fails to decode/downsample a genuinely HEIC-tagged buffer
    /// (corrupt transfer, exotic container), the fallback MUST return the
    /// untouched original bytes tagged with the ORIGINAL detected mime
    /// ("image/heic") — never hardcode "image/jpeg" over real HEIC bytes,
    /// which would reintroduce the exact "lying extension" bug this branch
    /// was merged to eliminate, just on the failure path instead of success.
    func test_compressImageData_corruptHEICBytes_downsampleFails_preservesBytesAndOriginalMime() async {
        let sut = makeSUT()
        let corruptHEICData = makeCorruptHEICMagicBytes()

        let result = await sut.compressImageData(corruptHEICData, maxDimension: 2048)

        XCTAssertEqual(result.data, corruptHEICData, "must not alter bytes when transcode fails")
        XCTAssertEqual(result.mimeType, "image/heic", "must not mislabel undecoded HEIC bytes as image/jpeg")
    }

    // MARK: - compressImageData — PNG format preservation

    func test_compressImageData_pngFormat_preservesMimeType() async {
        let sut = makeSUT()
        let pngData = makePNGData()

        let result = await sut.compressImageData(pngData)

        XCTAssertEqual(result.mimeType, "image/png")
        XCTAssertFalse(result.data.isEmpty)
    }

    func test_compressImageData_smallPNG_doesNotRecompress() async {
        let sut = makeSUT()
        let pngData = makePNGData(width: 100, height: 100)

        let result = await sut.compressImageData(pngData, maxDimension: 2048)

        XCTAssertEqual(result.mimeType, "image/png")
        XCTAssertEqual(result.data, pngData)
    }

    func test_compressImageData_largePNG_producesResizedOutput() async {
        let sut = makeSUT()
        let pngData = makePNGData(width: 3000, height: 3000)

        let result = await sut.compressImageData(pngData, maxDimension: 2048)

        XCTAssertEqual(result.mimeType, "image/png")
        XCTAssertFalse(result.data.isEmpty)
        XCTAssertNotNil(UIImage(data: result.data))
    }

    // MARK: - CompressedImageResult.fileExtension

    func test_fileExtension_jpeg() {
        let result = CompressedImageResult(data: Data(), mimeType: "image/jpeg")
        XCTAssertEqual(result.fileExtension, "jpg")
    }

    func test_fileExtension_png() {
        let result = CompressedImageResult(data: Data(), mimeType: "image/png")
        XCTAssertEqual(result.fileExtension, "png")
    }

    func test_fileExtension_gif() {
        let result = CompressedImageResult(data: Data(), mimeType: "image/gif")
        XCTAssertEqual(result.fileExtension, "gif")
    }

    func test_fileExtension_webp() {
        let result = CompressedImageResult(data: Data(), mimeType: "image/webp")
        XCTAssertEqual(result.fileExtension, "webp")
    }

    func test_fileExtension_unknown_defaultsToJpg() {
        let result = CompressedImageResult(data: Data(), mimeType: "image/bmp")
        XCTAssertEqual(result.fileExtension, "jpg")
    }

    // MARK: - compressImageData — Short data fallback

    func test_compressImageData_dataTooShort_defaultsToJPEG() async {
        let sut = makeSUT()
        let shortData = Data([0xFF, 0xD8])

        let result = await sut.compressImageData(shortData)

        XCTAssertEqual(result.mimeType, "image/jpeg")
    }

    // MARK: - compressImage — l'orientation visible survit à la réduction (#9403)

    func test_compressImage_portraitRightOrientedLargeImage_keepsPortraitPixels() async {
        let sut = makeSUT()
        let image = makeOrientedImage(pixelWidth: 4000, pixelHeight: 3000, orientation: .right)

        let result = await sut.compressImage(image, maxDimension: 2048)

        let decoded = decodedPixels(result.data)
        XCTAssertEqual(decoded?.width, 1536)
        XCTAssertEqual(decoded?.height, 2048)
        XCTAssertEqual(decoded?.orientation, 1)
    }

    func test_compressImage_portraitRightOrientedLargeImage_isSeenUpright() async {
        let sut = makeSUT()
        let image = makeOrientedImage(pixelWidth: 4000, pixelHeight: 3000, orientation: .right)

        let result = await sut.compressImage(image, maxDimension: 2048)

        let seen = UIImage(data: result.data)
        XCTAssertEqual(seen?.size.width, 1536)
        XCTAssertEqual(seen?.size.height, 2048)
    }

    func test_compressImage_upOrientedLargeImage_keepsLandscapePixels() async {
        let sut = makeSUT()
        let image = makeOrientedImage(pixelWidth: 4000, pixelHeight: 3000, orientation: .up)

        let result = await sut.compressImage(image, maxDimension: 2048)

        let decoded = decodedPixels(result.data)
        XCTAssertEqual(decoded?.width, 2048)
        XCTAssertEqual(decoded?.height, 1536)
        XCTAssertEqual(decoded?.orientation, 1)
    }

    private func makeOrientedImage(pixelWidth: CGFloat, pixelHeight: CGFloat,
                                   orientation: UIImage.Orientation) -> UIImage {
        let raw = makeTestImage(width: pixelWidth, height: pixelHeight)
        return UIImage(cgImage: raw.cgImage!, scale: 1, orientation: orientation)
    }

    private func decodedPixels(_ data: Data) -> (width: Int, height: Int, orientation: Int)? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int else {
            return nil
        }
        let orientation = properties[kCGImagePropertyOrientation] as? Int ?? 1
        return (width, height, orientation)
    }

    // MARK: - Factory Helpers

    private func makeTestImage(width: CGFloat, height: CGFloat) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1.0
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format)
        return renderer.image { ctx in
            UIColor.blue.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }

    private func makeJPEGData(width: CGFloat = 200, height: CGFloat = 200) -> Data {
        let image = makeTestImage(width: width, height: height)
        return image.jpegData(compressionQuality: 0.8)!
    }

    private func makePNGData(width: CGFloat = 200, height: CGFloat = 200) -> Data {
        let image = makeTestImage(width: width, height: height)
        return image.pngData()!
    }

    private func makeGIFMagicBytes() -> Data {
        var data = Data(count: 20)
        data[0] = 0x47  // G
        data[1] = 0x49  // I
        data[2] = 0x46  // F
        data[3] = 0x38  // 8
        return data
    }

    /// Encodes a real HEIC container via ImageIO — the same encoder
    /// `MediaCompressor` itself uses — so `detectMimeType`'s `ftyp` sniff and
    /// the ImageIO decode path both see genuine bytes, not a magic-byte stub.
    private func makeHEICData(width: CGFloat = 200, height: CGFloat = 200) -> Data {
        let image = makeTestImage(width: width, height: height)
        guard let cgImage = image.cgImage else { return Data() }
        let data = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(data, "public.heic" as CFString, 1, nil) else { return Data() }
        CGImageDestinationAddImage(dest, cgImage, nil)
        XCTAssertTrue(CGImageDestinationFinalize(dest), "test host must support HEIC encoding")
        return data as Data
    }

    /// Carries a valid `ftyp` box signature (what `detectMimeType` sniffs to
    /// classify as HEIC) but no actual decodable HEIC container after it —
    /// ImageIO's `CGImageSourceCreateThumbnailAtIndex` fails on this input,
    /// exercising `MediaCompressor`'s downsample-failure fallback path.
    private func makeCorruptHEICMagicBytes() -> Data {
        var data = Data(count: 32)
        data[4] = 0x66  // f
        data[5] = 0x74  // t
        data[6] = 0x79  // y
        data[7] = 0x70  // p
        return data
    }

    private func makeWebPMagicBytes() -> Data {
        var data = Data(count: 20)
        data[0] = 0x52  // R
        data[1] = 0x49  // I
        data[2] = 0x46  // F
        data[3] = 0x46  // F
        // bytes 4-7 are file size (can be 0 for test)
        data[8] = 0x57  // W
        data[9] = 0x45  // E
        data[10] = 0x42 // B
        data[11] = 0x50 // P
        return data
    }

    // MARK: - L'étiquette couleur suit la vidéo (#9332)

    func test_etiquetteCouleur_reporteCelleDeLaSource() throws {
        let source = try XCTUnwrap(Self.formatDescription(extensions: [
            kCMFormatDescriptionExtension_ColorPrimaries: kCMFormatDescriptionColorPrimaries_P3_D65,
            kCMFormatDescriptionExtension_TransferFunction: kCMFormatDescriptionTransferFunction_ITU_R_709_2,
            kCMFormatDescriptionExtension_YCbCrMatrix: kCMFormatDescriptionYCbCrMatrix_ITU_R_709_2,
        ]))
        let etiquette = try XCTUnwrap(VideoColorTagging.properties(of: source),
                                      "une prise P3 ré-encodée sans étiquette ressort délavée")
        XCTAssertEqual(etiquette[AVVideoColorPrimariesKey], AVVideoColorPrimaries_P3_D65)
        XCTAssertEqual(etiquette[AVVideoTransferFunctionKey], AVVideoTransferFunction_ITU_R_709_2)
        XCTAssertEqual(etiquette[AVVideoYCbCrMatrixKey], AVVideoYCbCrMatrix_ITU_R_709_2)
    }

    func test_etiquetteCouleur_uneSourceMuetteResteMuette() throws {
        let source = try XCTUnwrap(Self.formatDescription(extensions: [:]))
        XCTAssertNil(VideoColorTagging.properties(of: source), "rien n'est inventé")
    }

    func test_compressVideo_poseLEtiquetteDeLaSource() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let code = try String(contentsOf: racine.appendingPathComponent(
            "Meeshy/Features/Main/Services/MediaCompressor.swift"), encoding: .utf8)
        XCTAssertTrue(code.contains("VideoColorTagging.properties(of:)"))
        XCTAssertTrue(code.contains("[AVVideoColorPropertiesKey: $0]"))
    }

    private static func formatDescription(extensions: [CFString: Any]) -> CMFormatDescription? {
        var description: CMFormatDescription?
        CMVideoFormatDescriptionCreate(allocator: kCFAllocatorDefault, codecType: kCMVideoCodecType_H264,
                                       width: 1920, height: 1080, extensions: extensions as CFDictionary,
                                       formatDescriptionOut: &description)
        return description
    }
}
