import XCTest
import MeeshySDK
@testable import Meeshy

/// F-083bis (arbitrage sur F-082 point 2) — `FocalMediaProtection.state(for:isRevealed:)` :
/// décision PURE, testable sans rendu (contrat §7-R15 : « aucun snapshot,
/// aucun test de rendu »). Preuve du critère « la grille floutée ne rend
/// pas l'image nette » : `FocalGridCell.body` (garde source,
/// `FocalRichBlockEquatableTests`) ne rend `mediaLayer` QUE quand cette
/// fonction retourne `.none` — la fonction elle-même est vérifiée ici.
final class FocalMediaProtectionTests: XCTestCase {

    private func attachment(isBlurred: Bool = false, isViewOnce: Bool = false, viewOnceCount: Int = 0) -> MeeshyMessageAttachment {
        var att = MeeshyMessageAttachment(id: "a1", fileName: "a", originalName: "a", mimeType: "image/jpeg", fileSize: 1)
        att.isBlurred = isBlurred
        att.isViewOnce = isViewOnce
        att.viewOnceCount = viewOnceCount
        return att
    }

    // MARK: - state(for:isRevealed:)

    func test_plainAttachment_isNeverProtected() {
        XCTAssertEqual(FocalMediaProtection.state(for: attachment(), isRevealed: false), .none)
        XCTAssertEqual(FocalMediaProtection.state(for: attachment(), isRevealed: true), .none)
    }

    func test_blurredAttachment_notRevealed_isBlurredNotViewOnce() {
        let state = FocalMediaProtection.state(for: attachment(isBlurred: true), isRevealed: false)
        XCTAssertEqual(state, .blurred(isViewOnce: false))
    }

    func test_viewOnceAttachment_notRevealed_isBlurredViewOnce() {
        let state = FocalMediaProtection.state(for: attachment(isViewOnce: true), isRevealed: false)
        XCTAssertEqual(state, .blurred(isViewOnce: true))
    }

    /// isBlurred ET isViewOnce ensemble : le libellé isViewOnce l'emporte
    /// (miroir de `AttachmentBlurOverlayView.isViewOnce ? ... : ...`).
    func test_blurredAndViewOnce_notRevealed_labelPrefersViewOnce() {
        let state = FocalMediaProtection.state(for: attachment(isBlurred: true, isViewOnce: true), isRevealed: false)
        XCTAssertEqual(state, .blurred(isViewOnce: true))
    }

    /// « La grille floutée ne rend pas l'image nette » — révélé ⇒ `.none`,
    /// quel que soit `isBlurred`/`isViewOnce` d'origine.
    func test_revealed_alwaysNone_evenIfOriginallyBlurredOrViewOnce() {
        XCTAssertEqual(FocalMediaProtection.state(for: attachment(isBlurred: true), isRevealed: true), .none)
        XCTAssertEqual(FocalMediaProtection.state(for: attachment(isViewOnce: true), isRevealed: true), .none)
        XCTAssertEqual(FocalMediaProtection.state(for: attachment(isBlurred: true, isViewOnce: true), isRevealed: true), .none)
    }

    // MARK: - showsViewOnceBadge(for:)

    func test_viewOnceBadge_hiddenWhenNotViewOnce() {
        XCTAssertFalse(FocalMediaProtection.showsViewOnceBadge(for: attachment(viewOnceCount: 3)))
    }

    func test_viewOnceBadge_hiddenWhenCountIsZero() {
        XCTAssertFalse(FocalMediaProtection.showsViewOnceBadge(for: attachment(isViewOnce: true, viewOnceCount: 0)))
    }

    /// « Vue unique porte son badge » — le critère de la tâche.
    func test_viewOnceBadge_shownWhenViewOnceAndCountPositive() {
        XCTAssertTrue(FocalMediaProtection.showsViewOnceBadge(for: attachment(isViewOnce: true, viewOnceCount: 1)))
    }

    /// Le badge de compte reste affiché même une fois révélé — même règle
    /// que la source réelle (`viewCountBadge` ne dépend pas de `isRevealed`).
    func test_viewOnceBadge_isIndependentOfRevealState() {
        let att = attachment(isViewOnce: true, viewOnceCount: 2)
        XCTAssertTrue(FocalMediaProtection.showsViewOnceBadge(for: att))
        XCTAssertEqual(FocalMediaProtection.state(for: att, isRevealed: true), .none)
        XCTAssertTrue(FocalMediaProtection.showsViewOnceBadge(for: att), "le badge de compte n'est pas gouverné par isRevealed")
    }
}
