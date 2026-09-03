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
            "apps/ios/MeeshyContextMenu",
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
