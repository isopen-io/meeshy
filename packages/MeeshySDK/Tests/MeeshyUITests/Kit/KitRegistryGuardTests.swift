import XCTest
@testable import MeeshyUI

/// Le registre du chantier (`.claude/workflows/meeshy-kit-planche.lots.json`) dit
/// quels composants le kit doit porter ; le catalogue dit lesquels il porte. Cette
/// garde les met face à face : un composant LIVRÉ (son fichier existe) a une entrée
/// non vide, son témoin `<Nom>Tests`, et les images de chacun de ses états ; un
/// composant qui n'existe pas encore a une entrée VIDE, donc n'apparaît pas.
final class KitRegistryGuardTests: XCTestCase {

    // MARK: - Registre réel

    func test_entries_egalentLesClesEtLesNomsDuRegistre() throws {
        let lots = try Self.registryKitLots()
        XCTAssertEqual(MeeshyKitCatalog.entries.map(\.key), lots.map(\.key))
        XCTAssertEqual(MeeshyKitCatalog.entries.map(\.name), lots.map(\.name))
    }

    func test_chaqueLotDuRegistre_estEnRegleAvecLeCatalogue() throws {
        let problems = KitRegistryAudit.problems(
            lots: try Self.registryKitLots(),
            entries: MeeshyKitCatalog.entries,
            boardViewIDs: try Self.boardViewIDs(),
            disk: Self.repositoryDisk
        )
        XCTAssertEqual(problems, [], problems.joined(separator: "\n"))
    }

    func test_laTableDeLaPlanche_porteSesVues() throws {
        let ids = try Self.boardViewIDs()
        XCTAssertTrue(ids.isSuperset(of: ["R1", "R3", "A2", "O1", "S1", "P1", "C1", "I1"]), "\(ids.sorted())")
    }

    // MARK: - Audit (témoins de comportement, registre fabriqué)

    func test_cibleAbsente_entreeVide_estEnRegle() {
        let problems = KitRegistryAudit.problems(
            lots: [Self.lot()], entries: [MeeshyKitCatalogEntry(key: "K02", name: "MeeshyGlassButton")],
            boardViewIDs: ["R1"], disk: .init(existing: [], images: [])
        )
        XCTAssertEqual(problems, [])
    }

    func test_cibleAbsente_entreeGarnie_estUnProbleme() {
        let problems = KitRegistryAudit.problems(
            lots: [Self.lot()], entries: [Self.entry(states: [.init(id: "repos", boardView: "R1")])],
            boardViewIDs: ["R1"], disk: .init(existing: [], images: [])
        )
        XCTAssertEqual(problems.count, 1, "\(problems)")
        XCTAssertTrue(problems[0].contains("K02"))
    }

    func test_cibleLivree_entreeVide_estUnProbleme() {
        let problems = KitRegistryAudit.problems(
            lots: [Self.lot()], entries: [MeeshyKitCatalogEntry(key: "K02", name: "MeeshyGlassButton")],
            boardViewIDs: ["R1"], disk: .init(existing: [Self.target, Self.witness], images: [])
        )
        XCTAssertEqual(problems.count, 1, "\(problems)")
    }

    func test_cibleLivree_sansTemoin_estUnProbleme() {
        let problems = KitRegistryAudit.problems(
            lots: [Self.lot()], entries: [Self.entry(states: [.init(id: "repos", boardView: "R1")])],
            boardViewIDs: ["R1"], disk: .init(existing: [Self.target], images: Self.images(["repos"], touchable: false))
        )
        XCTAssertTrue(problems.contains { $0.contains("MeeshyGlassButtonTests") }, "\(problems)")
    }

    func test_cibleLivree_toutePresent_estEnRegle() {
        let problems = KitRegistryAudit.problems(
            lots: [Self.lot()],
            entries: [Self.entry(states: [.init(id: "repos", boardView: "R1"), .init(id: "actif", boardView: "R3", isTouchable: true)])],
            boardViewIDs: ["R1", "R3"],
            disk: .init(existing: [Self.target, Self.witness], images: Self.images(["repos"], touchable: false) + Self.images(["actif"], touchable: true))
        )
        XCTAssertEqual(problems, [])
    }

    func test_imageManquante_parEtat_estNommee() {
        let problems = KitRegistryAudit.problems(
            lots: [Self.lot()],
            entries: [Self.entry(states: [.init(id: "actif", boardView: "R3", isTouchable: true)])],
            boardViewIDs: ["R3"],
            disk: .init(existing: [Self.target, Self.witness], images: Self.images(["actif"], touchable: false))
        )
        XCTAssertEqual(problems.count, 1, "\(problems)")
        XCTAssertTrue(problems[0].contains("actif.presse"), "\(problems)")
    }

    func test_planchesGrandePoliceEtRtl_sontExigees() {
        let problems = KitRegistryAudit.problems(
            lots: [Self.lot()],
            entries: [Self.entry(states: [.init(id: "repos", boardView: "R1")])],
            boardViewIDs: ["R1"],
            disk: .init(existing: [Self.target, Self.witness], images: ["MeeshyGlassButton/repos.clair-iOS26.png", "MeeshyGlassButton/repos.sombre-iOS26.png"])
        )
        XCTAssertTrue(problems.contains { $0.contains("planche.grande-police") }, "\(problems)")
        XCTAssertTrue(problems.contains { $0.contains("planche.rtl") }, "\(problems)")
    }

    func test_vueInconnueDeLaPlanche_estUnProbleme() {
        let problems = KitRegistryAudit.problems(
            lots: [Self.lot()],
            entries: [Self.entry(states: [.init(id: "repos", boardView: "Z9")])],
            boardViewIDs: ["R1"],
            disk: .init(existing: [Self.target, Self.witness], images: Self.images(["repos"], touchable: false))
        )
        XCTAssertTrue(problems.contains { $0.contains("Z9") }, "\(problems)")
    }

    func test_entreesQuiNeSuiventPasLeRegistre_sontUnProbleme() {
        let problems = KitRegistryAudit.problems(
            lots: [Self.lot()], entries: [], boardViewIDs: [], disk: .init(existing: [], images: [])
        )
        XCTAssertFalse(problems.isEmpty)
    }

    // MARK: - Fabriques

    private static let target = "packages/MeeshySDK/Sources/MeeshyUI/Kit/MeeshyGlassButton.swift"
    private static let witness = "packages/MeeshySDK/Tests/MeeshyUITests/Kit/MeeshyGlassButtonTests.swift"

    private static func lot() -> KitRegistryAudit.Lot {
        .init(key: "K02", name: "MeeshyGlassButton", target: target)
    }

    private static func entry(states: [MeeshyKitCatalogState]) -> MeeshyKitCatalogEntry {
        MeeshyKitCatalogEntry(key: "K02", name: "MeeshyGlassButton", states: states)
    }

    private static func images(_ ids: [String], touchable: Bool) -> [String] {
        let variants = touchable ? ["clair", "sombre", "presse"] : ["clair", "sombre"]
        let states = ids.flatMap { id in variants.map { "MeeshyGlassButton/\(id).\($0)-iOS26.png" } }
        return states + ["MeeshyGlassButton/planche.grande-police-iOS26.png", "MeeshyGlassButton/planche.rtl-iOS26.png"]
    }

    // MARK: - Disque

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static var snapshotsRoot: URL {
        URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("__Snapshots__")
    }

    private static var repositoryDisk: KitRegistryAudit.Disk {
        let root = repositoryRoot
        let images = (FileManager.default.enumerator(at: snapshotsRoot, includingPropertiesForKeys: nil)?
            .compactMap { ($0 as? URL)?.path } ?? [])
            .map { String($0.dropFirst(snapshotsRoot.path.count + 1)) }
        let existing = KitRegistryAudit.candidatePaths.filter {
            FileManager.default.fileExists(atPath: root.appendingPathComponent($0).path)
        }
        return .init(existing: Set(existing), images: images)
    }

    private static func registryKitLots() throws -> [KitRegistryAudit.Lot] {
        let url = repositoryRoot.appendingPathComponent(".claude/workflows/meeshy-kit-planche.lots.json")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        let lots = try XCTUnwrap((object as? [String: Any])?["lots"] as? [[String: Any]])
        return lots.compactMap { lot in
            guard lot["type"] as? String == "kit",
                  let key = lot["cle"] as? String,
                  let name = lot["nom"] as? String,
                  let target = lot["cible_ios"] as? String else { return nil }
            return .init(key: key, name: name, target: target)
        }
    }

    private static func boardViewIDs() throws -> Set<String> {
        let url = repositoryRoot.appendingPathComponent("docs/product/composer-vue-finale/planche.html")
        let html = try String(contentsOf: url, encoding: .utf8)
        let table = try XCTUnwrap(html.range(of: "const S=["), "la table S a disparu de la planche")
        let rest = String(html[table.upperBound...])
        let regex = try NSRegularExpression(pattern: #"\{id:'([A-Z]+[0-9]+)'"#)
        let matches = regex.matches(in: rest, range: NSRange(rest.startIndex..., in: rest))
        return Set(matches.compactMap { Range($0.range(at: 1), in: rest).map { String(rest[$0]) } })
    }
}
