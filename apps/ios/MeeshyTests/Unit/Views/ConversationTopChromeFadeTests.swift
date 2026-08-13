import XCTest
@testable import Meeshy

// MARK: - Conversation Top Chrome — pas de scrim status bar + pill sticky de jour

// 2026-08-12 — retours user successifs (captures à l'appui) :
// 1. Les tuiles de jour transparaissaient dans la zone status bar / Dynamic
//    Island → un scrim noir plein y a d'abord été posé… puis RETIRÉ le jour
//    même (« il faut juste enlever la barre noire de la status bar ») : la
//    conversation reste immersive, AUCUN scrim au-dessus de la liste.
// 2. La pill sticky de jour vivait à safeArea+4, sous l'îlot et la rangée du
//    header flottant — elle démarre désormais SOUS le header
//    (MessageDayStickyPlacement.topOffset).
//
// 2026-08-13 — suite : la pill doit se poser plus haut, tout près de
// l'encoche, avec une animation d'émergence/rétraction dans l'îlot au
// changement de jour. Un grand offset fixe ne peut plus dégager le header en
// même temps que se poser près de l'encoche — remplacé par une EXCLUSION
// MUTUELLE : la pill ne s'affiche que pendant le défilement actif de la
// liste, moment où le header flottant s'efface (voir
// `test_stickyDayPill_hidesFloatingHeaderDuringActiveScroll`).
@MainActor
final class ConversationTopChromeFadeTests: XCTestCase {

    private func viewsDirectory() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Views")
    }

    private func conversationViewSource() throws -> String {
        try String(
            contentsOf: viewsDirectory().appendingPathComponent("ConversationView.swift"),
            encoding: .utf8
        )
    }

    private func messageListControllerSource() throws -> String {
        try String(
            contentsOf: viewsDirectory().appendingPathComponent("MessageListViewController.swift"),
            encoding: .utf8
        )
    }

    // MARK: - Pas de scrim status bar

    func test_statusBarScrim_staysRemoved() throws {
        let source = try conversationViewSource()
        XCTAssertFalse(
            source.contains("TopBarBottomFade"),
            "ConversationView must NOT mount a status-bar scrim — the solid " +
            "black band was explicitly removed (user feedback 2026-08-12: " +
            "« il faut juste enlever la barre noire de la status bar »). " +
            "TopBarBottomFade belongs to the call banner only."
        )
        XCTAssertFalse(
            source.contains("Color.black.opacity(0.75), location: 0"),
            "The old ad-hoc translucent scrim stops (0.75 → 0.4 → clear) must " +
            "not come back either — no dark band over the status-bar strip."
        )
    }

    // MARK: - Flux de messages jusqu'au bord haut de l'écran

    // 3e retour du 2026-08-12 : « enlever la couleur unie derrière dynamic
    // island pour avoir de la transparence jusqu'en bordure d'écran comme sur
    // les autres vues ». Le scrim retiré, il restait la bande de fond plate :
    // la liste (UIViewControllerRepresentable) était posée DANS la safe area,
    // donc aucun message ne traversait la zone îlot — juste le dégradé de
    // fond, uniforme. Les autres écrans (CollapsibleHeader) laissent leur
    // contenu défiler sous un verre translucide jusqu'au bord. La liste doit
    // donc s'étendre sous la safe area haute.
    func test_messageList_extendsUnderTopSafeArea() throws {
        let source = try conversationViewSource()
        guard let listStart = source.range(of: "MessageListView("),
              let listEnd = source.range(of: "floatingHeaderSection", range: listStart.upperBound..<source.endIndex) else {
            return XCTFail("MessageListView introuvable dans ConversationView")
        }
        let listBlock = String(source[listStart.lowerBound..<listEnd.lowerBound])
        XCTAssertTrue(
            listBlock.contains("ignoresSafeArea(.container, edges: .top)"),
            "Le flux de messages doit s'étendre sous la safe area haute pour que " +
            "les bulles traversent la zone status bar / Dynamic Island — sans ça " +
            "cette bande ne montre que le fond, une couleur unie jusqu'au bord."
        )
        XCTAssertTrue(
            listBlock.contains("topInset: previewMode ? 0 : DeviceLayout.safeAreaTop"),
            "Sous `ignoresSafeArea`, ni le GeometryReader ni le contrôleur " +
            "hébergé ne connaissent l'inset haut : il doit venir de la fenêtre."
        )
    }

    func test_messageListController_ownsItsInsetsExplicitly() throws {
        let source = try messageListControllerSource()
        XCTAssertTrue(
            source.contains("contentInsetAdjustmentBehavior = .never"),
            "La liste est inversée (scaleY: -1) : l'ajustement automatique de " +
            "UIKit poserait la safe area haute du mauvais côté. Les inserts " +
            "sont gérés explicitement."
        )
        XCTAssertTrue(
            source.contains("func applyTopInset(_ inset: CGFloat)"),
            "Le repos du flux doit réserver la hauteur de la bande îlot — le " +
            "contenu la TRAVERSE au défilement, il ne s'y arrête qu'au repos."
        )
        XCTAssertFalse(
            source.contains("view.safeAreaInsets.top"),
            "L'inset haut ne doit JAMAIS être relu sur la vue : sous " +
            "`ignoresSafeArea` SwiftUI ne le propage plus au contrôleur hébergé."
        )
    }

    // MARK: - Pill sticky de jour

    func test_stickyDayPill_isAnchoredBelowFloatingHeader() throws {
        let source = try messageListControllerSource()
        XCTAssertTrue(
            source.contains("constant: topInset + MessageDayStickyPlacement.topOffset"),
            "The sticky day pill must be anchored with the named " +
            "MessageDayStickyPlacement.topOffset — the bare `constant: 4` put " +
            "it under the Dynamic Island / Live Activity band and over the " +
            "floating header row (user feedback 2026-08-12). Depuis que la vue " +
            "court jusqu'au bord haut de l'écran, l'ancre part du haut de la " +
            "vue et l'offset inclut `topInset` — même position à l'écran."
        )
    }

    func test_stickyDayPillOffset_staysAtTheNotch() {
        // 2026-08-13 : le fix du 12/08 (offset fixe à 60pt pour dégager la
        // rangée du header) est remplacé par une exclusion mutuelle — la pill
        // ne s'affiche QUE pendant le défilement actif, moment où le header
        // flottant s'efface (`hidesFloatingHeaderForScroll`). Ils ne se
        // chevauchent donc plus jamais, quel que soit l'offset, qui peut
        // redescendre au ras de l'encoche. `IslandEmergingBanner` porte déjà
        // son propre dégagement sous l'îlot (`IslandGeometry.clearanceBelow`) — cumuler un
        // second offset ici repousserait la pill trop bas.
        XCTAssertEqual(MessageDayStickyPlacement.topOffset, 0,
                       "la pill sticky doit démarrer au ras de l'encoche, sans offset supplémentaire")
    }

    func test_stickyDayPill_hidesFloatingHeaderDuringActiveScroll() throws {
        let controllerSource = try messageListControllerSource()
        XCTAssertTrue(
            controllerSource.contains("var onScrollingActiveChanged: ((Bool) -> Void)?"),
            "MessageListViewController doit exposer le défilement actif au " +
            "parent SwiftUI — c'est le signal qui pilote l'exclusion mutuelle " +
            "avec le header flottant."
        )
        XCTAssertTrue(
            controllerSource.contains("stickyDayState.isScrollingActive = active"),
            "La pill sticky ne doit être éligible à l'affichage que pendant le défilement actif."
        )

        let viewSource = try conversationViewSource()
        XCTAssertTrue(
            viewSource.contains("scrollState.isScrollingActiveList && !headerState.showSearch"),
            "Le header flottant doit s'effacer pendant le défilement actif " +
            "(sauf recherche ouverte) pour ne jamais chevaucher la pill " +
            "sticky de jour."
        )
    }
}
