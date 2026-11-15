import XCTest
@testable import Meeshy

/// Garde d'analyse de source : **une valeur d'accessibilité ne se ponctue pas
/// avec un séparateur visuel.**
///
/// ## Le défaut
///
/// Quatre écrans rendaient les statistiques d'auteur — vues, impressions — en
/// collant les deux nombres dans une seule valeur, séparés par la puce
/// typographique de la maquette :
///
/// ```swift
/// .accessibilityElement(children: .ignore)
/// .accessibilityLabel("Impressions")
/// .accessibilityValue("\(post.impressionCount) · \(post.viewCount)")
/// ```
///
/// VoiceOver annonce « Impressions, 1234 · 567 ». **Le second nombre n'est nommé
/// par rien** : l'information « 567 est un nombre de vues » n'existe nulle part
/// dans l'arbre d'accessibilité. Le lecteur entend deux nombres et une étiquette,
/// et doit deviner lequel va avec quoi.
///
/// La puce `·` est un objet de MISE EN PAGE. Elle sépare visuellement, sur une
/// ligne, deux informations que l'œil regroupe par proximité — un mécanisme que
/// VoiceOver n'a pas. Recopiée dans une valeur d'accessibilité, elle ne sépare
/// plus rien : elle est lue comme rien, ou comme « point médian ».
///
/// ## La règle
///
/// **Un nombre, un élément, un nom** — c'est ce que fait `ReachMetricLabel`.
/// Quand deux valeurs doivent voisiner, elles deviennent deux éléments
/// d'accessibilité, chacun avec son libellé ; la puce qui les sépare à l'écran
/// est marquée `.accessibilityHidden(true)`.
///
/// ## Ce qui n'est PAS visé
///
/// Les valeurs composées dont la FORME EST la donnée — « 3 / 10 » pour un
/// indicateur de page, « 42 % » pour une progression — restent légitimes : le
/// séparateur y est sémantique, pas typographique, et l'ensemble se lit comme
/// une seule valeur. Seule la puce est bannie, et deux tests l'affirment.
final class AccessibilityValueAttributionGuardTests: XCTestCase {

    /// La puce typographique. Bannie **à l'intérieur d'un `accessibilityValue`
    /// seulement** — à l'écran elle est parfaitement à sa place.
    private static let visualBullet = "·"

    /// Les écrans qui rendaient la portée à la main et doivent désormais nommer
    /// le composant. Sans ce versant, la garde resterait verte si quelqu'un
    /// supprimait les compteurs au lieu de les corriger.
    /// Les SURFACES qui affichent une portée, et les fichiers qui composent
    /// chacune.
    ///
    /// C'était une simple liste de noms de fichiers, et deux découpages l'ont
    /// rendue aveugle sans qu'elle rougisse pour la bonne raison : la rangée
    /// auteur de la carte de fil est partie dans `FeedPostCard+Header.swift`
    /// (#4078), la rangée d'info du réel dans `ReelPageView+Info.swift`
    /// (#4484) — et elle a continué de chercher `ReachMetricLabel` dans les
    /// fichiers qu'ils venaient de quitter.
    ///
    /// **Une garde qui nomme un FICHIER mesure un chemin ; ce qu'elle veut
    /// mesurer est une SURFACE.** D'où cette table : une surface est satisfaite
    /// dès qu'UN de ses fichiers porte le composant, et la découpe suivante
    /// s'inscrit ici plutôt que de faire rougir un site innocent.
    ///
    /// Un glob `Base+*` ne suffirait pas : `ReelPageView+Info.swift` a pour
    /// base `ReelPageView`, pas `ReelsPlayerView` — l'extraction a changé le
    /// TYPE porteur, pas seulement le fichier. Les listes explicites disent
    /// cette réalité, un motif ne la dirait pas.
    private static let reachHosts: [(surface: String, files: [String])] = [
        ("carte de fil", ["FeedPostCard.swift", "FeedPostCard+Header.swift"]),
        ("carte de réel", ["ReelFeedCard.swift"]),
        ("plein écran réel", ["ReelsPlayerView.swift", "ReelPageView+Info.swift", "ReelsPlayerView+Carousel.swift"]),
        ("détail de post", ["PostDetailView.swift"]),
    ]

    private func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // …/Unit/Architecture
            .deletingLastPathComponent()  // …/Unit
            .deletingLastPathComponent()  // …/MeeshyTests
            .deletingLastPathComponent()  // …/apps/ios
            .deletingLastPathComponent()  // …/apps
            .deletingLastPathComponent()  // racine du dépôt
    }

    private func swiftSources() -> [URL] {
        let root = repoRoot()
        let roots = [
            "apps/ios/Meeshy",
            "apps/ios/MeeshyShareExtension",
            "apps/ios/MeeshyNotificationExtension",
            "apps/ios/MeeshyWidgets",
            "packages/MeeshySDK/Sources",
        ].map { root.appendingPathComponent($0) }

        var found: [URL] = []
        for dir in roots {
            guard let walker = FileManager.default.enumerator(
                at: dir, includingPropertiesForKeys: nil
            ) else { continue }
            for case let url as URL in walker where url.pathExtension == "swift" {
                found.append(url)
            }
        }
        return found
    }

    /// Dépouillement indispensable : le doc-comment de `ReachMetricLabel` CITE le
    /// code fautif, puce comprise.
    private func code(of url: URL) -> String? {
        guard let raw = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        return AppSourceGuard.stripComments(raw)
    }

    /// Extrait l'argument littéral de chaque `.accessibilityValue("…")`.
    /// Rendu `internal` (pas `private`) parce que deux tests de forme, plus bas,
    /// l'exercent sur des extraits fabriqués — une garde dont l'extracteur n'est
    /// pas testé peut passer au vert en n'extrayant rien.
    func accessibilityValueLiterals(in code: String) -> [String] {
        let marker = "accessibilityValue(\""
        var literals: [String] = []
        var cursor = code.startIndex
        while let start = code.range(of: marker, range: cursor..<code.endIndex) {
            var index = start.upperBound
            var literal = ""
            var escaped = false
            while index < code.endIndex {
                let character = code[index]
                if escaped { escaped = false; literal.append(character) }
                else if character == "\\" { escaped = true; literal.append(character) }
                else if character == "\"" { break }
                else { literal.append(character) }
                index = code.index(after: index)
            }
            literals.append(literal)
            cursor = index < code.endIndex ? code.index(after: index) : code.endIndex
        }
        return literals
    }

    // MARK: - Le versant interdiction

    func test_aucuneValeurDAccessibiliteNePorteDePuceVisuelle() {
        var offenders: [String] = []
        for url in swiftSources() {
            guard let code = code(of: url) else { continue }
            for literal in accessibilityValueLiterals(in: code)
            where literal.contains(Self.visualBullet) {
                offenders.append("\(url.lastPathComponent) → \"\(literal)\"")
            }
        }
        XCTAssertTrue(
            offenders.isEmpty,
            """
            Valeur d'accessibilité ponctuée d'une puce visuelle. VoiceOver ne \
            regroupe pas par proximité : les nombres ainsi collés ne sont \
            attribuables à rien. Faire un élément NOMMÉ par valeur \
            (`ReachMetricLabel`) et masquer la puce avec \
            `.accessibilityHidden(true)` :
            \(offenders.joined(separator: "\n"))
            """
        )
    }

    // MARK: - Le versant consolidation

    func test_lesEcransDePorteeNommentLeComposant() {
        let byName = Dictionary(
            swiftSources().map { ($0.lastPathComponent, $0) },
            uniquingKeysWith: { first, _ in first }
        )
        for host in Self.reachHosts {
            let readable = host.files.compactMap { byName[$0] }.compactMap { code(of: $0) }
            guard !readable.isEmpty else {
                XCTFail("Aucun fichier de la surface « \(host.surface) » n'est lisible " +
                        "(\(host.files.joined(separator: ", "))) — la garde ne peut plus " +
                        "vérifier sa consolidation.")
                continue
            }
            XCTAssertTrue(
                readable.contains { $0.contains("ReachMetricLabel(") },
                "La surface « \(host.surface) » rend un compteur de portée à la main et doit " +
                "utiliser ReachMetricLabel. Si elle vient d'être découpée, inscrire le " +
                "nouveau fichier dans `reachHosts` — le composant a suivi le code, la garde " +
                "doit suivre aussi : \(host.files.joined(separator: ", "))"
            )
        }
    }

    // MARK: - La garde se garde elle-même

    func test_leBalayageVoitVraimentLesSources() {
        let sources = swiftSources()
        XCTAssertGreaterThan(sources.count, 400, "Le balayage ne trouve presque aucun fichier Swift")

        let citing = sources.filter { code(of: $0)?.contains("ReachMetricLabel(") == true }
        XCTAssertGreaterThanOrEqual(
            citing.count, Self.reachHosts.count,
            "Le dépouillement mange le code — les appels au composant ont disparu du balayage"
        )
    }

    /// Un extracteur qui n'extrait rien rendrait l'interdiction inopérante en
    /// silence.
    func test_lExtracteurTrouveBienLesValeurs() {
        let literals = accessibilityValueLiterals(
            in: #"a.accessibilityValue("42 %") ; b.accessibilityValue("3 / 10")"#
        )
        XCTAssertEqual(literals, ["42 %", "3 / 10"])
    }

    /// Les valeurs composées dont le séparateur est SÉMANTIQUE ne doivent pas
    /// être attrapées — une garde qui rougirait sur « 3 / 10 » serait désarmée à
    /// la première exception ajoutée.
    func test_lesSeparateursSemantiquesNeSontPasVises() {
        for legitimate in ["3 / 10", "42 %", "1 234"] {
            XCTAssertFalse(
                legitimate.contains(Self.visualBullet),
                "\(legitimate) : séparateur sémantique, pas typographique — jamais visé."
            )
        }
    }
}

enum IconOnlyButtonScan {

    private struct ButtonSite {
        let line: Int
        let isLabelled: Bool
    }

    static func mutedButtons(in source: String) -> [Int] {
        iconButtons(in: source).filter { !$0.isLabelled }.map { $0.line }
    }

    static func iconButtonCount(in source: String) -> Int {
        iconButtons(in: source).count
    }

    private static func iconButtons(in source: String) -> [ButtonSite] {
        let chars = Array(AppSourceGuard.stripComments(source))
        return buttonStarts(in: chars).compactMap { site(at: $0, in: chars) }
    }

    private static func buttonStarts(in chars: [Character]) -> [Int] {
        chars.indices.filter { index in
            matches("Button", at: index, in: chars)
                && (index == 0 || !isIdentifier(chars[index - 1]))
        }
    }

    private static func site(at start: Int, in chars: [Character]) -> ButtonSite? {
        let afterName = start + "Button".count
        guard afterName < chars.count,
              chars[afterName] == "(" || chars[afterName] == "{" || chars[afterName].isWhitespace,
              let label = labelClosure(at: afterName, in: chars) else { return nil }
        let body = String(chars[(label.lowerBound + 1)..<label.upperBound])
        guard isIconOnly(body) else { return nil }
        let chain = modifierChain(after: label.upperBound + 1, in: chars)
        return ButtonSite(
            line: lineNumber(of: start, in: chars),
            isLabelled: carriesName(body + chain)
        )
    }

    private static func labelClosure(at index: Int, in chars: [Character]) -> Range<Int>? {
        let head = skipWhitespace(from: index, in: chars)
        guard head < chars.count else { return nil }
        if chars[head] == "{" { return labelAfterAction(at: head, in: chars) }
        guard chars[head] == "(", let close = closingIndex(from: head, in: chars) else { return nil }
        if let labelStart = topLevelLabel(from: head + 1, to: close, in: chars) {
            return closure(at: skipWhitespace(from: labelStart, in: chars), in: chars)
        }
        let args = String(chars[(head + 1)..<close]).trimmingCharacters(in: .whitespacesAndNewlines)
        guard args.hasPrefix("action:") || args.hasPrefix("role:") else { return nil }
        return closure(at: skipWhitespace(from: close + 1, in: chars), in: chars)
    }

    private static func labelAfterAction(at open: Int, in chars: [Character]) -> Range<Int>? {
        guard let close = closingIndex(from: open, in: chars) else { return nil }
        let next = skipWhitespace(from: close + 1, in: chars)
        guard matches("label:", at: next, in: chars) else { return nil }
        return closure(at: skipWhitespace(from: next + "label:".count, in: chars), in: chars)
    }

    private static func topLevelLabel(from start: Int, to end: Int, in chars: [Character]) -> Int? {
        var cursor = start
        while cursor < end {
            let character = chars[cursor]
            if character == "\"" {
                cursor = endOfString(from: cursor, in: chars)
            } else if "({[".contains(character) {
                guard let close = closingIndex(from: cursor, in: chars) else { return nil }
                cursor = close + 1
            } else if matches("label:", at: cursor, in: chars), cursor == 0 || !isIdentifier(chars[cursor - 1]) {
                return cursor + "label:".count
            } else {
                cursor += 1
            }
        }
        return nil
    }

    private static func closure(at open: Int, in chars: [Character]) -> Range<Int>? {
        guard open < chars.count, chars[open] == "{",
              let close = closingIndex(from: open, in: chars) else { return nil }
        return open..<close
    }

    private static func isIconOnly(_ body: String) -> Bool {
        let trimmed = body
            .replacingOccurrences(of: "accessibilityLabel(", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.contains("Image(systemName:") else { return false }
        guard !trimmed.contains("Text("), !trimmed.contains("Label(") else { return false }
        return trimmed.hasPrefix("Image(")
            || ["ZStack", "HStack", "VStack"].contains { trimmed.hasPrefix($0) }
    }

    private static func modifierChain(after index: Int, in chars: [Character]) -> String {
        var cursor = skipWhitespace(from: index, in: chars)
        var end = index
        while cursor + 1 < chars.count, chars[cursor] == ".", chars[cursor + 1].isLetter {
            cursor += 1
            while cursor < chars.count, isIdentifier(chars[cursor]) { cursor += 1 }
            cursor = skipGroup(at: cursor, in: chars)
            let inline = skipInlineSpaces(from: cursor, in: chars)
            cursor = skipGroup(at: inline, in: chars, opening: "{", fallback: cursor)
            end = cursor
            cursor = skipWhitespace(from: cursor, in: chars)
        }
        return String(chars[index..<max(end, index)])
    }

    private static func skipGroup(
        at index: Int, in chars: [Character], opening: Character = "(", fallback: Int? = nil
    ) -> Int {
        guard index < chars.count, chars[index] == opening,
              let close = closingIndex(from: index, in: chars) else { return fallback ?? index }
        return close + 1
    }

    private static func carriesName(_ text: String) -> Bool {
        text.contains(".accessibilityLabel")
            || text.contains(".accessibilityHidden(true)")
            || text.contains(".accessibilityRepresentation")
    }

    private static func closingIndex(from open: Int, in chars: [Character]) -> Int? {
        var depth = 0
        var cursor = open
        while cursor < chars.count {
            let character = chars[cursor]
            if character == "\"" {
                cursor = endOfString(from: cursor, in: chars)
                continue
            }
            if "({[".contains(character) {
                depth += 1
            } else if ")}]".contains(character) {
                depth -= 1
                if depth == 0 { return cursor }
            }
            cursor += 1
        }
        return nil
    }

    private static func endOfString(from open: Int, in chars: [Character]) -> Int {
        if matches("\"\"\"", at: open, in: chars) {
            var cursor = open + 3
            while cursor < chars.count {
                if chars[cursor] == "\\" { cursor += 2; continue }
                if matches("\"\"\"", at: cursor, in: chars) { return cursor + 3 }
                cursor += 1
            }
            return chars.count
        }
        var cursor = open + 1
        while cursor < chars.count {
            let character = chars[cursor]
            if character == "\\" {
                let next = cursor + 1
                if next < chars.count, chars[next] == "(", let close = closingIndex(from: next, in: chars) {
                    cursor = close + 1
                } else {
                    cursor += 2
                }
                continue
            }
            if character == "\"" { return cursor + 1 }
            cursor += 1
        }
        return chars.count
    }

    private static func matches(_ text: String, at index: Int, in chars: [Character]) -> Bool {
        let needle = Array(text)
        guard index >= 0, index + needle.count <= chars.count else { return false }
        return Array(chars[index..<(index + needle.count)]) == needle
    }

    private static func isIdentifier(_ character: Character) -> Bool {
        character.isLetter || character.isNumber || character == "_"
    }

    private static func skipWhitespace(from index: Int, in chars: [Character]) -> Int {
        var cursor = index
        while cursor < chars.count, chars[cursor].isWhitespace { cursor += 1 }
        return cursor
    }

    private static func skipInlineSpaces(from index: Int, in chars: [Character]) -> Int {
        var cursor = index
        while cursor < chars.count, chars[cursor] == " " || chars[cursor] == "\t" { cursor += 1 }
        return cursor
    }

    private static func lineNumber(of index: Int, in chars: [Character]) -> Int {
        chars[0..<index].filter { $0 == "\n" }.count + 1
    }
}

/// Garde d'analyse de source : **un bouton dont le libellé n'est qu'une icône
/// porte un libellé d'accessibilité.**
///
/// Un `Button { … } label: { Image(systemName:) }` sans `.accessibilityLabel`
/// n'a aucun nom : muet pour Voice Control et Full Keyboard Access, et pour
/// VoiceOver dès que son conteneur n'expose pas une action équivalente. Le
/// libellé se lit dans la CHAÎNE de modificateurs qui suit le label, sauts de
/// ligne compris. La garde est heuristique (analyse de texte) : un libellé rendu
/// par une fonction ou une propriété calculée n'est pas reconnu comme icône.
final class IconOnlyButtonLabelGuardTests: XCTestCase {

    private func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func appSources() -> [URL] {
        let root = repoRoot()
        let roots = [
            "apps/ios/Meeshy",
            "apps/ios/MeeshyNotificationExtension",
            "apps/ios/MeeshyNotificationContentExtension",
            "apps/ios/MeeshyWidgets",
            "apps/ios/MeeshyShareExtension",
            "apps/ios/MeeshyBroadcastExtension",
        ].map { root.appendingPathComponent($0) }

        var found: [URL] = []
        for dir in roots {
            guard let walker = FileManager.default.enumerator(
                at: dir, includingPropertiesForKeys: nil
            ) else { continue }
            for case let url as URL in walker where url.pathExtension == "swift" {
                found.append(url)
            }
        }
        return found
    }

    func test_unBoutonDontLeLibelleNEstQuUneIcone_estSignale() {
        let source = #"""
        Button { go() } label: { Image(systemName: "xmark").font(.caption) }
        """#
        XCTAssertEqual(IconOnlyButtonScan.mutedButtons(in: source), [1])
    }

    func test_unBoutonActionDontLeLibelleEstUnePileIconeSurForme_estSignale() {
        let source = #"""
        Button(action: go) { ZStack { Circle().fill(.red); Image(systemName: "play.fill") } }
        """#
        XCTAssertEqual(IconOnlyButtonScan.mutedButtons(in: source), [1])
    }

    func test_unBoutonLibelleApresUneChaineMultiligne_nEstPasSignale() {
        let source = #"""
        Button {
            go()
        } label: {
            Image(systemName: "play.fill")
                .background(
                    Circle()
                        .fill(Color.red)
                )
        }
        .simultaneousGesture(LongPressGesture().onEnded { _ in })
        .accessibilityLabel(Text(label))
        """#
        XCTAssertEqual(IconOnlyButtonScan.mutedButtons(in: source), [])
    }

    func test_unBoutonATitreOuALibelleTexte_nEstPasSignale() {
        let sources = [
            #"Button("Fermer") {}"#,
            #"Button(title) {}"#,
            #"Button(String(localized: "k")) {}"#,
            #"Button {} label: { Label("Annuler", systemImage: "xmark") }"#,
            #"Button {} label: { HStack { Image(systemName: "x"); Text("Annuler") } }"#,
        ]
        for source in sources {
            XCTAssertEqual(IconOnlyButtonScan.mutedButtons(in: source), [], source)
        }
    }

    func test_unLibelleDansUnCommentaire_neCompteJamais() {
        let source = #"""
        Button { } label: { Image(systemName: "x") } // .accessibilityLabel("k")
        """#
        XCTAssertEqual(IconOnlyButtonScan.mutedButtons(in: source), [1])
    }

    func test_unLibelleHelperDontLeCorpsPorteUnTitre_nEstPasSignale() {
        let source = #"""
        Button { } label: { settingsRow(icon: "a", title: t) { Image(systemName: "chevron.forward") } }
        """#
        XCTAssertEqual(IconOnlyButtonScan.mutedButtons(in: source), [])
    }

    func test_aucunBoutonIconeDeLApplicationNEstMuet() {
        var offenders: [String] = []
        for url in appSources() {
            guard let raw = try? String(contentsOf: url, encoding: .utf8) else { continue }
            let relative = url.path.replacingOccurrences(of: repoRoot().path + "/", with: "")
            for line in IconOnlyButtonScan.mutedButtons(in: raw) {
                offenders.append("\(relative):\(line)")
            }
        }
        XCTAssertTrue(
            offenders.isEmpty,
            """
            Bouton-icône sans libellé d'accessibilité. Utiliser \
            MeeshyIconButton(systemName:label:action:) ou poser \
            `.accessibilityLabel(String(localized: …))` sur le Button :
            \(offenders.joined(separator: "\n"))
            """
        )
    }

    func test_leBalayageVoitVraimentLesBoutonsIcones() {
        let sources = appSources()
        XCTAssertGreaterThan(sources.count, 400, "Le balayage ne trouve presque aucun fichier Swift")

        let recognised = sources.reduce(0) { total, url in
            guard let raw = try? String(contentsOf: url, encoding: .utf8) else { return total }
            return total + IconOnlyButtonScan.iconButtonCount(in: raw)
        }
        XCTAssertGreaterThanOrEqual(
            recognised, 120,
            "L'extracteur ne reconnaît presque aucun bouton-icône — la garde passerait au vert en silence"
        )
    }
}
