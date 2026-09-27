import XCTest

/// Garde — les types de fonction `async` qui tuent l'app sur iOS 16 et 17 (#8182).
///
/// Toutes les cibles compilent sous `NonisolatedNonsendingByDefault` (SE-0461,
/// `apps/ios/project.yml`, `packages/MeeshySDK/Package.swift`). Un type de
/// fonction `async` écrit sans isolement y devient `nonisolated(nonsending)`, et
/// Swift 6.2 en construit les MÉTADONNÉES par `swift_getExtendedFunctionTypeMetadata`
/// — un point d'entrée entré au runtime Swift 6.0, donc absent d'iOS 16 et 17.
/// Le compilateur le lie en FAIBLE sans chemin de repli : sur ces systèmes, la
/// première demande de métadonnées saute à l'adresse 0.
///
/// Une telle demande n'a rien d'exotique. `objectWillChange` synthétisé parcourt
/// les champs de tout `ObservableObject`, SwiftUI parcourt ceux de toute `View`,
/// et une propriété stockée de ce type suffit : `LaunchSplashController` tuait
/// l'app AU LANCEMENT, `StoryViewModel` À LA CONNEXION — 1.0.8 et 1.1.0 publiées
/// comprises. iOS 18+ a le symbole et ne voit rien : la CI, qui joue sur 18.2,
/// est restée verte tout du long.
///
/// **Le correctif garde la sémantique en DISANT l'isolement** :
/// - `@MainActor` dans un type isolé au main actor (défaut de l'app et de
///   `MeeshyUI`) — la fermeture y tournait déjà, puisque son appelant y est ;
/// - `@concurrent` pour une fermeture `@Sendable` ou dans un type `nonisolated`
///   (cœur du SDK, types `Sendable`) — la sémantique d'avant Swift 6.2.
/// Les deux se décrivent par des métadonnées que connaissent iOS 15+.
///
/// Deux gardes, parce qu'elles ne voient pas la même chose :
/// 1. **le BINAIRE** — aucun exécutable livré n'importe le symbole. C'est la
///    garde EXHAUSTIVE : elle attrape aussi une instanciation générique
///    (`[() async -> Void]` local, `Optional`, `@State`) qu'aucune lecture de
///    source ne reconnaît. Elle ne dit pas OÙ : `nm -u` sur les `.o` le dit.
/// 2. **la SOURCE** — aucune propriété STOCKÉE ni `typealias` ne déclare un type
///    de fonction `async` sans `@concurrent` ou acteur global. Elle nomme le
///    fichier et la ligne du motif qui a causé les deux plantages mesurés.
final class LegacyRuntimeAsyncFunctionTypeGuardTests: XCTestCase {

    // MARK: - 1. Le binaire

    /// Construit à l'exécution : un littéral entier se retrouverait dans ce
    /// bundle de tests et ferait mentir toute future extension du balayage.
    private static let missingEntryPoint = ["_swift", "getExtendedFunctionTypeMetadata"].joined(separator: "_")

    /// Les images Mach-O que l'app EXPÉDIE : exécutable, `*.debug.dylib`
    /// (Debug), extensions (`PlugIns/*.appex`) et frameworks tiers. Le bundle de
    /// tests et les frameworks d'XCTest injectés par Xcode n'en font pas partie.
    private func shippedImages() throws -> [URL] {
        let app = Bundle.main.bundleURL
        let fm = FileManager.default
        var images: [URL] = []
        func machOFiles(in dir: URL) -> [URL] {
            let names = (try? fm.contentsOfDirectory(atPath: dir.path)) ?? []
            return names.map { dir.appendingPathComponent($0) }.filter { url in
                var isDir: ObjCBool = false
                guard fm.fileExists(atPath: url.path, isDirectory: &isDir), !isDir.boolValue else { return false }
                return Self.isMachO(url)
            }
        }
        images += machOFiles(in: app)
        let plugIns = app.appendingPathComponent("PlugIns")
        for appex in (try? fm.contentsOfDirectory(atPath: plugIns.path)) ?? [] where appex.hasSuffix(".appex") {
            images += machOFiles(in: plugIns.appendingPathComponent(appex))
        }
        let frameworks = app.appendingPathComponent("Frameworks")
        let injectedByXcode = ["XC", "Testing", "libXCTest"]
        for fw in (try? fm.contentsOfDirectory(atPath: frameworks.path)) ?? []
        where fw.hasSuffix(".framework") && !injectedByXcode.contains(where: fw.hasPrefix) {
            images += machOFiles(in: frameworks.appendingPathComponent(fw))
        }
        return images
    }

    private static func isMachO(_ url: URL) -> Bool {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return false }
        defer { try? handle.close() }
        guard let head = try? handle.read(upToCount: 4), head.count == 4 else { return false }
        let magics: Set<[UInt8]> = [[0xCF, 0xFA, 0xED, 0xFE], [0xCA, 0xFE, 0xBA, 0xBE]]
        return magics.contains(Array(head))
    }

    private static func imports(_ symbol: String, in url: URL) throws -> Bool {
        let data = try Data(contentsOf: url, options: .mappedIfSafe)
        return data.range(of: Data(symbol.utf8)) != nil
    }

    func test_noShippedImage_importsTheEntryPointMissingBeforeIOS18() throws {
        let images = try shippedImages()
        let names = images.map(\.lastPathComponent)
        XCTAssertTrue(
            names.contains("Meeshy"),
            "le balayage ne trouve pas l'exécutable de Meeshy.app (\(names)) — la garde passerait au vert par omission"
        )
        XCTAssertTrue(
            try images.contains { try Self.imports("_swift_release", in: $0) },
            "aucune image balayée n'importe `_swift_release` : le balayage ne lit pas les tables de symboles, il ne prouve rien"
        )
        let offenders = try images.filter { try Self.imports(Self.missingEntryPoint, in: $0) }
            .map { $0.path.replacingOccurrences(of: Bundle.main.bundleURL.path + "/", with: "") }
        XCTAssertTrue(
            offenders.isEmpty,
            "Ces images importent `\(Self.missingEntryPoint)`, ABSENT du runtime Swift d'iOS 16 et 17 : " +
            "la première demande de métadonnées d'un type de fonction `nonisolated(nonsending)` y saute à 0 (#8182). " +
            "Trouver le site : `nm -u` sur les `.o` de la cible (Intermediates.noindex/**/Objects-normal/arm64/*.o), " +
            "puis écrire l'isolement du type de fonction — `@MainActor` dans un type main-actor, `@concurrent` sinon.\n" +
            offenders.joined(separator: "\n")
        )
    }

    // MARK: - 2. La source

    private func repositoryRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Unit/Guards
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // racine
    }

    /// Tout ce qui est compilé dans un binaire livré : l'app, ses extensions et
    /// le SDK (lié statiquement dans l'app ET dans les extensions).
    private static let scannedRoots = [
        "apps/ios/Meeshy",
        "apps/ios/MeeshyNotificationExtension",
        "apps/ios/MeeshyShareExtension",
        "apps/ios/MeeshyWidgets",
        "apps/ios/MeeshyBroadcastExtension",
        "packages/MeeshySDK/Sources",
    ]

    func test_noStoredPropertyOrTypealias_declaresAnUnisolatedAsyncFunctionType() throws {
        let root = repositoryRoot()
        var scanned = 0
        var offenders: [String] = []
        for relativeRoot in Self.scannedRoots {
            let dir = root.appendingPathComponent(relativeRoot)
            guard let enumerator = FileManager.default.enumerator(at: dir, includingPropertiesForKeys: nil) else { continue }
            for case let url as URL in enumerator where url.pathExtension == "swift" {
                scanned += 1
                let source = try String(contentsOf: url, encoding: .utf8)
                let relative = url.path.replacingOccurrences(of: root.path + "/", with: "")
                offenders += Self.offendingLines(in: source).map { "\(relative):\($0)" }
            }
        }
        XCTAssertGreaterThan(
            scanned, 1000,
            "le balayage ne trouve presque aucun fichier Swift — la garde passerait au vert par omission"
        )
        XCTAssertTrue(
            offenders.isEmpty,
            "Propriété stockée (ou typealias) de type fonction `async` sans isolement écrit : sous " +
            "NonisolatedNonsendingByDefault elle devient `nonisolated(nonsending)`, et la lire par réflexion " +
            "(ObservableObject, View) TUE l'app sur iOS 16 et 17 (#8182). Écrire `@MainActor` dans un type " +
            "main-actor, `@concurrent` pour une fermeture `@Sendable` ou dans un type `nonisolated`.\n" +
            offenders.joined(separator: "\n")
        )
    }

    // MARK: - Analyse (sans SourceKit)

    /// Numéros de ligne (1-based) des déclarations fautives de `source`.
    static func offendingLines(in source: String) -> [Int] {
        let masked = DeclarationBodyScanner.mask(source)
        let chars = Array(masked)
        var lines: [Int] = []
        var scopeIsType: [Bool] = []
        var boundary = 0
        var line = 1
        var i = 0
        while i < chars.count {
            let c = chars[i]
            if c == "\n" { line += 1; i += 1; continue }
            if c == "{" {
                scopeIsType.append(declaresStorageScope(String(chars[boundary..<i])))
                i += 1; boundary = i; continue
            }
            if c == "}" {
                _ = scopeIsType.popLast()
                i += 1; boundary = i; continue
            }
            if c == ";" { i += 1; boundary = i; continue }
            let atWordStart = i == 0 || !(chars[i - 1].isLetter || chars[i - 1].isNumber || chars[i - 1] == "_")
            if atWordStart, c == "t", let type = typealiasTarget(chars, at: i), hasUnisolatedAsyncFunction(type) {
                lines.append(line)
            } else if atWordStart, scopeIsType.last == true, c == "l" || c == "v",
                      let type = storedPropertyType(chars, at: i), hasUnisolatedAsyncFunction(type) {
                lines.append(line)
            }
            i += 1
        }
        return lines
    }

    private static let typeDeclaration = try! NSRegularExpression(
        pattern: #"^\s*(?:(?:@[A-Za-z_]+(?:\([^)]*\))?|public|private|fileprivate|internal|open|final|nonisolated|indirect|package)\s+)*(?:class|struct|enum|actor|extension)\s+[A-Za-z_]"#
    )
    private static let statementWords = try! NSRegularExpression(
        pattern: #"\b(func|init|return|var|let|if|guard|for|while|switch|case|protocol)\b|="#
    )

    /// Le `{` ouvre-t-il le corps d'un type (ou d'une extension), c'est-à-dire
    /// un endroit où `let`/`var` déclare un CHAMP plutôt qu'une locale ?
    static func declaresStorageScope(_ header: String) -> Bool {
        let headerLines = header.components(separatedBy: "\n")
        for start in stride(from: headerLines.count - 1, through: max(0, headerLines.count - 5), by: -1) {
            let candidate = headerLines[start...].joined(separator: "\n")
            let range = NSRange(candidate.startIndex..., in: candidate)
            if statementWords.firstMatch(in: candidate, range: range) != nil { return false }
            if typeDeclaration.firstMatch(in: candidate, range: range) != nil { return true }
        }
        return false
    }

    private static func window(_ chars: [Character], _ i: Int, _ length: Int = 400) -> String {
        String(chars[i..<min(chars.count, i + length)])
    }

    private static let typealiasHead = try! NSRegularExpression(pattern: #"^typealias\s+\w+\s*(?:<[^>]*>)?\s*=\s*([^\n]*)"#)
    private static let propertyHead = try! NSRegularExpression(pattern: #"^(?:let|var)\s+\w+\s*:"#)

    static func typealiasTarget(_ chars: [Character], at i: Int) -> String? {
        let text = window(chars, i)
        let range = NSRange(text.startIndex..., in: text)
        guard let match = typealiasHead.firstMatch(in: text, range: range),
              let target = Range(match.range(at: 1), in: text) else { return nil }
        return String(text[target])
    }

    /// Le type d'une propriété STOCKÉE commençant en `i`, ou `nil` pour une
    /// propriété calculée (`{ … }` sans `didSet`/`willSet`) ou un non-champ.
    static func storedPropertyType(_ chars: [Character], at i: Int) -> String? {
        let text = window(chars, i, 600)
        let range = NSRange(text.startIndex..., in: text)
        guard let head = propertyHead.firstMatch(in: text, range: range),
              let headEnd = Range(head.range, in: text)?.upperBound else { return nil }
        var depth = 0
        var end = headEnd
        while end < text.endIndex {
            let ch = text[end]
            if "([<".contains(ch) { depth += 1 }
            if ")]".contains(ch) { depth -= 1 }
            if ch == ">", end > text.startIndex, text[text.index(before: end)] != "-" { depth -= 1 }
            if depth <= 0, "={\n".contains(ch) { break }
            end = text.index(after: end)
        }
        let type = String(text[headEnd..<end])
        let rest = text[end...].drop(while: { $0 == " " })
        if rest.first == "{" {
            let body = rest.dropFirst().drop(while: { $0 == " " || $0 == "\n" })
            guard body.hasPrefix("didSet") || body.hasPrefix("willSet") else { return nil }
        }
        return type
    }

    private static let asyncArrow = try! NSRegularExpression(pattern: #"\basync\b(?:\s+throws(?:\([^)]*\))?)?\s*->"#)
    private static let isolationAttribute = try! NSRegularExpression(pattern: #"@concurrent|@MainActor|@[A-Z][A-Za-z]*Actor\b"#)
    private static let trailingAttributes = try! NSRegularExpression(pattern: #"((?:@[A-Za-z]+(?:\([^)]*\))?\s*)*)$"#)

    /// Vrai si un type de fonction `async` de `type` n'est précédé d'aucun
    /// isolement écrit (`@concurrent`, `@MainActor`, un acteur global).
    static func hasUnisolatedAsyncFunction(_ type: String) -> Bool {
        let chars = Array(type)
        let ns = type as NSString
        for match in asyncArrow.matches(in: type, range: NSRange(location: 0, length: ns.length)) {
            let arrowStart = type.distance(from: type.startIndex, to: Range(match.range, in: type)!.lowerBound)
            var k = arrowStart - 1
            while k >= 0, chars[k].isWhitespace { k -= 1 }
            guard k >= 0, chars[k] == ")" else { continue }
            var depth = 0
            while k >= 0 {
                if chars[k] == ")" { depth += 1 }
                if chars[k] == "(" { depth -= 1; if depth == 0 { break } }
                k -= 1
            }
            guard k >= 0 else { continue }
            let prefix = String(chars[max(0, k - 80)..<k])
            let prefixRange = NSRange(prefix.startIndex..., in: prefix)
            let attributes = trailingAttributes.firstMatch(in: prefix, range: prefixRange)
                .flatMap { Range($0.range(at: 1), in: prefix) }
                .map { String(prefix[$0]) } ?? ""
            let attributesRange = NSRange(attributes.startIndex..., in: attributes)
            if isolationAttribute.firstMatch(in: attributes, range: attributesRange) == nil { return true }
        }
        return false
    }

    // MARK: - Méta-tests (la garde se garde elle-même)

    func test_parser_flagsTheTwoMeasuredCrashShapes() {
        let sample = """
        @MainActor
        final class LaunchSplashController: ObservableObject {
            private let sleep: (Duration) async throws -> Void
            var introProfileResolver: (String) async throws -> MeeshyUser = { userId in
                try await UserService.shared.getProfile(userId)
            }
        }
        """
        XCTAssertEqual(Self.offendingLines(in: sample), [3, 4])
    }

    func test_parser_flagsOptionalSendableAndTypealiasForms() {
        let sample = """
        struct Row: View {
            let onLoadOlder: (() async -> Void)?
            private let record: @Sendable ([Int]) async throws -> Void
            typealias Provider = @Sendable (String) async -> [Int]
        }
        """
        XCTAssertEqual(Self.offendingLines(in: sample), [2, 3, 4])
    }

    func test_parser_acceptsWrittenIsolation() {
        let sample = """
        final class Model: ObservableObject {
            var a: @MainActor () async -> Void = {}
            let b: @Sendable @concurrent (Int) async throws -> Void
            let c: (@MainActor () async -> Void)?
            typealias D = @concurrent () async -> Int
        }
        """
        XCTAssertEqual(Self.offendingLines(in: sample), [])
    }

    /// Une LOCALE, un paramètre, une propriété calculée et une exigence de
    /// protocole ne sont pas des champs : aucune réflexion ne les parcourt, et
    /// la garde binaire couvre ce qu'une locale générique instancierait.
    func test_parser_ignoresLocalsParametersComputedAndProtocolRequirements() {
        let sample = """
        protocol Loading {
            var load: () async -> Void { get }
        }
        struct Screen {
            var computed: () async -> Void { { } }
            func run(action: @escaping () async -> Void) {
                let local: () async -> Void = action
                _ = local
            }
        }
        """
        XCTAssertEqual(Self.offendingLines(in: sample), [])
    }

    func test_parser_keepsObservedStoredProperties() {
        let sample = """
        final class Model {
            var hook: (() async -> Void)? {
                didSet { }
            }
        }
        """
        XCTAssertEqual(Self.offendingLines(in: sample), [2])
    }
}
