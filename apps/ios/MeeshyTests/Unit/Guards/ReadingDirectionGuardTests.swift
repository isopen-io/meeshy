import XCTest

/// **Le sens de lecture d'un glissement se DÉCIDE, il ne se subit pas.**
///
/// `RightToLeftLayoutGuardTests` garde la deuxième famille de défauts RTL — les
/// symboles nommés par un côté physique. Celle-ci garde la **troisième** : le
/// SIGNE d'un `DragGesture`, que SwiftUI ne retourne pas plus qu'un
/// `chevron.right` (#4297).
///
/// ### Pourquoi une liste NOMMÉE plutôt qu'une interdiction
///
/// Sur les 25 comparaisons de `translation.width` du dépôt, la majorité est
/// LÉGITIMEMENT brute : neuf n'encodent aucun sens (`abs()`, ou dominance d'axe
/// `abs(dx) > abs(dy)`), et sept déplacent un objet qui suit le doigt — une
/// pastille d'appel jetée vers la droite part vers la droite dans toutes les
/// langues. Les interdire produirait un bruit permanent.
///
/// La garde épingle donc ce qui est DÉCIDÉ : les fichiers qui consomment le
/// helper le consomment toujours, et le helper reste unique. Un site de
/// navigation neuf n'est pas attrapé automatiquement — c'est assumé, et c'est
/// pourquoi la doctrine vit dans le doc-comment de `ReadingDirection`, là où on
/// la lit en écrivant le geste.
final class ReadingDirectionGuardTests: XCTestCase {

    private var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Guards
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy")
    }

    private static let sourceOfTruth = "ReadingDirection.swift"

    /// Les sites de navigation retournés au 259i. Chacun a été vérifié
    /// individuellement : sa décision ET son visuel passent dans le même sens.
    private static let mirroringSites = [
        "RiverStreamHost.swift",
        "ReelsPlayerView.swift",
    ]

    func test_lesSitesDeNavigationConsommentToujoursLeHelper() throws {
        for name in Self.mirroringSites {
            let url = try XCTUnwrap(
                swiftFiles().first { $0.lastPathComponent == name },
                "fichier \(name) introuvable"
            )
            let text = try String(contentsOf: url, encoding: .utf8)
            XCTAssertTrue(
                text.contains("ReadingDirection.readingDelta"),
                "\(name) portait un geste de NAVIGATION retourné pour l'arabe ; il ne "
                + "consomme plus `ReadingDirection` — le geste est reparti en espace écran"
            )
            XCTAssertTrue(
                text.contains("layoutDirection"),
                "\(name) doit lire `\\.layoutDirection` pour décider du sens"
            )
        }
    }

    /// Le retournement d'un geste n'est utile que si le VISUEL suit. `ReelsPlayerView`
    /// est le site où les deux coexistent : sa bande de bord décide (`> 70`) ET
    /// translate (`.offset(x:)`). Si l'un passait par le helper sans l'autre, le
    /// contenu partirait à l'opposé du doigt — l'incohérence qui a fait RENONCER au
    /// même retournement sur le cube des stories.
    func test_leSiteQuiDecideEtQuiTranslateFaitPasserLesDeuxParLeHelper() throws {
        let url = try XCTUnwrap(
            swiftFiles().first { $0.lastPathComponent == "ReelsPlayerView.swift" }
        )
        let text = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(
            text.contains(".offset(x: ReadingDirection.readingDelta("),
            "la translation de `ReelsPlayerView` doit repasser en espace écran par le "
            + "helper, sinon le contenu part à l'opposé du doigt en arabe"
        )
        let decisions = text.components(separatedBy: "ReadingDirection.readingDelta").count - 1
        XCTAssertGreaterThanOrEqual(
            decisions, 3,
            "trois passages attendus : le suivi visuel, le seuil de fermeture, et le "
            + "retour en espace écran de l'offset — il en manque un"
        )
    }

    /// Source unique : un second `readingDelta` recopié ailleurs divergerait.
    func test_leHelperEstDeclareUneSeuleFois() throws {
        let producers = try swiftFiles()
            .filter { try String(contentsOf: $0, encoding: .utf8).contains("enum ReadingDirection") }
            .map { $0.lastPathComponent }
        XCTAssertEqual(producers, [Self.sourceOfTruth])
    }

    /// Borne : le balayage voit bien des fichiers, et voit bien la source unique —
    /// sans quoi les règles ci-dessus passeraient au vert en ne regardant rien
    /// (leçon 256i, rejouée au 257i).
    func test_leBalayageVoitBienLeDepot() throws {
        let files = try swiftFiles()
        XCTAssertGreaterThan(files.count, 400, "racine attendue : \(appRoot.path)")
        XCTAssertTrue(files.contains { $0.lastPathComponent == Self.sourceOfTruth })
    }

    private func swiftFiles() throws -> [URL] {
        guard let walker = FileManager.default.enumerator(at: appRoot, includingPropertiesForKeys: nil)
        else { return [] }
        return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }
}
