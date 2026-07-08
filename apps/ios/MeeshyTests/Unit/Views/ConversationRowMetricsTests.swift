import XCTest
import CoreGraphics
import MeeshyUI
@testable import Meeshy

/// `ConversationRowMetrics.avatarInteractionExclusionWidth` — la bande avant
/// de la ligne où les gestes tap/long-press de la LIGNE sont inertes : les
/// interactions y appartiennent à l'avatar (tap story/profil, badge mood,
/// menu contextuel). Un appui maintenu sur l'avatar ne doit pas ouvrir le
/// menu de la ligne.
@MainActor
final class ConversationRowMetricsTests: XCTestCase {

    func test_avatarExclusion_coversRowPaddingAndAvatarRing() {
        XCTAssertGreaterThanOrEqual(
            ConversationRowMetrics.avatarInteractionExclusionWidth,
            MeeshySpacing.md + AvatarContext.conversationList.ringSize
        )
    }

    func test_avatarExclusion_pinnedValue_guardsAgainstSilentAvatarResize() {
        // 12 (padding horizontal ligne) + 58 (avatar 52 + anneau story 6).
        // Si l'avatar de la liste change de taille, ce test force à
        // re-vérifier que la zone d'exclusion reste alignée visuellement.
        XCTAssertEqual(ConversationRowMetrics.avatarInteractionExclusionWidth, 70)
    }
}
