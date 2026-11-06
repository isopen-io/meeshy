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
///
/// Le cœur n'était que la première action. « Repartager » (#15934), puis
/// « Enregistrer » et « Partager » (#15994) ont menti de la même façon sur les
/// mêmes surfaces : la loi porte désormais sur CHAQUE action de la barre et du
/// menu ⋯, et une dernière assertion vérifie qu'aucun rappel optionnel n'y
/// échappe.
final class FeedPostCardLikeWiringSourceGuardTests: XCTestCase {

    private var viewsDirectory: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Views
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
            .appendingPathComponent("Meeshy/Features")
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
    private func mountings(of card: String = "FeedPostCard") throws -> [Mounting] {
        let enumerator = FileManager.default.enumerator(
            at: viewsDirectory, includingPropertiesForKeys: nil
        )
        var found: [Mounting] = []
        for case let url as URL in enumerator ?? .init() where url.pathExtension == "swift" {
            let source = AppSourceGuard.stripComments(
                try String(contentsOf: url, encoding: .utf8)
            )
            var cursor = source.startIndex
            while let hit = source.range(of: card + "(", range: cursor..<source.endIndex) {
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

    func test_leReleve_balaieChaqueDomaine_pasSeulementMain() throws {
        // #13139 : les vues se rangent par domaine. La liste de publications du
        // PROFIL monte la carte du fil et a quitté `Features/Main` : un relevé
        // borné à `Main` la perdrait EN SILENCE, et la garde resterait verte.
        let files = Set(try mountings().map(\.file))
        XCTAssertTrue(files.contains("ProfileUserPostsList.swift"),
            "Le relevé ne voit plus les montages hors de Features/Main : un domaine échappe à la loi.")
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

    // MARK: - La loi : aucune action de la barre sans effet (#15934, #15994)

    /// Une action de la barre (ou du menu ⋯) d'une carte, et ce que son
    /// montage doit lui passer pour qu'elle AGISSE.
    private struct ActionWiring {
        let action: String
        let arguments: [String]
        let symptom: String
    }

    /// **Chaque action qu'une carte affiche sans condition.** Le cœur (loi 4,
    /// retour porteur 2026-09-13) : `onLike` absent, il joue sa rafale et sa
    /// haptique puis n'aime rien. « Repartager » (#15934) : le choix appelait
    /// un rappel absent. « Enregistrer » (#15994) : le hashtag rendait le
    /// marque-page avec son compteur, et le toucher ne faisait rien.
    /// « Partager » du menu ⋯ : `onShare?(post.id)` sur un rappel absent.
    ///
    /// L'ÉTAT voyage avec l'action : sans `isReposted` / `isBookmarked`, la
    /// bascule optimiste n'atteint jamais l'icône, et une carte des favoris
    /// s'affiche « non enregistrée ».
    private static let unconditionalActions = [
        ActionWiring(action: "Aimer", arguments: ["onLike:"],
                     symptom: "le cœur joue sa rafale et sa haptique, puis n'aime rien"),
        ActionWiring(action: "Repartager", arguments: ["onRepost:", "isReposted:"],
                     symptom: "« Repartager » est offert sans effet, ou son état ne s'affiche jamais"),
        ActionWiring(action: "Enregistrer", arguments: ["onBookmark:", "isBookmarked:"],
                     symptom: "le marque-page s'affiche avec son compteur et ne fait rien"),
        ActionWiring(action: "Partager", arguments: ["onShare:"],
                     symptom: "« Partager » du menu ⋯ ne présente aucune feuille"),
    ]

    /// Les rappels optionnels que la carte n'affiche QUE s'ils sont fournis
    /// (« Citer » dans le choix du repartage, « Épingler », « Modifier », la
    /// baguette « Imager » et son « Export rapide », #16163 : sans `onImager`
    /// `FeedPostActionsBar.imagerButton` ne rend rien, sans `onImagerQuick`
    /// `ImagerWandButton` n'offre pas d'appui long).
    /// Leur absence retire le contrôle : elle ne peut pas le rendre inerte.
    private static let conditionalActions: Set<String> = ["onQuote", "onPin", "onEdit", "onImager", "onImagerQuick"]

    /// Montages délibérément muets, chacun justifié par une MESURE.
    private static let deliberatelyUnwired: [String: Set<String>] = [:]

    func test_toutMontageDeFeedPostCard_cableChaqueActionDeSaBarre() throws {
        let cards = try mountings()
        let failures = Self.unconditionalActions.flatMap { wiring in
            cards
                .filter { mounting in wiring.arguments.contains { !mounting.arguments.contains($0) } }
                .filter { !(Self.deliberatelyUnwired[wiring.action] ?? []).contains($0.enclosingType) }
                .map { "  • \(wiring.action) — \($0.enclosingType) (\($0.file):\($0.line)) : \(wiring.symptom)" }
        }

        XCTAssertTrue(failures.isEmpty, """
            \(failures.count) action(s) de FeedPostCard montée(s) sans effet :
            \(failures.joined(separator: "\n"))
            Câbler l'écrivain et son état (\(Self.unconditionalActions.map { $0.arguments.joined(separator: " + ") }.joined(separator: ", "))), \
            ou justifier l'exception par une MESURE dans `deliberatelyUnwired`.
            """)
    }

    /// Un rappel FOURNI mais vide (`{ _ in }`) est le même mensonge qu'un
    /// rappel omis, et le compilateur l'accepte même là où le paramètre est
    /// obligatoire — c'est le cas de `ReelFeedCard`, dont les actions ne sont
    /// pas optionnelles.
    func test_aucuneCarteNeCableUneActionDeSaBarreSurUnRappelVide() throws {
        let labels = ["onLike", "onComment", "onRepost", "onBookmark", "onShare"]
        let empty = try NSRegularExpression(
            pattern: #"\b(\#(labels.joined(separator: "|"))):\s*\{\s*_\s*in\s*\}"#
        )
        let failures = try (mountings(of: "FeedPostCard") + mountings(of: "ReelFeedCard")).flatMap { mounting in
            empty.matches(in: mounting.arguments, range: NSRange(mounting.arguments.startIndex..., in: mounting.arguments))
                .compactMap { Range($0.range(at: 1), in: mounting.arguments).map { String(mounting.arguments[$0]) } }
                .map { "  • \($0) — \(mounting.enclosingType) (\(mounting.file):\(mounting.line))" }
        }

        XCTAssertTrue(failures.isEmpty, """
            Action(s) de carte câblée(s) sur un rappel vide : le bouton s'affiche et ne fait rien.
            \(failures.joined(separator: "\n"))
            """)
    }

    func test_leReleve_trouveAussiLesCartesDeReel() throws {
        XCTAssertGreaterThanOrEqual(try mountings(of: "ReelFeedCard").count, 2,
            "Le relevé ne trouve plus les montages de ReelFeedCard : la loi du rappel vide ne mesure rien.")
    }

    /// **La table couvre TOUTE la barre.** Un rappel optionnel ajouté à la
    /// rangée d'actions ou au menu ⋯ sans entrer dans la loi ci-dessus serait
    /// un nouveau bouton qu'aucun montage n'est tenu de câbler. Le relevé lit
    /// les déclarations des deux types qui RENDENT ces actions.
    func test_laLoiCouvreChaqueRappelOptionnelDeLaBarreEtDuMenu() throws {
        let covered = Set(Self.unconditionalActions.flatMap(\.arguments)
            .filter { $0.hasPrefix("on") }
            .map { String($0.dropLast()) })
        let declared = try Self.optionalCallbacks(declaredBy: "FeedPostActionsBar", in: "Main/Views/FeedPostActionsBar.swift")
            .union(Self.optionalCallbacks(declaredBy: "FeedPostOnlineMenuItems", in: "Main/Views/FeedPostCard+Header.swift"))

        XCTAssertGreaterThanOrEqual(declared.count, 5, "Le relevé des rappels de la barre ne trouve plus rien.")
        let ungoverned = declared.subtracting(covered).subtracting(Self.conditionalActions)
        XCTAssertTrue(ungoverned.isEmpty, """
            Rappel(s) optionnel(s) de la barre ou du menu hors de la loi : \(ungoverned.sorted()). \
            Les ajouter à `unconditionalActions` (et câbler chaque montage), ou prouver que le \
            contrôle disparaît en leur absence et les ranger dans `conditionalActions`.
            """)
    }

    private static func optionalCallbacks(declaredBy type: String, in relativePath: String) throws -> Set<String> {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features").appendingPathComponent(relativePath)
        let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        guard let start = source.range(of: "struct \(type)"),
              let end = source.range(of: "var body", range: start.upperBound..<source.endIndex) else {
            XCTFail("\(type) introuvable dans \(relativePath)")
            return []
        }
        let declarations = String(source[start.upperBound..<end.lowerBound])
        let pattern = try NSRegularExpression(pattern: #"(?:let|var)\s+(on[A-Z]\w*)\s*:\s*\(\("#)
        return Set(pattern.matches(in: declarations, range: NSRange(declarations.startIndex..., in: declarations))
            .compactMap { Range($0.range(at: 1), in: declarations).map { String(declarations[$0]) } })
    }
}
