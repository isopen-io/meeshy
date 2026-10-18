import XCTest

/// Garde de source — un type du framework Translation (iOS 18) ne se STOCKE
/// jamais dans une propriété d'instance (#10592).
///
/// `@available(iOS 18.0, *)` sur une classe ne protège pas ses MÉTADONNÉES :
/// quand XCTest énumère les classes (`objc_copyClassList` → `realizeAllClasses`,
/// pour trouver les `XCTestCase`), le runtime complète celles de CHAQUE classe
/// Swift du binaire, donc le type de chacune de ses propriétés stockées. Sous
/// iOS 16/17, `TranslationSession.Configuration` n'existe pas :
/// `swift_getTypeByMangledName` échoue et l'hôte de test avorte avant le
/// premier test (mesuré le 2026-10-14, simulateur iOS 17.5, sur
/// `@Published var configuration: TranslationSession.Configuration?`
/// d'`AppleTranslationEngine`). La CI ne juge la suite que sous iOS 26.1 :
/// elle ne le voit pas.
///
/// Le correctif : la valeur se range dans une propriété d'un type présent
/// partout (`Any?`), et une propriété CALCULÉE la rend typée — une propriété
/// calculée n'entre pas dans la disposition de la classe.
final class IOS18OnlyStoredTypeGuardTests: XCTestCase {

    /// Les types du framework Translation introduits avec iOS 18.
    private static let iOS18OnlyTypes = ["TranslationSession", "LanguageAvailability"]

    /// Une déclaration de propriété d'INSTANCE stockée dont l'annotation de type
    /// nomme un de ces types. `static` (stockage global paresseux, hors de la
    /// disposition de la classe) et les propriétés calculées (`{` en fin de
    /// ligne) ne sont pas visées.
    static func storedDeclarations(in source: String) -> [String] {
        let pattern = #"^\s*(?:@[\w.]+(?:\([^)]*\))?\s+)*(?:(?:private|fileprivate|internal|public|open)(?:\(set\))?\s+|nonisolated\s+|lazy\s+|weak\s+|final\s+)*(?:var|let)\s+\w+\s*:\s*[^={]*\b(?:"#
            + iOS18OnlyTypes.joined(separator: "|")
            + #")\b[^{]*$"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        return DeclarationBodyScanner.mask(source)
            .components(separatedBy: "\n")
            .filter { line in
                regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)) != nil
            }
            .map { $0.trimmingCharacters(in: .whitespaces) }
    }

    private func repositoryRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Guards
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .deletingLastPathComponent()   // .../apps
            .deletingLastPathComponent()   // racine
    }

    private func translationSources() throws -> [(path: String, source: String)] {
        let root = repositoryRoot()
        let scanned = ["apps/ios/Meeshy", "packages/MeeshySDK/Sources"].map { root.appendingPathComponent($0) }
        var found: [(String, String)] = []
        for directory in scanned {
            let enumerator = try XCTUnwrap(
                FileManager.default.enumerator(at: directory, includingPropertiesForKeys: nil),
                "impossible d'énumérer \(directory.path)"
            )
            for case let url as URL in enumerator where url.pathExtension == "swift" {
                let source = try String(contentsOf: url, encoding: .utf8)
                guard source.range(of: #"(?m)^\s*(?:@\w+\s+)*import\s+Translation\b"#, options: .regularExpression) != nil else { continue }
                found.append((url.path.replacingOccurrences(of: root.path + "/", with: ""), source))
            }
        }
        return found
    }

    func test_noInstancePropertyStoresAnIOS18TranslationType() throws {
        let sources = try translationSources()
        XCTAssertFalse(sources.isEmpty, "aucun fichier n'importe Translation : la garde ne regarde plus rien")

        let offenders = sources.flatMap { file in
            Self.storedDeclarations(in: file.source).map { "\(file.path): \($0)" }
        }

        XCTAssertEqual(offenders, [], """
            Une propriété STOCKÉE d'un type iOS 18 fait avorter tout hôte qui énumère \
            les classes sous iOS 16/17 (#10592). Ranger la valeur dans `Any?` et la \
            rendre typée par une propriété calculée.
            """)
    }

    func test_detector_flagsTheShapeThatCrashed() {
        let source = """
        final class Engine {
            @Published private(set) var configuration: TranslationSession.Configuration?
            private let availability: LanguageAvailability
        }
        """
        XCTAssertEqual(Self.storedDeclarations(in: source).count, 2)
    }

    func test_detector_ignoresComputedStaticAndCommentedDeclarations() {
        let source = """
        final class Engine {
            var configuration: TranslationSession.Configuration? { storage as? TranslationSession.Configuration }
            private static var cache: TranslationSession.Configuration?
            // var old: TranslationSession.Configuration?
            func serve(_ session: TranslationSession) {}
        }
        """
        XCTAssertEqual(Self.storedDeclarations(in: source), [])
    }
}
