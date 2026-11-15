import XCTest
@testable import Meeshy
import MeeshySDK

/// #14333 — la traduction sur l'appareil (conversation chiffrée de bout en bout)
/// ne réécrit jamais le nom de l'auteur d'un partage, une adresse, un e-mail ni un
/// pseudo : la règle du translator (#14327) devant le moteur Apple.

@MainActor
private final class RewritingEngine: DeviceTranslationEngineProviding {
    nonisolated deinit {}

    let engineName = "tests-rewriter"
    var dropsMarkers = false
    private(set) var seen: [[DeviceTranslationRequest]] = []
    private(set) var cancelCount = 0

    func availability(of pair: DeviceTranslationPair) async -> DeviceTranslationAvailability { .ready }

    func translate(_ requests: [DeviceTranslationRequest], pair: DeviceTranslationPair) async -> [DeviceTranslationResult] {
        seen.append(requests)
        return requests.map { DeviceTranslationResult(id: $0.id, text: rewrite($0.text)) }
    }

    func cancelPending() { cancelCount += 1 }

    /// Réécrit chaque mot hors marqueur, comme un moteur qui « traduit » un pseudo.
    private func rewrite(_ text: String) -> String {
        text.components(separatedBy: " ")
            .compactMap { word in word.contains("🔹") ? (dropsMarkers ? nil : word) : "«\(word)»" }
            .joined(separator: " ")
    }
}

@MainActor
final class EntityShieldedDeviceTranslationEngineTests: XCTestCase {

    private let pair = DeviceTranslationPair(source: "fr", target: "es")
    private let sharedReel = "🔗 Reel de recretrait_b: https://staging.meeshy.me/l/I0tqQp"

    func test_translate_sharePhrase_keepsAuthorAndLinkAndNeverGivesThemToTheEngine() async {
        let inner = RewritingEngine()
        let engine = EntityShieldedDeviceTranslationEngine(inner)

        let results = await engine.translate([DeviceTranslationRequest(id: "m1", text: sharedReel)], pair: pair)

        XCTAssertEqual(results.map(\.id), ["m1"])
        let text = results.first?.text ?? ""
        XCTAssertTrue(text.hasPrefix("🔗"))
        XCTAssertTrue(text.contains("recretrait_b"))
        XCTAssertTrue(text.contains("https://staging.meeshy.me/l/I0tqQp"))
        let given = inner.seen.flatMap { $0.map(\.text) }.joined()
        XCTAssertFalse(given.contains("recretrait_b"))
        XCTAssertFalse(given.contains("https://"))
    }

    func test_translate_engineLosesMarkers_translatesBetweenThemInASecondCall() async {
        let inner = RewritingEngine()
        inner.dropsMarkers = true
        let engine = EntityShieldedDeviceTranslationEngine(inner)

        let results = await engine.translate(
            [DeviceTranslationRequest(id: "m1", text: "Écris à contact@meeshy.me vite")], pair: pair
        )

        XCTAssertEqual(results, [DeviceTranslationResult(id: "m1", text: "«Écris» «à» contact@meeshy.me «vite»")])
        XCTAssertEqual(inner.seen.count, 2)
    }

    func test_translate_addressAlone_isServedAsIsWithoutCallingTheEngine() async {
        let inner = RewritingEngine()
        let engine = EntityShieldedDeviceTranslationEngine(inner)

        let results = await engine.translate([DeviceTranslationRequest(id: "m1", text: "https://a.com/x")], pair: pair)

        XCTAssertEqual(results, [DeviceTranslationResult(id: "m1", text: "https://a.com/x")])
        XCTAssertTrue(inner.seen.isEmpty)
    }

    func test_nameAvailabilityAndCancel_areThoseOfTheShieldedEngine() async {
        let inner = RewritingEngine()
        let engine = EntityShieldedDeviceTranslationEngine(inner)

        engine.cancelPending()
        let availability = await engine.availability(of: pair)

        XCTAssertEqual(engine.engineName, "tests-rewriter")
        XCTAssertEqual(availability, .ready)
        XCTAssertEqual(inner.cancelCount, 1)
    }

    func test_factory_onIOS18_shieldsTheAppleEngine() {
        guard #available(iOS 18.0, *) else { return }
        let engine = DeviceTranslationEngineFactory.makeDefault()

        let shielded = engine as? EntityShieldedDeviceTranslationEngine
        XCTAssertNotNil(shielded)
        XCTAssertTrue(shielded?.inner is AppleTranslationEngine)
    }
}
