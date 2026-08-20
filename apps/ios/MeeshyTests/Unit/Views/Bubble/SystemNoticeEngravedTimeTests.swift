import XCTest
@testable import Meeshy

/// Sémantique « gravée » des messages système — replis génériques.
///
/// Un message système est un JALON du fil, pas une parole : il se rend centré,
/// comme les stickers de date, avec l'heure EN PREMIER. `BubbleJoinNoticeView`
/// (l'avis d'arrivée riche) porte déjà cette loi ; ces gardes l'étendent aux
/// REPLIS — `BubbleSystemNoticeView` (mode Bulles) et `FocalSystemNoticeRow`
/// (mode Script) — qui rendent tout message système dont les `metadata` ne
/// sont pas décodables (messages legacy, types futurs).
///
/// Gardes de SOURCE, sur le patron de `RiverStreamHostSourceGuardTests` : ces
/// vues feuilles ne sont pas montables sans runtime UIKit (aucun ViewInspector
/// dans ce dépôt). Les commentaires sont STRIPPÉS avant chaque assertion — la
/// doc voisine mentionne précisément les chaînes surveillées.
final class SystemNoticeEngravedTimeTests: XCTestCase {

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Views/Bubble
            .deletingLastPathComponent()   // .../Unit/Views
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
    }

    /// Source d'un fichier de l'app, commentaires ligne (`//`, `///`) retirés —
    /// une garde qui matcherait un commentaire prouverait la doc, pas le code.
    private func strippedSource(_ relativePath: String) throws -> String {
        let raw = try String(
            contentsOf: Self.iosRoot.appendingPathComponent("Meeshy/\(relativePath)"),
            encoding: .utf8
        )
        return raw
            .components(separatedBy: "\n")
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    /// Découpe la déclaration `struct <name>` jusqu'à la déclaration suivante —
    /// ancres STRUCTURELLES, jamais une fenêtre de caractères fixe.
    private func structBody(named name: String, in code: String, until nextDecl: String) throws -> String {
        let start = try XCTUnwrap(
            code.range(of: "struct \(name)"),
            "`struct \(name)` a bougé — re-pointer cette garde avant tout le reste."
        )
        let tail = String(code[start.lowerBound...])
        guard let end = tail.range(of: nextDecl) else { return tail }
        return String(tail[..<end.lowerBound])
    }

    // MARK: - Mode Bulles — BubbleSystemNoticeView (repli générique)

    /// Le glyphe téléphone appartenait aux résumés d'appel, seuls producteurs
    /// de messages système à l'époque de cette vue. Les appels modernes passent
    /// par `BubbleCallNoticeView` ; le repli, lui, rend N'IMPORTE QUEL message
    /// système (avis d'arrivée legacy compris) — un combiné y est un mensonge.
    func test_genericSystemNotice_hasNoPhoneGlyph() throws {
        let code = try strippedSource("Features/Main/Views/Bubble/BubbleSystemViews.swift")
        let body = try structBody(named: "BubbleSystemNoticeView", in: code, until: "struct JoinNoticePresentation")
        XCTAssertFalse(
            body.contains("phone.fill"),
            "`BubbleSystemNoticeView` rend encore un combiné téléphonique — le repli " +
            "générique annonce des arrivées et des événements futurs, pas seulement des appels."
        )
    }

    /// L'heure se grave EN PREMIER, centrée — même sémantique que
    /// `BubbleJoinNoticeView` (`bubble-join-notice-time`).
    func test_genericSystemNotice_engravesTimeFirst() throws {
        let code = try strippedSource("Features/Main/Views/Bubble/BubbleSystemViews.swift")
        let body = try structBody(named: "BubbleSystemNoticeView", in: code, until: "struct JoinNoticePresentation")

        let timeRange = try XCTUnwrap(
            body.range(of: "bubble-system-notice-time"),
            "`BubbleSystemNoticeView` ne grave pas l'heure — un message système est un " +
            "jalon du fil et porte son heure en tête, comme les stickers de date."
        )
        let textRange = try XCTUnwrap(
            body.range(of: "Text(text)"),
            "`Text(text)` a bougé — re-pointer cette garde avant tout le reste."
        )
        XCTAssertTrue(
            timeRange.lowerBound < textRange.lowerBound,
            "L'heure doit se rendre AVANT le libellé — l'ordre textuel des vues est " +
            "l'ordre du DOM natif (et l'ordre VoiceOver)."
        )
    }

    /// Le dispatch Bulles nourrit le repli avec l'heure du fil — sans ce
    /// paramètre, la vue est correcte mais reste muette.
    func test_bubbleDispatch_passesThreadTime_toGenericNotice() throws {
        let code = try strippedSource("Features/Main/Views/ThemedMessageBubble.swift")
        let call = try XCTUnwrap(
            code.range(of: "BubbleSystemNoticeView(").map { String(code[$0.lowerBound...].prefix(while: { $0 != ")" })) },
            "L'appel `BubbleSystemNoticeView(` a disparu de ThemedMessageBubble — re-pointer cette garde."
        )
        XCTAssertTrue(
            call.contains("timeString: content.meta.timeString"),
            "Le dispatch Bulles n'a pas câblé l'heure du fil sur le repli générique : \(call)"
        )
    }

    // MARK: - Mode Script — FocalSystemNoticeRow (repli générique)

    func test_focalGenericNotice_engravesTimeFirst() throws {
        let code = try strippedSource("Features/Main/Focal/Row/FocalSystemRows.swift")
        let body = try structBody(named: "FocalSystemNoticeRow", in: code, until: "struct FocalCallNoticeRow")

        let timeRange = try XCTUnwrap(
            body.range(of: "focal-system-notice-time"),
            "`FocalSystemNoticeRow` ne grave pas l'heure — les deux modes de lecture " +
            "disent la même chose (même loi que `BubbleSystemNoticeView`)."
        )
        let textRange = try XCTUnwrap(
            body.range(of: "Text(text)"),
            "`Text(text)` a bougé — re-pointer cette garde avant tout le reste."
        )
        XCTAssertTrue(
            timeRange.lowerBound < textRange.lowerBound,
            "L'heure doit se rendre AVANT le libellé dans la rangée Script."
        )
    }

    func test_focalDispatch_passesThreadTime_toGenericNotice() throws {
        let code = try strippedSource("Features/Main/Focal/Row/FocalSystemRows.swift")
        let call = try XCTUnwrap(
            code.range(of: "FocalSystemNoticeRow(text:").map { String(code[$0.lowerBound...].prefix(while: { $0 != ")" })) },
            "L'appel `FocalSystemNoticeRow(text:` a disparu du dispatch — re-pointer cette garde."
        )
        XCTAssertTrue(
            call.contains("timeString: content.meta.timeString"),
            "Le dispatch Script n'a pas câblé l'heure du fil sur le repli générique : \(call)"
        )
    }
}
