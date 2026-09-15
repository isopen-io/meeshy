import Foundation
import XCTest
@testable import Meeshy

/// **Un cœur qui bat sans rien aimer.** — loi 4 : un contrôle existe s'il a un
/// effet.
///
/// `FeedPostCard.onLike` est optionnel (`((String) -> Void)? = nil`), et son
/// bouton joue son animation de rafale ET sa haptique AVANT d'appeler
/// `onLike?(post.id)` (`FeedPostCard.swift`, § Actions Bar). Un montage qui
/// omet le rappel ne produit donc pas un bouton inerte : il produit un bouton
/// qui SIMULE son effet — rafale, cœur qui grossit, retour haptique — puis ne
/// fait rien. C'est la pire des cinq natures d'un contrôle qui ment, parce que
/// l'utilisateur reçoit la confirmation sensorielle d'un geste qui n'a pas eu
/// lieu.
///
/// Deux surfaces vivaient ainsi (retour porteur 2026-09-13, « like non
/// synchronisé entre les différentes vues ») : les FAVORIS et les RÉSULTATS
/// D'UN HASHTAG. Aucun test ne pouvait rougir — le paramètre est optionnel par
/// construction, les deux vues compilent, et le cœur s'anime.
///
/// La garde lit le TEXTE parce que c'est le seul endroit où l'omission existe :
/// une fois compilée, elle est indistinguable d'un choix. Elle balaye TOUS les
/// montages du dossier des vues, jamais une liste — une liste se périme au
/// premier écran ajouté, et se périme en silence.
final class FeedPostCardLikeWiringSourceGuardTests: XCTestCase {

    /// Montages délibérément muets, chacun justifié par une MESURE.
    ///
    /// `FeedCard` (`FeedCommentsSheet.swift`, section « Legacy Support ») a
    /// **zéro appelant dans tout le dépôt** — mesuré par
    /// `grep -rn "FeedCard(" --include=*.swift .` moins ses homonymes
    /// `ReelFeedCard`/`FeedPostCard` : aucun résultat. Il ne peut donc mentir à
    /// personne. Il n'est pas supprimé ici parce que ce lot corrige un défaut
    /// de câblage, pas l'inventaire du code mort ; l'entrée porte sa mesure
    /// pour que la prochaine session sache qu'elle a été prise, pas oubliée.
    private static let deliberatelyUnwired: Set<String> = ["FeedCard"]

    private var viewsDirectory: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Views
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
            .appendingPathComponent("Meeshy/Features/Main")
    }

    /// Un montage : le fichier, la ligne, le type englobant, et ses arguments.
    private struct Mounting {
        let file: String
        let line: Int
        let enclosingType: String
        let arguments: String
    }

    /// Relève chaque `FeedPostCard(` et son bloc d'arguments à parenthèses
    /// équilibrées.
    ///
    /// **Le dépouillement des commentaires n'est pas un raffinement, c'est la
    /// garde.** Sans lui, deux doc-comments qui citent la topologie éprouvée
    /// « `FeedPostCard().equatable()` » (`MessageListViewController`,
    /// `ThemedMessageBubble`) comptent pour des montages muets et font rougir
    /// deux fichiers qui ne montent aucune carte. Mesuré : c'est exactement ce
    /// que la première version de ce relevé, écrite sans `stripComments`, a
    /// rapporté.
    private func mountings() throws -> [Mounting] {
        let enumerator = FileManager.default.enumerator(
            at: viewsDirectory, includingPropertiesForKeys: nil
        )
        var found: [Mounting] = []
        for case let url as URL in enumerator ?? .init() where url.pathExtension == "swift" {
            let source = AppSourceGuard.stripComments(
                try String(contentsOf: url, encoding: .utf8)
            )
            var cursor = source.startIndex
            while let hit = source.range(of: "FeedPostCard(", range: cursor..<source.endIndex) {
                cursor = hit.upperBound
                // Le glyphe qui précède ne doit pas PROLONGER l'identifiant :
                // sans cela `ReelFeedPostCard(` ou `MyFeedPostCard(` seraient
                // comptés comme des montages de la carte du fil.
                if hit.lowerBound > source.startIndex {
                    let before = source[source.index(before: hit.lowerBound)]
                    if before.isLetter || before.isNumber || before == "_" { continue }
                }
                var depth = 1
                var end = hit.upperBound
                while end < source.endIndex, depth > 0 {
                    if source[end] == "(" { depth += 1 }
                    if source[end] == ")" { depth -= 1 }
                    end = source.index(after: end)
                }
                found.append(Mounting(
                    file: url.lastPathComponent,
                    line: source[source.startIndex..<hit.lowerBound]
                        .filter { $0 == "\n" }.count + 1,
                    enclosingType: Self.enclosingType(of: hit.lowerBound, in: source),
                    arguments: String(source[hit.upperBound..<end])
                ))
            }
        }
        return found
    }

    /// Le dernier `struct`/`final class`/`class` déclaré AVANT le montage —
    /// c'est lui que l'allowlist nomme, jamais le fichier : un fichier peut
    /// héberger une vue vivante et une vue morte, et allowlister le fichier
    /// couvrirait les deux.
    private static func enclosingType(of position: String.Index, in source: String) -> String {
        let head = source[source.startIndex..<position]
        var name = "?"
        for line in head.components(separatedBy: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            for keyword in ["struct ", "final class ", "class "] where trimmed.hasPrefix(keyword) {
                let rest = trimmed.dropFirst(keyword.count)
                name = String(rest.prefix { $0.isLetter || $0.isNumber || $0 == "_" })
                break
            }
        }
        return name
    }

    // MARK: - Le relevé mesure bien quelque chose

    func test_leReleve_trouveDesMontages() throws {
        // Sans cette assertion, un chemin faux ou un dépouillement trop zélé
        // rendrait la garde VERTE PAR OMISSION — elle ne mesurerait rien.
        XCTAssertGreaterThanOrEqual(try mountings().count, 5,
            "Le relevé ne trouve plus les montages de FeedPostCard : chemin ou dépouillement cassé.")
    }

    func test_leReleve_neCompteAucunCommentaire() throws {
        // `MessageListViewController` et `ThemedMessageBubble` CITENT
        // `FeedPostCard().equatable()` en prose sans monter aucune carte. Ils
        // sont le témoin que le dépouillement fait son travail.
        let files = Set(try mountings().map(\.file))
        XCTAssertFalse(files.contains("MessageListViewController.swift"),
            "Un commentaire est compté comme un montage — stripComments ne s'applique pas.")
        XCTAssertFalse(files.contains("ThemedMessageBubble.swift"),
            "Un commentaire est compté comme un montage — stripComments ne s'applique pas.")
    }

    // MARK: - La loi

    func test_toutMontageDeFeedPostCard_cableSonRappelDeLike() throws {
        let silent = try mountings()
            .filter { !$0.arguments.contains("onLike") }
            .filter { !Self.deliberatelyUnwired.contains($0.enclosingType) }

        XCTAssertTrue(silent.isEmpty, """
            \(silent.count) montage(s) de FeedPostCard sans `onLike` : le cœur y joue \
            sa rafale et sa haptique, puis n'aime rien.
            \(silent.map { "  • \($0.enclosingType) — \($0.file):\($0.line)" }.joined(separator: "\n"))
            Câbler le rappel, ou justifier l'exception par une MESURE dans \
            `deliberatelyUnwired`.
            """)
    }
}
