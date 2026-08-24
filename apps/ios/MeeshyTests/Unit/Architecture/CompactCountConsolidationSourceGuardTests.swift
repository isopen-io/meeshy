import XCTest
@testable import Meeshy

/// Garde d'analyse de source : l'abrégé des grands nombres (« 1,5 k », « 1.5K »,
/// « ١٫٥ ألف ») a **une seule** implémentation, `CompactCountLabel`.
///
/// ## Pourquoi une garde, et pas seulement un correctif
///
/// La règle « au-delà du millier, abrège » a existé en **sept copies** dans le
/// produit iOS, toutes écrites à la main sur le même patron :
///
/// ```swift
/// if value >= 1_000_000 { return String(format: "%.1fM", Double(value) / 1_000_000) }
/// if value >= 1_000 { return String(format: "%.1fk", Double(value) / 1_000) }
/// ```
///
/// `String(format:)` appelé **sans locale** formate en POSIX. Les sept copies
/// portaient donc le même défaut : point décimal là où cinq des sept langues
/// livrées écrivent une virgule (« 1.5k » se lit comme un autre nombre en
/// français, où le point sépare les MILLIERS), et suffixe latin gravé dans une
/// interface arabe, qui abrège par « ألف ».
///
/// Aucune copie ne s'écartait de la règle — elles la **répétaient**. C'est ce qui
/// explique la propagation : chaque nouvelle surface recopiait sa voisine plutôt
/// que d'appeler quoi que ce soit, et trois itérations de consolidation (234i,
/// 236i, 237i) ont chacune corrigé les copies qu'elles voyaient sans empêcher les
/// suivantes. Un correctif ne ferme pas cette famille ; une garde, si.
///
/// ## Ce qui reste légitimement en `String(format:)`
///
/// Deux formats voisins ne sont PAS visés, et le motif banni est écrit avec ses
/// guillemets pour ne pas les attraper :
/// - `"%.1fMB"` (taille de fichier, `MeeshyVideoPlayer+Renderers`) — l'unité suit
///   le M, donc le guillemet fermant ne le suit pas ;
/// - `" bwe=%.1fMbps"` (trace de débit WebRTC, jamais affichée à l'utilisateur).
final class CompactCountConsolidationSourceGuardTests: XCTestCase {

    /// Le motif banni, écrit AVEC ses guillemets : `"%.1fM"` ne matche pas
    /// `"%.1fMB"`, dont le M est suivi d'une unité et non de la fin du littéral.
    private static let handmadeAbbreviations = ["\"%.1fk\"", "\"%.1fM\""]

    /// Les fichiers qui APPELLENT la source unique. Sans ce versant, la garde
    /// resterait verte si quelqu'un supprimait purement et simplement les
    /// compteurs.
    ///
    /// ⚠️ **Cette liste recense des APPELANTS, pas des écrans.** Elle est passée
    /// de 8 à 5 en 239i sans qu'aucun compteur ne disparaisse : les quatre écrans
    /// de portée (`FeedPostCard`, `ReelFeedCard`, `PostDetailView`, et la ligne
    /// d'auteur de `PostDetailReachAndVisibility`) appellent maintenant
    /// `ReachMetricLabel`, qui appelle `CompactCountLabel` pour eux. La règle est
    /// donc nommée **une fois de moins**, pas moins souvent respectée.
    ///
    /// `ReelsPlayerView` reste dans la liste parce qu'il garde un appel DIRECT
    /// hors portée d'auteur : le badge de compteur du rail d'actions.
    ///
    /// C'est la garde de 238i qui a signalé ce déplacement, en rougissant sur les
    /// quatre écrans au moment où 239i les a convertis. Réduire cette liste sans
    /// vérifier que la règle reste appliquée par un intermédiaire serait
    /// exactement la façon de la vider de son sens : le versant INTERDICTION
    /// ci-dessus, lui, n'a pas bougé et couvre toujours tout le dépôt.
    private static let consolidatedHosts = [
        "ReachMetricLabel.swift",
        "ReelsPlayerView.swift",
        "ConversationDashboardView.swift",
        "ConversationListHelpers.swift",
        "CommunityListView.swift",
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

    /// Le balayage couvre l'app, ses quatre extensions et le SDK : la huitième
    /// copie peut naître n'importe où, et c'est précisément en naissant hors du
    /// champ de la relecture précédente que les sept premières ont survécu.
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

    /// Le dépouillement des commentaires est indispensable ici : le doc-comment de
    /// `CompactCountLabel` CITE le code qu'il remplace, motif banni compris, et
    /// ferait échouer la garde sur la source unique elle-même.
    private func code(of url: URL) -> String? {
        guard let raw = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        return AppSourceGuard.stripComments(raw)
    }

    // MARK: - Le versant interdiction

    func test_aucunAbrégéDeGrandNombreComposéÀLaMain() {
        var offenders: [String] = []
        for url in swiftSources() {
            guard let code = code(of: url) else { continue }
            for banned in Self.handmadeAbbreviations where code.contains(banned) {
                offenders.append("\(url.lastPathComponent) → \(banned)")
            }
        }
        XCTAssertTrue(
            offenders.isEmpty,
            """
            Abrégé de grand nombre composé à la main. `String(format:)` sans \
            locale formate en POSIX : point décimal dans les langues qui écrivent \
            une virgule, suffixe latin en arabe. Appeler \
            `CompactCountLabel.text(_:locale:)`, qui rend les deux depuis CLDR :
            \(offenders.joined(separator: "\n"))
            """
        )
    }

    // MARK: - Le versant consolidation

    func test_lesSurfacesConsolidéesNommentLaSourceUnique() {
        let byName = Dictionary(
            swiftSources().map { ($0.lastPathComponent, $0) },
            uniquingKeysWith: { first, _ in first }
        )
        for host in Self.consolidatedHosts {
            guard let url = byName[host], let code = code(of: url) else {
                XCTFail("\(host) est introuvable — la garde ne peut plus vérifier sa consolidation.")
                continue
            }
            XCTAssertTrue(
                code.contains("CompactCountLabel.text("),
                "\(host) rendait un abrégé à la main et doit désormais appeler CompactCountLabel.text(_:locale:)."
            )
        }
    }

    // MARK: - La garde se garde elle-même

    /// Si le balayage ou le dépouillement cassait, les deux tests ci-dessus
    /// passeraient au vert pour la mauvaise raison : ils n'inspecteraient plus
    /// rien. On vérifie donc qu'ils voient bel et bien du code.
    func test_leBalayageVoitVraimentLesSources() {
        let sources = swiftSources()
        XCTAssertGreaterThan(sources.count, 400, "Le balayage ne trouve presque aucun fichier Swift")

        let citing = sources.filter { code(of: $0)?.contains("CompactCountLabel.text(") == true }
        XCTAssertGreaterThanOrEqual(
            citing.count, Self.consolidatedHosts.count,
            "Le dépouillement des commentaires mange le code — les appels à la source unique ont disparu du balayage"
        )
    }

    /// Le dépouillement ne doit pas non plus être trop gourmand : le motif banni
    /// doit rester détectable dans du VRAI code. Sans ce contrôle, un stripper qui
    /// avalerait tous les littéraux rendrait l'interdiction inopérante.
    func test_leMotifBanniResteDétectableDansDuCode() {
        let stripped = AppSourceGuard.stripComments(
            "let s = String(format: \"%.1fk\", x) // commentaire\n"
        )
        XCTAssertTrue(stripped.contains("\"%.1fk\""), "Le stripper avale les littéraux — l'interdiction ne détecterait plus rien")
    }

    /// Les deux formats voisins légitimes ne doivent PAS être attrapés : une garde
    /// qui rougirait sur une taille de fichier serait désarmée à la première
    /// exception ajoutée.
    func test_lesFormatsVoisinsLégitimesNeSontPasVisés() {
        let sizes = AppSourceGuard.stripComments("String(format: \"%.1fMB\", kb / 1024)")
        let bitrate = AppSourceGuard.stripComments("String(format: \" bwe=%.1fMbps\", rate)")
        for banned in Self.handmadeAbbreviations {
            XCTAssertFalse(sizes.contains(banned), "Une taille de fichier en Mo n'est pas un abrégé de compte")
            XCTAssertFalse(bitrate.contains(banned), "Un débit en Mbps n'est pas un abrégé de compte")
        }
    }
}
