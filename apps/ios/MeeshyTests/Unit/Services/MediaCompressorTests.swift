import XCTest
@testable import Meeshy

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
}
