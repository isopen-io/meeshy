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
// 2026-08-13 (soir) → 2026-08-14 (soir) : la parenthèse « exclusion mutuelle »
// (pill visible seulement pendant le défilement, header flottant effacé en
// retour) est CLOSE sur retour user — « remets la gestion des dates et
// l'affichage du header comme c'était avant hier soir ». La pill retrouve son
// offset de 60pt, qui la pose sous la rangée du header, et le header retrouve
// sa présence permanente. Ce qui RESTE de la parenthèse : le signal de
// défilement actif, qui efface les seuls BOUTONS D'ACTION du header le temps
// du mouvement — loi commune `ScrollMotion`, généralisée à l'app.
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

        // Recalibré — déplacé par `050e15f4` (« le fil court jusqu'au bord bas
        // physique »), l'invariant est inchangé : la liste ignore la safe area
        // du CONTENEUR sur le bord HAUT. Ce commit a étendu l'ignorance au bord
        // BAS (`edges: .top` → `edges: [.top, .bottom]`) pour la raison
        // symétrique, constatée sur device : borné à la safe area basse, le
        // représentable coupait les messages ~34 pt AVANT le bord physique —
        // visible dès que le chrome s'escamote. Chercher `edges: .top`
        // LITTÉRALEMENT décrivait la liste de bords d'hier, pas la propriété.
        // On lit donc l'argument `edges:` et on exige qu'il CONTIENNE `.top` :
        // reste faux si le bord haut disparaît, reste vrai que le bord bas
        // l'accompagne ou non.
        guard let edgesStart = listBlock.range(of: "ignoresSafeArea(.container, edges:"),
              let edgesEnd = listBlock.range(of: ")", range: edgesStart.upperBound..<listBlock.endIndex) else {
            return XCTFail(
                "Le flux de messages n'appelle plus `ignoresSafeArea(.container, edges:)` — sans lui, la " +
                "bande status bar / Dynamic Island ne montre que le fond, une couleur unie jusqu'au bord."
            )
        }
        let edges = listBlock[edgesStart.upperBound..<edgesEnd.lowerBound]
        XCTAssertTrue(
            edges.contains(".top"),
            "Le flux de messages doit s'étendre sous la safe area haute pour que " +
            "les bulles traversent la zone status bar / Dynamic Island — sans ça " +
            "cette bande ne montre que le fond, une couleur unie jusqu'au bord. " +
            "Bords déclarés : `\(edges.trimmingCharacters(in: .whitespacesAndNewlines))`."
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

    func test_stickyDayPillOffset_clearsTheFloatingHeaderRow() {
        // 60 = padding haut du header (8) + rangée de contrôles (~44) + marge
        // (8). C'est cet offset — et non une exclusion mutuelle — qui empêche
        // le chevauchement signalé le 2026-08-12 : les deux sont visibles en
        // même temps, chacun dans sa bande.
        XCTAssertEqual(MessageDayStickyPlacement.topOffset, 60,
                       "la pill sticky doit démarrer SOUS la rangée du header flottant")
    }

    // MARK: - Boutons d'action effacés pendant le mouvement

    func test_floatingHeader_staysVisibleWhileScrolling() throws {
        let viewSource = try conversationViewSource()
        XCTAssertFalse(
            viewSource.contains("hidesFloatingHeaderForScroll"),
            "Le header flottant ne doit plus disparaître en bloc pendant le " +
            "défilement : retour, avatar et titre restent lisibles (retour " +
            "user 2026-08-14). Seuls ses boutons d'action s'effacent."
        )
    }

    func test_headerActionButtons_fadeDuringActiveScroll() throws {
        let controllerSource = try messageListControllerSource()
        XCTAssertTrue(
            controllerSource.contains("var onScrollingActiveChanged: ((Bool) -> Void)?"),
            "MessageListViewController doit exposer le défilement actif au " +
            "parent SwiftUI — c'est le signal qui efface les boutons d'action."
        )

        let viewSource = try conversationViewSource()
        XCTAssertTrue(
            viewSource.contains(".scrollMotionActive(hidesHeaderActionsForScroll)"),
            "Le header doit PUBLIER le mouvement via la loi commune " +
            "`ScrollMotion` plutôt que de câbler son propre fondu."
        )
        XCTAssertTrue(
            viewSource.contains(".hiddenWhileScrolling()"),
            "La grappe de boutons d'action (appel + recherche) doit s'y abonner."
        )
    }

    // MARK: - La règle, sans passer par le rendu

    func test_hidesHeaderActions_whileScrolling_isTrue() {
        XCTAssertTrue(ConversationView.hidesHeaderActions(isScrollingList: true, isSearchOpen: false))
    }

    func test_hidesHeaderActions_atRest_isFalse() {
        XCTAssertFalse(ConversationView.hidesHeaderActions(isScrollingList: false, isSearchOpen: false))
    }

    /// La barre de recherche ouverte est un champ de SAISIE : elle doit rester
    /// joignable pendant qu'on fait défiler les résultats.
    func test_hidesHeaderActions_whileSearchingAndScrolling_isFalse() {
        XCTAssertFalse(ConversationView.hidesHeaderActions(isScrollingList: true, isSearchOpen: true))
    }
}
