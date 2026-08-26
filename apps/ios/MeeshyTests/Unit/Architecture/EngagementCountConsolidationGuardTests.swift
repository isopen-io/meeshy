import XCTest
@testable import Meeshy

/// Garde d'analyse de source : les compteurs d'engagement du fil
/// — like / comment / repost / **reply** — ont **une seule** source de libellé,
/// `PostStatAccessibility`, qui lit des clés `feed.post.stat.*` **pluralisées**
/// (7 locales, 6 formes arabes).
///
/// ## Pourquoi une garde, et pas seulement un correctif
///
/// La règle vivait à ONZE endroits avant 240i : deux cellules UIKit
/// (`TextPostCell`, `MediaPostCell`, correctes depuis le début) et **neuf sites
/// SwiftUI** qui rendaient les mêmes compteurs par **quatre clés PLATES** que
/// personne n'avait remarqué. Une clé plate ne peut pas accorder : « %d
/// réponses » gravait « **1 réponses** » en français, « **1 replies** » en
/// anglais — l'une VISIBLE à l'écran, sur `FeedPostCard`, pas dans un lecteur
/// d'écran. L'arabe, qui distingue six formes plurielles, n'en recevait jamais
/// qu'une sur six.
///
/// Les quatre clés fautives — supprimées en 240i, la garde EN INTERDIT LE RETOUR
/// puisque leur simple présence en source signalerait la régression :
/// - `a11y.feed.post.like.value`      (plate ; `feed.post.stat.likes` fait déjà l'accord) ;
/// - `a11y.comment.replies.count`     (plate ; `feed.post.stat.replies` idem) ;
/// - `feed.post.comment.replies_count` (plate, visible à l'écran ; idem) ;
/// - `PostStatAccessibility.commentsLabel` couvre `feed.post.stat.comments`
///   — les 5 sites SwiftUI passent par le helper, pas par des clés plates.
///
/// Une itération de plus qui recopie un `String(format: "%d …", count)` sur ces
/// noms les fera revivre : la garde LES INTERDIT NOMMÉMENT.
///
/// ## Ce versant N'ATTRAPE PAS
///
/// Les libellés VOISINS qui restent légitimement en clés plates ou en pluriel
/// Swift local :
/// - `a11y.feed.post.like` (le VERBE « Aimer » — pas un compteur) ;
/// - `a11y.comment.like`, `a11y.post.like`, `a11y.post.unlike`, `a11y.post.like.hint`
///   (verbes / hints).
///
/// ## Le report qui décrivait un défaut sans lecteur (243i)
///
/// `conversation.view.reply.count.{one,many}` a figuré ICI, puis dans le report
/// de 240i, 241i et 242i, sous une phrase reprise telle quelle à chaque
/// itération : « messagerie, deux branches en Swift, l'arabe y est lésé ».
/// La phrase était vraie et la conclusion fausse : `replyCountPill`, seul site
/// à lire ces deux clés, n'était appelée par AUCUN commit du dépôt. Personne
/// n'était lésé parce que personne ne voyait rien — et `.many` n'était même pas
/// dans le catalogue, si bien que les sept locales auraient rendu son
/// `defaultValue` français non accentué (« 3 reponses ») le jour où on l'aurait
/// montée. 243i a retiré la pastille et ses clés.
///
/// > **Un report propage la DESCRIPTION d'un défaut, jamais sa vérification.**
/// > Avant de corriger une ligne héritée d'une liste de suites, poser la
/// > question que la liste ne pose pas : **qui affiche ça ?** L'ajouter aux clés
/// > bannies ci-dessous fige la réponse : si la pastille revient, elle passera
/// > par `PostStatAccessibility.repliesLabel(_:)` — une entrée pluralisée,
/// > 7 locales, 6 formes arabes — au lieu de ressusciter deux clés plates.
final class EngagementCountConsolidationGuardTests: XCTestCase {

    /// Les clés plates supprimées en 240i. Ce sont des IDENTIFIANTS de catalogue,
    /// donc écrits AVEC leurs guillemets : `"…"`. Un `String(localized: "…")`
    /// n'en trouve une que si elle est présente dans le catalogue *et* si son ID
    /// littéral apparaît en source — la présence en source SUFFIT à réintroduire
    /// la clé, puisque Xcode l'extrait automatiquement.
    private static let bannedFlatKeys = [
        "\"a11y.feed.post.like.value\"",
        "\"a11y.comment.replies.count\"",
        "\"feed.post.comment.replies_count\"",
        // 243i — les deux clés de la pastille de réponses en conversation.
        // Plates toutes les deux, et `.many` absente du catalogue : elles ne
        // reviennent qu'en passant par la source unique.
        "\"conversation.view.reply.count.one\"",
        "\"conversation.view.reply.count.many\"",
    ]

    /// Les fichiers qui APPELLENT la source unique. Sans ce versant, la garde
    /// resterait verte si quelqu'un supprimait purement et simplement les
    /// compteurs, ou les rendait par un troisième mécanisme neuf.
    ///
    /// Cinq surfaces SwiftUI (240i) + les deux cellules UIKit (source depuis le
    /// début) = 7 hôtes.
    private static let consolidatedHosts = [
        "FeedPostCard.swift",
        "ReelFeedCard.swift",
        "FeedCommentsSheet.swift",
        "TextPostCell.swift",
        "MediaPostCell.swift",
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

    /// Le balayage couvre l'app, ses quatre extensions et le SDK. Une huitième
    /// clé plate peut naître n'importe où — et si elle nait hors du champ de la
    /// relecture précédente, elle survit sans que rien ne l'attrape.
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

    /// Le dépouillement des commentaires est indispensable : le doc-comment de
    /// `PostStatAccessibility` CITE nominativement les quatre clés bannies pour
    /// dire ce qu'elles étaient. Sans dépouillement, la garde échouerait sur sa
    /// propre source.
    private func code(of url: URL) -> String? {
        guard let raw = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        return AppSourceGuard.stripComments(raw)
    }

    // MARK: - Le versant interdiction

    func test_aucuneCléPlateDeCompteurDEngagement() {
        var offenders: [String] = []
        for url in swiftSources() {
            guard let code = code(of: url) else { continue }
            for banned in Self.bannedFlatKeys where code.contains(banned) {
                offenders.append("\(url.lastPathComponent) → \(banned)")
            }
        }
        XCTAssertTrue(
            offenders.isEmpty,
            """
            Clé plate d'un compteur d'engagement du fil. « %d réponses » grave \
            « 1 réponses » en français et l'arabe n'en reçoit qu'une forme sur six. \
            Utiliser `PostStatAccessibility.{likes,comments,reposts,replies}Label(_:)`, \
            qui appelle une entrée `variations.plural` de `feed.post.stat.*` :
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
                code.contains("PostStatAccessibility."),
                "\(host) doit appeler `PostStatAccessibility.{likes,comments,reposts,replies}Label(_:)` pour les compteurs d'engagement."
            )
        }
    }

    // MARK: - La garde se garde elle-même

    /// Si le balayage ou le dépouillement cassait, les deux tests ci-dessus
    /// passeraient au vert pour la mauvaise raison — ils n'inspecteraient plus
    /// rien. On vérifie donc qu'ils voient bel et bien du code, et que la source
    /// unique apparaît dans autant d'hôtes qu'annoncé.
    func test_leBalayageVoitVraimentLesSources() {
        let sources = swiftSources()
        XCTAssertGreaterThan(sources.count, 400, "Le balayage ne trouve presque aucun fichier Swift")

        let citing = sources.filter { code(of: $0)?.contains("PostStatAccessibility.") == true }
        XCTAssertGreaterThanOrEqual(
            citing.count, Self.consolidatedHosts.count,
            "Le dépouillement des commentaires mange le code — les appels à la source unique ont disparu du balayage"
        )
    }

    /// Une clé plate dans un commentaire ne compte pas — c'est ainsi que le
    /// doc-comment de `PostStatAccessibility` peut CITER les quatre clés bannies
    /// sans faire rougir la garde. Si le stripper devenait plus timide, ce test
    /// rougirait ; s'il devenait trop gourmand, l'interdiction ne détecterait
    /// plus rien.
    func test_leMotifBanniResteDétectableDansDuCode() {
        let stripped = AppSourceGuard.stripComments(
            "let s = String(localized: \"a11y.feed.post.like.value\") // commentaire\n"
        )
        XCTAssertTrue(
            stripped.contains("\"a11y.feed.post.like.value\""),
            "Le stripper avale les littéraux — l'interdiction ne détecterait plus rien"
        )

        let stripped2 = AppSourceGuard.stripComments(
            "// on cite \"a11y.feed.post.like.value\" dans un commentaire\n"
        )
        XCTAssertFalse(
            stripped2.contains("\"a11y.feed.post.like.value\""),
            "Le stripper laisse passer les commentaires — la garde rougirait sur son propre doc-comment"
        )
    }
}
