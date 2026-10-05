import XCTest
@testable import Meeshy

/// **Aucun détail du message magnifié ne recouvre de texte** (#7953, #8506).
///
/// Recette du 2026-09-25 (#7953) : en SUITE de groupe, la pastille d'identité
/// mangeait la dernière ligne du message précédent ET la première du sien.
///
/// #8506 (directive porteur 2026-09-28) : identité, bande basse et heure vivent
/// désormais DANS le cadre de verre, à une marge régulière de ses bords, et le
/// contenu entier est agrandi. C'est donc le CADRE — loupe comprise — que les
/// voisines doivent céder. Le témoin pose la disposition dans le repère VISUEL
/// de la CELLULE élue (y = 0 à son haut) et vérifie, cote par cote, que rien
/// ne recouvre le texte de ses voisines ni le sien, en tête comme en suite de
/// groupe, sur des hauteurs courtes et hautes.
final class FocalElectionClearanceTests: XCTestCase {

    private let pad = FocalMetrics.Row.paddingVertical
    private let margin = FocalScrollPerspective.electedCardMargin

    /// Une étendue verticale, loupe appliquée.
    private struct Span {
        let top: CGFloat
        let bottom: CGFloat
    }

    private struct Layout {
        let card: Span
        let identityChip: Span
        let ownText: Span
        let bottomStrip: Span
        let previousTextBottom: CGFloat
        let nextTextTop: CGFloat
    }

    private func layout(isFirstInGroup: Bool, nextIsFirstInGroup: Bool = false, cellHeight: CGFloat, scale: CGFloat) -> Layout {
        let clearance = FocalScrollPerspective.electionClearance(isFirstInGroup: isFirstInGroup, cellHeight: cellHeight, scale: scale)
        let above = FocalScrollPerspective.electionShift(cellMidY: -1_000, magnifiedMidY: 0, clearance: clearance)
        let below = FocalScrollPerspective.electionShift(cellMidY: 1_000, magnifiedMidY: 0, clearance: clearance)
        // #8537 — seul le contenu grossit ; identité, bande et cadre gardent
        // leur échelle d'origine.
        let g = FocalScrollPerspective.electedGeometry(isFirstInGroup: isFirstInGroup, cellHeight: cellHeight, contentScale: scale)
        let nextTop = pad + (nextIsFirstInGroup ? FocalMetrics.Row.groupTopPadding : 0)
        return Layout(
            card: Span(top: g.card.top, bottom: g.card.bottom),
            identityChip: Span(top: g.identityChip.top, bottom: g.identityChip.bottom),
            ownText: Span(top: g.content.top, bottom: g.content.bottom),
            bottomStrip: Span(top: g.strip.top, bottom: g.strip.bottom),
            previousTextBottom: -pad + above,
            nextTextTop: cellHeight + nextTop + below
        )
    }

    private let heights: [CGFloat] = [44, 60, 140, 420]
    private var scales: [CGFloat] {
        [1, FocalScrollPerspective.electedScale(reduceMotion: false, rowWidth: 390), 1 + FocalMetrics.Focus.loupeGain]
    }

    /// #8506 — « place les contrôleurs et détails À L'INTÉRIEUR du cadre, en
    /// laissant de l'espace sur les bords » : l'identité en haut et la bande
    /// en bas sont à `electedCardMargin` des lignes du cadre — ni à cheval,
    /// ni collées.
    func test_theIdentityAndTheStrip_liveInsideTheCard_withARegularMargin() {
        for head in [true, false] {
            let l = layout(isFirstInGroup: head, cellHeight: 60, scale: 1)
            XCTAssertEqual(l.identityChip.top - l.card.top, margin, accuracy: 0.001, "tête=\(head) : marge haute")
            XCTAssertEqual(l.card.bottom - l.bottomStrip.bottom, margin, accuracy: 0.001, "tête=\(head) : marge basse")
        }
        XCTAssertGreaterThanOrEqual(margin, 10, "une marge visible, pas un liseré")
        XCTAssertEqual(
            margin,
            FocalMetrics.Row.paddingHorizontal - FocalScrollPerspective.focusCardHorizontalInset,
            "la même marge sur les quatre bords : celle que le texte a déjà à gauche du cadre"
        )
    }

    func test_theIdentityChip_neverCoversItsOwnText() {
        for head in [true, false] {
            for scale in scales {
                let l = layout(isFirstInGroup: head, cellHeight: 60, scale: scale)
                XCTAssertLessThanOrEqual(l.identityChip.bottom, l.ownText.top + 0.001,
                                         "tête=\(head), loupe=\(scale) : la pastille d'identité mord la première ligne de son propre message")
            }
        }
    }

    func test_theBottomStrip_neverCoversItsOwnLastLine() {
        for head in [true, false] {
            for scale in scales {
                let l = layout(isFirstInGroup: head, cellHeight: 60, scale: scale)
                XCTAssertGreaterThan(l.bottomStrip.top, l.ownText.bottom,
                                     "tête=\(head), loupe=\(scale) : la bande basse mord la dernière ligne de son propre message")
            }
        }
    }

    /// Les voisines s'écartent de la croissance RÉELLE : le cadre entier,
    /// loupe comprise, quelle que soit la hauteur du message élu.
    func test_theCard_neverCoversThePreviousMessage() {
        for head in [true, false] {
            for height in heights {
                for scale in scales {
                    let l = layout(isFirstInGroup: head, cellHeight: height, scale: scale)
                    XCTAssertLessThan(l.previousTextBottom, l.card.top,
                                      "tête=\(head), h=\(height), loupe=\(scale) : le cadre mord le message précédent")
                }
            }
        }
    }

    func test_theCard_neverCoversTheNextMessage() {
        for head in [true, false] {
            for nextHead in [true, false] {
                for height in heights {
                    for scale in scales {
                        let l = layout(isFirstInGroup: head, nextIsFirstInGroup: nextHead, cellHeight: height, scale: scale)
                        XCTAssertLessThan(l.card.bottom, l.nextTextTop,
                                          "tête=\(head), suivante en tête=\(nextHead), h=\(height), loupe=\(scale) : le cadre mord le message suivant")
                    }
                }
            }
        }
    }

    /// La rangée ne change pas de taille à l'élection : la descente d'une
    /// suite est un RENDU, et le passage s'ouvre par translation des voisines.
    func test_theMagnifiedRow_keepsItsHeight_andOnlyItsNeighboursMove() {
        let clearance = FocalScrollPerspective.electionClearance(isFirstInGroup: false, cellHeight: 60, scale: 1.2)
        XCTAssertEqual(FocalScrollPerspective.electionShift(cellMidY: 10, magnifiedMidY: 10, clearance: clearance), 0)
        XCTAssertLessThan(FocalScrollPerspective.electionShift(cellMidY: 0, magnifiedMidY: 10, clearance: clearance), 0, "le dessus monte")
        XCTAssertGreaterThan(FocalScrollPerspective.electionShift(cellMidY: 20, magnifiedMidY: 10, clearance: clearance), 0, "le dessous descend")
        XCTAssertEqual(FocalScrollPerspective.electionShift(cellMidY: 20, magnifiedMidY: nil, clearance: clearance), 0,
                       "aucune rangée magnifiée à l'écran : aucun passage")
    }

    /// Le passage grandit avec la loupe : un message haut agrandi pousse ses
    /// voisines du DESSOUS plus loin qu'un court — l'écrêtage vertical qui
    /// annulait la loupe des messages hauts a disparu (#8506). Depuis #8537 le
    /// contenu grossit vers le bas depuis son bord haut, sous une identité à
    /// l'échelle 1 : le haut du cadre ne dépend plus de la hauteur.
    func test_theClearance_growsWithTheMagnifiedHeight() {
        let short = FocalScrollPerspective.electionClearance(isFirstInGroup: false, cellHeight: 60, scale: 1.2)
        let tall = FocalScrollPerspective.electionClearance(isFirstInGroup: false, cellHeight: 300, scale: 1.2)
        XCTAssertEqual(tall.above, short.above, accuracy: 0.001)
        XCTAssertGreaterThan(tall.below, short.below)
    }

    /// Le passage s'ouvre autour de la rangée qui REND ses pastilles — lue sur
    /// l'étiquette de sa cellule. L'identifiant « détaillé » change avant que
    /// la reconfiguration ne les pose : mesuré au simulateur, le passage
    /// s'ouvrait autour de la rangée SUIVANTE pendant que la précédente
    /// portait encore ses pastilles.
    func test_theCellTag_carriesBothTheGroupHeadAndTheRenderedFocusDetails() {
        for head in [true, false] {
            for details in [true, false] {
                let tag = FocalScrollPerspective.cellTag(isFirstInGroup: head, showsFocusDetails: details)
                XCTAssertEqual(FocalScrollPerspective.isGroupHead(cellTag: tag), head)
                XCTAssertEqual(FocalScrollPerspective.showsFocusDetails(cellTag: tag), details)
            }
        }
    }

    /// Mesuré au simulateur : le passage était CALCULÉ mais pas RENDU, la
    /// mise en page de la cellule recalant son `contentView` par son `frame`,
    /// ce qui annule une translation. La pose doit survivre à la mise en page.
    @MainActor
    func test_theFocalPose_survivesTheCellLayout() {
        let cell = MessageListCell(frame: CGRect(x: 0, y: 0, width: 390, height: 80))
        cell.layoutIfNeeded()
        let pose = CATransform3DMakeTranslation(0, -30, 0)
        cell.contentView.layer.transform = pose
        cell.frame = CGRect(x: 0, y: 0, width: 390, height: 96)
        cell.setNeedsLayout()
        cell.layoutIfNeeded()
        XCTAssertTrue(CATransform3DEqualToTransform(cell.contentView.layer.transform, pose), "la pose reste posée")
        XCTAssertEqual(cell.contentView.center.y, 48, accuracy: 0.001, "le contenu reste centré : la translation n'est pas annulée")
        XCTAssertEqual(cell.contentView.bounds.height, 96, accuracy: 0.001)
    }

    /// Le passage se pose dans le repère RENVERSÉ du fil — sans échelle
    /// depuis #8537 : la loupe vit sur le seul contenu, dans la rangée.
    @MainActor
    func test_poseElectionPassage_translatesTheLayer_inTheFlippedSpace() {
        let layer = CALayer()
        layer.bounds = CGRect(x: 0, y: 0, width: 390, height: 60)
        FocalScrollPerspective.poseElectionPassage(layer, shift: 12, animated: false)
        XCTAssertEqual(layer.transform.m42, -12, accuracy: 0.0001, "vers le bas visuel = −y du layer renversé")
        XCTAssertEqual(layer.transform.m11, 1, accuracy: 0.0001)
        FocalScrollPerspective.poseElectionPassage(layer, shift: 0, animated: false)
        XCTAssertTrue(CATransform3DIsIdentity(layer.transform))
    }
}
