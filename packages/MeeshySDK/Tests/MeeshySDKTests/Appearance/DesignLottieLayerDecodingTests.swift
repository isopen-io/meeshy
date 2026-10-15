import XCTest
@testable import MeeshySDK

/// #10638 — la couche `lottie` facultative d'un fond, d'une bannière et d'un contour
/// (spec D6) : lue quand elle est valide, ignorée sinon, JAMAIS cause de refus du design.
final class DesignLottieLayerDecodingTests: XCTestCase {

    private static let sha = String(repeating: "ab", count: 32)
    private static let src = "abababababababab.json"

    private func reference(src: String = DesignLottieLayerDecodingTests.src, sha: String = DesignLottieLayerDecodingTests.sha) -> [String: Any] {
        ["src": src, "bytes": 1200, "sha256": sha]
    }

    private func wallpaper() throws -> [String: Any] {
        let design = try XCTUnwrap(AppearanceCatalog.shared.wallpaper(pack: "heritages", design: "zellige"))
        let data = try JSONEncoder().encode(design)
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    private func ring() throws -> [String: Any] {
        let ring = try XCTUnwrap(AvatarRingCatalog.shared.ring(pack: "contours-essentiels", item: "filet"))
        let data = try JSONEncoder().encode(ring)
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    private func decode<T: Decodable>(_ type: T.Type, _ object: [String: Any]) throws -> T {
        try JSONDecoder().decode(type, from: JSONSerialization.data(withJSONObject: object))
    }

    func test_design_withoutALottieLayer_hasNone() throws {
        XCTAssertNil(try decode(AppearanceDesign.self, try wallpaper()).lottie)
        XCTAssertNil(try decode(AvatarRingDesign.self, try ring()).lottie)
    }

    func test_design_withAValidLottieLayer_readsItsFile() throws {
        var wall = try wallpaper()
        wall["lottie"] = reference()
        let design = try decode(AppearanceDesign.self, wall)
        XCTAssertEqual(design.lottie?.src, Self.src)
        XCTAssertEqual(design.lottie?.file.name, Self.src)

        var ring = try ring()
        ring["lottie"] = reference()
        XCTAssertEqual(try decode(AvatarRingDesign.self, ring).lottie?.src, Self.src)
    }

    func test_design_withAMalformedLottieLayer_staysReadableWithoutIt() throws {
        var wall = try wallpaper()
        wall["lottie"] = reference(src: "../../etc/passwd")
        XCTAssertNil(try decode(AppearanceDesign.self, wall).lottie, "une couche illisible s'ignore, le dessin reste")

        var ring = try ring()
        ring["lottie"] = ["src": 3]
        XCTAssertNil(try decode(AvatarRingDesign.self, ring).lottie)
    }

    func test_lottieLayer_survivesARoundTrip_andChangesEquality() throws {
        var wall = try wallpaper()
        let plain = try decode(AppearanceDesign.self, wall)
        wall["lottie"] = reference()
        let animated = try decode(AppearanceDesign.self, wall)
        XCTAssertNotEqual(plain, animated)
        let again = try JSONDecoder().decode(AppearanceDesign.self, from: JSONEncoder().encode(animated))
        XCTAssertEqual(again, animated)

        var ring = try ring()
        ring["lottie"] = reference()
        let ringAnimated = try decode(AvatarRingDesign.self, ring)
        XCTAssertEqual(try JSONDecoder().decode(AvatarRingDesign.self, from: JSONEncoder().encode(ringAnimated)), ringAnimated)
    }
}
