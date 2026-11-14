import XCTest
@testable import MeeshySDK

/// #17879 (A1.10, A2.2) — rejeu iOS du fichier COMMUN `packages/shared/fixtures/author-ink.vectors.json`,
/// généré en exécutant la loi TS `legibleTint` (`packages/shared/utils/author-ink.ts`) sur les fonds du fil web.
/// Le web, le banc TS et Android (`AuthorInkSharedVectorsTest`) le rejouent tel quel. La table d'`AuthorInkTests`
/// est une COPIE du web : ce témoin lit la source elle-même, si bien qu'une loi TS qui bouge rougit ici.
final class AuthorInkSharedVectorTests: XCTestCase {

    private struct Vector: Decodable {
        let scheme: String
        let tint: String
        let expected: String
    }

    private struct VectorFile: Decodable {
        let backgrounds: [String: [String]]
        let vectors: [Vector]
    }

    private static let fileURL: URL = {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("packages/shared/fixtures/author-ink.vectors.json")
    }()

    private func load() throws -> VectorFile {
        try JSONDecoder().decode(VectorFile.self, from: Data(contentsOf: Self.fileURL))
    }

    private func bare(_ hex: String) -> String {
        (hex.hasPrefix("#") ? String(hex.dropFirst()) : hex).uppercased()
    }

    private func mode(_ scheme: String) -> ThemeMode {
        scheme == "dark" ? .dark : .light
    }

    func test_sharedFile_coversTheWholePaletteInBothSchemes_neverZero() throws {
        let file = try load()
        XCTAssertEqual(file.vectors.count, 78)
        for scheme in ["dark", "light"] {
            let tints = file.vectors.filter { $0.scheme == scheme }.map { bare($0.tint) }
            XCTAssertEqual(tints.sorted(), DynamicColorGenerator.vibrantPalette.sorted(), scheme)
        }
    }

    func test_backgrounds_areTheSharedFiles_inBothSchemes() throws {
        let file = try load()
        XCTAssertEqual(AuthorInk.backgrounds(for: .dark), (file.backgrounds["dark"] ?? []).map(bare))
        XCTAssertEqual(AuthorInk.backgrounds(for: .light), (file.backgrounds["light"] ?? []).map(bare))
    }

    func test_hex_everySharedVector_isWhatTheSwiftLawAnswers() throws {
        let file = try load()
        XCTAssertFalse(file.vectors.isEmpty)
        for vector in file.vectors {
            XCTAssertEqual(AuthorInk.hex(vector.tint, for: mode(vector.scheme)), bare(vector.expected), "\(vector.tint) \(vector.scheme)")
        }
    }
}
