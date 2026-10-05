import XCTest
import MeeshyUI
@testable import Meeshy

/// #9135, #9456 — sous iOS 26, `ViewThatFits` mesure ses candidats sur
/// `com.apple.SwiftUI.AsyncRenderer`. Les fermetures de contenu évaluées à la
/// MISE EN PAGE — celle d'un `ForEach`, celle d'un `GeometryReader` — y sont
/// appelées ; écrites dans une cible dont l'isolation par défaut est le main
/// actor, elles en héritent et trappent à leur entrée
/// (`_dispatch_assert_queue_fail`, SIGTRAP). `.ips` à l'appui : la rangée de
/// statistiques de la carte de conversation (2026-09-29), les rails du composer
/// (2026-10-05).
///
/// Le rendu asynchrone ne se provoque pas dans un test : la garde tient la
/// FORME, sur un balayage des sources de l'app et de MeeshyUI. Depuis chaque
/// candidat de `ViewThatFits`, elle suit ce qu'il atteint — les propriétés et
/// fonctions de la même famille de fichiers (`Type.swift`, `Type+*.swift`), les
/// types déclarés dans les sources — et y refuse :
/// - un `ForEach` qui ne reçoit pas `asyncRenderRowContent` (entrées construites
///   par le `body`, `AsyncRenderRow`) ;
/// - un `GeometryReader` dont le contenu n'est pas un `FramePreferenceProbe`.
final class ViewThatFitsAsyncRenderGuardTests: XCTestCase {

    // MARK: - Ce que le rendu asynchrone appelle désormais

    func test_uneEntreeSeRelitHorsDuFilPrincipal() {
        let relu = expectation(description: "entrée relue sur une file de fond")
        DispatchQueue.global(qos: .userInteractive).async {
            let rangee = AsyncRenderRow(id: "media", content: 42)
            XCTAssertFalse(Thread.isMainThread)
            XCTAssertEqual(asyncRenderRowContent(rangee), 42)
            relu.fulfill()
        }
        wait(for: [relu], timeout: 2.0)
    }

    func test_lesFormesSuresSontNonIsolees() throws {
        let unit = AppSourceGuard.stripComments(try String(contentsOf: Self.repoRoot()
            .appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Primitives/AsyncRenderSafeContent.swift"),
                                                          encoding: .utf8))
        XCTAssertTrue(unit.contains("public nonisolated struct AsyncRenderRow<"))
        XCTAssertTrue(unit.contains("public nonisolated func asyncRenderRowContent<"),
                      "sans `nonisolated`, l'isolation par défaut de MeeshyUI remettrait le contrôle d'exécuteur")
        XCTAssertTrue(unit.contains("public nonisolated struct FramePreferenceProbe<"))
        XCTAssertTrue(unit.contains("value: @escaping @Sendable (CGRect) -> Key.Value"),
                      "une transformation non `@Sendable` hériterait du main actor de l'appelant")
    }

    // MARK: - La garde elle-même

    func test_laGardeVoitUnForEachAtteintParUneSousPropriete() {
        let violations = AsyncRenderReachability.violations(in: [
            .init(path: "Demo.swift", source: """
            struct Demo: View {
                var body: some View {
                    ViewThatFits(in: .vertical) {
                        rows
                        ScrollView { rows }
                    }
                }
                private var rows: some View {
                    VStack { ForEach(items) { item in Text(item.name) } }
                }
            }
            """),
        ])
        XCTAssertEqual(violations.count, 1, "\(violations)")
    }

    func test_laGardeVoitUnGeometryReaderDansUnTypeAtteint() {
        let violations = AsyncRenderReachability.violations(in: [
            .init(path: "Host.swift", source: """
            struct Host: View {
                var body: some View {
                    ViewThatFits { Probe() }
                }
            }
            """),
            .init(path: "Probe.swift", source: """
            struct Probe: View {
                var body: some View { GeometryReader { proxy in Color.clear } }
            }
            """),
        ])
        XCTAssertEqual(violations.count, 1, "\(violations)")
    }

    func test_laGardeAccepteLesFormesSures() {
        let violations = AsyncRenderReachability.violations(in: [
            .init(path: "Demo.swift", source: """
            struct Demo: View {
                var body: some View {
                    ViewThatFits(in: .vertical) {
                        VStack {
                            ForEach(items.map { AsyncRenderRow(id: $0.id, content: Text("\\($0.name) {")) },
                                    content: asyncRenderRowContent)
                        }
                        .background(GeometryReader(content: FramePreferenceProbe(K.self, in: .global) { $0 }.content))
                    }
                }
            }
            """),
        ])
        XCTAssertEqual(violations, [])
    }

    // MARK: - Le balayage

    func test_aucunCandidatDeViewThatFitsNAtteintUneFermetureIsolee() throws {
        let files = try Self.sweptFiles()
        let sites = files.filter { AsyncRenderReachability.blankingStrings($0.source).contains("ViewThatFits(") }
        XCTAssertGreaterThanOrEqual(sites.count, 10,
                                    "balayage trop maigre — la garde ne mesurerait rien (\(sites.map(\.path)))")
        let violations = AsyncRenderReachability.violations(in: files,
                                                            injectedAnchors: Self.injectedAnchors,
                                                            injectedTypes: Self.injectedTypes)
        XCTAssertEqual(violations, [],
                       "Une fermeture de ForEach ou de GeometryReader est atteignable depuis un candidat de "
                       + "ViewThatFits : iOS 26 l'appellerait sur le rendu asynchrone et l'isolation au main "
                       + "actor y trapperait. Construire les entrées dans le body (AsyncRenderRow + "
                       + "asyncRenderRowContent) ou mesurer par FramePreferenceProbe / onGeometryChange.")
    }

    /// Le contenu qu'un candidat reçoit par une FERMETURE de l'hôte, invisible
    /// depuis le corps du `ViewThatFits` : on nomme le bloc qui le fournit.
    private static let injectedAnchors: [AsyncRenderReachability.Anchor] = [
        // `unfoldedRows(_:)` enveloppe son contenu dans le `ViewThatFits` de la pilule.
        .init(fileSuffix: "CallView+Pill.swift", text: "unfoldedRows {"),
        // `ComposerToolbarStrip` pose `leading` et `pinned` dans ses candidats.
        .init(fileSuffix: "UniversalComposerBar+Toolbar.swift", text: "ComposerToolbarStrip {"),
        .init(fileSuffix: "UniversalComposerBar+Toolbar.swift", text: "} pinned: {"),
    ]

    /// Le contenu qu'un candidat reçoit par un GÉNÉRIQUE ou un `AnyView` : le
    /// rendu de la légende (`MediaCaptionOverlay.render`) et l'entrée système du
    /// rail du composer (`ComposerLeadingRail.systemEntry`).
    private static let injectedTypes = ["MediaCaptionRichText", "MediaCaptionPlainText", "BlankCanvasPasteStarter"]

    private static func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // …/Unit/Architecture
            .deletingLastPathComponent()  // …/Unit
            .deletingLastPathComponent()  // …/MeeshyTests
            .deletingLastPathComponent()  // …/apps/ios
            .deletingLastPathComponent()  // …/apps
            .deletingLastPathComponent()  // racine du dépôt
    }

    private static func sweptFiles() throws -> [AsyncRenderReachability.File] {
        let root = repoRoot()
        let roots = ["apps/ios/Meeshy", "packages/MeeshySDK/Sources/MeeshyUI"].map { root.appendingPathComponent($0) }
        return try roots.flatMap { dir -> [AsyncRenderReachability.File] in
            guard let walker = FileManager.default.enumerator(at: dir, includingPropertiesForKeys: nil) else {
                XCTFail("dossier introuvable : \(dir.path)")
                return []
            }
            return try walker.compactMap { $0 as? URL }
                .filter { $0.pathExtension == "swift" }
                .map { url in
                    .init(path: String(url.path.dropFirst(root.path.count + 1)),
                          source: AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8)))
                }
        }
    }
}

/// Le graphe d'atteignabilité, sur du texte : sur-approximation volontaire
/// (un nom de membre de la famille, un nom de type déclaré) — une garde de
/// forme préfère un faux rouge à lire qu'un vert par omission.
enum AsyncRenderReachability {

    struct File {
        let path: String
        let source: String
    }

    struct Anchor {
        let fileSuffix: String
        let text: String
    }

    private struct Unit {
        let file: Int
        let start: Int
        let end: Int
    }

    static func violations(in files: [File],
                           injectedAnchors: [Anchor] = [],
                           injectedTypes: [String] = []) -> [String] {
        let texts = files.map { Array(blankingStrings($0.source).utf8) }
        let families = files.map { family(of: $0.path) }
        var members: [String: [Unit]] = [:]
        var types: [String: [Unit]] = [:]
        var enclosing: [Int: [Unit]] = [:]
        var extensions: [(name: String, unit: Unit)] = []
        for (index, text) in texts.enumerated() {
            let found = declarations(in: text)
            let viewExtensions = found.filter { $0.kind == .extension && ["View", "SwiftUI.View"].contains($0.name) }
            for declaration in found {
                let unit = Unit(file: index, start: declaration.start, end: declaration.end)
                switch declaration.kind {
                case .member:
                    members[families[index] + "." + declaration.name, default: []].append(unit)
                    enclosing[index, default: []].append(unit)
                    // Un modificateur maison (`extension View`) s'appelle de partout.
                    if viewExtensions.contains(where: { $0.start < unit.start && unit.end <= $0.end }) {
                        members["View." + declaration.name, default: []].append(unit)
                    }
                case .type:
                    types[declaration.name, default: []].append(unit)
                case .extension:
                    extensions.append((declaration.name, unit))
                }
            }
        }
        // Les extensions des seuls types DÉCLARÉS ici : `extension View`
        // n'emporte pas tous les modificateurs du dépôt à chaque `some View`.
        for (name, unit) in extensions where types[name] != nil {
            types[name, default: []].append(unit)
        }

        var roots: [Unit] = []
        for (index, text) in texts.enumerated() {
            for site in occurrences(of: "ViewThatFits(", in: text) {
                guard let open = firstIndex(of: UInt8(ascii: "{"), in: text, from: site),
                      let close = matching(open, in: text) else { continue }
                let owner = (enclosing[index] ?? []).filter { $0.start <= site && site < $0.end }.max { $0.start < $1.start }
                roots.append(Unit(file: index, start: owner?.start ?? site, end: close + 1))
            }
            for anchor in injectedAnchors where files[index].path.hasSuffix(anchor.fileSuffix) {
                for site in occurrences(of: anchor.text, in: text) {
                    let open = site + anchor.text.utf8.count - 1
                    guard let close = matching(open, in: text) else { continue }
                    roots.append(Unit(file: index, start: open, end: close + 1))
                }
            }
        }
        roots += injectedTypes.flatMap { types[$0] ?? [] }

        var visited = Set<String>()
        var queue = roots
        var found = Set<String>()
        while let unit = queue.popLast() {
            let key = "\(unit.file):\(unit.start):\(unit.end)"
            guard visited.insert(key).inserted else { continue }
            let text = texts[unit.file]
            let slice = Array(text[unit.start..<unit.end])
            for problem in problems(in: slice) {
                found.insert("\(files[unit.file].path):\(line(of: unit.start + problem.offset, in: text)) — \(problem.what)")
            }
            for token in identifiers(in: slice) {
                if token != "body", let reached = members[families[unit.file] + "." + token] {
                    queue += reached
                }
                if token != "body", let reached = members["View." + token] {
                    queue += reached
                }
                if let first = token.utf8.first, (65...90).contains(first), let reached = types[token] {
                    queue += reached
                }
            }
        }
        return found.sorted()
    }

    // MARK: - Ce qui est refusé

    private static func problems(in text: [UInt8]) -> [(offset: Int, what: String)] {
        let forEaches = occurrences(of: "ForEach(", in: text).compactMap { site -> (Int, String)? in
            let open = site + 7
            guard let close = matching(open, in: text) else { return (site, "ForEach illisible") }
            let arguments = String(decoding: text[(open + 1)..<close], as: UTF8.self)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let readsBuiltRows = arguments.hasSuffix("content: asyncRenderRowContent")
            let trailing = text[(close + 1)...].first { !isSpace($0) }
            return readsBuiltRows && trailing != UInt8(ascii: "{")
                ? nil
                : (site, "ForEach à fermeture")
        }
        let readers = occurrences(of: "GeometryReader", in: text).compactMap { site -> (Int, String)? in
            let rest = String(decoding: text[(site + 14)...].prefix(40), as: UTF8.self)
            return rest.hasPrefix("(content: FramePreferenceProbe(") ? nil : (site, "GeometryReader à fermeture")
        }
        return forEaches + readers
    }

    // MARK: - Lecture du texte

    /// Le contenu des littéraux (interpolations comprises) devient des espaces :
    /// une accolade ou une parenthèse écrite dans un texte ne fausse plus
    /// l'équilibrage. Les retours à la ligne sont gardés pour les numéros.
    static func blankingStrings(_ source: String) -> String {
        enum Mode { case code(depth: Int), string(multiline: Bool) }
        let bytes = Array(source.utf8)
        var stack: [Mode] = [.code(depth: 0)]
        var out: [UInt8] = []
        out.reserveCapacity(bytes.count)
        var i = 0
        let quote = UInt8(ascii: "\"")
        func isTripleQuote(_ at: Int) -> Bool {
            at + 2 < bytes.count && bytes[at] == quote && bytes[at + 1] == quote && bytes[at + 2] == quote
        }
        while i < bytes.count {
            let byte = bytes[i]
            let visible = stack.count == 1
            switch stack[stack.count - 1] {
            case .code(let depth):
                if isTripleQuote(i) {
                    stack.append(.string(multiline: true))
                    out += visible ? [quote, quote, quote] : [32, 32, 32]
                    i += 3
                    continue
                }
                if byte == quote {
                    stack.append(.string(multiline: false))
                    out.append(visible ? quote : 32)
                } else if stack.count > 1, byte == UInt8(ascii: "(") {
                    stack[stack.count - 1] = .code(depth: depth + 1)
                    out.append(32)
                } else if stack.count > 1, byte == UInt8(ascii: ")") {
                    if depth == 0 { stack.removeLast() } else { stack[stack.count - 1] = .code(depth: depth - 1) }
                    out.append(32)
                } else {
                    out.append(visible || byte == 10 ? byte : 32)
                }
                i += 1
            case .string(let multiline):
                if byte == UInt8(ascii: "\\"), i + 1 < bytes.count {
                    if bytes[i + 1] == UInt8(ascii: "(") { stack.append(.code(depth: 0)) }
                    out += [32, 32]
                    i += 2
                    continue
                }
                if multiline, isTripleQuote(i) {
                    stack.removeLast()
                    out += stack.count == 1 ? [quote, quote, quote] : [32, 32, 32]
                    i += 3
                    continue
                }
                if !multiline, byte == quote {
                    stack.removeLast()
                    out.append(stack.count == 1 ? quote : 32)
                } else {
                    out.append(byte == 10 ? 10 : 32)
                }
                i += 1
            }
        }
        return String(decoding: out, as: UTF8.self)
    }

    private enum Kind { case member, type, `extension` }

    private static func declarations(in text: [UInt8]) -> [(kind: Kind, name: String, start: Int, end: Int)] {
        let keywords: [(String, Kind)] = [("var", .member), ("func", .member),
                                          ("struct", .type), ("class", .type), ("enum", .type),
                                          ("extension", .extension)]
        return keywords.flatMap { keyword, kind in
            occurrences(of: keyword + " ", in: text).compactMap { site -> (Kind, String, Int, Int)? in
                guard site == 0 || !isIdentifier(text[site - 1]) else { return nil }
                let nameStart = site + keyword.utf8.count + 1
                let name = String(decoding: text[nameStart...].prefix { isIdentifier($0) || $0 == UInt8(ascii: ".") },
                                  as: UTF8.self)
                guard !name.isEmpty,
                      let open = bodyOpening(in: text, from: nameStart, stopsAtNewline: keyword == "var"),
                      let close = matching(open, in: text) else { return nil }
                // Seul ce qui PRODUIT une vue se suit : une action de bouton qui
                // charge des données n'est pas du contenu mis en page.
                let signature = String(decoding: text[nameStart..<open], as: UTF8.self)
                guard kind == .extension || signature.contains("View") else { return nil }
                return (kind, name, open, close + 1)
            }
        }
    }

    private static func bodyOpening(in text: [UInt8], from start: Int, stopsAtNewline: Bool) -> Int? {
        var depth = 0
        var i = start
        while i < text.count {
            switch text[i] {
            case UInt8(ascii: "("), UInt8(ascii: "["): depth += 1
            case UInt8(ascii: ")"), UInt8(ascii: "]"): depth -= 1
            case UInt8(ascii: "{") where depth == 0: return i
            case UInt8(ascii: "}") where depth == 0: return nil
            case UInt8(ascii: "=") where depth == 0 && stopsAtNewline: return nil
            case 10 where depth == 0 && stopsAtNewline: return nil
            default: break
            }
            i += 1
        }
        return nil
    }

    private static func matching(_ open: Int, in text: [UInt8]) -> Int? {
        guard open < text.count else { return nil }
        let opener = text[open]
        let closer: UInt8 = opener == UInt8(ascii: "{") ? UInt8(ascii: "}") : UInt8(ascii: ")")
        var depth = 0
        var i = open
        while i < text.count {
            if text[i] == opener { depth += 1 }
            if text[i] == closer {
                depth -= 1
                if depth == 0 { return i }
            }
            i += 1
        }
        return nil
    }

    private static func occurrences(of needle: String, in text: [UInt8]) -> [Int] {
        let pattern = Array(needle.utf8)
        guard pattern.count <= text.count else { return [] }
        return (0...(text.count - pattern.count)).filter { start in
            text[start] == pattern[0] && text[start..<(start + pattern.count)].elementsEqual(pattern)
        }
    }

    private static func firstIndex(of byte: UInt8, in text: [UInt8], from start: Int) -> Int? {
        text[start...].firstIndex(of: byte)
    }

    private static func identifiers(in text: [UInt8]) -> Set<String> {
        var result = Set<String>()
        var current: [UInt8] = []
        for byte in text + [32] {
            if isIdentifier(byte) {
                current.append(byte)
            } else if !current.isEmpty {
                result.insert(String(decoding: current, as: UTF8.self))
                current = []
            }
        }
        return result
    }

    private static func line(of offset: Int, in text: [UInt8]) -> Int {
        text[..<offset].reduce(1) { $0 + ($1 == 10 ? 1 : 0) }
    }

    private static func family(of path: String) -> String {
        let name = (path as NSString).lastPathComponent
        return String(name.prefix { $0 != "+" && $0 != "." })
    }

    private static func isIdentifier(_ byte: UInt8) -> Bool {
        (48...57).contains(byte) || (65...90).contains(byte) || (97...122).contains(byte) || byte == 95
    }

    private static func isSpace(_ byte: UInt8) -> Bool {
        byte == 32 || byte == 10 || byte == 9 || byte == 13
    }
}
