import XCTest
import UIKit
import MeeshySDK
@testable import Meeshy

/// **En Focal, seul le contenu de l'élu grandit, ses contrôles répondent au
/// premier toucher, et un flou se lève d'un toucher** (#8537, directive porteur
/// 2026-09-28).
///
/// Trois défauts, trois causes :
/// - la loupe se posait sur le calque de la cellule ENTIÈRE
///   (`FocalScrollPerspective.magnifyElected`) : identité, date, drapeaux et
///   réactions grandissaient avec le texte ;
/// - la bande basse du cadre (drapeaux, pastille de langue, réactions, date)
///   est une superposition posée SOUS le contenu, donc HORS des bornes de la
///   cellule : UIKit ne remet un toucher qu'à la vue dont les bornes le
///   contiennent — celui-là partait à la voisine du dessous, et rien ne se
///   passait ;
/// - un message flouté révélé gardait, sur chacune de ses pièces floutées, le
///   voile « Contenu masqué » de la case : un second toucher pour voir, un
///   troisième pour le plein écran.
final class FocalElectedLoupeTests: XCTestCase {

    private let heights: [CGFloat] = [44, 60, 140, 420]
    private var scales: [CGFloat] {
        [1, FocalScrollPerspective.electedScale(reduceMotion: false, rowWidth: 390), 1 + FocalMetrics.Focus.loupeGain]
    }

    // MARK: - 1. Seul le contenu grandit

    /// Le calque de la cellule ne porte plus que le PASSAGE (translation) :
    /// l'échelle y agrandissait l'identité et les contrôles avec le contenu.
    @MainActor
    func test_poseElectionPassage_onTheElectedCell_neverScalesItsLayer() {
        let layer = CALayer()
        layer.bounds = CGRect(x: 0, y: 0, width: 390, height: 60)
        FocalScrollPerspective.poseElectionPassage(layer, shift: 0, animated: false)
        XCTAssertEqual(layer.transform.m11, 1, accuracy: 0.0001, "la cellule élue ne grandit pas : seul son contenu le fait")
        XCTAssertEqual(layer.transform.m22, 1, accuracy: 0.0001)
        FocalScrollPerspective.poseElectionPassage(layer, shift: 14, animated: false)
        XCTAssertEqual(layer.transform.m42, -14, accuracy: 0.0001, "le passage reste posé, dans le repère renversé")
    }

    /// L'identité et la bande gardent leur gabarit d'origine, quelle que soit
    /// la loupe ; le contenu, lui, grandit de l'échelle de l'élu.
    func test_electedGeometry_scalesTheContentOnly() {
        let strip = FocalMetrics.FocusStrip.self
        for head in [true, false] {
            for scale in scales {
                let g = FocalScrollPerspective.electedGeometry(isFirstInGroup: head, cellHeight: 140, contentScale: scale)
                XCTAssertEqual(g.identityChip.bottom - g.identityChip.top, strip.identityChipHeight, accuracy: 0.001, "identité à l'échelle 1")
                XCTAssertEqual(g.strip.bottom - g.strip.top, strip.chipHeight, accuracy: 0.001, "bande à l'échelle 1")
                let unscaled = FocalScrollPerspective.electedGeometry(isFirstInGroup: head, cellHeight: 140, contentScale: 1)
                XCTAssertEqual(g.content.bottom - g.content.top, scale * (unscaled.content.bottom - unscaled.content.top), accuracy: 0.001,
                               "tête=\(head), loupe=\(scale) : le contenu grandit de la loupe")
            }
        }
    }

    // MARK: - 2. Le cadre est aéré en haut ET en bas

    func test_electedGeometry_leavesBreathingAboveAndBelowTheMagnifiedContent() {
        let pad = FocalMetrics.Row.paddingVertical
        let breathing = FocalScrollPerspective.electedContentBreathing
        XCTAssertGreaterThan(breathing, 0, "une respiration visible, en plus de l'espacement de rangée")
        for head in [true, false] {
            for height in heights {
                for scale in scales {
                    let g = FocalScrollPerspective.electedGeometry(isFirstInGroup: head, cellHeight: height, contentScale: scale)
                    let label = "tête=\(head), h=\(height), loupe=\(scale)"
                    XCTAssertGreaterThanOrEqual(g.content.top - g.identityChip.bottom, pad + breathing - 0.001, "\(label) : le contenu colle à l'identité")
                    XCTAssertEqual(g.strip.top - g.content.bottom, FocalMetrics.FocusStrip.stripGap + breathing, accuracy: 0.001, "\(label) : le contenu colle à la bande")
                    XCTAssertEqual(g.identityChip.top - g.card.top, FocalScrollPerspective.electedCardMargin, accuracy: 0.001, "\(label) : marge haute du cadre")
                    XCTAssertEqual(g.card.bottom - g.strip.bottom, FocalScrollPerspective.electedCardMargin, accuracy: 0.001, "\(label) : marge basse du cadre")
                }
            }
        }
    }

    // MARK: - 3. Les contrôles de l'élu reçoivent le toucher

    /// La zone de toucher débordante couvre le cadre entier, dans le repère
    /// UIKit de la cellule — renversé : y = 0 au bas VISUEL, donc ce qui
    /// déborde SOUS la rangée (la bande) est une marge `top`.
    func test_electedTouchOverflow_coversTheWholeCard_inTheFlippedCellSpace() {
        for head in [true, false] {
            for height in heights {
                let g = FocalScrollPerspective.electedGeometry(isFirstInGroup: head, cellHeight: height, contentScale: 1.26)
                let insets = FocalScrollPerspective.electedTouchOverflow(geometry: g, cellHeight: height)
                XCTAssertGreaterThan(g.strip.bottom, height, "la bande vit bien sous la cellule — c'est tout le défaut")
                XCTAssertEqual(insets.top, g.card.bottom - height, accuracy: 0.001, "le bas visuel est le haut UIKit")
                XCTAssertEqual(insets.bottom, max(0, -g.card.top), accuracy: 0.001, "le haut visuel est le bas UIKit")
                XCTAssertEqual(insets.left, 0)
                XCTAssertEqual(insets.right, 0)
            }
        }
    }

    @MainActor
    func test_cell_withATouchOverflow_acceptsATouchOnItsStrip_belowItsBounds() {
        let cell = MessageListCell(frame: CGRect(x: 0, y: 0, width: 390, height: 60))
        let onTheStrip = CGPoint(x: 120, y: -20)
        XCTAssertFalse(cell.point(inside: onTheStrip, with: nil), "sans débord, la bande est hors de la cellule")
        cell.touchOverflow = UIEdgeInsets(top: 40, left: 0, bottom: 0, right: 0)
        XCTAssertTrue(cell.point(inside: onTheStrip, with: nil))
        XCTAssertNotNil(cell.hitTest(onTheStrip, with: nil), "le toucher est remis à la cellule élue")
        XCTAssertFalse(cell.point(inside: CGPoint(x: 120, y: -60), with: nil), "au-delà du cadre, rien")
        cell.touchOverflow = .zero
        XCTAssertFalse(cell.point(inside: onTheStrip, with: nil), "le débord se retire avec l'élection")
    }

    /// UIKit interroge les cellules dans l'ordre de ses sous-vues : la voisine
    /// posée par-dessus gagnait le toucher de la bande. La cellule qui déborde
    /// a le premier mot.
    @MainActor
    func test_theOverflowingCell_getsTheFirstRefusal_overTheNeighbourBeneathItsStrip() {
        let host = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 400))
        let elected = MessageListCell(frame: CGRect(x: 0, y: 200, width: 390, height: 60))
        let neighbour = MessageListCell(frame: CGRect(x: 0, y: 140, width: 390, height: 60))
        host.addSubview(elected)
        host.addSubview(neighbour)
        elected.touchOverflow = UIEdgeInsets(top: 40, left: 0, bottom: 0, right: 0)
        let onTheStrip = CGPoint(x: 120, y: 180)
        XCTAssertTrue(host.hitTest(onTheStrip, with: nil)?.isDescendant(of: neighbour) ?? false, "sans priorité, la voisine prend le toucher")
        let hit = MessageListCollectionView.overflowHit(onTheStrip, in: host, cells: [neighbour, elected], with: nil)
        XCTAssertTrue(hit?.isDescendant(of: elected) ?? false, "la cellule élue reçoit le toucher de sa bande")
        XCTAssertNil(MessageListCollectionView.overflowHit(CGPoint(x: 120, y: 150), in: host, cells: [neighbour, elected], with: nil),
                     "hors du débord, le chemin ordinaire décide")
    }

    // MARK: - 4. La date ouvre les détails du message

    func test_theElectedDate_opensTheMessageDetails_likeTheMenu() throws {
        let row = try normalized("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        let chip = try XCTUnwrap(row.range(of: "private var focusStampChip: some View {"))
        let body = String(row[chip.lowerBound...].prefix(900))
        XCTAssertTrue(body.contains("actions.onShowMessageInfo?(content.messageId)"), "toucher la date ouvre les détails du message")
        let controller = try normalized("Meeshy/Features/Main/Views/MessageListViewController.swift")
        XCTAssertTrue(controller.contains("focalActions.onShowMessageInfo = showInfoHandler"),
                      "le MÊME gestionnaire que « Infos » de la bulle — la feuille de détails, jamais une seconde")
    }

    // MARK: - 5. Un toucher lève le flou

    private func attachment(isBlurred: Bool = false, isViewOnce: Bool = false) -> MeeshyMessageAttachment {
        var att = MeeshyMessageAttachment(id: "a1", fileName: "a", originalName: "a", mimeType: "image/jpeg", fileSize: 1)
        att.isBlurred = isBlurred
        att.isViewOnce = isViewOnce
        return att
    }

    func test_aRevealedMessage_liftsTheBlurOfItsBlurredMedia() {
        XCTAssertEqual(FocalMediaProtection.state(for: attachment(isBlurred: true), isRevealed: false, messageRevealed: true), .none,
                       "le message révélé montre ses images : plus de voile « Contenu masqué » à toucher une seconde fois")
        XCTAssertEqual(FocalMediaProtection.state(for: attachment(isBlurred: true), isRevealed: false, messageRevealed: false), .blurred(isViewOnce: false))
    }

    func test_aRevealedMessage_neverLiftsAViewOnceMedia() {
        XCTAssertEqual(FocalMediaProtection.state(for: attachment(isViewOnce: true), isRevealed: false, messageRevealed: true), .blurred(isViewOnce: true),
                       "la vue unique garde sa règle : elle s'ouvre, elle ne se révèle pas")
    }

    func test_cellTap_revealsThenOpensFullscreen_andTheBlurComesBackBehindIt() {
        let blurred = attachment(isBlurred: true)
        XCTAssertEqual(FocalMediaProtection.tap(on: blurred, isRevealed: false, messageRevealed: false), .reveal, "un toucher révèle sur place")
        XCTAssertEqual(FocalMediaProtection.tap(on: blurred, isRevealed: true, messageRevealed: false), .openFullscreen(reblurs: true),
                       "le suivant ouvre le plein écran, et le flou revient derrière lui")
        XCTAssertEqual(FocalMediaProtection.tap(on: blurred, isRevealed: false, messageRevealed: true), .openFullscreen(reblurs: false),
                       "une pièce que le MESSAGE révèle s'ouvre directement ; le minuteur du message rendra le flou")
        XCTAssertEqual(FocalMediaProtection.tap(on: attachment(), isRevealed: false, messageRevealed: false), .openFullscreen(reblurs: false))
        XCTAssertEqual(FocalMediaProtection.tap(on: attachment(isViewOnce: true), isRevealed: false, messageRevealed: false), .openFullscreen(reblurs: false),
                       "la vue unique ouvre son plein écran directement (#8009)")
    }

    // MARK: - Outils

    private func normalized(_ relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let source = try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
        return AppSourceGuard.stripComments(source)
            .components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
    }
}
