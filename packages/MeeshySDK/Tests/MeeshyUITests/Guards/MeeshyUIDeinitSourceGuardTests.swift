import XCTest

/// Garde de source SDK — famille « deinit isolée iOS 26.1 » (SE-0466),
/// jumelle SDK de `MainActorDeinitSourceGuardTests` (app).
///
/// Le module `MeeshyUI` déclare `.defaultIsolation(MainActor.self)`
/// (`Package.swift`, SE-0466) : **toute** `class` non marquée `nonisolated`
/// est implicitement `@MainActor` et reçoit une deinit synthétisée ISOLÉE.
/// Sur iOS 26.1, détruite hors d'une tâche courante (test synchrone, vue
/// démontée), elle double-libère le scope task-local
/// (`malloc: … pointer being freed was not allocated`, abrt) et tue la suite.
///
/// Mesuré sur simulateur iOS 26.1 dédié (`Meeshy-Composer-SDK`,
/// `1BEAF630-3C62-44D8-B176-18387D242AB5`) : 83 crashs de cette signature sur
/// la suite complète du package, dont `MediaAltCollectionTests` (17),
/// `ComposerLayerActionsTests` (12), `ImageEditorViewModelTests` (10),
/// `AudienceUserPickerViewModelTests` (5), `AddBorrowedSoundAuthorTests` (1).
/// Réf. `reference_se0466_implicit_isolated_deinit_double_frees_on_ios18`.
///
/// **Critère in-scope, plus LARGE que la garde app, et pourquoi.** L'app
/// restreint à `@MainActor ObservableObject` ; ici le critère est « toute
/// `class` de `Sources/MeeshyUI/**` non marquée `nonisolated` ». La raison est
/// mesurée : des crashers du log ne sont PAS `ObservableObject`
/// (`MediaAltCollection`, `ImageFilterEngine`) — ce sont de simples classes à
/// état, isolées MainActor par le défaut du module. Le risque suit l'isolation,
/// pas la conformité `ObservableObject` : sous `.defaultIsolation(MainActor)`,
/// toute classe non-`nonisolated` porte la forme. Le correctif reste
/// `nonisolated deinit {}` (corps vide : rien d'isolé à toucher).
///
/// Une classe qui écrit DÉJÀ une `deinit` est hors portée (sa deinit est
/// non-isolée par défaut, et son corps a été pensé pour le démontage).
final class MeeshyUIDeinitSourceGuardTests: XCTestCase {

    private struct ClassDecl {
        let relativePath: String
        let name: String
        let isNonisolated: Bool
        let hasDeinit: Bool
    }

    private func meeshyUIRoot() -> URL {
        ComposerSourceGuard.packageRoot.appendingPathComponent("Sources/MeeshyUI")
    }

    private func classDecls() throws -> [ClassDecl] {
        let root = meeshyUIRoot()
        let enumerator = try XCTUnwrap(
            FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil),
            "impossible d'énumérer \(root.path) — Sources/MeeshyUI a-t-il bougé ?"
        )
        var out: [ClassDecl] = []
        for case let url as URL in enumerator where url.pathExtension == "swift" {
            let relative = url.path.replacingOccurrences(of: root.path + "/", with: "")
            let stripped = ComposerSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            out.append(contentsOf: Self.parse(stripped, relativePath: relative))
        }
        return out.sorted { ($0.relativePath, $0.name) < ($1.relativePath, $1.name) }
    }

    /// Même analyseur que la garde app, réduit aux faits utiles ici (isolation
    /// déclarée + présence d'un `deinit`) puisque le critère SDK ne regarde pas
    /// `ObservableObject`. Exclut les membres `class var`/`func`/`let`/`subscript`.
    private static func parse(_ code: String, relativePath: String) -> [ClassDecl] {
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
            let afterName = afterKeyword[nameMatch.upperBound...]
            let hasDeinit = Self.bodyContainsDeinit(
                chars: chars,
                startOffset: code.distance(from: code.startIndex, to: afterName.startIndex))
            out.append(ClassDecl(relativePath: relativePath, name: rawName,
                                 isNonisolated: isNonisolated, hasDeinit: hasDeinit))
        }
        return out
    }

    private static func bodyContainsDeinit(chars: [Character], startOffset: Int) -> Bool {
        guard let open = (startOffset..<chars.count).first(where: { chars[$0] == "{" }) else { return false }
        var depth = 0
        var body = ""
        var idx = open
        while idx < chars.count {
            let c = chars[idx]
            if c == "{" { depth += 1 }
            if c == "}" {
                depth -= 1
                if depth == 0 { break }
            }
            if depth >= 1 { body.append(c) }
            idx += 1
        }
        return body.range(of: "\\bdeinit\\b", options: .regularExpression) != nil
    }

    // MARK: - Garde principale

    func test_everyNonisolatedMeeshyUIClass_declaresADeinit() throws {
        let decls = try classDecls()
        XCTAssertGreaterThan(
            decls.count, 60,
            "le balayage de Sources/MeeshyUI/** ne trouve presque aucune classe — la garde " +
            "passerait au vert par omission (leçon 257), pas parce que la famille est traitée."
        )
        let offenders = decls.filter { !$0.isNonisolated && !$0.hasDeinit }
            .map { "\($0.relativePath): \($0.name)" }
        XCTAssertTrue(
            offenders.isEmpty,
            "Ces classes de MeeshyUI (isolées MainActor par défaut de module) n'écrivent aucune " +
            "`deinit` : leur deinit synthétisée est ISOLÉE et double-libère sur iOS 26.1 (abrt). " +
            "Ajouter `nonisolated deinit {}` ou marquer le type `nonisolated`.\n" +
            offenders.joined(separator: "\n")
        )
    }

    // MARK: - Méta-tests du parseur

    func test_parser_flagsMissingDeinit() {
        let decls = Self.parse(ComposerSourceGuard.stripComments("""
        public final class Foo {
            var x = 0
        }
        """), relativePath: "S.swift")
        let foo = decls.first { $0.name == "Foo" }
        XCTAssertNotNil(foo)
        XCTAssertTrue(!foo!.isNonisolated && !foo!.hasDeinit)
    }

    func test_parser_acceptsWrittenDeinit() {
        let bar = Self.parse(ComposerSourceGuard.stripComments("""
        final class Bar { deinit { player?.pause() } }
        """), relativePath: "S.swift").first { $0.name == "Bar" }
        XCTAssertTrue(bar!.hasDeinit)
    }

    func test_parser_acceptsNonisolatedType() {
        let baz = Self.parse(ComposerSourceGuard.stripComments("""
        nonisolated final class Baz { var y = 0 }
        """), relativePath: "S.swift").first { $0.name == "Baz" }
        XCTAssertTrue(baz!.isNonisolated)
    }

    func test_parser_ignoresClassMemberDeclarations() {
        let names = Self.parse(ComposerSourceGuard.stripComments("""
        final class Widget {
            override class var layerClass: AnyClass { CALayer.self }
            deinit {}
        }
        """), relativePath: "S.swift").map(\.name)
        XCTAssertEqual(names, ["Widget"])
    }
}
