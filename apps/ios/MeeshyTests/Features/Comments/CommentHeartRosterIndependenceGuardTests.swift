import XCTest
@testable import Meeshy

/// **LE CŒUR D'UN COMMENTAIRE NE SE DÉRIVE PLUS D'UN ROSTER** (#20410).
///
/// `CommentHeartLedger.reconcile` lisait `aggregation.userIds` — la liste des
/// réacteurs portée par `comment:reaction-added` / `-removed` — pour savoir si
/// MON cœur est posé. Trois conséquences, et la troisième est celle qui arme le
/// piège :
///
/// 1. la passerelle s'apprête à COUPER ce roster de la charge (#20410, étape 3),
///    ce que les clients déployés paieraient : sans roster, l'ancien code rendait
///    « un cœur de trop » à tout lecteur ayant aimé ;
/// 2. sur les deux chemins d'ACK, le roster est déjà FILTRÉ par lecteur
///    (#20337) — un blocage pouvait donc éteindre un cœur en silence ;
/// 3. le roster reste SERVI aujourd'hui : rien ne rougit si quelqu'un le relit.
///    D'où cette garde, et pas seulement un correctif.
///
/// Inventaire VIDE : il n'y a pas de lecture légitime du roster pour décider
/// d'un cœur. Quand elle tombe, la réparation est de dériver de l'ACTEUR et de
/// la DIRECTION (`CommentHeartLedger.HeartChange`), jamais d'ajouter une ligne
/// d'exemption.
final class CommentHeartRosterIndependenceGuardTests: XCTestCase {

    /// Les deux orthographes mesurées le 2026-11-27 : l'accès direct à la charge
    /// et le nom du paramètre que les trois applicateurs se passaient.
    private static let forbiddenForms = [
        "aggregation.userIds",
        "reactorUserIds",
    ]

    private static let sourceFolders = [
        "apps/ios/Meeshy",
        "packages/MeeshySDK/Sources",
    ]

    private static var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Comments
            .deletingLastPathComponent()   // Features
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // repo root
    }

    private static func sourceFiles() -> [URL] {
        sourceFolders.flatMap { folder -> [URL] in
            let url = repoRoot.appendingPathComponent(folder)
            let walker = FileManager.default.enumerator(at: url, includingPropertiesForKeys: nil)
            return (walker?.compactMap { $0 as? URL } ?? []).filter { $0.pathExtension == "swift" }
        }
    }

    func test_noProductionSourceDerivesAHeartFromTheReactorRoster() throws {
        let files = Self.sourceFiles()
        /* Une garde négative dont le balayage rend `[]` reste VERTE : elle
           prouve d'abord qu'elle regarde le vrai dépôt. */
        XCTAssertGreaterThan(files.count, 1_000, "la garde doit balayer les sources réelles de l'app et du SDK")

        var found: [String] = []
        for file in files {
            let lines = AppSourceGuard.strippedLines(try AppSourceGuard.text(at: file))
            let hits = lines.filter { line in Self.forbiddenForms.contains { line.contains($0) } }
            found += hits.map { "\(file.lastPathComponent): \($0.trimmingCharacters(in: .whitespaces))" }
        }

        XCTAssertEqual(found, [], "un cœur se dérive de l'ACTEUR et de la DIRECTION, jamais du roster des réacteurs (#20410)")
    }

    /// La garde reconnaît bien ce qu'elle refuse — sans quoi son inventaire vide
    /// ne dirait rien (la faute du cycle 107 : un balayage qui mesure la
    /// popularité d'un idiome au lieu d'une propriété).
    func test_theGuardRecognisesWhatItForbids() {
        let offending = AppSourceGuard.strippedLines(
            "let mine = event.aggregation.userIds.contains(myUserId)  // decides my heart"
        )
        XCTAssertTrue(offending.contains { line in Self.forbiddenForms.contains { line.contains($0) } })

        let innocent = AppSourceGuard.strippedLines(
            "// historique : ce site lisait aggregation.userIds avant #20410\nlet mine = actorUserId == myUserId\n"
        )
        XCTAssertFalse(
            innocent.contains { line in Self.forbiddenForms.contains { line.contains($0) } },
            "un commentaire qui RACONTE l'ancienne lecture n'est pas une lecture — le stripper doit l'avoir retiré"
        )
    }
}
