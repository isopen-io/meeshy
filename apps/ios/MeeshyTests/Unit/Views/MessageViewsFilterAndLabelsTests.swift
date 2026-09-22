import XCTest
@testable import Meeshy

/// #7366 — la fiche « Vu par » s'ouvrait toujours sur « Envoyé », et composait
/// ses bandeaux et ses erreurs en français sans accents, servis tels quels aux
/// six autres langues.
///
/// Les libellés se résolvent contre la table `.lproj` de CHAQUE langue (idiome
/// `MembersCountLabelTests`) : le témoin ne dépend pas de la langue du
/// simulateur, et il tombe si une clé manque ou retombe sur le français.
@MainActor
final class MessageViewsFilterAndLabelsTests: XCTestCase {

    private static let languages = ["fr", "en", "es", "it", "de", "pt-BR", "ar"]

    private func bundle(_ code: String) throws -> Bundle {
        let path = try XCTUnwrap(
            Bundle.main.path(forResource: code, ofType: "lproj"),
            "localisation « \(code) » absente du bundle"
        )
        return try XCTUnwrap(Bundle(path: path))
    }

    // MARK: - Onglet d'ouverture

    func test_initial_withAReader_opensOnRead() {
        XCTAssertEqual(
            MessageViewsFilter.initial(readCount: 1, deliveredCount: 10, showReadReceipts: true), .read)
    }

    func test_initial_deliveredButUnread_opensOnDelivered() {
        XCTAssertEqual(
            MessageViewsFilter.initial(readCount: 0, deliveredCount: 3, showReadReceipts: true), .delivered)
    }

    func test_initial_nobodyServed_opensOnSent() {
        XCTAssertEqual(
            MessageViewsFilter.initial(readCount: 0, deliveredCount: 0, showReadReceipts: true), .sent)
    }

    /// Qui cache ses accusés ne voit « Lu » nulle part — la fiche ne s'ouvre
    /// pas dessus ; un lecteur a néanmoins reçu, donc « Distribué ».
    func test_initial_readReceiptsHidden_neverOpensOnRead() {
        XCTAssertEqual(
            MessageViewsFilter.initial(readCount: 4, deliveredCount: 0, showReadReceipts: false), .delivered)
    }

    // MARK: - Libellés, sept langues

    func test_bannersAndErrors_areServedInEachLanguage_notInFrench() throws {
        let french = try bundle("fr")
        let compose: [(Bundle) -> String] = [
            { MessageViewsLabels.deliveredBanner(receivedCount: 5, totalMembers: 5, bundle: $0) },
            { MessageViewsLabels.readBanner(readCount: 5, totalMembers: 5, bundle: $0) },
            { MessageViewsLabels.loadFailure(.server, bundle: $0) },
            { MessageViewsLabels.loadFailure(.connection, bundle: $0) }
        ]
        for code in Self.languages where code != "fr" {
            let table = try bundle(code)
            for label in compose {
                XCTAssertNotEqual(label(table), label(french), "« \(label(french)) » servi en français à « \(code) »")
                XCTAssertFalse(label(table).hasPrefix("message-detail."), "clé brute servie à « \(code) »")
            }
        }
    }

    func test_banners_distinguishAllFromSome() throws {
        let en = try bundle("en")
        XCTAssertEqual(MessageViewsLabels.deliveredBanner(receivedCount: 5, totalMembers: 5, bundle: en), "Delivered to everyone")
        XCTAssertEqual(MessageViewsLabels.deliveredBanner(receivedCount: 2, totalMembers: 5, bundle: en), "Delivered")
        XCTAssertEqual(MessageViewsLabels.readBanner(readCount: 5, totalMembers: 5, bundle: en), "Read by everyone")
        XCTAssertEqual(MessageViewsLabels.readBanner(readCount: 2, totalMembers: 5, bundle: en), "Read")
    }

    func test_frenchBanner_carriesItsAccents() throws {
        XCTAssertEqual(
            MessageViewsLabels.deliveredBanner(receivedCount: 3, totalMembers: 3, bundle: try bundle("fr")),
            "Distribué à tous")
    }

    /// Les libellés de la carte méta (ID, Type, Langue, Chiffrement…) étaient
    /// eux aussi en dur ; leurs clés doivent être servies hors du français.
    func test_metaLabels_areServedOutsideFrench() throws {
        let keys = ["message-detail.meta.language", "message-detail.meta.encryption",
                    "message-detail.meta.attachments", "message-detail.meta.reply-to",
                    "message-detail.meta.modified", "message-detail.meta.encryption-yes"]
        let french = try bundle("fr"), german = try bundle("de")
        for key in keys {
            let fr = french.localizedString(forKey: key, value: nil, table: "Localizable")
            let de = german.localizedString(forKey: key, value: nil, table: "Localizable")
            XCTAssertNotEqual(fr, key, "clé « \(key) » absente du catalogue")
            XCTAssertNotEqual(de, fr, "« \(key) » servie en français à l'allemand")
        }
    }
}
