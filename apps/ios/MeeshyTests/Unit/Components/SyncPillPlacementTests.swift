import XCTest
@testable import Meeshy

/// **La pastille de synchronisation se pose au-dessus de la barre de
/// composition, et suit le clavier avec elle** (#10840, retour porteur
/// 2026-10-16 : « déplace la pastille plus bas au niveau de la universal
/// composer bar — lorsque la barre remonte à cause du clavier, il faut remonter
/// la pastille aussi, et quand ça descend, redescendre »). La règle supplante la
/// pose haute de #10371 ; elle se décide toujours à UN endroit pour tous les
/// hôtes (#5835, #5941, #5944).
final class SyncPillPlacementTests: XCTestCase {

    private let homeIndicator: CGFloat = 34
    private let keyboard: CGFloat = 336
    private let composer: CGFloat = 56

    private func pillBottom(keyboard: CGFloat, docked: CGFloat) -> CGFloat {
        SyncPillPlacement.bottomFromScreenEdge(
            safeAreaBottom: homeIndicator, keyboardHeight: keyboard, dockedChromeHeight: docked)
    }

    /// Le haut de la barre, mesuré depuis le bas de l'écran : posée sur le
    /// clavier quand il est levé, sur la zone sûre sinon.
    private func composerTop(keyboard: CGFloat) -> CGFloat {
        max(keyboard, homeIndicator) + composer
    }

    // MARK: - Au repos, clavier ouvert, sans composer

    func test_atRest_thePillSitsJustAboveTheComposer() {
        let gap = pillBottom(keyboard: 0, docked: composer) - composerTop(keyboard: 0)

        XCTAssertEqual(gap, SyncPillPlacement.gapAboveChrome)
    }

    /// La pastille et la barre montent du MÊME pas : l'écart entre elles ne
    /// change pas quand le clavier se lève.
    func test_withTheKeyboardOpen_thePillRisesWithTheComposer() {
        let rest = pillBottom(keyboard: 0, docked: composer)
        let lifted = pillBottom(keyboard: keyboard, docked: composer)

        XCTAssertEqual(lifted - rest, composerTop(keyboard: keyboard) - composerTop(keyboard: 0))
        XCTAssertEqual(lifted - composerTop(keyboard: keyboard), SyncPillPlacement.gapAboveChrome)
    }

    /// Liste racine (iPhone, iPad) : aucun chrome bas ne se déclare, la pastille
    /// se pose au ras de la zone sûre — et sur le clavier s'il se lève.
    func test_withoutComposer_thePillSitsOnTheBottomEdgeAndFollowsTheKeyboard() {
        XCTAssertEqual(pillBottom(keyboard: 0, docked: 0), homeIndicator + SyncPillPlacement.gapAboveChrome)
        XCTAssertEqual(pillBottom(keyboard: keyboard, docked: 0), keyboard + SyncPillPlacement.gapAboveChrome)
    }

    /// Le point de montage se pose contre le bord bas que SwiftUI soulève déjà
    /// avec le clavier : il n'ajoute que la hauteur du chrome et l'écart.
    func test_bottomPadding_isTheChromeHeightPlusTheGap() {
        XCTAssertEqual(SyncPillPlacement.bottomPadding(dockedChromeHeight: composer),
                       composer + SyncPillPlacement.gapAboveChrome)
        XCTAssertEqual(SyncPillPlacement.bottomPadding(dockedChromeHeight: -12),
                       SyncPillPlacement.gapAboveChrome)
    }

    /// « Un petit écart » : la pastille se lit comme posée SUR la barre, sans
    /// la toucher ni flotter loin d'elle.
    func test_gapAboveChrome_isSmall() {
        XCTAssertGreaterThanOrEqual(SyncPillPlacement.gapAboveChrome, 4)
        XCTAssertLessThanOrEqual(SyncPillPlacement.gapAboveChrome, 12)
    }

    // MARK: - Ce que le chrome bas déclare

    /// La barre déclare sa hauteur mesurée, plus l'air que son hôte laisse sous
    /// elle — jamais moins l'encart que rapporte sa mesure : la pile de la
    /// conversation s'arrête au bord sûr alors que son lecteur rapporte 34 pt
    /// (mesuré le 2026-10-16), et le retrancher posait la pastille SUR la barre.
    func test_dockedHeight_isTheMeasuredHeightPlusTheHostLift() {
        XCTAssertEqual(SyncPillPlacement.dockedHeight(measuredHeight: 107), 107)
        XCTAssertEqual(SyncPillPlacement.dockedHeight(measuredHeight: 52, liftAboveEdge: 8), 60)
        XCTAssertEqual(SyncPillPlacement.dockedHeight(measuredHeight: -3), 0)
    }

    /// Un chrome posé au-dessus du bord (lecteur de story, qui se décolle de
    /// 20 pt de la zone sûre) déclare la distance de son haut au bord.
    func test_dockedHeight_fromTheChromeTop_measuresAboveTheKeyboardAwareEdge() {
        XCTAssertEqual(SyncPillPlacement.dockedHeight(chromeTopFromScreenBottom: 130,
                                                      safeAreaBottom: 34, keyboardHeight: 0), 96)
        XCTAssertEqual(SyncPillPlacement.dockedHeight(chromeTopFromScreenBottom: 400,
                                                      safeAreaBottom: 34, keyboardHeight: 336), 64)
        XCTAssertEqual(SyncPillPlacement.dockedHeight(chromeTopFromScreenBottom: 10,
                                                      safeAreaBottom: 34, keyboardHeight: 0), 0)
    }

    // MARK: - Qui déclare : le dernier écran monté

    func test_claims_withoutAnyClaim_dockOnTheBottomEdge() {
        XCTAssertEqual(SyncPillDockClaims().height, 0)
    }

    /// Une conversation poussée sur une autre, un lecteur de story ouvert sur
    /// une conversation : le DERNIER écran monté décide.
    func test_claims_theLatestClaimWins_andARelease_fallsBackToThePrevious() {
        var claims = SyncPillDockClaims()
        claims.claim("conversation.A", height: 56)
        claims.claim("story", height: 96)
        XCTAssertEqual(claims.height, 96)

        claims.release("story")
        XCTAssertEqual(claims.height, 56)

        claims.release("conversation.A")
        XCTAssertEqual(claims.height, 0)
    }

    /// La barre qui grandit d'une ligne met sa déclaration à jour SANS passer
    /// devant l'écran monté après elle.
    func test_claims_anUpdate_keepsItsRank() {
        var claims = SyncPillDockClaims()
        claims.claim("conversation.A", height: 56)
        claims.claim("story", height: 96)
        claims.claim("conversation.A", height: 80)

        XCTAssertEqual(claims.height, 96)
        claims.release("story")
        XCTAssertEqual(claims.height, 80)
    }

    /// Une mesure qui ne bouge que d'une fraction de point ne republie rien :
    /// la pastille ne se réévalue pas à chaque image d'une animation.
    func test_claims_roundToTheHalfPoint() {
        var claims = SyncPillDockClaims()
        claims.claim("conversation.A", height: 56.1)
        let before = claims
        claims.claim("conversation.A", height: 56.2)

        XCTAssertEqual(claims, before)
    }

    // MARK: - La taille

    @MainActor
    private func entry(_ id: String) -> SyncPillEntry {
        SyncPillEntry(id: id, label: id, iconName: nil, dotStyle: .brand, source: nil)
    }

    /// « Je veux que la taille du syncPill soit diminuée ! Et la taille actuelle
    /// doit être affichée UNIQUEMENT lorsqu'on a des frappes d'amis en cours
    /// dans les conversations communes » (#10893, porteur 2026-10-17).
    @MainActor
    func test_withoutTyping_thePillIsCompact() {
        let entries = [entry("outbox.1"), entry("offline")]

        XCTAssertEqual(SyncPillMetrics.for(entries: entries), .compact)
    }

    @MainActor
    func test_aTypingEntryAmongOthers_givesTheLargeSize() {
        let entries = [entry("outbox.1"), entry("\(TypingAnnouncementLaw.typingIDPrefix)conv-A")]

        XCTAssertEqual(SyncPillMetrics.for(entries: entries), .typing)
    }

    @MainActor
    func test_whenTheTypingStops_thePillShrinksBack() {
        let typing = [entry("outbox.1"), entry("\(TypingAnnouncementLaw.typingIDPrefix)conv-A")]
        let afterStop = Array(typing.dropLast())

        XCTAssertEqual(SyncPillMetrics.for(entries: typing), .typing)
        XCTAssertEqual(SyncPillMetrics.for(entries: afterStop), .compact)
    }

    /// Compacte = la pastille d'avant #10371 (22 pt) ; frappe = la taille
    /// agrandie de #10371 (≈ 1,6 × 22 pt).
    func test_compactIsTheFormerPill_andTypingIsAboutOnePointSixTimesIt() {
        XCTAssertEqual(SyncPillMetrics.compact.height, 22)
        XCTAssertEqual(SyncPillMetrics.typing.height / SyncPillMetrics.compact.height, 1.6, accuracy: 0.05)
    }

    /// La hauteur déclarée est celle que les mesures rendent : une ligne de texte
    /// (≈ 1,2 × la taille de police) et la marge verticale des deux côtés.
    func test_height_matchesTheRenderedMeasures_forBothSizes() {
        for metrics in [SyncPillMetrics.compact, .typing] {
            let line = (metrics.labelSize * 1.2).rounded()
            XCTAssertEqual(line + 2 * metrics.verticalPadding, metrics.height, accuracy: 1.5)
        }
    }
}
