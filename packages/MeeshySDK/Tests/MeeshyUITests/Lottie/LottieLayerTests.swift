import XCTest
import CryptoKit
import Lottie
import MeeshySDK
@testable import MeeshyUI

/// #10638 — la couche Lottie des fonds, bannières et contours : quand elle joue (loi pure),
/// ce qu'elle montre sinon (la première image), et d'où elle vient (un fichier de pack vérifié).
@MainActor
final class LottieLayerTests: XCTestCase {

    // Un carré rouge qui traverse le cadre de gauche (x=20) à droite (x=80) en 2 s.
    static let reference = """
    {"v":"5.7.0","fr":30,"ip":0,"op":60,"w":100,"h":100,"nm":"t","ddd":0,"assets":[],"layers":[{"ddd":0,"ind":1,"ty":4,"nm":"s","sr":1,"ks":{"o":{"a":0,"k":100},"r":{"a":0,"k":0},"p":{"a":1,"k":[{"t":0,"s":[20,50,0],"i":{"x":[0.5],"y":[1]},"o":{"x":[0.5],"y":[0]}},{"t":60,"s":[80,50,0]}]},"a":{"a":0,"k":[0,0,0]},"s":{"a":0,"k":[100,100,100]}},"ao":0,"shapes":[{"ty":"gr","it":[{"ty":"rc","d":1,"s":{"a":0,"k":[20,20]},"p":{"a":0,"k":[0,0]},"r":{"a":0,"k":0}},{"ty":"fl","c":{"a":0,"k":[1,0,0,1]},"o":{"a":0,"k":100},"r":1},{"ty":"tr","p":{"a":0,"k":[0,0]},"a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]},"r":{"a":0,"k":0},"o":{"a":0,"k":100}}]}],"ip":0,"op":60,"st":0,"bm":0}]}
    """

    private var data: Data { Data(Self.reference.utf8) }

    /// Le même film sous une empreinte propre au test : le cache mémoire des films est partagé par le processus.
    private func uniqueData() -> Data {
        Data(Self.reference.replacingOccurrences(of: "\"nm\":\"t\"", with: "\"nm\":\"\(UUID().uuidString)\"").utf8)
    }

    private func ref(for data: Data) throws -> PackAssetRef {
        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        return try XCTUnwrap(PackAssetRef(src: "\(digest.prefix(16)).json", bytes: data.count, sha256: digest))
    }

    // MARK: - Quand elle joue

    func test_playback_playsOnlyWhenEveryConditionHolds() {
        XCTAssertEqual(LottieLayerPlayback.mode(animates: true, reduceMotion: false, sceneActive: true, onScreen: true), .playing(.fromProgress(0, toProgress: 1, loopMode: .loop)))
    }

    func test_playback_reduceMotion_showsTheFirstFrame() {
        XCTAssertEqual(LottieLayerPlayback.mode(animates: true, reduceMotion: true, sceneActive: true, onScreen: true), .paused(at: .progress(0)))
    }

    func test_playback_appInBackground_orOffScreen_orNotAnimating_pausesWhereItStands() {
        XCTAssertEqual(LottieLayerPlayback.mode(animates: true, reduceMotion: false, sceneActive: false, onScreen: true), .paused(at: .currentFrame))
        XCTAssertEqual(LottieLayerPlayback.mode(animates: true, reduceMotion: false, sceneActive: true, onScreen: false), .paused(at: .currentFrame))
        XCTAssertEqual(LottieLayerPlayback.mode(animates: false, reduceMotion: false, sceneActive: true, onScreen: true), .paused(at: .progress(0)))
    }

    func test_playback_reduceMotion_winsOverEverything() {
        XCTAssertEqual(LottieLayerPlayback.mode(animates: true, reduceMotion: true, sceneActive: false, onScreen: false), .paused(at: .progress(0)))
    }

    func test_playback_inAppReduceMotion_alone_showsTheFirstFrame() {
        XCTAssertEqual(LottieLayerPlayback.mode(animates: true, systemReduceMotion: false, userForcedReduceMotion: true, sceneActive: true, onScreen: true), .paused(at: .progress(0)), "le réglage « Réduire les animations » de Meeshy vaut celui du système")
        XCTAssertEqual(LottieLayerPlayback.mode(animates: true, systemReduceMotion: true, userForcedReduceMotion: false, sceneActive: true, onScreen: true), .paused(at: .progress(0)))
        XCTAssertEqual(LottieLayerPlayback.mode(animates: true, systemReduceMotion: false, userForcedReduceMotion: false, sceneActive: true, onScreen: true), .playing(.fromProgress(0, toProgress: 1, loopMode: .loop)))
    }

    func test_playback_withoutAPlaceInTheBudget_showsTheFirstFrame() {
        XCTAssertEqual(LottieLayerPlayback.mode(animates: true, granted: false, systemReduceMotion: false, userForcedReduceMotion: false, sceneActive: true, onScreen: true), .paused(at: .progress(0)), "#10815 : sans place, l'image fixe")
        XCTAssertEqual(LottieLayerPlayback.mode(animates: true, granted: true, systemReduceMotion: false, userForcedReduceMotion: false, sceneActive: true, onScreen: true), .playing(.fromProgress(0, toProgress: 1, loopMode: .loop)))
    }

    func test_playback_aFilmThatDoesNotLoop_playsOnce_andKeepsEveryOtherRule() {
        XCTAssertEqual(LottieLayerPlayback.mode(animates: true, granted: true, systemReduceMotion: false, userForcedReduceMotion: false, sceneActive: true, onScreen: true, loops: false), .playing(.fromProgress(0, toProgress: 1, loopMode: .playOnce)), "#10816 : une gravure s'explique une fois, puis se tait")
        XCTAssertEqual(LottieLayerPlayback.mode(animates: true, granted: true, systemReduceMotion: true, userForcedReduceMotion: false, sceneActive: true, onScreen: true, loops: false), .paused(at: .progress(0)))
    }

    func test_engine_isCoreAnimation() {
        XCTAssertEqual(LottieLayerPlayback.configuration.renderingEngine, .coreAnimation)
    }

    // MARK: - D'où elle vient

    func test_film_fromData_readsTheAnimation() throws {
        let film = try XCTUnwrap(LottieLayerSource.film(data: data))
        XCTAssertEqual(film.duration, 2, accuracy: 0.01)
    }

    func test_film_fromGarbage_isNil() {
        XCTAssertNil(LottieLayerSource.film(data: Data("pas du lottie".utf8)))
    }

    func test_film_fromAPackAsset_downloadsOnce_thenReadsTheDisk() async throws {
        let data = uniqueData()
        let fetcher = CountingFetcher(data: data)
        let store = ContentAddressedStore(directory: tempDirectory(), fetcher: fetcher)
        let ref = try ref(for: data)
        let first = await LottieLayerSource.film(for: ref, store: store)
        let second = await LottieLayerSource.film(for: ref, store: store)
        XCTAssertNotNil(first)
        XCTAssertNotNil(second)
        XCTAssertEqual(fetcher.count, 1, "le fichier de pack est adressé par contenu : il ne se retélécharge pas")
    }

    func test_film_simultaneousDemandsForTheSameFile_readAndDecodeItOnce() async throws {
        let data = uniqueData()
        let store = ContentAddressedStore(directory: tempDirectory(), fetcher: CountingFetcher(data: data, delay: 0.05))
        let ref = try ref(for: data)
        let films = await withTaskGroup(of: LottieFilmSource?.self) { group in
            for _ in 0..<12 { group.addTask { await LottieLayerSource.film(for: ref, store: store) } }
            var all: [LottieFilmSource?] = []
            for await film in group { all.append(film) }
            return all
        }
        let first = try XCTUnwrap(films.first ?? nil)
        XCTAssertTrue(films.allSatisfy { $0 === first }, "#10815 : trente rangées au même contour lisent et décodent le fichier UNE fois")
    }

    func test_film_fromAPackAssetWhoseBytesAreNotTheEngagedOnes_isNil() async throws {
        let fetcher = CountingFetcher(data: Data("altéré en route".utf8))
        let store = ContentAddressedStore(directory: tempDirectory(), fetcher: fetcher)
        let film = await LottieLayerSource.film(for: try ref(for: uniqueData()), store: store)
        XCTAssertNil(film)
    }

    func test_film_fromAPackAsset_staysInMemory_soAReopenedLayerShowsItAtOnce() async throws {
        let data = uniqueData()
        let ref = try ref(for: data)
        XCTAssertNil(LottieLayerSource.cachedFilm(for: ref), "rien n'a encore été lu")
        let store = ContentAddressedStore(directory: tempDirectory(), fetcher: CountingFetcher(data: data))
        let read = await LottieLayerSource.film(for: ref, store: store)
        let loaded = try XCTUnwrap(read)
        let cached = try XCTUnwrap(LottieLayerSource.cachedFilm(for: ref), "un fond rouvert se monte sans attendre le disque")
        XCTAssertTrue(cached === loaded, "un seul modèle en mémoire, partagé par toutes les couches du même fichier")
    }

    func test_film_aRejectedFile_isNeverKeptInMemory() async throws {
        let ref = try ref(for: uniqueData())
        let store = ContentAddressedStore(directory: tempDirectory(), fetcher: CountingFetcher(data: Data("altéré".utf8)))
        _ = await LottieLayerSource.film(for: ref, store: store)
        XCTAssertNil(LottieLayerSource.cachedFilm(for: ref))
    }

    // MARK: - Ce qu'elle montre à l'arrêt

    func test_stillFrame_isTheFirstImage_notTheMiddleOne() throws {
        let film = try XCTUnwrap(LottieLayerSource.film(data: data))
        let still = try XCTUnwrap(LottieFilm.still(film, pixelSize: 100))
        let decoded = try XCTUnwrap(LottieFilm.decodedNow(film, pixelSize: 100, framesPerSecond: 2))
        let first = try XCTUnwrap(centroidX(still))
        let middle = try XCTUnwrap(centroidX(decoded.frames[decoded.frames.count / 2]))
        XCTAssertEqual(first, 20, accuracy: 4)
        XCTAssertGreaterThan(middle, first + 15)
    }

    // MARK: - Aides

    private func tempDirectory() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("lottie-layer-\(UUID().uuidString)", isDirectory: true)
    }

    private func centroidX(_ image: CGImage) -> Double? {
        let width = image.width, height = image.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        guard let context = CGContext(data: &pixels, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        var sum = 0.0, count = 0.0
        for y in 0..<height { for x in 0..<width where pixels[(y * width + x) * 4 + 3] > 128 { sum += Double(x); count += 1 } }
        return count > 0 ? sum / count : nil
    }
}

private final class CountingFetcher: PackAssetFetching, @unchecked Sendable {
    private let lock = NSLock()
    private var calls = 0
    private let data: Data
    private let delay: TimeInterval

    init(data: Data, delay: TimeInterval = 0) {
        self.data = data
        self.delay = delay
    }

    var count: Int { lock.withLock { calls } }

    func fetch(file name: String) async throws -> Data {
        lock.withLock { calls += 1 }
        if delay > 0 { try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000)) }
        return data
    }
}
