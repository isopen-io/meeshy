import XCTest
@testable import Meeshy

/// **La frappe s'annonce, la pastille ne grossit plus** (issue #4066, directive
/// porteur 2026-08-28).
///
/// L'accentuation avait été reprise TROIS fois en dix jours — pulse fixe
/// (#4018), liée à la durée du signal (#4026), fenêtre réarmable (#4050). Ce
/// lot ne règle pas une quatrième fois : il change de porteur.
@MainActor
final class TypingAnnouncementLawTests: XCTestCase {

    private func entry(_ id: String, label: String = "@alice") -> SyncPillEntry {
        SyncPillEntry(id: id, label: label, iconName: nil, dotStyle: .brand, source: nil)
    }

    // MARK: - Ce qui s'annonce

    func test_announcement_picksATypingEntry() {
        let found = TypingAnnouncementLaw.announcement(among: [entry("typing.c1")])

        XCTAssertEqual(found?.id, "typing.c1")
    }

    /// Un envoi en file ou une reconnexion sont des faits de SYNCHRONISATION :
    /// la pastille les dit déjà, et les faire émerger de l'île donnerait à un
    /// accusé de réception la solennité d'une annonce.
    func test_announcement_ignoresEverythingThatIsNotTyping() {
        let found = TypingAnnouncementLaw.announcement(among: [
            entry("outbox.m1"), entry("status.reconnecting")
        ])

        XCTAssertNil(found)
    }

    /// Deux capsules qui se succéderaient dans l'île en moins de quatre
    /// secondes se liraient comme un clignotement, pas comme deux annonces.
    func test_announcement_keepsOnlyTheMostRecent_neverAQueue() {
        let found = TypingAnnouncementLaw.announcement(among: [
            entry("typing.c1", label: "@alice"),
            entry("typing.c2", label: "@bob")
        ])

        XCTAssertEqual(found?.label, "@bob")
    }

    func test_announcement_withoutAnyNewEntry_isNil() {
        XCTAssertNil(TypingAnnouncementLaw.announcement(among: []))
    }

    // MARK: - La taille POSÉE

    /// Le composant dérive de cette taille l'échelle et l'offset de NAISSANCE.
    /// Son doc-comment nomme lui-même le mode d'échec : « une taille fausse
    /// déplace la naissance hors de l'île ».
    func test_settledSize_addsThePaddingOnBothAxes() {
        let size = TypingAnnouncementLaw.settledSize(labelWidth: 100, lineHeight: 14, maxWidth: 320)

        XCTAssertEqual(size.width, 100 + 2 * TypingAnnouncementLaw.horizontalPadding)
        XCTAssertEqual(size.height, 14 + 2 * TypingAnnouncementLaw.verticalPadding)
    }

    /// Un pseudonyme très long ne doit pas faire naître une capsule plus large
    /// que l'écran.
    func test_settledSize_isBoundedByTheAvailableWidth() {
        let size = TypingAnnouncementLaw.settledSize(labelWidth: 5000, lineHeight: 14, maxWidth: 320)

        XCTAssertEqual(size.width, 320)
    }

    /// Une mesure absente vaut zéro, jamais une valeur négative : le composant
    /// divise par cette taille pour son ratio d'échelle.
    func test_settledSize_neverGoesNegative() {
        let size = TypingAnnouncementLaw.settledSize(labelWidth: -40, lineHeight: -10, maxWidth: 320)

        XCTAssertEqual(size.width, 2 * TypingAnnouncementLaw.horizontalPadding)
        XCTAssertEqual(size.height, 2 * TypingAnnouncementLaw.verticalPadding)
    }

    // MARK: - Les deux durées sont distinctes, et c'est le fond de l'affaire

    /// L'annonce dit « quelqu'un vient de commencer » ; la pastille, sous sa
    /// forme normale, porte « quelqu'un écrit encore ». Confondre les deux est
    /// exactement ce que l'accentuation faisait.
    func test_theAnnouncementIsShorterThanThePillsOwnRest() {
        XCTAssertLessThan(TypingAnnouncementLaw.visibleDuration, 6.0)
    }
}
