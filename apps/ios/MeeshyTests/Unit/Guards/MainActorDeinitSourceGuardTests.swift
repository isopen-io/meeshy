import XCTest
@testable import Meeshy

/// Garde de source — famille « deinit isolée iOS 26.1 » (SE-0466).
///
/// La cible `Meeshy` compile sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`
/// (`apps/ios/project.yml`) : toute `class` non marquée `nonisolated` est donc
/// implicitement `@MainActor`, et Swift 6.2 lui synthétise une **deinit
/// isolée**. Sur le runtime **iOS 26.1**, cette deinit exécutée SANS tâche
/// courante — un test `XCTestCase` synchrone, une vue SwiftUI démontée —
/// double-libère le scope task-local :
/// `malloc: *** error for object 0x…: pointer being freed was not allocated`
/// (abrt), qui tue le processus de test entier et redémarre le runner.
///
/// Mesuré sur simulateur iOS 26.1 dédié (`Meeshy-Composer`,
/// `5583E7B1-DF1C-46A6-BADF-06EA7717D3F4`) : la suite unitaire s'arrête, entre
/// autres, sur `AudioRecorderManagerTests` (14 crashs), `AudioBubbleRouterTests`
/// (3), `ActiveSessionsViewModelTests` (1) et `ReelFeedSoundIntentTests` (11) —
/// chacune détruit une classe `@MainActor ObservableObject` de l'app. Le
/// simulateur de référence partagé était resté en iOS 18.2, où cette famille
/// n'apparaît pas : tous les gates « verts » du dépôt l'ont manquée.
/// Précédents fixés à la main avant cette garde : `UpgradeGateController`
/// (`872151e55e`), `MessageStore`, `ConversationListViewModel`.
/// Réf. `reference_se0466_implicit_isolated_deinit_double_frees_on_ios18`.
///
/// **Le correctif préservateur de comportement** est `nonisolated deinit {}` —
/// un corps vide n'a aucun état isolé à toucher, donc rien à faire sur le main
/// actor, et la deinit cesse d'être isolée. Cette garde exige donc que TOUTE
/// classe in-scope — `@MainActor` (explicite ou par défaut de cible) ET
/// conforme à `ObservableObject` — déclare un `deinit` dans son corps (le
/// sweep les pose toutes `nonisolated`). Une classe qui porte DÉJÀ une `deinit`
/// écrite est hors de portée de cette garde — MAIS pas parce qu'elle serait
/// sûre : une deinit écrite SANS `nonisolated` sur une classe @MainActor est
/// ELLE AUSSI isolée (c'est l'ISOLATION, pas l'absence de deinit, qui déclenche
/// le crash). Ces classes (18 app, 6 SDK au 2026-08-26) forment un SUIVI
/// distinct, jugé empiriquement sur 26.1 : certaines se corrigent en marquant
/// leur deinit `nonisolated` (corps ne touchant que du Sendable), d'autres non —
/// `AudioRecorderManager` crashe ENCORE avec `nonisolated deinit` (cause
/// AVFoundation mesurée, pas l'isolation). Cette garde couvre la famille SANS
/// deinit écrite ; la famille À deinit écrite reste OUVERTE (voir la revue Opus
/// de la vague 1c et la leçon SE-0466).
///
/// Restreindre l'in-scope à `ObservableObject` (et non « toute classe
/// `@MainActor` ») est délibéré : ce sont les types que SwiftUI détruit hors
/// tâche (démontage de vue) et que les suites construisent en synchrone. Le
/// pendant SDK (`MeeshyUIDeinitSourceGuardTests`) élargit le critère parce que
/// `MeeshyUI` isole TOUTE classe par défaut et que des crashers mesurés y sont
/// non-`ObservableObject` (`MediaAltCollection`, `ImageFilterEngine`).
final class MainActorDeinitSourceGuardTests: XCTestCase {

    // MARK: - Arborescence

    private func meeshyRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Guards
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")
    }

    private struct ClassDecl {
        let relativePath: String
        let name: String
        let isNonisolated: Bool
        let isMainActor: Bool
        let conformsObservableObject: Bool
        let hasDeinit: Bool
    }

    /// Toutes les déclarations `class` de `apps/ios/Meeshy/**`, commentaires et
    /// littéraux ET chaînes neutralisés (`DeclarationBodyScanner.mask`), avec les faits
    /// nécessaires au verdict : isolation déclarée, conformité `ObservableObject`
    /// (au site de déclaration), présence d'un `deinit` dans le corps équilibré.
    private func classDecls() throws -> [ClassDecl] {
        let root = meeshyRoot()
        let enumerator = try XCTUnwrap(
            FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil),
            "impossible d'énumérer \(root.path) — apps/ios/Meeshy a-t-il bougé ?"
        )
        var out: [ClassDecl] = []
        for case let url as URL in enumerator where url.pathExtension == "swift" {
            let relative = url.path.replacingOccurrences(of: root.path + "/", with: "")
            let stripped = DeclarationBodyScanner.mask(Self.preprocessIOS(try String(contentsOf: url, encoding: .utf8)))
            out.append(contentsOf: Self.parse(stripped, relativePath: relative))
        }
        return out.sorted { ($0.relativePath, $0.name) < ($1.relativePath, $1.name) }
    }

    /// Analyse SANS SourceKit : repère chaque `class Nom`, lit les modificateurs
    /// qui la précèdent (`nonisolated`, `@MainActor`), la clause d'héritage
    /// jusqu'à `{`, et cherche un `deinit` dans le corps équilibré. Exclut les
    /// membres statiques `class var`/`class func`/`class let`/`class subscript`.
    /// Garde uniquement les branches actives pour une compilation iOS et
    /// remplace les lignes des branches inactives (macOS/watchOS/tvOS/Catalyst)
    /// par des lignes vides. Sans ça, une classe déclarée dans DEUX branches
    /// d'un `#if os(iOS)/#else` (ex. `P2PWebRTCClient`) déséquilibre le
    /// comptage d'accolades et masque sa propre `deinit`, produisant un faux
    /// positif. Condition inconnue → branche gardée (conservateur).
    static func preprocessIOS(_ source: String) -> String {
        func condTrue(_ raw: String) -> Bool {
            let c = raw.trimmingCharacters(in: .whitespaces)
            if c.contains("os(macOS)") || c.contains("os(watchOS)")
                || c.contains("os(tvOS)") || c.contains("os(visionOS)")
                || c.contains("targetEnvironment(macCatalyst)") { return false }
            return true
        }
        var out: [String] = []
        var stack: [(active: Bool, taken: Bool)] = []
        for line in source.components(separatedBy: "\n") {
            let st = line.trimmingCharacters(in: .whitespaces)
            if st.hasPrefix("#if ") {
                let parent = stack.allSatisfy { $0.active }
                let c = condTrue(String(st.dropFirst(4)))
                stack.append((parent && c, c))
                out.append(""); continue
            }
            if st.hasPrefix("#elseif ") {
                if !stack.isEmpty {
                    let parent = stack.dropLast().allSatisfy { $0.active }
                    let taken = stack[stack.count - 1].taken
                    let c = condTrue(String(st.dropFirst(8)))
                    stack[stack.count - 1] = (parent && !taken && c, taken || c)
                }
                out.append(""); continue
            }
            if st.hasPrefix("#else") {
                if !stack.isEmpty {
                    let parent = stack.dropLast().allSatisfy { $0.active }
                    let taken = stack[stack.count - 1].taken
                    stack[stack.count - 1] = (parent && !taken, true)
                }
                out.append(""); continue
            }
            if st.hasPrefix("#endif") {
                if !stack.isEmpty { stack.removeLast() }
                out.append(""); continue
            }
            out.append(stack.allSatisfy { $0.active } ? line : "")
        }
        return out.joined(separator: "\n")
    }

    private static func parse(_ code: String, relativePath: String) -> [ClassDecl] {
        let chars = Array(code)
        var out: [ClassDecl] = []
        var i = code.startIndex
        while let range = code.range(of: "class ", range: i..<code.endIndex) {
            i = range.upperBound
            // le token précédent est-il un mot qui ferait de `class` un membre ?
            let afterKeyword = code[range.upperBound...]
            // nom de la classe
            guard let nameMatch = afterKeyword.range(
                of: "^\\s*([A-Za-z_][A-Za-z0-9_]*)", options: .regularExpression) else { continue }
            let rawName = afterKeyword[nameMatch].trimmingCharacters(in: .whitespacesAndNewlines)
            if ["var", "func", "let", "subscript"].contains(rawName) { continue }
            // modificateurs précédant `class` (fenêtre courte)
            let preStart = code.index(range.lowerBound, offsetBy: -200, limitedBy: code.startIndex) ?? code.startIndex
            let pre = String(code[preStart..<range.lowerBound])
            // Un modificateur appartient à CETTE classe s'il n'y a aucune
            // accolade entre lui et le mot-clé `class` (les attributs/modifieurs
            // précèdent la déclaration sans corps intermédiaire) — le lookahead
            // `[^{}]*$` rejette donc un `nonisolated` hérité d'un membre voisin.
            let isNonisolated = pre.range(of: "\\bnonisolated\\b(?=[^{}]*$)", options: .regularExpression) != nil
            let isMainActor = pre.range(of: "@MainActor\\b(?=[^{}]*$)", options: .regularExpression) != nil
            // clause d'héritage : de la fin du nom jusqu'au `{`
            let afterName = afterKeyword[nameMatch.upperBound...]
            let inherit: String
            if let brace = afterName.firstIndex(of: "{") {
                inherit = String(afterName[..<brace])
            } else { inherit = "" }
            let conforms = inherit.contains("ObservableObject")
            // corps équilibré
            let hasDeinit = Self.bodyContainsDeinit(chars: chars,
                                                    startOffset: code.distance(from: code.startIndex, to: afterName.startIndex))
            out.append(ClassDecl(relativePath: relativePath, name: rawName,
                                 isNonisolated: isNonisolated, isMainActor: isMainActor,
                                 conformsObservableObject: conforms, hasDeinit: hasDeinit))
        }
        return out
    }

    /// `true` si le corps `{ … }` de la déclaration commençant à `startOffset`
    /// déclare un `deinit` À SON PROPRE NIVEAU. Le corps est balayé par
    /// équilibrage d'accolades sur le texte déjà masqué (commentaires ET
    /// contenu des chaînes neutralisés en amont via `DeclarationBodyScanner.mask`),
    /// et SEULS les caractères de profondeur 1 — les membres DIRECTS de la classe —
    /// sont retenus : un `deinit` appartenant à un TYPE IMBRIQUÉ (profondeur ≥ 2)
    /// ne blanchit donc pas la classe hôte (constat 2 de la revue Opus).
    private static func bodyContainsDeinit(chars: [Character], startOffset: Int) -> Bool {
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

    private func inScope(_ d: ClassDecl) -> Bool {
        // Critère LARGE, aligné sur MeeshyUI : la cible app compile sous
        // SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor, donc TOUTE classe non
        // marquée `nonisolated` est @MainActor et porte une deinit isolée —
        // pas seulement les ObservableObject (constat 4 de la revue Opus,
        // confirmé par le re-gate complet : BubbleHeightCache, une classe
        // @MainActor NON-OO, crashait). `isMainActor`/`conformsObservableObject`
        // restent calculés pour le diagnostic mais ne restreignent plus le scope.
        !d.isNonisolated
    }

    // MARK: - Garde principale

    /// Toute classe in-scope déclare un `deinit` (le sweep les pose
    /// `nonisolated deinit {}`). Sans lui, la deinit synthétisée est isolée et
    /// tue les suites sur iOS 26.1.
    func test_everyMainActorObservableObject_declaresADeinit() throws {
        let decls = try classDecls()
        XCTAssertGreaterThan(
            decls.count, 150,
            "le balayage de apps/ios/Meeshy/** ne trouve presque aucune classe — la garde " +
            "passerait au vert par omission (leçon 257), pas parce que la famille est traitée."
        )
        let offenders = decls.filter { inScope($0) && !$0.hasDeinit }
            .map { "\($0.relativePath): \($0.name)" }
        XCTAssertTrue(
            offenders.isEmpty,
            "Ces classes @MainActor ObservableObject n'écrivent aucune `deinit` : leur deinit " +
            "synthétisée est ISOLÉE et double-libère sur iOS 26.1 (abrt). Ajouter " +
            "`nonisolated deinit {}`.\n" + offenders.joined(separator: "\n")
        )
    }

    // MARK: - Méta-tests du parseur (la garde se garde elle-même)

    func test_parser_flagsMissingDeinit_onMainActorObservableObject() {
        let sample = """
        @MainActor
        final class Foo: ObservableObject {
            @Published var x = 0
        }
        """
        let decls = Self.parse(DeclarationBodyScanner.mask(sample), relativePath: "S.swift")
        let foo = decls.first { $0.name == "Foo" }
        XCTAssertNotNil(foo)
        XCTAssertTrue(foo!.isMainActor && foo!.conformsObservableObject && !foo!.hasDeinit,
                      "une classe @MainActor ObservableObject sans deinit doit être détectée fautive")
    }

    func test_parser_acceptsWrittenDeinit() {
        let sample = """
        @MainActor
        final class Bar: ObservableObject {
            deinit { timer?.invalidate() }
        }
        """
        let bar = Self.parse(DeclarationBodyScanner.mask(sample), relativePath: "S.swift").first { $0.name == "Bar" }
        XCTAssertNotNil(bar)
        XCTAssertTrue(bar!.hasDeinit, "une deinit écrite doit satisfaire la garde")
    }

    func test_parser_acceptsNonisolatedType() {
        let sample = """
        nonisolated final class Baz: ObservableObject {
            @Published var y = 0
        }
        """
        let baz = Self.parse(DeclarationBodyScanner.mask(sample), relativePath: "S.swift").first { $0.name == "Baz" }
        XCTAssertNotNil(baz)
        XCTAssertTrue(baz!.isNonisolated, "une classe nonisolated est hors scope — pas de deinit isolée")
    }

    func test_parser_ignoresClassMemberDeclarations() {
        let sample = """
        @MainActor
        final class Widget: ObservableObject {
            override class var layerClass: AnyClass { CALayer.self }
            deinit {}
        }
        """
        let names = Self.parse(DeclarationBodyScanner.mask(sample), relativePath: "S.swift").map(\.name)
        XCTAssertEqual(names, ["Widget"], "`class var` ne doit pas être pris pour une déclaration de classe")
    }
}
