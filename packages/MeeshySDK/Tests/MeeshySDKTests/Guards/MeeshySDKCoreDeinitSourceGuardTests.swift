import XCTest

/// Garde de source CORE — famille « deinit isolée iOS 26.1 » (SE-0466),
/// TROISIÈME site de la famille après l'app (`MainActorDeinitSourceGuardTests`)
/// et MeeshyUI (`MeeshyUIDeinitSourceGuardTests`).
///
/// Le module CORE `MeeshySDK` compile sous `coreSwiftSettings` — SANS
/// `.defaultIsolation(MainActor)` : il est donc `nonisolated` PAR DÉFAUT (il
/// héberge acteurs, délégués URLSession, callbacks Socket.IO, workers de fond
/// qui doivent tourner hors du main). Une classe non annotée y est nonisolated,
/// donc SÛRE. Mais une classe EXPLICITEMENT `@MainActor` (il y en a : les
/// managers UI-facing du core) reçoit quand même une deinit synthétisée ISOLÉE,
/// qui double-libère hors tâche courante sur iOS 26.1
/// (`malloc: … pointer being freed was not allocated`, abrt `0x262c5a6f0`).
///
/// Trouvé par le re-gate COMPLET (2026-08-26) : `AuthServiceTests` crashait
/// 6 fois — il exerce `AuthManager` (`@MainActor final class … ObservableObject`,
/// `Auth/AuthManager.swift`, sans deinit). Les deux sweeps précédents
/// (`apps/ios/Meeshy/**`, `Sources/MeeshyUI/**`) ne balayaient PAS ce module.
///
/// **Critère in-scope (différent des deux autres, et pourquoi).** Ici le module
/// est nonisolated par défaut : le risque suit l'annotation `@MainActor`
/// EXPLICITE, pas « toute classe non-nonisolated » (qui, dans ce module, serait
/// l'immense majorité des classes nonisolated saines). ObservableObject n'est
/// PAS requis : des crashers mesurés du core ne le sont pas
/// (`VideoExportPipeline`, les position stores). Toute classe `@MainActor`
/// explicite, non-`nonisolated`, doit déclarer un `deinit`.
final class MeeshySDKCoreDeinitSourceGuardTests: XCTestCase {

    private struct ClassDecl {
        let relativePath: String
        let name: String
        let isNonisolated: Bool
        let isMainActor: Bool
        let hasDeinit: Bool
    }

    private func coreRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Tests/MeeshySDKTests/Guards
            .deletingLastPathComponent()   // .../Tests/MeeshySDKTests
            .deletingLastPathComponent()   // .../Tests
            .deletingLastPathComponent()   // .../MeeshySDK
            .appendingPathComponent("Sources/MeeshySDK")
    }

    private func classDecls() throws -> [ClassDecl] {
        let root = coreRoot()
        let enumerator = try XCTUnwrap(
            FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil),
            "impossible d'énumérer \(root.path) — Sources/MeeshySDK a-t-il bougé ?"
        )
        var out: [ClassDecl] = []
        for case let url as URL in enumerator where url.pathExtension == "swift" {
            let relative = url.path.replacingOccurrences(of: root.path + "/", with: "")
            let masked = Self.mask(try String(contentsOf: url, encoding: .utf8))
            out.append(contentsOf: Self.parse(masked, relativePath: relative))
        }
        return out.sorted { ($0.relativePath, $0.name) < ($1.relativePath, $1.name) }
    }

    /// Neutralise commentaires ET contenu des littéraux de chaîne (longueur
    /// préservée) — un `"deinit"` ou `"class X {"` en dur ne doit pas fausser le
    /// parseur (constat 3 de la revue Opus).
    static func mask(_ source: String) -> String {
        var out = ""
        out.reserveCapacity(source.count)
        var inLine = false, inBlock = false, inString = false, escaped = false
        var previous: Character?
        for ch in source {
            var emit = ch
            if inLine {
                if ch == "\n" { inLine = false } else { emit = " " }
            } else if inBlock {
                if previous == "*" && ch == "/" { inBlock = false }
                emit = ch == "\n" ? "\n" : " "
            } else if inString {
                if escaped { escaped = false; emit = " " }
                else if ch == "\\" { escaped = true; emit = " " }
                else if ch == "\"" { inString = false }
                else { emit = " " }
            } else {
                if previous == "/" && ch == "/" { inLine = true; out.removeLast(); out.append(" "); emit = " " }
                else if previous == "/" && ch == "*" { inBlock = true; out.removeLast(); out.append(" "); emit = " " }
                else if ch == "\"" { inString = true }
            }
            out.append(emit)
            previous = ch
        }
        return out
    }

    /// Analyse sans SourceKit : `class Nom`, modificateurs précédents
    /// (`@MainActor`/`nonisolated` par lookahead « aucune accolade jusqu'au
    /// mot-clé »), présence d'un `deinit` AU NIVEAU 1 du corps. Exclut
    /// `class var`/`func`/`let`/`subscript`.
    static func parse(_ code: String, relativePath: String) -> [ClassDecl] {
        let chars = Array(code)
        var out: [ClassDecl] = []
        var i = code.startIndex
        while let range = code.range(of: "class ", range: i..<code.endIndex) {
            i = range.upperBound
            let afterKeyword = code[range.upperBound...]
            guard let nameMatch = afterKeyword.range(
                of: "^\\s*([A-Za-z_][A-Za-z0-9_]*)", options: .regularExpression) else { continue }
            let rawName = afterKeyword[nameMatch].trimmingCharacters(in: .whitespacesAndNewlines)
            if ["var", "func", "let", "subscript"].contains(rawName) { continue }
            let preStart = code.index(range.lowerBound, offsetBy: -200, limitedBy: code.startIndex) ?? code.startIndex
            let pre = String(code[preStart..<range.lowerBound])
            let isNonisolated = pre.range(of: "\\bnonisolated\\b(?=[^{}]*$)", options: .regularExpression) != nil
            let isMainActor = pre.range(of: "@MainActor\\b(?=[^{}]*$)", options: .regularExpression) != nil
            let afterName = afterKeyword[nameMatch.upperBound...]
            let hasDeinit = Self.bodyContainsDeinit(
                chars: chars,
                startOffset: code.distance(from: code.startIndex, to: afterName.startIndex))
            out.append(ClassDecl(relativePath: relativePath, name: rawName,
                                 isNonisolated: isNonisolated, isMainActor: isMainActor,
                                 hasDeinit: hasDeinit))
        }
        return out
    }

    /// `deinit` déclaré au niveau 1 du corps de classe uniquement (pas dans un
    /// type imbriqué — constat 2 de la revue Opus).
    static func bodyContainsDeinit(chars: [Character], startOffset: Int) -> Bool {
        guard let open = (startOffset..<chars.count).first(where: { chars[$0] == "{" }) else { return false }
        var depth = 0
        var topLevel = ""
        var idx = open
        while idx < chars.count {
            let c = chars[idx]
            if c == "{" { depth += 1 }
            if c == "}" {
                depth -= 1
                if depth == 0 { break }
            }
            if depth == 1 { topLevel.append(c) }
            idx += 1
        }
        return topLevel.range(of: "\\bdeinit\\b", options: .regularExpression) != nil
    }

    // MARK: - Garde principale

    func test_everyExplicitMainActorCoreClass_declaresADeinit() throws {
        let decls = try classDecls()
        XCTAssertGreaterThan(
            decls.count, 60,
            "le balayage de Sources/MeeshySDK/** ne trouve presque aucune classe — la garde " +
            "passerait au vert par omission (leçon 257)."
        )
        let offenders = decls.filter { $0.isMainActor && !$0.isNonisolated && !$0.hasDeinit }
            .map { "\($0.relativePath): \($0.name)" }
        XCTAssertTrue(
            offenders.isEmpty,
            "Ces classes @MainActor EXPLICITES du core n'écrivent aucune `deinit` : leur deinit " +
            "synthétisée est ISOLÉE et double-libère sur iOS 26.1 (abrt). Ajouter " +
            "`nonisolated deinit {}`.\n" + offenders.joined(separator: "\n")
        )
    }

    // MARK: - Méta-tests du parseur

    func test_parser_flagsMissingDeinit_onExplicitMainActor() {
        let d = Self.parse(Self.mask("""
        @MainActor
        public final class Foo {
            var x = 0
        }
        """), relativePath: "S.swift").first { $0.name == "Foo" }
        XCTAssertNotNil(d)
        XCTAssertTrue(d!.isMainActor && !d!.hasDeinit && !d!.isNonisolated)
    }

    func test_parser_ignoresNonAnnotatedClass_inNonisolatedModule() {
        // Sans @MainActor explicite, la classe est nonisolated (défaut du module) → hors scope.
        let d = Self.parse(Self.mask("""
        public final class Bar { var y = 0 }
        """), relativePath: "S.swift").first { $0.name == "Bar" }
        XCTAssertNotNil(d)
        XCTAssertFalse(d!.isMainActor, "une classe non annotée n'est pas @MainActor dans le core")
    }

    func test_parser_acceptsWrittenDeinit() {
        let d = Self.parse(Self.mask("""
        @MainActor final class Baz { deinit { timer?.invalidate() } }
        """), relativePath: "S.swift").first { $0.name == "Baz" }
        XCTAssertTrue(d!.hasDeinit)
    }

    func test_parser_ignoresNestedTypeDeinit() {
        let d = Self.parse(Self.mask("""
        @MainActor final class Host {
            final class Inner { deinit {} }
            var x = 0
        }
        """), relativePath: "S.swift").first { $0.name == "Host" }
        XCTAssertNotNil(d)
        XCTAssertFalse(d!.hasDeinit, "la deinit d'un type imbriqué ne blanchit pas l'hôte")
    }

    func test_parser_ignoresDeinitInsideStringLiteral() {
        let d = Self.parse(Self.mask("""
        @MainActor final class Q { let s = "deinit not real"; var x = 0 }
        """), relativePath: "S.swift").first { $0.name == "Q" }
        XCTAssertNotNil(d)
        XCTAssertFalse(d!.hasDeinit, "un `deinit` dans un littéral ne compte pas")
    }
}
