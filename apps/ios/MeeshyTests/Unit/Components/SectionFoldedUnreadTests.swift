import XCTest
import MeeshyUI
@testable import Meeshy

/// Une section repliée dit ce qu'elle cache (#8694) — la LOI, jumelle de
/// `foldedSectionUnread` / `lensSectionAccessibleName` côté web
/// (`apps/web/src/lib/lens/folded-unread.ts`), et le CÂBLAGE des deux peaux
/// d'en-tête.
///
/// `bundle` et `locale` vont par PAIRE (idiome `UnreadCountLabelTests`) : le
/// bundle choisit la table, le locale la règle plurielle — le simulateur de la
/// CI tourne en anglais.
@MainActor
final class SectionFoldedUnreadTests: XCTestCase {

    private func bundle(_ code: String) throws -> Bundle {
        let path = try XCTUnwrap(
            Bundle.main.path(forResource: code, ofType: "lproj"),
            "localisation « \(code) » absente du bundle — régression de packaging"
        )
        return try XCTUnwrap(Bundle(path: path))
    }

    private func value(isExpanded: Bool, foldedUnread: Int, in code: String) throws -> String {
        SectionFoldedUnread.accessibilityValue(
            isExpanded: isExpanded,
            foldedUnread: foldedUnread,
            bundle: try bundle(code),
            locale: Locale(identifier: code)
        )
    }

    // MARK: - Le compte

    func test_count_folded_sumsTheServedUnreadCountsOfItsConversations() {
        XCTAssertEqual(SectionFoldedUnread.count(unreadCounts: [3, 0, 9], isExpanded: false), 12)
    }

    func test_count_expanded_isZero_becauseTheRowsAlreadyCarryTheirBadges() {
        XCTAssertEqual(SectionFoldedUnread.count(unreadCounts: [3, 0, 9], isExpanded: true), 0)
    }

    func test_count_foldedWithNothingToRead_isZero_soNoBadgeIsDrawn() {
        XCTAssertEqual(SectionFoldedUnread.count(unreadCounts: [0, 0], isExpanded: false), 0)
        XCTAssertEqual(SectionFoldedUnread.count(unreadCounts: [], isExpanded: false), 0)
        XCTAssertFalse(UnreadCountBadge.isVisible(count: SectionFoldedUnread.count(unreadCounts: [0], isExpanded: false)))
    }

    func test_count_negativeOptimisticValue_neverSubtractsFromTheSum() {
        XCTAssertEqual(SectionFoldedUnread.count(unreadCounts: [4, -2, 1], isExpanded: false), 5)
    }

    /// « 99+ » est le fait de la pastille, jamais de la loi : VoiceOver lit
    /// le nombre exact.
    func test_count_isExact_beyond99_theCapBelongsToTheBadge() {
        let count = SectionFoldedUnread.count(unreadCounts: [80, 70], isExpanded: false)
        XCTAssertEqual(count, 150)
        XCTAssertEqual(NotificationBadge.displayed(count), "99+")
    }

    // MARK: - Ce que VoiceOver lit

    func test_accessibilityValue_foldedWithUnread_saysTheStateThenTheCount_inFrench() throws {
        XCTAssertEqual(try value(isExpanded: false, foldedUnread: 12, in: "fr"), "Réduite, 12 messages non lus")
    }

    func test_accessibilityValue_foldedWithOneUnread_agreesInTheSingular() throws {
        XCTAssertEqual(try value(isExpanded: false, foldedUnread: 1, in: "fr"), "Réduite, 1 message non lu")
    }

    func test_accessibilityValue_foldedWithUnread_inEnglish() throws {
        XCTAssertEqual(try value(isExpanded: false, foldedUnread: 150, in: "en"), "Collapsed, 150 unread messages")
    }

    func test_accessibilityValue_foldedWithoutUnread_saysTheStateAlone() throws {
        XCTAssertEqual(try value(isExpanded: false, foldedUnread: 0, in: "fr"), "Réduite")
    }

    func test_accessibilityValue_expanded_neverSaysACount() throws {
        XCTAssertEqual(try value(isExpanded: true, foldedUnread: 7, in: "fr"), "Développée")
    }

    func test_accessibilityValue_everyShippedLocale_carriesTheCount() throws {
        for code in ["fr", "en", "es", "it", "de", "pt-BR", "ar"] {
            let spoken = try value(isExpanded: false, foldedUnread: 3, in: code)
            XCTAssertTrue(spoken.contains("3") || spoken.contains("٣"), "\(code) : « \(spoken) » ne dit pas le compte")
            XCTAssertNotEqual(spoken, try value(isExpanded: false, foldedUnread: 0, in: code), "\(code) : le compte n'est pas annoncé")
        }
    }

    // MARK: - Le câblage : les deux peaux reçoivent le compte de la liste

    /// Une loi que personne n'appelle ne rougit nulle part : les deux en-têtes
    /// (Lentille et historique) doivent recevoir le compte depuis la LISTE, lu
    /// sur `userState.unreadCount` — la source des pastilles de rangée, donc à
    /// jour en temps réel sans déplier.
    func test_bothHeaderSkins_receiveTheFoldedUnreadFromTheList() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationListView.swift"))
        XCTAssertEqual(
            code.components(separatedBy: "foldedUnread: foldedUnread(of: group)").count - 1, 2,
            "LentilleSticker ET SectionHeaderView doivent recevoir `foldedUnread(of: group)`."
        )
        XCTAssertTrue(
            code.contains("SectionFoldedUnread.count(") && code.contains("\\.userState.unreadCount"),
            "Le compte se lit sur `userState.unreadCount` via `SectionFoldedUnread.count` — jamais recalculé ailleurs."
        )
    }

    func test_bothHeaderSkins_drawTheSharedBadgeAndSpeakTheCount() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        for path in [
            "Meeshy/Features/Main/Lentille/Chrome/LentilleSticker.swift",
            "Meeshy/Features/Main/Views/ConversationListHelpers.swift",
        ] {
            let code = AppSourceGuard.stripComments(
                try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8)
            )
            XCTAssertTrue(code.contains("UnreadCountBadge(count: foldedUnread"), "\(path) : la pastille partagée n'est pas montée")
            XCTAssertTrue(
                code.contains("SectionFoldedUnread.accessibilityValue(isExpanded: isExpanded, foldedUnread: foldedUnread)"),
                "\(path) : VoiceOver ne lit pas le compte de la section repliée"
            )
        }
    }
}
