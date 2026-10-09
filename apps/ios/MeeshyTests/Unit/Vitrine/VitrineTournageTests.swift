import XCTest
@testable import Meeshy

/// Le clap du tournage (#9810) : « prêt » posé, l'app ATTEND que le script dise que l'enregistreur tourne (`go.txt`)
/// avant de jouer l'action — l'enregistreur du simulateur démarre 0,4 à 2 s après « prêt ». Sans tournage (simple
/// capture), aucun clap ne vient : l'action part après un repli de 8 s — le script dépose `go.txt` jusqu'à 4,5 s
/// après « prêt » (démarrage de l'enregistreur + 2,5 s d'avance), le repli doit donc venir après.
@MainActor
final class VitrineTournageTests: XCTestCase {
    private func dossier() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("vitrine-tournage-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    func test_marqueurGo_isGoTxt_besideReady() {
        XCTAssertEqual(VitrineLaunch.marqueurGo.lastPathComponent, "go.txt")
        XCTAssertEqual(VitrineLaunch.marqueurGo.deletingLastPathComponent(), VitrineLaunch.marqueurPret.deletingLastPathComponent())
    }

    func test_repli_comesAfterTheLatestClap() {
        XCTAssertEqual(VitrineTournage.repli, .seconds(8))
    }

    func test_attendreLeClap_returnsAsSoonAsGoIsDropped() async throws {
        let go = try dossier().appendingPathComponent("go.txt")
        let depart = ContinuousClock.now
        Task {
            try? await Task.sleep(for: .milliseconds(150))
            try? Data("1".utf8).write(to: go)
        }

        let clap = await VitrineTournage.attendreLeClap(go, repli: .seconds(10))

        XCTAssertEqual(clap, .donne)
        XCTAssertLessThan(ContinuousClock.now - depart, .seconds(3), "le clap libère l'action sans attendre le repli")
    }

    func test_attendreLeClap_withoutGo_fallsBackAfterTheDelay() async throws {
        let go = try dossier().appendingPathComponent("go.txt")
        let depart = ContinuousClock.now

        let clap = await VitrineTournage.attendreLeClap(go, repli: .milliseconds(300))

        XCTAssertEqual(clap, .repli)
        XCTAssertGreaterThanOrEqual(ContinuousClock.now - depart, .milliseconds(300), "sans clap, l'action attend tout le repli")
    }

    func test_attendreLeClap_aGoAlreadyThere_isImmediate() async throws {
        let go = try dossier().appendingPathComponent("go.txt")
        try Data("1".utf8).write(to: go)

        let clap = await VitrineTournage.attendreLeClap(go, repli: .seconds(10))

        XCTAssertEqual(clap, .donne)
    }

    /// Un `go.txt` d'une prise précédente déclencherait l'action avant l'enregistreur : la préparation l'efface.
    func test_effacer_removesGoAndBothBounds() throws {
        let racine = try dossier()
        let fichiers = ["go.txt", "celebration-debut.txt", "celebration-fin.txt"].map { racine.appendingPathComponent($0) }
        for fichier in fichiers { try Data("x".utf8).write(to: fichier) }

        VitrineTournage.effacerLesMarqueurs(dans: racine)

        for fichier in fichiers {
            XCTAssertFalse(FileManager.default.fileExists(atPath: fichier.path), fichier.lastPathComponent)
        }
    }

    /// Clap, « début », l'action, « fin » : dans cet ordre, et la fin seulement une fois l'action rendue.
    func test_tourner_waitsForTheClap_thenBoundsTheAction() async throws {
        let racine = try dossier()
        let debut = racine.appendingPathComponent("celebration-debut.txt")
        let fin = racine.appendingPathComponent("celebration-fin.txt")
        try Data("1".utf8).write(to: racine.appendingPathComponent("go.txt"))
        var vu: (debut: Bool, fin: Bool)?

        await VitrineTournage.tourner(.jeuFrappe, dans: racine) {
            vu = (FileManager.default.fileExists(atPath: debut.path), FileManager.default.fileExists(atPath: fin.path))
        }

        XCTAssertEqual(vu?.debut, true, "« début » tombe avant l'action")
        XCTAssertEqual(vu?.fin, false, "« fin » n'est pas posé pendant l'action")
        XCTAssertEqual(try String(contentsOf: fin, encoding: .utf8), "jeu-frappe")
    }
}
