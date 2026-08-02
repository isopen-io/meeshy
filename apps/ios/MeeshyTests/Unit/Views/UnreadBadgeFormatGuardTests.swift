import XCTest
@testable import Meeshy
import MeeshyUI

/// Le compteur des pastilles doit passer par `NotificationBadge.displayed`.
///
/// Sept sites avaient recopié `Text("\(min(count, 99))")`. Passé 99, la pastille
/// affichait « 99 » : un nombre FAUX, présenté comme exact — 4 312
/// notifications et 99 rendaient le même glyphe. Le seuil servait à tenir dans
/// une pastille carrée figée ; il tronquait la donnée pour protéger la mise en
/// page, alors que c'est la pastille qui doit s'élargir.
///
/// La garde est de source parce que le défaut est une FORME D'ÉCRITURE recopiée
/// d'un fichier à l'autre, pas un comportement observable depuis un seul point
/// d'entrée : chaque site construit son `Text` inline dans un `body` privé.
@MainActor
final class UnreadBadgeFormatGuardTests: XCTestCase {

    private func viewsDirectory() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views")
    }

    private func swiftSources() throws -> [(name: String, code: String)] {
        let dir = viewsDirectory()
        let urls = try FileManager.default
            .contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "swift" }
        return try urls.map { (name: $0.lastPathComponent, code: try String(contentsOf: $0, encoding: .utf8)) }
    }

    /// Le motif exact qui produisait le bug, sous ses deux orthographes.
    func test_noViewClampsTheCounterInsteadOfMarkingItOverflowed() throws {
        let offenders = try swiftSources()
            .filter { $0.code.contains("min(") && $0.code.range(of: #", *99\)"#, options: .regularExpression) != nil }
            .map(\.name)

        XCTAssertTrue(
            offenders.isEmpty,
            "Ces vues écrêtent le compteur à 99 au lieu d'annoncer « 99+ » — "
            + "elles affichent donc un nombre faux : \(offenders.sorted().joined(separator: ", ")). "
            + "Utiliser NotificationBadge.displayed(_:)."
        )
    }

    /// Le second symptôme visible sur la capture : `71` à l'étroit dans son
    /// disque. Une pastille au cadre carré figé ne peut pas loger trois glyphes ;
    /// elle rogne, ou rétrécit le texte jusqu'à l'illisible.
    func test_badgesUsingTheSharedFormatter_growInsteadOfBeingBoxed() throws {
        let boxed = try swiftSources()
            .filter { $0.code.contains("NotificationBadge.displayed(") }
            .filter { file in
                guard let start = file.code.range(of: "NotificationBadge.displayed(") else { return false }
                let end = file.code.index(start.upperBound, offsetBy: 600, limitedBy: file.code.endIndex)
                    ?? file.code.endIndex
                let block = String(file.code[start.upperBound ..< end])
                // Un cadre à largeur ET hauteur fixes juste après le compteur
                // empêche la pastille de s'élargir.
                return block.range(of: #"\.frame\(width: *\d+, *height: *\d+\)"#,
                                   options: .regularExpression) != nil
            }
            .map(\.name)

        XCTAssertTrue(
            boxed.isEmpty,
            "Ces pastilles enferment le compteur dans un cadre figé — « 99+ » y sera "
            + "rogné : \(boxed.sorted().joined(separator: ", ")). Utiliser "
            + "`padding(.horizontal:)` + `frame(minWidth:minHeight:)` et une Capsule."
        )
    }

    /// Cohérence de graisse : la source de vérité est `NotificationBadge.fontWeight`.
    func test_sharedFontWeight_isNotBold() {
        XCTAssertNotEqual(NotificationBadge.fontWeight, .bold)
    }
}
