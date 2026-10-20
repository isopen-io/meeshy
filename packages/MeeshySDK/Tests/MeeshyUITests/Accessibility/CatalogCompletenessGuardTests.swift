import XCTest
import Foundation
@testable import MeeshyUI

final class CatalogCompletenessGuardTests: XCTestCase {

    typealias CatalogEntries = [String: [String: [String]]]

    private static let languages = ["fr", "en", "de", "es", "pt-BR", "it", "ar"]

    private static let ownedMeeshyUIFiles = [
        "packages/MeeshySDK/Sources/MeeshyUI/Primitives/ErrorBannerView.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Story/PostVisibility.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Story/StickerPickerView+Emoji.swift"
    ]

    private static let ownedAppFile = "apps/ios/Meeshy/Features/Main/Views/StoryCommentThread.swift"

    private static let forbiddenVisibleLiterals = [
        #"Text\(\s*"[^"]*\p{L}"#,
        #"Text\(\s*[A-Za-z_][\w.]*\s*\?\s*"[^"]*\p{L}"#,
        #"\.accessibility(?:Label|Hint|Value)\(\s*"[^"]*\p{L}"#,
        #"(?:Label|Button)\(\s*"[^"]*\p{L}"#,
        #"\?\s*"s"\s*:\s*""#,
        #"String\(\s*localized:\s*"[^"]*\s[^"]*""#
    ]

    private static let symbolicKey = #"^[A-Za-z0-9_]+(?:[.\-][A-Za-z0-9_\-]+)+$"#

    // MARK: - Analyseur pur

    static func catalogEntries(from data: Data) throws -> CatalogEntries {
        let root = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(root["strings"] as? [String: Any])
        return strings.mapValues { raw in
            let localizations = (raw as? [String: Any])?["localizations"] as? [String: Any] ?? [:]
            return localizations.mapValues { values(in: $0) }
        }
    }

    private static func values(in node: Any) -> [String] {
        guard let dict = node as? [String: Any] else { return [] }
        let own = ((dict["stringUnit"] as? [String: Any])?["value"] as? String).map { [$0] } ?? []
        let nested = (dict["variations"] as? [String: Any] ?? [:]).values.flatMap { kind in
            (kind as? [String: Any] ?? [:]).values.flatMap { values(in: $0) }
        }
        return own + nested
    }

    static func missingLanguages(key: String, entries: CatalogEntries, required: [String]) -> [String] {
        let present = entries[key] ?? [:]
        return required.filter { language in
            let values = present[language] ?? []
            return values.isEmpty || values.contains { $0.trimmingCharacters(in: .whitespaces).isEmpty }
        }
    }

    static func defects(entries: CatalogEntries, keys: [String], required: [String]) -> [String] {
        keys.sorted().compactMap { key in
            let missing = missingLanguages(key: key, entries: entries, required: required)
            return missing.isEmpty ? nil : "\(key) → manque \(missing.joined(separator: ", "))"
        }
    }

    // MARK: - Lecture du dépôt

    private static var repositoryRoot: URL {
        (0..<6).reduce(URL(fileURLWithPath: #filePath)) { url, _ in url.deletingLastPathComponent() }
    }

    private func read(_ relativePath: String) throws -> String {
        try String(contentsOf: Self.repositoryRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    private func catalog(_ relativePath: String) throws -> CatalogEntries {
        let url = Self.repositoryRoot.appendingPathComponent(relativePath)
        return try Self.catalogEntries(from: try Data(contentsOf: url))
    }

    private var uiCatalogPath: String { "packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings" }
    private var appCatalogPath: String { "apps/ios/Meeshy/Localizable.xcstrings" }

    private func matches(_ pattern: String, in text: String) -> [NSTextCheckingResult] {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        return regex.matches(in: text, range: NSRange(text.startIndex..., in: text))
    }

    private func capture(_ match: NSTextCheckingResult, _ index: Int, in text: String) -> String? {
        Range(match.range(at: index), in: text).map { String(text[$0]) }
    }

    private func swiftFiles(under relativePath: String) -> [URL] {
        let base = Self.repositoryRoot.appendingPathComponent(relativePath)
        let walker = FileManager.default.enumerator(at: base, includingPropertiesForKeys: nil)
        return (walker?.allObjects as? [URL] ?? []).filter { $0.pathExtension == "swift" }
    }

    private func codeWithoutComments(_ text: String) -> String {
        text.split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    private func callWindows(in text: String) -> [String] {
        let parts = text.components(separatedBy: "String(localized:").dropFirst()
        return parts.map { String($0.prefix(400)).components(separatedBy: "String(").first ?? "" }
    }

    private func moduleKeys(in text: String) -> [String] {
        matches(#"String\(\s*localized:\s*"([^"\\]+)""#, in: text).compactMap { match in
            guard let key = capture(match, 1, in: text), let whole = Range(match.range, in: text) else { return nil }
            let tail = text[whole.upperBound...]
            let window = tail.prefix(400)
            let callEnd = tail.firstIndex(of: ")") ?? window.endIndex
            let call = tail[..<min(callEnd, window.endIndex)]
            return call.contains("bundle: .module") || window.contains("bundle: .module") && !call.contains("bundle:")
                ? key : nil
        }
    }

    // MARK: - Gardes

    func test_chaqueCléModuleDeMeeshyUIEstCataloguéeDansLesSeptLangues() throws {
        let entries = try catalog(uiCatalogPath)
        let keys = Set(swiftFiles(under: "packages/MeeshySDK/Sources/MeeshyUI").flatMap { url in
            moduleKeys(in: (try? String(contentsOf: url, encoding: .utf8)) ?? "")
        })
        XCTAssertFalse(keys.isEmpty)
        XCTAssertEqual(Self.defects(entries: entries, keys: Array(keys), required: Self.languages), [])
    }

    func test_chaqueCléSymboliqueDesDeuxCataloguesADesValeursNonVidesDansLesSeptLangues() throws {
        for path in [uiCatalogPath, appCatalogPath] {
            let entries = try catalog(path)
            let keys = entries.keys.filter { !matches(Self.symbolicKey, in: $0).isEmpty }
            XCTAssertFalse(keys.isEmpty, path)
            XCTAssertEqual(Self.defects(entries: entries, keys: keys, required: Self.languages), [], path)
        }
    }

    func test_lesQuatreFichiersPossédésNeRéintroduisentAucuneChaîneVisibleLittérale() throws {
        let paths = Self.ownedMeeshyUIFiles + [Self.ownedAppFile]
        for path in paths {
            let code = codeWithoutComments(try read(path))
            for pattern in Self.forbiddenVisibleLiterals {
                XCTAssertTrue(matches(pattern, in: code).isEmpty, "\(path) : \(pattern)")
            }
            let unbundled = callWindows(in: code).filter { !$0.contains("bundle:") }
            XCTAssertTrue(unbundled.isEmpty, "\(path) : appel String(localized:) sans bundle:")
        }
        for path in Self.ownedMeeshyUIFiles {
            XCTAssertFalse(try read(path).contains("bundle: .main"), path)
        }
    }

    func test_lesClésDesQuatreFichiersSontDansLeCatalogueDeLeurCible() throws {
        let ui = try catalog(uiCatalogPath)
        let uiKeys = try Self.ownedMeeshyUIFiles.flatMap { path -> [String] in
            let text = try read(path)
            return matches(#"String\(\s*localized:\s*"([^"\\]+)""#, in: text).compactMap { capture($0, 1, in: text) }
        }
        XCTAssertEqual(Self.defects(entries: ui, keys: Array(Set(uiKeys)), required: Self.languages), [])

        let app = try catalog(appCatalogPath)
        let text = try read(Self.ownedAppFile)
        let appKeys = matches(#"String\(\s*localized:\s*"([^"\\]+)""#, in: text).compactMap { capture($0, 1, in: text) }
        let expected = Set(appKeys + ["common.dismiss", "comments.load-more-replies"])
        XCTAssertEqual(Self.defects(entries: app, keys: Array(expected), required: Self.languages), [])
    }

    // MARK: - Tests d'analyseur

    private func sample(_ localizations: String) throws -> CatalogEntries {
        let json = #"{"strings":{"a.b":{"localizations":{\#(localizations)}}}}"#
        return try Self.catalogEntries(from: Data(json.utf8))
    }

    private func unit(_ value: String) -> String { #"{"stringUnit":{"state":"translated","value":"\#(value)"}}"# }

    func test_lAnalyseRejetteUneCléSansFrançais() throws {
        let languages = Self.languages.filter { $0 != "fr" }
        let body = languages.map { #""\#($0)":\#(unit("x"))"# }.joined(separator: ",")
        let entries = try sample(body)
        XCTAssertEqual(Self.defects(entries: entries, keys: ["a.b"], required: Self.languages), ["a.b → manque fr"])
    }

    func test_lAnalyseRejetteUneFormePlurielleVide() throws {
        let plural = #"{"variations":{"plural":{"one":\#(unit("")),"other":\#(unit("x"))}}}"#
        let body = Self.languages.map { language in
            language == "ar" ? #""ar":\#(plural)"# : #""\#(language)":\#(unit("x"))"#
        }.joined(separator: ",")
        let entries = try sample(body)
        XCTAssertEqual(Self.defects(entries: entries, keys: ["a.b"], required: Self.languages), ["a.b → manque ar"])
    }

    func test_lAnalyseAccepteUneCléAvecSesSeptLanguesEtVariations() throws {
        let plural = #"{"variations":{"plural":{"one":\#(unit("x")),"other":\#(unit("y"))}}}"#
        let body = Self.languages.map { language in
            language == "en" ? #""en":\#(plural)"# : #""\#(language)":\#(unit("x"))"#
        }.joined(separator: ",")
        let entries = try sample(body)
        XCTAssertEqual(Self.defects(entries: entries, keys: ["a.b"], required: Self.languages), [])
    }
}
